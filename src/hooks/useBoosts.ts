import { useCallback, useEffect, useMemo, useState } from 'react'
import { arcTestnet } from 'viem/chains'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { arenaBoostsAbi, BOOSTS_ADDRESS } from '@/abi/arenaBoosts'
import { BOOST_ID, BOOST_IDS } from '@/game/boosts'
import { getGame } from '@/game/save'
import type { BoostCharges, BoostKind } from '@/game/types'

export interface BoostInfo {
  price: bigint
  active: boolean
}

type Used = Record<number, number>

const usedKey = (address: string) => `arena-boosts-used:${address.toLowerCase()}`

function readUsed(address: string): Used {
  try {
    const raw = localStorage.getItem(usedKey(address))
    return raw ? (JSON.parse(raw) as Used) : {}
  } catch {
    return {}
  }
}

/**
 * Boosts the connected wallet bought (counted by the ArenaBoosts contract) minus the ones it already
 * used in the game (counted in this browser). The game receives what is left as charges.
 */
export function useBoosts() {
  const { address } = useAccount()
  const [usedState, setUsedState] = useState<{ address: string; used: Used } | null>(null)

  const infoQuery = useReadContracts({
    contracts: BOOST_IDS.map((id) => ({
      address: BOOSTS_ADDRESS,
      abi: arenaBoostsAbi,
      functionName: 'boosts' as const,
      args: [BigInt(id)] as const,
      chainId: arcTestnet.id,
    })),
    query: { enabled: Boolean(BOOSTS_ADDRESS), refetchInterval: 30_000 },
  })

  const creditsQuery = useReadContract({
    address: BOOSTS_ADDRESS,
    abi: arenaBoostsAbi,
    functionName: 'creditsOf',
    args: address ? [address, BOOST_IDS.map((id) => BigInt(id))] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: Boolean(BOOSTS_ADDRESS && address), refetchInterval: 20_000 },
  })

  const nextQuery = useReadContract({
    address: BOOSTS_ADDRESS,
    abi: arenaBoostsAbi,
    functionName: 'nextPurchaseAt',
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: Boolean(BOOSTS_ADDRESS && address), refetchInterval: 20_000 },
  })

  const info = useMemo(() => {
    const map = new Map<number, BoostInfo>()
    infoQuery.data?.forEach((entry, i) => {
      const r = entry.result as readonly [bigint, boolean] | undefined
      if (r) map.set(BOOST_IDS[i], { price: r[0], active: r[1] })
    })
    return map
  }, [infoQuery.data])

  const used = useMemo<Used>(() => {
    if (!address) return {}
    return usedState?.address === address ? usedState.used : readUsed(address)
  }, [address, usedState])

  const available = useMemo<BoostCharges>(() => {
    const left = (kind: BoostKind) => {
      const id = BOOST_ID[kind]
      const bought = Number(creditsQuery.data?.[BOOST_IDS.indexOf(id)] ?? 0n)
      return Math.max(0, bought - (used[id] ?? 0))
    }
    return { life: left('life'), heal: left('heal'), armor: left('armor') }
  }, [creditsQuery.data, used])

  const markUsed = useCallback(
    (kind: BoostKind) => {
      if (!address) return
      const id = BOOST_ID[kind]
      const next = { ...used, [id]: (used[id] ?? 0) + 1 }
      localStorage.setItem(usedKey(address), JSON.stringify(next))
      setUsedState({ address, used: next })
    },
    [address, used],
  )

  // The game lives outside React, so hand it the charges and listen for uses.
  useEffect(() => {
    const game = getGame()
    game.charges = { ...available }
    game.onBoostUsed = markUsed
  }, [available, markUsed])

  const refetch = useCallback(() => {
    void creditsQuery.refetch()
    void nextQuery.refetch()
  }, [creditsQuery, nextQuery])

  return {
    address,
    info,
    available,
    nextPurchaseAt: Number(nextQuery.data ?? 0n),
    refetch,
    loading: infoQuery.isLoading,
  }
}

export type BoostsState = ReturnType<typeof useBoosts>
