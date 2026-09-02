import { useMemo, useRef, useState } from 'react'
import { copyText } from '../state/clipboard'
import { useStudioStore } from '../state/store'

const CONFETTI_COLORS = ['#64d2ff', '#ff375f', '#ff9f0a', '#bf5af2', '#30d158', '#ffffff']

export function Celebration() {
  const celebration = useStudioStore((s) => s.celebration)
  const dismiss = useStudioStore((s) => s.dismissCelebration)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const linkRef = useRef<HTMLInputElement>(null)

  const confetti = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: `${(i % 9) * 0.08}s`,
      })),
    [celebration?.url],
  )

  if (!celebration) return null

  const copy = async () => {
    const ok = await copyText(celebration.url)
    setCopyState(ok ? 'copied' : 'failed')
    if (!ok) {
      linkRef.current?.focus()
      linkRef.current?.select()
    }
    setTimeout(() => setCopyState('idle'), ok ? 1600 : 3200)
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Song published">
      <div className="modal celebration-card">
        {confetti.map((c, i) => (
          <span
            key={i}
            className="confetti"
            style={{ left: c.left, background: c.background, animationDelay: c.delay }}
          />
        ))}
        <h2>“{celebration.title}” is live ✦</h2>
        <p>Anyone with this link can play your duet — and remix it with their own agent.</p>
        <div className="share-link-row">
          <input ref={linkRef} readOnly value={celebration.url} onFocus={(e) => e.target.select()} aria-label="Remix link" />
          <button className="btn approve" onClick={copy}>
            {copyState === 'copied' ? '✓ Copied' : copyState === 'failed' ? 'Selected — press ⌘C' : 'Copy link'}
          </button>
        </div>
        <p className="share-cta">I played the melody. My agent built the band. What will yours create?</p>
        <div className="modal-actions" style={{ justifyContent: 'center', marginTop: 10 }}>
          <button className="btn ghost" onClick={dismiss}>
            Back to the studio
          </button>
        </div>
      </div>
    </div>
  )
}
