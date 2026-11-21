import { useCallback, useEffect, useState } from 'react'
import { useModal } from 'connectkit'
import { Check, Clock, ExternalLink, HeartPulse, LifeBuoy, Loader2, Shield, X } from 'lucide-react'
import { toast } from 'sonner'
import { arcTestnet } from 'viem/chains'
import { BOOSTS_ADDRESS } from '@/abi/arenaBoosts'
import { BOOSTS, type BoostDef } from '@/game/boosts'
import type { BoostsState } from '@/hooks/useBoosts'
import { useBoostPurchase } from '@/hooks/useBoostPurchase'
import type { PurchaseStep } from '@/hooks/usePurchase'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { formatUsdc, parseUsdc } from '@/onchain-money'

const ICON = { life: LifeBuoy, heal: HeartPulse, armor: Shield } as const
const TINT = { life: '#FFE16A', heal: '#6EE7A8', armor: '#7FB0FF' } as const

const STEP_TEXT: Partial<Record<PurchaseStep, string>> = {
  checking: 'Checking your USDC balance...',
  'approve-wallet': 'Approve USDC in your wallet (step 1 of 2)',
  'approve-confirm': 'Waiting for the approval to confirm...',
  'buy-wallet': 'Confirm the purchase in your wallet (step 2 of 2)',
  'buy-confirm': 'Waiting for the purchase to confirm...',
}

function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

export function BoostShop({ boosts }: { boosts: BoostsState }) {
  const { address, info, available, nextPurchaseAt, refetch } = boosts
  const { setOpen } = useModal()
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  const onBought = useCallback(() => {
    refetch()
    toast.success('Boost added to your game')
  }, [refetch])
  const purchase = useBoostPurchase(onBought)
  const { state } = purchase

  if (!BOOSTS_ADDRESS) {
    return <div className="rounded-3xl bg-[#0B1210] p-6 text-sm text-slate-300">The boost shop is not configured yet.</div>
  }

  const wait = Math.max(0, nextPurchaseAt - now)
  const locked = Boolean(address) && wait > 0

  return (
    <section className="panel space-y-4 p-4 text-white sm:p-6">
      <header>
        <h2 className="view-title">Boosts</h2>
        <p className="text-pretty text-sm text-slate-300">
          Single-use help for a tough run, paid in USDC on Arc Testnet. You can buy one boost every 24 hours.
        </p>
      </header>

      {!address ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/5 p-4">
          <p className="text-sm text-slate-300">Connect your wallet to buy boosts.</p>
          <button onClick={() => setOpen(true)} className="min-h-11 rounded-full bg-white px-5 text-sm font-semibold text-[#0B1B3A] active:scale-95">
            Connect wallet
          </button>
        </div>
      ) : (
        <div className={`flex items-center gap-2 rounded-2xl border p-3 text-sm ${locked ? 'border-amber-300/40 bg-amber-300/10 text-amber-200' : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'}`}>
          <Clock size={16} />
          {locked ? (
            <span>
              Next boost available in <b className="tabular-nums">{clock(wait)}</b>
            </span>
          ) : (
            <span>You can buy one boost now.</span>
          )}
        </div>
      )}

      {state.step !== 'idle' && (
        <div
          className={`flex items-start justify-between gap-3 rounded-2xl border p-3 text-sm ${
            state.step === 'error' ? 'border-red-400/40 bg-red-500/10 text-red-200' : state.step === 'done' ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-white/15 bg-white/5'
          }`}
          role="status"
        >
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-medium">
              {state.step === 'done' ? <Check size={16} /> : state.step === 'error' ? <X size={16} /> : <Loader2 size={16} className="animate-spin" />}
              {state.step === 'done' ? 'Boost added to your game' : state.step === 'error' ? state.error : STEP_TEXT[state.step]}
            </p>
            {state.hash && (
              <a href={buildTxExplorerUrl(arcTestnet.id, state.hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline underline-offset-2">
                View transaction <ExternalLink size={12} />
              </a>
            )}
          </div>
          {!purchase.busy && (
            <button onClick={purchase.reset} aria-label="Dismiss" className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-white/10">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {BOOSTS.map((boost) => (
          <BoostCard
            key={boost.id}
            boost={boost}
            price={info.get(boost.id)?.price ?? parseUsdc(String(boost.price))}
            inactive={Boolean(info.get(boost.id) && !info.get(boost.id)?.active)}
            have={available[boost.kind]}
            connected={Boolean(address)}
            disabled={locked || purchase.busy}
            busy={purchase.busy && state.skinId === boost.id}
            onBuy={(price) => void purchase.buy(boost.id, price)}
            onConnect={() => setOpen(true)}
          />
        ))}
      </div>
      <p className="text-pretty text-xs text-slate-400">
        Bought boosts are loaded into your game automatically. Press F for Full Heal and G for Armor. Extra Life triggers by itself.
      </p>
    </section>
  )
}

interface CardProps {
  boost: BoostDef
  price: bigint
  inactive: boolean
  have: number
  connected: boolean
  disabled: boolean
  busy: boolean
  onBuy: (price: bigint) => void
  onConnect: () => void
}

function BoostCard({ boost, price, inactive, have, connected, disabled, busy, onBuy, onConnect }: CardProps) {
  const Icon = ICON[boost.kind]
  const color = TINT[boost.kind]
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl" style={{ background: `${color}22`, color }}>
          <Icon size={24} />
        </span>
        <div>
          <h3 className="font-display text-base font-bold leading-tight">{boost.name}</h3>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">{boost.how}</p>
        </div>
      </div>
      <p className="min-h-16 text-pretty text-sm text-slate-300">{boost.blurb}</p>
      <p className="text-xs font-medium tabular-nums" style={{ color }}>
        You have {have}
      </p>
      <button
        disabled={connected && (disabled || inactive)}
        onClick={() => (connected ? onBuy(price) : onConnect())}
        className="mt-auto flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-[#FF4B57] px-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        {inactive ? 'Unavailable' : connected ? `Buy ${formatUsdc(price)} USDC` : 'Connect to buy'}
      </button>
    </article>
  )
}
