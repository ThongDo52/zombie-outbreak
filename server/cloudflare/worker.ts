import { DEFAULT_RELAY_LIMITS, RELAY_PATH, cleanRelayCode } from '../../src/net/relayProtocol'
import { RelayRoom } from '../relayCore'

/**
 * The online relay as a Cloudflare Worker: free to run, always on, and close to most players.
 * Each room code gets its own Durable Object, which holds the host's and the guests' WebSockets and
 * forwards frames between them (the same room logic as server/relay.ts, see ../relayCore.ts).
 *
 * Deploy from this folder with:  npx wrangler deploy
 * Then set VITE_RELAY_URL=wss://<your-worker>.workers.dev/relay in .env and rebuild the game.
 *
 * Only the handful of Workers types this file needs are declared here, so the project does not have to
 * install @cloudflare/workers-types.
 */

interface WorkerSocket {
  accept(): void
  send(data: string | ArrayBuffer | Uint8Array): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'message', listener: (ev: { data: string | ArrayBuffer }) => void): void
  addEventListener(type: 'close' | 'error', listener: () => void): void
}
declare const WebSocketPair: new () => { 0: WorkerSocket; 1: WorkerSocket }

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>
}
interface DurableObjectNamespace {
  idFromName(name: string): unknown
  get(id: unknown): DurableObjectStub
}
interface Env {
  ROOMS: DurableObjectNamespace
  /** Optional, comma separated: only pages from these origins may use the relay. */
  ALLOWED_ORIGINS?: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } })

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '')
    if (path === '' || path === '/health' || path === `${RELAY_PATH}/health`) return json({ ok: true, relay: true, host: 'cloudflare-worker' })
    if (path !== RELAY_PATH) return new Response('Not found', { status: 404 })
    if ((request.headers.get('Upgrade') ?? '').toLowerCase() !== 'websocket') return new Response('This address is a WebSocket relay for Zombie Outbreak.', { status: 426 })

    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim().toLowerCase().replace(/\/+$/, '')).filter(Boolean)
    const origin = (request.headers.get('Origin') ?? '').toLowerCase().replace(/\/+$/, '')
    if (allowed.length > 0 && !allowed.includes(origin)) return new Response('Origin not allowed', { status: 403 })

    const code = cleanRelayCode(url.searchParams.get('code'))
    const role = url.searchParams.get('role')
    if (!code || (role !== 'host' && role !== 'guest')) return new Response('Bad request', { status: 400 })
    // every room code is its own object, so a room's sockets always meet in the same place
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request)
  },
}

/** One room: created when its host connects, gone a little after everyone has left. */
export class RelayRoomObject {
  private room = new RelayRoom(DEFAULT_RELAY_LIMITS)

  fetch(request: Request): Response {
    const url = new URL(request.url)
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'guest'
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    server.accept()

    const conn = this.room.join(
      {
        send: (data) => server.send(data),
        close: (code, reason) => server.close(code, reason),
      },
      role,
      url.searchParams.get('z') === '1',
    )
    if (conn) {
      let open = true
      const end = () => {
        if (!open) return
        open = false
        conn.onClose()
        try {
          server.close(1000, 'closed')
        } catch {
          // already closed
        }
      }
      server.addEventListener('message', (ev) => {
        conn.onMessage(typeof ev.data === 'string' ? ev.data : new Uint8Array(ev.data))
      })
      server.addEventListener('close', end)
      server.addEventListener('error', end)
    }
    // a refused connection was already told why and closed by the room; the handshake still completes
    return new Response(null, { status: 101, webSocket: client } as ResponseInit)
  }
}
