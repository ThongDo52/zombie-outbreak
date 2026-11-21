# [App Name]

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

[Brief description of what the app does and its primary use case]

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run dev
```

## Deployed contracts

- ArenaSkins (ERC-1155 skin shop, USDC payments) on Arc Testnet: 0x41f309a3a36062d97b4f5b7ef2eb95c16da20d06. Owner and treasury: 0x73b449bf66Eb8B5AFD35eeEcc90233df18332969. Address is read by the app from VITE_SKINS_ADDRESS in .env.
- ArenaBoosts (single-use boosts, USDC payments, one purchase per 24h per wallet) on Arc Testnet: 0x09da55b7d68050dd40a4493af3fe7438b4f9af6b. Owner and treasury: 0x73b449bf66Eb8B5AFD35eeEcc90233df18332969. Read by the app from VITE_BOOSTS_ADDRESS in .env. Boost credits are counted onchain; uses are counted in the browser.
- ArenaBoxes (mystery box, ERC-1155 rare skins, USDC price 2.00, pity after 40 opens, randomness from the D20DAO VRF coordinator 0xd20DA0FF9087d053f0291524Eac12abA1ADBd945) on Arc Testnet: 0x5d3a4ecca1d8eb77694d108140dd46cd20839984. Owner and treasury: 0x73b449bf66Eb8B5AFD35eeEcc90233df18332969. Read by the app from VITE_BOXES_ADDRESS and VITE_VRF_COORDINATOR in .env. Box purchase escrows the USDC until the box is opened or refunded; the VRF fee is paid in native USDC with the purchase and the unused part is returned.
- ArenaMarket (escrow marketplace for skins from ArenaSkins and ArenaBoxes, USDC, 2.5% fee to the treasury) on Arc Testnet: 0x962e677a56878a59134c676247f099e7b653051c. Owner and fee wallet: 0x73b449bf66Eb8B5AFD35eeEcc90233df18332969. Read by the app from VITE_MARKET_ADDRESS in .env. Listed skins are held by the market until sold or cancelled; the owner cannot touch them.

## Co-op

- Server: `server/coop.ts` (Node `ws` on port 5174, run with bun), started by the `coopServer` plugin in `vite.config.ts`; Vite proxies `/coop` to it. Rooms live in memory.
- Game engine is shared: `Game` in `src/game/engine.ts` runs in modes `solo`, `server` (headless, records cosmetic events) and `replica` (client mirror fed by `src/game/replica.ts` snapshots).
- Wallet sign-in and ownership checks: `server/auth.ts` (reads ArenaSkins, ArenaBoxes, ArenaBoosts via viem). A reconnect uses a secret room token, no new signature.
- Difficulty tiers in `src/game/difficulty.ts`; progress per wallet in `src/game/save.ts`.

## Endless Descent (Arc Testnet)
- ArenaDescent contract: 0x667d35c243df9148a2379ec17e6b985c43e4ae98. Owner: user's wallet. Operator: the server wallet (DESCENT_OPERATOR_KEY in .env, server only).
- Entry fee 5 USDC, squad of exactly 5, prize = pool x min(floors x 1%, 25%) from floor 3, equal split among stayers. Per-run cap 200 USDC, daily cap 40% of the pool snapshot. Contract tests: `contracts/test/ArenaDescent.t.sol` (73 tests).
- The Arc Studio RPC proxy is read-only: the server sends operator transactions to the public RPC.

## P2P co-op
- Story and Survival rooms run in the host browser: src/net/roomCore.ts (room logic), hostWorker.ts / hostRuntime.ts (worker), hostSession.ts (PeerJS glue), peer.ts, ice.ts, ownership.ts (wallet checks shared with server/auth.ts).
- Endless Descent stays on server/coop.ts. Relay env values (optional): VITE_METERED_APP, VITE_METERED_KEY or VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL.
