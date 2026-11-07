// Orchestration: Extract per CLIENT message -> Decide per request -> Route. Runs in the browser (or Node for evals).
import type { ClockedClient } from "./clocked";
import { ClockedError, type ErrorKind } from "./clocked";
import type { ClockedUsage, DecideNoul, DecideResponse, ExtractResponse, FillResponse } from "./clocked-types";
import { inventedAmounts } from "./checks";
import { effortLabel } from "./health";
import { buildDecideRequest, buildExtractRequest, buildFillRequest, buildPriceRequest, buildSupportRequest } from "./prompts";
import { route, THRESHOLDS, type Decision, type RouteResult } from "./routing";
import { cpLength, parseThread, sliceCp, toThreadOffsets, type Message } from "./thread";

export type Status = "pending" | "running" | "done" | "failed";

export interface Verdict {
  outside: number;
  paid: number;
  /** Probability the client later withdrew this request. */
  withdrawn: number;
  kind: string;
  /** Zero-based expected effort score (0 = trivial ... 3 = large). Rough, never a fact. */
  effort: number;
}

export interface RequestItem {
  id: string;
  messageIndex: number;
  text: string;
  /** Evidence span in the ORIGINAL thread (code points); null if it could not be verified. */
  evidence: { start: number; end: number } | null;
  status: Status;
  verdict?: Verdict;
  route?: RouteResult;
  error?: string;
  errorKind?: ErrorKind;
  /** The user's answer to an ASK ME card (shown as "Your decision"; can be undone). */
  decision?: Decision;
  /** Sentence supporting an AGREED EXTRA (agreement) or WITHDRAWN (withdrawal) verdict. */
  support?: Support;
  /** AGREED EXTRA only: the price the developer quoted for THIS request (Extract); null value = none found. */
  agreedPrice?: AgreedPrice;
  changeOrder?: ChangeOrderState;
}

export interface Support {
  kind: "agreement" | "withdrawal";
  status: Status;
  /** null evidence = the model found no such sentence; shown explicitly. */
  text?: string | null;
  evidence?: { start: number; end: number } | null;
}

export interface AgreedPrice { status: Status; value?: string | null; evidence?: { start: number; end: number } | null }

export interface ChangeOrderState { status: Status; data?: ChangeOrder; error?: string; errorKind?: ErrorKind; /** one Regenerate attempt only */ regenerated: boolean }

export interface MessageState { messageIndex: number; status: Status; error?: string; errorKind?: ErrorKind; requestCount?: number }

export interface Analysis {
  messages: Message[];
  messageStates: MessageState[];
  items: RequestItem[];
  /** extract = reading messages + agreement/withdrawal sentence lookups; price = agreed-price lookups (Extract); */
  usage: Record<"extract" | "decide" | "fill" | "price", { calls: number; credits: number }>;
}

export const emptyUsage = (): Analysis["usage"] => ({ extract: { calls: 0, credits: 0 }, decide: { calls: 0, credits: 0 }, fill: { calls: 0, credits: 0 }, price: { calls: 0, credits: 0 } });
export const totalCredits = (u: Analysis["usage"]) => u.extract.credits + u.decide.credits + u.fill.credits + (u.price?.credits ?? 0);

const addUsage = (a: Analysis, ep: keyof Analysis["usage"], u: ClockedUsage | null) => {
  a.usage[ep] ??= { calls: 0, credits: 0 };
  a.usage[ep].calls++;
  a.usage[ep].credits += u?.credits ?? 0;
};

export interface Inputs { contract: string; thread: string; clientName: string }

function shapeError(what: string) {
  return new ClockedError("bad_request", `Unexpected ${what} response shape`);
}

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
    const d = await decideRequest(client, inputs, item.text);
    addUsage(a, "decide", d.usage);
    item.verdict = d.verdict;
    item.route = d.route;
    item.status = "done";
    emit();
    const q = d.route.queue;
    if (q === "agreed_extra") await Promise.all([runSupport(a, item, inputs, client, emit), runPrice(a, item, inputs, client, emit)]);
    else if (q === "withdrawn") await runSupport(a, item, inputs, client, emit);
    return;
  } catch (e) {
    item.status = "failed";
    item.error = (e as Error).message;
    item.errorKind = e instanceof ClockedError ? e.kind : undefined;
  }
  emit();
}

/** Finds the agreement / withdrawal sentence in the full thread (Extract). Never fails the item: shows "not located". */
export async function runSupport(a: Analysis, item: RequestItem, inputs: Inputs, client: ClockedClient, emit: () => void) {
  const kind = item.route?.queue === "withdrawn" ? "withdrawal" : "agreement";
  item.support = { kind, status: "running" };
  emit();
  try {
    const { data, usage } = await client.call<ExtractResponse>("extract", buildSupportRequest(inputs.thread, item.text, kind));
    addUsage(a, "extract", usage);
    const f = data.fields?.support;
    const v = typeof f?.value === "string" && f.value.trim() !== "" ? f.value : null;
    const ok = v !== null && typeof f?.start === "number" && typeof f?.end === "number" && sliceCp(inputs.thread, f.start, f.end) === v;
    item.support = { kind, status: "done", text: v, evidence: ok ? { start: f!.start!, end: f!.end! } : null };
  } catch {
    item.support = { kind, status: "failed" };
  }
  emit();
}

/** Finds the price the developer quoted for THIS agreed extra (Extract over the full thread). Display only what Extract returns. */
export async function runPrice(a: Analysis, item: RequestItem, inputs: Inputs, client: ClockedClient, emit: () => void) {
  item.agreedPrice = { status: "running" };
  emit();
  try {
    const { data, usage } = await client.call<ExtractResponse>("extract", buildPriceRequest(inputs.thread, item.text));
    addUsage(a, "price", usage);
    const f = data.fields?.agreed_price;
    const v = typeof f?.value === "string" && f.value.trim() !== "" ? f.value : null;
    const ok = v !== null && typeof f?.start === "number" && typeof f?.end === "number" && sliceCp(inputs.thread, f.start, f.end) === v;
    item.agreedPrice = { status: "done", value: v, evidence: ok ? { start: f!.start!, end: f!.end! } : null };
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

/** Full analysis. `onUpdate` receives the (mutated) state after every change; partial results are always kept. */
export async function analyze(inputs: Inputs, client: ClockedClient, onUpdate: (a: Analysis) => void = () => {}): Promise<Analysis> {
  const messages = parseThread(inputs.thread, inputs.clientName);
  const clientMsgs = messages.filter((m) => m.isClient);
  const a: Analysis = { messages, messageStates: clientMsgs.map((m) => ({ messageIndex: m.index, status: "pending" })), items: [], usage: emptyUsage() };
  const emit = () => onUpdate(a);
  emit();
  await Promise.all(clientMsgs.map((msg) => runMessage(a, msg, inputs, client, emit)));
  sortItems(a);
  emit();
  return a;
}

export interface ChangeOrder {
  category: string | null;
  unpaidRisk: string | null;
  /** null = no price quoted in the thread */
  priceMentioned: string | null;
  priceEvidence: { start: number; end: number } | null;
  /** AI-generated drafts: never present as quotations. */
  message: string | null;
  nextStep: string | null;
  /** Currency amounts in generated text that do not appear in the contract or thread (Copy is blocked when non-empty). */
  inventedMessage: string[];
  inventedNextStep: string[];
  usage: ClockedUsage | null;
}

export interface FillContext { effortScore?: number; agreed?: boolean }

export async function fillChangeOrder(client: ClockedClient, inputs: Inputs, request: string, strict = false, ctx: FillContext = {}): Promise<ChangeOrder> {
  const { body, threadOffset } = buildFillRequest(inputs.contract, inputs.thread, request, {
    strict,
    clientName: inputs.clientName,
    effort: ctx.effortScore === undefined ? undefined : effortLabel(ctx.effortScore),
    agreed: ctx.agreed,
  });
  const { data, usage } = await client.call<FillResponse>("fill", body);
  const f = data.fields;
  if (!f) throw shapeError("fill");
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
  const price = str(f.price_mentioned?.value);
  const ps = f.price_mentioned?.start, pe = f.price_mentioned?.end;
  const priceEvidence =
    price !== null && typeof ps === "number" && typeof pe === "number" && sliceCp(inputs.thread, ps - threadOffset, pe - threadOffset) === price
      ? { start: ps - threadOffset, end: pe - threadOffset }
      : null;
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

/** Runs Fill for one item (on demand). `regenerate` is the single allowed retry after an invented-amount block. */
export async function runFill(a: Analysis, item: RequestItem, inputs: Inputs, client: ClockedClient, emit: () => void, regenerate = false) {
  const prev = item.changeOrder;
  if (regenerate && prev?.regenerated) return; // one Regenerate attempt only
  item.changeOrder = { status: "running", regenerated: regenerate || (prev?.regenerated ?? false), data: regenerate ? undefined : prev?.data };
  emit();
  try {
    const v = item.verdict;
    const data = await fillChangeOrder(client, inputs, item.text, regenerate, v ? { effortScore: v.effort, agreed: v.paid >= THRESHOLDS.paidYes } : {});
    addUsage(a, "fill", data.usage);
    item.changeOrder = { status: "done", data, regenerated: item.changeOrder.regenerated };
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
