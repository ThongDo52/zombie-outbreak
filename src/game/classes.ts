import type { WeaponId } from './types'

/**
 * Character classes (roles). Each has passive stats, a passive talent, two skills (Shift or Space for the
 * first, E or the right mouse button for the second), a starting sidearm and its own shelf in the shop.
 * The Runner's first skill is the dash the game always had.
 */

export type ClassId = 'tank' | 'damage' | 'agile' | 'support' | 'sniper' | 'summoner'

export interface SkillDef {
  name: string
  blurb: string
  /** Seconds before the skill can be used again. */
  cooldown: number
  /** Seconds the skill's effect lasts (0 for an instant one). */
  duration: number
}

export interface ClassDef {
  id: ClassId
  name: string
  role: string
  /** One line on how the class plays. */
  blurb: string
  /** Multiplies maximum health. */
  hp: number
  /** Multiplies walking speed. */
  speed: number
  color: string
  passive: { name: string; blurb: string }
  skills: readonly [SkillDef, SkillDef]
  /** The first skill, kept under its old names for the parts of the game that only need one. */
  skill: string
  cooldown: number
  duration: number
  /** The free sidearm every run starts with. */
  starter: WeaponId
  /** Guns this class can buy, cheapest first. */
  shop: readonly WeaponId[]
}

function def(c: Omit<ClassDef, 'skill' | 'cooldown' | 'duration'>): ClassDef {
  return { ...c, skill: c.skills[0].name, cooldown: c.skills[0].cooldown, duration: c.skills[0].duration }
}

export const CLASSES: Record<ClassId, ClassDef> = {
  tank: def({
    id: 'tank', name: 'Bulwark', role: 'Tank', color: '#5B9BFF', hp: 1.5, speed: 0.9,
    blurb: 'Stands in front and takes the hits. Most health in the squad, a little slower, heavy guns.',
    passive: { name: 'Iron Skin', blurb: 'Takes 15% less damage from everything.' },
    skills: [
      { name: 'Bulwark Shield', cooldown: 14, duration: 4, blurb: 'For 4 seconds you take 70% less damage and every zombie nearby turns on you.' },
      { name: 'Ground Slam', cooldown: 11, duration: 0, blurb: 'Smash the ground: zombies around you are hurt, thrown back and stunned, and you gain 30 armor.' },
    ],
    starter: 'pistol', shop: ['shotgun', 'flamer', 'minigun', 'launcher'],
  }),
  damage: def({
    id: 'damage', name: 'Striker', role: 'Assault', color: '#FF4B57', hp: 0.85, speed: 1,
    blurb: 'The squad\'s firepower. Less health, the hardest-hitting automatic guns.',
    passive: { name: 'Momentum', blurb: 'Every kill takes a little off both skill cooldowns.' },
    skills: [
      { name: 'Overdrive', cooldown: 16, duration: 6, blurb: 'For 6 seconds you shoot 60% faster and hit 35% harder.' },
      { name: 'Frag Grenade', cooldown: 9, duration: 0, blurb: 'Throw a grenade at your crosshair. A wide blast that stuns.' },
    ],
    starter: 'pistol', shop: ['smg', 'rifle', 'minigun', 'launcher'],
  }),
  agile: def({
    id: 'agile', name: 'Runner', role: 'Scout', color: '#6EE7A8', hp: 1, speed: 1.12,
    blurb: 'Never where the horde expects. Fastest on foot, light guns, in and out.',
    passive: { name: 'Evasion', blurb: 'Zombies that only brush past you do 40% less damage.' },
    skills: [
      { name: 'Dash', cooldown: 1.8, duration: 0.16, blurb: 'A quick dash through the horde that cannot be hit.' },
      { name: 'Shock Trap', cooldown: 13, duration: 6, blurb: 'Drop an electric field at your feet. Zombies crossing it crawl and take damage for 6 seconds.' },
    ],
    starter: 'pistol', shop: ['smg', 'shotgun', 'rifle', 'flamer'],
  }),
  support: def({
    id: 'support', name: 'Medic', role: 'Support', color: '#FFD25A', hp: 1, speed: 1,
    blurb: 'Keeps everyone standing. Heals, revives faster and freezes what gets too close.',
    passive: { name: 'Field Medic', blurb: 'Revives teammates 50% faster. Medkits heal you 50% more.' },
    skills: [
      { name: 'Heal Pulse', cooldown: 18, duration: 0.5, blurb: 'A pulse that heals you and nearby teammates and clears poison.' },
      { name: 'Med Station', cooldown: 24, duration: 7, blurb: 'Place a healing field for 7 seconds. Everyone standing in it recovers, pets too.' },
    ],
    starter: 'pistol', shop: ['smg', 'shotgun', 'rifle', 'cryo'],
  }),
  sniper: def({
    id: 'sniper', name: 'Deadshot', role: 'Sniper', color: '#FFB067', hp: 0.85, speed: 1,
    blurb: 'Kills what matters from far away: Screamers, Mortars, Shielders and bosses. Fragile up close.',
    passive: { name: 'Long Shot', blurb: 'Your bullets hit up to 50% harder the farther they fly.' },
    skills: [
      { name: 'Deadeye', cooldown: 15, duration: 5, blurb: 'For 5 seconds every shot is perfectly accurate, hits 80% harder, pierces 2 more zombies and ignores riot shields. You walk slower while aiming.' },
      { name: 'Hunter\'s Mark', cooldown: 12, duration: 8, blurb: 'Mark the zombie at your crosshair for 8 seconds: it takes 40% more damage from everyone and cannot cloak. A marked kill refunds half the cooldown.' },
    ],
    starter: 'pistol', shop: ['smg', 'rifle', 'sniper', 'railgun'],
  }),
  summoner: def({
    id: 'summoner', name: 'Warlock', role: 'Summoner', color: '#B98CFF', hp: 0.9, speed: 1,
    blurb: 'Fights with a pack. Spirit wolves hunt at your side and a stone guardian holds the line.',
    passive: { name: 'Soul Siphon', blurb: 'Every zombie your pets kill heals you a little.' },
    skills: [
      { name: 'Spirit Wolves', cooldown: 14, duration: 0, blurb: 'Call two spirit wolves that hunt beside you until they fall. Casting again brings back the fallen and heals the rest.' },
      { name: 'Stone Guardian', cooldown: 28, duration: 16, blurb: 'Raise a stone guardian at your crosshair for 16 seconds. Zombies around it attack it instead of you, and its slams stun them.' },
    ],
    starter: 'wand', shop: ['smg', 'venom', 'tesla', 'cryo'],
  }),
}

export const CLASS_ORDER: readonly ClassId[] = ['tank', 'damage', 'agile', 'support', 'sniper', 'summoner']
/** The class everyone had before classes existed, so old saves play the same. */
export const DEFAULT_CLASS: ClassId = 'agile'

export const isClassId = (v: unknown): v is ClassId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(CLASSES, v)

/** Numbers behind the skills and passives. */
export const SKILL = {
  /** Bulwark: share of damage always taken (Iron Skin), share taken while the shield is up, and how far it pulls zombies. */
  ironSkin: 0.85,
  shield: { taken: 0.3, taunt: 420 },
  /** Bulwark: Ground Slam. */
  slam: { size: 240, damage: 45, knockback: 480, stun: 1.3, armor: 30 },
  /** Striker: fire rate and damage multipliers, and seconds a kill takes off the cooldowns. */
  overdrive: { fireRate: 1.6, damage: 1.35 },
  momentum: 0.35,
  /** Striker: Frag Grenade. */
  frag: { damage: 85, blast: 178, speed: 560, reach: 430, knockback: 430, stun: 0.7 },
  /** Runner: share of touch damage taken, and the Shock Trap. */
  evasion: 0.6,
  trap: { size: 196, dps: 16 },
  /** Medic: heal pulse reach, health given to teammates, share of maximum health healed on yourself. */
  pulse: { range: 270, heal: 40, self: 0.3 },
  /** Medic: revives take this much less time, medkits heal this much more, and the Med Station. */
  reviveBonus: 1.5,
  medkitBonus: 1.5,
  station: { size: 210, heal: 8, petHeal: 14 },
  /** Sniper: extra damage at range (none inside `near` pixels, all of it beyond `far`), Deadeye and the Mark. */
  longShot: { bonus: 0.5, near: 180, far: 600 },
  deadeye: { damage: 1.8, pierce: 2, walk: 0.75 },
  mark: { taken: 1.4, pick: 170, reach: 640, refund: 0.5, bossTime: 6 },
  /** Summoner: health per pet kill. */
  siphon: 3,
  /** How much skill damage grows with every level of the run, so skills keep up with tougher zombies. */
  levelScale: 0.055,
} as const
