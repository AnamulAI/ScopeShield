// Shared types and small helpers for the analysis state. Kept free of API calls so every feature module can import it.
import { ClockedError, type ErrorKind } from "./clocked";
import type { ClockedUsage } from "./clocked-types";
import type { GuardFlag } from "./guard";
import { withholdMessages } from "./guard";
import type { Clause, Governing } from "./governing";
import type { PromiseCheck } from "./promise";
import type { EvidencePack } from "./protect";
import type { Decision, RouteResult } from "./routing";
import type { Message } from "./thread";
import type { VerifyState } from "./verify";

export type Status = "pending" | "running" | "done" | "failed";

export interface Verdict {
  outside: number;
  paid: number;
  /** Probability the client later withdrew this request. */
  withdrawn: number;
  kind: string;
  /** Zero-based expected effort score (0 = trivial ... 3 = large). Rough, never a fact. */
  effort: number;
}

export interface RequestItem {
  id: string;
  messageIndex: number;
  text: string;
  /** Evidence span in the ORIGINAL thread (code points); null if it could not be verified. */
  evidence: { start: number; end: number } | null;
  status: Status;
  verdict?: Verdict;
  route?: RouteResult;
  error?: string;
  errorKind?: ErrorKind;
  /** The user's answer to an ASK ME card (shown as "Your decision"; can be undone). */
  decision?: Decision;
  /** Sentence supporting an AGREED EXTRA (agreement) or WITHDRAWN (withdrawal) verdict. */
  support?: Support;
  /** AGREED EXTRA only: the price the developer quoted for THIS request (Extract); null value = none found. */
  agreedPrice?: AgreedPrice;
  changeOrder?: ChangeOrderState;
  /** M10: the contract clause that governs this request (Rerank), an estimate */
  governing?: Governing;
}

export interface Support {
  kind: "agreement" | "withdrawal";
  status: Status;
  /** null evidence = the model found no such sentence; shown explicitly. */
  text?: string | null;
  evidence?: { start: number; end: number } | null;
}

export interface AgreedPrice { status: Status; value?: string | null; evidence?: { start: number; end: number } | null }

export interface ChangeOrderState { status: Status; data?: ChangeOrder; /** Verify (grounding) result for the generated message */ verify?: VerifyState; error?: string; errorKind?: ErrorKind; /** one Regenerate attempt only */ regenerated: boolean }

export interface MessageState {
  messageIndex: number; status: Status; error?: string; errorKind?: ErrorKind; requestCount?: number;
  /** M9: Guard flagged this message; its text is withheld from the model state until the user chooses "Include anyway" */
  withheld?: boolean;
}

export interface GuardState {
  status: "running" | "done" | "failed";
  error?: string;
  errorKind?: ErrorKind;
  /** the model's overall estimate for the client messages as a whole */
  result?: { injection: number; verdict: string; category?: string; severity?: string };
  flags: GuardFlag[];
  /** evidence Guard returned that could not be matched to a message */
  unlocated: number;
  /** messages currently withheld from Decide, Fill and Verify */
  withheld: number[];
  /** messages the user chose to include anyway (recorded decision) */
  included: number[];
  /** Demo only: results recorded in advance for "Include anyway" so it needs no API call */
  includedResults?: Record<number, { items: RequestItem[]; state: MessageState }>;
}

export type UsageKey = "extract" | "decide" | "fill" | "price" | "verify" | "guard" | "rerank" | "pii" | "compare";

export interface Analysis {
  messages: Message[];
  messageStates: MessageState[];
  items: RequestItem[];
  /** extract = reading messages + agreement/withdrawal sentence lookups; price = agreed-price lookups (Extract); */
  usage: Record<UsageKey, { calls: number; credits: number }>;
  /** M9 Guard: screening of the client's messages */
  guard?: GuardState;
  /** M10 Rerank: the contract split into clauses c1..cn */
  clauses?: Clause[];
  /** M12 Compare: the freelancer's own statements checked against the contract */
  promiseCheck?: PromiseCheck;
  /** M11 Protect: privacy-safe evidence packs by request id */
  packs?: Record<string, EvidencePack>;
}

export const emptyUsage = (): Analysis["usage"] => ({ extract: { calls: 0, credits: 0 }, decide: { calls: 0, credits: 0 }, fill: { calls: 0, credits: 0 }, price: { calls: 0, credits: 0 }, verify: { calls: 0, credits: 0 }, guard: { calls: 0, credits: 0 }, rerank: { calls: 0, credits: 0 }, pii: { calls: 0, credits: 0 }, compare: { calls: 0, credits: 0 } });
export const totalCredits = (u: Analysis["usage"]) => (Object.keys(u) as UsageKey[]).reduce((t, k) => t + (u[k]?.credits ?? 0), 0);

export const addUsage = (a: Analysis, ep: keyof Analysis["usage"], u: ClockedUsage | null) => {
  a.usage[ep] ??= { calls: 0, credits: 0 };
  a.usage[ep].calls++;
  a.usage[ep].credits += u?.credits ?? 0;
};

export interface Inputs {
  contract: string; thread: string; clientName: string;
  /** Set on "effective" inputs: `thread` is then the thread with flagged messages withheld, and these map back to the original. */
  originalThread?: string;
  mapBack?: (start: number, end: number) => { start: number; end: number } | null;
}

/** The inputs the model should see: flagged client messages replaced by a withheld notice. Idempotent. */
export function effectiveInputs(a: Analysis, inputs: Inputs): Inputs {
  if (inputs.originalThread !== undefined) return inputs;
  const withheld = a.guard?.withheld ?? [];
  if (withheld.length === 0) return { ...inputs, originalThread: inputs.thread, mapBack: (s, e) => ({ start: s, end: e }) };
  const w = withholdMessages(inputs.thread, a.messages, new Set(withheld));
  return { ...inputs, thread: w.thread, originalThread: inputs.thread, mapBack: w.mapBack };
}

export function shapeError(what: string) {
  return new ClockedError("bad_request", `Unexpected ${what} response shape`);
}


export interface ChangeOrder {
  category: string | null;
  unpaidRisk: string | null;
  /** null = no price quoted in the thread */
  priceMentioned: string | null;
  priceEvidence: { start: number; end: number } | null;
  /** AI-generated drafts: never present as quotations. */
  message: string | null;
  nextStep: string | null;
  /** Currency amounts in generated text that do not appear in the contract or thread (Copy is blocked when non-empty). */
  inventedMessage: string[];
  inventedNextStep: string[];
  usage: ClockedUsage | null;
}

