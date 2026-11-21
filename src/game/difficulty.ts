export type Difficulty = 'normal' | 'hard' | 'extreme'

export const DIFFICULTIES: readonly Difficulty[] = ['normal', 'hard', 'extreme']

export interface DifficultyDef {
  label: string
  blurb: string
  color: string
  /** Multiplies the number of zombies in a wave. */
  count: number
  /** Multiplies zombie health. */
  hp: number
  /** Multiplies zombie walking speed. */
  speed: number
  /** Multiplies the damage zombies deal (strikes and touch). */
  damage: number
  /** Multiplies the delay between spawns (below 1 = faster spawning). */
  spawn: number
  /** Multiplies acid, fire and electricity damage. */
  hazard: number
  /** Health restored to every living player between waves. */
  healBetween: number
  /** Multiplies the time between ground pickups (above 1 = fewer pickups). */
  pickupInterval: number
  /** Multiplies boss health. */
  bossHp: number
  /** Boss attacks come this much faster. */
  bossTempo: number
  /** The boss calls minions each time its health falls below one of these shares. */
  summonAt: readonly number[]
  /** The boss turns faster and angrier below this share of health. */
  enrageAt: number
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  normal: {
    label: 'Normal', blurb: 'The story as it was meant to be played.', color: '#6EE7A8',
    count: 1, hp: 1, speed: 1, damage: 1, spawn: 1, hazard: 1, healBetween: 4, pickupInterval: 1,
    bossHp: 1, bossTempo: 1, summonAt: [0.66, 0.33], enrageAt: 0.33,
  },
  hard: {
    label: 'Hard', blurb: 'More, tougher, faster. The boss calls help three times.', color: '#FFB23C',
    count: 1.25, hp: 1.35, speed: 1.1, damage: 1.3, spawn: 0.85, hazard: 1.25, healBetween: 2, pickupInterval: 1.25,
    bossHp: 1.5, bossTempo: 1.15, summonAt: [0.75, 0.5, 0.25], enrageAt: 0.33,
  },
  extreme: {
    label: 'Extreme', blurb: 'No healing between waves, scarce pickups, a furious boss.', color: '#FF4B57',
    count: 1.6, hp: 1.9, speed: 1.2, damage: 1.7, spawn: 0.7, hazard: 1.5, healBetween: 0, pickupInterval: 1.6,
    bossHp: 2.2, bossTempo: 1.3, summonAt: [0.75, 0.5, 0.25], enrageAt: 0.5,
  },
}

export function isDifficulty(value: unknown): value is Difficulty {
  return value === 'normal' || value === 'hard' || value === 'extreme'
}

/**
 * Survival has no last wave, so the pressure keeps climbing: more zombies, tougher, faster, harder hitting,
 * spawning quicker, with less healing and fewer pickups. Every term is capped so the mode stays playable for a long time.
 */
export function survivalDifficulty(base: DifficultyDef, wave: number): DifficultyDef {
  const w = Math.max(0, wave - 1)
  return {
    ...base,
    count: base.count * Math.min(1 + 0.035 * w, 2.2),
    hp: base.hp * Math.min(1 + 0.05 * w, 4),
    speed: base.speed * Math.min(1 + 0.008 * w, 1.3),
    damage: base.damage * Math.min(1 + 0.025 * w, 2),
    spawn: base.spawn * Math.max(0.55, 1 - 0.012 * w),
    hazard: base.hazard * Math.min(1 + 0.02 * w, 1.8),
    healBetween: Math.max(0, base.healBetween - Math.floor(w / 6)),
    pickupInterval: base.pickupInterval * Math.min(1 + 0.02 * w, 1.6),
  }
}
