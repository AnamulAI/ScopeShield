import { useMemo } from "react";
import type { Analysis } from "../lib/pipeline";
import { segmentMessage } from "../lib/thread";
import { QUEUES } from "./queues";

interface Props { analysis: Analysis; activeId: string | null; onPick: (id: string) => void; onRetryMessage: (messageIndex: number) => void }

export function ThreadView({ analysis, activeId, onPick, onRetryMessage }: Props) {
  const spans = useMemo(
    () => analysis.items.filter((i) => i.evidence).map((i) => ({ id: i.id, start: i.evidence!.start, end: i.evidence!.end })),
    [analysis.items],
  );
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
                  Read failed
                  <button onClick={() => onRetryMessage(m.index)} className="rounded bg-navy px-2 py-0.5 text-white">Retry</button>
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap break-words">
              {segmentMessage(m, spans).map((seg, k) => {
                if (!seg.id) return <span key={k}>{seg.text}</span>;
                const item = itemById.get(seg.id)!;
                const q = item.route ? QUEUES[item.route.queue] : null;
                const withdrawn = item.route?.queue === "withdrawn";
                return (
                  <mark key={k} id={`ev-${seg.id}`} onClick={() => onPick(seg.id!)} title={q ? q.label : "Checking"}
                    className={`cursor-pointer rounded-sm border-b-2 px-0.5 text-ink ${q ? `${q.bg} ${q.border}` : "bg-pending-bg border-line"} ${withdrawn ? "line-through" : ""} ${activeId === seg.id ? "flash outline outline-2 outline-navy" : ""}`}>
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
