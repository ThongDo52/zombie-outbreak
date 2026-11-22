import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { DEFAULT_RELAY_LIMITS, RELAY_PATH } from '../src/net/relayProtocol'
import { createRelay, isRelayRequest } from './relay'

/**
 * The online relay on its own: no game logic, no wallet or chain access, nothing to configure.
 * Run it anywhere that can hold a WebSocket open (a small VPS, Render, Fly, Railway, a Docker host):
 *
 *   bun run relay            (or: bun server/relay-standalone.ts)
 *
 * Then point the game at it with VITE_RELAY_URL=wss://your-host/relay and rebuild.
 * It listens on PORT (what most hosts set), or RELAY_PORT, or 5175.
 */

const PORT = Number(process.env.PORT ?? process.env.RELAY_PORT ?? 5175)
const relay = createRelay()

const http = createServer((req, res) => {
  if (relay.health(req, res, true)) return
  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({ server: http, maxPayload: DEFAULT_RELAY_LIMITS.maxHostFrame })
wss.on('connection', (ws, req) => {
  if (isRelayRequest(req)) relay.connect(ws, req)
  else ws.close(4009, 'unknown path')
})

http.listen(PORT, () => console.log(`relay listening on ${PORT}${RELAY_PATH}`))

const stop = () => {
  relay.close()
  http.close()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
