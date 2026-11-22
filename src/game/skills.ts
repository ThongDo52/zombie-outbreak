import { CLASSES, SKILL } from './classes'
import { addFriendlyZone } from './combat'
import { BOOST, PLAYER, WEAPONS } from './config'
import type { Game } from './engine'
import { PETS, summonGolem, summonWolves } from './pets'
import type { PlayerSlot, Vec, Zombie } from './types'

/**
 * The class skills. Every class has two: the first on Shift or Space, the second on E or the right mouse
 * button. Returns true when the skill was cast, so its cooldown starts; a skill that had nothing to do
 * (a mark with no zombie in sight) returns false and stays ready.
 */

/** Skill damage keeps pace with the run: zombies get tougher every wave, and so do grenades, slams and traps. */
export function skillPower(g: Game, base: number): number {
  return base * (1 + SKILL.levelScale * Math.max(0, g.level - 1))
}

/** Where this player is pointing, in the world. Touch players point at the zombie they are auto-aiming at. */
export function aimPoint(g: Game, slot: PlayerSlot): Vec {
  const p = slot.player
  if (slot.aimWorld) return slot.aimWorld
  if (slot.autoAim) {
    let best: Zombie | undefined
    let bestD = 520
    for (const z of g.zombies) {
      const d = Math.hypot(z.x - p.x, z.y - p.y)
      if (z.hp > 0 && d < bestD) {
        bestD = d
        best = z
      }
    }
    return best ? { x: best.x, y: best.y } : { x: p.x + p.aim.x * 180, y: p.y + p.aim.y * 180 }
  }
  return { x: slot.camera.x + slot.aimScreen.x, y: slot.camera.y + slot.aimScreen.y }
}

/** A point toward the crosshair, no farther than `reach` from the player. */
function reachPoint(g: Game, slot: PlayerSlot, reach: number, min = 0): Vec {
  const p = slot.player
  const a = aimPoint(g, slot)
  const dx = a.x - p.x
  const dy = a.y - p.y
  const d = Math.hypot(dx, dy)
  if (d < 1) return { x: p.x + p.aim.x * Math.max(min, 40), y: p.y + p.aim.y * Math.max(min, 40) }
  const use = Math.max(min, Math.min(reach, d))
  return { x: p.x + (dx / d) * use, y: p.y + (dy / d) * use }
}

export function castSkill(g: Game, slot: PlayerSlot, which: 1 | 2, dir: Vec): boolean {
  return which === 1 ? castFirst(g, slot, dir) : castSecond(g, slot)
}

function castFirst(g: Game, slot: PlayerSlot, dir: Vec): boolean {
  const p = slot.player
  const cls = CLASSES[p.cls]
  const skill = cls.skills[0]
  switch (p.cls) {
    case 'agile':
      p.dashTime = PLAYER.dashDuration
      g.sound('dash', p.x, p.y)
      p.invuln = Math.max(p.invuln, PLAYER.dashInvuln)
      p.vx = dir.x !== 0 || dir.y !== 0 ? dir.x : p.aim.x
      p.vy = dir.x !== 0 || dir.y !== 0 ? dir.y : p.aim.y
      g.cosmetic({ t: 'spark', x: p.x, y: p.y, dx: -p.vx, dy: -p.vy, color: cls.color, n: 6 })
      return true
    case 'tank':
      p.skillT = skill.duration
      g.addEffect('ring', p.x, p.y, 0, SKILL.shield.taunt * 0.4, 0.6, cls.color)
      g.text(p.x, p.y - 34, 'Shield up!', cls.color, 1)
      g.sound('skill', p.x, p.y, 'tank')
      g.cosmetic({ t: 'light', x: p.x, y: p.y, r: 190, color: '91,155,255', life: 0.5 })
      g.kick(3, slot.id)
      return true
    case 'damage':
      p.skillT = skill.duration
      p.fireCooldown = 0
      g.addEffect('ring', p.x, p.y, 0, 90, 0.5, cls.color)
      g.burst(p.x, p.y, cls.color, 14)
      g.text(p.x, p.y - 34, 'OVERDRIVE', cls.color, 1)
      g.sound('skill', p.x, p.y, 'damage')
      g.cosmetic({ t: 'light', x: p.x, y: p.y, r: 180, color: '255,80,70', life: 0.5 })
      return true
    case 'support': {
      p.skillT = skill.duration
      const r = SKILL.pulse.range
      for (const s of g.slots) {
        const q = s.player
        if (q.down || Math.hypot(q.x - p.x, q.y - p.y) > r) continue
        const gain = s === slot ? q.maxHp * SKILL.pulse.self : SKILL.pulse.heal
        q.hp = Math.min(q.maxHp, q.hp + gain)
        q.slow = 0
        g.text(q.x, q.y - 28, `+${Math.round(gain)}`, '#6EE7A8', 1)
        g.burst(q.x, q.y, '#6EE7A8', 8)
      }
      for (const pet of g.pets) if (Math.hypot(pet.x - p.x, pet.y - p.y) <= r) pet.hp = Math.min(pet.maxHp, pet.hp + SKILL.pulse.heal)
      g.addEffect('ring', p.x, p.y, 0, r * 0.9, 0.7, cls.color)
      g.addEffect('ring', p.x, p.y, 0, r * 0.5, 0.5, '#6EE7A8')
      g.cosmetic({ t: 'light', x: p.x, y: p.y, r: r, color: '110,231,168', life: 0.6 })
      g.sound('skill', p.x, p.y, 'support')
      return true
    }
    case 'sniper':
      p.skillT = skill.duration
      p.fireCooldown = Math.min(p.fireCooldown, 0.12)
      g.addEffect('ring', p.x, p.y, 0, 70, 0.45, cls.color)
      g.text(p.x, p.y - 34, 'DEADEYE', cls.color, 1)
      g.sound('skill', p.x, p.y, 'sniper')
      return true
    case 'summoner':
      summonWolves(g, slot)
      return true
  }
}

function castSecond(g: Game, slot: PlayerSlot): boolean {
  const p = slot.player
  const cls = CLASSES[p.cls]
  const skill = cls.skills[1]
  switch (p.cls) {
    case 'tank': {
      const s = SKILL.slam
      g.addHitbox({ x: p.x - s.size / 2, y: p.y - s.size / 2, w: s.size, h: s.size }, 'player', skillPower(g, s.damage), s.stun, s.knockback, 0.12, undefined, slot.id, { ap: 1 })
      p.armor = Math.min(BOOST.armor, (p.armor ?? 0) + s.armor)
      g.addEffect('slam', p.x, p.y, 0, s.size * 0.6, 0.55, '#9CC4FF')
      g.cosmetic({ t: 'boom', x: p.x, y: p.y, size: s.size * 0.75, kind: 'stone' })
      g.text(p.x, p.y - 36, `SLAM  +${s.armor} armor`, cls.color, 1)
      g.sound('skill', p.x, p.y, 'slam')
      g.kick(9)
      return true
    }
    case 'damage': {
      const f = SKILL.frag
      const at = reachPoint(g, slot, f.reach, 70)
      const dx = at.x - p.x
      const dy = at.y - p.y
      const d = Math.hypot(dx, dy) || 1
      const life = Math.max(0.16, d / f.speed)
      const sx = p.x + (dx / d) * (p.w / 2 + 8)
      const sy = p.y + (dy / d) * (p.h / 2 + 8)
      g.bullets.push({
        x: sx, y: sy, px: sx, py: sy, vx: (dx / d) * f.speed, vy: (dy / d) * f.speed,
        damage: skillPower(g, f.damage), life, maxLife: life, pierce: 0, knockback: f.knockback, stun: f.stun,
        hitIds: new Set(), color: WEAPONS.launcher.color, weapon: 'launcher', blast: f.blast, owner: slot.id, ap: 1,
      })
      g.sound('skill', p.x, p.y, 'grenade')
      g.kick(2, slot.id)
      return true
    }
    case 'agile': {
      const t = SKILL.trap
      addFriendlyZone(g, p.x, p.y, t.size, skill.duration, { look: 'trap', dps: skillPower(g, t.dps), snare: true, owner: slot.id })
      p.skill2T = skill.duration
      g.addEffect('ring', p.x, p.y, 0, t.size * 0.6, 0.45, '#9FF4FF')
      g.cosmetic({ t: 'spark', x: p.x, y: p.y, dx: 0, dy: 0, color: '#BFF3FF', n: 14 })
      g.cosmetic({ t: 'light', x: p.x, y: p.y, r: 170, color: '120,220,255', life: 0.45 })
      g.text(p.x, p.y - 34, 'Shock trap', cls.color, 1)
      g.sound('skill', p.x, p.y, 'trap')
      return true
    }
    case 'support': {
      const s = SKILL.station
      addFriendlyZone(g, p.x, p.y, s.size, skill.duration, { look: 'heal', dps: 0, heal: s.heal, owner: slot.id })
      p.skill2T = skill.duration
      g.addEffect('ring', p.x, p.y, 0, s.size * 0.6, 0.6, '#6EE7A8')
      g.cosmetic({ t: 'light', x: p.x, y: p.y, r: 190, color: '110,231,168', life: 0.5 })
      g.text(p.x, p.y - 34, 'Med station', cls.color, 1)
      g.sound('skill', p.x, p.y, 'station')
      return true
    }
    case 'sniper': {
      const m = SKILL.mark
      const a = aimPoint(g, slot)
      let best: Zombie | undefined
      let bestD: number = m.pick
      // the zombie under the crosshair, or failing that the nearest one in sight
      for (const z of g.zombies) {
        if (z.hp <= 0) continue
        const d = Math.hypot(z.x - a.x, z.y - a.y) - z.w / 2 - (z.kind === 'boss' ? 60 : 0)
        if (d < bestD) {
          bestD = d
          best = z
        }
      }
      if (!best) {
        bestD = m.reach
        for (const z of g.zombies) {
          if (z.hp <= 0) continue
          const d = Math.hypot(z.x - p.x, z.y - p.y) - (z.kind === 'boss' ? 200 : 0)
          if (d < bestD) {
            bestD = d
            best = z
          }
        }
      }
      if (!best) {
        g.text(p.x, p.y - 30, 'Nothing to mark', '#8A97AD')
        return false
      }
      best.mark = best.kind === 'boss' ? m.bossTime : skill.duration
      best.markBy = slot.id
      best.cloak = false
      p.skill2T = best.mark
      g.addEffect('ring', best.x, best.y, 0, best.w * 1.8, 0.5, '#FF5A4A')
      g.text(best.x, best.y - best.h / 2 - 14, 'MARKED', '#FF8A6B', 1)
      g.sound('skill', best.x, best.y, 'mark')
      return true
    }
    case 'summoner': {
      const at = reachPoint(g, slot, 300, 50)
      summonGolem(g, slot, at.x, at.y)
      p.skill2T = PETS.golem.life
      return true
    }
  }
}
