import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'
import type { Control } from '@/game/types'

interface Props {
  onMove: (c: Control, down: boolean) => void
  onFire: (down: boolean) => void
  skillLabel: string
  onSkill: () => void
  onSwitch: () => void
  onHeal: () => void
  onArmor: () => void
}

const PAD = 'flex h-14 w-14 touch-none select-none items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white backdrop-blur active:bg-[#FF4B57]'
const BTN = 'min-h-11 touch-none select-none rounded-full px-5 text-sm font-semibold active:scale-95'

function Dir({ c, onMove, children }: { c: Control; onMove: Props['onMove']; children: React.ReactNode }) {
  return (
    <button
      aria-label={c}
      className={PAD}
      onPointerDown={() => onMove(c, true)}
      onPointerUp={() => onMove(c, false)}
      onPointerLeave={() => onMove(c, false)}
      onPointerCancel={() => onMove(c, false)}
    >
      {children}
    </button>
  )
}

export function TouchControls({ onMove, onFire, skillLabel, onSkill, onSwitch, onHeal, onArmor }: Props) {
  return (
    <div className="flex items-end justify-between gap-4 md:hidden">
      <div className="grid grid-cols-3 gap-1.5">
        <span />
        <Dir c="up" onMove={onMove}><ArrowUp size={20} /></Dir>
        <span />
        <Dir c="left" onMove={onMove}><ArrowLeft size={20} /></Dir>
        <Dir c="down" onMove={onMove}><ArrowDown size={20} /></Dir>
        <Dir c="right" onMove={onMove}><ArrowRight size={20} /></Dir>
      </div>
      <div className="flex flex-col gap-2">
        <button
          className={`${BTN} h-14 bg-[#C62F3B] text-white`}
          onPointerDown={() => onFire(true)}
          onPointerUp={() => onFire(false)}
          onPointerLeave={() => onFire(false)}
          onPointerCancel={() => onFire(false)}
        >
          Fire (auto-aim)
        </button>
        <div className="flex gap-2">
          <button className={`${BTN} flex-1 border border-white/15 bg-white/10 text-white backdrop-blur`} onPointerDown={onSwitch}>Swap</button>
          <button className={`${BTN} flex-1 border border-white/15 bg-white/10 text-white backdrop-blur`} onPointerDown={onSkill}>{skillLabel}</button>
        </div>
        <div className="flex gap-2">
          <button className={`${BTN} flex-1 bg-emerald-600/80 text-white`} onPointerDown={onHeal}>Heal</button>
          <button className={`${BTN} flex-1 bg-blue-600/80 text-white`} onPointerDown={onArmor}>Armor</button>
        </div>
      </div>
    </div>
  )
}
