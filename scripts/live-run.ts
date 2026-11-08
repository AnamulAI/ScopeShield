// Measures the credits of ONE live analysis of a sample thread (through the proxy). Needs `npm run pages:dev`.
//   npm run live-run                      fitness-app, analysis only
//   npm run live-run -- bakery --fill     also prepares ONE change order (Fill + Verify) for the first Needs-change-order item
import { createClockedClient } from "../src/lib/clocked";
import { analyze, runFill, totalCredits } from "../src/lib/pipeline";
import { buildPackText } from "../src/lib/evidencePack";
import { runProtect } from "../src/lib/features";
import { effectiveQueue } from "../src/lib/routing";
import { SAMPLES } from "../src/lib/samples";

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--")) ?? "fitness-app";
const s = SAMPLES.find((x) => x.id === id);
if (!s) throw new Error(`Unknown sample "${id}". Use one of: ${SAMPLES.map((x) => x.id).join(", ")}`);
const client = createClockedClient({ baseUrl: process.env.EVAL_BASE_URL ?? "http://localhost:8788" });
const inputs = { contract: s.contract, thread: s.thread, clientName: s.clientName };

const a = await analyze(inputs, client);
const base = totalCredits(a.usage);
const u = a.usage;
console.log(`${s.title}: ${a.messages.length} messages (${a.messageStates.length} from the client), ${a.items.length} requests`);
const part = (k: keyof typeof u, label: string) => `${label} ${u[k].credits} (${u[k].calls} call${u[k].calls === 1 ? "" : "s"})`;
console.log(`analysis only: ${base} credits and ${Object.values(u).reduce((t, x) => t + x.calls, 0)} calls = ${[part("extract", "read (Extract, incl. agreement/withdrawal lookups)"), part("decide", "check (Decide)"), part("price", "agreed price (Extract)"), part("guard", "Guard"), part("rerank", "governing clauses (Rerank)"), part("compare", "promise check (Compare)")].join(" + ")}`);
console.log("queues:", a.items.map((i) => `${effectiveQueue(i.route, i.decision)}`).join(", "));
if (args.includes("--fill")) {
  const item = a.items.find((i) => i.status === "done" && effectiveQueue(i.route, i.decision) === "needs_change_order");
  if (item) {
    await runFill(a, item, inputs, client, () => {});
    console.log(`one change order ("${item.text}"): Fill ${u.fill.credits} credits (${u.fill.calls} call) + Verify ${u.verify.credits} credits (${u.verify.calls} call); total now ${totalCredits(u)}`);
  }
  const packItem = a.items.find((i) => i.status === "done" && effectiveQueue(i.route, i.decision) === "needs_change_order");
  if (packItem) {
    await runProtect(a, packItem.id, buildPackText(a, packItem, inputs), client, () => {});
    console.log(`one privacy-safe evidence pack (Protect): ${u.pii.credits} credits (${u.pii.calls} call); total now ${totalCredits(u)}`);
  }
}
