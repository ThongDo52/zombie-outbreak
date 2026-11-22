import { RELAY_CTRL, RELAY_PATH, packBinaryFrame } from './relayProtocol'
import { isLossy, type Link } from './transport'

/**
 * Browser side of the online relay: the path friends use when their networks cannot connect directly.
 * The host keeps one WebSocket to the relay and every guest keeps one; the relay forwards between them.
 * The room, the game and the wallet checks stay exactly where they were, in the host's browser.
 *
 * Snapshots are a few kilobytes twenty times a second, so the host deflates them before sending and
 * sends each one once for all guests. A guest then receives about 20 to 45 kB per second, a third of the plain text.
 */

export type RelayFailure = 'unreachable' | 'taken' | 'no-room' | 'full'

export class RelayError extends Error {
  constructor(
    readonly type: RelayFailure,
    message: string,
  ) {
    super(message)
    this.name = 'RelayError'
  }
}

/** A link that can say how its traffic travels. */
export type RelayLink = Link & { route(): Promise<'relay'> }

const CONNECT_TIMEOUT_MS = 8000
const KEEP_ALIVE_MS = 20_000
/** Messages shorter than this are not worth deflating. */
const DEFLATE_MIN = 400
const FORMAT = 'deflate-raw' as const

// ---------- Where the relay is ----------

let override: string[] | null = null
/** The relay that answered last, tried first next time. */
let lastGood: string | null = null

/** Tests (and anyone embedding the game) can point at a relay directly. Pass null to go back to the settings. */
export function setRelayUrls(urls: string[] | null) {
  override = urls
  lastGood = null
}

// Read one at a time and by its full name, so the bundler can fill each value in at build time.
const settings = (): { relay: string; coop: string; dev: boolean } => {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  try {
    return { relay: text(import.meta.env.VITE_RELAY_URL), coop: text(import.meta.env.VITE_COOP_URL), dev: Boolean(import.meta.env.DEV) }
  } catch {
    // no build settings here (a plain script or a test runner)
    return { relay: '', coop: '', dev: false }
  }
}

/**
 * Turns whatever was configured into a WebSocket address ending in the relay path. Accepts
 * `wss://host/relay`, `https://host`, `host.example.com`, a co-op server address ending in `/coop`,
 * or `/relay` for "the same site this page came from".
 */
export function toRelayUrl(value: string): string | null {
  let v = value.trim()
  if (!v) return null
  if (v.startsWith('/')) {
    if (typeof location === 'undefined') return null
    v = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${v}`
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = `wss://${v}`
  v = v.replace(/^http(s?):\/\//i, 'ws$1://')
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return null
  }
  if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return null
  let path = u.pathname.replace(/\/+$/, '')
  if (path === '' || path.endsWith('/coop')) path = path.replace(/\/coop$/, '') + RELAY_PATH
  return `${u.protocol}//${u.host}${path}`
}

/** Every relay address worth trying, best first. Empty when online relay play is not set up. */
export function relayUrls(): string[] {
  const out: string[] = []
  const add = (v: string | null) => {
    if (v && !out.includes(v)) out.push(v)
  }
  if (override) override.forEach((v) => add(toRelayUrl(v)))
  else {
    const s = settings()
    s.relay.split(',').forEach((v) => add(toRelayUrl(v)))
    // a co-op server set up for Endless Descent carries the relay too
    add(toRelayUrl(s.coop))
    // the dev server (and a preview or tunnel link to it) proxies the relay on the page's own address
    if (s.dev) add(toRelayUrl(RELAY_PATH))
  }
  if (lastGood && out.includes(lastGood)) return [lastGood, ...out.filter((u) => u !== lastGood)]
  return out
}

export const hasRelay = (): boolean => relayUrls().length > 0

// ---------- Deflate ----------

function supports(kind: 'deflate' | 'inflate'): boolean {
  try {
    if (kind === 'deflate') new CompressionStream(FORMAT)
    else new DecompressionStream(FORMAT)
    return true
  } catch {
    return false
  }
}

const CAN_DEFLATE = supports('deflate')
const CAN_INFLATE = supports('inflate')

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter()
  // failures surface on the readable side below; these must not become unhandled rejections
  writer.write(bytes as unknown as BufferSource).catch(() => undefined)
  writer.close().catch(() => undefined)
  return new Uint8Array(await new Response(stream.readable).arrayBuffer())
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const deflateText = (text: string): Promise<Uint8Array> => pipe(encoder.encode(text), new CompressionStream(FORMAT))
export const inflateText = async (bytes: Uint8Array): Promise<string> => decoder.decode(await pipe(bytes, new DecompressionStream(FORMAT)))

// ---------- Opening a socket ----------

interface Opened {
  ws: WebSocket
  url: string
  /** Control frame the relay greeted us with. */
  greeting: string
}

/**
 * Connects to the first relay that answers and waits for its greeting (`!ready`, or the reason it refused).
 * A relay that cannot be reached is skipped; an answer of any kind ends the search.
 */
function openSocket(query: string, timeoutMs = CONNECT_TIMEOUT_MS): Promise<Opened> {
  const urls = relayUrls()
  return new Promise((resolve, reject) => {
    let index = 0
    const next = () => {
      const url = urls[index++]
      if (!url) {
        reject(new RelayError('unreachable', urls.length > 0 ? 'The online relay did not answer.' : 'No online relay is set up.'))
        return
      }
      let ws: WebSocket
      try {
        ws = new WebSocket(`${url}?${query}`)
      } catch {
        next()
        return
      }
      ws.binaryType = 'arraybuffer'
      let done = false
      const finish = (ok: boolean, greeting = '') => {
        if (done) return
        done = true
        clearTimeout(timer)
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null
        if (ok) {
          lastGood = url
          resolve({ ws, url, greeting })
        } else {
          try {
            ws.close()
          } catch {
            // never opened
          }
          next()
        }
      }
      const timer = setTimeout(() => finish(false), timeoutMs)
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string' && ev.data.startsWith('!')) finish(true, ev.data)
      }
      ws.onerror = () => finish(false)
      ws.onclose = () => finish(false)
    }
    next()
  })
}

// ---------- Host ----------

export interface RelayHost {
  /** The relay address in use. */
  readonly url: string
  /** Send one message to several guests of this relay in a single frame. */
  sendTo(ids: readonly number[], text: string): void
  /** The relay id of a guest link handed out by this host, or undefined for any other link. */
  idOf(link: Link): number | undefined
  destroy(): void
}

interface Outgoing {
  ids: number[]
  text: string
  z: boolean
}

class GuestSeat implements RelayLink {
  open = true
  onMessage: ((text: string) => void) | null = null
  onClose: (() => void) | null = null

  constructor(
    readonly id: number,
    readonly canInflate: boolean,
    private readonly hub: HostHub,
  ) {}

  send(text: string) {
    if (this.open) this.hub.sendTo([this.id], text)
  }

  close() {
    if (!this.open) return
    this.hub.kick(this.id)
    this.finish()
  }

  /** The connection is over (the guest left, the host dropped it, or the relay went away). */
  finish() {
    if (!this.open) return
    this.open = false
    this.onClose?.()
  }

  route = () => Promise.resolve('relay' as const)
}

class HostHub implements RelayHost {
  url = ''
  private ws: WebSocket | null = null
  private seats = new Map<number, GuestSeat>()
  private outbox: Outgoing[] = []
  private chain: Promise<void> = Promise.resolve()
  private flushing = false
  private destroyed = false
  private keepAlive: ReturnType<typeof setInterval> | null = null
  private retry: ReturnType<typeof setTimeout> | null = null
  private retryDelay = 1000

  constructor(
    private readonly code: string,
    private readonly onGuest: (link: RelayLink) => void,
    private readonly onState?: (up: boolean) => void,
  ) {}

  /** First connection. Rejects when the relay cannot be reached or the code is taken. */
  async start(): Promise<void> {
    const opened = await openSocket(`code=${this.code}&role=host`)
    if (opened.greeting !== RELAY_CTRL.ready) {
      opened.ws.close()
      throw new RelayError(opened.greeting === RELAY_CTRL.taken ? 'taken' : 'unreachable', 'The relay refused the room.')
    }
    if (this.destroyed) {
      opened.ws.close()
      return
    }
    this.attach(opened)
  }

  private attach({ ws, url }: Opened) {
    this.ws = ws
    this.url = url
    this.retryDelay = 1000
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') this.onFrame(ev.data)
    }
    ws.onerror = () => ws.close()
    ws.onclose = () => this.onDown(ws)
    this.keepAlive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(RELAY_CTRL.keepAlive)
    }, KEEP_ALIVE_MS)
  }

  private onFrame(data: string) {
    if (data.startsWith('!')) {
      const [ctrl, idText, flags] = data.split(' ')
      const id = Number(idText)
      if (ctrl === RELAY_CTRL.open && Number.isInteger(id) && id > 0) {
        this.seats.get(id)?.finish()
        const seat = new GuestSeat(id, (flags ?? '').includes('z'), this)
        this.seats.set(id, seat)
        this.onGuest(seat)
      } else if (ctrl === RELAY_CTRL.close) {
        const seat = this.seats.get(id)
        this.seats.delete(id)
        seat?.finish()
      }
      return
    }
    const cut = data.indexOf('\n')
    if (cut <= 0) return
    this.seats.get(Number(data.slice(0, cut)))?.onMessage?.(data.slice(cut + 1))
  }

  /** The relay connection dropped. Guests are let go (they rejoin by themselves) and the host signs in again. */
  private onDown(ws: WebSocket) {
    if (this.ws !== ws) return
    this.ws = null
    if (this.keepAlive) clearInterval(this.keepAlive)
    this.keepAlive = null
    const seats = [...this.seats.values()]
    this.seats.clear()
    this.outbox = []
    for (const s of seats) s.finish()
    if (this.destroyed) return
    this.onState?.(false)
    this.scheduleRetry()
  }

  private scheduleRetry() {
    if (this.destroyed || this.retry) return
    this.retry = setTimeout(() => {
      this.retry = null
      if (this.destroyed) return
      openSocket(`code=${this.code}&role=host`)
        .then((opened) => {
          if (this.destroyed || opened.greeting !== RELAY_CTRL.ready) {
            opened.ws.close()
            if (!this.destroyed) this.scheduleRetry()
            return
          }
          this.attach(opened)
          this.onState?.(true)
        })
        .catch(() => this.scheduleRetry())
      this.retryDelay = Math.min(10_000, this.retryDelay * 2)
    }, this.retryDelay)
  }

  idOf(link: Link): number | undefined {
    return link instanceof GuestSeat && this.seats.get(link.id) === link ? link.id : undefined
  }

  kick(id: number) {
    this.seats.delete(id)
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(`${RELAY_CTRL.close} ${id}`)
  }

  sendTo(ids: readonly number[], text: string) {
    if (!this.ws) return
    // guests that can inflate share one deflated frame; the others get plain text
    const zip: number[] = []
    const plain: number[] = []
    const worth = CAN_DEFLATE && text.length >= DEFLATE_MIN
    for (const id of ids) {
      const seat = this.seats.get(id)
      if (!seat) continue
      if (worth && seat.canInflate) zip.push(id)
      else plain.push(id)
    }
    if (zip.length > 0) this.enqueue(zip, text, true)
    if (plain.length > 0) this.enqueue(plain, text, false)
  }

  private enqueue(ids: number[], text: string, z: boolean) {
    const last = this.outbox[this.outbox.length - 1]
    // the room sends one snapshot to every player in a row: fold those into a single frame
    if (last && last.z === z && last.text === text) last.ids.push(...ids)
    else this.outbox.push({ ids, text, z })
    if (this.flushing) return
    this.flushing = true
    queueMicrotask(() => {
      this.flushing = false
      const batch = this.outbox
      this.outbox = []
      for (const out of batch) this.chain = this.chain.then(() => this.transmit(out)).catch(() => undefined)
    })
  }

  private async transmit(out: Outgoing) {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    // behind on sending: fast-changing messages are skipped, a newer one is on its way
    if (ws.bufferedAmount > 1_500_000 && isLossy(out.text)) return
    if (!out.z) {
      ws.send(`${out.ids.join(',')}\n${out.text}`)
      return
    }
    const packed = await deflateText(out.text)
    if (this.ws === ws && ws.readyState === WebSocket.OPEN) ws.send(packBinaryFrame(out.ids, packed))
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    if (this.keepAlive) clearInterval(this.keepAlive)
    this.keepAlive = null
    const ws = this.ws
    this.ws = null
    const seats = [...this.seats.values()]
    this.seats.clear()
    this.outbox = []
    for (const s of seats) s.finish()
    ws?.close()
  }
}

/**
 * Register the host of a room at the relay and hand every guest that arrives there to `onGuest`.
 * `onState` reports the relay connection going down and coming back (the host signs in again by itself).
 */
export async function openRelayHost(code: string, onGuest: (link: RelayLink) => void, onState?: (up: boolean) => void): Promise<RelayHost> {
  const hub = new HostHub(code.toUpperCase(), onGuest, onState)
  await hub.start()
  return hub
}

// ---------- Guest ----------

class GuestLink implements RelayLink {
  private closed = false
  private handler: ((text: string) => void) | null = null
  /** Messages that arrive before anyone listens are kept, then delivered in order. */
  private early: string[] = []
  private inbox: Promise<void> = Promise.resolve()
  private keepAlive: ReturnType<typeof setInterval>
  onClose: (() => void) | null = null

  constructor(private readonly ws: WebSocket) {
    ws.onmessage = (ev) => {
      const data: unknown = ev.data
      // every frame goes through one queue so a snapshot that is still inflating cannot be overtaken
      this.inbox = this.inbox
        .then(async () => {
          if (typeof data === 'string') {
            if (data === RELAY_CTRL.gone) this.close()
            else if (!data.startsWith('!')) this.deliver(data)
          } else if (data instanceof ArrayBuffer) {
            this.deliver(await inflateText(new Uint8Array(data)))
          }
        })
        .catch(() => undefined)
    }
    ws.onerror = () => ws.close()
    ws.onclose = () => this.finish()
    this.keepAlive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(RELAY_CTRL.keepAlive)
    }, KEEP_ALIVE_MS)
  }

  get open() {
    return !this.closed && this.ws.readyState === WebSocket.OPEN
  }

  get onMessage() {
    return this.handler
  }
  set onMessage(fn: ((text: string) => void) | null) {
    this.handler = fn
    while (fn && this.early.length > 0) fn(this.early.shift() as string)
  }

  private deliver(text: string) {
    if (this.closed) return
    if (this.handler) this.handler(text)
    else if (this.early.length < 200) this.early.push(text)
  }

  send(text: string) {
    if (this.open && this.ws.bufferedAmount < 1_000_000) this.ws.send(text)
  }

  close() {
    if (this.closed) return
    try {
      this.ws.close()
    } finally {
      this.finish()
    }
  }

  private finish() {
    if (this.closed) return
    this.closed = true
    clearInterval(this.keepAlive)
    this.onClose?.()
  }

  route = () => Promise.resolve('relay' as const)
}

/** Join the room with this code through the relay. Resolves once the relay has seated us next to the host. */
export async function joinRelay(code: string): Promise<RelayLink> {
  const opened = await openSocket(`code=${code.toUpperCase()}&role=guest${CAN_INFLATE ? '&z=1' : ''}`)
  if (opened.greeting === RELAY_CTRL.ready) return new GuestLink(opened.ws)
  opened.ws.close()
  if (opened.greeting === RELAY_CTRL.full) throw new RelayError('full', 'That room is full.')
  throw new RelayError('no-room', 'No room with that code on the online relay.')
}

// ---------- Checking the relay ----------

export interface RelayProbe {
  /** A relay address is set up. */
  configured: boolean
  /** It answered. */
  ok: boolean
  url: string | null
  /** How long the answer took, in milliseconds. */
  ms: number | null
}

/** Asks the relay for a room that cannot exist. Any answer proves this network can reach it. */
export async function probeRelay(): Promise<RelayProbe> {
  const configured = hasRelay()
  if (!configured) return { configured, ok: false, url: null, ms: null }
  const started = Date.now()
  try {
    const opened = await openSocket('code=PROBE&role=guest', 6000)
    opened.ws.close()
    return { configured, ok: true, url: opened.url, ms: Date.now() - started }
  } catch {
    return { configured, ok: false, url: relayUrls()[0] ?? null, ms: null }
  }
}
