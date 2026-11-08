import { describeError } from "../lib/errors";
import type { ScriptCheck, ScriptRisk } from "../lib/snippets";
import { isFlagged } from "../lib/snippets";
import { CodeIcon } from "./icons";

const RISK: Record<ScriptRisk, { label: string; chip: string }> = {
  routine: { label: "Looks routine", chip: "border-line bg-paper-deep text-ink" },
  suspicious: { label: "Suspicious", chip: "border-warn/30 bg-warn-bg text-warn" },
  harmful: { label: "Harmful", chip: "border-change/30 bg-change-bg text-change" },
};

interface Props { checks: { check: ScriptCheck; index: number }[]; onShow: (spanId: string) => void; onRetry: (index: number) => void }

/** "Client-supplied script": the model's estimate for each code snippet in this request's message, with its evidence lines. */
export function ScriptRow({ checks, onShow, onRetry }: Props) {
  if (checks.length === 0) return null;
  return (
    <div className="mt-4 space-y-3" data-script-row>
      {checks.map(({ check, index }) => {
        const r = check.result;
        const flagged = isFlagged(r?.risk);
        const located = (check.evidence ?? []).filter((e) => e.start >= 0);
        return (
          <div key={index} className={`rounded-xl border px-4 py-3 text-sm ${flagged ? (r!.risk === "harmful" ? "border-change/30 bg-change-bg" : "border-warn/30 bg-warn-bg") : "border-line bg-paper"}`}>
            <p className="t-eyebrow flex items-center gap-1.5 text-muted"><CodeIcon width={16} height={16} />Client-supplied script</p>
            {check.status === "running" && <p role="status" className="mt-2 flex items-center gap-2 text-muted"><span className="spinner" /> Checking the snippet…</p>}
            {check.status === "failed" && (
              <p role="alert" className="mt-2 text-ink"><b className="text-change">{describeError(undefined, check.error).title}</b> The code check could not run, so this snippet was not checked.{" "}
                <button onClick={() => onRetry(index)} className="font-semibold text-navy underline underline-offset-4">Retry</button></p>
            )}
            {check.status === "done" && r && (
              <>
                <p className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${RISK[r.risk].chip}`}>{RISK[r.risk].label}</span>
                  <span className="text-xs text-muted">model estimate{flagged && r.category ? ` · ${r.category}${r.severity && r.severity !== "none" ? `, severity ${r.severity}` : ""}` : ""}</span>
                </p>
                {located.length > 0 && (
                  <>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-card px-3 py-2 font-mono text-xs leading-5 text-ink" aria-label="Lines the code check pointed at">{located.map((e) => e.line).join("\n")}</pre>
                    <button onClick={() => onShow(`script${index}-0:script`)} className="press mt-2 text-xs font-semibold text-navy underline underline-offset-4">Show in thread</button>
                  </>
                )}
                {(check.evidence ?? []).length > located.length && <p className="mt-1 text-xs text-muted">Some evidence lines could not be located in the thread.</p>}
                {flagged && <p className="mt-2 text-xs text-ink/85">The drafted next step asks the client for the snippet’s source and says not to install it until that is confirmed.</p>}
              </>
            )}
            <p className="mt-2 text-xs text-muted">A benign result is not a safety guarantee. Read the code yourself.</p>
          </div>
        );
      })}
    </div>
  );
}
