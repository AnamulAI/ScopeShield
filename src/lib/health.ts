// Scope Health: counts per queue + a ROUGH estimate of unpaid effort. Never presented as fact.
import { tEn, type TFn } from "../i18n/core";
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

const EFFORT_LABELS = ["Trivial (minutes)", "Small (under a day)", "Medium (a few days)", "Large (a week or more)"];
/** Name of Decide's effort level nearest to the expected score (0-3). */
export const effortLabel = (score: number): string => EFFORT_LABELS[Math.min(3, Math.max(0, Math.round(score)))];
/** Index (0-3) of that level, for translated labels. */
export const effortIndex = (score: number): number => Math.min(3, Math.max(0, Math.round(score)));
/** Same level, in the language of `t` (keys effort.0 to effort.3). */
export const effortLabelText = (t: (key: `effort.${0 | 1 | 2 | 3}`) => string, score: number): string => t(`effort.${effortIndex(score) as 0 | 1 | 2 | 3}`);

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

export function formatHours(h: Hours, t: TFn = tEn): string {
  if (h.items === 0) return t("hours.none");
  if (h.max === null) return t("hours.atLeast", { n: h.min });
  return h.min === h.max ? t("hours.single", { n: h.min }) : t("hours.range", { a: h.min, b: h.max });
}

/** Money only when the user typed a rate. Returns null otherwise. Open-ended ranges give a minimum only. */
export function formatMoney(h: Hours, rate: number | null, t: TFn = tEn): string | null {
  if (rate === null || !(rate > 0) || h.items === 0) return null;
  const f = (n: number) => Math.round(n * rate).toLocaleString("en-US");
  if (h.max === null) return t("money.atLeast", { x: f(h.min) });
  return h.min === h.max ? f(h.min) : `${f(h.min)}–${f(h.max)}`;
}
