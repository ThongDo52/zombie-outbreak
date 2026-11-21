import { randomBytes } from 'node:crypto'
import { createWalletClient, getAddress, http, isAddress, parseEventLogs, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { arenaDescentAbi, DESCENT_TICKET_TYPES, RUN_STATE } from '../src/abi/arenaDescent'
import { chainClient } from './auth'

/**
 * The money side of Endless Descent, as the game server sees it. The server holds the "operator" key:
 * it signs the ticket that lets a wallet enter a run, and it reports how deep a squad got. The contract
 * limits what the operator can do (per-run and daily caps), so the key is trusted only for gameplay results.
 */

const env = (name: string) => (process.env[name] ?? '').trim()
const rawAddress = env('VITE_DESCENT_ADDRESS')
export const DESCENT_ADDRESS: Address | undefined = isAddress(rawAddress) ? getAddress(rawAddress) : undefined
const rawKey = env('DESCENT_OPERATOR_KEY')
const account = /^0x[0-9a-fA-F]{64}$/.test(rawKey) ? privateKeyToAccount(rawKey as Hex) : undefined

export const descentReady = () => Boolean(DESCENT_ADDRESS && account)
export const operatorAddress = () => account?.address

// The RPC proxy only allows reads, so the operator sends its transactions to the chain's own public endpoint.
const wallet = () => createWalletClient({ account: account!, chain: arcTestnet, transport: http() })

export const newRunId = (): Hex => `0x${randomBytes(32).toString('hex')}`

let feeCache: { fee: bigint; at: number } | undefined
/** The entry fee the contract charges right now. */
export async function readEntryFee(): Promise<bigint> {
  if (feeCache && Date.now() - feeCache.at < 15_000) return feeCache.fee
  const fee = await chainClient().readContract({ address: DESCENT_ADDRESS!, abi: arenaDescentAbi, functionName: 'entryFee' })
  feeCache = { fee, at: Date.now() }
  return fee
}

/** A signed ticket: this wallet may enter this run once, at this fee, until the expiry. */
export async function signTicket(runId: Hex, player: Address, fee: bigint, expiry: number): Promise<Hex> {
  return account!.signTypedData({
    domain: { name: 'ArenaDescent', version: '1', chainId: arcTestnet.id, verifyingContract: DESCENT_ADDRESS! },
    types: DESCENT_TICKET_TYPES,
    primaryType: 'Ticket',
    message: { runId, player, expiry: BigInt(expiry), fee },
  })
}

/** Which of these wallets have paid into the run, read from the chain. */
export async function readPaid(runId: Hex, players: Address[]): Promise<Address[]> {
  const c = chainClient()
  const flags = await Promise.all(
    players.map((p) => c.readContract({ address: DESCENT_ADDRESS!, abi: arenaDescentAbi, functionName: 'entered', args: [runId, p] })),
  )
  return players.filter((_, i) => flags[i])
}

export async function readRunState(runId: Hex): Promise<number> {
  const info = await chainClient().readContract({ address: DESCENT_ADDRESS!, abi: arenaDescentAbi, functionName: 'runInfo', args: [runId] })
  return Number(info[0])
}

// Operator transactions go one at a time so their nonces never collide.
let queue: Promise<unknown> = Promise.resolve()
const serial = <T>(job: () => Promise<T>): Promise<T> => {
  const next = queue.then(job, job)
  queue = next.catch(() => undefined)
  return next
}

export type SettleOutcome =
  | { kind: 'settled'; totalPaid: bigint; stayers: number; txHash: Hex }
  | { kind: 'deferred'; message: string }
  | { kind: 'failed'; message: string }

const errorText = (e: unknown): string => {
  const parts: string[] = []
  let cur: unknown = e
  for (let i = 0; i < 6 && cur; i++) {
    if (cur instanceof Error) parts.push(cur.name, cur.message, (cur as { shortMessage?: string }).shortMessage ?? '')
    cur = (cur as { cause?: unknown }).cause
  }
  return parts.join(' ')
}

/** Report a finished run. The contract pays the stayers and moves the fees into the pool. */
export function settleOnChain(runId: Hex, floors: number, leavers: Address[]): Promise<SettleOutcome> {
  return serial(async () => {
    try {
      const c = chainClient()
      const args = [runId, Math.max(0, Math.min(65535, Math.floor(floors))), leavers] as const
      await c.simulateContract({ account: account!, address: DESCENT_ADDRESS!, abi: arenaDescentAbi, functionName: 'settle', args })
      const hash = await wallet().writeContract({ address: DESCENT_ADDRESS!, abi: arenaDescentAbi, functionName: 'settle', args })
      const receipt = await c.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') return { kind: 'failed', message: 'The settle transaction reverted.' }
      const log = parseEventLogs({ abi: arenaDescentAbi, logs: receipt.logs, eventName: 'Settled' })[0]
      return { kind: 'settled', totalPaid: log?.args.totalPaid ?? 0n, stayers: Number(log?.args.stayers ?? 0), txHash: hash }
    } catch (e) {
      const text = errorText(e)
      if (text.includes('DailyCapReached')) return { kind: 'deferred', message: 'The daily prize limit is used up. The prize will be credited once it resets.' }
      if (text.includes('InvalidRunState')) return { kind: 'failed', message: 'The run is not in a state that can be settled.' }
      return { kind: 'failed', message: text.slice(0, 160) || 'Settling failed.' }
    }
  })
}

/** Cancel a run that cannot start, so its players can take their fees back. */
export function cancelOnChain(runId: Hex): Promise<boolean> {
  return serial(async () => {
    try {
      const c = chainClient()
      const args = [runId] as const
      await c.simulateContract({ account: account!, address: DESCENT_ADDRESS!, abi: arenaDescentAbi, functionName: 'cancelRun', args })
      const hash = await wallet().writeContract({ address: DESCENT_ADDRESS!, abi: arenaDescentAbi, functionName: 'cancelRun', args })
      const receipt = await c.waitForTransactionReceipt({ hash })
      return receipt.status === 'success'
    } catch {
      return false
    }
  })
}

export { RUN_STATE }
