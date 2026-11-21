import { familyWeights } from './waves'
import { CHAPTERS } from './chapters'
import { DIFFICULTY, type DifficultyDef } from './difficulty'
import type { ZombieKind } from './types'

/**
 * Endless Descent: a squad of five goes down floor after floor. Each floor is one big wave on one of
 * the seven story maps. Clear it, catch your breath, take the stairs. How deep the squad gets decides the prize.
 */
export const DESCENT = {
  squad: 5,
  /** Every Nth floor has a boss. */
  bossEvery: 5,
  /** Everybody starts with the guns of the first four chapters. */
  loadoutChapter: 4,
  /** Health a fallen player comes back with when a floor is cleared. */
  reviveHp: 0.5,
  /** Share of full health the living recover when a floor is cleared. */
  healOnClear: 0.3,
  /** Seconds between floors. */
  intermission: 3,
} as const

/** Maps rotate through the story chapters. */
export function floorMap(floor: number): number {
  return (Math.max(1, floor) - 1) % CHAPTERS.length
}

/** The difficulty step that zombies scale with, rising faster than the story chapters. */
export function floorLevel(floor: number): number {
  return 4 + floor * 1.4
}

export function isBossFloor(floor: number): boolean {
  return floor > 0 && floor % DESCENT.bossEvery === 0
}

/** Floors 1 to 5 play like Normal, 6 to 12 like Hard, deeper than that like Extreme and still getting worse. */
export function floorDifficulty(floor: number): DifficultyDef {
  if (floor <= 5) return DIFFICULTY.normal
  if (floor <= 12) return DIFFICULTY.hard
  const extra = floor - 12
  const base = DIFFICULTY.extreme
  const k = 1 + 0.04 * extra
  return {
    ...base,
    count: base.count * Math.min(k, 2),
    hp: base.hp * k,
    damage: base.damage * Math.min(k, 1.8),
    speed: base.speed * Math.min(1 + 0.01 * extra, 1.3),
    spawn: Math.max(0.35, base.spawn - 0.01 * extra),
    hazard: base.hazard * Math.min(k, 2),
    bossHp: base.bossHp * k,
  }
}

/** Boss health grows by a third of its base every five floors. */
export function floorBossMultiplier(floor: number): number {
  return 1 + (0.33 * Math.floor(floor / DESCENT.bossEvery))
}

/** The zombies of one floor, boss last so it spawns first (the queue is popped from the end). */
export function buildFloor(floor: number, countMult: number): ZombieKind[] {
  const count = Math.round(Math.min(14 + floor * 3, 90) * countMult)
  const runner = Math.min(0.5, 0.15 + 0.02 * floor)
  const tank = Math.min(0.3, 0.04 + 0.015 * floor)
  const list: ZombieKind[] = []
  // the new families ramp in with the map this floor uses and with depth
  const fam = familyWeights(floorMap(floor), Math.max(floor, 3))
  for (let i = 0; i < count; i++) {
    const r = Math.random()
    let f: ZombieKind | null = null
    let acc = 0
    const fr = Math.random()
    for (const [kind, w] of fam) {
      acc += w
      if (fr < acc) {
        f = kind
        break
      }
    }
    if (f) list.push(f)
    else if (r < tank) list.push('tank')
    else if (r < tank + runner) list.push('runner')
    else list.push('walker')
  }
  if (isBossFloor(floor)) {
    const bosses = 1 + Math.floor(floor / 20)
    for (let i = 0; i < bosses; i++) list.push('boss')
  }
  return list
}
