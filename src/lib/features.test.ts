import { describe, expect, it } from "vitest";
import type { ClockedClient } from "./clocked";
import { buildPackText } from "./evidencePack";
import { runGoverning, runProtect, runPromiseCheck } from "./features";
import { buildRerankRequest, pickGoverning, splitClauses, RERANK_INSTRUCTIONS } from "./governing";
import { buildPromiseInput, buildPromiseRequest, mapYoursToThread, toConflicts } from "./promise";
import { buildPiiRequest, describeCounts, PII_ENTITIES, toPack } from "./protect";
import { buildFillRequest } from "./prompts";
import { emptyUsage, runFill, type Analysis, type RequestItem } from "./pipeline";
import { cpLength, parseThread, sliceCp } from "./thread";

const contract = "Project: 5-page website for a bakery (Home, Menu, About). Fixed price: $800, 50% upfront.\nIncludes two rounds of design revisions. Excluded: online ordering, payment integration, blog, hosting management.";
const thread = "Rafi: Hi Nila 😀\nNila: please add a blog\nRafi: Sure, the blog is no extra cost.\nNila: thanks\nRafi: Happy to do three more rounds of revisions";
const msgs = parseThread(thread, "Nila");
const inputs = { contract, thread, clientName: "Nila" };

const mk = (responses: Record<string, (body: any) => unknown>, seen: any[] = []) =>
  ({ async call(endpoint: string, body: any) { seen.push({ endpoint, body }); return { data: responses[endpoint](body), usage: { credits: 3, costUsd: 0, modelMs: 0 }, attempts: 1 }; } }) as unknown as ClockedClient;
const blankAnalysis = (): Analysis => ({ messages: msgs, messageStates: [], items: [], usage: emptyUsage() });
const item = (over: Partial<RequestItem> = {}): RequestItem => ({ id: "1-0", messageIndex: 1, text: "add a blog", evidence: null, status: "done", route: { queue: "needs_change_order", reason: "" }, verdict: { outside: 0.99, paid: 0, withdrawn: 0, kind: "x", effort: 2 }, ...over });

describe("M10 clauses and governing clause", () => {
  it("splits the contract into clauses c1..cn deterministically, keeping an exclusion list as ONE clause", () => {
    const c = splitClauses(contract);
    expect(c.map((x) => x.id)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(c[0].text).toBe("Project: 5-page website for a bakery (Home, Menu, About).");
    expect(c[3].text).toBe("Excluded: online ordering, payment integration, blog, hosting management.");
    expect(splitClauses(contract)).toEqual(c);
    expect(splitClauses("   ")).toEqual([]);
  });
  it("asks as a question about the contract, with the clause-governs instruction", () => {
    const r = buildRerankRequest(splitClauses(contract), "add a blog");
    expect(r.query).toBe("Which clause of the contract governs this client request: add a blog");
    expect(r.instructions).toBe(RERANK_INSTRUCTIONS);
    expect(r.documents).toHaveLength(4);
  });
  it("picks the best clause with action use, or reports that no clause covers the request", () => {
    const clauses = splitClauses(contract);
    const res = (results: any[]) => ({ model: "m", results });
    const use = pickGoverning(res([{ index: 3, id: "c4", action: "use", relevance_score: 0.98, document_score: 1, levels: {} }, { index: 1, id: "c2", action: "skip", reason: "unrelated", relevance_score: 0.1, document_score: 0.1, levels: {} }]), clauses);
    expect(use).toMatchObject({ clauseId: "c4", relevance: 0.98 });
    expect(use.text).toContain("Excluded");
    expect(pickGoverning(res([{ index: 1, id: "c2", action: "skip", reason: "unrelated", relevance_score: 0.2, document_score: 0.2, levels: {} }]), clauses)).toEqual({ clauseId: null, text: null, relevance: 0 });
    expect(pickGoverning(res([]), clauses).clauseId).toBeNull();
  });
  it("runGoverning stores the clause and counts the credits; a failure leaves a visible failed state", async () => {
    const a = blankAnalysis();
    const ok = mk({ rerank: () => ({ results: [{ index: 3, id: "c4", action: "use", relevance_score: 0.9, document_score: 0.9, levels: {} }] }) });
    const it = item();
    await runGoverning(a, it, inputs, ok, () => {});
    expect(it.governing).toMatchObject({ status: "done", clauseId: "c4" });
    expect(a.usage.rerank).toEqual({ calls: 1, credits: 3 });
    const bad = { call: () => Promise.reject(new Error("down")) } as unknown as ClockedClient;
    const it2 = item({ id: "2-0" });
    await runGoverning(a, it2, inputs, bad, () => {});
    expect(it2.governing?.status).toBe("failed");
  });
  it("passes the governing clause into Fill's instructions (so the message can cite the exclusion)", () => {
    const body = buildFillRequest("C", "t", "add a blog", { clause: { id: "c4", text: "Excluded: blog." } }).body as any;
    expect(body.instructions).toContain('Governing contract clause (c4): "Excluded: blog."');
    expect(body.instructions).toContain("say so briefly");
    expect((buildFillRequest("C", "t", "x").body as any).instructions).not.toContain("Governing contract clause");
  });
  it("runFill looks up the clause first when it is not known yet, then fills with it", async () => {
    const seen: any[] = [];
    const a = blankAnalysis();
    const client = mk({
      rerank: () => ({ results: [{ index: 3, id: "c4", action: "use", relevance_score: 0.9, document_score: 0.9, levels: {} }] }),
      fill: () => ({ fields: { category: { value: "new_feature", confidence: 1 }, unpaid_risk: { value: "High", confidence: 1 }, price_mentioned: { value: null, confidence: 1 }, change_order_message: { value: "Blog is excluded.", confidence: 1 }, next_step: { value: "Send a quote", confidence: 1 } } }),
      grounding: () => ({ claims: [] }),
    }, seen);
    const it = item({ governing: undefined });
    await runFill(a, it, inputs, client, () => {});
    expect(seen.map((s) => s.endpoint)).toEqual(["rerank", "fill", "grounding"]);
    expect(seen[1].body.instructions).toContain("Governing contract clause (c4)");
  });
});

describe("M11 Protect pack", () => {
  const response = { model: "m", entities: [{ type: "person", value: "Nila Rahman", start: 0, end: 11, confidence: 1 }, { type: "email", value: "n@example.com", start: 12, end: 25, confidence: 1 }], counts: { person: 1, email: 1 }, threshold: 0.5, anonymized_text: "<PERSON> <EMAIL>" };
  it("requests exactly the six kinds with the replace operator", () => {
    expect(buildPiiRequest("x")).toEqual({ text: "x", entities: ["person", "email", "phone", "address", "bank_account", "credit_card"], anonymize: "replace" });
    expect(PII_ENTITIES).toHaveLength(6);
  });
  it("keeps the masked text and counts, and never stores the original sensitive values", () => {
    const pack = toPack(response, "Nila Rahman n@example.com");
    expect(pack).toMatchObject({ status: "done", maskedText: "<PERSON> <EMAIL>", counts: { person: 1, email: 1 }, text: "Nila Rahman n@example.com" });
    expect(JSON.stringify(pack)).not.toContain("value");
    expect(JSON.stringify(pack.counts)).not.toContain("Rahman");
  });
  it("describes findings by kind, including the empty case", () => {
    expect(describeCounts({ person: 2, email: 1 })).toBe("3 items (person 2, email 1)");
    expect(describeCounts({ bank_account: 1 })).toBe("1 item (bank account 1)");
    expect(describeCounts({})).toBe("0 items");
    expect(describeCounts(undefined)).toBe("0 items");
  });
  it("runProtect never alters the original pack text and counts credits; failures are visible", async () => {
    const a = blankAnalysis();
    const original = "Pay Nila Rahman at n@example.com";
    await runProtect(a, "1-0", original, mk({ pii: () => response }), () => {});
    expect(a.packs!["1-0"].text).toBe(original);
    expect(a.packs!["1-0"].maskedText).toBe("<PERSON> <EMAIL>");
    expect(a.usage.pii.credits).toBe(3);
    await runProtect(a, "2-0", original, { call: () => Promise.reject(new Error("402")) } as unknown as ClockedClient, () => {});
    expect(a.packs!["2-0"].status).toBe("failed");
  });
  it("assembles the pack from what the analysis holds: request, verdict, sentence, clause, draft, and the estimate caveat", () => {
    const a = blankAnalysis();
    const it = item({ evidence: { start: msgs[1].start + 7, end: msgs[1].start + 17 }, governing: { status: "done", clauseId: "c4", text: "Excluded: blog.", relevance: 0.98 }, changeOrder: { status: "done", regenerated: false, data: { category: null, unpaidRisk: null, priceMentioned: null, priceEvidence: null, message: "The blog is excluded.", nextStep: "Send Nila a quote.", inventedMessage: [], inventedNextStep: [], usage: null } } });
    const text = buildPackText(a, it, inputs);
    expect(text).toContain("Request: add a blog");
    expect(text).toContain("Needs change order. Outside the contract 99%, agreed to pay 0%, later withdrawn 0%.");
    expect(text).toContain("Client's sentence (Nila, message 2): “add a blog”");
    expect(text).toContain("Governing clause (c4, model estimate 98%): “Excluded: blog.”");
    expect(text).toContain("Draft message to the client (AI-generated draft):\nThe blog is excluded.");
    expect(text).toContain("Model judgments above are estimates, not facts.");
  });
});

describe("M12 promise check", () => {
  const input = buildPromiseInput(msgs);
  it("builds a 'your_messages' document from the freelancer's messages only, with an offset table", () => {
    expect(input.text).toBe(msgs.filter((m) => !m.isClient).map((m) => m.text).join("\n\n"));
    expect(input.text).not.toContain("please add a blog");
    for (const p of input.parts) expect(sliceCp(input.text, p.start, p.end)).toBe(msgs[p.messageIndex].text);
    const req = buildPromiseRequest(contract, input) as any;
    expect(req.documents.map((d: any) => d.id)).toEqual(["contract", "your_messages"]);
    expect(req.instructions).toContain("offering excluded work at no cost");
    expect(req.instructions).toContain("is not a conflict");
  });
  it("maps passages back to one thread span per freelancer message (never covering the client's messages in between)", () => {
    const q = input.text; // the whole document
    const spans = mapYoursToThread(input, 0, cpLength(q));
    expect(spans).toHaveLength(3);
    spans.forEach((sp, i) => expect(sliceCp(thread, sp.start, sp.end)).toBe(msgs.filter((m) => !m.isClient)[i].text));
  });
  it("keeps only findings whose quotes reproduce from the offsets, and ignores unrelated pairs", () => {
    const exclusion = "Excluded: online ordering, payment integration, blog, hosting management.";
    const cs = Array.from(contract.slice(0, contract.indexOf(exclusion))).length;
    const youQ = "Sure, the blog is no extra cost.";
    const ys = Array.from(input.text.slice(0, input.text.indexOf(youQ))).length;
    const ok = { model: "m", verdict: "conflicts", threshold: 0.5, pairs: [{ a: "contract", b: "your_messages", relation: "conflicting", related: 0.9, duplicates: [], conflicts: [{ kind: "rule_or_condition", confidence: 0.98, a: { document: "contract", quote: exclusion, start: cs, end: cs + cpLength(exclusion), confidence: 1 }, b: { document: "your_messages", quote: youQ, start: ys, end: ys + cpLength(youQ), confidence: 1 } }, { kind: "value", a: { document: "contract", quote: "wrong", start: 0, end: 5, confidence: 1 }, b: { document: "your_messages", quote: "also wrong", start: 0, end: 3, confidence: 1 } }] }] };
    const out = toConflicts(ok as any, contract, input);
    expect(out).toHaveLength(1);
    expect(out[0].contract.quote).toBe(exclusion);
    expect(sliceCp(thread, out[0].yours.spans[0].start, out[0].yours.spans[0].end)).toBe(youQ);
    expect(out[0].yours.messageIndex).toBe(2);
    expect(toConflicts({ model: "m", verdict: "clean", threshold: 0.5, pairs: [] } as any, contract, input)).toEqual([]);
  });
  it("runPromiseCheck runs one Compare call, counts credits, and is skipped without freelancer messages", async () => {
    const seen: any[] = [];
    const a = blankAnalysis();
    await runPromiseCheck(a, inputs, mk({ compare: () => ({ model: "m", verdict: "clean", threshold: 0.5, pairs: [] }) }, seen), () => {});
    expect(seen).toHaveLength(1);
    expect(a.promiseCheck).toEqual({ status: "done", conflicts: [] });
    expect(a.usage.compare.credits).toBe(3);
    const clientOnly = { ...blankAnalysis(), messages: parseThread("Nila: hi", "Nila") };
    const seen2: any[] = [];
    await runPromiseCheck(clientOnly, inputs, mk({}, seen2), () => {});
    expect(seen2).toHaveLength(0);
    expect(clientOnly.promiseCheck).toBeUndefined();
    const failing = blankAnalysis();
    await runPromiseCheck(failing, inputs, { call: () => Promise.reject(new Error("429")) } as unknown as ClockedClient, () => {});
    expect(failing.promiseCheck?.status).toBe("failed");
  });
});
