import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const PORT = parseInt(process.env.PORT || "8080", 10);
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

// ---- Supabase helpers (JWT verify + Admin REST) ----
function b64urlToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

function b64urlToJson(s) {
  try {
    return JSON.parse(Buffer.from(b64urlToBytes(s)).toString("utf8"));
  } catch {
    return null;
  }
}

function parseJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const header = b64urlToJson(parts[0]);
  const payload = b64urlToJson(parts[1]);
  const sig = parts[2];
  if (!header || !payload || !sig) return null;
  return { header, payload, signed: `${parts[0]}.${parts[1]}`, sig };
}

let _jwksCache = { at: 0, keysByKid: new Map() };
async function getJwksKeys() {
  if (!SUPABASE_URL) return new Map();
  const now = Date.now();
  if (_jwksCache.keysByKid.size && now - _jwksCache.at < 10 * 60 * 1000) return _jwksCache.keysByKid;
  const jwksUrl = `${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`;
  const r = await fetch(jwksUrl, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`JWKS HTTP ${r.status}`);
  const j = await r.json();
  const keys = new Map();
  for (const k of Array.isArray(j?.keys) ? j.keys : []) {
    if (k && k.kid) keys.set(String(k.kid), k);
  }
  _jwksCache = { at: now, keysByKid: keys };
  return keys;
}

async function importRsaPublicKey(jwk) {
  if (!jwk) return null;
  return await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}

async function verifySupabaseJwt(token) {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL missing");
  const parsed = parseJwt(token);
  if (!parsed) throw new Error("Invalid JWT");
  const { header, payload, signed, sig } = parsed;
  if (header.alg !== "RS256") throw new Error("Unsupported alg");
  const kid = String(header.kid || "");
  const keys = await getJwksKeys();
  const jwk = keys.get(kid);
  if (!jwk) throw new Error("Unknown kid");
  const key = await importRsaPublicKey(jwk);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(sig), Buffer.from(signed, "utf8"));
  if (!ok) throw new Error("Bad signature");
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= (payload.exp | 0)) throw new Error("Expired");
  if (payload.iss && typeof payload.iss === "string") {
    const wantIss = `${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1`;
    if (payload.iss !== wantIss) throw new Error("Bad iss");
  }
  const sub = String(payload.sub || "");
  if (!sub) throw new Error("Missing sub");
  return { userId: sub, payload };
}

function supaRestHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
  };
}

async function supaGetProfile(userId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const url = `${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`;
  const r = await fetch(url, { headers: supaRestHeaders() });
  if (!r.ok) throw new Error(`profiles select HTTP ${r.status}`);
  const arr = await r.json();
  return arr && arr[0] ? arr[0] : null;
}

async function supaUpsertProfile(row) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;
  const url = `${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/profiles?on_conflict=id`;
  const r = await fetch(url, {
    method: "POST",
    headers: { ...supaRestHeaders(), prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`profiles upsert HTTP ${r.status}`);
  return true;
}

function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || "").trim());
}

function escapeIlike(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

async function supaSearchProfiles(query) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return [];
  const base = `${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/profiles`;
  const t = String(query || "").trim();
  if (!t) return [];
  if (isUuid(t)) {
    const url = `${base}?id=eq.${encodeURIComponent(t)}&select=*`;
    const r = await fetch(url, { headers: supaRestHeaders() });
    if (!r.ok) throw new Error(`search HTTP ${r.status}`);
    return await r.json();
  }
  const pat = `%${escapeIlike(t)}%`;
  const url = `${base}?nickname=ilike.${encodeURIComponent(pat)}&select=*&limit=25`;
  const r = await fetch(url, { headers: supaRestHeaders() });
  if (!r.ok) throw new Error(`search HTTP ${r.status}`);
  return await r.json();
}

async function supaPatchProfileId(userId, patch) {
  const url = `${SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { ...supaRestHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`patch ${r.status}: ${txt.slice(0, 200)}`);
  }
  const arr = await r.json();
  return arr && arr[0] ? arr[0] : null;
}

async function supaDeleteAuthUser(userId) {
  const url = `${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}`;
  const r = await fetch(url, { method: "DELETE", headers: supaRestHeaders() });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`delete auth ${r.status}: ${txt.slice(0, 200)}`);
  }
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => res.status(500).json({ error: String(e.message || e) }));
}

async function requireAdmin(req, res, next) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: "Server missing Supabase config" });
  }
  try {
    const auth = String(req.headers.authorization || "");
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: "Missing bearer token" });
    const { userId } = await verifySupabaseJwt(m[1]);
    const prof = await supaGetProfile(userId);
    if (!prof || !prof.is_admin) return res.status(403).json({ error: "Admin only" });
    req.adminUserId = userId;
    next();
  } catch (e) {
    return res.status(401).json({ error: String(e.message || e) });
  }
}

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
const STRIKER_MAX_SPEED = 1900; // px/s, server-side cap for responsiveness
const SIM_HZ = 60;
const SIM_DT = 1 / SIM_HZ;
const K_ELO = 28;

const inner = {
  left: MARGIN + BORDER,
  right: W - MARGIN - BORDER,
  top: MARGIN + BORDER,
  bottom: H - MARGIN - BORDER,
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function expectedScore(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}
function eloDelta(playerRating, oppRating, playerWon) {
  const s = playerWon ? 1 : 0;
  const e = expectedScore(playerRating, oppRating);
  return K_ELO * (s - e);
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
  puck.vx = 0;
  puck.vy = 0;
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
    left: { x: inner.left + 150, y: H / 2, vx: 0, vy: 0, tx: inner.left + 150, ty: H / 2, id: "", nick: "Left", elo: 0, lastSeq: 0 },
    right: { x: inner.right - 150, y: H / 2, vx: 0, vy: 0, tx: inner.right - 150, ty: H / 2, id: "", nick: "Right", elo: 0, lastSeq: 0 },
    scoreL: 0,
    scoreR: 0,
    running: false,
    ended: false,
  };
}

// ---- Rooms ----
const rooms = new Map(); // code -> room

// ---- Matchmaking ----
const mmWaiting = []; // [{ ws, id, nick, elo, seekingAt }]

function randRoom(len = 6) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += abc[(Math.random() * abc.length) | 0];
  return s;
}

function removeMm(ws) {
  for (let i = mmWaiting.length - 1; i >= 0; i--) {
    if (mmWaiting[i].ws === ws) mmWaiting.splice(i, 1);
  }
}

function countConnectedPlayers(room) {
  let n = 0;
  for (const v of room.clients.values()) {
    if (v.side === "left" || v.side === "right") n++;
  }
  return n;
}

function getRoom(code) {
  let r = rooms.get(code);
  if (!r) {
    r = {
      code,
      state: makeInitialState(),
      clients: new Map(), // ws -> { side, id(userId), clientId, nick, elo }
      lastTick: Date.now(),
      tickTimer: null,
      broadcastAcc: 0,
      simAcc: 0,
      simTick: 0,
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

function simStep(room, dt) {
  const st = room.state;
  if (!st.running || st.ended) return;

  const l = st.left;
  const r = st.right;
  const l0x = l.x;
  const l0y = l.y;
  const r0x = r.x;
  const r0y = r.y;

  const lt = clampStrikerLeft(l.tx, l.ty);
  {
    const dx = lt.x - l.x;
    const dy = lt.y - l.y;
    const d = Math.hypot(dx, dy);
    const maxMove = STRIKER_MAX_SPEED * dt;
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
    const maxMove = STRIKER_MAX_SPEED * dt;
    if (d <= maxMove || d < 1e-6) {
      r.x = rt.x;
      r.y = rt.y;
    } else {
      const k = maxMove / d;
      r.x += dx * k;
      r.y += dy * k;
    }
  }

  l.vx = (l.x - l0x) / dt;
  l.vy = (l.y - l0y) / dt;
  r.vx = (r.x - r0x) / dt;
  r.vy = (r.y - r0y) / dt;

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
    // Server-authoritative rating + currency update (best-effort).
    const lElo0 = l.elo | 0;
    const rElo0 = r.elo | 0;
    const dl = eloDelta(lElo0, rElo0, leftWon);
    const dr = -dl;
    l.elo = Math.max(0, Math.round(lElo0 + dl));
    r.elo = Math.max(0, Math.round(rElo0 + dr));

    const lStars = leftWon ? (st.scoreR === 0 ? 2 : 1) : 1;
    const rStars = !leftWon ? (st.scoreL === 0 ? 2 : 1) : 1;

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && lId && rId) {
      (async () => {
        try {
          const lp = await supaGetProfile(lId);
          const rp = await supaGetProfile(rId);
          const lMatches = (lp?.matches | 0) + 1;
          const rMatches = (rp?.matches | 0) + 1;
          const lWins = (lp?.wins | 0) + (leftWon ? 1 : 0);
          const rWins = (rp?.wins | 0) + (!leftWon ? 1 : 0);
          const lStarsNew = (lp?.stars | 0) + lStars;
          const rStarsNew = (rp?.stars | 0) + rStars;
          await supaUpsertProfile({
            id: lId,
            nickname: String(lp?.nickname || l.nick || "Игрок").slice(0, 12),
            elo: l.elo | 0,
            matches: lMatches,
            wins: lWins,
            stars: lStarsNew,
            owned_skins: Array.isArray(lp?.owned_skins) ? lp.owned_skins : ["default"],
            equipped_skin: typeof lp?.equipped_skin === "string" ? lp.equipped_skin : "default",
          });
          await supaUpsertProfile({
            id: rId,
            nickname: String(rp?.nickname || r.nick || "Игрок").slice(0, 12),
            elo: r.elo | 0,
            matches: rMatches,
            wins: rWins,
            stars: rStarsNew,
            owned_skins: Array.isArray(rp?.owned_skins) ? rp.owned_skins : ["default"],
            equipped_skin: typeof rp?.equipped_skin === "string" ? rp.equipped_skin : "default",
          });
        } catch {
          /* ignore best-effort persistence */
        }
      })();
    }
    if (lId) {
      const prev = kings.get(lId);
      if (!prev || (l.elo | 0) >= (prev.elo | 0)) kings.set(lId, { nick: l.nick, elo: l.elo | 0, updatedAt: Date.now() });
    }
    if (rId) {
      const prev = kings.get(rId);
      if (!prev || (r.elo | 0) >= (prev.elo | 0)) kings.set(rId, { nick: r.nick, elo: r.elo | 0, updatedAt: Date.now() });
    }
  }
}

function tick(room) {
  const now = Date.now();
  let frameDt = (now - room.lastTick) / 1000;
  room.lastTick = now;
  frameDt = Math.min(0.1, Math.max(0, frameDt));

  const st = room.state;
  if (!st.running || st.ended) {
    room.broadcastAcc = 0;
    room.simAcc = 0;
    return;
  }

  room.simAcc += frameDt;
  // avoid spiral of death
  room.simAcc = Math.min(room.simAcc, 0.25);
  while (room.simAcc >= SIM_DT) {
    room.simAcc -= SIM_DT;
    room.simTick++;
    simStep(room, SIM_DT);
  }

  room.broadcastAcc += frameDt;
  if (room.broadcastAcc >= 1 / 30) {
    room.broadcastAcc = 0;
    const l = st.left;
    const r = st.right;
    const puck = st.puck;
    broadcast(room, {
      t: "state",
      tick: room.simTick,
      s: {
        puck: { x: puck.x, y: puck.y, vx: puck.vx, vy: puck.vy },
        left: { x: l.x, y: l.y, nick: l.nick, elo: l.elo },
        right: { x: r.x, y: r.y, nick: r.nick, elo: r.elo },
        scoreL: st.scoreL,
        scoreR: st.scoreR,
        running: st.running,
        ackL: st.left.lastSeq | 0,
        ackR: st.right.lastSeq | 0,
      },
    });
  }
}

function maybeStart(room) {
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

// ---- HTTP + WS ----
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/kings", (_req, res) => res.json({ ok: true, ...topKings() }));

// ---- Admin API (JWT + is_admin в profiles; мутации через service role) ----
app.get("/admin/api/search", requireAdmin, asyncHandler(async (req, res) => {
  const q = String(req.query.q || "");
  const users = await supaSearchProfiles(q);
  res.json({ ok: true, users });
}));

app.get("/admin/api/user/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!isUuid(id)) return res.status(400).json({ error: "bad id" });
  const prof = await supaGetProfile(id);
  if (!prof) return res.status(404).json({ error: "not found" });
  res.json({ ok: true, profile: prof });
}));

app.patch("/admin/api/user/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!isUuid(id)) return res.status(400).json({ error: "bad id" });
  const body = req.body || {};
  const patch = {};
  if (typeof body.nickname === "string") patch.nickname = body.nickname.trim().slice(0, 12) || "Игрок";
  if (typeof body.elo === "number" && Number.isFinite(body.elo)) patch.elo = Math.max(0, Math.min(5000, Math.round(body.elo)));
  if (typeof body.stars === "number" && Number.isFinite(body.stars)) patch.stars = Math.max(0, Math.round(body.stars));
  if (typeof body.matches === "number" && Number.isFinite(body.matches)) patch.matches = Math.max(0, Math.round(body.matches));
  if (typeof body.wins === "number" && Number.isFinite(body.wins)) patch.wins = Math.max(0, Math.round(body.wins));
  if (Array.isArray(body.owned_skins)) patch.owned_skins = body.owned_skins.map(String);
  if (typeof body.equipped_skin === "string") patch.equipped_skin = body.equipped_skin.slice(0, 32);
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "empty patch" });
  const row = await supaPatchProfileId(id, patch);
  res.json({ ok: true, profile: row });
}));

app.post("/admin/api/user/:id/elo", requireAdmin, asyncHandler(async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!isUuid(id)) return res.status(400).json({ error: "bad id" });
  const prof = await supaGetProfile(id);
  if (!prof) return res.status(404).json({ error: "not found" });
  let elo = prof.elo | 0;
  if (req.body && typeof req.body.set === "number" && Number.isFinite(req.body.set)) {
    elo = Math.max(0, Math.min(5000, Math.round(req.body.set)));
  } else if (req.body && typeof req.body.delta === "number" && Number.isFinite(req.body.delta)) {
    elo = Math.max(0, Math.min(5000, elo + Math.round(req.body.delta)));
  } else {
    return res.status(400).json({ error: "need set or delta" });
  }
  const row = await supaPatchProfileId(id, { elo });
  res.json({ ok: true, profile: row });
}));

app.post("/admin/api/user/:id/stars", requireAdmin, asyncHandler(async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!isUuid(id)) return res.status(400).json({ error: "bad id" });
  const delta = req.body && req.body.delta;
  if (typeof delta !== "number" || !Number.isFinite(delta)) return res.status(400).json({ error: "need delta" });
  const prof = await supaGetProfile(id);
  if (!prof) return res.status(404).json({ error: "not found" });
  const stars = Math.max(0, (prof.stars | 0) + Math.round(delta));
  const row = await supaPatchProfileId(id, { stars });
  res.json({ ok: true, profile: row });
}));

app.post("/admin/api/user/:id/skin/gold", requireAdmin, asyncHandler(async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!isUuid(id)) return res.status(400).json({ error: "bad id" });
  const prof = await supaGetProfile(id);
  if (!prof) return res.status(404).json({ error: "not found" });
  const skins = Array.isArray(prof.owned_skins) ? [...prof.owned_skins.map(String)] : ["default"];
  if (!skins.includes("default")) skins.unshift("default");
  if (!skins.includes("gold")) skins.push("gold");
  const row = await supaPatchProfileId(id, { owned_skins: skins });
  res.json({ ok: true, profile: row });
}));

app.post("/admin/api/user/:id/grant-admin", requireAdmin, asyncHandler(async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!isUuid(id)) return res.status(400).json({ error: "bad id" });
  if (id === req.adminUserId) return res.status(400).json({ error: "already admin" });
  const row = await supaPatchProfileId(id, { is_admin: true });
  res.json({ ok: true, profile: row });
}));

app.delete("/admin/api/user/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!isUuid(id)) return res.status(400).json({ error: "bad id" });
  if (id === req.adminUserId) return res.status(400).json({ error: "cannot delete self" });
  await supaDeleteAuthUser(id);
  res.json({ ok: true });
}));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  (async () => {
    const url = new URL(req.url, "http://localhost");
    const roomCode = String(url.searchParams.get("room") || "").trim().toUpperCase().slice(0, 12);
    const clientId = String(url.searchParams.get("clientId") || "").trim().toUpperCase().slice(0, 64);
    const token = String(url.searchParams.get("token") || "").trim();

    if (!clientId) {
      ws.close(1008, "Missing clientId");
      return;
    }
    if (!token) {
      ws.close(1008, "Missing token");
      return;
    }

    let userId = "";
    try {
      const v = await verifySupabaseJwt(token);
      userId = v.userId;
    } catch {
      ws.close(1008, "Bad token");
      return;
    }

    let nick = "Игрок";
    let elo = 0;
    try {
      const p = await supaGetProfile(userId);
      if (p) {
        nick = String(p.nickname || "Игрок").trim().slice(0, 12) || "Игрок";
        elo = Math.max(0, Math.min(5000, parseInt(p.elo, 10) || 0));
      } else if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        await supaUpsertProfile({
          id: userId,
          nickname: nick,
          elo: 0,
          stars: 0,
          matches: 0,
          wins: 0,
          owned_skins: ["default"],
          equipped_skin: "default",
        });
      }
    } catch {
      nick = "Игрок";
      elo = 0;
    }

    // Matchmaking connection (no room param)
    if (!roomCode) {
      send(ws, { t: "mm_hello" });
      ws.on("message", (data) => {
        let msg = null;
        try {
          msg = JSON.parse(String(data));
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
          const me = { ws, id: userId, nick, elo, seekingAt: Date.now() };
          // find closest by Elo, within window
          const WINDOW = 250;
          let bestIdx = -1;
          let bestDiff = 1e9;
          for (let i = 0; i < mmWaiting.length; i++) {
            const it = mmWaiting[i];
            if (!it || it.id === userId) continue;
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
            // reserve sides by userId so reconnect is deterministic
            room.state.left.id = other.id;
            room.state.left.nick = other.nick;
            room.state.left.elo = other.elo | 0;
            room.state.right.id = userId;
            room.state.right.nick = nick;
            room.state.right.elo = elo | 0;
            // notify both clients
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
      ws.on("close", () => {
        removeMm(ws);
      });
      return;
    }

    const room = getRoom(roomCode);
    room.clients.set(ws, { id: userId, clientId, nick, elo, side: "spectator" });

    // assign side
    const st = room.state;
    let side = "spectator";
    if (!st.left.id) {
      st.left.id = userId;
      st.left.nick = nick;
      st.left.elo = elo;
      side = "left";
    } else if (!st.right.id && st.left.id !== userId) {
      st.right.id = userId;
      st.right.nick = nick;
      st.right.elo = elo;
      side = "right";
    } else if (st.left.id === userId) {
      side = "left";
      st.left.nick = nick;
      st.left.elo = elo;
    } else if (st.right.id === userId) {
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
      if (!msg || typeof msg.t !== "string") return;
      if (msg.t === "ping") {
        send(ws, { t: "pong", n: msg.n ?? 0, c: msg.c ?? 0, s: Date.now() });
        return;
      }
      if (msg.t !== "input") return;
      const x = +msg.x;
      const y = +msg.y;
      const seq = msg.seq == null ? 0 : (msg.seq | 0);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (side === "left") {
        const c = clampStrikerLeft(x, y);
        st.left.tx = c.x;
        st.left.ty = c.y;
        if (seq > (st.left.lastSeq | 0)) st.left.lastSeq = seq;
      } else if (side === "right") {
        const c = clampStrikerRight(x, y);
        st.right.tx = c.x;
        st.right.ty = c.y;
        if (seq > (st.right.lastSeq | 0)) st.right.lastSeq = seq;
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
  })().catch(() => {
    try {
      ws.close(1011, "Server error");
    } catch {
      /* ignore */
    }
  });
});

server.listen(PORT, () => {
  console.log(`Ice Rush WS server on :${PORT}`);
});

