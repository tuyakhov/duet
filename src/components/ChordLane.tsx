import { useMemo, useState } from 'react'
import { SCALE_INTERVALS, midiToPitch, parsePitch, prefersFlats } from '../engine/music'
import { LOOP_LENGTH } from '../engine/types'
import { humanActions } from '../state/actions'
import { useStudioStore } from '../state/store'
import { STEP_GAP, STEP_W, spanWidth } from './trackMeta'

interface DegreeChord {
  label: string
  pitches: string[]
}

/** Triads built on each scale degree, voiced around octave 3. */
function degreeChords(key: string, scale: keyof typeof SCALE_INTERVALS): DegreeChord[] {
  const rootMidi = parsePitch(`${key}3`)
  if (rootMidi === null) return []
  const intervals = SCALE_INTERVALS[scale]
  const flats = prefersFlats(key, scale)
  const L = intervals.length
  return intervals.map((_, degree) => {
    const semis = [0, 2, 4].map((k) => {
      const idx = degree + k
      return intervals[idx % L] + 12 * Math.floor(idx / L)
    })
    const midis = semis.map((s) => rootMidi + s)
    const third = midis[1] - midis[0]
    const rootName = midiToPitch(midis[0], flats).replace(/-?\d+$/, '')
    return {
      label: `${rootName}${third === 3 ? 'm' : third === 4 ? '' : '°'}`,
      pitches: midis.map((m) => midiToPitch(m, flats)),
    }
  })
}

export function ChordLane() {
  const chords = useStudioStore((s) => s.composition.pad.chords)
  const musicalKey = useStudioStore((s) => s.composition.key)
  const scale = useStudioStore((s) => s.composition.scale)
  const playStep = useStudioStore((s) => s.playback.step)
  const mode = useStudioStore((s) => s.mode)
  const [paletteStep, setPaletteStep] = useState<number | null>(null)

  const editable = mode === 'compose'
  const palette = useMemo(() => degreeChords(musicalKey, scale), [musicalKey, scale])

  const chordLeft = (step: number) => step * (STEP_W + STEP_GAP)

  return (
    <div className="grid-wrap">
      <div className="chord-lane" style={{ gridTemplateColumns: `repeat(16, ${STEP_W}px)` }}>
        {Array.from({ length: LOOP_LENGTH }, (_, step) => (
          <button
            key={step}
            className={`chord-slot ${step % 4 === 0 ? 'beat-start' : ''}`}
            onClick={() => editable && setPaletteStep(paletteStep === step ? null : step)}
            aria-label={`Add chord at step ${step}`}
          />
        ))}

        {chords.map((chord) => (
          <div
            key={chord.step}
            className="chord-block"
            style={{ left: chordLeft(chord.step), width: spanWidth(chord.duration) }}
            title="Click to remove this chord"
            onClick={() => editable && humanActions.removeChord(chord.step)}
          >
            <span className="chord-name">{chordName(chord.pitches)}</span>
            <span className="chord-pitches">{chord.pitches.join(' ')}</span>
          </div>
        ))}

        {playStep >= 0 && (
          <div
            className="playhead-column"
            style={{ transform: `translateX(${chordLeft(playStep)}px)`, width: STEP_W + STEP_GAP, left: 0 }}
          />
        )}
      </div>

      {paletteStep !== null && (
        <div className="chord-palette" style={{ left: Math.min(chordLeft(paletteStep), 420), top: -46 }}>
          {palette.map((p) => (
            <button
              key={p.label + p.pitches[0]}
              onClick={() => {
                const duration = Math.min(4, LOOP_LENGTH - paletteStep)
                humanActions.addChord(paletteStep, duration, p.pitches)
                setPaletteStep(null)
              }}
              title={p.pitches.join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function chordName(pitches: string[]): string {
  const midis = pitches.map((p) => parsePitch(p)).filter((m): m is number => m !== null)
  if (midis.length === 0) return '—'
  const root = Math.min(...midis)
  const name = midiToPitch(root, false).replace(/-?\d+$/, '')
  if (midis.length < 3) return name
  const sorted = [...midis].sort((a, b) => a - b)
  const third = sorted[1] - sorted[0]
  return `${name}${third === 3 ? 'm' : third === 4 ? '' : ''}`
}
