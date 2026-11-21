import type { GunPalette } from './gunart'

export type SkinKind = 'character' | 'gun' | 'effect'
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'
export type KillEffect = 'gold' | 'lightning' | 'soul'
export type CharacterExtra = 'none' | 'goggles' | 'bandana' | 'frost' | 'mask' | 'neon' | 'crown' | 'mohawk' | 'hood' | 'visor'
/** Large animated effects around the character. */
export type CharacterFx = 'wings' | 'flames' | 'void' | 'halo' | 'orbit'

/** What the player has equipped. 0 means the default look. */
export interface SkinSelection {
  character: number
  gun: number
  effect: number
}

export const DEFAULT_SELECTION: SkinSelection = { character: 0, gun: 0, effect: 0 }

export interface CharacterLook {
  jacket: string
  hair: string
  skin: string
  accent: string
  extra: CharacterExtra
  /** Soft glow under the character. */
  aura?: string
  /** Color of the particles left behind while moving. 'rainbow' cycles through every hue. */
  trail?: string
  fx?: CharacterFx[]
  /** Color of the orbiting orbs ('rainbow' cycles). */
  orbit?: string
}

export interface GunLook extends GunPalette {
  tracer: string
  /** Bullets glow brightly. */
  glow?: boolean
  /** Bullets shed sparkles of this color ('rainbow' cycles). */
  sparkle?: string
  /** Tracer color cycles through every hue. */
  rainbow?: boolean
  /** The gun finish itself slowly shifts color. */
  shimmer?: boolean
  /** Every shot releases an expanding ring at the muzzle. */
  ring?: boolean
}

export interface SkinDef {
  id: number
  kind: SkinKind
  name: string
  blurb: string
  rarity: Rarity
  /** Launch price in USDC. The shop shows the live price read from the contract. */
  price: number
  /** 'box' skins can only be won from mystery boxes. */
  source?: 'shop' | 'box'
  character?: CharacterLook
  gun?: GunLook
  effect?: KillEffect
}

export const DEFAULT_CHARACTER: CharacterLook = {
  jacket: '#2C4A86',
  hair: '#2A1D14',
  skin: '#E8C39E',
  accent: '#FFFFFF',
  extra: 'none',
}

export const SHOP_SKINS: readonly SkinDef[] = [
  { id: 101, kind: 'character', name: 'Night Ops', blurb: 'Forest fatigues and night-vision goggles.', rarity: 'common', price: 1, character: { jacket: '#2F4A2F', hair: '#1B1B1B', skin: '#E8C39E', accent: '#7CFF8A', extra: 'goggles' } },
  { id: 102, kind: 'character', name: 'Crimson Raider', blurb: 'Red leather and a street bandana.', rarity: 'common', price: 1, character: { jacket: '#A4232E', hair: '#2A1D14', skin: '#D9A87C', accent: '#1B1B1B', extra: 'bandana' } },
  { id: 103, kind: 'character', name: 'Frostbite', blurb: 'Ice-blue parka that sheds snow sparkle.', rarity: 'rare', price: 2, character: { jacket: '#8FBFE3', hair: '#F4FAFF', skin: '#F0D5C4', accent: '#FFFFFF', extra: 'frost', aura: 'rgba(160,220,255,0.35)', trail: '#CFEFFF' } },
  { id: 104, kind: 'character', name: 'Hazmat', blurb: 'Yellow suit with a full gas mask.', rarity: 'rare', price: 2, character: { jacket: '#E3C230', hair: '#2A1D14', skin: '#E8C39E', accent: '#3A4048', extra: 'mask' } },
  { id: 105, kind: 'character', name: 'Neon Ronin', blurb: 'Glowing neon outline and a light-trail. Limited to 500.', rarity: 'epic', price: 4, character: { jacket: '#161835', hair: '#27E6FF', skin: '#E8C39E', accent: '#FF3DAF', extra: 'neon', aura: 'rgba(255,61,175,0.3)', trail: '#FF3DAF' } },
  { id: 106, kind: 'character', name: 'Golden Legend', blurb: 'Gilded armor, crown and a shimmering aura. Limited to 250.', rarity: 'legendary', price: 6, character: { jacket: '#D4A017', hair: '#FFF1B8', skin: '#F0CFA8', accent: '#FFE27A', extra: 'crown', aura: 'rgba(255,215,90,0.4)', trail: '#FFE27A' } },

  { id: 201, kind: 'gun', name: 'Arctic Camo', blurb: 'White and ice-blue finish, frosty tracers.', rarity: 'common', price: 1, gun: { metal: '#9FB8CC', light: '#EAF4FB', wood: '#6E8CA6', dark: '#44566A', tracer: '#BFE7FF' } },
  { id: 202, kind: 'gun', name: 'Blood Red', blurb: 'Deep crimson finish with red tracers.', rarity: 'common', price: 1.5, gun: { metal: '#6B1520', light: '#C23A4A', wood: '#3A0D12', dark: '#240509', tracer: '#FF4B57' } },
  { id: 203, kind: 'gun', name: 'Toxic Green', blurb: 'Radioactive finish, bullets glow acid green.', rarity: 'rare', price: 2, gun: { metal: '#2F5A1E', light: '#9BE04A', wood: '#40641F', dark: '#14260B', tracer: '#9BFF4B', glow: true } },
  { id: 204, kind: 'gun', name: 'Neon Pulse', blurb: 'Cyber chassis, bright cyan pulse rounds.', rarity: 'epic', price: 3.5, gun: { metal: '#1B1840', light: '#27E6FF', wood: '#FF3DAF', dark: '#0D0B26', tracer: '#27E6FF', glow: true } },
  { id: 205, kind: 'gun', name: 'Gold Plated', blurb: 'Solid gold finish, bullets shed sparkles. Limited to 500.', rarity: 'legendary', price: 5, gun: { metal: '#B8891A', light: '#FFE27A', wood: '#7A4A12', dark: '#5C3E0A', tracer: '#FFD25A', glow: true, sparkle: '#FFE9A8' } },
  { id: 206, kind: 'gun', name: 'Inferno', blurb: 'Forged in lava, bullets trail embers. Limited to 250.', rarity: 'legendary', price: 6, gun: { metal: '#3A0F08', light: '#FF8A2E', wood: '#240805', dark: '#150403', tracer: '#FF6A1F', glow: true, sparkle: '#FF8A2E' } },

  { id: 301, kind: 'effect', name: 'Gold Burst', blurb: 'Every kill bursts into golden coins.', rarity: 'epic', price: 2.5, effect: 'gold' },
  { id: 302, kind: 'effect', name: 'Lightning Strike', blurb: 'Kills crackle with chain lightning.', rarity: 'epic', price: 3, effect: 'lightning' },
  { id: 303, kind: 'effect', name: 'Soul Harvest', blurb: 'Defeated zombies release rising souls.', rarity: 'epic', price: 4, effect: 'soul' },
]


const BOX = 'box' as const

/** Skins that only drop from mystery boxes. Ids match the ArenaBoxes contract. */
export const BOX_SKINS: readonly SkinDef[] = [
  { id: 401, kind: 'character', source: BOX, name: 'Street Punk', blurb: 'Purple leather and a hot-pink mohawk.', rarity: 'rare', price: 0, character: { jacket: '#4A2A5C', hair: '#FF3DAF', skin: '#E3B48C', accent: '#FF3DAF', extra: 'mohawk' } },
  { id: 402, kind: 'character', source: BOX, name: 'Desert Nomad', blurb: 'Sun-bleached coat and a dusty wrap.', rarity: 'rare', price: 0, character: { jacket: '#B58A4B', hair: '#3A2A1A', skin: '#C8955F', accent: '#E8DDB5', extra: 'bandana' } },
  { id: 403, kind: 'character', source: BOX, name: 'Cyber Samurai', blurb: 'Carbon plating with a cyan scanning visor.', rarity: 'epic', price: 0, character: { jacket: '#1A1D2E', hair: '#0B0B12', skin: '#E8C39E', accent: '#27E6FF', extra: 'visor', aura: 'rgba(39,230,255,0.28)', trail: '#27E6FF' } },
  { id: 404, kind: 'character', source: BOX, name: 'Hunter Elite', blurb: 'Scarred leather and an amber targeting visor.', rarity: 'epic', price: 0, character: { jacket: '#3B2F2A', hair: '#222222', skin: '#D9A87C', accent: '#FFB23C', extra: 'visor', aura: 'rgba(255,178,60,0.22)' } },
  { id: 405, kind: 'character', source: BOX, name: 'Phoenix Knight', blurb: 'Armor wreathed in living flame wings.', rarity: 'legendary', price: 0, character: { jacket: '#8E1B10', hair: '#FFB23C', skin: '#EBC09A', accent: '#FF8A2E', extra: 'visor', fx: ['flames'], aura: 'rgba(255,120,40,0.4)', trail: '#FF8A2E' } },
  { id: 406, kind: 'character', source: BOX, name: 'Void Reaper', blurb: 'A hooded shadow with a swirling void and orbiting souls.', rarity: 'mythic', price: 0, character: { jacket: '#120A24', hair: '#0A0614', skin: '#6B5B8A', accent: '#B46CFF', extra: 'hood', fx: ['void', 'orbit'], orbit: '#B46CFF', aura: 'rgba(150,60,255,0.45)', trail: '#8A3CFF' } },
  { id: 407, kind: 'character', source: BOX, name: 'Celestial Valkyrie', blurb: 'Radiant wings, a halo and a rainbow of stars.', rarity: 'mythic', price: 0, character: { jacket: '#F2EEFF', hair: '#FFE9A8', skin: '#F5D6BC', accent: '#FFD870', extra: 'none', fx: ['wings', 'halo', 'orbit'], orbit: 'rainbow', aura: 'rainbow', trail: 'rainbow' } },

  { id: 501, kind: 'gun', source: BOX, name: 'Rust Rider', blurb: 'Battle-worn scrap metal finish.', rarity: 'rare', price: 0, gun: { metal: '#6B4A33', light: '#B07A4D', wood: '#3E2A1C', dark: '#25170E', tracer: '#FFB070' } },
  { id: 502, kind: 'gun', source: BOX, name: 'Jungle Camo', blurb: 'Green camouflage with lime tracers.', rarity: 'rare', price: 0, gun: { metal: '#3D5A2E', light: '#7FA85A', wood: '#52422A', dark: '#1A2814', tracer: '#B5FF7A' } },
  { id: 503, kind: 'gun', source: BOX, name: 'Plasma Core', blurb: 'Violet energy core, glowing plasma rounds.', rarity: 'epic', price: 0, gun: { metal: '#2A1D5C', light: '#8F6BFF', wood: '#00E0FF', dark: '#120B33', tracer: '#9B7BFF', glow: true } },
  { id: 504, kind: 'gun', source: BOX, name: 'Frozen Core', blurb: 'Glacial finish that sheds snowflake sparkle.', rarity: 'epic', price: 0, gun: { metal: '#2B5C80', light: '#BDEBFF', wood: '#E8F8FF', dark: '#143349', tracer: '#8FE3FF', glow: true, sparkle: '#FFFFFF' } },
  { id: 505, kind: 'gun', source: BOX, name: 'Dragon Fang', blurb: 'Scaled obsidian. Every shot breathes a ring of fire.', rarity: 'legendary', price: 0, gun: { metal: '#2A0A0A', light: '#FF4B2E', wood: '#FFB23C', dark: '#120303', tracer: '#FF5A1F', glow: true, sparkle: '#FF8A2E', ring: true } },
  { id: 506, kind: 'gun', source: BOX, name: 'Galaxy Cannon', blurb: 'A deep-space barrel trailing stardust and shock rings.', rarity: 'mythic', price: 0, gun: { metal: '#140B3A', light: '#9D7BFF', wood: '#FF6EDB', dark: '#07041A', tracer: '#C9A8FF', glow: true, sparkle: '#FFFFFF', ring: true } },
  { id: 507, kind: 'gun', source: BOX, name: 'Prismatic Annihilator', blurb: 'A shifting prism: rainbow rounds, stars and shock rings.', rarity: 'mythic', price: 0, gun: { metal: '#2A2050', light: '#FF8AF0', wood: '#6AF0FF', dark: '#100A24', tracer: '#FFFFFF', glow: true, sparkle: 'rainbow', rainbow: true, shimmer: true, ring: true } },
]

export const SKINS: readonly SkinDef[] = [...SHOP_SKINS, ...BOX_SKINS]

/** Ids sold in the skin shop (ArenaSkins contract). */
export const SKIN_IDS: readonly number[] = SHOP_SKINS.map((s) => s.id)
/** Ids won from boxes (ArenaBoxes contract). */
export const BOX_IDS: readonly number[] = BOX_SKINS.map((s) => s.id)

const BY_ID = new Map(SKINS.map((s) => [s.id, s]))

export function getSkin(id: number): SkinDef | undefined {
  return BY_ID.get(id)
}

export function characterLook(id: number): CharacterLook {
  return BY_ID.get(id)?.character ?? DEFAULT_CHARACTER
}

export function gunLook(id: number): GunLook | undefined {
  return BY_ID.get(id)?.gun
}

export function killEffect(id: number): KillEffect | undefined {
  return BY_ID.get(id)?.effect
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#9FB0C8',
  rare: '#5B9BFF',
  epic: '#B66CFF',
  legendary: '#FFB23C',
  mythic: '#FF4FD8',
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  mythic: 'Mythic',
}

/** A hue-cycling color. `offset` shifts the hue so neighbours differ. */
export function hueColor(t: number, offset = 0, alpha = 1, light = 62): string {
  return `hsla(${Math.floor(((t * 160 + offset) % 360 + 360) % 360)},100%,${light}%,${alpha})`
}

/** Color of a bullet fired at time `t` by this gun look. */
export function tracerColor(look: GunLook | undefined, t: number, offset = 0): string {
  if (!look) return '#FFD25A'
  return look.rainbow ? hueColor(t, offset) : look.tracer
}

/** The gun finish at time `t`; shimmering guns slowly cycle hues. */
export function gunPalette(look: GunLook | undefined, t: number): GunPalette | undefined {
  if (!look || !look.shimmer) return look
  const h = (t * 70) % 360
  return {
    metal: `hsl(${h},55%,26%)`,
    light: `hsl(${h},95%,68%)`,
    wood: `hsl(${(h + 70) % 360},85%,55%)`,
    dark: `hsl(${h},50%,10%)`,
  }
}
