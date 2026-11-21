import { Flame, HeartPulse, Shield, Wind, type LucideIcon } from 'lucide-react'
import { CLASS_ORDER, CLASSES, type ClassId } from '@/game/classes'

const ICONS: Record<ClassId, LucideIcon> = { tank: Shield, damage: Flame, agile: Wind, support: HeartPulse }

/** Pick the character you fight as. Every class is open, and each has its own skill on Shift or Space. */
export function ClassPicker({ value, onChange, disabled = false }: { value: ClassId; onChange: (c: ClassId) => void; disabled?: boolean }) {
  const current = CLASSES[value]
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-2">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-slate-400">Your class</p>
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Character class">
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
              className={`flex min-h-[84px] flex-col items-start gap-0.5 rounded-2xl border p-3 text-left transition active:scale-[0.98] disabled:opacity-50 ${
                active ? 'bg-white/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
              style={active ? { borderColor: c.color, boxShadow: `0 0 0 1px ${c.color}55, 0 0 22px -6px ${c.color}` } : undefined}
            >
              <span className="flex w-full items-center justify-between">
                <Icon size={18} style={{ color: c.color }} aria-hidden />
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{c.role}</span>
              </span>
              <span className="font-display text-sm font-bold leading-tight">{c.name}</span>
              <span className="text-[11px] font-medium" style={{ color: c.color }}>
                {c.skill}
              </span>
            </button>
          )
        })}
      </div>
      <p className="max-w-xl text-pretty text-xs text-slate-300">
        <b style={{ color: current.color }}>{current.skill}</b> on Shift or Space, ready again after {current.cooldown} seconds. {current.blurb}
      </p>
    </div>
  )
}
