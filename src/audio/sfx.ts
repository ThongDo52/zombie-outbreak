import type { SoundEvent } from '@/game/types'
import type { AudioEngine } from './engine'

/** Every sound effect is built here from noise bursts, tones and the voice-like growl. */

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

function gunshot(a: AudioEngine, weapon: string, pan: number, v: number) {
  const j = rnd(0.94, 1.06)
  switch (weapon) {
    case 'pistol':
      a.noise({ dur: 0.1, gain: 0.9 * v, pan, filter: { type: 'lowpass', freq: 6500, freqEnd: 900 } })
      a.tone({ freq: 190 * j, freqEnd: 50, dur: 0.13, gain: 0.7 * v, pan })
      a.noise({ dur: 0.02, gain: 0.5 * v, pan, filter: { type: 'highpass', freq: 4000 } })
      break
    case 'smg':
      a.noise({ dur: 0.06, gain: 0.55 * v, pan, filter: { type: 'lowpass', freq: 5200, freqEnd: 1500 } })
      a.tone({ freq: 240 * j, freqEnd: 90, dur: 0.07, gain: 0.4 * v, pan, type: 'triangle' })
      break
    case 'shotgun': {
      a.noise({ dur: 0.34, gain: 1 * v, pan, filter: { type: 'lowpass', freq: 3500, freqEnd: 220 } })
      a.tone({ freq: 115, freqEnd: 32, dur: 0.34, gain: 0.95 * v, pan })
      a.noise({ dur: 0.5, gain: 0.3 * v, pan, when: a.now + 0.04, filter: { type: 'lowpass', freq: 900, freqEnd: 140 } })
      const t = a.now + 0.42
      a.noise({ dur: 0.03, gain: 0.35 * v, pan, when: t, filter: { type: 'highpass', freq: 2200 } })
      a.tone({ type: 'square', freq: 320, freqEnd: 180, dur: 0.04, gain: 0.12 * v, pan, when: t })
      a.noise({ dur: 0.03, gain: 0.4 * v, pan, when: t + 0.11, filter: { type: 'highpass', freq: 1800 } })
      break
    }
    case 'rifle':
      a.noise({ dur: 0.16, gain: 1 * v, pan, filter: { type: 'bandpass', freq: 2600, freqEnd: 450, q: 0.7 } })
      a.tone({ freq: 150, freqEnd: 42, dur: 0.22, gain: 0.85 * v, pan })
      a.tone({ type: 'sawtooth', freq: 1900, freqEnd: 600, dur: 0.06, gain: 0.22 * v, pan })
      a.noise({ dur: 0.55, gain: 0.25 * v, pan, when: a.now + 0.05, filter: { type: 'lowpass', freq: 1500, freqEnd: 200 } })
      break
    case 'minigun':
      a.noise({ dur: 0.05, gain: 0.5 * v, pan, filter: { type: 'bandpass', freq: 2200, freqEnd: 900, q: 0.8 } })
      a.tone({ freq: 190 * rnd(0.92, 1.08), freqEnd: 80, dur: 0.05, gain: 0.35 * v, pan })
      break
    case 'venom':
      // a wet glob leaving the tube, then a hiss
      a.tone({ type: 'sine', freq: 180, freqEnd: 70, dur: 0.22, gain: 0.55 * v, pan })
      a.tone({ type: 'sawtooth', freq: 420, freqEnd: 140, dur: 0.18, gain: 0.18 * v, pan, filter: { type: 'lowpass', freq: 900 } })
      a.noise({ dur: 0.3, gain: 0.3 * v, pan, filter: { type: 'bandpass', freq: 2600, freqEnd: 900 }, when: a.now + 0.04 })
      break
    case 'tesla':
      // crack of a big spark and a rising whine
      a.noise({ dur: 0.16, gain: 0.7 * v, pan, filter: { type: 'highpass', freq: 2800 } })
      a.tone({ type: 'sawtooth', freq: 3200, freqEnd: 180, dur: 0.22, gain: 0.35 * v, pan, filter: { type: 'lowpass', freq: 6000, freqEnd: 600 } })
      a.tone({ type: 'square', freq: 90, freqEnd: 60, dur: 0.18, gain: 0.3 * v, pan })
      break
    case 'cryo':
      // pressurised gas and glassy shards
      a.noise({ dur: 0.2, gain: 0.45 * v, pan, filter: { type: 'bandpass', freq: 5200, freqEnd: 2200 } })
      a.tone({ type: 'sine', freq: 2600, freqEnd: 1500, dur: 0.14, gain: 0.18 * v, pan })
      a.tone({ type: 'sine', freq: 3900, freqEnd: 2400, dur: 0.1, gain: 0.12 * v, pan, when: a.now + 0.03 })
      break
    case 'railgun':
      a.tone({ type: 'sawtooth', freq: 2400, freqEnd: 90, dur: 0.35, gain: 0.5 * v, pan, filter: { type: 'lowpass', freq: 5000, freqEnd: 300 } })
      a.noise({ dur: 0.22, gain: 0.8 * v, pan, filter: { type: 'highpass', freq: 1800 } })
      a.tone({ freq: 70, freqEnd: 28, dur: 0.4, gain: 0.8 * v, pan })
      a.tone({ type: 'sine', freq: 1200, freqEnd: 3000, dur: 0.2, gain: 0.2 * v, pan, when: a.now + 0.03 })
      break
    case 'launcher':
      a.tone({ freq: 115, freqEnd: 40, dur: 0.28, gain: 1 * v, pan })
      a.noise({ dur: 0.16, gain: 0.6 * v, pan, filter: { type: 'lowpass', freq: 2000, freqEnd: 300 } })
      a.noise({ dur: 0.45, gain: 0.2 * v, pan, when: a.now + 0.08, filter: { type: 'bandpass', freq: 400, freqEnd: 1600, q: 1.2 } })
      break
    default:
      break
  }
}

function zombieVoice(a: AudioEngine, kind: string, mode: 'groan' | 'attack' | 'die', pan: number, v: number) {
  const base = { walker: 100, runner: 160, tank: 58, boss: 38 }[kind] ?? 100
  const j = rnd(0.88, 1.14)
  if (mode === 'groan') {
    const dur = kind === 'boss' ? 1.9 : kind === 'tank' ? 1.3 : kind === 'runner' ? 0.55 : rnd(0.8, 1.3)
    a.growl({ f0: base * j, f0End: base * j * 0.82, dur, gain: (kind === 'boss' ? 0.55 : 0.32) * v, pan, vib: kind === 'runner' ? 11 : 5.5, rough: kind === 'boss' ? 2 : 1, open: kind === 'tank' || kind === 'boss' ? 0.7 : 1 })
    if (kind === 'boss') a.tone({ freq: 34, freqEnd: 28, dur, gain: 0.45 * v, pan })
  } else if (mode === 'attack') {
    a.growl({ f0: base * 1.25 * j, f0End: base * 1.7 * j, dur: kind === 'runner' ? 0.25 : 0.4, gain: 0.5 * v, pan, vib: 14, rough: 2, open: 1.3 })
  } else {
    const dur = kind === 'boss' ? 1.6 : kind === 'tank' ? 0.9 : 0.6
    a.growl({ f0: base * 1.3 * j, f0End: base * 0.45, dur, gain: 0.5 * v, pan, vib: 8, rough: 1.5, open: 0.8 })
    a.noise({ dur: 0.18, gain: 0.5 * v, pan, filter: { type: 'bandpass', freq: 900, freqEnd: 180, q: 0.8 } })
    a.tone({ freq: 120, freqEnd: 40, dur: 0.2, gain: 0.5 * v, pan })
  }
}

function explosion(a: AudioEngine, pan: number, v: number, big = false) {
  const s = big ? 1.5 : 1
  a.noise({ dur: 0.9 * s, gain: 1 * v, pan, filter: { type: 'lowpass', freq: 2600, freqEnd: 70 } })
  a.tone({ freq: 95, freqEnd: 26, dur: 0.8 * s, gain: 1 * v, pan })
  a.noise({ dur: 0.4, gain: 0.25 * v, pan, when: a.now + 0.1, filter: { type: 'highpass', freq: 3000 } })
  if (big) a.tone({ freq: 55, freqEnd: 22, dur: 1.4, gain: 0.8 * v, pan, when: a.now + 0.05 })
}

function arpeggio(a: AudioEngine, notes: number[], step: number, v: number, type: OscillatorType = 'sine', len = 0.28) {
  notes.forEach((f, i) => a.tone({ type, freq: f, dur: len, gain: 0.3 * v, when: a.now + i * step }))
}

export function playSfx(a: AudioEngine, e: SoundEvent, pan: number, v: number) {
  switch (e.type) {
    case 'shot':
      gunshot(a, e.kind ?? 'pistol', pan, v)
      break
    case 'punch':
      a.noise({ dur: 0.1, gain: 0.35 * v, pan, filter: { type: 'bandpass', freq: 1400, freqEnd: 400 } })
      a.tone({ freq: 170, freqEnd: 70, dur: 0.12, gain: 0.5 * v, pan, when: a.now + 0.03 })
      break
    case 'dry':
      a.tone({ type: 'square', freq: 1800, freqEnd: 1100, dur: 0.03, gain: 0.18 * v, pan })
      a.noise({ dur: 0.015, gain: 0.25 * v, pan, filter: { type: 'highpass', freq: 3000 } })
      break
    case 'explosion':
      explosion(a, pan, v)
      break
    case 'hit':
      a.noise({ dur: 0.12, gain: 0.45 * v, pan, filter: { type: 'bandpass', freq: 800, freqEnd: 200, q: 0.9 } })
      a.tone({ freq: 130, freqEnd: 55, dur: 0.1, gain: 0.35 * v, pan })
      break
    case 'groan':
      zombieVoice(a, e.kind ?? 'walker', 'groan', pan, v)
      break
    case 'zattack':
      zombieVoice(a, e.kind ?? 'walker', 'attack', pan, v)
      break
    case 'zdie':
      zombieVoice(a, e.kind ?? 'walker', 'die', pan, v)
      break
    case 'bite':
      a.noise({ dur: 0.06, gain: 0.5 * v, pan, filter: { type: 'highpass', freq: 2500 } })
      a.tone({ freq: 220, freqEnd: 90, dur: 0.09, gain: 0.4 * v, pan, type: 'square', filter: { type: 'lowpass', freq: 900 } })
      break
    case 'hurt':
      a.tone({ type: 'sawtooth', freq: 190, freqEnd: 80, dur: 0.22, gain: 0.5, filter: { type: 'lowpass', freq: 900 } })
      a.noise({ dur: 0.12, gain: 0.35, filter: { type: 'bandpass', freq: 700, freqEnd: 250 } })
      break
    case 'armorhit':
      a.tone({ freq: 1250, dur: 0.22, gain: 0.35 })
      a.tone({ freq: 1880, dur: 0.16, gain: 0.22 })
      a.noise({ dur: 0.04, gain: 0.3, filter: { type: 'highpass', freq: 5000 } })
      break
    case 'dash':
      a.noise({ dur: 0.2, gain: 0.4, filter: { type: 'bandpass', freq: 400, freqEnd: 2600, q: 1.1 } })
      break
    case 'pickup':
      arpeggio(a, [660, 880], 0.07, v, 'sine', 0.18)
      break
    case 'weaponpickup':
      a.noise({ dur: 0.03, gain: 0.4, filter: { type: 'highpass', freq: 2500 } })
      a.noise({ dur: 0.03, gain: 0.4, when: a.now + 0.09, filter: { type: 'highpass', freq: 1800 } })
      arpeggio(a, [523, 659, 784], 0.07, 1, 'triangle', 0.3)
      break
    case 'heal':
      arpeggio(a, [392, 494, 587, 784, 988], 0.07, 1, 'sine', 0.4)
      break
    case 'armor':
      a.tone({ type: 'sawtooth', freq: 300, freqEnd: 900, dur: 0.3, gain: 0.25, filter: { type: 'bandpass', freq: 1200, q: 2 } })
      a.tone({ freq: 1500, dur: 0.5, gain: 0.25, when: a.now + 0.2 })
      a.tone({ freq: 2250, dur: 0.4, gain: 0.15, when: a.now + 0.2 })
      break
    case 'life':
      a.tone({ type: 'sawtooth', freq: 90, freqEnd: 720, dur: 0.9, gain: 0.35, filter: { type: 'lowpass', freq: 1800 } })
      arpeggio(a, [523, 659, 784, 1047], 0.09, 1, 'triangle', 0.9)
      explosion(a, 0, 0.7)
      break
    case 'wave':
      a.tone({ type: 'sawtooth', freq: 58, freqEnd: 52, dur: 1, gain: 0.5, attack: 0.15, filter: { type: 'lowpass', freq: 500 } })
      a.tone({ freq: 70, freqEnd: 30, dur: 0.6, gain: 0.8 })
      break
    case 'boss':
      zombieVoice(a, 'boss', 'groan', pan, 1)
      a.tone({ freq: 60, freqEnd: 24, dur: 1.4, gain: 0.9 })
      a.noise({ dur: 1.2, gain: 0.35, filter: { type: 'lowpass', freq: 600, freqEnd: 90 } })
      break
    case 'charge':
      zombieVoice(a, 'boss', 'attack', pan, v)
      break
    case 'slam':
      explosion(a, pan, v, true)
      break
    case 'summon':
      a.tone({ type: 'sawtooth', freq: 55, freqEnd: 110, dur: 1.4, gain: 0.35, attack: 0.5, filter: { type: 'lowpass', freq: 700 } })
      a.tone({ type: 'sawtooth', freq: 58, freqEnd: 117, dur: 1.4, gain: 0.3, attack: 0.5, filter: { type: 'lowpass', freq: 700 } })
      break
    case 'bossdown':
      zombieVoice(a, 'boss', 'die', pan, 1)
      explosion(a, pan, 1, true)
      arpeggio(a, [392, 523, 659, 784], 0.12, 1, 'triangle', 0.7)
      break
    case 'cleared':
      arpeggio(a, [392, 523, 659, 784, 1047], 0.13, 1, 'triangle', 0.7)
      break
    case 'won':
      arpeggio(a, [262, 330, 392, 523, 659, 784, 1047], 0.16, 1, 'triangle', 1.2)
      arpeggio(a, [131, 196, 262], 0.3, 1, 'sine', 1.6)
      break
    case 'over':
      a.tone({ type: 'sawtooth', freq: 220, freqEnd: 38, dur: 1.6, gain: 0.5, filter: { type: 'lowpass', freq: 800, freqEnd: 100 } })
      a.noise({ dur: 1.2, gain: 0.25, filter: { type: 'lowpass', freq: 500, freqEnd: 60 } })
      break
    case 'sizzle':
      a.noise({ dur: 0.3, gain: 0.3, filter: { type: 'highpass', freq: 2500 } })
      break
    case 'electric':
      a.noise({ dur: 0.18, gain: 0.35 * v, pan, filter: { type: 'highpass', freq: 3200 } })
      a.tone({ type: 'sawtooth', freq: 2600, freqEnd: 120, dur: 0.14, gain: 0.25 * v, pan })
      break
    case 'revive':
      arpeggio(a, [262, 330, 392, 523, 659], 0.08, 1, 'sine', 0.5)
      a.tone({ freq: 65, freqEnd: 130, dur: 0.5, gain: 0.35, attack: 0.1 })
      break
    case 'killfx':
      if (e.kind === 'gold') arpeggio(a, [1568, 2093, 2637], 0.05, v, 'sine', 0.3)
      else if (e.kind === 'lightning') {
        a.tone({ type: 'sawtooth', freq: 3200, freqEnd: 180, dur: 0.14, gain: 0.3 * v, pan })
        a.noise({ dur: 0.18, gain: 0.35 * v, pan, filter: { type: 'highpass', freq: 3500 } })
      } else {
        a.tone({ freq: 480, freqEnd: 1100, dur: 0.6, gain: 0.25 * v, pan, attack: 0.15 })
        a.tone({ freq: 720, freqEnd: 1650, dur: 0.6, gain: 0.12 * v, pan, attack: 0.15 })
      }
      break
    case 'click':
      a.tone({ freq: 900, dur: 0.04, gain: 0.2 })
      break
    case 'spit':
      // a wet gloop leaving the throat
      a.tone({ type: 'sine', freq: 520, freqEnd: 180, dur: 0.16, gain: 0.3 * v, pan })
      a.noise({ dur: 0.14, gain: 0.22 * v, pan, filter: { type: 'bandpass', freq: 900, freqEnd: 300, q: 1.4 } })
      break
    case 'burst':
      // a bloater popping: a heavy splat and a hiss of gas
      a.noise({ dur: 0.3, gain: 0.5 * v, pan, filter: { type: 'lowpass', freq: 1400, freqEnd: 160 } })
      a.tone({ type: 'sine', freq: 140, freqEnd: 50, dur: 0.25, gain: 0.4 * v, pan })
      a.noise({ dur: 0.5, gain: 0.18 * v, pan, when: a.now + 0.1, filter: { type: 'highpass', freq: 2800 } })
      break
    case 'chant':
      // a shaman's low, eerie hum
      a.tone({ type: 'triangle', freq: 196, freqEnd: 233, dur: 0.7, gain: 0.22 * v, pan, attack: 0.2 })
      a.tone({ type: 'sine', freq: 392, freqEnd: 466, dur: 0.7, gain: 0.12 * v, pan, attack: 0.2 })
      break
    case 'skill':
      // class skills: Bulwark rings, Striker roars up, Medic chimes
      if (e.kind === 'tank') {
        a.tone({ type: 'sawtooth', freq: 140, freqEnd: 420, dur: 0.35, gain: 0.3 * v, pan, filter: { type: 'lowpass', freq: 1400 } })
        a.tone({ freq: 880, dur: 0.5, gain: 0.2 * v, pan, when: a.now + 0.1 })
      } else if (e.kind === 'damage') {
        a.tone({ type: 'sawtooth', freq: 90, freqEnd: 520, dur: 0.5, gain: 0.34 * v, pan, filter: { type: 'lowpass', freq: 1800 } })
        a.noise({ dur: 0.3, gain: 0.25 * v, pan, filter: { type: 'bandpass', freq: 700, freqEnd: 2600, q: 1.2 } })
      } else {
        arpeggio(a, [523, 659, 784, 1047], 0.06, v, 'sine', 0.35)
        a.tone({ freq: 130, freqEnd: 260, dur: 0.5, gain: 0.22 * v, pan, attack: 0.1 })
      }
      break
    default:
      break
  }
}
