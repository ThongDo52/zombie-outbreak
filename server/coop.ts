import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { type Address, type Hex, getAddress } from 'viem'
import { CHAPTERS } from '../src/game/chapters'
import { DEFAULT_CLASS, isClassId, type ClassId } from '../src/game/classes'
import { DIFFICULTIES, type Difficulty } from '../src/game/difficulty'
import { Game } from '../src/game/engine'
import { makeSnapshot } from '../src/game/replica'
import type { SkinSelection } from '../src/game/skins'
import type { BoostCharges, GameStatus, WeaponId } from '../src/game/types'
import { validInput } from '../src/net/input'
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  COOP_PATH,
  DESCENT_SQUAD,
  RECONNECT_SECONDS,
  STORY_ROOM_SIZE,
  signInMessage,
  type ClientMessage,
  type DescentRoom,
  type DescentStage,
  type RoomMode,
  type RoomPhase,
  type RoomState,
  type ServerMessage,
} from '../src/net/protocol'
import { DEFAULT_RELAY_LIMITS } from '../src/net/relayProtocol'
import { verifyJoin, type Verified } from './auth'
import { cancelOnChain, descentReady, newRunId, readEntryFee, readPaid, readRunState, RUN_STATE, settleOnChain, signTicket } from './descent'
import { createRelay, isRelayRequest } from './relay'

/**
 * Co-op game server. Each room runs the same game engine as solo play, headless, and streams the
 * result to its players. Rooms live in memory only: restarting the server ends every session.
 */

interface Member {
  id: number
  name: string
  address: string
  token: string
  ws: WebSocket | null
  ready: boolean
  skin: SkinSelection
  charges: BoostCharges
  unlocked: WeaponId[]
  cls: ClassId
  droppedAt?: number
}

/** Endless Descent bookkeeping for a room. */
interface DescentState {
  stage: DescentStage
  runId: Hex | null
  fee: bigint
  paid: Set<string>
  deadline: number
  floors: number
  leavers: Set<string>
  payout?: DescentRoom['payout']
  note?: string
  poll: ReturnType<typeof setInterval> | null
}

interface Room {
  mode: RoomMode
  descent: DescentState
  code: string
  hostId: number
  members: Member[]
  phase: RoomPhase
  chapter: number
  difficulty: Difficulty
  game: Game | null
  timer: ReturnType<typeof setInterval> | null
  tick: number
  last: number
  nextMemberId: number
}

interface Conn {
  ws: WebSocket
  nonce: string
  verified?: Verified
  member?: Member
  room?: Room
  windowStart: number
  count: number
}

const PORT = Number(process.env.COOP_PORT ?? 5174)
const rooms = new Map<string, Room>()
const conns = new Map<WebSocket, Conn>()

const send = (ws: WebSocket | null, msg: ServerMessage) => {
  if (ws && ws.readyState === ws.OPEN && ws.bufferedAmount < 1_000_000) ws.send(JSON.stringify(msg))
}
const fail = (ws: WebSocket, code: string, message: string) => send(ws, { t: 'error', code, message })

function newCode(): string {
  for (;;) {
    const bytes = randomBytes(CODE_LENGTH)
    let code = ''
    for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length]
    if (!rooms.has(code)) return code
  }
}

const newDescent = (): DescentState => ({ stage: 'forming', runId: null, fee: 0n, paid: new Set(), deadline: 0, floors: 0, leavers: new Set(), poll: null })
const capacity = (room: Room) => (room.mode === 'descent' ? DESCENT_SQUAD : STORY_ROOM_SIZE)

function descentView(room: Room): DescentRoom {
  const d = room.descent
  return {
    stage: d.stage,
    runId: d.runId,
    fee: d.fee.toString(),
    size: DESCENT_SQUAD,
    paid: [...d.paid],
    deadline: d.deadline,
    floors: d.floors,
    leavers: [...d.leavers],
    payout: d.payout,
    note: d.note,
  }
}

function roomState(room: Room, you: number): RoomState {
  return {
    mode: room.mode,
    transport: 'server',
    descent: room.mode === 'descent' ? descentView(room) : undefined,
    code: room.code,
    you,
    hostId: room.hostId,
    phase: room.phase,
    chapter: room.chapter,
    difficulty: room.difficulty,
    members: room.members.map((m) => ({ id: m.id, name: m.name, address: m.address, ready: m.ready, connected: m.ws !== null, skin: m.skin, cls: m.cls })),
  }
}

function broadcastRoom(room: Room) {
  for (const m of room.members) send(m.ws, { t: 'room', room: roomState(room, m.id) })
}

// ---------- Game loop ----------

function startGame(room: Room, chapter = room.chapter) {
  stopGame(room)
  const g = new Game('server')
  for (const m of room.members) {
    const slot = g.addSlot(m.name, m.id)
    if (!slot) continue
    slot.unlocked = [...m.unlocked] // story co-op only: Endless Descent keeps everyone equal
    slot.cls = m.cls
    slot.skin = { ...m.skin }
    slot.charges = { ...m.charges }
    slot.connected = m.ws !== null
  }
  g.onBoostUsed = (kind, slotId) => {
    const m = room.members.find((x) => x.id === slotId)
    if (!m) return
    m.charges[kind] = Math.max(0, m.charges[kind] - 1)
    send(m.ws, { t: 'boost', kind })
  }
  g.onStatus = (status: GameStatus) => {
    if (status === 'over' || status === 'cleared' || status === 'won') sendSnapshot(room)
  }
  room.game = g
  room.phase = 'playing'
  room.chapter = chapter
  room.tick = 0
  room.last = performance.now()
  if (room.mode === 'survival') g.startSurvival(chapter, room.difficulty)
  else g.start(chapter, room.difficulty)
  room.timer = setInterval(() => tickRoom(room), 1000 / 60)
  broadcastRoom(room)
}

function stopGame(room: Room) {
  if (room.timer) clearInterval(room.timer)
  room.timer = null
  room.game = null
}

// ---------- Endless Descent ----------

function resetDescent(room: Room) {
  if (room.descent.poll) clearInterval(room.descent.poll)
  room.descent = newDescent()
}

const lower = (a: string) => a.toLowerCase()

/** The squad paid: start the run. */
function startDescentGame(room: Room) {
  stopGame(room)
  const g = new Game('server')
  for (const m of room.members) {
    const slot = g.addSlot(m.name, m.id)
    if (!slot) continue
    slot.cls = m.cls
    slot.skin = { ...m.skin }
    slot.charges = { ...m.charges }
    slot.connected = m.ws !== null
  }
  g.onBoostUsed = (kind, slotId) => {
    const m = room.members.find((x) => x.id === slotId)
    if (!m) return
    m.charges[kind] = Math.max(0, m.charges[kind] - 1)
    send(m.ws, { t: 'boost', kind })
  }
  g.onStatus = (status: GameStatus) => {
    if (status === 'over') {
      sendSnapshot(room)
      finishDescent(room)
    }
  }
  room.game = g
  room.phase = 'playing'
  room.tick = 0
  room.last = performance.now()
  room.descent.stage = 'running'
  room.descent.note = undefined
  g.startDescent()
  room.timer = setInterval(() => tickRoom(room), 1000 / 60)
  broadcastRoom(room)
}

/** Watches the chain for the five entries. Starts the run when all have paid, or gives up on time. */
function pollPayments(room: Room) {
  const d = room.descent
  if (d.stage !== 'paying' || !d.runId) return
  const runId = d.runId
  void (async () => {
    try {
      const addresses = room.members.map((m) => getAddress(m.address))
      const paid = await readPaid(runId, addresses)
      if (room.descent !== d || d.stage !== 'paying') return
      const before = d.paid.size
      d.paid = new Set(paid.map(lower))
      if (d.paid.size === DESCENT_SQUAD && room.members.length === DESCENT_SQUAD) {
        if ((await readRunState(runId)) === RUN_STATE.Full) {
          if (d.poll) clearInterval(d.poll)
          d.poll = null
          startDescentGame(room)
          return
        }
      }
      if (d.paid.size !== before) broadcastRoom(room)
      if (Date.now() > d.deadline) await abortDescent(room, 'Not everyone paid in time. Anyone who paid can take their fee back.')
    } catch (err) {
      console.error('payment poll failed', err)
    }
  })()
}

/** The run cannot start. Cancel it onchain so everyone who paid can refund. */
async function abortDescent(room: Room, note: string) {
  const d = room.descent
  if (d.stage !== 'paying') return
  if (d.poll) clearInterval(d.poll)
  d.poll = null
  const runId = d.runId
  d.stage = 'cancelled'
  d.note = note
  if (runId && d.paid.size > 0) await cancelOnChain(runId)
  if (rooms.has(room.code)) broadcastRoom(room)
}

/** A squad is wiped out: report the floors and who left, then wait for the prize to be credited. */
function finishDescent(room: Room) {
  const d = room.descent
  const g = room.game
  if (!g || !d.runId || d.stage !== 'running') return
  const runId = d.runId
  const floors = g.floorsCleared
  d.floors = floors
  for (const m of room.members) if (m.ws === null) d.leavers.add(lower(m.address))
  const leavers = [...d.leavers].map((a) => getAddress(a))
  d.stage = 'settling'
  d.note = 'Settling the run onchain...'
  broadcastRoom(room)
  void (async () => {
    for (let attempt = 0; attempt < 2000; attempt++) {
      const out = await settleOnChain(runId, floors, leavers)
      if (out.kind === 'settled') {
        d.stage = 'settled'
        d.note = undefined
        d.payout = { totalPaid: out.totalPaid.toString(), stayers: out.stayers, txHash: out.txHash }
        if (rooms.has(room.code)) broadcastRoom(room)
        return
      }
      d.note = out.message
      if (rooms.has(room.code)) broadcastRoom(room)
      await new Promise((r) => setTimeout(r, out.kind === 'deferred' ? 300_000 : attempt < 3 ? 10_000 : 120_000))
    }
  })()
}

/** A member is leaving for good. Before the run that cancels it; during the run they forfeit their share. */
function handleDescentLeave(room: Room, member: Member) {
  const d = room.descent
  if (room.mode !== 'descent') return
  if (d.stage === 'paying') {
    void abortDescent(room, 'A player left before the run started. Anyone who paid can take their fee back.')
  } else if (d.stage === 'running') {
    d.leavers.add(lower(member.address))
    const stayers = room.members.filter((m) => m !== member && m.ws !== null)
    if (stayers.length === 0) {
      for (const m of room.members) d.leavers.add(lower(m.address))
      finishDescent(room)
    }
  }
}

function sendSnapshot(room: Room) {
  const g = room.game
  if (!g) return
  const payload: ServerMessage = { t: 'snap', s: makeSnapshot(g, room.tick), ev: g.events.splice(0) }
  const text = JSON.stringify(payload)
  for (const m of room.members) {
    if (m.ws && m.ws.readyState === m.ws.OPEN && m.ws.bufferedAmount < 1_000_000) m.ws.send(text)
  }
}

function tickRoom(room: Room) {
  const g = room.game
  if (!g) return
  const now = performance.now()
  const dt = Math.min(0.1, (now - room.last) / 1000)
  room.last = now
  try {
    g.update(dt)
  } catch (err) {
    console.error('room', room.code, 'tick failed', err)
  }
  room.tick++
  if (room.tick % 3 === 0) sendSnapshot(room)
}

// ---------- Rooms ----------

function leaveRoom(conn: Conn, permanent = true) {
  const { room, member } = conn
  conn.room = undefined
  conn.member = undefined
  if (!room || !member) return
  // a newer connection already took this place over (reconnect): leave it alone
  if (member.ws !== conn.ws) return
  member.ws = null
  const slot = room.game?.slotById(member.id)
  if (slot) {
    slot.connected = false
    slot.keys.clear()
    slot.firing = false
  }
  // In a lobby, or when the player chose to leave, the place is freed straight away.
  // A squad that is paying keeps its seats through a page reload; otherwise the lobby frees the seat at once.
  const holdSeat = room.mode === 'descent' && room.descent.runId !== null
  if (permanent || (room.phase === 'lobby' && !holdSeat)) removeMember(room, member)
  else member.droppedAt = Date.now()
  broadcastRoom(room)
}

function removeMember(room: Room, member: Member) {
  handleDescentLeave(room, member)
  room.members = room.members.filter((m) => m !== member)
  room.game?.removeSlot(member.id)
  if (room.hostId === member.id) {
    const next = room.members.find((m) => m.ws) ?? room.members[0]
    if (next) room.hostId = next.id
  }
  if (room.members.length === 0) {
    stopGame(room)
    if (room.descent.poll) clearInterval(room.descent.poll)
    rooms.delete(room.code)
  }
}

setInterval(() => {
  const now = Date.now()
  for (const room of [...rooms.values()]) {
    for (const m of [...room.members]) {
      if (m.droppedAt && now - m.droppedAt > RECONNECT_SECONDS * 1000) {
        removeMember(room, m)
        if (rooms.has(room.code)) broadcastRoom(room)
      }
    }
    if (room.members.length > 0 && room.members.every((m) => m.ws === null) && room.phase === 'lobby') {
      stopGame(room)
      rooms.delete(room.code)
    }
  }
}, 1000)

function addMember(room: Room, conn: Conn): Member | null {
  const v = conn.verified
  if (!v || room.members.length >= capacity(room)) return null
  const member: Member = {
    id: room.nextMemberId++,
    name: v.name,
    address: v.address,
    token: randomBytes(16).toString('hex'),
    ws: conn.ws,
    ready: false,
    skin: v.skin,
    charges: { ...v.charges },
    unlocked: [...v.unlocked],
    cls: DEFAULT_CLASS,
  }
  room.members.push(member)
  return member
}

const isHost = (conn: Conn) => Boolean(conn.room && conn.member && conn.room.hostId === conn.member.id)

async function onMessage(conn: Conn, raw: string) {
  let msg: ClientMessage
  try {
    msg = JSON.parse(raw) as ClientMessage
  } catch {
    return
  }
  if (typeof msg !== 'object' || msg === null || typeof msg.t !== 'string') return
  const { ws } = conn

  if (msg.t === 'auth') {
    if (conn.verified) return
    const result = await verifyJoin(conn.nonce, msg)
    if ('error' in result) {
      fail(ws, 'auth', result.error)
      return
    }
    conn.verified = result
    send(ws, { t: 'authed', address: result.address, name: result.name, skin: result.skin, charges: result.charges, notices: result.notices })
    return
  }
  if (!conn.verified && msg.t === 'rejoin') {
    // a secret token from an earlier sign-in is enough to take your place back, so a reload needs no new signature
    const room = rooms.get(String(msg.code ?? '').toUpperCase())
    const member = room?.members.find((m) => m.token === msg.token)
    if (member) conn.verified = { address: member.address as `0x${string}`, name: member.name, skin: member.skin, charges: member.charges, unlocked: member.unlocked, notices: [] }
  }
  if (!conn.verified) {
    fail(ws, 'auth', 'Connect your wallet and sign in first. Co-op needs a wallet.')
    return
  }

  switch (msg.t) {
    case 'create': {
      leaveRoom(conn)
      const room: Room = {
        mode: 'story', descent: newDescent(), code: newCode(), hostId: 1, members: [], phase: 'lobby', chapter: 0, difficulty: 'normal',
        game: null, timer: null, tick: 0, last: 0, nextMemberId: 1,
      }
      const member = addMember(room, conn)
      if (!member) return
      room.hostId = member.id
      rooms.set(room.code, room)
      conn.room = room
      conn.member = member
      send(ws, { t: 'room', room: roomState(room, member.id), token: member.token })
      return
    }
    case 'join': {
      const code = String(msg.code ?? '').toUpperCase().trim()
      const room = rooms.get(code)
      if (!room) return fail(ws, 'no-room', 'No room with that code.')
      if (room.phase !== 'lobby') return fail(ws, 'started', 'That run has already started.')
      if (room.mode === 'descent' && room.descent.runId) return fail(ws, 'locked', 'That squad is paying for a run right now.')
      if (room.members.length >= capacity(room)) return fail(ws, 'full', 'That room is full.')
      if (room.members.some((m) => m.address.toLowerCase() === conn.verified?.address.toLowerCase())) return fail(ws, 'duplicate', 'This wallet is already in that room.')
      leaveRoom(conn)
      const member = addMember(room, conn)
      if (!member) return fail(ws, 'full', 'That room is full.')
      conn.room = room
      conn.member = member
      send(ws, { t: 'room', room: roomState(room, member.id), token: member.token })
      broadcastRoom(room)
      return
    }
    case 'rejoin': {
      const room = rooms.get(String(msg.code ?? '').toUpperCase())
      const member = room?.members.find((m) => m.token === msg.token && m.address.toLowerCase() === conn.verified?.address.toLowerCase())
      if (!room || !member) return fail(ws, 'gone', 'That room is no longer available.')
      member.ws?.close()
      member.ws = ws
      member.droppedAt = undefined
      conn.room = room
      conn.member = member
      const slot = room.game?.slotById(member.id)
      if (slot) slot.connected = true
      send(ws, { t: 'room', room: roomState(room, member.id), token: member.token })
      broadcastRoom(room)
      return
    }
    case 'leave':
      leaveRoom(conn)
      send(ws, { t: 'left' })
      return
    case 'input': {
      const room = conn.room
      const member = conn.member
      if (!room?.game || !member) return
      const input = validInput(msg as unknown as Record<string, unknown>)
      if (input) room.game.applyInput(member.id, input)
      return
    }
  }

  const { room, member } = conn
  if (!room || !member) return fail(ws, 'no-room', 'Join or create a room first.')

  switch (msg.t) {
    case 'ready':
      if (room.phase !== 'lobby') return
      member.ready = msg.ready === true
      broadcastRoom(room)
      return
    case 'class':
      if (room.phase !== 'lobby' || !isClassId(msg.cls)) return
      member.cls = msg.cls
      broadcastRoom(room)
      return
    case 'config': {
      if (!isHost(conn) || room.phase !== 'lobby') return
      const chapter = Math.floor(Number(msg.chapter))
      if (chapter >= 0 && chapter < CHAPTERS.length) room.chapter = chapter
      if (DIFFICULTIES.includes(msg.difficulty)) room.difficulty = msg.difficulty
      broadcastRoom(room)
      return
    }
    case 'mode': {
      if (!isHost(conn) || room.phase !== 'lobby' || room.descent.runId) return
      if (msg.mode === 'descent') {
        if (!descentReady()) return fail(ws, 'descent-off', 'Endless Descent is not set up on this server yet.')
        room.mode = 'descent'
      } else if (msg.mode === 'story' || msg.mode === 'survival') {
        if (room.members.length > STORY_ROOM_SIZE) return fail(ws, 'too-many', 'This mode fits four players. Ask one to leave first.')
        room.mode = msg.mode
      } else return
      for (const m of room.members) m.ready = false
      resetDescent(room)
      broadcastRoom(room)
      return
    }
    case 'ticket': {
      if (room.mode !== 'descent' || room.phase !== 'lobby' || !descentReady()) return fail(ws, 'descent-off', 'Endless Descent is not available.')
      if (room.members.length !== DESCENT_SQUAD) return fail(ws, 'squad', 'Endless Descent needs a full squad of five players.')
      if (room.members.some((m) => m.ws === null)) return fail(ws, 'offline', 'Wait for everyone to be connected.')
      const d = room.descent
      if (d.stage === 'cancelled' || d.stage === 'settling' || d.stage === 'settled' || d.stage === 'running') return fail(ws, 'locked', 'This run is already finished. Go back to the lobby for a new one.')
      if (!d.runId) {
        d.runId = newRunId()
        d.stage = 'paying'
        d.deadline = Date.now() + 10 * 60_000
        d.poll = setInterval(() => pollPayments(room), 2500)
      }
      if (d.paid.size === 0) d.fee = await readEntryFee()
      const expiry = Math.floor(Date.now() / 1000) + 10 * 60
      const signature = await signTicket(d.runId, getAddress(member.address) as Address, d.fee, expiry)
      send(ws, { t: 'ticket', runId: d.runId, expiry, fee: d.fee.toString(), signature })
      broadcastRoom(room)
      return
    }
    case 'start':
      if (room.mode === 'descent') return
      if (!isHost(conn) || room.phase !== 'lobby') return
      if (room.members.some((m) => m.ws === null)) return fail(ws, 'offline', 'Wait for everyone to be connected.')
      if (room.members.length > STORY_ROOM_SIZE) return fail(ws, 'too-many', 'Story co-op fits four players.')
      startGame(room)
      return
    case 'next':
      if (isHost(conn) && room.game?.status === 'cleared') {
        room.game.nextChapter()
        room.chapter = room.game.chapterIndex
        sendSnapshot(room)
        broadcastRoom(room)
      }
      return
    case 'retry':
      if (room.mode === 'descent') return
      if (isHost(conn) && room.game && (room.game.status === 'over' || room.game.status === 'won')) {
        startGame(room, room.game.status === 'won' ? 0 : room.chapter)
      }
      return
    case 'lobby':
      if (!isHost(conn)) return
      if (room.mode === 'descent') {
        const stage = room.descent.stage
        if (stage === 'paying' || stage === 'running' || stage === 'settling') return
        resetDescent(room)
      }
      stopGame(room)
      room.phase = 'lobby'
      for (const m of room.members) m.ready = false
      broadcastRoom(room)
      return
  }
}

// ---------- Network ----------

// The online relay shares this server: friends whose networks cannot connect directly (WebRTC) meet here
// instead, while the host's browser still runs the match. See server/relay.ts.
const relay = createRelay()

const http = createServer((req, res) => {
  if (relay.health(req, res)) return
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...conns.values()].filter((c) => c.member).length, relay: relay.hub.stats() }))
    return
  }
  res.writeHead(404)
  res.end()
})

/** Largest message a co-op client may send. Relay frames (snapshots from a host) are allowed to be bigger. */
const MAX_COOP_MESSAGE = 4096

// One WebSocket server for both endpoints: two servers on one port would refuse each other's handshakes.
const wss = new WebSocketServer({ server: http, maxPayload: DEFAULT_RELAY_LIMITS.maxHostFrame })

wss.on('connection', (ws, req) => {
  if (isRelayRequest(req)) {
    relay.connect(ws, req)
    return
  }
  if ((req.url ?? '').split('?')[0].replace(/\/+$/, '') !== COOP_PATH) {
    ws.close(4009, 'unknown path')
    return
  }
  const conn: Conn = { ws, nonce: randomBytes(16).toString('hex'), windowStart: Date.now(), count: 0 }
  conns.set(ws, conn)
  send(ws, { t: 'challenge', nonce: conn.nonce, message: signInMessage(conn.nonce) })
  ws.on('message', (data) => {
    const now = Date.now()
    if (now - conn.windowStart > 1000) {
      conn.windowStart = now
      conn.count = 0
    }
    if (++conn.count > 120) return // flood protection
    const text = data.toString()
    if (text.length > MAX_COOP_MESSAGE) return
    void onMessage(conn, text).catch((err) => console.error('message failed', err))
  })
  ws.on('close', () => {
    leaveRoom(conn, false)
    conns.delete(ws)
  })
  ws.on('error', () => ws.close())
})

http.listen(PORT, () => console.log(`coop server listening on ${PORT} (co-op on ${COOP_PATH}, online relay on /relay)`))

const stop = () => {
  for (const room of rooms.values()) stopGame(room)
  relay.close()
  http.close()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
