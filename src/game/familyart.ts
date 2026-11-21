import { ZOMBIES } from './config'
import type { Game } from './engine'
import type { Zombie } from './types'

/** The five newer zombie families, each with a silhouette you can read at a glance. */
export const FAMILY_KINDS = new Set(['spitter', 'bloater', 'exploder', 'shaman', 'lurker'])

function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2)
  ctx.fill()
}

function glowAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  if (r <= 0) return
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function claw(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, color: string) {
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

export function drawFamily(ctx: CanvasRenderingContext2D, z: Zombie, g: Game) {
  const t = g.time
  const p = g.nearestPlayer(z.x, z.y)
  const R = z.w / 2
  const white = z.flash > 0
  const stunned = z.state === 'stunned'
  const casting = z.state === 'windup' || z.state === 'strike'
  const face = casting ? Math.atan2(z.aim.y, z.aim.x) : Math.atan2(p.y - z.y, p.x - z.x)
  const base = ZOMBIES[z.kind].color
  const W = '#FFFFFF'
  const pulse = 0.5 + 0.5 * Math.sin(t * 8 + z.id)

  ctx.save()
  // a cloaked lurker is a ghost until it strikes
  if (z.cloak) ctx.globalAlpha = 0.22 + 0.1 * Math.sin(t * 9 + z.id)
  oval(ctx, z.x, z.y + R * 0.8, R * 1.05, R * 0.42, 'rgba(0,0,0,0.34)')
  ctx.translate(z.x + (stunned ? Math.sin(t * 60) * 2 : 0), z.y)
  ctx.rotate(face)

  switch (z.kind) {
    case 'spitter': {
      const sway = Math.sin(t * 7 + z.id)
      oval(ctx, sway * R * 0.4, -R * 0.55, R * 0.34, R * 0.2, white ? W : '#262626')
      oval(ctx, -sway * R * 0.4, R * 0.55, R * 0.34, R * 0.2, white ? W : '#262626')
      oval(ctx, -R * 0.1, 0, R * 0.75, R * 0.62, white ? W : '#5F7A2C')
      // back spines
      ctx.fillStyle = white ? W : '#3C5018'
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath()
        ctx.moveTo(-R * 0.5, i * R * 0.22)
        ctx.lineTo(-R * 1.0, i * R * 0.3)
        ctx.lineTo(-R * 0.45, i * R * 0.22 + 3)
        ctx.fill()
      }
      // the swollen throat sac, glowing as it fills
      const fill = casting ? 1 : 0.55 + 0.25 * pulse
      oval(ctx, R * 0.62, 0, R * (0.38 + 0.18 * fill), R * (0.34 + 0.18 * fill), white ? W : base)
      if (!white) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        glowAt(ctx, R * 0.62, 0, R * (0.9 + 0.5 * fill), `rgba(170,255,70,${0.35 + 0.35 * fill})`)
        ctx.restore()
      }
      // head, open mouth, eyes
      oval(ctx, R * 0.98, 0, R * 0.3, R * 0.32, white ? W : '#8FA66A')
      oval(ctx, R * 1.15, 0, R * 0.16, R * (casting ? 0.22 : 0.1), white ? W : '#1E1208')
      oval(ctx, R * 1.0, -R * 0.18, 2, 2, white ? W : '#FFEA5C')
      oval(ctx, R * 1.0, R * 0.18, 2, 2, white ? W : '#FFEA5C')
      break
    }
    case 'bloater': {
      const wob = Math.sin(t * 3 + z.id) * 0.04
      ctx.scale(1 + wob, 1 - wob)
      oval(ctx, 0, 0, R * 1.05, R * 1.0, white ? W : '#C8C768')
      oval(ctx, -R * 0.1, -R * 0.1, R * 0.78, R * 0.7, white ? W : 'rgba(255,255,170,0.35)')
      if (!white) {
        // pustules, each swelling at its own pace
        for (let i = 0; i < 7; i++) {
          const a = i * 0.9 + z.id
          const k = 0.7 + 0.3 * Math.sin(t * 2.4 + i * 1.7)
          const px = Math.cos(a) * R * 0.62
          const py = Math.sin(a) * R * 0.62
          oval(ctx, px, py, R * 0.2 * k, R * 0.2 * k, '#8E9A2E')
          oval(ctx, px - 1, py - 1, R * 0.08 * k, R * 0.08 * k, '#E8F08A')
        }
        // dripping green slime underneath
        ctx.fillStyle = 'rgba(120,200,40,0.7)'
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.5 + i * 0.33 + z.id * 0.1) % 1
          ctx.beginPath()
          ctx.arc(-R * 0.3 + i * R * 0.3, R * 0.9 + k * 7, 2.4 * (1 - k * 0.5), 0, Math.PI * 2)
          ctx.fill()
        }
      }
      oval(ctx, R * 0.92, 0, R * 0.3, R * 0.3, white ? W : '#A9B37C')
      oval(ctx, R * 1.05, -R * 0.11, 2.2, 2.2, white ? W : '#2A3A10')
      oval(ctx, R * 1.05, R * 0.11, 2.2, 2.2, white ? W : '#2A3A10')
      claw(ctx, R * 0.4, -R * 0.8, R * 0.95, -R * 0.55, R * 0.3, white ? W : '#A9B37C')
      claw(ctx, R * 0.4, R * 0.8, R * 0.95, R * 0.55, R * 0.3, white ? W : '#A9B37C')
      break
    }
    case 'exploder': {
      const run = Math.sin(t * 16 + z.id)
      oval(ctx, run * R * 0.5, -R * 0.5, R * 0.36, R * 0.2, white ? W : '#262626')
      oval(ctx, -run * R * 0.5, R * 0.5, R * 0.36, R * 0.2, white ? W : '#262626')
      oval(ctx, 0, 0, R * 0.72, R * 0.85, white ? W : '#8E2F20')
      // strapped charges
      if (!white) {
        for (let i = -1; i <= 1; i++) {
          ctx.fillStyle = '#C8A33C'
          ctx.fillRect(-R * 0.25, i * R * 0.42 - 3, R * 0.55, 6)
          ctx.fillStyle = '#E8DDB5'
          ctx.fillRect(-R * 0.25, i * R * 0.42 - 3, 3, 6)
        }
        ctx.strokeStyle = '#2A2118'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(-R * 0.5, -R * 0.85)
        ctx.lineTo(R * 0.5, R * 0.85)
        ctx.stroke()
      }
      oval(ctx, R * 0.8, 0, R * 0.34, R * 0.34, white ? W : '#B96B4C')
      oval(ctx, R * 0.95, -R * 0.12, 2, 2, white ? W : '#FFEFA0')
      oval(ctx, R * 0.95, R * 0.12, 2, 2, white ? W : '#FFEFA0')
      // blinking light and fuse: faster and brighter as it is about to blow
      const rate = z.state === 'windup' ? 26 : 7
      const on = Math.sin(t * rate + z.id) > 0
      if (!white) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        glowAt(ctx, 0, 0, R * (z.state === 'windup' ? 2.3 : 1.2), `rgba(255,${on ? 110 : 60},40,${z.state === 'windup' ? 0.7 : 0.28})`)
        glowAt(ctx, -R * 0.15, -R * 0.1, R * 0.45, on ? 'rgba(255,60,50,0.95)' : 'rgba(120,20,20,0.5)')
        ctx.restore()
      }
      break
    }
    case 'shaman': {
      const hover = Math.sin(t * 3 + z.id) * 1.6
      ctx.translate(0, hover)
      // flowing robe
      ctx.fillStyle = white ? W : '#4B3590'
      ctx.beginPath()
      ctx.moveTo(R * 0.55, 0)
      ctx.quadraticCurveTo(-R * 0.2, -R * 1.2, -R * 1.0, -R * 0.55)
      ctx.quadraticCurveTo(-R * 1.2, 0, -R * 1.0, R * 0.55)
      ctx.quadraticCurveTo(-R * 0.2, R * 1.2, R * 0.55, 0)
      ctx.fill()
      oval(ctx, R * 0.1, 0, R * 0.5, R * 0.62, white ? W : '#6B4FC0')
      // hood and glowing eyes
      oval(ctx, R * 0.62, 0, R * 0.34, R * 0.36, white ? W : '#2C1F5C')
      oval(ctx, R * 0.78, -R * 0.11, 2.2, 2.2, white ? W : '#F2D6FF')
      oval(ctx, R * 0.78, R * 0.11, 2.2, 2.2, white ? W : '#F2D6FF')
      // staff with an orb that flares when it casts
      claw(ctx, R * 0.25, R * 0.9, R * 1.15, R * 0.55, 3, white ? W : '#5C4630')
      if (!white) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        glowAt(ctx, R * 1.15, R * 0.55, R * (casting ? 1.6 : 0.7 + 0.2 * pulse), `rgba(190,140,255,${casting ? 0.9 : 0.55})`)
        glowAt(ctx, R * 1.15, R * 0.55, R * 0.25, 'rgba(255,255,255,0.95)')
        // runes orbiting its head
        for (let i = 0; i < 3; i++) {
          const a = t * 1.8 + i * 2.1
          glowAt(ctx, Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05, 4, 'rgba(210,170,255,0.8)')
        }
        ctx.restore()
      }
      break
    }
    case 'lurker': {
      const stride = Math.sin(t * 20 + z.id)
      oval(ctx, stride * R * 0.6, -R * 0.55, R * 0.4, R * 0.18, white ? W : '#14181F')
      oval(ctx, -stride * R * 0.6, R * 0.55, R * 0.4, R * 0.18, white ? W : '#14181F')
      oval(ctx, -R * 0.1, 0, R * 0.95, R * 0.5, white ? W : '#29313D')
      oval(ctx, R * 0.82, 0, R * 0.34, R * 0.3, white ? W : '#3A4452')
      // long blades for hands
      const lunge = casting ? 1 : 0
      for (const side of [-1, 1]) {
        claw(ctx, R * 0.4, side * R * 0.45, R * (1.35 + lunge * 0.7), side * R * (0.7 - lunge * 0.3), 3.4, white ? W : '#6B7684')
        claw(ctx, R * (1.35 + lunge * 0.7), side * R * (0.7 - lunge * 0.3), R * (1.65 + lunge * 0.8), side * R * (0.52 - lunge * 0.3), 2, white ? W : '#D3DBE6')
      }
      oval(ctx, R * 0.98, -R * 0.11, 2, 2, white ? W : '#BDF2FF')
      oval(ctx, R * 0.98, R * 0.11, 2, 2, white ? W : '#BDF2FF')
      if (!white) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        glowAt(ctx, R * 0.98, 0, R * 0.7, 'rgba(150,230,255,0.45)')
        ctx.restore()
      }
      break
    }
    default:
      break
  }
  ctx.restore()

  // health bar once damaged
  if (z.hp < z.maxHp && z.hp > 0) {
    const w = Math.max(20, z.w)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(z.x - w / 2, z.y - z.h / 2 - 9, w, 4)
    ctx.fillStyle = '#FF4B57'
    ctx.fillRect(z.x - w / 2, z.y - z.h / 2 - 9, w * (z.hp / z.maxHp), 4)
  }
}
