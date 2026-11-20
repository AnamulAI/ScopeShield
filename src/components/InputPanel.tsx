import { useMemo } from "react";
import { checkInputs, LIMITS } from "../lib/limits";
import { cpLength } from "../lib/thread";
import { SAMPLES } from "../lib/samples";
import { useI18n } from "../i18n";

export interface Inputs { contract: string; thread: string; clientName: string }
interface Props { value: Inputs; onChange: (v: Inputs) => void; onAnalyze: () => void; busy: boolean }

const field = "w-full rounded-xl border border-line bg-card px-4 py-3 text-[0.9375rem] leading-6 shadow-inset placeholder:text-muted/80 focus:border-navy";

export function InputPanel({ value, onChange, onAnalyze, busy }: Props) {
  const { t } = useI18n();
  const check = useMemo(() => checkInputs(value.contract, value.thread, value.clientName), [value]);
  const set = (patch: Partial<Inputs>) => onChange({ ...value, ...patch });
  const cLen = cpLength(value.contract), tLen = cpLength(value.thread);

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (check.ok && !busy) onAnalyze(); }} className="surface space-y-6 p-5 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        {SAMPLES.map((sm) => (
          <button key={sm.id} type="button" onClick={() => onChange({ contract: sm.contract, thread: sm.thread, clientName: sm.clientName })}
            className="rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold text-navy shadow-card press hover:border-navy/50">
            {t("input.loadSample", { title: sm.title })}
          </button>
        ))}
        <span className="text-xs text-muted">{t("input.samplesNote")}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <label htmlFor="contract" className="mb-1 flex items-baseline justify-between text-sm font-semibold">
            <span className="flex items-center gap-2"><span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-xs text-paper">1</span>{t("input.contractLabel")}</span>
            <span className={`text-xs font-normal ${cLen > LIMITS.contract ? "text-change" : "text-muted"}`}>{cLen.toLocaleString()} / {LIMITS.contract.toLocaleString()}</span>
          </label>
          <textarea id="contract" rows={12} value={value.contract} onChange={(e) => set({ contract: e.target.value })}
            placeholder={t("input.contractPlaceholder")} className={field} />
        </div>
        <div>
          <label htmlFor="thread" className="mb-1 flex items-baseline justify-between text-sm font-semibold">
            <span className="flex items-center gap-2"><span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-xs text-paper">2</span>{t("input.threadLabel")}</span>
            <span className={`text-xs font-normal ${tLen > LIMITS.thread ? "text-change" : "text-muted"}`}>{tLen.toLocaleString()} / {LIMITS.thread.toLocaleString()}</span>
          </label>
          <textarea id="thread" rows={12} value={value.thread} onChange={(e) => set({ thread: e.target.value })}
            placeholder={t("input.threadPlaceholder")} className={`${field} font-mono text-[13px]`} />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-56 flex-1 sm:max-w-xs">
          <label htmlFor="client" className="mb-1 flex items-center gap-2 text-sm font-semibold"><span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-xs text-paper">3</span>{t("input.clientLabel")}</label>
          <input id="client" value={value.clientName} onChange={(e) => set({ clientName: e.target.value })} autoComplete="off"
            placeholder={t("input.clientPlaceholder")} className={field} />
        </div>
        {check.speakers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pb-1.5 text-xs text-muted">
            <span>{t("input.speakers")}</span>
            {check.speakers.map((s) => (
              <button type="button" key={s} onClick={() => set({ clientName: s })}
                className="rounded-full border border-line bg-paper px-3 py-1 font-medium text-ink press hover:border-navy">{s}</button>
            ))}
          </div>
        )}
        <button type="submit" disabled={!check.ok || busy}
          className="ml-auto rounded-xl bg-navy px-7 py-3 text-sm font-semibold text-paper shadow-lift press hover:bg-navy/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">
          {busy ? t("input.analyzing") : t("input.analyze")}
        </button>
      </div>

      {(value.contract || value.thread) && check.issues.length > 0 && (
        <ul className="space-y-1 text-sm font-medium text-change" aria-live="polite">
          {check.issues.map((i) => { const p = t(i.key, i.vars); return <li key={p}>{p}</li>; })}
        </ul>
      )}
      <p className="rounded-lg bg-paper-deep px-4 py-3 text-xs leading-5 text-muted">
        {t("input.costNote")}
      </p>
    </form>
  );
}
