(function () {
  "use strict";
  try {

  const PROFILE_KEY = "ice_rush_profile_v1";
  const CLIENT_KEY = "ice_rush_client_id_v1";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  // HiDPI: меньше пикселей/лесенок + не ломаем responsive CSS
  const LOGICAL_W = canvas.width;
  const LOGICAL_H = canvas.height;
  let dpr = 1;

  function setupCanvasResolution() {
    dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    canvas.width = Math.round(LOGICAL_W * dpr);
    canvas.height = Math.round(LOGICAL_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }
  setupCanvasResolution();

  // Device detection for layout tweaks (CSS can use body.is-mobile)
  function updateDeviceClass() {
    const isMobile =
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
      (window.matchMedia && window.matchMedia("(hover: none)").matches) ||
      window.innerWidth < 720;
    document.body.classList.toggle("is-mobile", !!isMobile);
  }
  updateDeviceClass();
  window.addEventListener("resize", () => {
    updateDeviceClass();
    setupCanvasResolution();
  });

  const screens = {
    menu: document.getElementById("menu"),
    search: document.getElementById("search"),
    profile: document.getElementById("profile"),
    online: document.getElementById("online"),
    game: document.getElementById("game"),
  };
  const navEloChip = document.getElementById("navEloChip");
  const menuElo = document.getElementById("menuElo");
  const nickView = document.getElementById("nickView");
  const arenaView = document.getElementById("arenaView");
  const btnFind = document.getElementById("btnFind");
  const btnOnline = document.getElementById("btnOnline");
  const btnHowto = document.getElementById("btnHowto");
  const btnProfile = document.getElementById("btnProfile");
  const btnBackFromProfile = document.getElementById("btnBackFromProfile");
  const howto = document.getElementById("howto");
  const searchArena = document.getElementById("searchArena");
  const searchRange = document.getElementById("searchRange");
  const searchStatus = document.getElementById("searchStatus");
  const searchLog = document.getElementById("searchLog");
  const searchFound = document.getElementById("searchFound");
  const overlay = document.getElementById("overlay");
  const profNick = document.getElementById("profNick");
  const profElo = document.getElementById("profElo");
  const profMatches = document.getElementById("profMatches");
  const profWins = document.getElementById("profWins");
  const achList = document.getElementById("achList");
  const nickInput = document.getElementById("nickInput");
  const btnSaveNick = document.getElementById("btnSaveNick");

  // online ui
  const myCodeView = document.getElementById("myCodeView");
  const myLinkView = document.getElementById("myLinkView");
  const onlineStatus = document.getElementById("onlineStatus");
  const onlineHint = document.getElementById("onlineHint");
  const btnOpenMatch = document.getElementById("btnOpenMatch");
  const btnCopyInvite = document.getElementById("btnCopyInvite");
  const btnBackFromOnline = document.getElementById("btnBackFromOnline");

  const W = LOGICAL_W;
  const H = LOGICAL_H;

  const GOALS_TO_WIN = 5;
  const K_ELO = 28;

  const MARGIN = 34;
  const BORDER = 14;
  // квадратные углы (без скругления)
  const RINK_CORNER_R = 0;
  const GOAL_DEPTH = 54;
  const GOAL_HALF_H = 78;

  const STRIKER_R = 32;
  const PUCK_R = 13;

  const MAGNET = 0.25;
  const REST = 0.92;
  const FRICTION = 0.9982;
  const PUCK_MAX_SPEED = 900;

  const inner = {
    left: MARGIN + BORDER,
    right: W - MARGIN - BORDER,
    top: MARGIN + BORDER,
    bottom: H - MARGIN - BORDER,
  };

  const BOT_NAMES = [
    "IceFox92",
    "Snezhok_Pro",
    "puckmaster",
    "zayac_na_konkah",
    "NeoBlade",
    "KotenokOT",
    "Dimon_Hockey",
    "ArenaGrinder",
    "ColdSnip3r",
    "TaylorTwirl",
    "Slapshot_X",
    "rink_rat_7",
  ];

  function loadProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        return {
          nickname: typeof p.nickname === "string" && p.nickname.trim() ? p.nickname.trim().slice(0, 12) : "Игрок",
          elo: Math.max(0, Math.min(4000, parseInt(p.elo, 10) || 0)),
          matches: parseInt(p.matches, 10) || 0,
          wins: parseInt(p.wins, 10) || 0,
        };
      }
    } catch (e) {
      /* ignore */
    }
    return { nickname: "Игрок", elo: 0, matches: 0, wins: 0 };
  }

  function saveProfile() {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  function expectedScore(ra, rb) {
    return 1 / (1 + Math.pow(10, (rb - ra) / 400));
  }

  function eloDelta(playerRating, oppRating, playerWon) {
    const s = playerWon ? 1 : 0;
    const e = expectedScore(playerRating, oppRating);
    return K_ELO * (s - e);
  }

  function arenaFor(elo) {
    if (elo < 250) return "Школьный каток";
    if (elo < 600) return "Районная арена";
    if (elo < 1200) return "Дворец льда";
    if (elo < 2000) return "Профи-клуб";
    return "Элитная лига";
  }

  function setScreen(name) {
    Object.values(screens)
      .filter(Boolean)
      .forEach((el) => el.classList.remove("active"));
    if (screens[name]) screens[name].classList.add("active");
  }

  function randId(len = 10) {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < len; i++) s += abc[(Math.random() * abc.length) | 0];
    return s;
  }

  function getClientId() {
    let id = "";
    try {
      id = (localStorage.getItem(CLIENT_KEY) || "").trim();
    } catch {
      id = "";
    }
    if (!id) {
      id = randId(10);
      try {
        localStorage.setItem(CLIENT_KEY, id);
      } catch {
        /* ignore */
      }
    }
    return id;
  }

  const clientId = getClientId();

  async function copyText(txt) {
    const t = String(txt || "");
    if (!t) return false;
    try {
      await navigator.clipboard.writeText(t);
      return true;
    } catch {
      return false;
    }
  }

  // Netlify online mode uses Functions + Blobs for signaling

  function updateMenuUi() {
    navEloChip.textContent = "Elo " + profile.elo;
    menuElo.textContent = String(profile.elo);
    nickView.textContent = profile.nickname;
    arenaView.textContent = arenaFor(profile.elo);
    if (profNick) profNick.textContent = profile.nickname;
    if (profElo) profElo.textContent = String(profile.elo);
    if (profMatches) profMatches.textContent = String(profile.matches);
    if (profWins) profWins.textContent = String(profile.wins);
    if (achList) renderAchievements();
  }

  function renderAchievements() {
    const items = [
      { id: "first", name: "Первый матч", ok: profile.matches >= 1, hint: "Сыграть 1 матч" },
      { id: "win1", name: "Первая победа", ok: profile.wins >= 1, hint: "Выиграть 1 матч" },
      { id: "elo250", name: "Арена: Район", ok: profile.elo >= 250, hint: "Достичь Elo 250" },
      { id: "elo600", name: "Арена: Дворец", ok: profile.elo >= 600, hint: "Достичь Elo 600" },
      { id: "elo1200", name: "Арена: Профи", ok: profile.elo >= 1200, hint: "Достичь Elo 1200" },
      { id: "elo2000", name: "Арена: Элитная лига", ok: profile.elo >= 2000, hint: "Достичь Elo 2000" },
      { id: "win10", name: "10 побед", ok: profile.wins >= 10, hint: "Выиграть 10 матчей" },
    ];
    achList.innerHTML = "";
    for (const it of items) {
      const li = document.createElement("li");
      li.innerHTML =
        `<span>${it.name}</span>` +
        `<span class="ach-badge">${it.ok ? "Открыто" : it.hint}</span>`;
      achList.appendChild(li);
    }
  }

  // -------- sounds (WebAudio) --------
  let audioCtx = null;
  function ensureAudio() {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
  }

  function beep(type) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    if (type === "hit") o.frequency.setValueAtTime(330, t0);
    else if (type === "wall") o.frequency.setValueAtTime(220, t0);
    else if (type === "goal") o.frequency.setValueAtTime(520, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + 0.14);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function pickOpponentElo(your) {
    const base = Math.max(0, your);
    const u = Math.random() + Math.random();
    const tri = u - 1;
    const band = 55 + Math.random() * 80;
    return Math.round(Math.max(0, Math.min(3600, base + tri * band)));
  }

  function aiSpeedFor(aiElo, yourElo) {
    let s = 235 + (aiElo / 3600) * 340;
    if (aiElo > yourElo + 70) s += 25;
    if (aiElo + 120 < yourElo) s -= 18;
    return Math.max(160, Math.min(520, s));
  }

  // Input
  let mouse = { x: inner.left + 120, y: H / 2 };
  let pointerInCanvas = false;

  function canvasToGame(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = W / rect.width;
    const sy = H / rect.height;
    return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
  }

  function clampMouseToPlayable(p) {
    // не даём курсору "уехать" — сохраняем последнее валидное положение в вашей половине
    const c = clampStrikerSide(localSide(), p.x, p.y);
    mouse.x = c.x;
    mouse.y = c.y;
  }

  canvas.addEventListener("mousemove", (e) => {
    ensureAudio();
    const p = canvasToGame(e.clientX, e.clientY);
    clampMouseToPlayable(p);
    pointerInCanvas = true;
  });
  canvas.addEventListener("mouseleave", () => {
    // остаёмся на последней точке, не "сбиваем" юнит
    pointerInCanvas = false;
  });
  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      ensureAudio();
      const t = e.touches[0];
      const p = canvasToGame(t.clientX, t.clientY);
      clampMouseToPlayable(p);
      pointerInCanvas = true;
    },
    { passive: false }
  );
  canvas.addEventListener("touchstart", (e) => {
    ensureAudio();
    const t = e.touches[0];
    const p = canvasToGame(t.clientX, t.clientY);
    clampMouseToPlayable(p);
    pointerInCanvas = true;
  });

  // Entities
  const puck = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  const player = { x: inner.left + 150, y: H / 2, px: 0, py: 0, vx: 0, vy: 0 };
  const ai = { x: inner.right - 150, y: H / 2, px: 0, py: 0, vx: 0, vy: 0 };

  let scorePlayer = 0;
  let scoreAi = 0;
  let paused = true;
  let lastTs = 0;

  let opponentName = "Бот";
  let opponentElo = 0;
  let opponentSpeed = 260;
  let aiMode = "neutral"; // defend | attack | unstuck
  let aiModeT = 0;
  let lastPuckX = puck.x;
  let lastPuckY = puck.y;
  let stuckT = 0;

  // -------- online 1v1 (WebRTC P2P + Netlify signaling) --------
  const online = {
    enabled: false,
    role: "none", // host | guest | none
    code: "",
    invite: "",
    pc: null,
    dc: null,
    pollAfter: 0,
    pollTimer: 0,
    sendAcc: 0,
    inputRemote: { x: inner.right - 150, y: H / 2, t: 0 },
    phase: "idle", // idle | waiting | playing
  };

  function setOnlineStatus(txt) {
    if (onlineStatus) onlineStatus.textContent = txt;
    if (onlineHint) onlineHint.textContent = txt;
  }

  function localSide() {
    if (!online.enabled) return "left";
    return online.role === "guest" ? "right" : "left";
  }

  function remoteSide() {
    const s = localSide();
    return s === "left" ? "right" : "left";
  }

  function clampStrikerSide(side, x, y) {
    return side === "right" ? clampStrikerRight(x, y) : clampStrikerLeft(x, y);
  }

  function getLocalStriker() {
    return localSide() === "left" ? player : ai;
  }

  function getRemoteStriker() {
    return localSide() === "left" ? ai : player;
  }

  function teardownOnline() {
    online.enabled = false;
    online.role = "none";
    online.code = "";
    online.invite = "";
    online.pollAfter = 0;
    online.sendAcc = 0;
    online.inputRemote = { x: inner.right - 150, y: H / 2, t: 0 };
    online.phase = "idle";
    try {
      online.dc?.close();
    } catch {
      /* ignore */
    }
    try {
      online.pc?.close();
    } catch {
      /* ignore */
    }
    if (online.pollTimer) {
      clearInterval(online.pollTimer);
      online.pollTimer = 0;
    }
    online.dc = null;
    online.pc = null;
    if (btnCopyInvite) btnCopyInvite.disabled = true;
    if (btnOpenMatch) btnOpenMatch.disabled = true;
  }

  async function apiCreateRoom() {
    const r = await fetch("/.netlify/functions/room-create", { method: "POST" });
    const j = await r.json();
    if (!j?.ok || !j?.code) throw new Error(j?.error || "create failed");
    return String(j.code).toUpperCase();
  }

  async function apiSend(code, type, payload) {
    const r = await fetch("/.netlify/functions/room-send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, clientId, type, payload }),
    });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.error || "send failed");
    return j.seq || 0;
  }

  async function apiPoll(code, after) {
    const u = new URL("/.netlify/functions/room-poll", window.location.origin);
    u.searchParams.set("code", code);
    u.searchParams.set("clientId", clientId);
    u.searchParams.set("after", String(after || 0));
    u.searchParams.set("includeSelf", "1");
    const r = await fetch(u.toString(), { method: "GET", cache: "no-store" });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.error || "poll failed");
    return j;
  }

  function setupPeer(role) {
    teardownOnline();
    online.enabled = true;
    online.role = role;
    online.pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    online.pc.onicecandidate = (e) => {
      if (e.candidate && online.code) {
        apiSend(online.code, "ice", e.candidate).catch(() => {});
      }
    };
    if (role === "host") {
      online.dc = online.pc.createDataChannel("game", { ordered: true });
      wireDataChannel();
    } else {
      online.pc.ondatachannel = (e) => {
        online.dc = e.channel;
        wireDataChannel();
      };
    }
  }

  function wireDataChannel() {
    if (!online.dc) return;
    online.dc.onopen = () => {
      setOnlineStatus("Подключено · стартуем матч");
      startOnlineMatch();
    };
    online.dc.onclose = () => setOnlineStatus("Канал закрыт");
    online.dc.onerror = () => setOnlineStatus("Ошибка канала");
    online.dc.onmessage = (e) => {
      let msg = null;
      try {
        msg = JSON.parse(e.data);
      } catch {
        msg = null;
      }
      if (!msg || typeof msg.t !== "string") return;
      if (msg.t === "input") {
        if (online.role === "host" && msg.x != null && msg.y != null) {
          online.inputRemote.x = +msg.x;
          online.inputRemote.y = +msg.y;
          online.inputRemote.t = Date.now();
        }
      } else if (msg.t === "state") {
        if (online.role === "guest" && msg.s) applyNetState(msg.s);
      } else if (msg.t === "end") {
        if (online.role === "guest") {
          paused = true;
          showOnlineEnd(!!msg?.win);
        }
      }
    };
  }

  function dcSend(obj) {
    try {
      if (online.dc && online.dc.readyState === "open") {
        online.dc.send(JSON.stringify(obj));
      }
    } catch {
      /* ignore */
    }
  }

  function makeState() {
    return {
      puck: { x: puck.x, y: puck.y, vx: puck.vx, vy: puck.vy },
      left: { x: player.x, y: player.y },
      right: { x: ai.x, y: ai.y },
      sp: scorePlayer,
      sa: scoreAi,
    };
  }

  function applyNetState(s) {
    if (!s) return;
    if (s.puck) {
      puck.x = +s.puck.x;
      puck.y = +s.puck.y;
      puck.vx = +s.puck.vx;
      puck.vy = +s.puck.vy;
    }
    if (s.left) {
      player.x = +s.left.x;
      player.y = +s.left.y;
    }
    if (s.right) {
      ai.x = +s.right.x;
      ai.y = +s.right.y;
    }
    if (Number.isFinite(+s.sp)) scorePlayer = +s.sp;
    if (Number.isFinite(+s.sa)) scoreAi = +s.sa;
  }

  function showOnlineEnd(localWin) {
    overlay.innerHTML =
      (localWin ? "Победа!" : "Поражение") +
      `<div style="font-size:1rem;font-weight:800;color:#2d7cc9">Онлайн матч</div>` +
      `<button class="btn btn-accent" id="btnBack" style="max-width:240px">В меню</button>`;
    overlay.classList.add("visible");
    document.getElementById("btnBack").onclick = () => {
      overlay.classList.remove("visible");
      teardownOnline();
      setScreen("menu");
    };
  }

  function startOnlineMatch() {
    opponentName = online.role === "host" ? "Гость" : "Хост";
    opponentElo = 0;
    opponentSpeed = 0;
    aiMode = "neutral";
    if (online.role === "host") {
      resetMatch();
    }
    online.phase = "playing";
    paused = false;
    lastTs = 0;
    setScreen("game");
    overlay.classList.remove("visible");
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

  function resetPuck(servePlayer) {
    puck.x = W / 2 + (servePlayer ? -44 : 44);
    puck.y = H / 2 + (Math.random() - 0.5) * 40;
    const ang = (Math.random() - 0.5) * 0.6 + (servePlayer ? 0 : Math.PI);
    const sp = 190 + Math.random() * 70;
    puck.vx = Math.cos(ang) * sp;
    puck.vy = Math.sin(ang) * sp;
  }

  function resetMatch() {
    scorePlayer = 0;
    scoreAi = 0;
    player.x = inner.left + 150;
    player.y = H / 2;
    ai.x = inner.right - 150;
    ai.y = H / 2;
    player.px = player.x;
    player.py = player.y;
    ai.px = ai.x;
    ai.py = ai.y;
    resetPuck(Math.random() < 0.5);
  }

  function reflectPuck(nx, ny) {
    const vn = puck.vx * nx + puck.vy * ny;
    if (vn < 0) {
      const j = -(1 + REST) * vn;
      puck.vx += j * nx;
      puck.vy += j * ny;
    }
  }

  function enforcePuckBounds() {
    // квадратные борта: честный отскок от стен (угол = двойной отскок X+Y)
    const ix = inner.left;
    const iy = inner.top;
    const ox = inner.right;
    const oy = inner.bottom;
    const r = PUCK_R;
    const gy0 = goalY0();
    const gy1 = goalY1();
    const inGoalY = puck.y > gy0 && puck.y < gy1;

    // left/right walls (goal opening lets puck pass through)
    if (!inGoalY && puck.x - r < ix) {
      puck.x = ix + r;
      puck.vx = Math.abs(puck.vx) * REST;
      beep("wall");
    }
    if (!inGoalY && puck.x + r > ox) {
      puck.x = ox - r;
      puck.vx = -Math.abs(puck.vx) * REST;
      beep("wall");
    }

    // top/bottom walls
    if (puck.y - r < iy) {
      puck.y = iy + r;
      puck.vy = Math.abs(puck.vy) * REST;
      beep("wall");
    }
    if (puck.y + r > oy) {
      puck.y = oy - r;
      puck.vy = -Math.abs(puck.vy) * REST;
      beep("wall");
    }
  }

  function collideStriker(striker) {
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
      beep("hit");
    }

    const sp = Math.hypot(puck.vx, puck.vy);
    if (sp > PUCK_MAX_SPEED) {
      const k = PUCK_MAX_SPEED / sp;
      puck.vx *= k;
      puck.vy *= k;
    }
    for (let i = 0; i < 3; i++) enforcePuckBounds();
  }

  function goalCheck() {
    const gy0 = goalY0() + PUCK_R * 0.25;
    const gy1 = goalY1() - PUCK_R * 0.25;
    if (puck.y <= gy0 || puck.y >= gy1) return false;

    if (puck.x - PUCK_R < inner.left + 8) {
      scoreAi++;
      beep("goal");
      if (scoreAi >= GOALS_TO_WIN) endMatch(false);
      else resetPuck(true);
      return true;
    }
    if (puck.x + PUCK_R > inner.right - 8) {
      scorePlayer++;
      beep("goal");
      if (scorePlayer >= GOALS_TO_WIN) endMatch(true);
      else resetPuck(false);
      return true;
    }
    return false;
  }

  function endMatch(playerWon) {
    if (online.enabled) {
      paused = true;
      const localWin = localSide() === "left" ? !!playerWon : !playerWon;
      if (online.role === "host") {
        dcSend({ t: "end", win: !playerWon });
      }
      showOnlineEnd(localWin);
      return;
    }
    paused = true;
    const delta = Math.round(eloDelta(profile.elo, opponentElo, playerWon));
    profile.elo = Math.max(0, profile.elo + delta);
    profile.matches = (profile.matches || 0) + 1;
    if (playerWon) profile.wins = (profile.wins || 0) + 1;
    saveProfile();
    updateMenuUi();
    overlay.innerHTML =
      (playerWon ? "Победа!" : "Поражение") +
      `<div style=\"font-size:1rem;font-weight:800;color:#2d7cc9\">Elo: ${delta > 0 ? "+" : ""}${delta} → ${profile.elo}</div>` +
      `<button class=\"btn btn-accent\" id=\"btnBack\" style=\"max-width:240px\">В меню</button>`;
    overlay.classList.add("visible");
    document.getElementById("btnBack").onclick = () => {
      overlay.classList.remove("visible");
      setScreen("menu");
    };
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function puckSpeed() {
    return Math.hypot(puck.vx, puck.vy);
  }

  function nearWallOrCorner(x, y) {
    const m = 34;
    const nearWall =
      x < inner.left + m || x > inner.right - m || y < inner.top + m || y > inner.bottom - m;
    const nearCorner =
      (x < inner.left + m && y < inner.top + m) ||
      (x < inner.left + m && y > inner.bottom - m) ||
      (x > inner.right - m && y < inner.top + m) ||
      (x > inner.right - m && y > inner.bottom - m);
    return { nearWall, nearCorner };
  }

  function updateAI(dt) {
    aiModeT += dt;

    // stuck detection: puck almost not moving & hasn't changed position
    const dp = Math.hypot(puck.x - lastPuckX, puck.y - lastPuckY);
    lastPuckX = puck.x;
    lastPuckY = puck.y;
    const sp = puckSpeed();
    const nw = nearWallOrCorner(puck.x, puck.y);
    if (sp < 28 && dp < 1.2 && (nw.nearWall || nw.nearCorner)) stuckT += dt;
    else stuckT = Math.max(0, stuckT - dt * 1.5);

    // choose mode
    if (stuckT > 0.35) aiMode = "unstuck";
    else if (puck.x < W / 2 - 24) aiMode = "defend";
    else aiMode = "attack";

    // target computation
    let tx = puck.x + puck.vx * 0.16;
    let ty = puck.y + puck.vy * 0.16;

    // hard rule: do not pin puck in right corners
    const cornerPad = 54;
    const inRight = puck.x > inner.right - cornerPad;
    const inTop = puck.y < inner.top + cornerPad;
    const inBottom = puck.y > inner.bottom - cornerPad;
    const puckInRightCorner = inRight && (inTop || inBottom);
    const apDx = ai.x - puck.x;
    const apDy = ai.y - puck.y;
    const apD = Math.hypot(apDx, apDy);
    if (puckInRightCorner && apD < STRIKER_R + PUCK_R + 14) {
      // step off to side so puck can roll out, then sweep leftwards
      const sgn = puck.y < H / 2 ? 1 : -1;
      tx = inner.right - STRIKER_R - 18;
      ty = clamp(puck.y + 46 * sgn, inner.top + STRIKER_R + 8, inner.bottom - STRIKER_R - 8);
      aiMode = "unstuck";
      stuckT = Math.max(stuckT, 0.4);
    }

    const goalCenter = { x: inner.left + 10, y: H / 2 };
    const toGoalX = goalCenter.x - puck.x;
    const toGoalY = goalCenter.y - puck.y;
    const toGoalD = Math.hypot(toGoalX, toGoalY) || 1;

    // "behind puck" point to hit toward player's goal
    const behindDist = 44;
    let behindX = puck.x - (toGoalX / toGoalD) * behindDist;
    let behindY = puck.y - (toGoalY / toGoalD) * behindDist;

    // avoid pinning into walls: if puck near a wall, approach from inside
    if (nw.nearWall) {
      const insideX = clamp(puck.x, inner.left + 70, inner.right - 70);
      const insideY = clamp(puck.y, inner.top + 70, inner.bottom - 70);
      const ax = puck.x - insideX;
      const ay = puck.y - insideY;
      const ad = Math.hypot(ax, ay) || 1;
      behindX = puck.x + (ax / ad) * 52;
      behindY = puck.y + (ay / ad) * 52;
    }

    if (aiMode === "defend") {
      tx = W / 2 + 86;
      ty = puck.y * 0.55 + (H / 2) * 0.45;
      // if puck enters AI half fast, step up
      if (puck.x > W / 2 + 12 || sp > 220) {
        tx = behindX;
        ty = behindY;
      }
    } else if (aiMode === "unstuck") {
      // go to a side of puck and sweep it out to center
      const cx = W / 2;
      const cy = H / 2;
      const nx = cx - puck.x;
      const ny = cy - puck.y;
      const nd = Math.hypot(nx, ny) || 1;
      // approach slightly offset (perpendicular) to avoid standing exactly on puck
      const px = -ny / nd;
      const py = nx / nd;
      const sgn = puck.y < cy ? 1 : -1;
      // stronger sweep and always biased to push towards center
      tx = puck.x - (nx / nd) * 38 + px * 42 * sgn;
      ty = puck.y - (ny / nd) * 38 + py * 42 * sgn;
      // if puck is in right corner, force a leftward contact (avoid pushing deeper)
      if (puckInRightCorner) {
        tx = puck.x - 72;
        ty = clamp(puck.y + 52 * sgn, inner.top + STRIKER_R + 8, inner.bottom - STRIKER_R - 8);
      }
    } else {
      // attack: take behind-puck position, with small orbit if too close
      tx = behindX;
      ty = behindY;
    }

    // if already very close to target, orbit around puck to prevent "standing still"
    const ddx = tx - ai.x;
    const ddy = ty - ai.y;
    const dd = Math.hypot(ddx, ddy);
    if (dd < 10) {
      const ox = puck.x - ai.x;
      const oy = puck.y - ai.y;
      const od = Math.hypot(ox, oy) || 1;
      tx = ai.x + (-oy / od) * 28;
      ty = ai.y + (ox / od) * 28;
    }

    // агрессия: когда игрок сильно двигается или шайба быстрая — бот ускоряется
    const playerAgg = Math.min(1, Math.hypot(player.vx, player.vy) / 850);
    const puckAgg = Math.min(1, puckSpeed() / 650);
    const aggr = 1 + 0.55 * Math.max(playerAgg, puckAgg);
    const dx = tx - ai.x;
    const dy = ty - ai.y;
    const d = Math.hypot(dx, dy) || 1;
    const step = Math.min(d, opponentSpeed * aggr * dt);
    ai.x += (dx / d) * step;
    ai.y += (dy / d) * step;

    const c = clampStrikerRight(ai.x, ai.y);
    ai.x = c.x;
    ai.y = c.y;
  }

  function updatePlayer() {
    // waiting via link: show match but freeze control
    if (online.enabled && online.phase === "waiting") return;
    const s = localSide();
    const me = getLocalStriker();
    const target = clampStrikerSide(s, mouse.x, mouse.y);
    me.x += (target.x - me.x) * MAGNET;
    me.y += (target.y - me.y) * MAGNET;
    const c = clampStrikerSide(s, me.x, me.y);
    me.x = c.x;
    me.y = c.y;

    // host: move remote striker towards last received input
    if (online.enabled && online.role === "host") {
      const rs = remoteSide();
      const other = getRemoteStriker();
      const rt = clampStrikerSide(rs, online.inputRemote.x, online.inputRemote.y);
      other.x += (rt.x - other.x) * 0.22;
      other.y += (rt.y - other.y) * 0.22;
      const cc = clampStrikerSide(rs, other.x, other.y);
      other.x = cc.x;
      other.y = cc.y;
    }
  }

  function stepPuck(dt) {
    const travel = Math.hypot(puck.vx * dt, puck.vy * dt);
    const sub = Math.min(40, Math.max(1, Math.ceil(travel / Math.max(2.6, PUCK_R * 0.22))));
    const sdt = dt / sub;
    for (let i = 0; i < sub; i++) {
      puck.x += puck.vx * sdt;
      puck.y += puck.vy * sdt;
      enforcePuckBounds();
    }
    puck.vx *= FRICTION;
    puck.vy *= FRICTION;
  }

  function drawGoal(side) {
    const gy0 = goalY0();
    const gy1 = goalY1();
    const ext = 18;
    const depth = 46;
    ctx.save();
    if (side === "left") {
      const xM = inner.left;
      const xB = inner.left - ext;
      const g = ctx.createLinearGradient(xB - depth, gy0, xM + 4, gy1);
      g.addColorStop(0, "#1b2b44");
      g.addColorStop(1, "#4a7fb2");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(xB - depth, gy0 - 6);
      ctx.lineTo(xB - depth, gy1 + 6);
      ctx.lineTo(xM, gy1 + 2);
      ctx.lineTo(xM, gy0 - 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.strokeRect(xM - 2, gy0 - 1, 2, gy1 - gy0 + 2);
      ctx.strokeStyle = "#c41e2a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(xM, gy0 - 2);
      ctx.lineTo(xM, gy1 + 2);
      ctx.stroke();
    } else {
      const xM = inner.right;
      const xB = inner.right + ext;
      const g = ctx.createLinearGradient(xB + depth, gy0, xM - 4, gy1);
      g.addColorStop(0, "#1b2b44");
      g.addColorStop(1, "#4a7fb2");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(xM, gy0 - 2);
      ctx.lineTo(xM, gy1 + 2);
      ctx.lineTo(xB + depth, gy1 + 6);
      ctx.lineTo(xB + depth, gy0 - 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.strokeRect(xM, gy0 - 1, 2, gy1 - gy0 + 2);
      ctx.strokeStyle = "#c41e2a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(xM + 1, gy0 - 2);
      ctx.lineTo(xM + 1, gy1 + 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRink() {
    // Outer
    ctx.fillStyle = "#d9eeff";
    ctx.fillRect(0, 0, W, H);

    // Boards
    ctx.strokeStyle = "#2d7cc9";
    ctx.lineWidth = BORDER;
    ctx.beginPath();
    ctx.roundRect(MARGIN / 2, MARGIN / 2, W - MARGIN, H - MARGIN, 24);
    ctx.stroke();

    // Ice rounded rect
    ctx.save();
    ctx.beginPath();
    ctx.rect(inner.left, inner.top, inner.right - inner.left, inner.bottom - inner.top);
    ctx.clip();

    const g = ctx.createLinearGradient(inner.left, inner.top, inner.right, inner.bottom);
    g.addColorStop(0, "#e7f5ff");
    g.addColorStop(0.5, "#d8efff");
    g.addColorStop(1, "#c6e6ff");
    ctx.fillStyle = g;
    ctx.fillRect(inner.left, inner.top, inner.right - inner.left, inner.bottom - inner.top);

    // Subtle blue grid/dots
    ctx.fillStyle = "rgba(30, 90, 160, 0.22)";
    for (let x = inner.left + 6; x < inner.right; x += 16) {
      for (let y = inner.top + 6; y < inner.bottom; y += 16) {
        ctx.globalAlpha = 0.06 + (((x + y) % 7) * 0.01);
        ctx.beginPath();
        ctx.arc(x, y, 1.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Center red line
    ctx.strokeStyle = "#d03042";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2, inner.top);
    ctx.lineTo(W / 2, inner.bottom);
    ctx.stroke();

    // Center circle
    ctx.strokeStyle = "#4a9ede";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 46, 0, Math.PI * 2);
    ctx.stroke();

    // Faceoff circles
    const spots = [
      { x: inner.left + 122, y: H / 2 - 92 },
      { x: inner.left + 122, y: H / 2 + 92 },
      { x: inner.right - 122, y: H / 2 - 92 },
      { x: inner.right - 122, y: H / 2 + 92 },
    ];
    ctx.strokeStyle = "#d03042";
    ctx.lineWidth = 3;
    for (const s of spots) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x - 10, s.y);
      ctx.lineTo(s.x + 10, s.y);
      ctx.moveTo(s.x, s.y - 10);
      ctx.lineTo(s.x, s.y + 10);
      ctx.stroke();
      ctx.lineWidth = 3;
    }

    // Goal “openings” guides
    ctx.strokeStyle = "rgba(60, 120, 200, 0.18)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(inner.left + 1.5, goalY0());
    ctx.lineTo(inner.left + 1.5, goalY1());
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(inner.right - 1.5, goalY0());
    ctx.lineTo(inner.right - 1.5, goalY1());
    ctx.stroke();

    ctx.restore();
  }

  function drawPuck() {
    const g = ctx.createRadialGradient(puck.x - 5, puck.y - 5, 1, puck.x, puck.y, PUCK_R);
    g.addColorStop(0, "#666");
    g.addColorStop(1, "#0b0b0b");
    ctx.beginPath();
    ctx.arc(puck.x, puck.y, PUCK_R, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawStriker(s, color) {
    const g = ctx.createRadialGradient(s.x - 10, s.y - 10, 2, s.x, s.y, STRIKER_R);
    g.addColorStop(0, color === "#d42c3a" ? "#ff8b8b" : "#7cc3ff");
    g.addColorStop(1, color);
    ctx.beginPath();
    ctx.arc(s.x, s.y, STRIKER_R, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  function drawStars() {
    const total = GOALS_TO_WIN;
    const cx = W / 2;
    const gap = 24;
    const startX = cx - ((total - 1) * gap) / 2;
    const sy = 22;
    for (let i = 0; i < total; i++) {
      const x = startX + i * gap;
      ctx.beginPath();
      for (let j = 0; j < 10; j++) {
        const rr = j % 2 === 0 ? 8 : 3.5;
        const a = (j * Math.PI) / 5 - Math.PI / 2;
        const px = x + Math.cos(a) * rr;
        const py = sy + Math.sin(a) * rr;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (i < scorePlayer) {
        ctx.fillStyle = "#ff6b86";
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(200,215,235,0.9)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  function drawHud() {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(0, 0, W, 48);
    ctx.fillStyle = "rgba(26,39,68,0.85)";
    ctx.font = "700 12px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(profile.nickname + " · " + scorePlayer, 64, 30);
    ctx.textAlign = "right";
    ctx.fillText(opponentName + " · " + scoreAi, W - 14, 30);
    ctx.textAlign = "center";
    drawStars();
    ctx.textAlign = "left";
    // Home icon
    const bx = 16;
    const by = 10;
    const s = 30;
    ctx.fillStyle = "#ff8c42";
    ctx.fillRect(bx, by, s, s);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(bx + s / 2, by + 7);
    ctx.lineTo(bx + 9, by + 16);
    ctx.lineTo(bx + 9, by + 24);
    ctx.lineTo(bx + s - 9, by + 24);
    ctx.lineTo(bx + s - 9, by + 16);
    ctx.closePath();
    ctx.fill();
  }

  function draw() {
    // гарантируем корректный HiDPI масштаб каждый кадр (некоторые браузеры/операции могут сбрасывать transform)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.clearRect(0, 0, W, H);
    drawRink();
    drawGoal("left");
    drawGoal("right");
    drawPuck();
    // local = red, remote = blue
    const me = getLocalStriker();
    const other = getRemoteStriker();
    if (!(online.enabled && online.phase === "waiting")) {
      drawStriker(other, "#1a4d8c");
    }
    drawStriker(me, "#d42c3a");
    drawHud();
  }

  canvas.addEventListener("click", (e) => {
    const p = canvasToGame(e.clientX, e.clientY);
    if (p.x >= 16 && p.x <= 46 && p.y >= 10 && p.y <= 40) {
      paused = true;
      overlay.innerHTML = `<div>Пауза</div><button class=\"btn btn-accent\" id=\"btnMenu\" style=\"max-width:240px\">В меню</button><button class=\"btn btn-ghost\" id=\"btnResume\" style=\"max-width:240px\">Продолжить</button>`;
      overlay.classList.add("visible");
      document.getElementById("btnMenu").onclick = () => {
        overlay.classList.remove("visible");
        setScreen("menu");
      };
      document.getElementById("btnResume").onclick = () => {
        overlay.classList.remove("visible");
        paused = false;
        lastTs = 0;
      };
    }
  });

  function step(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    dt = Math.min(dt, 0.05);
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;

    if (!paused && screens.game.classList.contains("active")) {
      const safeDt = dt < 1e-4 ? 1 / 60 : dt;
      player.vx = (player.x - player.px) / safeDt;
      player.vy = (player.y - player.py) / safeDt;
      ai.vx = (ai.x - ai.px) / safeDt;
      ai.vy = (ai.y - ai.py) / safeDt;
      player.px = player.x;
      player.py = player.y;
      ai.px = ai.x;
      ai.py = ai.y;

      updatePlayer();
      if (!online.enabled) {
        updateAI(dt);
        stepPuck(dt);
        collideStriker(player);
        collideStriker(ai);
        for (let i = 0; i < 3; i++) enforcePuckBounds();
        goalCheck();
      } else if (online.role === "host") {
        // host-authoritative simulation
        stepPuck(dt);
        collideStriker(player);
        collideStriker(ai);
        for (let i = 0; i < 3; i++) enforcePuckBounds();
        const g = goalCheck();
        online.sendAcc += dt;
        if (online.sendAcc > 0.05 || g) {
          online.sendAcc = 0;
          dcSend({ t: "state", s: makeState() });
        }
      } else {
        // guest: receive state, only send input
        online.sendAcc += dt;
        if (online.sendAcc > 0.03) {
          online.sendAcc = 0;
          const me = getLocalStriker();
          dcSend({ t: "input", x: me.x, y: me.y });
        }
      }
    }

    draw();
    requestAnimationFrame(step);
  }

  btnHowto.addEventListener("click", () => howto.classList.toggle("hidden"));

  btnProfile.addEventListener("click", () => {
    updateMenuUi();
    if (nickInput) nickInput.value = profile.nickname || "";
    setScreen("profile");
  });

  btnSaveNick?.addEventListener("click", () => {
    const nm = (nickInput?.value || "").trim().slice(0, 12);
    if (!nm) return;
    profile.nickname = nm;
    saveProfile();
    updateMenuUi();
  });
  btnBackFromProfile.addEventListener("click", () => {
    setScreen("menu");
  });

  function roomLink(code) {
    return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(code)}`;
  }

  async function ensurePersonalRoom() {
    const key = "ice_rush_personal_room_v1";
    let code = "";
    try {
      code = (localStorage.getItem(key) || "").trim().toUpperCase();
    } catch {
      code = "";
    }
    if (!code) {
      code = await apiCreateRoom();
      try {
        localStorage.setItem(key, code);
      } catch {
        /* ignore */
      }
    }
    return code;
  }

  function setUrlToRoom(code) {
    const u = new URL(window.location.href);
    u.searchParams.set("room", code);
    history.pushState(null, "", u.toString());
  }

  function clearRoomFromUrl() {
    const u = new URL(window.location.href);
    u.searchParams.delete("room");
    history.replaceState(null, "", u.toString());
  }

  async function joinByLink(code) {
    // show empty match and wait for second player
    teardownOnline();
    online.enabled = true;
    online.code = code;
    online.phase = "waiting";
    puck.x = W / 2;
    puck.y = H / 2;
    puck.vx = 0;
    puck.vy = 0;
    player.x = inner.left + 150;
    player.y = H / 2;
    ai.x = inner.right - 150;
    ai.y = H / 2;
    paused = true;
    overlay.innerHTML = `<div>Ожидание игрока…</div><div style="font-size:0.95rem;font-weight:800;color:#2d7cc9">Ссылка: ${code}</div><button class="btn btn-ghost" id="btnCancelWait" style="max-width:240px">В меню</button>`;
    overlay.classList.add("visible");
    document.getElementById("btnCancelWait").onclick = () => {
      overlay.classList.remove("visible");
      teardownOnline();
      clearRoomFromUrl();
      setScreen("menu");
    };
    setScreen("game");

    // leader election via claim messages
    const claimPayload = { clientId };
    let claimed = false;
    let hostClientId = "";

    const decideRoleFrom = (messages) => {
      const claims = (messages || []).filter((m) => m.type === "claim" && m.payload?.clientId);
      if (!claims.length) return "";
      claims.sort((a, b) => (a.seq || 0) - (b.seq || 0));
      return String(claims[0].payload.clientId);
    };

    if (online.pollTimer) clearInterval(online.pollTimer);
    online.pollAfter = 0;
    online.pollTimer = setInterval(async () => {
      try {
        const res = await apiPoll(code, online.pollAfter);
        online.pollAfter = Math.max(online.pollAfter, res.seq || 0);
        hostClientId = decideRoleFrom(res.messages);
        if (!hostClientId && !claimed) {
          claimed = true;
          await apiSend(code, "claim", claimPayload);
          return;
        }

        if (!hostClientId) return;
        const shouldBeHost = hostClientId === clientId;
        if (!online.pc) setupPeer(shouldBeHost ? "host" : "guest");
        online.code = code;

        // host: create offer once
        if (shouldBeHost && !online.pc.localDescription) {
          const offer = await online.pc.createOffer();
          await online.pc.setLocalDescription(offer);
          await apiSend(code, "offer", offer);
          setOnlineStatus("Ссылка активна · ждём подключения…");
        }

        // handle signaling messages
        for (const m of res.messages || []) {
          if (m.type === "offer" && !shouldBeHost && !online.pc.currentRemoteDescription) {
            await online.pc.setRemoteDescription(m.payload);
            const ans = await online.pc.createAnswer();
            await online.pc.setLocalDescription(ans);
            await apiSend(code, "answer", ans);
          } else if (m.type === "answer" && shouldBeHost) {
            if (!online.pc.currentRemoteDescription) await online.pc.setRemoteDescription(m.payload);
          } else if (m.type === "ice") {
            try {
              await online.pc.addIceCandidate(m.payload);
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }
    }, 650);
  }

  btnOnline?.addEventListener("click", async () => {
    if (myCodeView) myCodeView.textContent = clientId;
    setOnlineStatus("Готовим ссылку…");
    setScreen("online");
    if (btnCopyInvite) btnCopyInvite.disabled = true;
    if (btnOpenMatch) btnOpenMatch.disabled = true;
    try {
      const code = await ensurePersonalRoom();
      const link = roomLink(code);
      if (myLinkView) myLinkView.textContent = link;
      if (btnCopyInvite) btnCopyInvite.disabled = false;
      if (btnOpenMatch) btnOpenMatch.disabled = false;
      online.invite = link;
      setOnlineStatus("Ссылка готова");
    } catch {
      setOnlineStatus("Ошибка создания ссылки");
    }
  });

  btnBackFromOnline?.addEventListener("click", () => {
    teardownOnline();
    setScreen("menu");
  });

  btnOpenMatch?.addEventListener("click", async () => {
    try {
      const code = await ensurePersonalRoom();
      setUrlToRoom(code);
      await joinByLink(code);
    } catch {
      setOnlineStatus("Ошибка открытия матча");
    }
  });

  btnCopyInvite?.addEventListener("click", async () => {
    if (!online.invite) return;
    const ok = await copyText(online.invite);
    if (ok) setOnlineStatus("Инвайт скопирован. Отправьте другу ссылку.");
  });

  btnFind.addEventListener("click", async () => {
    setScreen("search");
    searchArena.textContent = arenaFor(profile.elo);
    const lo = Math.max(0, profile.elo - 120);
    const hi = profile.elo + 120;
    searchRange.textContent = lo + "–" + hi;
    searchLog.innerHTML = "";
    searchFound.textContent = "";

    const steps = [
      ["Подключение к матчмейкингу…", 420],
      ["Поиск соперника…", 520],
      ["Проверка пинга…", 320],
    ];
    for (const [txt, ms] of steps) {
      searchStatus.textContent = txt;
      await sleep(ms);
    }

    for (let i = 0; i < 4; i++) {
      const nm = BOT_NAMES[(Math.random() * BOT_NAMES.length) | 0];
      const r = pickOpponentElo(profile.elo);
      const li = document.createElement("li");
      li.textContent = nm + " · " + r + " Elo";
      searchLog.appendChild(li);
      searchStatus.textContent = i < 2 ? "Сужаем кандидатов…" : "Подтверждаем пару…";
      await sleep(350 + Math.random() * 360);
    }

    opponentName = BOT_NAMES[(Math.random() * BOT_NAMES.length) | 0];
    opponentElo = pickOpponentElo(profile.elo);
    opponentSpeed = aiSpeedFor(opponentElo, profile.elo);
    searchStatus.textContent = "Соперник найден";
    searchFound.textContent = opponentName + " · " + opponentElo + " Elo";
    await sleep(650);

    setScreen("game");
    overlay.classList.remove("visible");
    resetMatch();
    paused = false;
    lastTs = 0;
  });

  // init
  let profile = loadProfile();
  updateMenuUi();
  const url0 = new URL(window.location.href);
  const room0 = (url0.searchParams.get("room") || "").trim().toUpperCase().slice(0, 12);
  if (room0) {
    // direct link opens waiting match automatically
    joinByLink(room0);
  } else {
    setScreen("menu");
  }
  requestAnimationFrame(step);
  } catch (e) {
    console.error("Ice Rush init failed:", e);
    try {
      const box = document.createElement("div");
      box.style.cssText =
        "position:fixed;inset:12px;max-width:720px;margin:auto;height:max-content;padding:14px 14px;border-radius:14px;background:#fff;border:1px solid rgba(61,124,186,.28);box-shadow:0 18px 44px rgba(45,90,140,.12);font:800 14px/1.35 Segoe UI,system-ui,sans-serif;color:#1a2744;z-index:99999;";
      box.innerHTML =
        "Ошибка запуска игры. Обычно это значит, что не загрузился <b>game.js</b> или упал скрипт.<br/>" +
        "Сделай <b>Ctrl+F5</b>. Если не помогло — открой DevTools → Console и пришли первую ошибку.";
      document.body.appendChild(box);
    } catch {
      /* ignore */
    }
  }
})();
