import { CLASSES } from './classes'
import { HEAVY_WEAPONS, WAVE, WEAPON_ORDER, WEAPONS } from './config'
import type { Game } from './engine'
import type { Player, PlayerSlot, WeaponId } from './types'

/**
 * The shop. Guns no longer lie around the map: zombies pay out coins, and every class spends them on its
 * own shelf of guns, on upgrades for the guns it owns, and on ammo and medkits.
 * Open it with B at any time (solo play pauses while it is open; a co-op room keeps going).
 */

export const PRICES: Record<WeaponId, number> = {
  fists: 0, pistol: 0, wand: 0,
  smg: 140, shotgun: 180, rifle: 320, flamer: 420, sniper: 460,
  launcher: 600, venom: 600, cryo: 650, minigun: 700, tesla: 750, railgun: 950,
}

export const SHOP = {
  /** One ammo pack tops up every gun you own by a full pickup. */
  ammo: 40,
  medkit: 110,
  medkitHeal: 40,
  /** A gun can be upgraded this many times, and each level adds this share of its damage. */
  maxLevel: 3,
  levelDamage: 0.25,
  /** What each upgrade costs, as a share of the gun's price. */
  upgrade: [0.5, 0.8, 1.2],
  /** What a free sidearm counts as worth when its upgrades are priced. */
  starterWorth: 240,
  /** Coins for clearing a wave (plus this much per wave number), and for clearing a chapter. */
  waveBonus: 20,
  wavePerWave: 6,
  chapterBonus: 150,
  /** Coins you start with when a run begins at a later chapter, about what the earlier chapters would have paid. */
  stipend: [0, 350, 850, 1500, 2400, 3500, 4800],
  /** Endless Descent: every squad member starts with this much. */
  descentStipend: 2400,
} as const

export type ShopEntryKind = 'gun' | 'upgrade' | 'maxed' | 'ammo' | 'medkit'

export interface ShopEntry {
  /** What to send to buy it: `gun:<weapon>`, `ammo` or `medkit`. */
  id: string
  kind: ShopEntryKind
  weapon?: WeaponId
  title: string
  note: string
  price: number
  /** Upgrade level the gun has now. */
  level: number
  /** Why it cannot be bought right now, if it cannot. */
  blocked?: 'coins' | 'full' | 'maxed'
}

const WEAPON_IDS = new Set<string>(WEAPON_ORDER)

export function isShopItem(v: unknown): v is string {
  if (v === 'ammo' || v === 'medkit') return true
  return typeof v === 'string' && v.startsWith('gun:') && WEAPON_IDS.has(v.slice(4)) && v !== 'gun:fists'
}

export function stipendFor(tier: number): number {
  const list = SHOP.stipend
  return list[Math.max(0, Math.min(list.length - 1, Math.floor(tier)))]
}

/** Damage multiplier from a gun's upgrade level. */
export function gunBoost(p: Player, weapon: WeaponId): number {
  return 1 + SHOP.levelDamage * (p.gunLv?.[weapon] ?? 0)
}

export function upgradePrice(weapon: WeaponId, level: number): number {
  const worth = PRICES[weapon] > 0 ? PRICES[weapon] : SHOP.starterWorth
  const share = SHOP.upgrade[Math.max(0, Math.min(SHOP.upgrade.length - 1, level))]
  return Math.round((worth * share) / 10) * 10
}

/** The guns on this player's shelf: the free sidearm, the class's own guns, and any heavy weapon they carry. */
export function shelf(p: Player): WeaponId[] {
  const cls = CLASSES[p.cls]
  const out: WeaponId[] = [cls.starter, ...cls.shop]
  for (const w of HEAVY_WEAPONS) if (p.owned[w] && !out.includes(w)) out.push(w)
  // a gun from another class's shelf (a saved run from before the shop, or the owner's test mode) can still be upgraded
  for (const w of WEAPON_ORDER) if (w !== 'fists' && p.owned[w] && !out.includes(w)) out.push(w)
  return out
}

/** Everything the shop shows this player, in order, with what each line costs and whether it can be bought. */
export function shopEntries(p: Player): ShopEntry[] {
  const coins = Math.floor(p.coins ?? 0)
  const out: ShopEntry[] = []
  for (const w of shelf(p)) {
    const def = WEAPONS[w]
    const level = p.gunLv?.[w] ?? 0
    if (!p.owned[w]) {
      const price = PRICES[w]
      out.push({ id: `gun:${w}`, kind: 'gun', weapon: w, title: def.label, note: def.blurb ?? '', price, level, blocked: coins < price ? 'coins' : undefined })
    } else if (level >= SHOP.maxLevel) {
      out.push({ id: `gun:${w}`, kind: 'maxed', weapon: w, title: def.label, note: `Fully upgraded: +${Math.round(SHOP.levelDamage * level * 100)}% damage`, price: 0, level, blocked: 'maxed' })
    } else {
      const price = upgradePrice(w, level)
      out.push({ id: `gun:${w}`, kind: 'upgrade', weapon: w, title: `${def.label} Mk ${level + 2}`, note: `Upgrade: +${Math.round(SHOP.levelDamage * 100)}% damage`, price, level, blocked: coins < price ? 'coins' : undefined })
    }
  }
  const needsAmmo = WEAPON_ORDER.some((w) => p.owned[w] && !WEAPONS[w].infinite && WEAPONS[w].maxAmmo > 0 && p.ammo[w] < WEAPONS[w].maxAmmo)
  out.push({ id: 'ammo', kind: 'ammo', title: 'Ammo pack', note: 'Tops up every gun you carry', price: SHOP.ammo, level: 0, blocked: !needsAmmo ? 'full' : coins < SHOP.ammo ? 'coins' : undefined })
  out.push({ id: 'medkit', kind: 'medkit', title: 'Medkit', note: `Restores ${SHOP.medkitHeal} health`, price: SHOP.medkit, level: 0, blocked: p.hp >= p.maxHp ? 'full' : coins < SHOP.medkit ? 'coins' : undefined })
  return out
}

/** Buy one line of the shop. Returns false (and changes nothing) when it cannot be bought. */
export function buyItem(g: Game, slot: PlayerSlot, id: string): boolean {
  const p = slot.player
  if (g.status !== 'playing' || p.down) return false
  const entry = shopEntries(p).find((e) => e.id === id)
  if (!entry || entry.blocked) return false
  p.coins -= entry.price
  if (entry.kind === 'gun' && entry.weapon) {
    const w = entry.weapon
    const def = WEAPONS[w]
    p.owned[w] = true
    if (!def.infinite) p.ammo[w] = Math.min(def.maxAmmo, Math.max(p.ammo[w], def.ammoPickup * 2))
    p.weapon = w
    g.text(p.x, p.y - 30, `${def.label} bought`, '#FFE16A', 1)
    g.addEffect('ring', p.x, p.y, 0, 70, 0.5, '#FFE16A')
  } else if (entry.kind === 'upgrade' && entry.weapon) {
    const w = entry.weapon
    p.gunLv[w] = (p.gunLv[w] ?? 0) + 1
    g.text(p.x, p.y - 30, `${WEAPONS[w].label} Mk ${p.gunLv[w] + 1}`, '#FFE16A', 1)
    g.addEffect('ring', p.x, p.y, 0, 70, 0.5, '#FFE16A')
  } else if (entry.kind === 'ammo') {
    for (const w of WEAPON_ORDER) {
      const def = WEAPONS[w]
      if (p.owned[w] && !def.infinite) p.ammo[w] = Math.min(def.maxAmmo, p.ammo[w] + def.ammoPickup)
    }
    g.text(p.x, p.y - 30, 'Ammo topped up', '#7FB0FF')
  } else if (entry.kind === 'medkit') {
    p.hp = Math.min(p.maxHp, p.hp + SHOP.medkitHeal)
    g.text(p.x, p.y - 30, `+${SHOP.medkitHeal} HP`, '#6EE7A8')
    g.burst(p.x, p.y, '#6EE7A8', 8)
  } else {
    return false
  }
  g.sound('buy', p.x, p.y)
  return true
}

/** In co-op every kill pays every player, scaled down by the same factor the horde is scaled up. */
export function coinShare(playerCount: number): number {
  return 1 / (1 + WAVE.perExtraPlayer * (Math.max(1, playerCount) - 1))
}

/** Pay the whole squad. With a position, coins pop out there and fly to the counter. */
export function grantCoins(g: Game, amount: number, x?: number, y?: number, shared = true) {
  if (!(amount > 0)) return
  const each = shared ? amount * coinShare(g.playerCount) : amount
  for (const s of g.slots) s.player.coins = (s.player.coins ?? 0) + each
  if (x !== undefined && y !== undefined) g.cosmetic({ t: 'coin', x, y, n: Math.max(1, Math.min(7, Math.round(amount / 5))) })
}
