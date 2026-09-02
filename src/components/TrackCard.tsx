import { useEffect, useRef, useState } from 'react'
import type { InstrumentId } from '../engine/types'
import { INSTRUMENT_LABELS } from '../engine/types'
import { humanActions } from '../state/actions'
import { useStudioStore } from '../state/store'
import { ChordLane } from './ChordLane'
import { DrumGrid } from './DrumGrid'
import { PianoRoll } from './PianoRoll'
import { TRACK_COLORS, TRACK_PRESETS } from './trackMeta'

export function TrackCard({ id }: { id: InstrumentId }) {
  const mixer = useStudioStore((s) => s.composition[id].mixer)
  const preset = useStudioStore((s) => s.composition[id].preset)
  const highlight = useStudioStore((s) => s.highlights[id])
  const mode = useStudioStore((s) => s.mode)
  const editable = mode === 'compose'

  // Re-trigger the pulse animation each time this track is edited.
  const [pulseClass, setPulseClass] = useState('')
  const lastSeq = useRef(0)
  useEffect(() => {
    if (!highlight || highlight.seq === lastSeq.current) return
    lastSeq.current = highlight.seq
    const cls = highlight.actor === 'agent' ? 'pulse-agent' : highlight.actor === 'human' ? 'pulse-human' : ''
    if (!cls) return
    setPulseClass('')
    const raf = requestAnimationFrame(() => setPulseClass(cls))
    const timer = setTimeout(() => setPulseClass(''), 950)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [highlight])

  return (
    <section
      className={`track-card ${pulseClass}`}
      style={{ '--track-color': TRACK_COLORS[id] } as React.CSSProperties}
      aria-label={INSTRUMENT_LABELS[id]}
    >
      <div className="track-header">
        <span className="track-name">{INSTRUMENT_LABELS[id]}</span>
        <div className="track-tools">
          <select
            className="select"
            value={preset}
            onChange={(e) => humanActions.setPreset(id, e.target.value)}
            disabled={!editable}
            aria-label={`${INSTRUMENT_LABELS[id]} preset`}
            title="Sound preset"
          >
            {TRACK_PRESETS[id].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            type="range"
            className="volume-slider"
            min={0}
            max={1}
            step={0.01}
            value={mixer.volume}
            onChange={(e) => humanActions.setVolume(id, Number(e.target.value))}
            aria-label={`${INSTRUMENT_LABELS[id]} volume`}
            title={`Volume ${Math.round(mixer.volume * 100)}%`}
          />
          <button
            className={`mute-btn ${mixer.muted ? 'muted' : ''}`}
            onClick={() => humanActions.toggleMute(id)}
            aria-pressed={mixer.muted}
          >
            {mixer.muted ? 'MUTED' : 'MUTE'}
          </button>
          {id !== 'lead' && editable && (
            <button
              className="remove-btn"
              onClick={() => humanActions.removeInstrument(id)}
              title={`Remove ${INSTRUMENT_LABELS[id]}`}
              aria-label={`Remove ${INSTRUMENT_LABELS[id]}`}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="track-body">
        {id === 'lead' && <PianoRoll id="lead" lowOctave={4} highOctave={5} />}
        {id === 'keys' && <PianoRoll id="keys" lowOctave={3} highOctave={4} />}
        {id === 'bass' && <PianoRoll id="bass" lowOctave={1} highOctave={2} />}
        {id === 'drums' && <DrumGrid />}
        {id === 'pad' && <ChordLane />}
      </div>
    </section>
  )
}
