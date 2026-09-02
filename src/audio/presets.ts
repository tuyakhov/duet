import type { RecursivePartial } from 'tone/build/esm/core/util/Interface'
import type { MonoSynthOptions } from 'tone'

/**
 * Preset patches. Every melodic voice is a full subtractive synth
 * (oscillator → resonant lowpass with its own envelope), so the timbre
 * moves inside every note — that movement is the difference between a
 * synthesizer and a polyphonic ringtone.
 */

/** Lead: cutting, characterful lines. */
export const LEAD_SYNTH_PRESETS: Record<string, RecursivePartial<MonoSynthOptions>> = {
  // 5-voice unison saw with a plucky filter bite — the modern electro lead.
  neon: {
    oscillator: { type: 'fatsawtooth', count: 5, spread: 32 },
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.3 },
    filter: { type: 'lowpass', Q: 1.2, rolloff: -12 },
    filterEnvelope: { attack: 0.004, decay: 0.25, sustain: 0.35, release: 0.3, baseFrequency: 300, octaves: 3.6 },
  },
  // 7-voice supersaw that opens up and stays open — trance/festival lead.
  hyper: {
    oscillator: { type: 'fatsawtooth', count: 7, spread: 62 },
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.7, release: 0.5 },
    filter: { type: 'lowpass', Q: 0.8, rolloff: -12 },
    filterEnvelope: { attack: 0.03, decay: 0.4, sustain: 0.6, release: 0.5, baseFrequency: 400, octaves: 3 },
  },
  // FM chime with a closing filter — glassy strike that melts.
  glass: {
    oscillator: { type: 'fmsine', modulationIndex: 9, harmonicity: 2.01 },
    envelope: { attack: 0.003, decay: 0.5, sustain: 0.1, release: 0.9 },
    filter: { type: 'lowpass', Q: 1, rolloff: -12 },
    filterEnvelope: { attack: 0.002, decay: 0.6, sustain: 0.1, release: 0.8, baseFrequency: 900, octaves: 3 },
  },
  // One saw, classic squelchy envelope.
  saw: {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.005, decay: 0.15, sustain: 0.55, release: 0.25 },
    filter: { type: 'lowpass', Q: 2, rolloff: -12 },
    filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.3, baseFrequency: 250, octaves: 3.2 },
  },
  // Gritty FM saw pluck — electro house bite.
  wire: {
    oscillator: { type: 'fmsawtooth', modulationIndex: 6, harmonicity: 1 },
    envelope: { attack: 0.004, decay: 0.15, sustain: 0.4, release: 0.2 },
    filter: { type: 'lowpass', Q: 3, rolloff: -12 },
    filterEnvelope: { attack: 0.003, decay: 0.15, sustain: 0.25, release: 0.2, baseFrequency: 200, octaves: 3.4 },
  },
  // Zappy inharmonic FM with a fast-closing filter.
  laser: {
    oscillator: { type: 'fmsquare', modulationIndex: 20, harmonicity: 0.501 },
    envelope: { attack: 0.002, decay: 0.25, sustain: 0.2, release: 0.18 },
    filter: { type: 'lowpass', Q: 2, rolloff: -12 },
    filterEnvelope: { attack: 0.002, decay: 0.3, sustain: 0.05, release: 0.2, baseFrequency: 1200, octaves: 2.5 },
  },
  // True 25% pulse, filter mostly open — chip stays chip.
  chip: {
    oscillator: { type: 'pulse', width: 0.25 },
    envelope: { attack: 0.001, decay: 0.07, sustain: 0.35, release: 0.07 },
    filter: { type: 'lowpass', Q: 0.5, rolloff: -12 },
    filterEnvelope: { attack: 0.001, decay: 0.05, sustain: 1, release: 0.1, baseFrequency: 2500, octaves: 1 },
  },
  // Soft detuned sines behind a warm filter.
  velvet: {
    oscillator: { type: 'fatsine', count: 3, spread: 16 },
    envelope: { attack: 0.05, decay: 0.4, sustain: 0.6, release: 0.9 },
    filter: { type: 'lowpass', Q: 0.8, rolloff: -12 },
    filterEnvelope: { attack: 0.05, decay: 0.4, sustain: 0.5, release: 0.8, baseFrequency: 500, octaves: 2 },
  },
  // Filter swells open with the amp — synth brass section.
  brass: {
    oscillator: { type: 'fatsawtooth', count: 7, spread: 42 },
    envelope: { attack: 0.08, decay: 0.2, sustain: 0.85, release: 0.35 },
    filter: { type: 'lowpass', Q: 1, rolloff: -12 },
    filterEnvelope: { attack: 0.09, decay: 0.2, sustain: 0.7, release: 0.4, baseFrequency: 300, octaves: 2.8 },
  },
  // Slow PWM drift inside a half-open filter — hollow and airy.
  air: {
    oscillator: { type: 'pwm', modulationFrequency: 0.6 },
    envelope: { attack: 0.06, decay: 0.3, sustain: 0.55, release: 0.7 },
    filter: { type: 'lowpass', Q: 1, rolloff: -12 },
    filterEnvelope: { attack: 0.06, decay: 0.3, sustain: 0.5, release: 0.7, baseFrequency: 600, octaves: 2.2 },
  },
}

/** Keys: electric pianos, organs and pluck machines. */
export const KEYS_SYNTH_PRESETS: Record<string, RecursivePartial<MonoSynthOptions>> = {
  // DX-style EP: bright FM strike, filter closes into a warm body.
  tines: {
    oscillator: { type: 'fmsine', modulationIndex: 10, harmonicity: 3.01 },
    envelope: { attack: 0.003, decay: 1.2, sustain: 0.08, release: 1.0 },
    filter: { type: 'lowpass', Q: 1, rolloff: -12 },
    filterEnvelope: { attack: 0.002, decay: 0.8, sustain: 0.15, release: 0.9, baseFrequency: 350, octaves: 3 },
  },
  // Deep FM bell — long bright ring that darkens as it fades.
  bell: {
    oscillator: { type: 'fmsine', modulationIndex: 18, harmonicity: 5.07 },
    envelope: { attack: 0.002, decay: 1.6, sustain: 0.03, release: 1.8 },
    filter: { type: 'lowpass', Q: 1, rolloff: -12 },
    filterEnvelope: { attack: 0.002, decay: 1.2, sustain: 0.1, release: 1.5, baseFrequency: 800, octaves: 2.5 },
  },
  // Drawbar organ from custom partials — organs don't sweep, they just are.
  organ: {
    oscillator: { type: 'custom', partials: [1, 0.7, 0, 0.45, 0, 0.3, 0, 0.18] },
    envelope: { attack: 0.015, decay: 0.04, sustain: 0.95, release: 0.1 },
    filter: { type: 'lowpass', Q: 0.5, rolloff: -12 },
    filterEnvelope: { attack: 0.01, decay: 0.05, sustain: 1, release: 0.1, baseFrequency: 2200, octaves: 0.4 },
  },
  // The clav quack: high-Q filter snapping shut hard and fast.
  clav: {
    oscillator: { type: 'fmsquare', modulationIndex: 4, harmonicity: 1 },
    envelope: { attack: 0.002, decay: 0.25, sustain: 0.06, release: 0.15 },
    filter: { type: 'lowpass', Q: 4, rolloff: -12 },
    filterEnvelope: { attack: 0.002, decay: 0.12, sustain: 0.05, release: 0.15, baseFrequency: 250, octaves: 4 },
  },
  // Karplus-flavoured synth pluck: saw through a fast closing sweep.
  pluck: {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.001, decay: 0.28, sustain: 0, release: 0.22 },
    filter: { type: 'lowpass', Q: 2, rolloff: -12 },
    filterEnvelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.2, baseFrequency: 200, octaves: 4 },
  },
}

/** Bass: warm to filthy. */
export const BASS_SYNTH_PRESETS: Record<string, RecursivePartial<MonoSynthOptions>> = {
  warm: {
    oscillator: { type: 'square' },
    filter: { Q: 2, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.25 },
    filterEnvelope: { attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.3, baseFrequency: 120, octaves: 2.5 },
  },
  reese: {
    oscillator: { type: 'fatsawtooth', count: 2, spread: 38 },
    filter: { Q: 2, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.3 },
    filterEnvelope: { attack: 0.02, decay: 0.3, sustain: 0.35, release: 0.4, baseFrequency: 70, octaves: 2.2 },
  },
  growl: {
    oscillator: { type: 'fatsawtooth', count: 3, spread: 18 },
    filter: { Q: 5, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.005, decay: 0.25, sustain: 0.5, release: 0.2 },
    filterEnvelope: { attack: 0.005, decay: 0.18, sustain: 0.2, release: 0.2, baseFrequency: 90, octaves: 3.5 },
  },
  sub: {
    oscillator: { type: 'fmsine', modulationIndex: 2, harmonicity: 1 },
    filter: { Q: 1, type: 'lowpass', rolloff: -12 },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.85, release: 0.3 },
    filterEnvelope: { attack: 0.02, decay: 0.2, sustain: 0.8, release: 0.3, baseFrequency: 220, octaves: 1 },
  },
  rubber: {
    oscillator: { type: 'fmsquare', modulationIndex: 8, harmonicity: 1 },
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
  acid: {
    oscillator: { type: 'sawtooth' },
    filter: { Q: 12, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.003, decay: 0.15, sustain: 0.3, release: 0.12 },
    filterEnvelope: { attack: 0.003, decay: 0.18, sustain: 0.05, release: 0.15, baseFrequency: 80, octaves: 4 },
  },
}

/** Pad: beds whose filters open as they swell (plus the chorus chain). */
export const PAD_SYNTH_PRESETS: Record<string, RecursivePartial<MonoSynthOptions>> = {
  haze: {
    oscillator: { type: 'fatsine', count: 3, spread: 18 },
    envelope: { attack: 0.6, decay: 0.5, sustain: 0.8, release: 1.6 },
    filter: { type: 'lowpass', Q: 0.6, rolloff: -12 },
    filterEnvelope: { attack: 1.2, decay: 0.5, sustain: 0.7, release: 1.6, baseFrequency: 300, octaves: 2 },
  },
  analog: {
    oscillator: { type: 'fatsquare', count: 3, spread: 22 },
    envelope: { attack: 0.5, decay: 0.4, sustain: 0.85, release: 1.4 },
    filter: { type: 'lowpass', Q: 0.8, rolloff: -12 },
    filterEnvelope: { attack: 0.8, decay: 0.5, sustain: 0.6, release: 1.4, baseFrequency: 250, octaves: 2.4 },
  },
  strings: {
    oscillator: { type: 'fatsawtooth', count: 5, spread: 46 },
    envelope: { attack: 1.1, decay: 0.4, sustain: 0.75, release: 2.2 },
    filter: { type: 'lowpass', Q: 0.6, rolloff: -12 },
    filterEnvelope: { attack: 1.4, decay: 0.6, sustain: 0.65, release: 2.2, baseFrequency: 350, octaves: 2.6 },
  },
  choir: {
    oscillator: { type: 'amtriangle', harmonicity: 2.01 },
    envelope: { attack: 0.6, decay: 0.6, sustain: 0.9, release: 1.9 },
    filter: { type: 'lowpass', Q: 1, rolloff: -12 },
    filterEnvelope: { attack: 0.9, decay: 0.6, sustain: 0.75, release: 1.9, baseFrequency: 500, octaves: 1.8 },
  },
  shimmer: {
    oscillator: { type: 'amsine', harmonicity: 1.01 },
    envelope: { attack: 0.9, decay: 0.4, sustain: 0.85, release: 2.4 },
    filter: { type: 'lowpass', Q: 0.8, rolloff: -12 },
    filterEnvelope: { attack: 1.0, decay: 0.5, sustain: 0.8, release: 2.4, baseFrequency: 900, octaves: 2 },
  },
  dark: {
    oscillator: { type: 'fatsine', count: 3, spread: 12 },
    envelope: { attack: 1.3, decay: 0.6, sustain: 0.8, release: 2.2 },
    filter: { type: 'lowpass', Q: 0.6, rolloff: -12 },
    filterEnvelope: { attack: 1.5, decay: 0.6, sustain: 0.7, release: 2.2, baseFrequency: 180, octaves: 1.5 },
  },
  vapor: {
    oscillator: { type: 'pwm', modulationFrequency: 0.25 },
    envelope: { attack: 0.9, decay: 0.5, sustain: 0.8, release: 2.0 },
    filter: { type: 'lowpass', Q: 0.8, rolloff: -12 },
    filterEnvelope: { attack: 1.1, decay: 0.5, sustain: 0.7, release: 2.0, baseFrequency: 400, octaves: 2.2 },
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
  analog: { kickPitch: 'C1', kickDecay: 0.4, snareDecay: 0.18, hatClosedDecay: 0.06, hatOpenDecay: 0.35 },
  punch: { kickPitch: 'D1', kickDecay: 0.25, snareDecay: 0.12, hatClosedDecay: 0.04, hatOpenDecay: 0.22 },
  boom: { kickPitch: 'A0', kickDecay: 0.8, snareDecay: 0.25, hatClosedDecay: 0.07, hatOpenDecay: 0.5 },
}
