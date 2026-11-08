import { afterEach, describe, expect, it, vi } from "vitest";
import { capsFrom, checkLimits, GLOBAL_DAILY_CAP, IP_DAILY_CAP, limitMessage, onRequestPost, originAllowed, SAMPLE_EVERY } from "./[endpoint]";

class FakeKV {
  store = new Map<string, string>();
  failGet = false;
  failPut = false;
  puts = 0;
  async get(k: string) { if (this.failGet) throw new Error("kv read"); return this.store.get(k) ?? null; }
  async put(k: string, v: string) { if (this.failPut) throw new Error("kv write"); this.puts++; this.store.set(k, v); }
}
const kv = () => new FakeKV() as unknown as KVNamespace & FakeKV;
const T = new Date("2026-11-08T10:00:00Z");

describe("originAllowed", () => {
  const URL_ = "https://scopeshield.pages.dev/api/clocked/decide";
  it("allows the request's own host: pages.dev, preview and custom domains, with no list to maintain", () => {
    expect(originAllowed("https://scopeshield.pages.dev", URL_)).toBe(true);
    expect(originAllowed("https://abc123.scopeshield.pages.dev", "https://abc123.scopeshield.pages.dev/api/clocked/fill")).toBe(true);
    expect(originAllowed("https://scope.example.com", "https://scope.example.com/api/clocked/decide")).toBe(true);
  });
  it("handles a missing Origin as before (non-browser clients are allowed)", () => {
    expect(originAllowed(null, URL_)).toBe(true);
    expect(originAllowed(null, URL_, "https://a.example")).toBe(true);
  });
  it("blocks foreign and malformed origins", () => {
    expect(originAllowed("https://evil.example", URL_)).toBe(false);
    expect(originAllowed("https://scopeshield.pages.dev.evil.example", URL_)).toBe(false);
    expect(originAllowed("not a url", URL_)).toBe(false);
  });
  it("ALLOWED_ORIGINS adds exact origins only (scheme, host and port must match)", () => {
    const env = "https://app.example.com, https://other.example:8443 ,   ,not-a-url";
    expect(originAllowed("https://app.example.com", URL_, env)).toBe(true);
    expect(originAllowed("https://other.example:8443", URL_, env)).toBe(true);
    expect(originAllowed("http://app.example.com", URL_, env)).toBe(false);
    expect(originAllowed("https://other.example", URL_, env)).toBe(false);
    expect(originAllowed("https://evil.example", URL_, env)).toBe(false);
    expect(originAllowed("https://evil.example", URL_, "")).toBe(false);
    expect(originAllowed("https://evil.example", URL_, undefined)).toBe(false);
  });
});

describe("daily cap numbers", () => {
  it("default to 100 per IP and 800 per site", () => {
    expect([IP_DAILY_CAP, GLOBAL_DAILY_CAP]).toEqual([100, 800]);
    expect(capsFrom({})).toEqual({ ip: 100, global: 800 });
  });
  it("can be overridden from the environment with positive integers, and anything else falls back to the default", () => {
    expect(capsFrom({ IP_DAILY_CAP: "150", GLOBAL_DAILY_CAP: "1200" })).toEqual({ ip: 150, global: 1200 });
    for (const bad of ["", "0", "-5", "abc", "1.5", " "]) expect(capsFrom({ IP_DAILY_CAP: bad, GLOBAL_DAILY_CAP: bad }), `value "${bad}"`).toEqual({ ip: 100, global: 800 });
    expect(capsFrom({ IP_DAILY_CAP: "7" })).toEqual({ ip: 7, global: 800 });
  });
  it("the limit message states the numbers actually in force", () => {
    expect(limitMessage({ ip: 100, global: 800 })).toBe("Live mode limit reached today, please use Demo mode. Daily limits: 100 Clocked calls per visitor and 800 for the whole site (UTC day).");
    expect(limitMessage({ ip: 7, global: 9 })).toContain("7 Clocked calls per visitor and 9 for the whole site");
  });
  it("checkLimits enforces custom caps, per IP and globally", async () => {
    const k = kv();
    for (let i = 0; i < 3; i++) expect((await checkLimits(k, "1.1.1.1", T, () => 0, { ip: 15, global: 800 })).ok).toBe(true); // always sampled: +5 each
    expect(await checkLimits(k, "1.1.1.1", T, () => 0.99, { ip: 15, global: 800 })).toEqual({ ok: false, reason: "ip" });
    expect((await checkLimits(k, "2.2.2.2", T, () => 0.99, { ip: 15, global: 800 })).ok).toBe(true);
    expect(await checkLimits(k, "2.2.2.2", T, () => 0.99, { ip: 100, global: 15 })).toEqual({ ok: false, reason: "global" });
  });
});

describe("checkLimits (sampled counting)", () => {
  const always = () => 0; // always sampled
  const never = () => 0.99; // never sampled
  it("writes only on sampled calls, adding SAMPLE_EVERY to both counters", async () => {
    const k = kv();
    for (let i = 0; i < 10; i++) await checkLimits(k, "1.1.1.1", T, never);
    expect(k.puts).toBe(0);
    await checkLimits(k, "1.1.1.1", T, always);
    expect(k.puts).toBe(2);
    expect(k.store.get("rl:ip:2026-11-08:1.1.1.1")).toBe(String(SAMPLE_EVERY));
    expect(k.store.get("rl:global:2026-11-08")).toBe(String(SAMPLE_EVERY));
  });
  it("samples with probability 1/5: the boundary is random() < 0.2", async () => {
    const k = kv();
    await checkLimits(k, "a", T, () => 0.2);
    expect(k.puts).toBe(0);
    await checkLimits(k, "a", T, () => 0.1999);
    expect(k.puts).toBe(2);
  });
  it("is statistically about 1 write per 5 calls with a real random source", async () => {
    const k = kv();
    for (let i = 0; i < 1000; i++) await checkLimits(k, "ip" + i, T); // distinct IPs so no cap is hit
    expect(k.puts / 2).toBeGreaterThan(140); // expected 200 sampled calls
    expect(k.puts / 2).toBeLessThan(260);
  });
  it("refuses once the per-IP counter reaches the cap; other visitors are unaffected", async () => {
    const k = kv();
    for (let i = 0; i < IP_DAILY_CAP / SAMPLE_EVERY; i++) expect((await checkLimits(k, "1.1.1.1", T, always)).ok).toBe(true);
    expect(await checkLimits(k, "1.1.1.1", T, never)).toEqual({ ok: false, reason: "ip" });
    expect((await checkLimits(k, "2.2.2.2", T, never)).ok).toBe(true);
  });
  it("enforces the global daily cap across IPs", async () => {
    const k = kv();
    k.store.set("rl:global:2026-11-08", String(GLOBAL_DAILY_CAP));
    expect(await checkLimits(k, "3.3.3.3", T, never)).toEqual({ ok: false, reason: "global" });
  });
  it("resets on the next UTC day", async () => {
    const k = kv();
    k.store.set("rl:ip:2026-11-08:1.1.1.1", String(IP_DAILY_CAP));
    expect((await checkLimits(k, "1.1.1.1", T, never)).ok).toBe(false);
    expect((await checkLimits(k, "1.1.1.1", new Date("2026-11-09T00:00:01Z"), never)).ok).toBe(true);
  });
  it("fails open when KV READS fail", async () => {
    const r = kv();
    r.failGet = true;
    expect((await checkLimits(r, "1.1.1.1", T, always)).ok).toBe(true);
  });
  it("fails closed when a sampled WRITE fails, but unsampled calls do not touch KV writes", async () => {
    const w = kv();
    w.failPut = true;
    expect(await checkLimits(w, "1.1.1.1", T, always)).toEqual({ ok: false, reason: "kv_write" });
    expect((await checkLimits(w, "1.1.1.1", T, never)).ok).toBe(true);
  });
});

const ctx = (url: string, env: Record<string, unknown>, init: RequestInit = {}) =>
  ({ request: new Request(url, { method: "POST", headers: { "idempotency-key": "k", "content-type": "application/json", ...(init.headers as object) }, body: "{}" }), env, params: { endpoint: "decide" } }) as unknown as Parameters<typeof onRequestPost>[0];

afterEach(() => vi.restoreAllMocks());

describe("onRequestPost", () => {
  it("an environment cap override is enforced and its numbers appear in the message; a request cannot change the caps", async () => {
    const k = kv();
    const today = new Date().toISOString().slice(0, 10);
    k.store.set(`rl:ip:${today}:unknown`, "10");
    const r = await onRequestPost(ctx("https://scopeshield.pages.dev/api/clocked/decide?IP_DAILY_CAP=9999", { CLOCKED_API_KEY: "x", RATE_LIMIT: k, IP_DAILY_CAP: "10", GLOBAL_DAILY_CAP: "20" }, { headers: { "x-ip-daily-cap": "9999" } }));
    expect(r.status).toBe(429);
    expect(((await r.json()) as { error: string }).error).toContain("10 Clocked calls per visitor and 20 for the whole site");
  });
  it("ALLOWED_ORIGINS comes from env only: a request header cannot add an origin", async () => {
    const r = await onRequestPost(ctx("https://scopeshield.pages.dev/api/clocked/decide", { CLOCKED_API_KEY: "x", RATE_LIMIT: kv() }, { headers: { Origin: "https://evil.example", "x-allowed-origins": "https://evil.example" } }));
    expect(r.status).toBe(403);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const ok = await onRequestPost(ctx("https://scopeshield.pages.dev/api/clocked/decide", { CLOCKED_API_KEY: "x", RATE_LIMIT: kv(), ALLOWED_ORIGINS: "https://app.example.com" }, { headers: { Origin: "https://app.example.com" } }));
    expect(ok.status).toBe(200);
  });
  it("rejects cross-origin browser requests before doing anything else", async () => {
    const r = await onRequestPost(ctx("https://scopeshield.pages.dev/api/clocked/decide", { CLOCKED_API_KEY: "x", RATE_LIMIT: kv() }, { headers: { Origin: "https://evil.example" } }));
    expect(r.status).toBe(403);
  });
  it("returns the friendly limit message with a stable code once the cap is hit", async () => {
    const k = kv();
    k.store.set("rl:ip:" + new Date().toISOString().slice(0, 10) + ":9.9.9.9", String(IP_DAILY_CAP));
    const r = await onRequestPost(ctx("https://scopeshield.pages.dev/api/clocked/decide", { CLOCKED_API_KEY: "x", RATE_LIMIT: k }, { headers: { "CF-Connecting-IP": "9.9.9.9" } }));
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: "Live mode limit reached today, please use Demo mode. Daily limits: 100 Clocked calls per visitor and 800 for the whole site (UTC day).", code: "limit_reached" });
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
  });
  it("does not count rejected requests (bad endpoint) against the caps", async () => {
    const k = kv();
    const c = ctx("https://scopeshield.pages.dev/api/clocked/nope", { CLOCKED_API_KEY: "x", RATE_LIMIT: k });
    (c.params as Record<string, string>).endpoint = "nope";
    expect((await onRequestPost(c)).status).toBe(404);
    expect(k.puts).toBe(0);
  });
  it("refuses (never fails open) when the KV binding is missing on a deployed host, and logs once", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const a = await onRequestPost(ctx("https://scopeshield.pages.dev/api/clocked/decide", { CLOCKED_API_KEY: "x" }));
    const b = await onRequestPost(ctx("https://scopeshield.pages.dev/api/clocked/decide", { CLOCKED_API_KEY: "x" }));
    expect([a.status, b.status]).toEqual([503, 503]);
    expect(err.mock.calls.length).toBeLessThanOrEqual(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("forwards the key server-side without echoing it (flag on, no KV)", async () => {
    const up = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200, headers: { "x-clocked-credits": "1" } }));
    const r = await onRequestPost(ctx("http://localhost:8788/api/clocked/decide", { CLOCKED_API_KEY: "secret-test-value", ALLOW_UNLIMITED_LOCAL: "1" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("x-clocked-credits")).toBe("1");
    const sent = up.mock.calls[0][1] as RequestInit;
    expect((sent.headers as Record<string, string>).authorization).toBe("Bearer secret-test-value");
    expect(JSON.stringify([...r.headers])).not.toContain("secret-test-value");
  });
  it("flag OFF: caps are enforced even on localhost", async () => {
    const k = kv();
    const today = new Date().toISOString().slice(0, 10);
    k.store.set(`rl:ip:${today}:unknown`, String(IP_DAILY_CAP * 2));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const r = await onRequestPost(ctx("http://localhost:8788/api/clocked/decide", { CLOCKED_API_KEY: "x", RATE_LIMIT: k }));
    expect(r.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("flag OFF and no KV binding: refused even on localhost (never fails open)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await onRequestPost(ctx("http://localhost:8788/api/clocked/decide", { CLOCKED_API_KEY: "x" }));
    expect(r.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("flag ON via env skips the caps, even with a full counter", async () => {
    const k = kv();
    const today = new Date().toISOString().slice(0, 10);
    k.store.set(`rl:ip:${today}:unknown`, String(IP_DAILY_CAP * 2));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    expect((await onRequestPost(ctx("http://localhost:8788/api/clocked/decide", { CLOCKED_API_KEY: "x", RATE_LIMIT: k, ALLOW_UNLIMITED_LOCAL: "1" }))).status).toBe(200);
  });
  it("only the exact string \"1\" counts as the flag", async () => {
    for (const v of ["0", "true", "yes", "", " 1", "11"]) {
      const k = kv();
      const today = new Date().toISOString().slice(0, 10);
      k.store.set(`rl:ip:${today}:unknown`, String(IP_DAILY_CAP * 2));
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
      const r = await onRequestPost(ctx("http://localhost:8788/api/clocked/decide", { CLOCKED_API_KEY: "x", RATE_LIMIT: k, ALLOW_UNLIMITED_LOCAL: v }));
      expect(r.status, `flag "${v}"`).toBe(429);
      fetchSpy.mockRestore();
    }
  });
  it("ignores anything the caller controls: headers, query string, hostname", async () => {
    const k = kv();
    const today = new Date().toISOString().slice(0, 10);
    k.store.set(`rl:ip:${today}:unknown`, String(IP_DAILY_CAP * 2));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const sneaky = { "x-allow-unlimited-local": "1", allow_unlimited_local: "1", "x-forwarded-host": "localhost" };
    for (const url of ["http://localhost:8788/api/clocked/decide?ALLOW_UNLIMITED_LOCAL=1", "http://127.0.0.1:8788/api/clocked/decide", "https://scopeshield.pages.dev/api/clocked/decide?ALLOW_UNLIMITED_LOCAL=1"]) {
      const r = await onRequestPost(ctx(url, { CLOCKED_API_KEY: "x", RATE_LIMIT: k }, { headers: sneaky }));
      expect(r.status, url).toBe(429);
    }
  });
  it("forwards the eight allowed endpoints (incl. injection, rerank, pii, compare), refuses others, and applies the same caps and Origin check to the new ones", async () => {
    const up = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    for (const ep of ["decide", "extract", "fill", "grounding", "injection", "rerank", "pii", "compare"]) {
      const c = ctx(`http://localhost:8788/api/clocked/${ep}`, { CLOCKED_API_KEY: "x", ALLOW_UNLIMITED_LOCAL: "1" });
      (c.params as Record<string, string>).endpoint = ep;
      expect((await onRequestPost(c)).status, ep).toBe(200);
      expect(String(up.mock.calls.at(-1)![0])).toBe(`https://clocked.rezolve.ai/clocked/${ep}`);
    }
    const bad = ctx("https://scopeshield.pages.dev/api/clocked/inspect", { CLOCKED_API_KEY: "x", RATE_LIMIT: kv() });
    (bad.params as Record<string, string>).endpoint = "inspect";
    expect((await onRequestPost(bad)).status).toBe(404);
    for (const ep of ["injection", "rerank", "pii", "compare"]) {
      const k = kv();
      const today = new Date().toISOString().slice(0, 10);
      k.store.set(`rl:ip:${today}:unknown`, String(IP_DAILY_CAP * 2));
      const capped = ctx(`https://scopeshield.pages.dev/api/clocked/${ep}`, { CLOCKED_API_KEY: "x", RATE_LIMIT: k });
      (capped.params as Record<string, string>).endpoint = ep;
      expect((await onRequestPost(capped)).status, `${ep} cap`).toBe(429);
      const cross = ctx(`https://scopeshield.pages.dev/api/clocked/${ep}`, { CLOCKED_API_KEY: "x", RATE_LIMIT: kv() }, { headers: { Origin: "https://evil.example" } });
      (cross.params as Record<string, string>).endpoint = ep;
      expect((await onRequestPost(cross)).status, `${ep} origin`).toBe(403);
    }
  });
  it("rejects oversized bodies", async () => {
    const big = new Request("https://scopeshield.pages.dev/api/clocked/decide", { method: "POST", headers: { "idempotency-key": "k" }, body: "x".repeat(200 * 1024 + 1) });
    const r = await onRequestPost({ request: big, env: { CLOCKED_API_KEY: "x", RATE_LIMIT: kv() }, params: { endpoint: "decide" } } as unknown as Parameters<typeof onRequestPost>[0]);
    expect(r.status).toBe(413);
  });
});
