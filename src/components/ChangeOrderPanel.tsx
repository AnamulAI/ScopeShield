import { describeError } from "../lib/errors";
import { changeOrderText, copyBlocked, type RequestItem } from "../lib/pipeline";
import { countVerdicts, verifyCopyState, type VerifiedClaim } from "../lib/verify";
import { CopyButton } from "./CopyButton";
import { useI18n } from "../i18n";

const Chip = () => {
  const { t } = useI18n();
  return <span className="t-eyebrow inline-flex items-center gap-1 rounded-full border border-line bg-paper-deep px-2.5 py-0.5 text-ink"><span aria-hidden>✦</span>{t("co.chip")}</span>;
};

interface Props {
  item: RequestItem; open: boolean; setOpen: (v: boolean) => void;
  onPrepare: () => void; onRegenerate: () => void; onShowPrice: () => void;
  onShowEvidence: (spanId: string) => void; onAck: () => void; onRetryVerify: () => void;
}

export function ChangeOrderPanel({ item, open, setOpen, onPrepare, onRegenerate, onShowPrice, onShowEvidence, onAck, onRetryVerify }: Props) {
  const { t } = useI18n();
  const st = item.changeOrder;
  // Collapsed by default to keep cards compact (state lives in Results so it survives the card moving between queues).

  if (!st) {
    return (
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button onClick={() => { setOpen(true); onPrepare(); }} className="rounded-xl bg-navy px-5 py-2.5 text-sm font-semibold text-paper shadow-lift press hover:bg-navy/90">{t("co.prepare")}</button>
        <span className="text-xs text-muted">{t("co.prepareCost")}</span>
      </div>
    );
  }
  if (st.status === "running" && !st.data) {
    return <div role="status" className="mt-5 space-y-3 border-t border-line pt-4"><p className="flex items-center gap-2 text-sm text-muted"><span className="spinner" /> {t("co.preparing")}</p><div className="skeleton h-4 w-3/4" /><div className="skeleton h-4 w-1/2" /></div>;
  }
  if (st.status === "failed") {
    return (
      <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-change/30 bg-change-bg px-4 py-3 text-sm">
        <span className="text-ink"><b className="text-change">{describeError(st.errorKind, st.error, t).title}</b> {describeError(st.errorKind, st.error, t).hint}</span>
        <button onClick={onPrepare} className="rounded-lg bg-navy px-4 py-1.5 text-xs font-semibold text-paper">{t("common.retry")}</button>
      </div>
    );
  }
  const co = st.data;
  if (!co) return null;
  const vs = verifyCopyState(st.verify);
  const invented = copyBlocked(co);
  // Copy is blocked by the invented-amount guard, by a contradicted claim, and gated (one click) by not-found claims.
  const verifyReason = vs.blockedReason ? t("co.blockedContradict") : vs.needsAck ? t("co.needAck") : undefined;
  const messageReason = co.inventedMessage.length ? t("co.blockedAmount") : verifyReason;
  const reason = invented ? t("co.blockedAmount") : verifyReason;
  const warn = (amounts: string[]) =>
    amounts.length > 0 && (
      <div role="alert" className="mt-2.5 flex gap-2.5 rounded-xl border border-change/30 bg-change-bg px-3.5 py-3 text-xs leading-5 text-ink">
        <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-change text-xs font-bold text-card">✕</span><span><b className="text-change">{t("co.copyBlocked")}</b> {t("co.inventedBody", { amounts: amounts.join(", ") })}{" "}
        {st.regenerated ? t("co.regenUsed") : (
          <button onClick={onRegenerate} className="ml-1 rounded-md bg-navy px-2.5 py-1 font-semibold text-paper">{t("co.regenOnce")}</button>
        )}</span>
      </div>
    );

  const anyInvented = co.inventedMessage.length > 0 || co.inventedNextStep.length > 0;
  const vsCollapsed = verifyCopyState(st.verify);
  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={`co-${item.id}`}
          className="rounded-xl border border-navy/30 bg-card px-4 py-2 text-sm font-semibold text-navy shadow-card press hover:border-navy">
          {open ? t("co.hide") : t("co.view")}
        </button>
        <span className="text-xs text-muted">{t("co.draftReady")}</span>
        {anyInvented && !open && <span role="alert" className="text-xs font-medium text-change">{t("co.collapsedAmount")}</span>}
        {!anyInvented && vsCollapsed.blockedReason && !open && <span role="alert" className="text-xs font-medium text-change">{t("co.collapsedContradict")}</span>}
      </div>
    {open && (
    <section id={`co-${item.id}`} aria-label={t("co.title")} className="mt-4 space-y-5 rounded-2xl border border-line bg-paper p-4 sm:p-5" aria-busy={st.status === "running"}>
      <h4 className="t-h3">{t("co.title")}</h4>
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-2 text-sm leading-6">
        <dt className="text-muted">{t("co.request")}</dt><dd>{item.text}</dd>
        <dt className="text-muted">{t("co.category")}</dt><dd>{co.category ? co.category.replace("_", " ") : <em className="text-muted">{t("co.notDetermined")}</em>}</dd>
        <dt className="text-muted">{t("co.risk")}</dt><dd>{co.unpaidRisk ?? <em className="text-muted">{t("co.notDetermined")}</em>} <span className="text-xs text-muted">{t("card.modelEstimate")}</span></dd>
        <dt className="text-muted">{t("co.priceQuoted")}</dt>
        <dd>
          {co.priceMentioned ? (
            <>
              <b>{co.priceMentioned}</b>{" "}
              {co.priceEvidence && <button onClick={onShowPrice} className="text-xs font-medium text-navy underline underline-offset-4">{t("common.showInThread")}</button>}
            </>
          ) : <em className="font-medium text-change">{t("co.noPrice")}</em>}
        </dd>
      </dl>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2"><span className="t-eyebrow text-muted">{t("co.messageToClient")}</span><Chip /></div>
        <p className="whitespace-pre-wrap rounded-xl border border-line bg-card px-4 py-3 text-[0.9375rem] leading-6">{co.message ?? t("co.noMessage")}</p>
        {warn(co.inventedMessage)}
        <VerifyBlock item={item} onShowEvidence={onShowEvidence} onAck={onAck} onRetry={onRetryVerify} />
        {co.message && <div className="mt-3"><CopyButton text={co.message} label={t("co.copyMessage")} blockedReason={messageReason} /></div>}
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2"><span className="t-eyebrow text-muted">{t("co.nextStep")}</span><Chip /></div>
        <p className="rounded-xl border border-line bg-card px-4 py-3 text-[0.9375rem] leading-6">{co.nextStep ?? t("co.noNextStep")}</p>
        {warn(co.inventedNextStep)}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <CopyButton primary text={changeOrderText(item.text, co)} label={t("co.copyAll")} blockedReason={reason} />
        <span className="text-xs leading-5 text-muted">{t("co.draftNote")}</span>
      </div>
    </section>
    )}
    </div>
  );
}

function ClaimEvidence({ claim, spanId, onShow }: { claim: VerifiedClaim; spanId: string; onShow: (id: string) => void }) {
  const { t } = useI18n();
  const ev = claim.evidence;
  if (!ev) return null;
  return (
    <p className="mt-1 text-xs text-ink/80">
      <span className="font-semibold">{ev.document === "contract" ? t("verify.fromContract") : ev.document === "thread" ? t("verify.fromThread") : ev.document}:</span> “{ev.quote}”{" "}
      {ev.document === "thread" && ev.located && <button onClick={() => onShow(spanId)} className="font-medium text-navy underline underline-offset-4">{t("common.showInThread")}</button>}
    </p>
  );
}

function VerifyBlock({ item, onShowEvidence, onAck, onRetry }: { item: RequestItem; onShowEvidence: (id: string) => void; onAck: () => void; onRetry: () => void }) {
  const { t, tp } = useI18n();
  const v = item.changeOrder?.verify;
  if (!v) return null;
  if (v.status === "running") return <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted"><span className="spinner" /> {t("verify.running")}</p>;
  if (v.status === "failed") {
    return (
      <p role="alert" className="mt-3 rounded-xl border border-line bg-card px-3.5 py-3 text-xs leading-5 text-muted">
        <b className="text-ink">{t("verify.notVerified")}</b> {t("verify.failedBody")} <button onClick={onRetry} className="font-semibold text-navy underline underline-offset-4">{t("verify.retry")}</button>
      </p>
    );
  }
  const claims = v.claims ?? [];
  const n = countVerdicts(claims);
  const idx = (c: VerifiedClaim) => claims.indexOf(c);
  const vs = verifyCopyState(v);
  if (claims.length === 0) return <p className="mt-3 text-xs text-muted">{t("verify.noClaims")}</p>;
  return (
    <div className="mt-3 space-y-2.5" aria-label={t("verify.aria")}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-scope-bg px-2.5 py-1 font-semibold text-scope"><span aria-hidden>✓</span>{tp("verify.checked", claims.length)}</span>
        <span className="text-muted">{t("verify.supported", { n: n.supported })}{n.notStated ? t("verify.notFoundCount", { n: n.notStated }) : ""}{n.contradicted ? t("verify.contradictedCount", { n: n.contradicted }) : ""}</span>
      </p>
      {claims.filter((c) => c.verdict === "contradicted").map((c) => (
        <div key={idx(c)} role="alert" className="flex gap-2.5 rounded-xl border border-change/30 bg-change-bg px-3.5 py-3 text-xs leading-5 text-ink">
          <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-change text-xs font-bold text-card">✕</span>
          <div>
            <p><b className="text-change">{t("verify.contradicted")}</b> “{c.text}”</p>
            <ClaimEvidence claim={c} spanId={`${item.id}:v${idx(c)}`} onShow={onShowEvidence} />
            <p className="mt-1 text-muted">{t("verify.regenHint")}</p>
          </div>
        </div>
      ))}
      {claims.filter((c) => c.verdict === "not_stated").map((c) => (
        <div key={idx(c)} className="flex gap-2.5 rounded-xl border border-warn/30 bg-warn-bg px-3.5 py-3 text-xs leading-5 text-ink">
          <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warn text-xs font-bold text-card">!</span>
          <div>
            <p><b className="text-warn">{t("verify.notFound")}</b> “{c.text}”</p>
            <ClaimEvidence claim={c} spanId={`${item.id}:v${idx(c)}`} onShow={onShowEvidence} />
            <p className="mt-1 text-muted">{t("verify.notFoundHint")}</p>
          </div>
        </div>
      ))}
      {vs.needsAck && <button onClick={onAck} className="rounded-lg border border-warn/50 bg-card px-3.5 py-1.5 text-xs font-semibold text-warn shadow-card press hover:bg-warn-bg">{t("verify.ack")}</button>}
      {n.notStated > 0 && !vs.needsAck && !n.contradicted && <p className="text-xs text-muted">{t("verify.acked")}</p>}
      {n.supported > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted">{tp("verify.evidence", n.supported)}</summary>
          <ul className="mt-2 space-y-2">
            {claims.filter((c) => c.verdict === "supported").map((c) => (
              <li key={idx(c)}><span className="text-scope">✓</span> “{c.text}”<ClaimEvidence claim={c} spanId={`${item.id}:v${idx(c)}`} onShow={onShowEvidence} /></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
