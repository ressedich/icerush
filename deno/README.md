## Ice Rush backend on Deno Deploy

This is the **same WS backend** as `server/index.mjs`, but rewritten for **Deno Deploy** (free).

### Endpoints
- `GET /health` → `{ ok: true }`
- `GET /kings` → `{ ok: true, updatedAt, total, top[] }`
- `WS /ws`
  - Room play: `wss://<project>.deno.dev/ws?room=ABC123&clientId=...&nick=...&elo=...`
  - Matchmaking: connect without `room`, then send `{ "t":"mm_find" }`

### Deploy (from GitHub)
1. Push this repo to GitHub.
2. Open Deno Deploy and create a project from your GitHub repo.
3. Entry point: `deno/main.ts`
4. Deploy.

### Frontend config
In `game.js` set:
`const WS_BACKEND_URL = "wss://<your-project>.deno.dev/ws";`

### Important note
Deno Deploy can run multiple instances. This backend keeps rooms **in memory**,
so it’s best-effort for free hosting. If you need 100% stable rooms worldwide,
you’ll want a stateful service (VPS / managed WS / Durable Objects).

