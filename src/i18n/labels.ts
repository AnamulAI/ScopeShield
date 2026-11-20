// Display text for values the engine produces (queues, routing reasons, decisions). The engine keeps its English strings; the UI uses these.
import type { AskKind, Decision, Queue, RouteResult } from "../lib/routing";
import type { Key, TFn } from "./core";

export const queueLabel = (t: TFn, q: Queue) => t(`queue.${q}.label` as Key);
export const queueHeading = (t: TFn, q: Queue) => t(`queue.${q}.heading` as Key);
export const queueBlurb = (t: TFn, q: Queue) => t(`queue.${q}.blurb` as Key);
export const decisionLabel = (t: TFn, d: Decision) => t(`decision.${d}` as Key);

/** The routing reason as a fixed template per outcome (no model-generated text). */
export const reasonText = (t: TFn, r: RouteResult) =>
  t(r.queue === "ask_me" ? (r.ask === "agreement" ? "reason.ask_agreement" : "reason.ask_scope") : (`reason.${r.queue}` as Key));

/** The single Ask me question, from a template (same trimming as routing.askQuestion). */
export const askQuestionText = (t: TFn, request: string, ask: AskKind) =>
  t(ask === "scope" ? "ask.scope" : "ask.agreement", { r: request.replace(/[?.!\s]+$/, "") });

/** Decide's effort level nearest to the score, in the language of `t`. */
export const effortText = (t: TFn, score: number) => t(`effort.${Math.min(3, Math.max(0, Math.round(score)))}` as Key);
