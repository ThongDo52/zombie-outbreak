import { LATE_CHAPTERS } from './chapters-late'
import type { Rect, Vec, WeaponId } from './types'

export interface Hazard extends Rect {
  kind: 'toxic' | 'lava' | 'electric'
  /** Damage per second to the player standing in it. */
  dps: number
}

export interface Theme {
  ground: string
  patch: string
  patchKind: 'grass' | 'snow' | 'toxic' | 'ash'
  road: string
  roadLine: string
  wallBase: string
  wallFace: string
  wallLight: string
  crate: string
  crateDark: string
  border: string
  /** r,g,b of the night overlay and how strong it gets at the screen edge. */
  dark: string
  darkAlpha: number
  lightRadius: number
  weather: 'snow' | 'spores' | 'embers' | null
}

export interface Chapter {
  id: number
  name: string
  subtitle: string
  world: { w: number; h: number }
  spawn: Vec
  waves: number
  bossWaves: number[]
  /** Base zombie count for the chapter. */
  count: number
  boss: { name: string; flesh: string; aura: string }
  theme: Theme
  obstacles: Rect[]
  roads: Rect[]
  hazards: Hazard[]
  /** Armory trial maps only: beat the boss to earn this heavy weapon. `requires` is the story chapter (index) to clear first. */
  trial?: { weapon: WeaponId; bossMult: number; requires: number; title: string }
}

const hw = (x: number, y: number, len: number, t = 40): Rect => ({ x, y, w: len, h: t })
const vw = (x: number, y: number, len: number, t = 40): Rect => ({ x, y, w: t, h: len })
const box = (x: number, y: number, s = 80): Rect => ({ x, y, w: s, h: s })
const lava = (x: number, y: number, w: number, h: number): Hazard => ({ x, y, w, h, kind: 'lava', dps: 18 })
const toxic = (x: number, y: number, w: number, h: number): Hazard => ({ x, y, w, h, kind: 'toxic', dps: 9 })

const SUBURB: Chapter = {
  id: 1,
  name: 'Dead Suburb',
  subtitle: 'The outbreak starts here. Earn coins, buy a gun and hold the street.',
  world: { w: 2400, h: 1500 },
  spawn: { x: 1200, y: 750 },
  waves: 4,
  bossWaves: [4],
  count: 14,
  boss: { name: 'BRUTE KING', flesh: '#85606A', aura: '150,40,90' },
  theme: {
    ground: '#26302B', patch: 'rgba(94,140,74,0.28)', patchKind: 'grass',
    road: '#323A44', roadLine: 'rgba(255,214,90,0.55)',
    wallBase: '#2E3547', wallFace: '#596580', wallLight: 'rgba(255,255,255,0.12)',
    crate: '#A67C4E', crateDark: '#5A4128', border: '#0D1314',
    dark: '3,7,12', darkAlpha: 0.7, lightRadius: 470, weather: null,
  },
  obstacles: [
    { x: 400, y: 300, w: 200, h: 40 }, { x: 400, y: 300, w: 40, h: 200 }, { x: 900, y: 200, w: 60, h: 260 },
    { x: 1500, y: 260, w: 260, h: 50 }, { x: 1900, y: 200, w: 40, h: 300 }, { x: 300, y: 900, w: 260, h: 50 },
    { x: 700, y: 1050, w: 50, h: 250 }, { x: 1000, y: 1150, w: 300, h: 50 }, { x: 1600, y: 900, w: 50, h: 300 },
    { x: 1650, y: 900, w: 260, h: 50 }, { x: 2000, y: 1000, w: 200, h: 60 }, { x: 1250, y: 500, w: 120, h: 120 },
    { x: 1050, y: 850, w: 120, h: 60 }, { x: 500, y: 600, w: 80, h: 80 }, { x: 1800, y: 600, w: 100, h: 100 },
    { x: 2150, y: 400, w: 60, h: 200 }, { x: 150, y: 1250, w: 300, h: 50 }, { x: 2000, y: 1300, w: 300, h: 40 },
  ],
  roads: [
    { x: 0, y: 700, w: 2400, h: 110 },
    { x: 1150, y: 0, w: 100, h: 1500 },
  ],
  hazards: [],
}

const OUTPOST: Chapter = {
  id: 2,
  name: 'Frozen Outpost',
  subtitle: 'A blizzard hides the horde. Hold the walled compound.',
  world: { w: 2800, h: 1700 },
  spawn: { x: 1400, y: 850 },
  waves: 5,
  bossWaves: [3, 5],
  count: 18,
  boss: { name: 'FROST WARDEN', flesh: '#7C9DB5', aura: '90,170,255' },
  theme: {
    ground: '#7F94A8', patch: 'rgba(255,255,255,0.32)', patchKind: 'snow',
    road: '#6A7C8E', roadLine: 'rgba(255,255,255,0.45)',
    wallBase: '#2F3F52', wallFace: '#5E7690', wallLight: 'rgba(255,255,255,0.3)',
    crate: '#8FA7B8', crateDark: '#3A4E60', border: '#1B2733',
    dark: '8,18,34', darkAlpha: 0.72, lightRadius: 400, weather: 'snow',
  },
  obstacles: [
    // central compound with four gates
    hw(1100, 560, 240), hw(1460, 560, 240), hw(1100, 1100, 240), hw(1460, 1100, 240),
    vw(1100, 600, 180), vw(1100, 920, 180), vw(1660, 600, 180), vw(1660, 920, 180),
    box(1220, 680, 70), box(1500, 980, 70),
    // outer containers and lanes
    hw(300, 300, 200, 60), vw(600, 200, 200, 60), hw(2200, 260, 240, 60), vw(2400, 500, 240, 60),
    hw(300, 1300, 260, 60), vw(700, 1400, 200, 60), hw(2100, 1350, 260, 60), vw(2450, 1200, 240, 60),
    box(900, 900, 100), box(1900, 500, 100), box(1900, 1150, 100), { x: 500, y: 800, w: 120, h: 120 },
    hw(500, 600, 300), hw(1900, 800, 300), vw(800, 300, 260), vw(2000, 1250, 260),
    hw(1000, 250, 300), hw(1500, 1450, 300),
  ],
  roads: [
    { x: 0, y: 810, w: 2800, h: 80 },
    { x: 1360, y: 0, w: 80, h: 1700 },
  ],
  hazards: [],
}

const WASTELAND: Chapter = {
  id: 3,
  name: 'Toxic Wasteland',
  subtitle: 'Acid pools eat through boots, and mortars shell you from behind the horde.',
  world: { w: 3000, h: 1800 },
  spawn: { x: 1500, y: 900 },
  waves: 6,
  bossWaves: [3, 6],
  count: 22,
  boss: { name: 'TOXIC BEHEMOTH', flesh: '#6F8B3E', aura: '130,255,60' },
  theme: {
    ground: '#2B2B20', patch: 'rgba(150,200,60,0.22)', patchKind: 'toxic',
    road: '#3A3A30', roadLine: 'rgba(200,220,80,0.45)',
    wallBase: '#3A3F2C', wallFace: '#6A7550', wallLight: 'rgba(220,255,140,0.18)',
    crate: '#9A8F52', crateDark: '#4B4524', border: '#10120A',
    dark: '6,12,4', darkAlpha: 0.72, lightRadius: 440, weather: 'spores',
  },
  obstacles: [
    hw(300, 300, 400), vw(300, 300, 300), hw(900, 450, 300), vw(1200, 150, 300),
    box(1700, 300, 120), box(1820, 300, 120), hw(2200, 350, 400), vw(2560, 350, 300),
    vw(500, 800, 300), hw(500, 1100, 260), box(900, 900, 140), box(1000, 1050, 100),
    hw(1250, 700, 160), hw(1590, 700, 160), hw(1250, 1060, 160), hw(1590, 1060, 160),
    vw(2000, 800, 300), hw(2000, 1100, 300), box(2500, 900, 130), vw(2800, 700, 400),
    hw(300, 1500, 400), vw(800, 1500, 200), hw(1300, 1550, 300), box(1800, 1400, 120),
    hw(2200, 1500, 400), vw(2500, 1300, 300), box(1100, 1350, 100),
  ],
  roads: [{ x: 0, y: 860, w: 3000, h: 80 }],
  hazards: [
    toxic(500, 500, 300, 200), toxic(2300, 400, 320, 200), toxic(1100, 1250, 360, 220),
    toxic(2200, 1250, 300, 260), toxic(650, 1350, 260, 160), toxic(1450, 300, 240, 160),
    toxic(150, 800, 180, 260), toxic(2650, 1000, 200, 240),
  ],
}

const RUINS: Chapter = {
  id: 4,
  name: 'Hellfire Ruins',
  subtitle: 'Lava rivers split the city. Shamans shield the horde: break them first.',
  world: { w: 3200, h: 2000 },
  spawn: { x: 1600, y: 1000 },
  waves: 7,
  bossWaves: [4, 7],
  count: 26,
  boss: { name: 'HELLFIRE TYRANT', flesh: '#A5442C', aura: '255,90,30' },
  theme: {
    ground: '#2A1D1D', patch: 'rgba(255,90,40,0.16)', patchKind: 'ash',
    road: '#3A2A2A', roadLine: 'rgba(255,150,80,0.4)',
    wallBase: '#35282A', wallFace: '#6A4A48', wallLight: 'rgba(255,180,140,0.18)',
    crate: '#7A5A4A', crateDark: '#3A2620', border: '#0E0707',
    dark: '14,4,4', darkAlpha: 0.74, lightRadius: 430, weather: 'embers',
  },
  obstacles: [
    hw(300, 300, 300), vw(300, 300, 240), hw(1000, 250, 260), box(1450, 300, 110), vw(1800, 150, 300),
    hw(2100, 300, 300), vw(2700, 300, 280), box(2400, 500, 100),
    hw(300, 800, 260), vw(550, 1000, 260), box(300, 1200, 120), hw(900, 800, 200),
    hw(2200, 800, 260), vw(2600, 1000, 240), box(2700, 1200, 120), hw(2000, 1000, 160),
    hw(1250, 880, 100), hw(1850, 880, 100), hw(1250, 1120, 100), hw(1850, 1120, 100),
    hw(300, 1650, 300), vw(300, 1500, 200), hw(1000, 1700, 260), box(1450, 1650, 110),
    vw(1800, 1500, 300), hw(2100, 1700, 300), vw(2700, 1500, 280), box(2400, 1500, 100),
    box(1000, 1000, 100), box(2200, 1000, 100),
  ],
  roads: [
    { x: 0, y: 960, w: 3200, h: 80 },
    { x: 1560, y: 0, w: 80, h: 2000 },
  ],
  hazards: [
    // two lava rivers, each with a wide bridge across the middle
    lava(800, 100, 140, 760), lava(800, 1140, 140, 760),
    lava(2260, 100, 140, 760), lava(2260, 1140, 140, 760),
    // pools above and below the spawn plaza
    lava(1000, 560, 480, 100), lava(1720, 560, 480, 100),
    lava(1000, 1340, 480, 100), lava(1720, 1340, 480, 100),
  ],
}

export const CHAPTERS: readonly Chapter[] = [SUBURB, OUTPOST, WASTELAND, RUINS, ...LATE_CHAPTERS]

/** Cumulative wave counts, so difficulty keeps rising across chapters. */
export const LEVEL_OFFSETS: readonly number[] = CHAPTERS.map((_, i) => CHAPTERS.slice(0, i).reduce((s, c) => s + c.waves, 0))
