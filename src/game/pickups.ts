import { SKILL } from './classes'
import { aabb, bodyRect, freeSpot } from './collision'
import { PICKUPS, WEAPON_ORDER, WEAPONS } from './config'
import type { Game } from './engine'
import { grantCoins } from './shop'
import type { PickupKind, Player, PlayerSlot, WeaponId } from './types'

const WEAPON_ORDER_GUNS = WEAPON_ORDER.filter((w) => w !== 'fists')

/** True when the weapon can fire: free-ammo guns always can. */
export function hasAmmo(p: Player, id: WeaponId): boolean {
  return p.owned[id] && (id === 'fists' || Boolean(WEAPONS[id].infinite) || p.ammo[id] > 0)
}

/** How many coins a coin pickup is worth at this point of the run. */
function coinAmount(g: Game): number {
  return Math.round((10 + 1.4 * Math.max(1, g.level)) * (0.8 + Math.random() * 0.6))
}

/**
 * Put a pickup on the ground. Guns are no longer found: they are bought in the shop (see shop.ts), so the
 * ground only ever holds ammo, medkits and coins. A `weapon` pickup still works if something places one.
 */
export function addPickup(g: Game, kind: PickupKind, x: number, y: number, weapon?: WeaponId, ttl?: number, amount?: number) {
  g.pickups.push({
    id: g.nextId++, x, y, kind,
    weapon: kind === 'weapon' ? (weapon ?? 'smg') : undefined,
    amount: kind === 'coins' ? Math.max(1, Math.round(amount ?? coinAmount(g))) : undefined,
    ttl,
  })
}

/** Starting supplies: ammo and coin caches scattered across the map, and a medkit on Normal. */
export function seedPickups(g: Game) {
  const p = g.slots[0]?.player ?? g.player
  const kinds = ['ammo', 'ammo', 'coins', 'coins', 'medkit'] as const
  const extra = Math.max(0, g.slots.length - 1)
  // a single medkit at the start of a Normal map, none on Hard and Extreme
  const medkits = g.difficulty === 'normal' && !g.survival ? 1 : 0
  for (const kind of kinds) {
    const copies = kind === 'medkit' ? medkits : 1 + Math.floor(extra / 2)
    for (let i = 0; i < copies; i++) {
      const s = freeSpot(p.x, p.y, 300, 1000)
      addPickup(g, kind, s.x, s.y)
    }
  }
}

/** What a dead zombie leaves behind, now and then: mostly ammo, sometimes a few extra coins, rarely a medkit. */
export function maybeDrop(g: Game, x: number, y: number) {
  if (Math.random() > 0.14) return
  const r = Math.random()
  const kind: PickupKind = r < 0.6 ? 'ammo' : r < 0.66 ? 'medkit' : 'coins'
  addPickup(g, kind, x, y, undefined, PICKUPS.dropTtl)
}

/** Spawns new ground pickups on a timer and removes expired drops. */
export function tickPickups(g: Game, dt: number) {
  g.pickupTimer -= dt
  const onMap = g.pickups.filter((k) => k.ttl === undefined).length
  if (g.pickupTimer <= 0) {
    g.pickupTimer = PICKUPS.mapInterval * g.diff.pickupInterval
    if (onMap < PICKUPS.mapMax + Math.max(0, g.slots.length - 1) * 2) {
      const alive = g.alivePlayers()
      const anchor = alive[Math.floor(Math.random() * alive.length)] ?? g.player
      const r = Math.random()
      const kind: PickupKind = r < 0.3 ? 'coins' : r < 0.95 ? 'ammo' : 'medkit'
      const s = freeSpot(anchor.x, anchor.y, 300, 1400)
      addPickup(g, kind, s.x, s.y)
    }
  }
  g.pickups = g.pickups.filter((k) => {
    if (k.ttl === undefined) return true
    k.ttl -= dt
    return k.ttl > 0
  })
}

/** A player picks up whatever they are standing on. */
export function collectPickups(g: Game, slot: PlayerSlot) {
  const p = slot.player
  if (p.down) return
  const body = bodyRect(p)
  const half = PICKUPS.size / 2
  g.pickups = g.pickups.filter((k) => {
    if (!aabb(body, { x: k.x - half, y: k.y - half, w: PICKUPS.size, h: PICKUPS.size })) return true
    return !collect(g, slot, k.kind, k.weapon, k.amount)
  })
}

/** Returns true when the pickup was used up. */
function collect(g: Game, slot: PlayerSlot, kind: PickupKind, weapon?: WeaponId, amount?: number): boolean {
  const p = slot.player
  if (kind === 'coins') {
    // coins found on the ground go to the whole squad, like the coins from kills
    const n = amount ?? 10
    grantCoins(g, n, p.x, p.y)
    g.text(p.x, p.y - 24, `+${n} coins`, '#FFD25A')
    g.sound('coin', p.x, p.y)
    return true
  }
  if (kind === 'weapon' && weapon) {
    const def = WEAPONS[weapon]
    const had = p.owned[weapon]
    p.owned[weapon] = true
    if (!def.infinite) p.ammo[weapon] = Math.min(def.maxAmmo, p.ammo[weapon] + def.ammoPickup)
    if (!had) p.weapon = weapon
    const label = def.infinite ? `${def.label} acquired (free ammo)` : had ? `+${def.ammoPickup} ${def.label} ammo` : `${def.label} acquired`
    g.text(p.x, p.y - 24, label, '#FFFFFF')
    g.sound('weaponpickup', p.x, p.y)
    return true
  }
  if (kind === 'ammo') {
    let any = false
    for (const gun of WEAPON_ORDER_GUNS) {
      const def = WEAPONS[gun]
      if (!p.owned[gun] || def.infinite || p.ammo[gun] >= def.maxAmmo) continue
      any = true
      p.ammo[gun] = Math.min(def.maxAmmo, p.ammo[gun] + Math.ceil(def.ammoPickup / 2))
    }
    if (!any) return false // nothing to refill yet, leave it on the ground
    g.text(p.x, p.y - 24, 'Ammo refilled', '#7FB0FF')
    g.sound('pickup', p.x, p.y)
    return true
  }
  if (p.hp >= p.maxHp) return false
  // a Medic gets more out of every medkit
  const heal = Math.round(PICKUPS.medkitHeal * (p.cls === 'support' ? SKILL.medkitBonus : 1))
  p.hp = Math.min(p.maxHp, p.hp + heal)
  g.text(p.x, p.y - 24, `+${heal} HP`, '#6EE7A8')
  g.sound('pickup', p.x, p.y)
  return true
}
