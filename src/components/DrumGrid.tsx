import { viewDrumSection } from '../engine/ops'
import { emptyDrumPattern } from '../engine/session'
import { DRUM_VOICES, LOOP_LENGTH } from '../engine/types'
import type { DrumVoice } from '../engine/types'
import { humanActions } from '../state/actions'
import { useStudioStore } from '../state/store'
import { STEP_GAP, STEP_W, stepLeft } from './trackMeta'

const EMPTY = emptyDrumPattern()

const VOICE_LABELS: Record<DrumVoice, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hatClosed: 'CH Hat',
  hatOpen: 'OH Hat',
}

const DRUM_LABEL_W = 64

export function DrumGrid({ section = 'main' }: { section?: 'main' | 'variation' | 'fill' }) {
  const pattern = useStudioStore((s) => viewDrumSection(s.composition, section) ?? EMPTY)
  const playStep = useStudioStore((s) => s.playback.step)
  const playing = useStudioStore((s) => s.playback.playing)
  const mode = useStudioStore((s) => s.mode)
  const editable = mode === 'compose'

  return (
    <div className="grid-wrap">
      <div className="drum-grid" style={{ gridTemplateColumns: `${DRUM_LABEL_W}px repeat(16, ${STEP_W}px)` }}>
        {DRUM_VOICES.map((voice) => [
          <div key={`label-${voice}`} className="drum-label">
            {VOICE_LABELS[voice]}
          </div>,
          ...Array.from({ length: LOOP_LENGTH }, (_, step) => {
            const on = pattern[voice][step]
            const hit = on && playing && playStep === step
            return (
              <button
                key={`${voice}-${step}`}
                className={`drum-cell ${step % 4 === 0 ? 'beat-start' : ''} ${on ? 'on' : ''} ${hit ? 'hit' : ''}`}
                onClick={() => editable && humanActions.toggleDrum(voice, step, section)}
                aria-label={`${VOICE_LABELS[voice]} step ${step} ${on ? 'on' : 'off'}`}
                aria-pressed={on}
              />
            )
          }),
        ])}
      </div>
      {playStep >= 0 && (
        <div
          className="playhead-column"
          style={{
            transform: `translateX(${stepLeft(playStep, DRUM_LABEL_W) + 1}px)`,
            width: STEP_W + STEP_GAP,
          }}
        />
      )}
    </div>
  )
}
