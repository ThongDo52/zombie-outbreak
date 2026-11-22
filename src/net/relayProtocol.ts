/**
 * The online relay, shared by the browser and by whatever runs the relay (the dev server, a small Bun or
 * Node server, or a Cloudflare Worker).
 *
 * Why it exists: two browsers on different networks can only talk directly (WebRTC) when both routers allow
 * it, and many do not (mobile data, carrier-grade NAT, offices). The relay is a plain WebSocket meeting
 * point that every network can reach. The host's browser still runs the match; the relay only forwards
 * frames between the host and its guests. It never reads them.
 *
 * Wire format
 * - Everybody connects to `<relay>?code=ABCDE&role=host|guest`. A guest adds `&z=1` when it can inflate.
 * - Text frames that start with `!` are control frames (see RELAY_CTRL).
 * - Guest to host: the guest sends its message as it is. The host receives `<guestId>\n<message>`.
 * - Host to guests, text: `<ids>\n<message>` where ids is `*` or a comma list. Guests receive `<message>`.
 * - Host to guests, binary: one count byte, that many big-endian uint16 ids (count 0 means everyone),
 *   then the payload. Guests receive the payload. The host uses this for deflated snapshots.
 */

export const RELAY_PATH = '/relay'

/** Close codes the relay uses, so both sides can tell the reasons apart. */
export const RELAY_CLOSE = {
  taken: 4001,
  hostLeft: 4002,
  kicked: 4003,
  noRoom: 4004,
  full: 4005,
  flood: 4008,
  bad: 4009,
} as const

export const RELAY_CTRL = {
  /** Relay to anyone: you are in. */
  ready: '!ready',
  /** Relay to a host: that code already has a host. */
  taken: '!taken',
  /** Relay to a guest: nobody hosts that code. */
  noRoom: '!noroom',
  /** Relay to a guest: the room has no free place. */
  full: '!full',
  /** Relay to a guest: the host went away. */
  gone: '!gone',
  /** Relay to a host: `!open <id> <flags>` a guest arrived (flags has `z` when it can inflate). */
  open: '!open',
  /** Both ways with a host: `!close <id>` that guest left, or drop that guest. */
  close: '!close',
  /** Anyone to relay: keep the connection from idling out. Ignored. */
  keepAlive: '!ka',
} as const

export interface RelayLimits {
  /** Guests per room (a story room holds four players, so three guests; the rest is headroom for reconnects). */
  maxGuests: number
  /** Rooms the relay will hold at once. */
  maxRooms: number
  /** Largest frame a guest may send, in bytes or characters. */
  maxGuestFrame: number
  /** Largest frame a host may send. */
  maxHostFrame: number
  /** Frames per second a guest may send before the extra ones are dropped. */
  guestRate: number
  /** Frames per second a host may send. */
  hostRate: number
}

export const DEFAULT_RELAY_LIMITS: RelayLimits = {
  maxGuests: 8,
  maxRooms: 2000,
  maxGuestFrame: 8 * 1024,
  maxHostFrame: 512 * 1024,
  guestRate: 150,
  hostRate: 900,
}

/** Room codes are 4 to 8 letters and digits. */
export function cleanRelayCode(value: unknown): string | null {
  const code = String(value ?? '').trim().toUpperCase()
  return /^[A-Z0-9]{4,8}$/.test(code) ? code : null
}

/** Header of a binary frame from the host: who gets the payload. An empty list means every guest. */
export function packBinaryFrame(ids: readonly number[], payload: Uint8Array) {
  const n = Math.min(255, ids.length)
  // built over its own buffer, so it can be handed straight to WebSocket.send
  const out = new Uint8Array(new ArrayBuffer(1 + n * 2 + payload.length))
  out[0] = n
  for (let i = 0; i < n; i++) {
    out[1 + i * 2] = (ids[i] >> 8) & 0xff
    out[2 + i * 2] = ids[i] & 0xff
  }
  out.set(payload, 1 + n * 2)
  return out
}

export function unpackBinaryFrame(frame: Uint8Array): { ids: number[]; payload: Uint8Array } | null {
  if (frame.length < 1) return null
  const n = frame[0]
  const head = 1 + n * 2
  if (frame.length < head) return null
  const ids: number[] = []
  for (let i = 0; i < n; i++) ids.push((frame[1 + i * 2] << 8) | frame[2 + i * 2])
  return { ids, payload: frame.subarray(head) }
}
