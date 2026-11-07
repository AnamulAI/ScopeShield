import { afterEach, describe, expect, it, vi } from "vitest";
import { checkLimits, GLOBAL_DAILY_CAP, IP_DAILY_CAP, onRequestPost, originAllowed, SAMPLE_EVERY } from "./[endpoint]";

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
  it("allows same-origin (including the deployed pages.dev host) and missing Origin", () => {
    expect(originAllowed("https://app.example.com", "https://app.example.com/api/clocked/decide")).toBe(true);
    expect(originAllowed("https://scopeshield.pages.dev", "https://scopeshield.pages.dev/api/clocked/decide")).toBe(true);
    expect(originAllowed("https://abc123.scopeshield.pages.dev", "https://abc123.scopeshield.pages.dev/api/clocked/fill")).toBe(true);
    expect(originAllowed(null, "https://app.example.com/api/clocked/decide")).toBe(true);
  });
  it("rejects cross-origin and malformed", () => {
    expect(originAllowed("https://evil.example", "https://scopeshield.pages.dev/api/clocked/decide")).toBe(false);
    expect(originAllowed("not a url", "https://app.example.com/x")).toBe(false);
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
  it("rejects cross-origin browser requests before doing anything else", async () => {
    const r = await onRequestPost(ctx("https://scopeshield.pages.dev/api/clocked/decide", { CLOCKED_API_KEY: "x", RATE_LIMIT: kv() }, { headers: { Origin: "https://evil.example" } }));
    expect(r.status).toBe(403);
  });
  it("returns the friendly limit message with a stable code once the cap is hit", async () => {
    const k = kv();
    k.store.set("rl:ip:" + new Date().toISOString().slice(0, 10) + ":9.9.9.9", String(IP_DAILY_CAP));
    const r = await onRequestPost(ctx("https://scopeshield.pages.dev/api/clocked/decide", { CLOCKED_API_KEY: "x", RATE_LIMIT: k }, { headers: { "CF-Connecting-IP": "9.9.9.9" } }));
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: "Live mode limit reached today, please use Demo mode.", code: "limit_reached" });
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
  it("allows a missing binding only on localhost, and forwards the key server-side without echoing it", async () => {
    const up = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200, headers: { "x-clocked-credits": "1" } }));
    const r = await onRequestPost(ctx("http://localhost:8788/api/clocked/decide", { CLOCKED_API_KEY: "secret-test-value" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("x-clocked-credits")).toBe("1");
    const sent = up.mock.calls[0][1] as RequestInit;
    expect((sent.headers as Record<string, string>).authorization).toBe("Bearer secret-test-value");
    expect(JSON.stringify([...r.headers])).not.toContain("secret-test-value");
  });
  it("does not apply daily caps on localhost (dev evals), even with a full counter", async () => {
    const k = kv();
    const today = new Date().toISOString().slice(0, 10);
    k.store.set(`rl:ip:${today}:unknown`, String(IP_DAILY_CAP * 2));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    expect((await onRequestPost(ctx("http://localhost:8788/api/clocked/decide", { CLOCKED_API_KEY: "x", RATE_LIMIT: k }))).status).toBe(200);
    expect((await onRequestPost(ctx("https://scopeshield.pages.dev/api/clocked/decide", { CLOCKED_API_KEY: "x", RATE_LIMIT: k }))).status).toBe(429);
  });
  it("rejects oversized bodies", async () => {
    const big = new Request("https://scopeshield.pages.dev/api/clocked/decide", { method: "POST", headers: { "idempotency-key": "k" }, body: "x".repeat(200 * 1024 + 1) });
    const r = await onRequestPost({ request: big, env: { CLOCKED_API_KEY: "x", RATE_LIMIT: kv() }, params: { endpoint: "decide" } } as unknown as Parameters<typeof onRequestPost>[0]);
    expect(r.status).toBe(413);
  });
});
