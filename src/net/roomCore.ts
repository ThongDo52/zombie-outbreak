import { CHAPTERS } from '@/game/chapters'
import { DEFAULT_CLASS, isClassId, type ClassId } from '@/game/classes'
import { DIFFICULTIES, type Difficulty } from '@/game/difficulty'
import { Game } from '@/game/engine'
import { makeSnapshot } from '@/game/replica'
import type { SkinSelection } from '@/game/skins'
import type { BoostCharges, GameStatus, WeaponId } from '@/game/types'
import { validInput } from './input'
import type { JoinClaim, Verified } from './ownership'
import { RECONNECT_SECONDS, STORY_ROOM_SIZE, signInMessage, type ClientMessage, type RoomPhase, type RoomState, type ServerMessage } from './protocol'
import type { Link } from './transport'

/**
 * A story or Survival co-op room that lives wherever it is created: in the host player's browser (in a
 * Web Worker), or in a test. It never touches the network itself. Everyone, including the host's own
 * player, talks to it through a Link, so the host plays through exactly the same path as the guests.
 * Endless Descent is not here: it pays real USDC and needs the trusted server.
 */

interface Member {
  id: number
  name: string
  address: string
  token: string
  link: Link | null
  ready: boolean
  skin: SkinSelection
  charges: BoostCharges
  unlocked: WeaponId[]
  cls: ClassId
  droppedAt?: number
}

interface Conn {
  link: Link
  nonce: string
  verified?: Verified
  member?: Member
  windowStart: number
  count: number
}

export interface RoomCoreOptions {
  code: string
  /** Checks the wallet signature and trims claimed skins and boosts to what the wallet owns. */
  verify: (nonce: string, claim: JoinClaim) => Promise<Verified | { error: string }>
  /** The room is over (the host left); every link has been closed. */
  onClosed?: (reason: string) => void
}

const randomHex = (bytes: number) => {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export class RoomCore {
  readonly code: string
  private members: Member[] = []
  private conns = new Set<Conn>()
  private hostId = 0
  private phase: RoomPhase = 'lobby'
  private mode: 'story' | 'survival' = 'story'
  private chapter = 0
  private difficulty: Difficulty = 'normal'
  private game: Game | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private sweeper: ReturnType<typeof setInterval> | null = null
  private tickCount = 0
  private last = 0
  private nextId = 1
  private closed = false

  constructor(private readonly opts: RoomCoreOptions) {
    this.code = opts.code.toUpperCase()
    this.sweeper = setInterval(() => this.sweep(), 1000)
  }

  /** Hand the room a new connection. It is asked to sign in first. */
  connect(link: Link) {
    if (this.closed) {
      link.close()
      return
    }
    const conn: Conn = { link, nonce: randomHex(16), windowStart: Date.now(), count: 0 }
    this.conns.add(conn)
    link.onMessage = (text) => void this.onMessage(conn, text)
    link.onClose = () => this.onDisconnect(conn)
    this.send(link, { t: 'challenge', nonce: conn.nonce, message: signInMessage(conn.nonce) })
  }

  /** Advance the game by dt seconds and send a snapshot every third step. Normally driven by the room's own timer. */
  step(dt: number) {
    const g = this.game
    if (!g) return
    try {
      g.update(Math.min(0.1, dt))
    } catch (err) {
      console.error('room', this.code, 'tick failed', err)
    }
    this.tickCount++
    if (this.tickCount % 3 === 0) this.sendSnapshot()
  }

  close(reason: string) {
    if (this.closed) return
    this.closed = true
    this.stopGame()
    if (this.sweeper) clearInterval(this.sweeper)
    this.sweeper = null
    for (const m of this.members) this.send(m.link, { t: 'error', code: 'host-left', message: reason })
    for (const c of [...this.conns]) c.link.close()
    this.conns.clear()
    this.members = []
    this.opts.onClosed?.(reason)
  }

  get playerCount() {
    return this.members.length
  }

  // ---------- Sending ----------

  private send(link: Link | null, msg: ServerMessage) {
    if (link?.open) link.send(JSON.stringify(msg))
  }
  private fail(link: Link, code: string, message: string) {
    this.send(link, { t: 'error', code, message })
  }

  private state(you: number): RoomState {
    return {
      mode: this.mode,
      transport: 'peer',
      code: this.code,
      you,
      hostId: this.hostId,
      phase: this.phase,
      chapter: this.chapter,
      difficulty: this.difficulty,
      members: this.members.map((m) => ({ id: m.id, name: m.name, address: m.address, ready: m.ready, connected: m.link !== null, skin: m.skin, cls: m.cls })),
    }
  }

  private broadcast() {
    for (const m of this.members) this.send(m.link, { t: 'room', room: this.state(m.id) })
  }

  private sendSnapshot() {
    const g = this.game
    if (!g) return
    const text = JSON.stringify({ t: 'snap', s: makeSnapshot(g, this.tickCount), ev: g.events.splice(0) } satisfies ServerMessage)
    for (const m of this.members) if (m.link?.open) m.link.send(text)
  }

  // ---------- Game ----------

  private startGame(chapter = this.chapter) {
    this.stopGame()
    const g = new Game('server')
    for (const m of this.members) {
      const slot = g.addSlot(m.name, m.id)
      if (!slot) continue
      slot.unlocked = [...m.unlocked]
      slot.cls = m.cls
      slot.skin = { ...m.skin }
      slot.charges = { ...m.charges }
      slot.connected = m.link !== null
    }
    g.onBoostUsed = (kind, slotId) => {
      const m = this.members.find((x) => x.id === slotId)
      if (!m) return
      m.charges[kind] = Math.max(0, m.charges[kind] - 1)
      this.send(m.link, { t: 'boost', kind })
    }
    g.onStatus = (status: GameStatus) => {
      if (status === 'over' || status === 'cleared' || status === 'won') this.sendSnapshot()
    }
    this.game = g
    this.phase = 'playing'
    this.chapter = chapter
    this.tickCount = 0
    this.last = performance.now()
    if (this.mode === 'survival') g.startSurvival(chapter, this.difficulty)
    else g.start(chapter, this.difficulty)
    // a worker's timers are not throttled the way a hidden tab's are, so this keeps the match alive in the background
    this.timer = setInterval(() => {
      const now = performance.now()
      const dt = (now - this.last) / 1000
      this.last = now
      this.step(dt)
    }, 1000 / 60)
    this.broadcast()
  }

  private stopGame() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.game = null
  }

  // ---------- Members ----------

  private addMember(conn: Conn): Member | null {
    const v = conn.verified
    if (!v || this.members.length >= STORY_ROOM_SIZE) return null
    const member: Member = {
      id: this.nextId++,
      name: v.name,
      address: v.address,
      token: randomHex(16),
      link: conn.link,
      ready: false,
      skin: v.skin,
      charges: { ...v.charges },
      unlocked: [...v.unlocked],
      cls: DEFAULT_CLASS,
    }
    this.members.push(member)
    return member
  }

  private isHost(conn: Conn) {
    return Boolean(conn.member && conn.member.id === this.hostId)
  }

  private removeMember(member: Member) {
    this.members = this.members.filter((m) => m !== member)
    this.game?.removeSlot(member.id)
    if (member.id === this.hostId) this.close('The host left the room.')
  }

  private onDisconnect(conn: Conn) {
    this.conns.delete(conn)
    const member = conn.member
    conn.member = undefined
    if (!member || this.closed) return
    // a newer connection already took this place over (a reload): leave it alone
    if (member.link !== conn.link) return
    member.link = null
    const slot = this.game?.slotById(member.id)
    if (slot) {
      slot.connected = false
      slot.keys.clear()
      slot.firing = false
    }
    if (member.id === this.hostId) {
      this.close('The host left the room.')
      return
    }
    if (this.phase === 'lobby') this.removeMember(member)
    else member.droppedAt = Date.now()
    if (!this.closed) this.broadcast()
  }

  private sweep() {
    const now = Date.now()
    for (const m of [...this.members]) {
      if (m.droppedAt && now - m.droppedAt > RECONNECT_SECONDS * 1000) {
        this.removeMember(m)
        if (!this.closed) this.broadcast()
      }
    }
  }

  // ---------- Messages ----------

  private async onMessage(conn: Conn, raw: string) {
    if (this.closed || raw.length > 4096) return
    const now = Date.now()
    if (now - conn.windowStart > 1000) {
      conn.windowStart = now
      conn.count = 0
    }
    if (++conn.count > 120) return
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw) as ClientMessage
    } catch {
      return
    }
    if (typeof msg !== 'object' || msg === null || typeof msg.t !== 'string') return
    const { link } = conn

    if (msg.t === 'ping') {
      this.send(link, { t: 'pong', n: Number(msg.n) || 0 })
      return
    }
    if (msg.t === 'auth') {
      if (conn.verified) return
      const result = await this.opts.verify(conn.nonce, msg)
      if ('error' in result) {
        this.fail(link, 'auth', result.error)
        return
      }
      conn.verified = result
      this.send(link, { t: 'authed', address: result.address, name: result.name, skin: result.skin, charges: result.charges, notices: result.notices })
      return
    }
    if (!conn.verified && msg.t === 'rejoin') {
      // a secret token from an earlier sign-in is enough to take your place back, so a reload needs no new signature
      const member = this.members.find((m) => m.token === msg.token && this.code === String(msg.code ?? '').toUpperCase())
      if (member) conn.verified = { address: member.address as `0x${string}`, name: member.name, skin: member.skin, charges: member.charges, unlocked: member.unlocked, notices: [] }
    }
    if (!conn.verified) {
      this.fail(link, 'auth', 'Connect your wallet and sign in first. Co-op needs a wallet.')
      return
    }

    switch (msg.t) {
      case 'create': {
        if (this.members.length > 0) return this.fail(link, 'exists', 'This room already has a host.')
        const member = this.addMember(conn)
        if (!member) return
        this.hostId = member.id
        conn.member = member
        this.send(link, { t: 'room', room: this.state(member.id), token: member.token })
        return
      }
      case 'join': {
        if (String(msg.code ?? '').toUpperCase().trim() !== this.code) return this.fail(link, 'no-room', 'No room with that code.')
        if (this.members.length === 0) return this.fail(link, 'no-room', 'No room with that code.')
        if (this.phase !== 'lobby') return this.fail(link, 'started', 'That run has already started.')
        if (this.members.length >= STORY_ROOM_SIZE) return this.fail(link, 'full', 'That room is full.')
        if (this.members.some((m) => m.address.toLowerCase() === conn.verified?.address.toLowerCase())) return this.fail(link, 'duplicate', 'This wallet is already in that room.')
        const member = this.addMember(conn)
        if (!member) return this.fail(link, 'full', 'That room is full.')
        conn.member = member
        this.send(link, { t: 'room', room: this.state(member.id), token: member.token })
        this.broadcast()
        return
      }
      case 'rejoin': {
        const member = this.members.find((m) => m.token === msg.token && m.address.toLowerCase() === conn.verified?.address.toLowerCase())
        if (!member || this.code !== String(msg.code ?? '').toUpperCase()) return this.fail(link, 'gone', 'That room is no longer available.')
        member.link?.close()
        member.link = link
        member.droppedAt = undefined
        conn.member = member
        const slot = this.game?.slotById(member.id)
        if (slot) slot.connected = true
        this.send(link, { t: 'room', room: this.state(member.id), token: member.token })
        this.broadcast()
        return
      }
      case 'ticket':
        return this.fail(link, 'descent-off', 'Endless Descent runs on the server, not in a room on a friend\'s device.')
      case 'leave': {
        const member = conn.member
        conn.member = undefined
        if (member) this.removeMember(member)
        this.send(link, { t: 'left' })
        if (!this.closed) this.broadcast()
        return
      }
      case 'input': {
        const member = conn.member
        if (!this.game || !member) return
        const input = validInput(msg as unknown as Record<string, unknown>)
        if (input) this.game.applyInput(member.id, input)
        return
      }
    }

    const member = conn.member
    if (!member) return this.fail(link, 'no-room', 'Join or create a room first.')

    switch (msg.t) {
      case 'ready':
        if (this.phase !== 'lobby') return
        member.ready = msg.ready === true
        this.broadcast()
        return
      case 'class':
        // anyone may pick their own class, until the run starts
        if (this.phase !== 'lobby' || !isClassId(msg.cls)) return
        member.cls = msg.cls
        this.broadcast()
        return
      case 'config': {
        if (!this.isHost(conn) || this.phase !== 'lobby') return
        const chapter = Math.floor(Number(msg.chapter))
        if (chapter >= 0 && chapter < CHAPTERS.length) this.chapter = chapter
        if (DIFFICULTIES.includes(msg.difficulty)) this.difficulty = msg.difficulty
        this.broadcast()
        return
      }
      case 'mode': {
        if (!this.isHost(conn) || this.phase !== 'lobby') return
        if (msg.mode === 'descent') return this.fail(link, 'descent-off', 'Endless Descent runs on the server. Start it from the Endless Descent entry.')
        if (msg.mode !== 'story' && msg.mode !== 'survival') return
        this.mode = msg.mode
        for (const m of this.members) m.ready = false
        this.broadcast()
        return
      }
      case 'start':
        if (!this.isHost(conn) || this.phase !== 'lobby') return
        if (this.members.some((m) => m.link === null)) return this.fail(link, 'offline', 'Wait for everyone to be connected.')
        this.startGame()
        return
      case 'next':
        if (this.isHost(conn) && this.game?.status === 'cleared') {
          this.game.nextChapter()
          this.chapter = this.game.chapterIndex
          this.sendSnapshot()
          this.broadcast()
        }
        return
      case 'retry':
        if (this.isHost(conn) && this.game && (this.game.status === 'over' || this.game.status === 'won')) {
          this.startGame(this.game.status === 'won' ? 0 : this.chapter)
        }
        return
      case 'lobby':
        if (!this.isHost(conn)) return
        this.stopGame()
        this.phase = 'lobby'
        for (const m of this.members) m.ready = false
        this.broadcast()
        return
    }
  }
}
