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
  laser: {
    oscillator: { type: 'fmsquare' },
    envelope: { attack: 0.002, decay: 0.2, sustain: 0.3, release: 0.2 },
  },
  chip: {
    oscillator: { type: 'square' },
    envelope: { attack: 0.001, decay: 0.08, sustain: 0.3, release: 0.08 },
  },
  velvet: {
    oscillator: { type: 'fatsine', count: 3, spread: 14 },
    envelope: { attack: 0.05, decay: 0.4, sustain: 0.6, release: 0.9 },
  },
  brass: {
    oscillator: { type: 'fatsawtooth', count: 5, spread: 32 },
    envelope: { attack: 0.06, decay: 0.2, sustain: 0.85, release: 0.35 },
  },
}

/** Keys: electric-piano flavored poly synths. */
export const KEYS_SYNTH_PRESETS: Record<string, RecursivePartial<SynthOptions>> = {
  tines: {
    oscillator: { type: 'fmsine' },
    envelope: { attack: 0.004, decay: 0.7, sustain: 0.15, release: 0.9 },
  },
  bell: {
    oscillator: { type: 'amsine4' },
    envelope: { attack: 0.002, decay: 1.1, sustain: 0.05, release: 1.4 },
  },
  organ: {
    oscillator: { type: 'fatsine4', count: 2, spread: 8 },
    envelope: { attack: 0.02, decay: 0.05, sustain: 0.95, release: 0.12 },
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
  rubber: {
    oscillator: { type: 'fmsquare' },
    filter: { Q: 3, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.004, decay: 0.18, sustain: 0.4, release: 0.15 },
    filterEnvelope: { attack: 0.004, decay: 0.1, sustain: 0.3, release: 0.15, baseFrequency: 150, octaves: 3 },
  },
  buzz: {
    oscillator: { type: 'sawtooth' },
    filter: { Q: 6, type: 'lowpass', rolloff: -12 },
    envelope: { attack: 0.008, decay: 0.3, sustain: 0.7, release: 0.2 },
    filterEnvelope: { attack: 0.01, decay: 0.25, sustain: 0.5, release: 0.25, baseFrequency: 110, octaves: 2.8 },
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
  shimmer: {
    oscillator: { type: 'amtriangle', harmonicity: 1.01 },
    envelope: { attack: 0.8, decay: 0.4, sustain: 0.85, release: 2.4 },
  },
  dark: {
    oscillator: { type: 'fatsine', count: 3, spread: 12 },
    envelope: { attack: 1.2, decay: 0.6, sustain: 0.8, release: 2.2 },
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
  boom: { kickPitch: 'A0', kickDecay: 0.8, snareDecay: 0.25, hatClosedDecay: 0.05, hatOpenDecay: 0.45 },
}
