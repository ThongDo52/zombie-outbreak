import { updateBoss } from './boss'
import { moveBody, normalize } from './collision'
import { chaseDir } from './pathing'
import { addZone, spitAcid, zombieBlast } from './combat'
import { ENEMY, STATUS, ZOMBIES } from './config'
import type { Game } from './engine'
import type { Player, Vec, Zombie, ZombieState } from './types'

export const STRIKE_TIME = 0.12

export function setZombieState(z: Zombie, state: ZombieState, dur = 0) {
  z.state = state
  z.stateTime = 0
  z.stateDur = dur
}

export function updateZombie(g: Game, z: Zombie, dt: number) {
  if (z.kind === 'boss') {
    updateBoss(g, z, dt)
    return
  }
  const def = ZOMBIES[z.kind]
  const p = g.nearestPlayer(z.x, z.y)
  z.stateTime += dt
  z.flash = Math.max(0, z.flash - dt)
  moveBody(z, z.vx * dt, z.vy * dt)
  z.vx *= Math.pow(0.02, dt)
  z.vy *= Math.pow(0.02, dt)

  // attacks get quicker as the levels climb
  const rate = 1 + Math.min(0.5, 0.03 * (g.level - 1))
  const dx = p.x - z.x
  const dy = p.y - z.y
  const dist = Math.hypot(dx, dy)

  if (updateFamily(g, z, dt, p, dist, dx, dy, rate)) return

  switch (z.state) {
    case 'stunned':
      if (z.stateTime >= z.stateDur) setZombieState(z, 'chase')
      break
    case 'chase': {
      // Lurkers swing round behind you; Bloaters leave poison puddles as they walk
      const d = z.kind === 'lurker' ? lurkerDir(z, p, dist, dt) : chaseDir(z, p, dt)
      if (z.kind === 'bloater') dropPuddle(g, z, dt)
      z.cloak = z.kind === 'lurker' && dist > 150 && z.flash <= 0
      const sep = separation(g, z)
      const speed = def.speed * walkBoost(g) * slowFactor(z)
      moveBody(z, d.x * speed * dt + sep.x * 4 * dt, d.y * speed * dt + sep.y * 4 * dt)
      if (z.los && dist < def.reach + p.w / 2 + z.w / 2 - 6) {
        z.aim = normalize(dx, dy)
        z.cloak = false
        g.sound('zattack', z.x, z.y, z.kind)
        setZombieState(z, 'windup')
      }
      break
    }
    case 'windup':
      if (z.stateTime >= def.windup / rate) {
        setZombieState(z, 'strike')
        const size = def.reach + 10
        const cx = z.x + z.aim.x * (z.w / 2 + size / 2)
        const cy = z.y + z.aim.y * (z.h / 2 + size / 2)
        g.addHitbox({ x: cx - size / 2, y: cy - size / 2, w: size, h: size }, 'zombie', def.damage * g.diff.damage, 0, 300, STRIKE_TIME, z.id)
        g.addEffect('bite', cx, cy, Math.atan2(z.aim.y, z.aim.x), size, 0.36)
        g.sound('bite', cx, cy)
      }
      break
    case 'strike':
      if (z.stateTime >= STRIKE_TIME) setZombieState(z, 'recover')
      break
    case 'recover':
      if (z.stateTime >= def.recover / rate) setZombieState(z, 'chase')
      break
  }
}

/** Chill and venom clouds slow a zombie down; a frozen one is stunned anyway. */
export function slowFactor(z: Zombie): number {
  const chill = Math.min(2, z.chill ?? 0) * STATUS.chill.slowPerStack
  const cloud = (z.slow ?? 0) > 0 ? STATUS.cloud.slow : 0
  return Math.max(0.3, 1 - chill - cloud)
}

// ---------- Families ----------

/** Zombies get faster each wave, and on harder difficulties. */
function walkBoost(g: Game): number {
  return (1 + Math.min(0.4, 0.025 * (g.level - 1))) * g.diff.speed
}

/** Push zombies apart so a crowd does not collapse into one spot. */
function separation(g: Game, z: Zombie): Vec {
  let sx = 0
  let sy = 0
  for (const o of g.zombies) {
    if (o === z) continue
    const ox = z.x - o.x
    const oy = z.y - o.y
    const od = Math.hypot(ox, oy)
    const min = (z.w + o.w) / 2
    if (od > 0 && od < min) {
      sx += (ox / od) * (min - od)
      sy += (oy / od) * (min - od)
    }
  }
  return { x: sx, y: sy }
}

function dropPuddle(g: Game, z: Zombie, dt: number) {
  z.dropT = (z.dropT ?? ENEMY.bloater.dropEvery * 0.5) - dt
  if (z.dropT > 0) return
  z.dropT = ENEMY.bloater.dropEvery
  const s = ENEMY.bloater.puddle
  addZone(g, z.x, z.y, s, s, ENEMY.bloater.puddleLife, ENEMY.bloater.puddleDps, true)
  g.burst(z.x, z.y, '#B7B84A', 4)
}

/**
 * A Lurker comes from the shadows: it swings round to the spot behind you, and only when it is there
 * (or you turn to face it) does it rush straight in. Out of sight it is almost invisible.
 */
function lurkerDir(z: Zombie, p: Player, dist: number, dt: number): Vec {
  if (z.fuse === 1 || dist < 130) {
    z.fuse = 1
    return normalize(p.x - z.x, p.y - z.y)
  }
  if (dist > ENEMY.lurker.cloakRange + 160) return chaseDir(z, p, dt)
  const bx = p.x - p.aim.x * ENEMY.lurker.behind
  const by = p.y - p.aim.y * ENEMY.lurker.behind
  if (Math.hypot(bx - z.x, by - z.y) < 50) {
    z.fuse = 1
    return normalize(p.x - z.x, p.y - z.y)
  }
  return normalize(bx - z.x, by - z.y)
}

/** Spitter, Shaman and Exploder run their own little state machines. Returns true when it handled the tick. */
function updateFamily(g: Game, z: Zombie, dt: number, p: Player, dist: number, dx: number, dy: number, rate: number): boolean {
  switch (z.kind) {
    case 'spitter':
    case 'shaman': {
      const def = ZOMBIES[z.kind]
      const caster = z.kind === 'shaman'
      z.dropT = (z.dropT ?? (def.interval ?? 3) * (0.3 + Math.random() * 0.7)) - dt
      const n = normalize(dx, dy)
      switch (z.state) {
        case 'stunned':
          if (z.stateTime >= z.stateDur) setZombieState(z, 'chase')
          break
        case 'chase': {
          const keep = def.keep ?? 250
          const sp = def.speed * walkBoost(g) * slowFactor(z)
          let mx: number
          let my: number
          const d = chaseDir(z, p, dt) // also keeps the line-of-sight check fresh
          const ally = caster ? nearestAlly(g, z) : null
          if (dist > keep + 60) {
            mx = d.x
            my = d.y
          } else if (ally && ally.d > 140 && dist > keep * 0.75) {
            // a Shaman trails its horde so it stays within healing reach
            const a = normalize(ally.z.x - z.x, ally.z.y - z.y)
            mx = a.x
            my = a.y
          } else if (dist < keep - 70) {
            mx = -n.x // too close: back away from the player
            my = -n.y
          } else {
            mx = -n.y * 0.45 // hold the range and circle slowly
            my = n.x * 0.45
          }
          const sep = separation(g, z)
          moveBody(z, mx * sp * dt + sep.x * 4 * dt, my * sp * dt + sep.y * 4 * dt)
          if (dist < keep + 60 && z.dropT <= 0 && (caster ? shamanTargets(g, z).length > 0 : z.los && dist < (def.range ?? 340))) {
            z.aim = n
            g.sound(caster ? 'chant' : 'zattack', z.x, z.y, z.kind)
            setZombieState(z, 'windup')
          }
          break
        }
        case 'windup':
          if (!caster && z.stateTime < def.windup * 0.6) z.aim = n // follow the player, then commit
          if (z.stateTime >= def.windup / rate) {
            if (caster) shamanCast(g, z)
            else spitAcid(g, z, p.x, p.y)
            z.dropT = (def.interval ?? 3) / (1 + Math.min(0.4, 0.02 * (g.level - 1)))
            setZombieState(z, 'recover')
          }
          break
        default:
          if (z.stateTime >= def.recover / rate) setZombieState(z, 'chase')
      }
      return true
    }
    case 'exploder': {
      const def = ZOMBIES.exploder
      switch (z.state) {
        case 'stunned':
          if (z.stateTime >= z.stateDur) setZombieState(z, 'chase')
          break
        case 'windup':
          // standing still and shaking while the fuse burns
          z.vx += (Math.random() - 0.5) * 80
          z.vy += (Math.random() - 0.5) * 80
          if (z.stateTime >= ENEMY.exploder.fuse / rate) zombieBlast(g, z)
          break
        default: {
          const d = chaseDir(z, p, dt)
          const sep = separation(g, z)
          const sp = def.speed * walkBoost(g) * slowFactor(z)
          moveBody(z, d.x * sp * dt + sep.x * 4 * dt, d.y * sp * dt + sep.y * 4 * dt)
          if (z.los && dist < ENEMY.exploder.trigger + p.w / 2) {
            z.fuse = 0
            g.sound('zattack', z.x, z.y, 'exploder')
            setZombieState(z, 'windup')
          }
        }
      }
      return true
    }
    default:
      return false
  }
}

function nearestAlly(g: Game, z: Zombie): { z: Zombie; d: number } | null {
  let best: { z: Zombie; d: number } | null = null
  for (const o of g.zombies) {
    if (o === z || o.hp <= 0 || o.kind === 'shaman' || o.kind === 'boss') continue
    const d = Math.hypot(o.x - z.x, o.y - z.y)
    if (!best || d < best.d) best = { z: o, d }
  }
  return best
}

/** Zombies a Shaman can help: hurt ones, or any near ones that have no shield yet. */
function shamanTargets(g: Game, z: Zombie): Zombie[] {
  const r = ENEMY.shaman.range
  return g.zombies.filter((o) => o !== z && o.hp > 0 && o.kind !== 'boss' && Math.hypot(o.x - z.x, o.y - z.y) < r && (o.hp < o.maxHp * 0.9 || !(o.shield && o.shield > 0)))
}

function shamanCast(g: Game, z: Zombie) {
  const list = shamanTargets(g, z)
  g.addEffect('ring', z.x, z.y, 0, ENEMY.shaman.range * 0.8, 0.6, '#B08CFF')
  for (const o of list) {
    o.hp = Math.min(o.maxHp, o.hp + o.maxHp * ENEMY.shaman.healShare)
    o.shield = ENEMY.shaman.shield
    g.burst(o.x, o.y, '#B08CFF', 4)
  }
  g.sound('chant', z.x, z.y)
}
