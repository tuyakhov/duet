/**
 * The Duet audio engine. One Tone.js graph, one 16-step sequence that reads
 * the live store on every tick — so human and agent edits are audible on the
 * very next step without rescheduling anything.
 */
import * as Tone from 'tone'
import { DuetError } from '../engine/errors'
import type { Actor, InstrumentId } from '../engine/types'
import { useStudioStore } from '../state/store'
import {
  BASS_SYNTH_PRESETS,
  DRUM_KIT_PRESETS,
  LEAD_SYNTH_PRESETS,
  PAD_SYNTH_PRESETS,
} from './presets'

const STEPS = Array.from({ length: 16 }, (_, i) => i)

class AudioEngine {
  private started = false
  private built = false

  private leadSynth!: Tone.PolySynth<Tone.Synth>
  private bassSynth!: Tone.MonoSynth
  private padSynth!: Tone.PolySynth<Tone.Synth>
  private kick!: Tone.MembraneSynth
  private snare!: Tone.NoiseSynth
  private hatClosed!: Tone.NoiseSynth
  private hatOpen!: Tone.NoiseSynth

  private leadFilter!: Tone.Filter
  private bassFilter!: Tone.Filter
  private channels!: Record<InstrumentId, Tone.Channel>
  private meters!: Record<InstrumentId, Tone.Meter>
  private sequence!: Tone.Sequence<number>
  private unsubscribers: Array<() => void> = []

  /** Must be called from a user gesture. Safe to call repeatedly. */
  async enable(): Promise<void> {
    if (!this.started) {
      await Tone.start()
      this.started = true
    }
    this.build()
    useStudioStore.getState().setAudioEnabled(true)
  }

  get enabled(): boolean {
    return this.started
  }

  private build() {
    if (this.built) return
    this.built = true

    const limiter = new Tone.Limiter(-1).toDestination()

    this.channels = {
      lead: new Tone.Channel(0, 0).connect(limiter),
      bass: new Tone.Channel(0, 0).connect(limiter),
      pad: new Tone.Channel(0, 0).connect(limiter),
      drums: new Tone.Channel(0, 0).connect(limiter),
    }
    this.meters = {
      lead: new Tone.Meter({ normalRange: true, smoothing: 0.85 }),
      bass: new Tone.Meter({ normalRange: true, smoothing: 0.85 }),
      pad: new Tone.Meter({ normalRange: true, smoothing: 0.85 }),
      drums: new Tone.Meter({ normalRange: true, smoothing: 0.85 }),
    }
    for (const id of ['lead', 'bass', 'pad', 'drums'] as InstrumentId[]) {
      this.channels[id].connect(this.meters[id])
    }

    this.leadFilter = new Tone.Filter(6000, 'lowpass').connect(this.channels.lead)
    this.leadSynth = new Tone.PolySynth(Tone.Synth, LEAD_SYNTH_PRESETS.neon).connect(this.leadFilter)
    this.leadSynth.maxPolyphony = 16

    this.bassFilter = new Tone.Filter(2500, 'lowpass').connect(this.channels.bass)
    this.bassSynth = new Tone.MonoSynth(BASS_SYNTH_PRESETS.warm).connect(this.bassFilter)

    this.padSynth = new Tone.PolySynth(Tone.Synth, PAD_SYNTH_PRESETS.haze).connect(this.channels.pad)
    this.padSynth.maxPolyphony = 24

    const kit = DRUM_KIT_PRESETS.analog
    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 6,
      envelope: { attack: 0.001, decay: kit.kickDecay, sustain: 0.01, release: 0.4 },
    }).connect(this.channels.drums)
    this.snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: kit.snareDecay, sustain: 0 },
    }).connect(this.channels.drums)
    const hatFilter = new Tone.Filter(8000, 'highpass').connect(this.channels.drums)
    this.hatClosed = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: kit.hatClosedDecay, sustain: 0 },
      volume: -8,
    }).connect(hatFilter)
    this.hatOpen = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: kit.hatOpenDecay, sustain: 0 },
      volume: -10,
    }).connect(hatFilter)

    this.sequence = new Tone.Sequence(
      (time, step) => this.tick(time, step),
      STEPS,
      '16n',
    )
    this.sequence.start(0)

    this.syncFromStore()
    this.subscribe()
  }

  /** Schedule everything that starts on `step`, reading the live session. */
  private tick(time: number, step: number) {
    const state = useStudioStore.getState()
    const c = state.composition
    const energy = state.energy
    const inBreakdown = Date.now() < state.breakdownUntil
    const stepSec = Tone.Time('16n').toSeconds()

    if (c.instruments.includes('lead') && !c.lead.mixer.muted) {
      for (const note of c.lead.notes) {
        if (note.step !== step) continue
        this.leadSynth.triggerAttackRelease(note.pitch, note.duration * stepSec * 0.95, time, note.velocity)
      }
    }

    if (c.instruments.includes('bass') && !c.bass.mixer.muted && !inBreakdown) {
      const bassBoost = 0.6 + 0.4 * energy
      for (const note of c.bass.notes) {
        if (note.step !== step) continue
        this.bassSynth.triggerAttackRelease(
          note.pitch,
          note.duration * stepSec * 0.9,
          time,
          Math.min(1, note.velocity * bassBoost),
        )
      }
    }

    if (c.instruments.includes('pad') && !c.pad.mixer.muted) {
      for (const chord of c.pad.chords) {
        if (chord.step !== step) continue
        this.padSynth.triggerAttackRelease(chord.pitches, chord.duration * stepSec, time, chord.velocity)
      }
    }

    if (c.instruments.includes('drums') && !c.drums.mixer.muted && !inBreakdown) {
      const p = c.drums.pattern
      const kit = DRUM_KIT_PRESETS[c.drums.preset] ?? DRUM_KIT_PRESETS.analog
      const hatVelocity = 0.35 + 0.65 * energy
      if (p.kick[step]) this.kick.triggerAttackRelease(kit.kickPitch, '8n', time, 1)
      if (p.snare[step]) this.snare.triggerAttackRelease('16n', time, 0.9)
      if (p.hatOpen[step]) this.hatOpen.triggerAttackRelease('8n', time, hatVelocity)
      if (p.hatClosed[step]) this.hatClosed.triggerAttackRelease('16n', time, hatVelocity)
      // High energy deterministically densifies the hats with ghost offbeats.
      else if (energy >= 0.8 && step % 2 === 1) {
        this.hatClosed.triggerAttackRelease('16n', time, 0.25 * energy)
      }
    }

    Tone.getDraw().schedule(() => {
      useStudioStore.getState().setPlayheadStep(step)
    }, time)
  }

  /** Push mixer / tempo / preset / energy state into the audio graph. */
  private syncFromStore() {
    const state = useStudioStore.getState()
    const c = state.composition
    Tone.getTransport().bpm.value = c.tempo
    this.applyMixer()
    this.applyPresets()
    this.applyEnergy(state.energy)
  }

  private applyMixer() {
    const c = useStudioStore.getState().composition
    const energy = useStudioStore.getState().energy
    for (const id of ['lead', 'bass', 'drums'] as InstrumentId[]) {
      this.channels[id].volume.value = Tone.gainToDb(c[id].mixer.volume)
      this.channels[id].mute = c[id].mixer.muted
    }
    // Pad volume breathes with energy.
    const padGain = c.pad.mixer.volume * (0.55 + 0.45 * energy)
    this.channels.pad.volume.value = Tone.gainToDb(padGain)
    this.channels.pad.mute = c.pad.mixer.muted
  }

  private applyPresets() {
    const c = useStudioStore.getState().composition
    this.leadSynth.set(LEAD_SYNTH_PRESETS[c.lead.preset] ?? LEAD_SYNTH_PRESETS.neon)
    this.bassSynth.set(BASS_SYNTH_PRESETS[c.bass.preset] ?? BASS_SYNTH_PRESETS.warm)
    this.padSynth.set(PAD_SYNTH_PRESETS[c.pad.preset] ?? PAD_SYNTH_PRESETS.haze)
    const kit = DRUM_KIT_PRESETS[c.drums.preset] ?? DRUM_KIT_PRESETS.analog
    this.kick.envelope.decay = kit.kickDecay
    this.snare.envelope.decay = kit.snareDecay
    this.hatClosed.envelope.decay = kit.hatClosedDecay
    this.hatOpen.envelope.decay = kit.hatOpenDecay
  }

  /** Energy drives filter brightness (and pad level via applyMixer). */
  private applyEnergy(energy: number) {
    const lead = 900 + energy * energy * 11000
    const bass = 300 + energy * 2600
    this.leadFilter.frequency.rampTo(lead, 0.2)
    this.bassFilter.frequency.rampTo(bass, 0.2)
    this.applyMixer()
  }

  private subscribe() {
    const store = useStudioStore
    this.unsubscribers.push(
      store.subscribe(
        (s) => s.composition.tempo,
        (tempo) => Tone.getTransport().bpm.rampTo(tempo, 0.25),
      ),
      store.subscribe(
        (s) => [
          s.composition.lead.mixer,
          s.composition.bass.mixer,
          s.composition.pad.mixer,
          s.composition.drums.mixer,
        ],
        () => this.applyMixer(),
        { equalityFn: shallowJson },
      ),
      store.subscribe(
        (s) => [s.composition.lead.preset, s.composition.bass.preset, s.composition.pad.preset, s.composition.drums.preset],
        () => this.applyPresets(),
        { equalityFn: shallowJson },
      ),
      store.subscribe(
        (s) => s.energy,
        (energy) => this.applyEnergy(energy),
      ),
    )
  }

  /** Start playback. Throws AUDIO_PERMISSION_REQUIRED before the human enables audio. */
  play(actor: Actor) {
    if (!this.started || !this.built) {
      throw new DuetError(
        'AUDIO_PERMISSION_REQUIRED',
        'Audio is not enabled yet. The human must click “Enable Audio” in Duet before anything can play.',
      )
    }
    const transport = Tone.getTransport()
    if (transport.state === 'started') return
    transport.position = 0
    transport.start('+0.08')
    useStudioStore.getState().setPlayback(true, actor)
  }

  stop(actor: Actor) {
    if (!this.built) return
    const transport = Tone.getTransport()
    if (transport.state !== 'started') return
    transport.stop()
    transport.position = 0
    this.leadSynth.releaseAll()
    this.padSynth.releaseAll()
    useStudioStore.getState().setPlayback(false, actor)
    useStudioStore.getState().setPlayheadStep(-1)
  }

  get playing(): boolean {
    return this.built && Tone.getTransport().state === 'started'
  }

  /** 0..1 output level per track, for the performance meters. */
  getLevels(): Record<InstrumentId, number> {
    if (!this.built) return { lead: 0, bass: 0, pad: 0, drums: 0 }
    const read = (m: Tone.Meter) => {
      const v = m.getValue()
      return typeof v === 'number' ? Math.min(1, v * 3) : 0
    }
    return {
      lead: read(this.meters.lead),
      bass: read(this.meters.bass),
      pad: read(this.meters.pad),
      drums: read(this.meters.drums),
    }
  }

  /** Full teardown (hot reload / tests). */
  dispose() {
    for (const u of this.unsubscribers) u()
    this.unsubscribers = []
    if (!this.built) return
    Tone.getTransport().stop()
    Tone.getTransport().cancel()
    this.sequence.dispose()
    for (const node of [
      this.leadSynth, this.bassSynth, this.padSynth,
      this.kick, this.snare, this.hatClosed, this.hatOpen,
      this.leadFilter, this.bassFilter,
      ...Object.values(this.channels), ...Object.values(this.meters),
    ]) {
      node.dispose()
    }
    this.built = false
  }
}

function shallowJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export const audioEngine = new AudioEngine()

if (import.meta.hot) {
  import.meta.hot.dispose(() => audioEngine.dispose())
}
