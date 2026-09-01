import { humanActions } from '../state/actions'
import { useStudioStore } from '../state/store'

export function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M7 4.5v15c0 .83.94 1.31 1.61.83l10.4-7.5a1.02 1.02 0 0 0 0-1.66L8.61 3.67A1.02 1.02 0 0 0 7 4.5Z" />
    </svg>
  )
}

export function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="5.5" y="5.5" width="13" height="13" rx="2" />
    </svg>
  )
}

export function Transport() {
  const playing = useStudioStore((s) => s.playback.playing)
  const step = useStudioStore((s) => s.playback.step)
  const audioEnabled = useStudioStore((s) => s.audioEnabled)

  return (
    <div className="transport">
      <button
        className={`play-btn ${playing ? 'playing' : ''}`}
        onClick={() => humanActions.togglePlay()}
        title={audioEnabled ? (playing ? 'Stop' : 'Play') : 'Enable audio first'}
        aria-label={playing ? 'Stop playback' : 'Start playback'}
      >
        {playing ? <StopIcon /> : <PlayIcon />}
      </button>
      <div className="step-lights" aria-hidden>
        {Array.from({ length: 16 }, (_, i) => (
          <div
            key={i}
            className={`step-light ${i % 4 === 0 ? 'beat' : ''} ${step === i ? 'active' : ''}`}
          />
        ))}
      </div>
    </div>
  )
}
