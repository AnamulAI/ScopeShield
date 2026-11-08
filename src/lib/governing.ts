// Rerank (M10): which contract clause governs a request?
import type { RerankResponse } from "./clocked-types";

export interface Clause { id: string; text: string }

/**
 * Deterministic clause splitter: one clause per sentence, line, or semicolon-separated part (ids c1..cn).
 * "Excluded: a, b, c." stays ONE clause, because an exclusion list is a single clause.
 */
export function splitClauses(contract: string): Clause[] {
  const parts = contract
    .split(/\r\n|\n|\r/)
    .flatMap((line) => line.split(/(?<=[.!?;])\s+(?=[A-Z0-9"“(])/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts.slice(0, 256).map((text, i) => ({ id: `c${i + 1}`, text }));
}

export const RERANK_INSTRUCTIONS =
  "The documents are clauses of a freelance contract. A clause governs the request if it includes the requested work or excludes it (an exclusion list that names the work counts). Clauses about price, delivery or revisions do not govern a request unless the request is about them.";

/** The query is phrased as a question about the contract: a bare request ("add a blog section") ranked the price clause first in our tests. */
export const buildRerankRequest = (clauses: Clause[], request: string) => ({
  query: `Which clause of the contract governs this client request: ${request}`,
  instructions: RERANK_INSTRUCTIONS,
  documents: clauses.map((c) => ({ id: c.id, text: c.text })),
});

export interface Governing {
  status: "running" | "done" | "failed";
  /** null = no clause covers this request */
  clauseId?: string | null;
  text?: string | null;
  /** the model's relevance estimate (0-1), not a fact */
  relevance?: number;
  error?: string;
}

/** Best clause with action "use"; if none, "No clause covers this request". */
export function pickGoverning(res: RerankResponse, clauses: Clause[]): { clauseId: string | null; text: string | null; relevance: number } {
  const used = (res.results ?? []).filter((r) => r.action === "use").sort((a, b) => b.relevance_score - a.relevance_score)[0];
  const clause = used ? (clauses[used.index] ?? clauses.find((c) => c.id === used.id)) : undefined;
  return clause ? { clauseId: clause.id, text: clause.text, relevance: used!.relevance_score } : { clauseId: null, text: null, relevance: 0 };
}
