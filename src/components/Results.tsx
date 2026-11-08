import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { totalCredits, type Analysis } from "../lib/pipeline";
import { effectiveQueue, type Decision, type Queue } from "../lib/routing";
import { RequestCard } from "./RequestCard";
import { describeError, worstKind } from "../lib/errors";
import { QUEUE_ORDER, QUEUES } from "./queues";
import { ErrorBanner } from "./ErrorBanner";
import { SafetyEvidence } from "./SafetyEvidence";
import { ChevronIcon, QueueIcon } from "./icons";
import { isExpanded, visibleQueues, type Filter } from "../lib/replay";
import { useReplay } from "./useReplay";
import { ScopeHealth } from "./ScopeHealth";
import { ChatWindow, type ChatHandle } from "./ChatWindow";

interface Props {
  analysis: Analysis; running: boolean;
  onRetryItem: (id: string) => void; onRetryMessage: (idx: number) => void;
  onDecide: (id: string, d: Decision | undefined) => void; onPrepare: (id: string) => void; onPrepareAll: () => void;
  onRegenerate: (id: string) => void; onRetrySupport: (id: string) => void;
  onAck: (id: string) => void; onRetryVerify: (id: string) => void;
  onInclude: (messageIndex: number) => void; onWithhold: (messageIndex: number) => void; onRetryGuard: () => void;
  onRetryPromise: () => void; onMakePack: (itemId: string) => void;
  recorded?: boolean; onSwitchDemo?: () => void;
  /** Demo only: shown when the current sample has no Ask me item. */
  askHint?: { onOpen: () => void };
  /** Start with every prepared change order expanded (used by deep links and screenshots). */
  openAll?: boolean;
}

export function Results({ analysis, running, onRetryItem, onRetryMessage, onDecide, onPrepare, onPrepareAll, onRegenerate, onRetrySupport, onAck, onRetryVerify, onInclude, onWithhold, onRetryGuard, onRetryPromise, onMakePack, recorded, onSwitchDemo, askHint, openAll }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<"findings" | "thread">("findings");
  const timer = useRef<number>(0);
  const chat = useRef<ChatHandle>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<Queue>>(new Set());
  const toggleExpanded = (q: Queue, v: boolean) => setExpanded((prev) => { const n = new Set(prev); if (v) n.add(q); else n.delete(q); return n; });
  const [openCO, setOpenCO] = useState<Set<string>>(() => new Set(openAll ? analysis.items.filter((i) => i.changeOrder).map((i) => i.id) : []));
  const setCoOpen = (id: string, v: boolean) => setOpenCO((prev) => { const n = new Set(prev); if (v) n.add(id); else n.delete(id); return n; });

  const groups = useMemo(() => {
    const g = new Map<Queue | "pending", typeof analysis.items>();
    for (const item of analysis.items) {
      const key = effectiveQueue(item.route, item.decision);
      g.set(key, [...(g.get(key) ?? []), item]);
    }
    return g;
  }, [analysis.items]);

  const replayMsgs = useMemo(() => analysis.messages.map((m) => ({ isClient: m.isClient, text: m.text, speaker: m.speaker })), [analysis.messages]);
  const verdictsFor = useCallback(
    (idx: number) => analysis.items.filter((i) => i.messageIndex === idx).map((i) => { const q = effectiveQueue(i.route, i.decision); return q === "pending" ? "" : `${i.text}: ${QUEUES[q].label}`; }).filter(Boolean),
    [analysis.items],
  );
  const replay = useReplay(replayMsgs, !!recorded, verdictsFor);

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
    if (recorded && replay.revealed < replay.total) replay.finish(); // make sure the message is on screen
    setActiveId(id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setActiveId(null), 2500);
    const toThread = from === "card";
    const mobile = window.matchMedia("(max-width: 1023px)").matches;
    const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    if (mobile) setTab(toThread ? "thread" : "findings");
    requestAnimationFrame(() => {
      if (toThread) {
        if (mobile) document.getElementById("chat-window")?.scrollIntoView({ behavior, block: "start" }); // user-initiated: bring the chat into view
        chat.current?.scrollToEvidence(id); // scrolls the chat body only
      } else document.getElementById(`card-${id.split(":")[0]}`)?.scrollIntoView({ behavior, block: "center" });
    });
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const total = analysis.items.length;
  const counts = (q: Queue) => groups.get(q)?.length ?? 0;
  const card = (item: (typeof analysis.items)[number], i = 0) => (
    <RequestCard key={item.id} revealIndex={Math.min(i, 5)} item={item} active={activeId?.split(":")[0] === item.id} speaker={speaker(item.messageIndex)}
      coOpen={openCO.has(item.id)} setCoOpen={(v) => setCoOpen(item.id, v)}
      onShow={(span) => focus(span, "card")} onRetry={() => onRetryItem(item.id)} onDecide={(d) => { if (d === "extra") setCoOpen(item.id, true); if (d === "in_scope") toggleExpanded("in_scope", true); onDecide(item.id, d); }}
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
            <div className="h-full origin-left rounded-full bg-navy transition-transform duration-500" style={{ transform: `scaleX(${Math.max(pct, 6) / 100})` }} />
          </div>
        )}
        <div className="mt-6"><ScopeHealth items={analysis.items} ready={finished} onJump={(q) => { setFilter("all"); if (q === "in_scope" || q === "withdrawn") toggleExpanded(q, true); }} /></div>
        {described && <ErrorBanner described={described} failures={finished ? failures : 0} onSwitchDemo={onSwitchDemo} />}
      </div>

      <SafetyEvidence analysis={analysis} recorded={!!recorded} onInclude={onInclude} onWithhold={onWithhold} onRetryGuard={onRetryGuard} onShowSpan={(id) => focus(id, "card")} onRetryPromise={onRetryPromise} onMakePack={onMakePack} />

      <div className="flex gap-2 lg:hidden" role="group" aria-label="Show findings or thread">
        {(["findings", "thread"] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}
            className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold press ${tab === t ? "bg-navy text-paper shadow-lift" : "border border-line bg-card text-navy"}`}>
            {t === "findings" ? "Findings" : "Thread"}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
        <div className={`${tab === "findings" ? "" : "hidden"} min-w-0 space-y-10 lg:block`}>
          {finished && total === 0 && failures === 0 && (
            <div className="surface border-dashed p-8 text-center">
              <p className="t-h3">No actionable request found</p>
              <p className="mt-1 text-sm text-muted">The client’s messages contained nothing that asks for work. If that looks wrong, check the client name.</p>
            </div>
          )}
          {total > 0 && (
            <div role="group" aria-label="Filter requests by queue" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
              <button onClick={() => setFilter("all")} aria-pressed={filter === "all"}
                className={`press inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-semibold ${filter === "all" ? "border-navy bg-navy text-paper" : "border-line bg-card text-navy shadow-card"}`}>
                All <b className="tnum">{total}</b>
              </button>
              {QUEUE_ORDER.map((q) => (
                <button key={q} onClick={() => setFilter(filter === q ? "all" : q)} aria-pressed={filter === q} disabled={counts(q) === 0}
                  className={`press inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-sm font-semibold disabled:opacity-45 ${filter === q ? `${QUEUES[q].border} ${QUEUES[q].bg} ${QUEUES[q].text}` : "border-line bg-card text-ink shadow-card"}`}>
                  <QueueIcon queue={q} width={16} height={16} />{QUEUES[q].label} <b className="tnum">{counts(q)}</b>
                </button>
              ))}
            </div>
          )}
          {groups.has("pending") && (
            <div className="space-y-4">
              <h3 className="t-eyebrow text-muted">Checking</h3>
              {groups.get("pending")!.map((it, i) => card(it, i))}
            </div>
          )}
          {askHint && finished && !groups.get("ask_me")?.length && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ask/30 bg-ask-bg px-5 py-4">
              <p className="text-sm text-ink/85"><b>No Ask me items in this thread.</b> That is where the app asks you one question when it is unsure.</p>
              <button onClick={askHint.onOpen} className="rounded-xl border border-ask/50 bg-card px-4 py-2 text-sm font-semibold text-ask shadow-card press hover:border-ask hover:shadow-lift">
                See an Ask me example in the Brand identity sample →
              </button>
            </div>
          )}
          {QUEUE_ORDER.filter((q) => groups.get(q)?.length).map((q) => {
            const shown = visibleQueues(filter, QUEUE_ORDER).includes(q);
            const open = isExpanded(q, filter, expanded);
            const collapsible = q === "in_scope" || q === "withdrawn";
            const n = counts(q);
            return (
              <section key={q} id={`queue-${q}`} aria-labelledby={`h-${q}`} hidden={!shown} className="scroll-mt-20 space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
                  <div>
                    <h3 id={`h-${q}`} className={`t-h3 flex flex-wrap items-center gap-2 ${QUEUES[q].text}`}><QueueIcon queue={q} width={22} height={22} />{QUEUES[q].label} <span className="ml-1 rounded-full px-2 py-0.5 align-middle text-xs font-semibold tnum" style={{ background: "var(--color-paper-deep)", color: "var(--color-ink)" }}>{n}</span></h3>
                    <p className="mt-0.5 text-sm text-muted">{QUEUES[q].blurb}</p>
                  </div>
                  {q === "needs_change_order" && preparable.length > 1 && (
                    <button onClick={onPrepareAll} className="rounded-xl border border-navy/30 bg-card px-4 py-2 text-sm font-semibold text-navy shadow-card press hover:border-navy">
                      Prepare all ({preparable.length}) · about {preparable.length * 10} credits
                    </button>
                  )}
                  {collapsible && filter === "all" && (
                    <button onClick={() => toggleExpanded(q, !open)} aria-expanded={open} aria-controls={`list-${q}`}
                      className="press inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 py-2 text-sm font-semibold text-navy shadow-card hover:border-navy/40">
                      {open ? "Hide" : `Show ${n} request${n === 1 ? "" : "s"}`}
                      <ChevronIcon width={16} height={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </div>
                <div id={`list-${q}`} hidden={!open} className="space-y-4">
                  {groups.get(q)!.map((it, i) => card(it, i))}
                </div>
              </section>
            );
          })}
        </div>

        <aside ref={replay.panel} aria-label="Thread" className={`${tab === "thread" ? "" : "hidden"} min-w-0 lg:sticky lg:top-20 lg:block`}>
          <ChatWindow ref={chat} analysis={analysis} recorded={!!recorded} replay={replay} openIds={openCO} activeId={activeId}
            onPick={(id) => focus(id, "thread")} onRetryMessage={onRetryMessage} onInclude={onInclude} onWithhold={onWithhold} />
        </aside>
      </div>

      <footer className="border-t border-line pt-4 text-xs leading-5 text-muted">
        {recorded ? "Credits used to record this run" : "Credits used this run"}: <b className="text-ink tnum">{totalCredits(analysis.usage)}</b> (read {analysis.usage.extract.credits}, check {analysis.usage.decide.credits}, agreed prices {analysis.usage.price?.credits ?? 0}, guard {analysis.usage.guard?.credits ?? 0}, clauses {analysis.usage.rerank?.credits ?? 0}, promise check {analysis.usage.compare?.credits ?? 0}, change orders {analysis.usage.fill.credits}, verify {analysis.usage.verify?.credits ?? 0}, privacy packs {analysis.usage.pii?.credits ?? 0}). Effort labels are rough estimates, not quotes. Probabilities come from the Clocked API; the routing thresholds are this app’s.
      </footer>
    </section>
  );
}
