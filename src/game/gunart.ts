import type { WeaponId } from './types'

/** Horizontal extent [start, end] of each gun, with the grip at x = 0. */
const BOUNDS: Record<Exclude<WeaponId, 'fists'>, [number, number]> = {
  pistol: [-3, 18],
  wand: [-6, 27],
  smg: [-4, 30],
  shotgun: [-14, 38],
  rifle: [-16, 44],
  sniper: [-18, 52],
  flamer: [-14, 40],
  launcher: [-12, 38],
  minigun: [-12, 44],
  railgun: [-10, 46],
  venom: [-10, 48],
  tesla: [-10, 50],
  cryo: [-10, 48],
}

export interface GunPalette {
  metal: string
  light: string
  wood: string
  dark: string
}

const DEFAULT_PALETTE: GunPalette = { metal: '#2B3442', light: '#8E9BB2', wood: '#8B5A2B', dark: '#1B222C' }

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
  ctx.fillStyle = fill
  ctx.fillRect(x, y, w, h)
}

/** Draws a gun pointing along +x with its grip at the origin. */
export function drawGun(ctx: CanvasRenderingContext2D, id: WeaponId, palette: GunPalette = DEFAULT_PALETTE) {
  const METAL = palette.metal
  const LIGHT = palette.light
  const WOOD = palette.wood
  const DARK = palette.dark
  switch (id) {
    case 'pistol':
      box(ctx, -3, 0, 6, 9, DARK)
      box(ctx, -3, -4, 21, 6, LIGHT)
      box(ctx, -3, -4, 21, 2, '#C3CDDD')
      box(ctx, 14, -2, 4, 4, METAL)
      break
    case 'wand': {
      // a short carved staff: bound grip, a silver setting and a crystal that glows
      box(ctx, -6, -2, 22, 4, WOOD)
      box(ctx, -6, -2, 22, 1.2, 'rgba(255,255,255,0.2)')
      box(ctx, -1, -3, 3, 6, DARK)
      box(ctx, 6, -3, 2, 6, DARK)
      box(ctx, 14, -4, 4, 8, LIGHT)
      ctx.fillStyle = '#B98CFF'
      ctx.beginPath()
      ctx.moveTo(17, 0)
      ctx.lineTo(22, -5)
      ctx.lineTo(27, 0)
      ctx.lineTo(22, 5)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#F4E8FF'
      ctx.beginPath()
      ctx.moveTo(19.5, 0)
      ctx.lineTo(22, -2.6)
      ctx.lineTo(24.5, 0)
      ctx.lineTo(22, 2.6)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'sniper':
      // long barrel, a scope with a blue lens, a folded bipod
      box(ctx, -18, -3, 15, 7, WOOD)
      box(ctx, -18, -3, 5, 10, WOOD)
      box(ctx, -4, -4, 27, 7, METAL)
      box(ctx, -4, -4, 27, 2, LIGHT)
      box(ctx, 23, -2, 25, 3, DARK)
      box(ctx, 47, -3.5, 5, 6, METAL)
      box(ctx, 1, -10.5, 21, 4.5, '#10151F')
      box(ctx, 4, -6, 2.5, 2.5, '#10151F')
      box(ctx, 16, -6, 2.5, 2.5, '#10151F')
      box(ctx, 20, -10, 2.5, 3.5, '#7FD0FF')
      box(ctx, 8, 3, 5, 9, DARK)
      box(ctx, 31, 1, 2, 7, DARK)
      break
    case 'smg':
      box(ctx, -4, -4, 24, 8, METAL)
      box(ctx, -4, -4, 24, 2, LIGHT)
      box(ctx, 20, -2, 10, 4, DARK)
      box(ctx, 3, 4, 6, 12, DARK)
      box(ctx, -3, 3, 5, 7, DARK)
      break
    case 'shotgun':
      box(ctx, -14, -3, 13, 8, WOOD)
      box(ctx, -1, -4, 12, 7, METAL)
      box(ctx, 10, -3, 28, 3, LIGHT)
      box(ctx, 10, 0, 24, 3, METAL)
      box(ctx, 16, -1, 10, 6, WOOD)
      break
    case 'rifle':
      box(ctx, -16, -3, 14, 9, WOOD)
      box(ctx, -3, -4, 30, 7, METAL)
      box(ctx, -3, -4, 30, 2, LIGHT)
      box(ctx, 27, -2, 17, 3, DARK)
      box(ctx, 5, -9, 14, 4, '#10151F')
      box(ctx, 7, -7, 2, 3, '#10151F')
      box(ctx, 14, 3, 5, 10, DARK)
      break
    case 'flamer':
      box(ctx, -14, -5, 14, 10, '#8A3B2B')
      box(ctx, -12, -8, 10, 4, '#E8C34A')
      box(ctx, 0, -3, 30, 6, METAL)
      box(ctx, 30, -4, 8, 8, DARK)
      box(ctx, 38, -2, 3, 4, '#FF8A3C')
      box(ctx, 8, 3, 7, 8, DARK)
      break
    case 'launcher':
      box(ctx, -12, -4, 12, 8, WOOD)
      box(ctx, -2, -6, 34, 12, '#3E5230')
      box(ctx, -2, -6, 34, 3, '#6B8A52')
      box(ctx, 30, -7, 8, 14, DARK)
      box(ctx, 8, 6, 6, 8, DARK)
      box(ctx, 14, -10, 8, 4, '#10151F')
      break
    case 'minigun':
      box(ctx, -12, -4, 10, 8, WOOD)
      box(ctx, -3, -6, 20, 12, METAL)
      box(ctx, -3, -6, 20, 2, LIGHT)
      box(ctx, 17, -6, 24, 3, LIGHT)
      box(ctx, 17, -1.5, 27, 3, DARK)
      box(ctx, 17, 3, 24, 3, LIGHT)
      box(ctx, 38, -7, 3, 14, DARK)
      box(ctx, 4, 6, 12, 8, DARK)
      break
    case 'railgun':
      box(ctx, -10, -4, 20, 9, METAL)
      box(ctx, -10, -4, 20, 2, LIGHT)
      box(ctx, 10, -5, 36, 3, '#9FEFFF')
      box(ctx, 10, 2, 36, 3, '#9FEFFF')
      box(ctx, 10, -1, 36, 2, '#E8FFFF')
      for (const x of [14, 24, 34]) box(ctx, x, -6, 3, 13, DARK)
      box(ctx, -2, 5, 6, 9, DARK)
      break
    case 'venom':
      box(ctx, -10, -5, 24, 10, METAL)
      box(ctx, -10, -5, 24, 2, LIGHT)
      box(ctx, 0, -11, 16, 7, '#4CB82A')
      box(ctx, 2, -10, 12, 2, '#B6FF6B')
      box(ctx, 14, -3, 26, 6, DARK)
      box(ctx, 38, -6, 8, 12, LIGHT)
      box(ctx, 41, -2, 4, 4, '#C8FF5A')
      box(ctx, -2, 5, 6, 9, DARK)
      break
    case 'tesla':
      box(ctx, -10, -4, 22, 9, METAL)
      box(ctx, -10, -4, 22, 2, LIGHT)
      box(ctx, 12, -1.5, 34, 3, '#BFF3FF')
      for (const x of [16, 25, 34]) box(ctx, x, -7, 3, 14, '#C77A3C')
      box(ctx, 44, -4, 6, 8, '#E8FFFF')
      box(ctx, 46, -2, 3, 4, '#7FE8FF')
      box(ctx, -2, 5, 6, 9, DARK)
      break
    case 'cryo':
      box(ctx, -10, -5, 24, 10, METAL)
      box(ctx, -10, -5, 24, 2, LIGHT)
      box(ctx, 2, -12, 14, 7, '#7FD6FF')
      box(ctx, 4, -11, 10, 2, '#EFFFFF')
      box(ctx, 14, -4, 24, 8, LIGHT)
      for (const x of [20, 27, 34]) box(ctx, x, -8, 3, 4, '#DFF8FF')
      box(ctx, 38, -3, 10, 6, '#EFFFFF')
      box(ctx, -2, 5, 6, 9, DARK)
      break
    default:
      break
  }
}

/** Draws a gun scaled to fit `width` pixels, centered on (cx, cy). */
export function drawGunCentered(ctx: CanvasRenderingContext2D, id: Exclude<WeaponId, 'fists'>, cx: number, cy: number, width: number, palette?: GunPalette) {
  const [a, b] = BOUNDS[id]
  const s = width / (b - a)
  ctx.save()
  ctx.translate(cx - ((a + b) / 2) * s, cy)
  ctx.scale(s, s)
  drawGun(ctx, id, palette)
  ctx.restore()
}
