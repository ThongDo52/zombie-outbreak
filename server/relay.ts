import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebSocket } from 'ws'
import { RELAY_CLOSE, RELAY_PATH, cleanRelayCode } from '../src/net/relayProtocol'
import { RelayHub } from './relayCore'

/**
 * The online relay on a Node or Bun WebSocket server (the `ws` package). The co-op server mounts it next to
 * its own endpoint, and server/relay-standalone.ts runs it alone. Room logic lives in relayCore.ts.
 */

const HEARTBEAT_MS = 25_000

/** Origins allowed to use this relay, from RELAY_ALLOWED_ORIGINS (comma separated). Empty means anyone. */
function allowedOrigins(): string[] {
  return (process.env.RELAY_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/\/+$/, ''))
    .filter(Boolean)
}

export function isRelayRequest(req: IncomingMessage): boolean {
  return (req.url ?? '').split('?')[0].replace(/\/+$/, '') === RELAY_PATH
}

export function createRelay() {
  const hub = new RelayHub()
  const alive = new Map<WebSocket, boolean>()

  // Proxies and phone networks drop a WebSocket that stays silent, and a dead one must not hold a room open.
  const beat = setInterval(() => {
    for (const [ws, ok] of alive) {
      if (!ok) {
        ws.terminate()
        alive.delete(ws)
        continue
      }
      alive.set(ws, false)
      try {
        ws.ping()
      } catch {
        // closing: the close handler removes it
      }
    }
  }, HEARTBEAT_MS)
  // never keep a process alive just for the heartbeat (Node and Bun timers can be un-referenced; a browser's cannot)
  ;(beat as unknown as { unref?: () => void }).unref?.()

  /** Hand a freshly accepted WebSocket on the relay path to its room. */
  function connect(ws: WebSocket, req: IncomingMessage) {
    const origins = allowedOrigins()
    const origin = String(req.headers.origin ?? '').toLowerCase().replace(/\/+$/, '')
    if (origins.length > 0 && !origins.includes(origin)) {
      ws.close(RELAY_CLOSE.bad, 'origin not allowed')
      return
    }
    const query = new URLSearchParams((req.url ?? '').split('?')[1] ?? '')
    const code = cleanRelayCode(query.get('code'))
    const role = query.get('role')
    if (!code || (role !== 'host' && role !== 'guest')) {
      ws.close(RELAY_CLOSE.bad, 'bad request')
      return
    }
    const conn = hub.join(
      {
        send: (data) => {
          if (ws.readyState !== ws.OPEN) return
          // a guest that cannot keep up loses frames instead of piling them up in memory
          if (ws.bufferedAmount > 4_000_000) return
          ws.send(data, { binary: typeof data !== 'string' })
        },
        close: (c, reason) => ws.close(c, reason),
      },
      code,
      role,
      query.get('z') === '1',
    )
    if (!conn) return
    alive.set(ws, true)
    ws.on('pong', () => alive.set(ws, true))
    ws.on('message', (data, isBinary) => {
      alive.set(ws, true)
      if (isBinary) {
        const buf = Array.isArray(data) ? Buffer.concat(data) : data instanceof ArrayBuffer ? Buffer.from(data) : data
        conn.onMessage(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
      } else {
        conn.onMessage(data.toString())
      }
    })
    ws.on('close', () => {
      alive.delete(ws)
      conn.onClose()
    })
    ws.on('error', () => ws.close())
  }

  /** Answers GET /relay/health (and /health when `any` is set). Returns true when it handled the request. */
  function health(req: IncomingMessage, res: ServerResponse, any = false): boolean {
    const path = (req.url ?? '').split('?')[0].replace(/\/+$/, '')
    if (path !== `${RELAY_PATH}/health` && !(any && (path === '/health' || path === ''))) return false
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' })
    res.end(JSON.stringify(hub.stats()))
    return true
  }

  return { hub, connect, health, close: () => clearInterval(beat) }
}
