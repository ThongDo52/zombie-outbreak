import type { Address } from 'viem'
import { parseAbi } from 'viem'

/** ArenaBoxes on Arc Testnet. Set by the deploy step in `.env` (VITE_BOXES_ADDRESS). */
export const BOXES_ADDRESS = import.meta.env.VITE_BOXES_ADDRESS as Address | undefined
/** D20DAO verifiable-randomness coordinator used by the box contract. */
export const VRF_COORDINATOR = import.meta.env.VITE_VRF_COORDINATOR as Address | undefined

/** Gas the randomness callback may use. Must match the contract. */
export const BOX_CALLBACK_GAS = 150_000

export const arenaBoxesAbi = parseAbi([
  'function owner() view returns (address)',
  'function boxPrice() view returns (uint128)',
  'function pityThreshold() view returns (uint16)',
  'function pity(address) view returns (uint256)',
  'function balancesOf(address account, uint256[] ids) view returns (uint256[])',
  'function pendingOf(address account) view returns (uint256 requestId, bool fulfilled, bool refundable, uint128 price, address rewardTo)',
  'function buyBox(uint256 maxPrice, address rewardTo) payable',
  'function openBox(address buyer)',
  'function refundBox()',
  'function setRewardRecipient(address newRecipient)',
  'event BoxOpened(address indexed buyer, uint256 indexed itemId, uint8 tier, bool pityTriggered)',
  'event BoxPurchased(address indexed buyer, uint256 indexed requestId, uint128 price, address rewardTo)',
  'error PriceTooHigh(uint256 price, uint256 maxPrice)',
  'error BoxAlreadyPending()',
  'error IncorrectFee()',
  'error NoPendingBox()',
  'error BoxNotReady()',
  'error BoxNotRefundable()',
  'error ChangeRefused()',
])

export const vrfCoordinatorAbi = parseAbi([
  'function quoteFeeAt(uint32 callbackGasLimit, uint256 baseFee) view returns (uint256)',
])
