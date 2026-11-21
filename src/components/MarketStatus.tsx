import { ExternalLink, Loader2, X } from 'lucide-react'
import { arcTestnet } from 'viem/chains'
import type { MarketFlow } from '@/hooks/useMarket'
import { buildTxExplorerUrl } from '@/onchain-facts'

const ACTION_TEXT = {
  buy: { wallet: 'Confirm the purchase in your wallet', confirm: 'Waiting for the purchase to confirm...', done: 'Purchased. The skin is now in your wallet.' },
  list: { wallet: 'Confirm the listing in your wallet', confirm: 'Waiting for the listing to confirm...', done: 'Listed for sale.' },
  cancel: { wallet: 'Confirm the cancellation in your wallet', confirm: 'Waiting for the cancellation to confirm...', done: 'Listing cancelled. The skin is back in your wallet.' },
  reprice: { wallet: 'Confirm the new price in your wallet', confirm: 'Waiting for the new price to confirm...', done: 'Price updated.' },
} as const

/** Progress of the current market transaction, with an explorer link and any error. */
export function MarketStatus({ flow, onClose }: { flow: MarketFlow; onClose: () => void }) {
  if (flow.step === 'idle' || !flow.action) return null
  const text = ACTION_TEXT[flow.action]
  const busy = flow.step !== 'done' && flow.step !== 'error'
  const message =
    flow.step === 'error'
      ? (flow.error ?? 'Something went wrong.')
      : flow.step === 'checking'
        ? 'Checking your wallet...'
        : flow.step === 'approve-wallet'
          ? flow.action === 'buy' ? 'Approve USDC in your wallet (step 1 of 2)' : 'Allow the market to hold your skin (step 1 of 2)'
          : flow.step === 'approve-confirm'
            ? 'Waiting for the approval to confirm...'
            : flow.step === 'action-wallet'
              ? text.wallet
              : flow.step === 'action-confirm'
                ? text.confirm
                : text.done
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-2xl border p-3 text-sm ${flow.step === 'error' ? 'border-red-400/40 bg-red-500/10 text-red-100' : 'border-white/15 bg-white/5'}`}
    >
      {busy && <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />}
      <p className="min-w-0 flex-1 text-pretty">{message}</p>
      {flow.hash && (
        <a
          href={buildTxExplorerUrl(arcTestnet.id, flow.hash) ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1 text-xs font-semibold text-sky-300 underline-offset-2 hover:underline"
        >
          View <ExternalLink size={12} aria-hidden />
        </a>
      )}
      {!busy && (
        <button onClick={onClose} aria-label="Dismiss" className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-white/10">
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  )
}
