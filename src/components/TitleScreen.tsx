import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useModal } from 'connectkit'
import { arcTestnet } from 'viem/chains'
import { useAccount, useReadContract } from 'wagmi'
import { useReducedMotion } from 'framer-motion'
import { ArrowRight, Gamepad2, HelpCircle, Store, Volume2, VolumeX, Wallet, X } from 'lucide-react'
import { arenaDescentAbi, DESCENT_ADDRESS } from '@/abi/arenaDescent'
import { PRIZES_ENABLED } from '@/lib/features'
import { audio } from '@/audio'
import { VIEW_H, VIEW_W } from '@/game/config'
import { sharedShowcase, type Showcase } from '@/game/showcase'
import type { SoundType } from '@/game/types'
import { formatUsdc } from '@/onchain-money'

export type EnterView = 'play' | 'shop'

const DISPLAY = "'Space Grotesk', 'DM Sans', sans-serif"

function useOnScreen(ref: RefObject<HTMLElement | null>): boolean {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setOn(entry.isIntersecting), { threshold: 0.05 })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return on
}

/** The real game playing itself behind the title: five AI survivors on Endless Descent. */
/** Sounds of the battle that are worth hearing behind a menu. They are moved far away so they stay a distant fight. */
const AMBIENT = new Set<SoundType>(['shot', 'explosion', 'hit', 'zdie', 'boss', 'slam', 'charge', 'bossdown', 'killfx'])

function Backdrop({ onFloor, onReady }: { onFloor: (floor: number) => void; onReady: (s: Showcase) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const showcase = useRef<Showcase | null>(null)
  const visible = useOnScreen(box)
  const reduce = useReducedMotion()
  const live = useRef(visible)
  useEffect(() => {
    live.current = visible
  }, [visible])

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    el.width = VIEW_W * dpr
    el.height = VIEW_H * dpr
    ctx.scale(dpr, dpr)
    showcase.current ??= sharedShowcase()
    const s = showcase.current
    onReady(s)
    if (reduce) {
      s.render(ctx)
      return
    }
    s.game.onSound = (e) => {
      if (AMBIENT.has(e.type)) audio.play({ ...e, x: e.x === undefined ? undefined : e.x + 650 }, s.game)
    }
    const clock = { raf: 0, last: performance.now(), failures: 0 }
    const loop = (now: number) => {
      clock.raf = requestAnimationFrame(loop)
      const dt = Math.max(0, Math.min(0.05, (now - clock.last) / 1000))
      clock.last = now
      if (!live.current || document.hidden) return
      try {
        s.step(dt)
        s.render(ctx)
        audio.update(s.game, dt)
      } catch (err) {
        if (clock.failures++ < 3) console.error('Title scene failed', err)
      }
    }
    clock.raf = requestAnimationFrame(loop)
    const floorTimer = setInterval(() => onFloor(s.game.floor), 800)
    return () => {
      cancelAnimationFrame(clock.raf)
      clearInterval(floorTimer)
      s.game.onSound = undefined
    }
  }, [reduce, onFloor, onReady])

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvas}
        className="title-anim size-full origin-[60%_55%] object-cover [animation:title-push_26s_ease-in-out_infinite_alternate]"
        role="img"
        aria-label="Five survivors fighting a horde in the real game, playing by itself"
      />
    </div>
  )
}

/** An irregular blood splash. The same seed always gives the same shape. */
function splatPath(seed: number): string {
  const rand = (i: number) => {
    const h = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453
    return h - Math.floor(h)
  }
  const n = 30
  let d = ''
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const spike = rand(i) > 0.7
    const r = spike ? 62 + rand(i + 50) * 38 : 34 + rand(i + 90) * 10
    d += `${i === 0 ? 'M' : 'L'}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)} `
  }
  return `${d}Z`
}

function Splats() {
  const a = useMemo(() => splatPath(3), [])
  const b = useMemo(() => splatPath(9), [])
  return (
    <svg className="pointer-events-none absolute -left-[6vw] top-[8vh] h-[52vh] w-[52vh] opacity-[0.22]" viewBox="-110 -110 220 220" aria-hidden>
      <path d={a} fill="#9A1226" />
      <path d={b} fill="#6A0A18" transform="translate(52 40) scale(0.45)" />
      <path d={b} fill="#9A1226" transform="translate(-60 62) scale(0.3)" />
    </svg>
  )
}

/** Claw marks tearing across the logo. */
function Claws() {
  return (
    <svg className="title-anim pointer-events-none absolute -right-[3%] -top-[16%] h-[62%] w-[26%] [animation:title-slash_0.7s_1.5s_ease-in_both]" viewBox="0 0 120 220" aria-hidden>
      <defs>
        <linearGradient id="claw" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF4B57" stopOpacity="0.95" />
          <stop offset="1" stopColor="#7A0A1A" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <path d="M18 0 L34 0 L52 212 L46 212 Z" fill="url(#claw)" />
      <path d="M52 6 L68 6 L88 204 L82 204 Z" fill="url(#claw)" />
      <path d="M86 14 L102 14 L120 190 L114 190 Z" fill="url(#claw)" />
    </svg>
  )
}

/** Zombie hands clawing up from the bottom corners, slightly out of focus. */
function Hand({ className }: { className: string }) {
  return (
    <svg className={`title-anim pointer-events-none absolute ${className} [animation:title-sway_9s_ease-in-out_infinite] [filter:drop-shadow(0_0_14px_rgba(255,45,68,0.28))_blur(1.2px)]`} viewBox="0 0 220 300" aria-hidden>
      <defs>
        <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2B3B31" />
          <stop offset="0.55" stopColor="#0C130F" />
          <stop offset="1" stopColor="#030504" />
        </linearGradient>
      </defs>
      <g fill="url(#skin)" stroke="rgba(255,75,87,0.4)" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M70 300 L82 200 L142 200 L158 300 Z" />
        <ellipse cx="112" cy="190" rx="46" ry="40" />
        <path d="M76 170 C70 130 64 96 66 62 C67 50 78 48 82 62 C86 96 92 130 96 165 Z" />
        <path d="M98 165 C96 120 96 74 100 36 C102 22 114 22 116 36 C120 74 118 120 118 165 Z" />
        <path d="M120 168 C124 130 132 92 142 60 C146 48 158 52 156 66 C150 100 146 135 140 172 Z" />
        <path d="M142 180 C150 154 164 126 178 104 C184 94 195 100 190 112 C178 140 168 164 158 192 Z" />
        <path d="M70 196 C52 184 36 168 22 148 C16 138 26 130 34 138 C48 154 62 166 80 172 Z" />
      </g>
    </svg>
  )
}

const CONTROLS: { keys: string[]; label: string }[] = [
  { keys: ['W', 'A', 'S', 'D'], label: 'Move' },
  { keys: ['Mouse'], label: 'Aim and shoot' },
  { keys: ['Shift'], label: 'First class skill' },
  { keys: ['E'], label: 'Second class skill (or right mouse button)' },
  { keys: ['B'], label: 'Shop: guns, upgrades, ammo' },
  { keys: ['F'], label: 'Heal boost' },
  { keys: ['G'], label: 'Armor boost' },
  { keys: ['1', '2', '3'], label: 'Pick a weapon' },
  { keys: ['Q'], label: 'Next weapon' },
]

function Keycap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg border-b-[3px] border-white/20 bg-white/90 px-2 text-xs font-bold text-[#0B1B3A]" style={{ fontFamily: DISPLAY }}>
      {children}
    </kbd>
  )
}

function HowTo({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="How to play" onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#0B1210]/95 p-6 text-white shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-[-0.03em]" style={{ fontFamily: DISPLAY }}>
            How to play
          </h2>
          <button ref={close} onClick={onClose} aria-label="Close" className="flex size-11 items-center justify-center rounded-full border border-white/20 transition hover:bg-white/10">
            <X size={18} />
          </button>
        </div>
        <ul className="grid gap-2">
          {CONTROLS.map((c) => (
            <li key={c.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-300">{c.label}</span>
              <span className="flex gap-1">
                {c.keys.map((k) => (
                  <Keycap key={k}>{k}</Keycap>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <ol className="mt-5 space-y-2 border-t border-white/10 pt-4 text-sm text-slate-300">
          <li>
            <b className="text-white">1.</b> Solo play needs no wallet. Pick a class, earn coins from every kill and buy your guns in the shop.
          </li>
          <li>
            <b className="text-white">2.</b> A wallet unlocks skins, boosts, boxes, the market and co-op.
          </li>
          <li>
            <b className="text-white">3.</b> Test USDC has no value. Get some free at{' '}
            <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-white underline underline-offset-2">
              faucet.circle.com
            </a>
            .
          </li>
        </ol>
        <p className="mt-4 text-pretty text-xs text-slate-500">On a phone you get an on-screen pad, a fire button, and buttons for both skills, the shop and swapping guns.</p>
      </div>
    </div>
  )
}

const ROW = 'group relative flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-sm font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:translate-x-1.5 hover:text-white focus-visible:translate-x-1.5 focus-visible:text-white focus-visible:outline-none sm:text-base'

function Bar() {
  return <span className="absolute inset-y-2 left-0 w-[3px] origin-center scale-y-0 rounded-full bg-[#FF4B57] transition group-hover:scale-y-100 group-focus-visible:scale-y-100" aria-hidden />
}

export function TitleScreen({ onStart }: { onStart: (view: EnterView) => void }) {
  const { address } = useAccount()
  const { setOpen } = useModal()
  const reduce = useReducedMotion()
  const [floor, setFloor] = useState(1)
  const [howTo, setHowTo] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [muted, setMuted] = useState(() => audio.engine.settings.muted)
  const menu = useRef<HTMLElement>(null)
  const scene = useRef<Showcase | null>(null)
  const sceneLayer = useRef<HTMLDivElement>(null)
  const logoLayer = useRef<HTMLDivElement>(null)
  const handsLayer = useRef<HTMLDivElement>(null)
  const pool = useReadContract({
    address: DESCENT_ADDRESS,
    abi: arenaDescentAbi,
    functionName: 'poolBalance',
    chainId: arcTestnet.id,
    query: { enabled: PRIZES_ENABLED && Boolean(DESCENT_ADDRESS), refetchInterval: 20_000 },
  })

  const onReady = useMemo(
    () => (s: Showcase) => {
      scene.current = s
    },
    [],
  )

  /** The roar, the slam and the boom that open a run. */
  const sting = () => {
    const g = scene.current?.game
    if (!g) return
    const at = { x: g.player.x, y: g.player.y }
    audio.play({ type: 'boss', ...at }, g)
    setTimeout(() => audio.play({ type: 'slam', ...at }, g), 360)
    setTimeout(() => audio.play({ type: 'explosion', ...at }, g), 520)
  }

  const enter = (view: EnterView) => {
    if (leaving) return
    audio.unlock()
    if (reduce) {
      onStart(view)
      return
    }
    setLeaving(true)
    sting()
    setTimeout(() => onStart(view), 1150)
  }

  // the first touch of any kind unlocks sound, so the music can start
  useEffect(() => {
    const unlock = () => audio.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  // depth: the scene, the logo and the hands drift against each other as the pointer moves
  useEffect(() => {
    if (reduce) return
    const aim = { x: 0, y: 0 }
    const cur = { x: 0, y: 0 }
    const onMove = (e: PointerEvent) => {
      aim.x = (e.clientX / window.innerWidth - 0.5) * 2
      aim.y = (e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('pointermove', onMove)
    const clock = { raf: 0 }
    const tick = () => {
      clock.raf = requestAnimationFrame(tick)
      cur.x += (aim.x - cur.x) * 0.06
      cur.y += (aim.y - cur.y) * 0.06
      if (sceneLayer.current) sceneLayer.current.style.transform = `translate3d(${cur.x * -16}px, ${cur.y * -10}px, 0)`
      if (logoLayer.current) logoLayer.current.style.transform = `translate3d(${cur.x * 7}px, ${cur.y * 4}px, 0)`
      if (handsLayer.current) handsLayer.current.style.transform = `translate3d(${cur.x * 30}px, ${cur.y * 18}px, 0)`
    }
    clock.raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(clock.raf)
    }
  }, [reduce])

  // Enter starts the game, M mutes, arrow keys walk the menu
  const enterRef = useRef(enter)
  useEffect(() => {
    enterRef.current = enter
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (howTo) return
      const active = document.activeElement
      const onButton = active instanceof HTMLButtonElement
      if ((e.code === 'Enter' || e.code === 'Space') && !onButton) {
        e.preventDefault()
        enterRef.current('play')
      }
      if (e.code === 'KeyM' && !e.repeat) {
        audio.unlock()
        audio.engine.update({ muted: !audio.engine.settings.muted })
        setMuted(audio.engine.settings.muted)
      }
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        const items = [...(menu.current?.querySelectorAll('button') ?? [])]
        if (items.length === 0) return
        e.preventDefault()
        const at = items.indexOf(active as HTMLButtonElement)
        const next = e.code === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length
        items[at < 0 ? 0 : next]?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [howTo])

  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''

  return (
    <div className={`fixed inset-0 z-40 overflow-hidden bg-black text-white transition-opacity duration-500 ${leaving ? 'opacity-0 delay-[650ms]' : 'opacity-100'}`}>
      {/* the scene: parallax outside, the lunge into the screen inside */}
      <div ref={sceneLayer} className="absolute -inset-4 will-change-transform">
        <div className={`absolute inset-0 origin-[62%_55%] transition-[transform,filter] duration-[1100ms] ease-in ${leaving ? 'scale-[1.65] blur-[3px]' : ''}`}>
          <Backdrop onFloor={setFloor} onReady={onReady} />
        </div>
      </div>

      {/* atmosphere: dark vignette, red wash, drifting fog, film grain, storm flashes */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_65%_50%,transparent_26%,rgba(0,0,0,0.8)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[#7A0A1A]/10 mix-blend-multiply" />
      <div className="title-anim pointer-events-none absolute -inset-x-[10%] bottom-0 h-1/2 bg-[radial-gradient(ellipse_at_center,rgba(150,170,160,0.18),transparent_65%)] [animation:title-fog_32s_ease-in-out_infinite]" />
      <div className="title-anim pointer-events-none absolute inset-0 bg-[#BFD7FF] opacity-0 mix-blend-screen [animation:title-flash_11s_linear_infinite]" />

      {/* foreground: clawing hands */}
      <div ref={handsLayer} className="pointer-events-none absolute inset-0 hidden sm:block">
        <Hand className="-bottom-[7vh] -left-[2vw] w-[19vw] min-w-[130px] max-w-[290px] rotate-[12deg]" />
        <Hand className="-bottom-[9vh] -right-[1vw] w-[17vw] min-w-[120px] max-w-[260px] -scale-x-100 -rotate-[10deg] [animation-delay:-4s]" />
      </div>

      <div className="title-grain title-anim pointer-events-none absolute -inset-[10%] opacity-[0.07] [animation:title-grain_0.9s_steps(6)_infinite]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[5vh] bg-black" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[5vh] bg-black" />
      {leaving && <div className="title-anim pointer-events-none absolute inset-0 z-20 bg-white [animation:title-boom_1.1s_ease-out_both]" />}

      {/* corners */}
      <div className="absolute left-5 top-[7vh] z-10 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300 sm:left-[7vw]">
        <span className="title-anim size-2 rounded-full bg-[#FF4B57] [animation:title-beat_1.6s_ease-in-out_infinite]" aria-hidden /> Arc Testnet
      </div>
      <button
        onClick={() => {
          audio.unlock()
          audio.engine.update({ muted: !audio.engine.settings.muted })
          setMuted(audio.engine.settings.muted)
        }}
        aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        className="absolute right-5 top-[6.5vh] z-10 flex size-11 items-center justify-center rounded-full border border-white/25 bg-black/40 text-slate-200 backdrop-blur-sm transition hover:bg-white/15 sm:right-[4vw]"
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      {/* title and menu */}
      <div className={`relative z-10 flex h-full flex-col justify-end gap-8 px-6 pb-[13vh] pt-[16vh] transition duration-500 sm:px-[7vw] lg:justify-center lg:pb-[8vh] ${leaving ? 'origin-left scale-110 opacity-0 blur-sm' : ''}`}>
        <div ref={logoLayer} className="relative">
          <Splats />
          <div className="title-anim relative [animation:title-rise_0.9s_ease-out_both]">
            <h1 className="relative select-none font-bold uppercase leading-[0.82] tracking-[-0.05em] [filter:drop-shadow(0_0_34px_rgba(255,45,68,0.5))_drop-shadow(0_7px_0_#5A0A18)]" style={{ fontFamily: DISPLAY, fontSize: 'clamp(3.6rem, 12.5vw, 10.5rem)' }}>
              {['Zombie', 'Outbreak'].map((line) => (
                <span key={line} className="relative block w-fit">
                  <span aria-hidden className="title-anim absolute inset-0 translate-x-[3px] text-[#FF2D44] mix-blend-screen [animation:title-glitch_7s_steps(1,end)_infinite]">
                    {line}
                  </span>
                  <span aria-hidden className="title-anim absolute inset-0 -translate-x-[3px] text-[#2DE2FF] mix-blend-screen [animation:title-glitch_7s_steps(1,end)_infinite_reverse]">
                    {line}
                  </span>
                  <span className="relative bg-gradient-to-b from-white via-[#FFE1E3] to-[#FF4B57] bg-clip-text text-transparent">{line}</span>
                </span>
              ))}
              <Claws />
              {/* blood running off the second line */}
              <span className="pointer-events-none absolute left-0 top-full -mt-[0.05em] h-[0.55em] w-full" aria-hidden>
                {[6, 17, 31, 47, 58, 74, 88].map((left, i) => (
                  <span
                    key={left}
                    className="title-anim absolute top-0 origin-top rounded-b-full bg-gradient-to-b from-[#D4182E] to-[#7A0A1A]"
                    style={{ left: `${left}%`, width: i % 2 ? '0.07em' : '0.1em', height: `${[0.5, 0.3, 0.42, 0.22, 0.5, 0.34, 0.26][i]}em`, animation: `title-drip ${2.2 + i * 0.35}s ease-out ${0.9 + i * 0.25}s both` }}
                  />
                ))}
              </span>
            </h1>
            <p className="mt-6 max-w-md text-pretty text-sm text-slate-300 sm:text-base">{PRIZES_ENABLED ? 'Seven chapters. Heavy guns to earn. Five players, one prize pool, and the street is full.' : 'Seven chapters. Heavy guns to earn. Survive alone or with friends, and the street is full.'}</p>
          </div>
        </div>

        <nav ref={menu} aria-label="Main menu" className="title-anim flex w-full max-w-xs flex-col gap-1 [animation:title-rise_0.9s_0.25s_ease-out_both]">
          <button
            onClick={() => enter('play')}
            className="group mb-2 flex min-h-14 w-full items-center justify-between gap-3 rounded-full bg-white px-7 text-base font-bold uppercase tracking-[0.16em] text-[#0B1B3A] shadow-[0_12px_40px_-10px_rgba(255,75,87,0.7)] transition hover:bg-[#FFE9EB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:scale-[0.97]"
          >
            <span className="flex items-center gap-3">
              <Gamepad2 size={20} aria-hidden /> Start game
            </span>
            <ArrowRight size={18} className="transition group-hover:translate-x-1" aria-hidden />
          </button>
          <button onClick={() => setOpen(true)} className={ROW}>
            <Bar />
            <Wallet size={16} aria-hidden />
            {address ? (
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-400" aria-hidden />
                <span className="tabular-nums normal-case tracking-normal">{short}</span>
              </span>
            ) : (
              'Connect wallet'
            )}
          </button>
          <button onClick={() => enter('shop')} className={ROW}>
            <Bar />
            <Store size={16} aria-hidden /> Shop
          </button>
          <button onClick={() => setHowTo(true)} className={ROW}>
            <Bar />
            <HelpCircle size={16} aria-hidden /> How to play
          </button>
        </nav>
      </div>

      {/* live caption, bottom right */}
      <div className="absolute bottom-[7vh] right-5 z-10 hidden max-w-[16rem] text-right text-[11px] leading-relaxed text-slate-400 sm:right-[4vw] sm:block">
        <span className="font-semibold uppercase tracking-[0.18em] text-slate-300">Live</span>
        <br />
        The game, playing itself: {PRIZES_ENABLED ? 'Endless Descent, ' : ''}floor <span className="tabular-nums text-white">{floor}</span>
        {PRIZES_ENABLED && DESCENT_ADDRESS && pool.data !== undefined && (
          <>
            <br />
            Prize pool <span className="tabular-nums text-amber-300">{formatUsdc(pool.data)}</span> USDC
          </>
        )}
      </div>
      <p className="absolute bottom-[7vh] left-5 z-10 text-[11px] text-slate-500 sm:left-[7vw]">Testnet build. Test USDC has no value.</p>

      {howTo && <HowTo onClose={() => setHowTo(false)} />}
    </div>
  )
}
