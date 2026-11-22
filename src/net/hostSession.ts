import { CODE_ALPHABET, CODE_LENGTH } from './protocol'
import { createHostEngine } from './hostEngine'
import { loadIceServers } from './ice'
import { openHostPeer, type HostPeer } from './peer'
import { hasRelay, openRelayHost, RelayError, type RelayHost } from './relay'
import type { Link } from './transport'

/**
 * Hosting a room on your own device: a 5-letter code that friends type, the room itself (in a worker),
 * and the glue between the two. The host plays through a local link, the same path a friend uses.
 *
 * Friends can arrive two ways, and the host listens on both at once:
 *  - WebRTC, found through the PeerJS broker: straight between the two browsers when the networks allow it.
 *  - The online relay (relay.ts): a WebSocket meeting point that works from every network.
 * One of the two is enough to open the room.
 */

/** Which ways into the room are open right now. */
export interface HostPaths {
  /** Friends can connect directly (WebRTC). */
  p2p: boolean
  /** Friends on any network can connect through the online relay. */
  relay: boolean
}

export interface HostSession {
  code: string
  /** The host's own player connects through this. */
  local: Link
  /** The room runs in a worker. When false it runs in the page and a hidden tab can stall it. */
  inWorker: boolean
  /** A TURN server is configured for WebRTC. */
  turn: boolean
  paths: HostPaths
  close(): void
}

const newCode = () => {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

const LOCAL_ID = 0
/** Once one way in is open, the other gets this long to open too before the room is shown. */
const GRACE_MS = 3500

export async function startHosting(onClosed: (reason: string) => void, onPaths?: (paths: HostPaths) => void): Promise<HostSession> {
  const ice = await loadIceServers()

  let code = ''
  /** The two ways in, once they are open. */
  const ways: { peer: HostPeer | null; relay: RelayHost | null } = { peer: null, relay: null }
  const paths: HostPaths = { p2p: false, relay: false }
  const guests = new Map<number, Link>()
  let nextId = 1
  let engine: ReturnType<typeof createHostEngine> | null = null
  let ended = false
  /** The session has been handed to the caller, so changes to the ways in are reported from now on. */
  let live = false
  /** Guests that arrive before the room exists wait here (it only takes a moment). */
  let waiting: Link[] | null = []

  const setPath = (key: keyof HostPaths, up: boolean) => {
    if (paths[key] === up) return
    paths[key] = up
    if (live && !ended) onPaths?.({ ...paths })
  }

  const end = (reason: string) => {
    if (ended) return
    ended = true
    for (const g of [...guests.values()]) g.close()
    guests.clear()
    ways.peer?.destroy()
    ways.relay?.destroy()
    engine?.terminate()
    local.open = false
    onClosed(reason)
  }

  // messages that arrive before the host's own player starts listening are kept, then delivered in order
  let handler: ((text: string) => void) | null = null
  const early: string[] = []
  const toLocal = (text: string) => {
    if (handler) handler(text)
    else early.push(text)
  }
  const local: Link & { open: boolean } = {
    open: true,
    send: (text) => engine?.post({ kind: 'message', id: LOCAL_ID, text }),
    close: () => {
      if (!local.open) return
      engine?.post({ kind: 'disconnect', id: LOCAL_ID })
      end('The host left the room.')
    },
    get onMessage() {
      return handler
    },
    set onMessage(fn: ((text: string) => void) | null) {
      handler = fn
      while (fn && early.length > 0) fn(early.shift() as string)
    },
    onClose: null,
  }

  const seat = (link: Link) => {
    const id = nextId++
    guests.set(id, link)
    link.onMessage = (text) => engine?.post({ kind: 'message', id, text })
    link.onClose = () => {
      guests.delete(id)
      engine?.post({ kind: 'disconnect', id })
    }
    engine?.post({ kind: 'open', id })
  }
  const onGuest = (link: Link) => {
    if (ended) link.close()
    else if (waiting) waiting.push(link)
    else seat(link)
  }

  /**
   * Open both ways in under one code. Resolves when both have answered, or a little after the first one
   * opened. A way that opens later still joins the room. `conflict` means the code is taken somewhere.
   */
  const openPaths = (attemptCode: string): Promise<{ conflict: boolean; errors: Error[] }> =>
    new Promise((resolve) => {
      const state = { peerDone: false, relayDone: !hasRelay(), conflict: false, errors: [] as Error[], resolved: false }
      let grace: ReturnType<typeof setTimeout> | null = null
      const finish = () => {
        if (state.resolved) return
        state.resolved = true
        if (grace) clearTimeout(grace)
        resolve({ conflict: state.conflict, errors: state.errors })
      }
      const check = () => {
        if (state.conflict || (state.peerDone && state.relayDone)) finish()
        else if ((ways.peer || ways.relay) && !grace) grace = setTimeout(finish, GRACE_MS)
      }
      const stale = () => ended || code !== attemptCode

      openHostPeer(attemptCode, ice, onGuest)
        .then((p) => {
          if (stale()) {
            p.destroy()
            return
          }
          ways.peer = p
          setPath('p2p', true)
        })
        .catch((err: Error & { type?: string }) => {
          // a taken name is reported so another code can be picked
          if (err.type === 'unavailable-id') state.conflict = true
          else state.errors.push(err)
        })
        .finally(() => {
          state.peerDone = true
          check()
        })

      if (!state.relayDone) {
        openRelayHost(attemptCode, onGuest, (up) => {
          if (!stale()) setPath('relay', up)
        })
          .then((r) => {
            if (stale()) {
              r.destroy()
              return
            }
            ways.relay = r
            setPath('relay', true)
          })
          .catch((err: Error) => {
            if (err instanceof RelayError && err.type === 'taken') state.conflict = true
            else state.errors.push(err)
          })
          .finally(() => {
            state.relayDone = true
            check()
          })
      }
    })

  // find a free code: the broker and the relay both refuse a name that is already taken
  let lastErrors: Error[] = []
  for (let attempt = 0; attempt < 6; attempt++) {
    code = newCode()
    const result = await openPaths(code)
    lastErrors = result.errors
    if (!result.conflict && (ways.peer || ways.relay)) break
    // start over under another code; anything that opened under the old one is dropped
    ways.peer?.destroy()
    ways.relay?.destroy()
    ways.peer = null
    ways.relay = null
    paths.p2p = false
    paths.relay = false
    if (!result.conflict) break
  }
  if (!ways.peer && !ways.relay) {
    code = ''
    throw lastErrors[0] ?? new Error('Could not find a free room code. Try again.')
  }

  engine = createHostEngine((out) => {
    if (out.kind === 'send') {
      if (out.id === LOCAL_ID) toLocal(out.text)
      else guests.get(out.id)?.send(out.text)
    } else if (out.kind === 'cast') {
      // one message for several players: relay guests share a single frame
      const viaRelay: number[] = []
      for (const id of out.ids) {
        if (id === LOCAL_ID) {
          toLocal(out.text)
          continue
        }
        const link = guests.get(id)
        if (!link) continue
        const relayId = ways.relay?.idOf(link)
        if (relayId !== undefined) viaRelay.push(relayId)
        else link.send(out.text)
      }
      if (viaRelay.length > 0) ways.relay?.sendTo(viaRelay, out.text)
    } else if (out.kind === 'close') {
      if (out.id === LOCAL_ID) local.onClose?.()
      else guests.get(out.id)?.close()
    } else {
      end(out.reason)
      local.onClose?.()
    }
  })
  engine.post({
    kind: 'init',
    code,
    addresses: {
      skins: import.meta.env.VITE_SKINS_ADDRESS as string | undefined,
      boxes: import.meta.env.VITE_BOXES_ADDRESS as string | undefined,
      boosts: import.meta.env.VITE_BOOSTS_ADDRESS as string | undefined,
    },
  })
  engine.post({ kind: 'open', id: LOCAL_ID })
  const queued = waiting
  waiting = null
  for (const link of queued) seat(link)

  live = true
  return { code, local, inWorker: engine.inWorker, turn: ice.relay, paths: { ...paths }, close: () => local.close() }
}
