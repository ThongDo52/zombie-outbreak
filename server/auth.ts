import { createPublicClient, http, type PublicClient } from 'viem'
import { arcTestnet } from 'viem/chains'
import { asAddress, createOwnership } from '../src/net/ownership'

export type { Holdings, Verified } from '../src/net/ownership'

/**
 * Wallet checks for the co-op server (the signature and ownership logic is shared with browser-hosted rooms,
 * see src/net/ownership.ts). This file only decides which RPC endpoint and contracts the server uses.
 */

const env = (name: string) => (process.env[name] ?? '').trim()

/** Arc Studio's RPC proxy when available, otherwise the chain's public endpoint. */
export function rpcUrl(): string | undefined {
  const own = env('RPC_URL_Arc_Testnet')
  if (own) return own
  const base = env('RPC_PROXY_BASE_URL')
  const chains = env('RPC_PROXY_CHAINS').split(',')
  if (base && chains.includes('Arc_Testnet')) return `${base}/api/rpc/Arc_Testnet?_rpc_token=${env('RPC_PROXY_TOKEN')}`
  return undefined
}

let client: PublicClient | undefined
export function chainClient(): PublicClient {
  client ??= createPublicClient({ chain: arcTestnet, transport: http(rpcUrl()) })
  return client
}

let owner: ReturnType<typeof createOwnership> | undefined
function ownership() {
  owner ??= createOwnership({
    client: chainClient(),
    skins: asAddress(env('VITE_SKINS_ADDRESS')),
    boxes: asAddress(env('VITE_BOXES_ADDRESS')),
    boosts: asAddress(env('VITE_BOOSTS_ADDRESS')),
  })
  return owner
}

export const readHoldings: ReturnType<typeof createOwnership>['readHoldings'] = (address) => ownership().readHoldings(address)
export const verifyJoin: ReturnType<typeof createOwnership>['verifyJoin'] = (nonce, claim) => ownership().verifyJoin(nonce, claim)
