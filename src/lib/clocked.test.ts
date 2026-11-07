import { describe, expect, it, vi } from "vitest";
import { backoffDelay, ClockedError, classify, createClockedClient } from "./clocked";

const ok = (body: unknown, credits = "1") => new Response(JSON.stringify(body), { status: 200, headers: { "x-clocked-credits": credits } });
const fail = (status: number, extra: HeadersInit = {}) => new Response(JSON.stringify({ error: "nope" }), { status, headers: extra });

function make(responses: Array<Response | Error>) {
  const calls: Array<{ key: string; body: string }> = [];
  const fetchImpl = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ key: (init!.headers as Record<string, string>)["idempotency-key"], body: init!.body as string });
    const r = responses.shift()!;
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  const sleep = vi.fn(async () => {});
  const client = createClockedClient({ fetchImpl, sleep, random: () => 0.5, newKey: () => "key-1", baseDelayMs: 100, maxDelayMs: 1000 });
  return { client, calls, sleep, fetchImpl };
}

describe("classify / backoff", () => {
  it("maps statuses", () => {
    expect([401, 402, 409, 429, 500, 422].map(classify)).toEqual(["auth", "credits", "conflict", "rate_limit", "server", "bad_request"]);
  });
  it("grows exponentially, is capped and jittered", () => {
    expect(backoffDelay(1, 100, 1000, 0)).toBe(50);
    expect(backoffDelay(1, 100, 1000, 1)).toBe(100);
    expect(backoffDelay(3, 100, 1000, 1)).toBe(400);
    expect(backoffDelay(10, 100, 1000, 1)).toBe(1000);
  });
});

describe("call", () => {
  it("returns data and usage on success", async () => {
    const { client } = make([ok({ answers: {} }, "7")]);
    const r = await client.call("decide", { a: 1 });
    expect(r.usage?.credits).toBe(7);
    expect(r.attempts).toBe(1);
  });
  it("retries 429 and 5xx with the SAME key and SAME body, then succeeds", async () => {
    const { client, calls, sleep } = make([fail(429), fail(503), ok({ x: 1 })]);
    const r = await client.call("extract", { text: "hi" });
    expect(r.attempts).toBe(3);
    expect(new Set(calls.map((c) => c.key))).toEqual(new Set(["key-1"]));
    expect(new Set(calls.map((c) => c.body)).size).toBe(1);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
  it("retries network errors and 409", async () => {
    const { client } = make([new TypeError("fetch failed"), fail(409), ok({})]);
    expect((await client.call("fill", {})).attempts).toBe(3);
  });
  it("honours Retry-After when larger than backoff (bounded by max)", async () => {
    const { client, sleep } = make([fail(429, { "retry-after": "1" }), ok({})]);
    await client.call("decide", {});
    expect(sleep).toHaveBeenCalledWith(1000);
  });
  it("gives up after maxAttempts with a typed error", async () => {
    const { client, fetchImpl } = make([fail(500), fail(500), fail(500), fail(500), fail(500)]);
    await expect(client.call("decide", {})).rejects.toMatchObject({ kind: "server", status: 500 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
  it("does not retry 400/401/402", async () => {
    for (const [s, kind] of [[400, "bad_request"], [401, "auth"], [402, "credits"]] as const) {
      const { client, fetchImpl } = make([fail(s)]);
      await expect(client.call("decide", {})).rejects.toMatchObject({ kind, status: s });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });
  it("never runs more than 3 requests at once", async () => {
    let active = 0, peak = 0;
    const fetchImpl = (async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return ok({});
    }) as unknown as typeof fetch;
    const client = createClockedClient({ fetchImpl });
    await Promise.all(Array.from({ length: 10 }, () => client.call("decide", {})));
    expect(peak).toBe(3);
  });
});
