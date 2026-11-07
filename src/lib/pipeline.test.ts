import { describe, expect, it } from "vitest";
import type { ClockedClient } from "./clocked";
import { analyze, parseVerdict } from "./pipeline";
import { buildFillRequest } from "./prompts";
import { sliceCp } from "./thread";

const thread = "Dev: Hi 😀\nClient: Please add a blog 📝 and change the banner\nDev: ok\nClient: thanks!";

function mockClient(): { client: ClockedClient; calls: string[] } {
  const calls: string[] = [];
  const client = {
    async call(endpoint: string, body: any) {
      calls.push(endpoint);
      if (endpoint === "extract") {
        const t: string = body.text;
        const items = [] as any[];
        for (const q of ["add a blog 📝", "change the banner"]) {
          const i = t.indexOf(q);
          if (i >= 0) {
            const start = Array.from(t.slice(0, i)).length;
            items.push({ value: q, start, end: start + Array.from(q).length, confidence: 1 });
          }
        }
        return { data: { fields: { client_requests: { value: items.map((x) => x.value), items, confidence: 1 } } }, usage: { credits: 5, costUsd: 0, modelMs: 0 }, attempts: 1 };
      }
      const blog = body.state.endsWith("add a blog 📝");
      return {
        data: { answers: { outside_contract: { type: "noul", noul: blog ? 0.95 : 0.05 }, paid_agreement: { type: "noul", noul: 0.01 }, withdrawn: { type: "noul", noul: 0.01 }, kind: { type: "choice", choice: "x", probabilities: {}, confidence: 1 }, effort: { type: "score", score: 1.2, legend: {}, probabilities: {}, confidence: 1 } } },
        usage: { credits: 1, costUsd: 0, modelMs: 0 },
        attempts: 1,
      };
    },
  } as unknown as ClockedClient;
  return { client, calls };
}

describe("analyze", () => {
  it("extracts only from client messages, maps evidence to thread offsets, routes, and counts credits", async () => {
    const { client, calls } = mockClient();
    const a = await analyze({ contract: "5 pages", thread, clientName: "client" }, client);
    expect(calls.filter((c) => c === "extract")).toHaveLength(2); // two client messages, developer skipped
    expect(a.items).toHaveLength(2);
    const blog = a.items.find((i) => i.text.includes("blog"))!;
    expect(sliceCp(thread, blog.evidence!.start, blog.evidence!.end)).toBe("add a blog 📝");
    expect(blog.route?.queue).toBe("needs_change_order");
    expect(a.items.find((i) => i.text.includes("banner"))!.route?.queue).toBe("in_scope");
    expect(a.messageStates.find((m) => m.requestCount === 0)).toBeTruthy(); // "thanks!" => no actionable request, shown explicitly
    expect(a.usage.extract.credits).toBe(10);
    expect(a.usage.decide.credits).toBe(2);
  });
  it("keeps partial results when a call fails", async () => {
    const { client } = mockClient();
    const failing = { call: (ep: string, b: unknown) => (ep === "decide" && (b as any).state?.endsWith("change the banner") ? Promise.reject(new Error("boom")) : (client as any).call(ep, b)) } as unknown as ClockedClient;
    const a = await analyze({ contract: "c", thread, clientName: "Client" }, failing);
    expect(a.items.map((i) => i.status).sort()).toEqual(["done", "failed"]);
  });
});

describe("parseVerdict", () => {
  it("rejects an unexpected shape", () => {
    expect(() => parseVerdict({ model: "m", answers: {} })).toThrow();
  });
});

describe("buildFillRequest", () => {
  const req = "add Google Analytics";
  const { body, threadOffset } = buildFillRequest("C", "Client: hi 😀", req) as any;
  it("has no request field, keeps full thread, anchors every field and ends with the request line", () => {
    expect(body.fields.request).toBeUndefined();
    expect(body.text.endsWith(`REQUEST TO FILL: ${req}`)).toBe(true);
    expect(body.text).toContain("Client: hi 😀");
    for (const k of ["price_mentioned", "unpaid_risk", "change_order_message", "next_step"]) expect(body.fields[k].description).toContain(req);
    expect(body.fields.price_mentioned.infer).toBe(false);
    expect(body.fields.change_order_message.max_tokens).toBe(120);
    expect(body.fields.next_step.max_tokens).toBe(60);
  });
  it("threadOffset points at the thread start in code points", () => {
    expect(sliceCp(body.text, threadOffset, threadOffset + 12)).toBe("Client: hi 😀");
  });
});

import { runDecide, emptyUsage, type Analysis, type RequestItem } from "./pipeline";
describe("runDecide retry", () => {
  it("recovers a failed item on the second try and keeps the error info on failure", async () => {
    const a: Analysis = { messages: [], messageStates: [], items: [], usage: emptyUsage() };
    const item: RequestItem = { id: "1-0", messageIndex: 1, text: "x", evidence: null, status: "failed", error: "old" };
    const bad = { call: () => Promise.reject(new Error("down")) } as unknown as ClockedClient;
    await runDecide(a, item, { contract: "c", thread: "t", clientName: "n" }, bad, () => {});
    expect(item.status).toBe("failed");
    expect(item.error).toBe("down");
    const { client } = mockClient();
    await runDecide(a, item, { contract: "c", thread: "t", clientName: "n" }, client, () => {});
    expect(item.status).toBe("done");
    expect(item.error).toBeUndefined();
    expect(item.route?.queue).toBeDefined();
  });
});

import { changeOrderText, copyBlocked, runFill, runSupport } from "./pipeline";
import { createClockedClient } from "./clocked";

const fillRes = (message: string, price: unknown = { value: null, confidence: 1 }) => ({
  fields: { category: { value: "new_feature", confidence: 1 }, unpaid_risk: { value: "High", confidence: 1 }, price_mentioned: price, change_order_message: { value: message, confidence: 1, source: "generated" }, next_step: { value: "Wait for the client's answer.", confidence: 1, source: "generated" } },
});
const clientFor = (responses: unknown[], seen: any[] = []) =>
  createClockedClient({
    fetchImpl: (async (_u: any, init: any) => {
      seen.push(JSON.parse(init.body));
      return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "x-clocked-credits": "8" } });
    }) as unknown as typeof fetch,
  });
const verifyOk = { claims: [{ claim: "A blog is extra.", kind: "claim", verdict: "supported", supported: 0.9, contradicted: 0, not_stated: 0, source: "thread" }] };
const inputs = { contract: "Fixed price $800", thread: "Client: Please add a blog.\nDev: A blog is extra.", clientName: "Client" };
const blank = (): { a: Analysis; item: RequestItem } => ({ a: { messages: [], messageStates: [], items: [], usage: emptyUsage() }, item: { id: "0-0", messageIndex: 0, text: "add a blog", evidence: null, status: "done" } });

describe("runFill guard", () => {
  it("blocks Copy on an invented amount, allows exactly ONE strict Regenerate, then stays blocked if still invented", async () => {
    const seen: any[] = [];
    const client = clientFor([fillRes("That will be $250."), verifyOk, fillRes("Still $300 for this."), verifyOk, fillRes("never used")], seen);
    const { a, item } = blank();
    await runFill(a, item, inputs, client, () => {});
    expect(item.changeOrder!.data!.inventedMessage).toEqual(["$250"]);
    expect(copyBlocked(item.changeOrder!.data!)).toBe(true);
    await runFill(a, item, inputs, client, () => {}, true);
    expect(seen[2].instructions).toContain("Do not write any currency amount");
    expect(copyBlocked(item.changeOrder!.data!)).toBe(true);
    expect(item.changeOrder!.regenerated).toBe(true);
    await runFill(a, item, inputs, client, () => {}, true); // second Regenerate is refused
    expect(seen).toHaveLength(4); // fill, verify, fill, verify
    expect(a.usage.fill.credits).toBe(16);
  });
  it("allows Copy when amounts come from the thread or contract, and when none are present", async () => {
    const client = clientFor([fillRes("As agreed, the base is $800; the price will be confirmed.")]);
    const { a, item } = blank();
    await runFill(a, item, inputs, client, () => {});
    expect(copyBlocked(item.changeOrder!.data!)).toBe(false);
  });
  it("maps a quoted price back to the thread and verifies it", async () => {
    const thread = "Client: Bengali please\nDev: It would be $150 extra.";
    const client = clientFor([]);
    const { buildFillRequest } = await import("./prompts");
    const { threadOffset } = buildFillRequest(inputs.contract, thread, "x");
    const start = Array.from(thread).join("").indexOf("$150");
    const c2 = clientFor([fillRes("Msg", { value: "$150", start: threadOffset + start, end: threadOffset + start + 4, confidence: 1 })]);
    const { a, item } = blank();
    await runFill(a, item, { ...inputs, thread }, c2, () => {});
    expect(item.changeOrder!.data!.priceMentioned).toBe("$150");
    expect(item.changeOrder!.data!.priceEvidence).toEqual({ start, end: start + 4 });
    void client;
  });
  it("shows a failed Fill with its error", async () => {
    const bad = createClockedClient({ fetchImpl: (async () => new Response("{}", { status: 402 })) as unknown as typeof fetch });
    const { a, item } = blank();
    await runFill(a, item, inputs, bad, () => {});
    expect(item.changeOrder).toMatchObject({ status: "failed", errorKind: "credits" });
  });
});

describe("changeOrderText", () => {
  it("labels generated parts and states when no price was quoted", () => {
    const t = changeOrderText("add a blog", { category: "new_feature", unpaidRisk: "High", priceMentioned: null, priceEvidence: null, message: "Hi", nextStep: "Wait", inventedMessage: [], inventedNextStep: [], usage: null });
    expect(t).toContain("Price: No price was quoted in this thread");
    expect(t).toContain("Message to client (AI-generated draft):");
    expect(t).toContain("Category: new feature");
  });
});

describe("runSupport", () => {
  const thread = "Client: Can you add Bengali?\nDev: $150 extra, proceed?\nClient: Sounds good 😀, go ahead!";
  it("locates the agreement sentence by code points and rejects offsets that do not match", async () => {
    const q = "Sounds good 😀, go ahead!";
    const start = Array.from(thread).join("").indexOf(q) === -1 ? 0 : Array.from(thread.slice(0, thread.indexOf(q))).length;
    const ok = clientFor([{ fields: { support: { value: q, start, end: start + Array.from(q).length, confidence: 1 } } }]);
    const { a, item } = blank();
    item.route = { queue: "agreed_extra", reason: "" };
    await runSupport(a, item, { ...inputs, thread }, ok, () => {});
    expect(item.support).toMatchObject({ kind: "agreement", status: "done", text: q });
    expect(item.support!.evidence).toEqual({ start, end: start + Array.from(q).length });
    const wrong = clientFor([{ fields: { support: { value: q, start: 0, end: 5, confidence: 1 } } }]);
    const b = blank();
    b.item.route = { queue: "withdrawn", reason: "" };
    await runSupport(b.a, b.item, { ...inputs, thread }, wrong, () => {});
    expect(b.item.support).toMatchObject({ kind: "withdrawal", status: "done", evidence: null });
  });
  it("reports null when the model finds no sentence", async () => {
    const none = clientFor([{ fields: { support: { value: null, confidence: 1 } } }]);
    const { a, item } = blank();
    item.route = { queue: "agreed_extra", reason: "" };
    await runSupport(a, item, inputs, none, () => {});
    expect(item.support).toMatchObject({ status: "done", text: null, evidence: null });
  });
});

import { buildPriceRequest } from "./prompts";
import { runPrice } from "./pipeline";

describe("Fill rubrics and Decide context", () => {
  const withCtx = buildFillRequest("C", "Maya: hi", "add a blog", { clientName: "Maya", effort: "Large (a week or more)", agreed: false }).body as any;
  it("passes Decide's effort and agreement into the shared instructions", () => {
    expect(withCtx.instructions).toContain("Effort estimate from Decide: Large (a week or more). Agreement to pay found: no.");
    const yes = buildFillRequest("C", "t", "x", { effort: "Small (under a day)", agreed: true }).body as any;
    expect(yes.instructions).toContain("Agreement to pay found: yes.");
    expect((buildFillRequest("C", "t", "x").body as any).instructions).not.toContain("Effort estimate");
  });
  it("gives unpaid_risk an explicit rubric that forbids Low for large unpaid work", () => {
    const d = withCtx.fields.unpaid_risk.description as string;
    for (const w of ["Low =", "Medium =", "High =", "Critical =", "Never Low when the effort is Large"]) expect(d).toContain(w);
  });
  it("constrains the message (70 words, outside agreement, price quoted separately, confirm first) and the next step", () => {
    const m = withCtx.fields.change_order_message.description as string;
    for (const w of ["at most 70 words", "first person", "outside the current agreement", "quoted separately", "ONLY if one appears", "confirm before any work starts", "never promise delivery dates".replace("never", "Never")]) expect(m).toContain(w);
    const n = withCtx.fields.next_step.description as string;
    expect(n).toContain("imperative sentence");
    expect(n).toContain('Send Maya a quote for "add a blog" and wait for a written yes before starting.');
    expect(n).toContain("the price will be confirmed");
  });
  it("builds a price extract anchored to the request", () => {
    const r = buildPriceRequest("Dev: $120", "add an instagram feed");
    expect(r.fields.agreed_price.description).toContain("THIS request: add an instagram feed");
  });
});

describe("runPrice", () => {
  const thread = "Client: Instagram feed please\nDev: $120 for the feed widget\nClient: yes please go ahead";
  it("shows only what Extract returns, with verified evidence; null means none found", async () => {
    const q = "$120 for the feed widget";
    const start = Array.from(thread.slice(0, thread.indexOf(q))).length;
    const ok = clientFor([{ fields: { agreed_price: { value: q, start, end: start + Array.from(q).length, confidence: 1 } } }]);
    const { a, item } = blank();
    await runPrice(a, item, { ...inputs, thread }, ok, () => {});
    expect(item.agreedPrice).toMatchObject({ status: "done", value: q, evidence: { start, end: start + Array.from(q).length } });
    expect(a.usage.price.credits).toBe(8);
    const none = clientFor([{ fields: { agreed_price: { value: null, confidence: 1 } } }]);
    const b = blank();
    await runPrice(b.a, b.item, { ...inputs, thread }, none, () => {});
    expect(b.item.agreedPrice).toMatchObject({ status: "done", value: null, evidence: null });
  });
});

import { runVerify } from "./pipeline";
describe("runVerify", () => {
  const withDraft = () => {
    const { a, item } = blank();
    item.changeOrder = { status: "done", regenerated: false, data: { category: null, unpaidRisk: null, priceMentioned: null, priceEvidence: null, message: "A blog is extra.", nextStep: "Send a quote", inventedMessage: [], inventedNextStep: [], usage: null } };
    return { a, item };
  };
  it("sends two NAMED documents (contract, thread) and the message as the answer; stores claims and counts credits", async () => {
    const seen: any[] = [];
    const client = clientFor([{ claims: [{ claim: "A blog is extra.", kind: "claim", verdict: "contradicted", supported: 0, contradicted: 0.9, not_stated: 0, source: null }, { claim: "ask me", kind: "offer_or_question", verdict: "not_a_claim", supported: 0, contradicted: 0, not_stated: 0, source: null }] }], seen);
    const { a, item } = withDraft();
    await runVerify(a, item, inputs, client, () => {});
    expect(seen[0].documents).toEqual([{ id: "contract", text: inputs.contract }, { id: "thread", text: inputs.thread }]);
    expect(seen[0].answer).toBe("A blog is extra.");
    expect(item.changeOrder!.verify!.status).toBe("done");
    expect(item.changeOrder!.verify!.claims).toHaveLength(1);
    expect(a.usage.verify.credits).toBe(8);
  });
  it("a failed Verify marks the draft not verified without failing the change order", async () => {
    const bad = createClockedClient({ fetchImpl: (async () => new Response("{}", { status: 400 })) as unknown as typeof fetch });
    const { a, item } = withDraft();
    await runVerify(a, item, inputs, bad, () => {});
    expect(item.changeOrder!.status).toBe("done");
    expect(item.changeOrder!.verify!.status).toBe("failed");
  });
  it("does nothing when there is no generated message", async () => {
    const { a, item } = blank();
    await runVerify(a, item, inputs, clientFor([]), () => {});
    expect(item.changeOrder).toBeUndefined();
  });
});
