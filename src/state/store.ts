/**
 * The shared studio store. Human UI actions, WebMCP tool handlers and tests
 * all mutate the session through the same `apply` entry point, so the state
 * an agent reads is always exactly the state the human sees.
 */
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { DuetError } from '../engine/errors'
import type { OpResult } from '../engine/ops'
import { createSession, deepCloneComposition, newSessionId } from '../engine/session'
import { shareUrl } from '../engine/share'
import type {
  Actor,
  ActivityEntry,
  Composition,
  InstrumentId,
  Mode,
  MutationReport,
  SessionState,
} from '../engine/types'

const UNDO_LIMIT = 64
const ACTIVITY_LIMIT = 120
const STORAGE_KEY = 'duet.session.v1'

export interface Highlight {
  actor: Actor
  steps: number[]
  seq: number
}

export interface PendingPublish {
  suggestedTitle: string
  requestedBy: Actor
}

/** A contract-gated agent edit paused for the human's decision. */
export interface PendingEditApproval {
  title: string
  /** Human-readable description of exactly what the agent wants to change. */
  description: string
}

export interface PublishOutcome {
  approved: boolean
  title?: string
  url?: string
}

export interface PublishCelebration {
  title: string
  url: string
}

export interface StudioState extends SessionState {
  highlights: Partial<Record<InstrumentId | 'session', Highlight>>
  undoDepth: number
  pendingPublish: PendingPublish | null
  pendingEdit: PendingEditApproval | null
  celebration: PublishCelebration | null

  /** Run a composition mutation as `actor`. Throws DuetError on invalid input. */
  apply: (actor: Actor, fn: (c: Composition) => OpResult) => MutationReport
  undo: (actor: Actor) => boolean
  setMode: (mode: Mode, actor: Actor) => void
  setEnergy: (energy: number, actor: Actor) => void
  launchBreakdown: (actor: Actor) => void
  breakdownUntil: number
  setPlayback: (playing: boolean, actor: Actor) => void
  setPlayheadStep: (step: number, bar?: number) => void
  /** Pause a contract-gated agent edit until the human approves or declines. */
  requestEditApproval: (request: PendingEditApproval) => Promise<boolean>
  resolveEditApproval: (approved: boolean) => void
  setAudioEnabled: (enabled: boolean) => void
  setSelection: (instrument: InstrumentId | null, steps: number[]) => void
  logActivity: (actor: Actor, message: string) => void
  requestPublish: (suggestedTitle: string, requestedBy: Actor) => Promise<PublishOutcome>
  resolvePublish: (approvedTitle: string | null) => void
  dismissCelebration: () => void
  resetSession: () => void
  loadComposition: (composition: Composition, actor: Actor, message: string) => void
}

let activityId = 1
let highlightSeq = 1
let publishResolver: ((outcome: PublishOutcome) => void) | null = null
let editApprovalResolver: ((approved: boolean) => void) | null = null
const undoStack: Composition[] = []

function entry(actor: Actor, message: string): ActivityEntry {
  return { id: activityId++, actor, message, at: Date.now() }
}

function pushActivity(list: ActivityEntry[], e: ActivityEntry): ActivityEntry[] {
  const next = [...list, e]
  return next.length > ACTIVITY_LIMIT ? next.slice(next.length - ACTIVITY_LIMIT) : next
}

export const useStudioStore = create<StudioState>()(
  subscribeWithSelector((set, get) => ({
    ...createSession(),
    highlights: {},
    undoDepth: 0,
    pendingPublish: null,
    pendingEdit: null,
    celebration: null,
    breakdownUntil: 0,

    apply: (actor, fn) => {
      const state = get()
      const before = state.composition
      const { composition, report } = fn(before)
      undoStack.push(deepCloneComposition(before))
      if (undoStack.length > UNDO_LIMIT) undoStack.shift()
      const highlights = { ...state.highlights }
      for (const track of report.changedTracks) {
        highlights[track] = { actor, steps: report.changedSteps, seq: highlightSeq++ }
      }
      set({
        composition,
        version: state.version + 1,
        activity: pushActivity(state.activity, entry(actor, report.summary)),
        highlights,
        undoDepth: undoStack.length,
      })
      return report
    },

    undo: (actor) => {
      const previous = undoStack.pop()
      if (!previous) return false
      const state = get()
      set({
        composition: previous,
        version: state.version + 1,
        activity: pushActivity(state.activity, entry(actor, 'undid the last edit')),
        undoDepth: undoStack.length,
      })
      return true
    },

    setMode: (mode, actor) => {
      const state = get()
      if (state.mode === mode) return
      set({
        mode,
        version: state.version + 1,
        activity: pushActivity(
          state.activity,
          entry(actor === 'agent' ? 'agent' : 'system', mode === 'performance' ? 'entered Performance mode' : 'returned to Compose mode'),
        ),
      })
    },

    setEnergy: (energy, actor) => {
      const state = get()
      set({
        energy,
        version: state.version + 1,
        activity: pushActivity(state.activity, entry(actor, `set energy to ${Math.round(energy * 100)}%`)),
      })
    },

    launchBreakdown: (actor) => {
      const state = get()
      set({
        breakdownUntil: Date.now() + 4000,
        version: state.version + 1,
        activity: pushActivity(state.activity, entry(actor, 'launched a breakdown — drums and bass drop out for one pass')),
      })
    },

    setPlayback: (playing, actor) => {
      const state = get()
      if (state.playback.playing === playing) return
      set({
        playback: { playing, step: playing ? state.playback.step : -1, bar: playing ? state.playback.bar : -1 },
        activity: pushActivity(state.activity, entry(actor, playing ? 'started playback' : 'stopped playback')),
      })
    },

    setPlayheadStep: (step, bar = -1) => {
      // Ignore draw callbacks that land after playback stopped.
      set((s) => (s.playback.playing || step === -1 ? { playback: { ...s.playback, step, bar } } : s))
    },

    requestEditApproval: (request) => {
      if (get().pendingEdit) {
        return Promise.reject(
          new DuetError('PUBLISH_PENDING', 'Another agent edit is already awaiting the human.'),
        )
      }
      set({
        pendingEdit: request,
        activity: pushActivity(
          get().activity,
          entry('agent', `asked permission: ${request.title.toLowerCase()}`),
        ),
      })
      return new Promise<boolean>((resolve) => {
        editApprovalResolver = resolve
      })
    },

    resolveEditApproval: (approved) => {
      const state = get()
      if (!state.pendingEdit) return
      const resolver = editApprovalResolver
      editApprovalResolver = null
      set({
        pendingEdit: null,
        activity: pushActivity(
          state.activity,
          entry('human', approved ? 'approved the agent’s melody change' : 'declined the agent’s melody change'),
        ),
      })
      resolver?.(approved)
    },

    setAudioEnabled: (enabled) => {
      const state = get()
      if (state.audioEnabled === enabled) return
      set({
        audioEnabled: enabled,
        activity: enabled
          ? pushActivity(state.activity, entry('system', 'audio engine enabled'))
          : state.activity,
      })
    },

    setSelection: (instrument, steps) => {
      set({ selection: { instrument, steps } })
    },

    logActivity: (actor, message) => {
      set((s) => ({ activity: pushActivity(s.activity, entry(actor, message)) }))
    },

    requestPublish: (suggestedTitle, requestedBy) => {
      if (get().pendingPublish) {
        return Promise.reject(new DuetError('PUBLISH_PENDING', 'A publish request is already awaiting the human.'))
      }
      set({
        pendingPublish: { suggestedTitle, requestedBy },
        activity: pushActivity(
          get().activity,
          entry(requestedBy, `requested to publish “${suggestedTitle}” — waiting for the human to approve`),
        ),
      })
      return new Promise<PublishOutcome>((resolve) => {
        publishResolver = resolve
      })
    },

    resolvePublish: (approvedTitle) => {
      const state = get()
      const pending = state.pendingPublish
      if (!pending) return
      const resolver = publishResolver
      publishResolver = null
      if (approvedTitle === null) {
        set({
          pendingPublish: null,
          activity: pushActivity(state.activity, entry('human', 'declined the publish request')),
        })
        resolver?.({ approved: false })
        return
      }
      const title = approvedTitle.trim() || pending.suggestedTitle
      let composition = state.composition
      let version = state.version
      let activity = state.activity
      if (title !== state.composition.title) {
        composition = { ...deepCloneComposition(state.composition), title }
        version += 1
        activity = pushActivity(activity, entry('human', `renamed the song to “${title}”`))
      }
      const url = shareUrl(composition)
      set({
        composition,
        version,
        pendingPublish: null,
        celebration: { title, url },
        activity: pushActivity(activity, entry('human', `approved publishing “${title}”`)),
      })
      resolver?.({ approved: true, title, url })
    },

    dismissCelebration: () => set({ celebration: null }),

    resetSession: () => {
      undoStack.length = 0
      publishResolver?.({ approved: false })
      publishResolver = null
      editApprovalResolver?.(false)
      editApprovalResolver = null
      const fresh = createSession()
      set({
        ...fresh,
        audioEnabled: get().audioEnabled,
        highlights: {},
        undoDepth: 0,
        pendingPublish: null,
        pendingEdit: null,
        celebration: null,
        breakdownUntil: 0,
        activity: [entry('system', 'started a fresh session')],
      })
    },

    loadComposition: (composition, actor, message) => {
      undoStack.length = 0
      const state = get()
      set({
        sessionId: newSessionId(),
        composition: deepCloneComposition(composition),
        version: state.version + 1,
        mode: 'compose',
        highlights: {},
        undoDepth: 0,
        activity: pushActivity(state.activity, entry(actor, message)),
      })
    },
  })),
)

// ------------------------------------------------------------- persistence

interface SavedSession {
  sessionId: string
  composition: Composition
}

export function saveToStorage(state: Pick<StudioState, 'sessionId' | 'composition'>) {
  try {
    const saved: SavedSession = { sessionId: state.sessionId, composition: state.composition }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  } catch {
    // Storage full or unavailable — autosave is best-effort.
  }
}

/**
 * Restore the autosaved session (if any) into the store. Merges onto fresh
 * defaults so sessions saved by older builds gain new fields. Must be called
 * outside React rendering (e.g. before the root renders).
 */
export function hydrateFromStorage(): boolean {
  const saved = loadFromStorage()
  if (!saved) return false
  const base = createSession().composition
  const composition = { ...base, ...saved.composition }
  for (const id of ['lead', 'keys', 'bass', 'drums', 'pad'] as const) {
    if (!composition[id]) (composition as Record<string, unknown>)[id] = base[id]
  }
  useStudioStore.setState({ sessionId: saved.sessionId, composition })
  useStudioStore.getState().logActivity('system', 'restored your session from autosave')
  return true
}

export function loadFromStorage(): SavedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedSession
    if (!parsed || typeof parsed !== 'object' || !parsed.composition) return null
    return parsed
  } catch {
    return null
  }
}

export function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** Test-only helper: wipe module-level undo/publish bookkeeping. */
export function __resetStoreForTests() {
  undoStack.length = 0
  publishResolver = null
  editApprovalResolver = null
  const fresh = createSession()
  useStudioStore.setState({
    ...fresh,
    highlights: {},
    undoDepth: 0,
    pendingPublish: null,
    pendingEdit: null,
    celebration: null,
    breakdownUntil: 0,
  })
}
