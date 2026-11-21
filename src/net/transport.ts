/**
 * One way to talk to the other side of a co-op room, whatever carries the bytes: a WebSocket to the
 * Endless Descent server, a WebRTC channel to a friend who hosts, or an in-memory pipe for the host's own
 * player and for tests. Everything sent is JSON text.
 */
export interface Link {
  readonly open: boolean
  send(text: string): void
  close(): void
  /** Set by whoever owns the link. */
  onMessage: ((text: string) => void) | null
  onClose: (() => void) | null
}

export function webSocketLink(ws: WebSocket): Link {
  const link: Link = {
    get open() {
      return ws.readyState === WebSocket.OPEN
    },
    send: (text) => {
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1_000_000) ws.send(text)
    },
    close: () => ws.close(),
    onMessage: null,
    onClose: null,
  }
  ws.onmessage = (ev) => link.onMessage?.(typeof ev.data === 'string' ? ev.data : '')
  ws.onclose = () => link.onClose?.()
  return link
}

export interface PipeOptions {
  /** One-way delay in milliseconds. */
  latencyMs?: number
  /** Extra random delay, up to this many milliseconds. */
  jitterMs?: number
  /** Share of fast-changing messages (snapshots and inputs) that never arrive, 0 to 1. */
  loss?: number
}

/** Messages that are replaced by newer ones all the time, so losing one does no harm. */
export const isLossy = (text: string) => text.startsWith('{"t":"snap"') || text.startsWith('{"t":"input"')

/** Two ends of an in-memory pipe. Used for the host's own player, and with delay and loss to test the netcode. */
export function linkPair(opts: PipeOptions = {}): [Link, Link] {
  const make = (): Link & { peer?: Link; isOpen: boolean } => ({
    isOpen: true,
    get open() {
      return this.isOpen
    },
    send(text: string) {
      const to = this.peer as (Link & { isOpen: boolean }) | undefined
      if (!this.isOpen || !to?.isOpen) return
      if (opts.loss && isLossy(text) && Math.random() < opts.loss) return
      const delay = (opts.latencyMs ?? 0) + Math.random() * (opts.jitterMs ?? 0)
      const deliver = () => {
        if (to.isOpen) to.onMessage?.(text)
      }
      if (delay > 0) setTimeout(deliver, delay)
      else queueMicrotask(deliver)
    },
    close() {
      if (!this.isOpen) return
      this.isOpen = false
      this.onClose?.()
      const to = this.peer as (Link & { isOpen: boolean }) | undefined
      // the far side closes after everything already sent has arrived, like a real connection
      const closePeer = () => {
        if (to?.isOpen) {
          to.isOpen = false
          to.onClose?.()
        }
      }
      const delay = (opts.latencyMs ?? 0) + (opts.jitterMs ?? 0) + 1
      setTimeout(closePeer, delay)
    },
    onMessage: null,
    onClose: null,
  })
  const a = make()
  const b = make()
  a.peer = b
  b.peer = a
  return [a, b]
}
