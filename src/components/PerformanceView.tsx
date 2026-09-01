import { useEffect, useRef, useState } from 'react'
import { audioEngine } from '../audio/engine'
import { LOOP_LENGTH } from '../engine/types'
import type { InstrumentId } from '../engine/types'
import { INSTRUMENT_LABELS } from '../engine/types'
import { humanActions } from '../state/actions'
import { useStudioStore } from '../state/store'
import { PlayIcon, StopIcon } from './Transport'
import { TRACK_COLORS } from './trackMeta'

function useLevels(): Record<InstrumentId, number> {
  const [levels, setLevels] = useState<Record<InstrumentId, number>>({ lead: 0, bass: 0, pad: 0, drums: 0 })
  useEffect(() => {
    let raf = 0
    const loop = () => {
      setLevels(audioEngine.getLevels())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return levels
}

/** Which steps carry content for a track — the read-only performance strip. */
function stepActivity(id: InstrumentId, s: ReturnType<typeof useStudioStore.getState>): boolean[] {
  const c = s.composition
  const steps = new Array<boolean>(LOOP_LENGTH).fill(false)
  if (id === 'drums') {
    const p = c.drums.pattern
    for (let i = 0; i < LOOP_LENGTH; i++) steps[i] = p.kick[i] || p.snare[i] || p.hatClosed[i] || p.hatOpen[i]
  } else if (id === 'pad') {
    for (const ch of c.pad.chords) for (let i = ch.step; i < Math.min(LOOP_LENGTH, ch.step + ch.duration); i++) steps[i] = true
  } else {
    for (const n of c[id].notes) for (let i = n.step; i < Math.min(LOOP_LENGTH, n.step + n.duration); i++) steps[i] = true
  }
  return steps
}

function MiniStrip({ id }: { id: InstrumentId }) {
  const stepsKey = useStudioStore((s) => stepActivity(id, s).map((v) => (v ? '1' : '0')).join(''))
  const steps = stepsKey.split('').map((v) => v === '1')
  const playStep = useStudioStore((s) => s.playback.step)
  return (
    <div className="perf-minigrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: 3 }} aria-hidden>
      {steps.map((on, i) => (
        <div
          key={i}
          style={{
            height: 10,
            borderRadius: 3,
            background: on ? `var(--track-color)` : 'var(--line-soft)',
            opacity: playStep === i ? 1 : on ? 0.65 : 0.5,
            boxShadow: playStep === i && on ? '0 0 10px var(--track-color)' : undefined,
            transition: 'opacity 0.08s',
          }}
        />
      ))}
    </div>
  )
}

export function PerformanceView() {
  const playing = useStudioStore((s) => s.playback.playing)
  const energy = useStudioStore((s) => s.energy)
  const instruments = useStudioStore((s) => s.composition.instruments)
  const composition = useStudioStore((s) => s.composition)
  const breakdownUntil = useStudioStore((s) => s.breakdownUntil)
  const levels = useLevels()

  const [breakdownActive, setBreakdownActive] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    const remaining = breakdownUntil - Date.now()
    if (remaining > 0) {
      setBreakdownActive(true)
      timer.current = setTimeout(() => setBreakdownActive(false), remaining)
      return () => clearTimeout(timer.current)
    }
  }, [breakdownUntil])

  return (
    <div className="perf-stage">
      <div className="perf-controls">
        <button
          className={`perf-play ${playing ? 'playing' : ''}`}
          onClick={() => humanActions.togglePlay()}
          aria-label={playing ? 'Stop performance' : 'Start performance'}
        >
          {playing ? <StopIcon /> : <PlayIcon />}
        </button>

        <div className="energy-block">
          <label>
            Energy <span className="energy-value">{Math.round(energy * 100)}%</span>
          </label>
          <input
            className="energy-slider"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={energy}
            onChange={(e) => humanActions.setEnergy(Number(e.target.value))}
            aria-label="Performance energy"
          />
        </div>

        <button
          className={`breakdown-btn ${breakdownActive ? 'active' : ''}`}
          onClick={() => humanActions.launchBreakdown()}
          disabled={breakdownActive}
        >
          {breakdownActive ? 'Break…' : 'Breakdown'}
        </button>
      </div>

      <div className="perf-tracks">
        {instruments.map((id) => {
          const mixer = composition[id].mixer
          return (
            <div key={id} className="perf-track" style={{ '--track-color': TRACK_COLORS[id] } as React.CSSProperties}>
              <span className="perf-track-name">{INSTRUMENT_LABELS[id]}</span>
              <MiniStrip id={id} />
              <div className="level-meter">
                <div className="level-fill" style={{ width: `${Math.round(Math.min(1, levels[id]) * 100)}%` }} />
              </div>
              <input
                type="range"
                className="volume-slider"
                style={{ width: '100%' }}
                min={0}
                max={1}
                step={0.01}
                value={mixer.volume}
                onChange={(e) => humanActions.setVolume(id, Number(e.target.value))}
                aria-label={`${INSTRUMENT_LABELS[id]} volume`}
              />
              <button
                className={`perf-mute ${mixer.muted ? 'muted' : ''}`}
                onClick={() => humanActions.toggleMute(id)}
                aria-pressed={mixer.muted}
              >
                {mixer.muted ? 'MUTED' : 'MUTE'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
