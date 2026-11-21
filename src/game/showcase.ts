import { WEAPON_ORDER } from './config'
import { freeSpot } from './collision'
import { Game } from './engine'
import { createZombieAt } from './waves'
import { draw } from './render'
import type { PlayerSlot, WeaponId } from './types'
import { activeMap } from './world'

/**
 * The welcome page's hero: the real game, running by itself. Five AI survivors with mythic skins hold
 * out in Endless Descent, so every map, gun, zombie and effect on screen is the genuine article.
 * Nothing here is saved, paid for or sent anywhere.
 */

const SQUAD: { name: string; character: number; gun: number; effect: number }[] = [
  { name: 'Rook', character: 407, gun: 507, effect: 302 },
  { name: 'Vex', character: 406, gun: 506, effect: 303 },
  { name: 'Juno', character: 405, gun: 505, effect: 301 },
  { name: 'Kade', character: 105, gun: 204, effect: 302 },
  { name: 'Mara', character: 106, gun: 206, effect: 301 },
]

/** Guns the survivors cycle through, so the whole arsenal gets a turn. */
const ROTATION: WeaponId[] = ['smg', 'shotgun', 'rifle', 'flamer', 'launcher', 'minigun', 'railgun', 'venom', 'tesla', 'cryo']

interface Bot {
  slot: PlayerSlot
  index: number
  think: number
  swap: number
  rot: number
  keys: number
  fire: boolean
  burst: number
  ax: number
  ay: number
}

export interface Showcase {
  game: Game
  /** Advance the simulation by dt seconds. */
  step(dt: number): void
  render(ctx: CanvasRenderingContext2D): void
}

export function createShowcase(): Showcase {
  const game = new Game('solo')
  game.slots = []
  SQUAD.forEach((s, i) => {
    const slot = game.addSlot(s.name, i + 1)
    if (!slot) return
    slot.skin = { character: s.character, gun: s.gun, effect: s.effect }
  })
  game.localId = 1
  game.startDescent()

  const bots: Bot[] = game.slots.map((slot, index) => {
    for (const w of WEAPON_ORDER) {
      slot.player.owned[w] = true
      slot.player.ammo[w] = 9999
    }
    slot.player.weapon = ROTATION[(index * 2) % ROTATION.length]
    return { slot, index, think: Math.random() * 0.1, swap: 2 + Math.random() * 3, rot: (index * 2) % ROTATION.length, keys: 0, fire: false, burst: index * 0.4, ax: 0, ay: 0 }
  })

  const centroid = () => {
    let x = 0
    let y = 0
    for (const b of bots) {
      x += b.slot.player.x
      y += b.slot.player.y
    }
    return { x: x / bots.length, y: y / bots.length }
  }

  const decide = (b: Bot, c: { x: number; y: number }, t: number) => {
    const p = b.slot.player
    let target: { x: number; y: number } | undefined
    let near = 300
    let nearest = 9999
    for (const z of game.zombies) {
      const d = Math.hypot(z.x - p.x, z.y - p.y)
      if (d < nearest) nearest = d
      if (d < near) {
        near = d
        target = z
      }
    }
    // short bursts, so the horde gets close enough to read on screen
    b.burst = (b.burst + 0.1) % 2.4
    b.fire = Boolean(target) && b.burst < 1
    b.ax = target ? target.x : p.x + p.aim.x * 60
    b.ay = target ? target.y : p.y + p.aim.y * 60
    // hold a ring around the squad's centre; step back when a zombie gets close
    const a = t * 0.25 + (b.index / bots.length) * Math.PI * 2
    const hx = c.x + Math.cos(a) * 70
    const hy = c.y + Math.sin(a) * 70
    let dx = hx - p.x
    let dy = hy - p.y
    if (target && nearest < 90) {
      dx = p.x - target.x
      dy = p.y - target.y
    }
    let keys = 0
    if (Math.abs(dy) > 14) keys |= dy < 0 ? 1 : 2
    if (Math.abs(dx) > 14) keys |= dx < 0 ? 4 : 8
    b.keys = keys
    if (target && nearest < 70 && p.skillCd <= 0 && Math.random() < 0.5) game.queueSkill(b.slot.id)
  }

  // New zombies appear just outside the picture, so there is always a horde closing in.
  const placed = new Set<number>()
  const stageZombies = (c: { x: number; y: number }) => {
    for (const z of game.zombies) {
      if (placed.has(z.id)) continue
      placed.add(z.id)
      if (z.kind === 'boss') continue
      const d = Math.hypot(z.x - c.x, z.y - c.y)
      if (d > 520) {
        const at = freeSpot(c.x, c.y, 430, 520, z.w + 8)
        z.x = at.x
        z.y = at.y
      }
    }
    if (placed.size > 4000) placed.clear()
  }

  // Every so often a boss walks into the picture. It is a lighter one, so the squad can bring it down.
  let bossTimer = 6
  const cameo = (c: { x: number; y: number }, dt: number) => {
    bossTimer -= dt
    if (bossTimer > 0 || game.zombies.some((z) => z.kind === 'boss')) return
    bossTimer = 38
    const at = freeSpot(c.x, c.y, 430, 520, 90)
    const boss = createZombieAt(game.nextId++, 'boss', game.level, at.x, at.y, 0.8)
    placed.add(boss.id)
    game.zombies.push(boss)
    game.sound('boss')
  }

  const step = (dt: number) => {
    if (game.status !== 'playing') game.startDescent()
    const c = centroid()
    stageZombies(c)
    cameo(c, dt)
    for (const b of bots) {
      b.think -= dt
      b.swap -= dt
      if (b.think <= 0) {
        b.think = 0.1
        decide(b, c, game.time)
      }
      if (b.swap <= 0) {
        b.swap = 3 + Math.random() * 4
        b.rot = (b.rot + 1) % ROTATION.length
        game.equip(ROTATION[b.rot], b.slot.id)
      }
      game.applyInput(b.slot.id, { keys: b.keys, fire: b.fire, ax: b.ax, ay: b.ay })
      const p = b.slot.player
      // the demo never ends: survivors shrug off damage and never run dry
      p.hp = p.maxHp
      p.down = false
      p.ammo[p.weapon] = Math.max(p.ammo[p.weapon], 500)
    }
    game.update(dt)
    // keep the camera on the squad
    const lead = game.local
    lead.camera = {
      x: Math.max(0, Math.min(activeMap.w - 800, c.x - 400)),
      y: Math.max(0, Math.min(activeMap.h - 480, c.y - 240)),
    }
    game.shake = Math.min(game.shake, 3)
  }

  // let the first wave arrive so the first picture is already a fight
  for (let i = 0; i < 60 * 9; i++) step(1 / 60)

  return {
    game,
    step,
    render(ctx) {
      draw(ctx, game, { hud: false, crosshair: false })
    },
  }
}


let shared: Showcase | undefined

/**
 * One battle for the whole app: the title screen and the blurred backdrop of the shop tabs show the same
 * fight, so it carries on seamlessly as you move between them.
 */
export function sharedShowcase(): Showcase {
  shared ??= createShowcase()
  return shared
}
