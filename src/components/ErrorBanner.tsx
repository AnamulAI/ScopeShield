import type { Described } from "../lib/errors";
import { useI18n } from "../i18n";

/** Page-level failure message. Failed items keep their own Retry; partial results are never discarded. */
export function ErrorBanner({ described, failures, onSwitchDemo }: { described: Described; failures: number; onSwitchDemo?: () => void }) {
  const { tp, t } = useI18n();
  return (
    <div role="alert" className="mt-6 flex gap-3 rounded-xl border border-change/30 bg-change-bg px-4 py-3.5 text-sm text-ink">
      <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-change text-xs font-bold text-card">!</span>
      <div className="space-y-1">
        <p><b className="text-change">{described.title}</b> {described.hint}</p>
        {failures > 0 && <p className="text-muted">{tp("err.failures", failures)}</p>}
        {described.demo && onSwitchDemo && (
          <button onClick={onSwitchDemo} className="mt-1 rounded-lg bg-navy px-4 py-2 text-xs font-semibold text-paper shadow-card press hover:bg-navy/90">{t("err.switchDemo")}</button>
        )}
      </div>
    </div>
  );
}
