import type { BoostKind } from './types'

export interface BoostDef {
  id: number
  kind: BoostKind
  name: string
  blurb: string
  /** Launch price in USDC. The shop shows the live price read from the contract. */
  price: number
  how: string
}

/** Ids match the ArenaBoosts contract. */
export const BOOSTS: readonly BoostDef[] = [
  { id: 1, kind: 'life', name: 'Extra Life', blurb: 'When your health hits zero you come back with half health, a few seconds of safety and a shockwave that stuns everything nearby.', price: 1, how: 'Triggers by itself' },
  { id: 2, kind: 'heal', name: 'Full Heal', blurb: 'Instantly restores your health to full in the middle of a fight.', price: 0.5, how: 'Press F' },
  { id: 3, kind: 'armor', name: 'Armor', blurb: 'A 60 point shield that soaks damage before your health. It breaks when used up.', price: 0.75, how: 'Press G' },
]

export const BOOST_ID: Record<BoostKind, number> = { life: 1, heal: 2, armor: 3 }
export const BOOST_IDS: readonly number[] = BOOSTS.map((b) => b.id)
