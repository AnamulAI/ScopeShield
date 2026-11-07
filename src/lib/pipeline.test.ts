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
    expect(body.fields.change_order_message.max_tokens).toBe(200);
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
