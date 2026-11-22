import { DEFAULT_CLASS, isClassId, type ClassId } from './classes'
import { VIEW_H, VIEW_W, WEAPON_ORDER, ZOMBIES } from './config'
import type { Difficulty } from './difficulty'
import type { Game } from './engine'
import { PETS } from './pets'
import { newPlayer } from './players'
import { DEFAULT_SELECTION, type SkinSelection } from './skins'
import type {
  BoostCharges,
  Bullet,
  GameStatus,
  Pet,
  PetKind,
  PetState,
  Pickup,
  Player,
  PlayerSlot,
  WeaponId,
  Zombie,
  ZombieKind,
  ZombieState,
  ZoneLook,
} from './types'
import { activeMap, setChapter } from './world'
import { normalize } from './collision'

// Cosmetic events (particles, lights, text, sounds) live in visuals.ts; they are re-exported here because
// the engine and the co-op client have always imported them from this file.
export { applyEvent, updateVisuals } from './visuals'


// ---------- Snapshots (server to clients) ----------

// Lists that turn names into small numbers on the wire. Everyone in a room runs the same build, so the
// order only has to match between the two functions below.
const KINDS: ZombieKind[] = ['walker', 'runner', 'tank', 'boss', 'spitter', 'bloater', 'exploder', 'shaman', 'lurker', 'shielder', 'leaper', 'screamer', 'brood', 'mite', 'mortar']
const STATES: ZombieState[] = ['chase', 'windup', 'strike', 'recover', 'stunned']
const WEAPONS_LIST: WeaponId[] = WEAPON_ORDER
const PET_KINDS: PetKind[] = ['wolf', 'golem']
const PET_STATES: PetState[] = ['follow', 'chase', 'windup', 'recover']
const ZONE_LOOKS: ZoneLook[] = ['venom', 'trap', 'heal']

export interface SnapPlayer {
  id: number
  name: string
  x: number
  y: number
  hp: number
  maxHp: number
  ax: number
  ay: number
  mx: number
  my: number
  state: Player['state']
  weapon: WeaponId
  armor: number
  down: boolean
  revive: number
  invuln: number
  dash: boolean
  skillCd: number
  skillT: number
  /** Second skill: cooldown and effect time. */
  s2c: number
  s2t: number
  cls: ClassId
  muzzle: number
  owned: WeaponId[]
  ammo: number[]
  /** Upgrade level of each gun, in the same order as `ammo`. */
  lv: number[]
  coins: number
  skin: SkinSelection
  charges: BoostCharges
  connected: boolean
}

/** Zombie as a flat array: id, kind, x, y, hp, maxHp, state, stateTime, aimX, aimY, burn, flash, status bits. */
export type SnapZombie = [number, number, number, number, number, number, number, number, number, number, number, number, number]

export interface SnapBullet {
  x: number
  y: number
  vx: number
  vy: number
  c: string
  w: number
  g?: 1
  s?: string
  l: number
  ml: number
  b?: number
}

export interface Snapshot {
  tick: number
  status: GameStatus
  chapter: number
  difficulty: Difficulty
  descent?: boolean
  survival?: boolean
  /** Seconds on the run clock. */
  time?: number
  floor?: number
  floorsCleared?: number
  wave: number
  waves: number
  score: number
  kills: number
  banner: number
  bossWave: boolean
  chapterBanner: number
  players: SnapPlayer[]
  zombies: SnapZombie[]
  bullets: SnapBullet[]
  pickups: Pickup[]
  /** Patches on the ground: id, x, y, w, h, life, max, hostile, look. */
  zones?: number[][]
  /** Enemy shots: x, y, vx, vy, half size, life, max life, kind (0 acid, 1 bomb), landing x, landing y. */
  shots?: number[][]
  /** Summoned pets: id, kind, x, y, hp, max hp, state, state time, aim x, aim y, owner, life, flash. */
  pets?: number[][]
}

const r1 = (n: number) => Math.round(n * 10) / 10

export function makeSnapshot(g: Game, tick: number): Snapshot {
  return {
    tick,
    status: g.status,
    chapter: activeMap.index,
    difficulty: g.difficulty,
    descent: g.descent || undefined,
    survival: g.survival || undefined,
    time: r1(g.runTime),
    floor: g.descent ? g.floor : undefined,
    floorsCleared: g.descent ? g.floorsCleared : undefined,
    wave: g.wave,
    waves: activeMap.chapter.waves,
    score: g.score,
    kills: g.kills,
    banner: r1(g.banner),
    bossWave: g.bossWave,
    chapterBanner: r1(g.chapterBanner),
    players: g.slots.map((s) => {
      const p = s.player
      return {
        id: s.id, name: s.name, x: r1(p.x), y: r1(p.y), hp: Math.round(p.hp), maxHp: p.maxHp,
        ax: Math.round(p.aim.x * 100) / 100, ay: Math.round(p.aim.y * 100) / 100,
        mx: p.mx ?? 0, my: p.my ?? 0, state: p.state, weapon: p.weapon, armor: Math.round(p.armor ?? 0),
        down: Boolean(p.down), revive: Math.round((p.revive ?? 0) * 100) / 100, invuln: r1(p.invuln),
        dash: p.dashTime > 0, skillCd: r1(p.skillCd), skillT: r1(p.skillT), s2c: r1(p.skill2Cd ?? 0), s2t: r1(p.skill2T ?? 0), cls: p.cls,
        // rounded up to a tenth, so a single shot's flash is never rounded away
        muzzle: p.muzzle > 0 ? 0.1 : 0,
        owned: WEAPONS_LIST.filter((w) => p.owned[w]),
        ammo: WEAPONS_LIST.map((w) => Math.round(p.ammo[w])),
        lv: WEAPONS_LIST.map((w) => p.gunLv?.[w] ?? 0),
        coins: Math.floor(p.coins ?? 0),
        skin: s.skin, charges: s.charges, connected: s.connected,
      }
    }),
    zombies: g.zombies.map((z) => [
      z.id, KINDS.indexOf(z.kind), r1(z.x), r1(z.y), Math.round(z.hp), z.maxHp, STATES.indexOf(z.state),
      r1(z.stateTime), Math.round(z.aim.x * 100) / 100, Math.round(z.aim.y * 100) / 100, r1(z.burn ?? 0), r1(z.flash), statusBits(z),
    ]),
    zones: g.zones.length ? g.zones.map((z) => [z.id, Math.round(z.x), Math.round(z.y), z.w, z.h, r1(z.life), z.max, z.hostile ? 1 : 0, z.look ? ZONE_LOOKS.indexOf(z.look) : 0]) : undefined,
    shots: g.shots.length
      ? g.shots.map((s) => [Math.round(s.x), Math.round(s.y), Math.round(s.vx), Math.round(s.vy), s.r, Math.round(s.life * 100) / 100, s.maxLife, s.kind === 'bomb' ? 1 : 0, Math.round(s.tx ?? 0), Math.round(s.ty ?? 0)])
      : undefined,
    pets: g.pets.length
      ? g.pets.map((p) => [
          p.id, PET_KINDS.indexOf(p.kind), r1(p.x), r1(p.y), Math.round(p.hp), p.maxHp, PET_STATES.indexOf(p.state), r1(p.stateTime),
          Math.round(p.aim.x * 100) / 100, Math.round(p.aim.y * 100) / 100, p.owner, r1(p.life ?? -1), r1(p.flash),
        ])
      : undefined,
    bullets: g.bullets.map((b) => ({ x: r1(b.x), y: r1(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy), c: b.color, w: WEAPONS_LIST.indexOf(b.weapon), g: b.glow ? 1 : undefined, s: b.sparkle, l: r1(b.life), ml: b.maxLife, b: b.blast })),
    pickups: g.pickups.map((k) => ({ id: k.id, x: Math.round(k.x), y: Math.round(k.y), kind: k.kind, weapon: k.weapon, amount: k.amount, ttl: k.ttl === undefined ? undefined : r1(k.ttl) })),
  }
}

/** Status effects packed into one number: poison stacks, chill stacks, frozen, shock, slow, shield, cloak, frenzy, mark, snare. */
function statusBits(z: Zombie): number {
  const poison = z.poison && z.poison > 0 ? Math.min(3, z.poisonStacks ?? 1) : 0
  return (
    poison |
    (Math.min(3, z.chill ?? 0) << 2) |
    (z.frozen ? 16 : 0) |
    (z.shock && z.shock > 0 ? 32 : 0) |
    (z.slow && z.slow > 0 ? 64 : 0) |
    (z.shield && z.shield > 0 ? 128 : 0) |
    (z.cloak ? 256 : 0) |
    (z.haste && z.haste > 0 ? 512 : 0) |
    (z.mark && z.mark > 0 ? 1024 : 0) |
    (z.snare && z.snare > 0 ? 2048 : 0)
  )
}

function fromSnapPlayer(old: PlayerSlot | undefined, s: SnapPlayer): PlayerSlot {
  const cls: ClassId = isClassId(s.cls) ? s.cls : DEFAULT_CLASS
  const slot: PlayerSlot = old ?? {
    id: s.id, name: s.name, player: newPlayer(s, cls), cls, keys: new Set(), firing: false, autoAim: false,
    aimScreen: { x: VIEW_W / 2 + 120, y: VIEW_H / 2 }, queuedSkill: false, queuedSkill2: false, skin: { ...DEFAULT_SELECTION },
    charges: { life: 0, heal: 0, armor: 0 }, camera: { x: 0, y: 0 }, connected: true, hazardTick: 0, unlocked: [],
  }
  const p = slot.player
  const first = !old
  slot.name = s.name
  slot.skin = s.skin
  slot.charges = s.charges
  slot.connected = s.connected
  p.tx = s.x
  p.ty = s.y
  if (first) {
    p.x = s.x
    p.y = s.y
  }
  p.hp = s.hp
  p.maxHp = s.maxHp
  p.aim = { x: s.ax, y: s.ay }
  p.mx = s.mx
  p.my = s.my
  p.state = s.state
  p.weapon = s.weapon
  p.armor = s.armor
  p.down = s.down
  p.revive = s.revive
  p.invuln = s.invuln
  p.dashTime = s.dash ? 0.1 : 0
  p.skillCd = s.skillCd
  p.skillT = s.skillT ?? 0
  p.skill2Cd = s.s2c ?? 0
  p.skill2T = s.s2t ?? 0
  p.cls = cls
  slot.cls = cls
  p.muzzle = s.muzzle
  p.coins = s.coins ?? 0
  WEAPONS_LIST.forEach((w, i) => {
    p.owned[w] = s.owned.includes(w)
    p.ammo[w] = s.ammo[i] ?? 0
    p.gunLv[w] = s.lv?.[i] ?? 0
  })
  return slot
}

/** Overwrites the client's picture of the world with the server's latest snapshot. */
export function applySnapshot(g: Game, s: Snapshot) {
  const newChapter = activeMap.index !== s.chapter
  if (newChapter) setChapter(s.chapter)
  const summaryChanged = g.wave !== s.wave || g.score !== s.score || g.kills !== s.kills || g.floorsCleared !== (s.floorsCleared ?? 0)
  g.difficulty = s.difficulty
  g.descent = Boolean(s.descent)
  g.survival = Boolean(s.survival)
  g.runTime = s.time ?? 0
  g.floor = s.floor ?? 0
  g.floorsCleared = s.floorsCleared ?? 0
  g.wave = s.wave
  g.score = s.score
  g.kills = s.kills
  g.banner = s.banner
  g.bossWave = s.bossWave
  g.chapterBanner = s.chapterBanner

  const oldSlots = new Map(g.slots.map((x) => [x.id, x]))
  g.slots = s.players.map((sp) => fromSnapPlayer(oldSlots.get(sp.id), sp))
  if (newChapter || oldSlots.size === 0) {
    // first picture of a new map: jump the camera and the glide targets instead of sliding across the world
    for (const slot of g.slots) {
      slot.player.x = slot.player.tx ?? slot.player.x
      slot.player.y = slot.player.ty ?? slot.player.y
    }
    const me = g.local
    me.camera = {
      x: Math.max(0, Math.min(activeMap.w - VIEW_W, me.player.x - VIEW_W / 2)),
      y: Math.max(0, Math.min(activeMap.h - VIEW_H, me.player.y - VIEW_H / 2)),
    }
  }

  const oldZ = new Map(g.zombies.map((z) => [z.id, z]))
  g.zombies = s.zombies.map((a) => {
    const kind = KINDS[a[1]] ?? 'walker'
    let z = oldZ.get(a[0])
    if (!z) {
      const def = ZOMBIES[kind]
      z = { id: a[0], kind, x: a[2], y: a[3], w: def.size, h: def.size, hp: a[4], maxHp: a[5], state: 'chase', stateTime: 0, stateDur: 0, vx: 0, vy: 0, flash: 0, aim: { x: 1, y: 0 } }
    }
    z.tx = a[2]
    z.ty = a[3]
    z.hp = a[4]
    z.maxHp = a[5]
    z.state = STATES[a[6]] ?? 'chase'
    z.stateTime = a[7]
    z.aim = { x: a[8], y: a[9] }
    z.burn = a[10]
    z.flash = a[11]
    const st = a[12] ?? 0
    z.poisonStacks = st & 3
    z.poison = st & 3 ? 1 : 0
    z.chill = (st >> 2) & 3
    z.frozen = (st & 16) !== 0
    z.shock = st & 32 ? 0.2 : 0
    z.slow = st & 64 ? 1 : 0
    z.shield = st & 128 ? 1 : 0
    z.cloak = (st & 256) !== 0
    z.haste = st & 512 ? 1 : 0
    z.mark = st & 1024 ? 1 : 0
    z.snare = st & 2048 ? 1 : 0
    return z
  })

  const oldPets = new Map(g.pets.map((p) => [p.id, p]))
  g.pets = (s.pets ?? []).map((a) => {
    const kind = PET_KINDS[a[1]] ?? 'wolf'
    let pet = oldPets.get(a[0])
    if (!pet) {
      const size = PETS[kind].size
      pet = { id: a[0], kind, owner: a[10], x: a[2], y: a[3], w: size, h: size, hp: a[4], maxHp: a[5], aim: { x: 1, y: 0 }, state: 'follow', stateTime: 0, cooldown: 0, flash: 0, invuln: 0, thinkT: 0, stuck: 0, index: 0 }
    }
    const p: Pet = pet
    p.tx = a[2]
    p.ty = a[3]
    // a wolf that reappears at its owner's side must not glide across the map
    if (Math.hypot(p.tx - p.x, p.ty - p.y) > 220) {
      p.x = p.tx
      p.y = p.ty
    }
    p.hp = a[4]
    p.maxHp = a[5]
    p.state = PET_STATES[a[6]] ?? 'follow'
    p.stateTime = a[7]
    p.aim = { x: a[8], y: a[9] }
    p.owner = a[10]
    p.life = a[11] >= 0 ? a[11] : undefined
    p.flash = a[12] ?? 0
    return p
  })

  g.bullets = s.bullets.map(
    (b): Bullet => ({
      x: b.x, y: b.y, px: b.x - b.vx * 0.016, py: b.y - b.vy * 0.016, vx: b.vx, vy: b.vy, damage: 0, life: b.l, pierce: 0, knockback: 0, stun: 0,
      hitIds: new Set(), color: b.c, weapon: WEAPONS_LIST[b.w] ?? 'pistol', maxLife: b.ml, blast: b.b, glow: b.g === 1, sparkle: b.s,
    }),
  )
  g.pickups = s.pickups
  g.zones = (s.zones ?? []).map((a) => ({ id: a[0], x: a[1], y: a[2], w: a[3], h: a[4], life: a[5], max: a[6], dps: 0, owner: 0, hostile: a[7] === 1, look: a[7] === 1 ? undefined : (ZONE_LOOKS[a[8]] ?? 'venom') }))
  g.shots = (s.shots ?? []).map((a, i) => ({ id: i, x: a[0], y: a[1], vx: a[2], vy: a[3], r: a[4], damage: 0, life: a[5], maxLife: a[6], kind: a[7] === 1 ? ('bomb' as const) : ('acid' as const), tx: a[8], ty: a[9] }))
  if (g.status !== s.status) g.setStatus(s.status)
  else if (summaryChanged) g.emitStatus()
}

/** Glides players and zombies toward their latest server positions, and tracks the local camera and aim. */
export function smoothReplica(g: Game, dt: number) {
  // enemy shots fly on between snapshots
  for (const sh of g.shots) {
    sh.x += sh.vx * dt
    sh.y += sh.vy * dt
    sh.life = Math.max(0, sh.life - dt)
  }
  const k = 1 - Math.exp(-dt * 20)
  for (const pet of g.pets) {
    if (pet.tx === undefined || pet.ty === undefined) continue
    pet.x += (pet.tx - pet.x) * k
    pet.y += (pet.ty - pet.y) * k
  }
  for (const slot of g.slots) {
    const p = slot.player
    if (p.tx === undefined || p.ty === undefined) continue
    p.x += (p.tx - p.x) * k
    p.y += (p.ty - p.y) * k
  }
  for (const z of g.zombies) {
    if (z.tx === undefined || z.ty === undefined) continue
    z.x += (z.tx - z.x) * k
    z.y += (z.ty - z.y) * k
  }
  const local = g.local
  if (local && !local.player.down) {
    const wx = local.camera.x + local.aimScreen.x
    const wy = local.camera.y + local.aimScreen.y
    const a = normalize(wx - local.player.x, wy - local.player.y)
    if (a.x !== 0 || a.y !== 0) local.player.aim = a
  }
  g.updateCamera(dt)
}
