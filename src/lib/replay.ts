// Pure helpers for the thread replay (recorded data only) and the results view (filters, collapsed groups).
import type { Queue } from "./routing";

export interface ReplayMsg { isClient: boolean; text: string; speaker: string }

/** The three-dot typing indicator shown before each new bubble (replay only, never with reduced motion). */
export const TYPING_MS = 400;

/** Pause (ms) after showing a message before the typing indicator for the next one: longer for the client's messages, which carry the requests. */
export const replayDelay = (m: ReplayMsg): number => (m.isClient ? Math.min(800, 380 + m.text.length * 6) : Math.min(500, 200 + m.text.length * 4));

/** Upper bound for a whole replay. A watchdog finishes the replay after this, so a stalled timer can never leave messages hidden. */
export const replayBudget = (msgs: ReplayMsg[]): number => msgs.reduce((t, m) => t + replayDelay(m) + TYPING_MS, 0) + 3000;

/** Text for the polite live region: only client messages are announced, with their verdicts, to keep it quiet. */
export function announcement(m: ReplayMsg, verdicts: string[]): string {
  if (!m.isClient) return "";
  return `${m.speaker}, client: ${m.text.replace(/\s+/g, " ").trim()}.${verdicts.length ? ` ${verdicts.join(". ")}.` : ""}`;
}

export type Filter = Queue | "all";
export const COLLAPSED_BY_DEFAULT: readonly Queue[] = ["in_scope", "withdrawn"];

/** Which queues are listed for the current filter. Everything stays reachable: "all" lists them all. */
export const visibleQueues = (filter: Filter, order: readonly Queue[]): Queue[] => (filter === "all" ? [...order] : order.filter((q) => q === filter));

/** Calm queues start collapsed (their counts stay visible); choosing one as the filter, or expanding it, shows its cards. */
export const isExpanded = (q: Queue, filter: Filter, expanded: ReadonlySet<Queue>): boolean =>
  filter === q || !COLLAPSED_BY_DEFAULT.includes(q) || expanded.has(q);
