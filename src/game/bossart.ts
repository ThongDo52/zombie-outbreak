import type { Game } from './engine'
import type { Zombie } from './types'
import { activeMap } from './world'

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

function limb(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, width: number, color: string) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

function spike(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, w: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, -w)
  ctx.lineTo(len, 0)
  ctx.lineTo(0, w)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export function drawBoss(ctx: CanvasRenderingContext2D, z: Zombie, g: Game) {
  const p = g.player
  const t = g.time
  const R = z.w / 2
  const white = z.flash > 0
  const stunned = z.state === 'stunned'
  const enraged = z.hp / z.maxHp < g.diff.enrageAt
  const windup = z.state === 'windup'
  const face = z.state === 'windup' || z.state === 'strike' ? Math.atan2(z.aim.y, z.aim.x) : Math.atan2(p.y - z.y, p.x - z.x)
  const W = '#FFFFFF'
  const look = activeMap.chapter.boss
  const flesh = white ? W : stunned ? '#9C8A8E' : enraged ? '#B5483C' : look.flesh
  const fleshDark = white ? W : 'rgba(25,8,14,0.45)'
  const bone = white ? W : '#D8CCB4'
  const iron = white ? W : '#4F5864'

  // menacing aura
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const aura = ctx.createRadialGradient(z.x, z.y, R * 0.5, z.x, z.y, R * 2.3)
  aura.addColorStop(0, enraged ? 'rgba(255,60,40,0.35)' : `rgba(${look.aura},0.3)`)
  aura.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = aura
  ctx.fillRect(z.x - R * 2.4, z.y - R * 2.4, R * 4.8, R * 4.8)
  ctx.restore()

  ellipse(ctx, z.x, z.y + R * 0.8, R * 1.2, R * 0.5, 'rgba(0,0,0,0.42)')

  ctx.save()
  ctx.translate(z.x + (stunned ? Math.sin(t * 60) * 2.5 : 0), z.y)
  ctx.rotate(face)
  const stomp = Math.sin(t * 3.5)
  ellipse(ctx, stomp * R * 0.35, -R * 0.55, R * 0.42, R * 0.26, white ? W : '#1F1A1D')
  ellipse(ctx, -stomp * R * 0.35, R * 0.55, R * 0.42, R * 0.26, white ? W : '#1F1A1D')

  // huge arms: raised and pulled back for the slam / charge windup
  const raise = windup ? 0.5 : 0
  const slamming = z.state === 'strike' && z.ability === 'slam'
  for (const side of [-1, 1]) {
    const shoulderY = side * R * 0.95
    const fistX = R * (windup && z.ability === 'charge' ? 0.5 : slamming ? 1.9 : 1.45 + raise * 0.4)
    const fistY = side * R * (windup ? 1.15 : 0.85)
    limb(ctx, 0, shoulderY, fistX * 0.55, side * R * 1.05, R * 0.78, flesh)
    limb(ctx, fistX * 0.55, side * R * 1.05, fistX, fistY, R * 0.6, flesh)
    ellipse(ctx, fistX, fistY, R * 0.42, R * 0.42, white ? W : '#6F4A55')
    if (!white) for (let i = -1; i <= 1; i++) spike(ctx, fistX + R * 0.3, fistY + i * R * 0.22, i * 0.4, R * 0.28, R * 0.08, bone)
    if (!white) {
      ctx.strokeStyle = '#8A949F'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(fistX * 0.4, side * R * 1.0)
      ctx.lineTo(fistX * 0.7, side * R * 0.7)
      ctx.stroke()
    }
  }

  // torso with exposed ribs and glowing cracks
  ellipse(ctx, 0, 0, R * 0.85, R * 1.18, flesh)
  if (!white) {
    ctx.fillStyle = fleshDark
    ctx.beginPath()
    ctx.ellipse(-R * 0.3, 0, R * 0.5, R * 0.95, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = bone
    ctx.lineWidth = 2.5
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath()
      ctx.arc(R * 0.1, i * R * 0.3, R * 0.5, -1.2, 1.2)
      ctx.stroke()
    }
    // spine
    ctx.fillStyle = bone
    for (let i = -3; i <= 3; i++) ellipse(ctx, -R * 0.62, i * R * 0.26, R * 0.12, R * 0.09, bone)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = enraged ? 'rgba(255,90,40,0.9)' : 'rgba(255,150,60,0.7)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(R * 0.3, -R * 0.7)
    ctx.lineTo(R * 0.1, -R * 0.2)
    ctx.lineTo(R * 0.4, R * 0.1)
    ctx.lineTo(R * 0.2, R * 0.65)
    ctx.stroke()
    ctx.restore()
    // chain across the chest
    ctx.strokeStyle = '#8A949F'
    ctx.setLineDash([5, 4])
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(R * 0.1, -R * 1.0)
    ctx.lineTo(-R * 0.1, R * 1.0)
    ctx.stroke()
    ctx.setLineDash([])
  }
  // spiked pauldrons
  for (const side of [-1, 1]) {
    ellipse(ctx, -R * 0.05, side * R * 1.12, R * 0.55, R * 0.36, iron)
    if (!white) for (let i = 0; i < 3; i++) spike(ctx, R * (0.15 - i * 0.25), side * R * 1.38, side * 1.57, R * 0.38, R * 0.1, '#C9CFD6')
  }

  // skull head with horns, crown and tusks
  const hr = R * 0.46
  const hx = R * 0.42
  ellipse(ctx, hx, 0, hr, hr * 0.95, bone)
  if (!white) {
    for (const side of [-1, 1]) {
      spike(ctx, hx - hr * 0.1, side * hr * 0.8, side * 1.9, R * 0.5, R * 0.12, '#9B8E78')
    }
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.55 + i * 0.22)
      spike(ctx, hx + Math.cos(a) * hr * 0.9, Math.sin(a) * hr * 0.9, a, R * 0.3, R * 0.07, '#E5B93C')
    }
    ctx.fillStyle = '#1A0A0E'
    ctx.fillRect(hx + hr * 0.3, -hr * 0.6, hr * 0.5, hr * 0.42)
    ctx.fillRect(hx + hr * 0.3, hr * 0.18, hr * 0.5, hr * 0.42)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const eye = ctx.createRadialGradient(hx + hr * 0.6, 0, 0, hx + hr * 0.6, 0, R * 1.2)
    eye.addColorStop(0, enraged ? 'rgba(255,60,40,0.7)' : 'rgba(255,200,60,0.6)')
    eye.addColorStop(1, 'rgba(255,100,40,0)')
    ctx.fillStyle = eye
    ctx.fillRect(hx - R, -R * 1.3, R * 2.6, R * 2.6)
    ctx.restore()
    ctx.fillStyle = enraged ? '#FF3B2E' : '#FFD25A'
    ctx.fillRect(hx + hr * 0.45, -hr * 0.5, hr * 0.3, hr * 0.22)
    ctx.fillRect(hx + hr * 0.45, hr * 0.28, hr * 0.3, hr * 0.22)
    ctx.fillStyle = '#2A070D'
    ctx.fillRect(hx + hr * 0.7, -hr * 0.3 * (windup ? 1.6 : 1), hr * 0.4, hr * 0.6 * (windup ? 1.6 : 1))
    ctx.fillStyle = '#F7F1E1'
    for (const side of [-1, 1]) spike(ctx, hx + hr * 0.8, side * hr * 0.42, 0, hr * 0.5, hr * 0.1, '#F7F1E1')
  }
  ctx.restore()

  if (stunned) {
    for (let i = 0; i < 4; i++) {
      const a = t * 6 + (i * Math.PI) / 2
      ctx.fillStyle = '#FFE16A'
      ctx.fillRect(z.x + Math.cos(a) * 20 - 3, z.y - R - 12 + Math.sin(a) * 5 - 3, 6, 6)
    }
  }
}
