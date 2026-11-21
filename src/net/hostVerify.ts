import { createPublicClient, http } from 'viem'
import { arcTestnet } from 'viem/chains'
import { asAddress, createOwnership, type JoinClaim, type Verified } from './ownership'

export interface ContractAddresses {
  skins?: string
  boxes?: string
  boosts?: string
}

/** The wallet check a browser-hosted room uses: the same code as the server, reading Arc Testnet from the host's browser. */
export function makeVerifier(addresses: ContractAddresses): (nonce: string, claim: JoinClaim) => Promise<Verified | { error: string }> {
  const owner = createOwnership({
    client: createPublicClient({ chain: arcTestnet, transport: http() }),
    skins: asAddress(addresses.skins),
    boxes: asAddress(addresses.boxes),
    boosts: asAddress(addresses.boosts),
  })
  return owner.verifyJoin
}
