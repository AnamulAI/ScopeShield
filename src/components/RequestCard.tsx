import { forwardRef } from "react";
import type { RequestItem } from "../lib/pipeline";
import { askQuestion, effectiveQueue, THRESHOLDS, type Decision } from "../lib/routing";
import { ChangeOrderPanel } from "./ChangeOrderPanel";
import { ProbBar } from "./ProbBar";
import { QUEUES } from "./queues";

const EFFORT = ["Trivial (minutes)", "Small (under a day)", "Medium (a few days)", "Large (a week or more)"];
const effortLabel = (score: number) => EFFORT[Math.min(3, Math.max(0, Math.round(score)))];
const DECISION_LABEL: Record<Decision, string> = { in_scope: "In scope", extra: "Extra work", skip: "Skipped for now" };

export interface CardActions {
  onShow: (spanId: string) => void;
  onRetry: () => void;
  onDecide: (d: Decision | undefined) => void;
  onPrepare: () => void;
  onRegenerate: () => void;
  onRetrySupport: () => void;
}
interface Props extends CardActions { item: RequestItem; active: boolean; speaker: string }

const btn = "rounded-lg border px-4 py-2 text-sm font-semibold transition";

export const RequestCard = forwardRef<HTMLElement, Props>(function RequestCard({ item, active, speaker, onShow, onRetry, onDecide, onPrepare, onRegenerate, onRetrySupport }, ref) {
  const eq = effectiveQueue(item.route, item.decision);
  const modelQ = item.route ? QUEUES[item.route.queue] : null;
  const withdrawn = eq === "withdrawn";
  const v = item.verdict;
  const needsAnswer = item.route?.queue === "ask_me" && (item.decision === undefined);

  return (
    <article ref={ref} id={`card-${item.id}`} aria-busy={item.status === "running"}
      className={`rounded-xl border bg-card p-4 shadow-[0_1px_0_rgb(0_0_0/.03)] transition ${active ? "border-navy ring-2 ring-navy/20" : "border-line"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`font-display text-[1.05rem] leading-snug ${withdrawn ? "text-muted line-through decoration-withdrawn" : ""}`}>{item.text}</p>
        {item.status === "running" && <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted" role="status"><span className="spinner" /> Checking</span>}
      </div>
      <p className="mt-1 text-xs text-muted">{speaker} · message {item.messageIndex + 1}{item.evidence ? "" : " · exact sentence could not be located"}</p>

      {item.status === "failed" && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-change/30 bg-change-bg/60 px-3 py-2 text-sm">
          <span className="text-change">Could not check this request: {item.error}</span>
          <button onClick={onRetry} className="rounded-md bg-navy px-3 py-1 text-xs font-medium text-white hover:bg-navy/90">Retry</button>
        </div>
      )}

      {v && modelQ && item.route && (
        <>
          <p className={`mt-3 text-sm ${modelQ.text}`}>{item.route.reason}</p>
          <div className="mt-3 space-y-1.5">
            <ProbBar label="Outside contract" value={v.outside} ticks={[THRESHOLDS.inScopeBelow, THRESHOLDS.outsideAtLeast]} tone="bg-navy" hint="Ticks at 30% and 70%: below 30% is in scope, from 70% is outside." />
            <ProbBar label="Agreed to pay" value={v.paid} ticks={[THRESHOLDS.paidNo, THRESHOLDS.paidYes]} tone="bg-agreed" hint="Ticks at 25% and 75%." />
            <ProbBar label="Later withdrawn" value={v.withdrawn} ticks={[THRESHOLDS.withdrawn]} tone="bg-withdrawn" hint="Tick at 75%." />
          </div>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>Tagged: <b className="font-medium text-ink">{v.kind.replace("_", " ")}</b></span>
            <span>Rough effort estimate: <b className="font-medium text-ink">{effortLabel(v.effort)}</b></span>
          </p>
        </>
      )}

      {/* ASK ME: one concrete question, three answers */}
      {item.route?.queue === "ask_me" && item.route.ask && (
        <div className="mt-4 rounded-lg border-l-4 border-ask bg-ask-bg/60 px-3.5 py-3">
          {needsAnswer ? (
            <>
              <p className="text-sm font-semibold" id={`q-${item.id}`}>{askQuestion(item.text, item.route.ask)}</p>
              <p className="mt-1 text-xs text-muted">Your answer is recorded below and you can undo it.</p>
              <div role="group" aria-labelledby={`q-${item.id}`} className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => onDecide("in_scope")} className={`${btn} border-scope/40 bg-card text-scope hover:border-scope`}>In scope</button>
                <button onClick={() => onDecide("extra")} className={`${btn} border-change/40 bg-card text-change hover:border-change`}>Extra work</button>
                <button onClick={() => onDecide("skip")} className={`${btn} border-line bg-card text-muted hover:border-ink/40`}>Skip</button>
              </div>
            </>
          ) : (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span>Your decision: <b>{DECISION_LABEL[item.decision!]}</b></span>
              <span className="text-xs text-muted">(model said: Ask me)</span>
              <button onClick={() => onDecide(undefined)} className="text-xs font-medium text-navy underline underline-offset-4">Undo</button>
            </p>
          )}
        </div>
      )}

      {/* AGREED EXTRA / WITHDRAWN: the sentence that supports the verdict */}
      {item.support && (
        <div className={`mt-4 rounded-lg border-l-4 px-3.5 py-3 text-sm ${item.support.kind === "agreement" ? "border-agreed bg-agreed-bg/60" : "border-withdrawn bg-withdrawn-bg/60"}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{item.support.kind === "agreement" ? "Agreement found" : "Withdrawal found"}</p>
          {item.support.status === "running" && <p role="status" className="mt-1 flex items-center gap-2 text-muted"><span className="spinner" /> Locating the sentence…</p>}
          {item.support.status === "failed" && (
            <p role="alert" className="mt-1 text-change">Could not locate the sentence. <button onClick={onRetrySupport} className="font-medium text-navy underline underline-offset-4">Retry</button></p>
          )}
          {item.support.status === "done" && (item.support.text ? (
            <p className="mt-1">“{item.support.text}”{" "}
              {item.support.evidence && <button onClick={() => onShow(`${item.id}:support`)} className="text-xs font-medium text-navy underline underline-offset-4">Show in thread</button>}
            </p>
          ) : <p className="mt-1 text-muted">No sentence was found. Check the thread yourself.</p>)}
        </div>
      )}
      {item.route?.queue === "agreed_extra" && (
        <p className="mt-3 rounded-lg bg-agreed-bg px-3 py-2 text-sm text-agreed"><b>Make sure this is invoiced.</b> The client agreed to pay, but nothing here shows it was billed.</p>
      )}

      {eq === "needs_change_order" && item.status === "done" && (
        <ChangeOrderPanel item={item} onPrepare={onPrepare} onRegenerate={onRegenerate} onShowPrice={() => onShow(`${item.id}:price`)} />
      )}

      {item.evidence && (
        <button onClick={() => onShow(item.id)} className="mt-3 block text-xs font-medium text-navy underline decoration-navy/30 underline-offset-4 hover:decoration-navy">
          Show request in thread
        </button>
      )}
    </article>
  );
});
