import { freeSpot, moveBody, normalize } from './collision'
import { CHAPTERS } from './chapters'
import { chaseDir } from './pathing'
import { ZOMBIES } from './config'
import type { Game } from './engine'
import type { Zombie, ZombieState } from './types'
import { createZombieAt } from './waves'
import { slowFactor } from './zombies'
import { activeMap } from './world'

const CHARGE_SPEED = 560
const CHARGE_TIME = 0.7
const CHARGE_WINDUP = 0.55
const SLAM_WINDUP = 0.5
export const SLAM_SIZE = 300
export const CHARGE_LENGTH = Math.round(CHARGE_SPEED * CHARGE_TIME)

function set(z: Zombie, state: ZombieState, dur = 0) {
  z.state = state
  z.stateTime = 0
  z.stateDur = dur
}

/**
 * Boss brain. Chases the player and cycles three tricks:
 * a telegraphed charge (crashing into a wall stuns it), a ground slam, and calling minions at 66% and 33% health.
 */
export function updateBoss(g: Game, z: Zombie, dt: number) {
  const def = ZOMBIES.boss
  const diff = g.diff
  const p = g.nearestPlayer(z.x, z.y)
  const tempo = diff.bossTempo
  z.stateTime += dt
  z.flash = Math.max(0, z.flash - dt)
  z.cooldown = Math.max(0, (z.cooldown ?? 1.5) - dt)
  const d = normalize(p.x - z.x, p.y - z.y)
  const dist = Math.hypot(p.x - z.x, p.y - z.y)

  const ratio = z.hp / z.maxHp
  const extra = g.playerCount - 1
  const due = diff.summonAt.filter((t) => ratio < t).length
  if ((z.summons ?? 0) < due) {
    z.summons = due
    g.text(z.x, z.y - 60, 'The horde answers its call!', '#FF8A93')
    g.sound('summon')
    g.kick(10)
    summonMinions(g, z, 5 + g.tier + Math.round(extra * 2))
  }

  // The last boss of the story has three phases.
  const finale = activeMap.index === CHAPTERS.length - 1 && g.wave >= activeMap.chapter.waves
  const phase = !finale ? 1 : ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3
  if (finale && (z.phase ?? 1) < phase) {
    z.phase = phase
    g.text(z.x, z.y - 70, `PHASE ${phase}`, '#FF4FD8')
    g.sound('summon')
    g.kick(14)
    g.addEffect('ring', z.x, z.y, 0, 260, 0.8, '#FF4FD8')
    summonMinions(g, z, 8 + extra * 3)
    z.cooldown = 0.6
  }
  const phaseSpeed = phase === 1 ? 1 : phase === 2 ? 1.15 : 1.3
  const phaseTempo = tempo * (phase === 1 ? 1 : phase === 2 ? 1.15 : 1.3)

  switch (z.state) {
    case 'stunned':
      if (z.stateTime >= z.stateDur) {
        set(z, 'chase')
        z.cooldown = 1.2 / phaseTempo
      }
      break
    case 'chase': {
      const speed = def.speed * (1 + Math.min(0.3, 0.02 * (g.level - 1))) * (ratio < diff.enrageAt ? 1.25 : 1) * phaseSpeed * (1 + (tempo - 1) * 0.5) * slowFactor(z)
      const path = chaseDir(z, p, dt)
      moveBody(z, path.x * speed * dt, path.y * speed * dt)
      if (z.cooldown <= 0 && dist < 500 && z.los) {
        z.ability = dist < 200 ? 'slam' : 'charge'
        z.aim = d
        set(z, 'windup', (z.ability === 'charge' ? CHARGE_WINDUP : SLAM_WINDUP) / phaseTempo)
        g.sound(z.ability === 'charge' ? 'charge' : 'zattack', z.x, z.y, 'boss')
      }
      break
    }
    case 'windup':
      // keep tracking the player for the first part of a charge, then lock the direction
      if (z.ability === 'charge' && z.stateTime < z.stateDur * 0.6) z.aim = d
      if (z.stateTime >= z.stateDur) {
        if (z.ability === 'charge') {
          set(z, 'strike', CHARGE_TIME)
        } else {
          g.addHitbox({ x: z.x - SLAM_SIZE / 2, y: z.y - SLAM_SIZE / 2, w: SLAM_SIZE, h: SLAM_SIZE }, 'zombie', def.damage * diff.damage, 0, 520, 0.12, z.id)
          g.addEffect('slam', z.x, z.y, 0, SLAM_SIZE * 0.6, 0.55)
          g.kick(12)
          g.sound('slam', z.x, z.y)
          g.burst(z.x, z.y, '#A39B8C', 18)
          set(z, 'strike', 0.2)
        }
      }
      break
    case 'strike':
      if (z.ability === 'charge') {
        const bx = z.x
        const by = z.y
        moveBody(z, z.aim.x * CHARGE_SPEED * dt, z.aim.y * CHARGE_SPEED * dt)
        g.burst(z.x - z.aim.x * 34, z.y - z.aim.y * 34, '#A39B8C', 1)
        if (Math.hypot(z.x - bx, z.y - by) < CHARGE_SPEED * dt * 0.4) {
          g.kick(14)
          g.sound('explosion', z.x, z.y)
          g.burst(z.x + z.aim.x * 36, z.y + z.aim.y * 36, '#C9CFD6', 14)
          g.text(z.x, z.y - 50, 'Crashed!', '#FFE16A')
          z.hp = Math.max(1, z.hp - z.maxHp * 0.03)
          set(z, 'stunned', 1.6 / (1 + (tempo - 1) * 0.6))
          break
        }
      }
      if (z.stateTime >= z.stateDur) set(z, 'recover')
      break
    case 'recover':
      if (z.stateTime >= def.recover / (1 + Math.min(0.4, 0.02 * (g.level - 1))) / phaseTempo) {
        set(z, 'chase')
        z.cooldown = Math.max(0.7 / phaseTempo, (1.8 - 0.04 * g.level) / phaseTempo)
      }
      break
  }
}

function summonMinions(g: Game, z: Zombie, count: number) {
  for (let i = 0; i < count; i++) {
    const s = freeSpot(z.x, z.y, 80, 150)
    g.zombies.push(createZombieAt(g.nextId++, i % 3 === 0 ? 'runner' : 'walker', g.level, s.x, s.y, 1, g.diff.hp))
  }
}
