import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { erc20Abi, parseEventLogs, zeroAddress, type Address, type Hex } from 'viem'
import { arcTestnet } from 'viem/chains'
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { arenaBoxesAbi, BOX_CALLBACK_GAS, BOXES_ADDRESS, VRF_COORDINATOR, vrfCoordinatorAbi } from '@/abi/arenaBoxes'
import { getUsdc } from '@/onchain-facts'
import { formatUsdc } from '@/onchain-money'
import { friendlyError } from './usePurchase'

export type BoxStep =
  | 'idle' | 'checking' | 'approve-wallet' | 'approve-confirm' | 'buy-wallet' | 'buy-confirm'
  | 'waiting' | 'open-wallet' | 'open-confirm' | 'refund-wallet' | 'refund-confirm' | 'done' | 'error'

export interface BoxResult {
  itemId: number
  tier: number
  pityTriggered: boolean
}

export interface BoxFlow {
  step: BoxStep
  hash?: Hex
  error?: string
  result?: BoxResult
}

const usdc = getUsdc(arcTestnet.id)
const BUSY: BoxStep[] = ['checking', 'approve-wallet', 'approve-confirm', 'buy-wallet', 'buy-confirm', 'open-wallet', 'open-confirm', 'refund-wallet', 'refund-confirm']

/**
 * Mystery box: pay USDC, wait for verifiable randomness, open, receive one rare skin.
 * Every step is a real transaction; nothing is simulated.
 */
export function useBoxes(onOpened: (result: BoxResult) => void) {
  const { address, chainId } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: arcTestnet.id })
  const [flow, setFlow] = useState<BoxFlow>({ step: 'idle' })
  const [waitingSince, setWaitingSince] = useState<number | null>(null)
  const autoOpen = useRef(false)
  const opening = useRef(false)

  const enabled = Boolean(BOXES_ADDRESS)
  const priceQuery = useReadContract({ address: BOXES_ADDRESS, abi: arenaBoxesAbi, functionName: 'boxPrice', chainId: arcTestnet.id, query: { enabled, refetchInterval: 30_000 } })
  const thresholdQuery = useReadContract({ address: BOXES_ADDRESS, abi: arenaBoxesAbi, functionName: 'pityThreshold', chainId: arcTestnet.id, query: { enabled } })
  const pityQuery = useReadContract({
    address: BOXES_ADDRESS, abi: arenaBoxesAbi, functionName: 'pity', args: address ? [address] : undefined, chainId: arcTestnet.id,
    query: { enabled: enabled && Boolean(address), refetchInterval: 15_000 },
  })
  const pendingQuery = useReadContract({
    address: BOXES_ADDRESS, abi: arenaBoxesAbi, functionName: 'pendingOf', args: address ? [address] : undefined, chainId: arcTestnet.id,
    query: { enabled: enabled && Boolean(address), refetchInterval: 1500 },
  })

  const pending = useMemo(() => {
    const d = pendingQuery.data
    if (!d || d[0] === 0n) return null
    return { requestId: d[0], fulfilled: d[1], refundable: d[2], price: d[3], rewardTo: d[4] }
  }, [pendingQuery.data])

  const refetch = useCallback(() => {
    void pityQuery.refetch()
    void pendingQuery.refetch()
  }, [pityQuery, pendingQuery])

  const open = useCallback(async () => {
    if (!address || !BOXES_ADDRESS || !publicClient || opening.current) return
    opening.current = true
    try {
      if (chainId !== arcTestnet.id) await switchChainAsync({ chainId: arcTestnet.id })
      setFlow({ step: 'open-wallet' })
      const hash = await writeContractAsync({ address: BOXES_ADDRESS, abi: arenaBoxesAbi, functionName: 'openBox', args: [address], chainId: arcTestnet.id })
      setFlow({ step: 'open-confirm', hash })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('open reverted')
      const log = parseEventLogs({ abi: arenaBoxesAbi, logs: receipt.logs, eventName: 'BoxOpened' })[0]
      if (!log) throw new Error('no result')
      const result: BoxResult = { itemId: Number(log.args.itemId), tier: Number(log.args.tier), pityTriggered: Boolean(log.args.pityTriggered) }
      autoOpen.current = false
      setWaitingSince(null)
      setFlow({ step: 'done', hash, result })
      refetch()
      onOpened(result)
    } catch (e) {
      autoOpen.current = false
      setFlow({ step: 'error', error: friendlyError(e) })
    } finally {
      opening.current = false
    }
  }, [address, chainId, onOpened, publicClient, refetch, switchChainAsync, writeContractAsync])

  // Once randomness arrives for a box bought in this session, open it right away.
  useEffect(() => {
    if (autoOpen.current && pending?.fulfilled && !pending.refundable && !opening.current) void open()
  }, [pending, open])

  const buy = useCallback(
    async (rewardTo?: Address) => {
      const price = priceQuery.data
      if (!address || !BOXES_ADDRESS || !VRF_COORDINATOR || !usdc || !publicClient || price === undefined) return
      try {
        if (chainId !== arcTestnet.id) await switchChainAsync({ chainId: arcTestnet.id })
        setFlow({ step: 'checking' })
        const usdcAddress = usdc.address as Address
        const [balance, allowance, block] = await Promise.all([
          publicClient.readContract({ address: usdcAddress, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
          publicClient.readContract({ address: usdcAddress, abi: erc20Abi, functionName: 'allowance', args: [address, BOXES_ADDRESS] }),
          publicClient.getBlock(),
        ])
        if (balance < BigInt(price)) {
          setFlow({ step: 'error', error: `You need ${formatUsdc(BigInt(price))} USDC. Get free test USDC at faucet.circle.com.` })
          return
        }
        // Randomness fee, paid in the chain's native USDC. The contract quotes it again inside the
        // purchase and sends the unused part straight back, so a small buffer costs nothing.
        const quote = await publicClient.readContract({
          address: VRF_COORDINATOR, abi: vrfCoordinatorAbi, functionName: 'quoteFeeAt',
          args: [BOX_CALLBACK_GAS, (block.baseFeePerGas ?? 0n) * 2n],
        })
        const value = quote + quote / 3n
        if (allowance < BigInt(price)) {
          setFlow({ step: 'approve-wallet' })
          const approveHash = await writeContractAsync({ address: usdcAddress, abi: erc20Abi, functionName: 'approve', args: [BOXES_ADDRESS, BigInt(price)], chainId: arcTestnet.id })
          setFlow({ step: 'approve-confirm', hash: approveHash })
          const approved = await publicClient.waitForTransactionReceipt({ hash: approveHash })
          if (approved.status !== 'success') throw new Error('approve reverted')
        }
        setFlow({ step: 'buy-wallet' })
        const buyHash = await writeContractAsync({
          address: BOXES_ADDRESS, abi: arenaBoxesAbi, functionName: 'buyBox',
          args: [BigInt(price), rewardTo ?? zeroAddress], value, chainId: arcTestnet.id,
        })
        setFlow({ step: 'buy-confirm', hash: buyHash })
        const receipt = await publicClient.waitForTransactionReceipt({ hash: buyHash })
        if (receipt.status !== 'success') throw new Error('buy reverted')
        autoOpen.current = true
        setWaitingSince(Date.now())
        setFlow({ step: 'waiting', hash: buyHash })
        refetch()
      } catch (e) {
        setFlow({ step: 'error', error: friendlyError(e) })
      }
    },
    [address, chainId, priceQuery.data, publicClient, refetch, switchChainAsync, writeContractAsync],
  )

  const refund = useCallback(async () => {
    if (!address || !BOXES_ADDRESS || !publicClient) return
    try {
      setFlow({ step: 'refund-wallet' })
      const hash = await writeContractAsync({ address: BOXES_ADDRESS, abi: arenaBoxesAbi, functionName: 'refundBox', chainId: arcTestnet.id })
      setFlow({ step: 'refund-confirm', hash })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('refund reverted')
      autoOpen.current = false
      setWaitingSince(null)
      setFlow({ step: 'idle' })
      refetch()
    } catch (e) {
      setFlow({ step: 'error', error: friendlyError(e) })
    }
  }, [address, publicClient, refetch, writeContractAsync])

  const reset = useCallback(() => setFlow({ step: 'idle' }), [])

  return {
    address,
    price: priceQuery.data !== undefined ? BigInt(priceQuery.data) : undefined,
    pityThreshold: thresholdQuery.data,
    pity: pityQuery.data !== undefined ? Number(pityQuery.data) : 0,
    pending,
    flow,
    waitingSince,
    busy: BUSY.includes(flow.step),
    buy,
    open,
    refund,
    reset,
  }
}

export type BoxesState = ReturnType<typeof useBoxes>
