import type { Described } from "../lib/errors";

/** Page-level failure message. Failed items keep their own Retry; partial results are never discarded. */
export function ErrorBanner({ described, failures, onSwitchDemo }: { described: Described; failures: number; onSwitchDemo?: () => void }) {
  return (
    <div role="alert" className="mt-6 flex gap-3 rounded-xl border border-change/30 bg-change-bg px-4 py-3.5 text-sm text-ink">
      <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-change text-xs font-bold text-white">!</span>
      <div className="space-y-1">
        <p><b className="text-change">{described.title}</b> {described.hint}</p>
        {failures > 0 && <p className="text-muted">{failures} step{failures === 1 ? "" : "s"} failed. Everything else is kept, and each failed item has its own Retry.</p>}
        {described.demo && onSwitchDemo && (
          <button onClick={onSwitchDemo} className="mt-1 rounded-lg bg-navy px-4 py-2 text-xs font-semibold text-paper shadow-card press hover:bg-navy/90">Switch to Demo mode</button>
        )}
      </div>
    </div>
  );
}
