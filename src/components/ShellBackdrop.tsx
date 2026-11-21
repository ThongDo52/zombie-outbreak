import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { sharedShowcase } from '@/game/showcase'

/**
 * The same battle as the title screen, drawn small, blurred and dimmed behind the shop tabs.
 * It renders at a quarter of the pixels and half the frame rate, and stops while the tab is hidden.
 */
export function ShellBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    el.width = 400
    el.height = 240
    ctx.scale(0.5, 0.5)
    const s = sharedShowcase()
    if (reduce) {
      s.render(ctx)
      return
    }
    const clock = { raf: 0, last: performance.now(), frame: 0, failures: 0 }
    const loop = (now: number) => {
      clock.raf = requestAnimationFrame(loop)
      const dt = Math.max(0, Math.min(0.05, (now - clock.last) / 1000))
      clock.last = now
      if (document.hidden) return
      try {
        s.step(dt)
        if (clock.frame++ % 2 === 0) s.render(ctx)
      } catch (err) {
        if (clock.failures++ < 3) console.error('Backdrop failed', err)
      }
    }
    clock.raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(clock.raf)
  }, [reduce])

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black" aria-hidden>
      <canvas ref={ref} className="size-full scale-110 object-cover opacity-70 [filter:blur(7px)_brightness(0.62)_saturate(1.15)]" />
    </div>
  )
}
