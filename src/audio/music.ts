import { mtof, type AudioEngine } from './engine'

export type MusicMode = 'off' | 'menu' | 'explore' | 'combat' | 'boss' | 'victory'

interface Mood {
  root: number
  scale: number[]
  bpm: number
  /** Soft glassy bells (cold maps). */
  bells?: boolean
  /** Metal clanks and geiger ticks. */
  industrial?: boolean
  /** Distorted lead and low rumble. */
  fire?: boolean
  wind: number
}

/** One mood per chapter: key, scale and speed set the character of the map. */
const MOODS: Mood[] = [
  { root: 45, scale: [0, 2, 3, 5, 7, 8, 10], bpm: 84, wind: 0.04 },
  { root: 50, scale: [0, 1, 3, 5, 7, 8, 10], bpm: 76, bells: true, wind: 0.09 },
  { root: 49, scale: [0, 1, 3, 5, 6, 8, 10], bpm: 96, industrial: true, wind: 0.03 },
  { root: 40, scale: [0, 2, 3, 5, 7, 8, 11], bpm: 112, fire: true, wind: 0.05 },
]
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const PROGRESSION = [0, 5, 3, 4]

const BASS: Record<MusicMode, number[]> = {
  off: [],
  menu: [0],
  explore: [0, 10],
  combat: [0, 3, 6, 8, 11, 14],
  boss: [0, 2, 4, 6, 8, 10, 12, 14],
  victory: [0, 8],
}

const ARP_CHANCE: Record<MusicMode, number> = { off: 0, menu: 0.2, explore: 0.12, combat: 0.22, boss: 0.4, victory: 0.5 }
const TEMPO: Record<MusicMode, number> = { off: 1, menu: 0.85, explore: 1, combat: 1.1, boss: 1.25, victory: 1 }

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

/** Generative soundtrack: pad, bass, drums and sparse notes, scheduled a little ahead of the audio clock. */
export class Music {
  mode: MusicMode = 'off'
  chapter = 0
  intensity = 0
  private step = 0
  private bar = 0
  private next = 0
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private a: AudioEngine) {}

  set(mode: MusicMode, chapter: number, intensity: number) {
    if (mode !== this.mode) this.step = 0
    this.mode = mode
    this.chapter = Math.max(0, Math.min(MOODS.length - 1, chapter))
    this.intensity = intensity
  }

  start() {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), 25)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private tick() {
    const a = this.a
    if (!a.ready || this.mode === 'off') {
      this.next = a.now
      return
    }
    if (this.next < a.now) this.next = a.now + 0.05
    while (this.next < a.now + 0.15) {
      const mood = this.mode === 'victory' ? { ...MOODS[this.chapter], scale: MAJOR, bpm: 100 } : MOODS[this.chapter]
      const stepDur = 60 / (mood.bpm * TEMPO[this.mode]) / 4
      this.playStep(this.step, this.next, stepDur, mood)
      this.next += stepDur
      this.step++
      if (this.step % 16 === 0) this.bar++
    }
  }

  private playStep(step: number, t: number, stepDur: number, mood: Mood) {
    const a = this.a
    const pos = step % 16
    const mode = this.mode
    const barDur = stepDur * 16
    const degree = PROGRESSION[this.bar % 4]
    const rootMidi = mood.root + mood.scale[degree % mood.scale.length]
    const fight = mode === 'combat' || mode === 'boss'

    if (pos === 0) {
      const pad = mode === 'menu' ? 0.1 : 0.13
      for (const [mult, det] of [[1, -7], [1, 7], [1.5, 0]] as const) {
        a.tone({ type: 'sawtooth', freq: mtof(rootMidi) * mult, dur: barDur * 1.05, gain: pad * (mult > 1 ? 0.6 : 1), attack: 0.7, when: t, detune: det, bus: 'music', filter: { type: 'lowpass', freq: 520, freqEnd: fight ? 900 : 380 } })
      }
      if (mood.wind > 0) a.noise({ dur: barDur, gain: mood.wind, attack: barDur * 0.4, when: t, bus: 'music', filter: { type: 'bandpass', freq: mood.bells ? 800 : 420, q: 0.5 } })
      if (mood.fire) a.tone({ freq: 32, dur: barDur, gain: 0.18, attack: 0.5, when: t, bus: 'music' })
    }

    // bass
    if (BASS[mode].includes(pos)) {
      const octave = mode === 'boss' && pos % 4 === 2 ? 12 : 0
      const loud = fight ? 0.3 : 0.2
      a.tone({ type: 'sawtooth', freq: mtof(rootMidi - 12 + octave), dur: stepDur * 1.7, gain: loud, when: t, bus: 'music', filter: { type: 'lowpass', freq: mode === 'boss' ? 700 : 340, q: 2 } })
    }

    // drums
    const kick = mode === 'boss' ? pos % 4 === 0 || pos === 14 : mode === 'combat' ? pos % 4 === 0 : mode === 'explore' ? pos === 0 || pos === 3 : false
    if (kick) {
      const soft = mode === 'explore'
      a.tone({ freq: soft ? 62 : 82, freqEnd: 36, dur: soft ? 0.22 : 0.18, gain: soft ? (pos === 0 ? 0.4 : 0.25) : mode === 'boss' ? 0.7 : 0.55, when: t, bus: 'music' })
    }
    if (fight && (pos === 4 || pos === 12 || (mode === 'boss' && pos === 15))) {
      a.noise({ dur: 0.13, gain: pos === 15 ? 0.14 : 0.3, when: t, bus: 'music', filter: { type: 'bandpass', freq: 1900, q: 0.7 } })
      a.tone({ type: 'triangle', freq: 200, freqEnd: 120, dur: 0.1, gain: 0.2, when: t, bus: 'music' })
    }
    const hat = mode === 'boss' ? true : mode === 'combat' ? pos % 2 === 0 || this.intensity > 0.6 : false
    if (hat) a.noise({ dur: 0.035, gain: pos % 4 === 2 ? 0.14 : 0.08, when: t, bus: 'music', filter: { type: 'highpass', freq: 7000 } })

    // sparse melody
    const lastChance = mode === 'menu' || mode === 'victory' ? pos === 0 || pos === 8 || pos === 12 : pos % 2 === 0
    if (lastChance && Math.random() < ARP_CHANCE[mode] + (fight ? this.intensity * 0.1 : 0)) {
      const tone = [0, 2, 4, 6][Math.floor(Math.random() * 4)]
      const midi = mood.root + 12 + mood.scale[(degree + tone) % mood.scale.length] + (Math.random() < 0.3 ? 12 : 0)
      const f = mtof(midi)
      if (mood.bells) {
        a.tone({ freq: f, dur: 1.4, gain: 0.16, when: t, bus: 'music' })
        a.tone({ freq: f * 2.76, dur: 0.7, gain: 0.07, when: t, bus: 'music' })
      } else if (mood.fire && fight) {
        a.tone({ type: 'sawtooth', freq: f, dur: 0.2, gain: 0.13, when: t, bus: 'music', filter: { type: 'lowpass', freq: 2400, freqEnd: 600 } })
      } else {
        a.tone({ type: 'triangle', freq: f, dur: mode === 'menu' ? 0.9 : 0.35, gain: 0.17, when: t, bus: 'music' })
      }
    }

    // chapter flavor
    if (mood.industrial) {
      if (pos === 6 || pos === 14) a.noise({ dur: 0.07, gain: 0.12, when: t, bus: 'music', filter: { type: 'bandpass', freq: 2200, q: 4 } })
      if (Math.random() < 0.12) a.noise({ dur: 0.012, gain: 0.14, when: t + rnd(0, stepDur), bus: 'music', filter: { type: 'highpass', freq: 6000 } })
    }
    if (mood.fire && Math.random() < 0.15) a.noise({ dur: 0.03, gain: 0.07, when: t + rnd(0, stepDur), bus: 'music', filter: { type: 'highpass', freq: 3500 } })
  }
}
