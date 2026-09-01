/**
 * Backend-free sharing: the authored composition is serialized into a
 * versioned base64url payload carried in the URL fragment (#s=...).
 * Activity history, playback position and performance state are excluded.
 */
import { DuetError } from './errors'
import { assertKey, assertScale, assertTempo, validateChord, validateDrumPattern, validateNotes } from './validate'
import { createComposition } from './session'
import { LOOP_LENGTH } from './types'
import type { Composition, InstrumentId } from './types'

export const SHARE_FORMAT_VERSION = 1

interface SharePayload {
  v: number
  composition: Composition
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeShare(composition: Composition): string {
  const payload: SharePayload = { v: SHARE_FORMAT_VERSION, composition }
  return toBase64Url(JSON.stringify(payload))
}

export function shareUrl(composition: Composition, base?: string): string {
  const origin = base ?? (typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '')
  return `${origin}#s=${encodeShare(composition)}`
}

/**
 * Decode and strictly re-validate a shared payload. Malformed or
 * incompatible data raises SHARE_DATA_INVALID rather than importing garbage.
 */
export function decodeShare(encoded: string): Composition {
  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(encoded))
  } catch {
    throw new DuetError('SHARE_DATA_INVALID', 'This share link is malformed and cannot be opened.')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new DuetError('SHARE_DATA_INVALID', 'This share link does not contain a Duet composition.')
  }
  const payload = parsed as Partial<SharePayload>
  if (payload.v !== SHARE_FORMAT_VERSION) {
    throw new DuetError(
      'SHARE_DATA_INVALID',
      `This share link uses format version ${String(payload.v)} — this build of Duet supports version ${SHARE_FORMAT_VERSION}.`,
    )
  }
  const raw = payload.composition as Partial<Composition> | undefined
  if (typeof raw !== 'object' || raw === null) {
    throw new DuetError('SHARE_DATA_INVALID', 'This share link does not contain a composition.')
  }

  // Rebuild onto a fresh composition so missing fields get sane defaults and
  // every musical value passes the same validation as live edits.
  const composition = createComposition()
  try {
    if (typeof raw.title === 'string' && raw.title.trim()) composition.title = raw.title.trim().slice(0, 80)
    composition.tempo = assertTempo(raw.tempo)
    composition.key = assertKey(raw.key)
    composition.scale = assertScale(raw.scale)
    if (raw.loopLength !== LOOP_LENGTH) {
      throw new DuetError('SHARE_DATA_INVALID', 'Unsupported loop length.')
    }
    if (!Array.isArray(raw.instruments) || !raw.instruments.includes('lead')) {
      throw new DuetError('SHARE_DATA_INVALID', 'Composition has no lead instrument.')
    }
    const seen = new Set<string>()
    for (const id of raw.instruments) {
      if (!['lead', 'drums', 'bass', 'pad'].includes(id as string) || seen.has(id as string)) {
        throw new DuetError('SHARE_DATA_INVALID', `Invalid instrument list.`)
      }
      seen.add(id as string)
    }
    composition.instruments = raw.instruments as InstrumentId[]
    composition.lead.notes = validateNotes(raw.lead?.notes ?? [])
    composition.bass.notes = validateNotes(raw.bass?.notes ?? [])
    composition.drums.pattern = validateDrumPattern(raw.drums?.pattern ?? {})
    const chords = raw.pad?.chords ?? []
    if (!Array.isArray(chords)) throw new DuetError('SHARE_DATA_INVALID', 'Invalid pad chords.')
    composition.pad.chords = chords.map((ch) => validateChord(ch))
    for (const id of ['lead', 'bass', 'drums', 'pad'] as const) {
      const track = raw[id]
      if (track?.preset && typeof track.preset === 'string') composition[id].preset = track.preset
      const mixer = track?.mixer
      if (mixer && typeof mixer.volume === 'number' && mixer.volume >= 0 && mixer.volume <= 1) {
        composition[id].mixer.volume = mixer.volume
      }
      if (mixer && typeof mixer.muted === 'boolean') composition[id].mixer.muted = mixer.muted
    }
  } catch (err) {
    if (err instanceof DuetError && err.code === 'SHARE_DATA_INVALID') throw err
    throw new DuetError(
      'SHARE_DATA_INVALID',
      `This share link contains invalid musical data${err instanceof Error ? ` (${err.message})` : ''}.`,
    )
  }
  return composition
}

/** Extract the share payload from a URL hash like "#s=...", or null. */
export function sharePayloadFromHash(hash: string): string | null {
  const m = /^#s=([A-Za-z0-9_-]+)$/.exec(hash)
  return m ? m[1] : null
}
