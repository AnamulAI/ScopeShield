// Compare (M12): "Promise check": where do the freelancer's own messages conflict with the contract?
import type { CompareResponse } from "./clocked-types";
import { cpLength, sliceCp, type Message } from "./thread";

export const PROMISE_INSTRUCTIONS =
  "Find where the freelancer's statements conflict with the contract, for example offering excluded work at no cost or more revisions than agreed. A different number is a conflict only when it concerns the same item. Saying that excluded work is extra, or quoting a separate price for it, is not a conflict; promising it for free, or promising more than the contract includes, is.";

export interface PromisePart { messageIndex: number; start: number; end: number; threadStart: number }
export interface PromiseInput { text: string; parts: PromisePart[] }

/** The freelancer's (non-client) messages as one document, with an offset table back to the thread. */
export function buildPromiseInput(messages: Message[]): PromiseInput {
  const parts: PromisePart[] = [];
  let text = "";
  let at = 0;
  let first = true;
  for (const m of messages.filter((x) => !x.isClient)) {
    if (!first) { text += "\n\n"; at += 2; }
    first = false;
    const len = cpLength(m.text);
    parts.push({ messageIndex: m.index, start: at, end: at + len, threadStart: m.start });
    text += m.text;
    at += len;
  }
  return { text, parts };
}

export const buildPromiseRequest = (contract: string, input: PromiseInput) => ({
  documents: [{ id: "contract", text: contract }, { id: "your_messages", text: input.text }],
  instructions: PROMISE_INSTRUCTIONS,
  evidence: "all",
});

export interface PromiseConflict {
  kind?: string;
  confidence?: number;
  contract: { quote: string };
  yours: { quote: string; /** one span per message the quote touches (thread code points) */ spans: { start: number; end: number }[]; messageIndex: number | null };
}
export interface PromiseCheck { status: "running" | "done" | "failed"; conflicts: PromiseConflict[]; error?: string }

/** Maps "your_messages" offsets to thread spans, one per message touched (never spanning the client's messages in between). */
export function mapYoursToThread(input: PromiseInput, start: number, end: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const p of input.parts) {
    if (start < p.end && end > p.start) out.push({ start: p.threadStart + (Math.max(start, p.start) - p.start), end: p.threadStart + (Math.min(end, p.end) - p.start) });
  }
  return out;
}

/** Findings of the (contract, your_messages) pair. A finding is kept only if its quote reproduces from the offsets. */
export function toConflicts(res: CompareResponse, contract: string, input: PromiseInput): PromiseConflict[] {
  const pair = (res.pairs ?? []).find((p) => (p.a === "contract" && p.b === "your_messages") || (p.a === "your_messages" && p.b === "contract"));
  if (!pair) return [];
  const out: PromiseConflict[] = [];
  for (const f of pair.conflicts ?? []) {
    const c = f.a.document === "contract" ? f.a : f.b;
    const y = f.a.document === "your_messages" ? f.a : f.b;
    if (sliceCp(contract, c.start, c.end) !== c.quote || sliceCp(input.text, y.start, y.end) !== y.quote) continue;
    const spans = mapYoursToThread(input, y.start, y.end);
    if (spans.length === 0) continue;
    out.push({ kind: f.kind, confidence: f.confidence, contract: { quote: c.quote }, yours: { quote: y.quote, spans, messageIndex: input.parts.find((p) => y.start < p.end && y.end > p.start)?.messageIndex ?? null } });
  }
  return out;
}
