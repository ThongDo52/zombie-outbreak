import { VIEW_H, VIEW_W } from './config'
import type { Game } from './engine'
import type { Rect } from './types'
import { activeMap, hash2 } from './world'

const TILE = 64

/** Ground, patches, roads and the arena border, drawn with the current chapter's theme. */
export function drawGround(ctx: CanvasRenderingContext2D, g: Game) {
  const th = activeMap.chapter.theme
  const cam = g.camera
  ctx.fillStyle = th.ground
  ctx.fillRect(cam.x - 4, cam.y - 4, VIEW_W + 8, VIEW_H + 8)
  const x0 = Math.floor(cam.x / TILE) * TILE
  const y0 = Math.floor(cam.y / TILE) * TILE
  for (let x = x0; x < cam.x + VIEW_W + TILE; x += TILE) {
    for (let y = y0; y < cam.y + VIEW_H + TILE; y += TILE) {
      const h = hash2(x, y)
      ctx.fillStyle = h > 0.5 ? `rgba(255,255,255,${(h - 0.5) * 0.06})` : `rgba(0,0,0,${(0.5 - h) * 0.16})`
      ctx.fillRect(x, y, TILE, TILE)
      if (h > 0.78) drawPatch(ctx, th.patchKind, th.patch, x, y, h)
      if (h < 0.1) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.fillRect(x + 20, y + 26, 5, 5)
        ctx.fillRect(x + 40, y + 10, 4, 4)
      }
    }
  }
  for (const r of activeMap.roads) {
    ctx.fillStyle = th.road
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(r.x, r.y, r.w, 4)
    ctx.fillRect(r.x, r.y + r.h - 4, r.w, 4)
    ctx.fillStyle = th.roadLine
    if (r.w > r.h) for (let x = r.x; x < r.x + r.w; x += 70) ctx.fillRect(x, r.y + r.h / 2 - 2, 38, 4)
    else for (let y = r.y; y < r.y + r.h; y += 70) ctx.fillRect(r.x + r.w / 2 - 2, y, 4, 38)
  }
  ctx.strokeStyle = th.border
  ctx.lineWidth = 12
  ctx.strokeRect(-6, -6, activeMap.w + 12, activeMap.h + 12)
  ctx.strokeStyle = 'rgba(255,75,87,0.5)'
  ctx.lineWidth = 2
  ctx.setLineDash([14, 10])
  ctx.strokeRect(2, 2, activeMap.w - 4, activeMap.h - 4)
  ctx.setLineDash([])
}

function drawPatch(ctx: CanvasRenderingContext2D, kind: string, color: string, x: number, y: number, h: number) {
  ctx.fillStyle = color
  if (kind === 'snow') {
    ctx.beginPath()
    ctx.ellipse(x + 32, y + 30, 26 + h * 8, 14 + h * 6, h * 3, 0, Math.PI * 2)
    ctx.fill()
  } else if (kind === 'toxic') {
    ctx.beginPath()
    ctx.ellipse(x + 30, y + 30, 20, 12, h * 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(x + 8, y + 40, 40, 2)
  } else if (kind === 'ash') {
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x + 6, y + 20 + h * 10)
    ctx.lineTo(x + 28, y + 34)
    ctx.lineTo(x + 40, y + 24)
    ctx.lineTo(x + 58, y + 44)
    ctx.stroke()
  } else {
    ctx.fillRect(x + h * 20, y + 12, 30, 20)
    ctx.fillRect(x + 18, y + 34 + h * 8, 22, 14)
  }
}

/** Acid pools and lava. They glow, bubble and hurt the player. */
export function drawHazards(ctx: CanvasRenderingContext2D, g: Game) {
  const cam = g.camera
  const t = g.time
  for (const h of activeMap.hazards) {
    if (h.x > cam.x + VIEW_W + 20 || h.x + h.w < cam.x - 20 || h.y > cam.y + VIEW_H + 20 || h.y + h.h < cam.y - 20) continue
    if (h.kind === 'electric') {
      drawElectric(ctx, h, t)
      continue
    }
    const lava = h.kind === 'lava'
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(h.x, h.y, h.w, h.h, 22)
    ctx.clip()
    ctx.fillStyle = lava ? '#5E1608' : '#1F3F12'
    ctx.fillRect(h.x, h.y, h.w, h.h)
    const n = Math.max(4, Math.round((h.w * h.h) / 9000))
    for (let i = 0; i < n; i++) {
      const bx = h.x + hash2(i, h.x) * h.w
      const by = h.y + hash2(i + 7, h.y) * h.h
      const r = (lava ? 26 : 20) + Math.sin(t * 1.6 + i * 1.7) * 7
      ctx.fillStyle = lava ? `rgba(255,${100 + ((i * 37) % 70)},30,0.75)` : `rgba(${110 + ((i * 29) % 60)},230,60,0.55)`
      ctx.beginPath()
      ctx.arc(bx, by, Math.max(4, r), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = lava ? `rgba(255,120,40,${0.18 + 0.08 * Math.sin(t * 3)})` : `rgba(140,255,80,${0.12 + 0.06 * Math.sin(t * 2)})`
    ctx.fillRect(h.x, h.y, h.w, h.h)
    ctx.restore()
    ctx.strokeStyle = lava ? 'rgba(255,170,80,0.8)' : 'rgba(190,255,120,0.7)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(h.x, h.y, h.w, h.h, 22)
    ctx.stroke()
    // warning glow around the edge
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = lava ? 'rgba(255,90,30,0.25)' : 'rgba(120,255,60,0.2)'
    ctx.lineWidth = 14
    ctx.beginPath()
    ctx.roundRect(h.x - 4, h.y - 4, h.w + 8, h.h + 8, 26)
    ctx.stroke()
    ctx.restore()
  }
}

/** Falling snow, drifting spores or rising embers, in screen space. */
export function drawWeather(ctx: CanvasRenderingContext2D, g: Game) {
  const kind = activeMap.chapter.theme.weather
  if (!kind) return
  const t = g.time
  ctx.save()
  if (kind === 'snow') {
    ctx.fillStyle = 'rgba(220,235,255,0.07)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    for (let i = 0; i < 90; i++) {
      const x = (((hash2(i, 1) * VIEW_W + t * (40 + hash2(i, 3) * 40) + Math.sin(t * 1.4 + i) * 14) % VIEW_W) + VIEW_W) % VIEW_W
      const y = (hash2(i, 2) * VIEW_H + t * (60 + hash2(i, 4) * 70)) % VIEW_H
      const s = 1.2 + hash2(i, 5) * 2.4
      ctx.fillRect(x, y, s, s)
    }
  } else if (kind === 'spores') {
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 45; i++) {
      const x = (hash2(i, 1) * VIEW_W + Math.sin(t * 0.7 + i) * 30 + VIEW_W) % VIEW_W
      const y = (((hash2(i, 2) * VIEW_H - t * (10 + hash2(i, 4) * 20)) % VIEW_H) + VIEW_H) % VIEW_H
      ctx.fillStyle = `rgba(150,255,90,${0.2 + 0.25 * Math.sin(t * 2 + i)})`
      ctx.beginPath()
      ctx.arc(x, y, 1.5 + hash2(i, 5) * 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 60; i++) {
      const x = (hash2(i, 1) * VIEW_W + Math.sin(t * 1.1 + i * 2) * 26 + VIEW_W) % VIEW_W
      const y = (((hash2(i, 2) * VIEW_H - t * (40 + hash2(i, 4) * 60)) % VIEW_H) + VIEW_H) % VIEW_H
      ctx.fillStyle = `rgba(255,${110 + ((i * 17) % 90)},40,${0.35 + 0.35 * Math.sin(t * 5 + i)})`
      ctx.fillRect(x, y, 2 + hash2(i, 5) * 2, 2 + hash2(i, 5) * 2)
    }
  }
  ctx.restore()
}

/** Live rails: a dark strip with crackling arcs that flicker on and off. */
function drawElectric(ctx: CanvasRenderingContext2D, h: Rect, t: number) {
  ctx.save()
  ctx.fillStyle = '#10202E'
  ctx.fillRect(h.x, h.y, h.w, h.h)
  ctx.strokeStyle = 'rgba(255,214,90,0.85)'
  ctx.lineWidth = 2
  ctx.strokeRect(h.x + 1, h.y + 1, h.w - 2, h.h - 2)
  ctx.globalCompositeOperation = 'lighter'
  const flick = 0.55 + 0.45 * Math.abs(Math.sin(t * 9 + h.x))
  const horizontal = h.w >= h.h
  const len = horizontal ? h.w : h.h
  const mid = horizontal ? h.y + h.h / 2 : h.x + h.w / 2
  const spread = (horizontal ? h.h : h.w) * 0.42
  for (let k = 0; k < 2; k++) {
    ctx.strokeStyle = k === 0 ? `rgba(120,200,255,${0.9 * flick})` : `rgba(255,255,255,${0.7 * flick})`
    ctx.lineWidth = k === 0 ? 3 : 1.2
    ctx.beginPath()
    const steps = Math.max(6, Math.round(len / 26))
    for (let i = 0; i <= steps; i++) {
      const a = (len * i) / steps
      const off = (hash2(i + k * 31, Math.floor(t * 12) + h.x) - 0.5) * 2 * spread
      const x = horizontal ? h.x + a : mid + off
      const y = horizontal ? mid + off : h.y + a
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.fillStyle = `rgba(90,170,255,${0.1 * flick})`
  ctx.fillRect(h.x - 8, h.y - 8, h.w + 16, h.h + 16)
  ctx.restore()
}
