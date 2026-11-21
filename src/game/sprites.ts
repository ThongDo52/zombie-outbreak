import { CLASSES } from './classes'
import { PICKUPS, WEAPONS } from './config'
import type { Game } from './engine'
import { drawNozzleFlame } from './fx'
import { drawCharacter } from './playerart'
import { characterLook, gunLook, gunPalette, tracerColor } from './skins'
import { drawGunCentered } from './gunart'
import { activeMap, type Obstacle } from './world'
import type { Pickup, PlayerSlot } from './types'

const DISPLAY = "'Space Grotesk', 'DM Sans', sans-serif"
const PICKUP_COLOR = { ammo: '#4C86E8', medkit: '#2FBF7A', weapon: '#F0903C' } as const

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  r = Math.max(0, Number.isFinite(r) ? r : 0)
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

export function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle) {
  const th = activeMap.chapter.theme
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(o.x + 7, o.y + 9, o.w, o.h)
  if (o.crate) {
    ctx.fillStyle = th.crateDark
    ctx.fillRect(o.x, o.y, o.w, o.h)
    ctx.fillStyle = th.crate
    ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8)
    ctx.strokeStyle = th.crateDark
    ctx.lineWidth = 3
    ctx.strokeRect(o.x + 7, o.y + 7, o.w - 14, o.h - 14)
    ctx.beginPath()
    ctx.moveTo(o.x + 7, o.y + 7)
    ctx.lineTo(o.x + o.w - 7, o.y + o.h - 7)
    ctx.moveTo(o.x + o.w - 7, o.y + 7)
    ctx.lineTo(o.x + 7, o.y + o.h - 7)
    ctx.stroke()
    return
  }
  ctx.fillStyle = th.wallBase
  ctx.fillRect(o.x, o.y, o.w, o.h)
  ctx.fillStyle = th.wallFace
  ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, o.h - 8)
  ctx.fillStyle = th.wallLight
  ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, 3)
  ctx.strokeStyle = 'rgba(20,26,40,0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  const long = o.w >= o.h
  const len = long ? o.w : o.h
  for (let i = 28; i < len; i += 28) {
    if (long) {
      ctx.moveTo(o.x + i, o.y + 2)
      ctx.lineTo(o.x + i, o.y + o.h - 6)
    } else {
      ctx.moveTo(o.x + 2, o.y + i)
      ctx.lineTo(o.x + o.w - 2, o.y + i)
    }
  }
  ctx.stroke()
}

export function drawPickup(ctx: CanvasRenderingContext2D, k: Pickup, time: number) {
  if (k.ttl !== undefined && k.ttl < 5 && Math.floor(time * 8) % 2 === 0) return
  const s = PICKUPS.size
  const bob = Math.sin(time * 4 + k.id) * 2.5
  const color = PICKUP_COLOR[k.kind]
  const pulse = 0.5 + 0.5 * Math.sin(time * 3 + k.id)
  glow(ctx, k.x, k.y, 38 + pulse * 8, k.kind === 'weapon' ? 'rgba(240,144,60,0.45)' : k.kind === 'ammo' ? 'rgba(76,134,232,0.4)' : 'rgba(47,191,122,0.4)')
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(k.x, k.y + s / 2, s / 2, 5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  ctx.translate(k.x, k.y + bob)
  ctx.fillStyle = '#10151F'
  ctx.beginPath()
  ctx.roundRect(-s / 2 - 2, -s / 2 - 2, s + 4, s + 4, 7)
  ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(-s / 2, -s / 2, s, s, 5)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fillRect(-s / 2 + 2, -s / 2 + 2, s - 4, 4)
  if (k.kind === 'weapon' && k.weapon && k.weapon !== 'fists') {
    drawGunCentered(ctx, k.weapon, 0, 1, s - 8)
  } else if (k.kind === 'ammo') {
    ctx.fillStyle = '#FFE9A8'
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(i * 7 - 2, -7, 4, 13)
      ctx.fillStyle = '#C97B2B'
      ctx.fillRect(i * 7 - 2, -7, 4, 4)
      ctx.fillStyle = '#FFE9A8'
    }
  } else {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(-3, -9, 6, 18)
    ctx.fillRect(-9, -3, 18, 6)
  }
  ctx.restore()
  if (k.kind === 'weapon' && k.weapon) {
    const label = WEAPONS[k.weapon].label
    ctx.font = `700 11px ${DISPLAY}`
    ctx.textAlign = 'center'
    const w = ctx.measureText(label).width + 12
    ctx.fillStyle = 'rgba(8,14,20,0.75)'
    ctx.beginPath()
    ctx.roundRect(k.x - w / 2, k.y - s / 2 - 25 + bob, w, 16, 8)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(label, k.x, k.y - s / 2 - 13 + bob)
  }
}

const SLOT_COLORS = ['#7FD0FF', '#FFD25A', '#6EE7A8', '#FF8AF0']
export const slotColor = (id: number) => SLOT_COLORS[(id - 1 + 4) % 4]

export function drawPlayer(ctx: CanvasRenderingContext2D, g: Game, slot: PlayerSlot) {
  const p = slot.player
  const t = g.time
  const isLocal = slot.id === g.localId
  if (p.down) {
    drawDowned(ctx, g, slot)
    return
  }
  const blink = p.invuln > 0 && p.dashTime <= 0 && Math.floor(t * 20) % 2 === 0
  if (blink) {
    if (!isLocal) drawNameTag(ctx, slot, p.x, p.y)
    return
  }
  const angle = Math.atan2(p.aim.y, p.aim.x)
  const def = WEAPONS[p.weapon]
  ctx.save()
  if (!slot.connected) ctx.globalAlpha = 0.45
  drawCharacter(ctx, p.x, p.y, angle, t, characterLook(slot.skin.character), p.weapon, gunPalette(gunLook(slot.skin.gun), t), {
    moving: p.state === 'move',
    stunned: p.state === 'stunned',
    dashing: p.dashTime > 0,
    punching: p.state === 'attack',
  })

  const armor = p.armor ?? 0
  if (armor > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = `rgba(127,176,255,${0.35 + 0.35 * Math.min(1, armor / 60) + 0.1 * Math.sin(t * 6)})`
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(p.x, p.y, 21, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  drawClassFx(ctx, p, t)

  if (p.muzzle > 0 && p.weapon === 'flamer') {
    const d = p.w / 2 + def.barrel - 4
    drawNozzleFlame(ctx, p.x + Math.cos(angle) * d, p.y + Math.sin(angle) * d, angle, t)
  } else if (p.muzzle > 0 && p.weapon !== 'fists') {
    const d = p.w / 2 + def.barrel
    const mx = p.x + Math.cos(angle) * d
    const my = p.y + Math.sin(angle) * d
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    glow(ctx, mx, my, 46, 'rgba(255,190,80,0.7)')
    ctx.translate(mx, my)
    ctx.rotate(angle)
    ctx.fillStyle = tracerColor(gunLook(slot.skin.gun), t)
    ctx.beginPath()
    ctx.moveTo(14, 0)
    ctx.lineTo(0, -5)
    ctx.lineTo(3, 0)
    ctx.lineTo(0, 5)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
  if (!isLocal) drawNameTag(ctx, slot, p.x, p.y)
}

/** Each class wears its colour on the ground, and its skill shows while it is active. */
function drawClassFx(ctx: CanvasRenderingContext2D, p: PlayerSlot['player'], t: number) {
  const cls = CLASSES[p.cls]
  ctx.save()
  ctx.strokeStyle = cls.color
  ctx.globalAlpha = 0.4
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(p.x, p.y + 4, 15, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
  if (p.skillT <= 0) return
  const k = Math.min(1, p.skillT / Math.max(0.1, cls.duration))
  if (p.cls === 'tank') {
    // the shield: a bubble with a bright rim that flickers out as it runs low
    const flick = k < 0.25 ? 0.5 + 0.5 * Math.sin(t * 30) : 1
    ctx.save()
    ctx.globalAlpha = flick
    ctx.fillStyle = 'rgba(91,155,255,0.16)'
    ctx.strokeStyle = 'rgba(160,205,255,0.9)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(p.x, p.y, 31 + Math.sin(t * 6) * 1.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.strokeStyle = 'rgba(200,225,255,0.4)'
    ctx.lineWidth = 1
    for (let i = 0; i < 6; i++) {
      const a = i * (Math.PI / 3) + t * 0.6
      ctx.beginPath()
      ctx.moveTo(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14)
      ctx.lineTo(p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30)
      ctx.stroke()
    }
    ctx.restore()
  } else if (p.cls === 'damage') {
    // overdrive: a red heat haze with sparks climbing off the shoulders
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    glow(ctx, p.x, p.y, 42, `rgba(255,70,60,${0.35 + 0.15 * Math.sin(t * 14)})`)
    ctx.fillStyle = 'rgba(255,200,120,0.9)'
    for (let i = 0; i < 6; i++) {
      const f = (t * 1.6 + i * 0.17) % 1
      ctx.beginPath()
      ctx.arc(p.x + Math.sin(i * 2.3 + t * 3) * 14, p.y - f * 34, 1.6 * (1 - f) + 0.6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

function drawNameTag(ctx: CanvasRenderingContext2D, slot: PlayerSlot, x: number, y: number) {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.font = "700 11px 'Space Grotesk', 'DM Sans', sans-serif"
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(0,0,0,0.75)'
  ctx.strokeText(slot.name, x, y - 24)
  ctx.fillStyle = slotColor(slot.id)
  ctx.fillText(slot.name, x, y - 24)
  const hp = Math.max(0, Math.min(1, slot.player.hp / slot.player.maxHp))
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(x - 15, y - 21, 30, 4)
  ctx.fillStyle = hp > 0.35 ? '#2FBF7A' : '#FF4B57'
  ctx.fillRect(x - 15, y - 21, 30 * hp, 4)
  ctx.restore()
}

/** A downed player lies on the ground with a ring that fills while a teammate revives them. */
function drawDowned(ctx: CanvasRenderingContext2D, g: Game, slot: PlayerSlot) {
  const p = slot.player
  const t = g.time
  ctx.save()
  ctx.globalAlpha = 0.5
  drawCharacter(ctx, p.x, p.y, Math.PI / 2 + 0.4, t, characterLook(slot.skin.character), 'fists', undefined, { moving: false, stunned: true, dashing: false, punching: false })
  ctx.restore()
  const r = p.revive ?? 0
  ctx.save()
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.beginPath()
  ctx.arc(p.x, p.y, 24, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = r > 0 ? '#6EE7A8' : `rgba(255,75,87,${0.6 + 0.3 * Math.sin(t * 6)})`
  ctx.beginPath()
  ctx.arc(p.x, p.y, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(r, 0.04))
  ctx.stroke()
  ctx.restore()
  drawNameTag(ctx, slot, p.x, p.y + 2)
}
