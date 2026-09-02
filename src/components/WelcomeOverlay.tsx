import { useState } from 'react'
import { humanActions } from '../state/actions'
import { PromptCard } from './PromptCard'

export function WelcomeOverlay({ onDone }: { onDone: () => void }) {
  const [starting, setStarting] = useState(false)

  const enable = async (withExample: boolean) => {
    setStarting(true)
    await humanActions.enableAudio()
    if (withExample) humanActions.loadExampleMelody()
    onDone()
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Welcome to Duet">
      <div className="modal welcome-card">
        <div className="welcome-logo">Duet</div>
        <p className="welcome-tag">
          Record a melody, then ask your browser agent to become the rest of your band.
        </p>
        <div className="welcome-actions">
          <button className="btn big-primary" onClick={() => enable(false)} disabled={starting}>
            {starting ? 'Starting…' : '♫ Enable Audio'}
          </button>
          <button className="link-btn" onClick={() => enable(true)} disabled={starting}>
            Enable audio &amp; load an example melody
          </button>
        </div>
        <PromptCard compact />
      </div>
    </div>
  )
}
