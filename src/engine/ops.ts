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
  assertInstrumentId,
  assertKey,
  assertPreset,
  assertScale,
  assertStep,
  assertSteps,
  assertTempo,
  assertVolume,
  validateChord,
  validateDrumPattern,
  validateNote,
  validateNotes,
} from './validate'
import { emptyDrumPattern } from './session'
import { INSTRUMENT_LABELS, LOOP_LENGTH } from './types'
import type {
  Chord,
  Composition,
  DrumVoice,
  InstrumentId,
  MutationReport,
  Note,
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

export function setKeyScale(c: Composition, key?: unknown, scale?: unknown): OpResult {
  if (key === undefined && scale === undefined) {
    throw new DuetError('INVALID_INPUT', 'Provide a key, a scale, or both.')
  }
  const next = clone(c)
  if (key !== undefined) next.key = assertKey(key)
  if (scale !== undefined) next.scale = assertScale(scale)
  return {
    composition: next,
    report: report(`set key to ${next.key} ${next.scale}`, ['session']),
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
  if (instrument === 'drums') next.drums.pattern = emptyDrumPattern()
  if (instrument === 'bass') next.bass.notes = []
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

type MelodicId = 'lead' | 'bass'

function assertMelodic(id: unknown): MelodicId {
  const instrument = assertInstrumentId(id)
  if (instrument !== 'lead' && instrument !== 'bass') {
    throw new DuetError('INVALID_INPUT', `${instrument} does not hold melodic notes.`)
  }
  return instrument
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

export function replaceNotes(c: Composition, id: unknown, rawNotes: unknown): OpResult {
  const instrument = assertMelodic(id)
  requirePresent(c, instrument)
  const { notes, warnings } = normalizeNotes(validateNotes(rawNotes))
  const next = clone(c)
  next[instrument].notes = notes
  return {
    composition: next,
    report: report(
      `wrote ${notes.length} ${INSTRUMENT_LABELS[instrument]} note${notes.length === 1 ? '' : 's'}`,
      [instrument],
      notes.map((n) => n.step),
      warnings,
    ),
  }
}

export function addNotes(c: Composition, id: unknown, rawNotes: unknown): OpResult {
  const instrument = assertMelodic(id)
  requirePresent(c, instrument)
  const added = validateNotes(rawNotes)
  if (added.length === 0) throw new DuetError('INVALID_INPUT', 'Provide at least one note to add.')
  const { notes, warnings } = normalizeNotes([...c[instrument].notes, ...added])
  const next = clone(c)
  next[instrument].notes = notes
  return {
    composition: next,
    report: report(
      `added ${added.length} note${added.length === 1 ? '' : 's'} to ${INSTRUMENT_LABELS[instrument]} (${describeSteps(added.map((n) => n.step))})`,
      [instrument],
      added.map((n) => n.step),
      warnings,
    ),
  }
}

export function removeNotesAtSteps(c: Composition, id: unknown, rawSteps: unknown): OpResult {
  const instrument = assertMelodic(id)
  requirePresent(c, instrument)
  const steps = new Set(assertSteps(rawSteps))
  const before = c[instrument].notes.length
  const next = clone(c)
  next[instrument].notes = next[instrument].notes.filter((n) => !steps.has(n.step))
  const removed = before - next[instrument].notes.length
  if (removed === 0) {
    throw new DuetError('INVALID_INPUT', `No ${INSTRUMENT_LABELS[instrument]} notes start at ${describeSteps([...steps])}.`)
  }
  return {
    composition: next,
    report: report(
      `removed ${removed} note${removed === 1 ? '' : 's'} from ${INSTRUMENT_LABELS[instrument]} (${describeSteps([...steps])})`,
      [instrument],
      [...steps],
    ),
  }
}

/** Patch notes that start at the given steps (transpose pitch / velocity / duration). */
export function patchNotesAtSteps(
  c: Composition,
  id: unknown,
  rawSteps: unknown,
  changes: { pitch?: unknown; velocity?: unknown; duration?: unknown },
): OpResult {
  const instrument = assertMelodic(id)
  requirePresent(c, instrument)
  const steps = new Set(assertSteps(rawSteps))
  if (changes.pitch === undefined && changes.velocity === undefined && changes.duration === undefined) {
    throw new DuetError('INVALID_INPUT', 'Provide pitch, velocity or duration to patch.')
  }
  const next = clone(c)
  let touched = 0
  next[instrument].notes = next[instrument].notes.map((n) => {
    if (!steps.has(n.step)) return n
    touched++
    return validateNote({
      step: n.step,
      pitch: changes.pitch !== undefined ? changes.pitch : n.pitch,
      duration: changes.duration !== undefined ? changes.duration : n.duration,
      velocity: changes.velocity !== undefined ? changes.velocity : n.velocity,
    })
  })
  if (touched === 0) {
    throw new DuetError('INVALID_INPUT', `No ${INSTRUMENT_LABELS[instrument]} notes start at ${describeSteps([...steps])}.`)
  }
  const merged = normalizeNotes(next[instrument].notes)
  next[instrument].notes = merged.notes
  return {
    composition: next,
    report: report(
      `changed ${INSTRUMENT_LABELS[instrument]} ${describeSteps([...steps])}`,
      [instrument],
      [...steps],
      merged.warnings,
    ),
  }
}

/** Human piano-roll toggle: add a note, or remove it if the identical cell is occupied. */
export function toggleNoteCell(c: Composition, id: MelodicId, step: number, pitch: string, duration = 1): OpResult {
  const existing = c[id].notes.find((n) => n.step === step && n.pitch === pitch)
  if (existing) {
    const next = clone(c)
    next[id].notes = next[id].notes.filter((n) => !(n.step === step && n.pitch === pitch))
    return {
      composition: next,
      report: report(`removed a ${INSTRUMENT_LABELS[id]} note at step ${step}`, [id], [step]),
    }
  }
  const note = validateNote({ step, pitch, duration, velocity: 0.85 })
  const next = clone(c)
  next[id].notes = [...next[id].notes, note].sort((a, b) => a.step - b.step || a.pitch.localeCompare(b.pitch))
  return {
    composition: next,
    report: report(`drew a ${INSTRUMENT_LABELS[id]} note (${pitch} at step ${step})`, [id], [step]),
  }
}

// ------------------------------------------------------------------- drums

export function replaceDrumPattern(c: Composition, rawPattern: unknown): OpResult {
  requirePresent(c, 'drums')
  const pattern = validateDrumPattern(rawPattern)
  const next = clone(c)
  next.drums.pattern = pattern
  const hits = countHits(pattern)
  const steps = hitSteps(pattern)
  return {
    composition: next,
    report: report(`programmed ${hits} drum hit${hits === 1 ? '' : 's'}`, ['drums'], steps),
  }
}

export function setDrumSteps(c: Composition, voice: unknown, rawSteps: unknown, active: boolean): OpResult {
  requirePresent(c, 'drums')
  const v = assertDrumVoice(voice)
  const steps = assertSteps(rawSteps)
  const next = clone(c)
  for (const s of steps) next.drums.pattern[v][s] = active
  return {
    composition: next,
    report: report(
      `${active ? 'set' : 'cleared'} ${VOICE_LABELS[v]} on ${describeSteps(steps)}`,
      ['drums'],
      steps,
    ),
  }
}

export function toggleDrumStep(c: Composition, voice: DrumVoice, step: number): OpResult {
  assertStep(step)
  requirePresent(c, 'drums')
  const next = clone(c)
  const nowActive = !c.drums.pattern[voice][step]
  next.drums.pattern[voice][step] = nowActive
  return {
    composition: next,
    report: report(
      `${nowActive ? 'added' : 'removed'} a ${VOICE_LABELS[voice]} hit at step ${step}`,
      ['drums'],
      [step],
    ),
  }
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
