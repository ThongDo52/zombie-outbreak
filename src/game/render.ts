import { bodyRect } from './collision'
import { VIEW_H, VIEW_W } from './config'
import type { Game } from './engine'
import { drawBurning, drawEffects, drawFlame, drawFlameSmoke, drawShield, drawShots, drawStatus, drawZones } from './fx'
import { drawHud } from './hud'
import { drawPet } from './petart'
import { drawShop } from './shopui'
import { drawObstacle, drawPickup, drawPlayer } from './sprites'
import { drawZombie } from './zombieart'
import { drawGround, drawHazards, drawWeather } from './scenery'
import type { Pet, PlayerSlot } from './types'
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
  // marks painted on the ground (a bomb's landing spot, a summoning circle) lie under everything that stands on it
  drawEffects(ctx, g, 'ground')
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
  // players and their pets, nearest the bottom of the screen last so they overlap the right way
  const standing: { y: number; slot?: PlayerSlot; pet?: Pet }[] = []
  for (const slot of g.slots) standing.push({ y: slot.player.y, slot })
  for (const pet of g.pets) if (Math.abs(pet.x - cx) < 560 && Math.abs(pet.y - cy) < 380) standing.push({ y: pet.y, pet })
  standing.sort((a, b) => a.y - b.y)
  for (const s of standing) {
    if (s.slot) drawPlayer(ctx, g, s.slot)
    else if (s.pet) drawPet(ctx, s.pet, g)
  }
  drawEffects(ctx, g, 'air')
  drawShots(ctx, g)
  drawProjectiles(ctx, g)
  drawParticles(ctx, g)
  if (g.debug) drawDebug(ctx, g)
  drawTexts(ctx, g)
  ctx.restore()

  drawLighting(ctx, g)
  drawCoinFx(ctx, g)
  drawWeather(ctx, g)
  if (opts.crosshair !== false) drawCrosshair(ctx, g)
  if (opts.hud !== false) {
    drawHud(ctx, g)
    if (g.shopOpen) drawShop(ctx, g)
  }
}

function drawDecals(ctx: CanvasRenderingContext2D, g: Game) {
  const cam = g.camera
  for (const d of g.decals) {
    if (d.x < cam.x - 80 || d.x > cam.x + VIEW_W + 80 || d.y < cam.y - 80 || d.y > cam.y + VIEW_H + 80) continue
    if (d.kind === 3) {
      // a scorch mark: black in the middle, fading to nothing, with soot thrown outward
      const r = Math.max(1, d.r)
      const grad = ctx.createRadialGradient(d.x, d.y, r * 0.1, d.x, d.y, r)
      grad.addColorStop(0, 'rgba(8,6,6,0.6)')
      grad.addColorStop(0.6, 'rgba(14,10,10,0.34)')
      grad.addColorStop(1, 'rgba(14,10,10,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(8,6,6,0.3)'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      for (let i = 0; i < 7; i++) {
        const a = d.rot + i * 0.9
        ctx.moveTo(d.x + Math.cos(a) * r * 0.55, d.y + Math.sin(a) * r * 0.55)
        ctx.lineTo(d.x + Math.cos(a) * r * (0.95 + (i % 3) * 0.12), d.y + Math.sin(a) * r * (0.95 + (i % 3) * 0.12))
      }
      ctx.stroke()
      continue
    }
    ctx.save()
    ctx.translate(d.x, d.y)
    ctx.rotate(d.rot)
    ctx.fillStyle = d.kind === 4 ? 'rgba(104,140,30,0.42)' : d.kind === 2 ? 'rgba(90,18,28,0.55)' : 'rgba(110,22,32,0.45)'
    ctx.beginPath()
    ctx.ellipse(0, 0, d.r, d.r * 0.65, 0, 0, Math.PI * 2)
    ctx.ellipse(d.r * 0.8, d.r * 0.2, d.r * 0.35, d.r * 0.25, 0, 0, Math.PI * 2)
    ctx.fill()
    if (d.kind === 4) {
      ctx.fillStyle = 'rgba(190,230,90,0.3)'
      ctx.beginPath()
      ctx.ellipse(-d.r * 0.2, -d.r * 0.1, d.r * 0.4, d.r * 0.22, 0, 0, Math.PI * 2)
      ctx.fill()
    }
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
    if (b.weapon === 'sniper') {
      // a long, hot tracer
      ctx.strokeStyle = 'rgba(255,214,140,0.3)'
      ctx.lineWidth = 9
      ctx.beginPath()
      ctx.moveTo(b.x - b.vx * 0.055, b.y - b.vy * 0.055)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      ctx.strokeStyle = '#FFF6DC'
      ctx.lineWidth = 2.4
      ctx.stroke()
      continue
    }
    if (b.weapon === 'wand') {
      // a spirit bolt: a pale core in a violet halo, with a short tail
      const pulse = Math.sin(g.time * 26 + b.x * 0.05) * 0.8
      ctx.strokeStyle = 'rgba(170,130,255,0.45)'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.moveTo(b.x - b.vx * 0.045, b.y - b.vy * 0.045)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      ctx.fillStyle = 'rgba(170,130,255,0.4)'
      ctx.beginPath()
      ctx.arc(b.x, b.y, 9 + pulse, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#F1EAFF'
      ctx.beginPath()
      ctx.arc(b.x, b.y, 3.8, 0, Math.PI * 2)
      ctx.fill()
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
    // only a punch is shown as a swipe; blasts and bites have effects of their own
    if (h.owner === 'zombie' || h.rect.w > 64) continue
    ctx.fillStyle = 'rgba(160,200,255,0.4)'
    ctx.beginPath()
    ctx.roundRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h, 8)
    ctx.fill()
  }
}

/** Particles in two passes: solid ones first (droplets, debris, casings, smoke), then the glowing ones (sparks, embers). */
function drawParticles(ctx: CanvasRenderingContext2D, g: Game) {
  const x0 = g.camera.x - 40
  const y0 = g.camera.y - 40
  const x1 = g.camera.x + VIEW_W + 40
  const y1 = g.camera.y + VIEW_H + 40
  let glowing = false
  for (const q of g.particles) {
    if (q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1) continue
    const k = Math.max(0, q.life / q.max)
    switch (q.kind) {
      case 'spark':
      case 'ember':
        glowing = true
        break
      case 'smoke':
        ctx.globalAlpha = 0.34 * k
        ctx.fillStyle = q.color
        ctx.beginPath()
        ctx.arc(q.x, q.y, q.size * (1 + (1 - k) * 1.6), 0, Math.PI * 2)
        ctx.fill()
        break
      case 'chunk':
      case 'shell': {
        const shell = q.kind === 'shell'
        const w = shell ? q.size * 1.7 : q.size
        const h = shell ? q.size * 0.8 : q.size * 0.72
        ctx.globalAlpha = Math.min(1, k * 2.4)
        ctx.save()
        ctx.translate(q.x, q.y)
        ctx.rotate(q.rot ?? 0)
        ctx.fillStyle = q.color
        ctx.fillRect(-w / 2, -h / 2, w, h)
        if (shell) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)'
          ctx.fillRect(-w / 2, -h / 2, w, h * 0.35)
        }
        ctx.restore()
        break
      }
      default:
        ctx.globalAlpha = k
        ctx.fillStyle = q.color
        ctx.beginPath()
        ctx.arc(q.x, q.y, q.size / 2 + 0.5, 0, Math.PI * 2)
        ctx.fill()
    }
  }
  ctx.globalAlpha = 1
  if (!glowing) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (const q of g.particles) {
    if (q.kind !== 'spark' && q.kind !== 'ember') continue
    if (q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1) continue
    const k = Math.max(0, q.life / q.max)
    if (q.kind === 'spark') {
      ctx.globalAlpha = Math.min(1, k * 1.6)
      ctx.strokeStyle = q.color
      ctx.lineWidth = q.size
      ctx.beginPath()
      ctx.moveTo(q.x, q.y)
      ctx.lineTo(q.x - q.vx * 0.035, q.y - q.vy * 0.035)
      ctx.stroke()
    } else {
      ctx.globalAlpha = k * 0.85
      ctx.fillStyle = q.color
      ctx.beginPath()
      ctx.arc(q.x, q.y, q.size * (0.55 + 0.45 * k), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

/** Floating numbers and call-outs. They pop in a little larger than they settle; heavy hits and headlines are bigger. */
function drawTexts(ctx: CanvasRenderingContext2D, g: Game) {
  ctx.textAlign = 'center'
  ctx.lineJoin = 'round'
  let font = ''
  for (const t of g.texts) {
    const big = t.big ?? 0
    const full = big === 2 ? 1.6 : big ? 1.1 : 0.9
    const age = full - t.life
    const pop = age < 0.12 ? 1 + (1 - Math.max(0, age) / 0.12) * 0.6 : 1
    const size = Math.round((big === 2 ? 22 : big ? 16 : 13) * pop)
    const want = `700 ${size}px ${DISPLAY}`
    if (want !== font) {
      font = want
      ctx.font = want
    }
    ctx.globalAlpha = Math.min(1, t.life * 2.5)
    ctx.lineWidth = big ? 4 : 3
    ctx.strokeStyle = 'rgba(0,0,0,0.78)'
    ctx.strokeText(t.text, t.x, t.y)
    ctx.fillStyle = t.color
    ctx.fillText(t.text, t.x, t.y)
  }
  ctx.globalAlpha = 1
}

// ---------- Lighting ----------

/** The darkness is painted on a small layer of its own, lights are cut out of it, and it is laid over the scene. */
const LIGHT_SCALE = 0.5
type Layer = { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D }
let lightLayer: Layer | null | undefined

function getLightLayer(): Layer | null {
  if (lightLayer !== undefined) return lightLayer
  lightLayer = null
  try {
    const w = Math.ceil(VIEW_W * LIGHT_SCALE)
    const h = Math.ceil(VIEW_H * LIGHT_SCALE)
    let canvas: HTMLCanvasElement | OffscreenCanvas | null = null
    if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(w, h)
    else if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
    }
    const c = canvas?.getContext('2d') as Layer['ctx'] | null | undefined
    if (canvas && c) lightLayer = { canvas, ctx: c }
  } catch {
    lightLayer = null
  }
  return lightLayer
}

/**
 * Night around the squad. Every light source pushes it back: the player's own lamp, teammates, pets, pickups,
 * burning zombies, fire and live rails, and above all the brief ones, such as muzzle flashes, explosions and spells,
 * which light up the horde for an instant. Then a red wash when you are hurt.
 */
function drawLighting(ctx: CanvasRenderingContext2D, g: Game) {
  const p = g.player
  const cam = g.camera
  const px = p.down ? VIEW_W / 2 : p.x - cam.x
  const py = p.down ? VIEW_H / 2 : p.y - cam.y
  const th = activeMap.chapter.theme
  const layer = getLightLayer()
  if (!layer) {
    // no second canvas here: the plain vignette the game always had
    const dark = ctx.createRadialGradient(px, py, 110, px, py, th.lightRadius)
    dark.addColorStop(0, `rgba(${th.dark},0)`)
    dark.addColorStop(1, `rgba(${th.dark},${th.darkAlpha})`)
    ctx.fillStyle = dark
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  } else {
    const c = layer.ctx
    c.setTransform(LIGHT_SCALE, 0, 0, LIGHT_SCALE, 0, 0)
    c.globalCompositeOperation = 'source-over'
    c.clearRect(0, 0, VIEW_W, VIEW_H)
    c.fillStyle = `rgba(${th.dark},${th.darkAlpha})`
    c.fillRect(0, 0, VIEW_W, VIEW_H)
    c.globalCompositeOperation = 'destination-out'
    const hole = (x: number, y: number, inner: number, outer: number, strength = 1) => {
      if (!(outer > 0) || x < -outer || y < -outer || x > VIEW_W + outer || y > VIEW_H + outer) return
      const grad = c.createRadialGradient(x, y, Math.min(inner, outer * 0.95), x, y, outer)
      grad.addColorStop(0, `rgba(0,0,0,${strength})`)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      c.fillStyle = grad
      c.fillRect(x - outer, y - outer, outer * 2, outer * 2)
    }
    hole(px, py, 110, th.lightRadius)
    for (const slot of g.slots) {
      if (slot.id === g.localId) continue
      hole(slot.player.x - cam.x, slot.player.y - cam.y, 40, 200, 0.85)
    }
    for (const pet of g.pets) hole(pet.x - cam.x, pet.y - cam.y, 10, pet.kind === 'golem' ? 150 : 100, 0.6)
    for (const k of g.pickups) hole(k.x - cam.x, k.y - cam.y, 4, 48, 0.4)
    for (const zone of g.zones) if (!zone.hostile && zone.look !== 'venom') hole(zone.x + zone.w / 2 - cam.x, zone.y + zone.h / 2 - cam.y, zone.w * 0.2, zone.w * 0.8, 0.5)
    let fires = 0
    for (const z of g.zombies) {
      if (!(z.burn && z.burn > 0) || fires++ > 14) continue
      hole(z.x - cam.x, z.y - cam.y, 8, 84, 0.5)
    }
    let flames = 0
    for (const b of g.bullets) {
      if (b.weapon !== 'flamer' || flames++ % 3 !== 0) continue
      hole(b.x - cam.x, b.y - cam.y, 6, 80, 0.4)
    }
    for (const h of activeMap.hazards) {
      if (h.kind === 'toxic') continue
      const x = h.x - cam.x
      const y = h.y - cam.y
      if (x > VIEW_W + 30 || y > VIEW_H + 30 || x + h.w < -30 || y + h.h < -30) continue
      c.fillStyle = 'rgba(0,0,0,0.38)'
      c.fillRect(x - 16, y - 16, h.w + 32, h.h + 32)
    }
    for (const l of g.lights) {
      const k = Math.max(0, l.life / l.max)
      hole(l.x - cam.x, l.y - cam.y, l.r * 0.12, l.r, Math.min(1, 0.25 + k))
    }
    ctx.drawImage(layer.canvas, 0, 0, VIEW_W, VIEW_H)
  }
  // the brief lights also tint what they touch
  if (g.lights.length > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (const l of g.lights) {
      const x = l.x - cam.x
      const y = l.y - cam.y
      if (x < -l.r || y < -l.r || x > VIEW_W + l.r || y > VIEW_H + l.r) continue
      const k = Math.max(0, l.life / l.max)
      const glow = ctx.createRadialGradient(x, y, 0, x, y, l.r)
      glow.addColorStop(0, `rgba(${l.color},${0.26 * k})`)
      glow.addColorStop(1, `rgba(${l.color},0)`)
      ctx.fillStyle = glow
      ctx.fillRect(x - l.r, y - l.r, l.r * 2, l.r * 2)
    }
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

/** Coins on their way to the counter, drawn over the darkness so they always shine. */
function drawCoinFx(ctx: CanvasRenderingContext2D, g: Game) {
  if (g.coinFx.length === 0) return
  const cam = g.camera
  ctx.save()
  for (const c of g.coinFx) {
    if (c.t < 0) continue
    const x = c.x - cam.x
    const y = c.y - cam.y
    // each coin turns on its edge as it flies
    const turn = Math.abs(Math.cos(c.t * 14 + c.x * 0.05))
    ctx.fillStyle = 'rgba(255,205,70,0.3)'
    ctx.beginPath()
    ctx.arc(x, y, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#B8891A'
    ctx.beginPath()
    ctx.ellipse(x, y + 1, 4.6 * Math.max(0.25, turn), 4.6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#FFD25A'
    ctx.beginPath()
    ctx.ellipse(x, y, 4.6 * Math.max(0.25, turn), 4.6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#FFF4C2'
    ctx.fillRect(x - 1, y - 3, 1.6, 3)
  }
  ctx.restore()
}

function drawCrosshair(ctx: CanvasRenderingContext2D, g: Game) {
  if (g.autoAim || g.status !== 'playing' || g.player.down) return
  const { x, y } = g.aimScreen
  if (g.shopOpen) {
    // the shop is open: a pointer instead of a gunsight
    ctx.fillStyle = '#FFFFFF'
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, y + 15)
    ctx.lineTo(x + 4, y + 11.5)
    ctx.lineTo(x + 7.5, y + 18)
    ctx.lineTo(x + 10, y + 16.8)
    ctx.lineTo(x + 6.6, y + 10.4)
    ctx.lineTo(x + 11.5, y + 10)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    return
  }
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
  for (const pet of g.pets) {
    const pr = bodyRect(pet)
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
