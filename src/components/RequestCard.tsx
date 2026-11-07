import { forwardRef } from "react";
import type { RequestItem } from "../lib/pipeline";
import { THRESHOLDS } from "../lib/routing";
import { ProbBar } from "./ProbBar";
import { QUEUES } from "./queues";

const EFFORT = ["Trivial (minutes)", "Small (under a day)", "Medium (a few days)", "Large (a week or more)"];
const effortLabel = (score: number) => EFFORT[Math.min(3, Math.max(0, Math.round(score)))];

interface Props { item: RequestItem; active: boolean; speaker: string; onShow: () => void; onRetry: () => void }

export const RequestCard = forwardRef<HTMLElement, Props>(function RequestCard({ item, active, speaker, onShow, onRetry }, ref) {
  const q = item.route ? QUEUES[item.route.queue] : null;
  const withdrawn = item.route?.queue === "withdrawn";
  const v = item.verdict;
  return (
    <article ref={ref} id={`card-${item.id}`} aria-busy={item.status === "running"}
      className={`rounded-xl border bg-card p-4 shadow-[0_1px_0_rgb(0_0_0/.03)] transition ${active ? "border-navy ring-2 ring-navy/20" : "border-line"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`font-display text-[1.05rem] leading-snug ${withdrawn ? "text-muted line-through decoration-withdrawn" : ""}`}>
          {item.text}
        </p>
        {item.status === "running" && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted" role="status"><span className="spinner" /> Checking</span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">{speaker} · message {item.messageIndex + 1}{item.evidence ? "" : " · exact sentence could not be located"}</p>

      {item.status === "failed" && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-change/30 bg-change-bg/60 px-3 py-2 text-sm">
          <span className="text-change">Could not check this request: {item.error}</span>
          <button onClick={onRetry} className="rounded-md bg-navy px-3 py-1 text-xs font-medium text-white hover:bg-navy/90">Retry</button>
        </div>
      )}

      {v && q && item.route && (
        <>
          <p className={`mt-3 text-sm ${q.text}`}>{item.route.reason}</p>
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

      {item.evidence && (
        <button onClick={onShow} className="mt-3 text-xs font-medium text-navy underline decoration-navy/30 underline-offset-4 hover:decoration-navy">
          Show in thread
        </button>
      )}
    </article>
  );
});
