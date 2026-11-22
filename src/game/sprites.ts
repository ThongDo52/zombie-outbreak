import { CLASSES, SKILL } from './classes'
import { PICKUPS, WEAPONS } from './config'
import type { Game } from './engine'
import { drawNozzleFlame } from './fx'
import { drawCharacter } from './playerart'
import { characterLook, gunLook, gunPalette, tracerColor } from './skins'
import { drawGunCentered } from './gunart'
import { activeMap, type Obstacle } from './world'
import type { Pickup, PlayerSlot } from './types'

const DISPLAY = "'Space Grotesk', 'DM Sans', sans-serif"
const PICKUP_COLOR = { ammo: '#4C86E8', medkit: '#2FBF7A', weapon: '#F0903C', coins: '#E8B923' } as const
const PICKUP_GLOW = { ammo: 'rgba(76,134,232,0.4)', medkit: 'rgba(47,191,122,0.4)', weapon: 'rgba(240,144,60,0.45)', coins: 'rgba(255,205,70,0.5)' } as const

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
  glow(ctx, k.x, k.y, 38 + pulse * 8, PICKUP_GLOW[k.kind])
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
  } else if (k.kind === 'coins') {
    // a small stack of coins with a glint that travels across it
    for (let i = 0; i < 3; i++) {
      const cy = 6 - i * 5
      ctx.fillStyle = '#8A6410'
      ctx.beginPath()
      ctx.ellipse(0, cy + 1.6, 8.5, 3.6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#FFD25A'
      ctx.beginPath()
      ctx.ellipse(0, cy, 8.5, 3.6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#FFF1B8'
      ctx.beginPath()
      ctx.ellipse(-2, cy - 0.8, 4, 1.3, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    const glint = ((time * 0.9 + k.id * 0.37) % 1) * 22 - 11
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(glint, -9, 2, 4)
    ctx.fillRect(glint - 1, -8, 4, 2)
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
  drawClassGround(ctx, p, t)
  drawCharacter(ctx, p.x, p.y, angle, t, characterLook(slot.skin.character), p.weapon, gunPalette(gunLook(slot.skin.gun), t), {
    moving: p.state === 'move',
    stunned: p.state === 'stunned',
    dashing: p.dashTime > 0,
    punching: p.state === 'attack',
  }, p.cls)

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
    drawMuzzleFlash(ctx, slot, angle, t)
  }
  ctx.restore()
  if (!isLocal) drawNameTag(ctx, slot, p.x, p.y)
}

/** A burst of fire at the muzzle: a forward tongue, side jets and a hot core, shaped by the gun. */
function drawMuzzleFlash(ctx: CanvasRenderingContext2D, slot: PlayerSlot, angle: number, t: number) {
  const p = slot.player
  const def = WEAPONS[p.weapon]
  const d = p.w / 2 + def.barrel
  const mx = p.x + Math.cos(angle) * d
  const my = p.y + Math.sin(angle) * d
  const energy = p.weapon === 'railgun' || p.weapon === 'tesla' || p.weapon === 'cryo' || p.weapon === 'venom' || p.weapon === 'wand'
  const big = p.weapon === 'shotgun' || p.weapon === 'sniper' || p.weapon === 'railgun' || p.weapon === 'launcher' ? 1.6 : p.weapon === 'rifle' ? 1.25 : 1
  // a new shape every couple of frames, so automatic fire flickers instead of looking stamped
  const seed = Math.floor(t * 40) + slot.id * 7
  const jitter = (n: number) => {
    const v = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453
    return v - Math.floor(v)
  }
  const color = energy ? def.color : tracerColor(gunLook(slot.skin.gun), t)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  glow(ctx, mx, my, 44 * big, energy ? 'rgba(160,230,255,0.55)' : 'rgba(255,190,80,0.7)')
  ctx.translate(mx, my)
  ctx.rotate(angle)
  const len = (13 + jitter(1) * 9) * big
  const wide = (4 + jitter(2) * 2.5) * big
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(len, 0)
  ctx.lineTo(1, -wide)
  ctx.lineTo(4, 0)
  ctx.lineTo(1, wide)
  ctx.closePath()
  ctx.fill()
  if (!energy) {
    // side jets
    for (const side of [-1, 1]) {
      const jl = (6 + jitter(3 + side) * 6) * big
      ctx.beginPath()
      ctx.moveTo(2, side * 1.5)
      ctx.lineTo(4 + jl * 0.5, side * jl)
      ctx.lineTo(6, side * 2)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.fillStyle = 'rgba(255,255,240,0.95)'
  ctx.beginPath()
  ctx.ellipse(3 + len * 0.2, 0, len * 0.3, wide * 0.45, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** The class colour on the ground under the player, drawn before the body. */
function drawClassGround(ctx: CanvasRenderingContext2D, p: PlayerSlot['player'], t: number) {
  const cls = CLASSES[p.cls]
  ctx.save()
  ctx.strokeStyle = cls.color
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(p.x, p.y + 4, 15, 0, Math.PI * 2)
  ctx.stroke()
  // a short arc that turns with time, so a still player still reads as alive
  ctx.globalAlpha = 0.85
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(p.x, p.y + 4, 15, t * 1.6, t * 1.6 + 0.9)
  ctx.stroke()
  ctx.restore()
}

/** What a class's skills look like while they are running. */
function drawClassFx(ctx: CanvasRenderingContext2D, p: PlayerSlot['player'], t: number) {
  const cls = CLASSES[p.cls]
  if (p.cls === 'summoner') {
    // three runes circle a Warlock at all times
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 3; i++) {
      const a = t * 1.5 + (i * Math.PI * 2) / 3
      const x = p.x + Math.cos(a) * 21
      const y = p.y + Math.sin(a) * 21
      glow(ctx, x, y, 6, 'rgba(185,140,255,0.6)')
      ctx.fillStyle = '#E6DEFF'
      ctx.fillRect(x - 1, y - 1, 2, 2)
    }
    ctx.restore()
  }
  if (p.cls === 'sniper' && p.skillT > 0) {
    // deadeye: a laser sight along the barrel and an amber haze
    const def = WEAPONS[p.weapon]
    const d = p.w / 2 + def.barrel
    const x0 = p.x + p.aim.x * d
    const y0 = p.y + p.aim.y * d
    const x1 = p.x + p.aim.x * 560
    const y1 = p.y + p.aim.y * 560
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const beam = ctx.createLinearGradient(x0, y0, x1, y1)
    beam.addColorStop(0, 'rgba(255,120,70,0.9)')
    beam.addColorStop(1, 'rgba(255,120,70,0)')
    ctx.strokeStyle = beam
    ctx.lineWidth = 1.5 + Math.sin(t * 30) * 0.3
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    glow(ctx, p.x, p.y, 34, `rgba(255,170,90,${0.22 + 0.08 * Math.sin(t * 10)})`)
    ctx.restore()
  }
  if (p.skillT <= 0) return
  const k = Math.min(1, p.skillT / Math.max(0.1, cls.duration))
  if (p.cls === 'tank') {
    // the shield: a bubble with a bright rim that flickers out as it runs low
    const flick = k < 0.25 ? 0.5 + 0.5 * Math.sin(t * 30) : 1
    ctx.save()
    ctx.globalAlpha = flick
    const r = 31 + Math.sin(t * 6) * 1.5
    const body = ctx.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, r)
    body.addColorStop(0, 'rgba(91,155,255,0.04)')
    body.addColorStop(1, 'rgba(91,155,255,0.28)')
    ctx.fillStyle = body
    ctx.strokeStyle = 'rgba(160,205,255,0.9)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
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
    // the reach of the taunt, as a faint pulse on the ground
    ctx.globalAlpha = 0.12 * flick
    ctx.strokeStyle = cls.color
    ctx.lineWidth = 2
    ctx.setLineDash([8, 10])
    ctx.beginPath()
    ctx.arc(p.x, p.y, SKILL.shield.taunt * 0.5, t * 0.4, t * 0.4 + Math.PI * 2)
    ctx.stroke()
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
  } else if (p.cls === 'support') {
    // the heal pulse leaves a green cross hanging over the Medic for a moment
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = k
    glow(ctx, p.x, p.y, 40, 'rgba(110,231,168,0.5)')
    ctx.fillStyle = '#B9FFD9'
    ctx.fillRect(p.x - 2.5, p.y - 34 - (1 - k) * 8, 5, 14)
    ctx.fillRect(p.x - 7, p.y - 29.5 - (1 - k) * 8, 14, 5)
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
