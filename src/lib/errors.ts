// Friendly, specific text for every failure class. The call layer has already retried 429/5xx/409/timeouts within a bounded budget.
import type { ErrorKind } from "./clocked";

/** `demo: true` = offer the Demo mode switch. */
export interface Described { title: string; hint: string; demo?: boolean }

export function describeError(kind: ErrorKind | undefined, detail?: string): Described {
  switch (kind) {
    case "credits":
      return { title: "Clocked credits are used up.", hint: "Results so far are kept. You can explore the recorded demo without credits.", demo: true };
    case "limit": {
      // The proxy's own message carries the real numbers in force ("Daily limits: ..."); fall back to the defaults if it is missing.
      const numbers = /Daily limits:[^]*$/.exec(detail ?? "")?.[0] ?? "Daily limits: 100 Clocked calls per visitor and 800 for the whole site (UTC day).";
      return { title: "Live mode limit reached today.", hint: `Please use Demo mode, or run the app yourself with your own key (see the README). ${numbers}`, demo: true };
    }
    case "bad_request":
      return { title: "The service rejected this input.", hint: `Shorten or simplify the text (contract up to 6,000 characters, thread up to 12,000, up to 30 client messages) and retry.${detail ? ` Detail: ${detail}` : ""}` };
    case "auth":
      return { title: "The server could not authenticate with Clocked.", hint: "This is a server configuration problem, not something in your text. Try the recorded demo, and tell the site owner." };
    case "rate_limit":
      return { title: "Clocked is rate-limiting requests.", hint: "We retried automatically with backoff and it did not clear. Wait a minute, then use Retry." };
    case "conflict":
      return { title: "The same request is already in flight.", hint: "We retried automatically. Use Retry in a moment." };
    case "timeout":
      return { title: "The request timed out.", hint: "We retried automatically with the same request key. Use Retry." };
    case "server":
      return { title: "Clocked had a server problem.", hint: "We retried automatically and it did not clear. Use Retry." };
    case "network":
      return { title: "Could not reach the server.", hint: "Check your connection, then use Retry." };
    default:
      return { title: "Something went wrong.", hint: detail ?? "Use Retry." };
  }
}

const SEVERITY: ErrorKind[] = ["limit", "credits", "auth", "bad_request", "rate_limit", "conflict", "timeout", "server", "network"];
/** The most important failure class among several, for the page-level banner. */
export const worstKind = (kinds: Array<ErrorKind | undefined>): ErrorKind | undefined => SEVERITY.find((k) => kinds.includes(k));
