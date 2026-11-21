import { useState } from 'react'
import { useModal } from 'connectkit'
import { ArrowLeft, Check, Copy, Crown, Loader2, LogOut, Monitor, Play, Trophy, Users, Wallet } from 'lucide-react'
import { CHAPTERS } from '@/game/chapters'
import { CLASSES } from '@/game/classes'
import { DIFFICULTIES, DIFFICULTY } from '@/game/difficulty'
import { getGame, isUnlocked, saveClass, type Progress } from '@/game/save'
import { getSkin } from '@/game/skins'
import type { CoopHandle } from '@/hooks/useCoop'
import { CODE_LENGTH, DESCENT_SQUAD, STORY_ROOM_SIZE } from '@/net/protocol'
import { ClassPicker } from './ClassPicker'
import { ConnectionStatus } from './ConnectionStatus'
import { ConnectionTest } from './ConnectionTest'
import { PRIZES_ENABLED } from '@/lib/features'
import { DescentLobbyPanel } from './DescentPanel'
import { SkinPreview } from './SkinPreview'

const PRIMARY = 'flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#0B1B3A] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50'
const GHOST = 'flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/30 px-5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50'

/** Everything before the run starts: sign in, create or join a room, and the lobby itself. */
export function CoopLobby({ coop, progress, onBack }: { coop: CoopHandle; progress: Progress; onBack: () => void }) {
  const { state, client, address, signIn, host, joinHosted } = coop
  const { setOpen } = useModal()
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const room = state.room
  const isPhone = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const busy = state.phase === 'connecting' || state.phase === 'signing'

  return (
    <div className="absolute inset-2 flex flex-col items-center justify-center gap-4 overflow-y-auto rounded-2xl bg-[#0B1210]/92 p-4 text-center text-white backdrop-blur-sm sm:p-6">
      {!room && (
        <button onClick={onBack} className="absolute left-3 top-3 flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-slate-300 hover:text-white">
          <ArrowLeft size={16} /> Back
        </button>
      )}
      <Users size={26} className="text-sky-300" />
      <h2 className="font-display text-balance text-3xl font-bold tracking-[-0.03em]">Play together</h2>

      {state.phase === 'reconnecting' && (
        <p className="flex items-center gap-2 text-sm text-amber-300">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Reconnecting to your room...
        </p>
      )}

      {!room && state.phase !== 'reconnecting' && (
        <>
          <p className="max-w-md text-pretty text-sm text-slate-300">
            Fight the horde side by side. Everyone needs a connected wallet, so the skins and boosts you own show up for your team. Signing in is free and sends no transaction.
          </p>
          {state.notices.length > 0 && (
            <ul className="max-w-md space-y-1 text-pretty text-xs text-amber-300">
              {state.notices.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {!address ? (
            <button onClick={() => setOpen(true)} className={PRIMARY}>
              <Wallet size={16} /> Connect wallet
            </button>
          ) : (
            <div className={`grid w-full gap-3 ${PRIZES_ENABLED ? 'max-w-3xl sm:grid-cols-3' : 'max-w-xl sm:grid-cols-2'}`}>
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/15 bg-white/5 p-4">
                <Monitor size={20} className="text-sky-300" />
                <p className="font-display text-base font-bold">Host on my device</p>
                <p className="text-pretty text-xs text-slate-300">Story or Survival for up to {STORY_ROOM_SIZE} players. No server: the match runs here, so keep this page open.</p>
                {isPhone && <p className="text-pretty text-xs text-amber-300">Phones can lag when they host. A computer is smoother.</p>}
                <button onClick={() => void host()} disabled={busy || state.phase === 'online'} className={PRIMARY}>
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wallet size={16} />}
                  {state.phase === 'signing' ? 'Sign in your wallet...' : busy ? 'Starting...' : 'Host a room'}
                </button>
              </div>
              <form
                className="flex flex-col items-center gap-2 rounded-2xl border border-white/15 bg-white/5 p-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (code.length === CODE_LENGTH) void joinHosted(code)
                }}
              >
                <Users size={20} className="text-emerald-300" />
                <p className="font-display text-base font-bold">Join a friend</p>
                <p className="text-pretty text-xs text-slate-300">Type the 5-letter code your friend sees in their room.</p>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, CODE_LENGTH))}
                  placeholder="CODE"
                  aria-label="Room code"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-h-11 w-full rounded-full bg-white/10 px-4 text-center font-display text-lg font-bold uppercase tracking-[0.3em] placeholder:text-slate-500"
                />
                <button type="submit" disabled={code.length !== CODE_LENGTH || busy || state.phase === 'online'} className={PRIMARY}>
                  Join
                </button>
              </form>
              {PRIZES_ENABLED && (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/5 p-4">
                <Trophy size={20} className="text-amber-300" />
                <p className="font-display text-base font-bold">Endless Descent</p>
                <p className="text-pretty text-xs text-slate-300">A full squad of {DESCENT_SQUAD} pays USDC into a shared prize pool. It runs on the game server, so it needs it to be online.</p>
                <button onClick={() => void signIn()} disabled={busy || state.phase === 'online'} className={GHOST}>
                  Open a squad room
                </button>
                {state.phase === 'online' && !room && <p className="text-xs text-slate-400">Signed in. Create a room or join with a code:</p>}
                {state.phase === 'online' && !room && (
                  <div className="flex w-full flex-col gap-2">
                    <button onClick={() => client.createDescent()} className={PRIMARY}>
                      Create squad room
                    </button>
                    <button onClick={() => code.length === CODE_LENGTH && client.join(code)} disabled={code.length !== CODE_LENGTH} className={GHOST}>
                      Join with the code on the left
                    </button>
                  </div>
                )}
              </div>
              )}
            </div>
          )}
          {address && <ConnectionTest />}
          {state.phase === 'online' && !room && (
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Opening the room...
            </p>
          )}
          {state.error && (
            <p role="alert" className="max-w-md text-pretty text-sm text-red-300">
              {state.error}
            </p>
          )}
        </>
      )}

      {room && <Lobby coop={coop} progress={progress} copied={copied} onCopy={() => void navigator.clipboard.writeText(room.code).then(() => setCopied(true))} />}

      {room && state.error && (
        <p role="alert" className="max-w-md text-pretty text-sm text-red-300">
          {state.error}
        </p>
      )}
    </div>
  )
}

function Lobby({ coop, progress, copied, onCopy }: { coop: CoopHandle; progress: Progress; copied: boolean; onCopy: () => void }) {
  const { client, state } = coop
  const room = state.room
  if (!room) return null
  const isHost = room.hostId === room.you
  const me = room.members.find((m) => m.id === room.you)
  const everyoneHere = room.members.every((m) => m.connected)
  const descent = room.mode === 'descent'
  const seats = descent ? DESCENT_SQUAD : STORY_ROOM_SIZE
  const modeLocked = Boolean(room.descent?.runId)

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-1">
        <p className="text-xs font-medium uppercase tracking-[0.1em] text-slate-400">Room code</p>
        <button onClick={onCopy} className="flex min-h-11 items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-5 transition active:scale-95" aria-label="Copy room code">
          <span className="font-display text-4xl font-bold tracking-[0.25em]">{room.code}</span>
          {copied ? <Check size={18} className="text-emerald-300" /> : <Copy size={18} className="text-slate-300" />}
        </button>
        <p className="text-xs text-slate-400">Friends open this same page, pick Play together, then Join a friend, and type the code.</p>
      </div>

      <ul className="grid w-full grid-cols-2 gap-2">
        {room.members.map((m) => {
          const skin = getSkin(m.skin.character)
          return (
            <li key={m.id} className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 p-2 text-left">
              <SkinPreview kind="character" skin={skin} className="h-[52px] w-[66px] shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-sm font-semibold">
                  {m.id === room.hostId && <Crown size={13} className="shrink-0 text-amber-300" aria-label="Host" />}
                  <span className="truncate">{m.name}</span>
                  {m.id === room.you && <span className="text-xs font-medium text-slate-400">(you)</span>}
                </p>
                <p className={`text-xs ${!m.connected ? 'text-red-300' : m.ready || m.id === room.hostId ? 'text-emerald-300' : 'text-slate-400'}`}>
                  {!m.connected ? 'Offline' : m.id === room.hostId ? 'Host' : m.ready ? 'Ready' : 'Not ready'}
                  <span className="text-slate-400"> · </span>
                  <span style={{ color: CLASSES[m.cls]?.color }}>{CLASSES[m.cls]?.name ?? 'Runner'}</span>
                </p>
              </div>
            </li>
          )
        })}
        {Array.from({ length: Math.max(0, seats - room.members.length) }).map((_, i) => (
          <li key={`empty-${i}`} className="flex min-h-[68px] items-center justify-center rounded-2xl border border-dashed border-white/15 text-xs text-slate-500">
            Waiting for a friend...
          </li>
        ))}
      </ul>

      {isHost && !modeLocked && room.transport === 'peer' && (
        <div className="flex gap-1 rounded-full bg-white/10 p-1" role="group" aria-label="Game mode">
          {(['story', 'survival'] as const).map((m) => (
            <button
              key={m}
              onClick={() => client.setMode(m)}
              className={`min-h-11 rounded-full px-4 text-sm font-semibold transition ${room.mode === m ? 'bg-white text-[#0B1B3A]' : 'text-white'}`}
            >
              {m === 'story' ? 'Story' : m === 'survival' ? 'Survival' : 'Endless Descent'}
            </button>
          ))}
        </div>
      )}
      {!isHost && descent && <p className="text-sm text-amber-200">The host chose Endless Descent.</p>}

      {descent ? (
        <DescentLobbyPanel coop={coop} />
      ) : isHost ? (
        <div className="flex w-full flex-col items-center gap-2 rounded-2xl border border-white/15 bg-white/5 p-3">
          <label className="flex w-full items-center justify-between gap-3 text-sm">
            <span className="text-slate-300">Chapter</span>
            <select
              value={room.chapter}
              onChange={(e) => client.setConfig(Number(e.target.value), room.difficulty)}
              className="min-h-11 rounded-full bg-white/10 px-3 text-sm"
              aria-label="Chapter"
            >
              {CHAPTERS.map((c, i) => (
                <option key={c.id} value={i} disabled={!isUnlocked(progress, i, room.difficulty)} className="text-black">
                  {c.id}. {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1 rounded-full bg-white/10 p-1" role="group" aria-label="Difficulty">
            {DIFFICULTIES.map((d) => {
              const open = isUnlocked(progress, room.chapter, d)
              return (
                <button
                  key={d}
                  disabled={!open}
                  onClick={() => client.setConfig(room.chapter, d)}
                  className={`min-h-11 rounded-full px-4 text-sm font-semibold transition disabled:opacity-40 ${room.difficulty === d ? 'bg-white text-[#0B1B3A]' : ''}`}
                  style={room.difficulty === d ? undefined : { color: DIFFICULTY[d].color }}
                >
                  {DIFFICULTY[d].label}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-400">
            {room.mode === 'survival' ? 'Endless waves on this map. The squad lasts as long as someone is standing, and the clock keeps the record.' : 'More players means more zombies and tougher bosses.'}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-300">
          Host picked {room.mode === 'survival' ? 'Survival on ' : ''}<b>{CHAPTERS[room.chapter]?.name}</b> on <b style={{ color: DIFFICULTY[room.difficulty].color }}>{DIFFICULTY[room.difficulty].label}</b>.
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {descent ? null : isHost ? (
          <button onClick={() => client.start()} disabled={!everyoneHere} className={PRIMARY}>
            <Play size={16} /> {room.mode === 'survival' ? 'Start survival' : 'Start run'}
          </button>
        ) : (
          <button onClick={() => client.setReady(!me?.ready)} className={PRIMARY}>
            {me?.ready ? 'Not ready' : 'I am ready'}
          </button>
        )}
        {!(descent && room.descent?.stage === 'paying' && room.descent.paid.length > 0) && (
          <button onClick={() => client.leave()} className={GHOST}>
            <LogOut size={16} /> Leave
          </button>
        )}
      </div>
      {room.phase === 'lobby' && me && (
        <ClassPicker
          value={me.cls}
          onChange={(c) => {
            saveClass(c)
            getGame().setClass(c)
            client.setClass(c)
          }}
        />
      )}
      <ConnectionStatus state={state} isHost={isHost} />
      {!descent && isHost && room.members.length < 2 && <p className="text-xs text-slate-400">You can start alone too. Friends cannot join once the run begins.</p>}
    </div>
  )
}
