# Zombie Outbreak: full check before sharing

Checked on a clean restart: code, browser errors, production build, secrets, all game modes, the co-op server, and every contract.

## Fixed in this check

| # | Problem | Who it hit |
|---|---------|-----------|
| 1 | Heavy weapons (Venom, Tesla, Cryo) were missing from co-op snapshots. Teammates never saw them in the weapon bar, ammo was not synced, and their shots were drawn as pistol shots. | Anyone in a co-op room holding a heavy gun |
| 2 | Effects and bullets could be drawn with a negative radius when the frame clock jumped backwards. The browser threw an error and skipped the whole frame, so the fight flickered. It showed up 12 times in the browser log. | Title screen, tab backdrops, and solo play |
| 3 | Hints told players to use "Get test USDC in the sidebar", which does not exist outside Arc Studio. Now they point to faucet.circle.com, and the header has a Get test USDC link. | Everyone you share the link with |
| 4 | Floating numbers and sparks could pile up in very big fights. They are now capped. | Low-end phones and laptops |
| 5 | The co-op page could only talk to a server on the same address. It now accepts an optional `VITE_COOP_URL`, so a hosted page can use a server running somewhere else. | Deploying |

## Checked and fine

- Lint, typecheck and a production build all pass. The bundle holds no private key and no RPC token. Only the public contract addresses reach the browser.
- 42 random-play runs (7 chapters, 3 difficulties, 1 and 4 players), clearing chapters 1 to 7 on every difficulty, all 3 armory trials, Endless Descent, and loading a save from the oldest game version: no errors, no broken numbers.
- A 40-minute battle left memory flat.
- Canvas calls were checked strictly (negative radii, bad numbers) across the title battle, all 10 maps and Descent, including deliberately bad frame times: clean.
- Co-op server, run live through the proxy with 4 wallets: wallet sign-in, skins and boosts trimmed to what is owned, wrong codes refused, host-only start, garbage messages ignored, reload rejoins without a new signature, a wrong token cannot take a seat, Descent refuses 4 players. 16 of 16 pass.
- 73 contract tests pass. Live reads: Descent pool 40 USDC, not paused, owner is your wallet, operator is the server wallet, Market has no stuck listings, box price 2 USDC.

## Things you should know before sharing

1. **Co-op and Endless Descent only work while this workspace is running.** The server starts with the dev server. A normal website host cannot run it.
2. **The server wallet has about 4.5 USDC for gas** (`0x4Ba9…2b43`). Every Descent payout costs a little. Top it up before inviting people.
3. **The prize pool is 40 USDC and the payout curve is fixed.** Deep runs take out more than the 25 USDC they put in, so the pool shrinks unless you add to it.
4. **No pause button** in solo play yet.
5. **Progress lives in the browser.** Cleared chapters, earned heavy weapons and used boosts are stored per browser, so clearing site data resets them. In story co-op the server trusts the heavy weapons a player reports. Endless Descent does not, so it stays fair.
6. **Contracts are not independently audited**, and the randomness service behind mystery boxes is a third party's. Fine on testnet. Do not use real money without a proper audit.
7. Not tested on a real phone: touch controls and the smaller layouts.

## Ways to let friends play

| Option | Solo, skins, boosts, boxes, market | Co-op and Endless Descent |
|---|---|---|
| Netlify, Vercel or Hugging Face static Space | Works | Does not work (no server) |
| Hugging Face Docker Space (needs a Hugging Face PRO account) | Works | Works |
| Static host plus a co-op server somewhere else, with `VITE_COOP_URL` set | Works | Works while that server runs |

Friends need a wallet on Arc Testnet and free test USDC from faucet.circle.com.
