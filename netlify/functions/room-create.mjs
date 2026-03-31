import { getStore } from "@netlify/blobs";

function randCode(len = 6) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const store = getStore("rooms");
  for (let i = 0; i < 12; i++) {
    const code = randCode(6);
    const key = `room:${code}`;
    const existing = await store.get(key, { type: "json" });
    if (existing) continue;
    const now = Date.now();
    await store.setJSON(key, {
      code,
      createdAt: now,
      updatedAt: now,
      seq: 0,
      messages: [],
    });
    return new Response(JSON.stringify({ ok: true, code }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: false, error: "Failed to allocate room" }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
};

