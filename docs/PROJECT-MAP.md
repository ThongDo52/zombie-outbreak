# Project map

Zombie Outbreak is a top-down zombie shooter on Arc Testnet with USDC shops, a boss and chapter campaign,
Survival, peer-to-peer co-op, and a paid Endless Descent mode.

## Run it
```
bun install
cp .env.example .env     # then fill in what you need
bun run dev              # web page on :5173, co-op server on :5174
bun run check            # lint + typecheck
```

## Where things live
| Folder | What is in it |
|---|---|
| `src/game/` | The game itself. `engine.ts` is the simulation (also runs headless on a server or in a worker), `players.ts` / `zombies.ts` / `boss.ts` / `combat.ts` are the rules, `render.ts`, `hud.ts` and the `*art.ts` files draw it, `chapters*.ts` and `trials.ts` are the maps, `classes.ts` the four classes. |
| `src/net/` | Co-op. `roomCore.ts` is the room manager (runs in the host's browser), `peer.ts` and `ice.ts` are WebRTC and the relay, `coopClient.ts` is the client, `protocol.ts` the shared messages. |
| `src/audio/` | Generated sound effects and music (no audio files). |
| `src/components/`, `src/hooks/`, `src/abi/` | The React app: title screen, shops, lobby, wallet hooks and contract ABIs. |
| `server/` | The Node/Bun server used only for Endless Descent (tickets and settling on chain). |
| `contracts/` | Solidity (Foundry): skins, boosts, mystery boxes, market and Endless Descent, with tests in `contracts/test/`. |
| `scripts/` | Small tools, for example `gen-operator.ts`. |
| `docs/` | Audit and sharing notes. |

## Good first changes
- Balance numbers: `src/game/config.ts` (weapons, zombies), `src/game/classes.ts`, `src/game/difficulty.ts`.
- New map: add one to `src/game/chapters-late.ts` and check it with the reachability idea in `docs/`.
- New zombie: add the kind in `src/game/types.ts` and `config.ts`, behaviour in `zombies.ts`, drawing in `familyart.ts`.

## Rules of thumb
- The game simulation must stay free of browser code, so it keeps running on a server and in a worker.
- Anything the host sends to friends goes through `replica.ts` (snapshots), so new state needs adding there.
- Never put secrets in a `VITE_` variable. Contracts are not independently audited: testnet only.
