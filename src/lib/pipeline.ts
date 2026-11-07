// Orchestration: Extract per CLIENT message -> Decide per request -> Route. Runs in the browser (or Node for evals).
import type { ClockedClient } from "./clocked";
import { ClockedError } from "./clocked";
import type { ClockedUsage, DecideNoul, DecideResponse, ExtractResponse, FillResponse } from "./clocked-types";
import { buildDecideRequest, buildExtractRequest, buildFillRequest } from "./prompts";
import { route, type RouteResult } from "./routing";
import { cpLength, parseThread, sliceCp, toThreadOffsets, type Message } from "./thread";

export type Status = "pending" | "running" | "done" | "failed";

export interface Verdict {
  outside: number;
  paid: number;
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
}

export interface MessageState { messageIndex: number; status: Status; error?: string; requestCount?: number }

export interface Analysis {
  messages: Message[];
  messageStates: MessageState[];
  items: RequestItem[];
  usage: Record<"extract" | "decide" | "fill", { calls: number; credits: number }>;
}

export const emptyUsage = (): Analysis["usage"] => ({ extract: { calls: 0, credits: 0 }, decide: { calls: 0, credits: 0 }, fill: { calls: 0, credits: 0 } });
export const totalCredits = (u: Analysis["usage"]) => u.extract.credits + u.decide.credits + u.fill.credits;

const addUsage = (a: Analysis, ep: keyof Analysis["usage"], u: ClockedUsage | null) => {
  a.usage[ep].calls++;
  a.usage[ep].credits += u?.credits ?? 0;
};

export interface Inputs { contract: string; thread: string; clientName: string }

function shapeError(what: string) {
  return new ClockedError("bad_request", `Unexpected ${what} response shape`);
}

export function parseVerdict(res: DecideResponse): Verdict {
  const a = res.answers;
  const outside = a?.outside_contract, paid = a?.paid_agreement, kind = a?.kind, effort = a?.effort;
  if (outside?.type !== "noul" || paid?.type !== "noul") throw shapeError("decide");
  return {
    outside: (outside as DecideNoul).noul,
    paid: (paid as DecideNoul).noul,
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
  return { verdict, route: route(verdict.outside, verdict.paid), usage };
}

/** Full analysis. `onUpdate` receives the (mutated) state after every change; partial results are always kept. */
export async function analyze(inputs: Inputs, client: ClockedClient, onUpdate: (a: Analysis) => void = () => {}): Promise<Analysis> {
  const messages = parseThread(inputs.thread, inputs.clientName);
  const clientMsgs = messages.filter((m) => m.isClient);
  const a: Analysis = { messages, messageStates: clientMsgs.map((m) => ({ messageIndex: m.index, status: "pending" })), items: [], usage: emptyUsage() };
  const emit = () => onUpdate(a);
  emit();

  await Promise.all(
    clientMsgs.map(async (msg, n) => {
      const st = a.messageStates[n];
      st.status = "running";
      emit();
      let found: Awaited<ReturnType<typeof extractMessage>>;
      try {
        found = await extractMessage(client, msg);
      } catch (e) {
        st.status = "failed";
        st.error = (e as Error).message;
        emit();
        return;
      }
      addUsage(a, "extract", found.usage);
      st.status = "done";
      st.requestCount = found.requests.length;
      const mine = found.requests.map((r, k): RequestItem => ({ id: `${msg.index}-${k}`, messageIndex: msg.index, text: r.text, evidence: r.evidence, status: "running" }));
      a.items.push(...mine);
      emit();
      await Promise.all(
        mine.map(async (item) => {
          try {
            const d = await decideRequest(client, inputs, item.text);
            addUsage(a, "decide", d.usage);
            item.verdict = d.verdict;
            item.route = d.route;
            item.status = "done";
          } catch (e) {
            item.status = "failed";
            item.error = (e as Error).message;
          }
          emit();
        }),
      );
    }),
  );
  // Stable order regardless of completion order.
  a.items.sort((x, y) => x.messageIndex - y.messageIndex || x.id.localeCompare(y.id, undefined, { numeric: true }));
  emit();
  return a;
}

export interface ChangeOrder {
  category: string | null;
  unpaidRisk: string | null;
  /** null = no price quoted in the thread */
  priceMentioned: string | null;
  /** AI-generated drafts: never present as quotations. */
  message: string | null;
  nextStep: string | null;
  usage: ClockedUsage | null;
}

export async function fillChangeOrder(client: ClockedClient, inputs: Inputs, request: string): Promise<ChangeOrder> {
  const { body } = buildFillRequest(inputs.contract, inputs.thread, request);
  const { data, usage } = await client.call<FillResponse>("fill", body);
  const f = data.fields;
  if (!f) throw shapeError("fill");
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
  return {
    category: str(f.category?.value),
    unpaidRisk: str(f.unpaid_risk?.value),
    priceMentioned: str(f.price_mentioned?.value),
    message: str(f.change_order_message?.value),
    nextStep: str(f.next_step?.value),
    usage,
  };
}

export { cpLength };
