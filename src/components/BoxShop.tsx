import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useModal } from 'connectkit'
import { ExternalLink, Gift, Loader2, Lock, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { isAddress } from 'viem'
import { arcTestnet } from 'viem/chains'
import { BOXES_ADDRESS } from '@/abi/arenaBoxes'
import { useBoxes, type BoxResult, type BoxStep } from '@/hooks/useBoxes'
import type { SkinShopState } from '@/hooks/useSkinShop'
import { BOX_SKINS, getSkin, RARITY_COLOR, RARITY_LABEL, type Rarity, type SkinDef } from '@/game/skins'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { formatUsdc } from '@/onchain-money'
import { BoxStage, type StagePhase } from './BoxStage'
import { OwnerTestToggle } from './OwnerTestToggle'
import { SkinPreview } from './SkinPreview'

const TIERS: readonly Rarity[] = ['rare', 'epic', 'legendary', 'mythic']
const ODDS: Record<Rarity, number> = { common: 0, rare: 62, epic: 28, legendary: 8, mythic: 2 }

const STEP_TEXT: Partial<Record<BoxStep, string>> = {
  checking: 'Checking your USDC...',
  'approve-wallet': 'Approve USDC in your wallet (step 1 of 2)',
  'approve-confirm': 'Waiting for the approval to confirm...',
  'buy-wallet': 'Confirm the purchase in your wallet (step 2 of 2)',
  'buy-confirm': 'Waiting for the purchase to confirm...',
  waiting: 'Drawing verifiable randomness. This takes a few seconds...',
  'open-wallet': 'Confirm opening your box in your wallet',
  'open-confirm': 'Opening your box...',
  'refund-wallet': 'Confirm the refund in your wallet',
  'refund-confirm': 'Waiting for the refund to confirm...',
}

export function BoxShop({ shop }: { shop: SkinShopState }) {
  const { setOpen } = useModal()
  const { address, owned, equipped, equip, equipById, refetch } = shop
  const [gift, setGift] = useState('')
  const [reveal, setReveal] = useState<'hidden' | 'opening' | 'shown'>('hidden')
  const [now, setNow] = useState(() => Date.now())

  const onOpened = useCallback(
    (r: BoxResult) => {
      refetch()
      equipById(r.itemId)
      const def = getSkin(r.itemId)
      toast.success(def ? `${RARITY_LABEL[def.rarity]}: ${def.name}` : 'Skin unlocked')
    },
    [equipById, refetch],
  )
  const box = useBoxes(onOpened)
  const { flow, pending, pity, pityThreshold, price, waitingSince, busy } = box
  const result = flow.result
  const resultDef = result ? getSkin(result.itemId) : undefined

  useEffect(() => {
    if (!result) return
    const start = window.setTimeout(() => setReveal('opening'), 0)
    const show = window.setTimeout(() => setReveal('shown'), 1600)
    return () => {
      window.clearTimeout(start)
      window.clearTimeout(show)
    }
  }, [result])

  useEffect(() => {
    if (!waitingSince && !(pending && !pending.fulfilled)) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [waitingSince, pending])

  if (!BOXES_ADDRESS) {
    return <p className="rounded-3xl bg-[#0B1210] p-6 text-sm text-slate-300">The mystery box is not configured yet.</p>
  }

  const waitingForRandomness = Boolean(pending && !pending.fulfilled)
  const waitedSeconds = waitingSince ? Math.floor((now - waitingSince) / 1000) : 0
  const canRefund = Boolean(pending && !pending.fulfilled && (pending.refundable || waitedSeconds > 75))
  const giftTo = isAddress(gift) ? gift : undefined

  const phase: StagePhase =
    reveal === 'shown' ? 'revealed' : reveal === 'opening' ? 'opening' : busy || waitingForRandomness || flow.step === 'waiting' ? 'charging' : 'idle'
  const tier = result ? result.tier : null

  const remaining = pityThreshold ? Math.max(0, pityThreshold - pity) : null

  return (
    <section className="panel p-4 text-white sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="view-title">Mystery Box</h2>
          <p className="text-sm text-slate-300 text-pretty">One random rare skin per box. A small chance of a Mythic with the most spectacular effects.</p>
        </div>
        {price !== undefined && <p className="font-display text-xl font-bold tabular-nums">{formatUsdc(price)} USDC</p>}
      </div>

      <div className="mb-4">
        <OwnerTestToggle shop={shop} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <BoxStage phase={phase} tier={tier} />

          {reveal === 'shown' && result && resultDef ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.7, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
              className="flex w-full flex-col items-center gap-2 text-center"
            >
              <span className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[#0B1210]" style={{ background: RARITY_COLOR[resultDef.rarity] }}>
                {RARITY_LABEL[resultDef.rarity]}
              </span>
              <SkinPreview kind={resultDef.kind} skin={resultDef} className="h-[156px] w-[198px]" />
              <p className="font-display text-xl font-bold">{resultDef.name}</p>
              <p className="max-w-xs text-sm text-slate-300 text-pretty">{resultDef.blurb}</p>
              {result.pityTriggered && <p className="text-xs text-[#FF9BE8]">Pity reward: guaranteed Mythic after a long streak.</p>}
              <p className="text-xs text-slate-400">Equipped automatically. Change it anytime in the collection.</p>
              <button type="button" onClick={box.reset} className="mt-1 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-[#0B1B3A] transition active:scale-95">
                Open another
              </button>
            </motion.div>
          ) : (
            <Action box={box} address={address} giftTo={giftTo} canRefund={canRefund} waitedSeconds={waitedSeconds} onConnect={() => setOpen(true)} reveal={reveal} />
          )}

          {flow.step === 'error' && <p role="alert" className="text-center text-sm text-red-300">{flow.error}</p>}
          {STEP_TEXT[flow.step] && reveal === 'hidden' && (
            <p className="flex items-center gap-2 text-center text-sm text-slate-300">
              <Loader2 className="size-4 animate-spin" aria-hidden /> {STEP_TEXT[flow.step]}
            </p>
          )}
          {flow.hash && (
            <a href={buildTxExplorerUrl(arcTestnet.id, flow.hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-slate-400 underline-offset-2 hover:underline">
              View transaction <ExternalLink className="size-3" aria-hidden />
            </a>
          )}

          <details className="w-full text-sm text-slate-300">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2"><Gift className="size-4" aria-hidden /> Send the skin to a different wallet</summary>
            <label className="mt-1 block">
              <span className="sr-only">Recipient wallet address</span>
              <input
                value={gift}
                onChange={(e) => setGift(e.target.value.trim())}
                placeholder="0x... (optional)"
                className="min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-slate-500"
              />
            </label>
            {gift && !giftTo && <p className="mt-1 text-xs text-red-300">That is not a valid address, the skin will go to you.</p>}
          </details>
        </div>

        <div className="flex flex-col gap-4">
          <Odds pity={pity} threshold={pityThreshold} remaining={remaining} />
          <Collection owned={owned} equipped={equipped} onEquip={equip} />
        </div>
      </div>
    </section>
  )
}

function Action({
  box, address, giftTo, canRefund, waitedSeconds, onConnect, reveal,
}: {
  box: ReturnType<typeof useBoxes>
  address: string | undefined
  giftTo: `0x${string}` | undefined
  canRefund: boolean
  waitedSeconds: number
  onConnect: () => void
  reveal: 'hidden' | 'opening' | 'shown'
}) {
  const { pending, busy, flow, price } = box
  const btn = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition active:scale-95 disabled:opacity-50'
  if (reveal === 'opening') return <p className="py-3 text-sm text-slate-300">Revealing...</p>
  if (!address) {
    return <button type="button" onClick={onConnect} className={`${btn} bg-white text-[#0B1B3A]`}>Connect wallet to open a box</button>
  }
  if (pending && pending.fulfilled && !busy && flow.step !== 'open-confirm') {
    return <button type="button" onClick={() => void box.open()} className={`${btn} bg-[#FF4FD8] text-white`}><Sparkles className="size-4" aria-hidden /> Open your box</button>
  }
  if (pending && !pending.fulfilled) {
    return (
      <div className="flex flex-col items-center gap-2 text-center text-sm text-slate-300">
        <p>Waiting for randomness ({waitedSeconds}s). Your payment is held safely and is refundable if it does not arrive.</p>
        {canRefund && (
          <button type="button" onClick={() => void box.refund()} disabled={busy} className={`${btn} border border-white/25 text-white`}>Refund my USDC</button>
        )}
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <button type="button" onClick={() => void box.buy(giftTo)} disabled={busy || price === undefined} className={`${btn} bg-[#8F6BFF] text-white`}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
        {price !== undefined ? `Open a box for ${formatUsdc(price)} USDC` : 'Loading price...'}
      </button>
      <p className="text-center text-xs text-slate-400 text-pretty">Plus a small randomness fee (about 0.1 USDC). Anything unused is returned right away.</p>
    </div>
  )
}

function Odds({ pity, threshold, remaining }: { pity: number; threshold: number | undefined; remaining: number | null }) {
  const counts = TIERS.map((r) => BOX_SKINS.filter((s) => s.rarity === r).length)
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.1em] text-slate-300">Drop rates</h3>
      <ul className="space-y-1.5">
        {TIERS.map((r, i) => (
          <li key={r} className="flex items-center gap-3 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: RARITY_COLOR[r] }} aria-hidden />
            <span className="w-24 font-medium">{RARITY_LABEL[r]}</span>
            <span className="tabular-nums text-slate-300">{ODDS[r]}%</span>
            <span className="ml-auto text-xs text-slate-400">{counts[i]} skins</span>
          </li>
        ))}
      </ul>
      {threshold ? (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-slate-300">
            <span>Mythic pity</span>
            <span className="tabular-nums">{pity} / {threshold}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#8F6BFF] to-[#FF4FD8]" style={{ width: `${Math.min(100, (pity / threshold) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-400 text-pretty">
            {remaining !== null && remaining <= 1 ? 'Your next box is a guaranteed Mythic.' : `A Mythic is guaranteed within ${remaining} more boxes. Winning one resets the count.`}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function Collection({
  owned, equipped, onEquip,
}: {
  owned: Set<number>
  equipped: SkinShopState['equipped']
  onEquip: SkinShopState['equip']
}) {
  const ownedCount = BOX_SKINS.filter((s) => owned.has(s.id)).length
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="mb-3 flex items-baseline justify-between text-sm font-semibold uppercase tracking-[0.1em] text-slate-300">
        <span>Collection</span>
        <span className="tabular-nums normal-case tracking-normal text-slate-400">{ownedCount} / {BOX_SKINS.length}</span>
      </h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {BOX_SKINS.map((skin) => (
          <CollectionCard key={skin.id} skin={skin} has={owned.has(skin.id)} active={equipped[skin.kind] === skin.id} onEquip={onEquip} />
        ))}
      </ul>
    </div>
  )
}

function CollectionCard({ skin, has, active, onEquip }: { skin: SkinDef; has: boolean; active: boolean; onEquip: SkinShopState['equip'] }) {
  const color = RARITY_COLOR[skin.rarity]
  return (
    <li className="flex flex-col items-center gap-1 rounded-xl border bg-black/20 p-2 text-center" style={{ borderColor: has ? color : 'rgba(255,255,255,0.1)' }}>
      <div className={has ? '' : 'pointer-events-none opacity-25 grayscale'}>
        <SkinPreview kind={skin.kind} skin={skin} className="h-[78px] w-[99px]" />
      </div>
      <p className="w-full truncate text-xs font-semibold">{has ? skin.name : '???'}</p>
      <p className="text-[11px] font-medium" style={{ color }}>{RARITY_LABEL[skin.rarity]}</p>
      {has ? (
        <button
          type="button"
          onClick={() => onEquip(skin.kind, active ? 0 : skin.id)}
          className="min-h-9 w-full rounded-full border border-white/20 text-xs font-semibold transition active:scale-95"
          style={active ? { background: color, color: '#0B1210', borderColor: color } : undefined}
        >
          {active ? 'Equipped' : 'Equip'}
        </button>
      ) : (
        <span className="flex min-h-9 items-center gap-1 text-xs text-slate-500"><Lock className="size-3" aria-hidden /> Locked</span>
      )}
    </li>
  )
}
