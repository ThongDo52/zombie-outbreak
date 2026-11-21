import type { Rect, Vec } from './types'
import { activeMap } from './world'

/** Axis-aligned bounding box overlap test. */
export function aabb(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** Hurtbox of an entity stored by its center point. */
export function bodyRect(e: { x: number; y: number; w: number; h: number }): Rect {
  return { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function normalize(x: number, y: number): Vec {
  const len = Math.hypot(x, y)
  return len === 0 ? { x: 0, y: 0 } : { x: x / len, y: y / len }
}

export function hitsObstacle(r: Rect): boolean {
  for (const o of activeMap.obstacles) if (aabb(r, o)) return true
  return false
}

export function hitsHazard(r: Rect): boolean {
  for (const h of activeMap.hazards) if (aabb(r, h)) return true
  return false
}

/** Move a body one axis at a time so it slides along walls. */
export function moveBody(b: { x: number; y: number; w: number; h: number }, dx: number, dy: number) {
  const hw = b.w / 2
  const hh = b.h / 2
  const nx = clamp(b.x + dx, hw, activeMap.w - hw)
  if (!hitsObstacle({ x: nx - hw, y: b.y - hh, w: b.w, h: b.h })) b.x = nx
  const ny = clamp(b.y + dy, hh, activeMap.h - hh)
  if (!hitsObstacle({ x: b.x - hw, y: ny - hh, w: b.w, h: b.h })) b.y = ny
}

/** Rectangle covering the path a bullet travelled this frame (avoids tunnelling). */
export function sweptRect(px: number, py: number, x: number, y: number, pad: number): Rect {
  const minX = Math.min(px, x) - pad
  const minY = Math.min(py, y) - pad
  return { x: minX, y: minY, w: Math.abs(x - px) + pad * 2, h: Math.abs(y - py) + pad * 2 }
}

/** A random point at least `min` and at most `max` pixels from (cx, cy) that is not inside a wall. */
export function freeSpot(cx: number, cy: number, min: number, max: number, size = 60): Vec {
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2
    const d = min + Math.random() * (max - min)
    const x = clamp(cx + Math.cos(a) * d, 40, activeMap.w - 40)
    const y = clamp(cy + Math.sin(a) * d, 40, activeMap.h - 40)
    const r = { x: x - size / 2, y: y - size / 2, w: size, h: size }
    if (!hitsObstacle(r) && !hitsHazard(r)) return { x, y }
  }
  return { x: cx, y: cy }
}
