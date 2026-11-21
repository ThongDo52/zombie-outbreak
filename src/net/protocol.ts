import type { ClassId } from '@/game/classes'
import type { Difficulty } from '@/game/difficulty'
import type { Snapshot } from '@/game/replica'
import type { SkinSelection } from '@/game/skins'
import type { BoostCharges, BoostKind, GameEvent, PlayerInput, WeaponId } from '@/game/types'

/** Messages shared by the co-op server and the browser. Everything is JSON text. */

export const COOP_PATH = '/coop'
/** Story co-op fits four; an Endless Descent squad is exactly five. */
export const MAX_ROOM_SIZE = 5
export const STORY_ROOM_SIZE = 4
export const DESCENT_SQUAD = 5
export const CODE_LENGTH = 5
/** Letters and digits that cannot be mixed up when read aloud. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** How long a dropped player keeps their place in a room. */
export const RECONNECT_SECONDS = 30

export function signInMessage(nonce: string): string {
  return `Zombie Outbreak co-op sign-in\nThis proves you own this wallet. It costs nothing and sends no transaction.\nNonce: ${nonce}`
}

// ---------- Client to server ----------

export type ClientMessage =
  | { t: 'auth'; address: string; signature: string; skin: SkinSelection; charges: BoostCharges; unlocked?: WeaponId[] }
  | { t: 'create' }
  | { t: 'join'; code: string }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'leave' }
  | { t: 'ready'; ready: boolean }
  | { t: 'config'; chapter: number; difficulty: Difficulty }
  | { t: 'start' }
  | { t: 'mode'; mode: RoomMode }
  | { t: 'ticket' }
  | { t: 'next' }
  | { t: 'retry' }
  | { t: 'lobby' }
  | { t: 'ping'; n: number }
  | { t: 'class'; cls: ClassId }
  | ({ t: 'input' } & PlayerInput)

// ---------- Server to client ----------

export interface RoomMember {
  id: number
  name: string
  address: string
  ready: boolean
  connected: boolean
  skin: SkinSelection
  /** The class this player will fight as. */
  cls: ClassId
}

export type RoomPhase = 'lobby' | 'playing'
export type RoomMode = 'story' | 'survival' | 'descent'

/** Where an Endless Descent run stands, from forming the squad to the prize being credited. */
export type DescentStage = 'forming' | 'paying' | 'running' | 'settling' | 'settled' | 'cancelled'

export interface DescentRoom {
  stage: DescentStage
  runId: string | null
  /** Entry fee in USDC base units, as a string. */
  fee: string
  size: number
  /** Lower-case wallet addresses that have paid onchain. */
  paid: string[]
  /** When the squad must have paid by (ms since epoch), while paying. */
  deadline: number
  floors: number
  leavers: string[]
  payout?: { totalPaid: string; stayers: number; txHash?: string }
  /** Plain-language status, such as a payout waiting for the daily limit to reset. */
  note?: string
}

export interface RoomState {
  code: string
  you: number
  hostId: number
  phase: RoomPhase
  chapter: number
  difficulty: Difficulty
  mode: RoomMode
  descent?: DescentRoom
  /** 'peer': the room runs in the host's browser. 'server': it runs on the co-op server. */
  transport?: 'peer' | 'server'
  members: RoomMember[]
}

export type ServerMessage =
  | { t: 'challenge'; nonce: string; message: string }
  | { t: 'authed'; address: string; name: string; skin: SkinSelection; charges: BoostCharges; notices: string[] }
  | { t: 'error'; code: string; message: string }
  | { t: 'room'; room: RoomState; token?: string }
  | { t: 'left' }
  | { t: 'snap'; s: Snapshot; ev: GameEvent[] }
  | { t: 'boost'; kind: BoostKind }
  | { t: 'ticket'; runId: string; expiry: number; fee: string; signature: string }
  | { t: 'pong'; n: number }
