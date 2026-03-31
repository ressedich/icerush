import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const PORT = parseInt(process.env.PORT || "8080", 10);

// ---- Simple in-memory leaderboard (for demo / single instance) ----
const kings = new Map(); // id -> { nick, elo, updatedAt }

function topKings() {
  const arr = Array.from(kings.entries()).map(([id, v]) => ({
    id,
    nick: String(v.nick || "").slice(0, 12),
    elo: Math.max(0, Math.min(5000, v.elo | 0)),
    updatedAt: v.updatedAt | 0,
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

const inner = {
  left: MARGIN + BORDER,
  right: W - MARGIN - BORDER,
  top: MARGIN + BORDER,
  bottom: H - MARGIN - BORDER,
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function goalY0() {
  return H / 2 - GOAL_HALF_H;
}
function goalY1() {
  return H / 2 + GOAL_HALF_H;
}

function clampStrikerLeft(x, y) {
  const gl = inner.left + GOAL_DEPTH;
  const gy0 = goalY0();
  const gy1 = goalY1();
  let nx = Math.max(inner.left + STRIKER_R, Math.min(W / 2 - STRIKER_R - 4, x));
  let ny = Math.max(inner.top + STRIKER_R, Math.min(inner.bottom - STRIKER_R, y));
  if (nx < gl + STRIKER_R && ny > gy0 - STRIKER_R && ny < gy1 + STRIKER_R) nx = gl + STRIKER_R;
  return { x: nx, y: ny };
}

function clampStrikerRight(x, y) {
  const gr = inner.right - GOAL_DEPTH;
  const gy0 = goalY0();
  const gy1 = goalY1();
  let nx = Math.max(W / 2 + STRIKER_R + 4, Math.min(inner.right - STRIKER_R, x));
  let ny = Math.max(inner.top + STRIKER_R, Math.min(inner.bottom - STRIKER_R, y));
  if (nx > gr - STRIKER_R && ny > gy0 - STRIKER_R && ny < gy1 + STRIKER_R) nx = gr - STRIKER_R;
  return { x: nx, y: ny };
}

function enforcePuckBounds(puck) {
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

function collideStriker(puck, striker) {
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

function resetPuck(puck, serveLeft) {
  puck.x = W / 2 + (serveLeft ? -44 : 44);
  puck.y = H / 2;
  // Give the puck a small serve so the first contacts feel responsive
  // even with network latency and server-authoritative simulation.
  const dir = serveLeft ? +1 : -1;
  const a = (Math.random() * 2 - 1) * 0.45; // slight random angle
  const sp = 260;
  puck.vx = Math.cos(a) * sp * dir;
  puck.vy = Math.sin(a) * sp;
}

function goalCheck(state) {
  const puck = state.puck;
  const gy0 = goalY0() + PUCK_R * 0.25;
  const gy1 = goalY1() - PUCK_R * 0.25;
  if (puck.y <= gy0 || puck.y >= gy1) return 0;
  if (puck.x - PUCK_R < inner.left + 8) return -1; // right scored
  if (puck.x + PUCK_R > inner.right - 8) return +1; // left scored
  return 0;
}

function makeInitialState() {
  return {
    puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    left: { x: inner.left + 150, y: H / 2, vx: 0, vy: 0, tx: inner.left + 150, ty: H / 2, id: "", nick: "Left", elo: 0 },
    right: { x: inner.right - 150, y: H / 2, vx: 0, vy: 0, tx: inner.right - 150, ty: H / 2, id: "", nick: "Right", elo: 0 },
    scoreL: 0,
    scoreR: 0,
    running: false,
    ended: false,
  };
}

// ---- Rooms ----
const rooms = new Map(); // code -> room

function getRoom(code) {
  let r = rooms.get(code);
  if (!r) {
    r = {
      code,
      state: makeInitialState(),
      clients: new Map(), // ws -> { side, id, nick, elo }
      lastTick: Date.now(),
      tickTimer: null,
      broadcastAcc: 0,
    };
    rooms.set(code, r);
  }
  return r;
}

function startLoop(room) {
  if (room.tickTimer) return;
  room.lastTick = Date.now();
  room.tickTimer = setInterval(() => tick(room), 16);
}

function stopLoop(room) {
  if (room.tickTimer) clearInterval(room.tickTimer);
  room.tickTimer = null;
}

function send(ws, obj) {
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    // ignore
  }
}

function broadcast(room, obj) {
  const msg = JSON.stringify(obj);
  for (const ws of room.clients.keys()) {
    try {
      ws.send(msg);
    } catch {
      // ignore
    }
  }
}

function tick(room) {
  const now = Date.now();
  let dt = (now - room.lastTick) / 1000;
  room.lastTick = now;
  dt = Math.min(0.05, Math.max(1 / 120, dt));

  const st = room.state;
  if (!st.running || st.ended) {
    room.broadcastAcc = 0;
    return;
  }

  // Keep previous striker positions to compute velocity after movement.
  const l = st.left;
  const r = st.right;
  const safeDt = dt < 1e-4 ? 1 / 60 : dt;
  const lpx = l.x;
  const lpy = l.y;
  const rpx = r.x;
  const rpy = r.y;

  // move strikers towards targets
  const lt = clampStrikerLeft(l.tx, l.ty);
  l.x += (lt.x - l.x) * 0.88;
  l.y += (lt.y - l.y) * 0.88;
  const rt = clampStrikerRight(r.tx, r.ty);
  r.x += (rt.x - r.x) * 0.88;
  r.y += (rt.y - r.y) * 0.88;

  // velocities for collisions (must reflect this tick's movement)
  l.vx = (l.x - lpx) / safeDt;
  l.vy = (l.y - lpy) / safeDt;
  r.vx = (r.x - rpx) / safeDt;
  r.vy = (r.y - rpy) / safeDt;

  // puck integration (substeps)
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

  // goal
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
    // update leaderboard (best elo)
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

  // broadcast state ~20hz
  room.broadcastAcc += dt;
  // ~30Hz for smoother feel on higher ping
  if (room.broadcastAcc >= 0.033) {
    room.broadcastAcc = 0;
    broadcast(room, {
      t: "state",
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

function maybeStart(room) {
  const st = room.state;
  const hasL = st.left.id;
  const hasR = st.right.id;
  if (hasL && hasR && !st.running && !st.ended) {
    st.running = true;
    st.ended = false;
    resetPuck(st.puck, true);
    broadcast(room, { t: "ready" });
    startLoop(room);
  }
}

// ---- HTTP + WS ----
const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/kings", (_req, res) => res.json({ ok: true, ...topKings() }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const roomCode = String(url.searchParams.get("room") || "").trim().toUpperCase().slice(0, 12);
  const id = String(url.searchParams.get("clientId") || "").trim().toUpperCase().slice(0, 64);
  const nick = String(url.searchParams.get("nick") || "Игрок").trim().slice(0, 12) || "Игрок";
  const elo = Math.max(0, Math.min(5000, parseInt(url.searchParams.get("elo") || "0", 10) || 0));

  if (!roomCode || !id) {
    ws.close(1008, "Missing room/clientId");
    return;
  }

  const room = getRoom(roomCode);
  room.clients.set(ws, { id, nick, elo, side: "spectator" });

  // assign side
  const st = room.state;
  let side = "spectator";
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
  room.clients.get(ws).side = side;

  send(ws, { t: "side", side, room: roomCode });
  if (side === "left" || side === "right") {
    send(ws, { t: "wait" });
  }
  maybeStart(room);

  ws.on("message", (data) => {
    let msg = null;
    try {
      msg = JSON.parse(String(data));
    } catch {
      msg = null;
    }
    if (!msg || msg.t !== "input") return;
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

  ws.on("close", () => {
    room.clients.delete(ws);
    if (side === "left") {
      st.left.id = "";
    } else if (side === "right") {
      st.right.id = "";
    }
    st.running = false;
    st.ended = false;
    broadcast(room, { t: "peer_left" });
    if (room.clients.size === 0) {
      stopLoop(room);
      rooms.delete(roomCode);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Ice Rush WS server on :${PORT}`);
});

