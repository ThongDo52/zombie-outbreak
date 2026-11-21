/** Run clock text: 03:42 (or 03:42.7 when tenths are shown). */
export function formatClock(seconds: number, tenths = false): string {
  const t = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return tenths ? `${base}.${Math.floor((t * 10) % 10)}` : base
}
