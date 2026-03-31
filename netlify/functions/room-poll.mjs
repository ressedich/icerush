import { getStore } from "@netlify/blobs";

function safeStr(x, max = 64) {
  return (typeof x === "string" ? x : "").trim().slice(0, max);
}

export default async (req) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const code = safeStr(url.searchParams.get("code"), 12).toUpperCase();
  const clientId = safeStr(url.searchParams.get("clientId"), 64);
  const after = parseInt(url.searchParams.get("after") || "0", 10) || 0;

  if (!code || !clientId) {
    return new Response(JSON.stringify({ ok: false, error: "Missing code/clientId" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const store = getStore("rooms");
  const key = `room:${code}`;
  const room = await store.get(key, { type: "json" });
  if (!room) {
    return new Response(JSON.stringify({ ok: false, error: "Room not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const msgs = Array.isArray(room.messages) ? room.messages : [];
  const out = msgs.filter((m) => (m?.seq || 0) > after && m.from !== clientId);

  return new Response(JSON.stringify({ ok: true, seq: room.seq || 0, messages: out }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
};

