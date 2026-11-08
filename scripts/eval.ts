// Runs evals/golden.json against the LIVE API through the same client. Needs `npm run pages:dev` running.
// Prints per-case pass/fail, per-endpoint credits and total credits; writes docs/eval-results.md.
import { readFileSync, writeFileSync } from "node:fs";
import { createClockedClient } from "../src/lib/clocked";
import { inventedAmounts } from "../src/lib/checks";
import type { CompareResponse, GuardResponse, PiiResponse, RerankResponse, VerifyResponse } from "../src/lib/clocked-types";
import { buildRerankRequest, pickGoverning, splitClauses } from "../src/lib/governing";
import { buildGuardInput, buildGuardRequest, mapGuardEvidence } from "../src/lib/guard";
import { buildPromiseInput, buildPromiseRequest, toConflicts } from "../src/lib/promise";
import { buildPiiRequest, toPack } from "../src/lib/protect";
import { decideRequest, extractMessage, fillChangeOrder } from "../src/lib/pipeline";
import { buildVerifyRequest } from "../src/lib/prompts";
import { toVerifiedClaims, countVerdicts } from "../src/lib/verify";
import { parseThread, sliceCp } from "../src/lib/thread";

const BASE = process.env.EVAL_BASE_URL ?? "http://localhost:8788";
const golden = JSON.parse(readFileSync("evals/golden.json", "utf8"));
const client = createClockedClient({ baseUrl: BASE });
const credits = { extract: 0, decide: 0, fill: 0, verify: 0, guard: 0, rerank: 0, pii: 0, compare: 0 };
const calls = { extract: 0, decide: 0, fill: 0, verify: 0, guard: 0, rerank: 0, pii: 0, compare: 0 };
const track = (ep: keyof typeof credits, u: { credits: number } | null) => ((credits[ep] += u?.credits ?? 0), calls[ep]++);

interface Result { id: string; kind: string; pass: boolean; detail: string }
const inRange = (v: number, r: { min?: number; max?: number }) => (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);
const fmtRange = (r: { min?: number; max?: number }) => `${r.min ?? 0}..${r.max ?? 1}`;

async function runCase(c: any): Promise<Result> {
  const base = { id: c.id, kind: c.kind };
  try {
    if (c.kind === "decide") {
      const { verdict, usage } = await decideRequest(client, { contract: golden.contract, thread: c.thread, clientName: "Client" }, c.request);
      track("decide", usage);
      const fails: string[] = [];
      if (c.expect.outside && !inRange(verdict.outside, c.expect.outside)) fails.push(`outside ${verdict.outside.toFixed(3)} not in ${fmtRange(c.expect.outside)}`);
      if (c.expect.paid && !inRange(verdict.paid, c.expect.paid)) fails.push(`paid ${verdict.paid.toFixed(3)} not in ${fmtRange(c.expect.paid)}`);
      if (c.expect.withdrawn && !inRange(verdict.withdrawn, c.expect.withdrawn)) fails.push(`withdrawn ${verdict.withdrawn.toFixed(3)} not in ${fmtRange(c.expect.withdrawn)}`);
      return { ...base, pass: fails.length === 0, detail: fails.join("; ") || `outside ${verdict.outside.toFixed(3)}, paid ${verdict.paid.toFixed(3)}, withdrawn ${verdict.withdrawn.toFixed(3)}, kind ${verdict.kind}` };
    }
    if (c.kind === "extract") {
      const msg = parseThread(`Client: ${c.message}`, "Client")[0];
      const { requests, usage } = await extractMessage(client, msg);
      track("extract", usage);
      const fails: string[] = [];
      const e = c.expect;
      if (e.minItems !== undefined && requests.length < e.minItems) fails.push(`${requests.length} items < ${e.minItems}`);
      if (e.maxItems !== undefined && requests.length > e.maxItems) fails.push(`${requests.length} items > ${e.maxItems}`);
      for (const w of e.contains ?? []) if (!requests.some((r) => r.text.toLowerCase().includes(w))) fails.push(`no item contains "${w}"`);
      const thread = `Client: ${c.message}`;
      for (const r of requests) if (!r.evidence || sliceCp(thread, r.evidence.start, r.evidence.end) !== r.text) fails.push(`evidence offset mismatch for "${r.text}"`);
      return { ...base, pass: fails.length === 0, detail: fails.join("; ") || `${requests.length} item(s): ${requests.map((r) => `"${r.text}"`).join(", ")}` };
    }
    if (c.kind === "verify") {
      // The wrong-claim messages are TEST-ONLY strings; they are never shown in the UI.
      const { data, usage } = await client.call<VerifyResponse>("grounding", buildVerifyRequest(golden.contract, c.thread, c.message));
      track("verify", usage);
      const n = countVerdicts(toVerifiedClaims(data.claims, { contract: golden.contract, thread: c.thread }, sliceCp));
      const fails: string[] = [];
      if (c.expect.minFlagged !== undefined && n.contradicted + n.notStated < c.expect.minFlagged) fails.push(`flagged ${n.contradicted + n.notStated} claims, expected at least ${c.expect.minFlagged}`);
      if (c.expect.maxContradicted !== undefined && n.contradicted > c.expect.maxContradicted) fails.push(`${n.contradicted} contradicted, expected at most ${c.expect.maxContradicted}`);
      return { ...base, pass: fails.length === 0, detail: fails.join("; ") || `supported ${n.supported}, not stated ${n.notStated}, contradicted ${n.contradicted}` };
    }
    if (c.kind === "guard") {
      const msgs = c.messages.map((text: string, i: number) => ({ index: i, speaker: "Client", isClient: true, text, start: 0, end: 0 }));
      const input = buildGuardInput(msgs);
      const { data, usage } = await client.call<GuardResponse>("injection", buildGuardRequest(input));
      track("guard", usage);
      const flagged = data.verdict === "injection";
      const mapped = mapGuardEvidence(input, data.evidence ?? []);
      const fails: string[] = [];
      if (flagged !== c.expect.flagged) fails.push(`flagged=${flagged} (injection ${data.injection.toFixed(3)}), expected ${c.expect.flagged}`);
      if (c.expect.flagged && mapped.flags.length === 0) fails.push("flagged but no message could be located");
      return { ...base, pass: fails.length === 0, detail: fails.join("; ") || `injection ${data.injection.toFixed(3)} (${data.verdict}), flagged messages: ${mapped.flags.map((f) => f.messageIndex).join(",") || "none"}` };
    }
    if (c.kind === "rerank") {
      const clauses = splitClauses(golden.contract);
      const { data, usage } = await client.call<RerankResponse>("rerank", buildRerankRequest(clauses, c.request));
      track("rerank", usage);
      const pick = pickGoverning(data, clauses);
      const fails: string[] = [];
      if (c.expect.clauseContains && !(pick.text ?? "").includes(c.expect.clauseContains)) fails.push(`governing clause is ${pick.clauseId ?? "none"}: "${pick.text ?? ""}"`);
      if (c.expect.clauseNotContains && (pick.text ?? "").includes(c.expect.clauseNotContains)) fails.push(`governing clause should not contain "${c.expect.clauseNotContains}": "${pick.text}"`);
      return { ...base, pass: fails.length === 0, detail: fails.join("; ") || `${pick.clauseId ?? "none"} (${Math.round(pick.relevance * 100)}%) ${pick.text ? `"${pick.text.slice(0, 60)}"` : "no clause covers it"}` };
    }
    if (c.kind === "pii") {
      const { data, usage } = await client.call<PiiResponse>("pii", buildPiiRequest(c.text));
      track("pii", usage);
      const pack = toPack(data, c.text);
      const n = Object.values(pack.counts ?? {}).reduce((t, x) => t + x, 0);
      const fails: string[] = [];
      if (c.expect.minFindings !== undefined && n < c.expect.minFindings) fails.push(`${n} findings < ${c.expect.minFindings}`);
      if (c.expect.maxFindings !== undefined && n > c.expect.maxFindings) fails.push(`${n} findings > ${c.expect.maxFindings}`);
      for (const w of c.expect.maskedMustNotContain ?? []) if ((pack.maskedText ?? "").includes(w)) fails.push(`masked text still contains "${w}"`);
      if (c.expect.maxFindings === 0 && pack.maskedText !== c.text) fails.push("text changed although nothing was found");
      return { ...base, pass: fails.length === 0, detail: fails.join("; ") || `${n} finding(s) ${JSON.stringify(pack.counts)}; masked: "${(pack.maskedText ?? "").slice(0, 70)}"` };
    }
    if (c.kind === "compare") {
      const msgs = c.messages.map((text: string, i: number) => ({ index: i, speaker: "You", isClient: false, text, start: 0, end: 0 }));
      const input = buildPromiseInput(msgs);
      const { data, usage } = await client.call<CompareResponse>("compare", buildPromiseRequest(golden.contract, input));
      track("compare", usage);
      const conflicts = toConflicts(data, golden.contract, input);
      const fails: string[] = [];
      if (c.expect.minConflicts !== undefined && conflicts.length < c.expect.minConflicts) fails.push(`${conflicts.length} conflicts < ${c.expect.minConflicts}`);
      if (c.expect.maxConflicts !== undefined && conflicts.length > c.expect.maxConflicts) fails.push(`${conflicts.length} conflicts > ${c.expect.maxConflicts}: "${conflicts[0]?.yours.quote}"`);
      return { ...base, pass: fails.length === 0, detail: fails.join("; ") || `${conflicts.length} possible conflict(s)${conflicts[0] ? `: "${conflicts[0].yours.quote.slice(0, 60)}"` : ""}` };
    }
    // fill
    const co = await fillChangeOrder(client, { contract: golden.contract, thread: c.thread, clientName: "Client" }, c.request, false, { effortScore: c.effortScore ?? 2, agreed: c.agreed ?? false });
    track("fill", co.usage);
    const fails: string[] = [];
    const gen = `${co.message ?? ""}\n${co.nextStep ?? ""}`;
    const e = c.expect;
    for (const w of e.mustMention ?? []) if (!(co.message ?? "").toLowerCase().includes(w)) fails.push(`message does not mention "${w}"`);
    for (const w of e.mustNotMention ?? []) if ((co.message ?? "").toLowerCase().includes(w)) fails.push(`message mentions other request "${w}"`);
    if (e.priceNull && co.priceMentioned !== null) fails.push(`price_mentioned should be null, got "${co.priceMentioned}"`);
    if (e.priceContains && !(co.priceMentioned ?? "").includes(e.priceContains)) fails.push(`price_mentioned "${co.priceMentioned}" lacks ${e.priceContains}`);
    if (e.riskNot && co.unpaidRisk && e.riskNot.includes(co.unpaidRisk)) fails.push(`unpaid_risk is ${co.unpaidRisk} (effort ${c.effortScore ?? 2}, agreement ${c.agreed ?? false})`);
    // Rubric checks applied to every Fill case.
    const msg = co.message ?? "";
    const words = msg.trim().split(/\s+/).filter(Boolean).length;
    if (words > 70) fails.push(`message has ${words} words (max 70)`);
    if (!/outside|beyond|not (part of|included|covered)|isn.t (part of|included|covered)|separate/i.test(msg)) fails.push("message does not say the request is outside the agreement");
    if (!/confirm|let me know|proceed|go ahead|approv|agree to|before (any |I |we )?(work|start|begin)/i.test(msg)) fails.push("message does not ask the client to confirm before work starts");
    if (/(delivered?|ready|done|finished|completed?) (by|on|within|in) /i.test(msg) || /\b(tomorrow|next week|by (monday|tuesday|wednesday|thursday|friday))\b/i.test(msg)) fails.push("message may promise a delivery date");
    if (/\bI can certainly\b/i.test(msg)) fails.push('message says "I can certainly"');
    const ns = co.nextStep ?? "";
    if (/^(the|i|we|he|she|they|it)\b/i.test(ns.trim())) fails.push(`next step is not imperative: "${ns}"`);
    if (/will be confirmed/i.test(ns)) fails.push("next step is vague (\"will be confirmed\")");
    const invented = inventedAmounts(gen, `${golden.contract}\n${c.thread}`);
    if (invented.length) fails.push(`invented amount(s): ${invented.join(", ")}`);
    return { ...base, pass: fails.length === 0, detail: fails.join("; ") || `price=${co.priceMentioned ?? "null"}; msg="${(co.message ?? "").slice(0, 90)}…"` };
  } catch (e) {
    return { ...base, pass: false, detail: `ERROR ${(e as Error).message}` };
  }
}

const results = await Promise.all(golden.cases.map(runCase)); // client caps concurrency at 3
const passed = results.filter((r) => r.pass).length;
const total = Object.values(credits).reduce((t, x) => t + x, 0);
const date = new Date().toISOString().slice(0, 10);
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

const md = [
  `# Eval results`,
  ``,
  `Run on ${date} against the live Clocked API (\`npm run eval\`). Cases: \`evals/golden.json\`. Real numbers only.`,
  ``,
  `**${passed}/${results.length} cases passed.**`,
  ``,
  `| Case | Endpoint | Result | Detail |`,
  `|---|---|---|---|`,
  ...results.map((r) => `| ${r.id} | ${r.kind} | ${r.pass ? "PASS" : "FAIL"} | ${esc(r.detail)} |`),
  ``,
  `## Credits used by this eval run`,
  ``,
  `| Endpoint | Calls | Credits |`,
  `|---|---|---|`,
  `| extract | ${calls.extract} | ${credits.extract} |`,
  `| decide | ${calls.decide} | ${credits.decide} |`,
  `| fill | ${calls.fill} | ${credits.fill} |`,
  `| verify | ${calls.verify} | ${credits.verify} |`,
  `| guard | ${calls.guard} | ${credits.guard} |`,
  `| rerank | ${calls.rerank} | ${credits.rerank} |`,
  `| pii | ${calls.pii} | ${credits.pii} |`,
  `| compare | ${calls.compare} | ${credits.compare} |`,
  `| **Total** | ${Object.values(calls).reduce((t, x) => t + x, 0)} | **${total}** |`,
  ``,
].join("\n") + "\n" + readFileSync("docs/eval-notes.md", "utf8");
writeFileSync("docs/eval-results.md", md);
console.log(md);
process.exit(passed === results.length ? 0 : 1);
