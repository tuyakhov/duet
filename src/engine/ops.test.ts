import { describe, expect, it } from 'vitest'
import { DuetError } from './errors'
import * as ops from './ops'
import { createComposition, createSession, exampleMelody } from './session'
import { validateDrumPattern, validateNote } from './validate'
import { LOOP_LENGTH } from './types'

describe('session creation', () => {
  it('starts in compose mode with only the lead instrument', () => {
    const s = createSession()
    expect(s.mode).toBe('compose')
    expect(s.composition.instruments).toEqual(['lead'])
    expect(s.composition.loopLength).toBe(LOOP_LENGTH)
    expect(s.version).toBe(1)
    expect(s.composition.lead.notes).toEqual([])
  })

  it('generates unique session ids', () => {
    expect(createSession().sessionId).not.toBe(createSession().sessionId)
  })

  it('ships a valid example melody', () => {
    for (const note of exampleMelody()) expect(() => validateNote(note)).not.toThrow()
  })
})

describe('note validation', () => {
  it('accepts a well-formed note and applies defaults', () => {
    expect(validateNote({ step: 3, pitch: 'Eb4' })).toEqual({ step: 3, pitch: 'Eb4', duration: 1, velocity: 0.8 })
  })

  it.each([
    [{ step: -1, pitch: 'C4' }, 'INVALID_STEP'],
    [{ step: 16, pitch: 'C4' }, 'INVALID_STEP'],
    [{ step: 2.5, pitch: 'C4' }, 'INVALID_STEP'],
    [{ step: 0, pitch: 'H4' }, 'INVALID_PITCH'],
    [{ step: 0, pitch: 'C9' }, 'INVALID_PITCH'],
    [{ step: 0, pitch: 'do4' }, 'INVALID_PITCH'],
    [{ step: 14, pitch: 'C4', duration: 5 }, 'INVALID_DURATION'],
    [{ step: 0, pitch: 'C4', duration: 0 }, 'INVALID_DURATION'],
    [{ step: 0, pitch: 'C4', velocity: 1.5 }, 'INVALID_VELOCITY'],
  ])('rejects %j with %s', (note, code) => {
    try {
      validateNote(note)
      expect.fail('expected a DuetError')
    } catch (err) {
      expect(err).toBeInstanceOf(DuetError)
      expect((err as DuetError).code).toBe(code)
    }
  })
})

describe('drum pattern validation', () => {
  it('accepts 16-boolean arrays and fills omitted voices', () => {
    const kick = new Array(16).fill(false).map((_, i) => i % 4 === 0)
    const p = validateDrumPattern({ kick })
    expect(p.kick.filter(Boolean)).toHaveLength(4)
    expect(p.snare).toHaveLength(16)
    expect(p.snare.every((v) => v === false)).toBe(true)
  })

  it('rejects wrong lengths and non-boolean values', () => {
    expect(() => validateDrumPattern({ kick: [true] })).toThrow(DuetError)
    expect(() => validateDrumPattern({ snare: new Array(16).fill(1) })).toThrow(DuetError)
    expect(() => validateDrumPattern('four on the floor')).toThrow(DuetError)
  })
})

describe('instruments', () => {
  it('adds an instrument once and rejects duplicates', () => {
    const c = createComposition()
    const { composition } = ops.addInstrument(c, 'drums')
    expect(composition.instruments).toEqual(['lead', 'drums'])
    expect(() => ops.addInstrument(composition, 'drums')).toThrowError(/already in the rack/)
    try {
      ops.addInstrument(composition, 'drums')
    } catch (err) {
      expect((err as DuetError).code).toBe('DUPLICATE_INSTRUMENT')
    }
  })

  it('removes an instrument and clears its content', () => {
    let c = ops.addInstrument(createComposition(), 'bass').composition
    c = ops.addNotes(c, 'bass', [{ step: 0, pitch: 'C2' }]).composition
    const { composition } = ops.removeInstrument(c, 'bass')
    expect(composition.instruments).toEqual(['lead'])
    expect(composition.bass.notes).toEqual([])
  })

  it('refuses to remove the lead or an absent instrument', () => {
    const c = createComposition()
    expect(() => ops.removeInstrument(c, 'lead')).toThrowError(/cannot be removed/)
    try {
      ops.removeInstrument(c, 'pad')
    } catch (err) {
      expect((err as DuetError).code).toBe('INSTRUMENT_NOT_PRESENT')
    }
  })

  it('rejects editing an instrument that is not in the rack', () => {
    const c = createComposition()
    try {
      ops.addNotes(c, 'bass', [{ step: 0, pitch: 'C2' }])
      expect.fail('expected a DuetError')
    } catch (err) {
      expect((err as DuetError).code).toBe('INSTRUMENT_NOT_PRESENT')
    }
  })
})

describe('melodic edits', () => {
  it('replaces, adds, patches and removes notes', () => {
    let c = createComposition()
    c = ops.replaceNotes(c, 'lead', exampleMelody()).composition
    expect(c.lead.notes).toHaveLength(10)

    c = ops.addNotes(c, 'lead', [{ step: 15, pitch: 'C5', duration: 1, velocity: 1 }]).composition
    expect(c.lead.notes).toHaveLength(11)

    c = ops.patchNotesAtSteps(c, 'lead', [0], { pitch: 'D4' }).composition
    expect(c.lead.notes.find((n) => n.step === 0)?.pitch).toBe('D4')

    const removed = ops.removeNotesAtSteps(c, 'lead', [15])
    expect(removed.composition.lead.notes).toHaveLength(10)
    expect(removed.report.changedSteps).toEqual([15])
  })

  it('merges duplicate step+pitch notes with a warning', () => {
    const { composition, report } = ops.replaceNotes(createComposition(), 'lead', [
      { step: 0, pitch: 'C4', velocity: 0.5 },
      { step: 0, pitch: 'C4', velocity: 0.9 },
    ])
    expect(composition.lead.notes).toHaveLength(1)
    expect(composition.lead.notes[0].velocity).toBe(0.9)
    expect(report.warnings.length).toBeGreaterThan(0)
  })

  it('patching to an out-of-loop duration fails atomically', () => {
    const c = ops.replaceNotes(createComposition(), 'lead', [{ step: 14, pitch: 'C4' }]).composition
    expect(() => ops.patchNotesAtSteps(c, 'lead', [14], { duration: 8 })).toThrow(DuetError)
    expect(c.lead.notes[0].duration).toBe(1)
  })

  it('toggleNoteCell draws then erases', () => {
    let c = createComposition()
    c = ops.toggleNoteCell(c, 'lead', 4, 'G4').composition
    expect(c.lead.notes).toHaveLength(1)
    c = ops.toggleNoteCell(c, 'lead', 4, 'G4').composition
    expect(c.lead.notes).toHaveLength(0)
  })
})

describe('drums and pad edits', () => {
  it('sets and clears drum steps', () => {
    let c = ops.addInstrument(createComposition(), 'drums').composition
    c = ops.setDrumSteps(c, 'kick', [0, 4, 8, 12], true).composition
    expect(c.drums.pattern.kick.filter(Boolean)).toHaveLength(4)
    c = ops.setDrumSteps(c, 'kick', [4], false).composition
    expect(c.drums.pattern.kick.filter(Boolean)).toHaveLength(3)
  })

  it('adds, replaces-on-same-step and removes chords', () => {
    let c = ops.addInstrument(createComposition(), 'pad').composition
    c = ops.addChord(c, { step: 0, duration: 8, pitches: ['C3', 'Eb3', 'G3'], velocity: 0.6 }).composition
    const second = ops.addChord(c, { step: 0, duration: 4, pitches: ['Ab2', 'C3', 'Eb3'] })
    expect(second.composition.pad.chords).toHaveLength(1)
    expect(second.composition.pad.chords[0].pitches[0]).toBe('Ab2')
    expect(second.report.warnings.length).toBeGreaterThan(0)
    const removed = ops.removeChordAtStep(second.composition, 0)
    expect(removed.composition.pad.chords).toHaveLength(0)
  })

  it('rejects chords with invalid pitches or overflow duration', () => {
    const c = ops.addInstrument(createComposition(), 'pad').composition
    expect(() => ops.addChord(c, { step: 12, duration: 8, pitches: ['C3'] })).toThrow(DuetError)
    expect(() => ops.addChord(c, { step: 0, pitches: ['X3'] })).toThrow(DuetError)
  })
})

describe('session-level edits', () => {
  it('validates tempo, key and scale', () => {
    const c = createComposition()
    expect(ops.setTempo(c, 140).composition.tempo).toBe(140)
    expect(() => ops.setTempo(c, 20)).toThrow(DuetError)
    expect(ops.setKeyScale(c, 'Eb', 'minor').composition.key).toBe('Eb')
    expect(() => ops.setKeyScale(c, 'X')).toThrow(DuetError)
    expect(() => ops.setKeyScale(c, undefined, 'blues')).toThrow(DuetError)
  })

  it('changing key transposes notes and chords by the shortest path', () => {
    let c = createComposition()
    c = ops.replaceNotes(c, 'lead', [{ step: 0, pitch: 'C4', duration: 1, velocity: 0.8 }]).composition
    c = ops.addInstrument(c, 'pad').composition
    c = ops.addChord(c, { step: 0, duration: 4, pitches: ['C3', 'Eb3', 'G3'], velocity: 0.5 }).composition

    const up = ops.setKeyScale(c, 'D', undefined) // +2 semitones
    expect(up.composition.lead.notes[0].pitch).toBe('D4')
    expect(up.composition.pad.chords[0].pitches).toEqual(['D3', 'F3', 'A3'])
    expect(up.report.summary).toContain('+2 semitones')

    const down = ops.setKeyScale(c, 'A', undefined) // shortest path is -3, not +9
    expect(down.composition.lead.notes[0].pitch).toBe('A3')
  })

  it('key changes can skip transposition, and scale changes never transpose', () => {
    let c = createComposition()
    c = ops.replaceNotes(c, 'lead', [{ step: 0, pitch: 'C4', duration: 1, velocity: 0.8 }]).composition
    expect(ops.setKeyScale(c, 'D', undefined, false).composition.lead.notes[0].pitch).toBe('C4')
    expect(ops.setKeyScale(c, undefined, 'dorian').composition.lead.notes[0].pitch).toBe('C4')
  })

  it('validates groove settings', () => {
    const c = createComposition()
    const { composition } = ops.setGroove(c, { swing: 0.3, space: 0.5 })
    expect(composition.swing).toBe(0.3)
    expect(composition.space).toBe(0.5)
    expect(() => ops.setGroove(c, { swing: 0.9 })).toThrow(DuetError)
    expect(() => ops.setGroove(c, { space: 2 })).toThrow(DuetError)
    expect(() => ops.setGroove(c, {})).toThrow(DuetError)
  })

  it('validates note timing offsets', () => {
    expect(validateNote({ step: 0, pitch: 'C4', offset: 0.1 }).offset).toBe(0.1)
    expect(validateNote({ step: 0, pitch: 'C4' }).offset).toBeUndefined()
    expect(() => validateNote({ step: 0, pitch: 'C4', offset: 0.6 })).toThrow(DuetError)
    expect(() => validateNote({ step: 0, pitch: 'C4', offset: -0.6 })).toThrow(DuetError)
  })

  it('phrase helpers pick the right pattern per bar', () => {
    let c = ops.addInstrument(createComposition(), 'drums').composition
    c = ops.addInstrument(c, 'bass').composition
    expect(ops.hasPhrase(c)).toBe(false)
    c = ops.setDrumSteps(c, 'snare', [14, 15], true, 'fill').composition
    c = ops.replaceNotes(c, 'bass', [{ step: 0, pitch: 'C2' }], 'variation').composition
    expect(ops.hasPhrase(c)).toBe(true)
    expect(ops.drumPatternForBar(c, 0)).toBe(c.drums.pattern)
    expect(ops.drumPatternForBar(c, 2)).toBe(c.drums.pattern) // no drum variation → main
    expect(ops.drumPatternForBar(c, 3)).toBe(c.drums.patternFill)
    expect(ops.bassNotesForBar(c, 2)).toBe(c.bass.notesVariation)
    expect(ops.bassNotesForBar(c, 3)).toBe(c.bass.notesVariation) // no fill → falls back to variation
  })

  it('contract validation accepts partial patches and rejects junk', () => {
    const c = createComposition()
    const { composition } = ops.setContract(c, { melodyLocked: false, density: 'sparse' })
    expect(composition.contract.melodyLocked).toBe(false)
    expect(composition.contract.density).toBe('sparse')
    expect(composition.contract.harmony).toBe('colourful') // untouched
    expect(() => ops.setContract(c, { density: 'extreme' })).toThrow(DuetError)
    expect(() => ops.setContract(c, { maxIntensity: 3 })).toThrow(DuetError)
    expect(() => ops.setContract(c, {})).toThrow(DuetError)
  })

  it('keys is a melodic instrument like lead and bass', () => {
    let c = ops.addInstrument(createComposition(), 'keys').composition
    c = ops.addNotes(c, 'keys', [{ step: 0, pitch: 'C3', duration: 2, velocity: 0.7 }]).composition
    expect(c.keys.notes).toHaveLength(1)
    const removed = ops.removeInstrument(c, 'keys')
    expect(removed.composition.keys.notes).toEqual([])
  })

  it('validates mixer input', () => {
    const c = createComposition()
    const { composition } = ops.setMixer(c, 'lead', { volume: 0.5, muted: true })
    expect(composition.lead.mixer).toEqual({ volume: 0.5, muted: true })
    expect(() => ops.setMixer(c, 'lead', { volume: 2 })).toThrow(DuetError)
    expect(() => ops.setMixer(c, 'lead', {})).toThrow(DuetError)
  })

  it('does not mutate the input composition', () => {
    const c = createComposition()
    ops.setTempo(c, 150)
    expect(c.tempo).toBe(104)
  })
})
