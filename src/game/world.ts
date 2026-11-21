import { CHAPTERS, type Chapter, type Hazard } from './chapters'
import { TRIALS } from './trials'
import type { Rect } from './types'

export interface Obstacle extends Rect {
  /** Small blocks are drawn as crates, long ones as walls. */
  crate: boolean
}

/** The map of the chapter being played. Other modules read it at call time. */
export const activeMap: {
  index: number
  chapter: Chapter
  w: number
  h: number
  obstacles: Obstacle[]
  roads: readonly Rect[]
  hazards: readonly Hazard[]
} = {
  index: 0,
  chapter: CHAPTERS[0],
  w: CHAPTERS[0].world.w,
  h: CHAPTERS[0].world.h,
  obstacles: [],
  roads: [],
  hazards: [],
}

/** Story chapters first, then the armory trial arenas. */
export const ALL_MAPS: Chapter[] = [...CHAPTERS, ...TRIALS]

export function setChapter(index: number) {
  const i = Math.max(0, Math.min(ALL_MAPS.length - 1, index))
  const c = ALL_MAPS[i]
  activeMap.index = i
  activeMap.chapter = c
  activeMap.w = c.world.w
  activeMap.h = c.world.h
  activeMap.obstacles = c.obstacles.map((o) => ({ ...o, crate: o.w <= 130 && o.h <= 130 }))
  activeMap.roads = c.roads
  activeMap.hazards = c.hazards
}

setChapter(0)

export function hash2(x: number, y: number): number {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return h - Math.floor(h)
}
