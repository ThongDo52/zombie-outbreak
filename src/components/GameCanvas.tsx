import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Bug } from 'lucide-react'
import { audio } from '@/audio'
import { CHAPTERS } from '@/game/chapters'
import { CLASSES, type ClassId } from '@/game/classes'
import { HEAVY_WEAPONS, VIEW_H, VIEW_W } from '@/game/config'
import type { Game } from '@/game/engine'
import { draw } from '@/game/render'
import { useAccount } from 'wagmi'
import type { Difficulty } from '@/game/difficulty'
import { clearRun, getGame, loadArmory, loadClass, saveClass, loadProgress, loadRecords, loadRun, markCleared, saveRun, storyKey, submitRecord, survivalKey, trialKey, unlockWeapon, type Progress, type RecordResult, type Records } from '@/game/save'
import type { Control, GameStatus, GameSummary, WeaponId } from '@/game/types'
import type { CoopHandle } from '@/hooks/useCoop'
import { ChapterOverlay } from './ChapterOverlay'
import { formatUsdc } from '@/onchain-money'
import { useDescent } from '@/hooks/useDescent'
import { CoopLobby } from './CoopLobby'
import { DescentResult } from './DescentPanel'
import { ConnectionStatus } from './ConnectionStatus'
import { TouchControls } from './TouchControls'

const KEY_MAP: Record<string, Control> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
}
const BEST_KEY = 'zombie-best-score'

function loadBest(): number {
  const n = Number(localStorage.getItem(BEST_KEY))
  return Number.isFinite(n) ? n : 0
}

/**
 * The arena. It draws either your solo game or, inside a co-op room, the replica of the server's game.
 * App remounts it when you enter or leave a room, so the choice below is made once per mount.
 */
/** Keys for the n-th weapon you hold. */
const SLOT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal']

export function GameCanvas({ coop, testAll = false }: { coop: CoopHandle; testAll?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [source] = useState<'solo' | 'coop'>(() => (coop.state.room ? 'coop' : 'solo'))
  const pick = useCallback(() => (source === 'coop' ? coop.client.game : getGame()), [source, coop.client])
  const [showCoop, setShowCoop] = useState(false)
  const [status, setStatus] = useState<GameStatus>(() => pick().status)
  const [summary, setSummary] = useState<GameSummary>(() => {
    const g = pick()
    return { score: g.score, wave: g.wave, kills: g.kills, chapter: g.chapterIndex, difficulty: g.difficulty, floors: g.floorsCleared, time: g.runTime, survival: g.survival }
  })
  const [saved, setSaved] = useState(loadRun)
  const [best, setBest] = useState(loadBest)
  const { address } = useAccount()
  const owner = address ?? 'guest'
  const [progressState, setProgressState] = useState<{ owner: string; progress: Progress }>(() => ({ owner, progress: loadProgress(owner) }))
  const progress = progressState.owner === owner ? progressState.progress : loadProgress(owner)
  const [recordsState, setRecordsState] = useState<{ owner: string; records: Records }>(() => ({ owner, records: loadRecords(owner) }))
  const records = recordsState.owner === owner ? recordsState.records : loadRecords(owner)
  const [record, setRecord] = useState<RecordResult | null>(null)
  const [armoryState, setArmoryState] = useState<{ owner: string; list: WeaponId[] }>(() => ({ owner, list: loadArmory(owner) }))
  const earned = armoryState.owner === owner ? armoryState.list : loadArmory(owner)
  // owner test mode shows every heavy weapon as earned (on this device only)
  const armory = testAll ? HEAVY_WEAPONS : earned
  // your solo game starts every run with the heavy weapons you have earned
  useEffect(() => {
    getGame().setUnlocked(armory)
    getGame().setTestAllGuns(testAll)
  }, [armory, testAll])
  const ownerRef = useRef(owner)
  useEffect(() => {
    ownerRef.current = owner
  }, [owner])
  const [debug, setDebug] = useState(false)
  const [cls, setCls] = useState<ClassId>(loadClass)
  // your solo runs start as the class you picked; co-op rooms are told as well
  useEffect(() => {
    getGame().setClass(cls)
  }, [cls])
  const pickClass = useCallback(
    (c: ClassId) => {
      setCls(c)
      saveClass(c)
      getGame().setClass(c)
      coop.client.setClass(c)
    },
    [coop.client],
  )

  const start = useCallback((chapter: number, difficulty: Difficulty) => {
    clearRun()
    setSaved(null)
    setRecord(null)
    gameRef.current?.start(chapter, difficulty)
  }, [])

  const startSurvival = useCallback((chapter: number, difficulty: Difficulty) => {
    clearRun()
    setSaved(null)
    setRecord(null)
    gameRef.current?.startSurvival(chapter, difficulty)
  }, [])

  const startTrial = useCallback((trial: number) => {
    clearRun()
    setSaved(null)
    setRecord(null)
    gameRef.current?.startTrial(trial)
  }, [])

  const nextChapter = useCallback(() => gameRef.current?.nextChapter(), [])
  const toMenu = useCallback(() => gameRef.current?.toMenu(), [])

  const resume = useCallback(() => {
    const run = loadRun()
    if (run) gameRef.current?.restore(run)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = VIEW_W * dpr
    canvas.height = VIEW_H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    // The game lives outside React, so a hot reload of this component keeps the run alive.
    const game = pick()
    gameRef.current = game
    game.onSound = (e) => audio.play(e, game)
    game.onStatus = (s, sum) => {
      setStatus(s)
      setSummary(sum)
      if (s === 'cleared' && sum.unlocked) {
        setArmoryState({ owner: ownerRef.current, list: unlockWeapon(ownerRef.current, sum.unlocked) })
      }
      if ((s === 'cleared' || s === 'won') && sum.chapter < CHAPTERS.length) {
        setProgressState({ owner: ownerRef.current, progress: markCleared(ownerRef.current, sum.chapter, sum.difficulty) })
      }
      // fastest clears and longest survivals are kept per wallet
      if ((s === 'cleared' || s === 'won') && sum.time > 0) {
        const key = sum.chapter >= CHAPTERS.length ? trialKey(sum.chapter - CHAPTERS.length) : storyKey(sum.chapter, sum.difficulty)
        const res = submitRecord(ownerRef.current, key, sum.time, sum.wave, 'low')
        setRecordsState({ owner: ownerRef.current, records: res.records })
        setRecord(res.result)
      } else if (s === 'over' && sum.survival && sum.time > 0) {
        const res = submitRecord(ownerRef.current, survivalKey(sum.chapter, sum.difficulty), sum.time, sum.wave, 'high')
        setRecordsState({ owner: ownerRef.current, records: res.records })
        setRecord(res.result)
      }
      if (s === 'over' || s === 'cleared' || s === 'won') {
        game.firing = false
        if (game.mode === 'solo') {
          clearRun()
          setSaved(null)
        }
        setBest((prev) => {
          const next = Math.max(prev, sum.score)
          localStorage.setItem(BEST_KEY, String(next))
          return next
        })
      }
    }

    const onKey = (down: boolean) => (ev: KeyboardEvent) => {
      const control = KEY_MAP[ev.code]
      const isDash = ev.code === 'ShiftLeft' || ev.code === 'ShiftRight' || ev.code === 'Space'
      if (game.status === 'playing' && (control || isDash)) ev.preventDefault()
      if (control) game.setKey(control, down)
      if (!down || ev.repeat) return
      if (isDash) game.queueSkill()
      if (ev.code === 'KeyQ') game.cycleWeapon()
      if (ev.code === 'KeyF') game.useHeal()
      if (ev.code === 'KeyG') game.useArmor()
      if (ev.code === 'KeyH') {
        game.debug = !game.debug
        setDebug(game.debug)
      }
      if (ev.code === 'Enter' && game.mode === 'solo') {
        if (game.status === 'ready') game.start(0, 'normal')
        else if (game.status === 'won') game.start(0, game.difficulty)
        else if (game.status === 'over') {
          if (game.chapterIndex >= CHAPTERS.length) game.startTrial(game.chapterIndex - CHAPTERS.length)
          else if (game.survival) game.startSurvival(game.chapterIndex, game.difficulty)
          else game.start(game.chapterIndex, game.difficulty)
        } else if (game.status === 'cleared') {
          if (game.chapterIndex >= CHAPTERS.length) game.toMenu()
          else game.nextChapter()
        }
      }
      const slotKey = SLOT_KEYS.indexOf(ev.code)
      if (slotKey >= 0) game.equipSlot(slotKey)
    }
    const kd = onKey(true)
    const ku = onKey(false)
    const blur = () => game.clearKeys()
    const mouseUp = (ev: PointerEvent) => {
      if (ev.button === 0) game.firing = false
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', blur)
    window.addEventListener('pointerup', mouseUp)
    const persist = () => saveRun(game)
    const unlock = () => audio.unlock()
    const onVisible = () => (document.hidden ? audio.engine.suspend() : audio.engine.resume())
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', persist)
    document.addEventListener('visibilitychange', persist)

    const clock = { last: performance.now(), raf: 0, sinceSave: 0, failures: 0 }
    const loop = (now: number) => {
      const dt = Math.max(0, (now - clock.last) / 1000)
      clock.last = now
      // One bad frame must never stop the game loop, so errors are logged and the next frame still runs.
      try {
        game.update(dt)
        audio.update(game, Math.min(dt, 0.05))
        clock.sinceSave += dt
        if (clock.sinceSave > 1) {
          clock.sinceSave = 0
          saveRun(game)
        }
        draw(ctx, game)
      } catch (err) {
        if (clock.failures++ < 5) console.error('Game frame failed', err)
      }
      clock.raf = requestAnimationFrame(loop)
    }
    clock.raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(clock.raf)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('blur', blur)
      window.removeEventListener('pointerup', mouseUp)
      window.removeEventListener('pagehide', persist)
      document.removeEventListener('visibilitychange', persist)
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      document.removeEventListener('visibilitychange', onVisible)
      game.onSound = undefined
      audio.toMenu()
      game.clearKeys()
      gameRef.current = null
    }
  }, [pick])

  const onPointerMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current
    if (!g || ev.pointerType === 'touch') return
    const r = ev.currentTarget.getBoundingClientRect()
    g.autoAim = false
    g.aimScreen = { x: ((ev.clientX - r.left) / r.width) * VIEW_W, y: ((ev.clientY - r.top) / r.height) * VIEW_H }
  }

  const onPointerDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gameRef.current
    if (!g || ev.button !== 0 || ev.pointerType === 'touch') return
    onPointerMove(ev)
    g.firing = true
  }

  const onWheel = (ev: React.WheelEvent<HTMLCanvasElement>) => {
    if (ev.deltaY !== 0) gameRef.current?.cycleWeapon()
  }

  const toggleDebug = () => {
    const g = gameRef.current
    if (!g) return
    g.debug = !g.debug
    setDebug(g.debug)
  }

  const descent = useDescent(coop)
  useEffect(() => {
    if (source !== 'coop') return
    const g = coop.client.game
    const bps = g.floorsCleared < 3 ? 0 : Math.min(g.floorsCleared * 100, 2500)
    const total = descent.pool + 5n * descent.fee
    coop.client.setPrizeHint(bps === 0 ? 'Prizes start at floor 3' : `Prize now ~${formatUsdc((total * BigInt(bps)) / 10000n)} USDC`)
  })

  const room = coop.state.room
  const isGuest = room !== null && room.hostId !== room.you
  let overlay: ReactNode = null
  if (room?.phase === 'lobby') {
    overlay = <CoopLobby coop={coop} progress={progress} onBack={() => setShowCoop(false)} />
  } else if (room?.mode === 'descent' && status === 'over') {
    overlay = <DescentResult coop={coop} />
  } else if (room && status === 'ready') {
    overlay = (
      <div className="absolute inset-2 grid place-items-center rounded-2xl bg-[#0B1210]/88 text-sm text-slate-300 backdrop-blur-sm" role="status">
        Joining the run...
      </div>
    )
  } else if (!room && showCoop && status === 'ready') {
    overlay = <CoopLobby coop={coop} progress={progress} onBack={() => setShowCoop(false)} />
  } else if (status !== 'playing') {
    overlay = (
      <ChapterOverlay
        status={status}
        summary={summary}
        saved={saved}
        best={best}
        progress={progress}
        records={records}
        record={record}
        armory={armory}
        cls={cls}
        onClass={pickClass}
        isGuest={isGuest}
        inRoom={room !== null}
        onStart={room ? () => coop.client.retry() : start}
        onSurvival={room ? () => coop.client.retry() : startSurvival}
        onResume={resume}
        onNext={room ? () => coop.client.next() : nextChapter}
        onMenu={room ? () => coop.client.backToLobby() : toMenu}
        onCoop={() => setShowCoop(true)}
        onTrial={startTrial}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-[28px] bg-black p-1.5 ring-1 ring-white/10 shadow-[0_0_0_1px_rgba(255,75,87,0.14),0_40px_90px_-40px_rgba(255,45,68,0.4)]">
        {['left-2 top-2 border-l-2 border-t-2', 'right-2 top-2 border-r-2 border-t-2', 'bottom-2 left-2 border-b-2 border-l-2', 'bottom-2 right-2 border-b-2 border-r-2'].map((c) => (
          <span key={c} className={`pointer-events-none absolute z-10 size-4 border-[#FF4B57]/70 ${c}`} aria-hidden />
        ))}
        <canvas
          ref={canvasRef}
          className={`block w-full touch-none rounded-[22px] ${status === 'playing' ? 'cursor-none' : ''}`}
          style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
          aria-label="Zombie arena game canvas"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onWheel={onWheel}
          onContextMenu={(e) => e.preventDefault()}
        />
        {overlay}
      </div>

      {room && <ConnectionStatus state={coop.state} isHost={!isGuest} />}

      <TouchControls
        onMove={(c, down) => gameRef.current?.setKey(c, down)}
        onFire={(down) => {
          const g = gameRef.current
          if (!g) return
          g.autoAim = true
          g.firing = down
        }}
        skillLabel={CLASSES[cls].skill}
        onSkill={() => gameRef.current?.queueSkill()}
        onSwitch={() => gameRef.current?.cycleWeapon()}
        onHeal={() => gameRef.current?.useHeal()}
        onArmor={() => gameRef.current?.useArmor()}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-slate-400">
        <p className="hidden md:block">
          {[['WASD', 'move'], ['Mouse', 'aim and fire'], ['1-9 · Q · wheel', 'weapon'], ['Shift · Space', 'class skill'], ['F', 'heal'], ['G', 'armor']].map(([k, l]) => (
            <span key={k} className="mr-3 inline-flex items-center gap-1.5">
              <kbd className="rounded-md border-b-2 border-white/20 bg-white/10 px-1.5 py-0.5 text-[11px] font-bold text-white">{k}</kbd> {l}
            </span>
          ))}
        </p>
        <button
          onClick={toggleDebug}
          className={`flex min-h-11 items-center gap-2 rounded-full border px-4 font-medium transition ${
            debug ? 'border-[#FF4B57] bg-[#FF4B57]/20 text-white' : 'border-white/20 bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <Bug size={14} /> Hitboxes (H)
        </button>
      </div>
    </div>
  )
}
