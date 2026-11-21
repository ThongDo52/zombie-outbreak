import { useCallback, useEffect, useMemo, useState } from 'react'
import { arcTestnet } from 'viem/chains'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { arenaBoxesAbi, BOXES_ADDRESS } from '@/abi/arenaBoxes'
import { arenaSkinsAbi, SKINS_ADDRESS } from '@/abi/arenaSkins'
import { getGame } from '@/game/save'
import { BOX_IDS, DEFAULT_SELECTION, getSkin, SKIN_IDS, type SkinKind, type SkinSelection } from '@/game/skins'

export interface SkinInfo {
  price: bigint
  maxSupply: number
  minted: number
  active: boolean
}

const TEST_KEY = 'arena-owner-test-unlock'
const storageKey = (address: string) => `arena-skins:${address.toLowerCase()}`

function readSelection(address: string): SkinSelection {
  try {
    const raw = localStorage.getItem(storageKey(address))
    if (!raw) return DEFAULT_SELECTION
    const parsed = JSON.parse(raw) as Partial<SkinSelection>
    return {
      character: Number(parsed.character) || 0,
      gun: Number(parsed.gun) || 0,
      effect: Number(parsed.effect) || 0,
    }
  } catch {
    return DEFAULT_SELECTION
  }
}

/**
 * Skin catalog and ownership read from the ArenaSkins contract, plus the equipped selection
 * (stored per wallet in the browser). Only skins the wallet owns can be equipped.
 */
export function useSkinShop() {
  const { address } = useAccount()
  const [override, setOverride] = useState<{ address: string; selection: SkinSelection } | null>(null)

  const catalogQuery = useReadContracts({
    contracts: SKIN_IDS.map((id) => ({
      address: SKINS_ADDRESS,
      abi: arenaSkinsAbi,
      functionName: 'skins' as const,
      args: [BigInt(id)] as const,
      chainId: arcTestnet.id,
    })),
    query: { enabled: Boolean(SKINS_ADDRESS), refetchInterval: 20_000 },
  })

  const ownedQuery = useReadContract({
    address: SKINS_ADDRESS,
    abi: arenaSkinsAbi,
    functionName: 'balancesOf',
    args: address ? [address, SKIN_IDS.map((id) => BigInt(id))] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: Boolean(SKINS_ADDRESS && address), refetchInterval: 20_000 },
  })

  // Rare skins won from boxes live in a second contract; ownership is merged below.
  const boxOwnedQuery = useReadContract({
    address: BOXES_ADDRESS,
    abi: arenaBoxesAbi,
    functionName: 'balancesOf',
    args: address ? [address, BOX_IDS.map((id) => BigInt(id))] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: Boolean(BOXES_ADDRESS && address), refetchInterval: 20_000 },
  })

  // The wallet that owns the box contract may unlock every skin on its own device for testing.
  const ownerQuery = useReadContract({
    address: BOXES_ADDRESS,
    abi: arenaBoxesAbi,
    functionName: 'owner',
    chainId: arcTestnet.id,
    query: { enabled: Boolean(BOXES_ADDRESS) },
  })
  const isOwner = Boolean(address && ownerQuery.data && address.toLowerCase() === ownerQuery.data.toLowerCase())
  const [testFlag, setTestFlag] = useState(() => localStorage.getItem(TEST_KEY) === '1')
  const testUnlock = isOwner && testFlag
  const setTestUnlock = useCallback((on: boolean) => {
    localStorage.setItem(TEST_KEY, on ? '1' : '0')
    setTestFlag(on)
  }, [])

  const catalog = useMemo(() => {
    const map = new Map<number, SkinInfo>()
    catalogQuery.data?.forEach((entry, i) => {
      const r = entry.result as readonly [bigint, number, number, boolean] | undefined
      if (r) map.set(SKIN_IDS[i], { price: r[0], maxSupply: r[1], minted: r[2], active: r[3] })
    })
    return map
  }, [catalogQuery.data])

  // Skins the wallet really holds onchain (used by the marketplace).
  const realOwned = useMemo(() => {
    const set = new Set<number>()
    if (!address) return set
    ownedQuery.data?.forEach((n, i) => {
      if (n > 0n) set.add(SKIN_IDS[i])
    })
    boxOwnedQuery.data?.forEach((n, i) => {
      if (n > 0n) set.add(BOX_IDS[i])
    })
    return set
  }, [ownedQuery.data, boxOwnedQuery.data, address])

  // Owner test mode shows every skin as owned on this device.
  const owned = useMemo(() => {
    if (!address || !testUnlock) return realOwned
    return new Set<number>([...SKIN_IDS, ...BOX_IDS])
  }, [realOwned, address, testUnlock])

  const stored = useMemo(() => {
    if (!address) return DEFAULT_SELECTION
    return override?.address === address ? override.selection : readSelection(address)
  }, [address, override])

  const equipped = useMemo<SkinSelection>(
    () => ({
      character: owned.has(stored.character) ? stored.character : 0,
      gun: owned.has(stored.gun) ? stored.gun : 0,
      effect: owned.has(stored.effect) ? stored.effect : 0,
    }),
    [stored, owned],
  )

  // The game reads the equipped skins from its own object, outside React.
  useEffect(() => {
    getGame().skin = equipped
  }, [equipped])

  const equip = useCallback(
    (kind: SkinKind, id: number) => {
      if (!address) return
      const next = { ...stored, [kind]: id }
      localStorage.setItem(storageKey(address), JSON.stringify(next))
      setOverride({ address, selection: next })
    },
    [address, stored],
  )

  const refetch = useCallback(() => {
    void catalogQuery.refetch()
    void ownedQuery.refetch()
    void boxOwnedQuery.refetch()
  }, [catalogQuery, ownedQuery, boxOwnedQuery])

  /** Equip right after a purchase, using the skin's own kind. */
  const equipById = useCallback(
    (id: number) => {
      const def = getSkin(id)
      if (def) equip(def.kind, id)
    },
    [equip],
  )

  return { address, catalog, owned, realOwned, equipped, equip, equipById, refetch, loading: catalogQuery.isLoading, isOwner, testUnlock, setTestUnlock }
}

export type SkinShopState = ReturnType<typeof useSkinShop>
