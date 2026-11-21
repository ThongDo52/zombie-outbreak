import type { WeaponId, ZombieKind } from './types'

export const VIEW_W = 800
export const VIEW_H = 480

export const PLAYER = {
  size: 26,
  speed: 200,
  maxHp: 100,
  stunTime: 0.3,
  invulnAfterHit: 0.8,
  /** Short grace period after a zombie touches you. */
  contactInvuln: 0.45,
  dashSpeed: 620,
  dashDuration: 0.16,
  dashInvuln: 0.3,
  dashCooldown: 1.8,
} as const

export const WEAPON_ORDER: WeaponId[] = ['fists', 'pistol', 'smg', 'shotgun', 'rifle', 'flamer', 'launcher', 'minigun', 'railgun', 'venom', 'tesla', 'cryo']

/** Heavy weapons, earned by beating the armory trial bosses. */
export const HEAVY_WEAPONS: WeaponId[] = ['venom', 'tesla', 'cryo']

export interface WeaponDef {
  label: string
  damage: number
  interval: number
  speed: number
  pellets: number
  spread: number
  life: number
  pierce: number
  knockback: number
  stun: number
  ammoPickup: number
  maxAmmo: number
  barrel: number
  color: string
  /** Free ammo: never runs out. */
  infinite?: boolean
  /** Explosive: size of the square blast, in pixels. */
  blast?: number
  /** Heavy weapons slow the player a little. */
  heavy?: boolean
  /** Venom poisons and leaves a cloud (size in pixels); cryo chills toward a freeze. */
  status?: 'poison' | 'freeze'
  cloud?: number
  /** Tesla: how many zombies the lightning jumps to after the first. */
  chain?: number
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fists: { label: 'Fists', damage: 10, interval: 0.45, speed: 0, pellets: 0, spread: 0, life: 0, pierce: 0, knockback: 200, stun: 0.25, ammoPickup: 0, maxAmmo: 0, barrel: 0, color: '#FFFFFF' },
  pistol: { label: 'Pistol', damage: 22, interval: 0.32, speed: 900, pellets: 1, spread: 0.03, life: 0.7, pierce: 0, knockback: 120, stun: 0.1, ammoPickup: 0, maxAmmo: 0, barrel: 13, color: '#FFD25A', infinite: true },
  smg: { label: 'SMG', damage: 16, interval: 0.08, speed: 1000, pellets: 1, spread: 0.08, life: 0.65, pierce: 0, knockback: 85, stun: 0.08, ammoPickup: 90, maxAmmo: 360, barrel: 25, color: '#7FD0FF' },
  shotgun: { label: 'Shotgun', damage: 11, interval: 0.85, speed: 860, pellets: 7, spread: 0.3, life: 0.4, pierce: 0, knockback: 190, stun: 0.2, ammoPickup: 12, maxAmmo: 48, barrel: 33, color: '#FFA24A' },
  flamer: { label: 'Flamer', damage: 7, interval: 0.055, speed: 430, pellets: 1, spread: 0.22, life: 0.3, pierce: 99, knockback: 30, stun: 0.04, ammoPickup: 120, maxAmmo: 400, barrel: 30, color: '#FF8A3C' },
  launcher: { label: 'Launcher', damage: 95, interval: 1, speed: 520, pellets: 1, spread: 0.02, life: 1.1, pierce: 0, knockback: 450, stun: 0.6, ammoPickup: 6, maxAmmo: 24, barrel: 30, color: '#C6FF6B', blast: 160 },
  minigun: { label: 'Minigun', damage: 10, interval: 0.045, speed: 1000, pellets: 1, spread: 0.14, life: 0.6, pierce: 0, knockback: 50, stun: 0.04, ammoPickup: 150, maxAmmo: 600, barrel: 36, color: '#FFE27A' },
  railgun: { label: 'Railgun', damage: 160, interval: 1.1, speed: 2600, pellets: 1, spread: 0, life: 0.5, pierce: 99, knockback: 380, stun: 0.4, ammoPickup: 8, maxAmmo: 32, barrel: 40, color: '#7FFFFF' },
  venom: { label: 'Venom', damage: 16, interval: 0.42, speed: 640, pellets: 1, spread: 0.05, life: 0.9, pierce: 0, knockback: 70, stun: 0, ammoPickup: 18, maxAmmo: 72, barrel: 36, color: '#9BFF3B', heavy: true, status: 'poison', cloud: 100 },
  tesla: { label: 'Tesla', damage: 26, interval: 0.38, speed: 0, pellets: 1, spread: 0, life: 0, pierce: 0, knockback: 90, stun: 0.35, ammoPickup: 26, maxAmmo: 104, barrel: 34, color: '#7FE8FF', heavy: true, chain: 4 },
  cryo: { label: 'Cryo', damage: 11, interval: 0.2, speed: 950, pellets: 1, spread: 0.1, life: 0.7, pierce: 1, knockback: 40, stun: 0, ammoPickup: 44, maxAmmo: 176, barrel: 34, color: '#BDF2FF', heavy: true, status: 'freeze' },
  rifle: { label: 'Rifle', damage: 55, interval: 0.55, speed: 1400, pellets: 1, spread: 0.01, life: 0.8, pierce: 3, knockback: 220, stun: 0.15, ammoPickup: 20, maxAmmo: 80, barrel: 39, color: '#FF6B7A' },
}

/** Fire damage over time after a flamer hit. Big zombies also lose a share of their health. */
export const BURN = { duration: 3, dps: 14, bigShare: 0.01 } as const

/** Status effects of the heavy weapons. */
export const STATUS = {
  poison: { duration: 5, dps: 9, maxStacks: 3, bigShare: 0.005 },
  cloud: { life: 3.5, dps: 14, slow: 0.35 },
  chill: { freezeAt: 3, decay: 1.6, slowPerStack: 0.18, freezeTime: 2.2, shatter: 1.4 },
  chain: { range: 175, falloff: 0.78 },
  /** Walking speed while a heavy weapon is in your hands. */
  heavySpeed: 0.88,
} as const

/** Single-use boosts bought in the shop. */
export const BOOST = { armor: 60, lifeHp: 0.5, lifeInvuln: 3, lifeBlast: 320, lifeBlastDamage: 80 } as const

export const PUNCH = { reach: 44, life: 0.12 } as const

export interface ZombieDef {
  size: number
  hp: number
  speed: number
  damage: number
  reach: number
  windup: number
  recover: number
  points: number
  color: string
  /** Damage dealt just by touching the player. */
  contact: number
  /** Ranged and support families: how far away they like to stay. */
  keep?: number
  /** Spitters: how far they shoot, and the seconds between shots. */
  range?: number
  interval?: number
}

export const ZOMBIES: Record<ZombieKind, ZombieDef> = {
  walker: { size: 26, hp: 60, speed: 70, damage: 10, reach: 30, windup: 0.3, recover: 0.45, points: 10, color: '#5E8C4A', contact: 6 },
  runner: { size: 22, hp: 35, speed: 135, damage: 7, reach: 26, windup: 0.18, recover: 0.3, points: 15, color: '#8FB339', contact: 5 },
  boss: { size: 72, hp: 1600, speed: 70, damage: 28, reach: 70, windup: 0.6, recover: 0.6, points: 500, color: '#7A4B5A', contact: 25 },
  tank: { size: 46, hp: 260, speed: 48, damage: 25, reach: 46, windup: 0.5, recover: 0.7, points: 50, color: '#3F6B45', contact: 14 },
  // New families: spit from range, drop poison, blow up, support the others, hunt from the shadows.
  spitter: { size: 24, hp: 42, speed: 64, damage: 13, reach: 0, windup: 0.42, recover: 0.5, points: 25, color: '#9ACD32', contact: 3, keep: 250, range: 360, interval: 2.2 },
  bloater: { size: 42, hp: 170, speed: 36, damage: 10, reach: 34, windup: 0.5, recover: 0.8, points: 45, color: '#B7B84A', contact: 8 },
  exploder: { size: 26, hp: 48, speed: 118, damage: 34, reach: 0, windup: 0.4, recover: 0.4, points: 30, color: '#D8553A', contact: 4 },
  shaman: { size: 30, hp: 75, speed: 54, damage: 0, reach: 0, windup: 0.5, recover: 0.5, points: 40, color: '#8E6BD1', contact: 0, keep: 330, interval: 3.2 },
  lurker: { size: 22, hp: 58, speed: 150, damage: 18, reach: 28, windup: 0.16, recover: 0.5, points: 35, color: '#4B5563', contact: 6 },
}

/** Enemy fire, puddles and blasts. */
export const ENEMY = {
  acid: { speed: 380, r: 9, life: 1.3, puddle: 70, puddleLife: 5, puddleDps: 8 },
  bloater: { dropEvery: 2.4, puddle: 78, puddleLife: 6.5, puddleDps: 9, cloud: 150, cloudLife: 5, cloudDps: 13 },
  exploder: { fuse: 0.45, blast: 190, knockback: 420, trigger: 52 },
  shaman: { range: 260, healShare: 0.18, shield: 3.5, shieldTaken: 0.4 },
  lurker: { cloakRange: 260, behind: 150 },
  /** Caps so a busy room cannot pile up objects. */
  maxShots: 120,
  maxZones: 90,
} as const

export const WAVE = {
  intermission: 3,
  healBetween: 4,
  spawnInterval: 0.18,
  maxAlive: 60,
  /** Each extra player in a co-op room adds this share of zombies. */
  perExtraPlayer: 0.6,
  /** Each extra player multiplies boss health by this much more. */
  bossPerExtraPlayer: 0.8,
} as const

export const REVIVE = { range: 64, seconds: 3, hp: 0.4, invuln: 2 } as const

export const PICKUPS = {
  size: 28,
  mapInterval: 11,
  mapMax: 7,
  dropTtl: 25,
  medkitHeal: 20,
} as const
