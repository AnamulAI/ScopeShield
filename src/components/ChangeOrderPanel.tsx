import { describeError } from "../lib/errors";
import { changeOrderText, copyBlocked, type RequestItem } from "../lib/pipeline";
import { countVerdicts, verifyCopyState, type VerifiedClaim } from "../lib/verify";
import { CopyButton } from "./CopyButton";

const Chip = () => (
  <span className="t-eyebrow inline-flex items-center gap-1 rounded-full border border-ask/30 bg-ask-bg px-2.5 py-0.5 text-ask"><span aria-hidden>✦</span>AI-generated draft</span>
);

interface Props {
  item: RequestItem; open: boolean; setOpen: (v: boolean) => void;
  onPrepare: () => void; onRegenerate: () => void; onShowPrice: () => void;
  onShowEvidence: (spanId: string) => void; onAck: () => void; onRetryVerify: () => void;
}

export function ChangeOrderPanel({ item, open, setOpen, onPrepare, onRegenerate, onShowPrice, onShowEvidence, onAck, onRetryVerify }: Props) {
  const st = item.changeOrder;
  // Collapsed by default to keep cards compact (state lives in Results so it survives the card moving between queues).

  if (!st) {
    return (
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button onClick={() => { setOpen(true); onPrepare(); }} className="rounded-xl bg-navy px-5 py-2.5 text-sm font-semibold text-paper shadow-lift transition hover:bg-navy/90">Prepare change order</button>
        <span className="text-xs text-muted">One Fill call, about 10 credits.</span>
      </div>
    );
  }
  if (st.status === "running" && !st.data) {
    return <div role="status" className="mt-5 space-y-3 border-t border-line pt-4"><p className="flex items-center gap-2 text-sm text-muted"><span className="spinner" /> Preparing the change order…</p><div className="skeleton h-4 w-3/4" /><div className="skeleton h-4 w-1/2" /></div>;
  }
  if (st.status === "failed") {
    return (
      <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-change/30 bg-change-bg px-4 py-3 text-sm">
        <span className="text-ink"><b className="text-change">{describeError(st.errorKind, st.error).title}</b> {describeError(st.errorKind, st.error).hint}</span>
        <button onClick={onPrepare} className="rounded-lg bg-navy px-4 py-1.5 text-xs font-semibold text-paper">Retry</button>
      </div>
    );
  }
  const co = st.data;
  if (!co) return null;
  const vs = verifyCopyState(st.verify);
  const invented = copyBlocked(co);
  // Copy is blocked by the invented-amount guard, by a contradicted claim, and gated (one click) by not-found claims.
  const messageReason = co.inventedMessage.length ? "Blocked: the draft contains an amount that is not in the thread." : vs.blockedReason ?? (vs.needsAck ? "Click “I’ve read this” on the not-found note first." : undefined);
  const reason = invented ? "Blocked: the draft contains an amount that is not in the thread." : vs.blockedReason ?? (vs.needsAck ? "Click “I’ve read this” on the not-found note first." : undefined);
  const warn = (amounts: string[]) =>
    amounts.length > 0 && (
      <div role="alert" className="mt-2.5 flex gap-2.5 rounded-xl border border-change/40 bg-change-bg px-3.5 py-3 text-xs leading-5 text-ink">
        <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-change text-xs font-bold text-white">✕</span><span><b className="text-change">Copy blocked.</b> This draft mentions {amounts.join(", ")}, which does not appear in the contract or thread, so it may be an invented price.{" "}
        {st.regenerated ? "The one Regenerate attempt is used. Write this part yourself." : (
          <button onClick={onRegenerate} className="ml-1 rounded-md bg-navy px-2.5 py-1 font-semibold text-paper">Regenerate once</button>
        )}</span>
      </div>
    );

  const anyInvented = co.inventedMessage.length > 0 || co.inventedNextStep.length > 0;
  const vsCollapsed = verifyCopyState(st.verify);
  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={`co-${item.id}`}
          className="rounded-xl border border-navy/30 bg-card px-4 py-2 text-sm font-semibold text-navy shadow-card transition hover:border-navy">
          {open ? "Hide change order" : "View change order"}
        </button>
        <span className="text-xs text-muted">Draft ready · AI-generated</span>
        {anyInvented && !open && <span role="alert" className="text-xs font-medium text-change">Copy blocked: the draft mentions an amount that is not in the thread. Open it for details.</span>}
        {!anyInvented && vsCollapsed.blockedReason && !open && <span role="alert" className="text-xs font-medium text-change">Copy blocked: Verify found a claim that contradicts the contract or thread. Open it for details.</span>}
      </div>
    {open && (
    <section id={`co-${item.id}`} aria-label="Change order" className="mt-4 space-y-5 rounded-2xl border border-line bg-paper p-4 sm:p-5" aria-busy={st.status === "running"}>
      <h4 className="t-h3">Change order</h4>
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-2 text-sm leading-6">
        <dt className="text-muted">Request</dt><dd>{item.text}</dd>
        <dt className="text-muted">Category</dt><dd>{co.category ? co.category.replace("_", " ") : <em className="text-muted">not determined</em>}</dd>
        <dt className="text-muted">Unpaid risk</dt><dd>{co.unpaidRisk ?? <em className="text-muted">not determined</em>} <span className="text-xs text-muted">(model estimate)</span></dd>
        <dt className="text-muted">Price quoted</dt>
        <dd>
          {co.priceMentioned ? (
            <>
              <b>{co.priceMentioned}</b>{" "}
              {co.priceEvidence && <button onClick={onShowPrice} className="text-xs font-medium text-navy underline underline-offset-4">Show in thread</button>}
            </>
          ) : <em className="font-medium text-change">No price was quoted in this thread</em>}
        </dd>
      </dl>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2"><span className="t-eyebrow text-muted">Message to client</span><Chip /></div>
        <p className="whitespace-pre-wrap rounded-xl border border-ask/25 bg-card px-4 py-3 text-[0.9375rem] leading-6">{co.message ?? "No message was generated."}</p>
        {warn(co.inventedMessage)}
        <VerifyBlock item={item} onShowEvidence={onShowEvidence} onAck={onAck} onRetry={onRetryVerify} />
        {co.message && <div className="mt-3"><CopyButton text={co.message} label="Copy message" blockedReason={messageReason} /></div>}
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2"><span className="t-eyebrow text-muted">Next step for you</span><Chip /></div>
        <p className="rounded-xl border border-ask/25 bg-card px-4 py-3 text-[0.9375rem] leading-6">{co.nextStep ?? "No next step was generated."}</p>
        {warn(co.inventedNextStep)}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <CopyButton primary text={changeOrderText(item.text, co)} label="Copy whole change order" blockedReason={reason} />
        <span className="text-xs leading-5 text-muted">Generated text is a draft. Read it before you send it. The next step is not checked by Verify.</span>
      </div>
    </section>
    )}
    </div>
  );
}

const QUOTE_LABEL: Record<string, string> = { contract: "From the contract", thread: "From the thread" };

function ClaimEvidence({ claim, spanId, onShow }: { claim: VerifiedClaim; spanId: string; onShow: (id: string) => void }) {
  const ev = claim.evidence;
  if (!ev) return null;
  return (
    <p className="mt-1 text-xs text-ink/80">
      <span className="font-semibold">{QUOTE_LABEL[ev.document] ?? ev.document}:</span> “{ev.quote}”{" "}
      {ev.document === "thread" && ev.located && <button onClick={() => onShow(spanId)} className="font-medium text-navy underline underline-offset-4">Show in thread</button>}
    </p>
  );
}

function VerifyBlock({ item, onShowEvidence, onAck, onRetry }: { item: RequestItem; onShowEvidence: (id: string) => void; onAck: () => void; onRetry: () => void }) {
  const v = item.changeOrder?.verify;
  if (!v) return null;
  if (v.status === "running") return <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted"><span className="spinner" /> Verifying this draft against the contract and the thread…</p>;
  if (v.status === "failed") {
    return (
      <p role="alert" className="mt-3 rounded-xl border border-line bg-card px-3.5 py-3 text-xs leading-5 text-muted">
        <b className="text-ink">Not verified.</b> The check could not run, so nothing here was compared with the contract or the thread. <button onClick={onRetry} className="font-semibold text-navy underline underline-offset-4">Retry verify</button>
      </p>
    );
  }
  const claims = v.claims ?? [];
  const n = countVerdicts(claims);
  const idx = (c: VerifiedClaim) => claims.indexOf(c);
  const vs = verifyCopyState(v);
  if (claims.length === 0) return <p className="mt-3 text-xs text-muted">Verify found no factual claims in this draft to check.</p>;
  return (
    <div className="mt-3 space-y-2.5" aria-label="Verification">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-scope-bg px-2.5 py-1 font-semibold text-scope"><span aria-hidden>✓</span>{claims.length} claim{claims.length === 1 ? "" : "s"} checked against the contract and thread</span>
        <span className="text-muted">{n.supported} supported{n.notStated ? `, ${n.notStated} not found` : ""}{n.contradicted ? `, ${n.contradicted} contradicted` : ""}</span>
      </p>
      {claims.filter((c) => c.verdict === "contradicted").map((c) => (
        <div key={idx(c)} role="alert" className="flex gap-2.5 rounded-xl border border-change/40 bg-change-bg px-3.5 py-3 text-xs leading-5 text-ink">
          <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-change text-xs font-bold text-white">✕</span>
          <div>
            <p><b className="text-change">Contradicted. Copy is blocked.</b> “{c.text}”</p>
            <ClaimEvidence claim={c} spanId={`${item.id}:v${idx(c)}`} onShow={onShowEvidence} />
            <p className="mt-1 text-muted">Regenerate the draft or edit it yourself before sending.</p>
          </div>
        </div>
      ))}
      {claims.filter((c) => c.verdict === "not_stated").map((c) => (
        <div key={idx(c)} className="flex gap-2.5 rounded-xl border border-warn/40 bg-warn-bg px-3.5 py-3 text-xs leading-5 text-ink">
          <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warn text-xs font-bold text-white">!</span>
          <div>
            <p><b className="text-warn">Not found in the thread.</b> “{c.text}”</p>
            <ClaimEvidence claim={c} spanId={`${item.id}:v${idx(c)}`} onShow={onShowEvidence} />
            <p className="mt-1 text-muted">The sources do not establish this. It is not necessarily wrong, for example if it is a promise you are making.</p>
          </div>
        </div>
      ))}
      {vs.needsAck && <button onClick={onAck} className="rounded-lg border border-warn/50 bg-card px-3.5 py-1.5 text-xs font-semibold text-warn shadow-card transition hover:bg-warn-bg">I’ve read this</button>}
      {n.notStated > 0 && !vs.needsAck && !n.contradicted && <p className="text-xs text-muted">Not-found note acknowledged. Copy is enabled.</p>}
      {n.supported > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted">Evidence for the {n.supported} supported claim{n.supported === 1 ? "" : "s"}</summary>
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
