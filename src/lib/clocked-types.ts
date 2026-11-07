// Response shapes verified against RAW HTTP output of scripts/smoke.ts on 7 Nov 2026.
// There is NO `data` wrapper (that only exists in the playground). Offsets are Unicode code points.

export interface DecideNoul { type: "noul"; noul: number; decision?: boolean; threshold?: number }
export interface DecideChoice { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
/** `score` is ZERO-BASED (0 = first criterion). */
export interface DecideScore { type: "score"; score: number; legend: Record<string, string>; probabilities: Record<string, number>; confidence: number }
export type DecideAnswer = DecideNoul | DecideChoice | DecideScore;

export interface DecideResponse {
  model: string;
  answers: Record<string, DecideAnswer>;
  usage?: { input_tokens: number; output_tokens: number };
}

export interface ExtractItem { value: string; start: number; end: number; confidence: number; p_verify?: number }
/** Missing info => value: null. List fields: value is string[] and `items` carry offsets. */
export interface ExtractField {
  value: string | string[] | null;
  start?: number;
  end?: number;
  confidence: number;
  p_verify?: number;
  items?: ExtractItem[];
}
export interface ExtractResponse { model: string; fields: Record<string, ExtractField>; timing?: unknown }

export interface FillField {
  value: string | string[] | boolean | number | null;
  confidence: number;
  start?: number;
  end?: number;
  p_verify?: number;
  probabilities?: Record<string, number>;
  expected?: number;
  /** "generated" => never display as a quotation from the thread. */
  source?: "generated";
}
export interface FillResponse { model: string; fields: Record<string, FillField>; timing?: unknown }

/** Response headers worth surfacing (all strings). */
export interface ClockedUsage { credits: number; costUsd: number; modelMs: number }

/** POST /clocked/grounding (Verify), verified against a real call on 7 Nov 2026. Offsets are local to the named document (code points). */
export interface VerifyEvidence { document: string; quote: string; start: number; end: number; confidence: number }
export interface VerifyClaim {
  claim: string;
  /** "claim" | "offer_or_question" | "meta" | ... */
  kind: string;
  verdict: "supported" | "contradicted" | "not_stated" | "not_a_claim" | string;
  supported: number;
  contradicted: number;
  not_stated: number;
  source: string | null;
  evidence?: VerifyEvidence;
}
export interface VerifyResponse { model: string; grounded: number; ungrounded: number; verdict: string; threshold: number; claims: VerifyClaim[] }
