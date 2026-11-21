import { useEffect, useState } from 'react'
import { arcTestnet } from 'viem/chains'
import { ArrowDownToLine, Check, ChevronDown, Clock, Coins, ExternalLink, Loader2, Skull, Trophy } from 'lucide-react'
import { DESCENT_MIN_FLOORS } from '@/abi/arenaDescent'
import { stepText, useDescent, type DescentHandle } from '@/hooks/useDescent'
import type { CoopHandle } from '@/hooks/useCoop'
import { DESCENT_SQUAD } from '@/net/protocol'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { formatUsdc } from '@/onchain-money'

const PRIMARY = 'flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#0B1B3A] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50'
const GHOST = 'flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/30 px-5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50'
const usd = (v: bigint) => formatUsdc(v)

/** What the wallet is doing right now, with a link to the transaction. */
function FlowLine({ d }: { d: DescentHandle }) {
  const { flow } = d
  if (flow.step === 'idle') return null
  if (flow.step === 'error') {
    return (
      <p role="alert" className="max-w-md text-pretty text-sm text-red-300">
        {flow.message}
      </p>
    )
  }
  const done = flow.step === 'done'
  return (
    <p className={`flex max-w-md flex-wrap items-center justify-center gap-2 text-pretty text-sm ${done ? 'text-emerald-300' : 'text-sky-200'}`} role="status">
      {done ? <Check size={14} aria-hidden /> : <Loader2 className="size-4 animate-spin" aria-hidden />}
      {done ? 'Done.' : stepText(flow.step)}
      {flow.hash && (
        <a className="inline-flex items-center gap-1 underline" href={buildTxExplorerUrl(arcTestnet.id, flow.hash)} target="_blank" rel="noreferrer">
          View <ExternalLink size={12} aria-hidden />
        </a>
      )}
    </p>
  )
}

function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const s = Math.max(0, Math.round((until - now) / 1000))
  return (
    <span className="tabular-nums">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  )
}

/** Lobby side of Endless Descent: rules, prizes, who has paid, and the pay button. */
export function DescentLobbyPanel({ coop }: { coop: CoopHandle }) {
  const d = useDescent(coop)
  const room = coop.state.room
  const [topUp, setTopUp] = useState('10')
  if (!room || room.mode !== 'descent' || !room.descent) return null
  const ds = room.descent
  const full = room.members.length === DESCENT_SQUAD
  const everyoneOnline = room.members.every((m) => m.connected)
  const paidCount = ds.paid.length
  const stage = ds.stage

  if (!d.enabled) {
    return <p className="text-sm text-amber-300">Endless Descent is not set up in this app yet.</p>
  }

  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/5 p-3 text-left">
      <div className="flex w-full items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-base font-bold text-amber-200">
          <ArrowDownToLine size={16} aria-hidden /> Endless Descent
        </p>
        <p className="text-xs text-slate-300">
          Entry <b className="text-white">{usd(d.fee)} USDC</b> each · Prize pool <b className="text-white">{usd(d.pool)} USDC</b>
        </p>
      </div>
      <p className="text-pretty text-xs text-slate-300">
        Exactly {DESCENT_SQUAD} players. Everyone pays, then the squad dives floor after floor until all are down. From floor {DESCENT_MIN_FLOORS} the deeper you reach, the bigger the share of the
        pool you win, split equally among everyone who stayed to the end. Anyone who leaves forfeits their share.
      </p>

      <ul className="grid w-full grid-cols-4 gap-1 text-center text-xs sm:grid-cols-7" aria-label="Prize by floor">
        {d.prizes.map((p) => (
          <li key={p.floors} className="rounded-xl bg-white/10 px-1 py-1.5">
            <p className="text-slate-400">Floor {p.floors}</p>
            <p className="font-semibold tabular-nums text-amber-200">{usd(p.payout)}</p>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-slate-400">Prize for the whole squad if the pool stays as it is now. Each stayer gets an equal share.</p>

      <ul className="flex w-full flex-wrap justify-center gap-2" aria-label="Who has paid">
        {room.members.map((m) => {
          const paid = ds.paid.includes(m.address.toLowerCase())
          return (
            <li key={m.id} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${paid ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-slate-300'}`}>
              {paid ? <Check size={12} aria-hidden /> : <Coins size={12} aria-hidden />} {m.name}
            </li>
          )
        })}
      </ul>

      {!full && (
        <p className="text-sm text-slate-200">
          Waiting for <b>{DESCENT_SQUAD - room.members.length}</b> more {DESCENT_SQUAD - room.members.length === 1 ? 'player' : 'players'}. The dive needs exactly {DESCENT_SQUAD}.
        </p>
      )}
      {full && !everyoneOnline && <p className="text-sm text-amber-300">Wait for everyone to be connected.</p>}

      {full && everyoneOnline && stage !== 'cancelled' && !d.hasPaid && (
        <button onClick={() => void d.pay()} disabled={d.busy} className={PRIMARY}>
          {d.busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Coins size={16} aria-hidden />}
          Pay {usd(d.fee)} USDC and join the dive
        </button>
      )}
      {d.hasPaid && stage === 'paying' && (
        <p className="flex items-center gap-2 text-sm text-emerald-200">
          <Loader2 className="size-4 animate-spin" aria-hidden /> You are in. {paidCount} of {DESCENT_SQUAD} have paid. Starts when everyone has.
        </p>
      )}
      {stage === 'paying' && (
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <Clock size={12} aria-hidden /> Time left to pay <Countdown until={ds.deadline} />
        </p>
      )}

      {stage === 'cancelled' && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-pretty text-center text-sm text-amber-300">{ds.note ?? 'This run was cancelled.'}</p>
          {d.refundable && (
            <button onClick={() => void d.refund()} disabled={d.busy} className={PRIMARY}>
              Take my {usd(d.fee)} USDC back
            </button>
          )}
          {!d.refundable && d.hasPaid && <p className="text-xs text-emerald-200">Your fee has been refunded.</p>}
          {room.hostId === room.you && (
            <button onClick={() => coop.client.backToLobby()} className={GHOST}>
              New attempt
            </button>
          )}
        </div>
      )}

      <FlowLine d={d} />

      <details className="w-full text-xs text-slate-300">
        <summary className="flex min-h-11 cursor-pointer items-center gap-1 text-slate-300">
          <ChevronDown size={14} aria-hidden /> Add to the prize pool
        </summary>
        <form
          className="flex flex-wrap items-center gap-2 pb-1"
          onSubmit={(e) => {
            e.preventDefault()
            void d.fund(topUp)
          }}
        >
          <input
            value={topUp}
            onChange={(e) => setTopUp(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            aria-label="USDC to add"
            className="min-h-11 w-28 rounded-full bg-white/10 px-4 text-center text-sm tabular-nums"
          />
          <button type="submit" disabled={d.busy || !d.address} className={GHOST}>
            Add USDC
          </button>
          <span className="text-slate-400">Anyone can add. It cannot be withdrawn, it only pays squads.</span>
        </form>
      </details>
    </div>
  )
}

/** After a wipe: what the squad reached, whether the prize is credited yet, and the claim button. */
export function DescentResult({ coop }: { coop: CoopHandle }) {
  const d = useDescent(coop)
  const room = coop.state.room
  if (!room?.descent) return null
  const ds = room.descent
  const isHost = room.hostId === room.you
  const mine = d.address?.toLowerCase() ?? ''
  const stayed = !ds.leavers.includes(mine)
  const settled = ds.stage === 'settled'
  const share = settled && ds.payout && ds.payout.stayers > 0 && stayed ? BigInt(ds.payout.totalPaid) / BigInt(ds.payout.stayers) : 0n

  return (
    <div className="absolute inset-2 flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl bg-[#0B1210]/90 p-6 text-center text-white backdrop-blur-sm">
      <Skull size={30} className="text-red-300" aria-hidden />
      <h2 className="font-display text-balance text-3xl font-bold tracking-[-0.03em]">The squad fell on floor {ds.floors + 1}</h2>
      <p className="text-sm text-slate-300">
        <b className="text-white">{ds.floors}</b> {ds.floors === 1 ? 'floor' : 'floors'} cleared
      </p>

      {!settled && (
        <p className="flex items-center gap-2 text-sm text-sky-200">
          <Loader2 className="size-4 animate-spin" aria-hidden /> {ds.note ?? 'Settling the run onchain...'}
        </p>
      )}

      {settled && ds.floors < DESCENT_MIN_FLOORS && <p className="text-sm text-slate-300">Prizes start at floor {DESCENT_MIN_FLOORS}. Your fees joined the prize pool for the next squad.</p>}
      {settled && ds.floors >= DESCENT_MIN_FLOORS && ds.payout && (
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-6 py-3">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.1em] text-amber-200">
            <Trophy size={14} aria-hidden /> Squad prize
          </p>
          <p className="font-display text-3xl font-bold tabular-nums">{usd(BigInt(ds.payout.totalPaid))} USDC</p>
          <p className="text-xs text-slate-300">
            {ds.payout.stayers} {ds.payout.stayers === 1 ? 'player' : 'players'} stayed to the end
          </p>
          {stayed ? (
            <p className="text-sm text-emerald-200">
              Your share: <b className="tabular-nums">{usd(share)} USDC</b>
            </p>
          ) : (
            <p className="text-sm text-slate-300">You left early, so your share went to the others.</p>
          )}
        </div>
      )}

      {d.credits > 0n && (
        <button onClick={() => void d.claim()} disabled={d.busy} className={PRIMARY}>
          {d.busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trophy size={16} aria-hidden />}
          Claim {usd(d.credits)} USDC
        </button>
      )}
      <FlowLine d={d} />
      {ds.payout?.txHash && (
        <a className="inline-flex items-center gap-1 text-xs text-slate-400 underline" href={buildTxExplorerUrl(arcTestnet.id, ds.payout.txHash)} target="_blank" rel="noreferrer">
          Settlement transaction <ExternalLink size={12} aria-hidden />
        </a>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {isHost && settled && (
          <button onClick={() => coop.client.backToLobby()} className={PRIMARY}>
            Back to the lobby
          </button>
        )}
        <button onClick={() => coop.client.leave()} className={GHOST}>
          Leave room
        </button>
      </div>
      {!isHost && settled && <p className="text-xs text-slate-400">The host starts the next dive from the lobby. A new dive means paying again.</p>}
    </div>
  )
}
