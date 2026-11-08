// M9-M12 feature runs. Each call changes what the app does or shows; model judgments are estimates, never facts.
import type { ClockedClient } from "./clocked";
import { ClockedError } from "./clocked";
import type { CompareResponse, GuardResponse, PiiResponse, RerankResponse } from "./clocked-types";
import { addUsage, shapeError, type Analysis, type Inputs, type RequestItem } from "./base";
import { buildRerankRequest, pickGoverning, splitClauses } from "./governing";
import { buildGuardInput, buildGuardRequest, mapGuardEvidence } from "./guard";
import { buildPiiRequest, toPack } from "./protect";
import { buildPromiseInput, buildPromiseRequest, toConflicts } from "./promise";

const kindOf = (e: unknown) => (e instanceof ClockedError ? e.kind : undefined);

/** M9 Guard: one call over the client's messages only. Flagged messages are withheld from the model state. Never blocks the analysis. */
export async function runGuard(a: Analysis, inputs: Inputs, client: ClockedClient, emit: () => void) {
  const clientMsgs = a.messages.filter((m) => m.isClient);
  if (clientMsgs.length === 0) return;
  a.guard = { status: "running", flags: [], unlocated: 0, withheld: [], included: [], includedResults: a.guard?.includedResults };
  emit();
  try {
    const input = buildGuardInput(clientMsgs);
    const { data, usage } = await client.call<GuardResponse>("injection", buildGuardRequest(input));
    addUsage(a, "guard", usage);
    if (typeof data.injection !== "number" || !data.verdict) throw shapeError("injection");
    const mapped = data.verdict === "injection" ? mapGuardEvidence(input, data.evidence ?? []) : { flags: [], unlocated: 0 };
    a.guard = {
      status: "done",
      result: { injection: data.injection, verdict: data.verdict, category: data.category, severity: data.severity },
      flags: mapped.flags,
      unlocated: mapped.unlocated + (data.verdict === "injection" && (data.evidence ?? []).length === 0 ? 1 : 0),
      withheld: mapped.flags.map((f) => f.messageIndex),
      included: [],
      includedResults: a.guard?.includedResults,
    };
  } catch (e) {
    a.guard = { status: "failed", error: (e as Error).message, errorKind: kindOf(e), flags: [], unlocated: 0, withheld: [], included: [] };
  }
  emit();
}

/** M10 Rerank: which clause governs this request? One call per active (not withdrawn) request. */
export async function runGoverning(a: Analysis, item: RequestItem, inputs: Inputs, client: ClockedClient, emit: () => void) {
  a.clauses ??= splitClauses(inputs.contract);
  item.governing = { status: "running" };
  emit();
  try {
    const { data, usage } = await client.call<RerankResponse>("rerank", buildRerankRequest(a.clauses, item.text));
    addUsage(a, "rerank", usage);
    if (!Array.isArray(data.results)) throw shapeError("rerank");
    item.governing = { status: "done", ...pickGoverning(data, a.clauses) };
  } catch (e) {
    item.governing = { status: "failed", error: (e as Error).message };
  }
  emit();
}

/** M12 Compare: the freelancer's own statements against the contract. One call per analysis; skipped when the thread has no freelancer messages. */
export async function runPromiseCheck(a: Analysis, inputs: Inputs, client: ClockedClient, emit: () => void) {
  const input = buildPromiseInput(a.messages);
  if (input.parts.length === 0 || inputs.contract.trim() === "") return;
  a.promiseCheck = { status: "running", conflicts: [] };
  emit();
  try {
    const { data, usage } = await client.call<CompareResponse>("compare", buildPromiseRequest(inputs.contract, input));
    addUsage(a, "compare", usage);
    if (!Array.isArray(data.pairs)) throw shapeError("compare");
    a.promiseCheck = { status: "done", conflicts: toConflicts(data, inputs.contract, input) };
  } catch (e) {
    a.promiseCheck = { status: "failed", conflicts: [], error: (e as Error).message };
  }
  emit();
}

/** M11 Protect: masks sensitive data in an evidence pack. The original text is never altered. */
export async function runProtect(a: Analysis, itemId: string, packText: string, client: ClockedClient, emit: () => void) {
  a.packs ??= {};
  a.packs[itemId] = { text: packText, status: "running" };
  emit();
  try {
    const { data, usage } = await client.call<PiiResponse>("pii", buildPiiRequest(packText));
    addUsage(a, "pii", usage);
    if (!Array.isArray(data.entities)) throw shapeError("pii");
    a.packs[itemId] = toPack(data, packText);
  } catch (e) {
    a.packs[itemId] = { text: packText, status: "failed", error: (e as Error).message };
  }
  emit();
}
