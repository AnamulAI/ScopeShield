// Friendly, specific text for every failure class. The call layer has already retried 429/5xx/409/timeouts within a bounded budget.
import { tEn, type TFn } from "../i18n/core";
import type { ErrorKind } from "./clocked";

/** `demo: true` = offer the Demo mode switch. */
export interface Described { title: string; hint: string; demo?: boolean }

/** `t` defaults to English; the UI passes the translator of the current language. */
export function describeError(kind: ErrorKind | undefined, detail?: string, t: TFn = tEn): Described {
  switch (kind) {
    case "credits":
      return { title: t("err.credits.title"), hint: t("err.credits.hint"), demo: true };
    case "limit": {
      // The proxy's own message carries the real numbers in force ("Daily limits: N ... and M ..."); fall back to the defaults if it is missing.
      const m = /Daily limits:\s*(\d+)\D+?(\d+)/.exec(detail ?? "");
      const numbers = t("err.limit.numbers", { ip: m?.[1] ?? 100, site: m?.[2] ?? 800 });
      return { title: t("err.limit.title"), hint: t("err.limit.hint", { numbers }), demo: true };
    }
    case "bad_request":
      return { title: t("err.badRequest.title"), hint: `${t("err.badRequest.hint")}${detail ? ` ${t("err.detail", { detail })}` : ""}` };
    case "auth":
      return { title: t("err.auth.title"), hint: t("err.auth.hint") };
    case "rate_limit":
      return { title: t("err.rateLimit.title"), hint: t("err.rateLimit.hint") };
    case "conflict":
      return { title: t("err.conflict.title"), hint: t("err.conflict.hint") };
    case "timeout":
      return { title: t("err.timeout.title"), hint: t("err.timeout.hint") };
    case "server":
      return { title: t("err.server.title"), hint: t("err.server.hint") };
    case "network":
      return { title: t("err.network.title"), hint: t("err.network.hint") };
    default:
      return { title: t("err.generic.title"), hint: detail ?? t("err.generic.hint") };
  }
}

const SEVERITY: ErrorKind[] = ["limit", "credits", "auth", "bad_request", "rate_limit", "conflict", "timeout", "server", "network"];
/** The most important failure class among several, for the page-level banner. */
export const worstKind = (kinds: Array<ErrorKind | undefined>): ErrorKind | undefined => SEVERITY.find((k) => kinds.includes(k));
