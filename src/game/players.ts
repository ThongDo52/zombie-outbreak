import { aabb, bodyRect, moveBody, normalize } from './collision'
import { CLASSES, DEFAULT_CLASS, SKILL, type ClassId } from './classes'
import { fireTesla } from './combat'
import { BOOST, PLAYER, PUNCH, REVIVE, STATUS, WEAPON_ORDER, WEAPONS } from './config'
import type { Game } from './engine'
import { hasAmmo } from './pickups'
import { gunBoost } from './shop'
import { castSkill } from './skills'
import { gunLook, tracerColor } from './skins'
import type { Player, PlayerSlot, Vec, WeaponId } from './types'
import { activeMap } from './world'

const eachWeapon = <T,>(value: (w: WeaponId) => T): Record<WeaponId, T> => {
  const out = {} as Record<WeaponId, T>
  for (const w of WEAPON_ORDER) out[w] = value(w)
  return out
}

/** A fresh player of the given class: full health, the class's free sidearm in hand, no coins yet. */
export function newPlayer(spawn: Vec, cls: ClassId = DEFAULT_CLASS): Player {
  const def = CLASSES[cls] ?? CLASSES[DEFAULT_CLASS]
  const maxHp = Math.round(PLAYER.maxHp * def.hp)
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
    skill2Cd: 0,
    skill2T: 0,
    cls: def.id,
    fireCooldown: 0,
    muzzle: 0,
    vx: 0,
    vy: 0,
    mx: 0,
    my: 0,
    weapon: def.starter,
    armor: 0,
    down: false,
    revive: 0,
    coins: 0,
    owned: eachWeapon((w) => w === 'fists' || w === def.starter),
    ammo: eachWeapon(() => 0),
    gunLv: eachWeapon(() => 0),
  }
}

/**
 * What a player brings into a run besides the free sidearm: the heavy weapons earned in armory trials
 * (with one pickup's worth of ammo) and a purse of coins for the shop. Guns are bought, not found.
 */
export function giveLoadout(p: Player, coins: number, unlocked: WeaponId[] = []) {
  for (const id of unlocked) {
    if (!WEAPONS[id]) continue
    p.owned[id] = true
    p.ammo[id] = Math.max(p.ammo[id], WEAPONS[id].ammoPickup)
  }
  p.coins = Math.max(p.coins, coins)
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
  p.skill2Cd = Math.max(0, (p.skill2Cd ?? 0) - dt)
  p.skill2T = Math.max(0, (p.skill2T ?? 0) - dt)
  if (p.slow) p.slow = Math.max(0, p.slow - dt)
  p.muzzle = Math.max(0, p.muzzle - dt)

  if (p.down) {
    updateRevive(g, slot, dt)
    slot.firing = false
    slot.queuedSkill = false
    slot.queuedSkill2 = false
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

  const cls = CLASSES[p.cls]
  if (slot.queuedSkill && p.skillCd <= 0 && castSkill(g, slot, 1, dir)) p.skillCd = cls.skills[0].cooldown
  slot.queuedSkill = false
  if (slot.queuedSkill2 && p.skill2Cd <= 0 && p.dashTime <= 0 && castSkill(g, slot, 2, dir)) p.skill2Cd = cls.skills[1].cooldown
  slot.queuedSkill2 = false

  if (p.dashTime > 0) {
    p.dashTime -= dt
    moveBody(p, p.vx * PLAYER.dashSpeed * dt, p.vy * PLAYER.dashSpeed * dt)
    return
  }

  // a Sniper holding Deadeye trades footwork for a steady aim
  const steady = p.cls === 'sniper' && p.skillT > 0 ? SKILL.deadeye.walk : 1
  const walk = PLAYER.speed * cls.speed * (p.slow ? 0.55 : 1) * (WEAPONS[p.weapon].heavy ? STATUS.heavySpeed : 1) * steady
  moveBody(p, dir.x * walk * dt, dir.y * walk * dt)
  if (slot.firing && p.fireCooldown <= 0) fire(g, slot)

  const attacking = p.weapon === 'fists' ? p.fireCooldown > WEAPONS.fists.interval - 0.15 : p.muzzle > 0
  const next: Player['state'] = attacking ? 'attack' : dir.x !== 0 || dir.y !== 0 ? 'move' : 'idle'
  if (next !== p.state) setState(p, next)
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
  const deadeye = p.cls === 'sniper' && p.skillT > 0
  // upgrades from the shop, the Striker's overdrive and the Sniper's deadeye all stack
  const dmgMul = (overdrive ? SKILL.overdrive.damage : 1) * (deadeye ? SKILL.deadeye.damage : 1) * gunBoost(p, p.weapon)
  p.fireCooldown = def.interval / (overdrive ? SKILL.overdrive.fireRate : 1)
  if (p.weapon === 'fists') {
    const size = PUNCH.reach
    const cx = p.x + p.aim.x * (p.w / 2 + size / 2)
    const cy = p.y + p.aim.y * (p.h / 2 + size / 2)
    g.addHitbox({ x: cx - size / 2, y: cy - size / 2, w: size, h: size }, 'player', def.damage * dmgMul, def.stun, def.knockback, PUNCH.life, undefined, slot.id, { weapon: 'fists', melee: true })
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
  const spread = deadeye ? 0 : def.spread
  for (let i = 0; i < def.pellets; i++) {
    const a = base + (Math.random() - 0.5) * 2 * spread
    const vx = Math.cos(a)
    const vy = Math.sin(a)
    const sx = p.x + vx * (p.w / 2 + def.barrel)
    const sy = p.y + vy * (p.h / 2 + def.barrel)
    const speed = def.speed * (0.92 + Math.random() * 0.16)
    g.bullets.push({
      x: sx, y: sy, px: sx, py: sy, vx: vx * speed, vy: vy * speed,
      damage: def.damage * dmgMul, life: def.life, pierce: def.pierce + (deadeye ? SKILL.deadeye.pierce : 0), knockback: def.knockback, stun: def.stun,
      hitIds: new Set(), color: look ? tracerColor(look, g.time, i * 25) : def.color, weapon: p.weapon, maxLife: def.life, blast: def.blast, status: def.status, cloud: def.cloud,
      glow: look?.glow || deadeye || undefined, sparkle: look?.sparkle, owner: slot.id,
      ap: deadeye ? 1 : def.ap, far: p.cls === 'sniper' || undefined, homing: def.homing,
    })
  }
  if (look?.ring && (def.interval > 0.2 || Math.random() < 0.4)) {
    const d = p.w / 2 + def.barrel
    g.addEffect('ring', p.x + p.aim.x * d, p.y + p.aim.y * d, 0, 58, 0.34, tracerColor(look, g.time))
  }
  const big = p.weapon === 'shotgun' || p.weapon === 'railgun' || p.weapon === 'sniper'
  g.kick(big ? 5 : p.weapon === 'launcher' ? 6 : p.weapon === 'flamer' ? 0.6 : 1.5, slot.id)
  g.sound('shot', p.x, p.y, p.weapon)
  if (!hasAmmo(p, p.weapon)) outOfAmmo(g, slot)
}

function outOfAmmo(g: Game, slot: PlayerSlot) {
  const p = slot.player
  g.sound('dry', p.x, p.y)
  g.text(p.x, p.y - 24, `${WEAPONS[p.weapon].label} empty`, '#FF7A85')
  // back to another gun that still fires; the free sidearm always does
  const fallback = [...WEAPON_ORDER].reverse().find((w) => w !== 'fists' && w !== p.weapon && !WEAPONS[w].infinite && hasAmmo(p, w)) ?? WEAPON_ORDER.find((w) => w !== 'fists' && w !== p.weapon && hasAmmo(p, w))
  p.weapon = fallback ?? 'fists'
  p.fireCooldown = 0.25
}

/** Armor soaks damage first. Returns the damage that reached health. */
export function damagePlayer(g: Game, slot: PlayerSlot, amount: number): number {
  const p = slot.player
  // a Bulwark always takes a little less, and its shield soaks most of every hit while it lasts
  if (p.cls === 'tank') amount *= p.skillT > 0 ? SKILL.shield.taken : SKILL.ironSkin
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
  // a Runner slips most of a glancing touch
  if (contact && p.cls === 'agile') damage *= SKILL.evasion
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
    const touch = g.contactDamage(z)
    if (touch <= 0) continue
    hurtPlayer(g, slot, touch, 0, z.x, z.y, true)
    return
  }
}
