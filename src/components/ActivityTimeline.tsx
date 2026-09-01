import { useMemo } from 'react'
import { useStudioStore } from '../state/store'

export function ActivityTimeline() {
  const activity = useStudioStore((s) => s.activity)
  const entries = useMemo(() => [...activity].reverse(), [activity])

  return (
    <section className="side-panel timeline-panel" aria-label="Activity timeline">
      <h3>Timeline</h3>
      {entries.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>
          Your duet's story appears here — every human and agent move.
        </p>
      ) : (
        <ol className="timeline">
          {entries.map((e) => (
            <li key={e.id}>
              <span className={`actor-badge ${e.actor}`}>{e.actor.toUpperCase()}</span>
              <span>{e.message}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
