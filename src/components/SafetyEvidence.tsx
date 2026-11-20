import { useMemo, useState } from "react";
import { describeCountsText } from "../lib/protect";
import { effectiveQueue, type Queue } from "../lib/routing";
import { useI18n, type Key } from "../i18n";
import { queueLabel } from "../i18n/labels";
import type { Analysis } from "../lib/pipeline";
import { describeError } from "../lib/errors";
import { CodeIcon, ConflictIcon, PackIcon, ShieldAlertIcon, ShieldCheckIcon } from "./icons";
import { CopyButton } from "./CopyButton";

interface Props {
  analysis: Analysis;
  recorded: boolean;
  onInclude: (messageIndex: number) => void;
  onWithhold: (messageIndex: number) => void;
  onRetryGuard: () => void;
  /** M12: scroll the chat to a highlighted span */
  onShowSpan: (spanId: string) => void;
  onRetryPromise: () => void;
  /** M11: build and mask an evidence pack for one request (live mode only; Demo shows recorded packs) */
  onMakePack: (itemId: string) => void;
  onRetryScript: (index: number) => void;
}

const row = "border-t border-line px-5 py-4 first:border-t-0 sm:px-6";

/** One calm area for the safety and evidence features. Model judgments are labelled as estimates. */
export function SafetyEvidence({ analysis, recorded, onInclude, onWithhold, onRetryGuard, onShowSpan, onRetryPromise, onMakePack, onRetryScript }: Props) {
  const { t, tp } = useI18n();
  const g = analysis.guard;
  const flagged = g ? [...new Set([...g.withheld, ...g.included])].sort((a, b) => a - b) : [];
  const clientCount = analysis.messages.filter((m) => m.isClient).length;
  const speaker = (i: number) => analysis.messages[i]?.speaker ?? "";

  return (
    <section aria-label={t("safety.aria")} className="surface overflow-hidden">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <p className="t-eyebrow text-muted">{t("safety.eyebrow")}</p>
        <h2 className="t-h3 mt-1">{t("safety.title")}</h2>
      </div>

      {/* M9 Guard */}
      <div className={`${row} mt-4`} id="guard">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {flagged.length > 0 ? <ShieldAlertIcon width={18} height={18} className="text-warn" /> : <ShieldCheckIcon width={18} height={18} className="text-scope" />}
          {t("safety.guardTitle")}
        </h3>
        {!g && <p className="mt-1 text-sm text-muted">{t(recorded ? "safety.notRunRecorded" : "safety.notRun")}</p>}
        {g?.status === "running" && <p role="status" className="mt-1 flex items-center gap-2 text-sm text-muted"><span className="spinner" /> {t("safety.guardRunning")}</p>}
        {g?.status === "failed" && (
          <p role="alert" className="mt-1 text-sm text-ink">
            <b className="text-change">{describeError(g.errorKind, g.error, t).title}</b> {t("safety.guardFailed")}{" "}
            <button onClick={onRetryGuard} className="font-semibold text-navy underline underline-offset-4">{t("safety.guardRetry")}</button>
          </p>
        )}
        {g?.status === "done" && flagged.length === 0 && (
          <p className="mt-1 text-sm text-ink/85">
            {g.result?.verdict === "injection" && g.unlocated > 0
              ? t("safety.guardUnlocated")
              : tp("safety.guardClean", clientCount, { chance: g.result ? t("safety.guardChance", { pct: Math.round(g.result.injection * 100) }) : "" })}
          </p>
        )}
        {flagged.length > 0 && (
          <div role="status" className="mt-2 space-y-2">
            <p className="rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-ink">
              <b className="text-warn">{tp("safety.guardFlagged", flagged.length)}</b>{" "}
              {t("safety.guardFlaggedNote")}
            </p>
            <ul className="space-y-2">
              {flagged.map((i) => {
                const f = g!.flags.find((x) => x.messageIndex === i);
                const withheld = g!.withheld.includes(i);
                return (
                  <li key={i} className="rounded-xl border border-line bg-paper px-4 py-3 text-sm">
                    <p className="text-xs text-muted">{t(withheld ? "safety.withheld" : "safety.included", { speaker: speaker(i), n: i + 1 })}</p>
                    {f?.quotes.map((q, k) => <p key={k} className="mt-1">“{q}”</p>)}
                    <div className="mt-2">
                      {withheld
                        ? <button onClick={() => onInclude(i)} className="press rounded-lg border border-navy/30 bg-card px-3 py-1.5 text-xs font-semibold text-navy shadow-card hover:border-navy">{t("safety.includeAnyway")}</button>
                        : <button onClick={() => onWithhold(i)} className="press rounded-lg border border-navy/30 bg-card px-3 py-1.5 text-xs font-semibold text-navy shadow-card hover:border-navy">{t("safety.withholdAgain")}</button>}
                      <span className="ml-3 text-xs text-muted">{t("safety.choiceRecorded")}{withheld ? t("safety.includeNote") : ""}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* M12 Compare: promise check */}
      <div className={row} id="promise">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><ConflictIcon width={18} height={18} className="text-navy" />{t("safety.promiseTitle")}</h3>
        {!analysis.promiseCheck && <p className="mt-1 text-sm text-muted">{t(recorded ? "safety.promiseNotRunRecorded" : "safety.promiseNotRun")}</p>}
        {analysis.promiseCheck?.status === "running" && <p role="status" className="mt-1 flex items-center gap-2 text-sm text-muted"><span className="spinner" /> {t("safety.promiseRunning")}</p>}
        {analysis.promiseCheck?.status === "failed" && (
          <p role="alert" className="mt-1 text-sm text-ink"><b className="text-change">{t("safety.promiseFailed")}</b> {analysis.promiseCheck.error}{" "}
            <button onClick={onRetryPromise} className="font-semibold text-navy underline underline-offset-4">{t("common.retry")}</button></p>
        )}
        {analysis.promiseCheck?.status === "done" && analysis.promiseCheck.conflicts.length === 0 && (
          <p className="mt-1 text-sm text-ink/85">{t("safety.promiseClean")}</p>
        )}
        {analysis.promiseCheck?.status === "done" && analysis.promiseCheck.conflicts.length > 0 && (
          <ul className="mt-2 space-y-3">
            {analysis.promiseCheck.conflicts.map((c, i) => (
              <li key={i} className="rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm">
                <p className="t-eyebrow text-warn">{t("safety.conflict")}</p>
                <p className="mt-2"><span className="font-semibold">{t("safety.contractLabel")}</span> “{c.contract.quote}”</p>
                <p className="mt-1 whitespace-pre-wrap"><span className="font-semibold">{t("safety.youWrote")}</span> “{c.yours.quote}”</p>
                <p className="mt-2 text-xs text-muted">{t("safety.conflictNote")}</p>
                <button onClick={() => onShowSpan(`promise${i}-0:promise`)} className="press mt-2 rounded-lg border border-navy/30 bg-card px-3 py-1.5 text-xs font-semibold text-navy shadow-card hover:border-navy">{t("common.showInThread")}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* M13 Inspect: client-supplied scripts */}
      <div className={row} id="scripts">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><CodeIcon width={18} height={18} className="text-navy" />{t("script.title")}</h3>
        {!analysis.scripts && <p className="mt-1 text-sm text-muted">{t(recorded ? "safety.notRunRecorded" : "safety.notRun")}</p>}
        {analysis.scripts && analysis.scripts.length === 0 && (
          <>
            <p className="mt-1 text-sm text-ink/85">{t("script.none")}</p>
            <p className="mt-1 text-xs text-muted">{t("script.looked")}</p>
          </>
        )}
        {analysis.scripts && analysis.scripts.length > 0 && (
          <ul className="mt-2 space-y-2">
            {analysis.scripts.map((c, i) => (
              <li key={i} className="rounded-xl border border-line bg-paper px-4 py-3 text-sm">
                <span className="text-xs text-muted">{t("card.msgRef", { speaker: analysis.messages[c.messageIndex]?.speaker ?? "", n: c.messageIndex + 1 })}</span>{" "}
                {c.status === "running" && <span role="status" className="inline-flex items-center gap-2 text-muted"><span className="spinner" /> {t("script.checking")}</span>}
                {c.status === "failed" && <span role="alert">{t("script.checkFailed")} <button onClick={() => onRetryScript(i)} className="font-semibold text-navy underline underline-offset-4">{t("common.retry")}</button></span>}
                {c.status === "done" && c.result && <b>{t(`script.${c.result.risk}` as Key)} <span className="font-normal text-muted">{t("card.modelEstimate")}</span></b>}
              </li>
            ))}
          </ul>
        )}
        {(analysis.scriptsSkipped ?? 0) > 0 && <p className="mt-2 text-xs text-muted">{tp("script.skipped", analysis.scriptsSkipped ?? 0)}</p>}
        <p className="mt-2 text-xs text-muted">{t("script.caveat")}</p>
      </div>

      {/* M11 Protect: privacy-safe evidence pack */}
      <EvidencePackRow analysis={analysis} recorded={recorded} onMakePack={onMakePack} />
    </section>
  );
}

function EvidencePackRow({ analysis, recorded, onMakePack }: { analysis: Analysis; recorded: boolean; onMakePack: (id: string) => void }) {
  const { t } = useI18n();
  const options = useMemo(() => analysis.items.filter((i) => i.status === "done" && ["needs_change_order", "ask_me", "agreed_extra"].includes(effectiveQueue(i.route, i.decision))), [analysis.items]);
  const [sel, setSel] = useState<string>("");
  const id = options.some((o) => o.id === sel) ? sel : (options[0]?.id ?? "");
  const item = options.find((o) => o.id === id);
  const pack = id ? analysis.packs?.[id] : undefined;
  const download = () => {
    if (!pack?.maskedText) return;
    const url = URL.createObjectURL(new Blob([pack.maskedText], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "evidence-pack-masked.txt"; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <details className="group border-t border-line px-5 py-4 sm:px-6" id="evidence-pack">
      <summary className="flex list-none items-center justify-between gap-3 text-sm font-semibold">
        <span className="flex items-center gap-2"><PackIcon width={18} height={18} className="text-navy" />{t("pack.title")}</span>
        <span aria-hidden className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-muted">{t("pack.intro")}</p>
        {options.length === 0 ? <p className="text-muted">{t("pack.noRequests")}</p> : (
          <>
            <label className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{t("pack.request")}</span>
              <select value={id} onChange={(e) => setSel(e.target.value)} className="max-w-full rounded-lg border border-line bg-card px-3 py-1.5 text-sm">
                {options.map((o) => <option key={o.id} value={o.id}>{queueLabel(t, effectiveQueue(o.route, o.decision) as Queue)}: {o.text.slice(0, 70)}</option>)}
              </select>
            </label>
            {!pack && !recorded && <button onClick={() => onMakePack(id)} className="press rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-paper shadow-lift hover:bg-navy/90">{t("pack.create")}</button>}
            {!pack && recorded && <p className="text-muted">{t("pack.noneRecorded")}</p>}
            {pack?.status === "running" && <p role="status" className="flex items-center gap-2 text-muted"><span className="spinner" /> {t("pack.masking")}</p>}
            {pack?.status === "failed" && <p role="alert" className="text-ink"><b className="text-change">{t("pack.maskFailed")}</b> {pack.error} <button onClick={() => onMakePack(id)} className="font-semibold text-navy underline underline-offset-4">{t("common.retry")}</button></p>}
            {pack?.status === "done" && (
              <div className="space-y-3">
                <p className="font-semibold">{t("pack.found")} <span data-pack-count>{describeCountsText(t, pack.counts)}</span></p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-paper p-4 font-sans text-[0.9375rem] leading-6" aria-label={t("pack.maskedAria")}>{pack.maskedText}</pre>
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton text={pack.maskedText ?? ""} label={t("pack.copy")} />
                  <button onClick={download} className="press rounded-xl border border-navy/30 bg-card px-4 py-2 text-sm font-semibold text-navy shadow-card hover:border-navy">{t("pack.download")}</button>
                </div>
                <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-ink"><b>{t("pack.warn")}</b> {t("pack.warnFor", { text: item?.text ?? "" })}</p>
                <details className="text-xs text-muted"><summary className="cursor-pointer">{t("pack.showOriginal")}</summary><pre className="mt-2 whitespace-pre-wrap font-sans text-[0.875rem] leading-6 text-ink">{pack.text}</pre></details>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
