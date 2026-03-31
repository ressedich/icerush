import { getStore } from "@netlify/blobs";

function safeStr(x, max = 32) {
  return (typeof x === "string" ? x : "").trim().slice(0, max);
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let body = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const id = safeStr(body?.id, 64).toUpperCase();
  const nick = safeStr(body?.nick, 12);
  const elo = Math.max(0, Math.min(5000, parseInt(body?.elo, 10) || 0));

  if (!id || !nick) {
    return new Response(JSON.stringify({ ok: false, error: "Missing id/nick" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const store = getStore("kings");
  const map = (await store.get("map", { type: "json" })) || {};
  const prev = map[id];
  const prevElo = prev && typeof prev === "object" ? parseInt(prev.elo, 10) || 0 : 0;

  // keep best elo ever seen for that id
  if (elo >= prevElo) {
    map[id] = { id, nick, elo, updatedAt: Date.now() };
    await store.setJSON("map", map);
  }

  // recompute top
  const arr = Object.values(map)
    .filter((x) => x && typeof x === "object" && typeof x.id === "string")
    .map((x) => ({ id: x.id, nick: String(x.nick || "").slice(0, 12), elo: parseInt(x.elo, 10) || 0 }))
    .sort((a, b) => b.elo - a.elo)
    .slice(0, 10);

  const updatedAt = Date.now();
  await store.setJSON("top", { updatedAt, total: Object.keys(map).length, top: arr });

  return new Response(JSON.stringify({ ok: true, updatedAt, total: Object.keys(map).length, top: arr }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

