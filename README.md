# Zombie Outbreak

A top-down zombie shooter played over four chapters, each on its own large scrolling map with its own boss and a new gun. You start with bare fists, find the pistol (it never runs out of ammo), then pick up bigger guns and ammo to survive waves of zombies. Touching a zombie hurts, and acid and lava pools hurt too. The game has a synthesized soundtrack (a different mood for each chapter and for boss fights) and sound effects for every gun, zombie and pickup, all generated in the browser. A boost shop sells single-use help (extra life, full heal, armor) for USDC, limited to one purchase every 24 hours per wallet. A skin shop sells character skins, gun skins and kill effects for USDC on Arc Testnet (cosmetic only, giftable). Your run is saved in the browser, so a page reload offers "Continue run", and cleared chapters unlock from the menu. Connect a wallet to see your USDC balance on Arc Testnet.

Built with [Arc Studio](https://studio.arc.io)

- **Character classes.** Pick one before a run (or in the co-op lobby): Bulwark (tank, shield), Striker (damage, overdrive), Runner (agile, dash) or Medic (support, heal pulse). Each class has its own skill on Shift or Space. Every class is open and any mix works in co-op.
- **New zombie families.** Spitters shoot acid from a distance, Bloaters leave poison puddles and burst into a cloud, Exploders rush in and blow up, Shamans heal and shield other zombies, and Lurkers hunt from the shadows. They join the horde over the chapters.
- **Run clock and Survival.** Every story run shows a clock, and your fastest clear time per chapter and difficulty is kept. Survival mode puts you on one map with endless waves that keep getting harder (a boss every fifth wave), and your longest survival is kept. Survival works alone or in a co-op room of up to four.


## Story and difficulty

Seven chapters, each with its own map, hazards, boss and a new gun. Every chapter can be played on Normal, Hard and Extreme. Clear Normal to unlock Hard, and Hard to unlock Extreme. Clearing a chapter opens the next one.

## Play together (co-op)

Up to 4 players fight in one room. Everyone needs a connected wallet: the game checks that your equipped skins and boosts really belong to you. One player creates a room and shares the 5-letter code, friends join with it, then the host picks the chapter and difficulty and starts. A downed player is revived when a teammate stands close for a few seconds. The run ends when everyone is down. If you lose your connection or reload the page, you can slip back into the room within 30 seconds.

The co-op server starts together with the dev server and only works while it is running.

## Market

Players can sell skins to each other for USDC. List a skin at your price, change the price, or cancel and get it back. A 2.5% fee applies to each sale. Listed skins are held safely by the market until they sell or you cancel.

## Mystery boxes

Open a box for 2 USDC to win one random rare skin (character or gun). Odds: Rare 62%, Epic 28%, Legendary 8%, Mythic 2%, with a guaranteed Mythic after 40 boxes without one. Results come from a verifiable randomness service on Arc Testnet and are stored permanently. Boxes need a little extra native USDC for the randomness fee; any unused part is returned.

- A cinematic title screen on every launch: the real game playing itself behind the logo, with just Start game, Connect wallet, Shop and How to play.
- Heavy weapons: three armory trials (a boss arena each) unlock the Venom Cannon (poison and toxic clouds), the Tesla Gun (chain lightning) and the Cryo Cannon (chill, then freeze). Earned weapons start every solo and story co-op run with you and turn up as loot in the maps.
- Endless Descent: a paid survival dive for exactly five wallet-connected players. Each pays 5 USDC to enter, the squad clears floor after floor until all are down, and the deeper it gets the larger the share of a shared USDC prize pool it wins, split equally among the players who stayed to the end. Anyone can add to the pool, and unfinished runs can be refunded.

## Tech stack

React, TypeScript, Vite, Tailwind CSS, HTML5 canvas, wagmi, viem, ConnectKit.

## Development

Prerequisites: [Bun](https://bun.sh).

```
bun install
bun run dev
```

Other scripts: `bun run build`, `bun run check` (lint and typecheck).

### Controls

- WASD: move
- Mouse: aim, hold left button to fire
- 1-7, Q or mouse wheel: switch weapon
- Shift or Space: dash (brief invulnerability)
- F: use a Full Heal boost, G: use an Armor boost
- M: mute or unmute (volume sliders under the speaker button)
- H: show hitboxes and hurtboxes
- Enter: start or restart
- On phones: on-screen pad, auto-aim fire, swap and dash buttons

### Environment variables

- `VITE_SKINS_ADDRESS`: address of the deployed skin shop contract on Arc Testnet.
- `VITE_BOOSTS_ADDRESS`: address of the deployed boost shop contract on Arc Testnet.
- `VITE_COOP_URL` (optional): WebSocket address of a co-op server hosted elsewhere, for example `wss://your-server.example/coop`. Leave it empty to use the server that starts with the dev server.
- `VITE_DESCENT_ADDRESS`: address of the Endless Descent contract on Arc Testnet (public).
- `DESCENT_OPERATOR_KEY`: private key of the server wallet that signs entry tickets and reports finished runs. Server only: never prefix it with `VITE_` and never commit it. The wallet needs a little USDC for gas.
- `VITE_BOXES_ADDRESS`: address of the deployed mystery box contract on Arc Testnet.
- `COOP_PORT` (optional): port of the co-op game server, 5174 by default.
- `VITE_MARKET_ADDRESS`: address of the deployed player marketplace contract on Arc Testnet.
- `VITE_VRF_COORDINATOR`: address of the randomness service the mystery box uses on Arc Testnet.

## Co-op server

`bun run dev` starts it automatically. To run it on its own: `bun run coop`.

## Co-op: host on your device

Story and Survival co-op rooms run in the host's browser. The host picks **Play together, Host on my device**, shares the 5-letter code, and up to three friends choose **Join a friend** and type it. There is no server involved for these rooms. Friends find each other through PeerJS's free public broker, and the match runs in a Web Worker so a hidden tab does not stall it. Keep the host's page open while friends play. Endless Descent (USDC prizes) still needs the co-op server.

### Relay for friends on other networks (needed for most remote play)

Two browsers on the same Wi-Fi always connect. Friends on different networks connect directly only when both networks allow it, and many (mobile data, some home routers, offices, schools) do not. Those need a **relay (TURN) server** that carries the traffic. The old free relays that needed no account have been shut down, so you need a free account at a relay provider. The easiest is Metered (free 20 GB a month):

1. Sign up at metered.ca and open the TURN server page of your app.
2. Copy the app hostname (looks like `yourapp.metered.live`) and the API key.
3. Add them to `.env` (never paste them into chat) as `VITE_METERED_APP=yourapp.metered.live` and `VITE_METERED_KEY=...`, then restart the dev server and rebuild before you deploy. They are baked into the page, which is normal for relay keys: use a free-tier key you can rotate.

Any other provider works too (for example ExpressTURN): set `VITE_TURN_URL`, `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL`.

In the game, **Play together, Test my connection** shows whether a relay answers, and the in-game bar shows "direct" or "through a relay".

## For contributors
See `docs/PROJECT-MAP.md` for a tour of the code and `.env.example` for the settings.
