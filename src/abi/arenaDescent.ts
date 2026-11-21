import type { Address } from 'viem'
import { parseAbi } from 'viem'

/** ArenaDescent on Arc Testnet. Set by the deploy step in `.env` (VITE_DESCENT_ADDRESS). */
export const DESCENT_ADDRESS = import.meta.env.VITE_DESCENT_ADDRESS as Address | undefined

/** Run states reported by `runInfo`. */
export const RUN_STATE = { None: 0, Open: 1, Full: 2, Settled: 3, Cancelled: 4 } as const

/** Squad size, fee and reward rules are enforced by the contract. These mirror them for display only. */
export const DESCENT_RUN_SIZE = 5
export const DESCENT_MIN_FLOORS = 3
export const DESCENT_BPS_PER_FLOOR = 100
export const DESCENT_MAX_BPS = 2500

export const arenaDescentAbi = parseAbi([
  'function entryFee() view returns (uint128)',
  'function poolBalance() view returns (uint256)',
  'function previewPayout(uint16 floors) view returns (uint256)',
  'function runInfo(bytes32 runId) view returns (uint8 state, uint128 fee, uint8 entries, uint256 firstEntryAt, uint256 filledAt, address[5] players)',
  'function credits(address) view returns (uint256)',
  'function entered(bytes32, address) view returns (bool)',
  'function refunded(bytes32, address) view returns (bool)',
  'function paused() view returns (bool)',
  'function operator() view returns (address)',
  'function dailyCapBps() view returns (uint16)',
  'function dayIndex() view returns (uint256)',
  'function dayPoolSnapshot() view returns (uint256)',
  'function paidToday() view returns (uint256)',
  'function maxPayoutPerRun() view returns (uint256)',
  'function enter(bytes32 runId, uint64 expiry, uint128 fee, bytes signature)',
  'function settle(bytes32 runId, uint16 floors, address[] leavers)',
  'function cancelRun(bytes32 runId)',
  'function claim()',
  'function refund(bytes32 runId)',
  'function fund(uint256 amount)',
  'event Entered(bytes32 runId, address player, uint8 entries)',
  'event Settled(bytes32 runId, uint16 floors, uint256 totalPaid, uint8 stayers)',
  'event Claimed(address player, uint256 amount)',
  'event Refunded(bytes32 runId, address player, uint256 amount)',
  'event Funded(address funder, uint256 amount)',
  'event RunCancelled(bytes32 runId)',
  'error AlreadyEntered()',
  'error RunFull()',
  'error FeeMismatch(uint128 expected, uint128 given)',
  'error InvalidTicket()',
  'error TicketExpired(uint64 expiry)',
  'error InvalidRunState(bytes32 runId, uint8 state)',
  'error DailyCapReached(uint256 remaining, uint256 needed)',
  'error NoCredits()',
  'error RefundUnavailable()',
  'error AlreadyRefunded()',
  'error NotEntered()',
  'error EnforcedPause()',
  'error OnlyOperator()',
])

/** EIP-712 ticket the server signs so a wallet may enter one run at one fee. */
export const DESCENT_TICKET_TYPES = {
  Ticket: [
    { name: 'runId', type: 'bytes32' },
    { name: 'player', type: 'address' },
    { name: 'expiry', type: 'uint64' },
    { name: 'fee', type: 'uint128' },
  ],
} as const
