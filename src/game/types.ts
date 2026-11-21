import type { Difficulty } from './difficulty'
import type { ClassId } from './classes'
import type { SkinSelection } from './skins'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Vec {
  x: number
  y: number
}

/** Player finite-state machine. */
export type PlayerState = 'idle' | 'move' | 'attack' | 'stunned' | 'down'

/** Zombie finite-state machine. */
export type ZombieState = 'chase' | 'windup' | 'strike' | 'recover' | 'stunned'

export type ZombieKind = 'walker' | 'runner' | 'tank' | 'boss' | 'spitter' | 'bloater' | 'exploder' | 'shaman' | 'lurker'

/** Enemy fire. */
export type ShotKind = 'acid'

export interface EnemyShot {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  /** Half size of the hit area. */
  r: number
  damage: number
  life: number
  maxLife: number
  kind: ShotKind
}

export type BossAbility = 'charge' | 'slam'

export type WeaponId = 'fists' | 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'flamer' | 'launcher' | 'minigun' | 'railgun' | 'venom' | 'tesla' | 'cryo'

export type BoostKind = 'life' | 'heal' | 'armor'

export interface BoostCharges {
  life: number
  heal: number
  armor: number
}

export type Control = 'up' | 'down' | 'left' | 'right'

export interface Player {
  x: number // center
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  aim: Vec
  state: PlayerState
  stateTime: number
  invuln: number
  dashTime: number
  /** Seconds until the class skill can be used again. */
  skillCd: number
  /** Seconds left on the skill's effect (shield, overdrive). */
  skillT: number
  cls: ClassId
  /** Seconds left slowed (a zombie's acid, for example). */
  slow?: number
  fireCooldown: number
  muzzle: number
  vx: number
  vy: number
  weapon: WeaponId
  /** Points of armor left; absorbs damage before health. */
  armor?: number
  owned: Record<WeaponId, boolean>
  ammo: Record<WeaponId, number>
  /** Co-op: at zero health a player is down until a teammate revives them. */
  mx?: number
  my?: number
  /** Co-op client: where the server says this player is (the drawn position glides there). */
  tx?: number
  ty?: number
  down?: boolean
  /** Revive progress from 0 to 1 while a teammate stands close. */
  revive?: number
}

export interface Zombie {
  id: number
  kind: ZombieKind
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  state: ZombieState
  stateTime: number
  stateDur: number
  vx: number
  vy: number
  flash: number
  aim: Vec
  /** Boss only: current attack, ability cooldown and how many times it has called minions. */
  ability?: BossAbility
  /** Line of sight to the player, refreshed a few times per second. */
  los?: boolean
  /** Heavy-weapon status effects. Poison and chill wear off on their own; frozen ends when the stun does. */
  poison?: number
  poisonStacks?: number
  poisonAcc?: number
  chill?: number
  chillT?: number
  frozen?: boolean
  /** Seconds left slowed by a venom cloud or a boss-sized chill. */
  slow?: number
  /** Seconds of electric flash (visual). */
  shock?: number
  /** Seconds left on fire after being hit by the flamer (visual). */
  burn?: number
  burnAcc?: number
  tx?: number
  ty?: number
  /** Slot id of the player who last hurt it (kill credit and kill effect). */
  killer?: number
  losT?: number
  cooldown?: number
  summons?: number
  /** Seconds of damage reduction from a Shaman's shield. */
  shield?: number
  /** A Lurker out of sight is nearly invisible. */
  cloak?: boolean
  /** An Exploder lights its fuse when it gets close. */
  fuse?: number
  /** Bloater: seconds until the next poison puddle. Spitter: seconds until the next shot. */
  dropT?: number
  /** Final boss: 1, 2 or 3 as it loses health. */
  phase?: number
}

export interface Bullet {
  x: number
  y: number
  px: number
  py: number
  vx: number
  vy: number
  damage: number
  life: number
  pierce: number
  knockback: number
  stun: number
  hitIds: Set<number>
  color: string
  weapon: WeaponId
  maxLife: number
  /** Explosive shells blow up in a square of this size. */
  blast?: number
  glow?: boolean
  sparkle?: string
  /** Heavy shells: poison drops a toxic cloud where they land, freeze chills what they hit. */
  status?: 'poison' | 'freeze'
  cloud?: number
  /** Slot id of the player who fired it. */
  owner?: number
}

/** A short-lived damaging rectangle (punch or zombie strike). */
export interface Hitbox {
  rect: Rect
  owner: 'player' | 'zombie'
  damage: number
  stun: number
  knockback: number
  life: number
  maxLife: number
  hitIds: Set<number>
  sourceId?: number
  /** Slot id of the player who made it (player hitboxes only). */
  ownerId?: number
}

/** Purely visual effect (bite marks, claw slashes, shockwaves). */
export interface Effect {
  kind: 'bite' | 'claw' | 'slam' | 'ring' | 'bolt' | 'arc'
  color?: string
  x: number
  y: number
  angle: number
  size: number
  life: number
  max: number
}

/** A lingering patch on the ground (a venom cloud). It hurts and slows zombies standing in it. */
export interface Zone {
  id: number
  x: number
  y: number
  w: number
  h: number
  life: number
  max: number
  dps: number
  /** Slot id of the player who made it. */
  owner: number
  /** A puddle or cloud made by zombies: it hurts players, not zombies. */
  hostile?: boolean
}

export type PickupKind = 'weapon' | 'ammo' | 'medkit'

export interface Pickup {
  id: number
  x: number
  y: number
  kind: PickupKind
  weapon?: WeaponId
  /** Seconds before a dropped pickup disappears. Undefined = stays. */
  ttl?: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
}

/** Permanent blood stain on the ground. */
export interface Decal {
  x: number
  y: number
  r: number
  rot: number
  kind: 1 | 2
}

export interface FloatText {
  x: number
  y: number
  text: string
  life: number
  color: string
}

/** A run snapshot that survives a page reload. */
export interface SavedRun {
  v: 2 | 3
  difficulty?: Difficulty
  chapterIndex: number
  savedAt: number
  player: Player
  zombies: Zombie[]
  pickups: Pickup[]
  decals: Decal[]
  wave: number
  score: number
  kills: number
  spawnQueue: ZombieKind[]
  spawnTimer: number
  intermission: number
  pickupTimer: number
  nextId: number
  /** Seconds on the run clock when the run was saved. */
  runTime?: number
  survival?: boolean
}

export type GameStatus = 'ready' | 'playing' | 'over' | 'cleared' | 'won'

export interface GameSummary {
  score: number
  wave: number
  kills: number
  chapter: number
  difficulty: Difficulty
  /** Endless Descent: floors cleared so far. */
  floors: number
  /** Seconds on the run clock (it stops when the run ends). */
  time: number
  /** Survival mode: endless waves on one map. */
  survival: boolean
  /** An armory trial was just cleared: the heavy weapon it unlocked. */
  unlocked?: WeaponId
}

export type SoundType =
  | 'shot' | 'punch' | 'dry' | 'explosion' | 'hit' | 'groan' | 'zattack' | 'zdie' | 'bite'
  | 'spit' | 'burst' | 'chant' | 'skill'
  | 'hurt' | 'armorhit' | 'dash' | 'pickup' | 'weaponpickup' | 'heal' | 'armor' | 'life'
  | 'wave' | 'boss' | 'charge' | 'slam' | 'summon' | 'bossdown' | 'cleared' | 'won' | 'over'
  | 'sizzle' | 'killfx' | 'click' | 'revive' | 'electric'

/** Something the game wants to be heard. `kind` is a weapon, zombie kind or kill effect. */
export interface SoundEvent {
  type: SoundType
  x?: number
  y?: number
  kind?: string
}


/** Everything that is only for show. The server records these and sends them to clients. */
export type GameEvent =
  | { t: 'fx'; kind: Effect['kind']; x: number; y: number; angle: number; size: number; life: number; color?: string }
  | { t: 'burst'; x: number; y: number; color: string; n: number }
  | { t: 'text'; x: number; y: number; text: string; color: string }
  | { t: 'decal'; x: number; y: number; r: number; rot: number; kind: 1 | 2 }
  | { t: 'snd'; type: SoundType; x?: number; y?: number; kind?: string }
  | { t: 'shake'; v: number; slot?: number }
  | { t: 'kill'; x: number; y: number; w: number; h: number; zk: ZombieKind; fx: string; slot: number }

/** One person in the arena. Solo play has one slot; a co-op room has two to four. */
export interface PlayerSlot {
  id: number
  name: string
  player: Player
  keys: Set<Control>
  firing: boolean
  autoAim: boolean
  /** Mouse position in view coordinates (local player). */
  aimScreen: Vec
  /** Absolute aim point in the world (remote players). Wins over the screen position. */
  aimWorld?: Vec
  queuedSkill: boolean
  cls: ClassId
  skin: SkinSelection
  charges: BoostCharges
  camera: Vec
  connected: boolean
  hazardTick: number
  /** Heavy weapons this player has earned in armory trials. They start every run with them. */
  unlocked: WeaponId[]
}

/** What a co-op player's controller sends to the server. */
export interface PlayerInput {
  /** Bit mask: 1 up, 2 down, 4 left, 8 right. */
  keys: number
  fire: boolean
  /** Where the player is aiming, in world coordinates. */
  ax: number
  ay: number
  skill?: boolean
  weapon?: WeaponId
  heal?: boolean
  armor?: boolean
}
