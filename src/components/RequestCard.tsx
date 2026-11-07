import { describeError } from "../lib/errors";
import { forwardRef } from "react";
import type { RequestItem } from "../lib/pipeline";
import { effortLabel } from "../lib/health";
import { askQuestion, effectiveQueue, showWithdrawalNote, THRESHOLDS, type Decision } from "../lib/routing";
import { QueueIcon, UndoIcon } from "./icons";
import type { Queue } from "../lib/routing";
import { ChangeOrderPanel } from "./ChangeOrderPanel";
import { ProbBar } from "./ProbBar";
import { QUEUES } from "./queues";

const DECISION_LABEL: Record<Decision, string> = { in_scope: "In scope", extra: "Extra work", skip: "Skipped for now" };

export interface CardActions {
  onShow: (spanId: string) => void;
  onRetry: () => void;
  onDecide: (d: Decision | undefined) => void;
  onPrepare: () => void;
  onRegenerate: () => void;
  onRetrySupport: () => void;
  onAck: () => void;
  onRetryVerify: () => void;
}
interface Props extends CardActions { item: RequestItem; active: boolean; speaker: string; coOpen: boolean; setCoOpen: (v: boolean) => void; /** position in its queue, for the short reveal stagger */ revealIndex?: number }

const btn = "rounded-lg border px-4 py-2 text-sm font-semibold press";

export const RequestCard = forwardRef<HTMLElement, Props>(function RequestCard({ item, active, speaker, coOpen, setCoOpen, revealIndex = 0, onShow, onRetry, onDecide, onPrepare, onRegenerate, onRetrySupport, onAck, onRetryVerify }, ref) {
  const eq = effectiveQueue(item.route, item.decision);
  const modelQ = item.route ? QUEUES[item.route.queue] : null;
  const withdrawn = eq === "withdrawn";
  const v = item.verdict;
  const needsAnswer = item.route?.queue === "ask_me" && (item.decision === undefined);

  const accent = eq === "pending" ? "border-l-line" : QUEUES[eq].accent;
  const pill = eq !== "pending" ? QUEUES[eq] : null;
  return (
    <article ref={ref} id={`card-${item.id}`} aria-busy={item.status === "running"}
      style={{ "--i": revealIndex } as React.CSSProperties}
      className={`rise surface border-l-4 p-5 sm:p-6 ${accent} ${active ? "ring-2 ring-navy/30" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {pill ? (
          <span className={`t-eyebrow inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${pill.bg} ${pill.text}`}>
            <QueueIcon queue={eq as Queue} width={16} height={16} />{pill.label}{item.decision && item.route?.queue === "ask_me" ? " · your decision" : ""}
          </span>
        ) : <span className="t-eyebrow text-muted">Checking</span>}
        <span className="text-xs text-muted">{speaker} · message {item.messageIndex + 1}{item.evidence ? "" : " · exact sentence could not be located"}</span>
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <p className={`font-display text-[1.1875rem] leading-snug ${withdrawn ? "text-muted line-through decoration-withdrawn/70" : ""}`}>{item.text}</p>
        {item.status === "running" && <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted" role="status"><span className="spinner" /> Checking</span>}
      </div>

      {item.status === "failed" && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-change/30 bg-change-bg px-4 py-3 text-sm">
          <span className="text-ink"><b className="text-change">{describeError(item.errorKind, item.error).title}</b> {describeError(item.errorKind, item.error).hint}</span>
          <button onClick={onRetry} className="rounded-lg bg-navy px-4 py-1.5 text-xs font-semibold text-paper shadow-card press hover:bg-navy/90">Retry</button>
        </div>
      )}

      {v && modelQ && item.route && (
        <>
          <p className="mt-3 text-sm text-ink/80">{item.route.reason}</p>
          {showWithdrawalNote(eq, v.withdrawn) && <p className="mt-1 text-sm text-muted">Withdrawal is below {Math.round(THRESHOLDS.withdrawn * 100)}%, so this request stays active.</p>}
          <div className="mt-4 space-y-2.5">
            <ProbBar label="Outside contract" value={v.outside} ticks={[THRESHOLDS.inScopeBelow, THRESHOLDS.outsideAtLeast]} tone="bg-navy" hint="Notches at 30% and 70%: below 30% is in scope, from 70% is outside." />
            <ProbBar label="Agreed to pay" value={v.paid} ticks={[THRESHOLDS.paidNo, THRESHOLDS.paidYes]} tone="bg-agreed" hint="Notches at 25% and 75%." />
            <ProbBar label="Later withdrawn" value={v.withdrawn} ticks={[THRESHOLDS.withdrawn]} tone="bg-withdrawn" hint="Notch at 75%." />
          </div>
          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            {eq !== "in_scope" && eq !== "withdrawn" && <span>Tagged: <b className="font-semibold text-ink">{v.kind.replace("_", " ")}</b></span>}
            <span>Rough effort estimate: <b className="font-semibold text-ink">{effortLabel(v.effort)}</b></span>
          </p>
        </>
      )}

      {/* ASK ME: one concrete question, three answers */}
      {item.route?.queue === "ask_me" && item.route.ask && (
        <div className="mt-5 rounded-2xl border border-ask/25 bg-ask-bg/60 p-4 sm:p-5">
          {needsAnswer ? (
            <>
              <p className="t-eyebrow text-ask">One question for you</p>
              <p className="font-display mt-1.5 text-[1.1875rem] leading-snug" id={`q-${item.id}`}>{askQuestion(item.text, item.route.ask)}</p>
              <div role="group" aria-labelledby={`q-${item.id}`} className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2.5">
                <button onClick={() => onDecide("in_scope")} className="rounded-xl border border-scope/40 bg-card px-4 py-3 text-left shadow-card press hover:border-scope hover:shadow-lift">
                  <span className="block text-sm font-semibold text-scope">In scope</span><span className="block text-xs text-muted">It was part of the deal</span>
                </button>
                <button onClick={() => onDecide("extra")} className="rounded-xl border border-change/40 bg-card px-4 py-3 text-left shadow-card press hover:border-change hover:shadow-lift">
                  <span className="block text-sm font-semibold text-change">Extra work</span><span className="block text-xs text-muted">Prepare a change order</span>
                </button>
                <button onClick={() => onDecide("skip")} className="rounded-xl border border-line bg-card px-4 py-3 text-left shadow-card press hover:border-ink/40 hover:shadow-lift">
                  <span className="block text-sm font-semibold text-ink/80">Skip</span><span className="block text-xs text-muted">Decide later</span>
                </button>
              </div>
              <p className="mt-3 text-xs text-muted">Your answer is recorded below and you can undo it.</p>
            </>
          ) : (
            <p className="pop-in flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span>Your decision: <b>{DECISION_LABEL[item.decision!]}</b></span>
              <span className="text-xs text-muted">(model said: Ask me)</span>
              <button onClick={() => onDecide(undefined)} className="press inline-flex items-center gap-1 text-xs font-semibold text-navy underline underline-offset-4"><UndoIcon className="undo-icon" width={14} height={14} />Undo</button>
            </p>
          )}
        </div>
      )}

      {/* AGREED EXTRA / WITHDRAWN: the sentence that supports the verdict */}
      {item.support && (
        <div className={`mt-5 rounded-xl border-l-4 px-4 py-3 text-sm ${item.support.kind === "agreement" ? "border-agreed bg-agreed-bg/70" : "border-withdrawn bg-withdrawn-bg/80"}`}>
          <p className="t-eyebrow text-muted">{item.support.kind === "agreement" ? "Agreement found" : "Withdrawal found"}</p>
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
        <div className="mt-3 rounded-xl bg-agreed-bg px-4 py-3 text-sm text-agreed">
          <p>
            <b>Agreed price:</b>{" "}
            {item.agreedPrice?.status === "running" && <span className="inline-flex items-center gap-1.5" role="status"><span className="spinner" /> Looking for the price…</span>}
            {item.agreedPrice?.status === "failed" && <span>could not be looked up.</span>}
            {item.agreedPrice?.status === "done" && (item.agreedPrice.value ? (
              <>
                <b>{item.agreedPrice.value}</b>{" "}
                {item.agreedPrice.evidence && <button onClick={() => onShow(`${item.id}:agreedprice`)} className="text-xs font-medium underline underline-offset-4">Show in thread</button>}
              </>
            ) : <em>No price found in the thread</em>)}
          </p>
          <p className="mt-1"><b>Make sure this is invoiced.</b> The client agreed to pay, but nothing here shows it was billed.</p>
        </div>
      )}

      {eq === "needs_change_order" && item.status === "done" && (
        <ChangeOrderPanel item={item} open={coOpen} setOpen={setCoOpen} onPrepare={onPrepare} onRegenerate={onRegenerate} onShowPrice={() => onShow(`${item.id}:price`)}
          onShowEvidence={onShow} onAck={onAck} onRetryVerify={onRetryVerify} />
      )}

      {item.evidence && (
        <button onClick={() => onShow(item.id)} className="mt-4 block text-xs font-semibold text-navy underline decoration-navy/30 underline-offset-4 hover:decoration-navy">
          Show request in thread →
        </button>
      )}
    </article>
  );
});
