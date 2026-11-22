import type { Chapter, Hazard } from './chapters'
import type { Rect } from './types'

const hw = (x: number, y: number, len: number, t = 40): Rect => ({ x, y, w: len, h: t })
const vw = (x: number, y: number, len: number, t = 40): Rect => ({ x, y, w: t, h: len })
const box = (x: number, y: number, s = 80): Rect => ({ x, y, w: s, h: s })
const lava = (x: number, y: number, w: number, h: number): Hazard => ({ x, y, w, h, kind: 'lava', dps: 18 })
const toxic = (x: number, y: number, w: number, h: number): Hazard => ({ x, y, w, h, kind: 'toxic', dps: 9 })
const electric = (x: number, y: number, w: number, h: number): Hazard => ({ x, y, w, h, kind: 'electric', dps: 14 })

/** Chapter 5: three parallel tunnels, live rails on the floor. */
const METRO: Chapter = {
  id: 5,
  name: 'Sunken Metro',
  subtitle: 'Dark tunnels and live rails. Save your coins for the heavy guns.',
  world: { w: 3400, h: 1800 },
  spawn: { x: 1700, y: 900 },
  waves: 8,
  bossWaves: [4, 8],
  count: 28,
  boss: { name: 'TUNNEL STALKER', flesh: '#5C6B8A', aura: '80,140,255' },
  theme: {
    ground: '#1C212B', patch: 'rgba(90,120,200,0.14)', patchKind: 'ash',
    road: '#262C38', roadLine: 'rgba(120,180,255,0.35)',
    wallBase: '#262E3F', wallFace: '#4A5A78', wallLight: 'rgba(160,200,255,0.18)',
    crate: '#6B7A8F', crateDark: '#2C3442', border: '#06080C',
    dark: '2,4,10', darkAlpha: 0.8, lightRadius: 360, weather: null,
  },
  obstacles: [
    // walls between the upper tunnel, the concourse and the lower tunnel (doorways between segments)
    hw(100, 600, 600), hw(900, 600, 600), hw(1700, 600, 600), hw(2500, 600, 800),
    hw(100, 1160, 800), hw(1100, 1160, 800), hw(2100, 1160, 600), hw(2900, 1160, 400),
    // pillars on the concourse
    box(500, 860), box(1000, 860), box(2400, 860), box(2900, 860), box(750, 700, 70), box(2650, 1040, 70),
    // cargo in the tunnels
    box(600, 200, 90), box(1500, 400, 90), box(2600, 220, 90), hw(1200, 150, 200),
    box(800, 1500, 90), box(2000, 1330, 90), box(2800, 1560, 90), hw(1300, 1600, 240),
  ],
  roads: [{ x: 0, y: 860, w: 3400, h: 80 }],
  hazards: [
    electric(150, 340, 650, 50), electric(1000, 340, 1000, 50), electric(2350, 340, 800, 50),
    electric(150, 1420, 850, 50), electric(1250, 1420, 1000, 50), electric(2550, 1420, 700, 50),
  ],
}

/** Chapter 6: a block of rooftops split by narrow alleys, fires at the junctions. */
function rooftopBlocks(): Rect[] {
  const out: Rect[] = []
  const xs = [200, 760, 1320, 1880, 2440, 3000]
  const ys = [200, 640, 1080, 1520]
  for (const y of ys) {
    for (const x of xs) {
      const plaza = (x === 1320 || x === 1880) && (y === 640 || y === 1080)
      if (!plaza) out.push({ x, y, w: 360, h: 240 })
    }
  }
  return out
}

const ROOFTOPS: Chapter = {
  id: 6,
  name: 'Quarantine Rooftops',
  subtitle: 'Walled alleys and burning vents. Nowhere to run, so make every coin count.',
  world: { w: 3600, h: 2000 },
  spawn: { x: 1780, y: 980 },
  waves: 9,
  bossWaves: [3, 6, 9],
  count: 32,
  boss: { name: 'ROOFTOP WARDEN', flesh: '#8A5C3A', aura: '255,160,60' },
  theme: {
    ground: '#2A2733', patch: 'rgba(255,140,60,0.12)', patchKind: 'ash',
    road: '#37323F', roadLine: 'rgba(255,200,120,0.3)',
    wallBase: '#3A3446', wallFace: '#7A6A8A', wallLight: 'rgba(255,220,200,0.2)',
    crate: '#8A6A50', crateDark: '#3E2E26', border: '#0B0910',
    dark: '10,6,14', darkAlpha: 0.66, lightRadius: 470, weather: 'embers',
  },
  obstacles: [...rooftopBlocks(), box(1500, 760), box(2000, 1180), box(1500, 1200)],
  roads: [
    { x: 0, y: 440, w: 3600, h: 200 }, { x: 0, y: 880, w: 3600, h: 200 }, { x: 0, y: 1320, w: 3600, h: 200 },
    { x: 560, y: 0, w: 200, h: 2000 }, { x: 1120, y: 0, w: 200, h: 2000 }, { x: 1680, y: 0, w: 200, h: 2000 },
    { x: 2240, y: 0, w: 200, h: 2000 }, { x: 2800, y: 0, w: 200, h: 2000 },
  ],
  hazards: [
    lava(615, 495, 90, 90), lava(1175, 935, 90, 90), lava(2295, 495, 90, 90),
    lava(2855, 935, 90, 90), lava(615, 1375, 90, 90), lava(2295, 1375, 90, 90), lava(1735, 1375, 90, 90),
  ],
}

/** Chapter 7: the lab. A sealed inner chamber, four wings, acid vats and live floors. Final boss. */
const LAB: Chapter = {
  id: 7,
  name: 'Patient Zero Lab',
  subtitle: 'The source of the outbreak. Everything you have learned ends here.',
  world: { w: 3600, h: 2200 },
  spawn: { x: 1800, y: 1100 },
  waves: 10,
  bossWaves: [5, 10],
  count: 36,
  boss: { name: 'PATIENT ZERO', flesh: '#A8587E', aura: '255,60,160' },
  theme: {
    ground: '#1E2A2A', patch: 'rgba(255,60,160,0.10)', patchKind: 'toxic',
    road: '#2B3838', roadLine: 'rgba(255,120,200,0.35)',
    wallBase: '#2A3A3C', wallFace: '#5C8A8A', wallLight: 'rgba(200,255,255,0.2)',
    crate: '#6A8A8A', crateDark: '#2A3C3C', border: '#070D0D',
    dark: '4,10,10', darkAlpha: 0.72, lightRadius: 430, weather: 'spores',
  },
  obstacles: [
    // inner chamber with four gates
    hw(1480, 780, 200), hw(1920, 780, 200), hw(1480, 1420, 200), hw(1920, 1420, 200),
    vw(1480, 780, 200), vw(1480, 1220, 200), vw(2120, 780, 200), vw(2120, 1220, 200),
    // north-west wing
    hw(200, 200, 1000), vw(200, 200, 600), hw(200, 760, 400), hw(800, 760, 400), vw(1160, 200, 200), vw(1160, 600, 200),
    // north-east wing
    hw(2400, 200, 1000), vw(3360, 200, 600), hw(2400, 760, 400), hw(3000, 760, 400), vw(2400, 200, 200), vw(2400, 600, 200),
    // south-west wing
    hw(200, 1960, 1000), vw(200, 1400, 600), hw(200, 1400, 400), hw(800, 1400, 400), vw(1160, 1400, 200), vw(1160, 1800, 200),
    // south-east wing
    hw(2400, 1960, 1000), vw(3360, 1400, 600), hw(2400, 1400, 400), hw(3000, 1400, 400), vw(2400, 1400, 200), vw(2400, 1800, 200),
    // lab equipment
    box(1250, 600), box(2300, 600), box(1250, 1500), box(2300, 1500),
    box(420, 330), box(900, 560, 90), box(2900, 330), box(2600, 560, 90), box(420, 1550), box(900, 1700, 90), box(2900, 1550), box(2600, 1700, 90),
  ],
  roads: [{ x: 0, y: 1060, w: 3600, h: 80 }, { x: 1760, y: 0, w: 80, h: 2200 }],
  hazards: [
    toxic(520, 420, 300, 200), toxic(2780, 420, 300, 200), toxic(520, 1620, 300, 200), toxic(2780, 1620, 300, 200),
    electric(1180, 1070, 260, 60), electric(2160, 1070, 260, 60), electric(1690, 620, 220, 60), electric(1690, 1520, 220, 60),
  ],
}

export const LATE_CHAPTERS: readonly Chapter[] = [METRO, ROOFTOPS, LAB]
