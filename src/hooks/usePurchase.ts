import { useCallback, useState } from 'react'
import { erc20Abi, type Address, type Hex } from 'viem'
import { arcTestnet } from 'viem/chains'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { arenaSkinsAbi, SKINS_ADDRESS } from '@/abi/arenaSkins'
import { getUsdc } from '@/onchain-facts'
import { formatUsdc } from '@/onchain-money'

export type PurchaseStep = 'idle' | 'checking' | 'approve-wallet' | 'approve-confirm' | 'buy-wallet' | 'buy-confirm' | 'done' | 'error'

export interface PurchaseState {
  skinId?: number
  step: PurchaseStep
  hash?: Hex
  error?: string
  gift?: boolean
}

const usdc = getUsdc(arcTestnet.id)

export function friendlyError(e: unknown): string {
  const text = e instanceof Error ? `${e.name} ${e.message} ${(e as { shortMessage?: string }).shortMessage ?? ''}` : String(e)
  const msg = text.toLowerCase()
  if (msg.includes('user rejected') || msg.includes('user denied') || msg.includes('rejected the request')) return 'Cancelled in your wallet.'
  if (msg.includes('alreadyowned')) return 'That wallet already owns this skin.'
  if (msg.includes('soldout')) return 'This skin is sold out.'
  if (msg.includes('skininactive') || msg.includes('boostinactive')) return 'This item is not for sale right now.'
  if (msg.includes('cooldownactive')) return 'You already bought a boost in the last 24 hours.'
  if (msg.includes('boxalreadypending')) return 'You already have an unopened box. Open it first.'
  if (msg.includes('incorrectfee')) return 'The randomness fee changed. Please try again.'
  if (msg.includes('boxnotready')) return 'Your box is not ready yet. Try again in a moment.'
  if (msg.includes('boxnotrefundable')) return 'This box cannot be refunded yet.'
  if (msg.includes('pricetoohigh')) return 'The price changed while you were buying. Please try again.'
  if (msg.includes('insufficient')) return 'Not enough USDC for this purchase and its network fee.'
  return 'The purchase did not go through. Please try again.'
}

/** Approve (if needed) then buy a skin for yourself or as a gift. Every step is a real transaction. */
export function usePurchase(onBought: (skinId: number, gift: boolean) => void) {
  const { address, chainId } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: arcTestnet.id })
  const [state, setState] = useState<PurchaseState>({ step: 'idle' })

  const buy = useCallback(
    async (skinId: number, price: bigint, to: Address, gift: boolean) => {
      if (!address || !SKINS_ADDRESS || !usdc || !publicClient) return
      try {
        if (chainId !== arcTestnet.id) await switchChainAsync({ chainId: arcTestnet.id })
        setState({ skinId, step: 'checking', gift })
        const [balance, allowance] = await Promise.all([
          publicClient.readContract({ address: usdc.address as Address, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
          publicClient.readContract({ address: usdc.address as Address, abi: erc20Abi, functionName: 'allowance', args: [address, SKINS_ADDRESS] }),
        ])
        if (balance < price) {
          setState({ skinId, step: 'error', gift, error: `You need ${formatUsdc(price)} USDC. Get free test USDC at faucet.circle.com.` })
          return
        }
        if (allowance < price) {
          setState({ skinId, step: 'approve-wallet', gift })
          const approveHash = await writeContractAsync({
            address: usdc.address as Address,
            abi: erc20Abi,
            functionName: 'approve',
            args: [SKINS_ADDRESS, price],
            chainId: arcTestnet.id,
          })
          setState({ skinId, step: 'approve-confirm', hash: approveHash, gift })
          const approved = await publicClient.waitForTransactionReceipt({ hash: approveHash })
          if (approved.status !== 'success') throw new Error('approve reverted')
        }
        setState({ skinId, step: 'buy-wallet', gift })
        const buyHash = await writeContractAsync({
          address: SKINS_ADDRESS,
          abi: arenaSkinsAbi,
          functionName: 'buy',
          args: [BigInt(skinId), to, price],
          chainId: arcTestnet.id,
        })
        setState({ skinId, step: 'buy-confirm', hash: buyHash, gift })
        const receipt = await publicClient.waitForTransactionReceipt({ hash: buyHash })
        if (receipt.status !== 'success') throw new Error('buy reverted')
        setState({ skinId, step: 'done', hash: buyHash, gift })
        onBought(skinId, gift)
      } catch (e) {
        setState({ skinId, step: 'error', gift, error: friendlyError(e) })
      }
    },
    [address, chainId, onBought, publicClient, switchChainAsync, writeContractAsync],
  )

  const reset = useCallback(() => setState({ step: 'idle' }), [])
  const busy = ['checking', 'approve-wallet', 'approve-confirm', 'buy-wallet', 'buy-confirm'].includes(state.step)

  return { state, buy, reset, busy }
}
