import { useCallback, useMemo, useState } from 'react'
import { erc20Abi, type Address, type Hex } from 'viem'
import { arcTestnet } from 'viem/chains'
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { BOXES_ADDRESS } from '@/abi/arenaBoxes'
import { arenaMarketAbi, erc1155ApprovalAbi, MARKET_ADDRESS } from '@/abi/arenaMarket'
import { SKINS_ADDRESS } from '@/abi/arenaSkins'
import { getSkin, type SkinDef } from '@/game/skins'
import { getUsdc } from '@/onchain-facts'
import { formatUsdc } from '@/onchain-money'
import { friendlyError } from './usePurchase'

export interface MarketListing {
  id: number
  seller: Address
  collection: Address
  tokenId: number
  price: bigint
  skin: SkinDef
}

export type MarketStep = 'idle' | 'checking' | 'approve-wallet' | 'approve-confirm' | 'action-wallet' | 'action-confirm' | 'done' | 'error'
export type MarketAction = 'buy' | 'list' | 'cancel' | 'reprice'

export interface MarketFlow {
  step: MarketStep
  action?: MarketAction
  /** Listing id (buy, cancel, reprice) or skin id (list). */
  target?: number
  hash?: Hex
  error?: string
}

const usdc = getUsdc(arcTestnet.id)
const PAGE = 300
const BUSY: MarketStep[] = ['checking', 'approve-wallet', 'approve-confirm', 'action-wallet', 'action-confirm']

const sameAddress = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase())

/** Which contract holds a given skin, so the market can list it. */
export function collectionOf(skin: SkinDef): Address | undefined {
  return skin.source === 'box' ? BOXES_ADDRESS : SKINS_ADDRESS
}

/** Browse, buy, list, reprice and cancel on the ArenaMarket contract. Every step is a real transaction. */
export function useMarket(onChanged: () => void) {
  const { address, chainId } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: arcTestnet.id })
  const [flow, setFlow] = useState<MarketFlow>({ step: 'idle' })
  const enabled = Boolean(MARKET_ADDRESS)

  const nextIdQuery = useReadContract({ address: MARKET_ADDRESS, abi: arenaMarketAbi, functionName: 'nextListingId', chainId: arcTestnet.id, query: { enabled, refetchInterval: 8000 } })
  const feeQuery = useReadContract({ address: MARKET_ADDRESS, abi: arenaMarketAbi, functionName: 'feeBps', chainId: arcTestnet.id, query: { enabled } })
  const salesQuery = useReadContract({ address: MARKET_ADDRESS, abi: arenaMarketAbi, functionName: 'totalSales', chainId: arcTestnet.id, query: { enabled, refetchInterval: 15_000 } })
  const volumeQuery = useReadContract({ address: MARKET_ADDRESS, abi: arenaMarketAbi, functionName: 'totalVolume', chainId: arcTestnet.id, query: { enabled, refetchInterval: 15_000 } })

  const nextId = nextIdQuery.data !== undefined ? Number(nextIdQuery.data) : 0
  const from = Math.max(1, nextId - PAGE)
  const pageQuery = useReadContract({
    address: MARKET_ADDRESS,
    abi: arenaMarketAbi,
    functionName: 'listingsPage',
    args: [BigInt(from), BigInt(PAGE)],
    chainId: arcTestnet.id,
    query: { enabled: enabled && nextId > 1, refetchInterval: 8000 },
  })

  const listings = useMemo<MarketListing[]>(() => {
    const data = pageQuery.data
    if (!data) return []
    const [ids, page] = data
    const out: MarketListing[] = []
    page.forEach((l, i) => {
      if (!l.active) return
      const skin = getSkin(Number(l.tokenId))
      if (!skin) return
      out.push({ id: Number(ids[i]), seller: l.seller, collection: l.collection, tokenId: Number(l.tokenId), price: l.price, skin })
    })
    return out.reverse()
  }, [pageQuery.data])

  const refetch = useCallback(() => {
    void nextIdQuery.refetch()
    void pageQuery.refetch()
    void salesQuery.refetch()
    void volumeQuery.refetch()
    onChanged()
  }, [nextIdQuery, pageQuery, salesQuery, volumeQuery, onChanged])

  const run = useCallback(
    async (action: MarketAction, target: number, body: (ctx: { account: Address; market: Address }) => Promise<Hex>, prepare?: (ctx: { account: Address; market: Address }) => Promise<boolean>) => {
      if (!address || !MARKET_ADDRESS || !publicClient) return
      try {
        if (chainId !== arcTestnet.id) await switchChainAsync({ chainId: arcTestnet.id })
        setFlow({ step: 'checking', action, target })
        const ctx = { account: address, market: MARKET_ADDRESS }
        if (prepare && !(await prepare(ctx))) return
        setFlow({ step: 'action-wallet', action, target })
        const hash = await body(ctx)
        setFlow({ step: 'action-confirm', action, target, hash })
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('reverted')
        setFlow({ step: 'done', action, target, hash })
        refetch()
      } catch (e) {
        setFlow({ step: 'error', action, target, error: marketError(e) })
      }
    },
    [address, chainId, publicClient, refetch, switchChainAsync],
  )

  const buy = useCallback(
    (listing: MarketListing) =>
      run(
        'buy',
        listing.id,
        ({ market }) => writeContractAsync({ address: market, abi: arenaMarketAbi, functionName: 'buy', args: [BigInt(listing.id), listing.price], chainId: arcTestnet.id }),
        async ({ account, market }) => {
          if (!usdc || !publicClient) return false
          const usdcAddress = usdc.address as Address
          const [balance, allowance] = await Promise.all([
            publicClient.readContract({ address: usdcAddress, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
            publicClient.readContract({ address: usdcAddress, abi: erc20Abi, functionName: 'allowance', args: [account, market] }),
          ])
          if (balance < listing.price) {
            setFlow({ step: 'error', action: 'buy', target: listing.id, error: `You need ${formatUsdc(listing.price)} USDC. Get free test USDC at faucet.circle.com.` })
            return false
          }
          if (allowance < listing.price) {
            setFlow({ step: 'approve-wallet', action: 'buy', target: listing.id })
            const h = await writeContractAsync({ address: usdcAddress, abi: erc20Abi, functionName: 'approve', args: [market, listing.price], chainId: arcTestnet.id })
            setFlow({ step: 'approve-confirm', action: 'buy', target: listing.id, hash: h })
            const r = await publicClient.waitForTransactionReceipt({ hash: h })
            if (r.status !== 'success') throw new Error('approve reverted')
          }
          return true
        },
      ),
    [publicClient, run, writeContractAsync],
  )

  const list = useCallback(
    (skin: SkinDef, price: bigint) => {
      const collection = collectionOf(skin)
      if (!collection) return Promise.resolve()
      return run(
        'list',
        skin.id,
        ({ market }) => writeContractAsync({ address: market, abi: arenaMarketAbi, functionName: 'list', args: [collection, BigInt(skin.id), price], chainId: arcTestnet.id }),
        async ({ account, market }) => {
          if (!publicClient) return false
          const approved = await publicClient.readContract({ address: collection, abi: erc1155ApprovalAbi, functionName: 'isApprovedForAll', args: [account, market] })
          if (!approved) {
            setFlow({ step: 'approve-wallet', action: 'list', target: skin.id })
            const h = await writeContractAsync({ address: collection, abi: erc1155ApprovalAbi, functionName: 'setApprovalForAll', args: [market, true], chainId: arcTestnet.id })
            setFlow({ step: 'approve-confirm', action: 'list', target: skin.id, hash: h })
            const r = await publicClient.waitForTransactionReceipt({ hash: h })
            if (r.status !== 'success') throw new Error('approval reverted')
          }
          return true
        },
      )
    },
    [publicClient, run, writeContractAsync],
  )

  const cancel = useCallback(
    (listingId: number) => run('cancel', listingId, ({ market }) => writeContractAsync({ address: market, abi: arenaMarketAbi, functionName: 'cancel', args: [BigInt(listingId)], chainId: arcTestnet.id })),
    [run, writeContractAsync],
  )

  const reprice = useCallback(
    (listingId: number, price: bigint) =>
      run('reprice', listingId, ({ market }) => writeContractAsync({ address: market, abi: arenaMarketAbi, functionName: 'updatePrice', args: [BigInt(listingId), price], chainId: arcTestnet.id })),
    [run, writeContractAsync],
  )

  const reset = useCallback(() => setFlow({ step: 'idle' }), [])

  return {
    address,
    listings,
    feeBps: feeQuery.data !== undefined ? Number(feeQuery.data) : 250,
    totalSales: salesQuery.data !== undefined ? Number(salesQuery.data) : 0,
    totalVolume: volumeQuery.data !== undefined ? BigInt(volumeQuery.data) : 0n,
    loading: nextIdQuery.isLoading || pageQuery.isLoading,
    flow,
    busy: BUSY.includes(flow.step),
    buy,
    list,
    cancel,
    reprice,
    reset,
    isMine: (l: MarketListing) => sameAddress(l.seller, address),
  }
}

export type MarketState = ReturnType<typeof useMarket>

function marketError(e: unknown): string {
  const text = e instanceof Error ? `${e.name} ${e.message} ${(e as { shortMessage?: string }).shortMessage ?? ''}`.toLowerCase() : String(e).toLowerCase()
  if (text.includes('listingnotactive')) return 'This listing is no longer available.'
  if (text.includes('cannotbuyownlisting')) return 'You cannot buy your own listing.'
  if (text.includes('notseller')) return 'Only the seller can change this listing.'
  if (text.includes('invalidprice')) return 'The minimum price is 0.01 USDC.'
  if (text.includes('pricetoohigh')) return 'The price changed. Refresh and try again.'
  return friendlyError(e)
}
