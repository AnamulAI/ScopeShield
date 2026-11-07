// Pure, app-owned routing. Thresholds live here, not in the API call.
export const THRESHOLDS = { inScopeBelow: 0.3, outsideAtLeast: 0.7, paidYes: 0.75, paidNo: 0.25, withdrawn: 0.75 } as const;

export type Queue = "withdrawn" | "in_scope" | "ask_me" | "needs_change_order" | "agreed_extra";
/** Why a request landed in ASK ME: scope itself is unclear, or the agreement to pay is unclear. */
export type AskKind = "scope" | "agreement";
export interface RouteResult { queue: Queue; reason: string; ask?: AskKind }
export interface Probabilities { outside: number; paid: number; withdrawn: number }

/** WITHDRAWN is checked first: a dropped request needs no scope verdict, change order or invoice. */
export function route({ outside, paid, withdrawn }: Probabilities): RouteResult {
  const t = THRESHOLDS;
  if (withdrawn >= t.withdrawn) return { queue: "withdrawn", reason: "The client later withdrew or dropped this request." };
  if (outside < t.inScopeBelow) return { queue: "in_scope", reason: "Looks inside the agreed scope." };
  if (outside < t.outsideAtLeast) return { queue: "ask_me", reason: "Unclear whether this is inside the agreed scope.", ask: "scope" };
  if (paid >= t.paidYes) return { queue: "agreed_extra", reason: "Outside scope, and the client appears to have agreed to pay." };
  if (paid <= t.paidNo) return { queue: "needs_change_order", reason: "Outside scope, and no agreement to pay was found." };
  return { queue: "ask_me", reason: "Outside scope, but it is unclear whether the client agreed to pay.", ask: "agreement" };
}

/** The user's answer to an ASK ME card. */
export type Decision = "in_scope" | "extra" | "skip";

/** Queue an item is shown in after the user's decision (decisions only apply to ASK ME items). */
export function effectiveQueue(r: RouteResult | undefined, decision?: Decision): Queue | "pending" {
  if (!r) return "pending";
  if (r.queue === "ask_me") {
    if (decision === "in_scope") return "in_scope";
    if (decision === "extra") return "needs_change_order";
  }
  return r.queue;
}

/** ONE concrete question per ASK ME card, from a template: no extra model call. */
export function askQuestion(request: string, ask: AskKind): string {
  const r = request.replace(/[?.!\s]+$/, "");
  return ask === "scope"
    ? `Is “${r}” part of what you agreed to deliver in the contract?`
    : `“${r}” is outside the contract. Did the client clearly agree to pay extra for it?`;
}
