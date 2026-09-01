import type { ScaleName } from './types'

/** Semitone offsets for each supported scale. */
export const SCALE_INTERVALS: Record<ScaleName, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
}

const PITCH_CLASS_SEMITONES: Record<string, number> = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1,
  D: 2,
  'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, 'E#': 5,
  'F#': 6, Gb: 6,
  G: 7,
  'G#': 8, Ab: 8,
  A: 9,
  'A#': 10, Bb: 10,
  B: 11, Cb: 11,
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const PITCH_RE = /^([A-G])([#b]?)(-?\d)$/

/** Lowest/highest MIDI numbers Duet accepts (C1..C7). */
export const MIN_MIDI = 24
export const MAX_MIDI = 96

export function parsePitch(pitch: string): number | null {
  const m = PITCH_RE.exec(pitch)
  if (!m) return null
  const pc = PITCH_CLASS_SEMITONES[m[1] + m[2]]
  if (pc === undefined) return null
  const octave = parseInt(m[3], 10)
  const midi = (octave + 1) * 12 + pc
  if (midi < MIN_MIDI || midi > MAX_MIDI) return null
  return midi
}

export function isValidPitch(pitch: string): boolean {
  return parsePitch(pitch) !== null
}

export function midiToPitch(midi: number, preferFlats = false): string {
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES
  const octave = Math.floor(midi / 12) - 1
  return `${names[((midi % 12) + 12) % 12]}${octave}`
}

export function keyUsesFlats(key: string): boolean {
  return key.includes('b') || key === 'F'
}

/** Minor-family scales conventionally read better in flats unless the key is sharp. */
const FLAT_SIDE_SCALES: ScaleName[] = ['minor', 'harmonicMinor', 'phrygian', 'minorPentatonic']

export function prefersFlats(key: string, scale: ScaleName): boolean {
  if (key.includes('#')) return false
  return keyUsesFlats(key) || FLAT_SIDE_SCALES.includes(scale)
}

/**
 * MIDI numbers of the scale degrees for a key/scale within [MIN_MIDI, MAX_MIDI].
 * Used by the piano roll to highlight in-scale rows.
 */
export function scaleMidiSet(key: string, scale: ScaleName): Set<number> {
  const root = PITCH_CLASS_SEMITONES[key]
  const set = new Set<number>()
  if (root === undefined) return set
  const intervals = SCALE_INTERVALS[scale]
  for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
    if (intervals.includes((((midi - root) % 12) + 12) % 12)) set.add(midi)
  }
  return set
}

/** Pitch names of one octave of the scale starting at `rootOctave`. */
export function scalePitches(key: string, scale: ScaleName, rootOctave: number): string[] {
  const root = PITCH_CLASS_SEMITONES[key]
  if (root === undefined) return []
  const flats = keyUsesFlats(key)
  return SCALE_INTERVALS[scale].map((i) => midiToPitch((rootOctave + 1) * 12 + root + i, flats))
}
