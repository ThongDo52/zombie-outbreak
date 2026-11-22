import { useEffect, useState } from 'react'
import { Globe, Loader2, Stethoscope } from 'lucide-react'
import { diagnoseIce, loadIceServers, type IceReport } from '@/net/ice'
import { probeRelay, type RelayProbe } from '@/net/relay'

/**
 * What this network allows, so a failed join is easy to explain. The online relay is checked as soon as
 * the lobby opens (it takes a moment and costs nothing); the WebRTC check runs on request.
 */
export function ConnectionTest() {
  const [state, setState] = useState<{ phase: 'idle' | 'running' | 'done' | 'error'; report?: IceReport }>({ phase: 'idle' })
  const [relay, setRelay] = useState<RelayProbe | null>(null)

  useEffect(() => {
    let alive = true
    void probeRelay().then((r) => alive && setRelay(r))
    return () => {
      alive = false
    }
  }, [])

  const run = async () => {
    setState({ phase: 'running' })
    try {
      const [report, probe] = await Promise.all([diagnoseIce(await loadIceServers()), probeRelay()])
      setRelay(probe)
      setState({ phase: 'done', report })
    } catch {
      setState({ phase: 'error' })
    }
  }

  const r = state.report
  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-2 text-center">
      <p className={`flex items-center gap-2 text-pretty text-xs ${relay?.ok ? 'text-emerald-300' : relay ? 'text-amber-300' : 'text-slate-400'}`} role="status">
        {relay ? <Globe size={14} aria-hidden /> : <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        {!relay
          ? 'Checking the online relay...'
          : relay.ok
            ? `Online play is ready: friends on any network can join${relay.ms !== null ? ` (relay answered in ${relay.ms} ms)` : ''}.`
            : relay.configured
              ? 'The online relay is set up but did not answer. Friends on other networks may not be able to join.'
              : 'No online relay is set up: friends on your own Wi-Fi can always join, friends on other networks only sometimes. See "Play online" in the README.'}
      </p>
      <button onClick={() => void run()} disabled={state.phase === 'running'} className="flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-4 text-xs font-semibold text-slate-300 transition hover:text-white disabled:opacity-60">
        {state.phase === 'running' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Stethoscope size={14} aria-hidden />}
        {state.phase === 'running' ? 'Testing your connection...' : 'Test my connection'}
      </button>
      {state.phase === 'error' && <p className="text-xs text-red-300">This browser could not run the test.</p>}
      {r && (
        <ul className="space-y-1 text-pretty text-xs text-slate-300" role="status">
          <li>{r.srflx > 0 ? 'Direct connections: your public address was found, so friends on easy networks can connect straight to you.' : 'Direct connections: your public address was not found. This network blocks them, so friends elsewhere need a relay to reach you.'}</li>
          <li className={r.relay > 0 || relay?.ok ? 'text-emerald-300' : 'text-amber-300'}>
            {relay?.ok
              ? 'Online relay: working. Anyone who cannot connect directly is carried by it automatically.'
              : r.relay > 0
                ? 'WebRTC relay (TURN): working. Friends on any network can join.'
                : r.relayConfigured
                  ? 'A WebRTC relay (TURN) is set up but did not answer. Check its key.'
                  : 'No relay of either kind answered. Friends on mobile data or strict Wi-Fi may not be able to join. Friends on your own Wi-Fi always can.'}
          </li>
        </ul>
      )}
    </div>
  )
}
