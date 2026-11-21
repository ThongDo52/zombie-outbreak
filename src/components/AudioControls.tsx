import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { audio } from '@/audio'

/** Mute button (or press M) with music and effects volume sliders. */
export function AudioControls() {
  const [settings, setSettings] = useState(() => audio.engine.settings)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const change = (patch: Partial<typeof settings>) => {
    audio.unlock()
    audio.engine.update(patch)
    setSettings(audio.engine.settings)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyM' || e.repeat || (e.target instanceof HTMLInputElement && e.target.type === 'text')) return
      audio.unlock()
      audio.engine.update({ muted: !audio.engine.settings.muted })
      setSettings(audio.engine.settings)
    }
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [])

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => {
          audio.unlock()
          setOpen((o) => !o)
        }}
        aria-label="Sound settings"
        aria-expanded={open}
        className="grid size-11 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20 active:scale-95"
      >
        {settings.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 space-y-3 rounded-2xl border border-white/10 bg-[#0B1210]/95 p-4 text-sm text-white shadow-2xl backdrop-blur-xl">
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 font-medium">
            Sound on
            <input type="checkbox" checked={!settings.muted} onChange={(e) => change({ muted: !e.target.checked })} className="size-4 accent-[#FF4B57]" />
          </label>
          <label className="block space-y-1">
            <span className="flex justify-between text-slate-300">
              Music <span className="tabular-nums">{Math.round(settings.music * 100)}</span>
            </span>
            <input type="range" min={0} max={100} value={Math.round(settings.music * 100)} onChange={(e) => change({ music: Number(e.target.value) / 100 })} className="h-11 w-full accent-[#FF4B57]" />
          </label>
          <label className="block space-y-1">
            <span className="flex justify-between text-slate-300">
              Effects <span className="tabular-nums">{Math.round(settings.sfx * 100)}</span>
            </span>
            <input type="range" min={0} max={100} value={Math.round(settings.sfx * 100)} onChange={(e) => change({ sfx: Number(e.target.value) / 100 })} className="h-11 w-full accent-[#FF4B57]" />
          </label>
          <p className="text-xs text-slate-400">Press M to mute or unmute.</p>
        </div>
      )}
    </div>
  )
}
