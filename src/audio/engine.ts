/**
 * Small Web Audio toolkit. Every sound in the game is synthesized here, so there are no audio files.
 * The browser only lets audio start after a click or key press, so everything is a no-op until `unlock()`.
 */

export interface AudioSettings {
  muted: boolean
  music: number
  sfx: number
}

const SETTINGS_KEY = 'arena-audio'
const DEFAULTS: AudioSettings = { muted: false, music: 0.5, sfx: 0.8 }

export function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULTS }
    const p = JSON.parse(raw) as Partial<AudioSettings>
    return {
      muted: Boolean(p.muted),
      music: typeof p.music === 'number' ? Math.min(1, Math.max(0, p.music)) : DEFAULTS.music,
      sfx: typeof p.sfx === 'number' ? Math.min(1, Math.max(0, p.sfx)) : DEFAULTS.sfx,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export interface ToneOpts {
  type?: OscillatorType
  freq: number
  /** Glide to this frequency over the duration. */
  freqEnd?: number
  dur: number
  gain?: number
  attack?: number
  when?: number
  pan?: number
  filter?: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number }
  detune?: number
  bus?: 'sfx' | 'music'
}

export interface NoiseOpts {
  dur: number
  gain?: number
  attack?: number
  when?: number
  pan?: number
  filter?: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number }
  bus?: 'sfx' | 'music'
}

export class AudioEngine {
  ctx: AudioContext | null = null
  settings: AudioSettings = loadSettings()
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  private musicBus: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private voices = 0

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  /** Call from a click or key press. Safe to call many times. */
  unlock() {
    if (typeof window === 'undefined') return
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      const ctx = new Ctor()
      this.ctx = ctx
      this.master = ctx.createGain()
      this.sfxBus = ctx.createGain()
      this.musicBus = ctx.createGain()
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -14
      comp.knee.value = 18
      comp.ratio.value = 5
      this.sfxBus.connect(this.master)
      this.musicBus.connect(this.master)
      this.master.connect(comp)
      comp.connect(ctx.destination)
      const len = ctx.sampleRate * 1.5
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      this.applyVolumes()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  suspend() {
    if (this.ctx?.state === 'running') void this.ctx.suspend()
  }

  resume() {
    if (this.ctx?.state === 'suspended') void this.ctx.resume()
  }

  update(patch: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...patch }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings))
    } catch {
      // ignore
    }
    this.applyVolumes()
  }

  private applyVolumes() {
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.05)
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, t, 0.05)
    this.musicBus.gain.setTargetAtTime(this.settings.music * 0.55, t, 0.05)
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0
  }

  /** Too many overlapping sounds turn into mush, so extras are dropped. */
  canPlay(limit = 44): boolean {
    return this.ready && this.voices < limit
  }

  private bus(name: 'sfx' | 'music' | undefined): GainNode | null {
    return name === 'music' ? this.musicBus : this.sfxBus
  }

  private route(node: AudioNode, pan: number, bus: GainNode, done: () => void, stopAt: number, source: AudioScheduledSourceNode) {
    const ctx = this.ctx
    if (!ctx) return
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan))
      node.connect(p)
      p.connect(bus)
    } else {
      node.connect(bus)
    }
    this.voices++
    source.onended = () => {
      this.voices--
      done()
    }
    source.stop(stopAt)
  }

  tone(o: ToneOpts) {
    const ctx = this.ctx
    const bus = this.bus(o.bus)
    if (!ctx || !bus) return
    const t0 = o.when ?? ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = o.type ?? 'sine'
    osc.frequency.setValueAtTime(Math.max(1, o.freq), t0)
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t0 + o.dur)
    if (o.detune) osc.detune.value = o.detune
    const g = ctx.createGain()
    const peak = o.gain ?? 0.5
    const attack = Math.min(o.attack ?? 0.004, o.dur * 0.5)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
    let tail: AudioNode = osc.connect(g)
    if (o.filter) {
      const f = ctx.createBiquadFilter()
      f.type = o.filter.type
      f.Q.value = o.filter.q ?? 0.8
      f.frequency.setValueAtTime(o.filter.freq, t0)
      if (o.filter.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.filter.freqEnd), t0 + o.dur)
      tail.connect(f)
      tail = f
    }
    osc.start(t0)
    this.route(tail, o.pan ?? 0, bus, () => undefined, t0 + o.dur + 0.05, osc)
  }

  noise(o: NoiseOpts) {
    const ctx = this.ctx
    const bus = this.bus(o.bus)
    if (!ctx || !bus || !this.noiseBuf) return
    const t0 = o.when ?? ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const g = ctx.createGain()
    const peak = o.gain ?? 0.5
    const attack = Math.min(o.attack ?? 0.002, o.dur * 0.5)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
    let tail: AudioNode = src.connect(g)
    if (o.filter) {
      const f = ctx.createBiquadFilter()
      f.type = o.filter.type
      f.Q.value = o.filter.q ?? 0.8
      f.frequency.setValueAtTime(o.filter.freq, t0)
      if (o.filter.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.filter.freqEnd), t0 + o.dur)
      tail.connect(f)
      tail = f
    }
    src.start(t0, Math.random())
    this.route(tail, o.pan ?? 0, bus, () => undefined, t0 + o.dur + 0.05, src)
  }

  /**
   * A voice-like growl: a buzzing oscillator pushed through two moving vowel filters.
   * Used for every zombie sound.
   */
  growl(o: { f0: number; f0End?: number; dur: number; gain: number; when?: number; pan?: number; vib?: number; open?: number; rough?: number }) {
    const ctx = this.ctx
    const bus = this.bus('sfx')
    if (!ctx || !bus) return
    const t0 = o.when ?? ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(o.f0, t0)
    osc.frequency.linearRampToValueAtTime(o.f0End ?? o.f0 * 0.85, t0 + o.dur)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = o.vib ?? 6
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = o.f0 * 0.05 * (o.rough ?? 1)
    lfo.connect(lfoGain)
    lfoGain.connect(osc.frequency)
    const out = ctx.createGain()
    out.gain.setValueAtTime(0.0001, t0)
    out.gain.linearRampToValueAtTime(o.gain, t0 + Math.min(0.12, o.dur * 0.3))
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
    const open = o.open ?? 1
    const makeFormant = (f1: number, f2: number, q: number, amp: number) => {
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.Q.value = q
      f.frequency.setValueAtTime(f1 * open, t0)
      f.frequency.linearRampToValueAtTime(f2 * open, t0 + o.dur)
      const a = ctx.createGain()
      a.gain.value = amp
      osc.connect(f)
      f.connect(a)
      a.connect(out)
    }
    makeFormant(420, 700, 5, 1)
    makeFormant(1100, 800, 6, 0.6)
    // Oscillators must be started before they are scheduled to stop, or the browser throws.
    osc.start(t0)
    lfo.start(t0)
    if (o.rough) {
      const shaper = ctx.createWaveShaper()
      const curve = new Float32Array(256)
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * 2 - 1
        curve[i] = Math.tanh(x * 3)
      }
      shaper.curve = curve
      out.connect(shaper)
      this.finishVoice(shaper, o.pan ?? 0, bus, osc, lfo, t0 + o.dur)
    } else {
      this.finishVoice(out, o.pan ?? 0, bus, osc, lfo, t0 + o.dur)
    }
  }

  private finishVoice(node: AudioNode, pan: number, bus: GainNode, osc: OscillatorNode, lfo: OscillatorNode, end: number) {
    const ctx = this.ctx
    if (!ctx) return
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan))
      node.connect(p)
      p.connect(bus)
    } else {
      node.connect(bus)
    }
    this.voices++
    osc.onended = () => {
      this.voices--
    }
    osc.stop(end + 0.05)
    lfo.stop(end + 0.05)
  }

  /** A looping noise source whose volume the caller controls (used for the flamethrower). */
  loopNoise(): { setLevel: (v: number) => void; stop: () => void } | null {
    const ctx = this.ctx
    const bus = this.bus('sfx')
    if (!ctx || !bus || !this.noiseBuf) return null
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 520
    band.Q.value = 0.6
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 1800
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(band)
    band.connect(low)
    low.connect(g)
    g.connect(bus)
    src.start()
    return {
      setLevel: (v) => g.gain.setTargetAtTime(v, ctx.currentTime, 0.04),
      stop: () => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
        src.stop(ctx.currentTime + 0.4)
      },
    }
  }
}

export const mtof = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12)
