// Verify (grounding) results for a generated draft, and the app-owned policy on what they change.
import type { VerifyClaim } from "./clocked-types";

export interface VerifiedClaim {
  text: string;
  verdict: "supported" | "contradicted" | "not_stated";
  /** Passage Verify returned, if any. `document` says which source the offsets belong to. */
  evidence?: { document: string; quote: string; start: number; end: number; confidence: number; /** offsets verified against the source text */ located: boolean };
}

export interface VerifyState {
  status: "running" | "done" | "failed";
  claims?: VerifiedClaim[];
  /** The user clicked "I've read this" for not-stated claims. */
  acknowledged?: boolean;
}

export const countVerdicts = (claims: VerifiedClaim[] = []) => ({
  supported: claims.filter((c) => c.verdict === "supported").length,
  contradicted: claims.filter((c) => c.verdict === "contradicted").length,
  notStated: claims.filter((c) => c.verdict === "not_stated").length,
});

/** Keeps only factual claims judged supported/contradicted/not_stated; offers, questions and meta text are "not a claim" and are dropped. */
export function toVerifiedClaims(raw: VerifyClaim[], sources: Record<string, string>, slice: (s: string, a: number, b: number) => string): VerifiedClaim[] {
  return raw
    .filter((c) => c.verdict === "supported" || c.verdict === "contradicted" || c.verdict === "not_stated")
    .map((c) => {
      const ev = c.evidence;
      const src = ev ? sources[ev.document] : undefined;
      return {
        text: c.claim,
        verdict: c.verdict as VerifiedClaim["verdict"],
        evidence: ev ? { ...ev, located: src !== undefined && slice(src, ev.start, ev.end) === ev.quote } : undefined,
      };
    });
}

/**
 * Policy (documented in docs/eval-notes.md):
 * - CONTRADICTED claim: Copy is blocked for the draft; the claim and its evidence are shown.
 * - NOT STATED claim: amber "Not found in the thread" note. Not blocking (a promise is not a fact), but Copy is gated behind one click on "I've read this".
 * - SUPPORTED claims: counted and shown as a green check.
 * - Verify unavailable (failed): the draft is marked "not verified"; Copy is not blocked by Verify (the invented-amount guard still applies).
 */
export const NOT_STATED_NEEDS_ACK = true;

export function verifyCopyState(v: VerifyState | undefined): { blockedReason: string | null; needsAck: boolean } {
  if (!v || v.status !== "done") return { blockedReason: null, needsAck: false };
  const n = countVerdicts(v.claims);
  if (n.contradicted > 0) return { blockedReason: "Blocked: the draft contradicts the contract or the thread.", needsAck: false };
  return { blockedReason: null, needsAck: NOT_STATED_NEEDS_ACK && n.notStated > 0 && !v.acknowledged };
}
