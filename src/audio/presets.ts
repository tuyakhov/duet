import type { RecursivePartial } from 'tone/build/esm/core/util/Interface'
import type { SynthOptions, MonoSynthOptions } from 'tone'

/** Lead: bright poly synths. */
export const LEAD_SYNTH_PRESETS: Record<string, RecursivePartial<SynthOptions>> = {
  neon: {
    oscillator: { type: 'fatsawtooth', count: 3, spread: 24 },
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.5, release: 0.4 },
  },
  glass: {
    oscillator: { type: 'triangle8' },
    envelope: { attack: 0.005, decay: 0.3, sustain: 0.2, release: 0.8 },
  },
  saw: {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.3 },
  },
}

/** Bass: warm mono synths. */
export const BASS_SYNTH_PRESETS: Record<string, RecursivePartial<MonoSynthOptions>> = {
  warm: {
    oscillator: { type: 'square' },
    filter: { Q: 2, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.25 },
    filterEnvelope: { attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.3, baseFrequency: 120, octaves: 2.5 },
  },
  growl: {
    oscillator: { type: 'fatsawtooth', count: 2, spread: 12 },
    filter: { Q: 4, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.005, decay: 0.25, sustain: 0.5, release: 0.2 },
    filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.2, release: 0.2, baseFrequency: 90, octaves: 3.2 },
  },
  sub: {
    oscillator: { type: 'sine' },
    filter: { Q: 1, type: 'lowpass', rolloff: -12 },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.3 },
    filterEnvelope: { attack: 0.02, decay: 0.2, sustain: 0.8, release: 0.3, baseFrequency: 200, octaves: 1 },
  },
}

/** Pad: soft atmospheric poly synths. */
export const PAD_SYNTH_PRESETS: Record<string, RecursivePartial<SynthOptions>> = {
  haze: {
    oscillator: { type: 'fatsine', count: 3, spread: 18 },
    envelope: { attack: 0.6, decay: 0.5, sustain: 0.8, release: 1.6 },
  },
  strings: {
    oscillator: { type: 'fatsawtooth', count: 3, spread: 30 },
    envelope: { attack: 0.9, decay: 0.4, sustain: 0.7, release: 2.0 },
  },
  choir: {
    oscillator: { type: 'triangle4' },
    envelope: { attack: 0.5, decay: 0.6, sustain: 0.9, release: 1.8 },
  },
}

export interface DrumKitOptions {
  kickPitch: string
  kickDecay: number
  snareDecay: number
  hatClosedDecay: number
  hatOpenDecay: number
}

export const DRUM_KIT_PRESETS: Record<string, DrumKitOptions> = {
  analog: { kickPitch: 'C1', kickDecay: 0.4, snareDecay: 0.18, hatClosedDecay: 0.04, hatOpenDecay: 0.3 },
  punch: { kickPitch: 'D1', kickDecay: 0.25, snareDecay: 0.12, hatClosedDecay: 0.03, hatOpenDecay: 0.2 },
}
