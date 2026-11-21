# Plan: Host on my device (P2P WebRTC co-op for story and Survival)

Story and Survival rooms run in the host's browser (Web Worker), friends join with a 5-letter code via the PeerJS public broker, with a free-tier TURN relay fallback. Endless Descent stays on the server. Any device can host (phones get a warning).

Files: src/net/transport.ts, ice.ts, peer.ts, roomCore.ts, ownership.ts, hostWorker.ts, hostSession.ts (new); protocol.ts, coopClient.ts, useCoop.ts, CoopLobby.tsx, GameCanvas.tsx, hud.ts, server/coop.ts, package.json, vite.config.ts, .env, README.md (modify).

Sequence: shared ownership check; transport + room core tested with fake links (delay, loss); worker host; PeerJS two-channel; client + lobby (three entries, ping, direct/relayed); relay key, host banner, phone warning; check + regression + manual two-browser test.

Done when: room by code with no server; story and Survival play end to end with real skins; reload rejoin within 30 s; host-left message; ping and relay shown; host keeps simulating in a background tab; Descent unchanged; bun run check clean and old co-op tests pass.

Risks: real WebRTC cannot be tested in the sandbox; PeerJS broker is third-party; ping not equal; weak phone hosts.
