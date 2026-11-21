import { useState } from 'react'
import { Gamepad2, Gift, Repeat, Skull, Store, Zap, type LucideIcon } from 'lucide-react'
import { AudioControls } from '@/components/AudioControls'
import { Atmosphere } from '@/components/Atmosphere'
import { ShellBackdrop } from '@/components/ShellBackdrop'
import { BoostShop } from '@/components/BoostShop'
import { BoxShop } from '@/components/BoxShop'
import { GameCanvas } from '@/components/GameCanvas'
import { MarketShop } from '@/components/MarketShop'
import { SkinShop } from '@/components/SkinShop'
import { TitleScreen } from '@/components/TitleScreen'
import { WalletBar } from '@/components/WalletBar'
import { useBoosts } from '@/hooks/useBoosts'
import { useCoop } from '@/hooks/useCoop'
import { useSkinShop } from '@/hooks/useSkinShop'

type View = 'play' | 'shop' | 'boosts' | 'boxes' | 'market'

const TABS: { view: View; label: string; icon: LucideIcon }[] = [
  { view: 'play', label: 'Play', icon: Gamepad2 },
  { view: 'shop', label: 'Skins', icon: Store },
  { view: 'boosts', label: 'Boosts', icon: Zap },
  { view: 'boxes', label: 'Boxes', icon: Gift },
  { view: 'market', label: 'Market', icon: Repeat },
]

export default function App() {
  const [entered, setEntered] = useState(false)
  const [view, setViewNow] = useState<View>('play')
  // every move between tabs plays a quick cut: a red wipe sweeps across and the new page snaps in
  const [wipe, setWipe] = useState(0)
  const setView = (next: View) => {
    if (next === view) return
    setViewNow(next)
    setWipe((n) => n + 1)
  }
  const shop = useSkinShop()
  const boosts = useBoosts()
  const coop = useCoop()

  // the cinematic title comes first; a co-op session that resumes after a reload skips straight to the game
  if (!entered && !coop.state.room) {
    return (
      <TitleScreen
        onStart={(next) => {
          setViewNow(next)
          setEntered(true)
        }}
      />
    )
  }

  return (
    <div className="relative min-h-dvh font-body text-white">
      {view !== 'play' && <ShellBackdrop />}
      <Atmosphere scene={view !== 'play'} />
      {wipe > 0 && (
        <div key={wipe} className="pointer-events-none fixed inset-0 z-20 overflow-hidden" aria-hidden>
          <div className="shell-anim absolute inset-y-0 -left-[60%] w-[60%] bg-[linear-gradient(90deg,transparent,rgba(255,75,87,0.55)_55%,#000_62%,#000_80%,transparent)] [animation:view-wipe_0.62s_cubic-bezier(.6,0,.3,1)_both]" />
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 px-4 sm:px-6">
          <button
            onClick={() => setEntered(false)}
            aria-label="Back to the title screen"
            className="group flex min-h-14 items-center gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF4B57] to-[#7A0A1A] shadow-[0_0_22px_rgba(255,75,87,0.55)] transition group-hover:scale-105">
              <Skull size={18} aria-hidden />
            </span>
            <span className="font-display text-[15px] font-bold uppercase leading-[1.05] tracking-[0.1em]">
              Zombie
              <span className="block text-[#FF4B57]">Outbreak</span>
            </span>
            <span className="ml-1 hidden items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300 lg:flex">
              <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden /> Arc Testnet
            </span>
          </button>

          <nav aria-label="Sections" className="order-last -mx-4 flex w-[calc(100%+2rem)] overflow-x-auto px-3 md:order-none md:mx-0 md:w-auto md:overflow-visible md:px-0">
            {TABS.map(({ view: v, label, icon: Icon }) => {
              const active = view === v
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-h-12 shrink-0 items-center gap-2 px-4 text-xs font-bold uppercase tracking-[0.16em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white ${active ? 'text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <Icon size={15} aria-hidden />
                  {label}
                  <span
                    className={`absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-[#FF4B57] shadow-[0_0_14px_#FF4B57] transition ${active ? 'scale-x-100 opacity-100' : 'scale-x-50 opacity-0'}`}
                    aria-hidden
                  />
                </button>
              )
            })}
          </nav>

          <div className="flex items-center gap-2 py-2">
            <AudioControls />
            <WalletBar />
          </div>
        </div>
      </header>

      <main key={view} className="shell-anim relative z-10 mx-auto max-w-5xl px-4 py-5 [animation:view-in_0.42s_0.12s_cubic-bezier(.2,.7,.2,1)_both] sm:px-6">
        {view === 'play' && <GameCanvas key={coop.state.room ? 'coop' : 'solo'} coop={coop} testAll={shop.isOwner && shop.testUnlock} />}
        {view === 'shop' && <SkinShop shop={shop} />}
        {view === 'boosts' && <BoostShop boosts={boosts} />}
        {view === 'boxes' && <BoxShop shop={shop} />}
        {view === 'market' && <MarketShop shop={shop} />}
      </main>

      <footer className="relative z-10 pb-20 pt-4 text-center text-xs text-slate-500">Testnet build. Test USDC has no value, and the contracts have not been independently audited.</footer>
    </div>
  )
}
