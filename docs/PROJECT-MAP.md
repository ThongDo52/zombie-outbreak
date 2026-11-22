# Project map

Zombie Outbreak is a top-down zombie shooter on Arc Testnet with USDC shops, a boss and chapter campaign,
six character classes with an in-run coin shop, Survival, co-op hosted in a player's browser (direct, or
through an online relay), and a paid Endless Descent mode.

## Run it
```
bun install
cp .env.example .env     # then fill in what you need
bun run dev              # web page on :5173, co-op server and online relay on :5174
bun run check            # lint + typecheck
bun run relay            # only the online relay, for a server of your own
bun run relay:deploy     # the online relay as a Cloudflare Worker
```

## Where things live
| Folder | What is in it |
|---|---|
| `src/game/` | The game itself. `engine.ts` is the simulation (also runs headless on a server or in a worker), `players.ts` / `zombies.ts` / `boss.ts` / `combat.ts` are the rules, `chapters*.ts` and `trials.ts` are the maps. `classes.ts` holds the six classes, `skills.ts` their two skills each, `pets.ts` the Warlock's wolves and golem, `shop.ts` coins, prices and buying. Drawing: `render.ts`, `hud.ts`, `shopui.ts`, `fx.ts` and the `*art.ts` files. `visuals.ts` is everything that is only for show (particles, lights, flying coins). |
| `src/net/` | Co-op. `roomCore.ts` is the room manager (runs in the host's browser), `hostSession.ts` opens the room on both ways in, `peer.ts` and `ice.ts` are WebRTC, `relay.ts` and `relayProtocol.ts` the online relay's browser side, `join.ts` picks the way a guest connects, `coopClient.ts` is the client, `protocol.ts` the shared messages, `input.ts` checks what a player's controller sends. |
| `src/audio/` | Generated sound effects and music (no audio files). |
| `src/components/`, `src/hooks/`, `src/abi/` | The React app: title screen, shops, lobby, wallet hooks and contract ABIs. |
| `server/` | `coop.ts` is the Bun server for Endless Descent (tickets and settling on chain); it also carries the online relay. `relayCore.ts` is the relay's room logic, `relay.ts` mounts it on a WebSocket server, `relay-standalone.ts` runs it alone, `cloudflare/` is the same relay as a Worker, `Dockerfile.relay` a container for it. |
| `contracts/` | Solidity (Foundry): skins, boosts, mystery boxes, market and Endless Descent, with tests in `contracts/test/`. |
| `scripts/` | Small tools, for example `gen-operator.ts`. |
| `docs/` | Audit and sharing notes. |

## Good first changes
- Balance numbers: `src/game/config.ts` (weapons, zombies), `src/game/classes.ts` (classes and skills), `src/game/shop.ts` (prices, payouts), `src/game/waves.ts` (which zombies appear when), `src/game/difficulty.ts`.
- New class: add it to `ClassId` and `CLASSES` in `classes.ts`, its skills in `skills.ts`, its gear in `playerart.ts`, an icon in `ClassPicker.tsx`.
- New map: add one to `src/game/chapters-late.ts` and check it with the reachability idea in `docs/`.
- New zombie: add the kind in `src/game/types.ts` and `config.ts` (with its coin value), behaviour in `zombies.ts`, drawing in `familyart.ts`, its place in the waves in `waves.ts`, and its voice in `src/audio/sfx.ts`. A body wider than 30 px follows the wide navigation field (`pathing.ts`).

## Rules of thumb
- The game simulation must stay free of browser code, so it keeps running on a server and in a worker.
- Anything the host sends to friends goes through `replica.ts` (snapshots) or a cosmetic event (`GameEvent` in `types.ts`, applied in `visuals.ts`), so new state needs adding there.
- A player's controller only sends intentions (move, fire, skill, buy). The room decides what happens; `src/net/input.ts` drops anything malformed.
- The relay only forwards frames. It must never need to understand the game, a wallet or a chain.
- Never put secrets in a `VITE_` variable. Contracts are not independently audited: testnet only.
