import { SKILL } from './classes'
import { aabb, bodyRect, clamp, hitsObstacle, normalize, sweptRect } from './collision'
import { BURN, ENEMY, STATUS, WEAPONS, ZOMBIES, bloodOf } from './config'
import type { Game } from './engine'
import { healPet, hurtPet } from './pets'
import { addPickup, maybeDrop } from './pickups'
import { damagePlayer, hurtPlayer } from './players'
import { grantCoins } from './shop'
import { killEffect } from './skins'
import type { Bullet, EnemyShot, HitSource, PlayerSlot, Zombie, ZoneLook } from './types'
import { createZombieAt } from './waves'
import { activeMap } from './world'
import { setZombieState } from './zombies'

/** Moves every bullet, stops it at walls and applies hits to zombies. */
export function updateBullets(g: Game, dt: number) {
  g.bullets = g.bullets.filter((b) => {
    if (b.homing) steer(g, b, dt)
    b.px = b.x
    b.py = b.y
    b.x += b.vx * dt
    b.y += b.vy * dt
    b.life -= dt
    if (b.x < 0 || b.y < 0 || b.x > activeMap.w || b.y > activeMap.h) return false
    if (b.life <= 0) {
      if (b.blast) explode(g, b)
      else if (b.cloud) spawnCloud(g, b)
      return false
    }
    const swept = sweptRect(b.px, b.py, b.x, b.y, 3)
    if (hitsObstacle(swept)) {
      if (b.blast) explode(g, b)
      else if (b.cloud) spawnCloud(g, b)
      else if (b.weapon !== 'flamer') g.cosmetic({ t: 'spark', x: b.x, y: b.y, dx: -b.vx, dy: -b.vy, color: b.status === 'freeze' ? '#CFF4FF' : b.weapon === 'wand' ? '#C9A8FF' : '#FFD9A0', n: b.weapon === 'railgun' || b.weapon === 'sniper' ? 7 : 3 })
      return false
    }
    for (const z of g.zombies) {
      if (z.hp <= 0 || b.hitIds.has(z.id) || !aabb(swept, bodyRect(z))) continue
      if (b.blast) {
        explode(g, b)
        return false
      }
      b.hitIds.add(z.id)
      const k = normalize(b.vx, b.vy)
      hurtZombie(g, z, b.damage, k.x, k.y, b.knockback, b.stun, b.owner, { weapon: b.weapon, ap: b.ap, far: b.far ? longShot(b) : undefined })
      if (b.weapon === 'flamer') z.burn = BURN.duration
      if (b.status === 'poison') applyPoison(g, z, b.owner)
      if (b.status === 'freeze') applyChill(g, z, b.owner)
      if (b.cloud) {
        spawnCloud(g, b)
        return false
      }
      if (b.pierce-- <= 0) return false
    }
    return true
  })
}

/** A Sniper's bullet hits harder the farther it has flown. */
function longShot(b: Bullet): number {
  const flown = (b.maxLife - b.life) * Math.hypot(b.vx, b.vy)
  const s = SKILL.longShot
  return 1 + s.bonus * clamp((flown - s.near) / (s.far - s.near), 0, 1)
}

/** A Spirit Wand bolt bends toward the nearest zombie in front of it. */
function steer(g: Game, b: Bullet, dt: number) {
  const sp = Math.hypot(b.vx, b.vy) || 1
  const hx = b.vx / sp
  const hy = b.vy / sp
  let best: Zombie | undefined
  let bestD = 250
  for (const z of g.zombies) {
    if (z.hp <= 0 || b.hitIds.has(z.id)) continue
    const dx = z.x - b.x
    const dy = z.y - b.y
    const d = Math.hypot(dx, dy)
    if (d > bestD || d < 1 || (dx * hx + dy * hy) / d < 0.3) continue
    bestD = d
    best = z
  }
  if (!best) return
  const cur = Math.atan2(b.vy, b.vx)
  let diff = Math.atan2(best.y - b.y, best.x - b.x) - cur
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  const a = cur + clamp(diff, -(b.homing ?? 0) * dt, (b.homing ?? 0) * dt)
  b.vx = Math.cos(a) * sp
  b.vy = Math.sin(a) * sp
}

/** Zombies set alight by the flamer keep burning for a moment. */
export function updateBurning(g: Game, dt: number) {
  for (const z of g.zombies) {
    if (z.burn) {
      z.burn = Math.max(0, z.burn - dt)
      if (z.hp > 0) burnDamage(g, z, dt)
    }
    if (z.hp > 0) updateStatuses(g, z, dt)
  }
  updateZones(g, dt)
}

const isBig = (z: Zombie) => z.kind === 'tank' || z.kind === 'boss'

/** Poison stacks up to three times and eats health for a few seconds; bosses shrug off half of it. */
export function applyPoison(g: Game, z: Zombie, owner?: number) {
  z.poison = STATUS.poison.duration
  z.poisonStacks = Math.min(STATUS.poison.maxStacks, (z.poisonStacks ?? 0) + 1)
  z.killer = owner ?? z.killer
  g.burst(z.x, z.y, '#9BFF3B', 3)
}

/** Cold builds up. Three hits freeze a zombie solid, and a frozen zombie takes extra damage. */
export function applyChill(g: Game, z: Zombie, owner?: number) {
  z.killer = owner ?? z.killer
  z.chill = (z.chill ?? 0) + 1
  z.chillT = STATUS.chill.decay
  g.burst(z.x, z.y, '#CFF4FF', 3)
  if (z.chill < STATUS.chill.freezeAt) return
  z.chill = 0
  g.addEffect('ring', z.x, z.y, 0, z.w * 1.6, 0.4, '#BDF2FF')
  g.burst(z.x, z.y, '#EFFFFF', 10)
  if (z.kind === 'boss') {
    z.slow = 1.6 // a boss cannot be frozen solid, only slowed
    return
  }
  z.frozen = true
  g.hitboxes = g.hitboxes.filter((h) => h.sourceId !== z.id)
  setZombieState(z, 'stunned', STATUS.chill.freezeTime)
}

/** Poison damage, chill and slow wearing off, frozen ending with the stun, and the newer marks and frenzies running out. */
function updateStatuses(g: Game, z: Zombie, dt: number) {
  if (z.shock) z.shock = Math.max(0, z.shock - dt)
  if (z.shield) z.shield = Math.max(0, z.shield - dt)
  if (z.slow) z.slow = Math.max(0, z.slow - dt)
  if (z.snare) z.snare = Math.max(0, z.snare - dt)
  if (z.haste) z.haste = Math.max(0, z.haste - dt)
  if (z.mark) z.mark = Math.max(0, z.mark - dt)
  if (z.blockT) z.blockT = Math.max(0, z.blockT - dt)
  if (z.chill) {
    z.chillT = (z.chillT ?? 0) - dt
    if (z.chillT <= 0) {
      z.chill = Math.max(0, z.chill - 1)
      z.chillT = STATUS.chill.decay
    }
  }
  if (z.frozen && z.state !== 'stunned') z.frozen = false
  if (z.poison) {
    z.poison = Math.max(0, z.poison - dt)
    const stacks = z.poisonStacks ?? 1
    const dmg = (STATUS.poison.dps + (isBig(z) ? z.maxHp * STATUS.poison.bigShare : 0)) * stacks * (z.kind === 'boss' ? 0.5 : 1) * dt
    z.hp -= dmg
    z.poisonAcc = (z.poisonAcc ?? 0) + dmg
    if (z.poisonAcc >= STATUS.poison.dps * stacks * 0.5) {
      g.text(z.x, z.y - z.h / 2, String(Math.round(z.poisonAcc)), '#9BFF3B')
      z.poisonAcc = 0
    }
    if (z.poison === 0) z.poisonStacks = 0
    if (z.hp <= 0) zombieDied(g, z)
  }
}

function makeRoom(g: Game): boolean {
  if (g.zones.length < ENEMY.maxZones) return true
  const i = g.zones.findIndex((z) => z.hostile)
  if (i < 0) return false
  g.zones.splice(i, 1)
  return true
}

/** A green patch that lingers where a venom shell lands. */
function spawnCloud(g: Game, b: Bullet) {
  const s = b.cloud ?? 100
  addFriendlyZone(g, b.x, b.y, s, STATUS.cloud.life, { look: 'venom', dps: WEAPONS.venom.damage > 0 ? STATUS.cloud.dps : 0, owner: b.owner ?? g.localId })
  g.burst(b.x, b.y, '#9BFF3B', 10)
  g.addEffect('ring', b.x, b.y, 0, s * 0.8, 0.4, '#9BFF3B')
  g.sound('hit', b.x, b.y)
}

/** A patch made by a player: a venom cloud or a Runner's shock trap hurts zombies, a Medic's station heals the squad. */
export function addFriendlyZone(g: Game, x: number, y: number, size: number, life: number, opts: { look: ZoneLook; dps: number; owner: number; heal?: number; snare?: boolean }) {
  if (!makeRoom(g)) return
  g.zones.push({ id: g.nextId++, x: x - size / 2, y: y - size / 2, w: size, h: size, life, max: life, dps: opts.dps, owner: opts.owner, look: opts.look, heal: opts.heal, snare: opts.snare })
}

/** A puddle or cloud made by zombies. It hurts the players standing in it. */
export function addZone(g: Game, x: number, y: number, w: number, h: number, life: number, dps: number, hostile: boolean, owner = 0) {
  if (!makeRoom(g)) return
  g.zones.push({ id: g.nextId++, x: x - w / 2, y: y - h / 2, w, h, life, max: life, dps, owner, hostile })
}

/** An Exploder going off: a burst that throws players back and burns. It is gone afterwards. */
export function zombieBlast(g: Game, z: Zombie) {
  z.fuse = -1
  const s = ENEMY.exploder.blast
  g.addHitbox({ x: z.x - s / 2, y: z.y - s / 2, w: s, h: s }, 'zombie', ZOMBIES.exploder.damage * g.diff.damage, 0, ENEMY.exploder.knockback, 0.12, z.id)
  g.cosmetic({ t: 'boom', x: z.x, y: z.y, size: s, kind: 'fire' })
  g.kick(7)
  g.sound('explosion', z.x, z.y)
  z.hp = 0
}

/** One spit of acid from a Spitter, aimed at where the player is now. */
export function spitAcid(g: Game, z: Zombie, tx: number, ty: number) {
  if (g.shots.length >= ENEMY.maxShots) return
  const d = normalize(tx - z.x, ty - z.y)
  const a = ENEMY.acid
  const speed = a.speed * Math.min(1.4, 0.9 + 0.03 * g.level)
  g.shots.push({ id: g.nextId++, x: z.x + d.x * z.w * 0.6, y: z.y + d.y * z.w * 0.6, vx: d.x * speed, vy: d.y * speed, r: a.r, damage: ZOMBIES.spitter.damage * g.diff.damage, life: a.life, maxLife: a.life, kind: 'acid' })
  g.sound('spit', z.x, z.y)
}

/** A Mortar's bomb: it flies over walls and comes down on the spot it was aimed at, which is marked the whole way. */
export function lobBomb(g: Game, z: Zombie, tx: number, ty: number) {
  if (g.shots.length >= ENEMY.maxShots) return
  const m = ENEMY.mortar
  g.shots.push({ id: g.nextId++, x: z.x, y: z.y, vx: (tx - z.x) / m.flight, vy: (ty - z.y) / m.flight, r: m.r, damage: ZOMBIES.mortar.damage * g.diff.damage, life: m.flight, maxLife: m.flight, kind: 'bomb', tx, ty })
  g.addEffect('warn', tx, ty, 0, m.blast * 0.52, m.flight, '#FF7A3C')
  g.sound('lob', z.x, z.y)
}

/** Enemy shots fly, stop on walls and hurt the first player or pet they touch. Acid leaves a puddle where it lands. */
export function updateEnemyShots(g: Game, dt: number) {
  if (g.shots.length === 0) return
  const alive: EnemyShot[] = []
  for (const s of g.shots) {
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.life -= dt
    if (s.kind === 'bomb') {
      if (s.life > 0) {
        alive.push(s)
        continue
      }
      const m = ENEMY.mortar
      const x = s.tx ?? s.x
      const y = s.ty ?? s.y
      g.addHitbox({ x: x - m.blast / 2, y: y - m.blast / 2, w: m.blast, h: m.blast }, 'zombie', s.damage, 0, m.knockback, 0.12)
      g.cosmetic({ t: 'boom', x, y, size: m.blast, kind: 'fire' })
      g.sound('explosion', x, y)
      g.kick(5)
      continue
    }
    let landed = s.life <= 0 || hitsObstacle({ x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 })
    if (!landed) {
      for (const slot of g.slots) {
        const p = slot.player
        if (p.down || p.invuln > 0 || Math.hypot(p.x - s.x, p.y - s.y) > s.r + p.w / 2) continue
        hurtPlayer(g, slot, s.damage, 0, s.x - s.vx, s.y - s.vy, true)
        p.slow = Math.max(p.slow ?? 0, 1.4)
        landed = true
        break
      }
    }
    if (!landed) {
      for (const pet of g.pets) {
        if (pet.hp <= 0 || Math.hypot(pet.x - s.x, pet.y - s.y) > s.r + pet.w / 2) continue
        hurtPet(g, pet, s.damage, s.x - s.vx, s.y - s.vy)
        landed = true
        break
      }
    }
    if (landed) {
      const a = ENEMY.acid
      addZone(g, s.x, s.y, a.puddle, a.puddle, a.puddleLife, a.puddleDps, true)
      g.burst(s.x, s.y, '#9ACD32', 6)
    } else alive.push(s)
  }
  g.shots = alive
}

/** Patches on the ground do their work: puddles hurt players, clouds and traps hurt zombies, a med station heals. */
function updateZones(g: Game, dt: number) {
  if (g.zones.length === 0) return
  for (const zone of g.zones) {
    zone.life -= dt
    if (zone.hostile) {
      // poison left by Bloaters and Spitters hurts the players standing in it
      for (const slot of g.slots) {
        const p = slot.player
        if (p.down || !aabb(zone, bodyRect(p))) continue
        damagePlayer(g, slot, zone.dps * g.diff.hazard * dt)
        p.slow = Math.max(p.slow ?? 0, 0.4)
        slot.hazardTick -= dt
        if (slot.hazardTick <= 0) {
          slot.hazardTick = 0.5
          g.text(p.x, p.y - 26, 'Poisoned!', '#B6F06B')
          g.sound('sizzle', p.x, p.y)
        }
        if (p.hp <= 0) hurtPlayer(g, slot, 0, 0, p.x, p.y, true)
      }
      continue
    }
    if (zone.heal) {
      for (const slot of g.slots) {
        const p = slot.player
        if (p.down || !aabb(zone, bodyRect(p))) continue
        if (p.hp < p.maxHp && Math.random() < dt * 2.5) g.burst(p.x + (Math.random() - 0.5) * 16, p.y - 6, '#6EE7A8', 1)
        p.hp = Math.min(p.maxHp, p.hp + zone.heal * dt)
        p.slow = 0
      }
      for (const pet of g.pets) if (aabb(zone, bodyRect(pet))) healPet(pet, SKILL.station.petHeal * dt)
    }
    if (zone.dps <= 0) continue
    const color = zone.look === 'trap' ? '#9FF4FF' : '#9BFF3B'
    for (const z of g.zombies) {
      if (z.hp <= 0 || !aabb(zone, bodyRect(z))) continue
      const dmg = zone.dps * dt * (z.kind === 'boss' ? 0.5 : 1)
      z.hp -= dmg
      if (zone.snare) {
        z.snare = Math.max(z.snare ?? 0, 0.3)
        z.shock = Math.max(z.shock ?? 0, 0.15)
      } else z.slow = Math.max(z.slow ?? 0, 0.3)
      z.poisonAcc = (z.poisonAcc ?? 0) + dmg
      z.killer = zone.owner
      z.byPet = false
      if (z.poisonAcc >= STATUS.cloud.dps * 0.5) {
        g.text(z.x, z.y - z.h / 2, String(Math.round(z.poisonAcc)), color)
        z.poisonAcc = 0
      }
      if (z.hp <= 0) zombieDied(g, z)
    }
  }
  g.zones = g.zones.filter((z) => z.life > 0)
}

/**
 * Tesla: an instant bolt along the aim line. It strikes the first zombie it meets, then jumps to the
 * nearest ones, losing strength with every jump, and shocks each of them for a moment.
 */
export function fireTesla(g: Game, slot: PlayerSlot, dmgMul = 1) {
  const p = slot.player
  const def = WEAPONS.tesla
  const ox = p.x + p.aim.x * (p.w / 2 + def.barrel)
  const oy = p.y + p.aim.y * (p.h / 2 + def.barrel)
  let ex = ox
  let ey = oy
  let first: Zombie | undefined
  for (let d = 0; d <= 540 && !first; d += 12) {
    const x = ox + p.aim.x * d
    const y = oy + p.aim.y * d
    if (x < 0 || y < 0 || x > activeMap.w || y > activeMap.h || hitsObstacle({ x: x - 3, y: y - 3, w: 6, h: 6 })) break
    ex = x
    ey = y
    first = g.zombies.find((z) => z.hp > 0 && aabb({ x: x - 5, y: y - 5, w: 10, h: 10 }, bodyRect(z)))
  }
  const arc = (x1: number, y1: number, x2: number, y2: number) => g.addEffect('arc', x1, y1, Math.atan2(y2 - y1, x2 - x1), Math.hypot(x2 - x1, y2 - y1), 0.2, '#9FF4FF')
  arc(ox, oy, ex, ey)
  if (!first) {
    g.cosmetic({ t: 'spark', x: ex, y: ey, dx: -p.aim.x, dy: -p.aim.y, color: '#BFF3FF', n: 4 })
    return
  }
  const hit: Zombie[] = [first]
  let from = first
  for (let i = 0; i < (def.chain ?? 0); i++) {
    let best: Zombie | undefined
    let bestD: number = STATUS.chain.range
    for (const z of g.zombies) {
      if (z.hp <= 0 || hit.includes(z)) continue
      const d = Math.hypot(z.x - from.x, z.y - from.y)
      if (d < bestD) {
        best = z
        bestD = d
      }
    }
    if (!best) break
    arc(from.x, from.y, best.x, best.y)
    hit.push(best)
    from = best
  }
  hit.forEach((z, i) => {
    const k = normalize(z.x - ox, z.y - oy)
    z.shock = 0.3
    g.burst(z.x, z.y, '#BFF3FF', 4)
    hurtZombie(g, z, def.damage * dmgMul * Math.pow(STATUS.chain.falloff, i), k.x, k.y, def.knockback, def.stun, slot.id, { weapon: 'tesla', ap: 1 })
  })
  g.cosmetic({ t: 'light', x: first.x, y: first.y, r: 170, color: '127,232,255', life: 0.18 })
  g.sound('electric', first.x, first.y)
}

/** Grenade blast: one big AABB that hurts every zombie inside it. */
function explode(g: Game, b: Bullet) {
  const s = b.blast ?? 0
  g.addHitbox({ x: b.x - s / 2, y: b.y - s / 2, w: s, h: s }, 'player', b.damage, b.stun, b.knockback, 0.1, undefined, b.owner, { weapon: b.weapon, ap: 1 })
  g.cosmetic({ t: 'boom', x: b.x, y: b.y, size: s, kind: 'fire' })
  g.sound('explosion', b.x, b.y)
  g.kick(8)
}

/** Applies hitboxes: player blows hurt zombies, zombie strikes hurt every player and pet they touch. */
export function resolveHitboxes(g: Game, dt: number) {
  for (const hb of g.hitboxes) {
    const cx = hb.rect.x + hb.rect.w / 2
    const cy = hb.rect.y + hb.rect.h / 2
    if (hb.owner === 'player') {
      for (const z of g.zombies) {
        if (z.hp <= 0 || hb.hitIds.has(z.id)) continue
        if (aabb(hb.rect, bodyRect(z))) {
          hb.hitIds.add(z.id)
          const k = normalize(z.x - cx, z.y - cy)
          hurtZombie(g, z, hb.damage, k.x, k.y, hb.knockback, hb.stun, hb.ownerId, hb.src)
        }
      }
    } else {
      for (const slot of g.slots) {
        const p = slot.player
        if (p.down || hb.hitIds.has(slot.id) || p.invuln > 0 || !aabb(hb.rect, bodyRect(p))) continue
        hb.hitIds.add(slot.id)
        hurtPlayer(g, slot, hb.damage, hb.knockback, cx, cy, false)
      }
      // pets are remembered under a negative id so they can never be mistaken for a player
      for (const pet of g.pets) {
        if (pet.hp <= 0 || hb.hitIds.has(-pet.id) || !aabb(hb.rect, bodyRect(pet))) continue
        hb.hitIds.add(-pet.id)
        hurtPet(g, pet, hb.damage, cx, cy)
      }
    }
    hb.life -= dt
  }
  g.hitboxes = g.hitboxes.filter((h) => h.life > 0)
  const before = g.zombies.length
  g.zombies = g.zombies.filter((z) => z.hp > 0)
  if (g.zombies.length !== before) g.emitStatus()
}

export function hurtZombie(g: Game, z: Zombie, damage: number, kx: number, ky: number, knockback: number, stun: number, ownerId?: number, src: HitSource = {}) {
  const boss = z.kind === 'boss'
  // a Shaman's shield soaks most of the hit
  if ((z.shield ?? 0) > 0) damage *= ENEMY.shaman.shieldTaken
  // a Shielder's riot shield stops most of what comes at its front; fire, blasts, lightning and a Sniper's rounds get through
  let blocked = false
  if (z.kind === 'shielder' && z.state !== 'stunned') {
    const ap = clamp(src.ap ?? 0, 0, 1)
    const headOn = -(kx * z.aim.x + ky * z.aim.y)
    if (ap < 1 && headOn > ENEMY.shielder.arc) {
      const taken = src.melee ? ENEMY.shielder.meleeTaken : ENEMY.shielder.taken
      damage *= taken + (1 - taken) * ap
      knockback *= 0.25
      stun = 0
      blocked = true
    }
  }
  if ((z.mark ?? 0) > 0) damage *= SKILL.mark.taken
  const far = src.far ?? 1
  if (far > 1) damage *= far
  const heavy = z.kind === 'tank' || boss
  const kb = knockback * (boss ? 0.03 : heavy ? 0.3 : 1)
  if (z.frozen) {
    damage *= STATUS.chill.shatter
    g.burst(z.x, z.y, '#EFFFFF', 3)
  }
  z.hp -= damage
  z.flash = 0.1
  z.vx += kx * kb
  z.vy += ky * kb
  z.killer = ownerId ?? g.localId
  z.byPet = Boolean(src.pet)
  if (blocked) {
    g.cosmetic({ t: 'spark', x: z.x + z.aim.x * z.w * 0.5, y: z.y + z.aim.y * z.w * 0.5, dx: -kx, dy: -ky, color: '#CFE4FF', n: 4 })
    g.sound('clang', z.x, z.y)
    if (!z.blockT) {
      z.blockT = 0.7
      g.text(z.x, z.y - z.h / 2 - 12, 'Blocked', '#9CC4FF')
    }
  } else {
    g.cosmetic({ t: 'spray', x: z.x, y: z.y, dx: kx, dy: ky, color: bloodOf(z.kind), n: damage >= 60 ? 7 : 4 })
  }
  // a long shot or a marked target lands as a heavy hit: a bigger, warmer number
  const heavyHit = far >= 1.25 || ((z.mark ?? 0) > 0 && damage >= 30)
  g.text(z.x, z.y - z.h / 2, String(Math.round(damage)), blocked ? '#9FB0C8' : heavyHit ? '#FFB067' : '#FFE9A8', heavyHit && !blocked ? 1 : undefined)
  if (z.hp > 0) g.sound('hit', z.x, z.y)
  if (z.hp <= 0) {
    zombieDied(g, z)
    return
  }
  if (stun > 0 && !boss) {
    g.hitboxes = g.hitboxes.filter((h) => h.sourceId !== z.id) // interrupt its attack
    setZombieState(z, 'stunned', stun * (heavy ? 0.4 : 1))
  }
}

/** Fire eats health every frame; a number pops up twice a second. */
function burnDamage(g: Game, z: Zombie, dt: number) {
  const big = z.kind === 'tank' || z.kind === 'boss'
  const dmg = (BURN.dps + (big ? z.maxHp * BURN.bigShare : 0)) * dt
  z.hp -= dmg
  z.burnAcc = (z.burnAcc ?? 0) + dmg
  if (z.burnAcc >= BURN.dps * 0.5) {
    g.text(z.x, z.y - z.h / 2, String(Math.round(z.burnAcc)), '#FF9A3C')
    z.burnAcc = 0
  }
  if (z.hp <= 0) zombieDied(g, z)
}

/** Harder difficulties pay a little more: their zombies soak up more ammo. */
function coinRate(g: Game): number {
  return g.difficulty === 'extreme' ? 1.3 : g.difficulty === 'hard' ? 1.15 : 1
}

function zombieDied(g: Game, z: Zombie) {
  if (z.kind !== 'boss') g.sound('zdie', z.x, z.y, z.kind)
  // families that leave something behind
  if (z.kind === 'bloater') {
    const c = ENEMY.bloater.cloud
    addZone(g, z.x, z.y, c, c, ENEMY.bloater.cloudLife, ENEMY.bloater.cloudDps, true)
    g.cosmetic({ t: 'boom', x: z.x, y: z.y, size: c, kind: 'acid' })
    g.sound('burst', z.x, z.y)
  } else if (z.kind === 'exploder' && z.fuse !== -1) {
    zombieBlast(g, z)
  } else if (z.kind === 'brood') {
    hatch(g, z)
  }
  const def = ZOMBIES[z.kind]
  g.score += def.points
  g.kills += 1
  grantCoins(g, def.coins * coinRate(g) * (z.kind === 'boss' ? 1 + 0.3 * g.tier : 1), z.x, z.y)
  // the body comes apart the way the last blow was pushing it
  g.cosmetic({ t: 'gib', x: z.x, y: z.y, w: z.w, dx: z.vx, dy: z.vy, zk: z.kind })
  g.cosmetic({ t: 'decal', x: z.x, y: z.y, r: z.w * (0.7 + Math.random() * 0.5), rot: Math.random() * Math.PI, kind: z.kind === 'bloater' || z.kind === 'spitter' ? 4 : z.kind === 'tank' ? 2 : 1 })
  maybeDrop(g, z.x, z.y)
  const killer = g.slotById(z.killer ?? g.localId)
  const fx = killer ? killEffect(killer.skin.effect) : undefined
  if (fx) {
    g.sound('killfx', z.x, z.y, fx)
    g.cosmetic({ t: 'kill', x: z.x, y: z.y, w: z.w, h: z.h, zk: z.kind, fx, slot: killer?.id ?? 0 })
  }
  if (killer && !killer.player.down) {
    const kp = killer.player
    // Striker: every kill winds both skills forward a little
    if (kp.cls === 'damage') {
      kp.skillCd = Math.max(0, kp.skillCd - SKILL.momentum)
      kp.skill2Cd = Math.max(0, kp.skill2Cd - SKILL.momentum)
    }
    // Summoner: a kill by a pet feeds its master
    if (kp.cls === 'summoner' && z.byPet && kp.hp < kp.maxHp) {
      kp.hp = Math.min(kp.maxHp, kp.hp + SKILL.siphon)
      g.burst(kp.x, kp.y, '#B98CFF', 2)
    }
  }
  // Sniper: a marked target going down gives half the mark's cooldown back
  if ((z.mark ?? 0) > 0 && z.markBy !== undefined) {
    const marker = g.slotById(z.markBy)
    if (marker) {
      marker.player.skill2Cd *= 1 - SKILL.mark.refund
      marker.player.skill2T = 0
    }
  }
  if (z.kind === 'boss') bossDown(g, z)
}

/** A Brood bursts into a swarm of Mites. */
function hatch(g: Game, z: Zombie) {
  const alive = g.zombies.reduce((n, o) => n + (o.kind === 'mite' && o.hp > 0 ? 1 : 0), 0) + g.births.length
  const n = Math.max(0, Math.min(ENEMY.brood.mites, ENEMY.maxMites - alive))
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.random()
    const mite = createZombieAt(g.nextId++, 'mite', g.level, z.x + Math.cos(a) * 14, z.y + Math.sin(a) * 14, 1, g.diff.hp)
    mite.vx = Math.cos(a) * 220
    mite.vy = Math.sin(a) * 220
    g.births.push(mite)
  }
  g.cosmetic({ t: 'boom', x: z.x, y: z.y, size: 90, kind: 'arcane' })
  g.sound('burst', z.x, z.y)
}

function bossDown(g: Game, z: Zombie) {
  g.text(z.x, z.y - 50, 'BOSS DOWN', '#FFE16A', 2)
  g.sound('bossdown', z.x, z.y)
  g.kick(14)
  g.cosmetic({ t: 'boom', x: z.x, y: z.y, size: 300, kind: 'fire' })
  g.addEffect('slam', z.x, z.y, 0, 260, 0.7)
  g.score += 250
  if (Math.random() < 0.6) addPickup(g, 'medkit', z.x - 36, z.y + 20, undefined, 45)
  addPickup(g, 'ammo', z.x + 36, z.y + 20, undefined, 45)
  addPickup(g, 'coins', z.x, z.y - 36, undefined, 45, 60 + 20 * g.tier)
}
