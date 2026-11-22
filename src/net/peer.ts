import Peer, { type DataConnection } from 'peerjs'
import type { IceConfig } from './ice'
import { isLossy, type Link } from './transport'

/**
 * Friends find each other through PeerJS's free public broker: the host registers under a name made from
 * the 5-letter room code, and friends connect to that name. The broker only introduces the two browsers.
 * After that, data goes straight between them (or through a relay when the networks need one).
 *
 * Each friend opens two channels to the host: a reliable one for room and sign-in messages, and an
 * unordered one for the fast-changing inputs and snapshots, so one slow packet never holds up the picture.
 */

/**
 * How a friend's traffic reaches the host: straight between the two browsers ('direct'), through a WebRTC
 * TURN server ('relayed'), or through the game's own WebSocket relay ('relay', see relay.ts).
 */
export type Route = 'direct' | 'relayed' | 'relay' | 'unknown'

export interface PeerLink extends Link {
  /** Whether the traffic goes straight between the two browsers or through a relay. */
  route(): Promise<Route>
}

/** Why joining over WebRTC failed: nobody hosts that code, the room finder is down, or the networks block each other. */
export type PeerFailure = 'no-room' | 'broker' | 'blocked'

export const peerIdFor = (code: string) => `zombie-outbreak-${code.toUpperCase()}`
const OPEN_TIMEOUT_MS = 30_000

/** The two channels of one friend, presented as a single Link. */
class DualLink implements PeerLink {
  private control: DataConnection | null = null
  private state: DataConnection | null = null
  private closed = false
  onMessage: ((text: string) => void) | null = null
  onClose: (() => void) | null = null
  /** Runs once when this link ends, for example to shut down the Peer that owns it. */
  cleanup: (() => void) | null = null

  get open() {
    return !this.closed && Boolean(this.control?.open)
  }

  attach(conn: DataConnection) {
    if (conn.label === 'state') this.state = conn
    else this.control = conn
    conn.on('data', (data: unknown) => {
      if (typeof data === 'string') this.onMessage?.(data)
    })
    conn.on('close', () => {
      // losing the reliable channel ends the link; the unordered one is only an optimisation
      if (conn === this.control) this.finish()
    })
    conn.on('error', () => {
      if (conn === this.control) this.finish()
    })
  }

  send(text: string) {
    if (this.closed) return
    const fast = isLossy(text) && this.state?.open ? this.state : null
    const via = fast ?? this.control
    if (via?.open) void via.send(text)
  }

  close() {
    if (this.closed) return
    this.control?.close()
    this.state?.close()
    this.finish()
  }

  private finish() {
    if (this.closed) return
    this.closed = true
    try {
      this.onClose?.()
    } finally {
      this.cleanup?.()
    }
  }

  async route(): Promise<Route> {
    const pc = (this.control as unknown as { peerConnection?: RTCPeerConnection } | null)?.peerConnection
    if (!pc) return 'unknown'
    try {
      const reports = new Map<string, Record<string, unknown>>()
      ;(await pc.getStats()).forEach((r: unknown) => {
        const rec = r as Record<string, unknown>
        if (typeof rec.id === 'string') reports.set(rec.id, rec)
      })
      let pair: Record<string, unknown> | undefined
      for (const r of reports.values()) {
        if (r.type === 'transport' && typeof r.selectedCandidatePairId === 'string') pair = reports.get(r.selectedCandidatePairId)
      }
      pair ??= [...reports.values()].find((r) => r.type === 'candidate-pair' && r.nominated === true && r.state === 'succeeded')
      if (!pair) return 'unknown'
      const local = reports.get(String(pair.localCandidateId))
      const remote = reports.get(String(pair.remoteCandidateId))
      return local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'relayed' : 'direct'
    } catch {
      return 'unknown'
    }
  }
}

const randomId = () => {
  const a = new Uint8Array(8)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface HostPeer {
  destroy(): void
}

/** Register the host under the room code and hand each friend that connects to `onGuest`. */
export function openHostPeer(code: string, ice: IceConfig, onGuest: (link: PeerLink) => void): Promise<HostPeer> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerIdFor(code), { config: { iceServers: ice.iceServers }, debug: 0 })
    const timer = setTimeout(() => {
      peer.destroy()
      reject(new Error('The room finder did not answer. Check your connection and try again.'))
    }, OPEN_TIMEOUT_MS)
    const pending = new Map<string, DualLink>()
    peer.on('open', () => {
      clearTimeout(timer)
      resolve({ destroy: () => peer.destroy() })
    })
    peer.on('error', (err) => {
      clearTimeout(timer)
      // a taken name is reported so the caller can pick another code
      reject(Object.assign(new Error(err.message), { type: err.type }))
    })
    peer.on('connection', (conn) => {
      const sid = (conn.metadata as { sid?: unknown } | undefined)?.sid
      if (typeof sid !== 'string') {
        conn.close()
        return
      }
      let link = pending.get(sid)
      if (!link) {
        link = new DualLink()
        link.cleanup = () => pending.delete(sid)
        pending.set(sid, link)
      }
      const l = link
      l.attach(conn)
      if (conn.label !== 'state') conn.on('open', () => onGuest(l))
    })
  })
}

/**
 * A friend joins the room with this code. Resolves once the reliable channel is open.
 * A failure carries a `type` (see PeerFailure) so the caller can fall back to the online relay.
 */
export function joinPeer(code: string, ice: IceConfig): Promise<PeerLink> {
  return new Promise((resolve, reject) => {
    const peer = new Peer({ config: { iceServers: ice.iceServers }, debug: 0 })
    let settled = false
    const fail = (type: PeerFailure, message: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      peer.destroy()
      reject(Object.assign(new Error(message), { type }))
    }
    const timer = setTimeout(
      () => fail('blocked', 'Could not connect to the host. Either they closed the room, or your two networks cannot reach each other directly and no relay is set up. Try the same Wi-Fi, or ask the host to set up a relay.'),
      OPEN_TIMEOUT_MS,
    )
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') fail('no-room', 'No room with that code. Ask the host to check it, and that their game is still open.')
      else fail('broker', 'Could not connect to the room finder. Try again in a moment.')
    })
    peer.on('open', () => {
      const sid = randomId()
      const target = peerIdFor(code)
      const control = peer.connect(target, { label: 'control', reliable: true, serialization: 'raw', metadata: { sid } })
      const state = peer.connect(target, { label: 'state', reliable: false, serialization: 'raw', metadata: { sid } })
      const link = new DualLink()
      link.cleanup = () => peer.destroy()
      link.attach(control)
      link.attach(state)
      // the browsers gave up finding a path to each other: say so now instead of waiting for the timeout
      control.on('iceStateChanged', (st: RTCIceConnectionState) => {
        if (st === 'failed') fail('blocked', 'The two networks could not find a path to each other, and no relay is set up. Try the same Wi-Fi, or ask the host to set up a relay.')
      })
      control.on('open', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(link)
      })
    })
  })
}
