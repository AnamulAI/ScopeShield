import { describe, expect, it } from "vitest";
import type { VerifyClaim } from "./clocked-types";
import { countVerdicts, toVerifiedClaims, verifyCopyState, type VerifiedClaim } from "./verify";
import { sliceCp } from "./thread";

const raw = (claim: string, verdict: string, evidence?: VerifyClaim["evidence"], kind = "claim"): VerifyClaim => ({ claim, kind, verdict, supported: 0, contradicted: 0, not_stated: 0, source: null, evidence });
const thread = "Dev: Bengali is $150 extra 😀\nClient: ok";
const contract = "Fixed price $800. Excluded: blog.";

describe("toVerifiedClaims", () => {
  it("drops non-claims (offers, questions, meta) and keeps the three verdicts", () => {
    const out = toVerifiedClaims([raw("a", "supported"), raw("b", "not_a_claim", undefined, "offer_or_question"), raw("c", "contradicted"), raw("d", "not_stated")], { contract, thread }, sliceCp);
    expect(out.map((c) => c.verdict)).toEqual(["supported", "contradicted", "not_stated"]);
  });
  it("marks evidence located only when the offsets reproduce the quote in the NAMED document (code points)", () => {
    const quote = "Bengali is $150 extra 😀";
    const start = Array.from(thread.slice(0, thread.indexOf(quote))).length;
    const ok = toVerifiedClaims([raw("x", "supported", { document: "thread", quote, start, end: start + Array.from(quote).length, confidence: 1 })], { contract, thread }, sliceCp);
    expect(ok[0].evidence?.located).toBe(true);
    // same offsets applied to the wrong document must not be trusted
    const wrongDoc = toVerifiedClaims([raw("x", "supported", { document: "contract", quote, start, end: start + Array.from(quote).length, confidence: 1 })], { contract, thread }, sliceCp);
    expect(wrongDoc[0].evidence?.located).toBe(false);
    const unknownDoc = toVerifiedClaims([raw("x", "supported", { document: "other", quote: "q", start: 0, end: 1, confidence: 1 })], { contract, thread }, sliceCp);
    expect(unknownDoc[0].evidence?.located).toBe(false);
  });
});

describe("verifyCopyState policy", () => {
  const c = (verdict: VerifiedClaim["verdict"]): VerifiedClaim => ({ text: verdict, verdict });
  it("does not interfere while running, failed or absent (the invented-amount guard still applies elsewhere)", () => {
    expect(verifyCopyState(undefined)).toEqual({ blockedReason: null, needsAck: false });
    expect(verifyCopyState({ status: "running" })).toEqual({ blockedReason: null, needsAck: false });
    expect(verifyCopyState({ status: "failed" })).toEqual({ blockedReason: null, needsAck: false });
  });
  it("all supported: Copy is free", () => {
    expect(verifyCopyState({ status: "done", claims: [c("supported"), c("supported")] })).toEqual({ blockedReason: null, needsAck: false });
  });
  it("a contradicted claim blocks Copy, and acknowledging does not unblock it", () => {
    const s = verifyCopyState({ status: "done", claims: [c("supported"), c("contradicted")], acknowledged: true });
    expect(s.blockedReason).toContain("contradicts");
  });
  it("a not-stated claim is not blocking but needs one acknowledgement click", () => {
    const claims = [c("supported"), c("not_stated")];
    expect(verifyCopyState({ status: "done", claims })).toEqual({ blockedReason: null, needsAck: true });
    expect(verifyCopyState({ status: "done", claims, acknowledged: true })).toEqual({ blockedReason: null, needsAck: false });
  });
  it("counts verdicts", () => {
    expect(countVerdicts([c("supported"), c("supported"), c("not_stated"), c("contradicted")])).toEqual({ supported: 2, notStated: 1, contradicted: 1 });
    expect(countVerdicts(undefined)).toEqual({ supported: 0, notStated: 0, contradicted: 0 });
  });
});
