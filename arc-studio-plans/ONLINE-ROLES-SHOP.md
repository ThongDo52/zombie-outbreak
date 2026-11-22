# Plan: Online relay, six roles, coin shop, new zombies, visual pass

Co-op only worked on a LAN because WebRTC had no fallback. Guests now race WebRTC against a WebSocket relay and the host listens on both; the relay only forwards frames, the room still runs in the host's browser. Six classes (added Deadshot sniper and Warlock summoner with wolf and golem pets), each with a passive, two skills, a starter gun and a shop shelf. Guns are bought with coins instead of found. Five new zombie kinds: Shielder, Leaper, Screamer, Brood (and Mites), Mortar. Lighting, particles, casings, decals, flying coins.

Files (new): src/net/relay.ts, relayProtocol.ts, join.ts, input.ts; server/relayCore.ts, relay.ts, relay-standalone.ts, Dockerfile.relay, cloudflare/worker.ts, cloudflare/wrangler.toml; src/game/shop.ts, shopui.ts, skills.ts, pets.ts, petart.ts, visuals.ts; .env.example.
Files (changed): src/net/hostSession.ts, hostRuntime.ts, peer.ts, coopClient.ts, roomCore.ts; server/coop.ts; vite.config.ts; src/game/types.ts, config.ts, classes.ts, engine.ts, players.ts, combat.ts, zombies.ts, waves.ts, pickups.ts, pathing.ts, replica.ts, render.ts, hud.ts, fx.ts, sprites.ts, playerart.ts, gunart.ts, familyart.ts, showcase.ts, chapters*.ts, trials.ts; src/audio/sfx.ts, index.ts; GameCanvas.tsx, TouchControls.tsx, ClassPicker.tsx, ChapterOverlay.tsx, CoopLobby.tsx, TitleScreen.tsx, ConnectionStatus.tsx, ConnectionTest.tsx; README.md, docs/PROJECT-MAP.md, AGENTS.md, package.json.

Checked outside the app (the packages could not be installed where this was written): type-check of src/game, src/net, src/audio and server against stand-in types; the relay, the guest's connection race and a whole hosted room (host session in a worker, relay, guest buying and casting) with real WebSockets under Bun; bot runs of every chapter and mode with no errors; the same bot on the old and the new game for difficulty; every screen drawn in headless Chrome.

Not checked: `bun run check` (oxlint and tsc with the real packages), the Vite build, real WebRTC between two networks, the Cloudflare Worker deploy, the React screens in a browser. Run `bun run check` and play one co-op round across two networks before relying on it.

Risks: balance needs play-testing by people (bots are poor players); Cloudflare free plan limits room hours per day; host and guests must run the same build.
