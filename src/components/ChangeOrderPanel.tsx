import { changeOrderText, copyBlocked, type RequestItem } from "../lib/pipeline";
import { CopyButton } from "./CopyButton";

const Chip = () => (
  <span className="rounded-full border border-ask/30 bg-ask-bg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ask">AI-generated draft</span>
);

interface Props { item: RequestItem; onPrepare: () => void; onRegenerate: () => void; onShowPrice: () => void }

export function ChangeOrderPanel({ item, onPrepare, onRegenerate, onShowPrice }: Props) {
  const st = item.changeOrder;

  if (!st) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <button onClick={onPrepare} className="rounded-md bg-navy px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-navy/90">Prepare change order</button>
        <span className="text-xs text-muted">One Fill call, about 8 credits.</span>
      </div>
    );
  }
  if (st.status === "running" && !st.data) {
    return <p role="status" className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-sm text-muted"><span className="spinner" /> Preparing change order…</p>;
  }
  if (st.status === "failed") {
    return (
      <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
        <span className="text-change">Could not prepare the change order: {st.error}</span>
        <button onClick={onPrepare} className="rounded-md bg-navy px-3 py-1 text-xs font-medium text-white">Retry</button>
      </div>
    );
  }
  const co = st.data;
  if (!co) return null;
  const blocked = copyBlocked(co);
  const reason = blocked ? "Blocked: the draft contains an amount that is not in the thread." : undefined;
  const warn = (amounts: string[]) =>
    amounts.length > 0 && (
      <div role="alert" className="mt-2 rounded-lg border border-change/40 bg-change-bg px-3 py-2 text-xs text-change">
        <b>Copy blocked.</b> This draft mentions {amounts.join(", ")}, which does not appear in the contract or thread, so it may be an invented price.{" "}
        {st.regenerated ? "The one Regenerate attempt is used. Write this part yourself." : (
          <button onClick={onRegenerate} className="ml-1 rounded bg-navy px-2 py-0.5 font-medium text-white">Regenerate once</button>
        )}
      </div>
    );

  return (
    <section aria-label="Change order" className="mt-4 space-y-4 border-t border-line pt-4" aria-busy={st.status === "running"}>
      <h4 className="font-display text-base">Change order</h4>
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
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
        <div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-muted">Message to client</span><Chip /></div>
        <p className="whitespace-pre-wrap rounded-lg border border-dashed border-ask/40 bg-card px-3 py-2 text-sm leading-relaxed">{co.message ?? "No message was generated."}</p>
        {warn(co.inventedMessage)}
        {co.message && <div className="mt-2"><CopyButton text={co.message} label="Copy message" blockedReason={co.inventedMessage.length ? "Blocked: the draft contains an amount that is not in the thread." : undefined} /></div>}
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-muted">Next step for you</span><Chip /></div>
        <p className="rounded-lg border border-dashed border-ask/40 bg-card px-3 py-2 text-sm">{co.nextStep ?? "No next step was generated."}</p>
        {warn(co.inventedNextStep)}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <CopyButton primary text={changeOrderText(item.text, co)} label="Copy whole change order" blockedReason={reason} />
        <span className="text-xs text-muted">Generated text is a draft. Read it before you send it.</span>
      </div>
    </section>
  );
}
