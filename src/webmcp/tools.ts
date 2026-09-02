/**
 * WebMCP tool definitions. Every handler goes through the same store the
 * human UI uses, so agent edits are instantly visible (and audible) to the
 * human, and human edits are instantly visible to the agent.
 */
import { audioEngine } from '../audio/engine'
import { DuetError } from '../engine/errors'
import * as ops from '../engine/ops'
import {
  BASS_PRESETS,
  DRUM_PRESETS,
  INSTRUMENT_LABELS,
  KEYS,
  KEYS_PRESETS,
  LEAD_PRESETS,
  MAX_SWING,
  MAX_TEMPO,
  MIN_TEMPO,
  PAD_PRESETS,
  SCALE_NAMES,
} from '../engine/types'
import type { InstrumentId, Mode, MutationReport } from '../engine/types'
import { useStudioStore } from '../state/store'
import type { StudioState } from '../state/store'
import type { ToolContext, ToolDef } from './adapter'

export interface ToolDeps {
  store: typeof useStudioStore
  audio: Pick<typeof audioEngine, 'play' | 'stop' | 'playing' | 'enabled'>
}

const defaultDeps: ToolDeps = { store: useStudioStore, audio: audioEngine }

// ------------------------------------------------------------ shared helpers

function state(deps: ToolDeps): StudioState {
  return deps.store.getState()
}

function requireMode(deps: ToolDeps, mode: Mode, toolName: string) {
  const current = state(deps).mode
  if (current !== mode) {
    throw new DuetError(
      'WRONG_MODE',
      `${toolName} is only available in ${mode} mode — the studio is in ${current} mode. ` +
        (mode === 'compose'
          ? 'Call performance_return_to_compose first.'
          : 'Call studio_enter_performance first.'),
    )
  }
}

function baseResponse(deps: ToolDeps, message: string, extra: Record<string, unknown> = {}) {
  const s = state(deps)
  return {
    ok: true,
    message,
    sessionVersion: s.version,
    currentMode: s.mode,
    playbackState: s.playback.playing ? 'playing' : 'stopped',
    ...extra,
  }
}

function mutationResponse(deps: ToolDeps, report: MutationReport, extra: Record<string, unknown> = {}) {
  return baseResponse(deps, `OK — ${report.summary}.`, {
    changedTracks: report.changedTracks,
    changedSteps: report.changedSteps,
    warnings: report.warnings,
    ...extra,
  })
}

/** The full structured session an agent needs to understand the music. */
export function buildSessionSnapshot(s: StudioState) {
  const c = s.composition
  return {
    sessionId: s.sessionId,
    sessionVersion: s.version,
    currentMode: s.mode,
    title: c.title,
    tempo: c.tempo,
    key: c.key,
    scale: c.scale,
    loopLengthSteps: c.loopLength,
    stepDuration: '16th note — 16 steps form one bar of 4/4',
    playbackState: s.playback.playing ? 'playing' : 'stopped',
    audioEnabled: s.audioEnabled,
    energy: s.energy,
    swing: c.swing,
    space: c.space,
    instrumentsPresent: c.instruments,
    instrumentsAvailableToAdd: (['keys', 'drums', 'bass', 'pad'] as InstrumentId[]).filter(
      (i) => !c.instruments.includes(i),
    ),
    tracks: {
      lead: c.instruments.includes('lead')
        ? { notes: c.lead.notes, preset: c.lead.preset, mixer: c.lead.mixer }
        : null,
      keys: c.instruments.includes('keys')
        ? { notes: c.keys.notes, preset: c.keys.preset, mixer: c.keys.mixer }
        : null,
      bass: c.instruments.includes('bass')
        ? { notes: c.bass.notes, preset: c.bass.preset, mixer: c.bass.mixer }
        : null,
      drums: c.instruments.includes('drums')
        ? { pattern: c.drums.pattern, preset: c.drums.preset, mixer: c.drums.mixer }
        : null,
      pad: c.instruments.includes('pad')
        ? { chords: c.pad.chords, preset: c.pad.preset, mixer: c.pad.mixer }
        : null,
    },
    recentActivity: s.activity.slice(-8).map((e) => `${e.actor.toUpperCase()}: ${e.message}`),
  }
}

const noInput = { type: 'object', properties: {} }

const notesSchema = {
  type: 'array',
  description: 'Notes on the 16-step grid.',
  items: {
    type: 'object',
    properties: {
      step: { type: 'integer', minimum: 0, maximum: 15, description: 'Start step, 0-15.' },
      pitch: { type: 'string', description: 'Scientific pitch between C1 and C7, e.g. "C4", "Eb3", "F#5".' },
      duration: { type: 'integer', minimum: 1, maximum: 16, description: 'Length in steps (default 1). step + duration must be <= 16.' },
      velocity: { type: 'number', minimum: 0, maximum: 1, description: 'Loudness 0-1 (default 0.8).' },
    },
    required: ['step', 'pitch'],
  },
}

const stepsSchema = {
  type: 'array',
  items: { type: 'integer', minimum: 0, maximum: 15 },
  description: 'Step indices, 0-15.',
}

// -------------------------------------------------------- base compose tools

export function baseComposeTools(deps: ToolDeps = defaultDeps): ToolDef[] {
  return [
    {
      name: 'studio_get_session',
      description:
        'Read the complete live Duet session: title, tempo, key/scale, mode, every instrument track with its exact notes, drum pattern, chords, mixer settings, and recent activity. Call this first — the human may have recorded a melody that exists only in this browser session. Call it again after the human edits to see their changes.',
      inputSchema: noInput,
      annotations: { readOnlyHint: true },
      execute: () => baseResponse(deps, 'Live session state.', { session: buildSessionSnapshot(state(deps)) }),
    },
    {
      name: 'studio_list_instruments',
      description:
        'List instrument modules currently in the rack and which can still be added. Adding an instrument exposes its dedicated editing tool (e.g. drums_edit).',
      inputSchema: noInput,
      annotations: { readOnlyHint: true },
      execute: () => {
        const c = state(deps).composition
        return baseResponse(deps, 'Instrument rack.', {
          present: c.instruments.map((id) => ({
            id,
            label: INSTRUMENT_LABELS[id],
            preset: c[id].preset,
            mixer: c[id].mixer,
            editTool: `${id}_edit`,
          })),
          availableToAdd: (['keys', 'drums', 'bass', 'pad'] as InstrumentId[]).filter(
            (i) => !c.instruments.includes(i),
          ),
        })
      },
    },
    {
      name: 'studio_add_instrument',
      description:
        'Add an instrument module (keys, drums, bass, or pad) to the studio rack. The module appears visually for the human, and its dedicated editing tool (keys_edit / drums_edit / bass_edit / pad_edit) becomes available to you immediately after.',
      inputSchema: {
        type: 'object',
        properties: {
          instrument: { type: 'string', enum: ['keys', 'drums', 'bass', 'pad'], description: 'Instrument to add.' },
        },
        required: ['instrument'],
      },
      execute: (args) => {
        requireMode(deps, 'compose', 'studio_add_instrument')
        const report = state(deps).apply('agent', (c) => ops.addInstrument(c, args.instrument))
        return mutationResponse(deps, report, {
          newToolAvailable: `${String(args.instrument)}_edit`,
        })
      },
    },
    {
      name: 'studio_remove_instrument',
      description:
        'Remove an instrument module (keys, drums, bass, or pad) from the rack. Its content is cleared and its editing tool disappears. The lead synth carries the human melody and cannot be removed.',
      inputSchema: {
        type: 'object',
        properties: {
          instrument: { type: 'string', enum: ['keys', 'drums', 'bass', 'pad'] },
        },
        required: ['instrument'],
      },
      execute: (args) => {
        requireMode(deps, 'compose', 'studio_remove_instrument')
        const report = state(deps).apply('agent', (c) => ops.removeInstrument(c, args.instrument))
        return mutationResponse(deps, report)
      },
    },
    {
      name: 'studio_set_tempo',
      description: `Set the loop tempo in BPM (${MIN_TEMPO}-${MAX_TEMPO}). Takes effect immediately, even during playback.`,
      inputSchema: {
        type: 'object',
        properties: { bpm: { type: 'number', minimum: MIN_TEMPO, maximum: MAX_TEMPO } },
        required: ['bpm'],
      },
      execute: (args) => {
        requireMode(deps, 'compose', 'studio_set_tempo')
        const report = state(deps).apply('agent', (c) => ops.setTempo(c, args.bpm))
        return mutationResponse(deps, report)
      },
    },
    {
      name: 'studio_set_key',
      description:
        'Set the musical key and/or scale. By default a key change transposes all existing notes and chords by the shortest path to the new root, so the change is immediately audible. Set transposeExisting to false to relabel the key without moving any notes. Scale changes never move notes.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', enum: [...KEYS], description: 'Root pitch class.' },
          scale: { type: 'string', enum: [...SCALE_NAMES] },
          transposeExisting: {
            type: 'boolean',
            description: 'Transpose existing notes/chords to the new key (default true).',
          },
        },
      },
      execute: (args) => {
        requireMode(deps, 'compose', 'studio_set_key')
        const transpose = args.transposeExisting === undefined ? true : args.transposeExisting === true
        const report = state(deps).apply('agent', (c) => ops.setKeyScale(c, args.key, args.scale, transpose))
        return mutationResponse(deps, report)
      },
    },
    {
      name: 'studio_set_groove',
      description:
        `Set global groove settings: swing (0-${MAX_SWING}, delays every off-beat 16th — 0 is straight, 0.3 is a solid shuffle) and/or space (0-1, global reverb send on lead, keys and pad — 0 is dry, 1 is cavernous).`,
      inputSchema: {
        type: 'object',
        properties: {
          swing: { type: 'number', minimum: 0, maximum: MAX_SWING },
          space: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
      execute: (args) => {
        requireMode(deps, 'compose', 'studio_set_groove')
        const report = state(deps).apply('agent', (c) => ops.setGroove(c, { swing: args.swing, space: args.space }))
        return mutationResponse(deps, report)
      },
    },
    {
      name: 'studio_enter_performance',
      description:
        'Switch the studio into Performance mode. Composition tools are withdrawn and replaced with performance tools (performance_play, performance_set_energy, performance_set_track_mix, performance_launch_breakdown, ...). Use this when the arrangement is ready to perform.',
      inputSchema: noInput,
      execute: () => {
        requireMode(deps, 'compose', 'studio_enter_performance')
        state(deps).setMode('performance', 'agent')
        return baseResponse(deps, 'Entered Performance mode. Compose tools are withdrawn; performance tools are now available.', {
          toolsNow: computeToolNames(state(deps)),
        })
      },
    },
    {
      name: 'studio_publish',
      description:
        'Publish the current composition as a shareable remix link. This pauses and asks the human to approve (and possibly edit) the song title in the Duet UI before anything is created — the result reports whether they approved, and the remix URL if so.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 80, description: 'Suggested song title for the human to review.' },
        },
      },
      execute: async (args, ctx: ToolContext) => {
        requireMode(deps, 'compose', 'studio_publish')
        const s = state(deps)
        const suggested =
          typeof args.title === 'string' && args.title.trim() ? args.title.trim().slice(0, 80) : s.composition.title
        const ask = () => s.requestPublish(suggested, 'agent')
        const outcome = ctx.requestUserInteraction ? await ctx.requestUserInteraction(ask) : await ask()
        if (!outcome.approved) {
          throw new DuetError('PUBLISH_CANCELLED', 'The human declined the publish request. Nothing was shared.')
        }
        return baseResponse(deps, `Published “${outcome.title}”. The human approved sharing.`, {
          title: outcome.title,
          remixUrl: outcome.url,
        })
      },
    },
  ]
}

// ------------------------------------------------------- instrument editing

const mixProperties = {
  volume: { type: 'number', minimum: 0, maximum: 1, description: 'Track volume 0-1.' },
  muted: { type: 'boolean' },
}

function melodicEditTool(deps: ToolDeps, id: 'lead' | 'keys' | 'bass', presets: readonly string[]): ToolDef {
  const label = INSTRUMENT_LABELS[id]
  return {
    name: `${id}_edit`,
    description:
      `Edit the ${label} track. Operations: replace_notes (rewrite the whole track), add_notes, ` +
      `patch_steps (change pitch/velocity/duration of notes starting at given steps), remove_steps, ` +
      `set_preset (${presets.join(', ')}), set_mix (volume/mute).` +
      (id === 'lead'
        ? ' The lead usually holds the human’s own melody — prefer add_notes/patch_steps over replace_notes unless asked to rewrite it.'
        : ''),
    inputSchema: {
      type: 'object',
      properties: {
        op: {
          type: 'string',
          enum: ['replace_notes', 'add_notes', 'patch_steps', 'remove_steps', 'set_preset', 'set_mix'],
        },
        notes: { ...notesSchema, description: 'For replace_notes / add_notes.' },
        steps: { ...stepsSchema, description: 'For patch_steps / remove_steps: steps where target notes start.' },
        pitch: { type: 'string', description: 'patch_steps: new pitch for the targeted notes.' },
        velocity: { type: 'number', minimum: 0, maximum: 1, description: 'patch_steps: new velocity.' },
        duration: { type: 'integer', minimum: 1, maximum: 16, description: 'patch_steps: new duration in steps.' },
        preset: { type: 'string', enum: [...presets], description: 'For set_preset.' },
        ...mixProperties,
      },
      required: ['op'],
    },
    execute: (args) => {
      requireMode(deps, 'compose', `${id}_edit`)
      const s = state(deps)
      let report: MutationReport
      switch (args.op) {
        case 'replace_notes':
          report = s.apply('agent', (c) => ops.replaceNotes(c, id, args.notes))
          break
        case 'add_notes':
          report = s.apply('agent', (c) => ops.addNotes(c, id, args.notes))
          break
        case 'patch_steps':
          report = s.apply('agent', (c) =>
            ops.patchNotesAtSteps(c, id, args.steps, {
              pitch: args.pitch,
              velocity: args.velocity,
              duration: args.duration,
            }),
          )
          break
        case 'remove_steps':
          report = s.apply('agent', (c) => ops.removeNotesAtSteps(c, id, args.steps))
          break
        case 'set_preset':
          report = s.apply('agent', (c) => ops.setPreset(c, id, args.preset))
          break
        case 'set_mix':
          report = s.apply('agent', (c) => ops.setMixer(c, id, { volume: args.volume, muted: args.muted }))
          break
        default:
          throw new DuetError('INVALID_INPUT', `Unknown op "${String(args.op)}" for ${id}_edit.`)
      }
      return mutationResponse(deps, report, { track: buildSessionSnapshot(state(deps)).tracks[id] })
    },
  }
}

function drumsEditTool(deps: ToolDeps): ToolDef {
  return {
    name: 'drums_edit',
    description:
      'Edit the Drum Machine. Operations: replace_pattern (full 16-step pattern for kick/snare/hatClosed/hatOpen), ' +
      `set_steps / clear_steps (turn specific steps of one voice on or off), set_kit (${DRUM_PRESETS.join(', ')}), set_mix (volume/mute).`,
    inputSchema: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['replace_pattern', 'set_steps', 'clear_steps', 'set_kit', 'set_mix'] },
        pattern: {
          type: 'object',
          description: 'For replace_pattern: each voice is an array of exactly 16 booleans. Omitted voices are cleared.',
          properties: {
            kick: { type: 'array', items: { type: 'boolean' }, minItems: 16, maxItems: 16 },
            snare: { type: 'array', items: { type: 'boolean' }, minItems: 16, maxItems: 16 },
            hatClosed: { type: 'array', items: { type: 'boolean' }, minItems: 16, maxItems: 16 },
            hatOpen: { type: 'array', items: { type: 'boolean' }, minItems: 16, maxItems: 16 },
          },
        },
        voice: { type: 'string', enum: ['kick', 'snare', 'hatClosed', 'hatOpen'], description: 'For set_steps / clear_steps.' },
        steps: stepsSchema,
        kit: { type: 'string', enum: [...DRUM_PRESETS], description: 'For set_kit.' },
        ...mixProperties,
      },
      required: ['op'],
    },
    execute: (args) => {
      requireMode(deps, 'compose', 'drums_edit')
      const s = state(deps)
      let report: MutationReport
      switch (args.op) {
        case 'replace_pattern':
          report = s.apply('agent', (c) => ops.replaceDrumPattern(c, args.pattern))
          break
        case 'set_steps':
          report = s.apply('agent', (c) => ops.setDrumSteps(c, args.voice, args.steps, true))
          break
        case 'clear_steps':
          report = s.apply('agent', (c) => ops.setDrumSteps(c, args.voice, args.steps, false))
          break
        case 'set_kit':
          report = s.apply('agent', (c) => ops.setPreset(c, 'drums', args.kit))
          break
        case 'set_mix':
          report = s.apply('agent', (c) => ops.setMixer(c, 'drums', { volume: args.volume, muted: args.muted }))
          break
        default:
          throw new DuetError('INVALID_INPUT', `Unknown op "${String(args.op)}" for drums_edit.`)
      }
      return mutationResponse(deps, report, { pattern: state(deps).composition.drums.pattern })
    },
  }
}

function padEditTool(deps: ToolDeps): ToolDef {
  return {
    name: 'pad_edit',
    description:
      'Edit the atmospheric Pad. Operations: replace_chords (rewrite all chords), add_chord (a chord starting on the same step replaces the old one), ' +
      `remove_chord (by starting step), set_preset (${PAD_PRESETS.join(', ')}), set_mix (volume/mute). ` +
      'A chord is { step, duration, pitches: ["C3","Eb3","G3"], velocity }.',
    inputSchema: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['replace_chords', 'add_chord', 'remove_chord', 'set_preset', 'set_mix'] },
        chords: {
          type: 'array',
          description: 'For replace_chords.',
          items: {
            type: 'object',
            properties: {
              step: { type: 'integer', minimum: 0, maximum: 15 },
              duration: { type: 'integer', minimum: 1, maximum: 16 },
              pitches: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6 },
              velocity: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['step', 'pitches'],
          },
        },
        chord: {
          type: 'object',
          description: 'For add_chord.',
          properties: {
            step: { type: 'integer', minimum: 0, maximum: 15 },
            duration: { type: 'integer', minimum: 1, maximum: 16 },
            pitches: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6 },
            velocity: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['step', 'pitches'],
        },
        step: { type: 'integer', minimum: 0, maximum: 15, description: 'For remove_chord.' },
        preset: { type: 'string', enum: [...PAD_PRESETS] },
        ...mixProperties,
      },
      required: ['op'],
    },
    execute: (args) => {
      requireMode(deps, 'compose', 'pad_edit')
      const s = state(deps)
      let report: MutationReport
      switch (args.op) {
        case 'replace_chords':
          report = s.apply('agent', (c) => ops.replaceChords(c, args.chords))
          break
        case 'add_chord':
          report = s.apply('agent', (c) => ops.addChord(c, args.chord))
          break
        case 'remove_chord':
          report = s.apply('agent', (c) => ops.removeChordAtStep(c, args.step))
          break
        case 'set_preset':
          report = s.apply('agent', (c) => ops.setPreset(c, 'pad', args.preset))
          break
        case 'set_mix':
          report = s.apply('agent', (c) => ops.setMixer(c, 'pad', { volume: args.volume, muted: args.muted }))
          break
        default:
          throw new DuetError('INVALID_INPUT', `Unknown op "${String(args.op)}" for pad_edit.`)
      }
      return mutationResponse(deps, report, { chords: state(deps).composition.pad.chords })
    },
  }
}

export function instrumentTools(deps: ToolDeps = defaultDeps): ToolDef[] {
  // Follow rack order so the tool list mirrors what the human sees.
  return state(deps).composition.instruments.map((id) => {
    switch (id) {
      case 'lead':
        return melodicEditTool(deps, 'lead', LEAD_PRESETS)
      case 'keys':
        return melodicEditTool(deps, 'keys', KEYS_PRESETS)
      case 'bass':
        return melodicEditTool(deps, 'bass', BASS_PRESETS)
      case 'drums':
        return drumsEditTool(deps)
      case 'pad':
        return padEditTool(deps)
    }
  })
}

// --------------------------------------------------------- performance tools

export function performanceTools(deps: ToolDeps = defaultDeps): ToolDef[] {
  return [
    {
      name: 'performance_get_state',
      description:
        'Read the live performance state: playback, energy, per-track mixer settings, tempo and which instruments are in the arrangement.',
      inputSchema: noInput,
      annotations: { readOnlyHint: true },
      execute: () => {
        const s = state(deps)
        const c = s.composition
        return baseResponse(deps, 'Live performance state.', {
          energy: s.energy,
          tempo: c.tempo,
          instruments: c.instruments.map((id) => ({ id, label: INSTRUMENT_LABELS[id], mixer: c[id].mixer })),
          audioEnabled: s.audioEnabled,
        })
      },
    },
    {
      name: 'performance_play',
      description:
        'Start playing the 16-step loop from the top. Requires the human to have clicked “Enable Audio” first (returns AUDIO_PERMISSION_REQUIRED otherwise).',
      inputSchema: noInput,
      execute: () => {
        requireMode(deps, 'performance', 'performance_play')
        deps.audio.play('agent')
        return baseResponse(deps, 'Playback started — the loop is now performing.')
      },
    },
    {
      name: 'performance_stop',
      description: 'Stop playback.',
      inputSchema: noInput,
      execute: () => {
        requireMode(deps, 'performance', 'performance_stop')
        deps.audio.stop('agent')
        return baseResponse(deps, 'Playback stopped.')
      },
    },
    {
      name: 'performance_set_energy',
      description:
        'Set the global performance energy (0-1). Deterministically shapes the sound: hi-hat intensity and density, lead/bass filter brightness, pad level and bass drive. 0.2 feels like a verse, 0.9 like a finale.',
      inputSchema: {
        type: 'object',
        properties: { energy: { type: 'number', minimum: 0, maximum: 1 } },
        required: ['energy'],
      },
      execute: (args) => {
        requireMode(deps, 'performance', 'performance_set_energy')
        if (typeof args.energy !== 'number' || !Number.isFinite(args.energy) || args.energy < 0 || args.energy > 1) {
          throw new DuetError('INVALID_INPUT', `Energy must be a number from 0 to 1 (got ${String(args.energy)}).`)
        }
        state(deps).setEnergy(args.energy, 'agent')
        return baseResponse(deps, `Energy set to ${Math.round(args.energy * 100)}%.`, { energy: args.energy })
      },
    },
    {
      name: 'performance_set_track_mix',
      description: 'Set volume (0-1) and/or mute for one track during the performance.',
      inputSchema: {
        type: 'object',
        properties: {
          instrument: { type: 'string', enum: ['lead', 'keys', 'drums', 'bass', 'pad'] },
          ...mixProperties,
        },
        required: ['instrument'],
      },
      execute: (args) => {
        requireMode(deps, 'performance', 'performance_set_track_mix')
        const report = state(deps).apply('agent', (c) =>
          ops.setMixer(c, args.instrument, { volume: args.volume, muted: args.muted }),
        )
        return mutationResponse(deps, report)
      },
    },
    {
      name: 'performance_launch_breakdown',
      description:
        'Launch a breakdown: drums and bass drop out for about one loop pass, then slam back in. A classic tension-and-release move — pairs well with raising the energy right after.',
      inputSchema: noInput,
      execute: () => {
        requireMode(deps, 'performance', 'performance_launch_breakdown')
        state(deps).launchBreakdown('agent')
        return baseResponse(deps, 'Breakdown launched — drums and bass are out for one pass.')
      },
    },
    {
      name: 'performance_return_to_compose',
      description:
        'Leave Performance mode and return to Compose mode. Performance tools are withdrawn and the full composition toolset (studio_*, lead_edit, ...) comes back.',
      inputSchema: noInput,
      execute: () => {
        requireMode(deps, 'performance', 'performance_return_to_compose')
        state(deps).setMode('compose', 'agent')
        return baseResponse(deps, 'Back in Compose mode. Composition tools are available again.', {
          toolsNow: computeToolNames(state(deps)),
        })
      },
    },
  ]
}

// ------------------------------------------------------------- composition

/** The complete active toolset for the current mode + instrument rack. */
export function computeTools(deps: ToolDeps = defaultDeps): ToolDef[] {
  if (state(deps).mode === 'performance') return performanceTools(deps)
  return [...baseComposeTools(deps), ...instrumentTools(deps)]
}

export function computeToolNames(s: Pick<StudioState, 'mode' | 'composition'>): string[] {
  if (s.mode === 'performance') {
    return [
      'performance_get_state',
      'performance_play',
      'performance_stop',
      'performance_set_energy',
      'performance_set_track_mix',
      'performance_launch_breakdown',
      'performance_return_to_compose',
    ]
  }
  return [
    'studio_get_session',
    'studio_list_instruments',
    'studio_add_instrument',
    'studio_remove_instrument',
    'studio_set_tempo',
    'studio_set_key',
    'studio_set_groove',
    'studio_enter_performance',
    'studio_publish',
    ...s.composition.instruments.map((id) => `${id}_edit`),
  ]
}
