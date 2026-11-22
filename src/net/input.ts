import { WEAPON_ORDER } from '@/game/config'
import { isShopItem } from '@/game/shop'
import type { PlayerInput } from '@/game/types'

/**
 * Checks what a player's controller sent before the room acts on it. Both kinds of room use it: the one
 * in a host's browser (roomCore.ts) and the Endless Descent server (server/coop.ts). Anything malformed
 * is dropped; nothing here can make a player move faster, shoot more or buy what they cannot pay for,
 * because the room works all of that out itself from these few intentions.
 */
export function validInput(m: Record<string, unknown>): PlayerInput | null {
  const keys = m.keys
  const ax = m.ax
  const ay = m.ay
  if (typeof keys !== 'number' || keys < 0 || keys > 15 || typeof ax !== 'number' || typeof ay !== 'number') return null
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || Math.abs(ax) > 20000 || Math.abs(ay) > 20000) return null
  const weapon = typeof m.weapon === 'string' && (WEAPON_ORDER as string[]).includes(m.weapon) ? (m.weapon as PlayerInput['weapon']) : undefined
  const buy = isShopItem(m.buy) ? m.buy : undefined
  return { keys: keys | 0, fire: m.fire === true, ax, ay, skill: m.skill === true, skill2: m.skill2 === true, weapon, heal: m.heal === true, armor: m.armor === true, buy }
}
