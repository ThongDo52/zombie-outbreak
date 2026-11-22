import { updateBoss } from './boss'
import { freeSpot, moveBody, normalize } from './collision'
import { chaseDir } from './pathing'
import { addZone, lobBomb, spitAcid, zombieBlast } from './combat'
import { ENEMY, STATUS, WAVE, ZOMBIES } from './config'
import type { Game } from './engine'
import type { Target, Vec, Zombie, ZombieState } from './types'
import { createZombieAt } from './waves'

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
  // whoever is closest: a player, or a Summoner's pet that got in the way
  const p = g.nearestTarget(z.x, z.y)
  z.stateTime += dt
  z.flash = Math.max(0, z.flash - dt)
  moveBody(z, z.vx * dt, z.vy * dt)
  z.vx *= Math.pow(0.02, dt)
  z.vy *= Math.pow(0.02, dt)

  // attacks get quicker as the levels climb, and quicker still while a Screamer has the horde whipped up
  const rate = (1 + Math.min(0.5, 0.03 * (g.level - 1))) * ((z.haste ?? 0) > 0 ? ENEMY.screamer.tempo : 1)
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
      const d = z.kind === 'lurker' && !(g.hunt && dist >= 130) ? lurkerDir(z, p, dist, dt) : chaseDir(z, p, dt)
      if (z.kind === 'bloater') dropPuddle(g, z, dt)
      z.cloak = z.kind === 'lurker' && dist > 150 && z.flash <= 0 && !((z.mark ?? 0) > 0)
      // a Shielder keeps its shield turned toward whatever it is hunting
      if (z.kind === 'shielder' && dist > 1) z.aim = { x: dx / dist, y: dy / dist }
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
        g.addHitbox({ x: cx - size / 2, y: cy - size / 2, w: size, h: size }, 'zombie', def.damage * g.diff.damage, 0, z.kind === 'mite' ? 60 : 300, STRIKE_TIME, z.id)
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

/**
 * How fast a zombie can move right now, as a share of its normal speed: chill, venom clouds and a Runner's
 * shock trap slow it down (a frozen one is stunned anyway), a Screamer's frenzy speeds it up.
 */
export function slowFactor(z: Zombie): number {
  const chill = Math.min(2, z.chill ?? 0) * STATUS.chill.slowPerStack
  const cloud = (z.slow ?? 0) > 0 ? STATUS.cloud.slow : 0
  const snare = (z.snare ?? 0) > 0 ? STATUS.snare : 0
  const haste = (z.haste ?? 0) > 0 && z.kind !== 'boss' ? ENEMY.screamer.speed : 1
  return Math.max(0.25, 1 - chill - cloud - snare) * haste
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
function lurkerDir(z: Zombie, p: Target, dist: number, dt: number): Vec {
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

/** The families that do not simply walk up and bite run their own little state machines. Returns true when it handled the tick. */
function updateFamily(g: Game, z: Zombie, dt: number, p: Target, dist: number, dx: number, dy: number, rate: number): boolean {
  switch (z.kind) {
    case 'spitter':
    case 'shaman':
    case 'screamer':
    case 'mortar': {
      const def = ZOMBIES[z.kind]
      // Shamans and Screamers work on the horde around them, Spitters and Mortars on the player
      const caster = z.kind === 'shaman' || z.kind === 'screamer'
      z.dropT = (z.dropT ?? (def.interval ?? 3) * (0.3 + Math.random() * 0.7)) - dt
      const n = normalize(dx, dy)
      switch (z.state) {
        case 'stunned':
          if (z.stateTime >= z.stateDur) setZombieState(z, 'chase')
          break
        case 'chase': {
          // the last few of a wave give up their distance and come to you
          const keep = g.hunt ? Math.min(def.keep ?? 250, 110) : (def.keep ?? 250)
          const sp = def.speed * walkBoost(g) * slowFactor(z)
          let mx: number
          let my: number
          const d = chaseDir(z, p, dt) // also keeps the line-of-sight check fresh
          const ally = caster ? nearestAlly(g, z) : null
          if (dist > keep + 60) {
            mx = d.x
            my = d.y
          } else if (ally && ally.d > 140 && dist > keep * 0.75) {
            // a Shaman or Screamer trails its horde so it stays within reach of it
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
          if (z.dropT > 0) break
          let ready: boolean
          if (z.kind === 'shaman') ready = dist < keep + 60 && shamanTargets(g, z).length > 0
          else if (z.kind === 'screamer') ready = dist < keep + 160 && screamTargets(g, z).length >= 2
          else if (z.kind === 'mortar') ready = dist < (def.range ?? 560) // lobs over walls: no line of sight needed
          else ready = dist < keep + 60 && Boolean(z.los) && dist < (def.range ?? 340)
          if (ready) {
            z.aim = n
            g.sound(z.kind === 'shaman' ? 'chant' : 'zattack', z.x, z.y, z.kind)
            setZombieState(z, 'windup')
          }
          break
        }
        case 'windup':
          if (!caster && z.stateTime < def.windup * 0.6) z.aim = n // follow the player, then commit
          if (z.stateTime >= def.windup / rate) {
            if (z.kind === 'shaman') shamanCast(g, z)
            else if (z.kind === 'screamer') scream(g, z)
            else if (z.kind === 'mortar') lobBomb(g, z, p.x, p.y)
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
    case 'leaper': {
      const def = ZOMBIES.leaper
      const L = ENEMY.leaper
      z.cooldown = Math.max(0, (z.cooldown ?? 0.8 + Math.random()) - dt)
      switch (z.state) {
        case 'stunned':
          if (z.stateTime >= z.stateDur) setZombieState(z, 'chase')
          break
        case 'windup':
          // crouching: it tracks its prey at first, then commits to the jump
          if (z.stateTime < (def.windup * 0.65) / rate && dist > 1) z.aim = { x: dx / dist, y: dy / dist }
          if (z.stateTime >= def.windup / rate) {
            setZombieState(z, 'strike', L.time)
            g.sound('leap', z.x, z.y)
          }
          break
        case 'strike': {
          const bx = z.x
          const by = z.y
          moveBody(z, z.aim.x * L.speed * dt, z.aim.y * L.speed * dt)
          const hitWall = Math.hypot(z.x - bx, z.y - by) < L.speed * dt * 0.4
          const reached = Math.hypot(p.x - z.x, p.y - z.y) < (z.w + p.w) / 2 + 12
          if (reached || hitWall || z.stateTime >= z.stateDur) {
            const s = L.hit
            g.addHitbox({ x: z.x - s / 2, y: z.y - s / 2, w: s, h: s }, 'zombie', def.damage * g.diff.damage, 0, L.knockback, 0.1, z.id)
            g.addEffect('claw', z.x + z.aim.x * 14, z.y + z.aim.y * 14, Math.atan2(z.aim.y, z.aim.x) + 0.5, 36, 0.3)
            g.burst(z.x, z.y, '#A39B8C', 5)
            z.cooldown = L.cooldown
            // jumping into a wall leaves it dazed: the moment to finish it
            if (hitWall && !reached) setZombieState(z, 'stunned', 0.7)
            else setZombieState(z, 'recover')
          }
          break
        }
        case 'recover':
          if (z.stateTime >= def.recover / rate) setZombieState(z, 'chase')
          break
        default: {
          const d = chaseDir(z, p, dt)
          const sep = separation(g, z)
          const sp = def.speed * walkBoost(g) * slowFactor(z)
          moveBody(z, d.x * sp * dt + sep.x * 4 * dt, d.y * sp * dt + sep.y * 4 * dt)
          if (z.los && z.cooldown <= 0 && dist < (def.range ?? 320) && dist > 36 && !((z.snare ?? 0) > 0)) {
            z.aim = normalize(dx, dy)
            g.sound('zattack', z.x, z.y, 'leaper')
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
    if (o === z || o.hp <= 0 || o.kind === 'shaman' || o.kind === 'screamer' || o.kind === 'boss') continue
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

/** Zombies in earshot of a Screamer that are not already in a frenzy. */
function screamTargets(g: Game, z: Zombie): Zombie[] {
  const r = ENEMY.screamer.range
  return g.zombies.filter((o) => o !== z && o.hp > 0 && o.kind !== 'boss' && o.kind !== 'screamer' && Math.hypot(o.x - z.x, o.y - z.y) < r && !((o.haste ?? 0) > 1))
}

/** A Screamer's shriek: everything in earshot breaks into a sprint, and (a few times) more runners answer the call. */
function scream(g: Game, z: Zombie) {
  const S = ENEMY.screamer
  for (const o of screamTargets(g, z)) o.haste = S.haste
  g.addEffect('ring', z.x, z.y, 0, S.range * 0.95, 0.7, '#FF6FA8')
  g.addEffect('ring', z.x, z.y, 0, S.range * 0.55, 0.5, '#FFB3D2')
  g.text(z.x, z.y - z.h / 2 - 14, 'SCREECH', '#FF8AC0', 1)
  g.sound('scream', z.x, z.y)
  g.kick(3)
  z.summons = (z.summons ?? 0) + 1
  const room = Math.round(WAVE.maxAlive * (1 + 0.25 * (g.playerCount - 1))) + 20 - g.zombies.length - g.births.length
  if (z.summons > 3 || room <= 0) return
  for (let i = 0; i < Math.min(S.call, room); i++) {
    const at = freeSpot(z.x, z.y, 40, 120, 34)
    const runner = createZombieAt(g.nextId++, 'runner', g.level, at.x, at.y, 1, g.diff.hp)
    runner.haste = S.haste
    g.births.push(runner)
    g.burst(at.x, at.y, '#FF6FA8', 5)
  }
}
