import { useEffect, useMemo, useRef, useState } from 'react'
import { midiToPitch, parsePitch, prefersFlats, scaleMidiSet } from '../engine/music'
import { LOOP_LENGTH } from '../engine/types'
import { humanActions } from '../state/actions'
import { useStudioStore } from '../state/store'
import { LABEL_W, STEP_GAP, STEP_W, spanWidth, stepLeft } from './trackMeta'

const ROW_H = 22
const ROW_GAP = 2

interface Draft {
  step: number
  pitch: string
  duration: number
}

/**
 * A scale-aware piano roll: rows are the in-scale pitches across the given
 * octave range, plus any out-of-scale pitches that already hold notes (so
 * chromatic agent writing stays visible).
 */
export function PianoRoll({
  id,
  lowOctave,
  highOctave,
}: {
  id: 'lead' | 'keys' | 'bass'
  lowOctave: number
  highOctave: number
}) {
  const notes = useStudioStore((s) => s.composition[id].notes)
  const musicalKey = useStudioStore((s) => s.composition.key)
  const scale = useStudioStore((s) => s.composition.scale)
  const playStep = useStudioStore((s) => s.playback.step)
  const mode = useStudioStore((s) => s.mode)
  // The draft lives in a ref as well as state: the ref is set synchronously on
  // mousedown, so a mouseup arriving in the same frame still commits correctly.
  const draftRef = useRef<Draft | null>(null)
  const [draft, setDraftState] = useState<Draft | null>(null)
  const setDraft = (d: Draft | null) => {
    draftRef.current = d
    setDraftState(d)
  }

  const editable = mode === 'compose'
  const flats = prefersFlats(musicalKey, scale)
  const inScale = useMemo(() => scaleMidiSet(musicalKey, scale), [musicalKey, scale])

  const rows = useMemo(() => {
    const low = (lowOctave + 1) * 12
    const high = (highOctave + 1) * 12 + 11
    const midis = new Set<number>()
    for (let m = low; m <= high; m++) if (inScale.has(m)) midis.add(m)
    for (const n of notes) {
      const m = parsePitch(n.pitch)
      if (m !== null) midis.add(m)
    }
    return [...midis].sort((a, b) => b - a)
  }, [inScale, notes, lowOctave, highOctave])

  const rowIndex = useMemo(() => new Map(rows.map((m, i) => [m, i])), [rows])

  useEffect(() => {
    const commit = () => {
      const d = draftRef.current
      if (!d) return
      draftRef.current = null
      setDraftState(null)
      humanActions.drawNote(id, d.step, d.pitch, d.duration)
      useStudioStore.getState().setSelection(id, [d.step])
    }
    window.addEventListener('mouseup', commit)
    return () => window.removeEventListener('mouseup', commit)
  }, [id])

  const rootPc = useMemo(() => {
    const m = parsePitch(`${musicalKey}4`)
    return m === null ? 0 : m % 12
  }, [musicalKey])

  return (
    <div className="grid-wrap">
      <div className="piano-roll" style={{ gridTemplateColumns: `${LABEL_W}px repeat(16, ${STEP_W}px)` }}>
        {rows.map((midi) => {
          const pitch = midiToPitch(midi, flats)
          const scaleRow = inScale.has(midi)
          return [
            <div
              key={`label-${midi}`}
              className={`roll-label ${scaleRow ? 'in-scale' : ''} ${midi % 12 === rootPc ? 'is-root' : ''}`}
            >
              {pitch}
            </div>,
            ...Array.from({ length: LOOP_LENGTH }, (_, step) => (
              <div
                key={`${midi}-${step}`}
                className={`roll-cell ${scaleRow ? 'in-scale' : ''} ${step % 4 === 0 ? 'beat-start' : ''}`}
                onMouseDown={(e) => {
                  if (!editable || e.button !== 0) return
                  e.preventDefault()
                  setDraft({ step, pitch, duration: 1 })
                }}
                onMouseEnter={() => {
                  const d = draftRef.current
                  if (d && d.pitch === pitch && step >= d.step) {
                    setDraft({ ...d, duration: Math.min(step - d.step + 1, LOOP_LENGTH - d.step) })
                  }
                }}
              />
            )),
          ]
        })}
      </div>

      {notes.map((n) => {
        const midi = parsePitch(n.pitch)
        if (midi === null) return null
        const row = rowIndex.get(midi)
        if (row === undefined) return null
        return (
          <div
            key={`${n.step}-${n.pitch}`}
            className="roll-note"
            style={{
              left: stepLeft(n.step),
              width: spanWidth(n.duration),
              top: row * (ROW_H + ROW_GAP) + 1,
              height: ROW_H - 2,
              opacity: 0.55 + n.velocity * 0.45,
            }}
            title={`${n.pitch} · step ${n.step} · ${n.duration} step${n.duration > 1 ? 's' : ''} — click to delete`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => editable && humanActions.removeNote(id, n.step, n.pitch)}
          />
        )
      })}

      {draft && (
        <div
          className="roll-note ghost"
          style={{
            left: stepLeft(draft.step),
            width: spanWidth(draft.duration),
            top: (rowIndex.get(parsePitch(draft.pitch) ?? 0) ?? 0) * (ROW_H + ROW_GAP) + 1,
            height: ROW_H - 2,
          }}
        />
      )}

      {notes.length === 0 && !draft && editable && (
        <div className="roll-hint">click a cell to draw a note · drag right to stretch it</div>
      )}

      {playStep >= 0 && (
        <div
          className="playhead-column"
          style={{ transform: `translateX(${stepLeft(playStep)}px)`, width: STEP_W + STEP_GAP }}
        />
      )}
    </div>
  )
}
