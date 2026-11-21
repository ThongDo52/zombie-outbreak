import type { Address } from 'viem'
import { parseAbi } from 'viem'

/** ArenaMarket on Arc Testnet. Set by the deploy step in `.env` (VITE_MARKET_ADDRESS). */
export const MARKET_ADDRESS = import.meta.env.VITE_MARKET_ADDRESS as Address | undefined

export const arenaMarketAbi = parseAbi([
  'function feeBps() view returns (uint16)',
  'function nextListingId() view returns (uint256)',
  'function activeCount() view returns (uint256)',
  'function totalSales() view returns (uint256)',
  'function totalVolume() view returns (uint256)',
  'function listingsPage(uint256 fromId, uint256 limit) view returns (uint256[] ids, (address seller, address collection, uint128 price, uint256 tokenId, bool active)[] page)',
  'function list(address collection, uint256 tokenId, uint128 price) returns (uint256 listingId)',
  'function buy(uint256 listingId, uint256 maxPrice)',
  'function cancel(uint256 listingId)',
  'function updatePrice(uint256 listingId, uint128 newPrice)',
  'error CannotBuyOwnListing()',
  'error ListingNotActive()',
  'error NotSeller()',
  'error PriceTooHigh(uint256 price, uint256 maxPrice)',
  'error InvalidPrice()',
  'error CollectionNotAllowed(address collection)',
])

export const erc1155ApprovalAbi = parseAbi([
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
])
