import { useCallback, useState } from 'react'
import { useModal } from 'connectkit'
import { Check, ExternalLink, Gift, Loader2, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { isAddress } from 'viem'
import { arcTestnet } from 'viem/chains'
import { SKINS_ADDRESS } from '@/abi/arenaSkins'
import { OwnerTestToggle } from '@/components/OwnerTestToggle'
import { usePurchase, type PurchaseStep } from '@/hooks/usePurchase'
import type { SkinShopState } from '@/hooks/useSkinShop'
import { RARITY_COLOR, SHOP_SKINS, type SkinDef, type SkinKind } from '@/game/skins'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { formatUsdc, parseUsdc } from '@/onchain-money'
import { SkinPreview } from './SkinPreview'

const TABS: { id: SkinKind; label: string }[] = [
  { id: 'character', label: 'Characters' },
  { id: 'gun', label: 'Gun skins' },
  { id: 'effect', label: 'Kill effects' },
]

const STEP_TEXT: Partial<Record<PurchaseStep, string>> = {
  checking: 'Checking your USDC balance...',
  'approve-wallet': 'Approve USDC in your wallet (step 1 of 2)',
  'approve-confirm': 'Waiting for the approval to confirm...',
  'buy-wallet': 'Confirm the purchase in your wallet (step 2 of 2)',
  'buy-confirm': 'Waiting for the purchase to confirm...',
}

export function SkinShop({ shop }: { shop: SkinShopState }) {
  const { address, catalog, owned, equipped, equip, equipById, refetch } = shop
  const { setOpen } = useModal()
  const [tab, setTab] = useState<SkinKind>('character')
  const [gift, setGift] = useState(false)
  const [recipient, setRecipient] = useState('')

  const onBought = useCallback(
    (id: number, wasGift: boolean) => {
      refetch()
      if (!wasGift) equipById(id)
      toast.success(wasGift ? 'Gift sent' : 'Skin unlocked and equipped')
    },
    [refetch, equipById],
  )
  const purchase = usePurchase(onBought)
  const giftTo = gift && isAddress(recipient) ? (recipient) : null
  const items = SHOP_SKINS.filter((s) => s.kind === tab)
  const { state } = purchase

  if (!SKINS_ADDRESS) {
    return <div className="rounded-3xl bg-[#0B1210] p-6 text-sm text-slate-300">The skin shop is not configured yet.</div>
  }

  const onBuy = (skin: SkinDef, price: bigint) => {
    const to = giftTo ?? address
    if (!to) return
    void purchase.buy(skin.id, price, to, Boolean(giftTo))
  }

  return (
    <section className="panel space-y-4 p-4 text-white sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="view-title">Skin Shop</h2>
          <p className="text-pretty text-sm text-slate-300">Cosmetics only. No gameplay advantage. Paid in USDC on Arc Testnet.</p>
        </div>
        <div className="flex gap-1 rounded-full bg-white/10 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-11 rounded-full px-4 text-sm font-semibold transition ${tab === t.id ? 'bg-white text-[#0B1B3A]' : 'text-slate-300 hover:text-white'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <OwnerTestToggle shop={shop} />

      {!address && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/5 p-4">
          <p className="text-sm text-slate-300">Connect your wallet to buy and equip skins.</p>
          <button onClick={() => setOpen(true)} className="min-h-11 rounded-full bg-white px-5 text-sm font-semibold text-[#0B1B3A] active:scale-95">
            Connect wallet
          </button>
        </div>
      )}

      {address && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={gift} onChange={(e) => setGift(e.target.checked)} className="size-4 accent-[#FF4B57]" />
            <Gift size={16} /> Buy as a gift for another wallet
          </label>
          {gift && (
            <>
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value.trim())}
                placeholder="Recipient wallet address (0x...)"
                spellCheck={false}
                className="min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 font-mono text-sm outline-none focus:border-white/50"
              />
              {recipient && !giftTo && <p className="text-xs text-red-300">That is not a valid wallet address.</p>}
            </>
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
              {state.step === 'done' ? (state.gift ? 'Gift sent' : 'Skin unlocked and equipped') : state.step === 'error' ? state.error : STEP_TEXT[state.step]}
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card
          name="Default"
          blurb="The standard issue look."
          kind={tab}
          isOwned
          isEquipped={equipped[tab] === 0}
          action={<Equip disabled={!address} equipped={equipped[tab] === 0} onClick={() => equip(tab, 0)} />}
        />
        {items.map((skin) => {
          const info = catalog.get(skin.id)
          const price = info?.price ?? parseUsdc(String(skin.price))
          const soldOut = Boolean(info && info.maxSupply > 0 && info.minted >= info.maxSupply)
          const inactive = Boolean(info && !info.active)
          const isOwned = owned.has(skin.id)
          const isEquipped = equipped[skin.kind] === skin.id
          const mine = state.skinId === skin.id && purchase.busy
          const supply = info && info.maxSupply > 0 ? `${Math.max(0, info.maxSupply - info.minted)} of ${info.maxSupply} left` : undefined
          return (
            <Card
              key={skin.id}
              skin={skin}
              name={skin.name}
              blurb={skin.blurb}
              kind={tab}
              supply={supply}
              isOwned={isOwned}
              isEquipped={isEquipped}
              action={
                isOwned && !giftTo ? (
                  <Equip disabled={!address} equipped={isEquipped} onClick={() => equip(skin.kind, skin.id)} />
                ) : (
                  <button
                    disabled={purchase.busy || soldOut || inactive || Boolean(gift && address && !giftTo)}
                    onClick={() => (address ? onBuy(skin, price) : setOpen(true))}
                    className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-[#FF4B57] px-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
                  >
                    {mine ? <Loader2 size={14} className="animate-spin" /> : giftTo ? <Gift size={14} /> : <Sparkles size={14} />}
                    {soldOut ? 'Sold out' : inactive ? 'Unavailable' : !address ? 'Connect to buy' : gift && !giftTo ? 'Enter address' : `${giftTo ? 'Gift' : 'Buy'} ${formatUsdc(price)} USDC`}
                  </button>
                )
              }
            />
          )
        })}
      </div>
    </section>
  )
}

function Equip({ equipped, disabled, onClick }: { equipped: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled || equipped}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold transition active:scale-95 ${
        equipped ? 'border border-emerald-400/50 text-emerald-300' : 'bg-white text-[#0B1B3A] disabled:opacity-50'
      }`}
    >
      {equipped && <Check size={14} />}
      {equipped ? 'Equipped' : 'Equip'}
    </button>
  )
}

interface CardProps {
  skin?: SkinDef
  name: string
  blurb: string
  kind: SkinKind
  supply?: string
  isOwned: boolean
  isEquipped: boolean
  action: React.ReactNode
}

function Card({ skin, name, blurb, kind, supply, isOwned, isEquipped, action }: CardProps) {
  const color = skin ? RARITY_COLOR[skin.rarity] : '#9FB0C8'
  return (
    <article className={`flex flex-col gap-2 rounded-2xl border p-3 ${isEquipped ? 'border-emerald-400/50 bg-emerald-400/5' : 'border-white/10 bg-white/5'}`}>
      <div className="grid place-items-center overflow-hidden rounded-xl bg-black/30">
        <SkinPreview kind={kind} skin={skin} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold leading-tight">{name}</h3>
        {skin && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color, background: `${color}22` }}>
            {skin.rarity}
          </span>
        )}
      </div>
      <p className="min-h-10 text-pretty text-xs text-slate-300">{blurb}</p>
      {supply && <p className="text-[11px] font-medium tabular-nums text-amber-300">{supply}</p>}
      {isOwned && skin && <p className="text-[11px] font-medium text-emerald-300">You own this</p>}
      <div className="mt-auto">{action}</div>
    </article>
  )
}
