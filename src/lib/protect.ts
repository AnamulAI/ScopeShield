// Protect (M11): a privacy-safe evidence pack. The ORIGINAL text is never altered; only a masked copy is offered.
import type { TFn } from "../i18n/core";
import type { PiiResponse } from "./clocked-types";

export const PII_ENTITIES = ["person", "email", "phone", "address", "bank_account", "credit_card"] as const;

export const buildPiiRequest = (text: string) => ({ text, entities: [...PII_ENTITIES], anonymize: "replace" });

export interface EvidencePack {
  /** the pack as assembled from the analysis (never altered, never leaves the browser except for the one Protect call) */
  text: string;
  status: "running" | "done" | "failed";
  maskedText?: string;
  /** findings by kind; the original sensitive values are NOT kept */
  counts?: Record<string, number>;
  error?: string;
}

/** "3 items (person 2, email 1)" or "nothing found". */
export function describeCounts(counts: Record<string, number> | undefined): string {
  const entries = Object.entries(counts ?? {}).filter(([, n]) => n > 0);
  const total = entries.reduce((t, [, n]) => t + n, 0);
  if (total === 0) return "0 items";
  return `${total} item${total === 1 ? "" : "s"} (${entries.map(([k, n]) => `${k.replace("_", " ")} ${n}`).join(", ")})`;
}

/** Same as describeCounts, in the language of `t` (kinds such as "person" stay as the API names them). */
export function describeCountsText(t: TFn, counts: Record<string, number> | undefined): string {
  const entries = Object.entries(counts ?? {}).filter(([, n]) => n > 0);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  if (total === 0) return t("pack.zero");
  return t(total === 1 ? "pack.items.one" : "pack.items.other", { n: total, kinds: entries.map(([k, n]) => `${k.replace("_", " ")} ${n}`).join(", ") });
}

/** Keeps findings by kind and the masked text; drops the original values that the API echoes back in `entities`. */
export function toPack(res: PiiResponse, text: string): EvidencePack {
  const counts: Record<string, number> = { ...(res.counts ?? {}) };
  if (Object.keys(counts).length === 0) for (const e of res.entities ?? []) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return { text, status: "done", maskedText: res.anonymized_text ?? text, counts };
}
