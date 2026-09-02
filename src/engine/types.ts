/**
 * Duet session model — plain serializable data shared by the human UI,
 * the audio scheduler, and every WebMCP tool.
 */

export type Mode = 'compose' | 'performance'

export type InstrumentId = 'lead' | 'keys' | 'drums' | 'bass' | 'pad'

export type DrumVoice = 'kick' | 'snare' | 'hatClosed' | 'hatOpen'

export type Actor = 'human' | 'agent' | 'system' | 'playback'

export const LOOP_LENGTH = 16

export const DRUM_VOICES: DrumVoice[] = ['kick', 'snare', 'hatClosed', 'hatOpen']

/** A melodic note on the 16-step grid. */
export interface Note {
  /** 0..15 */
  step: number
  /** Scientific pitch name, e.g. "C4", "Eb4", "G3". */
  pitch: string
  /** Length in steps, >= 1. Notes may not run past the end of the loop. */
  duration: number
  /** 0..1 */
  velocity: number
}

/** A pad chord: several pitches sounding together from a start step. */
export interface Chord {
  step: number
  duration: number
  pitches: string[]
  velocity: number
}

export interface DrumPattern {
  kick: boolean[]
  snare: boolean[]
  hatClosed: boolean[]
  hatOpen: boolean[]
}

export interface MixerSettings {
  /** 0..1 linear volume */
  volume: number
  muted: boolean
}

export interface LeadTrack {
  notes: Note[]
  preset: string
  mixer: MixerSettings
}

export interface KeysTrack {
  notes: Note[]
  preset: string
  mixer: MixerSettings
}

export interface BassTrack {
  notes: Note[]
  preset: string
  mixer: MixerSettings
}

export interface DrumTrack {
  pattern: DrumPattern
  preset: string
  mixer: MixerSettings
}

export interface PadTrack {
  chords: Chord[]
  preset: string
  mixer: MixerSettings
}

/** The authored composition — everything that is saved, shared and undoable. */
export interface Composition {
  title: string
  /** BPM, 60..200 */
  tempo: number
  /** Pitch class, e.g. "C", "Eb", "F#". */
  key: string
  scale: ScaleName
  loopLength: number
  /** Which instrument modules currently exist, in rack order. */
  instruments: InstrumentId[]
  /** Swing amount 0..0.6 — delays every off-beat 16th for groove. */
  swing: number
  /** Global reverb send 0..1 — how much "room" around lead/keys/pad. */
  space: number
  lead: LeadTrack
  keys: KeysTrack
  bass: BassTrack
  drums: DrumTrack
  pad: PadTrack
}

export interface ActivityEntry {
  id: number
  actor: Actor
  message: string
  at: number
}

export interface PlaybackState {
  playing: boolean
  /** Current step 0..15 while playing, -1 otherwise. */
  step: number
}

export interface SelectionState {
  instrument: InstrumentId | null
  steps: number[]
}

export interface SessionState {
  sessionId: string
  /** Monotonically increasing — bumps on every human or agent mutation. */
  version: number
  mode: Mode
  composition: Composition
  /** Performance-mode global energy, 0..1. */
  energy: number
  playback: PlaybackState
  activity: ActivityEntry[]
  selection: SelectionState
  audioEnabled: boolean
}

export const SCALE_NAMES = [
  'major',
  'minor',
  'harmonicMinor',
  'dorian',
  'phrygian',
  'mixolydian',
  'majorPentatonic',
  'minorPentatonic',
] as const

export type ScaleName = (typeof SCALE_NAMES)[number]

export const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const

export const LEAD_PRESETS = ['neon', 'glass', 'saw', 'laser', 'chip', 'velvet', 'brass'] as const
export const KEYS_PRESETS = ['tines', 'bell', 'organ'] as const
export const BASS_PRESETS = ['warm', 'growl', 'sub', 'rubber', 'buzz'] as const
export const PAD_PRESETS = ['haze', 'strings', 'choir', 'shimmer', 'dark'] as const
export const DRUM_PRESETS = ['analog', 'punch', 'boom'] as const

export const INSTRUMENT_LABELS: Record<InstrumentId, string> = {
  lead: 'Lead Synth',
  keys: 'Electric Keys',
  drums: 'Drum Machine',
  bass: 'Bass Synth',
  pad: 'Pad Synth',
}

export const MAX_SWING = 0.6

export const MIN_TEMPO = 60
export const MAX_TEMPO = 200

/** Result metadata every mutation reports back (for activity + tool responses). */
export interface MutationReport {
  summary: string
  changedTracks: InstrumentId[] | ['session']
  changedSteps: number[]
  warnings: string[]
}
