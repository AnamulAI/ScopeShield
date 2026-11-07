import { useEffect, useMemo, useRef, useState } from "react";
import { totalCredits, type Analysis } from "../lib/pipeline";
import { effectiveQueue, type Decision, type Queue } from "../lib/routing";
import { RequestCard } from "./RequestCard";
import { describeError, worstKind } from "../lib/errors";
import { QUEUE_ORDER, QUEUES } from "./queues";
import { ErrorBanner } from "./ErrorBanner";
import { ScopeHealth } from "./ScopeHealth";
import { ThreadView } from "./ThreadView";

interface Props {
  analysis: Analysis; running: boolean;
  onRetryItem: (id: string) => void; onRetryMessage: (idx: number) => void;
  onDecide: (id: string, d: Decision | undefined) => void; onPrepare: (id: string) => void; onPrepareAll: () => void;
  onRegenerate: (id: string) => void; onRetrySupport: (id: string) => void;
  onAck: (id: string) => void; onRetryVerify: (id: string) => void;
  recorded?: boolean; onSwitchDemo?: () => void;
  /** Demo only: shown when the current sample has no Ask me item. */
  askHint?: { onOpen: () => void };
}

export function Results({ analysis, running, onRetryItem, onRetryMessage, onDecide, onPrepare, onPrepareAll, onRegenerate, onRetrySupport, onAck, onRetryVerify, recorded, onSwitchDemo, askHint }: Props) {
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
  const described = worst ? describeError(worst, undefined) : null;
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
      onPrepare={() => onPrepare(item.id)} onRegenerate={() => onRegenerate(item.id)} onRetrySupport={() => onRetrySupport(item.id)} onAck={() => onAck(item.id)} onRetryVerify={() => onRetryVerify(item.id)} />
  );
  const preparable = (groups.get("needs_change_order") ?? []).filter((i) => i.status === "done" && (!i.changeOrder || i.changeOrder.status === "failed"));
  const pct = analysis.messageStates.length ? Math.round((msgDone / analysis.messageStates.length) * 100) : 100;
  return (
    <section aria-label="Results" className="space-y-6">
      <div className="surface p-5 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="t-eyebrow text-muted">{finished ? (recorded ? "Recorded analysis" : "Analysis") : "Analysing"}</p>
            <h2 className="t-h2 mt-1">{finished ? `${total} request${total === 1 ? "" : "s"} found` : "Reading the thread…"}</h2>
          </div>
          <p className="text-sm text-muted" role="status">
            {running
              ? `Client messages read ${msgDone}/${analysis.messageStates.length} · requests checked ${itemsDone}/${total}`
              : `in ${analysis.messageStates.length} client message${analysis.messageStates.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {running && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper-deep" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Reading client messages">
            <div className="h-full rounded-full bg-navy transition-[width] duration-500" style={{ width: `${Math.max(pct, 6)}%` }} />
          </div>
        )}
        <div className="mt-6"><ScopeHealth items={analysis.items} /></div>
        {described && <ErrorBanner described={described} failures={finished ? failures : 0} onSwitchDemo={onSwitchDemo} />}
      </div>

      <div className="flex gap-2 lg:hidden" role="group" aria-label="Show findings or thread">
        {(["findings", "thread"] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}
            className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === t ? "bg-navy text-paper shadow-lift" : "border border-line bg-card text-navy"}`}>
            {t === "findings" ? "Findings" : "Thread"}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
        <div className={`${tab === "findings" ? "" : "hidden"} space-y-10 lg:block`}>
          {finished && total === 0 && failures === 0 && (
            <div className="surface border-dashed p-8 text-center">
              <p className="t-h3">No actionable request found</p>
              <p className="mt-1 text-sm text-muted">The client’s messages contained nothing that asks for work. If that looks wrong, check the client name.</p>
            </div>
          )}
          {groups.has("pending") && (
            <div className="space-y-4">
              <h3 className="t-eyebrow text-muted">Checking</h3>
              {groups.get("pending")!.map(card)}
            </div>
          )}
          {askHint && finished && !groups.get("ask_me")?.length && (
            <p className="rounded-xl border border-dashed border-ask/40 bg-ask-bg/40 px-4 py-3 text-sm text-ink/80">
              No Ask me items in this thread.{" "}
              <button onClick={askHint.onOpen} className="font-semibold text-ask underline underline-offset-4">See an Ask me example in the Brand identity sample</button>
            </p>
          )}
          {QUEUE_ORDER.filter((q) => groups.get(q)?.length).map((q) => (
            <section key={q} id={`queue-${q}`} aria-labelledby={`h-${q}`} className="scroll-mt-6 space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
                <div>
                  <h3 id={`h-${q}`} className={`t-h3 ${QUEUES[q].text}`}>{QUEUES[q].label} <span className="ml-1 rounded-full px-2 py-0.5 align-middle text-xs font-semibold tnum" style={{ background: "var(--color-paper-deep)", color: "var(--color-ink)" }}>{groups.get(q)!.length}</span></h3>
                  <p className="mt-0.5 text-sm text-muted">{QUEUES[q].blurb}</p>
                </div>
                {q === "needs_change_order" && preparable.length > 1 && (
                  <button onClick={onPrepareAll} className="rounded-xl border border-navy/30 bg-card px-4 py-2 text-sm font-semibold text-navy shadow-card transition hover:border-navy">
                    Prepare all ({preparable.length}) · about {preparable.length * 10} credits
                  </button>
                )}
              </div>
              {groups.get(q)!.map(card)}
            </section>
          ))}
        </div>

        <aside className={`${tab === "thread" ? "" : "hidden"} lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1`}>
          <h3 className="t-h3 mb-3">Thread</h3>
          <ThreadView analysis={analysis} openIds={openCO} activeId={activeId} onPick={(id) => focus(id, "thread")} onRetryMessage={onRetryMessage} />
        </aside>
      </div>

      <footer className="border-t border-line pt-4 text-xs leading-5 text-muted">
        {recorded ? "Credits used to record this run" : "Credits used this run"}: <b className="text-ink tnum">{totalCredits(analysis.usage)}</b> (read {analysis.usage.extract.credits}, check {analysis.usage.decide.credits}, agreed prices {analysis.usage.price?.credits ?? 0}, change orders {analysis.usage.fill.credits}, verify {analysis.usage.verify?.credits ?? 0}). Effort labels are rough estimates, not quotes. Probabilities come from the Clocked API; the routing thresholds are this app’s.
      </footer>
    </section>
  );
}
