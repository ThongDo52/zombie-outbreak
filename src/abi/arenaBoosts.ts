import { parseAbi } from 'viem'

/** Deployed ArenaBoosts shop on Arc Testnet. Set VITE_BOOSTS_ADDRESS in .env. */
export const BOOSTS_ADDRESS = import.meta.env.VITE_BOOSTS_ADDRESS as `0x${string}` | undefined

export const arenaBoostsAbi = parseAbi([
  'function boosts(uint256 id) view returns (uint128 price, bool active)',
  'function creditsOf(address account, uint256[] ids) view returns (uint256[])',
  'function nextPurchaseAt(address account) view returns (uint256)',
  'function buy(uint256 id, uint256 maxPrice)',
  'error CooldownActive(uint256 nextPurchaseAt)',
  'error BoostInactive(uint256 id)',
  'error PriceTooHigh(uint256 price, uint256 maxPrice)',
])
