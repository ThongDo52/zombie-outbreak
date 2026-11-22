import { freeSpot } from './collision'
import { CHAPTERS, type Chapter } from './chapters'
import { ZOMBIES } from './config'
import type { Vec, Zombie, ZombieKind } from './types'

/**
 * Where each family starts to show up (chapter index, wave) and how common it is.
 * The first chapter introduces them one at a time; later chapters mix all of them.
 */
const FAMILIES: { kind: ZombieKind; chapter: number; wave: number; weight: number }[] = [
  { kind: 'spitter', chapter: 0, wave: 2, weight: 0.07 },
  { kind: 'shielder', chapter: 0, wave: 2, weight: 0.045 },
  { kind: 'exploder', chapter: 0, wave: 3, weight: 0.06 },
  { kind: 'leaper', chapter: 0, wave: 3, weight: 0.045 },
  { kind: 'lurker', chapter: 1, wave: 1, weight: 0.06 },
  { kind: 'brood', chapter: 1, wave: 2, weight: 0.035 },
  { kind: 'screamer', chapter: 1, wave: 3, weight: 0.028 },
  { kind: 'bloater', chapter: 2, wave: 1, weight: 0.05 },
  { kind: 'mortar', chapter: 2, wave: 2, weight: 0.035 },
  { kind: 'shaman', chapter: 3, wave: 2, weight: 0.035 },
]

/** However many families there are, they never make up more than this share of a wave. */
const FAMILY_CAP = 0.46

/** The families that can appear in this wave, with their share of the horde. Later chapters and waves have more of them. */
export function familyWeights(chapterIndex: number, wave: number): [ZombieKind, number][] {
  const out: [ZombieKind, number][] = []
  let total = 0
  for (const f of FAMILIES) {
    if (chapterIndex < f.chapter || (chapterIndex === f.chapter && wave < f.wave)) continue
    const w = f.weight * (1 + 0.12 * chapterIndex) * Math.min(2, 1 + 0.02 * wave)
    out.push([f.kind, w])
    total += w
  }
  // the horde stays mostly the plain kinds, so the special ones stand out
  const scale = total > FAMILY_CAP ? FAMILY_CAP / total : 1
  return out.map(([k, w]) => [k, w * scale])
}

/** Roll one zombie from the families, or nothing (the usual kinds then take the roll). */
function rollFamily(fam: [ZombieKind, number][], r: number): ZombieKind | null {
  let acc = 0
  for (const [kind, w] of fam) {
    acc += w
    if (r < acc) return kind
  }
  return null
}

/** Build the list of zombies for a wave of the given chapter. */
export function buildWave(chapter: Chapter, chapterIndex: number, wave: number, countMult = 1, survival = false): ZombieKind[] {
  const count = Math.round(Math.min(chapter.count + wave * 5, survival ? 150 : 110) * countMult)
  const first = chapterIndex === 0
  // deep survival waves lean on the faster and tougher kinds
  const deep = survival ? Math.min(0.2, 0.008 * wave) : 0
  const runnerChance = (first ? (wave >= 2 ? 0.25 : 0) : 0.25 + 0.05 * chapterIndex) + deep
  const tankChance = (first ? (wave >= 3 ? 0.08 : 0) : 0.08 + 0.04 * chapterIndex) + deep / 2
  const list: ZombieKind[] = []
  const fam = familyWeights(chapterIndex, wave)
  for (let i = 0; i < count; i++) {
    const r = Math.random()
    const f = rollFamily(fam, Math.random())
    if (f) list.push(f)
    else if (r < tankChance) list.push('tank')
    else if (r < tankChance + runnerChance) list.push('runner')
    else list.push('walker')
  }
  // Boss waves: the boss goes last so it is the first to spawn (the queue is popped from the end).
  const bossNow = survival ? wave % 5 === 0 : chapter.bossWaves.includes(wave)
  if (bossNow) {
    const finalOfLastChapter = !survival && chapterIndex === CHAPTERS.length - 1 && wave === chapter.waves
    const bosses = finalOfLastChapter ? 2 : survival && wave >= 20 ? 2 : 1
    for (let i = 0; i < bosses; i++) list.push('boss')
  }
  return list
}

/** Boss health grows with the chapter, and the chapter finale hits harder. */
export function bossHealthMultiplier(chapterIndex: number, finale: boolean): number {
  return (1 + 0.35 * chapterIndex) * (finale ? 1.4 : 1)
}

/** Spawn away from the player, anywhere on the large map. */
export function createZombie(id: number, kind: ZombieKind, level: number, player: Vec, bossMult = 1, hpMult = 1): Zombie {
  const { x, y } = freeSpot(player.x, player.y, 560, 1500, ZOMBIES[kind].size + 12)
  return createZombieAt(id, kind, level, x, y, bossMult, hpMult)
}

export function createZombieAt(id: number, kind: ZombieKind, level: number, x: number, y: number, bossMult = 1, hpMult = 1): Zombie {
  const def = ZOMBIES[kind]
  const hp = kind === 'boss' ? Math.round(def.hp * bossMult) : Math.round(def.hp * (1 + 0.08 * (level - 1)) * hpMult)
  return {
    id,
    kind,
    x,
    y,
    w: def.size,
    h: def.size,
    hp,
    maxHp: hp,
    state: 'chase',
    stateTime: 0,
    stateDur: 0,
    vx: 0,
    vy: 0,
    flash: 0,
    aim: { x: 1, y: 0 },
    cooldown: kind === 'boss' ? 2.5 : undefined,
    summons: kind === 'boss' ? 0 : undefined,
  }
}
