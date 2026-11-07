import type { Analysis } from "./pipeline";

/** A recorded live run. `analysis` is the full pipeline state, including Fill results. */
export interface Snapshot {
  id: string;
  title: string;
  recordedAt: string; // YYYY-MM-DD
  credits: { extract: number; decide: number; fill: number; total: number };
  inputs: { contract: string; thread: string; clientName: string };
  analysis: Analysis;
}
