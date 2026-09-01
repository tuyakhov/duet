import type { Composition, Note, SessionState } from './types'
import { LOOP_LENGTH } from './types'

export function newSessionId(): string {
  return `duet-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}

export function emptyDrumPattern() {
  return {
    kick: new Array<boolean>(LOOP_LENGTH).fill(false),
    snare: new Array<boolean>(LOOP_LENGTH).fill(false),
    hatClosed: new Array<boolean>(LOOP_LENGTH).fill(false),
    hatOpen: new Array<boolean>(LOOP_LENGTH).fill(false),
  }
}

export function createComposition(): Composition {
  return {
    title: 'Untitled Duet',
    tempo: 104,
    key: 'C',
    scale: 'minor',
    loopLength: LOOP_LENGTH,
    instruments: ['lead'],
    lead: { notes: [], preset: 'neon', mixer: { volume: 0.8, muted: false } },
    bass: { notes: [], preset: 'warm', mixer: { volume: 0.85, muted: false } },
    drums: { pattern: emptyDrumPattern(), preset: 'analog', mixer: { volume: 0.9, muted: false } },
    pad: { chords: [], preset: 'haze', mixer: { volume: 0.6, muted: false } },
  }
}

export function createSession(): SessionState {
  return {
    sessionId: newSessionId(),
    version: 1,
    mode: 'compose',
    composition: createComposition(),
    energy: 0.6,
    playback: { playing: false, step: -1 },
    activity: [],
    selection: { instrument: null, steps: [] },
    audioEnabled: false,
  }
}

/** A short built-in melody in C minor for judges who don't want to draw one. */
export function exampleMelody(): Note[] {
  return [
    { step: 0, pitch: 'C4', duration: 2, velocity: 0.9 },
    { step: 2, pitch: 'Eb4', duration: 1, velocity: 0.75 },
    { step: 3, pitch: 'G4', duration: 1, velocity: 0.8 },
    { step: 4, pitch: 'Bb4', duration: 2, velocity: 0.85 },
    { step: 6, pitch: 'G4', duration: 1, velocity: 0.7 },
    { step: 8, pitch: 'Ab4', duration: 2, velocity: 0.85 },
    { step: 10, pitch: 'G4', duration: 1, velocity: 0.7 },
    { step: 11, pitch: 'Eb4', duration: 1, velocity: 0.75 },
    { step: 12, pitch: 'F4', duration: 2, velocity: 0.8 },
    { step: 14, pitch: 'D4', duration: 2, velocity: 0.75 },
  ]
}

export function deepCloneComposition(c: Composition): Composition {
  return JSON.parse(JSON.stringify(c)) as Composition
}
