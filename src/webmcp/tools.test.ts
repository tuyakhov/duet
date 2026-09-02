import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DuetError } from '../engine/errors'
import * as ops from '../engine/ops'
import { exampleMelody } from '../engine/session'
import { __resetStoreForTests, useStudioStore } from '../state/store'

// The audio engine pulls in Tone.js, which needs a real AudioContext —
// tools are tested against a fake engine that honors the enable-gate.
vi.mock('../audio/engine', () => {
  const fake = {
    enabled: false,
    playing: false,
    play: vi.fn(function (this: void) {
      if (!fake.enabled) {
        throw new DuetError('AUDIO_PERMISSION_REQUIRED', 'Audio is not enabled yet.')
      }
      fake.playing = true
    }),
    stop: vi.fn(() => {
      fake.playing = false
    }),
  }
  return { audioEngine: fake }
})

import { audioEngine } from '../audio/engine'
import { baseComposeTools, buildSessionSnapshot, computeToolNames, computeTools } from './tools'

const fakeAudio = audioEngine as unknown as { enabled: boolean; playing: boolean }

beforeEach(() => {
  __resetStoreForTests()
  fakeAudio.enabled = false
  fakeAudio.playing = false
})

const store = () => useStudioStore.getState()

async function call(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const tool = computeTools().find((t) => t.name === name)
  if (!tool) throw new Error(`tool ${name} is not active`)
  return (await tool.execute(args, {})) as Record<string, unknown>
}

async function callExpectingError(name: string, args: Record<string, unknown> = {}): Promise<DuetError> {
  const tool = computeTools().find((t) => t.name === name)
  if (!tool) throw new Error(`tool ${name} is not active`)
  try {
    await tool.execute(args, {})
  } catch (err) {
    expect(err).toBeInstanceOf(DuetError)
    return err as DuetError
  }
  throw new Error('expected the tool to throw')
}

describe('dynamic compose toolset', () => {
  it('starts with base tools plus lead_edit only', () => {
    const names = computeTools().map((t) => t.name)
    expect(names).toContain('studio_get_session')
    expect(names).toContain('studio_publish')
    expect(names).toContain('lead_edit')
    expect(names).not.toContain('drums_edit')
    expect(names).not.toContain('bass_edit')
    expect(names).not.toContain('pad_edit')
    expect(names).not.toContain('performance_play')
  })

  it('adding an instrument exposes its tool; removing withdraws it', async () => {
    const res = await call('studio_add_instrument', { instrument: 'drums' })
    expect(res.ok).toBe(true)
    expect(res.newToolAvailable).toBe('drums_edit')
    expect(computeTools().map((t) => t.name)).toContain('drums_edit')

    await call('studio_remove_instrument', { instrument: 'drums' })
    expect(computeTools().map((t) => t.name)).not.toContain('drums_edit')
  })

  it('computeToolNames matches computeTools for every rack shape', async () => {
    expect(computeToolNames(store())).toEqual(computeTools().map((t) => t.name))
    await call('studio_add_instrument', { instrument: 'bass' })
    await call('studio_add_instrument', { instrument: 'pad' })
    await call('studio_add_instrument', { instrument: 'keys' })
    expect(computeToolNames(store())).toEqual(computeTools().map((t) => t.name))
  })

  it('keys brings keys_edit, which edits notes like any melodic track', async () => {
    const res = await call('studio_add_instrument', { instrument: 'keys' })
    expect(res.newToolAvailable).toBe('keys_edit')
    await call('keys_edit', { op: 'add_notes', notes: [{ step: 0, pitch: 'C3', duration: 2 }] })
    expect(store().composition.keys.notes).toHaveLength(1)
    await call('keys_edit', { op: 'set_preset', preset: 'organ' })
    expect(store().composition.keys.preset).toBe('organ')
    await call('studio_remove_instrument', { instrument: 'keys' })
    expect(computeTools().map((t) => t.name)).not.toContain('keys_edit')
  })

  it('studio_set_key transposes by default and can be told not to', async () => {
    await call('lead_edit', { op: 'add_notes', notes: [{ step: 0, pitch: 'C4' }] })
    await call('studio_set_key', { key: 'D' })
    expect(store().composition.lead.notes[0].pitch).toBe('D4')
    await call('studio_set_key', { key: 'E', transposeExisting: false })
    expect(store().composition.lead.notes[0].pitch).toBe('D4')
  })

  it('studio_set_groove sets swing and space with validation', async () => {
    await call('studio_set_groove', { swing: 0.3, space: 0.6 })
    expect(store().composition.swing).toBe(0.3)
    expect(store().composition.space).toBe(0.6)
    const err = await callExpectingError('studio_set_groove', { swing: 0.9 })
    expect(err.code).toBe('INVALID_INPUT')
  })
})

describe('compose ↔ performance transition', () => {
  it('entering performance replaces the entire toolset', async () => {
    await call('studio_enter_performance')
    const names = computeTools().map((t) => t.name)
    expect(names).toEqual([
      'performance_get_state',
      'performance_play',
      'performance_stop',
      'performance_set_energy',
      'performance_set_track_mix',
      'performance_launch_breakdown',
      'performance_return_to_compose',
    ])
    await call('performance_return_to_compose')
    expect(computeTools().map((t) => t.name)).toContain('studio_get_session')
  })

  it('compose tools are mode-guarded even if somehow invoked in performance', async () => {
    const addInstrument = computeTools().find((t) => t.name === 'studio_add_instrument')!
    store().setMode('performance', 'system')
    try {
      await addInstrument.execute({ instrument: 'drums' }, {})
      expect.fail('expected WRONG_MODE')
    } catch (err) {
      expect((err as DuetError).code).toBe('WRONG_MODE')
    }
  })

  it('performance tools are mode-guarded in compose', async () => {
    store().setMode('performance', 'system')
    const play = computeTools().find((t) => t.name === 'performance_play')!
    store().setMode('compose', 'system')
    try {
      await play.execute({}, {})
      expect.fail('expected WRONG_MODE')
    } catch (err) {
      expect((err as DuetError).code).toBe('WRONG_MODE')
    }
  })
})

describe('studio_get_session', () => {
  it('returns the exact unsaved human melody and structured metadata', async () => {
    store().apply('human', (c) => ops.replaceNotes(c, 'lead', exampleMelody()))
    const res = await call('studio_get_session')
    const session = res.session as ReturnType<typeof buildSessionSnapshot>
    expect(session.tracks.lead?.notes).toEqual(exampleMelody().sort((a, b) => a.step - b.step))
    expect(session.tempo).toBe(104)
    expect(session.key).toBe('C')
    expect(session.instrumentsPresent).toEqual(['lead'])
    expect(session.instrumentsAvailableToAdd).toEqual(['keys', 'drums', 'bass', 'pad'])
    expect(session.tracks.drums).toBeNull()
    expect(res.sessionVersion).toBe(store().version)
  })

  it('reflects human edits made after the previous read', async () => {
    store().apply('human', (c) => ops.replaceNotes(c, 'lead', exampleMelody()))
    const before = (await call('studio_get_session')).session as { tracks: { lead: { notes: unknown[] } } }
    store().apply('human', (c) => ops.patchNotesAtSteps(c, 'lead', [2], { pitch: 'F4' }))
    const after = (await call('studio_get_session')).session as {
      tracks: { lead: { notes: { step: number; pitch: string }[] } }
    }
    expect(before.tracks.lead.notes).not.toEqual(after.tracks.lead.notes)
    expect(after.tracks.lead.notes.find((n) => n.step === 2)?.pitch).toBe('F4')
  })
})

describe('instrument editing tools', () => {
  it('drums_edit programs a pattern and reports hits', async () => {
    await call('studio_add_instrument', { instrument: 'drums' })
    const kick = Array.from({ length: 16 }, (_, i) => i % 4 === 0)
    const hats = Array.from({ length: 16 }, (_, i) => i % 2 === 0)
    const res = await call('drums_edit', { op: 'replace_pattern', pattern: { kick, hatClosed: hats } })
    expect(res.ok).toBe(true)
    expect(res.message).toContain('12 drum hits')
    expect(store().composition.drums.pattern.kick.filter(Boolean)).toHaveLength(4)
  })

  it('bass_edit adds notes through the same store the human sees', async () => {
    await call('studio_add_instrument', { instrument: 'bass' })
    await call('bass_edit', { op: 'add_notes', notes: [{ step: 0, pitch: 'C2', duration: 4, velocity: 0.9 }] })
    expect(store().composition.bass.notes).toHaveLength(1)
    expect(store().highlights.bass?.actor).toBe('agent')
  })

  it('pad_edit writes chords', async () => {
    await call('studio_add_instrument', { instrument: 'pad' })
    await call('pad_edit', {
      op: 'replace_chords',
      chords: [
        { step: 0, duration: 8, pitches: ['C3', 'Eb3', 'G3'], velocity: 0.5 },
        { step: 8, duration: 8, pitches: ['Ab2', 'C3', 'Eb3'], velocity: 0.5 },
      ],
    })
    expect(store().composition.pad.chords).toHaveLength(2)
  })

  it('surfaces validation failures with codes', async () => {
    const err = await callExpectingError('lead_edit', {
      op: 'add_notes',
      notes: [{ step: 99, pitch: 'C4' }],
    })
    expect(err.code).toBe('INVALID_STEP')
  })

  it('rejects unknown ops', async () => {
    const err = await callExpectingError('lead_edit', { op: 'destroy_everything' })
    expect(err.code).toBe('INVALID_INPUT')
  })
})

describe('performance tools', () => {
  it('performance_play returns AUDIO_PERMISSION_REQUIRED before audio is enabled', async () => {
    await call('studio_enter_performance')
    const err = await callExpectingError('performance_play')
    expect(err.code).toBe('AUDIO_PERMISSION_REQUIRED')
  })

  it('plays and stops once audio is enabled', async () => {
    fakeAudio.enabled = true
    await call('studio_enter_performance')
    const res = await call('performance_play')
    expect(res.ok).toBe(true)
    expect(fakeAudio.playing).toBe(true)
    await call('performance_stop')
    expect(fakeAudio.playing).toBe(false)
  })

  it('set_energy validates and mutates shared state', async () => {
    await call('studio_enter_performance')
    await call('performance_set_energy', { energy: 0.9 })
    expect(store().energy).toBe(0.9)
    const err = await callExpectingError('performance_set_energy', { energy: 3 })
    expect(err.code).toBe('INVALID_INPUT')
  })

  it('set_track_mix updates the mixer', async () => {
    await call('studio_enter_performance')
    await call('performance_set_track_mix', { instrument: 'lead', volume: 0.3, muted: true })
    expect(store().composition.lead.mixer).toEqual({ volume: 0.3, muted: true })
  })
})

describe('studio_publish human interaction', () => {
  it('pauses until the human approves, then returns the remix link', async () => {
    store().apply('human', (c) => ops.replaceNotes(c, 'lead', exampleMelody()))
    const publish = baseComposeTools().find((t) => t.name === 'studio_publish')!
    const pending = publish.execute({ title: 'Synthwave Sunrise' }, {}) as Promise<Record<string, unknown>>

    await vi.waitFor(() => {
      expect(store().pendingPublish?.suggestedTitle).toBe('Synthwave Sunrise')
    })
    store().resolvePublish('Synthwave Sunrise')
    const res = await pending
    expect(res.ok).toBe(true)
    expect(String(res.remixUrl)).toContain('#s=')
  })

  it('reports cancellation as PUBLISH_CANCELLED', async () => {
    const publish = baseComposeTools().find((t) => t.name === 'studio_publish')!
    const pending = publish.execute({}, {}) as Promise<unknown>
    await vi.waitFor(() => expect(store().pendingPublish).not.toBeNull())
    store().resolvePublish(null)
    await expect(pending).rejects.toMatchObject({ code: 'PUBLISH_CANCELLED' })
  })

  it('uses the official requestUserInteraction hook when the runtime provides one', async () => {
    const publish = baseComposeTools().find((t) => t.name === 'studio_publish')!
    const requestUserInteraction = vi.fn(<T,>(fn: () => Promise<T>): Promise<T> => fn())
    const pending = publish.execute(
      { title: 'Hooked' },
      { requestUserInteraction: requestUserInteraction as <T>(fn: () => Promise<T>) => Promise<T> },
    ) as Promise<unknown>
    await vi.waitFor(() => expect(store().pendingPublish).not.toBeNull())
    store().resolvePublish('Hooked')
    await pending
    expect(requestUserInteraction).toHaveBeenCalledTimes(1)
  })
})
