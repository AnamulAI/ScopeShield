// M11: the text of a "privacy-safe evidence pack" for one request. Built only from what the analysis already holds.
import type { Analysis, Inputs, RequestItem } from "./base";
import { effectiveQueue, QUEUE_LABEL } from "./routing";
import { sliceCp } from "./thread";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const slice = (thread: string, s?: { start: number; end: number } | null) => (s ? sliceCp(thread, s.start, s.end) : null);

export function buildPackText(a: Analysis, item: RequestItem, inputs: Inputs): string {
  const q = effectiveQueue(item.route, item.decision);
  const v = item.verdict;
  const msg = a.messages[item.messageIndex];
  const sentence = slice(inputs.thread, item.evidence) ?? item.text;
  const lines: string[] = ["EVIDENCE PACK", "", `Request: ${item.text}`];
  if (v) lines.push(`Verdict (model estimate): ${q === "pending" ? "pending" : QUEUE_LABEL[q]}. Outside the contract ${pct(v.outside)}, agreed to pay ${pct(v.paid)}, later withdrawn ${pct(v.withdrawn)}.`);
  if (item.decision) lines.push(`Your decision: ${item.decision === "extra" ? "extra work" : item.decision === "in_scope" ? "in scope" : "skipped"}.`);
  lines.push(`Client's sentence${msg ? ` (${msg.speaker}, message ${msg.index + 1})` : ""}: “${sentence}”`);
  const sup = item.support;
  if (sup?.status === "done") lines.push(sup.text ? `${sup.kind === "agreement" ? "Agreement" : "Withdrawal"} sentence: “${sup.text}”` : `No ${sup.kind} sentence was found.`);
  if (item.agreedPrice?.status === "done") lines.push(item.agreedPrice.value ? `Price quoted in the thread: ${item.agreedPrice.value}` : "No price was found in the thread.");
  const g = item.governing;
  if (g?.status === "done") lines.push(g.text ? `Governing clause (${g.clauseId}, model estimate ${pct(g.relevance ?? 0)}): “${g.text}”` : "No clause covers this request.");
  const co = item.changeOrder?.data;
  if (co?.message) lines.push("", "Draft message to the client (AI-generated draft):", co.message);
  if (co?.nextStep) lines.push("", "Next step for the freelancer (AI-generated draft):", co.nextStep);
  lines.push("", "Model judgments above are estimates, not facts.");
  return lines.join("\n");
}
