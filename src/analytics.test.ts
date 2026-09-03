import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('posthog-js', () => ({
  default: { init: vi.fn(), capture: vi.fn(), register: vi.fn() },
}))

import posthog from 'posthog-js'
import {
  __resetAnalyticsForTests,
  DEFAULT_POSTHOG_HOST,
  initAnalytics,
  registerContext,
  sanitizeProperties,
  startActivityTracking,
  track,
} from './analytics'
import * as ops from './engine/ops'
import { __resetStoreForTests, useStudioStore } from './state/store'

const mocked = posthog as unknown as { init: Mock; capture: Mock; register: Mock }
const activityEvents = () => mocked.capture.mock.calls.filter(([name]) => name === 'duet_activity')

beforeEach(() => {
  __resetStoreForTests()
  __resetAnalyticsForTests()
  vi.clearAllMocks()
})

describe('analytics opt-in', () => {
  it('stays off without a project key, and every call is a no-op', () => {
    expect(initAnalytics({})).toBe(false)
    track('anything', { a: 1 })
    registerContext({ b: 2 })
    expect(mocked.init).not.toHaveBeenCalled()
    expect(mocked.capture).not.toHaveBeenCalled()
    expect(mocked.register).not.toHaveBeenCalled()
  })

  it('initialises PostHog with the key, the default host and replay-safe settings', () => {
    expect(initAnalytics({ VITE_POSTHOG_KEY: 'phc_test' })).toBe(true)
    expect(mocked.init).toHaveBeenCalledTimes(1)
    const [key, options] = mocked.init.mock.calls[0]
    expect(key).toBe('phc_test')
    expect(options.api_host).toBe(DEFAULT_POSTHOG_HOST)
    expect(options.autocapture).toBe(false)
    expect(options.session_recording.maskAllInputs).toBe(true)
    expect(options.sanitize_properties).toBe(sanitizeProperties)
  })

  it('honours a custom host (EU cloud or self-hosted)', () => {
    initAnalytics({ VITE_POSTHOG_KEY: 'phc_test', VITE_POSTHOG_HOST: 'https://eu.i.posthog.com' })
    expect(mocked.init.mock.calls[0][1].api_host).toBe('https://eu.i.posthog.com')
  })

  it('treats a blank key as unset', () => {
    expect(initAnalytics({ VITE_POSTHOG_KEY: '   ' })).toBe(false)
    expect(mocked.init).not.toHaveBeenCalled()
  })

  it('initialises only once', () => {
    initAnalytics({ VITE_POSTHOG_KEY: 'phc_test' })
    expect(initAnalytics({ VITE_POSTHOG_KEY: 'phc_test' })).toBe(true)
    expect(mocked.init).toHaveBeenCalledTimes(1)
  })
})

describe('events', () => {
  // Every subscription is torn down after each test so a failing assertion can't leak it.
  let stop: (() => void) | null = null
  const startTracking = () => (stop = startActivityTracking())

  beforeEach(() => {
    initAnalytics({ VITE_POSTHOG_KEY: 'phc_test' })
  })
  afterEach(() => {
    stop?.()
    stop = null
  })

  it('forwards track() and registerContext() to PostHog', () => {
    track('tool_called', { tool: 'drums_edit', ok: true })
    registerContext({ webmcp_surface: 'document' })
    expect(mocked.capture).toHaveBeenCalledWith('tool_called', { tool: 'drums_edit', ok: true })
    expect(mocked.register).toHaveBeenCalledWith({ webmcp_surface: 'document' })
  })

  it('captures every new activity entry with its actor, human or agent', () => {
    startTracking()
    useStudioStore.getState().apply('agent', (c) => ops.addInstrument(c, 'drums'))
    useStudioStore.getState().apply('human', (c) => ops.addInstrument(c, 'bass'))
    const events = activityEvents()
    expect(events.map(([, p]) => p.actor)).toEqual(['agent', 'human'])
    expect(events[0][1].message).toMatch(/drum/i)
    expect(events[1][1].message).toMatch(/bass/i)
  })

  it('does not replay activity that happened before tracking started', () => {
    useStudioStore.getState().apply('human', (c) => ops.addInstrument(c, 'bass'))
    startTracking()
    expect(activityEvents()).toHaveLength(0)
    useStudioStore.getState().apply('human', (c) => ops.addInstrument(c, 'pad'))
    expect(activityEvents()).toHaveLength(1)
  })

  it('stops capturing once unsubscribed', () => {
    startTracking()
    stop?.()
    useStudioStore.getState().apply('human', (c) => ops.addInstrument(c, 'keys'))
    expect(activityEvents()).toHaveLength(0)
  })
})

describe('sanitizeProperties', () => {
  it('strips the composition payload from share URLs and leaves everything else alone', () => {
    const out = sanitizeProperties({ $current_url: 'https://duet.app/#s=eyJ2IjoxfQ', $pathname: '/', n: 3 })
    expect(out.$current_url).toBe('https://duet.app/#s=…')
    expect(out.$pathname).toBe('/')
    expect(out.n).toBe(3)
  })
})
