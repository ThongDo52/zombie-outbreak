import { createHostRuntime, type HostIn, type HostOut } from './hostRuntime'

export interface HostEngine {
  post(msg: HostIn): void
  terminate(): void
  /** True when the room runs in a worker; false when it had to fall back to the page itself. */
  readonly inWorker: boolean
}

/** Start the room's engine in a Web Worker, or in the page when workers are unavailable. */
export function createHostEngine(onOut: (out: HostOut) => void): HostEngine {
  try {
    const worker = new Worker(new URL('./hostWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (ev: MessageEvent<HostOut>) => onOut(ev.data)
    return { post: (m) => worker.postMessage(m), terminate: () => worker.terminate(), inWorker: true }
  } catch {
    const runtime = createHostRuntime(onOut)
    return { post: (m) => runtime.handle(m), terminate: () => runtime.handle({ kind: 'shutdown' }), inWorker: false }
  }
}
