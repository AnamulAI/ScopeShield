import { useMemo, useRef, useState } from "react";
import { createClockedClient } from "./lib/clocked";
import { analyze, runDecide, runMessage, type Analysis } from "./lib/pipeline";
import { InputPanel, type Inputs } from "./components/InputPanel";
import { Results } from "./components/Results";

const Shield = () => (
  <svg width="26" height="28" viewBox="0 0 26 28" aria-hidden>
    <path d="M13 1.5 2.5 5v8.2c0 6.2 4.3 10.9 10.5 13.3 6.2-2.4 10.5-7.1 10.5-13.3V5L13 1.5Z" fill="#1b2a41" />
    <path d="m8.2 13.8 3.6 3.6 6.2-7" fill="none" stroke="#f4efe4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function App() {
  const [inputs, setInputs] = useState<Inputs>({ contract: "", thread: "", clientName: "" });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [running, setRunning] = useState(false);
  const live = useRef<Analysis | null>(null);
  const ran = useRef<Inputs | null>(null); // inputs that produced the current results (retries use these, not the edited form)
  const client = useMemo(() => createClockedClient({ maxConcurrent: 3 }), []);
  const render = () => live.current && setAnalysis(structuredClone(live.current));

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
  const retryItem = (id: string) => retry((a, i) => runDecide(a, a.items.find((x) => x.id === id)!, i, client, render));
  const retryMessage = (idx: number) => retry((a, i) => runMessage(a, a.messages[idx], i, client, render));

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-5">
        <div className="flex items-center gap-3">
          <Shield />
          <div>
            <h1 className="font-display text-3xl leading-none tracking-tight">ScopeShield</h1>
            <p className="mt-1 text-sm text-muted">Catch scope creep before it becomes unpaid work.</p>
          </div>
        </div>
        <p className="max-w-sm text-xs text-muted">“Let me think about it” is not a yes. ScopeShield only counts what the client clearly agreed to.</p>
      </header>

      <main className="space-y-10">
        <InputPanel value={inputs} onChange={setInputs} onAnalyze={run} busy={running} />
        {analysis && <Results analysis={analysis} running={running} onRetryItem={retryItem} onRetryMessage={retryMessage} />}
      </main>
    </div>
  );
}
