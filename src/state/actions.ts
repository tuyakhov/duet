/**
 * Human-side action helpers: thin wrappers that route UI gestures through the
 * same engine ops the WebMCP tools use, and surface validation errors as a
 * toast instead of crashing the interface.
 */
import { audioEngine } from '../audio/engine'
import { DuetError } from '../engine/errors'
import * as ops from '../engine/ops'
import type { OpResult } from '../engine/ops'
import { exampleMelody } from '../engine/session'
import type { Composition, DrumVoice, InstrumentId } from '../engine/types'
import { useStudioStore } from './store'

type ToastListener = (message: string) => void
let toastListener: ToastListener | null = null

export function onToast(listener: ToastListener): () => void {
  toastListener = listener
  return () => {
    if (toastListener === listener) toastListener = null
  }
}

export function humanApply(fn: (c: Composition) => OpResult): boolean {
  try {
    useStudioStore.getState().apply('human', fn)
    return true
  } catch (err) {
    if (err instanceof DuetError) {
      toastListener?.(err.message)
      return false
    }
    throw err
  }
}

type MelodicId = 'lead' | 'keys' | 'bass'
type Section = 'main' | 'variation' | 'fill'

/** Swing/humanize presets behind the contract's feel selector. */
const FEEL_GROOVE: Record<string, { swing: number; humanize?: number }> = {
  straight: { swing: 0 },
  swung: { swing: 0.22 },
  laidback: { swing: 0.08, humanize: 0.4 },
}

export const humanActions = {
  setTitle: (title: string) => humanApply((c) => ops.setTitle(c, title)),
  setTempo: (bpm: number) => humanApply((c) => ops.setTempo(c, bpm)),
  /** Key changes transpose existing material — what a musician expects. */
  setKey: (key: string) => humanApply((c) => ops.setKeyScale(c, key, undefined, true)),
  setScale: (scale: string) => humanApply((c) => ops.setKeyScale(c, undefined, scale)),
  setSwing: (swing: number) => humanApply((c) => ops.setGroove(c, { swing })),
  setSpace: (space: number) => humanApply((c) => ops.setGroove(c, { space })),
  setHumanize: (humanize: number) => humanApply((c) => ops.setGroove(c, { humanize })),
  setContract: (patch: Record<string, unknown>) => humanApply((c) => ops.setContract(c, patch)),
  setFeel: (feel: 'straight' | 'swung' | 'laidback') => {
    const ok = humanApply((c) => ops.setContract(c, { feel }))
    if (!ok) return false
    const groove = FEEL_GROOVE[feel]
    return humanApply((c) =>
      ops.setGroove(c, {
        swing: groove.swing,
        humanize: groove.humanize !== undefined ? Math.max(c.humanize, groove.humanize) : undefined,
      }),
    )
  },
  addInstrument: (id: InstrumentId) => humanApply((c) => ops.addInstrument(c, id)),
  removeInstrument: (id: InstrumentId) => humanApply((c) => ops.removeInstrument(c, id)),
  setVolume: (id: InstrumentId, volume: number) => humanApply((c) => ops.setMixer(c, id, { volume })),
  toggleMute: (id: InstrumentId) =>
    humanApply((c) => ops.setMixer(c, id, { muted: !c[id].mixer.muted })),
  setPreset: (id: InstrumentId, preset: string) => humanApply((c) => ops.setPreset(c, id, preset)),
  toggleNote: (id: MelodicId, step: number, pitch: string, section: Section = 'main') =>
    humanApply((c) => ops.toggleNoteCell(c, id, step, pitch, 1, section)),
  drawNote: (id: MelodicId, step: number, pitch: string, duration: number, section: Section = 'main') =>
    humanApply((c) => {
      const slot = ops.viewMelodicSection(c, id, section) ?? []
      const withoutOld = slot.some((n) => n.step === step && n.pitch === pitch)
        ? ops.toggleNoteCell(c, id, step, pitch, 1, section).composition
        : c
      return ops.addNotes(withoutOld, id, [{ step, pitch, duration, velocity: 0.85 }], section)
    }),
  removeNote: (id: MelodicId, step: number, pitch: string, section: Section = 'main') =>
    humanApply((c) => ops.toggleNoteCell(c, id, step, pitch, 1, section)),
  toggleDrum: (voice: DrumVoice, step: number, section: Section = 'main') =>
    humanApply((c) => ops.toggleDrumStep(c, voice, step, section)),
  copySectionFromMain: (id: 'drums' | 'bass', section: Section) =>
    humanApply((c) =>
      id === 'drums' ? ops.copyDrumSectionFromMain(c, section) : ops.copyMelodicSectionFromMain(c, id, section),
    ),
  clearSection: (id: 'drums' | 'bass', section: Section) =>
    humanApply((c) => (id === 'drums' ? ops.clearDrumSection(c, section) : ops.clearMelodicSection(c, id, section))),
  addChord: (step: number, duration: number, pitches: string[]) =>
    humanApply((c) => ops.addChord(c, { step, duration, pitches, velocity: 0.6 })),
  removeChord: (step: number) => humanApply((c) => ops.removeChordAtStep(c, step)),
  loadExampleMelody: () => humanApply((c) => ops.replaceNotes(c, 'lead', exampleMelody())),

  undo: () => useStudioStore.getState().undo('human'),

  play: () => {
    try {
      audioEngine.play('human')
    } catch (err) {
      if (err instanceof DuetError) toastListener?.(err.message)
    }
  },
  stop: () => audioEngine.stop('human'),
  togglePlay: () => {
    if (audioEngine.playing) audioEngine.stop('human')
    else humanActions.play()
  },

  enableAudio: async () => {
    try {
      await audioEngine.enable()
    } catch (err) {
      toastListener?.(err instanceof Error ? err.message : 'Could not start audio.')
    }
  },

  setMode: (mode: 'compose' | 'performance') => {
    useStudioStore.getState().setMode(mode, 'system')
  },
  setEnergy: (energy: number) => useStudioStore.getState().setEnergy(energy, 'human'),
  launchBreakdown: () => useStudioStore.getState().launchBreakdown('human'),
}

export const AGENT_PROMPT =
  'Listen to the melody I recorded. Preserve my notes and turn it into cinematic synthwave. ' +
  'Add drums, bass, and atmospheric chords. Then perform it for me.'
