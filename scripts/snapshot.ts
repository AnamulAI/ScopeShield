// Records REAL results of the pipeline for the sample threads into public/demo/*.json (+ docs/credit-usage.md). Keeps whatever comes back.
// Needs `npm run pages:dev` running with a valid key (add ALLOW_UNLIMITED_LOCAL=1 to .dev.vars). Spends credits.
//   npm run snapshot                          full run for every sample (Guard, Extract, Decide, Rerank, Compare, support/price lookups, Fill, Verify, Protect packs)
//   npm run snapshot -- pushy-client          full run for one sample id
//   npm run snapshot -- --only rerank,compare re-run ONLY those parts on the existing recordings (Extract/Decide results are kept)
//     parts: guard, rerank, compare, price, fill (+ its Verify), verify, pii. They always run in that order.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { createClockedClient } from "../src/lib/clocked";
import type { Snapshot } from "../src/lib/demo";
import { buildPackText } from "../src/lib/evidencePack";
import { runGoverning, runGuard, runProtect, runPromiseCheck } from "../src/lib/features";
import { splitClauses } from "../src/lib/governing";
import { analyze, applyWithheld, emptyUsage, includeMessage, runFill, runPrice, runVerify, totalCredits, type Analysis, type UsageKey } from "../src/lib/pipeline";
import { effectiveQueue } from "../src/lib/routing";
import { SAMPLES } from "../src/lib/samples";
import { countVerdicts } from "../src/lib/verify";

const LIVE_MARK = "<!-- live-run -->"; // everything after this marker in docs/credit-usage.md is hand-written and survives a re-record
const PARTS = ["guard", "rerank", "compare", "price", "fill", "verify", "pii"] as const;
type Part = (typeof PARTS)[number];

const args = process.argv.slice(2);
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1]?.split(",").map((x) => x.trim()) as Part[]) : null;
const sampleId = args.find((a, i) => !a.startsWith("--") && !(onlyIdx >= 0 && i === onlyIdx + 1));
if (only) for (const o of only) if (!PARTS.includes(o)) throw new Error(`Unknown --only part "${o}" (use ${PARTS.join(",")})`);

const client = createClockedClient({ baseUrl: process.env.EVAL_BASE_URL ?? "http://localhost:8788" });
const date = new Date().toISOString().slice(0, 10);
const noop = () => {};
mkdirSync("public/demo", { recursive: true });

const FILLABLE = ["needs_change_order", "ask_me"]; // ASK ME items too, so "Extra work" also works offline. Never WITHDRAWN.
const fillables = (a: Analysis) => a.items.filter((i) => i.status === "done" && FILLABLE.includes(effectiveQueue(i.route, i.decision)));
const packable = (a: Analysis) => a.items.filter((i) => i.status === "done" && ["needs_change_order", "ask_me", "agreed_extra"].includes(effectiveQueue(i.route, i.decision)));
const reset = (a: Analysis, k: UsageKey) => { a.usage[k] = { calls: 0, credits: 0 }; };

/** Demo needs "Include anyway" to work offline: run Extract + Decide for each flagged message now, and store the result. */
async function recordIncluded(a: Analysis, inputs: { contract: string; thread: string; clientName: string }) {
  const g = a.guard;
  if (!g || g.withheld.length === 0) return;
  g.includedResults = {};
  for (const idx of g.withheld) {
    const t: Analysis = structuredClone(a);
    t.guard!.includedResults = undefined;
    t.usage = emptyUsage();
    await includeMessage(t, idx, inputs, client, noop);
    g.includedResults[idx] = { items: t.items.filter((i) => i.messageIndex === idx), state: t.messageStates.find((m) => m.messageIndex === idx)! };
    for (const k of Object.keys(t.usage) as UsageKey[]) { a.usage[k].calls += t.usage[k].calls; a.usage[k].credits += t.usage[k].credits; }
  }
}

const log = (a: Analysis) => {
  for (const i of a.items) {
    const g = i.governing;
    const co = i.changeOrder?.data;
    console.log(`  [${i.route?.queue ?? i.status}] ${i.text}${g?.status === "done" ? `  clause: ${g.clauseId ? `${g.clauseId} (${Math.round((g.relevance ?? 0) * 100)}%) "${g.text}"` : "none"}` : ""}${i.agreedPrice ? `  price: ${i.agreedPrice.value ?? "none"}` : ""}${co ? `  risk: ${co.unpaidRisk}` : ""}`);
    if (co) console.log(`      msg: ${co.message}`);
    const v = i.changeOrder?.verify;
    if (v) { const n = countVerdicts(v.claims); console.log(`      verify: ${v.status} supported ${n.supported}, not stated ${n.notStated}, contradicted ${n.contradicted}`); }
    const p = a.packs?.[i.id];
    if (p) console.log(`      pack: ${p.status} ${JSON.stringify(p.counts ?? {})}`);
  }
  const gd = a.guard;
  console.log(`  guard: ${gd ? `${gd.status} ${gd.result ? `injection ${gd.result.injection.toFixed(2)} (${gd.result.verdict})` : ""} flagged messages: [${gd.flags.map((f) => f.messageIndex).join(",")}]` : "not run"}`);
  const pc = a.promiseCheck;
  console.log(`  promise check: ${pc ? `${pc.status}, ${pc.conflicts.length} possible conflict(s)${pc.conflicts.map((c) => `\n      contract: "${c.contract.quote}"\n      yours:    "${c.yours.quote}"`).join("")}` : "not run"}`);
};

let rerunCredits = 0;
for (const s of SAMPLES.filter((x) => !sampleId || x.id === sampleId)) {
  const inputs = { contract: s.contract, thread: s.thread, clientName: s.clientName };
  const file = `public/demo/${s.id}.json`;
  let a: Analysis;

  if (only) {
    if (!existsSync(file)) throw new Error(`${file} does not exist: run a full snapshot first`);
    a = (JSON.parse(readFileSync(file, "utf8")) as Snapshot).analysis;
    a.usage = { ...emptyUsage(), ...a.usage };
    const before = totalCredits(a.usage);
    a.clauses ??= splitClauses(s.contract);
    const spentBefore = totalCredits(a.usage);
    if (only.has("guard")) {
      reset(a, "guard");
      await runGuard(a, inputs, client, noop);
      applyWithheld(a);
      await recordIncluded(a, inputs);
    }
    if (only.has("rerank")) {
      reset(a, "rerank");
      for (const i of a.items) delete i.governing;
      await Promise.all(a.items.filter((i) => i.route?.queue !== "withdrawn" && i.status === "done").map((i) => runGoverning(a, i, inputs, client, noop)));
    }
    if (only.has("compare")) { reset(a, "compare"); a.promiseCheck = undefined; await runPromiseCheck(a, inputs, client, noop); }
    if (only.has("price")) {
      reset(a, "price");
      for (const i of a.items) delete i.agreedPrice;
      await Promise.all(a.items.filter((i) => i.route?.queue === "agreed_extra").map((i) => runPrice(a, i, inputs, client, noop)));
    }
    if (only.has("fill")) {
      reset(a, "fill"); reset(a, "verify");
      for (const i of a.items) delete i.changeOrder;
      await Promise.all(fillables(a).map((i) => runFill(a, i, inputs, client, noop)));
    }
    if (only.has("verify") && !only.has("fill")) {
      reset(a, "verify");
      const drafts = a.items.filter((i) => i.changeOrder?.data?.message);
      for (const i of drafts) delete i.changeOrder!.verify;
      await Promise.all(drafts.map((i) => runVerify(a, i, inputs, client, noop)));
    }
    if (only.has("pii")) {
      reset(a, "pii");
      a.packs = {};
      await Promise.all(packable(a).map((i) => runProtect(a, i.id, buildPackText(a, i, inputs), client, noop)));
    }
    const spent = totalCredits(a.usage) - spentBefore; // note: re-recorded parts were reset first, so this is the net change
    rerunCredits += Math.max(0, spent);
    console.log(`\n== ${s.title}: re-ran ${[...only].join("+")} (recorded total was ${before}, now ${totalCredits(a.usage)})`);
  } else {
    a = await analyze(inputs, client);
    await recordIncluded(a, inputs);
    await Promise.all(fillables(a).map((i) => runFill(a, i, inputs, client, noop)));
    a.packs = {};
    await Promise.all(packable(a).map((i) => runProtect(a, i.id, buildPackText(a, i, inputs), client, noop)));
    const failed = a.items.filter((i) => i.status === "failed").length + a.messageStates.filter((m) => m.status === "failed").length;
    console.log(`\n== ${s.title}: ${a.messages.length} msgs, ${a.items.length} requests, ${totalCredits(a.usage)} credits (failed steps: ${failed})`);
  }

  const u = a.usage;
  const credits = { ...Object.fromEntries((Object.keys(u) as UsageKey[]).map((k) => [k, u[k].credits])), total: totalCredits(u) };
  writeFileSync(file, JSON.stringify({ id: s.id, title: s.title, recordedAt: date, credits, inputs, analysis: a }));
  log(a);
}

// Index and credit table are rebuilt from every recording on disk.
const snaps = SAMPLES.filter((x) => existsSync(`public/demo/${x.id}.json`)).map((x) => ({ sample: x, snap: JSON.parse(readFileSync(`public/demo/${x.id}.json`, "utf8")) as Snapshot }));
writeFileSync("public/demo/index.json", JSON.stringify(snaps.map(({ sample, snap }) => ({ id: sample.id, title: sample.title, blurb: sample.blurb, recordedAt: snap.recordedAt }))));
const cell = (a: Analysis, k: UsageKey) => `${a.usage[k]?.calls ?? 0} / ${a.usage[k]?.credits ?? 0}`;
const rows = snaps.map(({ sample, snap }) => `| ${sample.title} | ${snap.analysis.messages.length} / ${snap.analysis.messageStates.length} | ${snap.analysis.items.length} | ${cell(snap.analysis, "extract")} | ${cell(snap.analysis, "decide")} | ${cell(snap.analysis, "price")} | ${cell(snap.analysis, "fill")} | ${cell(snap.analysis, "verify")} | ${cell(snap.analysis, "guard")} | ${cell(snap.analysis, "rerank")} | ${cell(snap.analysis, "compare")} | ${cell(snap.analysis, "pii")} | **${totalCredits(snap.analysis.usage)}** |`);
const prev = existsSync("docs/credit-usage.md") ? readFileSync("docs/credit-usage.md", "utf8") : "";
const keep = prev.includes(LIVE_MARK) ? prev.slice(prev.indexOf(LIVE_MARK)) : "";
writeFileSync(
  "docs/credit-usage.md",
  [
    `# Credit usage per analysis`,
    ``,
    `Measured from \`X-Clocked-Credits\` on the recorded demo samples (\`npm run snapshot\`), last written ${date}. Cells are calls / credits per endpoint.`,
    `Each recording = Guard (1 call over the client's messages) + Extract per client message + Decide per request + Extract for the agreement/withdrawal sentence of AGREED EXTRA and WITHDRAWN items (under "Extract") + Extract for the quoted price of AGREED EXTRA items ("Price") + Rerank per active request ("Rerank") + Compare (1 call over the freelancer's messages) + Fill and Verify for every NEEDS CHANGE ORDER and ASK ME item + one Protect call per evidence pack ("Pack"). Fill, Verify and Pack are on demand in the live app; the recording prepares them all, and for flagged messages also records the "Include anyway" result.`,
    ``,
    `| Sample | Messages / client messages | Requests | Extract | Decide | Price | Fill | Verify | Guard | Rerank | Compare | Pack | Total credits |`,
    `|---|---|---|---|---|---|---|---|---|---|---|---|---|`,
    ...rows,
    ``,
    ...(only ? [`Last partial re-record (\`--only ${[...only].join(",")}\`) changed the totals above by ${rerunCredits} credits net; Extract and Decide results of the other parts were kept from earlier runs.`, ``] : []),
  ].join("\n") + (keep ? "\n" + keep : ""),
);
