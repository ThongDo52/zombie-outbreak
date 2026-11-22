import { loadIceServers, type IceConfig } from './ice'
import { joinPeer, type PeerFailure, type PeerLink, type Route } from './peer'
import { hasRelay, joinRelay, RelayError, type RelayLink } from './relay'
import type { Link } from './transport'

/**
 * How a friend reaches a room hosted on someone's device.
 *
 * Two ways are tried at the same time:
 *  1. WebRTC, straight between the two browsers (or through a TURN server when one is configured).
 *     It has the lowest delay, but only works when both networks allow it.
 *  2. The game's online relay, a plain WebSocket that every network can reach.
 *
 * WebRTC wins when it connects within a few seconds. Otherwise the relay carries the room, so friends on
 * mobile data or behind strict routers can still play. Nothing needs choosing: it is automatic.
 */

/** How long WebRTC may take before a relay connection that is already open is used instead. */
const DIRECT_HEAD_START_MS = 4000

export type JoinedLink = Link & { route(): Promise<Route> }

type Settled<T> = { ok: true; link: T } | { ok: false; error: Error & { type?: string } }

const settle = <T>(p: Promise<T>): Promise<Settled<T>> =>
  p.then(
    (link) => ({ ok: true as const, link }),
    (error: unknown) => ({ ok: false as const, error: error instanceof Error ? error : new Error('Connection failed.') }),
  )

const sleep = (ms: number) => new Promise<'late'>((resolve) => setTimeout(() => resolve('late'), ms))

/** The one sentence a player sees when neither way worked. */
function explain(direct: (Error & { type?: string }) | null, relay: (Error & { type?: string }) | null, relayConfigured: boolean): Error {
  const d = (direct?.type ?? 'blocked') as PeerFailure
  const r = relay instanceof RelayError ? relay.type : 'unreachable'
  const noRoom = 'No room with that code. Ask the host to check it, and that their game is still open.'
  if (r === 'full') return new Error('That room is full.')
  // the room finder knows no host under that code: the code is wrong or the room is closed
  if (d === 'no-room') return new Error(noRoom)
  if (d === 'broker') {
    if (r === 'no-room') return new Error(noRoom)
    return new Error(relayConfigured ? 'Could not reach the room finder or the online relay. Check your connection and try again.' : 'Could not reach the room finder. Check your connection and try again.')
  }
  // the host is there, but the two networks will not talk to each other directly
  if (!relayConfigured) {
    return new Error('Your network and the host\'s cannot connect directly, and this copy of the game has no online relay set up. Play on the same Wi-Fi, or set up the relay (see "Play online" in the README).')
  }
  if (r === 'no-room') return new Error('Your networks cannot connect directly, and the host is not on the online relay right now. Ask the host to reopen the room.')
  return new Error('Your networks cannot connect directly and the online relay did not answer. Try again in a moment.')
}

export interface JoinOptions {
  /** Tests: replace WebRTC with something else (or with a promise that never connects). */
  direct?: (code: string, ice: IceConfig) => Promise<PeerLink>
  ice?: IceConfig
}

/** Connect to the room with this code, by whichever way works. */
export async function joinHosted(code: string, opts: JoinOptions = {}): Promise<JoinedLink> {
  const clean = code.trim().toUpperCase()
  const relayConfigured = hasRelay()
  const ice = opts.ice ?? (await loadIceServers())
  const started = Date.now()

  const direct = settle<PeerLink>((opts.direct ?? joinPeer)(clean, ice))
  const relay: Promise<Settled<RelayLink>> = relayConfigured ? settle(joinRelay(clean)) : Promise.resolve({ ok: false, error: new RelayError('unreachable', 'No online relay is set up.') })

  /** Whichever connection is not used gets closed as soon as it shows up. */
  const discard = (p: Promise<Settled<Link>>) => void p.then((s) => s.ok && s.link.close())

  const first = await Promise.race([direct.then((s) => ({ via: 'direct' as const, s })), relay.then((s) => ({ via: 'relay' as const, s }))])

  if (first.via === 'direct') {
    if (first.s.ok) {
      discard(relay)
      return first.s.link
    }
    const r = await relay
    if (r.ok) return r.link
    throw explain(first.s.error, r.error, relayConfigured)
  }

  // the relay answered first
  if (!first.s.ok) {
    const d = await direct
    if (d.ok) return d.link
    throw explain(d.error, first.s.error, relayConfigured)
  }
  const relayLink = first.s.link
  const wait = Math.max(0, DIRECT_HEAD_START_MS - (Date.now() - started))
  const d = await Promise.race([direct, sleep(wait)])
  if (d !== 'late' && d.ok) {
    relayLink.close()
    return d.link
  }
  discard(direct)
  return relayLink
}
