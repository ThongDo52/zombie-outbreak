import { bodyRect } from './collision'
import { VIEW_H, VIEW_W } from './config'
import type { Game } from './engine'
import { drawBurning, drawEffects, drawFlame, drawFlameSmoke, drawShield, drawShots, drawStatus, drawZones } from './fx'
import { drawHud } from './hud'
import { drawObstacle, drawPickup, drawPlayer } from './sprites'
import { drawZombie } from './zombieart'
import { drawGround, drawHazards, drawWeather } from './scenery'
import { activeMap } from './world'

const DISPLAY = "'Space Grotesk', 'DM Sans', sans-serif"

export interface DrawOptions {
  /** Draw the heads-up display (default true). The welcome page turns it off. */
  hud?: boolean
  crosshair?: boolean
}

export function draw(ctx: CanvasRenderingContext2D, g: Game, opts: DrawOptions = {}) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H)
  ctx.save()
  const sx = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0
  const sy = g.shake > 0 ? (Math.random() - 0.5) * g.shake : 0
  ctx.translate(-Math.round(g.camera.x) + sx, -Math.round(g.camera.y) + sy)

  drawGround(ctx, g)
  drawHazards(ctx, g)
  drawDecals(ctx, g)
  drawZones(ctx, g)
  for (const o of activeMap.obstacles) {
    if (o.x < g.camera.x + VIEW_W + 20 && o.x + o.w > g.camera.x - 20 && o.y < g.camera.y + VIEW_H + 20 && o.y + o.h > g.camera.y - 20) drawObstacle(ctx, o)
  }
  for (const k of g.pickups) drawPickup(ctx, k, g.time)
  const cx = g.camera.x + VIEW_W / 2
  const cy = g.camera.y + VIEW_H / 2
  const visible = g.zombies.filter((z) => Math.abs(z.x - cx) < 560 && Math.abs(z.y - cy) < 380)
  visible.sort((a, b) => a.y - b.y)
  for (const z of visible) {
    drawZombie(ctx, z, g)
    if (z.burn && z.burn > 0) drawBurning(ctx, z, g.time)
    drawStatus(ctx, z, g.time)
    drawShield(ctx, z, g.time)
  }
  for (const slot of [...g.slots].sort((a, b) => a.player.y - b.player.y)) drawPlayer(ctx, g, slot)
  drawEffects(ctx, g)
  drawShots(ctx, g)
  drawProjectiles(ctx, g)
  drawParticles(ctx, g)
  if (g.debug) drawDebug(ctx, g)
  drawTexts(ctx, g)
  ctx.restore()

  drawLighting(ctx, g)
  drawWeather(ctx, g)
  if (opts.crosshair !== false) drawCrosshair(ctx, g)
  if (opts.hud !== false) drawHud(ctx, g)
}

function drawDecals(ctx: CanvasRenderingContext2D, g: Game) {
  const cam = g.camera
  for (const d of g.decals) {
    if (d.x < cam.x - 60 || d.x > cam.x + VIEW_W + 60 || d.y < cam.y - 60 || d.y > cam.y + VIEW_H + 60) continue
    ctx.save()
    ctx.translate(d.x, d.y)
    ctx.rotate(d.rot)
    ctx.fillStyle = d.kind === 2 ? 'rgba(90,18,28,0.55)' : 'rgba(110,22,32,0.45)'
    ctx.beginPath()
    ctx.ellipse(0, 0, d.r, d.r * 0.65, 0, 0, Math.PI * 2)
    ctx.ellipse(d.r * 0.8, d.r * 0.2, d.r * 0.35, d.r * 0.25, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

function drawProjectiles(ctx: CanvasRenderingContext2D, g: Game) {
  drawFlameSmoke(ctx, g.bullets)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (const b of g.bullets) {
    if (b.weapon === 'flamer') {
      drawFlame(ctx, b, g.time)
      continue
    }
    if (b.weapon === 'railgun') {
      ctx.strokeStyle = 'rgba(140,255,255,0.35)'
      ctx.lineWidth = 12
      ctx.beginPath()
      ctx.moveTo(b.x - b.vx * 0.06, b.y - b.vy * 0.06)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      ctx.strokeStyle = '#EFFFFF'
      ctx.lineWidth = 3
      ctx.stroke()
      continue
    }
    if (b.weapon === 'venom') {
      ctx.fillStyle = 'rgba(120,255,60,0.35)'
      ctx.beginPath()
      ctx.arc(b.x - b.vx * 0.018, b.y - b.vy * 0.018, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#B6FF5A'
      ctx.beginPath()
      ctx.arc(b.x, b.y, 6.5 + Math.sin(g.time * 30) * 0.8, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#2E7A12'
      ctx.beginPath()
      ctx.arc(b.x + 1, b.y + 1, 2.6, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    if (b.weapon === 'cryo') {
      const a = Math.atan2(b.vy, b.vx)
      ctx.strokeStyle = 'rgba(180,235,255,0.4)'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(b.x - b.vx * 0.04, b.y - b.vy * 0.04)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(a)
      ctx.fillStyle = '#EFFFFF'
      ctx.beginPath()
      ctx.moveTo(8, 0)
      ctx.lineTo(0, -3.5)
      ctx.lineTo(-6, 0)
      ctx.lineTo(0, 3.5)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      continue
    }
    if (b.weapon === 'launcher') {
      ctx.fillStyle = 'rgba(255,180,80,0.35)'
      ctx.beginPath()
      ctx.arc(b.x - b.vx * 0.02, b.y - b.vy * 0.02, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#C6FF6B'
      ctx.beginPath()
      ctx.arc(b.x, b.y, 5, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    const tail = 0.035
    if (b.glow) {
      ctx.globalAlpha = 0.28
      ctx.fillStyle = b.color
      ctx.beginPath()
      ctx.arc(b.x, b.y, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.strokeStyle = b.color
    ctx.globalAlpha = 0.35
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(b.x - b.vx * tail, b.y - b.vy * tail)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.lineWidth = 2.5
    ctx.stroke()
  }
  ctx.restore()
  for (const h of g.hitboxes) {
    if (h.owner === 'zombie') continue // zombie attacks are shown by their bite / slam effects
    ctx.fillStyle = 'rgba(160,200,255,0.4)'
    ctx.beginPath()
    ctx.roundRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h, 8)
    ctx.fill()
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, g: Game) {
  for (const q of g.particles) {
    ctx.globalAlpha = Math.max(0, q.life / q.max)
    ctx.fillStyle = q.color
    ctx.beginPath()
    ctx.arc(q.x, q.y, q.size / 2 + 0.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawTexts(ctx: CanvasRenderingContext2D, g: Game) {
  ctx.textAlign = 'center'
  ctx.font = `700 13px ${DISPLAY}`
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  for (const t of g.texts) {
    ctx.globalAlpha = Math.min(1, t.life * 2)
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'
    ctx.strokeText(t.text, t.x, t.y)
    ctx.fillStyle = t.color
    ctx.fillText(t.text, t.x, t.y)
  }
  ctx.globalAlpha = 1
}

/** Night vignette around the player, warm light on muzzle flash, red flash when hurt. */
function drawLighting(ctx: CanvasRenderingContext2D, g: Game) {
  const p = g.player
  const px = p.down ? VIEW_W / 2 : p.x - g.camera.x
  const py = p.down ? VIEW_H / 2 : p.y - g.camera.y
  const th = activeMap.chapter.theme
  const dark = ctx.createRadialGradient(px, py, 110, px, py, th.lightRadius)
  dark.addColorStop(0, `rgba(${th.dark},0)`)
  dark.addColorStop(1, `rgba(${th.dark},${th.darkAlpha})`)
  ctx.fillStyle = dark
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  // teammates carry a little light of their own so they are easy to find in the dark
  if (g.slots.length > 1) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (const slot of g.slots) {
      if (slot.id === g.localId) continue
      const tx = slot.player.x - g.camera.x
      const ty = slot.player.y - g.camera.y
      const glow = ctx.createRadialGradient(tx, ty, 0, tx, ty, 150)
      glow.addColorStop(0, 'rgba(170,210,255,0.16)')
      glow.addColorStop(1, 'rgba(170,210,255,0)')
      ctx.fillStyle = glow
      ctx.fillRect(tx - 150, ty - 150, 300, 300)
    }
    ctx.restore()
  }
  if (p.muzzle > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const warm = ctx.createRadialGradient(px, py, 0, px, py, 200)
    warm.addColorStop(0, 'rgba(255,170,70,0.2)')
    warm.addColorStop(1, 'rgba(255,170,70,0)')
    ctx.fillStyle = warm
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    ctx.restore()
  }
  const hurt = Math.max(0, p.invuln - 0.35) * 0.55
  const low = p.down ? 0.2 : p.hp / p.maxHp < 0.3 ? 0.12 + 0.08 * Math.sin(g.time * 6) : 0
  const a = Math.max(hurt, low)
  if (a > 0 && g.status === 'playing') {
    const v = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 160, VIEW_W / 2, VIEW_H / 2, 480)
    v.addColorStop(0, 'rgba(200,20,40,0)')
    v.addColorStop(1, `rgba(200,20,40,${a * 2})`)
    ctx.fillStyle = v
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  }
}

function drawCrosshair(ctx: CanvasRenderingContext2D, g: Game) {
  if (g.autoAim || g.status !== 'playing' || g.player.down) return
  const { x, y } = g.aimScreen
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, 8, 0, Math.PI * 2)
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(x + dx * 12, y + dy * 12)
    ctx.lineTo(x + dx * 18, y + dy * 18)
  }
  ctx.stroke()
  ctx.fillStyle = '#FF4B57'
  ctx.fillRect(x - 1.5, y - 1.5, 3, 3)
}

function drawDebug(ctx: CanvasRenderingContext2D, g: Game) {
  ctx.lineWidth = 1.5
  ctx.strokeStyle = '#4BE08F' // hurtboxes
  for (const slot of g.slots) {
    const pr = bodyRect(slot.player)
    ctx.strokeRect(pr.x, pr.y, pr.w, pr.h)
  }
  ctx.font = `500 10px 'DM Sans', sans-serif`
  ctx.textAlign = 'center'
  ctx.fillStyle = '#FFFFFF'
  for (const z of g.zombies) {
    const r = bodyRect(z)
    ctx.strokeRect(r.x, r.y, r.w, r.h)
    ctx.fillText(z.state, z.x, r.y + r.h + 12)
  }
  for (const slot of g.slots) ctx.fillText(slot.player.state, slot.player.x, slot.player.y + 30)
  ctx.strokeStyle = '#FF4B57' // hitboxes
  for (const h of g.hitboxes) ctx.strokeRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h)
  for (const b of g.bullets) {
    ctx.strokeRect(Math.min(b.px, b.x) - 3, Math.min(b.py, b.y) - 3, Math.abs(b.x - b.px) + 6, Math.abs(b.y - b.py) + 6)
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  for (const o of activeMap.obstacles) ctx.strokeRect(o.x, o.y, o.w, o.h)
}
