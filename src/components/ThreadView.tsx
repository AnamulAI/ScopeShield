import { useMemo } from "react";
import { describeError } from "../lib/errors";
import type { Analysis } from "../lib/pipeline";
import { segmentMessage } from "../lib/thread";
import { effectiveQueue } from "../lib/routing";
import { QUEUES } from "./queues";

interface Props { analysis: Analysis; activeId: string | null; onPick: (id: string) => void; onRetryMessage: (messageIndex: number) => void }

export function ThreadView({ analysis, activeId, onPick, onRetryMessage }: Props) {
  // Main span = the request; secondary spans = agreement/withdrawal sentence and the quoted price.
  const spans = useMemo(() => {
    const out: { id: string; start: number; end: number }[] = [];
    for (const i of analysis.items) {
      if (i.evidence) out.push({ id: i.id, ...i.evidence });
      if (i.support?.evidence) out.push({ id: `${i.id}:support`, ...i.support.evidence });
      const pe = i.changeOrder?.data?.priceEvidence;
      if (pe) out.push({ id: `${i.id}:price`, ...pe });
    }
    return out.sort((a, b) => (a.id.includes(":") ? 1 : 0) - (b.id.includes(":") ? 1 : 0)); // requests win overlaps
  }, [analysis.items]);
  const itemById = useMemo(() => new Map(analysis.items.map((i) => [i.id, i])), [analysis.items]);
  const stateOf = (idx: number) => analysis.messageStates.find((s) => s.messageIndex === idx);

  return (
    <ol className="space-y-2.5" aria-label="Thread with evidence highlighted">
      {analysis.messages.map((m) => {
        const st = stateOf(m.index);
        return (
          <li key={m.index} id={`msg-${m.index}`} className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${m.isClient ? "border border-line bg-card" : "bg-transparent text-muted"}`}>
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <span className={`text-xs font-semibold uppercase tracking-wide ${m.isClient ? "text-navy" : "text-muted"}`}>{m.speaker}{m.isClient ? " · client" : ""}</span>
              {st?.status === "running" && <span className="flex items-center gap-1 text-xs text-muted" role="status"><span className="spinner" /> Reading</span>}
              {st?.status === "done" && st.requestCount === 0 && <span className="text-xs text-muted">No actionable request</span>}
              {st?.status === "failed" && (
                <span className="flex items-center gap-2 text-xs text-change" role="alert">
                  <span title={describeError(st.errorKind, st.error).hint}>{describeError(st.errorKind, st.error).title}</span>
                  <button onClick={() => onRetryMessage(m.index)} className="rounded bg-navy px-2 py-0.5 text-white">Retry</button>
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap break-words">
              {segmentMessage(m, spans).map((seg, k) => {
                if (!seg.id) return <span key={k}>{seg.text}</span>;
                const [baseId, sub] = seg.id.split(":");
                const item = itemById.get(baseId)!;
                const eq = effectiveQueue(item.route, item.decision);
                const q = eq !== "pending" ? QUEUES[eq] : null;
                const withdrawn = eq === "withdrawn";
                const secondary = sub === "support" ? (item.support?.kind === "agreement" ? "Agreement sentence" : "Withdrawal sentence") : sub === "price" ? "Price quoted" : null;
                return (
                  <mark key={k} id={`ev-${seg.id}`} onClick={() => onPick(seg.id!)} title={secondary ?? (q ? q.label : "Checking")}
                    className={`cursor-pointer rounded-sm px-0.5 text-ink ${secondary ? "border-b-2 border-dashed border-ink bg-card font-medium ring-1 ring-ink/20" : `border-b-2 ${q ? `${q.bg} ${q.border}` : "bg-pending-bg border-line"}`} ${withdrawn && !secondary ? "line-through" : ""} ${activeId === seg.id ? "flash outline outline-2 outline-navy" : ""}`}>
                    {seg.text}
                  </mark>
                );
              })}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
