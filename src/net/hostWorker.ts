import { createHostRuntime, type HostIn, type HostOut } from './hostRuntime'

// Runs a friend-hosted room off the page's main thread. A hidden tab slows the page's own timers down a lot,
// and a match that depends on them would stall; a worker keeps simulating.
const runtime = createHostRuntime((out: HostOut) => self.postMessage(out))
self.onmessage = (ev: MessageEvent<HostIn>) => runtime.handle(ev.data)
