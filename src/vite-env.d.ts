/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PostHog project API key. Unset → analytics are off (see README → Analytics). */
  readonly VITE_POSTHOG_KEY?: string
  /** PostHog ingestion host, e.g. https://eu.i.posthog.com. Defaults to US cloud. */
  readonly VITE_POSTHOG_HOST?: string
}
