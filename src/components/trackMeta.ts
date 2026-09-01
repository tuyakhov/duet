import type { InstrumentId } from '../engine/types'
import { BASS_PRESETS, DRUM_PRESETS, LEAD_PRESETS, PAD_PRESETS } from '../engine/types'

export const TRACK_COLORS: Record<InstrumentId, string> = {
  lead: 'var(--lead)',
  drums: 'var(--drums)',
  bass: 'var(--bass)',
  pad: 'var(--pad)',
}

export const TRACK_PRESETS: Record<InstrumentId, readonly string[]> = {
  lead: LEAD_PRESETS,
  drums: DRUM_PRESETS,
  bass: BASS_PRESETS,
  pad: PAD_PRESETS,
}

export const STEP_W = 44
export const STEP_GAP = 2
export const LABEL_W = 44

export function stepLeft(step: number, labelWidth = LABEL_W): number {
  return labelWidth + STEP_GAP + step * (STEP_W + STEP_GAP)
}

export function spanWidth(duration: number): number {
  return duration * STEP_W + (duration - 1) * STEP_GAP
}
