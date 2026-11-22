import { VIEW_W } from '@/game/config'
import type { Game } from '@/game/engine'
import type { SoundEvent, SoundType } from '@/game/types'
import { AudioEngine } from './engine'
import { Music, type MusicMode } from './music'
import { playSfx } from './sfx'

/** Sounds that can fire many times a second: at most one per this many seconds. */
const COOLDOWN: Partial<Record<SoundType, number>> = {
  hit: 0.05,
  zdie: 0.07,
  bite: 0.08,
  zattack: 0.12,
  groan: 0.1,
  sizzle: 0.35,
  killfx: 0.08,
  dash: 0.2,
  spit: 0.12,
  burst: 0.15,
  chant: 0.5,
  skill: 0.15,
  coin: 0.07,
  clang: 0.07,
  petbite: 0.09,
  scream: 0.4,
  lob: 0.15,
  leap: 0.15,
  deny: 0.2,
}

class GameAudio {
  readonly engine = new AudioEngine()
  private readonly music = new Music(this.engine)
  private lastPlayed = new Map<SoundType, number>()
  private groanTimer = 1
  private flame: ReturnType<AudioEngine['loopNoise']> = null
  private flameUntil = 0

  /** Call from any click or key press. */
  unlock() {
    this.engine.unlock()
    this.music.start()
  }

  /** Plays one game event, panned and softened by its distance from the player. */
  play(e: SoundEvent, game: Game) {
    const a = this.engine
    if (!a.ready) return
    const cd = COOLDOWN[e.type]
    if (cd !== undefined) {
      const last = this.lastPlayed.get(e.type) ?? -1
      if (a.now - last < cd) return
      this.lastPlayed.set(e.type, a.now)
    }
    try {
      this.playInner(e, game)
    } catch {
      // a sound problem must never stop the game
    }
  }

  private playInner(e: SoundEvent, game: Game) {
    const a = this.engine
    if (e.type === 'shot' && e.kind === 'flamer') {
      this.flameTick()
      return
    }
    let pan = 0
    let vol = 1
    if (e.x !== undefined && e.y !== undefined) {
      const dx = e.x - game.player.x
      const dy = e.y - game.player.y
      const d = Math.hypot(dx, dy)
      pan = Math.max(-1, Math.min(1, dx / (VIEW_W * 0.6)))
      vol = Math.max(0.08, 1 / Math.pow(1 + d / 380, 1.3))
    }
    if (!a.canPlay(e.type === 'shot' ? 56 : 44)) return
    playSfx(a, e, pan, vol)
  }

  private flameTick() {
    const a = this.engine
    if (!this.flame) this.flame = a.loopNoise()
    this.flame?.setLevel(0.5)
    this.flameUntil = a.now + 0.14
  }

  /** Once per frame: keeps music and ambient zombie voices in step with the game. */
  update(game: Game, dt: number) {
    try {
      this.updateInner(game, dt)
    } catch {
      // a sound problem must never stop the game
    }
  }

  private updateInner(game: Game, dt: number) {
    const a = this.engine
    if (!a.ready) return
    if (this.flame && a.now > this.flameUntil) this.flame.setLevel(0)

    let mode: MusicMode = 'explore'
    const boss = game.zombies.some((z) => z.kind === 'boss')
    const n = game.zombies.length
    if (game.status === 'ready') mode = 'menu'
    else if (game.status === 'over') mode = 'off'
    else if (game.status === 'cleared' || game.status === 'won') mode = 'victory'
    else if (boss) mode = 'boss'
    else if (n >= 8) mode = 'combat'
    this.music.set(mode, game.chapterIndex, Math.min(1, n / 30))

    if (game.status !== 'playing') return
    this.groanTimer -= dt
    if (this.groanTimer <= 0 && n > 0) {
      this.groanTimer = (0.7 + Math.random() * 1.6) / (1 + Math.min(1, n / 25))
      const near = game.zombies.filter((z) => Math.hypot(z.x - game.player.x, z.y - game.player.y) < 650)
      const z = near[Math.floor(Math.random() * near.length)]
      if (z) this.play({ type: 'groan', x: z.x, y: z.y, kind: z.kind }, game)
    }
  }

  /** The game screen went away (shop tab): fall back to the calm menu music. */
  toMenu() {
    this.music.set('menu', 0, 0)
    this.flame?.setLevel(0)
  }
}

export const audio = new GameAudio()
