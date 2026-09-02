/**
 * The Duet audio engine. One Tone.js graph, one 16-step sequence that reads
 * the live store on every tick — so human and agent edits are audible on the
 * very next step without rescheduling anything.
 */
import * as Tone from 'tone'
import { DuetError } from '../engine/errors'
import { bassNotesForBar, drumPatternForBar, hasPhrase } from '../engine/ops'
import type { Actor, InstrumentId } from '../engine/types'
import { useStudioStore } from '../state/store'
import {
  BASS_SYNTH_PRESETS,
  DRUM_KIT_PRESETS,
  KEYS_SYNTH_PRESETS,
  LEAD_SYNTH_PRESETS,
  PAD_SYNTH_PRESETS,
} from './presets'

const STEPS = Array.from({ length: 16 }, (_, i) => i)

/**
 * Deterministic "humanization" jitter in -0.5..0.5, seeded by step and voice.
 * The same step of the same voice always lands the same way — groove, not
 * randomness.
 */
function jitter(step: number, voice: number): number {
  let x = (step * 374761393 + (voice + 1) * 668265263) >>> 0
  x = ((x ^ (x >> 13)) * 1274126177) >>> 0
  return ((x >>> 8) % 1000) / 1000 - 0.5
}

class AudioEngine {
  private started = false
  private built = false

  // Every melodic voice is a full subtractive synth (per-note filter
  // envelope) — static-timbre voices are what ringtones are made of.
  private leadSynth!: Tone.PolySynth<Tone.MonoSynth>
  private keysSynth!: Tone.PolySynth<Tone.MonoSynth>
  private bassSynth!: Tone.MonoSynth
  private padSynth!: Tone.PolySynth<Tone.MonoSynth>
  private kick!: Tone.MembraneSynth
  private snare!: Tone.NoiseSynth
  private snareBody!: Tone.MembraneSynth
  private hatClosed!: Tone.MetalSynth
  private hatOpen!: Tone.MetalSynth

  private leadFilter!: Tone.Filter
  private leadHP!: Tone.Filter
  private bassFilter!: Tone.Filter
  private bassDrive!: Tone.Distortion
  private padHP!: Tone.Filter
  private padFilter!: Tone.Filter
  private padChorus!: Tone.Chorus
  private keysFilter!: Tone.Filter
  private keysChorus!: Tone.Chorus
  private kickDrive!: Tone.Distortion
  private snareFilter!: Tone.Filter
  private hatFilter!: Tone.Filter
  private reverbHP!: Tone.Filter
  private channels!: Record<InstrumentId, Tone.Channel>
  private meters!: Record<InstrumentId, Tone.Meter>
  private reverb!: Tone.Reverb
  private reverbSend!: Tone.Gain
  private leadDelay!: Tone.FeedbackDelay
  private leadDelaySend!: Tone.Gain
  private duckPad!: Tone.Gain
  private duckBass!: Tone.Gain
  private masterBus!: Tone.Gain
  private compressor!: Tone.Compressor
  private sequence!: Tone.Sequence<number>
  private unsubscribers: Array<() => void> = []
  /** Current bar of the 4-bar phrase, advanced when step wraps to 0. */
  private bar = -1

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

    // Master chain with headroom: everything sums into a trimmed bus, gets
    // gently glued by a compressor, and the limiter only catches peaks.
    const limiter = new Tone.Limiter(-0.5).toDestination()
    this.compressor = new Tone.Compressor({ threshold: -16, ratio: 2.5, attack: 0.01, release: 0.16 }).connect(limiter)
    this.masterBus = new Tone.Gain(0.8).connect(this.compressor)

    // Global "space": a parallel reverb bus fed by the melodic/harmonic
    // channels. The high-pass on its input keeps the low end out of the
    // reverb — wash without mud.
    this.reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 1 }).connect(this.masterBus)
    this.reverbHP = new Tone.Filter(320, 'highpass').connect(this.reverb)
    this.reverbSend = new Tone.Gain(0).connect(this.reverbHP)

    // A subtle synced delay keeps the lead alive without smearing the melody.
    this.leadDelay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.28, wet: 1 }).connect(this.masterBus)
    this.leadDelaySend = new Tone.Gain(0.12).connect(this.leadDelay)

    // Kick-driven ducking on pad and bass — a little sidechain "breath".
    this.duckPad = new Tone.Gain(1).connect(this.masterBus)
    this.duckBass = new Tone.Gain(1).connect(this.masterBus)

    this.channels = {
      lead: new Tone.Channel(0, 0).connect(this.masterBus),
      keys: new Tone.Channel(0, 0).connect(this.masterBus),
      bass: new Tone.Channel(0, 0).connect(this.duckBass),
      pad: new Tone.Channel(0, 0).connect(this.duckPad),
      drums: new Tone.Channel(0, 0).connect(this.masterBus),
    }
    this.channels.lead.connect(this.leadDelaySend)
    this.meters = {
      lead: new Tone.Meter({ normalRange: true, smoothing: 0.85 }),
      keys: new Tone.Meter({ normalRange: true, smoothing: 0.85 }),
      bass: new Tone.Meter({ normalRange: true, smoothing: 0.85 }),
      pad: new Tone.Meter({ normalRange: true, smoothing: 0.85 }),
      drums: new Tone.Meter({ normalRange: true, smoothing: 0.85 }),
    }
    for (const id of ['lead', 'keys', 'bass', 'pad', 'drums'] as InstrumentId[]) {
      this.channels[id].connect(this.meters[id])
    }
    for (const id of ['lead', 'keys', 'pad'] as InstrumentId[]) {
      this.channels[id].connect(this.reverbSend)
    }

    // Lead: filtered (energy opens it), high-passed so it never fights the
    // low end, with the subtle synced delay send.
    this.leadHP = new Tone.Filter(150, 'highpass').connect(this.channels.lead)
    this.leadFilter = new Tone.Filter(6000, 'lowpass').connect(this.leadHP)
    this.leadSynth = new Tone.PolySynth(Tone.MonoSynth, LEAD_SYNTH_PRESETS.neon).connect(this.leadFilter)
    this.leadSynth.maxPolyphony = 8

    // Keys: gently low-passed with a slow, shallow chorus for width.
    this.keysChorus = new Tone.Chorus({ frequency: 0.45, delayTime: 3, depth: 0.25, wet: 0.4 })
      .connect(this.channels.keys)
      .start()
    this.keysFilter = new Tone.Filter(5200, 'lowpass').connect(this.keysChorus)
    this.keysSynth = new Tone.PolySynth(Tone.MonoSynth, KEYS_SYNTH_PRESETS.tines).connect(this.keysFilter)
    this.keysSynth.maxPolyphony = 12

    // Bass: filtered then softly driven — warmth, not fuzz.
    this.bassDrive = new Tone.Distortion({ distortion: 0.12, oversample: '2x', wet: 0.5 }).connect(
      this.channels.bass,
    )
    this.bassFilter = new Tone.Filter(2500, 'lowpass').connect(this.bassDrive)
    this.bassSynth = new Tone.MonoSynth(BASS_SYNTH_PRESETS.warm).connect(this.bassFilter)

    // Pad: high-passed out of the bass zone, darkened, and chorused — the
    // difference between "string machine" and "toy keyboard".
    this.padChorus = new Tone.Chorus({ frequency: 0.5, delayTime: 4, depth: 0.5, wet: 0.6 })
      .connect(this.channels.pad)
      .start()
    this.padFilter = new Tone.Filter(2400, 'lowpass', -12).connect(this.padChorus)
    this.padHP = new Tone.Filter(130, 'highpass').connect(this.padFilter)
    this.padSynth = new Tone.PolySynth(Tone.MonoSynth, PAD_SYNTH_PRESETS.haze).connect(this.padHP)
    this.padSynth.maxPolyphony = 16

    const kit = DRUM_KIT_PRESETS.analog
    // Kick: tighter pitch envelope plus soft drive for punch.
    this.kickDrive = new Tone.Distortion({ distortion: 0.2, oversample: '2x', wet: 0.35 }).connect(
      this.channels.drums,
    )
    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.045,
      octaves: 7,
      envelope: { attack: 0.001, decay: kit.kickDecay, sustain: 0.01, release: 0.35 },
    }).connect(this.kickDrive)
    // Snare: filtered noise layered with a short tuned body.
    this.snareFilter = new Tone.Filter(900, 'highpass').connect(this.channels.drums)
    this.snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: kit.snareDecay, sustain: 0 },
      volume: -3,
    }).connect(this.snareFilter)
    this.snareBody = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.11, sustain: 0 },
      volume: -8,
    }).connect(this.channels.drums)
    // Hats: metallic FM instead of white noise.
    this.hatFilter = new Tone.Filter(7500, 'highpass').connect(this.channels.drums)
    this.hatClosed = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: kit.hatClosedDecay, release: 0.02 },
      harmonicity: 5.1,
      modulationIndex: 24,
      resonance: 3500,
      octaves: 1.2,
      volume: -16,
    }).connect(this.hatFilter)
    this.hatOpen = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: kit.hatOpenDecay, release: 0.05 },
      harmonicity: 5.1,
      modulationIndex: 30,
      resonance: 3200,
      octaves: 1.4,
      volume: -18,
    }).connect(this.hatFilter)

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
  private tick(rawTime: number, step: number) {
    const state = useStudioStore.getState()
    const c = state.composition
    const energy = state.energy
    const inBreakdown = Date.now() < state.breakdownUntil
    const stepSec = Tone.Time('16n').toSeconds()

    // 4-bar phrase position: main, main, variation, fill (bar advances as the
    // step wraps). Without any variation/fill content, every bar plays main.
    if (step === 0) this.bar = (this.bar + 1) % 4
    const phrased = hasPhrase(c)
    const bar = phrased ? Math.max(0, this.bar) : 0

    // Swing: every off-beat 16th lands late by up to 60% of a step.
    const time = step % 2 === 1 ? rawTime + (c.swing ?? 0) * stepSec : rawTime
    const human = c.humanize ?? 0
    // Deterministic micro-timing (±9ms max) and velocity (±7%) per voice.
    const hTime = (voice: number) => time + jitter(step, voice) * human * 0.018
    const hVel = (v: number, voice: number) =>
      Math.min(1, Math.max(0.05, v * (1 + jitter(step + 31, voice) * human * 0.14)))
    const noteTime = (voice: number, offset?: number) => hTime(voice) + (offset ?? 0) * stepSec

    if (c.instruments.includes('lead') && !c.lead.mixer.muted) {
      for (const note of c.lead.notes) {
        if (note.step !== step) continue
        this.leadSynth.triggerAttackRelease(
          note.pitch,
          note.duration * stepSec * 0.95,
          noteTime(0, note.offset),
          hVel(note.velocity, 0),
        )
      }
    }

    if (c.instruments.includes('keys') && !c.keys.mixer.muted) {
      for (const note of c.keys.notes) {
        if (note.step !== step) continue
        this.keysSynth.triggerAttackRelease(
          note.pitch,
          note.duration * stepSec * 0.95,
          noteTime(1, note.offset),
          hVel(note.velocity, 1),
        )
      }
    }

    if (c.instruments.includes('bass') && !c.bass.mixer.muted && !inBreakdown) {
      const bassBoost = 0.6 + 0.4 * energy
      for (const note of bassNotesForBar(c, bar)) {
        if (note.step !== step) continue
        this.bassSynth.triggerAttackRelease(
          note.pitch,
          note.duration * stepSec * 0.9,
          noteTime(2, note.offset),
          hVel(Math.min(1, note.velocity * bassBoost), 2),
        )
      }
    }

    if (c.instruments.includes('pad') && !c.pad.mixer.muted) {
      for (const chord of c.pad.chords) {
        if (chord.step !== step) continue
        // Pads swell slowly — humanized velocity only, no timing jitter.
        this.padSynth.triggerAttackRelease(chord.pitches, chord.duration * stepSec, time, hVel(chord.velocity, 3))
      }
    }

    if (c.instruments.includes('drums') && !c.drums.mixer.muted && !inBreakdown) {
      const p = drumPatternForBar(c, bar)
      const kit = DRUM_KIT_PRESETS[c.drums.preset] ?? DRUM_KIT_PRESETS.analog
      // Accent map: downbeats strong, off-beats lighter — velocity is the groove.
      const hatAccent = step % 4 === 0 ? 0.85 : step % 2 === 0 ? 0.62 : 0.5
      const hatVelocity = hatAccent * (0.45 + 0.55 * energy)
      if (p.kick[step]) {
        this.kick.triggerAttackRelease(kit.kickPitch, '8n', hTime(4), step % 4 === 0 ? 1 : 0.85)
        this.duck(time)
      }
      if (p.snare[step]) {
        const t = hTime(5)
        const v = hVel(0.9, 5)
        this.snare.triggerAttackRelease('16n', t, v)
        this.snareBody.triggerAttackRelease('G3', '16n', t, v * 0.85)
      }
      if (p.hatOpen[step]) this.hatOpen.triggerAttackRelease(320, '8n', hTime(6), hVel(hatVelocity, 6))
      if (p.hatClosed[step]) this.hatClosed.triggerAttackRelease(340, '16n', hTime(7), hVel(hatVelocity, 7))
      // High energy deterministically densifies the hats with ghost offbeats.
      else if (energy >= 0.8 && step % 2 === 1) {
        this.hatClosed.triggerAttackRelease(340, '16n', hTime(7), 0.25 * energy)
      }
    }

    const barForUi = phrased ? bar : -1
    Tone.getDraw().schedule(() => {
      useStudioStore.getState().setPlayheadStep(step, barForUi)
    }, time)
  }

  /** A short kick-synced dip on pad and bass — deterministic sidechain feel. */
  private duck(time: number) {
    for (const gain of [this.duckPad, this.duckBass]) {
      gain.gain.cancelScheduledValues(time)
      gain.gain.setValueAtTime(1, time)
      gain.gain.linearRampToValueAtTime(0.62, time + 0.02)
      gain.gain.linearRampToValueAtTime(1, time + 0.2)
    }
  }

  /** Push mixer / tempo / preset / energy state into the audio graph. */
  private syncFromStore() {
    const state = useStudioStore.getState()
    const c = state.composition
    Tone.getTransport().bpm.value = c.tempo
    this.applyMixer()
    this.applyPresets()
    this.applyEnergy(state.energy)
    this.applySpace(c.space ?? 0)
  }

  private applySpace(space: number) {
    this.reverbSend.gain.rampTo(space * 0.7, 0.3)
  }

  private applyMixer() {
    const c = useStudioStore.getState().composition
    const energy = useStudioStore.getState().energy
    for (const id of ['lead', 'keys', 'bass', 'drums'] as InstrumentId[]) {
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
    this.keysSynth.set(KEYS_SYNTH_PRESETS[c.keys.preset] ?? KEYS_SYNTH_PRESETS.tines)
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
          s.composition.keys.mixer,
          s.composition.bass.mixer,
          s.composition.pad.mixer,
          s.composition.drums.mixer,
        ],
        () => this.applyMixer(),
        { equalityFn: shallowJson },
      ),
      store.subscribe(
        (s) => [
          s.composition.lead.preset,
          s.composition.keys.preset,
          s.composition.bass.preset,
          s.composition.pad.preset,
          s.composition.drums.preset,
        ],
        () => this.applyPresets(),
        { equalityFn: shallowJson },
      ),
      store.subscribe(
        (s) => s.energy,
        (energy) => this.applyEnergy(energy),
      ),
      store.subscribe(
        (s) => s.composition.space,
        (space) => this.applySpace(space ?? 0),
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
    this.bar = -1
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
    this.keysSynth.releaseAll()
    this.padSynth.releaseAll()
    useStudioStore.getState().setPlayback(false, actor)
    useStudioStore.getState().setPlayheadStep(-1)
  }

  get playing(): boolean {
    return this.built && Tone.getTransport().state === 'started'
  }

  /** 0..1 output level per track, for the performance meters. */
  getLevels(): Record<InstrumentId, number> {
    if (!this.built) return { lead: 0, keys: 0, bass: 0, pad: 0, drums: 0 }
    const read = (m: Tone.Meter) => {
      const v = m.getValue()
      return typeof v === 'number' ? Math.min(1, v * 3) : 0
    }
    return {
      lead: read(this.meters.lead),
      keys: read(this.meters.keys),
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
      this.leadSynth, this.keysSynth, this.bassSynth, this.padSynth,
      this.kick, this.snare, this.snareBody, this.hatClosed, this.hatOpen,
      this.leadFilter, this.leadHP, this.bassFilter, this.bassDrive,
      this.padHP, this.padFilter, this.padChorus, this.keysFilter, this.keysChorus,
      this.kickDrive, this.snareFilter, this.hatFilter,
      this.reverb, this.reverbHP, this.reverbSend,
      this.leadDelay, this.leadDelaySend, this.duckPad, this.duckBass,
      this.masterBus, this.compressor,
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

if (import.meta.env.DEV) {
  ;(globalThis as Record<string, unknown>).__duetAudio = audioEngine
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => audioEngine.dispose())
  // A hot reload of this module tears down the live audio graph, and the
  // fresh engine needs a user gesture to start again. Reset the store flag
  // so the UI offers "Enable Audio" instead of playing silence.
  if (useStudioStore.getState().audioEnabled) {
    useStudioStore.getState().setAudioEnabled(false)
    useStudioStore.getState().logActivity('system', 'audio engine reloaded — click Enable Audio to restart sound')
  }
}
