import { useState } from 'react'
import { Loader2, Stethoscope } from 'lucide-react'
import { diagnoseIce, loadIceServers, type IceReport } from '@/net/ice'

/** A five-second check of what this network allows, so a failed join is easy to explain. */
export function ConnectionTest() {
  const [state, setState] = useState<{ phase: 'idle' | 'running' | 'done' | 'error'; report?: IceReport }>({ phase: 'idle' })

  const run = async () => {
    setState({ phase: 'running' })
    try {
      setState({ phase: 'done', report: await diagnoseIce(await loadIceServers()) })
    } catch {
      setState({ phase: 'error' })
    }
  }

  const r = state.report
  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-2 text-center">
      <button onClick={() => void run()} disabled={state.phase === 'running'} className="flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-4 text-xs font-semibold text-slate-300 transition hover:text-white disabled:opacity-60">
        {state.phase === 'running' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Stethoscope size={14} aria-hidden />}
        {state.phase === 'running' ? 'Testing your connection...' : 'Test my connection'}
      </button>
      {state.phase === 'error' && <p className="text-xs text-red-300">This browser could not run the test.</p>}
      {r && (
        <ul className="space-y-1 text-pretty text-xs text-slate-300" role="status">
          <li>{r.srflx > 0 ? 'Your public address was found: friends on easy networks can connect straight to you.' : 'Your public address was not found. This network blocks it, so friends elsewhere cannot reach you without a relay.'}</li>
          <li className={r.relay > 0 ? 'text-emerald-300' : 'text-amber-300'}>
            {r.relay > 0 ? 'A relay is working: friends on any network can join.' : r.relayConfigured ? 'A relay is set up but did not answer. Check its key.' : 'No relay is set up. Friends on mobile data or strict Wi-Fi may not be able to join. Friends on your own Wi-Fi always can.'}
          </li>
        </ul>
      )}
    </div>
  )
}
