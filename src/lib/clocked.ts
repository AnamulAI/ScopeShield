// Typed Clocked client: concurrency cap, bounded retries with the SAME Idempotency-Key, exponential backoff + jitter.
import type { ClockedUsage } from "./clocked-types";

export type ErrorKind = "bad_request" | "auth" | "credits" | "conflict" | "rate_limit" | "server" | "timeout" | "network";

export class ClockedError extends Error {
  constructor(public kind: ErrorKind, message: string, public status?: number) {
    super(message);
    this.name = "ClockedError";
  }
}

export interface ClientOptions {
  baseUrl?: string; // "" = same origin (browser); e.g. http://localhost:8788 from Node
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  newKey?: () => string;
  maxConcurrent?: number; // keep <= 3 (account limit is 4)
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
}

export interface CallResult<T> { data: T; usage: ClockedUsage | null; attempts: number }
export type Endpoint = "decide" | "extract" | "fill";

const RETRYABLE: ReadonlySet<ErrorKind> = new Set(["conflict", "rate_limit", "server", "timeout", "network"]);

export function classify(status: number): ErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "credits";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  return "bad_request"; // 400, 413, 422, 404...
}

export const parseUsage = (h: Headers): ClockedUsage | null => {
  const credits = h.get("x-clocked-credits");
  if (credits === null) return null;
  return { credits: Number(credits), costUsd: Number(h.get("x-clocked-cost-usd") ?? 0), modelMs: Number(h.get("x-clocked-model-ms") ?? 0) };
};

/** Delay before retry number `attempt` (1-based): half-to-full of the exponential cap. */
export const backoffDelay = (attempt: number, base: number, max: number, rand: number): number => {
  const cap = Math.min(max, base * 2 ** (attempt - 1));
  return Math.round(cap / 2 + (cap / 2) * rand);
};

export function createClockedClient(opts: ClientOptions = {}) {
  const {
    baseUrl = "",
    fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    random = Math.random,
    newKey = () => crypto.randomUUID(),
    maxConcurrent = 3,
    maxAttempts = 4,
    baseDelayMs = 800,
    maxDelayMs = 15_000,
    timeoutMs = 120_000,
  } = opts;

  // Tiny semaphore: at most `maxConcurrent` requests in flight.
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = () => (active < maxConcurrent ? (active++, Promise.resolve()) : new Promise<void>((r) => waiting.push(() => (active++, r()))));
  const release = () => {
    active--;
    waiting.shift()?.();
  };

  async function attemptOnce(url: string, body: string, key: string): Promise<{ data: unknown; usage: ClockedUsage | null }> {
    await acquire();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      let res: Response;
      try {
        res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body, signal: ctrl.signal });
      } catch (e) {
        if (ctrl.signal.aborted) throw new ClockedError("timeout", "Request timed out");
        throw new ClockedError("network", (e as Error).message || "Network error");
      }
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j?.error) msg = typeof j.error === "string" ? j.error : (j.error.message ?? msg);
          else if (j?.message) msg = j.message;
        } catch { /* body not JSON */ }
        const err = new ClockedError(classify(res.status), msg, res.status);
        (err as ClockedError & { retryAfterMs?: number }).retryAfterMs = Number(res.headers.get("retry-after")) * 1000 || undefined;
        throw err;
      }
      return { data: await res.json(), usage: parseUsage(res.headers) };
    } finally {
      clearTimeout(timer);
      release();
    }
  }

  async function call<T>(endpoint: Endpoint, payload: unknown): Promise<CallResult<T>> {
    const url = `${baseUrl}/api/clocked/${endpoint}`;
    const body = JSON.stringify(payload);
    const key = newKey(); // one key per logical request; reused verbatim on every retry
    for (let attempt = 1; ; attempt++) {
      try {
        const { data, usage } = await attemptOnce(url, body, key);
        return { data: data as T, usage, attempts: attempt };
      } catch (e) {
        const err = e as ClockedError & { retryAfterMs?: number };
        if (!(err instanceof ClockedError) || !RETRYABLE.has(err.kind) || attempt >= maxAttempts) throw err;
        const wait = Math.min(maxDelayMs, Math.max(backoffDelay(attempt, baseDelayMs, maxDelayMs, random()), err.retryAfterMs ?? 0));
        await sleep(wait);
      }
    }
  }

  return { call };
}
export type ClockedClient = ReturnType<typeof createClockedClient>;
