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

export const humanActions = {
  setTitle: (title: string) => humanApply((c) => ops.setTitle(c, title)),
  setTempo: (bpm: number) => humanApply((c) => ops.setTempo(c, bpm)),
  setKey: (key: string) => humanApply((c) => ops.setKeyScale(c, key, undefined)),
  setScale: (scale: string) => humanApply((c) => ops.setKeyScale(c, undefined, scale)),
  addInstrument: (id: InstrumentId) => humanApply((c) => ops.addInstrument(c, id)),
  removeInstrument: (id: InstrumentId) => humanApply((c) => ops.removeInstrument(c, id)),
  setVolume: (id: InstrumentId, volume: number) => humanApply((c) => ops.setMixer(c, id, { volume })),
  toggleMute: (id: InstrumentId) =>
    humanApply((c) => ops.setMixer(c, id, { muted: !c[id].mixer.muted })),
  setPreset: (id: InstrumentId, preset: string) => humanApply((c) => ops.setPreset(c, id, preset)),
  toggleNote: (id: 'lead' | 'bass', step: number, pitch: string) =>
    humanApply((c) => ops.toggleNoteCell(c, id, step, pitch)),
  drawNote: (id: 'lead' | 'bass', step: number, pitch: string, duration: number) =>
    humanApply((c) => {
      const withoutOld = c[id].notes.some((n) => n.step === step && n.pitch === pitch)
        ? ops.toggleNoteCell(c, id, step, pitch).composition
        : c
      return ops.addNotes(withoutOld, id, [{ step, pitch, duration, velocity: 0.85 }])
    }),
  removeNote: (id: 'lead' | 'bass', step: number, pitch: string) =>
    humanApply((c) => ops.toggleNoteCell(c, id, step, pitch)),
  toggleDrum: (voice: DrumVoice, step: number) => humanApply((c) => ops.toggleDrumStep(c, voice, step)),
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
