import { useEffect, useMemo, useRef, useState } from "react";
import { totalCredits, type Analysis } from "../lib/pipeline";
import { effectiveQueue, type Decision, type Queue } from "../lib/routing";
import { RequestCard } from "./RequestCard";
import { describeError, worstKind } from "../lib/errors";
import { QUEUE_ORDER, QUEUES } from "./queues";
import { ScopeHealth } from "./ScopeHealth";
import { ThreadView } from "./ThreadView";

interface Props {
  analysis: Analysis; running: boolean;
  onRetryItem: (id: string) => void; onRetryMessage: (idx: number) => void;
  onDecide: (id: string, d: Decision | undefined) => void; onPrepare: (id: string) => void; onPrepareAll: () => void;
  onRegenerate: (id: string) => void; onRetrySupport: (id: string) => void;
  recorded?: boolean; onSwitchDemo?: () => void;
  /** Demo only: shown when the current sample has no Ask me item. */
  askHint?: { onOpen: () => void };
}

export function Results({ analysis, running, onRetryItem, onRetryMessage, onDecide, onPrepare, onPrepareAll, onRegenerate, onRetrySupport, recorded, onSwitchDemo, askHint }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<"findings" | "thread">("findings");
  const timer = useRef<number>(0);
  const [openCO, setOpenCO] = useState<Set<string>>(new Set());
  const setCoOpen = (id: string, v: boolean) => setOpenCO((prev) => { const n = new Set(prev); if (v) n.add(id); else n.delete(id); return n; });

  const groups = useMemo(() => {
    const g = new Map<Queue | "pending", typeof analysis.items>();
    for (const item of analysis.items) {
      const key = effectiveQueue(item.route, item.decision);
      g.set(key, [...(g.get(key) ?? []), item]);
    }
    return g;
  }, [analysis.items]);

  const msgDone = analysis.messageStates.filter((m) => m.status === "done" || m.status === "failed").length;
  const itemsDone = analysis.items.filter((i) => i.status === "done" || i.status === "failed").length;
  const failures = analysis.messageStates.filter((m) => m.status === "failed").length + analysis.items.filter((i) => i.status === "failed").length;
  const kinds = [...analysis.messageStates, ...analysis.items].map((x) => (x.status === "failed" ? x.errorKind : undefined))
    .concat(analysis.items.map((i) => (i.changeOrder?.status === "failed" ? i.changeOrder.errorKind : undefined)));
  const worst = worstKind(kinds);
  const described = worst ? describeError(worst) : null;
  const finished = !running;
  const speaker = (idx: number) => analysis.messages[idx]?.speaker ?? "";

  const focus = (id: string, from: "card" | "thread") => {
    setActiveId(id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setActiveId(null), 2500);
    const showThread = from === "card";
    if (window.matchMedia("(max-width: 1023px)").matches) setTab(showThread ? "thread" : "findings");
    requestAnimationFrame(() => document.getElementById(showThread ? `ev-${id}` : `card-${id.split(":")[0]}`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }));
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const total = analysis.items.length;
  const card = (item: (typeof analysis.items)[number]) => (
    <RequestCard key={item.id} item={item} active={activeId?.split(":")[0] === item.id} speaker={speaker(item.messageIndex)}
      coOpen={openCO.has(item.id)} setCoOpen={(v) => setCoOpen(item.id, v)}
      onShow={(span) => focus(span, "card")} onRetry={() => onRetryItem(item.id)} onDecide={(d) => { if (d === "extra") setCoOpen(item.id, true); onDecide(item.id, d); }}
      onPrepare={() => onPrepare(item.id)} onRegenerate={() => onRegenerate(item.id)} onRetrySupport={() => onRetrySupport(item.id)} />
  );
  const preparable = (groups.get("needs_change_order") ?? []).filter((i) => i.status === "done" && (!i.changeOrder || i.changeOrder.status === "failed"));
  return (
    <section aria-label="Results" className="space-y-5">
      <div className="rounded-xl border border-line bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl">{finished ? "Analysis" : "Analysing…"}</h2>
          <p className="text-xs text-muted" role="status">
            {running
              ? `Reading client messages ${msgDone}/${analysis.messageStates.length} · checked ${itemsDone}/${total} requests`
              : `${total} request${total === 1 ? "" : "s"} found in ${analysis.messageStates.length} client message${analysis.messageStates.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {QUEUE_ORDER.map((q) => (
            <li key={q} className={`rounded-lg px-3 py-2 ${QUEUES[q].bg}`}>
              <div className={`font-display text-2xl leading-none ${QUEUES[q].text}`}>{groups.get(q)?.length ?? 0}</div>
              <div className="mt-1 text-xs text-ink/80">{QUEUES[q].label}</div>
            </li>
          ))}
        </ul>
        {described && (
          <div role="alert" className="mt-3 rounded-lg border border-change/30 bg-change-bg/70 px-3 py-2 text-sm text-change">
            <b>{described.title}</b> {described.hint}
            {finished && failures > 0 && <span> {failures} step{failures === 1 ? "" : "s"} failed; everything else is kept, and each failed item has its own Retry.</span>}
            {described.demo && onSwitchDemo && (
              <button onClick={onSwitchDemo} className="ml-2 rounded-md bg-navy px-3 py-1 text-xs font-semibold text-white">Switch to Demo mode</button>
            )}
          </div>
        )}
      </div>

      <ScopeHealth items={analysis.items} />

      <div className="flex gap-1 lg:hidden" role="group" aria-label="Show findings or thread">
        {(["findings", "thread"] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${tab === t ? "bg-navy text-white" : "border border-line bg-card"}`}>
            {t === "findings" ? "Findings" : "Thread"}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className={`${tab === "findings" ? "" : "hidden"} space-y-7 lg:block`}>
          {finished && total === 0 && failures === 0 && (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">No actionable request was found in the client’s messages.</p>
          )}
          {groups.has("pending") && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted">Checking</h3>
              {groups.get("pending")!.map(card)}
            </div>
          )}
          {askHint && finished && !groups.get("ask_me")?.length && (
            <p className="rounded-lg border border-dashed border-ask/40 bg-ask-bg/30 px-3 py-2 text-xs text-muted">
              No Ask me items in this thread.{" "}
              <button onClick={askHint.onOpen} className="font-medium text-ask underline underline-offset-4">See an Ask me example in the Brand identity sample</button>
            </p>
          )}
          {QUEUE_ORDER.filter((q) => groups.get(q)?.length).map((q) => (
            <div key={q} className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className={`font-display text-lg ${QUEUES[q].text}`}>{QUEUES[q].label} <span className="text-sm text-muted">({groups.get(q)!.length})</span></h3>
                  <p className="text-xs text-muted">{QUEUES[q].blurb}</p>
                </div>
                {q === "needs_change_order" && preparable.length > 1 && (
                  <button onClick={onPrepareAll} className="rounded-md border border-navy/30 bg-card px-3 py-1.5 text-xs font-semibold text-navy hover:border-navy">
                    Prepare all ({preparable.length}) · about {preparable.length * 8} credits
                  </button>
                )}
              </div>
              {groups.get(q)!.map(card)}
            </div>
          ))}
        </div>

        <aside className={`${tab === "thread" ? "" : "hidden"} lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1`}>
          <h3 className="mb-2 font-display text-lg">Thread</h3>
          <ThreadView analysis={analysis} activeId={activeId} onPick={(id) => focus(id, "thread")} onRetryMessage={onRetryMessage} />
        </aside>
      </div>

      <footer className="border-t border-line pt-3 text-xs text-muted">
        {recorded ? "Credits used to record this run" : "Credits used this run"}: <b className="text-ink">{totalCredits(analysis.usage)}</b> (read {analysis.usage.extract.credits}, check {analysis.usage.decide.credits}, agreed prices {analysis.usage.price?.credits ?? 0}, change orders {analysis.usage.fill.credits}). Effort labels are rough estimates, not quotes. Probabilities come from the Clocked API; the routing thresholds are this app’s.
      </footer>
    </section>
  );
}
