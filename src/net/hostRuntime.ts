import { makeVerifier, type ContractAddresses } from './hostVerify'
import { RoomCore } from './roomCore'
import type { Link } from './transport'

/** What the page tells the room (in the worker, or in the page itself when workers are unavailable). */
export type HostIn =
  | { kind: 'init'; code: string; addresses: ContractAddresses }
  | { kind: 'open'; id: number }
  | { kind: 'message'; id: number; text: string }
  | { kind: 'disconnect'; id: number }
  | { kind: 'shutdown' }

/**
 * What the room tells the page: text for one connection, the same text for several (a snapshot goes to
 * every player, and sending it once keeps the worker hand-off and the online relay cheap), a connection
 * to close, or that the room ended.
 */
export type HostOut =
  | { kind: 'send'; id: number; text: string }
  | { kind: 'cast'; ids: number[]; text: string }
  | { kind: 'close'; id: number }
  | { kind: 'closed'; reason: string }

/**
 * Runs one room and carries its connections as numbered links. The page keeps the real connections (to
 * friends over WebRTC, and the host's own player) and passes their messages in and out by number.
 */
export function createHostRuntime(post: (out: HostOut) => void) {
  const links = new Map<number, Link>()
  let core: RoomCore | null = null

  // Everything the room sends in one go is collected and handed over together, so the same text for
  // several players travels once. The order of messages is kept.
  let outbox: { ids: number[]; text: string }[] = []
  let scheduled = false
  const flush = () => {
    scheduled = false
    const batch = outbox
    outbox = []
    for (const o of batch) post(o.ids.length === 1 ? { kind: 'send', id: o.ids[0], text: o.text } : { kind: 'cast', ids: o.ids, text: o.text })
  }
  const queue = (id: number, text: string) => {
    const last = outbox[outbox.length - 1]
    if (last && last.text === text && !last.ids.includes(id)) last.ids.push(id)
    else outbox.push({ ids: [id], text })
    if (scheduled) return
    scheduled = true
    queueMicrotask(flush)
  }

  const makeLink = (id: number): Link => {
    const link: Link = {
      open: true,
      send: (text) => queue(id, text),
      close: () => {
        if (!link.open) return
        ;(link as { open: boolean }).open = false
        // whatever was said to this connection goes out before it closes
        flush()
        post({ kind: 'close', id })
      },
      onMessage: null,
      onClose: null,
    }
    return link
  }

  return {
    handle(msg: HostIn) {
      switch (msg.kind) {
        case 'init':
          core = new RoomCore({
            code: msg.code,
            verify: makeVerifier(msg.addresses),
            onClosed: (reason) => {
              flush()
              post({ kind: 'closed', reason })
            },
          })
          return
        case 'open': {
          if (!core) return
          const link = makeLink(msg.id)
          links.set(msg.id, link)
          core.connect(link)
          return
        }
        case 'message':
          links.get(msg.id)?.onMessage?.(msg.text)
          return
        case 'disconnect': {
          const link = links.get(msg.id)
          links.delete(msg.id)
          if (link) {
            ;(link as { open: boolean }).open = false
            link.onClose?.()
          }
          return
        }
        case 'shutdown':
          core?.close('The host left the room.')
          core = null
          return
      }
    },
  }
}
