import { Crosshair, Flame, HeartPulse, PawPrint, Shield, Wind, type LucideIcon } from 'lucide-react'
import { CLASS_ORDER, CLASSES, type ClassId } from '@/game/classes'
import { WEAPONS } from '@/game/config'
import { PRICES } from '@/game/shop'

const ICONS: Record<ClassId, LucideIcon> = { tank: Shield, damage: Flame, agile: Wind, support: HeartPulse, sniper: Crosshair, summoner: PawPrint }

function Detail({ label, title, text, color }: { label: string; title: string; text: string; color: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-left">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="font-display text-sm font-bold leading-tight" style={{ color }}>
        {title}
      </p>
      <p className="mt-0.5 text-pretty text-[11px] leading-snug text-slate-300">{text}</p>
    </div>
  )
}

/**
 * Pick the character you fight as. Every class is open. Each has a passive talent, two skills (Shift or
 * Space, and E or the right mouse button) and its own shelf of guns in the shop.
 */
export function ClassPicker({ value, onChange, disabled = false }: { value: ClassId; onChange: (c: ClassId) => void; disabled?: boolean }) {
  const current = CLASSES[value] ?? CLASSES.agile
  const [first, second] = current.skills
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-2">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-slate-400">Your class</p>
      <div className="grid w-full grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Character class">
        {CLASS_ORDER.map((id) => {
          const c = CLASSES[id]
          const Icon = ICONS[id]
          const active = id === value
          return (
            <button
              key={id}
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(id)}
              className={`flex min-h-[76px] flex-col items-start gap-0.5 rounded-2xl border p-2.5 text-left transition active:scale-[0.98] disabled:opacity-50 ${
                active ? 'bg-white/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
              style={active ? { borderColor: c.color, boxShadow: `0 0 0 1px ${c.color}55, 0 0 22px -6px ${c.color}` } : undefined}
            >
              <Icon size={18} style={{ color: c.color }} aria-hidden />
              <span className="font-display text-sm font-bold leading-tight">{c.name}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: c.color }}>
                {c.role}
              </span>
            </button>
          )
        })}
      </div>
      <p className="max-w-2xl text-pretty text-xs text-slate-300">{current.blurb}</p>
      <div className="grid w-full gap-2 sm:grid-cols-3">
        <Detail label="Always on" title={current.passive.name} text={current.passive.blurb} color={current.color} />
        <Detail label={`Shift or Space · every ${first.cooldown}s`} title={first.name} text={first.blurb} color={current.color} />
        <Detail label={`E or right click · every ${second.cooldown}s`} title={second.name} text={second.blurb} color={current.color} />
      </div>
      <p className="max-w-2xl text-pretty text-xs text-slate-400">
        Starts with the <b className="text-slate-200">{WEAPONS[current.starter].label}</b> (free ammo). In the shop (B):{' '}
        {current.shop.map((w, i) => (
          <span key={w}>
            {i > 0 && ' · '}
            <b className="text-slate-200">{WEAPONS[w].label}</b> <span className="tabular-nums text-amber-200">{PRICES[w]}</span>
          </span>
        ))}
        . Every gun can be upgraded three times.
      </p>
    </div>
  )
}
