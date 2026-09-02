import { useEffect, useRef, useState } from 'react'
import { viewDrumSection, viewMelodicSection } from '../engine/ops'
import type { InstrumentId, PatternSection } from '../engine/types'
import { INSTRUMENT_LABELS } from '../engine/types'
import { humanActions } from '../state/actions'
import { useStudioStore } from '../state/store'
import { ChordLane } from './ChordLane'
import { DrumGrid } from './DrumGrid'
import { PianoRoll } from './PianoRoll'
import { TRACK_COLORS, TRACK_PRESETS } from './trackMeta'

const SECTIONS: PatternSection[] = ['main', 'variation', 'fill']

/** Phrase-bar tabs for tracks that support variation/fill slots. */
function SectionTabs({
  id,
  section,
  onChange,
}: {
  id: 'drums' | 'bass'
  section: PatternSection
  onChange: (s: PatternSection) => void
}) {
  const slotStates = useStudioStore((s) =>
    SECTIONS.map((sec) => {
      const slot =
        id === 'drums' ? viewDrumSection(s.composition, sec) : viewMelodicSection(s.composition, id, sec)
      return slot === null ? 'absent' : 'present'
    }).join(','),
  ).split(',')
  const playBar = useStudioStore((s) => s.playback.bar)
  const playingSection = playBar === 2 ? 'variation' : playBar === 3 ? 'fill' : playBar >= 0 ? 'main' : null

  return (
    <div className="section-tabs" role="tablist" aria-label={`${id} phrase bars`}>
      {SECTIONS.map((sec, i) => (
        <button
          key={sec}
          role="tab"
          aria-selected={section === sec}
          className={`${section === sec ? 'active' : ''} ${playingSection === sec ? 'playing' : ''}`}
          onClick={() => onChange(sec)}
          title={
            sec === 'main'
              ? 'Bars 1-2 of the phrase'
              : sec === 'variation'
                ? 'Bar 3 — falls back to main when empty'
                : 'Bar 4 — the fill; falls back when empty'
          }
        >
          {sec}
          {sec !== 'main' && slotStates[i] === 'present' && <span className="slot-dot" aria-hidden />}
        </button>
      ))}
    </div>
  )
}

/** Helper row shown when editing an empty variation/fill slot. */
function SectionHint({ id, section }: { id: 'drums' | 'bass'; section: PatternSection }) {
  const isEmpty = useStudioStore((s) => {
    const slot =
      id === 'drums' ? viewDrumSection(s.composition, section) : viewMelodicSection(s.composition, id, section)
    return slot === null
  })
  if (section === 'main') return null
  return (
    <div className="section-hint">
      {isEmpty ? (
        <>
          <span>This {section} bar is empty — it plays the main bar until you add something.</span>
          <button className="link-btn" onClick={() => humanActions.copySectionFromMain(id, section)}>
            Copy from main
          </button>
        </>
      ) : (
        <button className="link-btn" onClick={() => humanActions.clearSection(id, section)}>
          Clear {section} (fall back to main)
        </button>
      )}
    </div>
  )
}

export function TrackCard({ id }: { id: InstrumentId }) {
  const mixer = useStudioStore((s) => s.composition[id].mixer)
  const preset = useStudioStore((s) => s.composition[id].preset)
  const highlight = useStudioStore((s) => s.highlights[id])
  const mode = useStudioStore((s) => s.mode)
  const editable = mode === 'compose'
  const [section, setSection] = useState<PatternSection>('main')
  const sectioned = id === 'drums' || id === 'bass'

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
        {sectioned && editable && <SectionTabs id={id} section={section} onChange={setSection} />}
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
        {sectioned && editable && <SectionHint id={id} section={section} />}
        {id === 'lead' && <PianoRoll id="lead" lowOctave={4} highOctave={5} />}
        {id === 'keys' && <PianoRoll id="keys" lowOctave={3} highOctave={4} />}
        {id === 'bass' && <PianoRoll id="bass" lowOctave={1} highOctave={2} section={editable ? section : 'main'} />}
        {id === 'drums' && <DrumGrid section={editable ? section : 'main'} />}
        {id === 'pad' && <ChordLane />}
      </div>
    </section>
  )
}
