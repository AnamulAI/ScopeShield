import { useEffect, useMemo, useRef, useState } from "react";
import { totalCredits, type Analysis } from "../lib/pipeline";
import type { Queue } from "../lib/routing";
import { RequestCard } from "./RequestCard";
import { QUEUE_ORDER, QUEUES } from "./queues";
import { ThreadView } from "./ThreadView";

interface Props { analysis: Analysis; running: boolean; onRetryItem: (id: string) => void; onRetryMessage: (idx: number) => void }

export function Results({ analysis, running, onRetryItem, onRetryMessage }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<"findings" | "thread">("findings");
  const timer = useRef<number>(0);

  const groups = useMemo(() => {
    const g = new Map<Queue | "pending", typeof analysis.items>();
    for (const item of analysis.items) {
      const key = item.route?.queue ?? "pending";
      g.set(key, [...(g.get(key) ?? []), item]);
    }
    return g;
  }, [analysis.items]);

  const msgDone = analysis.messageStates.filter((m) => m.status === "done" || m.status === "failed").length;
  const itemsDone = analysis.items.filter((i) => i.status === "done" || i.status === "failed").length;
  const failures = analysis.messageStates.filter((m) => m.status === "failed").length + analysis.items.filter((i) => i.status === "failed").length;
  const creditsOut = [...analysis.messageStates, ...analysis.items].some((x) => x.errorKind === "credits");
  const finished = !running;
  const speaker = (idx: number) => analysis.messages[idx]?.speaker ?? "";

  const focus = (id: string, from: "card" | "thread") => {
    setActiveId(id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setActiveId(null), 2500);
    const showThread = from === "card";
    if (window.matchMedia("(max-width: 1023px)").matches) setTab(showThread ? "thread" : "findings");
    requestAnimationFrame(() => document.getElementById(showThread ? `ev-${id}` : `card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const total = analysis.items.length;
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
        {creditsOut && <p role="alert" className="mt-3 rounded-lg bg-change-bg px-3 py-2 text-sm text-change">Clocked credits are used up, so some checks failed. Results so far are kept.</p>}
        {finished && failures > 0 && !creditsOut && <p role="alert" className="mt-3 text-sm text-change">{failures} step{failures === 1 ? "" : "s"} failed. Everything else is kept; use Retry on the failed items.</p>}
      </div>

      <div className="flex gap-1 lg:hidden" role="tablist">
        {(["findings", "thread"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
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
              {groups.get("pending")!.map((item) => <RequestCard key={item.id} item={item} active={activeId === item.id} speaker={speaker(item.messageIndex)} onShow={() => focus(item.id, "card")} onRetry={() => onRetryItem(item.id)} />)}
            </div>
          )}
          {QUEUE_ORDER.filter((q) => groups.get(q)?.length).map((q) => (
            <div key={q} className="space-y-3">
              <div>
                <h3 className={`font-display text-lg ${QUEUES[q].text}`}>{QUEUES[q].label} <span className="text-sm text-muted">({groups.get(q)!.length})</span></h3>
                <p className="text-xs text-muted">{QUEUES[q].blurb}</p>
              </div>
              {groups.get(q)!.map((item) => <RequestCard key={item.id} item={item} active={activeId === item.id} speaker={speaker(item.messageIndex)} onShow={() => focus(item.id, "card")} onRetry={() => onRetryItem(item.id)} />)}
            </div>
          ))}
        </div>

        <aside className={`${tab === "thread" ? "" : "hidden"} lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1`}>
          <h3 className="mb-2 font-display text-lg">Thread</h3>
          <ThreadView analysis={analysis} activeId={activeId} onPick={(id) => focus(id, "thread")} onRetryMessage={onRetryMessage} />
        </aside>
      </div>

      <footer className="border-t border-line pt-3 text-xs text-muted">
        Credits used this run: <b className="text-ink">{totalCredits(analysis.usage)}</b> (read {analysis.usage.extract.credits}, check {analysis.usage.decide.credits}). Effort labels are rough estimates, not quotes. Probabilities come from the Clocked API; the routing thresholds are this app’s.
      </footer>
    </section>
  );
}
