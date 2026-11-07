// Thin proxy to the Clocked API. Adds the secret key server-side; never logs bodies or the key.
interface Env {
  CLOCKED_API_KEY?: string;
  RATE_LIMIT?: KVNamespace; // optional: per-IP daily cap
}

const ALLOWED = new Set(["decide", "extract", "fill"]);
const MAX_BODY_BYTES = 200 * 1024;
const DAILY_CAP = 300;
const UPSTREAM = "https://clocked.rezolve.ai/clocked";
const PASS_HEADERS = ["content-type", "x-clocked-credits", "x-clocked-cost-usd", "x-clocked-model-ms", "retry-after"];

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } });

/** Browsers always send Origin on cross-origin POSTs. No Origin = non-browser client (e.g. smoke script). */
export function originAllowed(origin: string | null, requestUrl: string): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(requestUrl).host;
  } catch {
    return false;
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const endpoint = String(params.endpoint ?? "");
  if (!ALLOWED.has(endpoint)) return json(404, "Unknown endpoint");
  if (!originAllowed(request.headers.get("Origin"), request.url)) return json(403, "Cross-origin request rejected");
  if (!env.CLOCKED_API_KEY) return json(500, "Server is missing CLOCKED_API_KEY");

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) return json(400, "Idempotency-Key header required");

  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json(413, "Body too large");
  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return json(413, "Body too large");

  if (env.RATE_LIMIT) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const key = `rl:${new Date().toISOString().slice(0, 10)}:${ip}`;
    const used = Number((await env.RATE_LIMIT.get(key)) ?? 0);
    if (used >= DAILY_CAP) return json(429, "Daily request cap reached");
    await env.RATE_LIMIT.put(key, String(used + 1), { expirationTtl: 60 * 60 * 26 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM}/${endpoint}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.CLOCKED_API_KEY}`,
        "idempotency-key": idempotencyKey,
      },
      body,
    });
  } catch {
    return json(502, "Upstream unreachable");
  }

  const headers = new Headers();
  for (const h of PASS_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
};

export const onRequest: PagesFunction<Env> = async () => json(405, "POST only");
