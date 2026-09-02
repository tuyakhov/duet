import { DuetError } from './errors'
import { isValidPitch } from './music'
import {
  BASS_PRESETS,
  DRUM_PRESETS,
  DRUM_VOICES,
  KEYS,
  KEYS_PRESETS,
  LEAD_PRESETS,
  LOOP_LENGTH,
  MAX_SWING,
  MAX_TEMPO,
  MIN_TEMPO,
  PAD_PRESETS,
  SCALE_NAMES,
} from './types'
import type { Chord, DrumPattern, DrumVoice, InstrumentId, Note, ScaleName } from './types'

const INSTRUMENTS: InstrumentId[] = ['lead', 'keys', 'drums', 'bass', 'pad']

export function assertInstrumentId(value: unknown): InstrumentId {
  if (typeof value !== 'string' || !INSTRUMENTS.includes(value as InstrumentId)) {
    throw new DuetError(
      'UNKNOWN_INSTRUMENT',
      `Unknown instrument "${String(value)}". Supported: ${INSTRUMENTS.join(', ')}.`,
    )
  }
  return value as InstrumentId
}

export function assertStep(value: unknown, label = 'step'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= LOOP_LENGTH) {
    throw new DuetError(
      'INVALID_STEP',
      `Invalid ${label} ${String(value)} — must be an integer from 0 to ${LOOP_LENGTH - 1}.`,
    )
  }
  return value
}

export function assertTempo(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_TEMPO || value > MAX_TEMPO) {
    throw new DuetError(
      'INVALID_INPUT',
      `Tempo must be a number between ${MIN_TEMPO} and ${MAX_TEMPO} BPM (got ${String(value)}).`,
    )
  }
  return Math.round(value)
}

export function assertKey(value: unknown): string {
  if (typeof value !== 'string' || !(KEYS as readonly string[]).includes(value)) {
    throw new DuetError(
      'UNSUPPORTED_VALUE',
      `Unsupported key "${String(value)}". Supported keys: ${KEYS.join(', ')}.`,
    )
  }
  return value
}

export function assertScale(value: unknown): ScaleName {
  if (typeof value !== 'string' || !(SCALE_NAMES as readonly string[]).includes(value)) {
    throw new DuetError(
      'UNSUPPORTED_VALUE',
      `Unsupported scale "${String(value)}". Supported scales: ${SCALE_NAMES.join(', ')}.`,
    )
  }
  return value as ScaleName
}

export function assertVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new DuetError('INVALID_INPUT', `Volume must be a number from 0 to 1 (got ${String(value)}).`)
  }
  return value
}

export function assertEnergy(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new DuetError('INVALID_INPUT', `Energy must be a number from 0 to 1 (got ${String(value)}).`)
  }
  return value
}

export function assertSwing(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_SWING) {
    throw new DuetError('INVALID_INPUT', `Swing must be a number from 0 to ${MAX_SWING} (got ${String(value)}).`)
  }
  return value
}

export function assertSpace(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new DuetError('INVALID_INPUT', `Space must be a number from 0 to 1 (got ${String(value)}).`)
  }
  return value
}

export function assertPreset(instrument: InstrumentId, value: unknown): string {
  const presets: Record<InstrumentId, readonly string[]> = {
    lead: LEAD_PRESETS,
    keys: KEYS_PRESETS,
    bass: BASS_PRESETS,
    pad: PAD_PRESETS,
    drums: DRUM_PRESETS,
  }
  const allowed = presets[instrument]
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new DuetError(
      'UNSUPPORTED_VALUE',
      `Unsupported ${instrument} preset "${String(value)}". Supported: ${allowed.join(', ')}.`,
    )
  }
  return value
}

export function assertDrumVoice(value: unknown): DrumVoice {
  if (typeof value !== 'string' || !DRUM_VOICES.includes(value as DrumVoice)) {
    throw new DuetError(
      'UNSUPPORTED_VALUE',
      `Unknown drum voice "${String(value)}". Supported: ${DRUM_VOICES.join(', ')}.`,
    )
  }
  return value as DrumVoice
}

export function validateNote(raw: unknown, label = 'note'): Note {
  if (typeof raw !== 'object' || raw === null) {
    throw new DuetError('INVALID_INPUT', `Each ${label} must be an object with step, pitch, duration, velocity.`)
  }
  const n = raw as Record<string, unknown>
  const step = assertStep(n.step, `${label} step`)
  if (typeof n.pitch !== 'string' || !isValidPitch(n.pitch)) {
    throw new DuetError(
      'INVALID_PITCH',
      `Invalid pitch "${String(n.pitch)}" — use scientific names between C1 and C7, e.g. "C4", "Eb3", "F#5".`,
    )
  }
  const duration = n.duration === undefined ? 1 : n.duration
  if (
    typeof duration !== 'number' ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    step + duration > LOOP_LENGTH
  ) {
    throw new DuetError(
      'INVALID_DURATION',
      `Invalid duration ${String(n.duration)} for ${label} at step ${step} — must be an integer >= 1 and fit inside the ${LOOP_LENGTH}-step loop.`,
    )
  }
  const velocity = n.velocity === undefined ? 0.8 : n.velocity
  if (typeof velocity !== 'number' || velocity < 0 || velocity > 1) {
    throw new DuetError('INVALID_VELOCITY', `Invalid velocity ${String(n.velocity)} — must be between 0 and 1.`)
  }
  return { step, pitch: n.pitch, duration, velocity }
}

export function validateNotes(raw: unknown): Note[] {
  if (!Array.isArray(raw)) {
    throw new DuetError('INVALID_INPUT', 'Expected an array of notes.')
  }
  return raw.map((n) => validateNote(n))
}

export function validateChord(raw: unknown): Chord {
  if (typeof raw !== 'object' || raw === null) {
    throw new DuetError('INVALID_INPUT', 'Each chord must be an object with step, duration, pitches, velocity.')
  }
  const c = raw as Record<string, unknown>
  const step = assertStep(c.step, 'chord step')
  const duration = c.duration === undefined ? 4 : c.duration
  if (
    typeof duration !== 'number' ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    step + duration > LOOP_LENGTH
  ) {
    throw new DuetError(
      'INVALID_DURATION',
      `Invalid chord duration ${String(c.duration)} at step ${step} — must be an integer >= 1 and fit inside the loop.`,
    )
  }
  if (!Array.isArray(c.pitches) || c.pitches.length === 0 || c.pitches.length > 6) {
    throw new DuetError('INVALID_INPUT', 'Chord pitches must be an array of 1 to 6 note names.')
  }
  for (const p of c.pitches) {
    if (typeof p !== 'string' || !isValidPitch(p)) {
      throw new DuetError('INVALID_PITCH', `Invalid chord pitch "${String(p)}" — use names like "C3", "Eb4".`)
    }
  }
  const velocity = c.velocity === undefined ? 0.7 : c.velocity
  if (typeof velocity !== 'number' || velocity < 0 || velocity > 1) {
    throw new DuetError('INVALID_VELOCITY', `Invalid chord velocity ${String(c.velocity)} — must be between 0 and 1.`)
  }
  return { step, duration, pitches: c.pitches as string[], velocity }
}

export function validateDrumPattern(raw: unknown): DrumPattern {
  if (typeof raw !== 'object' || raw === null) {
    throw new DuetError(
      'INVALID_INPUT',
      'Drum pattern must be an object with kick, snare, hatClosed and hatOpen arrays.',
    )
  }
  const p = raw as Record<string, unknown>
  const out = {} as DrumPattern
  for (const voice of DRUM_VOICES) {
    const arr = p[voice]
    if (arr === undefined) {
      out[voice] = new Array<boolean>(LOOP_LENGTH).fill(false)
      continue
    }
    if (!Array.isArray(arr) || arr.length !== LOOP_LENGTH || arr.some((v) => typeof v !== 'boolean')) {
      throw new DuetError(
        'INVALID_INPUT',
        `Drum voice "${voice}" must be an array of exactly ${LOOP_LENGTH} booleans.`,
      )
    }
    out[voice] = [...(arr as boolean[])]
  }
  return out
}

export function assertSteps(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new DuetError('INVALID_INPUT', 'Expected a non-empty array of steps.')
  }
  return raw.map((s) => assertStep(s))
}
