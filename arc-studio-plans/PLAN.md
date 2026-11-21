## Implementation Plan: Zombie Outbreak, Chapters 5 to 7, Difficulty Tiers and Online Co-op

### Summary
Add three new story chapters (5 to 7) and a Normal, Hard and Extreme tier for every chapter. Wallet-connected players can also create or join a room by a 5-letter code and fight together, 2 to 4 per room. The game server runs in this workspace and friends join through the same preview link.

### Architecture
- **Blockchain:** Arc Testnet. **No new contract.** The server verifies a wallet signature at join, then reads the existing contracts: skins from ArenaSkins and ArenaBoxes, boost credits from ArenaBoosts. Equipped skins and boost charges that a player claims are accepted only if the wallet really owns them. Owner test mode never counts in co-op.
- **Chapters 5 to 7:**
  - Ch5 Sunken Metro: tunnels, tiny light radius, electrified rails (new `electric` hazard).
  - Ch6 Quarantine Rooftops: rooftop maze of walls and gaps, wind and ember weather, fire hazards.
  - Ch7 Patient Zero Lab: biolab, toxic and electric hazards, final boss with three phases.
  - New guns: Minigun (ch5) and Railgun (ch6). Ch7 loot uses every gun.
  - Waves per chapter: 8, 9, 10. Chapter 7 final wave spawns two bosses.
- **Difficulty:** `normal | hard | extreme`, applied to all 7 chapters through a multiplier table: zombie count, health, speed, damage, spawn rate, hazard damage, heal between waves, boss health and boss abilities. Hard: boss summons at 75, 50 and 25% health and attacks 15% faster. Extreme: zombies stronger, no heal between waves, fewer pickups, boss enrages at 50% and attacks 30% faster. Unlock is sequential per chapter: clear Normal to open Hard, clear Hard to open Extreme. Clearing any tier of a chapter opens the next chapter on Normal. Progress is stored per wallet in the browser; existing saves are migrated.
- **Co-op server:** `server/coop.ts` runs on Bun with built-in WebSockets (port 5174) and runs the same game engine headless as the single source of truth at 60 ticks per second. It sends snapshots at 20 per second and receives each player's input (move, aim, fire, dash, weapon swap, heal, armor) at 30 per second. The Vite dev server auto-starts it and proxies `/coop` to it, so the preview link carries the WebSocket and nothing else needs running. Rooms live in memory, so a server restart ends the session.
- **Engine becomes multi-player.** One code path for solo and co-op (solo is a room of one):
  - `players` list instead of one `player`. Per-player input, skin, boost charges and camera.
  - Zombies chase the nearest living player. The path field starts from every living player at once.
  - Pickups are taken by whoever touches them first. Extra Life, Heal and Armor apply per player.
  - Scaling by room size: zombie count x(1 + 0.6 per extra player), boss health x(1 + 0.8 per extra player).
  - Downed and revive: at 0 health a player goes down (not dead). A teammate standing within about 60 px for 3 seconds revives them with 40% health. Game over only when everyone is down. A downed player spectates the nearest living teammate.
- **Co-op client:** `src/net` connects, signs the join challenge with the wallet and sends input. It keeps a replica of the game state built from snapshots and interpolates about 100 ms behind. The existing render, HUD and audio code draw it unchanged. The server also sends events (sounds, hit effects, floating text) so audio and visuals match solo play.
- **Rooms:** create gives a code like K7QD2. Lobby shows each player's wallet short address, skin preview and ready state. Host picks chapter and difficulty and starts. Max 4. Dropped players keep their slot for 30 seconds. Guests without a wallet are refused.
- **Frontend:** the existing React and Tailwind app plus ConnectKit and wagmi. A "Play together" screen sits beside the current chapter select.

### Files to Create/Modify
1. `src/game/difficulty.ts` (new): difficulty ids, multiplier table, per-tier boss ability flags.
2. `src/game/chapters.ts`: add the three new chapter entries to the chapter list and the cumulative level offsets.
3. `src/game/chapters-late.ts` (new): map data for ch5 to 7 (obstacles, roads, hazards, themes, bosses).
4. `src/game/config.ts`, `src/game/types.ts`: Minigun and Railgun weapons, `electric` hazard kind, player id, `down` state, difficulty field on the run.
5. `src/game/gunart.ts`, `src/game/sprites.ts`, `src/game/scenery.ts`, `src/game/fx.ts`: gun art for the new weapons, electric hazard and weather visuals, teammate nameplates and revive ring.
6. `src/game/engine.ts`: multi-player rewrite, difficulty-aware waves, down and revive, event queue, `snapshot()` and `applySnapshot()`.
7. `src/game/zombies.ts`, `src/game/boss.ts`, `src/game/pathing.ts`: nearest-player targeting, multi-source path field, Hard and Extreme boss abilities, final-boss phases.
8. `src/game/pickups.ts`, `src/game/waves.ts`: per-player pickups and boost charges, room-size and difficulty scaling.
9. `src/game/save.ts`: per-chapter, per-tier progress, migration of the old unlocked count, solo save kept.
10. `src/game/render.ts`, `src/game/hud.ts`: draw all players, teammate bars, minimap dots, spectate view, boss bar per boss, difficulty badge.
11. `src/audio/sfx.ts`: Minigun and Railgun sounds, revive, electric hazard.
12. `src/net/protocol.ts` (new): shared message and snapshot types, used by server and client.
13. `src/net/coopClient.ts` (new): WebSocket client, wallet signature, snapshot interpolation, input sender, reconnect.
14. `server/coop.ts` (new): Bun WebSocket server, room manager, 60 Hz loop and 20 Hz snapshots.
15. `server/auth.ts` (new): nonce, `verifyMessage`, onchain ownership and boost-credit checks with viem, cached for 60 s.
16. `vite.config.ts`: `/coop` WebSocket proxy and a small plugin that starts and stops the Bun server with the dev server.
17. `package.json`: `coop` script for running the server alone.
18. `src/components/ChapterOverlay.tsx`: seven chapters, Normal, Hard and Extreme chips with lock state, "Play together" entry.
19. `src/components/CoopLobby.tsx` (new): create or join by code, player list, ready, host controls, start.
20. `src/components/GameCanvas.tsx`, `src/components/TouchControls.tsx`: run either the local game or a co-op session, leave-room button, touch controls unchanged.
21. `src/hooks/useCoop.ts` (new): room state, join flow, equipped skins and boost charges to send.
22. `README.md`, `AGENTS.md`: how to play co-op, the server, difficulty rules.

### Build Sequence
1. Difficulty and progress: `difficulty.ts`, save migration, tier chips and unlock rules on the chapter select. Solo works on all existing chapters first.
2. New content: Minigun, Railgun, electric hazard, sounds, then chapters 5 to 7 with their maps, bosses and the three-phase final boss. Validate each map (spawn free, all areas reachable, boss-sized gaps) with a script like before.
3. Multi-player engine: convert the engine to a player list, nearest-target zombies, multi-source paths, per-player pickups and boosts, down and revive, room-size scaling. Solo behaves exactly as today.
4. Headless tests: simulate 1 to 4 players on all 7 chapters and 3 tiers: no crashes, revive works, all-down ends the run, boss phases trigger.
5. Server: snapshot and event format, room manager, tick loop, wallet auth and ownership checks. Test with 2 to 4 scripted clients using throwaway keys.
6. Client: `coopClient`, snapshot replica, interpolation, event playback (audio and effects).
7. UI: lobby, join by code, spectate, teammate HUD and minimap, difficulty badges, reconnect flow.
8. Wire up: Vite proxy and auto-start, README and AGENTS, `bun run check`, then a final 4-client smoke test through the preview URL.

### Done When
- [ ] Chapters 5 to 7 are playable solo, each with its own map, hazard, boss and the new guns.
- [ ] Every chapter offers Normal, Hard and Extreme. Hard unlocks after Normal, Extreme after Hard, and existing saved progress still works.
- [ ] Hard and Extreme noticeably change zombies, hazards and boss behavior.
- [ ] A player with a connected wallet can create a room, get a 5-letter code and have 1 to 3 friends join through the same preview link. Guests are refused.
- [ ] Everyone sees each other move, shoot, take damage and die in real time, with each wallet's real equipped skins visible. Fake claims of skins or boost credits are rejected by the server.
- [ ] A downed player can be revived by a teammate standing close for about 3 seconds. The run ends only when everyone is down.
- [ ] A dropped player can reconnect within 30 seconds and keep their slot.
- [ ] A headless 4-player simulation across all chapters and tiers runs without errors, and `bun run check` is clean.

### Risks
- Co-op depends on the workspace server staying up. Friends are cut off if the workspace sleeps or the dev server restarts.
- Network lag shows as small delays on your own movement because the first version has no client prediction.
- Large change. Land and test steps 1 to 4 (solo chapters, difficulty, multi-player engine) before the network layer.

## Ready to build?
