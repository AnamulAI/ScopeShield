// Pure, app-owned routing. Thresholds live here, not in the API call.
export const THRESHOLDS = { inScopeBelow: 0.3, outsideAtLeast: 0.7, paidYes: 0.75, paidNo: 0.25, withdrawn: 0.75 } as const;

export type Queue = "withdrawn" | "in_scope" | "ask_me" | "needs_change_order" | "agreed_extra";
export interface RouteResult { queue: Queue; reason: string }
export interface Probabilities { outside: number; paid: number; withdrawn: number }

/** WITHDRAWN is checked first: a dropped request needs no scope verdict, change order or invoice. */
export function route({ outside, paid, withdrawn }: Probabilities): RouteResult {
  const t = THRESHOLDS;
  if (withdrawn >= t.withdrawn) return { queue: "withdrawn", reason: "The client later withdrew or dropped this request." };
  if (outside < t.inScopeBelow) return { queue: "in_scope", reason: "Looks inside the agreed scope." };
  if (outside < t.outsideAtLeast) return { queue: "ask_me", reason: "Unclear whether this is inside the agreed scope." };
  if (paid >= t.paidYes) return { queue: "agreed_extra", reason: "Outside scope, and the client appears to have agreed to pay." };
  if (paid <= t.paidNo) return { queue: "needs_change_order", reason: "Outside scope, and no agreement to pay was found." };
  return { queue: "ask_me", reason: "Outside scope, but it is unclear whether the client agreed to pay." };
}
