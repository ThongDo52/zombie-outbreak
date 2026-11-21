import { useState } from 'react'
import { SkinPreview } from '@/components/SkinPreview'
import { RARITY_COLOR, RARITY_LABEL, SKINS, type SkinDef } from '@/game/skins'
import type { MarketListing, MarketState } from '@/hooks/useMarket'
import type { SkinShopState } from '@/hooks/useSkinShop'
import { formatUsdc, parseUsdc } from '@/onchain-money'

/** Parses a USDC price typed by the player; undefined when it is not a valid positive amount. */
function parsePrice(text: string): bigint | undefined {
  try {
    const v = parseUsdc(text)
    return v > 0n ? v : undefined
  } catch {
    return undefined
  }
}

function payoutText(price: bigint | undefined, feeBps: number): string {
  if (price === undefined) return 'Enter a price in USDC'
  const fee = (price * BigInt(feeBps)) / 10_000n
  return `You receive ${formatUsdc(price - fee)} USDC after the ${(feeBps / 100).toFixed(1)}% fee`
}

/** "Sell" shows the skins in your wallet; "My listings" shows the ones already on sale. */
export function MarketSell({ mode, shop, market }: { mode: 'sell' | 'mine'; shop: SkinShopState; market: MarketState }) {
  if (!market.address) {
    return <p className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">Connect your wallet to sell skins.</p>
  }
  if (mode === 'sell') {
    const items = SKINS.filter((s) => shop.realOwned.has(s.id))
    return (
      <div className="space-y-3">
        <p className="text-pretty text-sm text-slate-300">
          Listing moves the skin into the market until it sells or you cancel. A listed skin is removed from your wallet, so it is unequipped.
        </p>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">You do not own any skins yet. Buy one in the Skins tab or open a box.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {items.map((skin) => (
              <SellCard key={skin.id} skin={skin} feeBps={market.feeBps} busy={market.busy} onList={(price) => void market.list(skin, price)} />
            ))}
          </ul>
        )}
      </div>
    )
  }
  const mine = market.listings.filter((l) => market.isMine(l))
  return mine.length === 0 ? (
    <p className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">You have nothing listed.</p>
  ) : (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {mine.map((l) => (
        <MineCard key={l.id} listing={l} feeBps={market.feeBps} busy={market.busy} onCancel={() => void market.cancel(l.id)} onReprice={(p) => void market.reprice(l.id, p)} />
      ))}
    </ul>
  )
}

function SellCard({ skin, feeBps, busy, onList }: { skin: SkinDef; feeBps: number; busy: boolean; onList: (price: bigint) => void }) {
  const [text, setText] = useState('')
  const price = parsePrice(text)
  const color = RARITY_COLOR[skin.rarity]
  return (
    <li className="flex flex-col items-center gap-1.5 rounded-2xl border bg-white/[0.04] p-3 text-center" style={{ borderColor: color }}>
      <SkinPreview kind={skin.kind} skin={skin} />
      <p className="w-full truncate text-sm font-semibold">{skin.name}</p>
      <p className="text-xs font-medium" style={{ color }}>{RARITY_LABEL[skin.rarity]}</p>
      <input
        value={text}
        onChange={(e) => setText(e.target.value.trim())}
        inputMode="decimal"
        placeholder="Price in USDC"
        aria-label={`Price for ${skin.name} in USDC`}
        className="min-h-11 w-full rounded-full bg-white/10 px-4 text-center text-sm tabular-nums placeholder:text-slate-500"
      />
      <p className="min-h-8 text-pretty text-[11px] text-slate-400">{payoutText(price, feeBps)}</p>
      <button
        onClick={() => price !== undefined && onList(price)}
        disabled={price === undefined || busy}
        className="min-h-11 w-full rounded-full bg-white text-sm font-semibold text-[#0B1B3A] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        List for sale
      </button>
    </li>
  )
}

function MineCard({ listing, feeBps, busy, onCancel, onReprice }: { listing: MarketListing; feeBps: number; busy: boolean; onCancel: () => void; onReprice: (price: bigint) => void }) {
  const [text, setText] = useState('')
  const price = parsePrice(text)
  const { skin } = listing
  const color = RARITY_COLOR[skin.rarity]
  return (
    <li className="flex flex-col items-center gap-1.5 rounded-2xl border bg-white/[0.04] p-3 text-center" style={{ borderColor: color }}>
      <SkinPreview kind={skin.kind} skin={skin} />
      <p className="w-full truncate text-sm font-semibold">{skin.name}</p>
      <p className="font-display text-lg font-bold tabular-nums">{formatUsdc(listing.price)} <span className="text-xs font-medium text-slate-400">USDC</span></p>
      <input
        value={text}
        onChange={(e) => setText(e.target.value.trim())}
        inputMode="decimal"
        placeholder="New price"
        aria-label={`New price for ${skin.name} in USDC`}
        className="min-h-11 w-full rounded-full bg-white/10 px-4 text-center text-sm tabular-nums placeholder:text-slate-500"
      />
      <p className="min-h-8 text-pretty text-[11px] text-slate-400">{payoutText(price, feeBps)}</p>
      <div className="grid w-full grid-cols-2 gap-2">
        <button
          onClick={() => price !== undefined && onReprice(price)}
          disabled={price === undefined || busy}
          className="min-h-11 rounded-full bg-white text-sm font-semibold text-[#0B1B3A] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reprice
        </button>
        <button onClick={onCancel} disabled={busy} className="min-h-11 rounded-full border border-white/25 text-sm font-semibold transition active:scale-95 disabled:opacity-50">
          Cancel
        </button>
      </div>
    </li>
  )
}
