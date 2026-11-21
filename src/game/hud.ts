import { BOOST, VIEW_H, VIEW_W, WEAPON_ORDER, WEAPONS } from './config'
import { CLASSES } from './classes'
import { formatClock } from './time'
import { DIFFICULTY } from './difficulty'
import type { Game } from './engine'
import { drawGunCentered } from './gunart'
import { hasAmmo } from './pickups'
import { slotColor } from './sprites'
import { activeMap } from './world'

const DISPLAY = "'Space Grotesk', 'DM Sans', sans-serif"
const BODY = "'DM Sans', sans-serif"
const MAP_W = 150

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 10) {
  ctx.fillStyle = 'rgba(8,14,20,0.66)'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = 1
  ctx.stroke()
}

export function drawHud(ctx: CanvasRenderingContext2D, g: Game) {
  drawHealth(ctx, g)
  drawMinimap(ctx, g)
  drawStats(ctx, g)
  drawTimer(ctx, g)
  drawWeaponBar(ctx, g)
  drawBoosts(ctx, g)
  drawDash(ctx, g)
  drawTeam(ctx, g)
  drawFinder(ctx, g)
  drawBossBar(ctx, g)
  drawDownNotice(ctx, g)
  drawChapterBanner(ctx, g)
  if (g.banner > 0 && g.status === 'playing') {
    ctx.save()
    ctx.globalAlpha = Math.min(1, g.banner)
    ctx.textAlign = 'center'
    ctx.shadowColor = 'rgba(255,75,87,0.8)'
    ctx.shadowBlur = 24
    ctx.fillStyle = g.bossWave ? '#FF6B77' : '#FFFFFF'
    ctx.font = `700 ${g.bossWave ? 50 : 58}px ${DISPLAY}`
    ctx.fillText(g.descent ? (g.bossWave ? `BOSS FLOOR ${g.floor}` : `FLOOR ${g.floor}`) : g.bossWave ? `BOSS WAVE ${g.wave}` : `WAVE ${g.wave}`, VIEW_W / 2, VIEW_H / 2 - 70)
    ctx.shadowBlur = 0
    ctx.font = `500 15px ${BODY}`
    ctx.fillStyle = '#FFB3BA'
    ctx.fillText(g.bossWave ? `${activeMap.chapter.boss.name} has arrived` : g.descent ? 'Deeper. The horde grows.' : 'The horde is coming', VIEW_W / 2, VIEW_H / 2 - 44)
    ctx.restore()
  }
}

function drawHealth(ctx: CanvasRenderingContext2D, g: Game) {
  const p = g.player
  const ratio = Math.max(0, p.hp / p.maxHp)
  panel(ctx, 12, 12, 204, 48)
  // heart
  ctx.fillStyle = '#FF4B57'
  ctx.beginPath()
  ctx.arc(28, 27, 5, Math.PI, 0)
  ctx.arc(38, 27, 5, Math.PI, 0)
  ctx.lineTo(33, 40)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.roundRect(50, 20, 156, 18, 9)
  ctx.fill()
  const grad = ctx.createLinearGradient(50, 0, 206, 0)
  grad.addColorStop(0, ratio > 0.35 ? '#2FBF7A' : '#FF4B57')
  grad.addColorStop(1, ratio > 0.35 ? '#8FE3B1' : '#FF8A93')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.roundRect(50, 20, Math.max(8, 156 * ratio), 18, 9)
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `700 12px ${DISPLAY}`
  ctx.textAlign = 'center'
  ctx.fillText(String(Math.ceil(p.hp)), 128, 33)
  const armor = p.armor ?? 0
  if (armor > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.roundRect(50, 43, 156, 7, 3.5)
    ctx.fill()
    ctx.fillStyle = '#7FB0FF'
    ctx.beginPath()
    ctx.roundRect(50, 43, Math.max(6, 156 * Math.min(1, armor / BOOST.armor)), 7, 3.5)
    ctx.fill()
    ctx.fillStyle = '#7FB0FF'
    ctx.font = `700 9px ${DISPLAY}`
    ctx.textAlign = 'left'
    ctx.fillText('ARMOR', 20, 50)
  }
}

function drawBossBar(ctx: CanvasRenderingContext2D, g: Game) {
  const boss = g.zombies.find((z) => z.kind === 'boss')
  if (!boss || g.status !== 'playing') return
  const w = 250
  const x = VIEW_W / 2 - w / 2
  panel(ctx, x, 12, w, 40)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#FFD25A'
  ctx.font = `700 11px ${DISPLAY}`
  ctx.fillText(activeMap.chapter.boss.name, VIEW_W / 2, 26)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.roundRect(x + 10, 32, w - 20, 12, 6)
  ctx.fill()
  const ratio = Math.max(0, boss.hp / boss.maxHp)
  const grad = ctx.createLinearGradient(x, 0, x + w, 0)
  grad.addColorStop(0, '#B3202E')
  grad.addColorStop(1, '#FF6B77')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.roundRect(x + 10, 32, Math.max(6, (w - 20) * ratio), 12, 6)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  for (const m of g.diff.summonAt) ctx.fillRect(x + 10 + (w - 20) * m - 1, 31, 2, 14)
}

/** The run clock, top centre (it drops below the boss bar while a boss is up). */
function drawTimer(ctx: CanvasRenderingContext2D, g: Game) {
  const boss = g.zombies.some((z) => z.kind === 'boss')
  const w = 116
  const x = (VIEW_W - w) / 2
  const y = boss ? 62 : 12
  panel(ctx, x, y, w, 36)
  ctx.textAlign = 'center'
  ctx.fillStyle = g.survival ? '#FF8A93' : '#8A97AD'
  ctx.font = `700 9px ${DISPLAY}`
  ctx.fillText(g.survival ? 'SURVIVED' : activeMap.chapter.trial ? 'TRIAL TIME' : 'TIME', VIEW_W / 2, y + 13)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `700 17px ${DISPLAY}`
  ctx.fillText(formatClock(g.runTime), VIEW_W / 2, y + 30)
}

function drawStats(ctx: CanvasRenderingContext2D, g: Game) {
  panel(ctx, VIEW_W - 164, 12, 152, g.descent ? 108 : 92)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `700 15px ${DISPLAY}`
  const waveLine = g.descent
    ? `FLOOR ${Math.max(g.floor, 1)}`
    : g.survival
      ? `SURVIVAL  WAVE ${Math.max(g.wave, 1)}`
      : `CH ${activeMap.index + 1}  WAVE ${Math.max(g.wave, 1)}/${activeMap.chapter.waves}`
  ctx.fillText(waveLine, VIEW_W - 24, 36)
  ctx.font = `500 12px ${BODY}`
  ctx.fillStyle = '#C5CFDD'
  ctx.fillText(`Score  ${g.score}`, VIEW_W - 24, 54)
  ctx.fillText(`Kills  ${g.kills}`, VIEW_W - 24, 69)
  ctx.fillStyle = '#FF8A93'
  ctx.fillText(`Zombies  ${g.zombies.length}`, VIEW_W - 24, 84)
  const d = DIFFICULTY[g.difficulty]
  ctx.fillStyle = d.color
  ctx.font = `700 11px ${DISPLAY}`
  ctx.fillText(d.label.toUpperCase(), VIEW_W - 24, 99)
  if (g.descent && g.prizeHint) {
    ctx.fillStyle = '#FFD25A'
    ctx.font = `700 11px ${DISPLAY}`
    ctx.fillText(g.prizeHint, VIEW_W - 24, 115)
  }
}

/** Teammates in a co-op room: health, name and who needs a revive. */
function drawTeam(ctx: CanvasRenderingContext2D, g: Game) {
  const mates = g.slots.filter((s) => s.id !== g.localId)
  if (mates.length === 0) return
  const rowH = 30
  const x = VIEW_W - 164
  const y = g.descent ? 126 : 110
  panel(ctx, x, y, 152, mates.length * rowH + 8)
  mates.forEach((s, i) => {
    const p = s.player
    const ry = y + 8 + i * rowH
    ctx.textAlign = 'left'
    ctx.fillStyle = slotColor(s.id)
    ctx.font = `700 11px ${DISPLAY}`
    ctx.fillText(s.name.slice(0, 12), x + 10, ry + 9)
    ctx.textAlign = 'right'
    ctx.fillStyle = p.down ? '#FF7A85' : s.connected ? '#C5CFDD' : '#8A97AD'
    ctx.font = `600 10px ${BODY}`
    ctx.fillText(p.down ? 'DOWN' : s.connected ? `${Math.ceil(p.hp)}` : 'offline', x + 142, ry + 9)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.roundRect(x + 10, ry + 14, 132, 6, 3)
    ctx.fill()
    const ratio = p.down ? (p.revive ?? 0) : Math.max(0, p.hp / p.maxHp)
    ctx.fillStyle = p.down ? '#6EE7A8' : ratio > 0.35 ? '#2FBF7A' : '#FF4B57'
    ctx.beginPath()
    ctx.roundRect(x + 10, ry + 14, Math.max(p.down && ratio === 0 ? 0 : 4, 132 * ratio), 6, 3)
    ctx.fill()
  })
}

/** When you are down, say so; when a teammate is down, say how to help. */
function drawDownNotice(ctx: CanvasRenderingContext2D, g: Game) {
  if (g.status !== 'playing' || g.slots.length < 2) return
  const me = g.player
  const downMate = g.slots.find((s) => s.id !== g.localId && s.player.down)
  ctx.save()
  ctx.textAlign = 'center'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(0,0,0,0.7)'
  if (me.down) {
    ctx.font = `700 22px ${DISPLAY}`
    ctx.strokeText('YOU ARE DOWN', VIEW_W / 2, 96)
    ctx.fillStyle = '#FF7A85'
    ctx.fillText('YOU ARE DOWN', VIEW_W / 2, 96)
    ctx.font = `500 13px ${BODY}`
    const msg = `A teammate can revive you. Revive ${Math.round((me.revive ?? 0) * 100)}%`
    ctx.strokeText(msg, VIEW_W / 2, 118)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(msg, VIEW_W / 2, 118)
  } else if (downMate) {
    ctx.font = `700 14px ${DISPLAY}`
    const msg = `${downMate.name} is down. Stand close to revive`
    ctx.strokeText(msg, VIEW_W / 2, VIEW_H - 74)
    ctx.fillStyle = '#6EE7A8'
    ctx.fillText(msg, VIEW_W / 2, VIEW_H - 74)
  }
  ctx.restore()
}

/** Hotkeys for the weapon cards, in order: 1 to 9, then 0, minus and equals. */
const KEY_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']

function drawWeaponBar(ctx: CanvasRenderingContext2D, g: Game) {
  const p = g.player
  // only the weapons you hold, so a full armory of twelve still fits
  const ids = WEAPON_ORDER.filter((id) => p.owned[id])
  const gap = 3
  const w = Math.min(56, Math.floor((560 - gap * (ids.length - 1)) / ids.length))
  const x0 = VIEW_W / 2 - (ids.length * (w + gap) - gap) / 2
  ids.forEach((id, i) => {
    const def = WEAPONS[id]
    const x = x0 + i * (w + gap)
    const y = VIEW_H - 58
    const active = p.weapon === id
    panel(ctx, x, y, w, 46, 10)
    if (active) {
      ctx.strokeStyle = def.color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(x, y, w, 46, 10)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.1)'
      ctx.fill()
    }
    if (id === 'fists') {
      ctx.fillStyle = '#E8C39E'
      ctx.beginPath()
      ctx.arc(x + w / 2 - 6, y + 17, 5.5, 0, Math.PI * 2)
      ctx.arc(x + w / 2 + 6, y + 17, 5.5, 0, Math.PI * 2)
      ctx.fill()
    } else {
      drawGunCentered(ctx, id, x + w / 2, y + 16, Math.min(38, w - 12))
    }
    ctx.textAlign = 'left'
    ctx.font = `700 10px ${DISPLAY}`
    ctx.fillStyle = '#9FB0C8'
    ctx.fillText(KEY_LABELS[i] ?? '', x + 5, y + 12)
    ctx.textAlign = 'center'
    ctx.font = `600 10px ${BODY}`
    ctx.fillStyle = hasAmmo(p, id) ? '#FFFFFF' : '#FF8A93'
    const roomy = w >= 50
    const sub = id === 'fists' ? (roomy ? 'melee' : '') : def.infinite ? (roomy ? 'free ammo' : 'free') : String(p.ammo[id])
    ctx.fillText(sub, x + w / 2, y + 39)
  })
}

/** The class skill on Shift: its name, how long until it is ready, and how long its effect has left. */
function drawDash(ctx: CanvasRenderingContext2D, g: Game) {
  const p = g.player
  const cls = CLASSES[p.cls]
  const x = VIEW_W - 124
  const y = VIEW_H - 58
  const ready = p.skillCd <= 0
  const active = p.skillT > 0 && (p.cls === 'tank' || p.cls === 'damage')
  panel(ctx, x, y, 112, 46, 10)
  // charge bar: fills up while the skill recovers, drains while its effect lasts
  const fill = active ? p.skillT / cls.duration : ready ? 1 : 1 - p.skillCd / cls.cooldown
  ctx.fillStyle = active ? cls.color : ready ? cls.color : 'rgba(255,255,255,0.22)'
  ctx.beginPath()
  ctx.roundRect(x + 8, y + 33, 96 * Math.max(0, Math.min(1, fill)), 6, 3)
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.fillStyle = ready || active ? '#FFFFFF' : '#8A97AD'
  ctx.font = `700 11px ${DISPLAY}`
  ctx.fillText(`Shift  ${cls.skill}`, x + 56, y + 17)
  ctx.font = `500 11px ${BODY}`
  ctx.fillStyle = ready ? cls.color : '#8A97AD'
  ctx.fillText(active ? `${p.skillT.toFixed(1)}s` : ready ? 'Ready' : `${Math.ceil(p.skillCd)}s`, x + 56, y + 29)
}

function drawMinimap(ctx: CanvasRenderingContext2D, g: Game) {
  const x0 = 16
  const y0 = 72
  const mapH = Math.round((MAP_W * activeMap.h) / activeMap.w)
  const sx = MAP_W / activeMap.w
  const sy = mapH / activeMap.h
  panel(ctx, x0 - 4, y0 - 4, MAP_W + 8, mapH + 8, 8)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(x0, y0, MAP_W, mapH)
  for (const h of activeMap.hazards) {
    ctx.fillStyle = h.kind === 'lava' ? 'rgba(255,110,40,0.7)' : h.kind === 'electric' ? 'rgba(120,190,255,0.8)' : 'rgba(140,230,70,0.6)'
    ctx.fillRect(x0 + h.x * sx, y0 + h.y * sy, Math.max(2, h.w * sx), Math.max(2, h.h * sy))
  }
  ctx.fillStyle = 'rgba(160,175,200,0.6)'
  for (const o of activeMap.obstacles) ctx.fillRect(x0 + o.x * sx, y0 + o.y * sy, Math.max(1.5, o.w * sx), Math.max(1.5, o.h * sy))
  for (const k of g.pickups) {
    ctx.fillStyle = k.kind === 'weapon' ? '#F0903C' : k.kind === 'ammo' ? '#4C86E8' : '#2FBF7A'
    ctx.fillRect(x0 + k.x * sx - 2, y0 + k.y * sy - 2, 4, 4)
  }
  ctx.fillStyle = '#FF4B57'
  for (const z of g.zombies) {
    const s = z.kind === 'boss' ? 6 : 2
    ctx.fillStyle = z.kind === 'boss' ? '#FFD25A' : '#FF4B57'
    ctx.fillRect(x0 + z.x * sx - s / 2, y0 + z.y * sy - s / 2, s, s)
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 1
  ctx.strokeRect(x0 + g.camera.x * sx, y0 + g.camera.y * sy, VIEW_W * sx, VIEW_H * sy)
  for (const slot of g.slots) {
    ctx.fillStyle = slot.player.down ? '#FF7A85' : slotColor(slot.id)
    ctx.beginPath()
    ctx.arc(x0 + slot.player.x * sx, y0 + slot.player.y * sy, slot.id === g.localId ? 3 : 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** While the player has no gun, point toward the nearest weapon on the map. */
function drawFinder(ctx: CanvasRenderingContext2D, g: Game) {
  const p = g.player
  const armed = WEAPON_ORDER.some((w) => w !== 'fists' && hasAmmo(p, w))
  if (armed || g.status !== 'playing') return
  let best: { x: number; y: number } | null = null
  let bestD = Infinity
  for (const k of g.pickups) {
    if (k.kind !== 'weapon') continue
    const d = Math.hypot(k.x - p.x, k.y - p.y)
    if (d < bestD) {
      bestD = d
      best = k
    }
  }
  if (!best) return
  const px = p.x - g.camera.x
  const py = p.y - g.camera.y
  const a = Math.atan2(best.y - p.y, best.x - p.x)
  ctx.save()
  ctx.translate(px + Math.cos(a) * 54, py + Math.sin(a) * 54)
  ctx.rotate(a)
  ctx.shadowColor = '#F0903C'
  ctx.shadowBlur = 14
  ctx.fillStyle = '#FFB36B'
  ctx.beginPath()
  ctx.moveTo(11, 0)
  ctx.lineTo(-6, -9)
  ctx.lineTo(-2, 0)
  ctx.lineTo(-6, 9)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.textAlign = 'center'
  ctx.font = `700 12px ${DISPLAY}`
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(0,0,0,0.7)'
  ctx.strokeText(`Find a gun · ${Math.round(bestD / 10)}m`, px, py - 42)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(`Find a gun · ${Math.round(bestD / 10)}m`, px, py - 42)
}

function drawChapterBanner(ctx: CanvasRenderingContext2D, g: Game) {
  if (g.chapterBanner <= 0 || g.status !== 'playing') return
  const ch = activeMap.chapter
  ctx.save()
  ctx.globalAlpha = Math.min(1, g.chapterBanner)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#FFB36B'
  ctx.font = `700 13px ${DISPLAY}`
  ctx.fillText(`CHAPTER ${ch.id}`, VIEW_W / 2, VIEW_H / 2 - 150)
  ctx.shadowColor = 'rgba(0,0,0,0.8)'
  ctx.shadowBlur = 14
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `700 34px ${DISPLAY}`
  ctx.fillText(ch.name, VIEW_W / 2, VIEW_H / 2 - 114)
  ctx.shadowBlur = 0
  ctx.fillStyle = '#C5CFDD'
  ctx.font = `500 13px ${BODY}`
  ctx.fillText(ch.subtitle, VIEW_W / 2, VIEW_H / 2 - 92)
  ctx.restore()
}

/** Boosts you bought: charges left and the key that uses them. */
function drawBoosts(ctx: CanvasRenderingContext2D, g: Game) {
  const rows: { key: string; label: string; n: number; color: string }[] = [
    { key: 'F', label: 'Full heal', n: g.charges.heal, color: '#6EE7A8' },
    { key: 'G', label: 'Armor', n: g.charges.armor, color: '#7FB0FF' },
    { key: 'Auto', label: 'Extra life', n: g.charges.life, color: '#FFE16A' },
  ]
  if (rows.every((r) => r.n === 0)) return
  const x = 8
  const y = VIEW_H - 84
  panel(ctx, x, y, 126, 72, 10)
  rows.forEach((r, i) => {
    const ry = y + 20 + i * 21
    ctx.globalAlpha = r.n > 0 ? 1 : 0.35
    ctx.textAlign = 'left'
    ctx.fillStyle = r.color
    ctx.font = `700 10px ${DISPLAY}`
    ctx.fillText(r.key, x + 10, ry)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `600 11px ${BODY}`
    ctx.fillText(r.label, x + 36, ry)
    ctx.textAlign = 'right'
    ctx.fillStyle = r.color
    ctx.font = `700 12px ${DISPLAY}`
    ctx.fillText(`x${r.n}`, x + 116, ry)
  })
  ctx.globalAlpha = 1
}
