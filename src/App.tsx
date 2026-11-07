import { useEffect, useMemo, useRef, useState } from "react";
import { ClockedError, createClockedClient, type ClockedClient } from "./lib/clocked";
import type { Snapshot } from "./lib/demo";
import { analyze, runDecide, runFill, runMessage, runSupport, runVerify, type Analysis } from "./lib/pipeline";
import { effectiveQueue, type Decision } from "./lib/routing";
import { InputPanel, type Inputs } from "./components/InputPanel";
import { HowItWorks } from "./components/HowItWorks";
import { Results } from "./components/Results";
import { ResultsSkeleton } from "./components/Skeleton";

type Mode = "demo" | "live";
interface DemoIndexEntry { id: string; title: string; blurb: string; recordedAt: string }

const Shield = () => (
  <svg width="30" height="32" viewBox="0 0 26 28" aria-hidden>
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
      s.analysis.usage.verify ??= { calls: 0, credits: 0 };
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
  const ack = (id: string) => { const v = byId(id)?.changeOrder?.verify; if (v) { v.acknowledged = true; render(); } };
  const retryVerify = (id: string) => direct((a, i) => runVerify(a, byId(id)!, i, client, render));
  const retrySupport = (id: string) => direct((a, i) => runSupport(a, byId(id)!, i, client, render));

  const modeCard = (m: Mode, title: string, line: string, meta: string) => (
    <button type="button" aria-pressed={mode === m} onClick={() => switchMode(m)}
      className={`group flex flex-1 flex-col items-start gap-1 rounded-2xl border p-4 text-left transition sm:p-5 ${mode === m ? "border-navy bg-navy text-paper shadow-lift" : "border-line bg-card shadow-card hover:border-navy/40"}`}>
      <span className="flex w-full items-center justify-between gap-3">
        <span className="t-h3">{title}</span>
        <span aria-hidden className={`flex h-5 w-5 items-center justify-center rounded-full border ${mode === m ? "border-paper bg-paper text-navy" : "border-line"}`}>{mode === m ? "✓" : ""}</span>
      </span>
      <span className={`text-sm ${mode === m ? "text-paper/90" : "text-ink/80"}`}>{line}</span>
      <span className={`t-eyebrow mt-2 ${mode === m ? "text-paper/70" : "text-muted"}`}>{meta}</span>
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shield />
          <span className="font-display text-xl leading-none">ScopeShield</span>
        </div>
        <p className="t-eyebrow hidden text-muted sm:block">Powered by Clocked</p>
      </header>

      <section aria-labelledby="hero" className="mt-10 grid gap-8 border-b border-line pb-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-end lg:gap-12 lg:pb-12">
        <div>
          <p className="t-eyebrow text-muted">For freelancers and small agencies</p>
          <h1 id="hero" className="t-display mt-3 max-w-[16ch]">Catch scope creep before it becomes unpaid work.</h1>
          <p className="mt-4 max-w-xl text-[1.0625rem] leading-7 text-ink/85">
            “Let me think about it” is not a yes. ScopeShield reads a client thread against your contract, and only counts what the client clearly agreed to.
          </p>
        </div>
        <div role="group" aria-label="Choose a mode" className="flex flex-col gap-3 sm:flex-row">
          {modeCard("demo", "Demo", "Explore three recorded real results. No setup, no API calls.", "3 samples · 0 credits")}
          {modeCard("live", "Run live", "Analyse your own contract and thread.", "Your text · uses credits")}
        </div>
      </section>

      <main className="mt-8 space-y-8">
        <HowItWorks analysis={analysis} recorded={mode === "demo"} />

        {mode === "demo" ? (
          <section className="space-y-5" aria-label="Demo mode">
            <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Sample threads">
              <span className="t-eyebrow text-muted">Sample thread</span>
              {(demoIndex ?? []).map((d) => (
                <button key={d.id} onClick={() => setDemoId(d.id)} aria-pressed={demoId === d.id} title={d.blurb}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${demoId === d.id ? "border-navy bg-navy text-paper" : "border-line bg-card text-navy shadow-card hover:border-navy/50"}`}>{d.title}</button>
              ))}
            </div>
            {snap && <p className="max-w-2xl text-[0.9375rem] text-ink/80">{demoIndex?.find((d) => d.id === demoId)?.blurb}</p>}
            <div className="flex gap-3 rounded-xl border border-agreed/25 bg-agreed-bg/70 px-4 py-3 text-sm text-ink">
              <span aria-hidden className="mt-0.5 text-agreed">●</span>
              <p>
                <b>Recorded from a live Clocked run{snap ? ` on ${snap.recordedAt}` : ""}.</b>{" "}
                {snap ? `Recording it used ${snap.credits.total} credits. ` : ""}
                Synthetic data, made-up people. Demo mode makes no API calls, so you can click around freely: answer Ask me cards, undo, copy a change order.{" "}
                <button onClick={() => switchMode("live")} className="font-semibold text-navy underline underline-offset-4">Run live on your own contract and thread →</button>
              </p>
            </div>
            {demoError && <p role="alert" className="text-sm text-change">{demoError}</p>}
            {!snap && !demoError && <ResultsSkeleton label="Loading the recorded run" />}
          </section>
        ) : (
          <InputPanel value={inputs} onChange={setInputs} onAnalyze={run} busy={running} />
        )}

        {mode === "live" && !analysis && (
          <div className="surface flex flex-col items-center gap-2 border-dashed p-8 text-center">
            <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-paper-deep text-muted">↓</span>
            <p className="t-h3">Your results will appear here</p>
            <p className="max-w-md text-sm text-muted">Requests grouped into five queues, with the client’s exact sentence highlighted in the thread. Not ready to spend credits? Try the <button onClick={() => switchMode("demo")} className="font-semibold text-navy underline underline-offset-4">recorded demo</button>.</p>
          </div>
        )}

        {analysis && (
          <Results analysis={analysis} running={running} onRetryItem={retryItem} onRetryMessage={retryMessage}
            onDecide={decide} onPrepare={(id) => fill(id)} onPrepareAll={prepareAll} onRegenerate={(id) => fill(id, true)} onRetrySupport={retrySupport} onAck={ack} onRetryVerify={retryVerify}
            recorded={mode === "demo"} onSwitchDemo={() => switchMode("demo")}
            askHint={mode === "demo" && demoId !== "brand-studio" && !analysis.items.some((i) => i.route?.queue === "ask_me") ? { onOpen: () => setDemoId("brand-studio") } : undefined} />
        )}
      </main>

      <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-xs text-muted">
        <p>Powered by Clocked. Sample data is synthetic: made-up people and companies.</p>
        <p>Built by Mohammad Anamul Hoque (AnamDev) with AI-assisted development.</p>
      </footer>
    </div>
  );
}
