import type { Analysis } from "../lib/pipeline";
import { describeError } from "../lib/errors";
import { ShieldAlertIcon, ShieldCheckIcon } from "./icons";

interface Props {
  analysis: Analysis;
  recorded: boolean;
  onInclude: (messageIndex: number) => void;
  onWithhold: (messageIndex: number) => void;
  onRetryGuard: () => void;
}

const row = "border-t border-line px-5 py-4 first:border-t-0 sm:px-6";

/** One calm area for the safety and evidence features. Model judgments are labelled as estimates. */
export function SafetyEvidence({ analysis, recorded, onInclude, onWithhold, onRetryGuard }: Props) {
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
    </section>
  );
}
