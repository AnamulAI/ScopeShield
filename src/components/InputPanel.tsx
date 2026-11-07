import { useMemo } from "react";
import { checkInputs, LIMITS } from "../lib/limits";
import { cpLength } from "../lib/thread";
import { SAMPLES } from "../lib/samples";

export interface Inputs { contract: string; thread: string; clientName: string }
interface Props { value: Inputs; onChange: (v: Inputs) => void; onAnalyze: () => void; busy: boolean }

const field = "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm leading-relaxed shadow-inner placeholder:text-muted/70 focus:border-navy";

export function InputPanel({ value, onChange, onAnalyze, busy }: Props) {
  const check = useMemo(() => checkInputs(value.contract, value.thread, value.clientName), [value]);
  const set = (patch: Partial<Inputs>) => onChange({ ...value, ...patch });
  const cLen = cpLength(value.contract), tLen = cpLength(value.thread);

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (check.ok && !busy) onAnalyze(); }} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {SAMPLES.map((sm) => (
          <button key={sm.id} type="button" onClick={() => onChange({ contract: sm.contract, thread: sm.thread, clientName: sm.clientName })}
            className="rounded-full border border-navy/30 bg-card px-4 py-1.5 text-sm font-medium text-navy hover:border-navy">
            Load sample: {sm.title}
          </button>
        ))}
        <span className="text-xs text-muted">Synthetic data. Nothing here is a real client.</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <label htmlFor="contract" className="mb-1 flex items-baseline justify-between text-sm font-semibold">
            <span>1. Agreed contract or scope</span>
            <span className={`text-xs font-normal ${cLen > LIMITS.contract ? "text-change" : "text-muted"}`}>{cLen.toLocaleString()} / {LIMITS.contract.toLocaleString()}</span>
          </label>
          <textarea id="contract" rows={12} value={value.contract} onChange={(e) => set({ contract: e.target.value })}
            placeholder="What was promised: deliverables, number of revisions, what is excluded, the price…" className={field} />
        </div>
        <div>
          <label htmlFor="thread" className="mb-1 flex items-baseline justify-between text-sm font-semibold">
            <span>2. Client chat or email thread</span>
            <span className={`text-xs font-normal ${tLen > LIMITS.thread ? "text-change" : "text-muted"}`}>{tLen.toLocaleString()} / {LIMITS.thread.toLocaleString()}</span>
          </label>
          <textarea id="thread" rows={12} value={value.thread} onChange={(e) => set({ thread: e.target.value })}
            placeholder={"One message per line:\nAlex: The first draft is ready.\nMaya: Can you also add a blog?"} className={`${field} font-mono text-[13px]`} />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-56 flex-1 sm:max-w-xs">
          <label htmlFor="client" className="mb-1 block text-sm font-semibold">3. Who is the client?</label>
          <input id="client" value={value.clientName} onChange={(e) => set({ clientName: e.target.value })} autoComplete="off"
            placeholder="Name as written in the thread" className={field} />
        </div>
        {check.speakers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pb-1.5 text-xs text-muted">
            <span>Speakers found:</span>
            {check.speakers.map((s) => (
              <button type="button" key={s} onClick={() => set({ clientName: s })}
                className="rounded-full border border-line bg-card px-2.5 py-0.5 text-ink hover:border-navy">{s}</button>
            ))}
          </div>
        )}
        <button type="submit" disabled={!check.ok || busy}
          className="ml-auto rounded-lg bg-navy px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? "Analysing…" : "Analyze thread"}
        </button>
      </div>

      {(value.contract || value.thread) && check.problems.length > 0 && (
        <ul className="space-y-1 text-sm text-change" aria-live="polite">
          {check.problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <p className="text-xs text-muted">
        Live analysis spends Clocked credits (about 3–4 per client message plus about 2 per request found). Your text is sent to the Clocked API through this app’s server and is not stored by the app.
      </p>
    </form>
  );
}
