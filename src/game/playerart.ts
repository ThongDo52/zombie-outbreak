import { CLASSES, type ClassId } from './classes'
import { drawGun, type GunPalette } from './gunart'
import { hueColor, type CharacterLook } from './skins'
import type { WeaponId } from './types'

export interface CharacterPose {
  moving: boolean
  stunned: boolean
  dashing: boolean
  punching: boolean
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  r = Math.max(0, Number.isFinite(r) ? r : 0)
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * Draws the survivor, top-down, facing `angle`. Used in the arena and in the shop previews,
 * so skins look exactly the same in both places.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  t: number,
  look: CharacterLook,
  weapon: WeaponId,
  gun: GunPalette | undefined,
  pose: CharacterPose,
  /** The class whose gear is worn over the skin (in the arena). Shop previews leave it out. */
  gear?: ClassId,
) {
  ellipse(ctx, x, y + 11, 14, 6, 'rgba(0,0,0,0.38)')
  const aura = look.aura === 'rainbow' ? hueColor(t, 0, 0.4) : look.aura
  if (aura) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    glow(ctx, x, y, 34 + Math.sin(t * 4) * 3, aura)
    ctx.restore()
  }
  const step = pose.moving ? Math.sin(t * 14) * 5 : 0
  const jacket = pose.stunned ? '#8793AD' : pose.dashing ? '#6C97E8' : look.jacket
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  drawBackFx(ctx, look, t)
  if (gear) drawGearBack(ctx, gear, t, pose)
  if (pose.dashing) {
    ctx.fillStyle = 'rgba(127,176,255,0.25)'
    for (let i = 1; i <= 3; i++) ctx.fillRect(-i * 12 - 8, -10, 14, 20)
  }
  ellipse(ctx, step, -6, 5, 3.5, '#10151F')
  ellipse(ctx, -step, 6, 5, 3.5, '#10151F')

  // arms
  ctx.fillStyle = jacket
  if (weapon === 'fists') {
    const punch = pose.punching ? 10 : 2
    ctx.fillRect(0, -10, 8 + punch, 5)
    ctx.fillRect(0, 5, 8, 5)
    ctx.fillStyle = look.skin
    ctx.beginPath()
    ctx.arc(10 + punch, -7.5, 4, 0, Math.PI * 2)
    ctx.arc(9, 7.5, 4, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillRect(2, -9, 12, 5)
    ctx.fillRect(2, 4, 12, 5)
  }

  // torso
  ellipse(ctx, 0, 0, 9, 13.5, jacket)
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(-4, -12, 3, 24)
  if (look.extra === 'neon') {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = look.accent
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(0, 0, 9, 13.5, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
  if (look.extra === 'crown') {
    ctx.fillStyle = look.accent
    ctx.fillRect(-6, -11, 3, 22)
    ctx.fillRect(1, -11, 2, 22)
  }

  if (gear) drawGearFront(ctx, gear, t)

  if (weapon !== 'fists') {
    ctx.save()
    ctx.translate(9, 0)
    if (Math.cos(angle) < 0) ctx.scale(1, -1)
    drawGun(ctx, weapon, gun)
    ctx.restore()
  }

  // head
  ellipse(ctx, 1, 0, 7.5, 7.5, look.skin)
  ctx.fillStyle = look.hair
  ctx.beginPath()
  ctx.arc(1, 0, 7.8, Math.PI * 0.45, Math.PI * 1.55)
  ctx.fill()
  drawHeadExtras(ctx, look, t)
  drawFrontFx(ctx, look, t, angle)
  ctx.restore()
}

/**
 * Class gear worn behind the body, so each role can be told apart at a glance whatever skin is on:
 * the Runner's scarf, the Medic's pack, the Sniper's cape, the Warlock's robe. Drawn in the rotated frame (+x is forward).
 */
function drawGearBack(ctx: CanvasRenderingContext2D, gear: ClassId, t: number, pose: CharacterPose) {
  const color = CLASSES[gear].color
  switch (gear) {
    case 'agile': {
      // a scarf that streams out behind and whips about on the move
      const wave = Math.sin(t * (pose.moving ? 16 : 5)) * (pose.moving ? 5 : 2)
      const len = pose.moving || pose.dashing ? 21 : 14
      ctx.strokeStyle = color
      ctx.lineCap = 'round'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(-3, -3)
      ctx.quadraticCurveTo(-len * 0.5, -3 + wave, -len, -1 - wave)
      ctx.stroke()
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(-3, 2)
      ctx.quadraticCurveTo(-len * 0.45, 3 - wave, -len * 0.8, 4 + wave)
      ctx.stroke()
      break
    }
    case 'support': {
      // field pack with a cross
      ctx.fillStyle = '#E9EEF5'
      ctx.beginPath()
      ctx.roundRect(-15, -7, 9, 14, 2.5)
      ctx.fill()
      ctx.fillStyle = '#C8D2E0'
      ctx.fillRect(-15, 4, 9, 3)
      ctx.fillStyle = '#E5484D'
      ctx.fillRect(-11.6, -4.2, 2.2, 8.4)
      ctx.fillRect(-14.7, -1.1, 8.4, 2.2)
      break
    }
    case 'sniper': {
      // a ragged camouflage cape
      const sway = Math.sin(t * (pose.moving ? 9 : 3)) * 1.5
      ctx.fillStyle = '#4E5A34'
      ctx.beginPath()
      ctx.moveTo(-2, -11)
      ctx.lineTo(-19, -12 + sway)
      ctx.lineTo(-15, -6)
      ctx.lineTo(-22, -1 - sway)
      ctx.lineTo(-16, 3)
      ctx.lineTo(-20, 10 + sway)
      ctx.lineTo(-2, 11)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#6B7A44'
      ctx.fillRect(-13, -7, 5, 3)
      ctx.fillRect(-11, 3, 6, 3)
      ctx.fillStyle = '#3A4326'
      ctx.fillRect(-16, -1, 4, 2.5)
      break
    }
    case 'summoner': {
      // a robe that trails behind, with a glowing hem
      const sway = Math.sin(t * (pose.moving ? 8 : 2.5)) * 2
      ctx.fillStyle = '#3A2A6E'
      ctx.beginPath()
      ctx.moveTo(0, -11)
      ctx.quadraticCurveTo(-14, -15 + sway, -22, -7 + sway)
      ctx.quadraticCurveTo(-25, 0, -22, 7 - sway)
      ctx.quadraticCurveTo(-14, 15 - sway, 0, 11)
      ctx.closePath()
      ctx.fill()
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = 'rgba(185,140,255,0.75)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(-21, -7 + sway)
      ctx.quadraticCurveTo(-25, 0, -21, 7 - sway)
      ctx.stroke()
      ctx.restore()
      break
    }
    default:
      break
  }
}

/** Class gear worn over the body: the Bulwark's shoulder plates, the Striker's bandolier, the Warlock's pendant. */
function drawGearFront(ctx: CanvasRenderingContext2D, gear: ClassId, t: number) {
  const color = CLASSES[gear].color
  switch (gear) {
    case 'tank':
      // heavy steel shoulder plates with a blue edge
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#9AA9C0'
        ctx.beginPath()
        ctx.ellipse(-1, side * 11.5, 6.5, 4.6, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#5E6C84'
        ctx.beginPath()
        ctx.ellipse(-2.5, side * 12.2, 4.5, 2.6, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 1.3
        ctx.beginPath()
        ctx.ellipse(-1, side * 11.5, 6.5, 4.6, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.fillStyle = '#7C8AA3'
      ctx.fillRect(-9, -5, 4, 10)
      break
    case 'damage':
      // an ammunition belt across the chest
      ctx.strokeStyle = '#4A2A20'
      ctx.lineWidth = 3.2
      ctx.lineCap = 'butt'
      ctx.beginPath()
      ctx.moveTo(-6, -11)
      ctx.lineTo(6, 11)
      ctx.stroke()
      ctx.fillStyle = '#E8C34A'
      for (let i = 0; i < 4; i++) ctx.fillRect(-5 + i * 3.1, -8.6 + i * 5.6, 2, 2.6)
      ctx.fillStyle = color
      ctx.fillRect(-9, -2, 3, 4)
      break
    case 'sniper':
      // a shoulder pad for the rifle butt
      ctx.fillStyle = '#6B7A44'
      ctx.beginPath()
      ctx.ellipse(0, 10.5, 5.2, 3.6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = color
      ctx.fillRect(-8, -2, 2.5, 4)
      break
    case 'summoner': {
      // a pendant that pulses, and light gathering in the hands
      const pulse = 0.6 + 0.4 * Math.sin(t * 4)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      glow(ctx, 4, 0, 7 + pulse * 2, `rgba(185,140,255,${0.55 * pulse})`)
      glow(ctx, 14, -6.5, 6, `rgba(210,180,255,${0.35 + 0.25 * pulse})`)
      glow(ctx, 14, 6.5, 6, `rgba(210,180,255,${0.35 + 0.25 * (1 - pulse)})`)
      ctx.restore()
      ctx.fillStyle = '#E6DEFF'
      ctx.beginPath()
      ctx.moveTo(4, -2.6)
      ctx.lineTo(6.4, 0)
      ctx.lineTo(4, 2.6)
      ctx.lineTo(1.6, 0)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'agile':
      // the knot of the scarf
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.ellipse(-4, 0, 3.2, 6.5, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'support':
      // pack straps and an armband
      ctx.fillStyle = '#C8D2E0'
      ctx.fillRect(-7, -10, 2, 20)
      ctx.fillStyle = color
      ctx.fillRect(3, 4, 5, 5)
      break
  }
}

const NO_FX: readonly string[] = []

/** Big effects behind the body: wings, flames, void. Drawn in the rotated frame (+x is forward). */
function drawBackFx(ctx: CanvasRenderingContext2D, look: CharacterLook, t: number) {
  const fx = look.fx ?? NO_FX
  if (fx.includes('void')) drawVoid(ctx, t)
  if (fx.includes('wings')) drawWings(ctx, t)
  if (fx.includes('flames')) drawFlameWings(ctx, t)
}

function drawVoid(ctx: CanvasRenderingContext2D, t: number) {
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 36)
  g.addColorStop(0, 'rgba(6,0,16,0.9)')
  g.addColorStop(0.6, 'rgba(40,8,90,0.55)')
  g.addColorStop(1, 'rgba(90,20,200,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, 36, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (let k = 0; k < 4; k++) {
    ctx.strokeStyle = `rgba(${170 + k * 20},${90 + k * 15},255,0.7)`
    ctx.lineWidth = 2
    ctx.beginPath()
    const a0 = t * (1.5 + k * 0.45) + k * 1.7
    ctx.arc(0, 0, 22 + k * 4, a0, a0 + 1.25)
    ctx.stroke()
  }
  ctx.restore()
  // shadow tendrils streaming behind
  ctx.lineCap = 'round'
  for (let i = 0; i < 5; i++) {
    const y0 = (i - 2) * 4.5
    const wob = Math.sin(t * 4 + i * 1.3)
    ctx.strokeStyle = 'rgba(20,0,44,0.7)'
    ctx.lineWidth = 4.5
    ctx.beginPath()
    ctx.moveTo(-6, y0)
    ctx.quadraticCurveTo(-24, y0 * 2.2 + wob * 8, -42 - i * 2, y0 * 3 + Math.sin(t * 3 + i) * 12)
    ctx.stroke()
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = 'rgba(160,80,255,0.45)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.restore()
  }
}

function featherPath(ctx: CanvasRenderingContext2D, bx: number, by: number, dx: number, dy: number, len: number, w: number) {
  ctx.save()
  ctx.translate(bx + (dx * len) / 2, by + (dy * len) / 2)
  ctx.rotate(Math.atan2(dy, dx))
  ctx.beginPath()
  ctx.ellipse(0, 0, len / 2, w, 0, 0, Math.PI * 2)
}

function drawWings(ctx: CanvasRenderingContext2D, t: number) {
  const flap = Math.sin(t * 3) * 0.12
  for (let pass = 0; pass < 2; pass++) {
    for (const s of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const ang = 0.3 + i * 0.2 + flap
        const dx = -Math.cos(ang)
        const dy = s * Math.sin(ang)
        const len = 34 - i * 2.2
        featherPath(ctx, -2, s * 7, dx, dy, len, 4.4 - i * 0.25)
        if (pass === 0) {
          ctx.globalCompositeOperation = 'lighter'
          ctx.fillStyle = hueColor(t, i * 40 + (s > 0 ? 0 : 90), 0.35)
          ctx.fill()
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.93)'
          ctx.strokeStyle = 'rgba(255,216,112,0.95)'
          ctx.lineWidth = 1
          ctx.fill()
          ctx.stroke()
        }
        ctx.restore()
      }
    }
  }
}

function drawFlameWings(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const ang = 0.35 + i * 0.22 + Math.sin(t * 5 + i) * 0.08
      const dx = -Math.cos(ang)
      const dy = s * Math.sin(ang)
      const len = 28 + Math.sin(t * 13 + i * 2 + s) * 5 - i * 1.5
      const bx = -2
      const by = s * 7
      const grad = ctx.createLinearGradient(bx, by, bx + dx * len, by + dy * len)
      grad.addColorStop(0, 'rgba(255,230,120,0.95)')
      grad.addColorStop(0.5, 'rgba(255,120,30,0.75)')
      grad.addColorStop(1, 'rgba(200,30,10,0)')
      featherPath(ctx, bx, by, dx, dy, len, 4.6)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.restore()
    }
  }
  ctx.restore()
}

/** Halo and orbiting orbs, drawn above the head. */
function drawFrontFx(ctx: CanvasRenderingContext2D, look: CharacterLook, t: number, angle: number) {
  const fx = look.fx ?? NO_FX
  if (fx.includes('halo')) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = 'rgba(255,226,120,0.95)'
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.arc(1, 0, 11.5, 0, Math.PI * 2)
    ctx.stroke()
    glow(ctx, 1, 0, 16, 'rgba(255,220,120,0.28)')
    ctx.fillStyle = '#FFFFFF'
    for (let i = 0; i < 3; i++) {
      const a = t * 2.4 + i * 2.1
      ctx.beginPath()
      ctx.arc(1 + Math.cos(a) * 11.5, Math.sin(a) * 11.5, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
  if (fx.includes('orbit')) {
    ctx.save()
    ctx.rotate(-angle)
    ctx.globalCompositeOperation = 'lighter'
    const n = 4
    for (let i = 0; i < n; i++) {
      const a = t * 2.1 + (i * Math.PI * 2) / n
      const ox = Math.cos(a) * 23
      const oy = Math.sin(a) * 23
      const color = look.orbit === 'rainbow' ? hueColor(t, i * 90) : (look.orbit ?? '#FFFFFF')
      glow(ctx, ox, oy, 9, color)
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath()
      ctx.arc(ox, oy, 2.1, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(0, 0, 23, a - 0.5, a)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }
}

function drawHeadExtras(ctx: CanvasRenderingContext2D, look: CharacterLook, t: number) {
  switch (look.extra) {
    case 'goggles':
      ctx.fillStyle = '#111';
      ctx.fillRect(2.5, -7, 5, 14)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = look.accent
      ctx.fillRect(4, -5.5, 3, 4)
      ctx.fillRect(4, 1.5, 3, 4)
      glow(ctx, 6, 0, 12, 'rgba(124,255,138,0.35)')
      ctx.restore()
      break
    case 'bandana':
      ctx.fillStyle = look.accent
      ctx.fillRect(-4, -7.8, 5, 15.6)
      ctx.fillStyle = '#C33'
      ctx.fillRect(-9, -2.5, 6, 5)
      break
    case 'frost':
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      for (let i = 0; i < 4; i++) {
        const a = t * 1.4 + i * 1.6
        ctx.fillRect(Math.cos(a) * 14 - 1, Math.sin(a) * 14 - 1, 2.2, 2.2)
      }
      break
    case 'mask':
      ctx.fillStyle = look.accent
      ctx.fillRect(3.5, -4.5, 6, 9)
      ctx.fillStyle = '#8FD0FF'
      ctx.fillRect(3, -6, 3, 12)
      ctx.fillStyle = '#242A31'
      ctx.beginPath()
      ctx.arc(10, 0, 3, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'neon':
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = look.accent
      ctx.fillRect(-3, -7.8, 3, 15.6)
      glow(ctx, 0, 0, 14, 'rgba(255,61,175,0.3)')
      ctx.restore()
      break
    case 'crown':
      ctx.fillStyle = look.accent
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath()
        ctx.moveTo(-3, i * 3 - 1.2)
        ctx.lineTo(-8, i * 3)
        ctx.lineTo(-3, i * 3 + 1.2)
        ctx.closePath()
        ctx.fill()
      }
      ctx.fillRect(-4, -6.5, 2.2, 13)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = `rgba(255,240,170,${0.5 + 0.4 * Math.sin(t * 6)})`
      ctx.fillRect(-6, -1, 2, 2)
      ctx.restore()
      break
    case 'mohawk':
      ctx.fillStyle = look.accent
      ctx.fillRect(-7, -1.7, 13, 3.4)
      for (let i = 0; i < 5; i++) {
        const x = -7 + i * 2.6
        ctx.beginPath()
        ctx.moveTo(x, -1.7)
        ctx.lineTo(x + 1.3, i % 2 ? -4.2 : -3.4)
        ctx.lineTo(x + 2.6, -1.7)
        ctx.moveTo(x, 1.7)
        ctx.lineTo(x + 1.3, i % 2 ? 3.4 : 4.2)
        ctx.lineTo(x + 2.6, 1.7)
        ctx.fill()
      }
      break
    case 'hood':
      ctx.fillStyle = '#0D0620'
      ctx.beginPath()
      ctx.ellipse(0.5, 0, 9.6, 9.8, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#030108'
      ctx.beginPath()
      ctx.ellipse(4.5, 0, 5.2, 6.2, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      glow(ctx, 7, -2.4, 6, look.accent)
      glow(ctx, 7, 2.4, 6, look.accent)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(6.4, -3, 1.6, 1.4)
      ctx.fillRect(6.4, 1.6, 1.6, 1.4)
      ctx.restore()
      break
    case 'visor': {
      ctx.fillStyle = '#0A0E18'
      ctx.fillRect(3.2, -6.6, 4.6, 13.2)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = look.accent
      ctx.globalAlpha = 0.75
      ctx.fillRect(4.4, -5.6, 2.2, 11.2)
      ctx.globalAlpha = 0.95
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(4, -5.6 + ((t * 14) % 10.4), 3, 1.2)
      glow(ctx, 6, 0, 13, look.accent)
      ctx.restore()
      break
    }
    default:
      break
  }
}
