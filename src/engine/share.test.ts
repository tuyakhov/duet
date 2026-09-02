import { describe, expect, it } from 'vitest'
import { DuetError } from './errors'
import * as ops from './ops'
import { createComposition, exampleMelody } from './session'
import { decodeShare, encodeShare, sharePayloadFromHash, shareUrl } from './share'

function richComposition() {
  let c = createComposition()
  c = ops.setTempo(c, 118).composition
  c = ops.setKeyScale(c, 'Eb', 'minor').composition
  c = ops.replaceNotes(c, 'lead', exampleMelody()).composition
  c = ops.addInstrument(c, 'drums').composition
  c = ops.setDrumSteps(c, 'kick', [0, 4, 8, 12], true).composition
  c = ops.addInstrument(c, 'bass').composition
  c = ops.addNotes(c, 'bass', [{ step: 0, pitch: 'C2', duration: 4, velocity: 0.9 }]).composition
  c = ops.addInstrument(c, 'pad').composition
  c = ops.addChord(c, { step: 0, duration: 16, pitches: ['C3', 'Eb3', 'G3'], velocity: 0.5 }).composition
  c = ops.setMixer(c, 'pad', { volume: 0.4 }).composition
  c = ops.setTitle(c, 'Neon Skyline').composition
  return c
}

describe('share codec', () => {
  it('round-trips a full composition', () => {
    const original = richComposition()
    const decoded = decodeShare(encodeShare(original))
    expect(decoded).toEqual(original)
  })

  it('produces a URL-safe fragment payload', () => {
    const url = shareUrl(richComposition(), 'https://duet.example/')
    expect(url).toMatch(/^https:\/\/duet\.example\/#s=[A-Za-z0-9_-]+$/)
    const payload = sharePayloadFromHash(new URL(url).hash)
    expect(payload).not.toBeNull()
    expect(decodeShare(payload!).title).toBe('Neon Skyline')
  })

  it('excludes anything but the composition', () => {
    const decoded = decodeShare(encodeShare(richComposition()))
    expect(Object.keys(decoded).sort()).toEqual(
      [
        'bass', 'drums', 'instruments', 'key', 'keys', 'lead', 'loopLength',
        'pad', 'scale', 'space', 'swing', 'tempo', 'title',
      ].sort(),
    )
  })

  it('gives old-format links sensible defaults for new fields', () => {
    const c = richComposition()
    const legacy = JSON.parse(JSON.stringify(c)) as Record<string, unknown>
    delete legacy.keys
    delete legacy.swing
    delete legacy.space
    const payload = btoa(JSON.stringify({ v: 1, composition: legacy }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const decoded = decodeShare(payload)
    expect(decoded.keys.notes).toEqual([])
    expect(decoded.swing).toBe(0)
    expect(typeof decoded.space).toBe('number')
  })

  it.each([
    ['not base64 at all', '!!!'],
    ['valid base64, not JSON', btoa('hello world').replace(/=+$/, '')],
    ['JSON but wrong shape', btoa(JSON.stringify({ hello: 1 })).replace(/=+$/, '')],
    ['wrong format version', btoa(JSON.stringify({ v: 99, composition: {} })).replace(/=+$/, '')],
  ])('rejects malformed payloads (%s)', (_label, payload) => {
    try {
      decodeShare(payload)
      expect.fail('expected a DuetError')
    } catch (err) {
      expect(err).toBeInstanceOf(DuetError)
      expect((err as DuetError).code).toBe('SHARE_DATA_INVALID')
    }
  })

  it('rejects tampered musical data', () => {
    const c = richComposition()
    const tampered = {
      v: 1,
      composition: { ...c, lead: { ...c.lead, notes: [{ step: 99, pitch: 'C4', duration: 1, velocity: 1 }] } },
    }
    const payload = btoa(JSON.stringify(tampered)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(() => decodeShare(payload)).toThrowError(/invalid musical data/)
  })

  it('rejects a composition without a lead instrument', () => {
    const c = richComposition()
    const tampered = { v: 1, composition: { ...c, instruments: ['drums'] } }
    const payload = btoa(JSON.stringify(tampered)).replace(/=+$/, '')
    expect(() => decodeShare(payload)).toThrow(DuetError)
  })

  it('ignores non-share hashes', () => {
    expect(sharePayloadFromHash('')).toBeNull()
    expect(sharePayloadFromHash('#other')).toBeNull()
    expect(sharePayloadFromHash('#s=abc$def')).toBeNull()
  })
})
