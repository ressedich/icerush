// Ice Rush WS backend for Deno Deploy
// - HTTP: /health, /kings
// - WS:   /ws?room=XXXX&clientId=...&nick=...&elo=...
// - WS matchmaking: connect without `room` then send {t:"mm_find"}

type KingRow = { nick: string; elo: number; updatedAt: number };

// ---- Simple in-memory leaderboard (single instance) ----
const kings = new Map<string, KingRow>(); // id -> { nick, elo, updatedAt }

function topKings() {
  const arr = Array.from(kings.entries()).map(([id, v]) => ({
    id,
    nick: String(v.nick || "").slice(0, 12),
    elo: Math.max(0, Math.min(5000, (v.elo | 0) as number)),
    updatedAt: (v.updatedAt | 0) as number,
  }));
  arr.sort((a, b) => b.elo - a.elo);
  return { updatedAt: Date.now(), total: arr.length, top: arr.slice(0, 10) };
}

// ---- Game constants (mirror frontend logical sizes) ----
const W = 880;
const H = 520;
const GOALS_TO_WIN = 5;

const MARGIN = 34;
const BORDER = 14;
const GOAL_DEPTH = 54;
const GOAL_HALF_H = 78;

const STRIKER_R = 32;
const PUCK_R = 13;

const REST = 0.92;
const FRICTION = 0.9982;
const PUCK_MAX_SPEED = 900;
const STRIKER_MAX_SPEED = 1900; // px/s, server-side cap for responsiveness

const inner = {
  left: MARGIN + BORDER,
  right: W - MARGIN - BORDER,
  top: MARGIN + BORDER,
  bottom: H - MARGIN - BORDER,
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function goalY0() {
  return H / 2 - GOAL_HALF_H;
}
function goalY1() {
  return H / 2 + GOAL_HALF_H;
}

function clampStrikerLeft(x: number, y: number) {
  const gl = inner.left + GOAL_DEPTH;
  const gy0 = goalY0();
  const gy1 = goalY1();
  let nx = Math.max(inner.left + STRIKER_R, Math.min(W / 2 - STRIKER_R - 4, x));
  let ny = Math.max(inner.top + STRIKER_R, Math.min(inner.bottom - STRIKER_R, y));
  if (nx < gl + STRIKER_R && ny > gy0 - STRIKER_R && ny < gy1 + STRIKER_R) nx = gl + STRIKER_R;
  return { x: nx, y: ny };
}

function clampStrikerRight(x: number, y: number) {
  const gr = inner.right - GOAL_DEPTH;
  const gy0 = goalY0();
  const gy1 = goalY1();
  let nx = Math.max(W / 2 + STRIKER_R + 4, Math.min(inner.right - STRIKER_R, x));
  let ny = Math.max(inner.top + STRIKER_R, Math.min(inner.bottom - STRIKER_R, y));
  if (nx > gr - STRIKER_R && ny > gy0 - STRIKER_R && ny < gy1 + STRIKER_R) nx = gr - STRIKER_R;
  return { x: nx, y: ny };
}

type Puck = { x: number; y: number; vx: number; vy: number };
type Striker = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  id: string;
  nick: string;
  elo: number;
  px?: number;
  py?: number;
};

type State = {
  puck: Puck;
  left: Striker;
  right: Striker;
  scoreL: number;
  scoreR: number;
  running: boolean;
  ended: boolean;
};

function enforcePuckBounds(puck: Puck) {
  const ix = inner.left;
  const iy = inner.top;
  const ox = inner.right;
  const oy = inner.bottom;
  const r = PUCK_R;
  const gy0 = goalY0();
  const gy1 = goalY1();
  const inGoalY = puck.y > gy0 && puck.y < gy1;

  if (!inGoalY && puck.x - r < ix) {
    puck.x = ix + r;
    puck.vx = Math.abs(puck.vx) * REST;
  }
  if (!inGoalY && puck.x + r > ox) {
    puck.x = ox - r;
    puck.vx = -Math.abs(puck.vx) * REST;
  }
  if (puck.y - r < iy) {
    puck.y = iy + r;
    puck.vy = Math.abs(puck.vy) * REST;
  }
  if (puck.y + r > oy) {
    puck.y = oy - r;
    puck.vy = -Math.abs(puck.vy) * REST;
  }
}

function collideStriker(puck: Puck, striker: Striker) {
  const dx = puck.x - striker.x;
  const dy = puck.y - striker.y;
  const dist = Math.hypot(dx, dy);
  const minD = PUCK_R + STRIKER_R;
  if (dist >= minD || dist < 1e-6) return;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minD - dist;
  puck.x += nx * overlap;
  puck.y += ny * overlap;

  const rvx = puck.vx - striker.vx;
  const rvy = puck.vy - striker.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    const j = -(1 + REST) * vn;
    puck.vx += j * nx;
    puck.vy += j * ny;
  }

  const sp = Math.hypot(puck.vx, puck.vy);
  if (sp > PUCK_MAX_SPEED) {
    const k = PUCK_MAX_SPEED / sp;
    puck.vx *= k;
    puck.vy *= k;
  }
  for (let i = 0; i < 3; i++) enforcePuckBounds(puck);
}

function resetPuck(puck: Puck, serveLeft: boolean) {
  puck.x = W / 2 + (serveLeft ? -44 : 44);
  puck.y = H / 2;
  puck.vx = 0;
  puck.vy = 0;
}

function goalCheck(state: State) {
  const puck = state.puck;
  const gy0 = goalY0() + PUCK_R * 0.25;
  const gy1 = goalY1() - PUCK_R * 0.25;
  if (puck.y <= gy0 || puck.y >= gy1) return 0;
  if (puck.x - PUCK_R < inner.left + 8) return -1; // right scored
  if (puck.x + PUCK_R > inner.right - 8) return +1; // left scored
  return 0;
}

function makeInitialState(): State {
  return {
    puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    left: {
      x: inner.left + 150,
      y: H / 2,
      vx: 0,
      vy: 0,
      tx: inner.left + 150,
      ty: H / 2,
      id: "",
      nick: "Left",
      elo: 0,
    },
    right: {
      x: inner.right - 150,
      y: H / 2,
      vx: 0,
      vy: 0,
      tx: inner.right - 150,
      ty: H / 2,
      id: "",
      nick: "Right",
      elo: 0,
    },
    scoreL: 0,
    scoreR: 0,
    running: false,
    ended: false,
  };
}

// ---- Rooms ----
type ClientInfo = { side: "left" | "right" | "spectator"; id: string; nick: string; elo: number };
type Room = {
  code: string;
  state: State;
  clients: Map<WebSocket, ClientInfo>;
  lastTick: number;
  tickTimer: number | null;
  broadcastAcc: number;
};

const rooms = new Map<string, Room>();

function getRoom(code: string): Room {
  let r = rooms.get(code);
  if (!r) {
    r = {
      code,
      state: makeInitialState(),
      clients: new Map(),
      lastTick: Date.now(),
      tickTimer: null,
      broadcastAcc: 0,
    };
    rooms.set(code, r);
  }
  return r;
}

function countConnectedPlayers(room: Room) {
  let n = 0;
  for (const v of room.clients.values()) {
    if (v.side === "left" || v.side === "right") n++;
  }
  return n;
}

function startLoop(room: Room) {
  if (room.tickTimer != null) return;
  room.lastTick = Date.now();
  room.tickTimer = setInterval(() => tick(room), 16) as unknown as number;
}

function stopLoop(room: Room) {
  if (room.tickTimer != null) clearInterval(room.tickTimer);
  room.tickTimer = null;
}

function send(ws: WebSocket, obj: unknown) {
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    // ignore
  }
}

function broadcast(room: Room, obj: unknown) {
  const msg = JSON.stringify(obj);
  for (const ws of room.clients.keys()) {
    try {
      ws.send(msg);
    } catch {
      // ignore
    }
  }
}

function maybeStart(room: Room) {
  const st = room.state;
  const hasL = st.left.id;
  const hasR = st.right.id;
  if (hasL && hasR && countConnectedPlayers(room) >= 2 && !st.running && !st.ended) {
    st.running = true;
    st.ended = false;
    resetPuck(st.puck, true);
    broadcast(room, { t: "ready" });
    startLoop(room);
  }
}

function tick(room: Room) {
  const now = Date.now();
  let dt = (now - room.lastTick) / 1000;
  room.lastTick = now;
  dt = Math.min(0.05, Math.max(1 / 120, dt));

  const st = room.state;
  if (!st.running || st.ended) {
    room.broadcastAcc = 0;
    return;
  }

  const l = st.left;
  const r = st.right;
  const safeDt = dt < 1e-4 ? 1 / 60 : dt;

  // Move strikers with speed cap (less "floaty" than lerp)
  const l0x = l.x;
  const l0y = l.y;
  const r0x = r.x;
  const r0y = r.y;

  const lt = clampStrikerLeft(l.tx, l.ty);
  {
    const dx = lt.x - l.x;
    const dy = lt.y - l.y;
    const d = Math.hypot(dx, dy);
    const maxMove = STRIKER_MAX_SPEED * safeDt;
    if (d <= maxMove || d < 1e-6) {
      l.x = lt.x;
      l.y = lt.y;
    } else {
      const k = maxMove / d;
      l.x += dx * k;
      l.y += dy * k;
    }
  }
  const rt = clampStrikerRight(r.tx, r.ty);
  {
    const dx = rt.x - r.x;
    const dy = rt.y - r.y;
    const d = Math.hypot(dx, dy);
    const maxMove = STRIKER_MAX_SPEED * safeDt;
    if (d <= maxMove || d < 1e-6) {
      r.x = rt.x;
      r.y = rt.y;
    } else {
      const k = maxMove / d;
      r.x += dx * k;
      r.y += dy * k;
    }
  }

  // velocities for collisions (must reflect this tick movement)
  l.vx = (l.x - l0x) / safeDt;
  l.vy = (l.y - l0y) / safeDt;
  r.vx = (r.x - r0x) / safeDt;
  r.vy = (r.y - r0y) / safeDt;

  const puck = st.puck;
  const travel = Math.hypot(puck.vx * dt, puck.vy * dt);
  const sub = Math.min(40, Math.max(1, Math.ceil(travel / Math.max(2.6, PUCK_R * 0.22))));
  const sdt = dt / sub;
  for (let i = 0; i < sub; i++) {
    puck.x += puck.vx * sdt;
    puck.y += puck.vy * sdt;
    enforcePuckBounds(puck);
    collideStriker(puck, l);
    collideStriker(puck, r);
  }
  puck.vx *= FRICTION;
  puck.vy *= FRICTION;

  const g = goalCheck(st);
  if (g === +1) {
    st.scoreL++;
    resetPuck(puck, false);
  } else if (g === -1) {
    st.scoreR++;
    resetPuck(puck, true);
  }
  if (st.scoreL >= GOALS_TO_WIN || st.scoreR >= GOALS_TO_WIN) {
    st.ended = true;
    st.running = false;
    const leftWon = st.scoreL > st.scoreR;
    broadcast(room, { t: "end", leftWon });
    const lId = l.id;
    const rId = r.id;
    if (lId) {
      const prev = kings.get(lId);
      if (!prev || (l.elo | 0) >= (prev.elo | 0)) kings.set(lId, { nick: l.nick, elo: l.elo | 0, updatedAt: Date.now() });
    }
    if (rId) {
      const prev = kings.get(rId);
      if (!prev || (r.elo | 0) >= (prev.elo | 0)) kings.set(rId, { nick: r.nick, elo: r.elo | 0, updatedAt: Date.now() });
    }
  }

  room.broadcastAcc += dt;
  if (room.broadcastAcc >= 0.033) {
    room.broadcastAcc = 0;
    broadcast(room, {
      t: "state",
      ts: Date.now(),
      s: {
        puck: { x: puck.x, y: puck.y, vx: puck.vx, vy: puck.vy },
        left: { x: l.x, y: l.y, nick: l.nick, elo: l.elo },
        right: { x: r.x, y: r.y, nick: r.nick, elo: r.elo },
        scoreL: st.scoreL,
        scoreR: st.scoreR,
        running: st.running,
      },
    });
  }
}

// ---- Matchmaking ----
type MmWait = { ws: WebSocket; id: string; nick: string; elo: number; seekingAt: number };
const mmWaiting: MmWait[] = [];

function randRoom(len = 6) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += abc[(Math.random() * abc.length) | 0];
  return s;
}

function removeMm(ws: WebSocket) {
  for (let i = mmWaiting.length - 1; i >= 0; i--) {
    if (mmWaiting[i].ws === ws) mmWaiting.splice(i, 1);
  }
}

function allowCors(res: Response) {
  const h = new Headers(res.headers);
  h.set("access-control-allow-origin", "*");
  h.set("access-control-allow-methods", "GET,POST,OPTIONS");
  h.set("access-control-allow-headers", "content-type");
  return new Response(res.body, { status: res.status, headers: h });
}

function json(obj: unknown, status = 200) {
  return allowCors(
    new Response(JSON.stringify(obj), {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
    }),
  );
}

async function serveStatic(req: Request) {
  const url = new URL(req.url);
  // Map "/" -> "/index.html"
  let path = decodeURIComponent(url.pathname);
  if (path === "/") path = "/index.html";
  // Disallow traversal
  if (path.includes("..")) return allowCors(new Response("Bad path", { status: 400 }));
  const fsPath = "." + path;
  try {
    const data = await Deno.readFile(fsPath);
    const ct = contentType(fsPath) || "application/octet-stream";
    return allowCors(
      new Response(data, {
        status: 200,
        headers: {
          "content-type": ct,
          // Avoid stale JS/CSS when redeploying
          "cache-control": path.endsWith(".js") || path.endsWith(".css") ? "no-cache" : "public, max-age=300",
        },
      }),
    );
  } catch {
    return allowCors(new Response("Not found", { status: 404 }));
  }
}

function contentType(p: string) {
  const ext = p.toLowerCase().split(".").pop() || "";
  if (ext === "html") return "text/html; charset=utf-8";
  if (ext === "js" || ext === "mjs") return "text/javascript; charset=utf-8";
  if (ext === "css") return "text/css; charset=utf-8";
  if (ext === "json") return "application/json; charset=utf-8";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "ico") return "image/x-icon";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  return "";
}

function upgradeToWs(req: Request) {
  const { socket, response } = Deno.upgradeWebSocket(req);
  return { socket, response: allowCors(response) };
}

Deno.serve((req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") return allowCors(new Response(null, { status: 204 }));
  if (req.method === "GET" && url.pathname === "/health") return json({ ok: true });
  if (req.method === "GET" && url.pathname === "/kings") return json({ ok: true, ...topKings() });

  // Everything except /ws is treated as static site.
  if (url.pathname !== "/ws") return serveStatic(req);

  const { socket: ws, response } = upgradeToWs(req);

  const roomCode = String(url.searchParams.get("room") || "").trim().toUpperCase().slice(0, 12);
  const id = String(url.searchParams.get("clientId") || "").trim().toUpperCase().slice(0, 64);
  const nick = String(url.searchParams.get("nick") || "Игрок").trim().slice(0, 12) || "Игрок";
  const elo = Math.max(0, Math.min(5000, parseInt(url.searchParams.get("elo") || "0", 10) || 0));

  if (!id) {
    try {
      ws.close(1008, "Missing clientId");
    } catch {
      /* ignore */
    }
    return response;
  }

  // Matchmaking connection (no room param)
  if (!roomCode) {
    send(ws, { t: "mm_hello" });
    ws.addEventListener("message", (ev) => {
      let msg: any = null;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        msg = null;
      }
      if (!msg || typeof msg.t !== "string") return;
      if (msg.t === "ping") {
        send(ws, { t: "pong", n: msg.n ?? 0, c: msg.c ?? 0, s: Date.now() });
        return;
      }
      if (msg.t === "mm_find") {
        removeMm(ws);
        const me: MmWait = { ws, id, nick, elo, seekingAt: Date.now() };
        const WINDOW = 250;
        let bestIdx = -1;
        let bestDiff = 1e9;
        for (let i = 0; i < mmWaiting.length; i++) {
          const it = mmWaiting[i];
          if (!it || it.id === id) continue;
          const d = Math.abs((it.elo | 0) - (elo | 0));
          if (d <= WINDOW && d < bestDiff) {
            bestDiff = d;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0) {
          const other = mmWaiting.splice(bestIdx, 1)[0];
          const code = randRoom(6);
          const room = getRoom(code);
          room.state.left.id = other.id;
          room.state.left.nick = other.nick;
          room.state.left.elo = other.elo | 0;
          room.state.right.id = id;
          room.state.right.nick = nick;
          room.state.right.elo = elo | 0;
          send(other.ws, { t: "mm_match", room: code, opp: { nick, elo } });
          send(ws, { t: "mm_match", room: code, opp: { nick: other.nick, elo: other.elo } });
          try {
            other.ws.close(1000, "matched");
          } catch {
            /* ignore */
          }
          try {
            ws.close(1000, "matched");
          } catch {
            /* ignore */
          }
        } else {
          mmWaiting.push(me);
          send(ws, { t: "mm_wait" });
        }
      } else if (msg.t === "mm_cancel") {
        removeMm(ws);
        send(ws, { t: "mm_wait" });
      }
    });
    ws.addEventListener("close", () => removeMm(ws));
    return response;
  }

  const room = getRoom(roomCode);
  room.clients.set(ws, { id, nick, elo, side: "spectator" });

  const st = room.state;
  let side: ClientInfo["side"] = "spectator";
  if (!st.left.id) {
    st.left.id = id;
    st.left.nick = nick;
    st.left.elo = elo;
    side = "left";
  } else if (!st.right.id && st.left.id !== id) {
    st.right.id = id;
    st.right.nick = nick;
    st.right.elo = elo;
    side = "right";
  } else if (st.left.id === id) {
    side = "left";
    st.left.nick = nick;
    st.left.elo = elo;
  } else if (st.right.id === id) {
    side = "right";
    st.right.nick = nick;
    st.right.elo = elo;
  }

  room.clients.get(ws)!.side = side;
  send(ws, { t: "side", side, room: roomCode });
  if (side === "left" || side === "right") send(ws, { t: "wait" });
  maybeStart(room);

  ws.addEventListener("message", (ev) => {
    let msg: any = null;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      msg = null;
    }
    if (!msg || typeof msg.t !== "string") return;
    if (msg.t === "ping") {
      send(ws, { t: "pong", n: msg.n ?? 0, c: msg.c ?? 0, s: Date.now() });
      return;
    }
    if (msg.t !== "input") return;
    const x = +msg.x;
    const y = +msg.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (side === "left") {
      const c = clampStrikerLeft(x, y);
      st.left.tx = c.x;
      st.left.ty = c.y;
    } else if (side === "right") {
      const c = clampStrikerRight(x, y);
      st.right.tx = c.x;
      st.right.ty = c.y;
    }
  });

  ws.addEventListener("close", () => {
    room.clients.delete(ws);
    if (side === "left") st.left.id = "";
    else if (side === "right") st.right.id = "";
    st.running = false;
    st.ended = false;
    broadcast(room, { t: "peer_left" });
    if (room.clients.size === 0) {
      stopLoop(room);
      rooms.delete(roomCode);
    }
  });

  return response;
});

