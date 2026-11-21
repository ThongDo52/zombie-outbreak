import { useCallback, useState } from 'react'
import { erc20Abi, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { arenaBoostsAbi, BOOSTS_ADDRESS } from '@/abi/arenaBoosts'
import { getUsdc } from '@/onchain-facts'
import { formatUsdc } from '@/onchain-money'
import { friendlyError, type PurchaseState } from './usePurchase'

const usdc = getUsdc(arcTestnet.id)

/** Approve (if needed) then buy one boost. Every step is a real transaction. */
export function useBoostPurchase(onBought: (boostId: number) => void) {
  const { address, chainId } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: arcTestnet.id })
  const [state, setState] = useState<PurchaseState>({ step: 'idle' })

  const buy = useCallback(
    async (boostId: number, price: bigint) => {
      if (!address || !BOOSTS_ADDRESS || !usdc || !publicClient) return
      try {
        if (chainId !== arcTestnet.id) await switchChainAsync({ chainId: arcTestnet.id })
        setState({ skinId: boostId, step: 'checking' })
        const token = usdc.address as Address
        const [balance, allowance] = await Promise.all([
          publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
          publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [address, BOOSTS_ADDRESS] }),
        ])
        if (balance < price) {
          setState({ skinId: boostId, step: 'error', error: `You need ${formatUsdc(price)} USDC. Get free test USDC at faucet.circle.com.` })
          return
        }
        if (allowance < price) {
          setState({ skinId: boostId, step: 'approve-wallet' })
          const approveHash = await writeContractAsync({ address: token, abi: erc20Abi, functionName: 'approve', args: [BOOSTS_ADDRESS, price], chainId: arcTestnet.id })
          setState({ skinId: boostId, step: 'approve-confirm', hash: approveHash })
          const approved = await publicClient.waitForTransactionReceipt({ hash: approveHash })
          if (approved.status !== 'success') throw new Error('approve reverted')
        }
        setState({ skinId: boostId, step: 'buy-wallet' })
        const buyHash = await writeContractAsync({ address: BOOSTS_ADDRESS, abi: arenaBoostsAbi, functionName: 'buy', args: [BigInt(boostId), price], chainId: arcTestnet.id })
        setState({ skinId: boostId, step: 'buy-confirm', hash: buyHash })
        const receipt = await publicClient.waitForTransactionReceipt({ hash: buyHash })
        if (receipt.status !== 'success') throw new Error('buy reverted')
        setState({ skinId: boostId, step: 'done', hash: buyHash })
        onBought(boostId)
      } catch (e) {
        setState({ skinId: boostId, step: 'error', error: friendlyError(e) })
      }
    },
    [address, chainId, onBought, publicClient, switchChainAsync, writeContractAsync],
  )

  const reset = useCallback(() => setState({ step: 'idle' }), [])
  const busy = ['checking', 'approve-wallet', 'approve-confirm', 'buy-wallet', 'buy-confirm'].includes(state.step)
  return { state, buy, reset, busy }
}
