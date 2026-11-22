import type { Chapter, Hazard } from './chapters'
import type { Rect } from './types'

const hw = (x: number, y: number, len: number, t = 40): Rect => ({ x, y, w: len, h: t })
const vw = (x: number, y: number, len: number, t = 40): Rect => ({ x, y, w: t, h: len })
const box = (x: number, y: number, s = 90): Rect => ({ x, y, w: s, h: s })
const toxic = (x: number, y: number, w: number, h: number): Hazard => ({ x, y, w, h, kind: 'toxic', dps: 9 })
const electric = (x: number, y: number, w: number, h: number): Hazard => ({ x, y, w, h, kind: 'electric', dps: 14 })

/**
 * Armory trials: three boss arenas, each opens a heavy weapon for every later run.
 * They sit after the seven story chapters in the map list (indexes 7, 8 and 9).
 */
const HATCHERY: Chapter = {
  id: 8,
  name: 'Toxic Hatchery',
  subtitle: 'Egg pods and acid pools. Plague Mother guards the Venom Cannon.',
  world: { w: 2200, h: 1500 },
  spawn: { x: 1100, y: 750 },
  waves: 3,
  bossWaves: [3],
  count: 18,
  boss: { name: 'PLAGUE MOTHER', flesh: '#6E8A3C', aura: '120,255,60' },
  theme: {
    ground: '#1E2A20', patch: 'rgba(120,255,80,0.10)', patchKind: 'toxic',
    road: '#2A3A2C', roadLine: 'rgba(160,255,120,0.3)',
    wallBase: '#2B3A2D', wallFace: '#5E8A5A', wallLight: 'rgba(200,255,200,0.2)',
    crate: '#6A8A5A', crateDark: '#2A3C28', border: '#070D08',
    dark: '4,10,5', darkAlpha: 0.7, lightRadius: 420, weather: 'spores',
  },
  obstacles: [
    hw(300, 250, 500), hw(1400, 250, 500), hw(300, 1210, 500), hw(1400, 1210, 500),
    vw(250, 500, 300), vw(1910, 500, 300), vw(250, 950, 160), vw(1910, 950, 160),
    box(620, 420), box(1490, 420), box(620, 1000), box(1490, 1000), box(1050, 330, 100), box(1050, 1070, 100),
  ],
  roads: [{ x: 0, y: 710, w: 2200, h: 80 }],
  hazards: [toxic(480, 640, 200, 160), toxic(1520, 640, 200, 160), toxic(900, 480, 260, 110), toxic(900, 910, 260, 110)],
  trial: { weapon: 'venom', bossMult: 1.5, requires: 1, title: 'Trial I' },
}

const REACTOR: Chapter = {
  id: 9,
  name: 'Storm Reactor',
  subtitle: 'Live conduits cross the floor. Storm Colossus holds the Tesla Gun.',
  world: { w: 2200, h: 1500 },
  spawn: { x: 1100, y: 750 },
  waves: 3,
  bossWaves: [3],
  count: 20,
  boss: { name: 'STORM COLOSSUS', flesh: '#6A8AB8', aura: '120,200,255' },
  theme: {
    ground: '#1B2230', patch: 'rgba(120,180,255,0.12)', patchKind: 'ash',
    road: '#262E40', roadLine: 'rgba(150,220,255,0.4)',
    wallBase: '#252D3F', wallFace: '#506488', wallLight: 'rgba(170,210,255,0.2)',
    crate: '#6F7F98', crateDark: '#2B3445', border: '#05070C',
    dark: '3,5,12', darkAlpha: 0.72, lightRadius: 400, weather: null,
  },
  obstacles: [
    box(700, 430), box(1410, 430), box(700, 980), box(1410, 980),
    hw(450, 250, 360), hw(1390, 250, 360), hw(450, 1210, 360), hw(1390, 1210, 360),
    vw(300, 560, 380), vw(1860, 560, 380),
  ],
  roads: [{ x: 1060, y: 0, w: 80, h: 1500 }],
  hazards: [electric(300, 740, 500, 60), electric(1400, 740, 500, 60), electric(1070, 200, 60, 360), electric(1070, 940, 60, 360)],
  trial: { weapon: 'tesla', bossMult: 1.4, requires: 3, title: 'Trial II' },
}

const VAULT: Chapter = {
  id: 10,
  name: 'Frozen Vault',
  subtitle: 'Sealed ice chambers. Cryo Titan keeps the Cryo Cannon.',
  world: { w: 2200, h: 1500 },
  spawn: { x: 1100, y: 750 },
  waves: 3,
  bossWaves: [3],
  count: 22,
  boss: { name: 'CRYO TITAN', flesh: '#8FC4E8', aura: '140,220,255' },
  theme: {
    ground: '#8FA3B5', patch: 'rgba(255,255,255,0.35)', patchKind: 'snow',
    road: '#7C90A3', roadLine: 'rgba(255,255,255,0.45)',
    wallBase: '#4E6A88', wallFace: '#8FB4D8', wallLight: 'rgba(255,255,255,0.3)',
    crate: '#A9C8E4', crateDark: '#5C7A98', border: '#1C2836',
    dark: '10,18,30', darkAlpha: 0.5, lightRadius: 500, weather: 'snow',
  },
  obstacles: [
    // four ice chambers around the centre, each open on the side facing the middle
    hw(300, 300, 420), vw(300, 300, 280), hw(1480, 300, 420), vw(1860, 300, 280),
    hw(300, 1160, 420), vw(300, 920, 280), hw(1480, 1160, 420), vw(1860, 920, 280),
    box(1010, 330, 90), box(1010, 1080, 90), box(560, 710, 80), box(1560, 710, 80),
    box(780, 520, 70), box(1350, 520, 70), box(780, 920, 70), box(1350, 920, 70),
  ],
  roads: [{ x: 0, y: 710, w: 2200, h: 80 }],
  hazards: [],
  trial: { weapon: 'cryo', bossMult: 1.3, requires: 5, title: 'Trial III' },
}

export const TRIALS: Chapter[] = [HATCHERY, REACTOR, VAULT]
