import { useMemo, useState } from "react";
import { describeCounts } from "../lib/protect";
import { effectiveQueue, QUEUE_LABEL } from "../lib/routing";
import type { Analysis } from "../lib/pipeline";
import { describeError } from "../lib/errors";
import { ConflictIcon, PackIcon, ShieldAlertIcon, ShieldCheckIcon } from "./icons";
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
}

const row = "border-t border-line px-5 py-4 first:border-t-0 sm:px-6";

/** One calm area for the safety and evidence features. Model judgments are labelled as estimates. */
export function SafetyEvidence({ analysis, recorded, onInclude, onWithhold, onRetryGuard, onShowSpan, onRetryPromise, onMakePack }: Props) {
  const g = analysis.guard;
  const flagged = g ? [...new Set([...g.withheld, ...g.included])].sort((a, b) => a - b) : [];
  const clientCount = analysis.messages.filter((m) => m.isClient).length;
  const speaker = (i: number) => analysis.messages[i]?.speaker ?? "";

  return (
    <section aria-label="Safety and evidence" className="surface overflow-hidden">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <p className="t-eyebrow text-muted">Safety and evidence</p>
        <h2 className="t-h3 mt-1">Checks on the input and on what you send</h2>
      </div>

      {/* M9 Guard */}
      <div className={`${row} mt-4`} id="guard">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {flagged.length > 0 ? <ShieldAlertIcon width={18} height={18} className="text-warn" /> : <ShieldCheckIcon width={18} height={18} className="text-scope" />}
          Guard: messages that try to instruct the analysis
        </h3>
        {!g && <p className="mt-1 text-sm text-muted">Not run{recorded ? " in this recording" : ""}.</p>}
        {g?.status === "running" && <p role="status" className="mt-1 flex items-center gap-2 text-sm text-muted"><span className="spinner" /> Screening the client’s messages…</p>}
        {g?.status === "failed" && (
          <p role="alert" className="mt-1 text-sm text-ink">
            <b className="text-change">{describeError(g.errorKind, g.error).title}</b> Guard could not run, so the client’s messages were not screened.{" "}
            <button onClick={onRetryGuard} className="font-semibold text-navy underline underline-offset-4">Retry Guard</button>
          </p>
        )}
        {g?.status === "done" && flagged.length === 0 && (
          <p className="mt-1 text-sm text-ink/85">
            {g.result?.verdict === "injection" && g.unlocated > 0
              ? "Guard estimates that something in the client’s messages may be an instruction to the analysis tool, but could not locate it, so nothing was withheld. Please read the thread."
              : <>No instruction to the analysis tool found in the client’s {clientCount} message{clientCount === 1 ? "" : "s"} (estimate{g.result ? `, ${Math.round(g.result.injection * 100)}% chance of one` : ""}). Guard is a detector, not a guarantee.</>}
          </p>
        )}
        {flagged.length > 0 && (
          <div role="status" className="mt-2 space-y-2">
            <p className="rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-ink">
              <b className="text-warn">Guard flagged {flagged.length} client message{flagged.length === 1 ? "" : "s"} as a possible instruction to the analysis tool.</b>{" "}
              This is an estimate, not a verdict. Flagged text is replaced by “[message withheld: possible instruction to the analysis tool]” before Decide, Fill and Verify see the thread. Ordinary requests, pressure and discount asks are not flagged.
            </p>
            <ul className="space-y-2">
              {flagged.map((i) => {
                const f = g!.flags.find((x) => x.messageIndex === i);
                const withheld = g!.withheld.includes(i);
                return (
                  <li key={i} className="rounded-xl border border-line bg-paper px-4 py-3 text-sm">
                    <p className="text-xs text-muted">{speaker(i)} · message {i + 1} · {withheld ? "withheld from the analysis" : "included by you"}</p>
                    {f?.quotes.map((q, k) => <p key={k} className="mt-1">“{q}”</p>)}
                    <div className="mt-2">
                      {withheld
                        ? <button onClick={() => onInclude(i)} className="press rounded-lg border border-navy/30 bg-card px-3 py-1.5 text-xs font-semibold text-navy shadow-card hover:border-navy">Include anyway</button>
                        : <button onClick={() => onWithhold(i)} className="press rounded-lg border border-navy/30 bg-card px-3 py-1.5 text-xs font-semibold text-navy shadow-card hover:border-navy">Withhold again</button>}
                      <span className="ml-3 text-xs text-muted">Your choice is recorded here. {withheld ? "Including it runs the analysis for that message only." : ""}</span>
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
        <h3 className="flex items-center gap-2 text-sm font-semibold"><ConflictIcon width={18} height={18} className="text-navy" />Promise check: your own messages against the contract</h3>
        {!analysis.promiseCheck && <p className="mt-1 text-sm text-muted">Not run{recorded ? " in this recording" : ""}: needs the contract and at least one message from you.</p>}
        {analysis.promiseCheck?.status === "running" && <p role="status" className="mt-1 flex items-center gap-2 text-sm text-muted"><span className="spinner" /> Comparing your messages with the contract…</p>}
        {analysis.promiseCheck?.status === "failed" && (
          <p role="alert" className="mt-1 text-sm text-ink"><b className="text-change">The promise check could not run.</b> {analysis.promiseCheck.error}{" "}
            <button onClick={onRetryPromise} className="font-semibold text-navy underline underline-offset-4">Retry</button></p>
        )}
        {analysis.promiseCheck?.status === "done" && analysis.promiseCheck.conflicts.length === 0 && (
          <p className="mt-1 text-sm text-ink/85">No conflicts found in your messages (estimate). This is not a guarantee: read what you promised.</p>
        )}
        {analysis.promiseCheck?.status === "done" && analysis.promiseCheck.conflicts.length > 0 && (
          <ul className="mt-2 space-y-3">
            {analysis.promiseCheck.conflicts.map((c, i) => (
              <li key={i} className="rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm">
                <p className="t-eyebrow text-warn">Possible conflict, please review</p>
                <p className="mt-2"><span className="font-semibold">Contract:</span> “{c.contract.quote}”</p>
                <p className="mt-1 whitespace-pre-wrap"><span className="font-semibold">You wrote:</span> “{c.yours.quote}”</p>
                <p className="mt-2 text-xs text-muted">A model estimate, not a verdict. The quoted passage can include neighbouring messages.</p>
                <button onClick={() => onShowSpan(`promise${i}-0:promise`)} className="press mt-2 rounded-lg border border-navy/30 bg-card px-3 py-1.5 text-xs font-semibold text-navy shadow-card hover:border-navy">Show in thread</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* M11 Protect: privacy-safe evidence pack */}
      <EvidencePackRow analysis={analysis} recorded={recorded} onMakePack={onMakePack} />
    </section>
  );
}

function EvidencePackRow({ analysis, recorded, onMakePack }: { analysis: Analysis; recorded: boolean; onMakePack: (id: string) => void }) {
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
        <span className="flex items-center gap-2"><PackIcon width={18} height={18} className="text-navy" />Privacy-safe evidence pack</span>
        <span aria-hidden className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-muted">Assembles the request, the verdict and its probabilities, the client’s sentence, the agreement or withdrawal sentence, the governing clause and the change-order draft into one text, then asks Clocked’s Protect endpoint to mask names, emails, phone numbers, addresses and bank or card numbers. Your original text is never changed.</p>
        {options.length === 0 ? <p className="text-muted">No request in the outside-scope queues yet.</p> : (
          <>
            <label className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Request</span>
              <select value={id} onChange={(e) => setSel(e.target.value)} className="max-w-full rounded-lg border border-line bg-card px-3 py-1.5 text-sm">
                {options.map((o) => <option key={o.id} value={o.id}>{QUEUE_LABEL[effectiveQueue(o.route, o.decision) as keyof typeof QUEUE_LABEL]}: {o.text.slice(0, 70)}</option>)}
              </select>
            </label>
            {!pack && !recorded && <button onClick={() => onMakePack(id)} className="press rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-paper shadow-lift hover:bg-navy/90">Create masked pack (1 Protect call)</button>}
            {!pack && recorded && <p className="text-muted">No pack was recorded for this request in Demo mode.</p>}
            {pack?.status === "running" && <p role="status" className="flex items-center gap-2 text-muted"><span className="spinner" /> Masking…</p>}
            {pack?.status === "failed" && <p role="alert" className="text-ink"><b className="text-change">Masking failed.</b> {pack.error} <button onClick={() => onMakePack(id)} className="font-semibold text-navy underline underline-offset-4">Retry</button></p>}
            {pack?.status === "done" && (
              <div className="space-y-3">
                <p className="font-semibold">Found and masked: <span data-pack-count>{describeCounts(pack.counts)}</span></p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-paper p-4 font-sans text-[0.9375rem] leading-6" aria-label="Masked evidence pack">{pack.maskedText}</pre>
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton text={pack.maskedText ?? ""} label="Copy masked text" />
                  <button onClick={download} className="press rounded-xl border border-navy/30 bg-card px-4 py-2 text-sm font-semibold text-navy shadow-card hover:border-navy">Download .txt</button>
                </div>
                <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-ink"><b>Detection can miss sensitive data. Review before sharing.</b> The masked copy is for the request “{item?.text}” only.</p>
                <details className="text-xs text-muted"><summary className="cursor-pointer">Show the original text (not masked, stays on your screen)</summary><pre className="mt-2 whitespace-pre-wrap font-sans text-[0.875rem] leading-6 text-ink">{pack.text}</pre></details>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
