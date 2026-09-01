import { useState } from 'react'
import { audioEngine } from '../audio/engine'
import type { Composition } from '../engine/types'
import { INSTRUMENT_LABELS } from '../engine/types'
import { humanActions } from '../state/actions'
import { useStudioStore } from '../state/store'
import { PlayIcon, StopIcon } from './Transport'

interface ShareViewProps {
  composition: Composition
  onRemix: () => void
}

/**
 * The page a shared link opens: play the song, or remix it into your own
 * editable session. The composition is already loaded into the store.
 */
export function ShareView({ composition, onRemix }: ShareViewProps) {
  const playing = useStudioStore((s) => s.playback.playing)
  const [copied, setCopied] = useState(false)

  const togglePlay = async () => {
    if (!audioEngine.enabled) await humanActions.enableAudio()
    humanActions.togglePlay()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // ignore
    }
  }

  return (
    <div className="share-page">
      <div className="modal share-card">
        <div className="made-in">Created in Duet</div>
        <h1>{composition.title}</h1>
        <div className="share-meta">
          {composition.tempo} BPM · {composition.key} {composition.scale} ·{' '}
          {composition.instruments.map((i) => INSTRUMENT_LABELS[i]).join(' + ')}
        </div>
        <div className="share-actions">
          <button className={`play-btn ${playing ? 'playing' : ''}`} onClick={togglePlay} aria-label={playing ? 'Stop' : 'Play'}>
            {playing ? <StopIcon /> : <PlayIcon />}
          </button>
          <button className="btn big-primary" onClick={onRemix}>
            Remix this duet
          </button>
          <button className="btn ghost" onClick={copy}>
            {copied ? '✓ Copied' : 'Copy link'}
          </button>
        </div>
        <p className="share-cta">They played the melody. Their agent built the band. What will yours create?</p>
      </div>
    </div>
  )
}

export function ShareErrorView({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="share-page">
      <div className="modal share-card">
        <div className="made-in">Duet</div>
        <h1>This link won't play</h1>
        <p style={{ color: 'var(--text-dim)', lineHeight: 1.6 }}>{message}</p>
        <div className="share-actions">
          <button className="btn big-primary" onClick={onDismiss}>
            Open a fresh studio
          </button>
        </div>
      </div>
    </div>
  )
}
