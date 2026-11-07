// Records REAL results of the full pipeline for the sample threads into public/demo/*.json (+ docs/credit-usage.md).
// Needs `npm run pages:dev` running with a valid key. Spends credits: about 40-90 per sample. Keeps whatever comes back.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClockedClient } from "../src/lib/clocked";
import type { Snapshot } from "../src/lib/demo";
import { analyze, runFill, totalCredits } from "../src/lib/pipeline";
import { effectiveQueue } from "../src/lib/routing";
import { SAMPLES } from "../src/lib/samples";

const client = createClockedClient({ baseUrl: process.env.EVAL_BASE_URL ?? "http://localhost:8788" });
const only = process.argv[2];
const date = new Date().toISOString().slice(0, 10);
mkdirSync("public/demo", { recursive: true });

const rows: string[] = [];
const index: Array<{ id: string; title: string; blurb: string; recordedAt: string }> = [];

for (const s of SAMPLES.filter((x) => !only || x.id === only)) {
  const inputs = { contract: s.contract, thread: s.thread, clientName: s.clientName };
  const a = await analyze(inputs, client);
  // Fill for NEEDS CHANGE ORDER items, and for ASK ME items so the "Extra work" path also works offline. Never for WITHDRAWN.
  const fillable = a.items.filter((i) => i.status === "done" && ["needs_change_order", "ask_me"].includes(effectiveQueue(i.route, i.decision)));
  await Promise.all(fillable.map((i) => runFill(a, i, inputs, client, () => {})));
  const credits = { extract: a.usage.extract.credits, decide: a.usage.decide.credits, fill: a.usage.fill.credits, total: totalCredits(a.usage) };
  const snap: Snapshot = { id: s.id, title: s.title, recordedAt: date, credits, inputs, analysis: a };
  writeFileSync(`public/demo/${s.id}.json`, JSON.stringify(snap));
  const failed = a.items.filter((i) => i.status === "failed").length + a.messageStates.filter((m) => m.status === "failed").length;
  console.log(`\n== ${s.title}: ${a.messages.length} msgs, ${a.messageStates.length} client msgs, ${a.items.length} requests, ${credits.total} credits (failed steps: ${failed})`);
  for (const i of a.items) console.log(`  [${i.route?.queue ?? i.status}] ${i.text}  (outside ${i.verdict?.outside.toFixed(2)}, paid ${i.verdict?.paid.toFixed(2)}, withdrawn ${i.verdict?.withdrawn.toFixed(2)})`);
  rows.push(`| ${s.title} | ${a.messages.length} / ${a.messageStates.length} | ${a.items.length} | ${a.usage.extract.calls} / ${credits.extract} | ${a.usage.decide.calls} / ${credits.decide} | ${a.usage.fill.calls} / ${credits.fill} | **${credits.total}** |`);
  index.push({ id: s.id, title: s.title, blurb: s.blurb, recordedAt: date });
}

if (!only) {
  writeFileSync("public/demo/index.json", JSON.stringify(index));
  writeFileSync(
    "docs/credit-usage.md",
    [
      `# Credit usage per analysis`,
      ``,
      `Measured on ${date} from \`X-Clocked-Credits\` while recording the three demo samples (\`npm run snapshot\`). Calls / credits per endpoint.`,
      `Each run = Extract per client message + Decide per request + Extract for the agreement/withdrawal sentence of AGREED EXTRA and WITHDRAWN items (counted under Extract) + Fill per NEEDS CHANGE ORDER and ASK ME item (Fill is on demand in the live app; the recording prepares all of them).`,
      ``,
      `| Sample | Messages / client messages | Requests | Extract (calls / credits) | Decide | Fill | Total credits |`,
      `|---|---|---|---|---|---|---|`,
      ...rows,
      ``,
    ].join("\n"),
  );
}
