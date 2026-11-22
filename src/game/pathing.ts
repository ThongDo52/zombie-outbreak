import { hitsObstacle, normalize } from './collision'
import type { Vec, Zombie } from './types'
import { activeMap } from './world'

/**
 * Zombie navigation. A flow field (breadth-first search from the player over a grid)
 * tells every zombie which neighbouring cell is closer to the player, so they walk around
 * walls and crates. When nothing blocks the way they simply run straight at you.
 * Two fields exist: one for normal bodies and one for the big ones (tanks, bloaters, broods, mortars, bosses), which need wider gaps.
 */
const CELL = 40
const BODY = { small: 30, large: 76 } as const
type Kind = keyof typeof BODY

interface Grid {
  cols: number
  rows: number
  ok: Uint8Array
}

const grids = new Map<string, Grid>()
const state: { mapIndex: number; cell: string; age: number; small: Int32Array; large: Int32Array } = {
  mapIndex: -1,
  cell: '',
  age: 0,
  small: new Int32Array(0),
  large: new Int32Array(0),
}

function gridFor(kind: Kind): Grid {
  const key = `${activeMap.index}:${kind}`
  const cached = grids.get(key)
  if (cached) return cached
  const cols = Math.ceil(activeMap.w / CELL)
  const rows = Math.ceil(activeMap.h / CELL)
  const size = BODY[kind]
  const ok = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * CELL
      const y = (r + 0.5) * CELL
      const inside = x >= size / 2 && y >= size / 2 && x <= activeMap.w - size / 2 && y <= activeMap.h - size / 2
      ok[r * cols + c] = inside && !hitsObstacle({ x: x - size / 2, y: y - size / 2, w: size, h: size }) ? 1 : 0
    }
  }
  const grid = { cols, rows, ok }
  grids.set(key, grid)
  return grid
}

function buildField(kind: Kind, starts: Array<[number, number]>): Int32Array {
  const { cols, rows, ok } = gridFor(kind)
  const dist = new Int32Array(cols * rows).fill(-1)
  const queue = new Int32Array(cols * rows)
  let head = 0
  let tail = 0
  for (const [pc, pr] of starts) {
    const start = pr * cols + pc
    if (dist[start] < 0) {
      dist[start] = 0
      queue[tail++] = start
    }
    if (ok[start]) continue
    // the player is hugging a wall: seed the closest free cells instead
    for (let ring = 1; ring <= 3; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue
          const c = pc + dc
          const r = pr + dr
          if (c < 0 || r < 0 || c >= cols || r >= rows) continue
          const i = r * cols + c
          if (ok[i] && dist[i] < 0) {
            dist[i] = ring
            queue[tail++] = i
          }
        }
      }
    }
  }
  while (head < tail) {
    const i = queue[head++]
    const c = i % cols
    const r = (i / cols) | 0
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const nc = c + dc
        const nr = r + dr
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
        const j = nr * cols + nc
        if (dist[j] >= 0 || !ok[j]) continue
        // no cutting corners through a wall
        if (dr !== 0 && dc !== 0 && (!ok[r * cols + nc] || !ok[nr * cols + c])) continue
        dist[j] = dist[i] + 1
        queue[tail++] = j
      }
    }
  }
  return dist
}

/** Refresh the flow fields when a player changes cell (and every so often). Zombies head for the nearest player. */
export function updateFlow(players: Vec[], dt: number) {
  state.age += dt
  const cols = Math.ceil(activeMap.w / CELL)
  const rows = Math.ceil(activeMap.h / CELL)
  const starts: Array<[number, number]> = players.map((p) => [
    Math.max(0, Math.min(cols - 1, Math.floor(p.x / CELL))),
    Math.max(0, Math.min(rows - 1, Math.floor(p.y / CELL))),
  ])
  const key = starts.map(([c, r]) => r * cols + c).join(',')
  if (state.mapIndex === activeMap.index && key === state.cell && state.age < 0.5) return
  state.mapIndex = activeMap.index
  state.cell = key
  state.age = 0
  if (starts.length === 0) return
  state.small = buildField('small', starts)
  state.large = buildField('large', starts)
}

/** True when a body of the given half-size can walk the straight line without touching a wall. */
export function clearPath(x0: number, y0: number, x1: number, y1: number, half: number): boolean {
  const dist = Math.hypot(x1 - x0, y1 - y0)
  const steps = Math.ceil(dist / 16)
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    if (hitsObstacle({ x: x - half, y: y - half, w: half * 2, h: half * 2 })) return false
  }
  return true
}

/**
 * Direction this zombie should walk to reach the player.
 * Also refreshes `z.los` (line of sight), which attacks use so zombies never bite through walls.
 */
export function chaseDir(z: Zombie, p: Vec, dt: number): Vec {
  z.losT = (z.losT ?? 0) - dt
  if (z.losT <= 0) {
    z.los = clearPath(z.x, z.y, p.x, p.y, z.w / 2 + 2)
    z.losT = 0.12 + Math.random() * 0.1
  }
  const direct = normalize(p.x - z.x, p.y - z.y)
  if (z.los) return direct

  // anything wider than the small field was built for follows the wide one, or it would wedge itself into a gap it cannot pass
  const kind: Kind = z.w > BODY.small ? 'large' : 'small'
  const field = state[kind]
  if (state.mapIndex !== activeMap.index || field.length === 0) return direct
  const { cols, rows, ok } = gridFor(kind)
  const c = Math.max(0, Math.min(cols - 1, Math.floor(z.x / CELL)))
  const r = Math.max(0, Math.min(rows - 1, Math.floor(z.y / CELL)))
  const own = field[r * cols + c]
  let bestD = own >= 0 ? own : Infinity
  let bc = -1
  let br = -1
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
      const j = nr * cols + nc
      const d = field[j]
      if (!ok[j] || d < 0 || d >= bestD) continue
      if (dr !== 0 && dc !== 0 && (!ok[r * cols + nc] || !ok[nr * cols + c])) continue
      bestD = d
      bc = nc
      br = nr
    }
  }
  if (bc < 0) return direct
  return normalize((bc + 0.5) * CELL - z.x, (br + 0.5) * CELL - z.y)
}
