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
    auth: document.getElementById("auth"),
    nickpick: document.getElementById("nickpick"),
    menu: document.getElementById("menu"),
    search: document.getElementById("search"),
    profile: document.getElementById("profile"),
    online: document.getElementById("online"),
    kings: document.getElementById("kings"),
    shop: document.getElementById("shop"),
    locker: document.getElementById("locker"),
    game: document.getElementById("game"),
  };
  const authTitle = document.getElementById("authTitle");
  const authSubtitle = document.getElementById("authSubtitle");
  const btnAuthGoogle = document.getElementById("btnAuthGoogle");
  const authStatus = document.getElementById("authStatus");
  const nickPickInput = document.getElementById("nickPickInput");
  const btnNickPickSave = document.getElementById("btnNickPickSave");
  const nickPickStatus = document.getElementById("nickPickStatus");
  const navEloChip = document.getElementById("navEloChip");
  const menuElo = document.getElementById("menuElo");
  const nickView = document.getElementById("nickView");
  const arenaView = document.getElementById("arenaView");
  const btnFind = document.getElementById("btnFind");
  const btnOnline = document.getElementById("btnOnline");
  const btnKings = document.getElementById("btnKings");
  const btnHowto = document.getElementById("btnHowto");
  const btnProfile = document.getElementById("btnProfile");
  const btnShop = document.getElementById("btnShop");
  const btnLocker = document.getElementById("btnLocker");
  const btnBackFromProfile = document.getElementById("btnBackFromProfile");
  const btnTheme = document.getElementById("btnTheme");
  const howto = document.getElementById("howto");
  const searchArena = document.getElementById("searchArena");
  const searchRange = document.getElementById("searchRange");
  const searchStatus = document.getElementById("searchStatus");
  const searchLog = document.getElementById("searchLog");
  const searchFound = document.getElementById("searchFound");
  const btnSearchPlayers = document.getElementById("btnSearchPlayers");
  const btnSearchBots = document.getElementById("btnSearchBots");
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

  // kings ui
  const kingsUpdated = document.getElementById("kingsUpdated");
  const kingsCount = document.getElementById("kingsCount");
  const kingsList = document.getElementById("kingsList");
  const btnBackFromKings = document.getElementById("btnBackFromKings");

  // shop ui
  const shopStars = document.getElementById("shopStars");
  const btnBackFromShop = document.getElementById("btnBackFromShop");
  const btnBuyGold = document.getElementById("btnBuyGold");
  const lockerEquipped = document.getElementById("lockerEquipped");
  const lockerStars = document.getElementById("lockerStars");
  const lockerList = document.getElementById("lockerList");
  const btnBackFromLocker = document.getElementById("btnBackFromLocker");

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
          stars: Math.max(0, parseInt(p.stars, 10) || 0), // "золотые шайбы"
          ownedSkins: Array.isArray(p.ownedSkins) ? p.ownedSkins.map(String) : ["default"],
          equippedSkin: typeof p.equippedSkin === "string" ? p.equippedSkin : "default",
        };
      }
    } catch (e) {
      /* ignore */
    }
    return { nickname: "Игрок", elo: 0, matches: 0, wins: 0, stars: 0, ownedSkins: ["default"], equippedSkin: "default" };
  }

  function saveProfile() {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    queueProfileSync();
  }

  // -------- Supabase (email OTP + Google) + profiles --------
  const SUPABASE_URL = (window.__ICE_RUSH_SUPABASE_URL || "").trim();
  const SUPABASE_ANON_KEY = (window.__ICE_RUSH_SUPABASE_ANON_KEY || "").trim();

  /** @type {import("@supabase/supabase-js").SupabaseClient|null} */
  let sb = null;
  /** @type {any} */
  let sbSession = null;

  function hasSupabaseConfig() {
    return !!(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase && typeof window.supabase.createClient === "function");
  }

  function setAuthStatus(txt) {
    if (authStatus) authStatus.textContent = String(txt || "");
  }
  function setNickPickStatus(txt) {
    if (nickPickStatus) nickPickStatus.textContent = String(txt || "");
  }

  function getAccessToken() {
    return (sbSession && sbSession.access_token) || "";
  }

  let _profileSyncTimer = null;
  function queueProfileSync() {
    if (!sb || !sbSession?.user?.id) return;
    try {
      clearTimeout(_profileSyncTimer);
    } catch {
      /* ignore */
    }
    _profileSyncTimer = setTimeout(() => {
      _profileSyncTimer = null;
      syncProfileToDb();
    }, 250);
  }

  async function syncProfileToDb() {
    if (!sb || !sbSession?.user?.id) return false;
    const uid = sbSession.user.id;
    const payload = {
      id: uid,
      nickname: profile.nickname,
      elo: profile.elo | 0,
      stars: profile.stars | 0,
      matches: profile.matches | 0,
      wins: profile.wins | 0,
      owned_skins: Array.isArray(profile.ownedSkins) ? profile.ownedSkins : ["default"],
      equipped_skin: String(profile.equippedSkin || "default"),
    };
    const { error } = await sb.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) return false;
    return true;
  }

  function applyDbProfile(row) {
    if (!row) return;
    profile.nickname = typeof row.nickname === "string" && row.nickname.trim() ? row.nickname.trim().slice(0, 12) : profile.nickname;
    profile.elo = Math.max(0, Math.min(4000, parseInt(row.elo, 10) || 0));
    profile.stars = Math.max(0, parseInt(row.stars, 10) || 0);
    profile.matches = parseInt(row.matches, 10) || 0;
    profile.wins = parseInt(row.wins, 10) || 0;
    profile.ownedSkins = Array.isArray(row.owned_skins) ? row.owned_skins.map(String) : profile.ownedSkins;
    profile.equippedSkin = typeof row.equipped_skin === "string" ? row.equipped_skin : profile.equippedSkin;
    ensureSkinInventory();
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  async function loadOrCreateDbProfile() {
    if (!sb || !sbSession?.user?.id) return false;
    const uid = sbSession.user.id;

    const { data: rows, error } = await sb.from("profiles").select("*").eq("id", uid).limit(1);
    if (!error && rows && rows[0]) {
      applyDbProfile(rows[0]);
      return true;
    }

    const payload = {
      id: uid,
      nickname: "Игрок",
      elo: 0,
      stars: 0,
      matches: 0,
      wins: 0,
      owned_skins: ["default"],
      equipped_skin: "default",
    };
    const { error: upErr } = await sb.from("profiles").insert(payload);
    if (upErr) {
      const { data: rows2 } = await sb.from("profiles").select("*").eq("id", uid).limit(1);
      if (rows2 && rows2[0]) applyDbProfile(rows2[0]);
      return false;
    }
    applyDbProfile(payload);
    return true;
  }

  function resetAuthScreen() {
    if (authTitle) authTitle.textContent = "Аккаунт";
    if (authSubtitle) authSubtitle.textContent = "Вход только через Google.";
  }
  resetAuthScreen();

  function needsNickname() {
    const nm = String(profile.nickname || "").trim();
    return !nm || nm.toLowerCase() === "игрок";
  }

  async function openNicknamePick() {
    setScreen("nickpick");
    if (nickPickInput) nickPickInput.value = "";
    setNickPickStatus("Придумай ник и нажми “Сохранить”.");
  }

  btnNickPickSave?.addEventListener("click", async () => {
    const nm = String(nickPickInput?.value || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 12);
    if (!nm) {
      setNickPickStatus("Ник не может быть пустым.");
      return;
    }
    profile.nickname = nm;
    saveProfile();
    // ensure DB updated immediately
    if (sb && sbSession?.user?.id) await syncProfileToDb();
    updateMenuUi();
    setScreen("menu");
  });

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

  // -------- theme toggle --------
  const THEME_KEY = "ice_rush_theme_v1"; // "light" | "dark"
  function applyTheme(mode) {
    const m = mode === "dark" ? "dark" : "light";
    document.body.classList.toggle("theme-dark", m === "dark");
    if (btnTheme) btnTheme.textContent = m === "dark" ? "Dark" : "Light";
    try {
      localStorage.setItem(THEME_KEY, m);
    } catch {
      /* ignore */
    }
  }
  function initTheme() {
    let saved = "";
    try {
      saved = (localStorage.getItem(THEME_KEY) || "").trim();
    } catch {
      saved = "";
    }
    if (!saved) {
      const preferDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      saved = preferDark ? "dark" : "light";
    }
    applyTheme(saved);
  }
  initTheme();
  btnTheme?.addEventListener("click", () => {
    const isDark = document.body.classList.contains("theme-dark");
    applyTheme(isDark ? "light" : "dark");
  });

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
    navEloChip.textContent = "⭐ " + (profile.stars || 0) + " · Elo " + profile.elo;
    menuElo.textContent = String(profile.elo);
    nickView.textContent = profile.nickname;
    arenaView.textContent = arenaFor(profile.elo);
    if (profNick) profNick.textContent = profile.nickname;
    if (profElo) profElo.textContent = String(profile.elo);
    if (profMatches) profMatches.textContent = String(profile.matches);
    if (profWins) profWins.textContent = String(profile.wins);
    if (shopStars) shopStars.textContent = String(profile.stars || 0) + " ⭐";
    if (lockerStars) lockerStars.textContent = String(profile.stars || 0) + " ⭐";
    if (achList) renderAchievements();
  }

  let authSignOutStatusOverride = null;
  let supabaseVisibilityListenerAdded = false;

  function resetProfileAfterRemoteSignOut() {
    try {
      localStorage.removeItem(PROFILE_KEY);
    } catch {
      /* ignore */
    }
    const g = loadProfile();
    profile.nickname = g.nickname;
    profile.elo = g.elo;
    profile.matches = g.matches;
    profile.wins = g.wins;
    profile.stars = g.stars;
    profile.ownedSkins = g.ownedSkins;
    profile.equippedSkin = g.equippedSkin;
  }

  function afterSignedOutUi(message) {
    resetProfileAfterRemoteSignOut();
    teardownOnline();
    setScreen("auth");
    resetAuthScreen();
    setAuthStatus(message);
    updateMenuUi();
  }

  async function initSupabaseAuth() {
    if (!hasSupabaseConfig()) {
      setAuthStatus("Supabase не настроен. Заполни window.__ICE_RUSH_SUPABASE_URL и ANON_KEY (см. supabase/README.md).");
      return false;
    }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { flowType: "pkce", detectSessionInUrl: true },
    });

    if (!supabaseVisibilityListenerAdded) {
      supabaseVisibilityListenerAdded = true;
      let visRevalidateTimer = null;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        if (!sb) return;
        if (visRevalidateTimer) clearTimeout(visRevalidateTimer);
        visRevalidateTimer = setTimeout(async () => {
          visRevalidateTimer = null;
          if (!sbSession) return;
          const { data: ud, error: ue } = await sb.auth.getUser();
          if (ue || !ud?.user) {
            authSignOutStatusOverride = "Аккаунт удалён или сессия недействительна. Войди снова.";
            await sb.auth.signOut();
          }
        }, 400);
      });
    }

    const { data } = await sb.auth.getSession();
    sbSession = data?.session || null;

    sb.auth.onAuthStateChange((event, session) => {
      sbSession = session || null;
      if (event === "SIGNED_OUT") {
        const msg = authSignOutStatusOverride || "Вы вышли из аккаунта.";
        authSignOutStatusOverride = null;
        afterSignedOutUi(msg);
      }
    });

    if (!sbSession) {
      setScreen("auth");
      resetAuthScreen();
      setAuthStatus("Нажми «Войти через Google».");
      return true;
    }

    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData?.user) {
      authSignOutStatusOverride = "Аккаунт удалён или сессия недействительна. Войди снова.";
      await sb.auth.signOut();
      return true;
    }

    await loadOrCreateDbProfile();
    updateMenuUi();
    if (needsNickname()) await openNicknamePick();
    else setScreen("menu");
    return true;
  }

  btnAuthGoogle?.addEventListener("click", async () => {
    if (!sb) {
      setAuthStatus("Сначала дождись загрузки Supabase или проверь ключи в index.html.");
      return;
    }
    const redirectTo = `${window.location.origin}${window.location.pathname}${window.location.search || ""}`;
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) setAuthStatus("Google: " + error.message);
  });

  function skinLabel(id) {
    return id === "gold" ? "ЗОЛОТОЙ" : "Обычный";
  }

  function ensureSkinInventory() {
    if (!Array.isArray(profile.ownedSkins) || !profile.ownedSkins.length) profile.ownedSkins = ["default"];
    if (!profile.ownedSkins.includes("default")) profile.ownedSkins.unshift("default");
    if (typeof profile.equippedSkin !== "string" || !profile.equippedSkin) profile.equippedSkin = "default";
    if (!profile.ownedSkins.includes(profile.equippedSkin)) profile.equippedSkin = "default";
  }

  function renderLocker() {
    if (!lockerList) return;
    ensureSkinInventory();
    lockerList.innerHTML = "";
    if (lockerEquipped) lockerEquipped.textContent = skinLabel(profile.equippedSkin);
    const skins = profile.ownedSkins.slice();
    for (const id of skins) {
      const li = document.createElement("li");
      const isEq = id === profile.equippedSkin;
      li.textContent = (isEq ? "✓ " : "") + skinLabel(id);
      li.style.cursor = "pointer";
      li.style.fontWeight = isEq ? "900" : "800";
      li.onclick = () => {
        profile.equippedSkin = id;
        saveProfile();
        updateMenuUi();
        renderLocker();
      };
      lockerList.appendChild(li);
    }
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
  let wantsPointerLock = false;

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

  function isGameActive() {
    return screens.game?.classList?.contains("active");
  }

  function canUsePointerLock() {
    // Pointer lock is mainly for desktop mouse. Avoid on touch devices.
    const isCoarse =
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
      (window.matchMedia && window.matchMedia("(hover: none)").matches);
    return !isCoarse && !!canvas?.requestPointerLock;
  }

  function requestGamePointerLock() {
    if (!canUsePointerLock()) return;
    try {
      wantsPointerLock = true;
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    } catch {
      /* ignore */
    }
  }

  canvas.addEventListener("mousemove", (e) => {
    ensureAudio();
    // If pointer is locked, use relative movement so cursor can't leave the field
    if (document.pointerLockElement === canvas) {
      const rect = canvas.getBoundingClientRect();
      const sx = W / rect.width;
      const sy = H / rect.height;
      const p = { x: mouse.x + e.movementX * sx, y: mouse.y + e.movementY * sy };
      clampMouseToPlayable(p);
      pointerInCanvas = true;
      return;
    }
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

  canvas.addEventListener("click", () => {
    // A user gesture we can use to lock cursor during play
    requestGamePointerLock();
  });

  document.addEventListener("pointerlockchange", () => {
    // If user exited pointer lock (Esc), keep gameplay paused
    if (document.pointerLockElement !== canvas) {
      wantsPointerLock = false;
    }
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

  // -------- online 1v1 (WebSocket backend, 100%) --------
  const online = {
    enabled: false,
    code: "",
    invite: "",
    sendAcc: 0,
    inputRemote: { x: inner.right - 150, y: H / 2, t: 0 },
    phase: "idle", // idle | waiting | playing
    side: "left", // left | right
    ws: null,
    connected: false,
    seq: 0,
    ack: 0,
    pending: [],
  };

  // Snapshot interpolation buffer (render slightly in the past)
  const net = {
    buf: [], // { tick:number, s:state }
    latestTick: 0,
    renderTick: 0,
    lagTicks: 6, // ~100ms at 60Hz (server sim), render uses display Hz
  };

  const netStats = {
    pingSeq: 0,
    lastSentAt: 0,
    rttMs: 0,
    jitterMs: 0,
    lastRtt: 0,
  };

  // -------- matchmaking (quick play vs real players) --------
  const mm = {
    ws: null,
    searching: false,
  };

  function teardownMatchmaking() {
    mm.searching = false;
    try {
      mm.ws?.close();
    } catch {
      /* ignore */
    }
    mm.ws = null;
  }

  function setOnlineStatus(txt) {
    if (onlineStatus) onlineStatus.textContent = txt;
    if (onlineHint) onlineHint.textContent = txt;
  }

  function localSide() {
    if (!online.enabled) return "left";
    return online.side;
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
    online.code = "";
    online.invite = "";
    online.sendAcc = 0;
    online.inputRemote = { x: inner.right - 150, y: H / 2, t: 0 };
    online.phase = "idle";
    online.side = "left";
    online.seq = 0;
    online.ack = 0;
    online.pending = [];
    try {
      clearInterval(online._pingTimer);
      online.ws?.close();
    } catch {
      /* ignore */
    }
    online._pingTimer = null;
    online.ws = null;
    online.connected = false;
    if (btnCopyInvite) btnCopyInvite.disabled = true;
    if (btnOpenMatch) btnOpenMatch.disabled = true;
  }

  // Backend WebSocket URL (pin to your Deno Deploy Production URL).
  // Example Production URL: https://icerush.ressedich.deno.net  => WS: wss://icerush.ressedich.deno.net/ws
  const WS_BACKEND_URL = "wss://icerush-ws.onrender.com/ws";

  function wsBackendBase() {
    const o = String(WS_BACKEND_URL || "").trim();
    if (o) return o;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }

  function wsBackendCandidates() {
    const base = wsBackendBase();
    const out = [];
    if (base) out.push(base);
    // same-origin fallback
    try {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      out.push(`${proto}//${window.location.host}/ws`);
    } catch {
      /* ignore */
    }
    // de-dup
    const uniq = [];
    const seen = new Set();
    for (const it of out) {
      const s = String(it || "").trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      uniq.push(s);
    }
    return uniq;
  }

  function connectWithFallback(kind, makeUrlForBase, handlers) {
    const bases = wsBackendCandidates();
    let attempt = 0;
    let opened = false;
    let ws = null;

    const tryOne = () => {
      const base = bases[Math.min(attempt, bases.length - 1)];
      const url = makeUrlForBase(base);
      try {
        ws = new WebSocket(url);
      } catch {
        ws = null;
      }
      if (!ws) {
        if (attempt + 1 < bases.length) {
          attempt++;
          tryOne();
        }
        return;
      }

      // IMPORTANT: attach message handlers immediately to avoid missing
      // early server messages (side/ready) that can arrive right after connect.
      try {
        handlers?.attach?.(ws, base, attempt, bases.length);
      } catch {
        /* ignore */
      }

      ws.onopen = () => {
        opened = true;
        try {
          handlers?.open?.(ws, base, attempt, bases.length);
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => {
        // close will usually follow
      };
      ws.onclose = (ev) => {
        if (!opened && attempt + 1 < bases.length) {
          attempt++;
          tryOne();
          return;
        }
        try {
          handlers?.close?.(ev, opened, attempt, bases.length);
        } catch {
          /* ignore */
        }
        if (!opened) {
          if (kind === "mm") searchStatus.textContent = `Ошибка соединения (матчмейкинг) · ${ev.code || 0}`;
          else setOnlineStatus(`Ошибка соединения · ${ev.code || 0}`);
        }
      };
    };

    tryOne();
    return () => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }

  function randRoom(len = 6) {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < len; i++) s += abc[(Math.random() * abc.length) | 0];
    return s;
  }

  function wsUrl(room) {
    const u = new URL(wsBackendBase());
    u.searchParams.set("room", room);
    u.searchParams.set("clientId", clientId);
    const t = getAccessToken();
    if (t) u.searchParams.set("token", t);
    return u.toString();
  }

  function wsMmUrl() {
    const u = new URL(wsBackendBase());
    // no room param => matchmaking connection
    u.searchParams.set("clientId", clientId);
    const t = getAccessToken();
    if (t) u.searchParams.set("token", t);
    return u.toString();
  }

  function wsUrlForBase(base, room) {
    const u = new URL(base);
    u.searchParams.set("room", room);
    u.searchParams.set("clientId", clientId);
    const t = getAccessToken();
    if (t) u.searchParams.set("token", t);
    return u.toString();
  }

  function wsMmUrlForBase(base) {
    const u = new URL(base);
    u.searchParams.set("clientId", clientId);
    const t = getAccessToken();
    if (t) u.searchParams.set("token", t);
    return u.toString();
  }

  function wsSend(obj) {
    try {
      if (online.ws && online.ws.readyState === 1) online.ws.send(JSON.stringify(obj));
    } catch {
      /* ignore */
    }
  }

  function wsPing() {
    if (!online.ws || online.ws.readyState !== 1) return;
    netStats.pingSeq = (netStats.pingSeq + 1) | 0;
    // Use epoch time to match server Date.now()
    netStats.lastSentAt = Date.now();
    wsSend({ t: "ping", n: netStats.pingSeq, c: netStats.lastSentAt });
  }

  function connectWs(room) {
    teardownOnline();
    online.enabled = true;
    online.code = room;
    online.invite = roomLink(room);
    online.phase = "waiting";
    online.connected = false;
    if (btnCopyInvite) btnCopyInvite.disabled = false;

    connectWithFallback(
      "room",
      (base) => wsUrlForBase(base, room),
      {
        attach: (ws) => {
          ws.onmessage = (ev) => {
        let msg = null;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          msg = null;
        }
        if (!msg || typeof msg.t !== "string") return;
        if (msg.t === "side") {
          online.side = msg.side === "right" ? "right" : "left";
        } else if (msg.t === "ready") {
          setOnlineStatus("Игрок найден · старт!");
          online.phase = "playing";
          paused = false;
          lastTs = 0;
          overlay.classList.remove("visible");
        } else if (msg.t === "wait") {
          online.phase = "waiting";
        } else if (msg.t === "pong") {
          const now = Date.now();
          const sent = +msg.c;
          if (Number.isFinite(sent)) {
            const rtt = Math.max(0, now - sent);
            netStats.rttMs += (rtt - netStats.rttMs) * 0.15;
            const j = Math.abs(rtt - (netStats.lastRtt || rtt));
            netStats.jitterMs += (j - netStats.jitterMs) * 0.12;
            netStats.lastRtt = rtt;
          }
        } else if (msg.t === "state" && msg.s) {
          applyNetState(msg.s, msg.tick);
        } else if (msg.t === "end") {
          paused = true;
          const localWin = online.side === "left" ? !!msg.leftWon : !msg.leftWon;
          showOnlineEnd(localWin);
        } else if (msg.t === "peer_left") {
          online.phase = "waiting";
          paused = true;
          setOnlineStatus("Соперник вышел · ожидание…");
        }
          };
        },
        open: (ws, _base, attempt, total) => {
          online.ws = ws;
          setOnlineStatus(total > 1 ? `Подключено (${attempt + 1}/${total}) · ожидание игрока…` : "Подключено · ожидание игрока…");
          online.connected = true;
          wsPing();
          online._pingTimer = setInterval(wsPing, 500);
        },
        close: (_ev, wasOpened) => {
          online.connected = false;
          try {
            clearInterval(online._pingTimer);
          } catch {
            /* ignore */
          }
          if (online.enabled && wasOpened) setOnlineStatus("Соединение закрыто");
        },
      }
    );
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

  function applyNetState(s, tick) {
    if (!s) return;
    // smooth network state to avoid jitter on high ping
    if (!online.enabled) return;
    const local = getLocalStriker();
    const remote = getRemoteStriker();

    // If we are receiving authoritative running state, start locally even if
    // the earlier "ready" message was missed.
    if (s.running && online.phase !== "playing") {
      online.phase = "playing";
      paused = false;
      lastTs = 0;
      overlay.classList.remove("visible");
      setOnlineStatus("Матч идёт");
      // The browser requires a user gesture to lock; we prime the flag here so
      // the next click inside the field locks immediately.
      wantsPointerLock = true;
    }

    if (s.puck) {
      netTarget.puck.x = +s.puck.x;
      netTarget.puck.y = +s.puck.y;
      netTarget.puck.vx = +s.puck.vx;
      netTarget.puck.vy = +s.puck.vy;
    }

    // map server left/right to our local/remote
    const sLocal = online.side === "left" ? s.left : s.right;
    const sRemote = online.side === "left" ? s.right : s.left;

    if (sRemote && typeof sRemote.nick === "string" && sRemote.nick.trim()) {
      opponentName = sRemote.nick.trim().slice(0, 12);
    }
    if (sRemote && Number.isFinite(+sRemote.elo)) opponentElo = +sRemote.elo;

    if (sRemote) {
      netTarget.remote.x = +sRemote.x;
      netTarget.remote.y = +sRemote.y;
    }
    if (sLocal) {
      netTarget.local.x = +sLocal.x;
      netTarget.local.y = +sLocal.y;
    }

    if (Number.isFinite(+s.scoreL) && Number.isFinite(+s.scoreR)) {
      // server uses scoreL/scoreR in ws backend
      scorePlayer = online.side === "left" ? +s.scoreL : +s.scoreR;
      scoreAi = online.side === "left" ? +s.scoreR : +s.scoreL;
    } else {
      if (Number.isFinite(+s.sp)) scorePlayer = +s.sp;
      if (Number.isFinite(+s.sa)) scoreAi = +s.sa;
    }

    // ack for local prediction (server reports lastSeq it applied for each side)
    const ack = online.side === "left" ? +s.ackL : +s.ackR;
    if (Number.isFinite(ack) && ack > online.ack) {
      online.ack = ack;
      // drop acked inputs
      online.pending = online.pending.filter((it) => (it.seq | 0) > online.ack);
    }

    // Reconcile local striker if we drift too far from server.
    if (sLocal) {
      const me = getLocalStriker();
      const dx = (+sLocal.x - me.x);
      const dy = (+sLocal.y - me.y);
      const d = Math.hypot(dx, dy);
      if (d > 38) {
        me.x = +sLocal.x;
        me.y = +sLocal.y;
      } else {
        me.x += dx * 0.10;
        me.y += dy * 0.10;
      }
    }

    netTarget.has = true;
    netTarget.t = performance.now();
    netTarget.recvAt = netTarget.t;

    // snapshot buffer for tick-based interpolation (no clock sync needed)
    const tk = Number.isFinite(+tick) ? (+tick | 0) : (net.latestTick | 0);
    if (tk > net.latestTick) net.latestTick = tk;
    net.buf.push({ tick: tk, s });
    if (net.buf.length > 120) net.buf.splice(0, net.buf.length - 120);

    // gentle correction for local (to reduce drift without snapping)
    local.x += (netTarget.local.x - local.x) * 0.08;
    local.y += (netTarget.local.y - local.y) * 0.08;

    // remote and puck are smoothed continuously in the main loop
  }

  const netTarget = {
    has: false,
    t: 0,
    recvAt: 0,
    puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    remote: { x: inner.right - 150, y: H / 2 },
    local: { x: inner.left + 150, y: H / 2 },
  };

  function showOnlineEnd(localWin) {
    const starsEarned = localWin ? (scoreAi === 0 ? 2 : 1) : 1;
    profile.stars = (profile.stars || 0) + starsEarned;
    saveProfile();
    updateMenuUi();
    overlay.innerHTML =
      (localWin ? "Победа!" : "Поражение") +
      `<div class="anim-in" style="font-size:1rem;font-weight:800;color:#2d7cc9">Онлайн матч</div>` +
      `<div class="anim-pop" style="font-size:1rem;font-weight:900;color:var(--accent)">+${starsEarned} ⭐</div>` +
      `<button class="btn btn-accent" id="btnBack" style="max-width:240px">В меню</button>`;
    overlay.classList.add("visible");
    document.getElementById("btnBack").onclick = () => {
      overlay.classList.remove("visible");
      teardownOnline();
      setScreen("menu");
    };
  }

  // (startOnlineMatch removed - server controls start)

  function goalY0() {
    return H / 2 - GOAL_HALF_H;
  }
  function goalY1() {
    return H / 2 + GOAL_HALF_H;
  }

  function clampStrikerLeft(x, y) {
    let nx = Math.max(inner.left + STRIKER_R, Math.min(W / 2 - STRIKER_R - 4, x));
    let ny = Math.max(inner.top + STRIKER_R, Math.min(inner.bottom - STRIKER_R, y));
    return { x: nx, y: ny };
  }

  function clampStrikerRight(x, y) {
    let nx = Math.max(W / 2 + STRIKER_R + 4, Math.min(inner.right - STRIKER_R, x));
    let ny = Math.max(inner.top + STRIKER_R, Math.min(inner.bottom - STRIKER_R, y));
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
      // Online matches are authoritative on backend; end is received via WS.
      return;
    }
    paused = true;
    const delta = Math.round(eloDelta(profile.elo, opponentElo, playerWon));
    profile.elo = Math.max(0, profile.elo + delta);
    profile.matches = (profile.matches || 0) + 1;
    if (playerWon) profile.wins = (profile.wins || 0) + 1;
    // Currency: "gold pucks" (stars)
    // Win with opponent scoring 0 -> 2 stars, win otherwise -> 1, loss -> 1
    const starsEarned = playerWon ? (scoreAi === 0 ? 2 : 1) : 1;
    profile.stars = (profile.stars || 0) + starsEarned;
    saveProfile();
    updateMenuUi();
    overlay.innerHTML =
      (playerWon ? "Победа!" : "Поражение") +
      `<div style=\"font-size:1rem;font-weight:800;color:#2d7cc9\">Elo: ${delta > 0 ? "+" : ""}${delta} → ${profile.elo}</div>` +
      `<div style=\"font-size:1rem;font-weight:900;color:var(--accent)\">+${starsEarned} ⭐</div>` +
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
    // Online: move with the same speed model as server to reduce mismatch
    // between what you see locally and what the server simulates.
    if (online.enabled && online.phase === "playing") {
      const dx = target.x - me.x;
      const dy = target.y - me.y;
      const d = Math.hypot(dx, dy);
      // move at server-like speed, but scaled by real frame dt (works fine at 144Hz+)
      const maxMove = 1900 * (1 / 60) * clamp(dt * 60, 0.25, 3.0);
      if (d <= maxMove || d < 1e-6) {
        me.x = target.x;
        me.y = target.y;
      } else {
        const k = maxMove / d;
        me.x += dx * k;
        me.y += dy * k;
      }
    } else {
      me.x += (target.x - me.x) * MAGNET;
      me.y += (target.y - me.y) * MAGNET;
    }
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
    // Apply equipped skin (local striker only)
    const isLocal = s === getLocalStriker();
    const skin = isLocal ? String(profile.equippedSkin || "default") : "default";
    const base = skin === "gold" ? "#d7a11b" : color;
    const hi = skin === "gold" ? "#ffe08a" : color === "#d42c3a" ? "#ff8b8b" : "#7cc3ff";

    const g = ctx.createRadialGradient(s.x - 10, s.y - 10, 2, s.x, s.y, STRIKER_R);
    g.addColorStop(0, hi);
    g.addColorStop(1, base);
    ctx.beginPath();
    ctx.arc(s.x, s.y, STRIKER_R, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = skin === "gold" ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0.18)";
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
    if (online.enabled) {
      ctx.font = "800 11px Segoe UI, system-ui, sans-serif";
      ctx.fillStyle = "rgba(26,39,68,0.55)";
      ctx.textAlign = "center";
      const rtt = Math.round(netStats.rttMs || 0);
      const jit = Math.round(netStats.jitterMs || 0);
      ctx.fillText(`Ping ${rtt}ms · Jit ${jit}ms`, W / 2, 42);
    }
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

  function openPauseOverlay() {
    paused = true;
    try {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    } catch {
      /* ignore */
    }
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
      // lock again on resume (user gesture)
      requestGamePointerLock();
    };
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!isGameActive()) return;
    // Esc should always open pause and release cursor
    e.preventDefault();
    openPauseOverlay();
  });

  canvas.addEventListener("click", (e) => {
    const p = canvasToGame(e.clientX, e.clientY);
    if (p.x >= 16 && p.x <= 46 && p.y >= 10 && p.y <= 40) {
      openPauseOverlay();
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
      } else {
        // tick-based interpolation (no clock sync, stable under jitter)
        if (net.buf.length >= 2 && net.latestTick > 0) {
          const desired = Math.max(0, net.latestTick - net.lagTicks);
          if (!net.renderTick) net.renderTick = desired;
          net.renderTick = Math.min(desired, net.renderTick + dt * 60);

          // find snapshots around renderTick
          let a = null;
          let b = null;
          for (let i = net.buf.length - 1; i >= 0; i--) {
            const cur = net.buf[i];
            if (cur.tick <= net.renderTick) {
              a = cur;
              b = net.buf[Math.min(net.buf.length - 1, i + 1)];
              break;
            }
          }
          if (!a) {
            a = net.buf[0];
            b = net.buf[1];
          }
          if (!b) b = a;

          const dtT = Math.max(1, (b.tick - a.tick));
          const t = clamp((net.renderTick - a.tick) / dtT, 0, 1);

          const sA = a.s;
          const sB = b.s;

          const aLocal = online.side === "left" ? sA.left : sA.right;
          const aRemote = online.side === "left" ? sA.right : sA.left;
          const bLocal = online.side === "left" ? sB.left : sB.right;
          const bRemote = online.side === "left" ? sB.right : sB.left;

          if (aRemote && bRemote) {
            const r = getRemoteStriker();
            r.x = aRemote.x + (bRemote.x - aRemote.x) * t;
            r.y = aRemote.y + (bRemote.y - aRemote.y) * t;
            if (typeof bRemote.nick === "string" && bRemote.nick.trim()) opponentName = bRemote.nick.trim().slice(0, 12);
            if (Number.isFinite(+bRemote.elo)) opponentElo = +bRemote.elo;
          }

          if (aLocal && bLocal) {
            const me = getLocalStriker();
            me.x += ((aLocal.x + (bLocal.x - aLocal.x) * t) - me.x) * 0.08;
            me.y += ((aLocal.y + (bLocal.y - aLocal.y) * t) - me.y) * 0.08;
          }

          if (sA.puck && sB.puck) {
            puck.x = sA.puck.x + (sB.puck.x - sA.puck.x) * t;
            puck.y = sA.puck.y + (sB.puck.y - sA.puck.y) * t;
            puck.vx = sB.puck.vx;
            puck.vy = sB.puck.vy;
          }

          if (Number.isFinite(+sB.scoreL) && Number.isFinite(+sB.scoreR)) {
            scorePlayer = online.side === "left" ? +sB.scoreL : +sB.scoreR;
            scoreAi = online.side === "left" ? +sB.scoreR : +sB.scoreL;
          }
        }

        // server-authoritative: send input when playing
        online.sendAcc += dt;
        // Higher input rate reduces perceived "lag" on hits.
        if (online.phase === "playing" && online.sendAcc > 0.016) {
          online.sendAcc = 0;
          const me = getLocalStriker();
          online.seq = (online.seq + 1) | 0;
          online.pending.push({ seq: online.seq, x: me.x, y: me.y, t: performance.now() });
          wsSend({ t: "input", seq: online.seq, x: me.x, y: me.y });
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

  async function loadKings() {
    if (!kingsList) return;
    kingsList.innerHTML = "";
    try {
      const r = await fetch("/.netlify/functions/kings-top", { cache: "no-store" });
      const j = await r.json();
      const top = Array.isArray(j?.top) ? j.top : [];
      if (kingsUpdated) {
        kingsUpdated.textContent = j?.updatedAt ? new Date(j.updatedAt).toLocaleString() : "—";
      }
      if (kingsCount) kingsCount.textContent = j?.total != null ? String(j.total) : "—";
      if (!top.length) {
        const li = document.createElement("li");
        li.textContent = "Пока пусто — сыграйте онлайн матч.";
        kingsList.appendChild(li);
        return;
      }
      for (let i = 0; i < top.length; i++) {
        const it = top[i];
        const li = document.createElement("li");
        li.textContent = `${i + 1}. ${it.nick} · ${it.elo} Elo`;
        kingsList.appendChild(li);
      }
    } catch {
      const li = document.createElement("li");
      li.textContent = "Не удалось загрузить список.";
      kingsList.appendChild(li);
    }
  }

  btnKings?.addEventListener("click", async () => {
    setScreen("kings");
    await loadKings();
  });
  btnBackFromKings?.addEventListener("click", () => setScreen("menu"));

  btnShop?.addEventListener("click", () => {
    updateMenuUi();
    setScreen("shop");
  });
  btnBackFromShop?.addEventListener("click", () => setScreen("menu"));

  btnBuyGold?.addEventListener("click", () => {
    ensureSkinInventory();
    if (profile.ownedSkins.includes("gold")) return;
    if ((profile.stars || 0) < 20) return;
    profile.stars -= 20;
    profile.ownedSkins.push("gold");
    saveProfile();
    updateMenuUi();
  });

  btnLocker?.addEventListener("click", () => {
    updateMenuUi();
    renderLocker();
    setScreen("locker");
  });
  btnBackFromLocker?.addEventListener("click", () => setScreen("menu"));

  function roomLink(code) {
    return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(code)}`;
  }

  // each online session gets a fresh room code
  let preparedRoomCode = "";

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

  // joinByLink replaced by connectWs()

  btnOnline?.addEventListener("click", async () => {
    if (myCodeView) myCodeView.textContent = clientId;
    setOnlineStatus("Готовим ссылку…");
    setScreen("online");
    if (btnCopyInvite) btnCopyInvite.disabled = true;
    if (btnOpenMatch) btnOpenMatch.disabled = true;
    try {
      const code = randRoom(6);
      preparedRoomCode = code;
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
      // Lock cursor immediately on match start click (browser requires gesture)
      requestGamePointerLock();
      const code = preparedRoomCode || randRoom(6);
      preparedRoomCode = code;
      setUrlToRoom(code);
      // show waiting match + connect to backend WS
      puck.x = W / 2;
      puck.y = H / 2;
      puck.vx = 0;
      puck.vy = 0;
      paused = true;
      overlay.innerHTML = `<div>Ожидание игрока…</div><div style="font-size:0.95rem;font-weight:800;color:var(--accent2)">Ссылка: ${code}</div><button class="btn btn-ghost" id="btnCancelWait" style="max-width:240px">В меню</button>`;
      overlay.classList.add("visible");
      document.getElementById("btnCancelWait").onclick = () => {
        overlay.classList.remove("visible");
        teardownOnline();
        clearRoomFromUrl();
        setScreen("menu");
      };
      setScreen("game");
      connectWs(code);
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
    searchStatus.textContent = "Выберите режим: игроки или бот";
    teardownMatchmaking();
    btnSearchPlayers && (btnSearchPlayers.disabled = false);
    btnSearchBots && (btnSearchBots.disabled = false);
  });

  async function startBotSearch() {
    teardownMatchmaking();
    btnSearchPlayers && (btnSearchPlayers.disabled = true);
    btnSearchBots && (btnSearchBots.disabled = true);
    searchLog.innerHTML = "";
    searchFound.textContent = "";

    const steps = [
      ["Подключение…", 180],
      ["Поиск соперника…", 220],
    ];
    for (const [txt, ms] of steps) {
      searchStatus.textContent = txt;
      await sleep(ms);
    }

    for (let i = 0; i < 2; i++) {
      const nm = BOT_NAMES[(Math.random() * BOT_NAMES.length) | 0];
      const r = pickOpponentElo(profile.elo);
      const li = document.createElement("li");
      li.textContent = nm + " · " + r + " Elo";
      searchLog.appendChild(li);
      searchStatus.textContent = i < 1 ? "Сужаем кандидатов…" : "Подтверждаем пару…";
      await sleep(160 + Math.random() * 200);
    }

    opponentName = BOT_NAMES[(Math.random() * BOT_NAMES.length) | 0];
    opponentElo = pickOpponentElo(profile.elo);
    opponentSpeed = aiSpeedFor(opponentElo, profile.elo);
    searchStatus.textContent = "Соперник найден";
    searchFound.textContent = opponentName + " · " + opponentElo + " Elo";
    await sleep(320);

    setScreen("game");
    overlay.classList.remove("visible");
    resetMatch();
    // Short match intro animation
    overlay.innerHTML = `<div class="anim-in">Вбрасывание…</div><div class="anim-pop" style="font-size:1rem;font-weight:900;color:var(--accent2)">Удачи!</div>`;
    overlay.classList.add("visible");
    paused = false;
    lastTs = 0;
    setTimeout(() => overlay.classList.remove("visible"), 820);
  }

  function startPlayerSearch() {
    if (!getAccessToken()) {
      setAuthStatus("Войди по email, чтобы играть онлайн.");
      setScreen("auth");
      return;
    }
    teardownMatchmaking();
    btnSearchPlayers && (btnSearchPlayers.disabled = true);
    btnSearchBots && (btnSearchBots.disabled = true);
    searchLog.innerHTML = "";
    searchFound.textContent = "";
    searchStatus.textContent = "Ищем реального игрока…";

    mm.searching = true;

    connectWithFallback(
      "mm",
      (base) => wsMmUrlForBase(base),
      {
        attach: (ws) => {
          ws.onmessage = (ev) => {
            let msg = null;
            try {
              msg = JSON.parse(ev.data);
            } catch {
              msg = null;
            }
            if (!msg || typeof msg.t !== "string") return;
            if (msg.t === "mm_wait") {
              searchStatus.textContent = "Ожидание соперника…";
            } else if (msg.t === "mm_match" && msg.room) {
              mm.searching = false;
              teardownMatchmaking();
              opponentName = String(msg?.opp?.nick || "Игрок").slice(0, 12);
              opponentElo = Number.isFinite(+msg?.opp?.elo) ? +msg.opp.elo : 0;
              const room = String(msg.room).trim().toUpperCase().slice(0, 12);
              setUrlToRoom(room);
              setScreen("game");
              overlay.innerHTML = `<div>Подключение к матчу…</div>`;
              overlay.classList.add("visible");
              connectWs(room);
            }
          };
        },
        open: (ws, _base, attempt, total) => {
          mm.ws = ws;
          searchStatus.textContent = total > 1 ? `Ищем реального игрока… (${attempt + 1}/${total})` : "Ищем реального игрока…";
          try {
            ws.send(JSON.stringify({ t: "mm_find", elo: profile.elo, nick: profile.nickname }));
          } catch {
            /* ignore */
          }
        },
        close: (ev) => {
          if (!mm.searching) return;
          searchStatus.textContent = `Соединение закрыто (матчмейкинг) · ${ev.code || 0}`;
          teardownMatchmaking();
          btnSearchPlayers && (btnSearchPlayers.disabled = false);
          btnSearchBots && (btnSearchBots.disabled = false);
        },
      }
    );
  }

  btnSearchBots?.addEventListener("click", () => {
    // Lock cursor immediately on "start match" click
    requestGamePointerLock();
    startBotSearch();
  });
  btnSearchPlayers?.addEventListener("click", () => {
    // Lock cursor immediately on "start match" click
    requestGamePointerLock();
    startPlayerSearch();
  });

  // init
  let profile = loadProfile();
  updateMenuUi();
  initSupabaseAuth().then(() => {
    const url0 = new URL(window.location.href);
    const room0 = (url0.searchParams.get("room") || "").trim().toUpperCase().slice(0, 12);
    if (room0) {
      if (!getAccessToken()) {
        setAuthStatus("Войди по email, чтобы открыть матч по ссылке.");
        setScreen("auth");
        return;
      }
      // direct link opens waiting match automatically
      setScreen("game");
      overlay.innerHTML = `<div>Ожидание игрока…</div><div style="font-size:0.95rem;font-weight:800;color:var(--accent2)">Ссылка: ${room0}</div>`;
      overlay.classList.add("visible");
      connectWs(room0);
    } else {
      // initSupabaseAuth() sets auth/menu; this is a safe fallback
      if (!screens.auth?.classList.contains("active")) setScreen("menu");
    }
  });
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
