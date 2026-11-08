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

// ===== M9-M12 endpoints. Shapes verified against RAW responses from scripts/smoke-extra.ts on 8 Nov 2026 (no `data` wrapper). =====

/** POST /clocked/injection (Guard). Offsets are code points of the submitted `text`. */
export interface GuardEvidence { quote: string; start: number; end: number; confidence: number; without?: number }
export interface GuardResponse {
  model: string;
  injection: number; // probability of injection
  verdict: "injection" | "benign" | string;
  threshold: number;
  source: string;
  category?: string;
  categories?: Record<string, number>;
  severity?: string;
  severity_expected?: number;
  evidence?: GuardEvidence[];
  residual?: number;
  residual_verdict?: string;
}

/** POST /clocked/rerank. One result per document, best first. */
export interface RerankResult { index: number; id?: string; action: "use" | "expand" | "skip" | string; reason?: string; relevance_score: number; document_score: number; levels: Record<string, number> }
export interface RerankResponse { model: string; results: RerankResult[]; usage?: { input_tokens: number } }

/** POST /clocked/pii (Protect). `entities[].value` holds the ORIGINAL sensitive text: the app never stores or shows it. */
export interface PiiEntity { type: string; value?: string; start: number; end: number; confidence: number; source?: string }
export interface PiiResponse { model: string; entities: PiiEntity[]; counts: Record<string, number>; threshold: number; anonymized_text?: string }

/** POST /clocked/compare. With two documents there is one pair; findings carry a passage from each side (offsets are per original document). */
export interface ComparePassage { document: string; quote: string; start: number; end: number; confidence: number }
export interface CompareFinding { kind?: string; kinds?: Record<string, number>; confidence?: number; a: ComparePassage; b: ComparePassage }
export interface ComparePair { a: string; b: string; relation: "same" | "overlapping" | "conflicting" | "unrelated" | string; related: number; probabilities?: Record<string, number>; duplicates: CompareFinding[]; conflicts: CompareFinding[] }
export interface CompareResponse { model: string; verdict: string; pairs: ComparePair[]; threshold: number }

/** POST /clocked/script (Inspect). Verified against raw responses on 8 Nov 2026. `evidence[].start/end` are code points of the submitted `script`. */
export interface ScriptEvidence { line: string; start: number; end: number; confidence: number }
export interface ScriptResponse {
  model: string;
  /** probabilities, 0-1 */
  malicious: number;
  suspicious: number;
  verdict: "benign" | "suspicious" | "malicious" | string;
  threshold: number;
  category?: string;
  severity?: string;
  evidence?: ScriptEvidence[];
}
