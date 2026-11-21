import { ConnectKitButton } from 'connectkit'
import { TokenUSDC } from '@web3icons/react'
import { erc20Abi } from 'viem'
import { arcTestnet } from 'viem/chains'
import { useAccount, useReadContract } from 'wagmi'
import { getUsdc } from '@/onchain-facts'
import { formatUsdc } from '@/onchain-money'

const usdc = getUsdc(arcTestnet.id)

function UsdcBalance() {
  const { address } = useAccount()
  const { data, isLoading } = useReadContract({
    address: usdc?.address as `0x${string}` | undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: Boolean(address && usdc), refetchInterval: 10_000 },
  })
  if (!address) return null
  return (
    <span className="hidden min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold tabular-nums text-white ring-1 ring-white/15 backdrop-blur sm:flex">
      <TokenUSDC variant="branded" size={18} />
      {isLoading || data === undefined ? '...' : formatUsdc(data)}
    </span>
  )
}

export function WalletBar() {
  return (
    <div className="flex items-center gap-2">
      <a
        href="https://faucet.circle.com"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden min-h-11 items-center rounded-full px-3 text-xs font-semibold text-slate-300 underline-offset-2 transition hover:text-white hover:underline lg:flex"
      >
        Get test USDC
      </a>
      <UsdcBalance />
      <ConnectKitButton.Custom>
        {({ isConnected, show, truncatedAddress }) => (
          <button
            onClick={show}
            className={`flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-bold transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95 ${
              isConnected ? 'bg-white/10 text-white ring-1 ring-white/20 backdrop-blur' : 'bg-white text-[#0B1B3A] shadow-[0_8px_26px_-8px_rgba(255,75,87,0.7)]'
            }`}
          >
            {isConnected && <span className="size-2 rounded-full bg-emerald-400" aria-hidden />}
            {isConnected ? truncatedAddress : 'Connect wallet'}
          </button>
        )}
      </ConnectKitButton.Custom>
    </div>
  )
}
