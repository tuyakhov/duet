import { useEffect, useState } from 'react'
import { KEYS, SCALE_NAMES } from '../engine/types'
import { humanActions } from '../state/actions'
import { useStudioStore } from '../state/store'

export function TopBar({ onReset, savedAt }: { onReset: () => void; savedAt: number | null }) {
  const title = useStudioStore((s) => s.composition.title)
  const tempo = useStudioStore((s) => s.composition.tempo)
  const musicalKey = useStudioStore((s) => s.composition.key)
  const scale = useStudioStore((s) => s.composition.scale)
  const swing = useStudioStore((s) => s.composition.swing)
  const space = useStudioStore((s) => s.composition.space)
  const mode = useStudioStore((s) => s.mode)
  const undoDepth = useStudioStore((s) => s.undoDepth)
  const requestPublish = useStudioStore((s) => s.requestPublish)
  const pendingPublish = useStudioStore((s) => s.pendingPublish)

  const [draftTitle, setDraftTitle] = useState(title)
  useEffect(() => setDraftTitle(title), [title])

  const commitTitle = () => {
    if (draftTitle.trim() && draftTitle.trim() !== title) humanActions.setTitle(draftTitle)
    else setDraftTitle(title)
  }

  return (
    <header className="topbar">
      <div className="logo" title="Duet">
        <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden>
          <rect x="10" y="30" width="7" height="16" rx="3.5" fill="#0a84ff" opacity="0.55" />
          <rect x="21" y="20" width="7" height="26" rx="3.5" fill="#0a84ff" opacity="0.75" />
          <rect x="32" y="12" width="7" height="34" rx="3.5" fill="#0a84ff" />
          <rect x="43" y="24" width="7" height="22" rx="3.5" fill="#0a84ff" opacity="0.75" />
        </svg>
        Duet
      </div>

      <input
        className="song-title-input"
        value={draftTitle}
        onChange={(e) => setDraftTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label="Song title"
        disabled={mode === 'performance'}
      />
      {savedAt !== null && (
        <span className="saved-chip" key={savedAt} title="Session autosaved to this browser">
          ✓ saved
        </span>
      )}

      <div className="topbar-controls">
        <div className="control-cluster" title="Tempo">
          <label>BPM</label>
          <button className="stepper-btn" onClick={() => humanActions.setTempo(tempo - 2)} disabled={mode === 'performance'}>
            −
          </button>
          <span className="tempo-value">{tempo}</span>
          <button className="stepper-btn" onClick={() => humanActions.setTempo(tempo + 2)} disabled={mode === 'performance'}>
            +
          </button>
        </div>

        <div className="control-cluster" title="Key and scale — changing key transposes all notes">
          <label>KEY</label>
          <select
            className="select"
            value={musicalKey}
            onChange={(e) => humanActions.setKey(e.target.value)}
            disabled={mode === 'performance'}
            aria-label="Key"
          >
            {KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={scale}
            onChange={(e) => humanActions.setScale(e.target.value)}
            disabled={mode === 'performance'}
            aria-label="Scale"
          >
            {SCALE_NAMES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="control-cluster" title={`Swing ${Math.round(swing * 100)}% · Space ${Math.round(space * 100)}%`}>
          <label>SWING</label>
          <input
            type="range"
            className="volume-slider groove-slider"
            min={0}
            max={0.6}
            step={0.05}
            value={swing}
            onChange={(e) => humanActions.setSwing(Number(e.target.value))}
            disabled={mode === 'performance'}
            aria-label="Swing"
          />
          <label>SPACE</label>
          <input
            type="range"
            className="volume-slider groove-slider"
            min={0}
            max={1}
            step={0.05}
            value={space}
            onChange={(e) => humanActions.setSpace(Number(e.target.value))}
            disabled={mode === 'performance'}
            aria-label="Reverb space"
          />
        </div>

        <div className="mode-toggle" role="tablist" aria-label="Studio mode">
          <button
            role="tab"
            aria-selected={mode === 'compose'}
            className={mode === 'compose' ? 'active compose' : ''}
            onClick={() => humanActions.setMode('compose')}
          >
            Compose
          </button>
          <button
            role="tab"
            aria-selected={mode === 'performance'}
            className={mode === 'performance' ? 'active performance' : ''}
            onClick={() => humanActions.setMode('performance')}
          >
            Perform
          </button>
        </div>

        <button
          className="icon-btn"
          onClick={() => humanActions.undo()}
          disabled={undoDepth === 0 || mode === 'performance'}
          title="Undo the last edit"
        >
          ↶ Undo
        </button>
        <button className="icon-btn danger" onClick={onReset} title="Start a fresh session">
          Reset
        </button>
        <button
          className="icon-btn primary"
          disabled={pendingPublish !== null}
          onClick={() => {
            void requestPublish(title, 'human').catch(() => {})
          }}
          title="Create a shareable remix link"
        >
          Share
        </button>
      </div>
    </header>
  )
}
