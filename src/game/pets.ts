import { SKILL } from './classes'
import { aabb, bodyRect, freeSpot, moveBody, normalize } from './collision'
import { hurtZombie } from './combat'
import type { Game } from './engine'
import type { Pet, PetKind, PlayerSlot, Zombie } from './types'

/**
 * Summoned pets. A Summoner's spirit wolves run beside their owner and tear into whatever comes near;
 * the stone guardian stands where it was raised, draws the horde onto itself and slams the ground.
 * Zombies fight back: strikes, blasts, acid and plain contact all hurt a pet.
 */

export const PETS = {
  wolf: { size: 20, hp: 85, speed: 268, damage: 15, interval: 0.62, reach: 10, sight: 340, leash: 440, windup: 0.1, color: '#B9A8FF' },
  golem: { size: 42, hp: 400, speed: 96, damage: 28, interval: 1.7, reach: 86, sight: 300, leash: 0, windup: 0.42, color: '#9FB4C8', life: 16, taunt: 280, stun: 0.55, knockback: 320, taken: 0.7 },
  /** Wolves a Summoner can have out at once. */
  maxWolves: 2,
  /** Health pets gain per level of the run. Their damage grows like skill damage does. */
  levelHp: 0.03,
} as const

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

function scale(g: Game) {
  const lvl = Math.max(0, g.level - 1)
  return { hp: 1 + PETS.levelHp * lvl, damage: 1 + SKILL.levelScale * lvl }
}

function newPet(g: Game, kind: PetKind, owner: number, x: number, y: number, index: number): Pet {
  const def = PETS[kind]
  const hp = Math.round(def.hp * scale(g).hp)
  return {
    id: g.nextId++, kind, owner, x, y, w: def.size, h: def.size, hp, maxHp: hp, aim: { x: 1, y: 0 },
    state: 'follow', stateTime: 0, cooldown: 0.3, flash: 0, invuln: 0.6, thinkT: 0, stuck: 0, index,
    life: kind === 'golem' ? PETS.golem.life : undefined,
  }
}

export const petsOf = (g: Game, slotId: number, kind?: PetKind): Pet[] => g.pets.filter((p) => p.owner === slotId && (!kind || p.kind === kind))

function puff(g: Game, x: number, y: number, color: string, size = 60) {
  g.addEffect('ring', x, y, 0, size, 0.45, color)
  g.burst(x, y, color, 10)
}

/** Call the wolves: fallen ones return at their owner's side, living ones are healed to full. */
export function summonWolves(g: Game, slot: PlayerSlot): void {
  const p = slot.player
  const mine = petsOf(g, slot.id, 'wolf')
  for (const w of mine) {
    w.hp = w.maxHp
    puff(g, w.x, w.y, '#D6C8FF', 40)
  }
  for (let i = 0; i < PETS.maxWolves; i++) {
    if (mine.some((w) => w.index === i)) continue
    const at = freeSpot(p.x, p.y, 34, 70, PETS.wolf.size + 8)
    g.pets.push(newPet(g, 'wolf', slot.id, at.x, at.y, i))
    puff(g, at.x, at.y, PETS.wolf.color)
    g.cosmetic({ t: 'light', x: at.x, y: at.y, r: 120, color: '170,140,255', life: 0.4 })
  }
  g.addEffect('rune', p.x, p.y, 0, 64, 0.8, PETS.wolf.color)
  g.text(p.x, p.y - 34, 'Spirit wolves!', PETS.wolf.color, 1)
  g.sound('howl', p.x, p.y)
}

/** Raise the stone guardian near (x, y). An older one crumbles first. */
export function summonGolem(g: Game, slot: PlayerSlot, x: number, y: number): void {
  for (const old of petsOf(g, slot.id, 'golem')) crumble(g, old)
  const at = freeSpot(x, y, 0, 46, PETS.golem.size + 12)
  g.pets.push(newPet(g, 'golem', slot.id, at.x, at.y, 0))
  g.addEffect('rune', at.x, at.y, 0, 96, 1, '#C8B6FF')
  g.cosmetic({ t: 'boom', x: at.x, y: at.y, size: 120, kind: 'stone' })
  g.text(at.x, at.y - 40, 'Stone guardian', '#C8B6FF', 1)
  g.sound('skill', at.x, at.y, 'golem')
  g.kick(5)
}

function crumble(g: Game, pet: Pet) {
  pet.hp = 0
  if (pet.kind === 'golem') {
    g.cosmetic({ t: 'boom', x: pet.x, y: pet.y, size: 110, kind: 'stone' })
    g.sound('crumble', pet.x, pet.y)
    const owner = g.slotById(pet.owner)
    if (owner) owner.player.skill2T = 0
  } else {
    puff(g, pet.x, pet.y, PETS.wolf.color, 70)
    g.sound('howl', pet.x, pet.y, 'fall')
  }
}

/** A zombie's blow lands on a pet. */
export function hurtPet(g: Game, pet: Pet, damage: number, cx: number, cy: number) {
  if (pet.hp <= 0 || damage <= 0) return
  const taken = damage * (pet.kind === 'golem' ? PETS.golem.taken : 1)
  pet.hp -= taken
  pet.flash = 0.1
  g.cosmetic({ t: 'spray', x: pet.x, y: pet.y, dx: pet.x - cx, dy: pet.y - cy, color: pet.kind === 'golem' ? '#9AA8B8' : '#C9B8FF', n: 4 })
  if (pet.kind === 'wolf') {
    const k = normalize(pet.x - cx, pet.y - cy)
    moveBody(pet, k.x * 10, k.y * 10)
  }
  if (pet.hp <= 0) crumble(g, pet)
}

/** Zombies that touch a pet hurt it, a little less often than they would hurt a player. */
function petContact(g: Game, pet: Pet) {
  if (pet.invuln > 0) return
  const body = bodyRect(pet)
  for (const z of g.zombies) {
    if (z.hp <= 0 || z.state === 'stunned' || !aabb(body, bodyRect(z))) continue
    const contact = g.contactDamage(z)
    if (contact <= 0) continue
    hurtPet(g, pet, contact, z.x, z.y)
    pet.invuln = 0.5
    return
  }
}

/** The zombie a wolf should go for: close to it, inside its owner's reach, with a taste for marked prey and for whatever is on its owner. */
function pickWolfTarget(g: Game, pet: Pet, owner: PlayerSlot): Zombie | undefined {
  const def = PETS.wolf
  let best: Zombie | undefined
  let bestScore = Infinity
  for (const z of g.zombies) {
    if (z.hp <= 0) continue
    const toOwner = dist(z, owner.player)
    if (toOwner > def.leash) continue
    const d = dist(z, pet)
    if (d > def.sight && toOwner > 170) continue
    let score = d
    if (toOwner < 150) score -= 130
    if (z.mark && z.mark > 0) score -= 160
    if (z.kind === 'shielder') score -= 40 // they bite from wherever they are, so shields are theirs to break
    if (z.id === pet.targetId) score -= 40
    if (score < bestScore) {
      bestScore = score
      best = z
    }
  }
  return best
}

function setState(pet: Pet, state: Pet['state']) {
  pet.state = state
  pet.stateTime = 0
}

function updateWolf(g: Game, pet: Pet, owner: PlayerSlot, dt: number) {
  const def = PETS.wolf
  const op = owner.player
  const away = dist(pet, op)
  // too far behind (a wall in the way, or its owner dashed off): the spirit simply reappears at their side
  if (away > def.leash * 1.35 || pet.stuck > 1.2) {
    const at = freeSpot(op.x, op.y, 30, 70, def.size + 8)
    puff(g, pet.x, pet.y, def.color, 36)
    pet.x = at.x
    pet.y = at.y
    pet.stuck = 0
    pet.targetId = undefined
    pet.thinkT = 0.4
    setState(pet, 'follow')
    puff(g, pet.x, pet.y, def.color, 36)
    return
  }

  pet.thinkT -= dt
  let target = pet.targetId === undefined ? undefined : g.zombies.find((z) => z.id === pet.targetId && z.hp > 0)
  if (pet.thinkT <= 0) {
    pet.thinkT = 0.2
    target = pickWolfTarget(g, pet, owner)
    pet.targetId = target?.id
  }

  if (pet.state === 'windup') {
    if (pet.stateTime >= def.windup) {
      if (target && dist(target, pet) < (pet.w + target.w) / 2 + def.reach + 14) {
        const k = normalize(target.x - pet.x, target.y - pet.y)
        hurtZombie(g, target, def.damage * scale(g).damage, k.x, k.y, 90, 0.1, owner.id, { pet: true, melee: true })
        g.addEffect('claw', target.x, target.y, Math.atan2(k.y, k.x) + 0.6, 22, 0.28, '#D6C8FF')
        g.sound('petbite', pet.x, pet.y)
      }
      pet.cooldown = def.interval
      setState(pet, 'recover')
    }
    return
  }
  if (pet.state === 'recover') {
    if (pet.stateTime >= 0.12) setState(pet, target ? 'chase' : 'follow')
    return
  }

  if (target) {
    if (pet.state !== 'chase') setState(pet, 'chase')
    const d = dist(target, pet)
    const k = normalize(target.x - pet.x, target.y - pet.y)
    pet.aim = k
    const close = (pet.w + target.w) / 2 + def.reach
    if (d > close) {
      const bx = pet.x
      const by = pet.y
      moveBody(pet, k.x * def.speed * dt, k.y * def.speed * dt)
      // no headway means a wall is in the way
      pet.stuck = Math.hypot(pet.x - bx, pet.y - by) < def.speed * dt * 0.3 ? pet.stuck + dt : Math.max(0, pet.stuck - dt * 2)
    } else {
      pet.stuck = 0
      if (pet.cooldown <= 0) setState(pet, 'windup')
    }
    return
  }

  // nothing to hunt: trot at its owner's heel, one wolf on each side
  if (pet.state !== 'follow') setState(pet, 'follow')
  const back = Math.atan2(op.aim.y, op.aim.x) + Math.PI + (pet.index === 0 ? 0.75 : -0.75)
  const hx = op.x + Math.cos(back) * 48
  const hy = op.y + Math.sin(back) * 48
  const d = Math.hypot(hx - pet.x, hy - pet.y)
  if (d > 14) {
    const k = normalize(hx - pet.x, hy - pet.y)
    const sp = Math.min(def.speed * 1.15, 60 + d * 4)
    const bx = pet.x
    const by = pet.y
    moveBody(pet, k.x * sp * dt, k.y * sp * dt)
    pet.aim = k
    pet.stuck = d > 120 && Math.hypot(pet.x - bx, pet.y - by) < sp * dt * 0.3 ? pet.stuck + dt : Math.max(0, pet.stuck - dt * 2)
  } else {
    pet.aim = { ...op.aim }
    pet.stuck = 0
  }
}

function updateGolem(g: Game, pet: Pet, owner: PlayerSlot, dt: number) {
  const def = PETS.golem
  pet.life = (pet.life ?? def.life) - dt
  owner.player.skill2T = Math.max(0, pet.life)
  if (pet.life <= 0) {
    crumble(g, pet)
    return
  }
  let near: Zombie | undefined
  let nearD: number = def.sight
  for (const z of g.zombies) {
    if (z.hp <= 0) continue
    const d = dist(z, pet)
    if (d < nearD) {
      nearD = d
      near = z
    }
  }
  if (pet.state === 'windup') {
    if (pet.stateTime >= def.windup) {
      const s = def.reach * 2
      g.addHitbox({ x: pet.x - s / 2, y: pet.y - s / 2, w: s, h: s }, 'player', def.damage * scale(g).damage, def.stun, def.knockback, 0.12, undefined, owner.id, { pet: true, ap: 1 })
      g.addEffect('slam', pet.x, pet.y, 0, s * 0.62, 0.5, '#C8B6FF')
      g.cosmetic({ t: 'boom', x: pet.x, y: pet.y, size: s * 0.7, kind: 'stone' })
      g.sound('slam', pet.x, pet.y, 'golem')
      g.kick(4)
      pet.cooldown = def.interval
      setState(pet, 'recover')
    }
    return
  }
  if (pet.state === 'recover') {
    if (pet.stateTime >= 0.3) setState(pet, 'follow')
    return
  }
  if (!near) return
  const k = normalize(near.x - pet.x, near.y - pet.y)
  pet.aim = k
  if (nearD < def.reach * 0.8 + near.w / 2) {
    if (pet.cooldown <= 0) setState(pet, 'windup')
  } else {
    moveBody(pet, k.x * def.speed * dt, k.y * def.speed * dt)
  }
}

export function updatePets(g: Game, dt: number) {
  if (g.pets.length === 0) return
  for (const pet of g.pets) {
    const owner = g.slotById(pet.owner)
    if (!owner) {
      pet.hp = 0
      continue
    }
    pet.stateTime += dt
    pet.cooldown = Math.max(0, pet.cooldown - dt)
    pet.flash = Math.max(0, pet.flash - dt)
    pet.invuln = Math.max(0, pet.invuln - dt)
    if (pet.kind === 'wolf') updateWolf(g, pet, owner, dt)
    else updateGolem(g, pet, owner, dt)
    if (pet.hp > 0) petContact(g, pet)
  }
  if (g.pets.some((p) => p.hp <= 0)) g.pets = g.pets.filter((p) => p.hp > 0)
}

/** A med station mends pets standing in it. */
export function healPet(pet: Pet, amount: number) {
  if (pet.hp > 0) pet.hp = Math.min(pet.maxHp, pet.hp + amount)
}
