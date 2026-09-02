import type { InstrumentId } from '../engine/types'
import { INSTRUMENT_LABELS } from '../engine/types'
import { humanActions } from '../state/actions'
import { useStudioStore } from '../state/store'
import { TRACK_COLORS } from './trackMeta'

const ADDABLE: InstrumentId[] = ['keys', 'drums', 'bass', 'pad']

export function InstrumentRack() {
  const instruments = useStudioStore((s) => s.composition.instruments)
  const missing = ADDABLE.filter((id) => !instruments.includes(id))
  if (missing.length === 0) return null

  return (
    <div className="rack" role="group" aria-label="Add instruments">
      {missing.map((id) => (
        <button
          key={id}
          className="rack-add"
          style={{ '--track-color': TRACK_COLORS[id] } as React.CSSProperties}
          onClick={() => humanActions.addInstrument(id)}
        >
          <span aria-hidden>＋</span> {INSTRUMENT_LABELS[id]}
        </button>
      ))}
    </div>
  )
}
