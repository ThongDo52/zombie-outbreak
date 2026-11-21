import { drawBoss } from './bossart'
import { drawFamily, FAMILY_KINDS } from './familyart'
import type { Game } from './engine'
import type { Zombie } from './types'

/** Faded clothes so a horde does not look like clones. */
const SHIRTS = ['#5B6F96', '#8A6246', '#6D8057', '#9A9486']
const SKINS = ['#9DB98A', '#A9BE94', '#93AE86']

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

export function drawZombie(ctx: CanvasRenderingContext2D, z: Zombie, g: Game) {
  if (z.kind === 'boss') {
    drawBoss(ctx, z, g)
    return
  }
  if (FAMILY_KINDS.has(z.kind)) {
    drawFamily(ctx, z, g)
    return
  }
  const p = g.player
  const t = g.time
  const R = z.w / 2
  const white = z.flash > 0
  const stunned = z.state === 'stunned'
  const attacking = z.state === 'windup' || z.state === 'strike'
  const face = attacking ? Math.atan2(z.aim.y, z.aim.x) : Math.atan2(p.y - z.y, p.x - z.x)
  const tank = z.kind === 'tank'
  const runner = z.kind === 'runner'

  const W = '#FFFFFF'
  const skin = white ? W : stunned ? '#B3BFAA' : tank ? '#7E9E78' : SKINS[z.id % 3]
  const skinDark = white ? W : '#5E7A57'
  const shirt = white ? W : tank ? '#4D4944' : runner ? '#3B4150' : SHIRTS[z.id % 4]
  const shirtDark = white ? W : 'rgba(10,14,20,0.38)'

  ellipse(ctx, z.x, z.y + R * 0.75, R * 1.05, R * 0.45, 'rgba(0,0,0,0.38)')

  ctx.save()
  ctx.translate(z.x + (stunned ? Math.sin(t * 60) * 2 : 0), z.y)
  ctx.rotate(face)
  const gait = runner ? 13 : tank ? 4 : 6.5
  const sway = Math.sin(t * gait + z.id)
  const lunge = z.state === 'windup' ? 0.35 : z.state === 'strike' ? 0.9 : 0

  // shuffling feet
  ellipse(ctx, sway * R * 0.45, -R * 0.5, R * 0.38, R * 0.22, white ? W : '#262626')
  ellipse(ctx, -sway * R * 0.45, R * 0.5, R * 0.38, R * 0.22, white ? W : '#262626')

  // arms stretched out in front: sleeve, bare forearm, clawed hand
  for (const side of [-1, 1]) {
    const phase = Math.sin(t * gait * 0.9 + z.id + (side > 0 ? Math.PI : 0)) * R * 0.18
    const sy = side * R * 0.82
    const elbowX = R * 0.55 + phase * 0.5
    const handX = R * (1.25 + lunge) + phase
    const handY = side * R * (0.62 - lunge * 0.25)
    limb(ctx, 0, sy, elbowX, side * R * 0.78, R * 0.52, shirt)
    limb(ctx, elbowX, side * R * 0.78, handX, handY, R * 0.38, skin)
    if (!white) {
      limb(ctx, elbowX + 2, side * R * 0.78, elbowX + R * 0.3, side * R * 0.74, R * 0.2, skinDark)
      ctx.strokeStyle = '#D9E6C8'
      ctx.lineWidth = 1.4
      for (let c = -1; c <= 1; c++) {
        ctx.beginPath()
        ctx.moveTo(handX, handY)
        ctx.lineTo(handX + R * 0.38, handY + c * R * 0.2)
        ctx.stroke()
      }
    }
    ellipse(ctx, handX, handY, R * 0.24, R * 0.24, skin)
  }

  // torso: torn shirt, belt, ragged hem on the back
  ellipse(ctx, 0, 0, R * 0.72, R * 1.08, shirt)
  if (!white) {
    ctx.fillStyle = shirtDark
    ctx.beginPath()
    ctx.ellipse(-R * 0.28, 0, R * 0.42, R * 0.85, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.moveTo(-R * 0.72, -R * 0.35)
    ctx.lineTo(-R * 0.4, -R * 0.15)
    ctx.lineTo(-R * 0.62, R * 0.05)
    ctx.lineTo(-R * 0.4, R * 0.2)
    ctx.lineTo(-R * 0.72, R * 0.4)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(122,18,30,0.8)'
    ctx.beginPath()
    ctx.arc(R * 0.05, ((z.id % 3) - 1) * R * 0.4, R * 0.22, 0, Math.PI * 2)
    ctx.arc(R * 0.3, ((z.id % 2) - 0.5) * R * 0.8, R * 0.13, 0, Math.PI * 2)
    ctx.fill()
  }
  if (tank) {
    ctx.fillStyle = white ? W : '#5B646E'
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(-R * 0.05, side * R * 0.92, R * 0.42, R * 0.3, 0, 0, Math.PI * 2)
      ctx.fill()
      if (!white) {
        ctx.fillStyle = '#C9CFD6'
        ctx.beginPath()
        ctx.moveTo(-R * 0.05, side * R * 1.18)
        ctx.lineTo(R * 0.12, side * R * 0.9)
        ctx.lineTo(-R * 0.22, side * R * 0.9)
        ctx.fill()
        ctx.fillStyle = '#5B646E'
      }
    }
  }

  // head with a lolling bob
  const hr = R * (tank ? 0.44 : 0.52)
  const hx = R * 0.28 + Math.sin(t * gait * 0.5 + z.id) * 1.2
  ellipse(ctx, hx - hr * 0.1, 0, hr * 0.28, hr * 1.08, skinDark) // ears
  ellipse(ctx, hx, 0, hr, hr * 0.95, skin)
  if (!white) {
    // messy hair on the back of the skull, or a hood for runners
    ctx.fillStyle = runner ? '#272C38' : z.id % 3 === 0 ? 'rgba(0,0,0,0)' : z.id % 3 === 1 ? '#2B2018' : '#6B5A3C'
    ctx.beginPath()
    ctx.arc(hx, 0, hr * (runner ? 1.08 : 1.02), Math.PI * (runner ? 0.35 : 0.5), Math.PI * (runner ? 1.65 : 1.5))
    ctx.fill()
    // sunken eyes with a red glow
    ctx.fillStyle = '#1A0B0E'
    ctx.fillRect(hx + hr * 0.38, -hr * 0.62, hr * 0.38, hr * 0.4)
    ctx.fillRect(hx + hr * 0.38, hr * 0.22, hr * 0.38, hr * 0.4)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const eye = ctx.createRadialGradient(hx + hr * 0.6, 0, 0, hx + hr * 0.6, 0, R * 1.1)
    eye.addColorStop(0, 'rgba(255,50,60,0.45)')
    eye.addColorStop(1, 'rgba(255,50,60,0)')
    ctx.fillStyle = eye
    ctx.fillRect(hx - R, -R * 1.2, R * 2.4, R * 2.4)
    ctx.restore()
    ctx.fillStyle = '#FF3B4A'
    ctx.fillRect(hx + hr * 0.5, -hr * 0.5, hr * 0.2, hr * 0.2)
    ctx.fillRect(hx + hr * 0.5, hr * 0.32, hr * 0.2, hr * 0.2)
    // open jaw with teeth and blood
    const open = attacking ? 1.5 : 1
    ctx.fillStyle = '#3A0A12'
    ctx.fillRect(hx + hr * 0.62, -hr * 0.3 * open, hr * 0.34, hr * 0.6 * open)
    ctx.fillStyle = '#F2EEDD'
    ctx.fillRect(hx + hr * 0.62, -hr * 0.3 * open, hr * 0.12, hr * 0.14)
    ctx.fillRect(hx + hr * 0.62, hr * 0.16 * open, hr * 0.12, hr * 0.14)
    ctx.fillStyle = '#B3202E'
    ctx.fillRect(hx + hr * 0.9, -hr * 0.1, hr * 0.2, hr * 0.5 * open)
  }
  ctx.restore()

  if (stunned) {
    for (let i = 0; i < 3; i++) {
      const a = t * 6 + (i * Math.PI * 2) / 3
      ctx.fillStyle = '#FFE16A'
      ctx.fillRect(z.x + Math.cos(a) * 10 - 2, z.y - R - 8 + Math.sin(a) * 3 - 2, 4, 4)
    }
  }
  if (z.hp < z.maxHp) {
    const w = Math.max(26, z.w)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.beginPath()
    ctx.roundRect(z.x - w / 2, z.y - R - 15, w, 5, 2.5)
    ctx.fill()
    ctx.fillStyle = '#FF4B57'
    ctx.beginPath()
    ctx.roundRect(z.x - w / 2, z.y - R - 15, Math.max(3, w * (z.hp / z.maxHp)), 5, 2.5)
    ctx.fill()
  }
}
