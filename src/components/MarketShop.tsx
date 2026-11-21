import { useCallback, useMemo, useState } from 'react'
import { useModal } from 'connectkit'
import { MARKET_ADDRESS } from '@/abi/arenaMarket'
import { MarketSell } from '@/components/MarketSell'
import { MarketStatus } from '@/components/MarketStatus'
import { SkinPreview } from '@/components/SkinPreview'
import { RARITY_COLOR, RARITY_LABEL, type Rarity, type SkinKind } from '@/game/skins'
import { useMarket, type MarketListing } from '@/hooks/useMarket'
import type { SkinShopState } from '@/hooks/useSkinShop'
import { formatUsdc } from '@/onchain-money'

type Tab = 'browse' | 'sell' | 'mine'
type Sort = 'new' | 'low' | 'high'

const RARITIES: Rarity[] = ['mythic', 'legendary', 'epic', 'rare', 'common']

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** Marketplace where players resell skins to each other for USDC. */
export function MarketShop({ shop }: { shop: SkinShopState }) {
  const { setOpen } = useModal()
  const [tab, setTab] = useState<Tab>('browse')
  const [kind, setKind] = useState<SkinKind | 'all'>('all')
  const [rarity, setRarity] = useState<Rarity | 'all'>('all')
  const [sort, setSort] = useState<Sort>('new')
  const onChanged = useCallback(() => shop.refetch(), [shop])
  const market = useMarket(onChanged)
  const { flow } = market

  const visible = useMemo(() => {
    const out = market.listings.filter((l) => (kind === 'all' || l.skin.kind === kind) && (rarity === 'all' || l.skin.rarity === rarity))
    if (sort === 'low') out.sort((a, b) => (a.price < b.price ? -1 : 1))
    if (sort === 'high') out.sort((a, b) => (a.price > b.price ? -1 : 1))
    return out
  }, [market.listings, kind, rarity, sort])

  if (!MARKET_ADDRESS) {
    return <div className="rounded-3xl bg-[#0B1210] p-6 text-sm text-slate-300">The market is not configured yet.</div>
  }

  return (
    <section className="panel space-y-4 p-4 text-white sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="view-title">Market</h2>
          <p className="text-pretty text-sm text-slate-300">
            Buy and sell skins with other players for USDC. {(market.feeBps / 100).toFixed(1)}% fee per sale.
          </p>
        </div>
        <dl className="flex gap-4 text-right text-xs text-slate-400">
          <div><dt>For sale</dt><dd className="font-display text-lg font-bold tabular-nums text-white">{market.listings.length}</dd></div>
          <div><dt>Sales</dt><dd className="font-display text-lg font-bold tabular-nums text-white">{market.totalSales}</dd></div>
          <div><dt>Volume</dt><dd className="font-display text-lg font-bold tabular-nums text-white">{formatUsdc(market.totalVolume)}</dd></div>
        </dl>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-white/10 p-1">
          {([['browse', 'Browse'], ['sell', 'Sell'], ['mine', 'My listings']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`min-h-11 rounded-full px-4 text-sm font-semibold transition ${tab === id ? 'bg-white text-[#0B1B3A]' : 'text-slate-300 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {!market.address && (
          <button onClick={() => setOpen(true)} className="min-h-11 rounded-full bg-white px-5 text-sm font-semibold text-[#0B1B3A] active:scale-95">
            Connect wallet
          </button>
        )}
      </div>

      <MarketStatus flow={flow} onClose={market.reset} />

      {tab === 'browse' && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select value={kind} onChange={(e) => setKind(e.target.value as SkinKind | 'all')} className="min-h-11 rounded-full bg-white/10 px-3 text-sm" aria-label="Type">
              <option value="all">All types</option>
              <option value="character">Characters</option>
              <option value="gun">Guns</option>
            </select>
            <select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | 'all')} className="min-h-11 rounded-full bg-white/10 px-3 text-sm" aria-label="Rarity">
              <option value="all">Any rarity</option>
              {RARITIES.map((r) => <option key={r} value={r}>{RARITY_LABEL[r]}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="min-h-11 rounded-full bg-white/10 px-3 text-sm" aria-label="Sort">
              <option value="new">Newest</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
            </select>
          </div>
          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">
              {market.loading ? 'Loading listings...' : 'Nothing for sale yet. List one of your skins in the Sell tab.'}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {visible.map((l) => (
                <ListingCard key={l.id} listing={l} mine={market.isMine(l)} busy={market.busy} onBuy={() => void market.buy(l)} />
              ))}
            </ul>
          )}
        </>
      )}

      {tab !== 'browse' && <MarketSell mode={tab} shop={shop} market={market} />}
    </section>
  )
}

function ListingCard({ listing, mine, busy, onBuy }: { listing: MarketListing; mine: boolean; busy: boolean; onBuy: () => void }) {
  const { skin } = listing
  const color = RARITY_COLOR[skin.rarity]
  return (
    <li className="flex flex-col items-center gap-1.5 rounded-2xl border bg-white/[0.04] p-3 text-center" style={{ borderColor: color }}>
      <SkinPreview kind={skin.kind} skin={skin} />
      <p className="w-full truncate text-sm font-semibold">{skin.name}</p>
      <p className="text-xs font-medium" style={{ color }}>{RARITY_LABEL[skin.rarity]}</p>
      <p className="font-display text-lg font-bold tabular-nums">{formatUsdc(listing.price)} <span className="text-xs font-medium text-slate-400">USDC</span></p>
      <p className="text-[11px] text-slate-500">Seller {shortAddress(listing.seller)}</p>
      <button
        onClick={onBuy}
        disabled={mine || busy}
        className="min-h-11 w-full rounded-full bg-white text-sm font-semibold text-[#0B1B3A] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {mine ? 'Your listing' : 'Buy'}
      </button>
    </li>
  )
}
