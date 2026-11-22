import type { Game } from './engine'
import { PETS } from './pets'
import type { Pet } from './types'

/** A Summoner's pets: the spirit wolf, half light and half animal, and the stone guardian held together by runes. */

const SLOT_COLORS = ['#7FD0FF', '#FFD25A', '#6EE7A8', '#FF8AF0']
const ownerColor = (id: number) => SLOT_COLORS[(id - 1 + 4) % 4]

function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2)
  ctx.fill()
}

function glowAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  if (!(r > 0)) return
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function leg(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, color: string) {
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

function drawWolf(ctx: CanvasRenderingContext2D, pet: Pet, t: number) {
  const R = pet.w / 2
  const white = pet.flash > 0
  const running = pet.state === 'chase' || pet.state === 'follow'
  const stride = running ? Math.sin(t * 22 + pet.id) : 0
  const lunge = pet.state === 'windup' ? 5 : pet.state === 'recover' ? 2 : 0
  const body = white ? '#FFFFFF' : '#8E7AE6'
  const pale = white ? '#FFFFFF' : '#E6DEFF'
  const dark = white ? '#FFFFFF' : '#4A3A9A'

  oval(ctx, pet.x, pet.y + R * 0.75, R * 1.3, R * 0.42, 'rgba(0,0,0,0.26)')
  ctx.save()
  ctx.translate(pet.x, pet.y)
  ctx.rotate(Math.atan2(pet.aim.y, pet.aim.x))
  ctx.translate(lunge, 0)
  // the glow that makes it a spirit
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  glowAt(ctx, 0, 0, R * 2.3, `rgba(150,120,255,${0.3 + 0.08 * Math.sin(t * 6 + pet.id)})`)
  ctx.restore()
  // legs, front and back pairs out of step
  for (const side of [-1, 1]) {
    leg(ctx, R * 0.6, side * R * 0.35, R * 0.95 + stride * side * 3, side * R * 0.85, 2.6, dark)
    leg(ctx, -R * 0.7, side * R * 0.35, -R * 1.0 - stride * side * 3, side * R * 0.85, 2.6, dark)
  }
  // tail: a wisp that trails and wags
  ctx.strokeStyle = pale
  ctx.lineWidth = 3.4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-R * 1.05, 0)
  ctx.quadraticCurveTo(-R * 1.6, Math.sin(t * 9 + pet.id) * 4, -R * 2.0, Math.sin(t * 9 + pet.id + 1) * 6)
  ctx.stroke()
  // body, shoulders, head
  oval(ctx, -R * 0.1, 0, R * 1.15, R * 0.55, body)
  oval(ctx, R * 0.35, 0, R * 0.62, R * 0.6, pale)
  if (!white) {
    ctx.fillStyle = 'rgba(74,58,154,0.5)'
    ctx.beginPath()
    ctx.ellipse(-R * 0.35, 0, R * 0.7, R * 0.22, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // ears
  ctx.fillStyle = dark
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(R * 0.72, side * R * 0.32)
    ctx.lineTo(R * 0.55, side * R * 0.78)
    ctx.lineTo(R * 0.98, side * R * 0.45)
    ctx.closePath()
    ctx.fill()
  }
  oval(ctx, R * 0.98, 0, R * 0.46, R * 0.4, pale)
  // snout, open when it bites
  oval(ctx, R * 1.42, 0, R * 0.3, R * (pet.state === 'windup' ? 0.3 : 0.2), white ? '#FFFFFF' : '#C9BEFF')
  oval(ctx, R * 1.66, 0, 1.6, 1.6, dark)
  if (!white) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    glowAt(ctx, R * 1.05, -R * 0.2, 4.5, 'rgba(160,240,255,0.95)')
    glowAt(ctx, R * 1.05, R * 0.2, 4.5, 'rgba(160,240,255,0.95)')
    ctx.restore()
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(R * 1.0, -R * 0.26, 1.6, 1.6)
    ctx.fillRect(R * 1.0, R * 0.14, 1.6, 1.6)
  }
  ctx.restore()
}

function drawGolem(ctx: CanvasRenderingContext2D, pet: Pet, t: number) {
  const R = pet.w / 2
  const white = pet.flash > 0
  const def = PETS.golem
  const raise = pet.state === 'windup' ? Math.min(1, pet.stateTime / def.windup) : 0
  const slam = pet.state === 'recover' ? Math.max(0, 1 - pet.stateTime / 0.3) : 0
  const stone = white ? '#FFFFFF' : '#6F7C8C'
  const stoneDark = white ? '#FFFFFF' : '#3F4955'
  const stoneLight = white ? '#FFFFFF' : '#A3B0C0'
  const left = Math.max(0, pet.life ?? 0)
  const fading = left < 3 ? 0.55 + 0.45 * Math.sin(t * 16) : 1

  // the ground it holds: zombies inside this ring turn on it
  ctx.save()
  ctx.strokeStyle = 'rgba(185,140,255,0.22)'
  ctx.lineWidth = 2
  ctx.setLineDash([10, 12])
  ctx.lineDashOffset = -t * 14
  ctx.beginPath()
  ctx.arc(pet.x, pet.y, def.taunt * 0.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  // how long it has left
  ctx.strokeStyle = `rgba(200,182,255,${0.85 * fading})`
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(pet.x, pet.y, R + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, left / def.life))
  ctx.stroke()
  ctx.restore()

  oval(ctx, pet.x, pet.y + R * 0.8, R * 1.2, R * 0.46, 'rgba(0,0,0,0.4)')
  ctx.save()
  ctx.globalAlpha = fading
  ctx.translate(pet.x, pet.y)
  ctx.rotate(Math.atan2(pet.aim.y, pet.aim.x))
  // the fists: raised before a slam, driven down after
  for (const side of [-1, 1]) {
    const fx = R * (0.55 + raise * 0.45 - slam * 0.1)
    const fy = side * R * (1.0 - raise * 0.15 + slam * 0.2)
    const fr = R * (0.48 + raise * 0.14)
    oval(ctx, fx, fy, fr, fr * 0.92, stoneDark)
    oval(ctx, fx - 1.5, fy - 1.5, fr * 0.82, fr * 0.76, stone)
    if (!white) {
      ctx.strokeStyle = 'rgba(30,36,44,0.7)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(fx - fr * 0.4, fy - fr * 0.2)
      ctx.lineTo(fx + fr * 0.3, fy + fr * 0.1)
      ctx.stroke()
    }
  }
  // the body: a slab of fitted stones
  ctx.fillStyle = stoneDark
  ctx.beginPath()
  ctx.roundRect(-R * 0.82, -R * 0.82, R * 1.5, R * 1.64, R * 0.36)
  ctx.fill()
  ctx.fillStyle = stone
  ctx.beginPath()
  ctx.roundRect(-R * 0.76, -R * 0.76, R * 1.34, R * 1.46, R * 0.3)
  ctx.fill()
  if (!white) {
    ctx.fillStyle = stoneLight
    ctx.beginPath()
    ctx.roundRect(-R * 0.62, -R * 0.66, R * 0.5, R * 0.5, 4)
    ctx.roundRect(-R * 0.05, R * 0.1, R * 0.52, R * 0.46, 4)
    ctx.fill()
    ctx.strokeStyle = 'rgba(30,36,44,0.75)'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(-R * 0.7, -R * 0.05)
    ctx.lineTo(-R * 0.15, R * 0.02)
    ctx.lineTo(R * 0.05, -R * 0.5)
    ctx.moveTo(-R * 0.15, R * 0.02)
    ctx.lineTo(-R * 0.3, R * 0.68)
    ctx.stroke()
    // runes in the cracks: the magic that holds it together
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const beat = 0.6 + 0.4 * Math.sin(t * 4 + pet.id)
    ctx.strokeStyle = `rgba(200,160,255,${0.85 * beat})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-R * 0.7, -R * 0.05)
    ctx.lineTo(-R * 0.15, R * 0.02)
    ctx.lineTo(R * 0.05, -R * 0.5)
    ctx.stroke()
    glowAt(ctx, -R * 0.15, R * 0.02, R * (0.5 + raise * 0.5), `rgba(185,140,255,${0.5 * beat + raise * 0.4})`)
    ctx.restore()
  }
  // a small head set low between the shoulders
  oval(ctx, R * 0.52, 0, R * 0.36, R * 0.4, stoneDark)
  oval(ctx, R * 0.5, 0, R * 0.3, R * 0.33, stoneLight)
  if (!white) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    glowAt(ctx, R * 0.66, -R * 0.13, 5, 'rgba(215,180,255,0.95)')
    glowAt(ctx, R * 0.66, R * 0.13, 5, 'rgba(215,180,255,0.95)')
    ctx.restore()
  }
  ctx.restore()
}

export function drawPet(ctx: CanvasRenderingContext2D, pet: Pet, g: Game) {
  if (pet.kind === 'wolf') drawWolf(ctx, pet, g.time)
  else drawGolem(ctx, pet, g.time)
  // whose it is, and how hurt
  const R = pet.w / 2
  const w = Math.max(22, pet.w)
  const y = pet.y - R - (pet.kind === 'golem' ? 20 : 11)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(pet.x - w / 2, y, w, 3.5)
  ctx.fillStyle = ownerColor(pet.owner)
  ctx.fillRect(pet.x - w / 2, y, w * Math.max(0, Math.min(1, pet.hp / pet.maxHp)), 3.5)
}
