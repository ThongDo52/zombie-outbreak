import { DEFAULT_CLASS, type ClassId } from './classes'
import { VIEW_H, VIEW_W, WEAPON_ORDER, ZOMBIES } from './config'
import type { Difficulty } from './difficulty'
import type { Game } from './engine'
import { newPlayer } from './players'
import { characterLook, DEFAULT_SELECTION, hueColor, type SkinSelection } from './skins'
import type {
  BoostCharges,
  Bullet,
  GameEvent,
  GameStatus,
  Pickup,
  Player,
  PlayerSlot,
  WeaponId,
  Zombie,
  ZombieKind,
  ZombieState,
} from './types'
import { activeMap, setChapter } from './world'
import { normalize } from './collision'

// ---------- Cosmetic events (shared by solo play and co-op clients) ----------

/** Turns a recorded event into particles, effects, floating text, decals or a sound. */
export function applyEvent(g: Game, ev: GameEvent) {
  switch (ev.t) {
    case 'fx':
      if (!(ev.life > 0) || g.effects.length > 160) break // never let a runaway fight bury the screen
      g.effects.push({ kind: ev.kind, x: ev.x, y: ev.y, angle: ev.angle, size: ev.size, life: ev.life, max: ev.life, color: ev.color })
      break
    case 'burst':
      for (let i = 0; i < ev.n && g.particles.length < 1800; i++) {
        const a = Math.random() * Math.PI * 2
        const s = 60 + Math.random() * 140
        g.particles.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, max: 0.4, size: 2 + Math.random() * 2, color: ev.color })
      }
      break
    case 'text':
      if (g.texts.length > 140) g.texts.shift()
      g.texts.push({ x: ev.x, y: ev.y, text: ev.text, life: 0.9, color: ev.color })
      break
    case 'decal':
      g.decals.push({ x: ev.x, y: ev.y, r: ev.r, rot: ev.rot, kind: ev.kind })
      if (g.decals.length > 160) g.decals.shift()
      break
    case 'snd':
      g.onSound?.({ type: ev.type, x: ev.x, y: ev.y, kind: ev.kind })
      break
    case 'shake':
      if (ev.slot === undefined || ev.slot === g.localId) g.shake = Math.max(g.shake, ev.v)
      break
    case 'kill':
      killVisual(g, ev)
      break
  }
}

function killVisual(g: Game, ev: Extract<GameEvent, { t: 'kill' }>) {
  const size = ev.zk === 'boss' ? 200 : ev.zk === 'tank' ? 110 : 80
  const burst = (color: string, n: number) => applyEvent(g, { t: 'burst', x: ev.x, y: ev.y, color, n })
  if (ev.fx === 'gold') {
    burst('#FFD25A', 14)
    burst('#FFF1B8', 8)
    g.effects.push({ kind: 'ring', x: ev.x, y: ev.y, angle: 0, size, life: 0.5, max: 0.5, color: '#FFD25A' })
  } else if (ev.fx === 'lightning') {
    burst('#9FF4FF', 10)
    g.effects.push({ kind: 'bolt', x: ev.x, y: ev.y, angle: Math.random() * 6, size, life: 0.4, max: 0.4 })
    g.effects.push({ kind: 'ring', x: ev.x, y: ev.y, angle: 0, size: size * 0.8, life: 0.4, max: 0.4, color: '#6EDCFF' })
  } else {
    for (let i = 0; i < 12; i++) {
      g.particles.push({
        x: ev.x + (Math.random() - 0.5) * ev.w,
        y: ev.y + (Math.random() - 0.3) * ev.h,
        vx: (Math.random() - 0.5) * 40,
        vy: -70 - Math.random() * 80,
        life: 0.9,
        max: 0.9,
        size: 3 + Math.random() * 3,
        color: Math.random() < 0.5 ? '#7CFFE0' : '#B9FFF0',
      })
    }
    g.effects.push({ kind: 'ring', x: ev.x, y: ev.y, angle: 0, size, life: 0.7, max: 0.7, color: '#7CFFE0' })
  }
}

/** Ages floating text, particles and effects and spawns the decorative ones (trails, sparkles, embers). */
export function updateVisuals(g: Game, dt: number) {
  g.shake = Math.max(0, g.shake - dt * 30)
  for (const t of g.texts) {
    t.life -= dt
    t.y -= 28 * dt
  }
  g.texts = g.texts.filter((t) => t.life > 0)
  for (const q of g.particles) {
    q.life -= dt
    q.x += q.vx * dt
    q.y += q.vy * dt
    q.vx *= Math.pow(0.02, dt)
    q.vy *= Math.pow(0.02, dt)
  }
  g.particles = g.particles.filter((q) => q.life > 0)
  for (const f of g.effects) f.life -= dt
  g.effects = g.effects.filter((f) => f.life > 0)
  if (g.status !== 'playing') return

  for (const slot of g.slots) {
    const p = slot.player
    const trail = characterLook(slot.skin.character).trail
    if (!trail || p.down || p.state !== 'move' || Math.random() >= dt * 30) continue
    const mx = p.mx ?? 0
    const my = p.my ?? 0
    g.particles.push({
      x: p.x - mx * 8 + (Math.random() - 0.5) * 8,
      y: p.y - my * 8 + (Math.random() - 0.5) * 8,
      vx: -mx * 20,
      vy: -my * 20,
      life: 0.5,
      max: 0.5,
      size: 2 + Math.random() * 3,
      color: trail === 'rainbow' ? hueColor(g.time, Math.random() * 360) : trail,
    })
  }
  for (const b of g.bullets) {
    if (!b.sparkle || Math.random() >= dt * 30) continue
    g.particles.push({
      x: b.x,
      y: b.y,
      vx: (Math.random() - 0.5) * 40,
      vy: (Math.random() - 0.5) * 40,
      life: 0.35,
      max: 0.35,
      size: 2 + Math.random() * 2,
      color: b.sparkle === 'rainbow' ? hueColor(g.time, Math.random() * 360) : b.sparkle,
    })
  }
  for (const z of g.zombies) {
    if (!z.burn || Math.random() >= dt * 14) continue
    g.particles.push({
      x: z.x + (Math.random() - 0.5) * z.w * 0.8,
      y: z.y + (Math.random() - 0.3) * z.h * 0.6,
      vx: (Math.random() - 0.5) * 30,
      vy: -50 - Math.random() * 50,
      life: 0.5,
      max: 0.5,
      size: 2 + Math.random() * 2.5,
      color: Math.random() < 0.5 ? '#FFB04A' : '#FF6A1F',
    })
  }
}

// ---------- Snapshots (server to clients) ----------

const KINDS: ZombieKind[] = ['walker', 'runner', 'tank', 'boss', 'spitter', 'bloater', 'exploder', 'shaman', 'lurker']
const STATES: ZombieState[] = ['chase', 'windup', 'strike', 'recover', 'stunned']
const WEAPONS_LIST: WeaponId[] = WEAPON_ORDER

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
  cls: ClassId
  muzzle: number
  owned: WeaponId[]
  ammo: number[]
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
  /** Venom clouds: id, x, y, w, h, life, max. */
  zones?: number[][]
  /** Acid shots: x, y, vx, vy, half size, life, max life. */
  shots?: number[][]
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
        dash: p.dashTime > 0, skillCd: r1(p.skillCd), skillT: r1(p.skillT), cls: p.cls, muzzle: r1(p.muzzle),
        owned: WEAPONS_LIST.filter((w) => p.owned[w]),
        ammo: WEAPONS_LIST.map((w) => Math.round(p.ammo[w])),
        skin: s.skin, charges: s.charges, connected: s.connected,
      }
    }),
    zombies: g.zombies.map((z) => [
      z.id, KINDS.indexOf(z.kind), r1(z.x), r1(z.y), Math.round(z.hp), z.maxHp, STATES.indexOf(z.state),
      r1(z.stateTime), Math.round(z.aim.x * 100) / 100, Math.round(z.aim.y * 100) / 100, r1(z.burn ?? 0), r1(z.flash), statusBits(z),
    ]),
    zones: g.zones.length ? g.zones.map((z) => [z.id, Math.round(z.x), Math.round(z.y), z.w, z.h, r1(z.life), z.max, z.hostile ? 1 : 0]) : undefined,
    shots: g.shots.length ? g.shots.map((s) => [Math.round(s.x), Math.round(s.y), Math.round(s.vx), Math.round(s.vy), s.r, r1(s.life), s.maxLife]) : undefined,
    bullets: g.bullets.map((b) => ({ x: r1(b.x), y: r1(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy), c: b.color, w: WEAPONS_LIST.indexOf(b.weapon), g: b.glow ? 1 : undefined, s: b.sparkle, l: r1(b.life), ml: b.maxLife, b: b.blast })),
    pickups: g.pickups.map((k) => ({ id: k.id, x: Math.round(k.x), y: Math.round(k.y), kind: k.kind, weapon: k.weapon, ttl: k.ttl === undefined ? undefined : r1(k.ttl) })),
  }
}

/** Status effects packed into one number: poison stacks, chill stacks, frozen, shock, slow. */
function statusBits(z: Zombie): number {
  const poison = z.poison && z.poison > 0 ? Math.min(3, z.poisonStacks ?? 1) : 0
  return poison | (Math.min(3, z.chill ?? 0) << 2) | (z.frozen ? 16 : 0) | (z.shock && z.shock > 0 ? 32 : 0) | (z.slow && z.slow > 0 ? 64 : 0) | (z.shield && z.shield > 0 ? 128 : 0) | (z.cloak ? 256 : 0)
}

function fromSnapPlayer(old: PlayerSlot | undefined, s: SnapPlayer): PlayerSlot {
  const slot: PlayerSlot = old ?? {
    id: s.id, name: s.name, player: newPlayer(s, s.cls ?? DEFAULT_CLASS), cls: s.cls ?? DEFAULT_CLASS, keys: new Set(), firing: false, autoAim: false,
    aimScreen: { x: VIEW_W / 2 + 120, y: VIEW_H / 2 }, queuedSkill: false, skin: { ...DEFAULT_SELECTION },
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
  p.cls = s.cls ?? DEFAULT_CLASS
  slot.cls = p.cls
  p.muzzle = s.muzzle
  WEAPONS_LIST.forEach((w, i) => {
    p.owned[w] = s.owned.includes(w)
    p.ammo[w] = s.ammo[i] ?? 0
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
    return z
  })

  g.bullets = s.bullets.map(
    (b): Bullet => ({
      x: b.x, y: b.y, px: b.x - b.vx * 0.016, py: b.y - b.vy * 0.016, vx: b.vx, vy: b.vy, damage: 0, life: b.l, pierce: 0, knockback: 0, stun: 0,
      hitIds: new Set(), color: b.c, weapon: WEAPONS_LIST[b.w] ?? 'pistol', maxLife: b.ml, blast: b.b, glow: b.g === 1, sparkle: b.s,
    }),
  )
  g.pickups = s.pickups
  g.zones = (s.zones ?? []).map((a) => ({ id: a[0], x: a[1], y: a[2], w: a[3], h: a[4], life: a[5], max: a[6], dps: 0, owner: 0, hostile: a[7] === 1 }))
  g.shots = (s.shots ?? []).map((a, i) => ({ id: i, x: a[0], y: a[1], vx: a[2], vy: a[3], r: a[4], damage: 0, life: a[5], maxLife: a[6], kind: 'acid' as const }))
  if (g.status !== s.status) g.setStatus(s.status)
  else if (summaryChanged) g.emitStatus()
}

/** Glides players and zombies toward their latest server positions, and tracks the local camera and aim. */
export function smoothReplica(g: Game, dt: number) {
  // enemy shots fly on between snapshots
  for (const sh of g.shots) {
    sh.x += sh.vx * dt
    sh.y += sh.vy * dt
  }
  const k = 1 - Math.exp(-dt * 20)
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
