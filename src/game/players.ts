import { aabb, bodyRect, moveBody, normalize } from './collision'
import { CLASSES, DEFAULT_CLASS, SKILL, type ClassId } from './classes'
import { CHAPTERS } from './chapters'
import { fireTesla } from './combat'
import { BOOST, PLAYER, PUNCH, REVIVE, STATUS, WEAPON_ORDER, WEAPONS, ZOMBIES } from './config'
import type { Game } from './engine'
import { hasAmmo } from './pickups'
import { gunLook, tracerColor } from './skins'
import type { Player, PlayerSlot, Vec, WeaponId } from './types'
import { activeMap } from './world'

export function newPlayer(spawn: Vec, cls: ClassId = DEFAULT_CLASS): Player {
  const maxHp = Math.round(PLAYER.maxHp * CLASSES[cls].hp)
  return {
    x: spawn.x,
    y: spawn.y,
    w: PLAYER.size,
    h: PLAYER.size,
    hp: maxHp,
    maxHp,
    aim: { x: 1, y: 0 },
    state: 'idle',
    stateTime: 0,
    invuln: 0,
    dashTime: 0,
    skillCd: 0,
    skillT: 0,
    cls: cls,
    fireCooldown: 0,
    muzzle: 0,
    vx: 0,
    vy: 0,
    mx: 0,
    my: 0,
    weapon: 'fists',
    armor: 0,
    down: false,
    revive: 0,
    owned: { fists: true, pistol: false, smg: false, shotgun: false, rifle: false, flamer: false, launcher: false, minigun: false, railgun: false, venom: false, tesla: false, cryo: false },
    ammo: { fists: 0, pistol: 0, smg: 0, shotgun: 0, rifle: 0, flamer: 0, launcher: 0, minigun: 0, railgun: 0, venom: 0, tesla: 0, cryo: 0 },
  }
}

/** Guns you start a chapter with when you did not play the earlier ones in this session. */
export function giveLoadout(p: Player, chapter: number, unlocked: WeaponId[] = []) {
  // heavy weapons earned in armory trials come with you everywhere, with one pickup's worth of ammo
  for (const id of unlocked) {
    p.owned[id] = true
    p.ammo[id] = Math.max(p.ammo[id], WEAPONS[id].ammoPickup)
  }
  if (chapter === 0) return
  const guns = new Set<WeaponId>(['pistol', 'smg', 'shotgun'])
  for (let i = 0; i < Math.min(chapter, CHAPTERS.length); i++) guns.add(CHAPTERS[i].newGun)
  for (const id of guns) {
    p.owned[id] = true
    p.ammo[id] = WEAPONS[id].infinite ? 0 : Math.min(WEAPONS[id].maxAmmo, WEAPONS[id].ammoPickup * 2)
  }
  p.weapon = 'pistol'
}

function setState(p: Player, state: Player['state']) {
  p.state = state
  p.stateTime = 0
}

/** One tick of one player: timers, revive, aiming, dashing, walking and firing. */
export function updateSlot(g: Game, slot: PlayerSlot, dt: number) {
  const p = slot.player
  p.stateTime += dt
  p.invuln = Math.max(0, p.invuln - dt)
  p.fireCooldown = Math.max(0, p.fireCooldown - dt)
  p.skillCd = Math.max(0, p.skillCd - dt)
  p.skillT = Math.max(0, p.skillT - dt)
  if (p.slow) p.slow = Math.max(0, p.slow - dt)
  p.muzzle = Math.max(0, p.muzzle - dt)

  if (p.down) {
    updateRevive(g, slot, dt)
    slot.firing = false
    slot.queuedSkill = false
    return
  }

  const ix = (slot.keys.has('right') ? 1 : 0) - (slot.keys.has('left') ? 1 : 0)
  const iy = (slot.keys.has('down') ? 1 : 0) - (slot.keys.has('up') ? 1 : 0)
  const dir = normalize(ix, iy)
  p.mx = dir.x
  p.my = dir.y
  updateAim(g, slot, dir)

  if (p.state === 'stunned') {
    moveBody(p, p.vx * dt, p.vy * dt)
    p.vx *= Math.pow(0.001, dt)
    p.vy *= Math.pow(0.001, dt)
    if (p.stateTime >= PLAYER.stunTime) setState(p, 'idle')
    return
  }

  if (slot.queuedSkill && p.skillCd <= 0) castSkill(g, slot, dir)
  slot.queuedSkill = false

  if (p.dashTime > 0) {
    p.dashTime -= dt
    moveBody(p, p.vx * PLAYER.dashSpeed * dt, p.vy * PLAYER.dashSpeed * dt)
    return
  }

  const walk = PLAYER.speed * CLASSES[p.cls].speed * (p.slow ? 0.55 : 1) * (WEAPONS[p.weapon].heavy ? STATUS.heavySpeed : 1)
  moveBody(p, dir.x * walk * dt, dir.y * walk * dt)
  if (slot.firing && p.fireCooldown <= 0) fire(g, slot)

  const attacking = p.weapon === 'fists' ? p.fireCooldown > WEAPONS.fists.interval - 0.15 : p.muzzle > 0
  const next: Player['state'] = attacking ? 'attack' : dir.x !== 0 || dir.y !== 0 ? 'move' : 'idle'
  if (next !== p.state) setState(p, next)
}

/** The class skill on Shift or Space: Runner dashes, Bulwark shields, Striker overdrives, Medic pulses. */
function castSkill(g: Game, slot: PlayerSlot, dir: Vec) {
  const p = slot.player
  const cls = CLASSES[p.cls]
  p.skillCd = cls.cooldown
  switch (p.cls) {
    case 'agile':
      p.dashTime = PLAYER.dashDuration
      g.sound('dash', p.x, p.y)
      p.invuln = Math.max(p.invuln, PLAYER.dashInvuln)
      p.vx = dir.x !== 0 || dir.y !== 0 ? dir.x : p.aim.x
      p.vy = dir.x !== 0 || dir.y !== 0 ? dir.y : p.aim.y
      break
    case 'tank':
      p.skillT = cls.duration
      g.addEffect('ring', p.x, p.y, 0, SKILL.shield.taunt * 0.4, 0.6, cls.color)
      g.text(p.x, p.y - 34, 'Shield up!', cls.color)
      g.sound('skill', p.x, p.y, 'tank')
      g.kick(3, slot.id)
      break
    case 'damage':
      p.skillT = cls.duration
      p.fireCooldown = 0
      g.addEffect('ring', p.x, p.y, 0, 90, 0.5, cls.color)
      g.burst(p.x, p.y, cls.color, 14)
      g.text(p.x, p.y - 34, 'OVERDRIVE', cls.color)
      g.sound('skill', p.x, p.y, 'damage')
      break
    case 'support': {
      p.skillT = cls.duration
      const r = SKILL.pulse.range
      for (const s of g.slots) {
        const q = s.player
        if (q.down || Math.hypot(q.x - p.x, q.y - p.y) > r) continue
        const gain = s === slot ? q.maxHp * SKILL.pulse.self : SKILL.pulse.heal
        q.hp = Math.min(q.maxHp, q.hp + gain)
        q.slow = 0
        g.text(q.x, q.y - 28, `+${Math.round(gain)}`, '#6EE7A8')
        g.burst(q.x, q.y, '#6EE7A8', 8)
      }
      g.addEffect('ring', p.x, p.y, 0, r * 0.9, 0.7, cls.color)
      g.addEffect('ring', p.x, p.y, 0, r * 0.5, 0.5, '#6EE7A8')
      g.sound('skill', p.x, p.y, 'support')
      break
    }
  }
}

function updateAim(g: Game, slot: PlayerSlot, dir: Vec) {
  const p = slot.player
  if (slot.aimWorld) {
    const a = normalize(slot.aimWorld.x - p.x, slot.aimWorld.y - p.y)
    if (a.x !== 0 || a.y !== 0) p.aim = a
    return
  }
  if (slot.autoAim) {
    let best: { x: number; y: number } | null = null
    let bestD = 520
    for (const z of g.zombies) {
      const d = Math.hypot(z.x - p.x, z.y - p.y)
      if (d < bestD) {
        bestD = d
        best = z
      }
    }
    if (best) p.aim = normalize(best.x - p.x, best.y - p.y)
    else if (dir.x !== 0 || dir.y !== 0) p.aim = dir
    return
  }
  const wx = slot.camera.x + slot.aimScreen.x
  const wy = slot.camera.y + slot.aimScreen.y
  const a = normalize(wx - p.x, wy - p.y)
  if (a.x !== 0 || a.y !== 0) p.aim = a
}

/** A downed player is revived by a living teammate standing close for a few seconds. */
function updateRevive(g: Game, slot: PlayerSlot, dt: number) {
  const p = slot.player
  const helper = g.slots.find((s) => s !== slot && !s.player.down && Math.hypot(s.player.x - p.x, s.player.y - p.y) <= REVIVE.range)
  if (helper) p.revive = (p.revive ?? 0) + (dt / REVIVE.seconds) * (helper.player.cls === 'support' ? SKILL.reviveBonus : 1)
  else p.revive = Math.max(0, (p.revive ?? 0) - dt / 2)
  if ((p.revive ?? 0) < 1) return
  p.down = false
  p.revive = 0
  p.hp = p.maxHp * REVIVE.hp
  p.invuln = REVIVE.invuln
  p.vx = 0
  p.vy = 0
  setState(p, 'idle')
  g.addEffect('ring', p.x, p.y, 0, 90, 0.7, '#6EE7A8')
  g.burst(p.x, p.y, '#6EE7A8', 16)
  g.text(p.x, p.y - 32, `${slot.name} is back!`, '#6EE7A8')
  g.sound('revive', p.x, p.y)
}

export function fire(g: Game, slot: PlayerSlot) {
  const p = slot.player
  const def = WEAPONS[p.weapon]
  const overdrive = p.cls === 'damage' && p.skillT > 0
  const dmgMul = overdrive ? SKILL.overdrive.damage : 1
  p.fireCooldown = def.interval / (overdrive ? SKILL.overdrive.fireRate : 1)
  if (p.weapon === 'fists') {
    const size = PUNCH.reach
    const cx = p.x + p.aim.x * (p.w / 2 + size / 2)
    const cy = p.y + p.aim.y * (p.h / 2 + size / 2)
    g.addHitbox({ x: cx - size / 2, y: cy - size / 2, w: size, h: size }, 'player', def.damage * dmgMul, def.stun, def.knockback, PUNCH.life, undefined, slot.id)
    setState(p, 'attack')
    g.sound('punch', p.x, p.y)
    return
  }
  if (!hasAmmo(p, p.weapon)) {
    outOfAmmo(g, slot)
    return
  }
  if (!def.infinite) p.ammo[p.weapon] -= 1
  p.muzzle = 0.06
  if (p.weapon === 'flamer' && Math.random() < 0.3) g.burst(p.x + p.aim.x * 40, p.y + p.aim.y * 40, '#FFB04A', 1)
  if (def.chain) {
    fireTesla(g, slot, dmgMul)
    g.kick(2.2, slot.id)
    g.sound('shot', p.x, p.y, p.weapon)
    if (!hasAmmo(p, p.weapon)) outOfAmmo(g, slot)
    return
  }
  const base = Math.atan2(p.aim.y, p.aim.x)
  const look = p.weapon === 'flamer' ? undefined : gunLook(slot.skin.gun)
  for (let i = 0; i < def.pellets; i++) {
    const a = base + (Math.random() - 0.5) * 2 * def.spread
    const vx = Math.cos(a)
    const vy = Math.sin(a)
    const sx = p.x + vx * (p.w / 2 + def.barrel)
    const sy = p.y + vy * (p.h / 2 + def.barrel)
    const speed = def.speed * (0.92 + Math.random() * 0.16)
    g.bullets.push({
      x: sx, y: sy, px: sx, py: sy, vx: vx * speed, vy: vy * speed,
      damage: def.damage * dmgMul, life: def.life, pierce: def.pierce, knockback: def.knockback, stun: def.stun,
      hitIds: new Set(), color: look ? tracerColor(look, g.time, i * 25) : def.color, weapon: p.weapon, maxLife: def.life, blast: def.blast, status: def.status, cloud: def.cloud,
      glow: look?.glow, sparkle: look?.sparkle, owner: slot.id,
    })
  }
  if (look?.ring && (def.interval > 0.2 || Math.random() < 0.4)) {
    const d = p.w / 2 + def.barrel
    g.addEffect('ring', p.x + p.aim.x * d, p.y + p.aim.y * d, 0, 58, 0.34, tracerColor(look, g.time))
  }
  g.kick(p.weapon === 'shotgun' || p.weapon === 'railgun' ? 5 : p.weapon === 'launcher' ? 6 : p.weapon === 'flamer' ? 0.6 : 1.5, slot.id)
  g.sound('shot', p.x, p.y, p.weapon)
  if (!hasAmmo(p, p.weapon)) outOfAmmo(g, slot)
}

function outOfAmmo(g: Game, slot: PlayerSlot) {
  const p = slot.player
  g.sound('dry', p.x, p.y)
  g.text(p.x, p.y - 24, `${WEAPONS[p.weapon].label} empty`, '#FF7A85')
  const fallback = WEAPON_ORDER.find((w) => w !== 'fists' && w !== p.weapon && hasAmmo(p, w))
  p.weapon = fallback ?? 'fists'
  p.fireCooldown = 0.25
}

/** Armor soaks damage first. Returns the damage that reached health. */
export function damagePlayer(g: Game, slot: PlayerSlot, amount: number): number {
  const p = slot.player
  // the Bulwark's shield soaks most of every hit while it lasts
  if (p.cls === 'tank' && p.skillT > 0) amount *= SKILL.shield.taken
  const armor = p.armor ?? 0
  const absorbed = Math.min(armor, amount)
  p.armor = armor - absorbed
  const lost = amount - absorbed
  p.hp = Math.max(0, p.hp - lost)
  if (absorbed > 0 && p.armor <= 0) g.text(p.x, p.y - 30, 'Armor broken', '#7FB0FF')
  return lost
}

export function hurtPlayer(g: Game, slot: PlayerSlot, damage: number, knockback: number, cx: number, cy: number, contact: boolean) {
  const p = slot.player
  const k = normalize(p.x - cx, p.y - cy)
  const hpLost = damagePlayer(g, slot, damage)
  g.sound(hpLost > 0 ? 'hurt' : 'armorhit', p.x, p.y)
  p.invuln = contact ? PLAYER.contactInvuln : PLAYER.invulnAfterHit
  if (contact) {
    moveBody(p, k.x * 12, k.y * 12)
    g.kick(4, slot.id)
  } else {
    p.vx = k.x * knockback
    p.vy = k.y * knockback
    p.dashTime = 0
    setState(p, 'stunned')
    g.kick(8, slot.id)
  }
  g.addEffect('claw', p.x, p.y, Math.atan2(p.y - cy, p.x - cx) + Math.PI + (Math.random() - 0.5), contact ? 30 : 42, 0.45)
  g.burst(p.x, p.y, '#B3202E', contact ? 6 : 12)
  g.text(p.x, p.y - 20, `-${Math.round(damage)}`, hpLost > 0 ? '#FF7A85' : '#7FB0FF')
  if (p.hp <= 0) playerDown(g, slot)
}

/**
 * Health hit zero. An Extra Life boost revives you at once with a shockwave. Otherwise you go down
 * and a teammate can revive you; the run ends when everyone is down.
 */
export function playerDown(g: Game, slot: PlayerSlot) {
  const p = slot.player
  if (p.down) return
  if (slot.charges.life > 0) {
    slot.charges.life -= 1
    g.onBoostUsed?.('life', slot.id)
    p.hp = p.maxHp * BOOST.lifeHp
    p.invuln = BOOST.lifeInvuln
    p.vx = 0
    p.vy = 0
    p.dashTime = 0
    setState(p, 'idle')
    const s = BOOST.lifeBlast
    g.addHitbox({ x: p.x - s / 2, y: p.y - s / 2, w: s, h: s }, 'player', BOOST.lifeBlastDamage, 1.5, 520, 0.12, undefined, slot.id)
    g.addEffect('ring', p.x, p.y, 0, s * 0.7, 0.7, '#FFE16A')
    g.addEffect('slam', p.x, p.y, 0, s * 0.6, 0.55)
    g.burst(p.x, p.y, '#FFE16A', 20)
    g.text(p.x, p.y - 40, 'EXTRA LIFE!', '#FFE16A')
    g.sound('life', p.x, p.y)
    g.kick(12, slot.id)
    return
  }
  p.down = true
  p.hp = 0
  p.revive = 0
  p.armor = 0
  p.vx = 0
  p.vy = 0
  p.dashTime = 0
  setState(p, 'down')
  slot.firing = false
  g.text(p.x, p.y - 30, g.slots.length > 1 ? `${slot.name} is down!` : 'You are down', '#FF7A85')
  g.sound('hurt', p.x, p.y)
  if (g.slots.every((s) => s.player.down)) {
    g.sound('over')
    g.setStatus('over')
  }
}

/** Full heal boost (key F). */
export function applyHealBoost(g: Game, slot: PlayerSlot) {
  const p = slot.player
  if (g.status !== 'playing' || p.down || slot.charges.heal <= 0 || p.hp >= p.maxHp) return
  slot.charges.heal -= 1
  g.onBoostUsed?.('heal', slot.id)
  p.hp = p.maxHp
  g.addEffect('ring', p.x, p.y, 0, 70, 0.6, '#6EE7A8')
  g.burst(p.x, p.y, '#6EE7A8', 12)
  g.text(p.x, p.y - 30, 'Full health!', '#6EE7A8')
  g.sound('heal', p.x, p.y)
}

/** Armor boost (key G). */
export function applyArmorBoost(g: Game, slot: PlayerSlot) {
  const p = slot.player
  if (g.status !== 'playing' || p.down || slot.charges.armor <= 0 || (p.armor ?? 0) >= BOOST.armor) return
  slot.charges.armor -= 1
  g.onBoostUsed?.('armor', slot.id)
  p.armor = BOOST.armor
  g.addEffect('ring', p.x, p.y, 0, 70, 0.6, '#7FB0FF')
  g.burst(p.x, p.y, '#7FB0FF', 12)
  g.text(p.x, p.y - 30, `Armor +${BOOST.armor}`, '#7FB0FF')
  g.sound('armor', p.x, p.y)
}

/** Acid, fire and electricity drain health while you stand in them. */
export function updateHazards(g: Game, slot: PlayerSlot, dt: number) {
  const p = slot.player
  if (p.down || p.dashTime > 0) return
  const b = bodyRect(p)
  const body = { x: b.x + 4, y: b.y + 4, w: b.w - 8, h: b.h - 8 }
  slot.hazardTick -= dt
  for (const h of activeMap.hazards) {
    if (!aabb(body, h)) continue
    damagePlayer(g, slot, h.dps * g.diff.hazard * dt)
    if (slot.hazardTick <= 0) {
      slot.hazardTick = 0.45
      const text = h.kind === 'lava' ? 'Burning!' : h.kind === 'electric' ? 'Shocked!' : 'Toxic!'
      const color = h.kind === 'lava' ? '#FFB36B' : h.kind === 'electric' ? '#9FD0FF' : '#B6F06B'
      g.sound(h.kind === 'electric' ? 'electric' : 'sizzle', p.x, p.y)
      g.text(p.x, p.y - 20, text, color)
      g.burst(p.x, p.y, h.kind === 'lava' ? '#FF7A2E' : h.kind === 'electric' ? '#8FD0FF' : '#9BE04A', 4)
    }
    if (p.hp <= 0) playerDown(g, slot)
    return
  }
}

/** Touching a zombie hurts, even when it is not mid-attack. */
export function checkContact(g: Game, slot: PlayerSlot) {
  const p = slot.player
  if (p.down || p.invuln > 0 || p.state === 'stunned') return
  const b = bodyRect(p)
  const body = { x: b.x + 3, y: b.y + 3, w: b.w - 6, h: b.h - 6 }
  for (const z of g.zombies) {
    if (z.hp <= 0 || z.state === 'stunned' || !aabb(body, bodyRect(z))) continue
    hurtPlayer(g, slot, ZOMBIES[z.kind].contact * g.diff.damage, 0, z.x, z.y, true)
    return
  }
}
