import { useEffect, useRef, useState } from 'react'
import { ActivityTimeline } from './components/ActivityTimeline'
import { CapabilityPanel } from './components/CapabilityPanel'
import { Celebration } from './components/Celebration'
import { InstrumentRack } from './components/InstrumentRack'
import { PerformanceView } from './components/PerformanceView'
import { PromptCard } from './components/PromptCard'
import { PublishModal } from './components/PublishModal'
import { ShareErrorView, ShareView } from './components/ShareView'
import { TopBar } from './components/TopBar'
import { TrackCard } from './components/TrackCard'
import { Transport } from './components/Transport'
import { WelcomeOverlay } from './components/WelcomeOverlay'
import { audioEngine } from './audio/engine'
import { DuetError } from './engine/errors'
import { decodeShare, sharePayloadFromHash } from './engine/share'
import type { Composition } from './engine/types'
import { humanActions, onToast } from './state/actions'
import { clearStorage, hydrateFromStorage, saveToStorage, useStudioStore } from './state/store'

type BootState =
  | { kind: 'studio' }
  | { kind: 'share'; composition: Composition }
  | { kind: 'shareError'; message: string }

function boot(): BootState {
  const payload = sharePayloadFromHash(window.location.hash)
  if (payload) {
    try {
      return { kind: 'share', composition: decodeShare(payload) }
    } catch (err) {
      return {
        kind: 'shareError',
        message: err instanceof DuetError ? err.message : 'This share link could not be opened.',
      }
    }
  }
  return { kind: 'studio' }
}

export default function App() {
  // boot() is pure (decode only) — store mutations happen in the mount
  // effect below, never during render.
  const [bootState] = useState<BootState>(boot)
  const [view, setView] = useState<'studio' | 'share' | 'shareError'>(
    bootState.kind === 'studio' ? 'studio' : bootState.kind,
  )

  const bootApplied = useRef(false)
  useEffect(() => {
    if (bootApplied.current) return
    bootApplied.current = true
    if (bootState.kind === 'share') {
      useStudioStore.getState().loadComposition(bootState.composition, 'system', 'opened a shared duet')
    }
  }, [bootState])

  const mode = useStudioStore((s) => s.mode)
  const audioEnabled = useStudioStore((s) => s.audioEnabled)
  const instruments = useStudioStore((s) => s.composition.instruments)
  const [welcomeDone, setWelcomeDone] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)

  // Validation errors from human gestures surface as a toast.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const off = onToast((message) => {
      setToast(message)
      clearTimeout(timer)
      timer = setTimeout(() => setToast(null), 3600)
    })
    return () => {
      off()
      clearTimeout(timer)
    }
  }, [])

  // Autosave the authored session — but never while previewing a shared link.
  // The composition object is replaced immutably on real edits, so reference
  // equality keeps this from firing on playhead ticks and other noise.
  const [savedAt, setSavedAt] = useState<number | null>(null)
  useEffect(() => {
    if (view !== 'studio') return
    return useStudioStore.subscribe(
      (s) => ({ sessionId: s.sessionId, composition: s.composition }),
      (snapshot) => {
        saveToStorage(snapshot)
        setSavedAt(Date.now())
      },
      {
        equalityFn: (a, b) => a.sessionId === b.sessionId && a.composition === b.composition,
      },
    )
  }, [view])

  // Space bar toggles playback (unless the human is typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return
      e.preventDefault()
      humanActions.togglePlay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The whole room changes with the mode.
  useEffect(() => {
    document.body.classList.toggle('mode-performance', mode === 'performance')
    return () => document.body.classList.remove('mode-performance')
  }, [mode])

  if (view === 'shareError') {
    return (
      <ShareErrorView
        message={(bootState as { message: string }).message}
        onDismiss={() => {
          window.history.replaceState(null, '', window.location.pathname)
          hydrateFromStorage()
          setView('studio')
        }}
      />
    )
  }

  if (view === 'share' && bootState.kind === 'share') {
    return (
      <ShareView
        composition={bootState.composition}
        onRemix={() => {
          window.history.replaceState(null, '', window.location.pathname)
          audioEngine.stop('system')
          useStudioStore.getState().logActivity('human', 'remixed this duet into their own session')
          setView('studio')
        }}
      />
    )
  }

  return (
    <div className="shell">
      <TopBar onReset={() => setConfirmingReset(true)} savedAt={savedAt} />
      <div className="studio">
        <main className="studio-main">
          {mode === 'compose' ? (
            <>
              <Transport />
              <div className="track-stack">
                {instruments.map((id) => (
                  <TrackCard key={id} id={id} />
                ))}
              </div>
              <InstrumentRack />
            </>
          ) : (
            <PerformanceView />
          )}
        </main>
        <aside className="studio-side">
          <CapabilityPanel />
          {mode === 'compose' && <PromptCard />}
          <ActivityTimeline />
        </aside>
      </div>

      {!audioEnabled && !welcomeDone && <WelcomeOverlay onDone={() => setWelcomeDone(true)} />}
      <PublishModal />
      <Celebration />

      {confirmingReset && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Confirm reset">
          <div className="modal">
            <h2>Start over?</h2>
            <p>
              This clears the whole session — melody, drums, bass, pads, everything you and your agent made.
              There is no way back.
            </p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmingReset(false)}>
                Keep playing
              </button>
              <button
                className="btn approve"
                style={{ background: 'var(--danger)', color: '#fff' }}
                onClick={() => {
                  audioEngine.stop('system')
                  useStudioStore.getState().resetSession()
                  clearStorage()
                  setConfirmingReset(false)
                }}
              >
                Reset session
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
