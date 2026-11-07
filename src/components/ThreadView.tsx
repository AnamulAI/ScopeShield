import { useMemo } from "react";
import { describeError } from "../lib/errors";
import type { Analysis } from "../lib/pipeline";
import { segmentMessage } from "../lib/thread";
import { effectiveQueue } from "../lib/routing";
import { QueueIcon } from "./icons";
import { QUEUES } from "./queues";

interface Props {
  analysis: Analysis; openIds: Set<string>; activeId: string | null; onPick: (id: string) => void; onRetryMessage: (messageIndex: number) => void;
  /** Replay: how many messages are shown. Hidden ones stay in the DOM (layout reserved, no shift) but are inert and invisible. */
  revealed?: number;
}

export function ThreadView({ analysis, openIds, activeId, onPick, onRetryMessage, revealed = Infinity }: Props) {
  // Main span = the request; secondary spans = agreement/withdrawal sentence and the quoted price.
  const spans = useMemo(() => {
    const out: { id: string; start: number; end: number }[] = [];
    for (const i of analysis.items) {
      if (i.evidence) out.push({ id: i.id, ...i.evidence });
      if (i.support?.evidence) out.push({ id: `${i.id}:support`, ...i.support.evidence });
      if (i.agreedPrice?.evidence) out.push({ id: `${i.id}:agreedprice`, ...i.agreedPrice.evidence });
      const pe = i.changeOrder?.data?.priceEvidence;
      if (pe) out.push({ id: `${i.id}:price`, ...pe });
      // Verify evidence in the thread, only while that change order is open (keeps the thread calm otherwise).
      if (openIds.has(i.id)) i.changeOrder?.verify?.claims?.forEach((c, k) => { if (c.evidence?.document === "thread" && c.evidence.located) out.push({ id: `${i.id}:v${k}`, start: c.evidence.start, end: c.evidence.end }); });
    }
    return out.sort((a, b) => (a.id.includes(":") ? 1 : 0) - (b.id.includes(":") ? 1 : 0)); // requests win overlaps
  }, [analysis.items, openIds]);
  const itemById = useMemo(() => new Map(analysis.items.map((i) => [i.id, i])), [analysis.items]);
  const stateOf = (idx: number) => analysis.messageStates.find((s) => s.messageIndex === idx);

  return (
    <ol className="space-y-3" aria-label="Thread with evidence highlighted">
      {analysis.messages.map((m) => {
        const st = stateOf(m.index);
        const hidden = m.index >= revealed;
        const mine = analysis.items.filter((i) => i.messageIndex === m.index);
        return (
          <li key={m.index} id={`msg-${m.index}`} data-hidden={hidden ? "true" : undefined} aria-hidden={hidden ? true : undefined} inert={hidden ? true : undefined}
            className={`replay-item rounded-2xl px-4 py-3 text-[0.9375rem] leading-6 ${hidden ? "is-hidden" : ""} ${m.isClient ? "surface" : "ml-4 border-l-2 border-line pl-4 text-muted sm:ml-8"}`}>
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <span className={`t-eyebrow ${m.isClient ? "text-navy" : "text-muted"}`}>{m.speaker}{m.isClient ? " · client" : ""}</span>
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
                const secondary = sub === "support" ? (item.support?.kind === "agreement" ? "Agreement sentence" : "Withdrawal sentence") : sub === "price" ? "Price quoted" : sub === "agreedprice" ? "Agreed price" : sub?.startsWith("v") ? `Verify evidence (${item.changeOrder?.verify?.claims?.[Number(sub.slice(1))]?.verdict?.replace("_", " ") ?? ""})` : null;
                return (
                  <mark key={k} id={`ev-${seg.id}`} onClick={() => onPick(seg.id!)} title={secondary ?? (q ? q.label : "Checking")}
                    className={`cursor-pointer rounded px-1 py-0.5 text-ink [box-decoration-break:clone] ${secondary ? "border-b-2 border-dashed border-ink bg-card font-medium ring-1 ring-ink/20" : `border-b-2 ${q ? `${q.bg} ${q.border}` : "bg-pending-bg border-line"}`} ${withdrawn && !secondary ? "line-through" : ""} ${activeId === seg.id ? "sweep outline outline-2 outline-navy" : ""}`}>
                    {seg.text}
                  </mark>
                );
              })}
            </p>
            {mine.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {mine.map((i) => {
                  const eq = effectiveQueue(i.route, i.decision);
                  if (eq === "pending") return null;
                  return (
                    <button key={i.id} onClick={() => onPick(i.id)} title="Go to this request's card"
                      className={`chip-in press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${QUEUES[eq].bg} ${QUEUES[eq].text}`}>
                      <QueueIcon queue={eq} width={14} height={14} />{QUEUES[eq].label}
                    </button>
                  );
                })}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
