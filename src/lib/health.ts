// Scope Health: counts per queue + a ROUGH estimate of unpaid effort. Never presented as fact.
import type { RequestItem } from "./pipeline";
import { effectiveQueue, type Queue } from "./routing";

export interface Band { min: number; max: number | null; label: string } // hours; max null = open-ended

/** Decide's zero-based expected effort score (0-3) -> rough hour band. */
export function effortBand(score: number): Band {
  if (score < 0.5) return { min: 0, max: 1, label: "under 1 h" };
  if (score < 1.5) return { min: 2, max: 6, label: "about 2–6 h" };
  if (score < 2.5) return { min: 16, max: 24, label: "about 16–24 h" };
  return { min: 40, max: null, label: "40 h or more" };
}

export interface Hours { min: number; max: number | null; items: number }
const addHours = (acc: Hours, b: Band): Hours => ({ min: acc.min + b.min, max: acc.max === null || b.max === null ? null : acc.max + b.max, items: acc.items + 1 });

export interface Health {
  counts: Record<Queue, number>;
  /** Items that count toward the estimates (WITHDRAWN never counts). */
  confirmedUnpaid: Hours; // NEEDS CHANGE ORDER (includes ASK ME items the user resolved as Extra work)
  possibleUnpaid: Hours; // ASK ME items still unresolved (no decision, or skipped)
  /** Requests still being checked or that failed: not counted anywhere. */
  uncounted: number;
}

export function scopeHealth(items: RequestItem[]): Health {
  const counts: Record<Queue, number> = { needs_change_order: 0, ask_me: 0, in_scope: 0, agreed_extra: 0, withdrawn: 0 };
  let confirmed: Hours = { min: 0, max: 0, items: 0 };
  let possible: Hours = { min: 0, max: 0, items: 0 };
  let uncounted = 0;
  for (const i of items) {
    const q = effectiveQueue(i.route, i.decision);
    if (q === "pending" || !i.verdict) { uncounted++; continue; }
    counts[q]++;
    if (q === "needs_change_order") confirmed = addHours(confirmed, effortBand(i.verdict.effort));
    else if (q === "ask_me") possible = addHours(possible, effortBand(i.verdict.effort));
  }
  return { counts, confirmedUnpaid: confirmed, possibleUnpaid: possible, uncounted };
}

export function formatHours(h: Hours): string {
  if (h.items === 0) return "none";
  if (h.max === null) return `at least ${h.min} h`;
  return h.min === h.max ? `${h.min} h` : `${h.min}–${h.max} h`;
}

/** Money only when the user typed a rate. Returns null otherwise. Open-ended ranges give a minimum only. */
export function formatMoney(h: Hours, rate: number | null): string | null {
  if (rate === null || !(rate > 0) || h.items === 0) return null;
  const f = (n: number) => Math.round(n * rate).toLocaleString("en-US");
  if (h.max === null) return `at least ${f(h.min)}`;
  return h.min === h.max ? f(h.min) : `${f(h.min)}–${f(h.max)}`;
}
