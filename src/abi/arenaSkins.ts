import { parseAbi } from 'viem'

/** Deployed ArenaSkins shop on Arc Testnet. Set VITE_SKINS_ADDRESS in .env. */
export const SKINS_ADDRESS = import.meta.env.VITE_SKINS_ADDRESS as `0x${string}` | undefined

export const arenaSkinsAbi = parseAbi([
  'function skins(uint256 id) view returns (uint128 price, uint32 maxSupply, uint32 minted, bool active)',
  'function balancesOf(address account, uint256[] ids) view returns (uint256[])',
  'function buy(uint256 id, address to, uint256 maxPrice)',
  'error AlreadyOwned(address to, uint256 id)',
  'error SoldOut(uint256 id)',
  'error SkinInactive(uint256 id)',
  'error PriceTooHigh(uint256 price, uint256 maxPrice)',
])
