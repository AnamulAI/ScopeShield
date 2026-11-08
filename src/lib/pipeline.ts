// Orchestration: Extract per CLIENT message -> Decide per request -> Route. Runs in the browser (or Node for evals).
import type { ClockedClient } from "./clocked";
import { ClockedError, type ErrorKind } from "./clocked";
import type { ClockedUsage, DecideNoul, DecideResponse, ExtractResponse, FillResponse, VerifyResponse } from "./clocked-types";
import { inventedAmounts } from "./checks";
import { effortLabel } from "./health";
import { buildDecideRequest, buildExtractRequest, buildFillRequest, buildPriceRequest, buildSupportRequest, buildVerifyRequest } from "./prompts";
import { toVerifiedClaims } from "./verify";
import { runGoverning, runGuard, runPromiseCheck, runScriptChecks } from "./features";
import { isFlagged } from "./snippets";
import { splitClauses } from "./governing";
import { route, THRESHOLDS, type Decision, type RouteResult } from "./routing";
import { cpLength, parseThread, sliceCp, toThreadOffsets, type Message } from "./thread";

export * from "./base";
import { addUsage, effectiveInputs, emptyUsage, shapeError, totalCredits, type Analysis, type ChangeOrder, type Inputs, type MessageState, type RequestItem, type Status, type Verdict } from "./base";

export function parseVerdict(res: DecideResponse): Verdict {
  const a = res.answers;
  const outside = a?.outside_contract, paid = a?.paid_agreement, wd = a?.withdrawn, kind = a?.kind, effort = a?.effort;
  if (outside?.type !== "noul" || paid?.type !== "noul" || wd?.type !== "noul") throw shapeError("decide");
  return {
    outside: (outside as DecideNoul).noul,
    paid: (paid as DecideNoul).noul,
    withdrawn: (wd as DecideNoul).noul,
    kind: kind?.type === "choice" ? kind.choice : "unclear",
    effort: effort?.type === "score" ? effort.score : 0,
  };
}

/** Extract requests from ONE client message and map evidence to thread offsets. */
export async function extractMessage(client: ClockedClient, msg: Message) {
  const { data, usage } = await client.call<ExtractResponse>("extract", buildExtractRequest(msg.text));
  const field = data.fields?.client_requests;
  if (!field) throw shapeError("extract");
  const items = field.items ?? [];
  const requests = items
    .filter((i) => typeof i.value === "string" && i.value.trim() !== "")
    .map((i) => {
      // Verify the span really is the quoted text; otherwise drop the highlight rather than highlight the wrong thing.
      const ok = sliceCp(msg.text, i.start, i.end) === i.value;
      return { text: i.value, evidence: ok ? toThreadOffsets(msg, i.start, i.end) : null };
    });
  return { requests, usage };
}

export async function decideRequest(client: ClockedClient, inputs: Inputs, request: string) {
  const { data, usage } = await client.call<DecideResponse>("decide", buildDecideRequest(inputs.contract, inputs.thread, request));
  const verdict = parseVerdict(data);
  return { verdict, route: route(verdict), usage };
}

/** Re-runs Decide for one item (used by the first run and by Retry). */
export async function runDecide(a: Analysis, item: RequestItem, inputs: Inputs, client: ClockedClient, emit: () => void) {
  item.status = "running";
  item.error = undefined;
  item.errorKind = undefined;
  emit();
  try {
    const d = await decideRequest(client, effectiveInputs(a, inputs), item.text);
    addUsage(a, "decide", d.usage);
    item.verdict = d.verdict;
    item.route = d.route;
    item.status = "done";
    emit();
    const q = d.route.queue;
    const more: Promise<void>[] = [];
    if (q === "agreed_extra") more.push(runSupport(a, item, inputs, client, emit), runPrice(a, item, inputs, client, emit));
    else if (q === "withdrawn") more.push(runSupport(a, item, inputs, client, emit));
    if (q !== "withdrawn") more.push(runGoverning(a, item, inputs, client, emit)); // M10: governing clause for every active request
    await Promise.all(more);
    return;
  } catch (e) {
    item.status = "failed";
    item.error = (e as Error).message;
    item.errorKind = e instanceof ClockedError ? e.kind : undefined;
  }
  emit();
}

/** A span returned for the (possibly withheld) thread, verified against it, then mapped back to the ORIGINAL thread and verified again. */
export function locate(inputs: Inputs, value: string | null, start: unknown, end: unknown): { start: number; end: number } | null {
  if (value === null || typeof start !== "number" || typeof end !== "number" || sliceCp(inputs.thread, start, end) !== value) return null;
  const m = inputs.mapBack ? inputs.mapBack(start, end) : { start, end };
  return m && sliceCp(inputs.originalThread ?? inputs.thread, m.start, m.end) === value ? m : null;
}

/** Finds the agreement / withdrawal sentence in the full thread (Extract). Never fails the item: shows "not located". */
export async function runSupport(a: Analysis, item: RequestItem, rawInputs: Inputs, client: ClockedClient, emit: () => void) {
  const inputs = effectiveInputs(a, rawInputs);
  const kind = item.route?.queue === "withdrawn" ? "withdrawal" : "agreement";
  item.support = { kind, status: "running" };
  emit();
  try {
    const { data, usage } = await client.call<ExtractResponse>("extract", buildSupportRequest(inputs.thread, item.text, kind));
    addUsage(a, "extract", usage);
    const f = data.fields?.support;
    const v = typeof f?.value === "string" && f.value.trim() !== "" ? f.value : null;
    item.support = { kind, status: "done", text: v, evidence: locate(inputs, v, f?.start, f?.end) };
  } catch {
    item.support = { kind, status: "failed" };
  }
  emit();
}

/** Finds the price the developer quoted for THIS agreed extra (Extract over the full thread). Display only what Extract returns. */
export async function runPrice(a: Analysis, item: RequestItem, rawInputs: Inputs, client: ClockedClient, emit: () => void) {
  const inputs = effectiveInputs(a, rawInputs);
  item.agreedPrice = { status: "running" };
  emit();
  try {
    const { data, usage } = await client.call<ExtractResponse>("extract", buildPriceRequest(inputs.thread, item.text));
    addUsage(a, "price", usage);
    const f = data.fields?.agreed_price;
    const v = typeof f?.value === "string" && f.value.trim() !== "" ? f.value : null;
    item.agreedPrice = { status: "done", value: v, evidence: locate(inputs, v, f?.start, f?.end) };
  } catch {
    item.agreedPrice = { status: "failed" };
  }
  emit();
}

/** Extract for one client message, then Decide for each request found. Also used by Retry. */
export async function runMessage(a: Analysis, msg: Message, inputs: Inputs, client: ClockedClient, emit: () => void) {
  const st = a.messageStates.find((m) => m.messageIndex === msg.index)!;
  st.status = "running";
  st.error = undefined;
  st.errorKind = undefined;
  a.items = a.items.filter((i) => i.messageIndex !== msg.index);
  emit();
  let found: Awaited<ReturnType<typeof extractMessage>>;
  try {
    found = await extractMessage(client, msg);
  } catch (e) {
    st.status = "failed";
    st.error = (e as Error).message;
    st.errorKind = e instanceof ClockedError ? e.kind : undefined;
    emit();
    return;
  }
  addUsage(a, "extract", found.usage);
  st.status = "done";
  st.requestCount = found.requests.length;
  const mine = found.requests.map((r, k): RequestItem => ({ id: `${msg.index}-${k}`, messageIndex: msg.index, text: r.text, evidence: r.evidence, status: "running" }));
  a.items.push(...mine);
  sortItems(a);
  emit();
  await Promise.all(mine.map((item) => runDecide(a, item, inputs, client, emit)));
}

const sortItems = (a: Analysis) => a.items.sort((x, y) => x.messageIndex - y.messageIndex || x.id.localeCompare(y.id, undefined, { numeric: true }));

/** Marks the messages Guard flagged as withheld and drops any requests that came from them. */
export function applyWithheld(a: Analysis) {
  const withheld = new Set(a.guard?.withheld ?? []);
  for (const st of a.messageStates) if (withheld.has(st.messageIndex)) { st.status = "done"; st.requestCount = 0; st.withheld = true; st.error = undefined; }
  a.items = a.items.filter((i) => !withheld.has(i.messageIndex));
}

/**
 * Full analysis. `onUpdate` receives the (mutated) state after every change; partial results are always kept.
 * Order: Guard screens the client's messages first (flagged ones are withheld), then Extract per remaining message and Decide per request;
 * Compare (promise check) runs alongside. Guard or Compare failing never blocks the analysis.
 */
export async function analyze(inputs: Inputs, client: ClockedClient, onUpdate: (a: Analysis) => void = () => {}): Promise<Analysis> {
  const messages = parseThread(inputs.thread, inputs.clientName);
  const clientMsgs = messages.filter((m) => m.isClient);
  const a: Analysis = { messages, messageStates: clientMsgs.map((m) => ({ messageIndex: m.index, status: "pending" })), items: [], usage: emptyUsage(), clauses: splitClauses(inputs.contract) };
  const emit = () => onUpdate(a);
  emit();
  const promise = Promise.all([runPromiseCheck(a, inputs, client, emit), runScriptChecks(a, inputs, client, emit)]); // independent of the extraction: start at once
  await runGuard(a, inputs, client, emit);
  applyWithheld(a);
  const withheld = new Set(a.guard?.withheld ?? []);
  emit();
  await Promise.all([promise, ...clientMsgs.filter((m) => !withheld.has(m.index)).map((msg) => runMessage(a, msg, inputs, client, emit))]);
  sortItems(a);
  emit();
  return a;
}

/**
 * "Include anyway": the user's recorded choice to let a withheld message into the analysis.
 * Demo: uses the result recorded in advance (no API call). Live: runs Extract and Decide for that message now.
 * The other requests were judged without this message; they are not re-run.
 */
export async function includeMessage(a: Analysis, messageIndex: number, inputs: Inputs, client: ClockedClient, emit: () => void) {
  const g = a.guard;
  if (!g) return;
  g.withheld = g.withheld.filter((i) => i !== messageIndex);
  if (!g.included.includes(messageIndex)) g.included.push(messageIndex);
  const recorded = g.includedResults?.[messageIndex];
  const st = a.messageStates.find((m) => m.messageIndex === messageIndex);
  if (recorded) {
    a.items = a.items.filter((i) => i.messageIndex !== messageIndex);
    a.items.push(...structuredClone(recorded.items));
    if (st) Object.assign(st, structuredClone(recorded.state), { withheld: false });
    sortItems(a);
    emit();
    return;
  }
  if (st) st.withheld = false;
  const msg = a.messages.find((m) => m.index === messageIndex);
  if (msg) await runMessage(a, msg, inputs, client, emit);
}

/** Undo "Include anyway": withhold the message again and drop the requests that came from it. */
export function withholdAgain(a: Analysis, messageIndex: number, emit: () => void) {
  const g = a.guard;
  if (!g) return;
  if (!g.withheld.includes(messageIndex)) g.withheld.push(messageIndex);
  g.included = g.included.filter((i) => i !== messageIndex);
  a.items = a.items.filter((i) => i.messageIndex !== messageIndex);
  const st = a.messageStates.find((m) => m.messageIndex === messageIndex);
  if (st) { st.withheld = true; st.status = "done"; st.requestCount = 0; }
  emit();
}

export interface FillContext { effortScore?: number; agreed?: boolean; /** M13: a code snippet in this request's message was estimated suspicious or harmful */ scriptRisk?: "suspicious" | "harmful"; /** M10: the governing clause, so the message can cite it */ clause?: { id: string; text: string } }

export async function fillChangeOrder(client: ClockedClient, inputs: Inputs, request: string, strict = false, ctx: FillContext = {}): Promise<ChangeOrder> {
  const { body, threadOffset } = buildFillRequest(inputs.contract, inputs.thread, request, {
    strict,
    clientName: inputs.clientName,
    effort: ctx.effortScore === undefined ? undefined : effortLabel(ctx.effortScore),
    agreed: ctx.agreed,
    clause: ctx.clause,
    scriptRisk: ctx.scriptRisk,
  });
  const { data, usage } = await client.call<FillResponse>("fill", body);
  const f = data.fields;
  if (!f) throw shapeError("fill");
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
  const price = str(f.price_mentioned?.value);
  const ps = f.price_mentioned?.start, pe = f.price_mentioned?.end;
  const priceEvidence = typeof ps === "number" && typeof pe === "number" ? locate(inputs, price, ps - threadOffset, pe - threadOffset) : null;
  const message = str(f.change_order_message?.value);
  const nextStep = str(f.next_step?.value);
  const source = `${inputs.contract}\n${inputs.thread}`;
  return {
    category: str(f.category?.value),
    unpaidRisk: str(f.unpaid_risk?.value),
    priceMentioned: price,
    priceEvidence,
    message,
    nextStep,
    inventedMessage: message ? inventedAmounts(message, source) : [],
    inventedNextStep: nextStep ? inventedAmounts(nextStep, source) : [],
    usage,
  };
}

/** Verify: checks the generated message claim by claim against the contract and the thread. Never fails the change order. */
export async function runVerify(a: Analysis, item: RequestItem, rawInputs: Inputs, client: ClockedClient, emit: () => void) {
  const inputs = effectiveInputs(a, rawInputs);
  const st = item.changeOrder;
  const message = st?.data?.message;
  if (!st || !message) return;
  st.verify = { status: "running" };
  emit();
  try {
    const { data, usage } = await client.call<VerifyResponse>("grounding", buildVerifyRequest(inputs.contract, inputs.thread, message));
    addUsage(a, "verify", usage);
    if (!Array.isArray(data.claims)) throw shapeError("grounding");
    const claims = toVerifiedClaims(data.claims, { contract: inputs.contract, thread: inputs.thread }, sliceCp);
    // Evidence in the thread was located in the (possibly withheld) thread; map it back to the original, or stop highlighting it.
    for (const c of claims) {
      const ev = c.evidence;
      if (ev && ev.document === "thread" && ev.located) {
        const m = inputs.mapBack ? inputs.mapBack(ev.start, ev.end) : { start: ev.start, end: ev.end };
        if (m && sliceCp(inputs.originalThread ?? inputs.thread, m.start, m.end) === ev.quote) { ev.start = m.start; ev.end = m.end; } else ev.located = false;
      }
    }
    st.verify = { status: "done", claims };
  } catch {
    st.verify = { status: "failed" };
  }
  emit();
}

/** Runs Fill for one item (on demand). `regenerate` is the single allowed retry after an invented-amount block. */
export async function runFill(a: Analysis, item: RequestItem, rawInputs: Inputs, client: ClockedClient, emit: () => void, regenerate = false) {
  const inputs = effectiveInputs(a, rawInputs);
  const prev = item.changeOrder;
  if (regenerate && prev?.regenerated) return; // one Regenerate attempt only
  item.changeOrder = { status: "running", regenerated: regenerate || (prev?.regenerated ?? false), data: regenerate ? undefined : prev?.data };
  emit();
  try {
    const v = item.verdict;
    if (!item.governing) await runGoverning(a, item, rawInputs, client, emit); // M10: make sure the governing clause is known first
    const g = item.governing;
    const clause = g?.status === "done" && g.clauseId && g.text ? { id: g.clauseId, text: g.text } : undefined;
    // M13: a flagged snippet in this request's own message changes the drafted next step (ask for the source; do not install it yet)
    const flagged = a.scripts?.find((sc) => sc.messageIndex === item.messageIndex && sc.status === "done" && isFlagged(sc.result?.risk));
    const scriptRisk = flagged?.result?.risk === "harmful" ? "harmful" : flagged ? "suspicious" : undefined;
    const data = await fillChangeOrder(client, inputs, item.text, regenerate, { ...(v ? { effortScore: v.effort, agreed: v.paid >= THRESHOLDS.paidYes } : {}), clause, scriptRisk });
    addUsage(a, "fill", data.usage);
    item.changeOrder = { status: "done", data, regenerated: item.changeOrder.regenerated };
    emit();
    await runVerify(a, item, inputs, client, emit);
    return;
  } catch (e) {
    item.changeOrder = { status: "failed", error: (e as Error).message, errorKind: e instanceof ClockedError ? e.kind : undefined, regenerated: item.changeOrder.regenerated };
  }
  emit();
}

/** Plain-text change order. Generated parts are labelled; the price line is the thread's own words or an explicit "none quoted". */
export function changeOrderText(request: string, co: ChangeOrder): string {
  return [
    `Change order: ${request}`,
    co.category ? `Category: ${co.category.replace("_", " ")}` : null,
    co.unpaidRisk ? `Unpaid risk: ${co.unpaidRisk}` : null,
    `Price: ${co.priceMentioned ?? "No price was quoted in this thread"}`,
    "",
    "Message to client (AI-generated draft):",
    co.message ?? "(none generated)",
    "",
    "Next step (AI-generated draft):",
    co.nextStep ?? "(none generated)",
  ].filter((l) => l !== null).join("\n");
}

/** Copy is blocked while a generated draft contains an amount that is not in the thread. */
export const copyBlocked = (co: ChangeOrder) => co.inventedMessage.length > 0 || co.inventedNextStep.length > 0;

export { cpLength };
