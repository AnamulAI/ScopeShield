// Runs evals/golden.json against the LIVE API through the same client. Needs `npm run pages:dev` running.
// Prints per-case pass/fail, per-endpoint credits and total credits; writes docs/eval-results.md.
import { readFileSync, writeFileSync } from "node:fs";
import { createClockedClient } from "../src/lib/clocked";
import { inventedAmounts } from "../src/lib/checks";
import { decideRequest, extractMessage, fillChangeOrder } from "../src/lib/pipeline";
import { parseThread, sliceCp } from "../src/lib/thread";

const BASE = process.env.EVAL_BASE_URL ?? "http://localhost:8788";
const golden = JSON.parse(readFileSync("evals/golden.json", "utf8"));
const client = createClockedClient({ baseUrl: BASE });
const credits = { extract: 0, decide: 0, fill: 0 };
const calls = { extract: 0, decide: 0, fill: 0 };
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
      return { ...base, pass: fails.length === 0, detail: fails.join("; ") || `outside ${verdict.outside.toFixed(3)}, paid ${verdict.paid.toFixed(3)}, kind ${verdict.kind}` };
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
    // fill
    const co = await fillChangeOrder(client, { contract: golden.contract, thread: c.thread, clientName: "Client" }, c.request);
    track("fill", co.usage);
    const fails: string[] = [];
    const gen = `${co.message ?? ""}\n${co.nextStep ?? ""}`;
    const e = c.expect;
    for (const w of e.mustMention ?? []) if (!(co.message ?? "").toLowerCase().includes(w)) fails.push(`message does not mention "${w}"`);
    for (const w of e.mustNotMention ?? []) if ((co.message ?? "").toLowerCase().includes(w)) fails.push(`message mentions other request "${w}"`);
    if (e.priceNull && co.priceMentioned !== null) fails.push(`price_mentioned should be null, got "${co.priceMentioned}"`);
    if (e.priceContains && !(co.priceMentioned ?? "").includes(e.priceContains)) fails.push(`price_mentioned "${co.priceMentioned}" lacks ${e.priceContains}`);
    const invented = inventedAmounts(gen, `${golden.contract}\n${c.thread}`);
    if (invented.length) fails.push(`invented amount(s): ${invented.join(", ")}`);
    return { ...base, pass: fails.length === 0, detail: fails.join("; ") || `price=${co.priceMentioned ?? "null"}; msg="${(co.message ?? "").slice(0, 90)}…"` };
  } catch (e) {
    return { ...base, pass: false, detail: `ERROR ${(e as Error).message}` };
  }
}

const results = await Promise.all(golden.cases.map(runCase)); // client caps concurrency at 3
const passed = results.filter((r) => r.pass).length;
const total = credits.extract + credits.decide + credits.fill;
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
  `| **Total** | ${calls.extract + calls.decide + calls.fill} | **${total}** |`,
  ``,
].join("\n");
writeFileSync("docs/eval-results.md", md);
console.log(md);
process.exit(passed === results.length ? 0 : 1);
