import { useCallback, useEffect, useMemo, useState } from 'react'
import { erc20Abi, type Address, type Hex } from 'viem'
import { useAccount, usePublicClient, useReadContracts, useSwitchChain, useWriteContract } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { arenaDescentAbi, DESCENT_ADDRESS } from '@/abi/arenaDescent'
import { getUsdc } from '@/onchain-facts'
import { parseUsdc } from '@/onchain-money'
import type { CoopHandle } from '@/hooks/useCoop'
import { friendlyError } from '@/hooks/usePurchase'

/** Floors whose prize is shown in the reward table. */
export const PRIZE_MILESTONES = [3, 5, 8, 10, 15, 20, 25] as const

export type DescentStep = 'idle' | 'ticket' | 'approve-wallet' | 'approve-confirm' | 'enter-wallet' | 'enter-confirm' | 'claim-wallet' | 'claim-confirm' | 'refund-wallet' | 'refund-confirm' | 'fund-wallet' | 'fund-confirm' | 'done' | 'error'

export interface DescentFlow {
  step: DescentStep
  hash?: Hex
  message?: string
}

const STEP_TEXT: Record<DescentStep, string> = {
  idle: '',
  ticket: 'Asking the server for your entry ticket...',
  'approve-wallet': 'Approve USDC in your wallet (step 1 of 2)',
  'approve-confirm': 'Waiting for the approval to confirm...',
  'enter-wallet': 'Confirm your entry in your wallet (step 2 of 2)',
  'enter-confirm': 'Waiting for your entry to confirm...',
  'claim-wallet': 'Confirm the claim in your wallet',
  'claim-confirm': 'Waiting for the claim to confirm...',
  'refund-wallet': 'Confirm the refund in your wallet',
  'refund-confirm': 'Waiting for the refund to confirm...',
  'fund-wallet': 'Confirm adding to the prize pool',
  'fund-confirm': 'Waiting for the pool top-up to confirm...',
  done: 'Done.',
  error: '',
}
export const stepText = (s: DescentStep) => STEP_TEXT[s]

/** Everything the wallet does for Endless Descent: pay in, claim the prize, refund, top up the pool. */
export function useDescent(coop: CoopHandle) {
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient({ chainId: arcTestnet.id })
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()
  const usdc = getUsdc(arcTestnet.id)!.address as Address
  const enabled = Boolean(DESCENT_ADDRESS)
  const [flow, setFlow] = useState<DescentFlow>({ step: 'idle' })
  const [refundedRuns, setRefundedRuns] = useState<string[]>([])

  const contracts = useMemo(() => {
    if (!DESCENT_ADDRESS) return []
    const base = [
      { address: DESCENT_ADDRESS, abi: arenaDescentAbi, functionName: 'poolBalance', chainId: arcTestnet.id },
      { address: DESCENT_ADDRESS, abi: arenaDescentAbi, functionName: 'entryFee', chainId: arcTestnet.id },
      ...PRIZE_MILESTONES.map((f) => ({ address: DESCENT_ADDRESS!, abi: arenaDescentAbi, functionName: 'previewPayout', args: [f], chainId: arcTestnet.id })),
    ]
    if (address) base.push({ address: DESCENT_ADDRESS, abi: arenaDescentAbi, functionName: 'credits', args: [address as never], chainId: arcTestnet.id })
    return base
  }, [address])

  const reads = useReadContracts({ contracts: contracts as never, query: { enabled: enabled && contracts.length > 0, refetchInterval: 5000 } })
  const data = reads.data as { result?: unknown; status: string }[] | undefined
  const num = (i: number): bigint => {
    const r = data?.[i]
    return r?.status === 'success' ? (r.result as bigint) : 0n
  }
  const pool = num(0)
  const fee = num(1) || 5_000_000n
  const prizes = PRIZE_MILESTONES.map((floors, i) => ({ floors, payout: num(2 + i) }))
  const credits = address ? num(2 + PRIZE_MILESTONES.length) : 0n

  const room = coop.state.room
  const descent = room?.descent
  const mine = address?.toLowerCase() ?? ''
  const hasPaid = Boolean(descent?.paid.includes(mine))
  const refundable = Boolean(descent && descent.stage === 'cancelled' && hasPaid && descent.runId && !refundedRuns.includes(descent.runId))

  // keep the pool and prize numbers fresh when a run finishes or is cancelled
  const stage = descent?.stage
  const refetch = reads.refetch
  useEffect(() => {
    if (stage === 'settled' || stage === 'cancelled') void refetch()
  }, [stage, refetch])

  const run = useCallback(
    async (job: () => Promise<Hex | void>) => {
      try {
        if (!address || !DESCENT_ADDRESS || !publicClient) return
        if (chainId !== arcTestnet.id) await switchChainAsync({ chainId: arcTestnet.id })
        const hash = await job()
        setFlow({ step: 'done', hash: hash ?? undefined })
        void refetch()
      } catch (e) {
        setFlow({ step: 'error', message: friendlyError(e) })
      }
    },
    [address, chainId, publicClient, refetch, switchChainAsync],
  )

  /** Pay the entry fee: server ticket, USDC approval if needed, then the entry transaction. */
  const pay = useCallback(
    () =>
      run(async () => {
        if (!address || !publicClient || !DESCENT_ADDRESS) return
        setFlow({ step: 'ticket' })
        const t = await coop.client.requestTicket()
        const need = BigInt(t.fee)
        const [balance, allowance] = await Promise.all([
          publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
          publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'allowance', args: [address, DESCENT_ADDRESS] }),
        ])
        if (balance < need) throw new Error('Not enough USDC. Get free test USDC at faucet.circle.com.')
        if (allowance < need) {
          setFlow({ step: 'approve-wallet' })
          const h = await writeContractAsync({ address: usdc, abi: erc20Abi, functionName: 'approve', args: [DESCENT_ADDRESS, need], chainId: arcTestnet.id })
          setFlow({ step: 'approve-confirm', hash: h })
          await publicClient.waitForTransactionReceipt({ hash: h })
        }
        setFlow({ step: 'enter-wallet' })
        const h = await writeContractAsync({
          address: DESCENT_ADDRESS,
          abi: arenaDescentAbi,
          functionName: 'enter',
          args: [t.runId as Hex, BigInt(t.expiry), need, t.signature as Hex],
          chainId: arcTestnet.id,
        })
        setFlow({ step: 'enter-confirm', hash: h })
        const r = await publicClient.waitForTransactionReceipt({ hash: h })
        if (r.status !== 'success') throw new Error('The entry transaction was rejected.')
        return h
      }),
    [address, coop.client, publicClient, run, usdc, writeContractAsync],
  )

  const claim = useCallback(
    () =>
      run(async () => {
        if (!publicClient || !DESCENT_ADDRESS) return
        setFlow({ step: 'claim-wallet' })
        const h = await writeContractAsync({ address: DESCENT_ADDRESS, abi: arenaDescentAbi, functionName: 'claim', chainId: arcTestnet.id })
        setFlow({ step: 'claim-confirm', hash: h })
        const r = await publicClient.waitForTransactionReceipt({ hash: h })
        if (r.status !== 'success') throw new Error('The claim was rejected.')
        return h
      }),
    [publicClient, run, writeContractAsync],
  )

  const refund = useCallback(
    () =>
      run(async () => {
        const runId = descent?.runId
        if (!publicClient || !DESCENT_ADDRESS || !runId) return
        setFlow({ step: 'refund-wallet' })
        const h = await writeContractAsync({ address: DESCENT_ADDRESS, abi: arenaDescentAbi, functionName: 'refund', args: [runId as Hex], chainId: arcTestnet.id })
        setFlow({ step: 'refund-confirm', hash: h })
        const r = await publicClient.waitForTransactionReceipt({ hash: h })
        if (r.status !== 'success') throw new Error('The refund was rejected.')
        setRefundedRuns((list) => [...list, runId])
        return h
      }),
    [descent?.runId, publicClient, run, writeContractAsync],
  )

  /** Anyone can add USDC to the shared prize pool. */
  const fund = useCallback(
    (amountText: string) =>
      run(async () => {
        if (!address || !publicClient || !DESCENT_ADDRESS) return
        const amount = parseUsdc(amountText)
        if (amount <= 0n) throw new Error('Enter an amount above zero.')
        const allowance = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'allowance', args: [address, DESCENT_ADDRESS] })
        if (allowance < amount) {
          setFlow({ step: 'approve-wallet' })
          const a = await writeContractAsync({ address: usdc, abi: erc20Abi, functionName: 'approve', args: [DESCENT_ADDRESS, amount], chainId: arcTestnet.id })
          setFlow({ step: 'approve-confirm', hash: a })
          await publicClient.waitForTransactionReceipt({ hash: a })
        }
        setFlow({ step: 'fund-wallet' })
        const h = await writeContractAsync({ address: DESCENT_ADDRESS, abi: arenaDescentAbi, functionName: 'fund', args: [amount], chainId: arcTestnet.id })
        setFlow({ step: 'fund-confirm', hash: h })
        const r = await publicClient.waitForTransactionReceipt({ hash: h })
        if (r.status !== 'success') throw new Error('The top-up was rejected.')
        return h
      }),
    [address, publicClient, run, usdc, writeContractAsync],
  )

  const busy = flow.step !== 'idle' && flow.step !== 'done' && flow.step !== 'error'
  const reset = useCallback(() => setFlow({ step: 'idle' }), [])

  return { enabled, address, pool, fee, prizes, credits, flow, busy, hasPaid, refundable, pay, claim, refund, fund, reset }
}

export type DescentHandle = ReturnType<typeof useDescent>
