import { aabb, bodyRect, hitsObstacle, normalize, sweptRect } from './collision'
import { BURN, ENEMY, STATUS, WEAPONS, ZOMBIES } from './config'
import type { Game } from './engine'
import { addPickup, maybeDrop } from './pickups'
import { damagePlayer, hurtPlayer } from './players'
import { killEffect } from './skins'
import type { Bullet, EnemyShot, PlayerSlot, Zombie } from './types'
import { activeMap } from './world'
import { setZombieState } from './zombies'

/** Moves every bullet, stops it at walls and applies hits to zombies. */
export function updateBullets(g: Game, dt: number) {
  g.bullets = g.bullets.filter((b) => {
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
      else if (b.weapon !== 'flamer') g.burst(b.x, b.y, b.status === 'freeze' ? '#CFF4FF' : '#7C86A0', 3)
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
      hurtZombie(g, z, b.damage, k.x, k.y, b.knockback, b.stun, b.owner)
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

/** Poison damage, chill and slow wearing off, frozen ending with the stun. */
function updateStatuses(g: Game, z: Zombie, dt: number) {
  if (z.shock) z.shock = Math.max(0, z.shock - dt)
  if (z.shield) z.shield = Math.max(0, z.shield - dt)
  if (z.slow) z.slow = Math.max(0, z.slow - dt)
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

/** A green patch that lingers where a venom shell lands. */
function spawnCloud(g: Game, b: Bullet) {
  const s = b.cloud ?? 100
  g.zones.push({ id: g.nextId++, x: b.x - s / 2, y: b.y - s / 2, w: s, h: s, life: STATUS.cloud.life, max: STATUS.cloud.life, dps: WEAPONS.venom.damage > 0 ? STATUS.cloud.dps : 0, owner: b.owner ?? g.localId })
  g.burst(b.x, b.y, '#9BFF3B', 10)
  g.addEffect('ring', b.x, b.y, 0, s * 0.8, 0.4, '#9BFF3B')
  g.sound('hit', b.x, b.y)
}

/** A patch on the ground. Zombie-made ones (hostile) hurt players; the player's venom clouds hurt zombies. */
export function addZone(g: Game, x: number, y: number, w: number, h: number, life: number, dps: number, hostile: boolean, owner = 0) {
  if (g.zones.length >= ENEMY.maxZones) {
    const i = g.zones.findIndex((z) => z.hostile)
    if (i >= 0) g.zones.splice(i, 1)
    else return
  }
  g.zones.push({ id: g.nextId++, x: x - w / 2, y: y - h / 2, w, h, life, max: life, dps, owner, hostile })
}

/** An Exploder going off: a burst that throws players back and burns. It is gone afterwards. */
export function zombieBlast(g: Game, z: Zombie) {
  z.fuse = -1
  const s = ENEMY.exploder.blast
  g.addHitbox({ x: z.x - s / 2, y: z.y - s / 2, w: s, h: s }, 'zombie', ZOMBIES.exploder.damage * g.diff.damage, 0, ENEMY.exploder.knockback, 0.12, z.id)
  g.addEffect('slam', z.x, z.y, 0, s * 0.62, 0.5)
  g.addEffect('ring', z.x, z.y, 0, s * 0.8, 0.4, '#FF8A3C')
  g.burst(z.x, z.y, '#FF8A3C', 22)
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

/** Enemy shots fly, stop on walls and hurt the first player they touch. Acid leaves a puddle where it lands. */
export function updateEnemyShots(g: Game, dt: number) {
  if (g.shots.length === 0) return
  const alive: EnemyShot[] = []
  for (const s of g.shots) {
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.life -= dt
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
    if (landed) {
      const a = ENEMY.acid
      addZone(g, s.x, s.y, a.puddle, a.puddle, a.puddleLife, a.puddleDps, true)
      g.burst(s.x, s.y, '#9ACD32', 6)
    } else alive.push(s)
  }
  g.shots = alive
}

/** Zombies inside a cloud lose health and slow down. */
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
    for (const z of g.zombies) {
      if (z.hp <= 0 || !aabb(zone, bodyRect(z))) continue
      const dmg = zone.dps * dt * (z.kind === 'boss' ? 0.5 : 1)
      z.hp -= dmg
      z.slow = Math.max(z.slow ?? 0, 0.3)
      z.poisonAcc = (z.poisonAcc ?? 0) + dmg
      z.killer = zone.owner
      if (z.poisonAcc >= STATUS.cloud.dps * 0.5) {
        g.text(z.x, z.y - z.h / 2, String(Math.round(z.poisonAcc)), '#9BFF3B')
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
    g.burst(ex, ey, '#BFF3FF', 3)
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
    hurtZombie(g, z, def.damage * dmgMul * Math.pow(STATUS.chain.falloff, i), k.x, k.y, def.knockback, def.stun, slot.id)
  })
  g.sound('electric', first.x, first.y)
}

/** Grenade blast: one big AABB that hurts every zombie inside it. */
function explode(g: Game, b: Bullet) {
  const s = b.blast ?? 0
  g.addHitbox({ x: b.x - s / 2, y: b.y - s / 2, w: s, h: s }, 'player', b.damage, b.stun, b.knockback, 0.1, undefined, b.owner)
  g.addEffect('slam', b.x, b.y, 0, s * 0.6, 0.45)
  g.sound('explosion', b.x, b.y)
  g.burst(b.x, b.y, '#FFB04A', 14)
  g.burst(b.x, b.y, '#7C86A0', 6)
  g.kick(8)
}

/** Applies hitboxes: player blows hurt zombies, zombie strikes hurt every player they touch. */
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
          hurtZombie(g, z, hb.damage, k.x, k.y, hb.knockback, hb.stun, hb.ownerId)
        }
      }
    } else {
      for (const slot of g.slots) {
        const p = slot.player
        if (p.down || hb.hitIds.has(slot.id) || p.invuln > 0 || !aabb(hb.rect, bodyRect(p))) continue
        hb.hitIds.add(slot.id)
        hurtPlayer(g, slot, hb.damage, hb.knockback, cx, cy, false)
      }
    }
    hb.life -= dt
  }
  g.hitboxes = g.hitboxes.filter((h) => h.life > 0)
  const before = g.zombies.length
  g.zombies = g.zombies.filter((z) => z.hp > 0)
  if (g.zombies.length !== before) g.emitStatus()
}

export function hurtZombie(g: Game, z: Zombie, damage: number, kx: number, ky: number, knockback: number, stun: number, ownerId?: number) {
  const boss = z.kind === 'boss'
  // a Shaman's shield soaks most of the hit
  if ((z.shield ?? 0) > 0) damage *= ENEMY.shaman.shieldTaken
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
  g.burst(z.x, z.y, '#7A1F2B', 4)
  g.text(z.x, z.y - z.h / 2, String(Math.round(damage)), '#FFE9A8')
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

function zombieDied(g: Game, z: Zombie) {
  if (z.kind !== 'boss') g.sound('zdie', z.x, z.y, z.kind)
  // families that leave something behind
  if (z.kind === 'bloater') {
    const c = ENEMY.bloater.cloud
    addZone(g, z.x, z.y, c, c, ENEMY.bloater.cloudLife, ENEMY.bloater.cloudDps, true)
    g.addEffect('ring', z.x, z.y, 0, c * 0.8, 0.5, '#B7B84A')
    g.burst(z.x, z.y, '#B7B84A', 18)
    g.sound('burst', z.x, z.y)
  } else if (z.kind === 'exploder' && z.fuse !== -1) {
    zombieBlast(g, z)
  }
  g.score += ZOMBIES[z.kind].points
  g.kills += 1
  g.burst(z.x, z.y, '#7A1F2B', 12)
  g.cosmetic({ t: 'decal', x: z.x, y: z.y, r: z.w * (0.7 + Math.random() * 0.5), rot: Math.random() * Math.PI, kind: z.kind === 'tank' ? 2 : 1 })
  maybeDrop(g, z.x, z.y)
  const killer = g.slotById(z.killer ?? g.localId)
  const fx = killer ? killEffect(killer.skin.effect) : undefined
  if (fx) {
    g.sound('killfx', z.x, z.y, fx)
    g.cosmetic({ t: 'kill', x: z.x, y: z.y, w: z.w, h: z.h, zk: z.kind, fx, slot: killer?.id ?? 0 })
  }
  if (z.kind === 'boss') bossDown(g, z)
}

function bossDown(g: Game, z: Zombie) {
  g.text(z.x, z.y - 50, 'BOSS DOWN', '#FFE16A')
  g.sound('bossdown', z.x, z.y)
  g.kick(14)
  g.burst(z.x, z.y, '#7A1F2B', 40)
  g.addEffect('slam', z.x, z.y, 0, 260, 0.7)
  g.score += 250
  if (Math.random() < 0.6) addPickup(g, 'medkit', z.x - 36, z.y + 20, undefined, 45)
  addPickup(g, 'ammo', z.x + 36, z.y + 20, undefined, 45)
  addPickup(g, 'weapon', z.x, z.y - 36, undefined, 45)
}
