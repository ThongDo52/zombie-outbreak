import { clamp, freeSpot } from './collision'
import { DEFAULT_CLASS, SKILL, isClassId, type ClassId } from './classes'
import { CHAPTERS, LEVEL_OFFSETS } from './chapters'
import { resolveHitboxes, updateBullets, updateBurning, updateEnemyShots } from './combat'
import { DIFFICULTY, type Difficulty, type DifficultyDef, survivalDifficulty } from './difficulty'
import { VIEW_H, VIEW_W, WAVE, WEAPON_ORDER, WEAPONS, ZOMBIES } from './config'
import { collectPickups, seedPickups, tickPickups } from './pickups'
import { updateFlow } from './pathing'
import { buildFloor, DESCENT, floorBossMultiplier, floorDifficulty, floorLevel, floorMap, isBossFloor } from './descent'
import { PETS, updatePets } from './pets'
import { applyArmorBoost, applyHealBoost, checkContact, giveLoadout, newPlayer, updateHazards, updateSlot } from './players'
import { applyEvent, updateVisuals, smoothReplica } from './replica'
import { buyItem, grantCoins, isShopItem, shopEntries, SHOP, stipendFor } from './shop'
import { DEFAULT_SELECTION, type SkinSelection } from './skins'
import type {
  BoostCharges,
  BoostKind,
  Bullet,
  CoinFx,
  Control,
  Decal,
  Effect,
  FloatText,
  GameEvent,
  GameStatus,
  EnemyShot,
  GameSummary,
  Hitbox,
  HitSource,
  Light,
  Particle,
  Pet,
  Pickup,
  Player,
  PlayerInput,
  PlayerSlot,
  Rect,
  SavedRun,
  SoundEvent,
  SoundType,
  Target,
  Vec,
  WeaponId,
  Zombie,
  ZombieKind, Zone } from './types'
import { bossHealthMultiplier, buildWave, createZombie } from './waves'
import { activeMap, setChapter } from './world'
import { updateZombie } from './zombies'

export type GameMode = 'solo' | 'server' | 'replica'

function newSlot(id: number, name: string, spawn: Vec): PlayerSlot {
  return {
    id,
    name,
    player: newPlayer(spawn),
    cls: DEFAULT_CLASS,
    keys: new Set<Control>(),
    firing: false,
    autoAim: false,
    aimScreen: { x: VIEW_W / 2 + 120, y: VIEW_H / 2 },
    queuedSkill: false,
    queuedSkill2: false,
    skin: { ...DEFAULT_SELECTION },
    charges: { life: 0, heal: 0, armor: 0 },
    camera: { x: 0, y: 0 },
    connected: true,
    hazardTick: 0,
    unlocked: [],
  }
}

const MAX_PLAYERS = 5

/**
 * The whole game. Solo play, the co-op server and the co-op client all use this class:
 * solo and the server run the simulation, the client only shows what the server sends.
 */
export class Game {
  status: GameStatus = 'ready'
  readonly mode: GameMode
  slots: PlayerSlot[] = []
  /** The slot this screen belongs to. On the server there is no local player. */
  localId = 1
  difficulty: Difficulty = 'normal'
  zombies: Zombie[] = []
  bullets: Bullet[] = []
  /** Venom clouds on the ground. */
  zones: Zone[] = []
  shots: EnemyShot[] = []
  /** Creatures summoned by the players. */
  pets: Pet[] = []
  /** Zombies born in the middle of a tick (a Brood's mites, a Screamer's runners). They join the horde when the tick ends. */
  births: Zombie[] = []
  hitboxes: Hitbox[] = []
  pickups: Pickup[] = []
  particles: Particle[] = []
  decals: Decal[] = []
  effects: Effect[] = []
  texts: FloatText[] = []
  /** Visual only: brief lights (muzzle flashes, explosions, spells) and coins flying to the counter. */
  lights: Light[] = []
  coinFx: CoinFx[] = []
  /** Visual only: the coin counter bumps when a flying coin lands in it. */
  coinPulse = 0
  /** This screen has the shop open (B). Solo play is paused meanwhile; a co-op room keeps going. */
  shopOpen = false
  /** Server only: cosmetic events waiting to be sent to the clients. */
  events: GameEvent[] = []
  bossWave = false
  /** Seconds on the run clock. It runs while the run is live and resets with each chapter. */
  runTime = 0
  /** Survival mode: endless waves on one map. */
  survival = false
  chapterBanner = 0
  wave = 0
  score = 0
  kills = 0
  banner = 0
  shake = 0
  debug = false
  time = 0
  nextId = 1
  pickupTimer = 6
  spawnQueue: ZombieKind[] = []
  /** How long the last handful of a wave has been holding out. */
  lastStand = 0
  /**
   * The last few zombies of a wave stop hanging back after a while: Spitters, Mortars, Shamans and Screamers
   * close in and Lurkers stop circling, so a wave never drags on while one of them sulks behind a wall.
   */
  get hunt(): boolean {
    return this.lastStand > 12
  }
  spawnTimer = 0
  intermission = 0
  /** Endless Descent: floors instead of chapters and waves. */
  descent = false
  floor = 0
  floorsCleared = 0
  floorDone = false
  /** Client only: projected prize text for the HUD, filled in from the contract. */
  prizeHint = ''

  onStatus?: (status: GameStatus, summary: GameSummary) => void
  /** The audio layer listens here. The game itself never touches the sound system. */
  onSound?: (e: SoundEvent) => void
  /** Called when a boost charge is spent, so the shop can count it. */
  onBoostUsed?: (kind: BoostKind, slotId: number) => void

  /** Co-op client: one-shot actions waiting to be sent to the server. */
  actions: { skill: boolean; skill2: boolean; heal: boolean; armor: boolean; weapon?: WeaponId; buy?: string } = { skill: false, skill2: false, heal: false, armor: false }

  private dummy: PlayerSlot = newSlot(0, 'You', CHAPTERS[0].spawn)

  constructor(mode: GameMode = 'solo') {
    this.mode = mode
    if (mode === 'solo') this.slots = [newSlot(1, 'You', CHAPTERS[0].spawn)]
  }

  // ---------- Players ----------

  /** The player this screen belongs to. */
  get local(): PlayerSlot {
    return this.slots.find((s) => s.id === this.localId) ?? this.slots[0] ?? this.dummy
  }
  get player(): Player {
    return this.local.player
  }
  set player(p: Player) {
    this.local.player = p
  }
  get skin(): SkinSelection {
    return this.local.skin
  }
  set skin(s: SkinSelection) {
    this.local.skin = s
  }
  get charges(): BoostCharges {
    return this.local.charges
  }
  set charges(c: BoostCharges) {
    this.local.charges = c
  }
  get camera(): Vec {
    return this.local.camera
  }
  get firing(): boolean {
    return this.local.firing
  }
  set firing(v: boolean) {
    this.local.firing = v
  }
  get autoAim(): boolean {
    return this.local.autoAim
  }
  set autoAim(v: boolean) {
    this.local.autoAim = v
  }
  get aimScreen(): Vec {
    return this.local.aimScreen
  }
  set aimScreen(v: Vec) {
    this.local.aimScreen = v
  }

  get diff(): DifficultyDef {
    if (this.descent) return floorDifficulty(Math.max(1, this.floor))
    if (this.survival) return survivalDifficulty(DIFFICULTY[this.difficulty], this.wave)
    return DIFFICULTY[this.difficulty]
  }
  get chapterIndex(): number {
    return activeMap.index
  }
  /** How far along the story this map counts: trials borrow the strength of the chapter that unlocks them. */
  get tier(): number {
    const t = activeMap.chapter.trial
    return t ? t.requires + 1 : activeMap.index
  }
  /** Difficulty step that keeps rising across chapters. */
  get level(): number {
    if (this.descent) return floorLevel(Math.max(1, this.floor))
    return LEVEL_OFFSETS[this.tier] + (this.survival ? Math.min(this.wave, 40) : this.wave)
  }
  get playerCount(): number {
    return Math.max(1, this.slots.length)
  }

  slotById(id?: number): PlayerSlot | undefined {
    return id === undefined ? undefined : this.slots.find((s) => s.id === id)
  }

  alivePlayers(): Player[] {
    return this.slots.filter((s) => !s.player.down).map((s) => s.player)
  }

  /** The closest player who is still up. Zombies hunt this one. */
  nearestPlayer(x: number, y: number): Player {
    let best: Player | undefined
    let bestD = Infinity
    for (const s of this.slots) {
      if (s.player.down) continue
      let d = (s.player.x - x) ** 2 + (s.player.y - y) ** 2
      // a raised Bulwark shield pulls every zombie nearby onto the tank
      if (s.player.cls === 'tank' && s.player.skillT > 0 && d < SKILL.shield.taunt ** 2) d *= 0.1
      if (d < bestD) {
        bestD = d
        best = s.player
      }
    }
    return best ?? this.player
  }

  /**
   * What a zombie at (x, y) goes for: the closest player, or a Summoner's pet that is in its way.
   * A stone guardian pulls in everything around it; wolves only draw the zombies they are right next to.
   */
  nearestTarget(x: number, y: number): Target {
    const lead = this.nearestPlayer(x, y)
    if (this.pets.length === 0) return lead
    let best: Target = lead
    let bestD = (lead.x - x) ** 2 + (lead.y - y) ** 2
    if (lead.cls === 'tank' && lead.skillT > 0 && bestD < SKILL.shield.taunt ** 2) bestD *= 0.1
    if (lead.down) bestD = Infinity
    for (const pet of this.pets) {
      if (pet.hp <= 0) continue
      let d = (pet.x - x) ** 2 + (pet.y - y) ** 2
      if (pet.kind === 'golem') {
        if (d < PETS.golem.taunt ** 2) d *= 0.08
      } else d *= 1.6
      if (d < bestD) {
        bestD = d
        best = pet
      }
    }
    return best
  }

  /** Damage this zombie does by touch right now. A Leaper in the air touches nothing until it lands. */
  contactDamage(z: Zombie): number {
    if (z.kind === 'leaper' && z.state === 'strike') return 0
    return ZOMBIES[z.kind].contact * this.diff.damage
  }

  addSlot(name: string, id?: number): PlayerSlot | undefined {
    if (this.slots.length >= MAX_PLAYERS) return undefined
    const slotId = id ?? Math.max(0, ...this.slots.map((s) => s.id)) + 1
    const slot = newSlot(slotId, name, this.spawnFor(this.slots.length))
    this.slots.push(slot)
    return slot
  }

  removeSlot(id: number) {
    this.slots = this.slots.filter((s) => s.id !== id)
    this.pets = this.pets.filter((p) => p.owner !== id)
  }

  private spawnFor(index: number): Vec {
    const s = activeMap.chapter.spawn
    return index === 0 ? { ...s } : freeSpot(s.x, s.y, 36, 90, 30)
  }

  // ---------- Run control ----------

  /** Begin a fresh run at the given chapter. */
  start(chapter = 0, difficulty: Difficulty = this.difficulty, survival = false) {
    this.descent = false
    this.survival = survival
    this.floor = 0
    this.floorsCleared = 0
    setChapter(chapter)
    this.difficulty = difficulty
    this.slots.forEach((slot, i) => {
      slot.player = newPlayer(this.spawnFor(i), slot.cls)
      // starting at a later chapter comes with the coins the earlier ones would have paid
      giveLoadout(slot.player, stipendFor(activeMap.index), slot.unlocked)
      this.grantTestGuns(slot.player)
      this.resetInput(slot)
    })
    this.score = 0
    this.kills = 0
    this.enterChapter()
  }

  private resetInput(slot: PlayerSlot) {
    slot.keys.clear()
    slot.firing = false
    slot.queuedSkill = false
    slot.queuedSkill2 = false
  }

  /** Survival: one map, endless waves that keep getting harder, until the whole squad is down. */
  startSurvival(chapter = 0, difficulty: Difficulty = this.difficulty) {
    this.start(chapter, difficulty, true)
  }

  /** Begin an armory trial: a boss arena that earns a heavy weapon. */
  startTrial(trial: number) {
    this.descent = false
    this.survival = false
    this.floor = 0
    this.floorsCleared = 0
    setChapter(CHAPTERS.length + Math.max(0, Math.min(2, trial)))
    this.difficulty = 'normal'
    const t = activeMap.chapter.trial
    this.slots.forEach((slot, i) => {
      slot.player = newPlayer(this.spawnFor(i), slot.cls)
      giveLoadout(slot.player, stipendFor((t?.requires ?? 0) + 1), slot.unlocked.filter((w) => w !== t?.weapon))
      this.grantTestGuns(slot.player)
      this.resetInput(slot)
    })
    this.score = 0
    this.kills = 0
    this.enterChapter()
  }

  /** Begin an Endless Descent run with the whole squad. */
  startDescent() {
    this.descent = true
    this.survival = false
    this.floor = 0
    this.floorsCleared = 0
    this.floorDone = false
    this.difficulty = 'normal'
    setChapter(floorMap(1))
    this.slots.forEach((slot, i) => {
      slot.player = newPlayer(this.spawnFor(i), slot.cls)
      // everyone enters equal: the same purse, no heavy weapons from outside
      giveLoadout(slot.player, SHOP.descentStipend)
      this.resetInput(slot)
    })
    this.score = 0
    this.kills = 0
    this.enterChapter()
    this.chapterBanner = 0
    this.intermission = 2.5
  }

  /** Move on after a chapter is cleared. Guns, ammo and score carry over. */
  nextChapter() {
    if (this.status !== 'cleared' || activeMap.chapter.trial) return
    setChapter(activeMap.index + 1)
    this.slots.forEach((slot, i) => {
      const p = slot.player
      const at = this.spawnFor(i)
      p.x = at.x
      p.y = at.y
      p.hp = p.maxHp
      p.down = false
      p.revive = 0
      p.vx = 0
      p.vy = 0
      p.dashTime = 0
      p.state = 'idle'
      p.invuln = 2
    })
    this.enterChapter()
  }

  toMenu() {
    for (const s of this.slots) s.firing = false
    this.setStatus('ready')
  }

  private enterChapter() {
    this.zombies = []
    this.births = []
    this.bullets = []
    this.zones = []
    this.shots = []
    this.pets = []
    this.hitboxes = []
    this.pickups = []
    this.particles = []
    this.decals = []
    this.effects = []
    this.texts = []
    this.lights = []
    this.coinFx = []
    this.shopOpen = false
    for (const s of this.slots) {
      s.player.skillT = 0
      s.player.skill2T = 0
    }
    this.spawnQueue = []
    this.wave = 0
    this.runTime = 0
    this.banner = 0
    this.bossWave = false
    this.chapterBanner = 3.4
    // a moment to visit the shop before the first wave, a little longer when there are coins to spend
    this.intermission = this.slots.some((s) => s.player.coins >= 140) ? 4.5 : 2.5
    this.pickupTimer = 6 * this.diff.pickupInterval
    for (const s of this.slots) s.firing = false
    this.centerCamera()
    seedPickups(this)
    this.setStatus('playing')
  }

  private centerCamera() {
    const slot = this.local
    slot.camera = {
      x: clamp(slot.player.x - VIEW_W / 2, 0, activeMap.w - VIEW_W),
      y: clamp(slot.player.y - VIEW_H / 2, 0, activeMap.h - VIEW_H),
    }
  }

  // ---------- Input API (acts on the local player unless an id is given) ----------

  setKey(control: Control, down: boolean, id = this.localId) {
    const slot = this.slotById(id)
    if (!slot) return
    if (down) slot.keys.add(control)
    else slot.keys.delete(control)
  }

  clearKeys(id = this.localId) {
    const slot = this.slotById(id)
    if (!slot) return
    slot.keys.clear()
    slot.firing = false
  }

  /** Choose the class the next run starts with. */
  setClass(cls: ClassId, id = this.localId) {
    const slot = this.slotById(id)
    if (slot && isClassId(cls)) slot.cls = cls
  }

  /** Use a class skill: 1 is the one on Shift or Space, 2 the one on E or the right mouse button. */
  queueSkill(id = this.localId, which: 1 | 2 = 1) {
    if (this.mode === 'replica') {
      if (this.status !== 'playing') return
      if (which === 2) this.actions.skill2 = true
      else this.actions.skill = true
      return
    }
    const slot = this.slotById(id)
    if (!slot || this.status !== 'playing') return
    if (which === 2) slot.queuedSkill2 = true
    else slot.queuedSkill = true
  }

  /** Buy a line of the shop (`gun:<weapon>`, `ammo` or `medkit`). Returns false when it cannot be bought. */
  buy(item: string, id = this.localId): boolean {
    const slot = this.slotById(id)
    if (!slot || this.status !== 'playing' || !isShopItem(item)) return false
    if (this.mode === 'replica') {
      // the room does the buying; this only checks that it is worth asking
      const entry = shopEntries(slot.player).find((e) => e.id === item)
      if (!entry || entry.blocked || slot.player.down) return false
      this.actions.buy = item
      return true
    }
    return buyItem(this, slot, item)
  }

  /** Open or close the shop on this screen. */
  setShop(open: boolean) {
    this.shopOpen = open && this.status === 'playing' && !this.player.down
    if (this.shopOpen) this.local.firing = false
  }

  equip(weapon: WeaponId, id = this.localId) {
    const slot = this.slotById(id)
    if (!slot || this.status !== 'playing' || slot.player.down || !slot.player.owned[weapon]) return
    slot.player.weapon = weapon
    if (this.mode === 'replica') this.actions.weapon = weapon
  }

  /** Owner test mode (solo only): every gun, with plenty of ammo, at the start of each run. */
  testAllGuns = false
  setTestAllGuns(on: boolean) {
    this.testAllGuns = on
  }
  private grantTestGuns(p: Player) {
    if (!this.testAllGuns || this.mode !== 'solo') return
    for (const w of WEAPON_ORDER) {
      if (w === 'fists') continue
      p.owned[w] = true
      p.ammo[w] = WEAPONS[w].infinite ? 0 : WEAPONS[w].ammoPickup * 3
    }
  }

  /** Heavy weapons the local player has earned in armory trials. */
  setUnlocked(list: WeaponId[]) {
    this.local.unlocked = [...list]
  }

  /** Hotkey 1, 2, 3...: the n-th weapon you hold (counting from zero). */
  equipSlot(n: number, id = this.localId) {
    const slot = this.slotById(id)
    if (!slot) return
    const owned = WEAPON_ORDER.filter((w) => slot.player.owned[w])
    const w = owned[n]
    if (w) this.equip(w, id)
  }

  cycleWeapon(id = this.localId) {
    const slot = this.slotById(id)
    if (!slot) return
    const p = slot.player
    const owned = WEAPON_ORDER.filter((w) => p.owned[w])
    const next = owned[(owned.indexOf(p.weapon) + 1) % owned.length]
    if (next) this.equip(next, id)
  }

  useHeal(id = this.localId) {
    if (this.mode === 'replica') {
      this.actions.heal = true
      return
    }
    const slot = this.slotById(id)
    if (slot) applyHealBoost(this, slot)
  }

  useArmor(id = this.localId) {
    if (this.mode === 'replica') {
      this.actions.armor = true
      return
    }
    const slot = this.slotById(id)
    if (slot) applyArmorBoost(this, slot)
  }

  /** What a remote player's controller sent this tick (server side). */
  applyInput(id: number, input: PlayerInput) {
    const slot = this.slotById(id)
    if (!slot) return
    slot.keys.clear()
    if (input.keys & 1) slot.keys.add('up')
    if (input.keys & 2) slot.keys.add('down')
    if (input.keys & 4) slot.keys.add('left')
    if (input.keys & 8) slot.keys.add('right')
    slot.firing = input.fire && !slot.player.down
    if (Number.isFinite(input.ax) && Number.isFinite(input.ay)) slot.aimWorld = { x: input.ax, y: input.ay }
    if (input.skill) this.queueSkill(id, 1)
    if (input.skill2) this.queueSkill(id, 2)
    if (input.buy) this.buy(input.buy, id)
    if (input.weapon) this.equip(input.weapon, id)
    if (input.heal) this.useHeal(id)
    if (input.armor) this.useArmor(id)
  }

  // ---------- Cosmetics: sounds, floating text, particles ----------

  /** Solo play shows cosmetic events straight away; the server records them for its clients. */
  cosmetic(ev: GameEvent) {
    if (this.mode === 'server') this.events.push(ev)
    else applyEvent(this, ev)
  }

  sound(type: SoundType, x?: number, y?: number, kind?: string) {
    this.cosmetic({ t: 'snd', type, x, y, kind })
  }

  /** Floating text. `big` 1 is a heavy hit or an announcement, 2 a headline. With `slot`, only that player sees it. */
  text(x: number, y: number, text: string, color: string, big?: 1 | 2, slot?: number) {
    this.cosmetic({ t: 'text', x, y, text, color, big, slot })
  }

  /** Screen shake; with a slot id it only shakes that player's screen. */
  kick(v: number, slot?: number) {
    this.cosmetic({ t: 'shake', v, slot })
  }

  addEffect(kind: Effect['kind'], x: number, y: number, angle: number, size: number, life: number, color?: string) {
    this.cosmetic({ t: 'fx', kind, x, y, angle, size, life, color })
  }

  burst(x: number, y: number, color: string, n: number) {
    this.cosmetic({ t: 'burst', x, y, color, n })
  }

  addHitbox(rect: Rect, owner: Hitbox['owner'], damage: number, stun: number, knockback: number, life: number, sourceId?: number, ownerId?: number, src?: HitSource) {
    this.hitboxes.push({ rect, owner, damage, stun, knockback, life, maxLife: life, hitIds: new Set(), sourceId, ownerId: owner === 'player' ? (ownerId ?? this.localId) : undefined, src })
  }

  // ---------- Status ----------

  setStatus(status: GameStatus) {
    this.status = status
    this.emitStatus()
  }

  emitStatus() {
    this.onStatus?.(this.status, { score: this.score, wave: this.wave, kills: this.kills, chapter: activeMap.index, difficulty: this.difficulty, floors: this.floorsCleared, time: this.runTime, survival: this.survival, unlocked: this.status === 'cleared' ? activeMap.chapter.trial?.weapon : undefined })
  }

  // ---------- Loop ----------

  update(rawDt: number) {
    // a frame time that is zero, negative or not a number (the first frame after a restart) must never run the game backwards
    const step = rawDt > 0 && Number.isFinite(rawDt) ? rawDt : 0
    this.time += Math.min(step, 0.25)
    const dt = Math.min(step, 0.05)
    if (this.mode !== 'server') updateVisuals(this, dt)
    if (this.mode === 'replica') {
      smoothReplica(this, dt)
      return
    }
    if (this.status !== 'playing') {
      this.shopOpen = false
      return
    }
    if (this.player.down) this.shopOpen = false
    // shopping alone stops the clock; a co-op room cannot wait for one player
    if (this.shopOpen && this.mode === 'solo' && this.slots.length === 1) return
    this.runTime += dt
    if (this.banner > 0) this.banner -= dt
    if (this.chapterBanner > 0) this.chapterBanner -= dt

    for (const slot of this.slots) {
      if (!slot.connected) {
        slot.player.invuln = Math.max(slot.player.invuln, 0.3)
        slot.keys.clear()
        slot.firing = false
      }
      updateSlot(this, slot, dt)
      updateHazards(this, slot, dt)
    }
    if (this.status !== 'playing') return
    this.updateWaves(dt)
    tickPickups(this, dt)
    for (const slot of this.slots) collectPickups(this, slot)
    updateFlow(this.alivePlayers(), dt)
    const few = this.spawnQueue.length === 0 && this.zombies.length > 0 && this.zombies.length <= 4 && !this.zombies.some((z) => z.kind === 'boss')
    this.lastStand = few ? this.lastStand + dt : 0
    updateBurning(this, dt)
    updatePets(this, dt)
    for (const z of this.zombies) updateZombie(this, z, dt)
    for (const slot of this.slots) checkContact(this, slot)
    updateBullets(this, dt)
    updateEnemyShots(this, dt)
    resolveHitboxes(this, dt)
    if (this.births.length > 0) {
      this.zombies.push(...this.births)
      this.births = []
    }
    if (this.mode === 'solo') this.updateCamera(dt)
  }

  /** Eases the local camera toward the player (or the nearest teammate while you are down). */
  updateCamera(dt: number) {
    const slot = this.local
    const p = slot.player
    let target: Vec = p
    if (p.down) target = this.nearestPlayer(p.x, p.y)
    const tx = clamp(target.x - VIEW_W / 2, 0, activeMap.w - VIEW_W)
    const ty = clamp(target.y - VIEW_H / 2, 0, activeMap.h - VIEW_H)
    const k = Math.min(1, dt * 10)
    slot.camera.x += (tx - slot.camera.x) * k
    slot.camera.y += (ty - slot.camera.y) * k
  }

  // ---------- Waves ----------

  private updateWaves(dt: number) {
    const n = this.playerCount
    if (this.descent) {
      this.updateFloors(dt)
      return
    }
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt
      const cap = Math.round(WAVE.maxAlive * (1 + 0.25 * (n - 1)))
      if (this.spawnTimer <= 0 && this.zombies.length < cap) {
        const kind = this.spawnQueue.pop()
        if (kind) {
          const anchor = this.pickAnchor()
          const bossMult =
            bossHealthMultiplier(this.tier, !this.survival && this.wave >= activeMap.chapter.waves) * (this.survival ? 1 + 0.12 * Math.floor(this.wave / 5) : 1) * this.diff.bossHp * (1 + WAVE.bossPerExtraPlayer * (n - 1)) * (activeMap.chapter.trial?.bossMult ?? 1)
          this.zombies.push(createZombie(this.nextId++, kind, this.level, anchor, bossMult, this.diff.hp))
          if (kind === 'boss') this.sound('boss')
        }
        this.spawnTimer = WAVE.spawnInterval * this.diff.spawn
      }
      return
    }
    if (this.zombies.length > 0) return
    if (!this.survival && this.wave >= activeMap.chapter.waves) {
      this.completeChapter()
      return
    }
    if (this.intermission <= 0) {
      this.intermission = WAVE.intermission
      if (this.wave > 0) {
        // a cleared wave pays everyone, so the shop has something new between waves
        const bonus = SHOP.waveBonus + SHOP.wavePerWave * Math.min(this.wave, 25)
        grantCoins(this, bonus, undefined, undefined, false)
        for (const s of this.slots) {
          const p = s.player
          if (p.down) continue
          this.text(p.x, p.y - 40, `Wave cleared  +${bonus} coins`, '#FFD25A', 1, s.id)
          if (this.diff.healBetween > 0) {
            p.hp = Math.min(p.maxHp, p.hp + this.diff.healBetween)
            this.text(p.x, p.y - 24, `+${this.diff.healBetween} HP`, '#6EE7A8')
          }
        }
        this.sound('coin')
      }
      return
    }
    this.intermission -= dt
    if (this.intermission <= 0) {
      this.wave += 1
      this.banner = 1.8
      this.bossWave = this.survival ? this.wave % 5 === 0 : activeMap.chapter.bossWaves.includes(this.wave)
      if (this.bossWave) this.banner = 2.6
      this.sound('wave')
      this.spawnQueue = buildWave(activeMap.chapter, this.tier, this.wave, this.diff.count * (1 + WAVE.perExtraPlayer * (n - 1)), this.survival)
      this.spawnTimer = 0
      this.emitStatus()
    }
  }

  /** Endless Descent: clear a floor, catch your breath, take the stairs down to the next map. */
  private updateFloors(dt: number) {
    const n = this.playerCount
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt
      const cap = Math.round(WAVE.maxAlive * (1 + 0.25 * (n - 1)))
      if (this.spawnTimer <= 0 && this.zombies.length < cap) {
        const kind = this.spawnQueue.pop()
        if (kind) {
          const bossMult = floorBossMultiplier(this.floor) * this.diff.bossHp * (1 + WAVE.bossPerExtraPlayer * (n - 1))
          this.zombies.push(createZombie(this.nextId++, kind, this.level, this.pickAnchor(), bossMult, this.diff.hp))
          if (kind === 'boss') this.sound('boss')
        }
        this.spawnTimer = WAVE.spawnInterval * this.diff.spawn
      }
      return
    }
    if (this.zombies.length > 0) return
    if (this.floor > 0 && !this.floorDone) {
      // floor cleared: heal the living, bring the fallen back
      this.floorDone = true
      this.floorsCleared += 1
      this.intermission = DESCENT.intermission
      this.score += 100 * this.floor
      grantCoins(this, 60 + 15 * Math.min(this.floor, 30), undefined, undefined, false)
      this.sound('cleared')
      for (const s of this.slots) {
        const p = s.player
        if (p.down) {
          p.down = false
          p.revive = 0
          p.hp = p.maxHp * DESCENT.reviveHp
          p.state = 'idle'
          p.invuln = 2
          this.addEffect('ring', p.x, p.y, 0, 90, 0.7, '#6EE7A8')
          this.text(p.x, p.y - 30, 'Back on your feet!', '#6EE7A8')
        } else {
          p.hp = Math.min(p.maxHp, p.hp + p.maxHp * DESCENT.healOnClear)
          this.text(p.x, p.y - 24, 'Floor cleared', '#6EE7A8')
        }
      }
      this.emitStatus()
      return
    }
    this.intermission -= dt
    if (this.intermission <= 0) this.beginFloor()
  }

  private beginFloor() {
    this.floor += 1
    this.floorDone = false
    this.wave = this.floor
    const map = floorMap(this.floor)
    if (map !== activeMap.index || this.floor === 1) {
      setChapter(map)
      this.zombies = []
      this.births = []
      this.bullets = []
      this.zones = []
      this.shots = []
      this.pets = []
      this.hitboxes = []
      this.decals = []
      this.effects = []
      this.pickups = []
      this.slots.forEach((slot, i) => {
        const p = slot.player
        const at = this.spawnFor(i)
        p.x = at.x
        p.y = at.y
        p.vx = 0
        p.vy = 0
        p.dashTime = 0
        p.invuln = 2
      })
      this.centerCamera()
      seedPickups(this)
    }
    this.difficulty = this.floor <= 5 ? 'normal' : this.floor <= 12 ? 'hard' : 'extreme'
    this.bossWave = isBossFloor(this.floor)
    this.banner = this.bossWave ? 2.8 : 2
    this.sound('wave')
    const n = this.playerCount
    this.spawnQueue = buildFloor(this.floor, this.diff.count * (1 + WAVE.perExtraPlayer * (n - 1)))
    this.spawnTimer = 0
    this.emitStatus()
  }

  /** A random living player, so zombies spawn around whoever is fighting. */
  private pickAnchor(): Vec {
    const alive = this.alivePlayers()
    return alive[Math.floor(Math.random() * alive.length)] ?? this.player
  }

  private completeChapter() {
    const trial = activeMap.chapter.trial
    if (trial) {
      // armory trial: the boss is down, the heavy weapon is yours from now on
      this.score += 800
      for (const s of this.slots) {
        s.firing = false
        if (!s.unlocked.includes(trial.weapon)) s.unlocked.push(trial.weapon)
        s.player.owned[trial.weapon] = true
        s.player.ammo[trial.weapon] = Math.max(s.player.ammo[trial.weapon], WEAPONS[trial.weapon].ammoPickup)
      }
      this.bullets = []
      this.hitboxes = []
      this.zones = []
    this.shots = []
      this.sound('cleared')
      this.setStatus('cleared')
      return
    }
    this.score += 500 * (activeMap.index + 1)
    grantCoins(this, SHOP.chapterBonus, undefined, undefined, false)
    this.bullets = []
    this.zones = []
    this.shots = []
    this.hitboxes = []
    for (const s of this.slots) s.firing = false
    const last = activeMap.index >= CHAPTERS.length - 1
    this.sound(last ? 'won' : 'cleared')
    this.setStatus(last ? 'won' : 'cleared')
  }

  // ---------- Save / resume (solo) ----------

  serialize(): SavedRun | null {
    if (this.status !== 'playing' || this.mode !== 'solo' || this.descent) return null
    return {
      v: 3,
      difficulty: this.difficulty,
      chapterIndex: activeMap.index,
      savedAt: Date.now(),
      player: this.player,
      zombies: this.zombies,
      pickups: this.pickups,
      decals: this.decals.slice(-80),
      wave: this.wave,
      score: this.score,
      kills: this.kills,
      spawnQueue: this.spawnQueue,
      spawnTimer: this.spawnTimer,
      intermission: this.intermission,
      pickupTimer: this.pickupTimer,
      nextId: this.nextId,
      runTime: this.runTime,
      survival: this.survival || undefined,
    }
  }

  /** Continue a saved run. The player gets a short grace period. */
  restore(s: SavedRun) {
    setChapter(s.chapterIndex)
    this.survival = Boolean(s.survival)
    this.runTime = s.runTime ?? 0
    this.difficulty = s.difficulty ?? 'normal'
    const savedClass = s.player.cls ?? DEFAULT_CLASS
    const base = newPlayer(s.player, savedClass)
    this.local.cls = savedClass
    this.player = {
      ...base,
      ...s.player,
      owned: { ...base.owned, ...s.player.owned },
      ammo: { ...base.ammo, ...s.player.ammo },
      gunLv: { ...base.gunLv, ...s.player.gunLv },
      // a run saved before the shop existed gets the purse its chapter would have started with
      coins: s.player.coins ?? stipendFor(s.chapterIndex),
      skill2Cd: 0,
      skill2T: 0,
      invuln: 2,
      vx: 0,
      vy: 0,
      dashTime: 0,
      cls: savedClass,
      skillCd: 0,
      skillT: 0,
      down: false,
      revive: 0,
      state: 'idle',
      stateTime: 0,
    }
    this.zombies = s.zombies
    this.births = []
    this.pickups = s.pickups
    this.decals = s.decals
    this.effects = []
    this.bullets = []
    this.zones = []
    this.shots = []
    this.pets = []
    this.hitboxes = []
    this.particles = []
    this.texts = []
    this.lights = []
    this.coinFx = []
    this.shopOpen = false
    this.wave = s.wave
    this.score = s.score
    this.kills = s.kills
    this.spawnQueue = s.spawnQueue
    this.spawnTimer = s.spawnTimer
    this.intermission = s.intermission
    this.pickupTimer = s.pickupTimer
    this.nextId = s.nextId
    this.banner = 0
    this.local.queuedSkill = false
    this.local.queuedSkill2 = false
    this.local.firing = false
    this.chapterBanner = 0
    this.centerCamera()
    this.setStatus('playing')
  }
}

