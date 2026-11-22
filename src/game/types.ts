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

export type ZombieKind =
  | 'walker' | 'runner' | 'tank' | 'boss' | 'spitter' | 'bloater' | 'exploder' | 'shaman' | 'lurker'
  // the second wave of families: a riot shield, a pounce, a rallying scream, a swarm carrier and its brood, artillery
  | 'shielder' | 'leaper' | 'screamer' | 'brood' | 'mite' | 'mortar'

/** Enemy fire: acid flies straight, a bomb is lobbed over walls and lands on a marked spot. */
export type ShotKind = 'acid' | 'bomb'

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
  /** Bombs only: where it comes down. */
  tx?: number
  ty?: number
}

export type BossAbility = 'charge' | 'slam'

export type WeaponId = 'fists' | 'pistol' | 'wand' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'flamer' | 'launcher' | 'minigun' | 'railgun' | 'venom' | 'tesla' | 'cryo'

export type BoostKind = 'life' | 'heal' | 'armor'

export interface BoostCharges {
  life: number
  heal: number
  armor: number
}

export type Control = 'up' | 'down' | 'left' | 'right'

/** Anything a zombie can hunt: a player or a summoned pet. */
export interface Target {
  x: number
  y: number
  w: number
  h: number
  aim: Vec
}

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
  /** Seconds until the first class skill can be used again. */
  skillCd: number
  /** Seconds left on the first skill's effect (shield, overdrive, deadeye). */
  skillT: number
  /** The same two timers for the second class skill. */
  skill2Cd: number
  skill2T: number
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
  /** Coins earned this run. They buy guns, upgrades, ammo and medkits in the shop. */
  coins: number
  /** Upgrade level of each gun, 0 to 3. Every level adds damage. */
  gunLv: Record<WeaponId, number>
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
  /** Seconds left caught in a Runner's shock trap: a much heavier slow. */
  snare?: number
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
  /** Seconds left whipped up by a Screamer: faster on its feet and quicker to strike. */
  haste?: number
  /** Seconds left under a Sniper's mark: it takes extra damage from everyone and cannot hide. */
  mark?: number
  /** Slot id of the Sniper who marked it. */
  markBy?: number
  /** The last hit came from a summoned pet (the Summoner's siphon heals on such kills). */
  byPet?: boolean
  /** Seconds between "Blocked" pop-ups on a Shielder, so they do not flood the screen. */
  blockT?: number
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
  /** Share of a riot shield this shot ignores, 0 to 1. */
  ap?: number
  /** A Sniper's shot: it hits harder the farther it has flown. */
  far?: boolean
  /** Radians per second the shot may turn toward the nearest zombie ahead (the Spirit Wand). */
  homing?: number
}

/** What dealt a blow, for the rules that care (riot shields, the Sniper's range bonus, the Summoner's siphon). */
export interface HitSource {
  weapon?: WeaponId
  /** Share of a riot shield ignored, 0 to 1. Explosions, fire and lightning ignore it completely. */
  ap?: number
  melee?: boolean
  pet?: boolean
  /** Long-range bonus already worked out for this hit (1 = none). */
  far?: number
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
  src?: HitSource
}

/** Purely visual effect (bite marks, claw slashes, shockwaves, a bomb's landing mark). */
export interface Effect {
  kind: 'bite' | 'claw' | 'slam' | 'ring' | 'bolt' | 'arc' | 'warn' | 'rune' | 'flash'
  color?: string
  x: number
  y: number
  angle: number
  size: number
  life: number
  max: number
}

export type ZoneLook = 'venom' | 'trap' | 'heal'

/** A lingering patch on the ground (a venom cloud, a shock trap, a med station, a zombie's puddle). */
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
  look?: ZoneLook
  /** Health per second given to players (and pets) standing in it. */
  heal?: number
  /** Zombies inside are snared: slowed far more than by a venom cloud. */
  snare?: boolean
}

export type PetKind = 'wolf' | 'golem'
export type PetState = 'follow' | 'chase' | 'windup' | 'recover'

/** A creature a Summoner called. It fights for its owner, and zombies fight it back. */
export interface Pet {
  id: number
  kind: PetKind
  /** Slot id of the Summoner. */
  owner: number
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  aim: Vec
  state: PetState
  stateTime: number
  /** Seconds until it can attack again. */
  cooldown: number
  flash: number
  /** Seconds before a timed summon crumbles. Undefined: it stays until it is killed. */
  life?: number
  /** Brief safety after a zombie touches it, so a crowd does not shred it in one frame. */
  invuln: number
  targetId?: number
  thinkT: number
  /** Seconds it has made no headway toward its target (it is behind a wall). */
  stuck: number
  /** Which of its owner's pets this is, so they fan out instead of stacking. */
  index: number
  tx?: number
  ty?: number
}

export type PickupKind = 'weapon' | 'ammo' | 'medkit' | 'coins'

export interface Pickup {
  id: number
  x: number
  y: number
  kind: PickupKind
  weapon?: WeaponId
  /** Coins in a coin pickup. */
  amount?: number
  /** Seconds before a dropped pickup disappears. Undefined = stays. */
  ttl?: number
}

export type ParticleKind = 'dot' | 'spark' | 'smoke' | 'chunk' | 'ember' | 'shell'

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  /** How it is drawn. Plain dots are the default. */
  kind?: ParticleKind
  /** Share of its speed kept after one second (smaller stops sooner). */
  drag?: number
  /** Downward pull in pixels per second squared (embers and smoke use a negative value and rise). */
  gy?: number
  rot?: number
  spin?: number
}

/** A brief light that pushes the darkness back (and tints the scene): a muzzle flash, an explosion, a spell. */
export interface Light {
  x: number
  y: number
  r: number
  /** r,g,b */
  color: string
  life: number
  max: number
}

/** A coin on its way from a kill to the coin counter (visual only). */
export interface CoinFx {
  x: number
  y: number
  vx: number
  vy: number
  t: number
}

/** A stain on the ground: 1 and 2 are blood, 3 is a scorch mark, 4 is acid or slime. */
export interface Decal {
  x: number
  y: number
  r: number
  rot: number
  kind: 1 | 2 | 3 | 4
}

export interface FloatText {
  x: number
  y: number
  text: string
  life: number
  color: string
  /** 1: a heavy hit, drawn larger. 2: a headline. */
  big?: 1 | 2
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
  | 'coin' | 'buy' | 'deny' | 'scream' | 'leap' | 'lob' | 'clang' | 'howl' | 'petbite' | 'crumble'

/** Something the game wants to be heard. `kind` is a weapon, zombie kind or kill effect. */
export interface SoundEvent {
  type: SoundType
  x?: number
  y?: number
  kind?: string
}

/** What an explosion is made of, which decides its colours and the mark it leaves. */
export type BoomKind = 'fire' | 'acid' | 'frost' | 'arcane' | 'stone'

/** Everything that is only for show. The server records these and sends them to clients. */
export type GameEvent =
  | { t: 'fx'; kind: Effect['kind']; x: number; y: number; angle: number; size: number; life: number; color?: string }
  | { t: 'burst'; x: number; y: number; color: string; n: number }
  /** Floating text. With `slot` only that player sees it (a personal note such as a wave bonus). */
  | { t: 'text'; x: number; y: number; text: string; color: string; big?: 1 | 2; slot?: number }
  | { t: 'decal'; x: number; y: number; r: number; rot: number; kind: Decal['kind'] }
  | { t: 'snd'; type: SoundType; x?: number; y?: number; kind?: string }
  | { t: 'shake'; v: number; slot?: number }
  | { t: 'kill'; x: number; y: number; w: number; h: number; zk: ZombieKind; fx: string; slot: number }
  /** Blood (or whatever colour) thrown along a direction: a bullet going through a zombie. */
  | { t: 'spray'; x: number; y: number; dx: number; dy: number; color: string; n: number }
  /** Bright streaks where a shot meets something hard: a wall, a riot shield. */
  | { t: 'spark'; x: number; y: number; dx: number; dy: number; color: string; n: number }
  /** A layered explosion: flash, fireball, smoke, sparks, a light and a mark on the ground. */
  | { t: 'boom'; x: number; y: number; size: number; kind?: BoomKind }
  /** A zombie comes apart, thrown the way the killing blow was going. */
  | { t: 'gib'; x: number; y: number; w: number; dx: number; dy: number; zk: ZombieKind }
  /** Coins pop out of a kill and fly to the counter. */
  | { t: 'coin'; x: number; y: number; n: number }
  | { t: 'light'; x: number; y: number; r: number; color: string; life: number }

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
  queuedSkill2: boolean
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
  skill2?: boolean
  weapon?: WeaponId
  heal?: boolean
  armor?: boolean
  /** A shop purchase: `gun:<weapon>`, `ammo` or `medkit`. */
  buy?: string
}
