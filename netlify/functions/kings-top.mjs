import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const store = getStore("kings");
  const data = (await store.get("top", { type: "json" })) || null;
  const out = data && typeof data === "object" ? data : { updatedAt: 0, total: 0, top: [] };

  return new Response(JSON.stringify({ ok: true, ...out }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

