import { describeError } from "../lib/errors";
import { forwardRef } from "react";
import { useI18n, type Key } from "../i18n";
import { askQuestionText, decisionLabel, queueLabel, reasonText } from "../i18n/labels";
import type { RequestItem } from "../lib/pipeline";
import { effortLabelText } from "../lib/health";
import { effectiveQueue, showWithdrawalNote, THRESHOLDS, type Decision } from "../lib/routing";
import { ClauseIcon, QueueIcon, UndoIcon } from "./icons";
import { ScriptRow } from "./ScriptRow";
import type { ScriptCheck } from "../lib/snippets";
import type { Queue } from "../lib/routing";
import { ChangeOrderPanel } from "./ChangeOrderPanel";
import { ProbBar } from "./ProbBar";
import { QUEUES } from "./queues";

export interface CardActions {
  onShow: (spanId: string) => void;
  onRetry: () => void;
  onDecide: (d: Decision | undefined) => void;
  onPrepare: () => void;
  onRegenerate: () => void;
  onRetrySupport: () => void;
  onAck: () => void;
  onRetryVerify: () => void;
  onRetryScript: (index: number) => void;
}
interface Props extends CardActions { item: RequestItem; active: boolean; speaker: string; coOpen: boolean; setCoOpen: (v: boolean) => void; /** position in its queue, for the short reveal stagger */ revealIndex?: number; /** M13: code-snippet checks for this request's message */ scripts?: { check: ScriptCheck; index: number }[] }

const btn = "rounded-lg border px-4 py-2 text-sm font-semibold press";

export const RequestCard = forwardRef<HTMLElement, Props>(function RequestCard({ item, active, speaker, coOpen, setCoOpen, revealIndex = 0, scripts = [], onShow, onRetry, onDecide, onPrepare, onRegenerate, onRetrySupport, onAck, onRetryVerify, onRetryScript }, ref) {
  const { t } = useI18n();
  const eq = effectiveQueue(item.route, item.decision);
  const modelQ = item.route ? QUEUES[item.route.queue] : null;
  const withdrawn = eq === "withdrawn";
  const v = item.verdict;
  const needsAnswer = item.route?.queue === "ask_me" && (item.decision === undefined);

  const accent = eq === "pending" ? "border-l-line" : QUEUES[eq].accent;
  const pill = eq !== "pending" ? QUEUES[eq] : null;
  return (
    <article ref={ref} id={`card-${item.id}`} aria-busy={item.status === "running"}
      onClick={(e) => { if (item.evidence && !(e.target as HTMLElement).closest("button, a, input, textarea, summary, details, label")) onShow(item.id); }}
      style={{ "--i": revealIndex } as React.CSSProperties}
      className={`rise surface border-l-4 p-5 hover:border-navy/30 sm:p-6 ${accent} ${active ? "ring-2 ring-navy/30" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {pill ? (
          <span className={`t-eyebrow inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${pill.bg} ${pill.text}`}>
            <QueueIcon queue={eq as Queue} width={16} height={16} />{queueLabel(t, eq as Queue)}{item.decision && item.route?.queue === "ask_me" ? t("card.yourDecisionSuffix") : ""}
          </span>
        ) : <span className="t-eyebrow text-muted">{t("card.checking")}</span>}
        <span className="text-xs text-muted">{t("card.msgRef", { speaker, n: item.messageIndex + 1 })}{item.evidence ? "" : t("card.noLocate")}</span>
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <p className={`font-display text-[1.1875rem] leading-snug ${withdrawn ? "text-muted line-through decoration-withdrawn/70" : ""}`}>{item.text}</p>
        {item.status === "running" && <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted" role="status"><span className="spinner" /> {t("card.checking")}</span>}
      </div>

      {item.status === "failed" && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-change/30 bg-change-bg px-4 py-3 text-sm">
          <span className="text-ink"><b className="text-change">{describeError(item.errorKind, item.error, t).title}</b> {describeError(item.errorKind, item.error, t).hint}</span>
          <button onClick={onRetry} className="rounded-lg bg-navy px-4 py-1.5 text-xs font-semibold text-paper shadow-card press hover:bg-navy/90">{t("common.retry")}</button>
        </div>
      )}

      {v && modelQ && item.route && (
        <>
          <p className="mt-3 text-sm text-ink/80">{reasonText(t, item.route)}</p>
          {item.governing && !withdrawn && (
            <p data-governing className="mt-2 flex gap-2 text-sm">
              <ClauseIcon width={18} height={18} className="mt-0.5 shrink-0 text-navy" />
              <span>
                <b>{t("card.governing")}</b> <span className="text-muted">{t("card.modelEstimate")}</span>:{" "}
                {item.governing.status === "running" && <span className="text-muted">{t("card.looking")}</span>}
                {item.governing.status === "failed" && <span className="text-muted">{t("card.lookupFailed")}</span>}
                {item.governing.status === "done" && (item.governing.text
                  ? <>“{item.governing.text}” <span className="text-xs text-muted tnum">{item.governing.clauseId} · {Math.round((item.governing.relevance ?? 0) * 100)}%</span></>
                  : <em>{t("card.noClause")}</em>)}
              </span>
            </p>
          )}
          {showWithdrawalNote(eq, v.withdrawn) && <p className="mt-1 text-sm text-muted">{t("card.withdrawalNote", { pct: Math.round(THRESHOLDS.withdrawn * 100) })}</p>}
          <div className="mt-4 space-y-2.5">
            <ProbBar label={t("bar.outside")} value={v.outside} ticks={[THRESHOLDS.inScopeBelow, THRESHOLDS.outsideAtLeast]} tone="bg-navy" hint={t("bar.outsideHint")} />
            <ProbBar label={t("bar.paid")} value={v.paid} ticks={[THRESHOLDS.paidNo, THRESHOLDS.paidYes]} tone="bg-agreed" hint={t("bar.paidHint")} />
            <ProbBar label={t("bar.withdrawn")} value={v.withdrawn} ticks={[THRESHOLDS.withdrawn]} tone="bg-withdrawn" hint={t("bar.withdrawnHint")} />
          </div>
          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            {eq !== "in_scope" && eq !== "withdrawn" && <span>{t("card.tagged")} <b className="font-semibold text-ink">{t(`kind.${v.kind.replace("_", " ")}` as Key)}</b></span>}
            <span>{t("card.effort")} <b className="font-semibold text-ink">{effortLabelText(t, v.effort)}</b></span>
          </p>
        </>
      )}

      <ScriptRow checks={scripts} onShow={onShow} onRetry={onRetryScript} />

      {/* ASK ME: one concrete question, three answers */}
      {item.route?.queue === "ask_me" && item.route.ask && (
        <div className="mt-5 rounded-2xl border border-ask/25 bg-ask-bg p-4 sm:p-5">
          {needsAnswer ? (
            <>
              <p className="t-eyebrow text-ask">{t("ask.eyebrow")}</p>
              <p className="font-display mt-1.5 text-[1.1875rem] leading-snug" id={`q-${item.id}`}>{askQuestionText(t, item.text, item.route.ask)}</p>
              <div role="group" aria-labelledby={`q-${item.id}`} className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2.5">
                <button onClick={() => onDecide("in_scope")} className="rounded-xl border border-scope/40 bg-card px-4 py-3 text-left shadow-card press hover:border-scope hover:shadow-lift">
                  <span className="block text-sm font-semibold text-scope">{t("ask.inScope")}</span><span className="block text-xs text-muted">{t("ask.inScopeSub")}</span>
                </button>
                <button onClick={() => onDecide("extra")} className="rounded-xl border border-change/40 bg-card px-4 py-3 text-left shadow-card press hover:border-change hover:shadow-lift">
                  <span className="block text-sm font-semibold text-change">{t("ask.extra")}</span><span className="block text-xs text-muted">{t("ask.extraSub")}</span>
                </button>
                <button onClick={() => onDecide("skip")} className="rounded-xl border border-line bg-card px-4 py-3 text-left shadow-card press hover:border-ink/40 hover:shadow-lift">
                  <span className="block text-sm font-semibold text-ink/80">{t("ask.skip")}</span><span className="block text-xs text-muted">{t("ask.skipSub")}</span>
                </button>
              </div>
              <p className="mt-3 text-xs text-muted">{t("ask.recorded")}</p>
            </>
          ) : (
            <p className="pop-in flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span>{t("ask.yourDecision")} <b>{decisionLabel(t, item.decision!)}</b></span>
              <span className="text-xs text-muted">{t("ask.modelSaid")}</span>
              <button onClick={() => onDecide(undefined)} className="press inline-flex items-center gap-1 text-xs font-semibold text-navy underline underline-offset-4"><UndoIcon className="undo-icon" width={14} height={14} />{t("ask.undo")}</button>
            </p>
          )}
        </div>
      )}

      {/* AGREED EXTRA / WITHDRAWN: the sentence that supports the verdict */}
      {item.support && (
        <div className={`mt-5 rounded-xl border-l-4 px-4 py-3 text-sm ${item.support.kind === "agreement" ? "border-agreed bg-agreed-bg" : "border-withdrawn bg-withdrawn-bg"}`}>
          <p className="t-eyebrow text-muted">{item.support.kind === "agreement" ? t("support.agreement") : t("support.withdrawal")}</p>
          {item.support.status === "running" && <p role="status" className="mt-1 flex items-center gap-2 text-muted"><span className="spinner" /> {t("support.locating")}</p>}
          {item.support.status === "failed" && (
            <p role="alert" className="mt-1 text-change">{t("support.failed")} <button onClick={onRetrySupport} className="font-medium text-navy underline underline-offset-4">{t("common.retry")}</button></p>
          )}
          {item.support.status === "done" && (item.support.text ? (
            <p className="mt-1">“{item.support.text}”{" "}
              {item.support.evidence && <button onClick={() => onShow(`${item.id}:support`)} className="text-xs font-medium text-navy underline underline-offset-4">{t("common.showInThread")}</button>}
            </p>
          ) : <p className="mt-1 text-muted">{t("support.none")}</p>)}
        </div>
      )}
      {item.route?.queue === "agreed_extra" && (
        <div className="mt-3 rounded-xl bg-agreed-bg px-4 py-3 text-sm text-agreed">
          <p>
            <b>{t("price.label")}</b>{" "}
            {item.agreedPrice?.status === "running" && <span className="inline-flex items-center gap-1.5" role="status"><span className="spinner" /> {t("price.looking")}</span>}
            {item.agreedPrice?.status === "failed" && <span>{t("card.lookupFailed")}</span>}
            {item.agreedPrice?.status === "done" && (item.agreedPrice.value ? (
              <>
                <b>{item.agreedPrice.value}</b>{" "}
                {item.agreedPrice.evidence && <button onClick={() => onShow(`${item.id}:agreedprice`)} className="text-xs font-medium underline underline-offset-4">{t("common.showInThread")}</button>}
              </>
            ) : <em>{t("price.none")}</em>)}
          </p>
          <p className="mt-1"><b>{t("price.invoiceTitle")}</b> {t("price.invoiceBody")}</p>
        </div>
      )}

      {eq === "needs_change_order" && item.status === "done" && (
        <ChangeOrderPanel item={item} open={coOpen} setOpen={setCoOpen} onPrepare={onPrepare} onRegenerate={onRegenerate} onShowPrice={() => onShow(`${item.id}:price`)}
          onShowEvidence={onShow} onAck={onAck} onRetryVerify={onRetryVerify} />
      )}

      {item.evidence && (
        <button onClick={() => onShow(item.id)} className="mt-4 block text-xs font-semibold text-navy underline decoration-navy/30 underline-offset-4 hover:decoration-navy">
          {t("card.showRequest")}
        </button>
      )}
    </article>
  );
});
