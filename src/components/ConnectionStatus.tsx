import { Radio } from 'lucide-react'
import type { CoopState } from '@/net/coopClient'

const ROUTE_TEXT = {
  local: 'you are the host',
  server: 'game server',
  direct: 'direct to the host',
  relayed: 'through a WebRTC relay',
  relay: 'through the online relay',
  unknown: 'connecting',
} as const

/** How your connection to the room is doing, and a reminder to the host to keep the page open. */
export function ConnectionStatus({ state, isHost }: { state: CoopState; isHost: boolean }) {
  if (!state.room) return null
  const ping = state.ping
  // the online relay adds a hop, so its "good" is a little higher than a direct line's
  const slow = state.route === 'relay' ? 220 : 160
  const dot = state.phase === 'reconnecting' ? 'bg-red-400' : ping === null ? 'bg-slate-500' : ping < slow / 2 ? 'bg-emerald-400' : ping < slow ? 'bg-amber-400' : 'bg-red-400'
  const route = state.route ? ROUTE_TEXT[state.route] : ROUTE_TEXT.unknown
  const hosting = state.hosting
  const online = hosting ? hosting.paths.relay || hosting.turn : false
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-xs text-slate-400" role="status">
      <span className="flex items-center gap-2 tabular-nums">
        <span className={`size-2 rounded-full ${dot}`} aria-hidden />
        {state.phase === 'reconnecting' ? 'Reconnecting...' : isHost && hosting ? `Hosting ${state.room.code}` : ping === null ? 'Measuring ping...' : `${ping} ms`}
        <Radio size={12} aria-hidden /> {route}
      </span>
      {isHost && hosting && (
        <span className={online ? 'text-emerald-300' : 'text-amber-300'}>
          {hosting.paths.relay
            ? 'Online relay connected: friends on any network can join.'
            : hosting.turn
              ? 'Friends on other networks join through your WebRTC relay.'
              : 'No online relay: only friends on your Wi-Fi, or on networks that allow direct connections, can join.'}
          <span className="text-amber-300">
            {' '}Keep this page open: your friends play on your device.
            {hosting.inWorker ? '' : ' Your browser cannot run the match in the background, so it may pause when this tab is hidden.'}
            {hosting.paths.p2p ? '' : ' The room finder for direct connections did not answer, so everyone joins through the relay.'}
          </span>
        </span>
      )}
    </div>
  )
}
