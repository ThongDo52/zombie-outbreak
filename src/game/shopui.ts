import { CLASSES } from './classes'
import { VIEW_H, VIEW_W, WEAPONS } from './config'
import type { Game } from './engine'
import { drawGunCentered } from './gunart'
import { SHOP, shopEntries, type ShopEntry } from './shop'
import type { Player, Rect } from './types'

/**
 * The shop, drawn on the game canvas so it looks and works the same alone and in a co-op room.
 * B opens and closes it. Buy with the number keys or by clicking (or tapping) a line.
 */

const DISPLAY = "'Space Grotesk', 'DM Sans', sans-serif"
const BODY = "'DM Sans', sans-serif"

const PANEL_W = 548
const HEAD_H = 52
const FOOT_H = 30
const MAX_ROWS = 11
/** Hotkeys for the lines, in order. */
export const SHOP_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-']

export interface ShopRow {
  rect: Rect
  entry: ShopEntry
  key: string
}

export interface ShopLayout {
  panel: Rect
  close: Rect
  rows: ShopRow[]
}

/** Where everything in the shop sits, for this player's shelf. Drawing and clicking both use it. */
export function shopLayout(p: Player): ShopLayout {
  let entries = shopEntries(p)
  // a shelf that long only happens in the owner's test mode: keep the first lines, and always ammo and medkit
  if (entries.length > MAX_ROWS) entries = [...entries.slice(0, MAX_ROWS - 2), ...entries.slice(-2)]
  const rowH = entries.length > 9 ? 32 : 36
  const h = HEAD_H + entries.length * rowH + FOOT_H + 8
  const x = Math.round((VIEW_W - PANEL_W) / 2)
  const y = Math.round((VIEW_H - h) / 2)
  return {
    panel: { x, y, w: PANEL_W, h },
    close: { x: x + PANEL_W - 40, y: y + 10, w: 30, h: 30 },
    rows: entries.map((entry, i) => ({ entry, key: SHOP_KEYS[i] ?? '', rect: { x: x + 10, y: y + HEAD_H + i * rowH, w: PANEL_W - 20, h: rowH - 4 } })),
  }
}

const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

/** What is under a click at view position (x, y): a line to buy, the close button, the panel itself, or nothing. */
export function shopHit(p: Player, x: number, y: number): { buy: string } | 'close' | 'panel' | 'outside' {
  const layout = shopLayout(p)
  if (inside(layout.close, x, y)) return 'close'
  for (const row of layout.rows) if (inside(row.rect, x, y)) return { buy: row.entry.id }
  return inside(layout.panel, x, y) ? 'panel' : 'outside'
}

/** The line a hotkey stands for (digit keys and minus), or undefined. */
export function shopKey(p: Player, key: string): string | undefined {
  return shopLayout(p).rows.find((r) => r.key === key)?.entry.id
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, stroke?: string) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, h / 2)
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

function coinIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = '#8A6410'
  ctx.beginPath()
  ctx.arc(x, y + 1, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#FFD25A'
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#B8891A'
  ctx.fillRect(x - r * 0.18, y - r * 0.55, r * 0.36, r * 1.1)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.beginPath()
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.24, 0, Math.PI * 2)
  ctx.fill()
}

export { coinIcon }

function rowIcon(ctx: CanvasRenderingContext2D, e: ShopEntry, cx: number, cy: number) {
  if (e.weapon && e.weapon !== 'fists') {
    drawGunCentered(ctx, e.weapon, cx, cy, 48)
    return
  }
  if (e.kind === 'ammo') {
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = '#FFE9A8'
      ctx.fillRect(cx + i * 8 - 2.5, cy - 8, 5, 16)
      ctx.fillStyle = '#C97B2B'
      ctx.fillRect(cx + i * 8 - 2.5, cy - 8, 5, 5)
    }
    return
  }
  ctx.fillStyle = '#2FBF7A'
  ctx.beginPath()
  ctx.roundRect(cx - 11, cy - 11, 22, 22, 5)
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(cx - 2.5, cy - 7.5, 5, 15)
  ctx.fillRect(cx - 7.5, cy - 2.5, 15, 5)
}

export function drawShop(ctx: CanvasRenderingContext2D, g: Game) {
  const p = g.player
  const cls = CLASSES[p.cls]
  const layout = shopLayout(p)
  const { panel } = layout
  const mouse = g.aimScreen
  const coins = Math.floor(p.coins ?? 0)
  const solo = g.mode === 'solo' && g.slots.length === 1

  ctx.save()
  // dim the fight behind the shelf
  ctx.fillStyle = solo ? 'rgba(4,8,12,0.62)' : 'rgba(4,8,12,0.42)'
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)

  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 30
  ctx.fillStyle = 'rgba(10,16,22,0.96)'
  ctx.beginPath()
  ctx.roundRect(panel.x, panel.y, panel.w, panel.h, 16)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 1
  ctx.stroke()
  // a band of the class colour along the top
  ctx.fillStyle = cls.color
  ctx.beginPath()
  ctx.roundRect(panel.x, panel.y, panel.w, 4, [16, 16, 0, 0])
  ctx.fill()

  // header: whose shelf, and the purse
  ctx.textAlign = 'left'
  ctx.fillStyle = '#8A97AD'
  ctx.font = `700 10px ${DISPLAY}`
  ctx.fillText('ARMORY', panel.x + 18, panel.y + 23)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `700 18px ${DISPLAY}`
  ctx.fillText(`${cls.name}`, panel.x + 18, panel.y + 42)
  const nameW = ctx.measureText(cls.name).width
  ctx.fillStyle = cls.color
  ctx.font = `700 10px ${DISPLAY}`
  ctx.fillText(cls.role.toUpperCase(), panel.x + 26 + nameW, panel.y + 41)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#FFD25A'
  ctx.font = `700 20px ${DISPLAY}`
  const purse = coins.toLocaleString('en-US')
  ctx.fillText(purse, panel.x + panel.w - 52, panel.y + 38)
  coinIcon(ctx, panel.x + panel.w - 62 - ctx.measureText(purse).width, panel.y + 31, 8)

  // close button
  const c = layout.close
  const overClose = inside(c, mouse.x, mouse.y)
  ctx.fillStyle = overClose ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'
  ctx.beginPath()
  ctx.roundRect(c.x, c.y, c.w, c.h, 8)
  ctx.fill()
  ctx.strokeStyle = '#C5CFDD'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(c.x + 10, c.y + 10)
  ctx.lineTo(c.x + c.w - 10, c.y + c.h - 10)
  ctx.moveTo(c.x + c.w - 10, c.y + 10)
  ctx.lineTo(c.x + 10, c.y + c.h - 10)
  ctx.stroke()

  for (const row of layout.rows) {
    const { rect: r, entry: e } = row
    const hover = inside(r, mouse.x, mouse.y)
    const can = !e.blocked
    ctx.fillStyle = hover && can ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.05)'
    ctx.beginPath()
    ctx.roundRect(r.x, r.y, r.w, r.h, 9)
    ctx.fill()
    if (hover && can) {
      ctx.strokeStyle = e.kind === 'gun' ? '#FFD25A' : e.kind === 'upgrade' ? '#7FB0FF' : '#6EE7A8'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    const mid = r.y + r.h / 2
    // hotkey
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.beginPath()
    ctx.roundRect(r.x + 7, mid - 9, 18, 18, 4)
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.fillStyle = can ? '#FFFFFF' : '#6B778A'
    ctx.font = `700 11px ${DISPLAY}`
    ctx.fillText(row.key, r.x + 16, mid + 4)

    ctx.globalAlpha = e.kind === 'gun' && !can ? 0.55 : 1
    rowIcon(ctx, e, r.x + 60, mid)
    ctx.globalAlpha = 1

    ctx.textAlign = 'left'
    ctx.fillStyle = can || e.kind === 'maxed' ? '#FFFFFF' : '#9FB0C8'
    ctx.font = `700 13px ${DISPLAY}`
    ctx.fillText(e.title, r.x + 96, mid - 1)
    ctx.fillStyle = '#8A97AD'
    ctx.font = `500 10.5px ${BODY}`
    ctx.fillText(e.note, r.x + 96, mid + 12)

    // what you have of it: upgrade pips and ammo
    if (e.weapon && p.owned[e.weapon]) {
      const def = WEAPONS[e.weapon]
      for (let i = 0; i < SHOP.maxLevel; i++) {
        ctx.fillStyle = i < e.level ? '#FFD25A' : 'rgba(255,255,255,0.16)'
        ctx.fillRect(r.x + r.w - 196 + i * 9, mid - 10, 6, 6)
      }
      ctx.textAlign = 'left'
      ctx.fillStyle = def.infinite ? '#6EE7A8' : p.ammo[e.weapon] > 0 ? '#C5CFDD' : '#FF8A93'
      ctx.font = `600 10px ${BODY}`
      ctx.fillText(def.infinite ? 'free ammo' : `${p.ammo[e.weapon]} / ${def.maxAmmo}`, r.x + r.w - 196, mid + 11)
    }

    // the price tag
    const tagW = 104
    const tx = r.x + r.w - tagW - 8
    const ty = mid - 12
    if (e.blocked === 'maxed' || e.blocked === 'full') {
      pill(ctx, tx, ty, tagW, 24, 'rgba(255,255,255,0.06)')
      ctx.textAlign = 'center'
      ctx.fillStyle = '#6B778A'
      ctx.font = `700 11px ${DISPLAY}`
      ctx.fillText(e.blocked === 'maxed' ? 'MAX' : 'FULL', tx + tagW / 2, mid + 4)
    } else {
      const tint = e.kind === 'gun' ? '#FFD25A' : e.kind === 'upgrade' ? '#7FB0FF' : '#6EE7A8'
      pill(ctx, tx, ty, tagW, 24, can ? tint : 'rgba(255,255,255,0.06)', can ? undefined : 'rgba(255,138,147,0.45)')
      ctx.textAlign = 'left'
      ctx.fillStyle = can ? '#0B1B3A' : '#FF8A93'
      ctx.font = `700 9px ${DISPLAY}`
      ctx.fillText(e.kind === 'gun' ? 'BUY' : e.kind === 'upgrade' ? 'UPGRADE' : 'BUY', tx + 10, mid + 3.5)
      ctx.textAlign = 'right'
      ctx.font = `700 13px ${DISPLAY}`
      ctx.fillText(String(e.price), tx + tagW - 22, mid + 4.5)
      coinIcon(ctx, tx + tagW - 12, mid, 5)
    }
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = '#8A97AD'
  ctx.font = `500 11px ${BODY}`
  ctx.fillText(solo ? 'The game is paused while you shop.   Number keys or click to buy   ·   B or Esc to close' : 'The fight goes on while you shop!   Number keys or click to buy   ·   B or Esc to close', VIEW_W / 2, panel.y + panel.h - 13)
  ctx.restore()
}
