import { VIEW_H, VIEW_W, WEAPONS, ZOMBIES, bloodOf } from './config'
import type { Game } from './engine'
import { characterLook, hueColor } from './skins'
import type { BoomKind, GameEvent, Particle, ParticleKind, WeaponId } from './types'

/**
 * Everything that is only for show: particles, lights, floating text, stains on the ground and the coins
 * that fly to the counter. Solo play feeds this straight from the simulation; a co-op client feeds it from
 * the events the room sends, so both look the same. Nothing here changes the game.
 */

const MAX_PARTICLES = 1700
const MAX_EFFECTS = 170
const MAX_LIGHTS = 40
const MAX_COINS = 60

/** Where the coin counter sits on the screen (see hud.ts): flying coins head there. */
export const COIN_HOME = { x: 30, y: 77 } as const

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

function spawn(g: Game, p: Particle) {
  if (g.particles.length < MAX_PARTICLES) g.particles.push(p)
}

function part(x: number, y: number, angle: number, speed: number, life: number, size: number, color: string, kind?: ParticleKind, extra?: Partial<Particle>): Particle {
  return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, max: life, size, color, kind, ...extra }
}

function light(g: Game, x: number, y: number, r: number, color: string, life: number) {
  if (!(r > 0) || !(life > 0)) return
  if (g.lights.length >= MAX_LIGHTS) g.lights.shift()
  g.lights.push({ x, y, r, color, life, max: life })
}

/** Palettes of the five kinds of blast: bright core, body, dark edge, light colour, shock ring. */
const BOOM: Record<BoomKind, { core: string; mid: string; edge: string; light: string; ring: string; smoke: string; decal: 0 | 3 | 4 }> = {
  fire: { core: '#FFF3C4', mid: '#FFB04A', edge: '#FF5A1F', light: '255,170,80', ring: '#FFD9A0', smoke: '#2A2626', decal: 3 },
  acid: { core: '#F2FFB8', mid: '#9BE04A', edge: '#5E8A1E', light: '160,255,90', ring: '#C8FF7A', smoke: '#39461C', decal: 4 },
  frost: { core: '#FFFFFF', mid: '#BDF2FF', edge: '#7FD0FF', light: '160,220,255', ring: '#DFF8FF', smoke: '#9FB8C8', decal: 0 },
  arcane: { core: '#F4E8FF', mid: '#B98CFF', edge: '#6A3FBF', light: '185,140,255', ring: '#D6C8FF', smoke: '#3A2A5A', decal: 0 },
  stone: { core: '#F0ECE2', mid: '#B8AE9C', edge: '#7A7264', light: '210,200,180', ring: '#D8D0C0', smoke: '#6B6458', decal: 0 },
}

/** Turns a recorded event into particles, effects, lights, floating text, decals or a sound. */
export function applyEvent(g: Game, ev: GameEvent) {
  switch (ev.t) {
    case 'fx':
      if (!(ev.life > 0) || g.effects.length > MAX_EFFECTS) break // never let a runaway fight bury the screen
      g.effects.push({ kind: ev.kind, x: ev.x, y: ev.y, angle: ev.angle, size: ev.size, life: ev.life, max: ev.life, color: ev.color })
      break
    case 'burst':
      for (let i = 0; i < ev.n; i++) spawn(g, part(ev.x, ev.y, Math.random() * Math.PI * 2, rnd(60, 200), 0.4, rnd(2, 4), ev.color))
      break
    case 'text': {
      if (ev.slot !== undefined && ev.slot !== g.localId) break
      if (g.texts.length > 140) g.texts.shift()
      let y = ev.y
      // a callout that would land on a callout still on screen (two skills cast back to back) goes above it
      if (ev.big && ev.text.length > 3) {
        for (const t of g.texts) {
          if (t.big && t.text.length > 3 && t.life > 0.35 && Math.abs(t.x - ev.x) < 110 && t.y - y > -14 && t.y - y < 14) y = t.y - 20
        }
      }
      g.texts.push({ x: ev.x + (ev.big ? 0 : rnd(-6, 6)), y, text: ev.text, life: ev.big === 2 ? 1.6 : ev.big ? 1.1 : 0.9, color: ev.color, big: ev.big })
      break
    }
    case 'decal':
      g.decals.push({ x: ev.x, y: ev.y, r: ev.r, rot: ev.rot, kind: ev.kind })
      if (g.decals.length > 190) g.decals.shift()
      break
    case 'snd':
      g.onSound?.({ type: ev.type, x: ev.x, y: ev.y, kind: ev.kind })
      break
    case 'shake':
      if (ev.slot === undefined || ev.slot === g.localId) g.shake = Math.max(g.shake, ev.v)
      break
    case 'kill':
      killVisual(g, ev)
      break
    case 'spray': {
      // droplets thrown the way the blow was going
      const base = ev.dx === 0 && ev.dy === 0 ? null : Math.atan2(ev.dy, ev.dx)
      for (let i = 0; i < ev.n; i++) {
        const a = base === null ? Math.random() * Math.PI * 2 : base + rnd(-0.65, 0.65)
        spawn(g, part(ev.x, ev.y, a, rnd(70, 260), rnd(0.28, 0.55), rnd(2, 4.2), ev.color, 'dot', { drag: 0.006 }))
      }
      break
    }
    case 'spark': {
      const base = ev.dx === 0 && ev.dy === 0 ? null : Math.atan2(ev.dy, ev.dx)
      for (let i = 0; i < ev.n; i++) {
        const a = base === null ? Math.random() * Math.PI * 2 : base + rnd(-0.9, 0.9)
        spawn(g, part(ev.x, ev.y, a, rnd(150, 430), rnd(0.12, 0.3), rnd(1.4, 2.6), ev.color, 'spark', { drag: 0.02 }))
      }
      break
    }
    case 'boom':
      boom(g, ev.x, ev.y, ev.size, ev.kind ?? 'fire')
      break
    case 'gib':
      gib(g, ev)
      break
    case 'coin':
      for (let i = 0; i < ev.n && g.coinFx.length < MAX_COINS; i++) {
        const a = Math.random() * Math.PI * 2
        const s = rnd(90, 210)
        g.coinFx.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, t: -i * 0.035 })
      }
      break
    case 'light':
      light(g, ev.x, ev.y, ev.r, ev.color, ev.life)
      break
  }
}

/** A blast in layers: a white flash, a fireball, a shock ring, sparks, debris, smoke that lingers, a light and a mark on the ground. */
function boom(g: Game, x: number, y: number, size: number, kind: BoomKind) {
  const c = BOOM[kind]
  const k = Math.max(0.5, Math.min(2.2, size / 160))
  if (g.effects.length <= MAX_EFFECTS) {
    g.effects.push({ kind: 'flash', x, y, angle: 0, size: size * 0.55, life: 0.16, max: 0.16, color: c.core })
    g.effects.push({ kind: 'slam', x, y, angle: 0, size: size * 0.62, life: 0.45, max: 0.45, color: c.ring })
  }
  light(g, x, y, size * 1.7, c.light, 0.38)
  if (kind !== 'stone') {
    // the fireball: fat glowing blobs that swell and fade
    for (let i = 0; i < Math.round(9 * k); i++) {
      const a = Math.random() * Math.PI * 2
      spawn(g, part(x + Math.cos(a) * rnd(0, size * 0.12), y + Math.sin(a) * rnd(0, size * 0.12), a, rnd(20, 120) * k, rnd(0.22, 0.48), rnd(9, 18) * k, i % 3 === 0 ? c.core : i % 3 === 1 ? c.mid : c.edge, 'ember', { drag: 0.01 }))
    }
    for (let i = 0; i < Math.round(12 * k); i++) spawn(g, part(x, y, Math.random() * Math.PI * 2, rnd(220, 520) * k, rnd(0.2, 0.45), rnd(1.6, 2.8), c.mid, 'spark', { drag: 0.03 }))
  }
  if (kind === 'fire' || kind === 'stone') {
    // debris thrown outward that tumbles to a stop
    for (let i = 0; i < Math.round(6 * k); i++) spawn(g, part(x, y, Math.random() * Math.PI * 2, rnd(120, 330) * k, rnd(0.5, 0.95), rnd(3, 6), kind === 'stone' ? c.edge : '#3A3230', 'chunk', { drag: 0.004, rot: Math.random() * 6, spin: rnd(-12, 12) }))
  }
  // smoke or dust that hangs for a moment and drifts up
  for (let i = 0; i < Math.round((kind === 'stone' ? 9 : 6) * k); i++) {
    const a = Math.random() * Math.PI * 2
    spawn(g, part(x + Math.cos(a) * size * 0.14, y + Math.sin(a) * size * 0.14, a, rnd(15, 70), rnd(0.7, 1.35), rnd(9, 17) * k, c.smoke, 'smoke', { drag: 0.12, gy: -24 }))
  }
  if (c.decal) {
    g.decals.push({ x, y, r: size * 0.3, rot: Math.random() * Math.PI, kind: c.decal })
    if (g.decals.length > 190) g.decals.shift()
  }
}

/** A zombie comes apart: a spray along the killing blow, a few pieces of it, and a puff where it stood. */
function gib(g: Game, ev: Extract<GameEvent, { t: 'gib' }>) {
  const blood = bloodOf(ev.zk)
  const flesh = ZOMBIES[ev.zk]?.color ?? '#5E8C4A'
  const big = ev.zk === 'boss' ? 3 : ev.zk === 'tank' || ev.zk === 'brood' || ev.zk === 'bloater' ? 1.7 : ev.zk === 'mite' ? 0.45 : 1
  const push = Math.hypot(ev.dx, ev.dy)
  const base = push > 25 ? Math.atan2(ev.dy, ev.dx) : null
  const n = Math.round(9 * big)
  for (let i = 0; i < n; i++) {
    const a = base === null ? Math.random() * Math.PI * 2 : base + rnd(-1.1, 1.1)
    spawn(g, part(ev.x + rnd(-ev.w, ev.w) * 0.25, ev.y + rnd(-ev.w, ev.w) * 0.25, a, rnd(60, 250) * (0.8 + big * 0.2), rnd(0.3, 0.65), rnd(2.2, 4.6), blood, 'dot', { drag: 0.005 }))
  }
  for (let i = 0; i < Math.round(4 * big); i++) {
    const a = base === null ? Math.random() * Math.PI * 2 : base + rnd(-1.4, 1.4)
    spawn(g, part(ev.x, ev.y, a, rnd(90, 240), rnd(0.55, 1), rnd(3.2, 6) * Math.min(1.6, 0.8 + big * 0.2), i % 2 ? flesh : blood, 'chunk', { drag: 0.003, rot: Math.random() * 6, spin: rnd(-14, 14) }))
  }
  spawn(g, part(ev.x, ev.y, 0, 0, 0.28, ev.w * 0.9, blood, 'smoke', { drag: 0.2 }))
}

function killVisual(g: Game, ev: Extract<GameEvent, { t: 'kill' }>) {
  const size = ev.zk === 'boss' ? 200 : ev.zk === 'tank' ? 110 : 80
  const burst = (color: string, n: number) => applyEvent(g, { t: 'burst', x: ev.x, y: ev.y, color, n })
  if (ev.fx === 'gold') {
    burst('#FFD25A', 14)
    burst('#FFF1B8', 8)
    g.effects.push({ kind: 'ring', x: ev.x, y: ev.y, angle: 0, size, life: 0.5, max: 0.5, color: '#FFD25A' })
    light(g, ev.x, ev.y, size * 1.2, '255,210,90', 0.3)
  } else if (ev.fx === 'lightning') {
    burst('#9FF4FF', 10)
    g.effects.push({ kind: 'bolt', x: ev.x, y: ev.y, angle: Math.random() * 6, size, life: 0.4, max: 0.4 })
    g.effects.push({ kind: 'ring', x: ev.x, y: ev.y, angle: 0, size: size * 0.8, life: 0.4, max: 0.4, color: '#6EDCFF' })
    light(g, ev.x, ev.y, size * 1.4, '127,232,255', 0.25)
  } else {
    for (let i = 0; i < 12; i++) {
      spawn(g, {
        x: ev.x + (Math.random() - 0.5) * ev.w,
        y: ev.y + (Math.random() - 0.3) * ev.h,
        vx: (Math.random() - 0.5) * 40,
        vy: -70 - Math.random() * 80,
        life: 0.9,
        max: 0.9,
        size: 3 + Math.random() * 3,
        color: Math.random() < 0.5 ? '#7CFFE0' : '#B9FFF0',
        kind: 'ember',
      })
    }
    g.effects.push({ kind: 'ring', x: ev.x, y: ev.y, angle: 0, size, life: 0.7, max: 0.7, color: '#7CFFE0' })
    light(g, ev.x, ev.y, size, '124,255,224', 0.4)
  }
}

/** Guns that throw a brass casing, and guns whose shot leaves a puff of smoke. */
const CASING: Partial<Record<WeaponId, number>> = { pistol: 1, smg: 1, rifle: 1.2, sniper: 1.5, minigun: 1, shotgun: 1.6 }
const SMOKY: Partial<Record<WeaponId, number>> = { shotgun: 3, launcher: 3, sniper: 2, railgun: 2 }
/** Colour of the light a muzzle throws, r,g,b. */
const MUZZLE_LIGHT: Partial<Record<WeaponId, string>> = { railgun: '140,255,255', tesla: '127,232,255', cryo: '189,242,255', venom: '155,255,59', wand: '200,170,255', flamer: '255,150,60' }

/** When each player's gun may next throw a casing and a flash of light (so a held trigger does not flood the screen). */
const shellClock = new WeakMap<Game, Map<number, number>>()

/** Ages floating text, particles, effects and lights, and spawns the decorative ones (trails, casings, embers, wisps). */
export function updateVisuals(g: Game, dt: number) {
  g.shake = Math.max(0, g.shake - dt * 30)
  g.coinPulse = Math.max(0, g.coinPulse - dt * 4)
  for (const t of g.texts) {
    t.life -= dt
    t.y -= (t.big ? 20 : 28) * dt
  }
  g.texts = g.texts.filter((t) => t.life > 0)
  for (const q of g.particles) {
    q.life -= dt
    q.x += q.vx * dt
    q.y += q.vy * dt
    const drag = Math.pow(q.drag ?? 0.02, dt)
    q.vx *= drag
    q.vy *= drag
    if (q.gy) q.vy += q.gy * dt
    if (q.spin) q.rot = (q.rot ?? 0) + q.spin * dt * Math.max(0, q.life / q.max)
  }
  g.particles = g.particles.filter((q) => q.life > 0)
  for (const f of g.effects) f.life -= dt
  g.effects = g.effects.filter((f) => f.life > 0)
  for (const l of g.lights) l.life -= dt
  if (g.lights.length > 0) g.lights = g.lights.filter((l) => l.life > 0)
  updateCoins(g, dt)
  if (g.status !== 'playing') return

  let clock = shellClock.get(g)
  if (!clock) {
    clock = new Map()
    shellClock.set(g, clock)
  }
  for (const slot of g.slots) {
    const p = slot.player
    if (p.down) continue
    const look = characterLook(slot.skin.character)
    if (look.trail && p.state === 'move' && Math.random() < dt * 30) {
      const mx = p.mx ?? 0
      const my = p.my ?? 0
      spawn(g, {
        x: p.x - mx * 8 + (Math.random() - 0.5) * 8,
        y: p.y - my * 8 + (Math.random() - 0.5) * 8,
        vx: -mx * 20,
        vy: -my * 20,
        life: 0.5,
        max: 0.5,
        size: 2 + Math.random() * 3,
        color: look.trail === 'rainbow' ? hueColor(g.time, Math.random() * 360) : look.trail,
      })
    }
    // a dash leaves a streak of the class colour
    if (p.dashTime > 0 && Math.random() < dt * 90) spawn(g, part(p.x + rnd(-6, 6), p.y + rnd(-6, 6), Math.atan2(-p.vy, -p.vx) + rnd(-0.3, 0.3), rnd(40, 120), 0.3, rnd(2, 3), '#6EE7A8', 'spark'))
    // muzzle: a flash of light, a casing, a wisp of smoke
    if (p.muzzle > 0 && p.weapon !== 'fists' && g.time >= (clock.get(slot.id) ?? 0)) {
      const def = WEAPONS[p.weapon]
      clock.set(slot.id, g.time + Math.max(0.05, def.interval * 0.9))
      const a = Math.atan2(p.aim.y, p.aim.x)
      const mx = p.x + p.aim.x * (p.w / 2 + def.barrel)
      const my = p.y + p.aim.y * (p.h / 2 + def.barrel)
      light(g, mx, my, p.weapon === 'railgun' || p.weapon === 'sniper' || p.weapon === 'shotgun' ? 230 : 150, MUZZLE_LIGHT[p.weapon] ?? '255,190,110', 0.08)
      const casing = CASING[p.weapon]
      if (casing) spawn(g, part(p.x + p.aim.x * 10, p.y + p.aim.y * 10, a + Math.PI / 2 + rnd(-0.4, 0.4), rnd(90, 170), rnd(0.45, 0.7), 2.4 * casing, '#E8C34A', 'shell', { drag: 0.004, rot: Math.random() * 6, spin: rnd(-18, 18) }))
      const smoky = SMOKY[p.weapon]
      if (smoky) for (let i = 0; i < smoky; i++) spawn(g, part(mx, my, a + rnd(-0.5, 0.5), rnd(20, 90), rnd(0.4, 0.8), rnd(5, 9), '#8A8684', 'smoke', { drag: 0.08, gy: -18 }))
    }
  }
  for (const b of g.bullets) {
    if (b.weapon === 'wand' && Math.random() < dt * 40) spawn(g, part(b.x, b.y, Math.random() * Math.PI * 2, rnd(5, 30), 0.3, rnd(1.5, 3), '#D6C8FF', 'ember'))
    if (!b.sparkle || Math.random() >= dt * 30) continue
    spawn(g, {
      x: b.x,
      y: b.y,
      vx: (Math.random() - 0.5) * 40,
      vy: (Math.random() - 0.5) * 40,
      life: 0.35,
      max: 0.35,
      size: 2 + Math.random() * 2,
      color: b.sparkle === 'rainbow' ? hueColor(g.time, Math.random() * 360) : b.sparkle,
      kind: 'ember',
    })
  }
  for (const z of g.zombies) {
    if (z.burn && Math.random() < dt * 14) {
      spawn(g, {
        x: z.x + (Math.random() - 0.5) * z.w * 0.8,
        y: z.y + (Math.random() - 0.3) * z.h * 0.6,
        vx: (Math.random() - 0.5) * 30,
        vy: -50 - Math.random() * 50,
        life: 0.5,
        max: 0.5,
        size: 2 + Math.random() * 2.5,
        color: Math.random() < 0.5 ? '#FFB04A' : '#FF6A1F',
        kind: 'ember',
      })
    }
    // a zombie in a Screamer's frenzy trails red
    if ((z.haste ?? 0) > 0 && Math.random() < dt * 9) spawn(g, part(z.x + rnd(-5, 5), z.y + rnd(-5, 5), Math.random() * Math.PI * 2, rnd(5, 25), 0.35, rnd(2, 3.5), '#FF5A8C', 'ember'))
  }
  for (const pet of g.pets) {
    // spirit wolves shed wisps; the guardian sheds dust when it walks
    if (pet.kind === 'wolf' && Math.random() < dt * 16) spawn(g, part(pet.x + rnd(-6, 6), pet.y + rnd(-6, 6), Math.random() * Math.PI * 2, rnd(4, 22), 0.45, rnd(2, 3.6), Math.random() < 0.5 ? '#B9A8FF' : '#E6DEFF', 'ember', { gy: -22 }))
  }
}

/** Coins pop out of a kill, hang for a beat, then race to the counter in the corner. */
function updateCoins(g: Game, dt: number) {
  if (g.coinFx.length === 0) return
  const hx = g.camera.x + COIN_HOME.x
  const hy = g.camera.y + COIN_HOME.y
  const keep = []
  for (const c of g.coinFx) {
    c.t += dt
    if (c.t < 0) {
      keep.push(c)
      continue
    }
    if (c.t < 0.28) {
      c.x += c.vx * dt
      c.y += c.vy * dt
      c.vx *= Math.pow(0.02, dt)
      c.vy *= Math.pow(0.02, dt)
      keep.push(c)
      continue
    }
    const dx = hx - c.x
    const dy = hy - c.y
    const d = Math.hypot(dx, dy)
    const speed = 420 + (c.t - 0.28) * 2200
    if (d < Math.max(16, speed * dt) || c.t > 1.6 || d > Math.hypot(VIEW_W, VIEW_H) * 1.5) {
      g.coinPulse = 1
      continue
    }
    c.x += (dx / d) * speed * dt
    c.y += (dy / d) * speed * dt
    keep.push(c)
  }
  g.coinFx = keep
}
