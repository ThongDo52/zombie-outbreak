import { aabb, bodyRect, freeSpot } from './collision'
import { HEAVY_WEAPONS, PICKUPS, WEAPON_ORDER, WEAPONS } from './config'
import type { Game } from './engine'
import type { PickupKind, Player, PlayerSlot, WeaponId } from './types'
import { activeMap } from './world'

const WEAPON_ORDER_GUNS = WEAPON_ORDER.filter((w) => w !== 'fists')
const GUN_WEIGHTS: Record<WeaponId, number> = { fists: 0, pistol: 4, smg: 3, shotgun: 3, rifle: 2, flamer: 2, launcher: 1, minigun: 2, railgun: 1, venom: 1.5, tesla: 1.5, cryo: 1.5 }

/** True when the weapon can fire: free-ammo guns always can. */
export function hasAmmo(p: Player, id: WeaponId): boolean {
  return p.owned[id] && (id === 'fists' || Boolean(WEAPONS[id].infinite) || p.ammo[id] > 0)
}

/** Guns of this chapter's loot table. A free-ammo gun you already own is left out. */
function lootPool(g: Game, owned?: Record<WeaponId, boolean>): WeaponId[] {
  const pool = [...activeMap.chapter.loot]
  // Heavy guns turn up as loot once somebody has earned them, and deep in Endless Descent for everyone.
  for (const h of HEAVY_WEAPONS) {
    if (pool.includes(h)) continue
    if (g.slots.some((s) => s.player.owned[h]) || (g.descent && g.floor >= 8)) pool.push(h)
  }
  return pool.filter((w) => !(owned?.[w] && WEAPONS[w].infinite))
}

function randomGun(g: Game, owned?: Record<WeaponId, boolean>): WeaponId {
  const pool = lootPool(g, owned)
  const total = pool.reduce((sum, g) => sum + GUN_WEIGHTS[g], 0)
  let r = Math.random() * total
  for (const g of pool) {
    r -= GUN_WEIGHTS[g]
    if (r <= 0) return g
  }
  return pool[0] ?? 'smg'
}

/** Guns every player already owns (so free-ammo guns are not offered again). */
function commonOwned(g: Game): Record<WeaponId, boolean> {
  const out = {} as Record<WeaponId, boolean>
  for (const id of WEAPON_ORDER) out[id] = g.slots.length > 0 && g.slots.every((s) => s.player.owned[id])
  return out
}

export function addPickup(g: Game, kind: PickupKind, x: number, y: number, weapon?: WeaponId, ttl?: number) {
  g.pickups.push({ id: g.nextId++, x, y, kind, weapon: kind === 'weapon' ? (weapon ?? randomGun(g, commonOwned(g))) : undefined, ttl })
}

/** Starting loot: the chapter's new gun close by, the rest scattered across the map. */
export function seedPickups(g: Game) {
  const p = g.slots[0]?.player ?? g.player
  const have = commonOwned(g)
  const ch = activeMap.chapter
  const near = freeSpot(p.x, p.y, 150, 230)
  addPickup(g, 'weapon', near.x, near.y, ch.newGun)
  for (const gun of ch.loot) {
    if (gun === ch.newGun || (have[gun] && WEAPONS[gun].infinite)) continue
    const s = freeSpot(p.x, p.y, 450, 1100)
    addPickup(g, 'weapon', s.x, s.y, gun)
  }
  const kinds = ['ammo', 'ammo', 'ammo', 'medkit'] as const
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

export function maybeDrop(g: Game, x: number, y: number) {
  if (Math.random() > 0.14) return
  const r = Math.random()
  const kind: PickupKind = r < 0.6 ? 'ammo' : r < 0.65 ? 'medkit' : 'weapon'
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
      const kind: PickupKind = r < 0.38 ? 'weapon' : r < 0.96 ? 'ammo' : 'medkit'
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
    return !collect(g, slot, k.kind, k.weapon)
  })
}

/** Returns true when the pickup was used up. */
function collect(g: Game, slot: PlayerSlot, kind: PickupKind, weapon?: WeaponId): boolean {
  const p = slot.player
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
      if (!p.owned[gun] || def.infinite) continue
      any = true
      p.ammo[gun] = Math.min(def.maxAmmo, p.ammo[gun] + Math.ceil(def.ammoPickup / 2))
    }
    if (!any) return false // nothing to refill yet, leave it on the ground
    g.text(p.x, p.y - 24, 'Ammo refilled', '#7FB0FF')
    g.sound('pickup', p.x, p.y)
    return true
  }
  if (p.hp >= p.maxHp) return false
  p.hp = Math.min(p.maxHp, p.hp + PICKUPS.medkitHeal)
  g.text(p.x, p.y - 24, `+${PICKUPS.medkitHeal} HP`, '#6EE7A8')
  g.sound('pickup', p.x, p.y)
  return true
}
