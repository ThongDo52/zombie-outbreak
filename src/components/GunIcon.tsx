import { useEffect, useRef } from 'react'
import { drawGunCentered } from '@/game/gunart'
import type { WeaponId } from '@/game/types'

/** A still picture of one gun, drawn with the same art the game uses. */
export function GunIcon({ id, locked = false, width = 96 }: { id: Exclude<WeaponId, 'fists'>; locked?: boolean; width?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const height = Math.round(width * 0.5)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    if (locked) ctx.filter = 'brightness(0) opacity(0.55)'
    drawGunCentered(ctx, id, width / 2, height / 2, width * 0.82)
  }, [id, locked, width, height])
  return <canvas ref={ref} style={{ width, height }} aria-hidden />
}
