import { CODE_ALPHABET, CODE_LENGTH } from './protocol'
import { createHostEngine } from './hostEngine'
import { loadIceServers } from './ice'
import { openHostPeer, type HostPeer, type PeerLink } from './peer'
import type { Link } from './transport'

/**
 * Hosting a room on your own device: a 5-letter code that friends type, the room itself (in a worker),
 * and the glue between the two. The host plays through a local link, the same path a friend uses.
 */

export interface HostSession {
  code: string
  /** The host's own player connects through this. */
  local: Link
  /** The room runs in a worker. When false it runs in the page and a hidden tab can stall it. */
  inWorker: boolean
  /** A relay server is available for friends whose networks cannot connect directly. */
  relay: boolean
  close(): void
}

const newCode = () => {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

const LOCAL_ID = 0

export async function startHosting(onClosed: (reason: string) => void): Promise<HostSession> {
  const ice = await loadIceServers()

  // find a free code: the broker refuses a name that is already taken
  let code = ''
  let peer: HostPeer | null = null
  const guests = new Map<number, PeerLink>()
  let nextId = 1
  let engine: ReturnType<typeof createHostEngine> | null = null
  let ended = false

  const end = (reason: string) => {
    if (ended) return
    ended = true
    for (const g of guests.values()) g.close()
    guests.clear()
    peer?.destroy()
    engine?.terminate()
    local.open = false
    onClosed(reason)
  }

  // messages that arrive before the host's own player starts listening are kept, then delivered in order
  let handler: ((text: string) => void) | null = null
  const early: string[] = []
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

  for (let attempt = 0; attempt < 6 && !peer; attempt++) {
    code = newCode()
    try {
      peer = await openHostPeer(code, ice, (link) => {
        const id = nextId++
        guests.set(id, link)
        link.onMessage = (text) => engine?.post({ kind: 'message', id, text })
        link.onClose = () => {
          guests.delete(id)
          engine?.post({ kind: 'disconnect', id })
        }
        engine?.post({ kind: 'open', id })
      })
    } catch (err) {
      const type = (err as { type?: string }).type
      if (type !== 'unavailable-id') throw err
    }
  }
  if (!peer) throw new Error('Could not find a free room code. Try again.')

  engine = createHostEngine((out) => {
    if (out.kind === 'send') {
      if (out.id === LOCAL_ID) {
        if (handler) handler(out.text)
        else early.push(out.text)
      }
      else guests.get(out.id)?.send(out.text)
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

  return { code, local, inWorker: engine.inWorker, relay: ice.relay, close: () => local.close() }
}
