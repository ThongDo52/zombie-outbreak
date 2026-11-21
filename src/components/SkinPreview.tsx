import { useEffect, useRef } from 'react'
import { drawEffectList } from '@/game/fx'
import { drawGunCentered } from '@/game/gunart'
import { drawCharacter } from '@/game/playerart'
import { DEFAULT_CHARACTER, gunPalette, hueColor, tracerColor, type SkinDef, type SkinKind } from '@/game/skins'
import type { Effect } from '@/game/types'

const W = 132
const H = 104
const NO_POSE = { moving: false, stunned: false, dashing: false, punching: false }

interface Props {
  kind: SkinKind
  /** Undefined shows the default look. */
  skin?: SkinDef
  className?: string
}

function zombie(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(x, y + 14, 16, 6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#5E8C4A'
  ctx.beginPath()
  ctx.ellipse(x, y, 13, 17, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#A7C98B'
  ctx.beginPath()
  ctx.arc(x + 4, y, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#FF3B4A'
  ctx.fillRect(x + 8, y - 4, 3, 3)
  ctx.fillRect(x + 8, y + 2, 3, 3)
}

/** Live preview of a skin, drawn with the same code the game uses. */
export function SkinPreview({ kind, skin, className = 'h-[104px] w-[132px]' }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const loop = { raf: 0, start: performance.now() }
    const tick = (now: number) => {
      const t = (now - loop.start) / 1000
      ctx.clearRect(0, 0, W, H)
      const bg = ctx.createRadialGradient(W / 2, H / 2, 6, W / 2, H / 2, 90)
      bg.addColorStop(0, 'rgba(255,255,255,0.14)')
      bg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      if (kind === 'character') {
        ctx.save()
        ctx.translate(W / 2, H / 2 + 2)
        ctx.scale(2.3, 2.3)
        const angle = Math.sin(t * 0.9) * 0.7
        drawCharacter(ctx, 0, 0, angle, t, skin?.character ?? DEFAULT_CHARACTER, 'rifle', undefined, NO_POSE)
        ctx.restore()
      } else if (kind === 'gun') {
        ctx.save()
        ctx.translate(W / 2, H / 2)
        ctx.rotate(-0.25)
        drawGunCentered(ctx, 'rifle', 0, 0, 96, gunPalette(skin?.gun, t))
        ctx.restore()
        // a shot streaks across now and then
        const phase = (t % 1.6) / 1.6
        if (phase < 0.5) {
          const x = 18 + phase * 2 * 100
          const color = tracerColor(skin?.gun, t)
          ctx.save()
          ctx.globalCompositeOperation = 'lighter'
          ctx.strokeStyle = color
          ctx.lineWidth = 3
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(x - 18, 22)
          ctx.lineTo(x, 22)
          ctx.stroke()
          if (skin?.gun?.glow) {
            ctx.globalAlpha = 0.3
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(x, 22, 8, 0, Math.PI * 2)
            ctx.fill()
          }
          if (skin?.gun?.sparkle) {
            ctx.globalAlpha = 0.9
            ctx.fillStyle = skin.gun.sparkle === 'rainbow' ? hueColor(t, 40) : skin.gun.sparkle
            for (let i = 1; i <= 4; i++) ctx.fillRect(x - i * 6, 22 + Math.sin(i * 2 + t * 9) * 4, 2.5, 2.5)
          }
          ctx.restore()
        }
      } else {
        const cycle = t % 2
        const cx = W / 2
        const cy = H / 2
        if (cycle < 1.1) {
          zombie(ctx, cx, cy)
        } else if (skin?.effect) {
          const k = (cycle - 1.1) / 0.9
          const color = skin.effect === 'gold' ? '#FFD25A' : skin.effect === 'lightning' ? '#6EDCFF' : '#7CFFE0'
          const fx: Effect[] = []
          if (skin.effect === 'lightning') fx.push({ kind: 'bolt', x: cx, y: cy, angle: 0.4, size: 56, life: 0.4 * (1 - k), max: 0.4 })
          fx.push({ kind: 'ring', x: cx, y: cy, angle: 0, size: 54, life: 0.6 * (1 - k), max: 0.6, color })
          drawEffectList(ctx, fx)
          ctx.save()
          ctx.globalAlpha = Math.max(0, 1 - k)
          if (skin.effect === 'gold') {
            ctx.fillStyle = '#FFD25A'
            for (let i = 0; i < 12; i++) {
              const a = i * 0.52
              ctx.fillRect(cx + Math.cos(a) * (8 + k * 38) - 2, cy + Math.sin(a) * (8 + k * 38) - 2, 4, 4)
            }
          } else if (skin.effect === 'soul') {
            ctx.fillStyle = '#B9FFF0'
            for (let i = 0; i < 9; i++) ctx.fillRect(cx + (i - 4) * 5 + Math.sin(i + t * 4) * 3, cy - k * 46 - (i % 3) * 7, 3, 3)
          }
          ctx.restore()
        }
      }
      loop.raf = requestAnimationFrame(tick)
    }
    loop.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(loop.raf)
  }, [kind, skin])

  return <canvas ref={ref} className={className} aria-hidden />
}
