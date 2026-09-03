/**
 * Optional product analytics (PostHog) with session replay.
 *
 * Opt-in at build time: when VITE_POSTHOG_KEY is unset — the default for a
 * local checkout — nothing is initialised and every function here is a no-op,
 * so the open-source build stays telemetry-free. See README → "Analytics".
 */
import posthog from 'posthog-js'
import { useStudioStore } from './state/store'

export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'

export interface AnalyticsEnv {
  VITE_POSTHOG_KEY?: string
  VITE_POSTHOG_HOST?: string
}

type Properties = Record<string, unknown>

let enabled = false

export function analyticsEnabled(): boolean {
  return enabled
}

/** Initialise PostHog when a project key is configured. Returns whether analytics are on. */
export function initAnalytics(env: AnalyticsEnv = import.meta.env): boolean {
  if (enabled) return true
  const key = env.VITE_POSTHOG_KEY?.trim()
  if (!key) return false
  posthog.init(key, {
    api_host: env.VITE_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST,
    // Duet has no accounts: keep visitors anonymous rather than creating a person per browser.
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    // Named events cover everything that matters; DOM autocapture would only add noise.
    autocapture: false,
    // Replay is switched on per project in PostHog; inputs (e.g. the song title) are masked.
    session_recording: { maskAllInputs: true },
    sanitize_properties: sanitizeProperties,
  })
  enabled = true
  return true
}

/** Capture a named event. No-op when analytics are off. */
export function track(event: string, properties: Properties = {}): void {
  if (!enabled) return
  posthog.capture(event, properties)
}

/** Attach properties (e.g. the detected WebMCP surface) to every subsequent event. */
export function registerContext(properties: Properties): void {
  if (!enabled) return
  posthog.register(properties)
}

/**
 * Share links carry the entire composition inside the URL fragment. It is the
 * user's own music and not needed for analytics — trim it from every property.
 */
export function sanitizeProperties<T extends Properties>(properties: T): T {
  const out: Properties = { ...properties }
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== 'string') continue
    const i = value.indexOf('#s=')
    if (i !== -1) out[key] = `${value.slice(0, i)}#s=…`
  }
  return out as T
}

/**
 * Mirror the studio's activity timeline — every human and agent action, already
 * summarised in words — as `duet_activity` events. One subscription covers the
 * whole product; entries logged before tracking started are not replayed.
 */
export function startActivityTracking(): () => void {
  const initial = useStudioStore.getState().activity
  let lastId = initial.length ? initial[initial.length - 1].id : -1
  return useStudioStore.subscribe(
    (s) => s.activity,
    (activity) => {
      for (const e of activity) {
        if (e.id <= lastId) continue
        lastId = e.id
        track('duet_activity', { actor: e.actor, message: e.message })
      }
    },
  )
}

export function __resetAnalyticsForTests(): void {
  enabled = false
}
