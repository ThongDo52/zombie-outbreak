import type { Game } from './engine'
import type { Bullet, Effect, Zombie } from './types'

/** Progress of an effect from 0 (just started) to 1 (finished), whatever its timers say. */
const progress = (f: Effect) => Math.min(1, Math.max(0, 1 - f.life / (f.max || 1)))
const nonNeg = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0)

/** Draw every visual effect in world space. */
export function drawEffects(ctx: CanvasRenderingContext2D, g: Game) {
  drawEffectList(ctx, g.effects)
}

export function drawEffectList(ctx: CanvasRenderingContext2D, effects: readonly Effect[]) {
  for (const f of effects) {
    if (f.kind === 'bite') drawBite(ctx, f)
    else if (f.kind === 'claw') drawClaw(ctx, f)
    else if (f.kind === 'ring') drawRing(ctx, f)
    else if (f.kind === 'bolt') drawBolt(ctx, f)
    else if (f.kind === 'arc') drawArc(ctx, f)
    else drawSlam(ctx, f)
  }
}

/** Two jaws snap shut, then blood sprays out of the bite. */
function drawBite(ctx: CanvasRenderingContext2D, f: Effect) {
  const k = progress(f)
  const snap = Math.min(1, k / 0.28)
  const eased = 1 - Math.pow(1 - snap, 3)
  const alpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45
  const w = f.size * 0.62
  const gap = f.size * 0.42 * (1 - eased) + f.size * 0.03
  const lipH = f.size * 0.22

  ctx.save()
  ctx.translate(f.x, f.y)
  ctx.rotate(f.angle)
  ctx.globalAlpha = Math.max(0, alpha)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // dark mouth behind the teeth
  ctx.fillStyle = 'rgba(40,4,10,0.7)'
  ctx.beginPath()
  ctx.moveTo(-w, -gap)
  ctx.quadraticCurveTo(0, -gap - lipH * 2, w, -gap)
  ctx.lineTo(w, gap)
  ctx.quadraticCurveTo(0, gap + lipH * 2, -w, gap)
  ctx.closePath()
  ctx.fill()

  for (const side of [-1, 1]) {
    // gums
    ctx.strokeStyle = '#8E1424'
    ctx.lineWidth = f.size * 0.11
    ctx.beginPath()
    ctx.moveTo(-w, side * gap)
    ctx.quadraticCurveTo(0, side * (gap + lipH * 2), w, side * gap)
    ctx.stroke()
    // teeth point toward the other jaw
    const n = 7
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const x = -w + t * w * 2
      const y = side * (gap + lipH * 2 * t * (1 - t))
      const len = f.size * (0.16 + 0.07 * Math.sin(i * 2.1 + (side > 0 ? 1 : 0)))
      const bw = f.size * 0.065
      ctx.fillStyle = '#F7F1E1'
      ctx.strokeStyle = 'rgba(60,20,20,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x - bw, y)
      ctx.lineTo(x + bw, y)
      ctx.lineTo(x, y - side * len)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  }

  if (snap >= 1) {
    const b = (k - 0.28) / 0.72
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = `rgba(255,120,110,${0.55 * (1 - b)})`
    ctx.beginPath()
    ctx.arc(0, 0, f.size * (0.25 + 0.55 * b), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = '#C21F33'
    ctx.lineWidth = 2.5
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3
      const r0 = f.size * (0.3 + 0.1 * b)
      const r1 = r0 + f.size * (0.2 + 0.25 * ((i * 7) % 5) / 5) * Math.min(1, b * 2.2)
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0)
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Three claw marks that rip across the player when hit. */
function drawClaw(ctx: CanvasRenderingContext2D, f: Effect) {
  const k = progress(f)
  const reveal = Math.min(1, k / 0.25)
  const alpha = k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5
  ctx.save()
  ctx.translate(f.x, f.y)
  ctx.rotate(f.angle)
  ctx.globalAlpha = Math.max(0, alpha)
  ctx.lineCap = 'round'
  for (let i = -1; i <= 1; i++) {
    const y0 = i * f.size * 0.2
    const x0 = -f.size * 0.7
    const x1 = x0 + f.size * 1.4 * reveal
    const y1 = y0 + f.size * 0.28 * reveal
    ctx.strokeStyle = 'rgba(190,20,40,0.85)'
    ctx.lineWidth = 6 * (1 - k * 0.5)
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,235,235,0.95)'
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }
  ctx.restore()
}

/** Expanding shockwave from a boss slam. */
function drawSlam(ctx: CanvasRenderingContext2D, f: Effect) {
  const k = progress(f)
  const r = f.size * (0.2 + 0.8 * (1 - Math.pow(1 - k, 3)))
  ctx.save()
  ctx.translate(f.x, f.y)
  ctx.globalCompositeOperation = 'lighter'
  const fill = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r)
  fill.addColorStop(0, 'rgba(255,140,100,0)')
  fill.addColorStop(1, `rgba(255,140,100,${0.45 * (1 - k)})`)
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.arc(0, 0, nonNeg(r), 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = `rgba(255,220,180,${0.9 * (1 - k)})`
  ctx.lineWidth = 8 * (1 - k) + 1
  ctx.beginPath()
  ctx.arc(0, 0, nonNeg(r), 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  r = nonNeg(r)
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(255,60,10,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

/** One puff of the flamethrower stream: white-hot core, orange body, red edge. Draw with additive blending. */
export function drawFlame(ctx: CanvasRenderingContext2D, b: Bullet, t: number) {
  const age = Math.min(1, Math.max(0, 1 - b.life / (b.maxLife || 1)))
  const x = b.x + Math.sin(t * 40 + b.x * 0.05) * 2.5 * age
  const y = b.y + Math.cos(t * 37 + b.y * 0.05) * 2.5 * age
  glow(ctx, x, y, 48 + age * 44, `rgba(255,120,40,${0.13 * (1 - age)})`)
  glow(ctx, x, y, 11 + age * 27, `rgba(255,70,20,${0.55 * (1 - age * 0.7)})`)
  glow(ctx, x, y, 7 + age * 18, `rgba(255,175,45,${0.8 * (1 - age * 0.8)})`)
  if (age < 0.6) glow(ctx, x, y, 3.5 + age * 10, `rgba(255,250,205,${0.95 * (1 - age / 0.6)})`)
}

/** Grey smoke where the flames burn out. Draw with normal blending, under the flames. */
export function drawFlameSmoke(ctx: CanvasRenderingContext2D, bullets: Bullet[]) {
  for (const b of bullets) {
    if (b.weapon !== 'flamer') continue
    const age = Math.min(1, Math.max(0, 1 - b.life / (b.maxLife || 1)))
    if (age < 0.45) continue
    const k = (age - 0.45) / 0.55
    ctx.fillStyle = `rgba(38,32,32,${0.2 * (1 - k * 0.4)})`
    ctx.beginPath()
    ctx.arc(b.x, b.y - k * 10, 9 + age * 18, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Fire licking over a zombie that was hit by the flamer. */
export function drawBurning(ctx: CanvasRenderingContext2D, z: Zombie, t: number) {
  const fade = Math.min(1, (z.burn ?? 0) / 0.5)
  const R = z.w / 2
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  glow(ctx, z.x, z.y - R * 0.2, R * 2.4, `rgba(255,120,40,${0.3 * fade})`)
  const n = z.kind === 'boss' ? 7 : z.kind === 'tank' ? 5 : 4
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + z.id
    const fx = z.x + Math.cos(a) * R * 0.55
    const fy = z.y + Math.sin(a) * R * 0.45 + R * 0.2
    const h = R * (0.9 + 0.5 * Math.sin(t * 15 + i * 2.3 + z.id)) * fade
    const w = R * 0.34
    const sway = Math.sin(t * 11 + i * 1.7) * R * 0.18
    const grad = ctx.createLinearGradient(0, fy, 0, fy - h)
    grad.addColorStop(0, `rgba(255,235,120,${0.9 * fade})`)
    grad.addColorStop(0.5, `rgba(255,120,30,${0.8 * fade})`)
    grad.addColorStop(1, 'rgba(200,30,20,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(fx - w, fy)
    ctx.quadraticCurveTo(fx - w * 0.9, fy - h * 0.55, fx + sway, fy - h)
    ctx.quadraticCurveTo(fx + w * 0.9, fy - h * 0.55, fx + w, fy)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/** Plume of fire at the nozzle while the flamethrower is firing. */
export function drawNozzleFlame(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, t: number) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  glow(ctx, x, y, 54, 'rgba(255,150,50,0.4)')
  ctx.translate(x, y)
  ctx.rotate(angle)
  const layers: [number, number, string][] = [
    [34, 9, 'rgba(255,70,20,0.65)'],
    [26, 6.5, 'rgba(255,165,40,0.85)'],
    [16, 4, 'rgba(255,250,200,0.95)'],
  ]
  layers.forEach(([len, w, color], i) => {
    const l = len * (0.85 + 0.3 * Math.sin(t * 50 + i * 1.9))
    const wob = Math.sin(t * 38 + i) * 2
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(0, -w)
    ctx.quadraticCurveTo(l * 0.55, -w * 1.3 + wob, l, wob)
    ctx.quadraticCurveTo(l * 0.55, w * 1.3 + wob, 0, w)
    ctx.closePath()
    ctx.fill()
  })
  ctx.restore()
}

/** A clean expanding ring in a skin color (gold coins, soul fire). */
function drawRing(ctx: CanvasRenderingContext2D, f: Effect) {
  const k = progress(f)
  const r = f.size * (0.15 + 0.85 * (1 - Math.pow(1 - k, 3)))
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = Math.max(0, 1 - k)
  ctx.strokeStyle = f.color ?? '#FFD25A'
  ctx.lineWidth = 5 * (1 - k) + 1
  ctx.beginPath()
  ctx.arc(f.x, f.y, nonNeg(r), 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** Jagged lightning forks radiating from a kill. */
function drawBolt(ctx: CanvasRenderingContext2D, f: Effect) {
  const k = progress(f)
  ctx.save()
  ctx.translate(f.x, f.y)
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = Math.max(0, 1 - k * 1.2)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const forks = 6
  for (let i = 0; i < forks; i++) {
    const base = (i / forks) * Math.PI * 2 + f.angle
    const len = f.size * (0.6 + 0.4 * (((i * 5) % 3) / 2)) * Math.min(1, k * 4 + 0.3)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    for (let s = 1; s <= 5; s++) {
      const d = (len * s) / 5
      const jitter = Math.sin(i * 7.3 + s * 3.1 + Math.floor(k * 14) * 1.7) * 9
      ctx.lineTo(Math.cos(base) * d - Math.sin(base) * jitter, Math.sin(base) * d + Math.cos(base) * jitter)
    }
    ctx.strokeStyle = 'rgba(110,220,255,0.9)'
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  ctx.restore()
}

/** A jagged lightning line from (x, y) in the effect's direction, `size` pixels long. */
function drawArc(ctx: CanvasRenderingContext2D, f: Effect) {
  const k = 1 - progress(f)
  const segs = Math.max(3, Math.round(f.size / 18))
  const seed = Math.floor(f.x * 7 + f.y * 13 + f.life * 600)
  ctx.save()
  ctx.translate(f.x, f.y)
  ctx.rotate(f.angle)
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const path = () => {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    for (let i = 1; i < segs; i++) {
      const j = Math.sin((seed + i) * 12.9898) * 43758.5453
      const off = (j - Math.floor(j) - 0.5) * 16
      ctx.lineTo((f.size * i) / segs, off)
    }
    ctx.lineTo(f.size, 0)
  }
  ctx.strokeStyle = f.color ?? '#9FF4FF'
  ctx.globalAlpha = 0.35 * k
  ctx.lineWidth = 9
  path()
  ctx.stroke()
  ctx.globalAlpha = k
  ctx.strokeStyle = '#EFFFFF'
  ctx.lineWidth = 2.2
  path()
  ctx.stroke()
  ctx.restore()
}

/** Venom clouds (yours) and poison puddles (the zombies') lying on the ground. */
export function drawZones(ctx: CanvasRenderingContext2D, g: Game) {
  for (const z of g.zones) {
    const cx = z.x + z.w / 2
    const cy = z.y + z.h / 2
    const fade = Math.min(1, z.life / 0.7)
    const r = Math.max(1, z.w * (0.55 + 0.03 * Math.sin(g.time * 3 + z.id)))
    if (z.hostile) {
      // a poison puddle: dark, sticky centre and a sickly yellow rim, so it reads as something to step around
      const grad = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r)
      grad.addColorStop(0, `rgba(48,70,18,${0.78 * fade})`)
      grad.addColorStop(0.75, `rgba(110,150,30,${0.55 * fade})`)
      grad.addColorStop(1, 'rgba(160,190,50,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.ellipse(cx, cy, r, r * 0.82, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = `rgba(214,236,80,${0.55 * fade})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, r * 0.88, r * 0.72, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = `rgba(226,246,110,${0.7 * fade})`
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + z.id
        const t = (g.time * 0.55 + i * 0.29) % 1
        ctx.beginPath()
        ctx.arc(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.38 - t * 18, 1.6 + (1 - t) * 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
      continue
    }
    const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r)
    grad.addColorStop(0, `rgba(150,255,60,${0.5 * fade})`)
    grad.addColorStop(0.7, `rgba(80,190,40,${0.32 * fade})`)
    grad.addColorStop(1, 'rgba(60,140,30,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = `rgba(200,255,120,${0.5 * fade})`
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + z.id
      const t = (g.time * 0.6 + i * 0.37) % 1
      ctx.beginPath()
      ctx.arc(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.4 - t * 24, 2 + (1 - t) * 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** Acid globs spat by Spitters: a bright head with a short trail. */
export function drawShots(ctx: CanvasRenderingContext2D, g: Game) {
  if (g.shots.length === 0) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const s of g.shots) {
    const sp = Math.hypot(s.vx, s.vy) || 1
    const tx = s.x - (s.vx / sp) * 22
    const ty = s.y - (s.vy / sp) * 22
    const trail = ctx.createLinearGradient(s.x, s.y, tx, ty)
    trail.addColorStop(0, 'rgba(190,255,70,0.65)')
    trail.addColorStop(1, 'rgba(190,255,70,0)')
    ctx.strokeStyle = trail
    ctx.lineWidth = Math.max(1, s.r * 1.1)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(tx, ty)
    ctx.stroke()
    glow(ctx, s.x, s.y, Math.max(2, s.r * 2.6), 'rgba(170,255,60,0.75)')
    glow(ctx, s.x, s.y, Math.max(1, s.r * 0.9), 'rgba(245,255,190,0.95)')
  }
  ctx.restore()
}

/** A shaman's ward on a zombie: a thin violet bubble. */
export function drawShield(ctx: CanvasRenderingContext2D, z: Zombie, t: number) {
  if (!z.shield || z.shield <= 0) return
  const r = Math.max(8, z.w * 0.78)
  ctx.save()
  ctx.fillStyle = 'rgba(170,130,255,0.12)'
  ctx.strokeStyle = `rgba(200,170,255,${0.55 + 0.2 * Math.sin(t * 7 + z.id)})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(z.x, z.y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

/** Poison, chill, ice and shock looks on a zombie. */
export function drawStatus(ctx: CanvasRenderingContext2D, z: Zombie, t: number) {
  const poison = z.poison && z.poison > 0 ? z.poisonStacks ?? 1 : 0
  const chill = z.chill ?? 0
  if (!poison && !chill && !z.frozen && !(z.shock && z.shock > 0)) return
  const r = z.w * 0.62
  ctx.save()
  if (poison) {
    ctx.strokeStyle = `rgba(155,255,59,${0.35 + 0.15 * poison})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(z.x, z.y, r + Math.sin(t * 6) * 1.5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(190,255,100,0.8)'
    for (let i = 0; i < poison + 1; i++) {
      const k = (t * 0.9 + i * 0.31 + z.id * 0.17) % 1
      ctx.beginPath()
      ctx.arc(z.x + Math.sin(i * 2.4 + z.id) * r * 0.7, z.y + r * 0.2 - k * z.h * 0.9, 1.6 + (1 - k) * 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  if (chill && !z.frozen) {
    ctx.fillStyle = `rgba(150,220,255,${0.12 * chill})`
    ctx.beginPath()
    ctx.arc(z.x, z.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(235,250,255,0.85)'
    for (let i = 0; i < chill * 2; i++) {
      const a = t * 0.8 + i * 1.9
      ctx.fillRect(z.x + Math.cos(a) * r * 0.9 - 1, z.y + Math.sin(a) * r * 0.9 - 1, 2.5, 2.5)
    }
  }
  if (z.frozen) {
    const s = z.w * 1.2
    ctx.fillStyle = 'rgba(180,230,255,0.55)'
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(z.x - s / 2, z.y - s / 2, s, s, 6)
    ctx.fill()
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(z.x - s * 0.3, z.y - s * 0.4)
    ctx.lineTo(z.x - s * 0.05, z.y + s * 0.05)
    ctx.lineTo(z.x + s * 0.28, z.y - s * 0.1)
    ctx.moveTo(z.x - s * 0.25, z.y + s * 0.38)
    ctx.lineTo(z.x + s * 0.1, z.y + s * 0.15)
    ctx.stroke()
  }
  if (z.shock && z.shock > 0) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = '#BFF3FF'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    for (let i = 0; i < 4; i++) {
      const a = t * 18 + i * 1.57
      ctx.moveTo(z.x + Math.cos(a) * r * 0.4, z.y + Math.sin(a) * r * 0.4)
      ctx.lineTo(z.x + Math.cos(a + 0.4) * r * 0.9, z.y + Math.sin(a + 0.4) * r * 0.9)
      ctx.lineTo(z.x + Math.cos(a - 0.2) * r * 1.3, z.y + Math.sin(a - 0.2) * r * 1.3)
    }
    ctx.stroke()
  }
  ctx.restore()
}
