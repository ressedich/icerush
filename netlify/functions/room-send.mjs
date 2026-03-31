import { getStore } from "@netlify/blobs";

function safeStr(x, max = 64) {
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

  const code = safeStr(body?.code, 12).toUpperCase();
  const clientId = safeStr(body?.clientId, 64);
  const type = safeStr(body?.type, 24);
  const payload = body?.payload ?? null;

  if (!code || !clientId || !type) {
    return new Response(JSON.stringify({ ok: false, error: "Missing code/clientId/type" }), {
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

  const now = Date.now();
  const seq = (room.seq || 0) + 1;
  const msg = { seq, t: now, from: clientId, type, payload };

  const msgs = Array.isArray(room.messages) ? room.messages : [];
  msgs.push(msg);
  const trimmed = msgs.length > 220 ? msgs.slice(msgs.length - 220) : msgs;

  await store.setJSON(key, {
    ...room,
    updatedAt: now,
    seq,
    messages: trimmed,
  });

  return new Response(JSON.stringify({ ok: true, seq }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

