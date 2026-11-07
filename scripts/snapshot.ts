// Records REAL results of the pipeline for the sample threads into public/demo/*.json (+ docs/credit-usage.md).
// Needs `npm run pages:dev` running with a valid key. Spends credits. Keeps whatever comes back.
//   npm run snapshot                       full run for all samples (Extract, Decide, support/price lookups, Fill)
//   npm run snapshot -- --only fill,price  re-run ONLY the Fill calls and agreed-price extracts on the existing recordings
//   npm run snapshot -- bakery             full run for one sample id
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClockedClient } from "../src/lib/clocked";
import type { Snapshot } from "../src/lib/demo";
import { analyze, emptyUsage, runFill, runPrice, totalCredits, type Analysis } from "../src/lib/pipeline";
import { effectiveQueue } from "../src/lib/routing";
import { SAMPLES } from "../src/lib/samples";

const args = process.argv.slice(2);
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1]?.split(",").map((x) => x.trim())) : null;
const sampleId = args.find((a, i) => !a.startsWith("--") && i !== onlyIdx + 1);
if (only) for (const o of only) if (!["fill", "price"].includes(o)) throw new Error(`Unknown --only part "${o}" (use fill,price)`);

const client = createClockedClient({ baseUrl: process.env.EVAL_BASE_URL ?? "http://localhost:8788" });
const date = new Date().toISOString().slice(0, 10);
mkdirSync("public/demo", { recursive: true });

const FILLABLE = ["needs_change_order", "ask_me"]; // ASK ME items too, so "Extra work" also works offline. Never WITHDRAWN.
const fillables = (a: Analysis) => a.items.filter((i) => i.status === "done" && FILLABLE.includes(effectiveQueue(i.route, i.decision)));

const rows: string[] = [];
const index: Array<{ id: string; title: string; blurb: string; recordedAt: string }> = [];
let rerunCredits = 0;

for (const s of SAMPLES.filter((x) => !sampleId || x.id === sampleId)) {
  const inputs = { contract: s.contract, thread: s.thread, clientName: s.clientName };
  const file = `public/demo/${s.id}.json`;
  let a: Analysis;

  if (only) {
    if (!existsSync(file)) throw new Error(`${file} does not exist: run a full snapshot first`);
    const old: Snapshot = JSON.parse(readFileSync(file, "utf8"));
    a = old.analysis;
    a.usage = { ...emptyUsage(), ...a.usage };
    const before = totalCredits(a.usage);
    if (only.has("fill")) {
      a.usage.fill = { calls: 0, credits: 0 };
      for (const i of a.items) delete i.changeOrder;
      await Promise.all(fillables(a).map((i) => runFill(a, i, inputs, client, () => {})));
    }
    if (only.has("price")) {
      a.usage.price = { calls: 0, credits: 0 };
      for (const i of a.items) delete i.agreedPrice;
      await Promise.all(a.items.filter((i) => i.route?.queue === "agreed_extra").map((i) => runPrice(a, i, inputs, client, () => {})));
    }
    const spent = (only.has("fill") ? a.usage.fill.credits : 0) + (only.has("price") ? a.usage.price.credits : 0);
    rerunCredits += spent;
    console.log(`\n== ${s.title}: re-ran ${[...only].join("+")}, spent ${spent} credits (recorded total was ${before}, now ${totalCredits(a.usage)})`);
  } else {
    a = await analyze(inputs, client);
    await Promise.all(fillables(a).map((i) => runFill(a, i, inputs, client, () => {})));
    const failed = a.items.filter((i) => i.status === "failed").length + a.messageStates.filter((m) => m.status === "failed").length;
    console.log(`\n== ${s.title}: ${a.messages.length} msgs, ${a.items.length} requests, ${totalCredits(a.usage)} credits (failed steps: ${failed})`);
  }

  const u = a.usage;
  const credits = { extract: u.extract.credits, decide: u.decide.credits, fill: u.fill.credits, price: u.price.credits, total: totalCredits(u) };
  writeFileSync(file, JSON.stringify({ id: s.id, title: s.title, recordedAt: date, credits, inputs, analysis: a }));
  for (const i of a.items) {
    const co = i.changeOrder?.data;
    console.log(`  [${i.route?.queue ?? i.status}] ${i.text}${i.agreedPrice ? `  agreed price: ${i.agreedPrice.value ?? "none found"}` : ""}${co ? `  risk: ${co.unpaidRisk}` : ""}`);
    if (co) console.log(`      msg: ${co.message}\n      next: ${co.nextStep}`);
  }
  rows.push(`| ${s.title} | ${a.messages.length} / ${a.messageStates.length} | ${a.items.length} | ${u.extract.calls} / ${credits.extract} | ${u.decide.calls} / ${credits.decide} | ${u.price.calls} / ${credits.price} | ${u.fill.calls} / ${credits.fill} | **${credits.total}** |`);
  index.push({ id: s.id, title: s.title, blurb: s.blurb, recordedAt: date });
}

if (!sampleId) {
  writeFileSync("public/demo/index.json", JSON.stringify(index));
  writeFileSync(
    "docs/credit-usage.md",
    [
      `# Credit usage per analysis`,
      ``,
      `Measured from \`X-Clocked-Credits\` on the recorded demo samples (\`npm run snapshot\`), last written ${date}. Calls / credits per endpoint.`,
      `Each run = Extract per client message + Decide per request + Extract for the agreement/withdrawal sentence of AGREED EXTRA and WITHDRAWN items (under "Extract") + Extract for the quoted price of AGREED EXTRA items ("Price") + Fill per NEEDS CHANGE ORDER and ASK ME item (Fill is on demand in the live app; the recording prepares all of them).`,
      ``,
      `| Sample | Messages / client messages | Requests | Extract | Decide | Price | Fill | Total credits |`,
      `|---|---|---|---|---|---|---|---|`,
      ...rows,
      ``,
      ...(only ? [`Last partial re-record (\`--only ${[...only].join(",")}\`) spent ${rerunCredits} credits in total; Extract and Decide results were kept from the earlier full run.`, ``] : []),
    ].join("\n"),
  );
}
