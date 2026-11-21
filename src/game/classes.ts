/**
 * Character classes. Each has its own passive stats and one skill on Shift (or Space).
 * The Runner's skill is the dash the game always had; the others are new.
 */

export type ClassId = 'tank' | 'damage' | 'agile' | 'support'

export interface ClassDef {
  id: ClassId
  name: string
  role: string
  skill: string
  blurb: string
  /** Seconds before the skill can be used again. */
  cooldown: number
  /** Seconds the skill's effect lasts (the Runner's dash is a short burst, see PLAYER). */
  duration: number
  /** Multiplies maximum health. */
  hp: number
  /** Multiplies walking speed. */
  speed: number
  color: string
}

export const CLASSES: Record<ClassId, ClassDef> = {
  tank: {
    id: 'tank', name: 'Bulwark', role: 'Tank', skill: 'Bulwark Shield',
    blurb: 'Raises a shield that cuts damage by 70% for 4 seconds and pulls zombies onto you. More health, a little slower.',
    cooldown: 14, duration: 4, hp: 1.4, speed: 0.9, color: '#5B9BFF',
  },
  damage: {
    id: 'damage', name: 'Striker', role: 'Damage', skill: 'Overdrive',
    blurb: 'For 6 seconds you shoot 60% faster and hit 35% harder. Less health.',
    cooldown: 16, duration: 6, hp: 0.8, speed: 1, color: '#FF4B57',
  },
  agile: {
    id: 'agile', name: 'Runner', role: 'Agile', skill: 'Dash',
    blurb: 'A quick dash through the horde that cannot be hit. Faster on foot, ready again in under two seconds.',
    cooldown: 1.8, duration: 0.16, hp: 1, speed: 1.12, color: '#6EE7A8',
  },
  support: {
    id: 'support', name: 'Medic', role: 'Support', skill: 'Heal Pulse',
    blurb: 'A pulse that heals you and nearby teammates and clears poison. Revives teammates faster.',
    cooldown: 18, duration: 0.5, hp: 1, speed: 1, color: '#FFD25A',
  },
}

export const CLASS_ORDER: readonly ClassId[] = ['tank', 'damage', 'agile', 'support']
/** The class everyone had before classes existed, so old saves play the same. */
export const DEFAULT_CLASS: ClassId = 'agile'

export const isClassId = (v: unknown): v is ClassId => typeof v === 'string' && v in CLASSES

export const SKILL = {
  /** Bulwark: share of damage taken while the shield is up, and how far it pulls zombies. */
  shield: { taken: 0.3, taunt: 420 },
  /** Striker: fire rate and damage multipliers. */
  overdrive: { fireRate: 1.6, damage: 1.35 },
  /** Medic: heal pulse reach, health given to teammates, share of maximum health healed on yourself. */
  pulse: { range: 270, heal: 40, self: 0.3 },
  /** Medic: revives take this much less time. */
  reviveBonus: 1.5,
} as const
