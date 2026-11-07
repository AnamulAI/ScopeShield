import { useEffect, useMemo, useRef, useState } from "react";
import { ClockedError, createClockedClient, type ClockedClient } from "./lib/clocked";
import type { Snapshot } from "./lib/demo";
import { analyze, runDecide, runFill, runMessage, runSupport, type Analysis } from "./lib/pipeline";
import { effectiveQueue, type Decision } from "./lib/routing";
import { InputPanel, type Inputs } from "./components/InputPanel";
import { HowItWorks } from "./components/HowItWorks";
import { Results } from "./components/Results";

type Mode = "demo" | "live";
interface DemoIndexEntry { id: string; title: string; blurb: string; recordedAt: string }

const Shield = () => (
  <svg width="26" height="28" viewBox="0 0 26 28" aria-hidden>
    <path d="M13 1.5 2.5 5v8.2c0 6.2 4.3 10.9 10.5 13.3 6.2-2.4 10.5-7.1 10.5-13.3V5L13 1.5Z" fill="#1b2a41" />
    <path d="m8.2 13.8 3.6 3.6 6.2-7" fill="none" stroke="#f4efe4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Demo mode must never reach the network: any live call fails with a clear message. */
const demoClient = {
  call: () => Promise.reject(new ClockedError("bad_request", "Demo mode makes no API calls. Switch to Run live to analyse your own text.")),
} as unknown as ClockedClient;

export default function App() {
  const [mode, setMode] = useState<Mode>("demo");
  const [inputs, setInputs] = useState<Inputs>({ contract: "", thread: "", clientName: "" });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [running, setRunning] = useState(false);
  const [demoIndex, setDemoIndex] = useState<DemoIndexEntry[] | null>(null);
  const [demoId, setDemoId] = useState("bakery");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const live = useRef<Analysis | null>(null);
  const ran = useRef<Inputs | null>(null); // inputs that produced the current results (retries use these, not the edited form)
  const liveClient = useMemo(() => createClockedClient({ maxConcurrent: 3 }), []);
  const client = mode === "demo" ? demoClient : liveClient;
  const render = () => live.current && setAnalysis(structuredClone(live.current));

  // Demo mode: load the recorded runs (static files, no API calls).
  useEffect(() => {
    fetch("/demo/index.json").then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then(setDemoIndex).catch((e) => setDemoError(`Recorded demo data could not be loaded (${e.message}).`));
  }, []);
  useEffect(() => {
    if (mode !== "demo") return;
    let cancelled = false;
    setSnap(null);
    fetch(`/demo/${demoId}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then((s: Snapshot) => {
      if (cancelled) return;
      s.analysis.usage.price ??= { calls: 0, credits: 0 };
      live.current = s.analysis;
      ran.current = s.inputs;
      setSnap(s);
      setAnalysis(structuredClone(s.analysis));
      setDemoError(null);
    }).catch((e) => !cancelled && setDemoError(`Recorded demo data could not be loaded (${e.message}).`));
    return () => { cancelled = true; };
  }, [mode, demoId]);

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    live.current = null; ran.current = null; setAnalysis(null); setRunning(false);
    setMode(m);
  };

  const run = async () => {
    ran.current = { ...inputs };
    setRunning(true);
    try {
      live.current = await analyze(ran.current, client, (a) => { live.current = a; render(); });
    } finally {
      setRunning(false);
      render();
    }
  };

  const retry = async (fn: (a: Analysis, i: Inputs) => Promise<void>) => {
    if (!live.current || !ran.current) return;
    setRunning(true);
    try { await fn(live.current, ran.current); } finally { setRunning(false); render(); }
  };
  // Fill / support lookups are tracked per card, so they do not flip the page-level "Analysing" state.
  const direct = async (fn: (a: Analysis, i: Inputs) => Promise<void>) => { if (live.current && ran.current) { await fn(live.current, ran.current); render(); } };
  const byId = (id: string) => live.current?.items.find((x) => x.id === id);
  const retryItem = (id: string) => retry((a, i) => runDecide(a, byId(id)!, i, client, render));
  const retryMessage = (idx: number) => retry((a, i) => runMessage(a, a.messages[idx], i, client, render));
  const fill = (id: string, regenerate = false) => direct((a, i) => runFill(a, byId(id)!, i, client, render, regenerate));
  const decide = (id: string, d: Decision | undefined) => {
    const item = byId(id);
    if (!item) return;
    item.decision = d;
    render();
    if (d === "extra" && !item.changeOrder) void fill(id); // "Extra work" triggers Fill (recorded drafts are used in Demo mode)
  };
  const prepareAll = () => {
    const a = live.current;
    if (!a) return;
    const todo = a.items.filter((x) => effectiveQueue(x.route, x.decision) === "needs_change_order" && x.status === "done" && (!x.changeOrder || x.changeOrder.status === "failed"));
    return direct((an, i) => Promise.all(todo.map((x) => runFill(an, x, i, client, render))).then(() => undefined)); // client caps concurrency at 3
  };
  const retrySupport = (id: string) => direct((a, i) => runSupport(a, byId(id)!, i, client, render));

  const tab = (m: Mode, label: string) => (
    <button aria-pressed={mode === m} onClick={() => switchMode(m)}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${mode === m ? "bg-navy text-white" : "text-navy hover:bg-navy/10"}`}>{label}</button>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-5">
        <div className="flex items-center gap-3">
          <Shield />
          <div>
            <h1 className="font-display text-3xl leading-none tracking-tight">ScopeShield</h1>
            <p className="mt-1 text-sm text-muted">Catch scope creep before it becomes unpaid work.</p>
          </div>
        </div>
        <div role="group" aria-label="Mode" className="flex gap-1 rounded-full border border-line bg-card p-1">
          {tab("demo", "Demo")}{tab("live", "Run live")}
        </div>
      </header>

      <p className="mb-6 max-w-2xl text-sm text-muted">“Let me think about it” is not a yes. ScopeShield reads a client thread against your contract, and only counts what the client clearly agreed to.</p>

      <main className="space-y-8">
        <HowItWorks analysis={analysis} recorded={mode === "demo"} />

        {mode === "demo" ? (
          <section className="space-y-5" aria-label="Demo mode">
            <div className="rounded-xl border border-agreed/30 bg-agreed-bg/60 px-4 py-3 text-sm">
              <p>
                <b>Recorded from a live Clocked run{snap ? ` on ${snap.recordedAt}` : ""}.</b>{" "}
                {snap ? `Recording it used ${snap.credits.total} credits. ` : ""}
                Synthetic data, made-up people. Demo mode makes no API calls, so you can click around freely: answer Ask me cards, undo, copy a change order.
              </p>
              <button onClick={() => switchMode("live")} className="mt-2 text-xs font-semibold text-navy underline underline-offset-4">Run live on your own contract and thread →</button>
            </div>
            <div role="group" aria-label="Sample threads" className="flex flex-wrap gap-2">
              {(demoIndex ?? []).map((d) => (
                <button key={d.id} onClick={() => setDemoId(d.id)} aria-pressed={demoId === d.id} title={d.blurb}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium ${demoId === d.id ? "border-navy bg-navy text-white" : "border-navy/30 bg-card text-navy hover:border-navy"}`}>{d.title}</button>
              ))}
            </div>
            {snap && <p className="text-sm text-muted">{demoIndex?.find((d) => d.id === demoId)?.blurb}</p>}
            {demoError && <p role="alert" className="text-sm text-change">{demoError}</p>}
            {!snap && !demoError && <p role="status" className="text-sm text-muted">Loading the recorded run…</p>}
          </section>
        ) : (
          <InputPanel value={inputs} onChange={setInputs} onAnalyze={run} busy={running} />
        )}

        {mode === "live" && !analysis && (
          <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
            Results appear here: requests grouped by queue, with the client’s exact sentence highlighted in the thread. Not ready to spend credits? Try the <button onClick={() => switchMode("demo")} className="font-medium text-navy underline underline-offset-4">recorded demo</button>.
          </p>
        )}

        {analysis && (
          <Results analysis={analysis} running={running} onRetryItem={retryItem} onRetryMessage={retryMessage}
            onDecide={decide} onPrepare={(id) => fill(id)} onPrepareAll={prepareAll} onRegenerate={(id) => fill(id, true)} onRetrySupport={retrySupport}
            recorded={mode === "demo"} onSwitchDemo={() => switchMode("demo")}
            askHint={mode === "demo" && demoId !== "brand-studio" && !analysis.items.some((i) => i.route?.queue === "ask_me") ? { onOpen: () => setDemoId("brand-studio") } : undefined} />
        )}
      </main>
    </div>
  );
}
