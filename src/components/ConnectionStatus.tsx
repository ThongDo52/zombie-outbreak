import { Radio } from 'lucide-react'
import type { CoopState } from '@/net/coopClient'

const ROUTE_TEXT = { local: 'you are the host', server: 'game server', direct: 'direct to the host', relayed: 'through a relay', unknown: 'connecting' } as const

/** How your connection to the room is doing, and a reminder to the host to keep the page open. */
export function ConnectionStatus({ state, isHost }: { state: CoopState; isHost: boolean }) {
  if (!state.room) return null
  const ping = state.ping
  const dot = state.phase === 'reconnecting' ? 'bg-red-400' : ping === null ? 'bg-slate-500' : ping < 80 ? 'bg-emerald-400' : ping < 160 ? 'bg-amber-400' : 'bg-red-400'
  const route = state.route ? ROUTE_TEXT[state.route] : ROUTE_TEXT.unknown
  const hosting = state.hosting
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-xs text-slate-400" role="status">
      <span className="flex items-center gap-2 tabular-nums">
        <span className={`size-2 rounded-full ${dot}`} aria-hidden />
        {state.phase === 'reconnecting' ? 'Reconnecting...' : isHost && hosting ? `Hosting ${state.room.code}` : ping === null ? 'Measuring ping...' : `${ping} ms`}
        <Radio size={12} aria-hidden /> {route}
      </span>
      {isHost && hosting && (
        <span className="text-amber-300">
          Keep this page open: your friends play on your device.{hosting.inWorker ? '' : ' Your browser cannot run the match in the background, so it may pause when this tab is hidden.'}
          {hosting.relay ? '' : ' No relay is set up: friends on other networks (mobile data, some Wi-Fi) may not be able to join. Friends on your Wi-Fi always can.'}
        </span>
      )}
    </div>
  )
}
