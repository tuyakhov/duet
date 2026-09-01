import { beforeEach, describe, expect, it } from 'vitest'
import { DuetError } from '../engine/errors'
import * as ops from '../engine/ops'
import { exampleMelody } from '../engine/session'
import { __resetStoreForTests, useStudioStore } from './store'

beforeEach(() => {
  __resetStoreForTests()
})

const store = () => useStudioStore.getState()

describe('shared state engine', () => {
  it('bumps the session version on every mutation, whoever makes it', () => {
    const v0 = store().version
    store().apply('human', (c) => ops.replaceNotes(c, 'lead', exampleMelody()))
    expect(store().version).toBe(v0 + 1)
    store().apply('agent', (c) => ops.addInstrument(c, 'drums'))
    expect(store().version).toBe(v0 + 2)
  })

  it('human and agent mutate the exact same composition', () => {
    store().apply('human', (c) => ops.replaceNotes(c, 'lead', exampleMelody()))
    store().apply('agent', (c) => ops.patchNotesAtSteps(c, 'lead', [0], { pitch: 'D4' }))
    const notes = store().composition.lead.notes
    expect(notes.find((n) => n.step === 0)?.pitch).toBe('D4')
    expect(notes).toHaveLength(exampleMelody().length)
  })

  it('records actor-attributed activity entries', () => {
    store().apply('human', (c) => ops.replaceNotes(c, 'lead', exampleMelody()))
    store().apply('agent', (c) => ops.addInstrument(c, 'drums'))
    const activity = store().activity
    expect(activity.at(-2)?.actor).toBe('human')
    expect(activity.at(-1)?.actor).toBe('agent')
    expect(activity.at(-1)?.message).toContain('added Drum Machine')
  })

  it('failed mutations change nothing', () => {
    const v0 = store().version
    expect(() => store().apply('agent', (c) => ops.addNotes(c, 'bass', [{ step: 0, pitch: 'C2' }]))).toThrow(
      DuetError,
    )
    expect(store().version).toBe(v0)
    expect(store().undoDepth).toBe(0)
  })

  it('sets highlights for changed tracks', () => {
    store().apply('agent', (c) => ops.addInstrument(c, 'drums'))
    expect(store().highlights.drums?.actor).toBe('agent')
  })
})

describe('undo', () => {
  it('undoes human and agent composition mutations in order', () => {
    store().apply('human', (c) => ops.replaceNotes(c, 'lead', exampleMelody()))
    store().apply('agent', (c) => ops.addInstrument(c, 'drums'))
    expect(store().composition.instruments).toContain('drums')

    expect(store().undo('human')).toBe(true)
    expect(store().composition.instruments).not.toContain('drums')
    expect(store().composition.lead.notes).toHaveLength(exampleMelody().length)

    expect(store().undo('human')).toBe(true)
    expect(store().composition.lead.notes).toHaveLength(0)
    expect(store().undo('human')).toBe(false)
  })

  it('undo bumps the version and logs activity', () => {
    store().apply('human', (c) => ops.setTempo(c, 150))
    const v = store().version
    store().undo('human')
    expect(store().version).toBe(v + 1)
    expect(store().activity.at(-1)?.message).toContain('undid')
    expect(store().composition.tempo).toBe(104)
  })
})

describe('mode and performance state', () => {
  it('switches modes with system activity and version bumps', () => {
    const v = store().version
    store().setMode('performance', 'system')
    expect(store().mode).toBe('performance')
    expect(store().version).toBe(v + 1)
    expect(store().activity.at(-1)?.message).toContain('Performance')
    store().setMode('compose', 'system')
    expect(store().mode).toBe('compose')
  })

  it('tracks energy changes', () => {
    store().setEnergy(0.9, 'agent')
    expect(store().energy).toBe(0.9)
    expect(store().activity.at(-1)?.message).toContain('90%')
  })
})

describe('publish approval flow', () => {
  it('resolves with a remix link when the human approves', async () => {
    store().apply('human', (c) => ops.replaceNotes(c, 'lead', exampleMelody()))
    const promise = store().requestPublish('Midnight Drive', 'agent')
    expect(store().pendingPublish?.suggestedTitle).toBe('Midnight Drive')

    store().resolvePublish('Midnight Drive II')
    const outcome = await promise
    expect(outcome.approved).toBe(true)
    expect(outcome.title).toBe('Midnight Drive II')
    expect(outcome.url).toContain('#s=')
    expect(store().composition.title).toBe('Midnight Drive II')
    expect(store().pendingPublish).toBeNull()
    expect(store().celebration?.url).toBe(outcome.url)
  })

  it('resolves as not approved when the human cancels', async () => {
    const promise = store().requestPublish('Midnight Drive', 'agent')
    store().resolvePublish(null)
    const outcome = await promise
    expect(outcome.approved).toBe(false)
    expect(outcome.url).toBeUndefined()
    expect(store().celebration).toBeNull()
    expect(store().activity.at(-1)?.message).toContain('declined')
  })

  it('rejects a second concurrent publish request', async () => {
    const first = store().requestPublish('One', 'agent')
    await expect(store().requestPublish('Two', 'agent')).rejects.toThrowError(/already awaiting/)
    store().resolvePublish(null)
    await first
  })
})

describe('reset', () => {
  it('clears the session but keeps audio enablement', () => {
    store().setAudioEnabled(true)
    store().apply('human', (c) => ops.replaceNotes(c, 'lead', exampleMelody()))
    const oldId = store().sessionId
    store().resetSession()
    expect(store().sessionId).not.toBe(oldId)
    expect(store().composition.lead.notes).toHaveLength(0)
    expect(store().audioEnabled).toBe(true)
    expect(store().undoDepth).toBe(0)
  })
})
