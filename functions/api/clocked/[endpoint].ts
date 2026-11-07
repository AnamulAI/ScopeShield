// Thin proxy to the Clocked API. Adds the secret key server-side; never logs bodies or the key.
interface Env {
  CLOCKED_API_KEY?: string;
  RATE_LIMIT?: KVNamespace; // required outside localhost: per-IP and global daily caps
}

const ALLOWED = new Set(["decide", "extract", "fill"]);
const MAX_BODY_BYTES = 200 * 1024;
export const IP_DAILY_CAP = 80; // Clocked calls per IP per UTC day
export const GLOBAL_DAILY_CAP = 2000; // Clocked calls for the whole site per UTC day
export const LIMIT_MESSAGE = "Live mode limit reached today, please use Demo mode.";
const UPSTREAM = "https://clocked.rezolve.ai/clocked";
const PASS_HEADERS = ["content-type", "x-clocked-credits", "x-clocked-cost-usd", "x-clocked-model-ms", "retry-after"];

const json = (status: number, error: string, code?: string, extra: HeadersInit = {}) =>
  new Response(JSON.stringify({ error, ...(code ? { code } : {}) }), { status, headers: { "content-type": "application/json", ...extra } });

/** Browsers always send Origin on cross-origin POSTs. No Origin = non-browser client (e.g. smoke script). */
export function originAllowed(origin: string | null, requestUrl: string): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(requestUrl).host;
  } catch {
    return false;
  }
}

const day = (now: Date) => now.toISOString().slice(0, 10); // UTC day
const secondsToUtcMidnight = (now: Date) => Math.max(60, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000));

export type LimitResult = { ok: true } | { ok: false; reason: "ip" | "global" | "kv_write" };

/** Sampled counting: write with probability 1/SAMPLE_EVERY and add SAMPLE_EVERY, so the expected count is right with ~1/5 of the KV writes. */
export const SAMPLE_EVERY = 5;

/**
 * Daily caps via KV. Counting is approximate by design: counters are sampled (above) and KV is not atomic.
 * - KV READ error: fail open (the request is allowed).
 * - KV WRITE error (only attempted on sampled calls): fail closed, so we never allow unbounded use; this also covers an exhausted write quota.
 * `random` is injectable for tests.
 */
export async function checkLimits(kv: KVNamespace, ip: string, now = new Date(), random: () => number = Math.random): Promise<LimitResult> {
  const d = day(now);
  const ipKey = `rl:ip:${d}:${ip}`;
  const globalKey = `rl:global:${d}`;
  let ipCount = 0, globalCount = 0;
  try {
    [ipCount, globalCount] = (await Promise.all([kv.get(ipKey), kv.get(globalKey)])).map((v) => Number(v ?? 0) || 0);
  } catch {
    return { ok: true };
  }
  if (ipCount >= IP_DAILY_CAP) return { ok: false, reason: "ip" };
  if (globalCount >= GLOBAL_DAILY_CAP) return { ok: false, reason: "global" };
  if (random() < 1 / SAMPLE_EVERY) {
    try {
      const opts = { expirationTtl: 60 * 60 * 30 };
      await Promise.all([kv.put(ipKey, String(ipCount + SAMPLE_EVERY), opts), kv.put(globalKey, String(globalCount + SAMPLE_EVERY), opts)]);
    } catch {
      return { ok: false, reason: "kv_write" };
    }
  }
  return { ok: true };
}

const isLocalHost = (url: string) => {
  const h = new URL(url).hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
};
let warnedMissingBinding = false;

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const endpoint = String(params.endpoint ?? "");
  if (!ALLOWED.has(endpoint)) return json(404, "Unknown endpoint");
  if (!originAllowed(request.headers.get("Origin"), request.url)) return json(403, "Cross-origin request rejected");
  if (!env.CLOCKED_API_KEY) return json(500, "Live mode is not configured on this server.");

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) return json(400, "Idempotency-Key header required");

  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json(413, "Body too large");
  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return json(413, "Body too large");

  if (env.RATE_LIMIT) {
    const res = await checkLimits(env.RATE_LIMIT, request.headers.get("CF-Connecting-IP") ?? "unknown");
    if (!res.ok) return json(429, LIMIT_MESSAGE, "limit_reached", { "retry-after": String(secondsToUtcMidnight(new Date())) });
  } else if (!isLocalHost(request.url)) {
    // Never fail open on a missing binding outside local development.
    if (!warnedMissingBinding) {
      warnedMissingBinding = true;
      console.error("RATE_LIMIT KV binding is missing; refusing live requests.");
    }
    return json(503, "Live mode is temporarily unavailable. Please use Demo mode.", "limit_unavailable");
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
