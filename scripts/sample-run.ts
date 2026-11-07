// One full pipeline run on evals/sample-thread.json (live). Measures credits per analysis. Needs `npm run pages:dev`.
import { readFileSync, writeFileSync } from "node:fs";
import { createClockedClient } from "../src/lib/clocked";
import { analyze, totalCredits } from "../src/lib/pipeline";
import { sliceCp } from "../src/lib/thread";

const s = JSON.parse(readFileSync("evals/sample-thread.json", "utf8"));
const client = createClockedClient({ baseUrl: process.env.EVAL_BASE_URL ?? "http://localhost:8788" });
const a = await analyze(s, client);
const rows = a.items.map((i) => `| ${i.messageIndex} | ${i.text.replace(/\|/g, "\\|")} | ${i.evidence ? sliceCp(s.thread, i.evidence.start, i.evidence.end) === i.text ? "ok" : "MISMATCH" : "none"} | ${i.verdict ? `${i.verdict.outside.toFixed(2)} / ${i.verdict.paid.toFixed(2)}` : i.status} | ${i.route?.queue ?? i.error ?? ""} |`);
const clientMsgs = a.messageStates.length;
const md = [
  `# Credit usage for one full analysis`,
  ``,
  `Measured on ${new Date().toISOString().slice(0, 10)} from \`X-Clocked-Credits\`, on \`evals/sample-thread.json\` (${a.messages.length} messages, ${clientMsgs} from the client, ${a.items.length} requests found). Fill is not part of the base pipeline; it runs only for change-order items.`,
  ``,
  `| Endpoint | Calls | Credits |`,
  `|---|---|---|`,
  `| extract | ${a.usage.extract.calls} | ${a.usage.extract.credits} |`,
  `| decide | ${a.usage.decide.calls} | ${a.usage.decide.credits} |`,
  `| **Total** | ${a.usage.extract.calls + a.usage.decide.calls} | **${totalCredits(a.usage)}** |`,
  ``,
  `Average: ${(a.usage.extract.credits / Math.max(1, a.usage.extract.calls)).toFixed(1)} credits per client message (extract) + ${(a.usage.decide.credits / Math.max(1, a.usage.decide.calls)).toFixed(1)} per request (decide).`,
  ``,
  `## Result of this run`,
  ``,
  `| Msg | Request | Evidence | outside / paid | Queue |`,
  `|---|---|---|---|---|`,
  ...rows,
  ``,
].join("\n");
writeFileSync("docs/credit-usage.md", md);
console.log(md);
