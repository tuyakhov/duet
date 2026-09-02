/**
 * Pure mutation operations over a Composition.
 *
 * Every operation validates its input, throws DuetError on bad data, and
 * returns the next composition plus a MutationReport used for the activity
 * timeline, step highlighting and WebMCP tool responses. The store applies
 * these for both human UI actions and agent tool calls.
 */
import { DuetError } from './errors'
import {
  assertDrumVoice,
  assertHumanize,
  assertInstrumentId,
  assertKey,
  assertPreset,
  assertScale,
  assertSection,
  assertSpace,
  assertStep,
  assertSteps,
  assertSwing,
  assertTempo,
  assertVolume,
  validateChord,
  validateContractPatch,
  validateDrumPattern,
  validateNote,
  validateNotes,
} from './validate'
import { emptyDrumPattern } from './session'
import { midiToPitch, parsePitch, prefersFlats, MAX_MIDI, MIN_MIDI } from './music'
import { INSTRUMENT_LABELS, LOOP_LENGTH } from './types'
import type {
  Chord,
  Composition,
  DrumPattern,
  DrumVoice,
  InstrumentId,
  MutationReport,
  Note,
  PatternSection,
} from './types'

export interface OpResult {
  composition: Composition
  report: MutationReport
}

function clone(c: Composition): Composition {
  return JSON.parse(JSON.stringify(c)) as Composition
}

function report(
  summary: string,
  changedTracks: MutationReport['changedTracks'],
  changedSteps: number[] = [],
  warnings: string[] = [],
): MutationReport {
  return { summary, changedTracks, changedSteps, warnings }
}

function describeSteps(steps: number[]): string {
  const sorted = [...new Set(steps)].sort((a, b) => a - b)
  if (sorted.length === 0) return ''
  if (sorted.length === 1) return `step ${sorted[0]}`
  if (sorted.length <= 4) return `steps ${sorted.join(', ')}`
  return `${sorted.length} steps`
}

// ---------------------------------------------------------------- session ops

export function setTitle(c: Composition, title: unknown): OpResult {
  if (typeof title !== 'string' || title.trim().length === 0 || title.length > 80) {
    throw new DuetError('INVALID_INPUT', 'Title must be a non-empty string of at most 80 characters.')
  }
  const next = clone(c)
  next.title = title.trim()
  return { composition: next, report: report(`renamed the song to “${next.title}”`, ['session']) }
}

export function setTempo(c: Composition, tempo: unknown): OpResult {
  const bpm = assertTempo(tempo)
  const next = clone(c)
  next.tempo = bpm
  return { composition: next, report: report(`set tempo to ${bpm} BPM`, ['session']) }
}

/**
 * Change key and/or scale. When the key root changes and `transpose` is true
 * (the default), every existing note and chord is shifted by the shortest
 * semitone path to the new root, so a key change is immediately audible.
 */
export function setKeyScale(
  c: Composition,
  key?: unknown,
  scale?: unknown,
  transpose = true,
): OpResult {
  if (key === undefined && scale === undefined) {
    throw new DuetError('INVALID_INPUT', 'Provide a key, a scale, or both.')
  }
  const next = clone(c)
  if (key !== undefined) next.key = assertKey(key)
  if (scale !== undefined) next.scale = assertScale(scale)

  const oldRoot = parsePitch(`${c.key}4`)
  const newRoot = parsePitch(`${next.key}4`)
  let delta = oldRoot !== null && newRoot !== null ? (((newRoot - oldRoot) % 12) + 12) % 12 : 0
  if (delta > 6) delta -= 12

  if (!transpose || delta === 0) {
    return {
      composition: next,
      report: report(`set key to ${next.key} ${next.scale}`, ['session']),
    }
  }

  const flats = prefersFlats(next.key, next.scale)
  let skipped = 0
  const shift = (pitch: string): string => {
    const midi = parsePitch(pitch)
    if (midi === null) return pitch
    let moved = midi + delta
    if (moved < MIN_MIDI) moved += 12
    if (moved > MAX_MIDI) moved -= 12
    if (moved < MIN_MIDI || moved > MAX_MIDI) {
      skipped++
      return pitch
    }
    return midiToPitch(moved, flats)
  }
  const changed: InstrumentId[] = []
  for (const id of ['lead', 'keys', 'bass'] as const) {
    if (next[id].notes.length > 0) {
      next[id].notes = next[id].notes.map((n) => ({ ...n, pitch: shift(n.pitch) }))
      changed.push(id)
    }
  }
  if (next.pad.chords.length > 0) {
    next.pad.chords = next.pad.chords.map((ch) => ({ ...ch, pitches: ch.pitches.map(shift) }))
    changed.push('pad')
  }
  const warnings =
    skipped > 0 ? [`${skipped} note(s) were at the edge of the pitch range and were left in place.`] : []
  return {
    composition: next,
    report: {
      summary: `changed key to ${next.key} ${next.scale} (transposed ${delta > 0 ? '+' : ''}${delta} semitones)`,
      changedTracks: changed.length > 0 ? changed : ['session'],
      changedSteps: [],
      warnings,
    },
  }
}

/** Groove settings: swing, space (reverb) and deterministic humanization. */
export function setGroove(
  c: Composition,
  changes: { swing?: unknown; space?: unknown; humanize?: unknown },
): OpResult {
  if (changes.swing === undefined && changes.space === undefined && changes.humanize === undefined) {
    throw new DuetError('INVALID_INPUT', 'Provide swing, space, humanize, or a combination.')
  }
  const next = clone(c)
  const parts: string[] = []
  if (changes.swing !== undefined) {
    next.swing = assertSwing(changes.swing)
    parts.push(`swing ${Math.round(next.swing * 100)}%`)
  }
  if (changes.space !== undefined) {
    next.space = assertSpace(changes.space)
    parts.push(`space ${Math.round(next.space * 100)}%`)
  }
  if (changes.humanize !== undefined) {
    next.humanize = assertHumanize(changes.humanize)
    parts.push(`humanize ${Math.round(next.humanize * 100)}%`)
  }
  return { composition: next, report: report(`set ${parts.join(', ')}`, ['session']) }
}

/** Update the Musical Contract (human-only — no agent tool edits this). */
export function setContract(c: Composition, patch: unknown): OpResult {
  const before = c.contract
  const nextContract = validateContractPatch(before, patch)
  const next = clone(c)
  next.contract = nextContract
  const changes: string[] = []
  if (nextContract.melodyLocked !== before.melodyLocked) {
    changes.push(nextContract.melodyLocked ? 'locked the melody' : 'unlocked the melody')
  }
  for (const k of ['keys', 'drums', 'bass', 'pad', 'mix'] as const) {
    if (nextContract.agentMayEdit[k] !== before.agentMayEdit[k]) {
      changes.push(`${nextContract.agentMayEdit[k] ? 'opened' : 'closed'} ${k} to the agent`)
    }
  }
  for (const k of ['pitch', 'timing', 'velocity'] as const) {
    if (nextContract.preserve[k] !== before.preserve[k]) {
      changes.push(`${nextContract.preserve[k] ? 'protected' : 'released'} melody ${k}`)
    }
  }
  if (nextContract.feel !== before.feel) changes.push(`feel → ${nextContract.feel}`)
  if (nextContract.density !== before.density) changes.push(`density → ${nextContract.density}`)
  if (nextContract.harmony !== before.harmony) changes.push(`harmony → ${nextContract.harmony}`)
  if (nextContract.maxIntensity !== before.maxIntensity) {
    changes.push(`max intensity → ${Math.round(nextContract.maxIntensity * 100)}%`)
  }
  if (nextContract.lockTempo !== before.lockTempo) {
    changes.push(nextContract.lockTempo ? 'locked the tempo' : 'unlocked the tempo')
  }
  if (nextContract.lockKey !== before.lockKey) {
    changes.push(nextContract.lockKey ? 'locked the key' : 'unlocked the key')
  }
  if (changes.length === 0) {
    throw new DuetError('INVALID_INPUT', 'No contract changes provided.')
  }
  return {
    composition: next,
    report: report(`updated the Musical Contract: ${changes.join(', ')}`, ['session']),
  }
}

export function addInstrument(c: Composition, id: unknown): OpResult {
  const instrument = assertInstrumentId(id)
  if (c.instruments.includes(instrument)) {
    throw new DuetError(
      'DUPLICATE_INSTRUMENT',
      `${INSTRUMENT_LABELS[instrument]} is already in the rack.`,
    )
  }
  const next = clone(c)
  next.instruments = [...next.instruments, instrument]
  return {
    composition: next,
    report: report(`added ${INSTRUMENT_LABELS[instrument]}`, [instrument]),
  }
}

export function removeInstrument(c: Composition, id: unknown): OpResult {
  const instrument = assertInstrumentId(id)
  if (instrument === 'lead') {
    throw new DuetError(
      'INSTRUMENT_PROTECTED',
      'The Lead synth carries the human melody and cannot be removed.',
    )
  }
  if (!c.instruments.includes(instrument)) {
    throw new DuetError('INSTRUMENT_NOT_PRESENT', `${INSTRUMENT_LABELS[instrument]} is not in the rack.`)
  }
  const next = clone(c)
  next.instruments = next.instruments.filter((i) => i !== instrument)
  // Clear its content so a re-add starts fresh.
  if (instrument === 'drums') {
    next.drums.pattern = emptyDrumPattern()
    delete next.drums.patternVariation
    delete next.drums.patternFill
  }
  if (instrument === 'bass') {
    next.bass.notes = []
    delete next.bass.notesVariation
    delete next.bass.notesFill
  }
  if (instrument === 'keys') next.keys.notes = []
  if (instrument === 'pad') next.pad.chords = []
  return {
    composition: next,
    report: report(`removed ${INSTRUMENT_LABELS[instrument]}`, [instrument]),
  }
}

export function setMixer(
  c: Composition,
  id: unknown,
  changes: { volume?: unknown; muted?: unknown },
): OpResult {
  const instrument = assertInstrumentId(id)
  requirePresent(c, instrument)
  if (changes.volume === undefined && changes.muted === undefined) {
    throw new DuetError('INVALID_INPUT', 'Provide volume, muted, or both.')
  }
  const next = clone(c)
  const mixer = next[instrument].mixer
  const parts: string[] = []
  if (changes.volume !== undefined) {
    mixer.volume = assertVolume(changes.volume)
    parts.push(`volume ${Math.round(mixer.volume * 100)}%`)
  }
  if (changes.muted !== undefined) {
    if (typeof changes.muted !== 'boolean') {
      throw new DuetError('INVALID_INPUT', 'muted must be a boolean.')
    }
    mixer.muted = changes.muted
    parts.push(mixer.muted ? 'muted' : 'unmuted')
  }
  return {
    composition: next,
    report: report(`set ${INSTRUMENT_LABELS[instrument]} ${parts.join(', ')}`, [instrument]),
  }
}

export function setPreset(c: Composition, id: unknown, preset: unknown): OpResult {
  const instrument = assertInstrumentId(id)
  requirePresent(c, instrument)
  const valid = assertPreset(instrument, preset)
  const next = clone(c)
  next[instrument].preset = valid
  return {
    composition: next,
    report: report(`switched ${INSTRUMENT_LABELS[instrument]} to the “${valid}” preset`, [instrument]),
  }
}

function requirePresent(c: Composition, instrument: InstrumentId) {
  if (!c.instruments.includes(instrument)) {
    throw new DuetError(
      'INSTRUMENT_NOT_PRESENT',
      `${INSTRUMENT_LABELS[instrument]} is not in the rack — add it first with studio_add_instrument.`,
    )
  }
}

// ------------------------------------------------------------ melodic tracks

type MelodicId = 'lead' | 'keys' | 'bass'

function assertMelodic(id: unknown): MelodicId {
  const instrument = assertInstrumentId(id)
  if (instrument !== 'lead' && instrument !== 'bass' && instrument !== 'keys') {
    throw new DuetError('INVALID_INPUT', `${instrument} does not hold melodic notes.`)
  }
  return instrument
}

/** Only the bass has variation/fill slots among melodic tracks. */
function assertMelodicSection(id: MelodicId, section: PatternSection): PatternSection {
  if (section !== 'main' && id !== 'bass') {
    throw new DuetError(
      'INVALID_INPUT',
      `Only the bass has ${section} bars — ${id} plays its main pattern through the phrase.`,
    )
  }
  return section
}

function readMelodicSlot(c: Composition, id: MelodicId, section: PatternSection): Note[] {
  if (section === 'main') return c[id].notes
  if (section === 'variation') return c.bass.notesVariation ?? []
  return c.bass.notesFill ?? []
}

function writeMelodicSlot(c: Composition, id: MelodicId, section: PatternSection, notes: Note[]) {
  if (section === 'main') c[id].notes = notes
  else if (section === 'variation') c.bass.notesVariation = notes
  else c.bass.notesFill = notes
}

function sectionSuffix(section: PatternSection): string {
  return section === 'main' ? '' : ` (${section} bar)`
}

/** Sort + drop exact duplicate (step,pitch) pairs, keeping the last occurrence. */
function normalizeNotes(notes: Note[]): { notes: Note[]; warnings: string[] } {
  const seen = new Map<string, Note>()
  for (const n of notes) seen.set(`${n.step}:${n.pitch}`, n)
  const warnings: string[] = []
  if (seen.size < notes.length) {
    warnings.push(`${notes.length - seen.size} duplicate note(s) at the same step and pitch were merged.`)
  }
  return { notes: [...seen.values()].sort((a, b) => a.step - b.step || a.pitch.localeCompare(b.pitch)), warnings }
}

export function replaceNotes(
  c: Composition,
  id: unknown,
  rawNotes: unknown,
  rawSection?: unknown,
): OpResult {
  const instrument = assertMelodic(id)
  requirePresent(c, instrument)
  const section = assertMelodicSection(instrument, assertSection(rawSection))
  const { notes, warnings } = normalizeNotes(validateNotes(rawNotes))
  const next = clone(c)
  writeMelodicSlot(next, instrument, section, notes)
  return {
    composition: next,
    report: report(
      `wrote ${notes.length} ${INSTRUMENT_LABELS[instrument]} note${notes.length === 1 ? '' : 's'}${sectionSuffix(section)}`,
      [instrument],
      notes.map((n) => n.step),
      warnings,
    ),
  }
}

export function addNotes(c: Composition, id: unknown, rawNotes: unknown, rawSection?: unknown): OpResult {
  const instrument = assertMelodic(id)
  requirePresent(c, instrument)
  const section = assertMelodicSection(instrument, assertSection(rawSection))
  const added = validateNotes(rawNotes)
  if (added.length === 0) throw new DuetError('INVALID_INPUT', 'Provide at least one note to add.')
  const { notes, warnings } = normalizeNotes([...readMelodicSlot(c, instrument, section), ...added])
  const next = clone(c)
  writeMelodicSlot(next, instrument, section, notes)
  return {
    composition: next,
    report: report(
      `added ${added.length} note${added.length === 1 ? '' : 's'} to ${INSTRUMENT_LABELS[instrument]}${sectionSuffix(section)} (${describeSteps(added.map((n) => n.step))})`,
      [instrument],
      added.map((n) => n.step),
      warnings,
    ),
  }
}

export function removeNotesAtSteps(
  c: Composition,
  id: unknown,
  rawSteps: unknown,
  rawSection?: unknown,
): OpResult {
  const instrument = assertMelodic(id)
  requirePresent(c, instrument)
  const section = assertMelodicSection(instrument, assertSection(rawSection))
  const steps = new Set(assertSteps(rawSteps))
  const slot = readMelodicSlot(c, instrument, section)
  const remaining = slot.filter((n) => !steps.has(n.step))
  const removed = slot.length - remaining.length
  if (removed === 0) {
    throw new DuetError('INVALID_INPUT', `No ${INSTRUMENT_LABELS[instrument]} notes start at ${describeSteps([...steps])}${sectionSuffix(section)}.`)
  }
  const next = clone(c)
  writeMelodicSlot(next, instrument, section, remaining)
  return {
    composition: next,
    report: report(
      `removed ${removed} note${removed === 1 ? '' : 's'} from ${INSTRUMENT_LABELS[instrument]}${sectionSuffix(section)} (${describeSteps([...steps])})`,
      [instrument],
      [...steps],
    ),
  }
}

/** Patch notes that start at the given steps (pitch / velocity / duration / timing offset). */
export function patchNotesAtSteps(
  c: Composition,
  id: unknown,
  rawSteps: unknown,
  changes: { pitch?: unknown; velocity?: unknown; duration?: unknown; offset?: unknown },
  rawSection?: unknown,
): OpResult {
  const instrument = assertMelodic(id)
  requirePresent(c, instrument)
  const section = assertMelodicSection(instrument, assertSection(rawSection))
  const steps = new Set(assertSteps(rawSteps))
  if (
    changes.pitch === undefined &&
    changes.velocity === undefined &&
    changes.duration === undefined &&
    changes.offset === undefined
  ) {
    throw new DuetError('INVALID_INPUT', 'Provide pitch, velocity, duration or offset to patch.')
  }
  let touched = 0
  const patched = readMelodicSlot(c, instrument, section).map((n) => {
    if (!steps.has(n.step)) return n
    touched++
    return validateNote({
      step: n.step,
      pitch: changes.pitch !== undefined ? changes.pitch : n.pitch,
      duration: changes.duration !== undefined ? changes.duration : n.duration,
      velocity: changes.velocity !== undefined ? changes.velocity : n.velocity,
      offset: changes.offset !== undefined ? changes.offset : n.offset,
    })
  })
  if (touched === 0) {
    throw new DuetError('INVALID_INPUT', `No ${INSTRUMENT_LABELS[instrument]} notes start at ${describeSteps([...steps])}${sectionSuffix(section)}.`)
  }
  const merged = normalizeNotes(patched)
  const next = clone(c)
  writeMelodicSlot(next, instrument, section, merged.notes)
  return {
    composition: next,
    report: report(
      `changed ${INSTRUMENT_LABELS[instrument]} ${describeSteps([...steps])}${sectionSuffix(section)}`,
      [instrument],
      [...steps],
      merged.warnings,
    ),
  }
}

/** Human piano-roll toggle: add a note, or remove it if the identical cell is occupied. */
export function toggleNoteCell(
  c: Composition,
  id: MelodicId,
  step: number,
  pitch: string,
  duration = 1,
  section: PatternSection = 'main',
): OpResult {
  assertMelodicSection(id, section)
  const slot = readMelodicSlot(c, id, section)
  const existing = slot.find((n) => n.step === step && n.pitch === pitch)
  const next = clone(c)
  if (existing) {
    writeMelodicSlot(next, id, section, slot.filter((n) => !(n.step === step && n.pitch === pitch)))
    return {
      composition: next,
      report: report(`removed a ${INSTRUMENT_LABELS[id]} note at step ${step}${sectionSuffix(section)}`, [id], [step]),
    }
  }
  const note = validateNote({ step, pitch, duration, velocity: 0.85 })
  writeMelodicSlot(
    next,
    id,
    section,
    [...slot, note].sort((a, b) => a.step - b.step || a.pitch.localeCompare(b.pitch)),
  )
  return {
    composition: next,
    report: report(`drew a ${INSTRUMENT_LABELS[id]} note (${pitch} at step ${step})${sectionSuffix(section)}`, [id], [step]),
  }
}

/** Copy the main pattern into a variation/fill slot as a starting point. */
export function copyMelodicSectionFromMain(c: Composition, id: unknown, rawSection: unknown): OpResult {
  const instrument = assertMelodic(id)
  requirePresent(c, instrument)
  const section = assertMelodicSection(instrument, assertSection(rawSection))
  if (section === 'main') throw new DuetError('INVALID_INPUT', 'Pick variation or fill to copy into.')
  const next = clone(c)
  writeMelodicSlot(next, instrument, section, JSON.parse(JSON.stringify(c[instrument].notes)) as Note[])
  return {
    composition: next,
    report: report(`copied the ${INSTRUMENT_LABELS[instrument]} main bar into the ${section}`, [instrument]),
  }
}

/** Remove a variation/fill slot so the bar falls back to main. */
export function clearMelodicSection(c: Composition, id: unknown, rawSection: unknown): OpResult {
  const instrument = assertMelodic(id)
  requirePresent(c, instrument)
  const section = assertMelodicSection(instrument, assertSection(rawSection))
  if (section === 'main') throw new DuetError('INVALID_INPUT', 'Clear removes variation or fill bars, not main.')
  const next = clone(c)
  if (section === 'variation') delete next.bass.notesVariation
  else delete next.bass.notesFill
  return {
    composition: next,
    report: report(`cleared the ${INSTRUMENT_LABELS[instrument]} ${section} bar — it falls back to main`, [instrument]),
  }
}

// ------------------------------------------------------------------- drums

function readDrumSlot(c: Composition, section: PatternSection): DrumPattern {
  if (section === 'variation') return c.drums.patternVariation ?? emptyDrumPattern()
  if (section === 'fill') return c.drums.patternFill ?? emptyDrumPattern()
  return c.drums.pattern
}

function writeDrumSlot(c: Composition, section: PatternSection, pattern: DrumPattern) {
  if (section === 'variation') c.drums.patternVariation = pattern
  else if (section === 'fill') c.drums.patternFill = pattern
  else c.drums.pattern = pattern
}

export function replaceDrumPattern(c: Composition, rawPattern: unknown, rawSection?: unknown): OpResult {
  requirePresent(c, 'drums')
  const section = assertSection(rawSection)
  const pattern = validateDrumPattern(rawPattern)
  const next = clone(c)
  writeDrumSlot(next, section, pattern)
  const hits = countHits(pattern)
  const steps = hitSteps(pattern)
  return {
    composition: next,
    report: report(`programmed ${hits} drum hit${hits === 1 ? '' : 's'}${sectionSuffix(section)}`, ['drums'], steps),
  }
}

export function setDrumSteps(
  c: Composition,
  voice: unknown,
  rawSteps: unknown,
  active: boolean,
  rawSection?: unknown,
): OpResult {
  requirePresent(c, 'drums')
  const section = assertSection(rawSection)
  const v = assertDrumVoice(voice)
  const steps = assertSteps(rawSteps)
  const next = clone(c)
  const pattern = JSON.parse(JSON.stringify(readDrumSlot(c, section))) as DrumPattern
  for (const s of steps) pattern[v][s] = active
  writeDrumSlot(next, section, pattern)
  return {
    composition: next,
    report: report(
      `${active ? 'set' : 'cleared'} ${VOICE_LABELS[v]} on ${describeSteps(steps)}${sectionSuffix(section)}`,
      ['drums'],
      steps,
    ),
  }
}

export function toggleDrumStep(
  c: Composition,
  voice: DrumVoice,
  step: number,
  section: PatternSection = 'main',
): OpResult {
  assertStep(step)
  requirePresent(c, 'drums')
  const next = clone(c)
  const pattern = JSON.parse(JSON.stringify(readDrumSlot(c, section))) as DrumPattern
  const nowActive = !pattern[voice][step]
  pattern[voice][step] = nowActive
  writeDrumSlot(next, section, pattern)
  return {
    composition: next,
    report: report(
      `${nowActive ? 'added' : 'removed'} a ${VOICE_LABELS[voice]} hit at step ${step}${sectionSuffix(section)}`,
      ['drums'],
      [step],
    ),
  }
}

export function copyDrumSectionFromMain(c: Composition, rawSection: unknown): OpResult {
  requirePresent(c, 'drums')
  const section = assertSection(rawSection)
  if (section === 'main') throw new DuetError('INVALID_INPUT', 'Pick variation or fill to copy into.')
  const next = clone(c)
  writeDrumSlot(next, section, JSON.parse(JSON.stringify(c.drums.pattern)) as DrumPattern)
  return {
    composition: next,
    report: report(`copied the main drum bar into the ${section}`, ['drums']),
  }
}

export function clearDrumSection(c: Composition, rawSection: unknown): OpResult {
  requirePresent(c, 'drums')
  const section = assertSection(rawSection)
  if (section === 'main') throw new DuetError('INVALID_INPUT', 'Clear removes variation or fill bars, not main.')
  const next = clone(c)
  if (section === 'variation') delete next.drums.patternVariation
  else delete next.drums.patternFill
  return {
    composition: next,
    report: report(`cleared the drum ${section} bar — it falls back to main`, ['drums']),
  }
}

/** UI view of a drum section: null when the slot doesn't exist yet. */
export function viewDrumSection(c: Composition, section: PatternSection): DrumPattern | null {
  if (section === 'variation') return c.drums.patternVariation ?? null
  if (section === 'fill') return c.drums.patternFill ?? null
  return c.drums.pattern
}

/** UI view of a melodic section: null when the slot doesn't exist yet. */
export function viewMelodicSection(c: Composition, id: MelodicId, section: PatternSection): Note[] | null {
  if (section === 'main') return c[id].notes
  if (id !== 'bass') return null
  if (section === 'variation') return c.bass.notesVariation ?? null
  return c.bass.notesFill ?? null
}

/** True when any variation/fill content exists — playback then runs a 4-bar phrase. */
export function hasPhrase(c: Composition): boolean {
  return Boolean(
    c.drums.patternVariation || c.drums.patternFill || c.bass.notesVariation || c.bass.notesFill,
  )
}

/** The drum pattern a given phrase bar plays: main, main, variation, fill. */
export function drumPatternForBar(c: Composition, bar: number): DrumPattern {
  if (bar === 2 && c.drums.patternVariation) return c.drums.patternVariation
  if (bar === 3) return c.drums.patternFill ?? c.drums.patternVariation ?? c.drums.pattern
  return c.drums.pattern
}

/** The bass notes a given phrase bar plays: main, main, variation, fill. */
export function bassNotesForBar(c: Composition, bar: number): Note[] {
  if (bar === 2 && c.bass.notesVariation) return c.bass.notesVariation
  if (bar === 3) return c.bass.notesFill ?? c.bass.notesVariation ?? c.bass.notes
  return c.bass.notes
}

const VOICE_LABELS: Record<DrumVoice, string> = {
  kick: 'kick',
  snare: 'snare',
  hatClosed: 'closed hat',
  hatOpen: 'open hat',
}

function countHits(p: Composition['drums']['pattern']): number {
  return p.kick.concat(p.snare, p.hatClosed, p.hatOpen).filter(Boolean).length
}

function hitSteps(p: Composition['drums']['pattern']): number[] {
  const steps = new Set<number>()
  for (let i = 0; i < LOOP_LENGTH; i++) {
    if (p.kick[i] || p.snare[i] || p.hatClosed[i] || p.hatOpen[i]) steps.add(i)
  }
  return [...steps]
}

// --------------------------------------------------------------------- pad

export function replaceChords(c: Composition, rawChords: unknown): OpResult {
  requirePresent(c, 'pad')
  if (!Array.isArray(rawChords)) throw new DuetError('INVALID_INPUT', 'Expected an array of chords.')
  const chords = rawChords.map((ch) => validateChord(ch)).sort((a, b) => a.step - b.step)
  const next = clone(c)
  next.pad.chords = chords
  return {
    composition: next,
    report: report(
      `wrote ${chords.length} pad chord${chords.length === 1 ? '' : 's'}`,
      ['pad'],
      chords.map((ch) => ch.step),
    ),
  }
}

export function addChord(c: Composition, rawChord: unknown): OpResult {
  requirePresent(c, 'pad')
  const chord = validateChord(rawChord)
  const next = clone(c)
  // A new chord replaces any chord starting on the same step.
  const replaced = next.pad.chords.some((ch) => ch.step === chord.step)
  next.pad.chords = [...next.pad.chords.filter((ch) => ch.step !== chord.step), chord].sort(
    (a, b) => a.step - b.step,
  )
  return {
    composition: next,
    report: report(
      `${replaced ? 'replaced the' : 'added a'} pad chord at step ${chord.step} (${chord.pitches.join(' ')})`,
      ['pad'],
      [chord.step],
      replaced ? ['An existing chord on that step was replaced.'] : [],
    ),
  }
}

export function removeChordAtStep(c: Composition, rawStep: unknown): OpResult {
  requirePresent(c, 'pad')
  const step = assertStep(rawStep)
  if (!c.pad.chords.some((ch) => ch.step === step)) {
    throw new DuetError('INVALID_INPUT', `No pad chord starts at step ${step}.`)
  }
  const next = clone(c)
  next.pad.chords = next.pad.chords.filter((ch) => ch.step !== step)
  return {
    composition: next,
    report: report(`removed the pad chord at step ${step}`, ['pad'], [step]),
  }
}

export type { Chord, Note }
