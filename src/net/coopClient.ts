import { Game } from '@/game/engine'
import type { Difficulty } from '@/game/difficulty'
import { applyEvent, applySnapshot } from '@/game/replica'
import { DEFAULT_CLASS, type ClassId } from '@/game/classes'
import { getGame, loadClass } from '@/game/save'
import type { SkinSelection } from '@/game/skins'
import type { BoostCharges, PlayerInput, WeaponId } from '@/game/types'
import { startHosting, type HostSession } from './hostSession'
import { loadIceServers } from './ice'
import { joinPeer } from './peer'
import { COOP_PATH, RECONNECT_SECONDS, type ClientMessage, type RoomMode, type RoomState, type ServerMessage } from './protocol'
import { webSocketLink, type Link } from './transport'

export type TicketMsg = Extract<ServerMessage, { t: 'ticket' }>

export type CoopPhase = 'idle' | 'connecting' | 'signing' | 'online' | 'reconnecting'

/** Where a room runs: the Endless Descent server, your own device, or a friend's device reached by its code. */
export type CoopTarget = { kind: 'server' } | { kind: 'host' } | { kind: 'peer'; code: string }

/** How your traffic reaches the room. */
export type Route = 'local' | 'server' | 'direct' | 'relayed' | 'unknown'

export interface CoopState {
  phase: CoopPhase
  room: RoomState | null
  error: string | null
  notices: string[]
  /** Round trip to the room in milliseconds, once measured. */
  ping: number | null
  route: Route | null
  /** Set while you host a friend-hosted room on this device. */
  hosting: { code: string; inWorker: boolean; relay: boolean } | null
}

const SESSION_KEY = 'coop-session'
const INPUT_HZ = 30
const PING_EVERY_MS = 2000
/** No answer for this long and the link is treated as dead, so the reconnect path takes over. */
const PING_TIMEOUT_MS = 9000

interface StoredSession {
  code: string
  token: string
  /** Where the room runs. A room hosted on a device cannot outlive that device's page. */
  kind: 'server' | 'peer' | 'host'
}

function readSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

function writeSession(s: StoredSession | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // session storage unavailable: reload will simply not rejoin
  }
}

/**
 * Browser side of co-op. Holds a replica of the room's game, sends the local player's input and
 * applies the snapshots and effects the room streams back. The room can be on the Endless Descent
 * server, in this browser (when you host), or in a friend's browser: the client does not care which.
 */
export class CoopClient {
  /** The game the screen draws while a room is running. It never simulates, it only shows. */
  readonly game = new Game('replica')
  private state: CoopState = { phase: 'idle', room: null, error: null, notices: [], ping: null, route: null, hosting: null }
  private listeners = new Set<() => void>()
  private link: Link | null = null
  private hosting: HostSession | null = null
  private target: CoopTarget = { kind: 'server' }
  private token: string | null = null
  private inputTimer: ReturnType<typeof setInterval> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private lastPong = 0
  private closing = false
  /** The class you picked, announced to every room you enter. */
  private cls: ClassId = typeof localStorage === 'undefined' ? DEFAULT_CLASS : loadClass()
  /** Open the new server room as an Endless Descent squad as soon as it exists. */
  private wantDescent = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryUntil = 0
  private pendingChallenge: ((m: { nonce: string; message: string }) => void) | null = null
  private pendingAuth: { resolve: () => void; reject: (e: Error) => void } | null = null
  private pendingTicket: { resolve: (t: TicketMsg) => void; reject: (e: Error) => void } | null = null

  // ---------- Subscription for React ----------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getState = (): CoopState => this.state

  private set(patch: Partial<CoopState>) {
    this.state = { ...this.state, ...patch }
    for (const fn of this.listeners) fn()
  }

  get inRoom(): boolean {
    return this.state.room !== null
  }

  // ---------- Connection ----------

  private serverUrl(): string {
    // a deployed copy of the page can point at a co-op server running somewhere else
    const custom = (import.meta.env.VITE_COOP_URL as string | undefined)?.trim()
    if (custom) return custom
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${location.host}${COOP_PATH}`
  }

  private openServer(): Promise<Link> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.serverUrl())
      ws.onopen = () => resolve(webSocketLink(ws))
      ws.onerror = () => reject(new Error('Could not reach the Endless Descent server. Co-op for story and Survival does not need it: host a room on your device instead.'))
    })
  }

  /** Open the connection for a target and start listening to it. */
  private async connectTo(target: CoopTarget): Promise<void> {
    this.target = target
    this.closing = false
    let link: Link
    let route: Route = 'unknown'
    if (target.kind === 'server') {
      link = await this.openServer()
      route = 'server'
    } else if (target.kind === 'host') {
      this.hosting = await startHosting((reason) => this.onHostClosed(reason))
      link = this.hosting.local
      route = 'local'
      this.set({ hosting: { code: this.hosting.code, inWorker: this.hosting.inWorker, relay: this.hosting.relay } })
    } else {
      link = await joinPeer(target.code, await loadIceServers())
    }
    this.link = link
    link.onMessage = (text) => {
      try {
        this.onMessage(JSON.parse(text) as ServerMessage)
      } catch {
        // a message that is not valid JSON is ignored
      }
    }
    link.onClose = () => this.onClose(link)
    this.lastPong = Date.now()
    this.set({ route, ping: null })
    if ('route' in link && typeof (link as { route: unknown }).route === 'function') {
      void (link as unknown as { route(): Promise<Route> }).route().then((r) => this.link === link && this.set({ route: r }))
    }
  }

  /** Connect, prove wallet ownership by signing, and finish ready to create or join a room. */
  async signIn(
    address: string,
    sign: (message: string) => Promise<string>,
    skin: SkinSelection,
    charges: BoostCharges,
    unlocked: WeaponId[] = [],
    target: CoopTarget = { kind: 'server' },
  ) {
    this.set({ phase: 'connecting', error: null, notices: [] })
    try {
      const challenge = new Promise<{ nonce: string; message: string }>((res) => (this.pendingChallenge = res))
      await this.connectTo(target)
      const c = await challenge
      this.set({ phase: 'signing' })
      const signature = await sign(c.message)
      const authed = new Promise<void>((resolve, reject) => (this.pendingAuth = { resolve, reject }))
      this.send({ t: 'auth', address, signature, skin, charges, unlocked })
      await authed
      this.set({ phase: 'online' })
      this.startPing()
    } catch (e) {
      this.closeLink()
      this.set({ phase: 'idle', error: e instanceof Error ? e.message : 'Sign-in failed.' })
    }
  }

  /** Sign in, then start a room on this device. The code in the result is what friends type. */
  async hostRoom(address: string, sign: (message: string) => Promise<string>, skin: SkinSelection, charges: BoostCharges, unlocked: WeaponId[]) {
    await this.signIn(address, sign, skin, charges, unlocked, { kind: 'host' })
    if (this.state.phase === 'online') this.create()
  }

  /** Sign in, then join a friend's room by its code. */
  async joinRoom(code: string, address: string, sign: (message: string) => Promise<string>, skin: SkinSelection, charges: BoostCharges, unlocked: WeaponId[]) {
    const clean = code.trim().toUpperCase()
    await this.signIn(address, sign, skin, charges, unlocked, { kind: 'peer', code: clean })
    if (this.state.phase === 'online') this.join(clean)
  }

  /** After a reload or a dropped connection: take the old place back with the secret token. No new signature. */
  async resumeIfPossible(): Promise<boolean> {
    const session = readSession()
    if (!session) return false
    if (session.kind === 'host') {
      // a room hosted on this device ended with the page
      writeSession(null)
      return false
    }
    this.set({ phase: 'reconnecting', error: null })
    try {
      await this.connectTo(session.kind === 'peer' ? { kind: 'peer', code: session.code } : { kind: 'server' })
      this.token = session.token
      this.send({ t: 'rejoin', code: session.code, token: session.token })
      this.startPing()
      return true
    } catch {
      writeSession(null)
      this.set({ phase: 'idle' })
      return false
    }
  }

  private closeLink() {
    this.closing = true
    this.stopPing()
    const link = this.link
    this.link = null
    link?.close()
    const hosted = this.hosting
    this.hosting = null
    hosted?.close()
  }

  private onHostClosed(reason: string) {
    if (this.hosting === null) return
    this.hosting = null
    this.dispose(reason)
  }

  private onClose(link: Link) {
    if (link !== this.link) return
    this.link = null
    this.stopInput()
    this.stopPing()
    if (this.closing || !this.state.room || this.target.kind === 'host') {
      this.set({ phase: 'idle' })
      return
    }
    // dropped by accident: keep trying for as long as the room holds our place
    this.set({ phase: 'reconnecting', ping: null })
    this.retryUntil = Date.now() + RECONNECT_SECONDS * 1000
    this.scheduleRetry()
  }

  private scheduleRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => {
      if (Date.now() > this.retryUntil) {
        this.dispose('The connection was lost and the room is gone.')
        return
      }
      void this.resumeIfPossible().then((ok) => {
        if (!ok && this.state.room) this.scheduleRetry()
      })
    }, 1500)
  }

  private send(msg: ClientMessage) {
    if (this.link?.open) this.link.send(JSON.stringify(msg))
  }

  // ---------- Ping ----------

  private startPing() {
    if (this.pingTimer) return
    this.pingTimer = setInterval(() => {
      if (!this.link) return
      if (this.target.kind !== 'host' && Date.now() - this.lastPong > PING_TIMEOUT_MS) {
        // nothing came back for a long while: treat the link as dead so the reconnect path takes over
        this.link.close()
        return
      }
      this.send({ t: 'ping', n: Date.now() })
    }, PING_EVERY_MS)
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
  }

  // ---------- Messages from the room ----------

  private onMessage(m: ServerMessage) {
    this.lastPong = Date.now()
    switch (m.t) {
      case 'challenge':
        this.pendingChallenge?.({ nonce: m.nonce, message: m.message })
        this.pendingChallenge = null
        break
      case 'authed':
        this.set({ notices: m.notices })
        this.pendingAuth?.resolve()
        this.pendingAuth = null
        break
      case 'pong':
        this.set({ ping: Math.max(0, Date.now() - m.n) })
        break
      case 'error':
        if (m.code === 'gone' || m.code === 'host-left') {
          this.dispose(m.message)
          break
        }
        if (this.pendingTicket) {
          this.pendingTicket.reject(new Error(m.message))
          this.pendingTicket = null
        } else if (this.pendingAuth) {
          this.pendingAuth.reject(new Error(m.message))
          this.pendingAuth = null
        } else if (!this.state.room && ['no-room', 'full', 'started', 'duplicate', 'locked', 'exists'].includes(m.code)) {
          // joining failed: go back to the start screen so a new try signs in cleanly
          this.closeLink()
          this.set({ phase: 'idle', error: m.message, ping: null, route: null, hosting: null })
        } else {
          this.set({ error: m.message })
        }
        break
      case 'room': {
        if (m.token) this.token = m.token
        if (this.token) {
          const kind = this.target.kind === 'host' ? 'host' : this.target.kind === 'peer' ? 'peer' : 'server'
          writeSession({ code: m.room.code, token: this.token, kind })
        }
        const wasPlaying = this.state.room?.phase === 'playing'
        this.game.localId = m.room.you
        if (m.room.phase === 'lobby' && m.room.members.find((x) => x.id === m.room.you)?.cls !== this.cls) this.send({ t: 'class', cls: this.cls })
        if (this.wantDescent && m.room.hostId === m.room.you) {
          this.wantDescent = false
          if (m.room.mode !== 'descent') this.send({ t: 'mode', mode: 'descent' })
        }
        this.set({ phase: 'online', room: m.room, error: null })
        if (m.room.phase === 'playing') this.startInput()
        else {
          this.stopInput()
          if (wasPlaying || this.game.status !== 'ready') this.resetReplica()
        }
        break
      }
      case 'ticket':
        this.pendingTicket?.resolve(m)
        this.pendingTicket = null
        break
      case 'left':
        this.dispose()
        break
      case 'snap':
        applySnapshot(this.game, m.s)
        for (const ev of m.ev) applyEvent(this.game, ev)
        break
      case 'boost':
        getGame().onBoostUsed?.(m.kind, this.game.localId)
        break
    }
  }

  /** A line of text the HUD shows under the floor counter. */
  setPrizeHint(text: string) {
    this.game.prizeHint = text
  }

  private resetReplica() {
    const g = this.game
    g.slots = []
    g.zombies = []
    g.bullets = []
    g.pickups = []
    g.particles = []
    g.effects = []
    g.texts = []
    g.decals = []
    g.setStatus('ready')
  }

  // ---------- Input ----------

  private startInput() {
    if (this.inputTimer) return
    this.inputTimer = setInterval(() => this.sendInput(), 1000 / INPUT_HZ)
  }

  private stopInput() {
    if (this.inputTimer) clearInterval(this.inputTimer)
    this.inputTimer = null
  }

  private sendInput() {
    const g = this.game
    if (g.status !== 'playing') return
    const slot = g.local
    let ax = slot.camera.x + slot.aimScreen.x
    let ay = slot.camera.y + slot.aimScreen.y
    if (slot.autoAim) {
      let best = 520
      for (const z of g.zombies) {
        const d = Math.hypot(z.x - slot.player.x, z.y - slot.player.y)
        if (d < best) {
          best = d
          ax = z.x
          ay = z.y
        }
      }
    }
    const keys = (slot.keys.has('up') ? 1 : 0) | (slot.keys.has('down') ? 2 : 0) | (slot.keys.has('left') ? 4 : 0) | (slot.keys.has('right') ? 8 : 0)
    const a = g.actions
    const input: PlayerInput = { keys, fire: slot.firing, ax, ay, skill: a.skill || undefined, weapon: a.weapon, heal: a.heal || undefined, armor: a.armor || undefined }
    g.actions = { skill: false, heal: false, armor: false }
    this.send({ t: 'input', ...input })
  }

  // ---------- Room actions ----------

  create() {
    this.send({ t: 'create' })
  }
  /** Create a room on the server and switch it to Endless Descent. */
  createDescent() {
    this.wantDescent = true
    this.send({ t: 'create' })
  }
  join(code: string) {
    this.send({ t: 'join', code: code.trim().toUpperCase() })
  }
  /** Choose your class. The room is told straight away while it is still in the lobby. */
  setClass(cls: ClassId) {
    this.cls = cls
    if (this.state.room?.phase === 'lobby') this.send({ t: 'class', cls })
  }
  setReady(ready: boolean) {
    this.send({ t: 'ready', ready })
  }
  setConfig(chapter: number, difficulty: Difficulty) {
    this.send({ t: 'config', chapter, difficulty })
  }
  start() {
    this.send({ t: 'start' })
  }
  setMode(mode: RoomMode) {
    this.send({ t: 'mode', mode })
  }
  /** Ask the server for a ticket that lets this wallet pay into the squad's Endless Descent run. */
  requestTicket(): Promise<TicketMsg> {
    return new Promise((resolve, reject) => {
      this.pendingTicket = { resolve, reject }
      this.send({ t: 'ticket' })
      setTimeout(() => {
        if (this.pendingTicket?.resolve === resolve) {
          this.pendingTicket = null
          reject(new Error('The server did not answer. Try again.'))
        }
      }, 10_000)
    })
  }
  next() {
    this.send({ t: 'next' })
  }
  retry() {
    this.send({ t: 'retry' })
  }
  backToLobby() {
    this.send({ t: 'lobby' })
  }

  leave() {
    writeSession(null)
    if (this.link?.open) this.send({ t: 'leave' })
    else this.dispose()
  }

  /** Drop everything: connection, timers, saved session. */
  dispose(error: string | null = null) {
    writeSession(null)
    this.token = null
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.stopInput()
    this.closeLink()
    this.resetReplica()
    this.set({ phase: 'idle', room: null, error, notices: [], ping: null, route: null, hosting: null })
  }
}
