import { useState } from 'react'
import { ChevronRight, Lock, Play, RotateCcw, Skull, Swords, Trophy, Users } from 'lucide-react'
import { CHAPTERS } from '@/game/chapters'
import { WEAPONS } from '@/game/config'
import { DIFFICULTIES, DIFFICULTY, type Difficulty } from '@/game/difficulty'
import { isTrialOpen, isUnlocked, storyKey, survivalKey, trialKey, type Progress, type RecordResult, type Records } from '@/game/save'
import { formatClock } from '@/game/time'
import { TRIALS } from '@/game/trials'
import type { GameStatus, GameSummary, SavedRun, WeaponId } from '@/game/types'
import { ALL_MAPS } from '@/game/world'
import { ClassPicker } from './ClassPicker'
import { GunIcon } from './GunIcon'
import type { ClassId } from '@/game/classes'

interface Props {
  status: Exclude<GameStatus, 'playing'>
  summary: GameSummary
  saved: SavedRun | null
  best: number
  progress: Progress
  /** Personal bests: fastest clears and longest survivals. */
  records: Records
  /** How the run that just ended compares with the old best. */
  record: RecordResult | null
  /** Heavy weapons earned so far. */
  armory: WeaponId[]
  /** Co-op: a room is running, so retry and next belong to the host. */
  isGuest?: boolean
  /** Co-op: anyone in a room (host or guest). */
  inRoom?: boolean
  /** The class you fight as, and how to change it. */
  cls: ClassId
  onClass: (cls: ClassId) => void
  onStart: (chapter: number, difficulty: Difficulty) => void
  onSurvival: (chapter: number, difficulty: Difficulty) => void
  onResume: () => void
  onNext: () => void
  onMenu: () => void
  onCoop: () => void
  onTrial: (trial: number) => void
}

const PRIMARY = 'flex min-h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#0B1B3A] transition active:scale-95'
const GHOST = 'flex min-h-11 items-center gap-2 rounded-full border border-white/30 px-6 text-sm font-semibold text-white transition active:scale-95'

/** Boss names are stored in capitals for the boss bar; menus show them in title case. */
const bossName = (name: string) => name.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())

/** The run clock with how it stacks up against your best. */
function TimeLine({ time, record, label }: { time: number; record: RecordResult | null; label: string }) {
  return (
    <p className="flex flex-wrap items-center justify-center gap-2 text-sm text-slate-300 tabular-nums">
      <span>
        {label} <b className="font-display text-lg text-white">{formatClock(time, true)}</b>
      </span>
      {record?.isNew && <span className="rounded-full bg-amber-300 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#3A2600]">New best</span>}
      {record && !record.isNew && <span className="text-slate-400">Best {formatClock(record.best, true)}</span>}
    </p>
  )
}

export function ChapterOverlay({ status, summary, saved, best, progress, records, record, armory, isGuest, inRoom, cls, onClass, onStart, onSurvival, onResume, onNext, onMenu, onCoop, onTrial }: Props) {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [survival, setSurvival] = useState(false)
  const isTrial = summary.chapter >= CHAPTERS.length
  const trialIndex = summary.chapter - CHAPTERS.length
  const chapter = ALL_MAPS[summary.chapter] ?? CHAPTERS[0]
  const next = isTrial ? undefined : CHAPTERS[summary.chapter + 1]
  const tier = DIFFICULTY[summary.difficulty]

  return (
    <div className="absolute inset-2 flex flex-col items-center gap-4 overflow-y-auto before:flex-1 after:flex-1 rounded-2xl bg-[#0B1210]/88 p-4 text-center text-white backdrop-blur-sm sm:p-6">
      {status === 'ready' && (
        <>
          <h2 className="font-display text-balance text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Zombie Outbreak</h2>
          <p className="max-w-md text-pretty text-sm text-slate-300">
            Fight through seven chapters, alone or with up to three friends. Pick a class, earn coins from every kill, and spend them in the shop (B) on that class's guns and upgrades.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-slate-300">
            {best > 0 && (
              <span className="flex items-center gap-1.5 tabular-nums">
                <Trophy size={14} /> Best score {best}
              </span>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {saved && (
              <button onClick={onResume} className="flex min-h-11 items-center gap-2 rounded-full bg-[#FF4B57] px-6 text-sm font-semibold text-white transition active:scale-95">
                <Play size={16} />
                Continue run
                <span className="text-white/70 tabular-nums">
                  {saved.survival ? 'Survival' : `Chapter ${saved.chapterIndex + 1}`} · Wave {saved.wave}
                </span>
              </button>
            )}
            <button onClick={onCoop} className={GHOST}>
              <Users size={16} /> Play together
            </button>
          </div>

          <ClassPicker value={cls} onChange={onClass} />

          <div className="flex gap-1 rounded-full bg-white/10 p-1" role="group" aria-label="Mode">
            {([false, true] as const).map((v) => (
              <button
                key={String(v)}
                onClick={() => setSurvival(v)}
                aria-pressed={survival === v}
                className={`min-h-11 rounded-full px-5 text-sm font-semibold transition ${survival === v ? 'bg-[#FF4B57] text-white' : 'text-slate-300 hover:text-white'}`}
              >
                {v ? 'Survival' : 'Story'}
              </button>
            ))}
          </div>
          <p className="max-w-md text-pretty text-xs text-slate-400">
            {survival ? 'One map, endless waves that never stop getting harder. The clock keeps your record.' : 'Clear every wave and the chapter boss. The clock keeps your fastest time.'}
          </p>

          <div className="flex gap-1 rounded-full bg-white/10 p-1" role="group" aria-label="Difficulty">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`min-h-11 rounded-full px-4 text-sm font-semibold transition ${difficulty === d ? 'bg-white text-[#0B1B3A]' : 'text-slate-300 hover:text-white'}`}
                style={difficulty === d ? undefined : { color: DIFFICULTY[d].color }}
              >
                {DIFFICULTY[d].label}
              </button>
            ))}
          </div>
          <p className="max-w-md text-pretty text-xs text-slate-400">{DIFFICULTY[difficulty].blurb}</p>

          <div className="grid w-full max-w-3xl grid-cols-2 gap-2 sm:grid-cols-4">
            {CHAPTERS.map((c, i) => {
              const open = isUnlocked(progress, i, difficulty)
              const cleared = progress[i] ?? []
              return (
                <button
                  key={c.id}
                  disabled={!open}
                  onClick={() => (survival ? onSurvival(i, difficulty) : onStart(i, difficulty))}
                  className={`flex min-h-24 flex-col items-start gap-1 rounded-2xl border p-3 text-left transition active:scale-[0.98] ${
                    open ? 'border-white/20 bg-white/10 hover:bg-white/15' : 'border-white/10 bg-white/5 opacity-50'
                  }`}
                >
                  <span className="flex w-full items-center justify-between text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">
                    Chapter {c.id}
                    {!open ? (
                      <Lock size={12} aria-label="Locked" />
                    ) : (
                      <span className="flex gap-1" aria-label={`Cleared: ${cleared.join(', ') || 'none'}`}>
                        {DIFFICULTIES.map((d) => (
                          <span key={d} className="size-2 rounded-full" style={{ background: cleared.includes(d) ? DIFFICULTY[d].color : 'rgba(255,255,255,0.18)' }} />
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="font-display text-sm font-bold leading-tight">{c.name}</span>
                  <span className="text-[11px] text-slate-300">
                    {survival ? 'Endless waves' : `${c.waves} waves · ${bossName(c.boss.name)}`}
                  </span>
                  {(() => {
                    const r = records[survival ? survivalKey(i, difficulty) : storyKey(i, difficulty)]
                    return r ? (
                      <span className="text-[11px] font-semibold tabular-nums text-amber-200">
                        Best {formatClock(r.time)}{survival ? ` · wave ${r.wave}` : ''}
                      </span>
                    ) : null
                  })()}
                </button>
              )
            })}
          </div>

          <div className="w-full max-w-3xl">
            <p className="mb-2 flex items-center justify-center gap-1.5 text-xs font-medium uppercase tracking-[0.1em] text-amber-200">
              <Swords size={13} /> Armory trials
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {TRIALS.map((t, i) => {
                const open = isTrialOpen(progress, i)
                const weapon = t.trial!.weapon
                const have = armory.includes(weapon)
                return (
                  <button
                    key={t.id}
                    disabled={!open}
                    onClick={() => onTrial(i)}
                    className={`flex min-h-24 items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.98] ${
                      open ? 'border-amber-300/40 bg-amber-300/10 hover:bg-amber-300/15' : 'border-white/10 bg-white/5 opacity-50'
                    }`}
                  >
                    <GunIcon id={weapon as Exclude<WeaponId, 'fists'>} locked={!have} width={72} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">{t.trial!.title}</span>
                      <span className="font-display text-sm font-bold leading-tight">{t.name}</span>
                      <span className="text-[11px] text-slate-300">
                        {have ? `${WEAPONS[weapon].label} unlocked` : open ? `Beat ${t.boss.name}` : `Clear chapter ${t.trial!.requires + 1} first`}
                      </span>
                      {records[trialKey(i)] && <span className="text-[11px] font-semibold tabular-nums text-amber-200">Best {formatClock(records[trialKey(i)].time)}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {status === 'over' && (
        <>
          <Skull size={28} className="text-red-300" />
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-red-300">{inRoom ? 'Everyone went down' : summary.survival ? 'Survival over' : 'You were overrun'}</p>
          {summary.survival ? (
            <>
              <p className="font-display text-6xl font-bold tracking-[-0.03em] tabular-nums">{formatClock(summary.time)}</p>
              <TimeLine time={summary.time} record={record} label="You lasted" />
              <p className="text-sm text-slate-300 tabular-nums">
                {chapter.name} · <span style={{ color: tier.color }}>{tier.label}</span> · Wave {summary.wave} · {summary.kills} kills · Score {summary.score}
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-5xl font-bold tracking-[-0.03em] tabular-nums">{summary.score}</p>
              <p className="text-sm text-slate-300 tabular-nums">
                {chapter.name} · {!isTrial && <span style={{ color: tier.color }}>{tier.label} · </span>}Wave {summary.wave}/{chapter.waves} · {summary.kills} kills · Best {best} · {formatClock(summary.time)}
              </p>
            </>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {!isGuest && (
              <button onClick={() => (isTrial ? onTrial(trialIndex) : summary.survival && !inRoom ? onSurvival(summary.chapter, summary.difficulty) : onStart(summary.chapter, summary.difficulty))} className={PRIMARY}>
                <RotateCcw size={16} /> {isTrial ? 'Retry trial' : summary.survival ? 'Survive again' : `Retry chapter ${chapter.id}`}
                <span className="text-[#0B1B3A]/50">Enter</span>
              </button>
            )}
            {!isGuest && <button onClick={onMenu} className={GHOST}>{inRoom ? 'Back to lobby' : 'Chapters'}</button>}
          </div>
          {isGuest && <p className="text-xs text-slate-400">The host can start another run.</p>}
        </>
      )}

      {status === 'cleared' && isTrial && (
        <>
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-emerald-300">{chapter.trial?.title} cleared</p>
          {summary.unlocked && summary.unlocked !== 'fists' && (
            <div className="flex w-full max-w-sm flex-col items-center gap-2 rounded-2xl border border-amber-300/40 bg-amber-300/10 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-amber-200">Heavy weapon unlocked</p>
              <GunIcon id={summary.unlocked} width={160} />
              <p className="font-display text-2xl font-bold">{WEAPONS[summary.unlocked].label}</p>
              <p className="text-pretty text-sm text-slate-300">It comes with you into every run from now on, whatever class you play, and can be upgraded in the shop.</p>
            </div>
          )}
          <p className="font-display text-4xl font-bold tracking-[-0.03em] tabular-nums">{summary.score}</p>
          <TimeLine time={summary.time} record={record} label="Trial time" />
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={onMenu} className={PRIMARY}>
              Back to the menu
            </button>
            <button onClick={() => onTrial(trialIndex)} className={GHOST}>
              <RotateCcw size={16} /> Replay trial
            </button>
          </div>
        </>
      )}

      {status === 'cleared' && !isTrial && next && (
        <>
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-emerald-300">
            Chapter {chapter.id} cleared on <span style={{ color: tier.color }}>{tier.label}</span>
          </p>
          <p className="font-display text-5xl font-bold tracking-[-0.03em] tabular-nums">{summary.score}</p>
          <TimeLine time={summary.time} record={record} label="Clear time" />
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/10 p-4 text-left">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">Up next</p>
            <p className="font-display text-lg font-bold">{next.name}</p>
            <p className="text-pretty text-sm text-slate-300">{next.subtitle}</p>
            <p className="mt-2 text-sm font-semibold text-amber-300">Boss: {bossName(next.boss.name)}. Your coins, guns and upgrades come with you.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {!isGuest && (
              <button onClick={onNext} className={PRIMARY}>
                Start chapter {next.id} <ChevronRight size={16} />
                <span className="text-[#0B1B3A]/50">Enter</span>
              </button>
            )}
            {!isGuest && <button onClick={onMenu} className={GHOST}>{inRoom ? 'Back to lobby' : 'Chapters'}</button>}
          </div>
          {isGuest && <p className="text-xs text-slate-400">Waiting for the host to start the next chapter.</p>}
        </>
      )}

      {status === 'won' && (
        <>
          <Trophy size={30} className="text-amber-300" />
          <h2 className="font-display text-balance text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Humanity survives</h2>
          <p className="text-sm text-slate-300">
            You cleared all seven chapters on <span style={{ color: tier.color }}>{tier.label}</span> and put Patient Zero down.
          </p>
          <p className="font-display text-5xl font-bold tracking-[-0.03em] tabular-nums">{summary.score}</p>
          <TimeLine time={summary.time} record={record} label="Final chapter time" />
          <p className="text-sm text-slate-300 tabular-nums">
            {summary.kills} kills · Best {best}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {!isGuest && (
              <button onClick={() => onStart(0, summary.difficulty)} className={PRIMARY}>
                <RotateCcw size={16} /> Play again
                <span className="text-[#0B1B3A]/50">Enter</span>
              </button>
            )}
            {!isGuest && <button onClick={onMenu} className={GHOST}>{inRoom ? 'Back to lobby' : 'Chapters'}</button>}
          </div>
        </>
      )}
    </div>
  )
}
