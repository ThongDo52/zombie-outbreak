import { getAddress, isAddress, parseAbi, type Address, type PublicClient } from 'viem'
import { BOX_IDS, SKIN_IDS, type SkinSelection } from '@/game/skins'
import { HEAVY_WEAPONS } from '@/game/config'
import type { BoostCharges, WeaponId } from '@/game/types'
import { signInMessage } from './protocol'

/**
 * Wallet checks for co-op. A player proves they own an address by signing a one-time message, then the
 * skin and boost contracts are read so nobody can claim items they do not own. The same code runs on the
 * Endless Descent server and in the browser of a player who hosts a story or Survival room.
 */

const skinsAbi = parseAbi(['function balancesOf(address account, uint256[] ids) view returns (uint256[])'])
const boostsAbi = parseAbi(['function creditsOf(address account, uint256[] ids) view returns (uint256[])'])
const BOOST_IDS = [1n, 2n, 3n] as const

export interface OwnershipConfig {
  client: PublicClient
  skins?: Address
  boxes?: Address
  boosts?: Address
}

export interface Holdings {
  skins: Set<number>
  /** Boost credits bought onchain: life, heal, armor. */
  credits: BoostCharges
  at: number
}

export interface Verified {
  address: Address
  name: string
  skin: SkinSelection
  charges: BoostCharges
  /** Heavy weapons the player says they have earned. Only used in story co-op: progress is kept in the browser, so it cannot be proven. */
  unlocked: WeaponId[]
  notices: string[]
}

export interface JoinClaim {
  address: string
  signature: string
  skin: Partial<SkinSelection>
  charges: Partial<BoostCharges>
  unlocked?: unknown
}

const TTL_MS = 60_000
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0)

/** Turns a configured address string into a checksummed address, or nothing. */
export function asAddress(value: string | undefined): Address | undefined {
  const v = (value ?? '').trim()
  return isAddress(v) ? getAddress(v) : undefined
}

export function createOwnership(cfg: OwnershipConfig) {
  const cache = new Map<string, Holdings>()

  /** What the wallet really owns, cached for a minute. Read failures count as owning nothing. */
  async function readHoldings(address: Address): Promise<Holdings> {
    const key = address.toLowerCase()
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return hit
    const skins = new Set<number>()
    const credits: BoostCharges = { life: 0, heal: 0, armor: 0 }
    const c = cfg.client
    await Promise.all([
      cfg.skins
        ? c
            .readContract({ address: cfg.skins, abi: skinsAbi, functionName: 'balancesOf', args: [address, SKIN_IDS.map((i) => BigInt(i))] })
            .then((list) => list.forEach((n, i) => n > 0n && skins.add(SKIN_IDS[i])))
            .catch(() => undefined)
        : undefined,
      cfg.boxes
        ? c
            .readContract({ address: cfg.boxes, abi: skinsAbi, functionName: 'balancesOf', args: [address, BOX_IDS.map((i) => BigInt(i))] })
            .then((list) => list.forEach((n, i) => n > 0n && skins.add(BOX_IDS[i])))
            .catch(() => undefined)
        : undefined,
      cfg.boosts
        ? c
            .readContract({ address: cfg.boosts, abi: boostsAbi, functionName: 'creditsOf', args: [address, [...BOOST_IDS]] })
            .then((list) => {
              credits.life = Number(list[0] ?? 0n)
              credits.heal = Number(list[1] ?? 0n)
              credits.armor = Number(list[2] ?? 0n)
            })
            .catch(() => undefined)
        : undefined,
    ])
    const holdings = { skins, credits, at: Date.now() }
    cache.set(key, holdings)
    return holdings
  }

  /** Verifies the signature, then trims the claimed skins and boosts to what the wallet owns. */
  async function verifyJoin(nonce: string, claim: JoinClaim): Promise<Verified | { error: string }> {
    if (!isAddress(claim.address) || typeof claim.signature !== 'string' || claim.signature.length > 1000) return { error: 'Invalid wallet address.' }
    const address = getAddress(claim.address)
    let ok = false
    try {
      ok = await cfg.client.verifyMessage({ address, message: signInMessage(nonce), signature: claim.signature as `0x${string}` })
    } catch {
      ok = false
    }
    if (!ok) return { error: 'The wallet signature did not check out.' }

    const holdings = await readHoldings(address)
    const notices: string[] = []
    const pick = (id: number, label: string) => {
      if (id === 0) return 0
      if (holdings.skins.has(id)) return id
      notices.push(`${label} skin was not found in your wallet, so the default look is used.`)
      return 0
    }
    const skin: SkinSelection = {
      character: pick(num(claim.skin?.character), 'Your character'),
      gun: pick(num(claim.skin?.gun), 'Your gun'),
      effect: pick(num(claim.skin?.effect), 'Your kill effect'),
    }
    // Boost charges are limited to what was bought; the browser knows how many were already used.
    const charges: BoostCharges = {
      life: Math.min(num(claim.charges?.life), holdings.credits.life),
      heal: Math.min(num(claim.charges?.heal), holdings.credits.heal),
      armor: Math.min(num(claim.charges?.armor), holdings.credits.armor),
    }
    const unlocked = Array.isArray(claim.unlocked) ? HEAVY_WEAPONS.filter((w) => (claim.unlocked as unknown[]).includes(w)) : []
    return { address, name: `${address.slice(0, 6)}…${address.slice(-4)}`, skin, charges, unlocked, notices }
  }

  return { readHoldings, verifyJoin }
}
