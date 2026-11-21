import { useEffect, useRef } from 'react'
import { hueColor } from '@/game/skins'

export type StagePhase = 'idle' | 'charging' | 'opening' | 'revealed'

interface Props {
  phase: StagePhase
  /** 0 Rare, 1 Epic, 2 Legendary, 3 Mythic. Known once the box is opened. */
  tier: number | null
}

const W = 360
const H = 250
const TIER_COLOR = ['#5B9BFF', '#B66CFF', '#FFB23C', '#FF4FD8']

interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  hue: number
}

/** The mystery box: floats, shakes while randomness is pending, then bursts open in the tier's colors. */
export function BoxStage({ phase, tier }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const live = useRef({ phase, tier })

  useEffect(() => {
    live.current = { phase, tier }
  }, [phase, tier])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const sparks: Spark[] = []
    const run = { raf: 0, last: performance.now(), t: 0, prev: 'idle' as StagePhase, openAt: 0, flash: 0 }

    const burst = (color: boolean, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4
        const sp = 120 + Math.random() * 320
        sparks.push({ x: W / 2, y: 140, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.4 + Math.random() * 0.8, max: 2.2, size: 2 + Math.random() * 4, hue: color ? Math.random() * 360 : -1 })
      }
    }

    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - run.last) / 1000))
      run.last = now
      run.t += dt
      const t = run.t
      const { phase: ph, tier: tr } = live.current
      if (ph !== run.prev) {
        if (ph === 'opening') {
          run.openAt = t
          run.flash = 1
          burst(tr === 3, tr === 3 ? 140 : 80 + (tr ?? 0) * 20)
        }
        run.prev = ph
      }
      const accent = tr === null ? '#8F6BFF' : tr === 3 ? hueColor(t, 0) : TIER_COLOR[tr]

      ctx.clearRect(0, 0, W, H)
      const bg = ctx.createRadialGradient(W / 2, 150, 10, W / 2, 150, 210)
      bg.addColorStop(0, 'rgba(60,40,110,0.55)')
      bg.addColorStop(1, 'rgba(8,12,20,0)')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      const opened = ph === 'opening' || ph === 'revealed'
      const openT = opened ? Math.min(1, (t - run.openAt) / 0.6) : 0
      const ease = 1 - (1 - openT) * (1 - openT)

      // rays behind the box
      if (opened) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.translate(W / 2, 150)
        const n = 14
        for (let i = 0; i < n; i++) {
          const a = t * 0.5 + (i * Math.PI * 2) / n
          ctx.fillStyle = tr === 3 ? hueColor(t, i * 26, 0.22 * ease) : `${accent}38`
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.arc(0, 0, 230, a, a + 0.1)
          ctx.closePath()
          ctx.fill()
        }
        ctx.restore()
      }

      // box
      const idleBob = Math.sin(t * 2) * 4
      const shake = ph === 'charging' ? (Math.random() - 0.5) * 7 : 0
      const cx = W / 2 + shake
      const cy = 150 + (ph === 'idle' ? idleBob : 0) + (ph === 'charging' ? (Math.random() - 0.5) * 4 : 0)
      ctx.save()
      ctx.translate(cx, cy)
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.beginPath()
      ctx.ellipse(0, 62, 74, 11, 0, 0, Math.PI * 2)
      ctx.fill()

      const glowColor = ph === 'idle' ? '#8F6BFF' : accent
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const pulse = 0.5 + 0.5 * Math.sin(t * (ph === 'charging' ? 14 : 3))
      const gl = ctx.createRadialGradient(0, 0, 10, 0, 0, 110)
      gl.addColorStop(0, ph === 'idle' ? `rgba(143,107,255,${0.25 + pulse * 0.15})` : tr === 3 ? hueColor(t, 0, 0.5) : `${glowColor}80`)
      gl.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = gl
      ctx.beginPath()
      ctx.arc(0, 0, 110, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // body
      const body = ctx.createLinearGradient(0, -10, 0, 62)
      body.addColorStop(0, '#2B2F5A')
      body.addColorStop(1, '#141836')
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.roundRect(-64, -8, 128, 70, 8)
      ctx.fill()
      ctx.strokeStyle = '#B9A25A'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle = '#B9A25A'
      ctx.fillRect(-64, 22, 128, 5)
      ctx.fillRect(-6, -8, 12, 70)

      // light spilling out of the open box
      if (opened) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        const beam = ctx.createLinearGradient(0, -8, 0, -190)
        beam.addColorStop(0, tr === 3 ? hueColor(t, 0, 0.85 * ease) : `${accent}`)
        beam.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.globalAlpha = 0.65 * ease
        ctx.fillStyle = beam
        ctx.beginPath()
        ctx.moveTo(-58, -8)
        ctx.lineTo(-92, -190)
        ctx.lineTo(92, -190)
        ctx.lineTo(58, -8)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }

      // lid, hinged on its back-left corner
      ctx.save()
      ctx.translate(-68, -8)
      ctx.rotate(-ease * 1.75)
      const lid = ctx.createLinearGradient(0, -34, 0, 0)
      lid.addColorStop(0, '#3A3F78')
      lid.addColorStop(1, '#232857')
      ctx.fillStyle = lid
      ctx.beginPath()
      ctx.roundRect(0, -34, 136, 34, [10, 10, 4, 4])
      ctx.fill()
      ctx.strokeStyle = '#B9A25A'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle = '#B9A25A'
      ctx.fillRect(62, -34, 12, 34)
      ctx.restore()

      // lock / star badge
      if (!opened) {
        ctx.fillStyle = '#E9D27A'
        ctx.beginPath()
        ctx.roundRect(-9, 8, 18, 16, 3)
        ctx.fill()
        ctx.fillStyle = '#2B2F5A'
        ctx.beginPath()
        ctx.arc(0, 15, 2.6, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillRect(-1, 16, 2, 5)
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = `rgba(255,240,170,${0.4 + 0.3 * Math.sin(t * 5)})`
        ctx.beginPath()
        ctx.arc(-44, -2, 3, 0, Math.PI * 2)
        ctx.arc(44, 40, 2.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      ctx.restore()

      // ambient sparks while charging
      if (ph === 'charging' && Math.random() < 0.7) {
        const a = Math.random() * Math.PI * 2
        sparks.push({ x: W / 2 + Math.cos(a) * 70, y: 150 + Math.sin(a) * 50, vx: -Math.cos(a) * 40, vy: -Math.sin(a) * 40 - 20, life: 0.7, max: 0.7, size: 2 + Math.random() * 2, hue: Math.random() * 360 })
      }
      if (ph === 'revealed' && Math.random() < 0.5) burst(tr === 3, 1)

      // sparks
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        s.life -= dt
        if (s.life <= 0) {
          sparks.splice(i, 1)
          continue
        }
        s.x += s.vx * dt
        s.y += s.vy * dt
        s.vy += 160 * dt
        s.vx *= 0.99
        const k = s.life / s.max
        ctx.globalAlpha = Math.min(1, k * 1.6)
        ctx.fillStyle = s.hue >= 0 ? `hsl(${s.hue + t * 120},100%,65%)` : accent
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size * (0.4 + k), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      // flash on opening
      if (run.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${run.flash * 0.75})`
        ctx.fillRect(0, 0, W, H)
        run.flash = Math.max(0, run.flash - dt * 2.2)
      }
      run.raf = requestAnimationFrame(tick)
    }
    run.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(run.raf)
  }, [])

  return <canvas ref={ref} className="h-[250px] w-[360px] max-w-full" aria-label="Mystery box" role="img" />
}
