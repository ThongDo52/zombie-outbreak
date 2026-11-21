## Implementation Plan: Endless Descent (5-player paid survival chapter)

### Summary
A survival mode where a squad of exactly 5 wallet-connected players pays 5 USDC each to dive through endless floors. Deeper floors pay a bigger share of a shared on-chain prize pool, split equally among the players who stayed to the end.

### Architecture
- **Blockchain:** Arc Testnet and USDC. Entry fees and prizes are real USDC on the existing chain setup, with no mainnet.
- **Contract `ArenaDescent`** (new, owner: your wallet `0x73b449bf66Eb8B5AFD35eeEcc90233df18332969`):
  - **Entry:** `enter(runId, expiry, signature)`. Each player pays 5 USDC into escrow. The signature is a ticket the game server signs for that exact wallet and run, so outsiders cannot take a squad's slot. A run fills at 5 entries.
  - **Settle:** `settle(runId, floors, leavers)`, callable only by the server's operator wallet. The 25 USDC of fees moves into the pool, then payout = pool x min(floors x 1%, 25%) for floors >= 3, otherwise nothing. Split equally among the players who stayed (leavers forfeit; their share goes to the others). Credits are pull-based: `claim()` pays out. A single payout is also capped by a per-run limit and a daily limit (a share of the pool), so a stolen operator key cannot drain it.
  - **Pool:** every fee goes in, and anyone can `fund(amount)` to top it up. A run can never pay more than the pool holds. The curve is fixed after deploy so players can trust it. No one, including the owner, can withdraw the pool.
  - **Safety:** unfilled runs can be refunded after 15 minutes. A filled run the server never settles can be cancelled and refunded after 24 hours. The owner can pause the contract (refunds then open at once), change the operator, and tune the fee and the caps within hard bounds.
  - **Previews:** `previewPayout(floors)` and pool size, read by the UI.
- **Game mode:**
  - **Floors:** a new Descent mode in the shared engine. Each floor is a wave on one of the 7 existing maps, in rotation. Clear every zombie to go down. Zombies, bosses and hazards ramp up with depth (floors 1 to 5 like Normal, 6 to 12 like Hard, beyond Extreme and still rising). A boss appears every 5th floor.
  - **Squad:** the run starts with everyone's guns of chapters 1 to 4 and carries guns and ammo across floors. Downed players are revived at 50% health when a floor is cleared. The run ends when all five are down. Floors cleared is the score.
  - **Rooms:** room size rises to 5. Story co-op stays capped at 4. Descent needs exactly 5.
- **Server:** the co-op server adds the room mode, the ticket signing, a chain poll that starts the run only when all 5 entries are confirmed onchain, leaver tracking, and the settle transaction when the run ends. The operator is a fresh key in the server's private env (`DESCENT_OPERATOR_KEY`, never exposed to the browser). It needs a little native USDC for gas.
- **Frontend:** Descent card in the lobby (mode switch, fee, reward table, pool size, per-player "Pay 5 USDC" status, top-up), live floor and projected prize in the HUD, and a result screen with Claim and Refund.
- **Wallet:** existing ConnectKit and wagmi. Payment uses an approve plus one `enter` transaction.

### Files to Create/Modify
1. `contracts/ArenaDescent.sol` (new): escrow, tickets, settle, pool, claim, refund, pause, caps.
2. `src/abi/arenaDescent.ts` (new): ABI and `VITE_DESCENT_ADDRESS`.
3. `scripts/gen-operator.ts` (new): creates the operator key, writes it to `.env` as a server-only secret and prints its address.
4. `src/game/descent.ts` (new): floor rules, map rotation, depth difficulty curve, boss floors, revive on floor clear.
5. `src/game/engine.ts`: Descent mode (floor counter, map swap per floor, reseed pickups, all-down ends the run), snapshot field `floor`.
6. `src/game/replica.ts`, `src/game/types.ts`, `src/game/difficulty.ts`: carry `floor` and the depth difficulty to clients.
7. `src/game/hud.ts`: floor counter, depth badge, projected prize.
8. `src/net/protocol.ts`: room mode, ticket request and reply, per-member paid flags, run result, size 5.
9. `server/descent.ts` (new): operator wallet, ticket signing, entry polling, settle with retries, caps.
10. `server/coop.ts`: Descent room rules (exactly 5, all paid before start), leaver tracking, settle on game over.
11. `src/hooks/useDescent.ts` (new): pool, preview table, credits, enter, claim, refund and top-up flows with real transactions.
12. `src/components/DescentPanel.tsx` (new): lobby payment panel and result and claim panel.
13. `src/components/CoopLobby.tsx`, `src/components/GameCanvas.tsx`, `src/components/ChapterOverlay.tsx`: mode switch, Descent overlays and result screen.
14. `.env`, `README.md`, `AGENTS.md`: contract address, secret handling, how it works.

### Build Sequence
1. Contract: write `ArenaDescent`, run a security review and Slither, fix findings, deploy to Arc Testnet with owner = the user's wallet and the generated operator address. Check every setting by reading it back onchain.
2. Operator and pool: generate the operator key, give it gas from the faucet, and seed a first prize pool.
3. Engine: Descent mode, depth difficulty and floor flow. Headless 5-player simulations for 30+ floors, including a boss floor and the revive-on-floor rule.
4. Server: room mode, ticket signing, entry polling, leaver tracking and settle. Test with scripted clients, and an end-to-end run on Arc Testnet with five throwaway wallets funded by the faucet if it allows, otherwise the same flow against the contract on a fork.
5. Client and UI: lobby panel, HUD, result, claim, refund and top-up.
6. Wire up: env, docs, `bun run check`, final smoke test through the preview.

### Done When
- [ ] The contract is deployed on Arc Testnet and reads back correctly (fee 5 USDC, owner, operator, caps, pool).
- [ ] A lobby needs exactly 5 wallets, each pays 5 USDC with one approve and one entry transaction, and the run starts only when all 5 payments are confirmed onchain.
- [ ] A fake or reused ticket, a 6th payer and a wallet that is not in the room are all rejected by the contract.
- [ ] Descent plays endlessly: floors rotate through the maps, difficulty keeps rising, a boss shows on every 5th floor, and downed players come back at 50% health when a floor is cleared.
- [ ] When the squad is wiped, the server settles the run onchain. Shallow runs (under 3 floors) pay nothing. Deeper runs pay a larger share of the pool, split equally among those who stayed, and a player who left forfeits their share.
- [ ] The result screen shows each player's payout, and Claim sends the USDC to the wallet.
- [ ] A run that never fills or never settles can be refunded, and a paused contract opens refunds at once.
- [ ] A run can never pay more than the pool holds, the per-run cap, or the daily cap, in a test that tries to exceed them.
- [ ] `bun run check` is clean and a 5-client scripted run completes through the preview link.

### Risks
- The server is the referee: whoever holds the operator key can settle runs, within the caps. Keep the caps low and do not move this to real funds without an independent audit.
- Pool sustainability: with a fixed curve, squads reaching floor 15+ take out more than the 25 USDC they put in, so the pool shrinks unless topped up or squads usually die early.
- Co-op depends on the workspace server staying up. If it goes down during a run, fees are locked until the 24-hour refund opens.
- Five players with endless zombies stress the simulation more than four; includes a load check.

## Ready to build?
