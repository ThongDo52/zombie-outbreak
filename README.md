# Zombie Outbreak

A top-down zombie shooter played over seven chapters, each on its own large scrolling map with its own boss. You pick a class, start with its free sidearm (it never runs out of ammo), earn coins from every zombie you put down, and spend them in the shop on that class's guns, upgrades, ammo and medkits to survive waves of zombies. Touching a zombie hurts, and acid and lava pools hurt too. The game has a synthesized soundtrack (a different mood for each chapter and for boss fights) and sound effects for every gun, zombie and pickup, all generated in the browser. A boost shop sells single-use help (extra life, full heal, armor) for USDC, limited to one purchase every 24 hours per wallet. A skin shop sells character skins, gun skins and kill effects for USDC on Arc Testnet (cosmetic only, giftable). Your run is saved in the browser, so a page reload offers "Continue run", and cleared chapters unlock from the menu. Connect a wallet to see your USDC balance on Arc Testnet.

Built with [Arc Studio](https://studio.arc.io)

- **Six character classes.** Pick one before a run (or in the co-op lobby). Each has a passive talent, two skills (Shift or Space, and E or the right mouse button), a free sidearm and its own shelf of guns in the shop. Every class is open and any mix works in co-op. See [Classes](#classes).
- **A shop instead of gun drops.** Guns no longer lie around the map. Zombies pay coins, and B opens the shop: your class's guns, three upgrade levels for every gun you own, ammo and medkits. See [Coins and the shop](#coins-and-the-shop).
- **Eleven zombie families.** Spitters shoot acid from a distance, Bloaters leave poison puddles and burst into a cloud, Exploders rush in and blow up, Shamans heal and shield other zombies, and Lurkers hunt from the shadows. New: Shielders carry a riot shield that stops bullets from the front, Leapers pounce across the street, Screamers whip the horde into a frenzy and call runners, Broods burst into a swarm of mites, and Mortars lob bombs over walls onto a marked spot. They join the horde over the chapters.
- **Online co-op that works across networks.** Friends connect straight to each other when their networks allow it, and through a small online relay when they do not. See [Play online](#play-online).
- **Run clock and Survival.** Every story run shows a clock, and your fastest clear time per chapter and difficulty is kept. Survival mode puts you on one map with endless waves that keep getting harder (a boss every fifth wave), and your longest survival is kept. Survival works alone or in a co-op room of up to four.


## Story and difficulty

Seven chapters, each with its own map, hazards and boss. Every chapter can be played on Normal, Hard and Extreme. Clear Normal to unlock Hard, and Hard to unlock Extreme. Clearing a chapter opens the next one.

## Classes

| Class | Role | Always on | Skill 1 (Shift or Space) | Skill 2 (E or right mouse) | Starts with | Shop |
|---|---|---|---|---|---|---|
| Bulwark | Tank: +50% health, a little slower | Iron Skin: 15% less damage | Bulwark Shield: 70% less damage for 4 s, zombies turn on you | Ground Slam: hurts, throws back and stuns around you, +30 armor | Pistol | Shotgun, Flamer, Minigun, Launcher |
| Striker | Assault: less health | Momentum: kills shorten both cooldowns | Overdrive: shoot 60% faster and 35% harder for 6 s | Frag Grenade: a wide stunning blast at the crosshair | Pistol | SMG, Rifle, Minigun, Launcher |
| Runner | Scout: fastest on foot | Evasion: 40% less damage from brushing zombies | Dash: cannot be hit while dashing | Shock Trap: a field that slows and shocks for 6 s | Pistol | SMG, Shotgun, Rifle, Flamer |
| Medic | Support | Field Medic: revives 50% faster, medkits heal 50% more | Heal Pulse: heals you and nearby teammates, clears poison | Med Station: a healing field for 7 s (pets too) | Pistol | SMG, Shotgun, Rifle, Cryo Cannon |
| Deadshot | Sniper: less health | Long Shot: bullets hit up to 50% harder the farther they fly | Deadeye: perfect aim, +80% damage, more piercing, ignores riot shields for 5 s | Hunter's Mark: the marked zombie takes 40% more damage from everyone | Pistol | SMG, Rifle, Longshot, Railgun |
| Warlock | Summoner: a little less health | Soul Siphon: pet kills heal you | Spirit Wolves: two wolves that hunt beside you until they fall | Stone Guardian: a golem for 16 s that draws zombies and stuns them | Spirit Wand (homing bolts) | SMG, Venom Cannon, Tesla Gun, Cryo Cannon |

Skill damage grows with the run, so grenades, slams and traps stay useful in late chapters. The numbers live in `src/game/classes.ts`, the skills in `src/game/skills.ts` and the pets in `src/game/pets.ts`.

## Coins and the shop

- Every zombie pays coins (a walker 4, a tank 18, a boss 160 and more on later chapters). Clearing a wave and a chapter pays a bonus, and coin caches lie around the map. In co-op every kill pays the whole squad, scaled so a full room earns about what a solo player does.
- **B** opens the shop at any time. Alone, the game pauses while you shop. In a co-op room it keeps running, so shop between waves.
- Each class buys from its own shelf (see the table above). A gun you own can be upgraded three times, +25% damage each. An ammo pack tops up every gun you carry, a medkit restores 40 health.
- Starting a run at a later chapter gives you a starting purse, about what the earlier chapters would have paid. Your coins, guns and upgrades carry over from chapter to chapter within a run.
- Heavy weapons earned in the armory trials still start every run with you, whatever your class, and can be upgraded too.
- Prices and payouts are in `src/game/shop.ts`.

## Play together (co-op)

Up to 4 players fight in one room. Everyone needs a connected wallet: the game checks that your equipped skins and boosts really belong to you. One player creates a room and shares the 5-letter code, friends join with it, then the host picks the chapter and difficulty and starts. A downed player is revived when a teammate stands close for a few seconds. The run ends when everyone is down. If you lose your connection or reload the page, you can slip back into the room within 30 seconds.

Story and Survival rooms run in the host's browser, so they need no game server. See [Play online](#play-online) for how friends on other networks reach each other. Endless Descent runs on the co-op server, which starts together with the dev server.

## Market

Players can sell skins to each other for USDC. List a skin at your price, change the price, or cancel and get it back. A 2.5% fee applies to each sale. Listed skins are held safely by the market until they sell or you cancel.

## Mystery boxes

Open a box for 2 USDC to win one random rare skin (character or gun). Odds: Rare 62%, Epic 28%, Legendary 8%, Mythic 2%, with a guaranteed Mythic after 40 boxes without one. Results come from a verifiable randomness service on Arc Testnet and are stored permanently. Boxes need a little extra native USDC for the randomness fee; any unused part is returned.

- A cinematic title screen on every launch: the real game playing itself behind the logo, with just Start game, Connect wallet, Shop and How to play.
- Heavy weapons: three armory trials (a boss arena each) unlock the Venom Cannon (poison and toxic clouds), the Tesla Gun (chain lightning) and the Cryo Cannon (chill, then freeze). Earned weapons start every solo and story co-op run with you, whatever class you play.
- Endless Descent: a paid survival dive for exactly five wallet-connected players. Each pays 5 USDC to enter, the squad clears floor after floor until all are down, and the deeper it gets the larger the share of a shared USDC prize pool it wins, split equally among the players who stayed to the end. Anyone can add to the pool, and unfinished runs can be refunded.

## Tech stack

React, TypeScript, Vite, Tailwind CSS, HTML5 canvas, wagmi, viem, ConnectKit.

## Development

Prerequisites: [Bun](https://bun.sh).

```
bun install
bun run dev
```

Other scripts: `bun run build` and `bun run preview` (the built page), `bun run check` (lint and typecheck), `bun run coop` (the co-op server on its own), `bun run relay` (only the online relay), `bun run relay:deploy` (the relay as a Cloudflare Worker).

### Controls

- WASD: move
- Mouse: aim, hold left button to fire
- 1-9, Q or mouse wheel: switch weapon
- Shift or Space: first class skill
- E or right mouse button: second class skill (aimed at the crosshair)
- B: open or close the shop (number keys or a click buy a line, Esc closes)
- F: use a Full Heal boost, G: use an Armor boost
- M: mute or unmute (volume sliders under the speaker button)
- H: show hitboxes and hurtboxes
- Enter: start or restart
- On phones: on-screen pad, auto-aim fire, and buttons for both skills, the shop and swapping guns

### Environment variables

- `VITE_SKINS_ADDRESS`: address of the deployed skin shop contract on Arc Testnet.
- `VITE_BOOSTS_ADDRESS`: address of the deployed boost shop contract on Arc Testnet.
- `VITE_COOP_URL` (optional): WebSocket address of a co-op server hosted elsewhere, for example `wss://your-server.example/coop`. Leave it empty to use the server that starts with the dev server. A hosted co-op server also carries the online relay.
- `VITE_RELAY_URL` (optional): address of an online relay for co-op between different networks, for example `wss://zombie-outbreak-relay.yourname.workers.dev/relay`. Several can be listed, separated by commas. See [Play online](#play-online).
- `VITE_METERED_APP` and `VITE_METERED_KEY`, or `VITE_TURN_URL`, `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL` (optional): a TURN server for WebRTC.
- `RELAY_PORT` (optional, server): port of the stand-alone relay, 5175 by default. `RELAY_ALLOWED_ORIGINS` (optional, server): only pages from these origins may use the relay.
- `VITE_DESCENT_ADDRESS`: address of the Endless Descent contract on Arc Testnet (public).
- `DESCENT_OPERATOR_KEY`: private key of the server wallet that signs entry tickets and reports finished runs. Server only: never prefix it with `VITE_` and never commit it. The wallet needs a little USDC for gas.
- `VITE_BOXES_ADDRESS`: address of the deployed mystery box contract on Arc Testnet.
- `COOP_PORT` (optional): port of the co-op game server, 5174 by default.
- `VITE_MARKET_ADDRESS`: address of the deployed player marketplace contract on Arc Testnet.
- `VITE_VRF_COORDINATOR`: address of the randomness service the mystery box uses on Arc Testnet.

## Co-op server

`bun run dev` starts it automatically. To run it on its own: `bun run coop`. It serves Endless Descent on `/coop` and the online relay on `/relay`, on the same port.

## Play online

Story and Survival rooms run in the host's browser. The host picks **Play together, Host on my device**, shares the 5-letter code, and up to three friends choose **Join a friend** and type it. The match runs in a Web Worker so a hidden tab does not stall it. Keep the host's page open while friends play. Endless Descent (USDC prizes) still needs the co-op server.

### How friends reach each other

The game tries three ways, best first, and picks one on its own:

1. **Direct (WebRTC).** The two browsers talk straight to each other. This always works on the same Wi-Fi and between many home networks, but mobile data, offices, schools and a lot of routers block it. This used to be the only way, which is why co-op only worked on a LAN.
2. **Through a TURN server**, if you configured one (optional, see below).
3. **Through the online relay.** A tiny WebSocket server that both players can always reach forwards the messages between them. It works from every network that can open a web page. The match, the room and the wallet checks stay in the host's browser; the relay only passes sealed-up frames along and knows nothing about the game.

A friend who joins starts on the direct path and the relay at the same time; if the direct path has not connected after about four seconds, the relay is used. The bar under the game shows which one you are on: "direct to the host", "through a WebRTC relay" (TURN) or "through the online relay". **Play together, Test my connection** shows whether a relay is set up and answering.

### Setting up the relay

Pick the one that matches how your friends open the game.

**A. Friends open your dev or preview link (nothing to set up).** `bun run dev` starts the relay inside the co-op server, and the dev server passes `/relay` through. Anyone who opens the same address as you can host and join from any network: the Arc Studio preview link (the relay travels the same way the Endless Descent server already does), or a tunnel to your machine such as `cloudflared tunnel --url http://localhost:5173`. The game is only online while your dev server runs.

**B. A deployed page plus a free Cloudflare Worker (recommended for a published game).** The relay runs as a Worker with one Durable Object per room, which fits Cloudflare's free plan.

```
bunx wrangler login           # once: opens the browser (a free Cloudflare account is enough)
bun run relay:deploy          # the same as: cd server/cloudflare && npx wrangler deploy
```

Wrangler prints an address like `https://zombie-outbreak-relay.yourname.workers.dev`. Put it in `.env` and rebuild:

```
VITE_RELAY_URL=wss://zombie-outbreak-relay.yourname.workers.dev/relay
```

The Worker is in `server/cloudflare/`. It has not been deployed from this repository yet, so treat the first deploy as a test: open `https://<your worker>/health` and expect `{"ok":true,...}`, then run **Test my connection** in the game.

**C. The relay on any server that runs Bun.** A small VPS, Render, Fly, Railway or Docker:

```
bun run relay                                   # listens on PORT, or RELAY_PORT, or 5175
docker build -f server/Dockerfile.relay -t zombie-relay . && docker run -p 5175:5175 zombie-relay
```

Put it behind HTTPS (most hosts do that for you) and set `VITE_RELAY_URL=wss://your-host/relay`. If your web server forwards `/relay` on the game's own domain to the relay, `VITE_RELAY_URL=/relay` is enough. If you already host the co-op server for Endless Descent and set `VITE_COOP_URL`, that server carries the relay too and there is nothing more to set.

To keep strangers' pages off your relay, set `RELAY_ALLOWED_ORIGINS` (Bun relay) or `ALLOWED_ORIGINS` in `server/cloudflare/wrangler.toml` to your game's address.

### Optional: a TURN server

TURN lets WebRTC itself get through strict networks, with a little less delay than the relay because traffic stays on UDP. It is a bonus, not a requirement. Metered has a free tier: sign up at metered.ca, copy the app hostname and API key, and add `VITE_METERED_APP=yourapp.metered.live` and `VITE_METERED_KEY=...` to `.env`. Any other provider works with `VITE_TURN_URL`, `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL`. These keys are baked into the page, which is normal for TURN: use a free-tier key you can rotate, and never paste keys into chat.

### If a friend still cannot join

- "No room with that code": the code is wrong, or the host closed the page.
- "...this copy of the game has no online relay set up": the page was built without `VITE_RELAY_URL` and is not running from the dev server. Use A, B or C above.
- "...the online relay did not answer": the relay address is wrong or the relay is down. Open its `/health` page in a browser.
- "...the host is not on the online relay right now": the host's page lost the relay. The host reopens the room.
- Both players should load the same version of the page (the host and the guest must run the same build).

### What the relay sees and costs

The relay forwards frames between the host and the guests of one room code and keeps nothing. It never sees a wallet key: signing in happens between the guest's wallet and the host's browser, as before. Each guest receives roughly 20 to 45 kB per second through the relay (snapshots are compressed, and the host uploads each one only once for all guests). Cloudflare counts WebSocket messages against the free plan's daily request allowance, which is enough for several hours of room time a day; a busy public game would need the paid plan or a VPS.

## Put the game on GitHub Pages

GitHub Pages can host the game's page for free, but only the page: it serves files and cannot run a server. `.github/workflows/deploy.yml` builds the project with Vite and publishes it every time `main` is pushed.

1. Push the project to a GitHub repository with git or GitHub Desktop. On GitHub's free plan the repository has to be public. `.env` stays on your machine (it is in `.gitignore`); if you upload through the website instead, check yourself that `.env`, `.circle/` and `recovery_file*` are not among the files.
2. In the repository: **Settings, Pages, Build and deployment, Source: GitHub Actions**.
3. In **Settings, Secrets and variables, Actions, Variables**, add the `VITE_` values from your `.env`: the contract addresses, and `VITE_RELAY_URL` once your relay runs. Every repository variable whose name starts with `VITE_` is handed to the build. They are baked into the public page, so never add `DESCENT_OPERATOR_KEY` or any other private key.
4. Push to `main`, or start the workflow by hand from the **Actions** tab. The game appears at `https://<you>.github.io/<repository>/` (the workflow sets that path for you). If your default branch is not called `main`, change the branch name at the top of the workflow.

What works from there:

| | On GitHub Pages |
|---|---|
| Solo play, classes, shop, saved runs | Yes |
| Wallet and the USDC shops on Arc Testnet | Yes, once the contract addresses are set as variables |
| Co-op on the same Wi-Fi or between friendly networks | Yes (direct WebRTC) |
| Co-op between any two networks | Needs the online relay hosted elsewhere, for example the Cloudflare Worker (`bun run relay:deploy`), and `VITE_RELAY_URL` set as a variable |
| Endless Descent | Needs the co-op server hosted elsewhere (it holds a private key) and `VITE_COOP_URL` set as a variable |

The workflow has not run yet: the first push is its test. If the build step fails, run `bun run build` on your machine to see the same error.

## For contributors
See `docs/PROJECT-MAP.md` for a tour of the code and `.env.example` for the settings.
