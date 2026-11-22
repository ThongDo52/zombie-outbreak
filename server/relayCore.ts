import { DEFAULT_RELAY_LIMITS, RELAY_CLOSE, RELAY_CTRL, unpackBinaryFrame, type RelayLimits } from '../src/net/relayProtocol'

/**
 * The relay's room logic, free of any server library so the same code runs under Bun or Node (server/relay.ts)
 * and in a Cloudflare Worker (server/cloudflare/worker.ts). A room is one host and its guests. The relay
 * forwards frames between them and never looks inside. See src/net/relayProtocol.ts for the wire format.
 */

/** A connection as the relay sees it, whatever carries it. */
export interface RelaySocket {
  send(data: string | Uint8Array): void
  close(code?: number, reason?: string): void
}

/** What the server glue calls when something arrives on a connection it handed to a room. */
export interface RelayConn {
  onMessage(data: string | Uint8Array): void
  onClose(): void
}

interface Meter {
  windowStart: number
  count: number
}

const allow = (m: Meter, perSecond: number): boolean => {
  const now = Date.now()
  if (now - m.windowStart >= 1000) {
    m.windowStart = now
    m.count = 0
  }
  return ++m.count <= perSecond
}

const safeSend = (sock: RelaySocket | null | undefined, data: string | Uint8Array) => {
  try {
    sock?.send(data)
  } catch {
    // a socket that died between two frames: its close handler cleans up
  }
}

const safeClose = (sock: RelaySocket | null | undefined, code: number, reason: string) => {
  try {
    sock?.close(code, reason)
  } catch {
    // already closed
  }
}

export class RelayRoom {
  private host: RelaySocket | null = null
  private guests = new Map<number, RelaySocket>()
  private nextId = 1
  /** Frames and bytes forwarded, for the health page. */
  frames = 0
  bytes = 0

  constructor(
    private readonly limits: RelayLimits = DEFAULT_RELAY_LIMITS,
    /** Called when the host has left and the room can be forgotten. */
    private readonly onEmpty?: () => void,
  ) {}

  get hasHost(): boolean {
    return this.host !== null
  }

  get guestCount(): number {
    return this.guests.size
  }

  /** Seat a new connection. Returns its handlers, or null when it was refused (it has been told why and closed). */
  join(sock: RelaySocket, role: 'host' | 'guest', canInflate = false): RelayConn | null {
    return role === 'host' ? this.joinHost(sock) : this.joinGuest(sock, canInflate)
  }

  private joinHost(sock: RelaySocket): RelayConn | null {
    if (this.host) {
      safeSend(sock, RELAY_CTRL.taken)
      safeClose(sock, RELAY_CLOSE.taken, 'code taken')
      return null
    }
    this.host = sock
    const meter: Meter = { windowStart: Date.now(), count: 0 }
    safeSend(sock, RELAY_CTRL.ready)
    return {
      onMessage: (data) => {
        if (this.host !== sock || !allow(meter, this.limits.hostRate)) return
        if (typeof data === 'string') this.fromHostText(data)
        else this.fromHostBinary(data)
      },
      onClose: () => {
        if (this.host !== sock) return
        this.host = null
        for (const g of this.guests.values()) {
          safeSend(g, RELAY_CTRL.gone)
          safeClose(g, RELAY_CLOSE.hostLeft, 'host left')
        }
        this.guests.clear()
        this.onEmpty?.()
      },
    }
  }

  private joinGuest(sock: RelaySocket, canInflate: boolean): RelayConn | null {
    if (!this.host) {
      safeSend(sock, RELAY_CTRL.noRoom)
      safeClose(sock, RELAY_CLOSE.noRoom, 'no room')
      return null
    }
    if (this.guests.size >= this.limits.maxGuests) {
      safeSend(sock, RELAY_CTRL.full)
      safeClose(sock, RELAY_CLOSE.full, 'room full')
      return null
    }
    let id = this.nextId
    while (this.guests.has(id)) id = (id % 65000) + 1
    this.nextId = (id % 65000) + 1
    this.guests.set(id, sock)
    const meter: Meter = { windowStart: Date.now(), count: 0 }
    safeSend(sock, RELAY_CTRL.ready)
    safeSend(this.host, `${RELAY_CTRL.open} ${id} ${canInflate ? 'z' : '-'}`)
    return {
      onMessage: (data) => {
        // guests only ever send small JSON text; anything else is dropped
        if (typeof data !== 'string' || this.guests.get(id) !== sock) return
        if (data.length > this.limits.maxGuestFrame || data.startsWith('!')) return
        if (!allow(meter, this.limits.guestRate)) return
        this.frames++
        this.bytes += data.length
        safeSend(this.host, `${id}\n${data}`)
      },
      onClose: () => {
        if (this.guests.get(id) !== sock) return
        this.guests.delete(id)
        safeSend(this.host, `${RELAY_CTRL.close} ${id}`)
      },
    }
  }

  private targets(ids: readonly number[] | null): RelaySocket[] {
    if (!ids || ids.length === 0) return [...this.guests.values()]
    const out: RelaySocket[] = []
    for (const id of ids) {
      const g = this.guests.get(id)
      if (g) out.push(g)
    }
    return out
  }

  private fromHostText(data: string) {
    if (data.length > this.limits.maxHostFrame) return
    if (data.startsWith('!')) {
      if (data.startsWith(`${RELAY_CTRL.close} `)) {
        const id = Number(data.slice(RELAY_CTRL.close.length + 1))
        const g = this.guests.get(id)
        if (g) {
          this.guests.delete(id)
          safeClose(g, RELAY_CLOSE.kicked, 'closed by host')
        }
      }
      return
    }
    const cut = data.indexOf('\n')
    if (cut <= 0) return
    const head = data.slice(0, cut)
    const payload = data.slice(cut + 1)
    const ids = head === '*' ? null : head.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0)
    if (ids && ids.length === 0) return
    for (const g of this.targets(ids)) {
      this.frames++
      this.bytes += payload.length
      safeSend(g, payload)
    }
  }

  private fromHostBinary(data: Uint8Array) {
    if (data.length > this.limits.maxHostFrame) return
    const frame = unpackBinaryFrame(data)
    if (!frame) return
    for (const g of this.targets(frame.ids)) {
      this.frames++
      this.bytes += frame.payload.length
      safeSend(g, frame.payload)
    }
  }
}

/** Every room of one relay process, by room code. */
export class RelayHub {
  private rooms = new Map<string, RelayRoom>()
  readonly startedAt = Date.now()

  constructor(readonly limits: RelayLimits = DEFAULT_RELAY_LIMITS) {}

  join(sock: RelaySocket, code: string, role: 'host' | 'guest', canInflate = false): RelayConn | null {
    let room = this.rooms.get(code)
    if (!room) {
      if (role === 'guest') {
        safeSend(sock, RELAY_CTRL.noRoom)
        safeClose(sock, RELAY_CLOSE.noRoom, 'no room')
        return null
      }
      if (this.rooms.size >= this.limits.maxRooms) {
        safeClose(sock, RELAY_CLOSE.full, 'relay full')
        return null
      }
      const created = new RelayRoom(this.limits, () => {
        if (this.rooms.get(code) === created) this.rooms.delete(code)
      })
      room = created
      this.rooms.set(code, room)
    }
    return room.join(sock, role, canInflate)
  }

  stats() {
    let guests = 0
    let frames = 0
    let bytes = 0
    for (const r of this.rooms.values()) {
      guests += r.guestCount
      frames += r.frames
      bytes += r.bytes
    }
    return { ok: true, relay: true, rooms: this.rooms.size, guests, frames, bytes, upSeconds: Math.round((Date.now() - this.startedAt) / 1000) }
  }
}
