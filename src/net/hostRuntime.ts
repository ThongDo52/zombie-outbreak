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

/** What the room tells the page: text for one connection, a connection to close, or that the room ended. */
export type HostOut = { kind: 'send'; id: number; text: string } | { kind: 'close'; id: number } | { kind: 'closed'; reason: string }

/**
 * Runs one room and carries its connections as numbered links. The page keeps the real connections (to
 * friends over WebRTC, and the host's own player) and passes their messages in and out by number.
 */
export function createHostRuntime(post: (out: HostOut) => void) {
  const links = new Map<number, Link>()
  let core: RoomCore | null = null

  const makeLink = (id: number): Link => {
    const link: Link = {
      open: true,
      send: (text) => post({ kind: 'send', id, text }),
      close: () => {
        if (!link.open) return
        ;(link as { open: boolean }).open = false
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
            onClosed: (reason) => post({ kind: 'closed', reason }),
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
