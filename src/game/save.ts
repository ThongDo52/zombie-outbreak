import { DEFAULT_CLASS, isClassId, type ClassId } from './classes'
import { CHAPTERS } from './chapters'
import { HEAVY_WEAPONS } from './config'
import { DIFFICULTIES, type Difficulty } from './difficulty'
import { Game } from './engine'
import { TRIALS } from './trials'
import type { SavedRun, WeaponId } from './types'

const SAVE_KEY = 'zombie-run-save'
const MAX_AGE_MS = 6 * 60 * 60 * 1000

declare global {
  interface Window {
    __zombieGame?: Game
  }
}

/**
 * One Game instance for the whole page. Hot module reloads re-mount the React
 * component, so keeping the instance outside it stops a running game from being reset.
 */
export function getGame(): Game {
  const existing = window.__zombieGame
  if (existing instanceof Game) return existing
  const game = new Game()
  window.__zombieGame = game
  return game
}

export function saveRun(game: Game) {
  const run = game.serialize()
  if (!run) return
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(run))
  } catch {
    // storage full or unavailable: the game still works without resume
  }
}

export function clearRun() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // ignore
  }
}

export function loadRun(): SavedRun | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const run = JSON.parse(raw) as Partial<SavedRun>
    const valid =
      (run.v === 2 || run.v === 3) &&
      typeof run.chapterIndex === 'number' &&
      typeof run.savedAt === 'number' &&
      Date.now() - run.savedAt < MAX_AGE_MS &&
      typeof run.wave === 'number' &&
      typeof run.score === 'number' &&
      Boolean(run.player) &&
      Array.isArray(run.zombies) &&
      Array.isArray(run.pickups) &&
      Array.isArray(run.spawnQueue)
    return valid ? (run as SavedRun) : null
  } catch {
    return null
  }
}

const OLD_PROGRESS_KEY = 'zombie-unlocked'
const PROGRESS_KEY = 'zombie-progress-v2'

/** Which difficulties have been cleared in each chapter (by chapter index). */
export type Progress = Record<number, Difficulty[]>

function progressKey(owner: string): string {
  return `${PROGRESS_KEY}:${owner.toLowerCase()}`
}

/** Progress for a wallet address (or "guest"). Old single-number saves are migrated once. */
export function loadProgress(owner = 'guest'): Progress {
  try {
    const raw = localStorage.getItem(progressKey(owner))
    if (raw) {
      const parsed = JSON.parse(raw) as Progress
      const out: Progress = {}
      for (const [k, v] of Object.entries(parsed)) {
        out[Number(k)] = (Array.isArray(v) ? v : []).filter((d): d is Difficulty => DIFFICULTIES.includes(d))
      }
      return out
    }
    const old = Number(localStorage.getItem(OLD_PROGRESS_KEY))
    const out: Progress = {}
    if (Number.isFinite(old) && old > 1) {
      for (let i = 0; i < Math.min(old - 1, CHAPTERS.length); i++) out[i] = ['normal']
    }
    return out
  } catch {
    return {}
  }
}

export function markCleared(owner: string, chapter: number, difficulty: Difficulty): Progress {
  const progress = loadProgress(owner)
  const list = new Set(progress[chapter] ?? [])
  list.add(difficulty)
  progress[chapter] = DIFFICULTIES.filter((d) => list.has(d))
  try {
    localStorage.setItem(progressKey(owner), JSON.stringify(progress))
  } catch {
    // storage unavailable: progress simply is not saved
  }
  return progress
}

/** Normal opens when the chapter before it has been cleared; Hard after Normal; Extreme after Hard. */
export function isUnlocked(progress: Progress, chapter: number, difficulty: Difficulty): boolean {
  if (chapter < 0 || chapter >= CHAPTERS.length) return false
  const cleared = progress[chapter] ?? []
  if (difficulty === 'normal') return chapter === 0 || (progress[chapter - 1] ?? []).length > 0 || cleared.length > 0
  if (difficulty === 'hard') return cleared.includes('normal')
  return cleared.includes('hard')
}

// ---------- Armory: heavy weapons earned in trials ----------

const ARMORY_KEY = 'zombie-armory-v1'
const armoryKey = (owner: string) => `${ARMORY_KEY}:${owner.toLowerCase()}`

/** The heavy weapons this wallet (or this browser, as a guest) has earned. */
export function loadArmory(owner = 'guest'): WeaponId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(armoryKey(owner)) ?? '[]') as unknown
    return Array.isArray(raw) ? HEAVY_WEAPONS.filter((w) => raw.includes(w)) : []
  } catch {
    return []
  }
}

export function unlockWeapon(owner: string, weapon: WeaponId): WeaponId[] {
  const list = new Set(loadArmory(owner))
  list.add(weapon)
  const out = HEAVY_WEAPONS.filter((w) => list.has(w))
  try {
    localStorage.setItem(armoryKey(owner), JSON.stringify(out))
  } catch {
    // storage unavailable: the unlock lasts until the page is closed
  }
  return out
}

/** A trial opens once you have cleared the story chapter that comes before it, on any difficulty. */
export function isTrialOpen(progress: Progress, trial: number): boolean {
  const req = TRIALS[trial]?.trial?.requires ?? 99
  return (progress[req] ?? []).length > 0
}

// ---------- Personal bests (clear times and Survival records) ----------

export interface RunRecord {
  /** Seconds: the fastest clear, or the longest survival. */
  time: number
  wave: number
}
export type Records = Record<string, RunRecord>
export interface RecordResult {
  isNew: boolean
  best: number
}

const recordsKey = (owner: string) => `zombie-records-v1:${owner.toLowerCase()}`

export const storyKey = (chapter: number, difficulty: Difficulty) => `s:${chapter}:${difficulty}`
export const survivalKey = (chapter: number, difficulty: Difficulty) => `v:${chapter}:${difficulty}`
export const trialKey = (trial: number) => `t:${trial}`

export function loadRecords(owner = 'guest'): Records {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(recordsKey(owner)) ?? '{}')
    if (!raw || typeof raw !== 'object') return {}
    const out: Records = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const r = v as Partial<RunRecord>
      if (typeof r?.time === 'number' && Number.isFinite(r.time) && r.time > 0) out[k] = { time: r.time, wave: Number(r.wave) || 0 }
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Keep a run if it beats the old best. A clear is better when it is faster ("low"),
 * a survival run is better when it lasts longer ("high").
 */
export function submitRecord(owner: string, key: string, time: number, wave: number, better: 'low' | 'high'): { records: Records; result: RecordResult } {
  const records = loadRecords(owner)
  const old = records[key]
  const t = Math.round(time * 10) / 10
  const beats = !old || (better === 'low' ? t < old.time : t > old.time)
  if (beats && t > 0) {
    records[key] = { time: t, wave }
    try {
      localStorage.setItem(recordsKey(owner), JSON.stringify(records))
    } catch {
      // storage can be full or blocked; the run still counts for this session
    }
  }
  return { records, result: { isNew: Boolean(beats && t > 0), best: records[key]?.time ?? t } }
}

// ---------- Chosen class ----------

const CLASS_KEY = 'zombie-class'

export function loadClass(): ClassId {
  try {
    const v = localStorage.getItem(CLASS_KEY)
    return isClassId(v) ? v : DEFAULT_CLASS
  } catch {
    return DEFAULT_CLASS
  }
}

export function saveClass(cls: ClassId) {
  try {
    localStorage.setItem(CLASS_KEY, cls)
  } catch {
    // the choice simply is not remembered
  }
}
