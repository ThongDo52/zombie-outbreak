# Plan: Character Classes and New Zombie Families

Four classes (Bulwark tank, Striker damage, Runner agile with the dash, Medic support), all open from the start, any mix in co-op, default Runner. Shift and Space use the class skill. Five zombie families: Spitter, Bloater, Exploder, Shaman, Lurker, with enemy projectiles and hostile poison puddles.

Files: src/game/classes.ts (new); types.ts, config.ts, players.ts, combat.ts, zombies.ts, waves.ts, chapters.ts, chapters-late.ts, engine.ts, replica.ts, playerart.ts, sprites.ts, zombieart.ts, fx.ts, render.ts, hud.ts, audio/sfx.ts, save.ts, net/protocol.ts, net/roomCore.ts, server/coop.ts, ChapterOverlay.tsx, CoopLobby.tsx, GameCanvas.tsx, TouchControls.tsx, README.md.

Sequence: foundations (types, classes, shots and puddles); class skills and tests; zombie families and sims; co-op class sync and tests; art and audio; UI; checks and balance pass.

Done when: class picker in menu and lobby; Shift/Space skills with HUD cooldowns; co-op shows classes and effects; five families behave and look distinct; no errors in a 4-player run across chapters; bun run check clean; earlier tests pass.

Risks: balance needs play-testing; shot/puddle load capped; old saves start as Runner; static Space needs redeploy.
