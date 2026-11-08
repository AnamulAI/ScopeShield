import { useMemo } from "react";
import { avatarColor, initials, participants, placeMessages } from "../lib/chat";
import { describeError } from "../lib/errors";
import type { Analysis } from "../lib/pipeline";
import { effectiveQueue } from "../lib/routing";
import { segmentMessage } from "../lib/thread";
import { QueueIcon, ShieldAlertIcon } from "./icons";
import { QUEUES } from "./queues";

interface Props {
  analysis: Analysis; openIds: Set<string>; activeId: string | null; onPick: (id: string) => void; onRetryMessage: (messageIndex: number) => void;
  /** Replay: how many messages are shown. Hidden ones stay in the DOM (layout reserved, no shift) but are inert and invisible. */
  revealed?: number;
  /** Replay only: index of the bubble that is about to appear (three-dot typing indicator). */
  typingIndex?: number | null;
  /** M9: Guard flags, with the user's choice to include or withhold a flagged message */
  onInclude?: (messageIndex: number) => void;
  onWithhold?: (messageIndex: number) => void;
}

/** The thread as a generic chat conversation: client on the left, everyone else on the right, evidence kept inside the bubbles. */
export function ThreadView({ analysis, openIds, activeId, onPick, onRetryMessage, revealed = Infinity, typingIndex = null, onInclude, onWithhold }: Props) {
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
    // M9 Guard: the passages Guard pointed at, and M12 Compare: the freelancer's statements that may conflict with the contract
    for (const f of analysis.guard?.flags ?? []) f.spans.forEach((sp, k) => out.push({ id: `guard${f.messageIndex}-${k}:guard`, ...sp }));
    analysis.promiseCheck?.conflicts.forEach((c, i) => c.yours.spans.forEach((sp, k) => out.push({ id: `promise${i}-${k}:promise`, ...sp })));
    return out.sort((a, b) => (a.id.includes(":") ? 1 : 0) - (b.id.includes(":") ? 1 : 0)); // requests win overlaps
  }, [analysis.items, analysis.guard, analysis.promiseCheck, openIds]);
  const itemById = useMemo(() => new Map(analysis.items.map((i) => [i.id, i])), [analysis.items]);
  const people = useMemo(() => participants(analysis.messages), [analysis.messages]);
  const placed = useMemo(() => placeMessages(analysis.messages), [analysis.messages]);
  const stateOf = (idx: number) => analysis.messageStates.find((s) => s.messageIndex === idx);

  return (
    <ol className="flex flex-col px-3 pb-6 pt-4 sm:px-4" aria-label="Messages, with the client's requests highlighted">
      {analysis.messages.map((m, n) => {
        const st = stateOf(m.index);
        const pl = placed[n];
        const right = pl.side === "right";
        const hidden = m.index >= revealed;
        const typing = typingIndex === m.index;
        const mine = analysis.items.filter((i) => i.messageIndex === m.index);
        const segs = segmentMessage(m, spans);
        const pulse = activeId !== null && segs.some((sg) => sg.id === activeId);
        const color = avatarColor(people, m.speaker);
        return (
          <li key={m.index} id={`msg-${m.index}`} data-side={pl.side} data-first={pl.firstInGroup ? "true" : undefined} data-hidden={hidden ? "true" : undefined}
            className={`relative flex ${right ? "justify-end" : "justify-start"} ${pl.firstInGroup ? (n === 0 ? "" : "mt-5") : "mt-1.5"}`}>
            {/* three-dot typing indicator (replay only): sits where the bubble is about to appear */}
            {typing && (
              <div aria-hidden="true" className={`typing absolute top-0 ${right ? "right-0 flex-row-reverse" : "left-0"} flex items-center gap-2`}>
                <span className="h-8 w-8 shrink-0" />
                <span className="flex items-center gap-1 rounded-2xl border border-line bg-card px-3 py-2.5 shadow-card"><i /><i /><i /></span>
              </div>
            )}
            <div aria-hidden={hidden ? true : undefined} inert={hidden ? true : undefined}
              className={`replay-item flex max-w-[84%] items-end gap-2 sm:max-w-[78%] ${right ? "flex-row-reverse" : ""} ${hidden ? "is-hidden" : ""}`}>
              {pl.firstInGroup ? (
                <span aria-hidden="true" title={m.speaker} className="mb-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-card" style={{ background: color }}>{initials(m.speaker)}</span>
              ) : <span className="h-8 w-8 shrink-0" />}
              <div className={`min-w-0 ${right ? "items-end text-right" : "items-start"} flex flex-col`}>
                {pl.firstInGroup && <span className="mb-1 px-1 text-xs font-semibold text-muted">{m.speaker}{m.isClient ? " · client" : ""}</span>}
                <p data-bubble className={`bubble whitespace-pre-wrap break-words px-4 py-2.5 text-left font-sans text-[0.9375rem] leading-6 ${right ? "bubble-right" : "bubble-left"} ${pl.firstInGroup ? (right ? "tail-right" : "tail-left") : ""} ${pulse ? "bubble-pulse" : ""}`}>
                  {segs.map((seg, k) => {
                    if (!seg.id) return <span key={k}>{seg.text}</span>;
                    const [baseId, sub] = seg.id.split(":");
                    const item = itemById.get(baseId);
                    if (!item) {
                      const isGuard = sub === "guard";
                      return (
                        <mark key={k} id={`ev-${seg.id}`} onClick={() => onPick(seg.id!)} title={isGuard ? "Flagged by Guard (estimate)" : "Possible conflict with the contract (please review)"}
                          className={`cursor-pointer rounded px-1 py-0.5 [box-decoration-break:clone] border-b-2 border-dashed ${isGuard ? "border-warn bg-warn-bg text-ink" : "border-ink bg-card text-ink ring-1 ring-ink/20"} ${activeId === seg.id ? "sweep outline outline-2 outline-navy" : ""}`}>
                          {seg.text}
                        </mark>
                      );
                    }
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
                {/* what the app found in this client message: verdict chips, or a quiet note */}
                {m.isClient && (mine.length > 0 || st) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1">
                    {(analysis.guard?.withheld.includes(m.index) || analysis.guard?.included.includes(m.index)) && (
                      <span data-guard-chip className="inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-warn/30 bg-warn-bg px-3 py-1.5 text-xs font-semibold text-warn">
                        <ShieldAlertIcon width={14} height={14} />
                        {analysis.guard?.withheld.includes(m.index) ? "Possible instruction to the analysis tool (estimate). Message withheld from the analysis." : "Flagged as a possible instruction. You chose to include it."}
                        {analysis.guard?.withheld.includes(m.index)
                          ? onInclude && <button onClick={() => onInclude(m.index)} className="press rounded-md bg-card px-2 py-0.5 font-semibold text-navy underline underline-offset-2">Include anyway</button>
                          : onWithhold && <button onClick={() => onWithhold(m.index)} className="press rounded-md bg-card px-2 py-0.5 font-semibold text-navy underline underline-offset-2">Withhold again</button>}
                      </span>
                    )}
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
                    {st?.status === "done" && st.requestCount === 0 && !st.withheld && <span className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs font-medium text-muted">No actionable request</span>}
                    {st?.status === "running" && <span className="flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-1 text-xs text-muted" role="status"><span className="spinner" /> Reading</span>}
                    {st?.status === "failed" && (
                      <span className="flex items-center gap-2 rounded-full bg-change-bg px-2.5 py-1 text-xs text-change" role="alert">
                        <span title={describeError(st.errorKind, st.error).hint}>{describeError(st.errorKind, st.error).title}</span>
                        <button onClick={() => onRetryMessage(m.index)} className="rounded bg-navy px-2 py-0.5 text-paper">Retry</button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
