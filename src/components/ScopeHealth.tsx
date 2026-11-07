import { useState } from "react";
import { formatHours, formatMoney, scopeHealth } from "../lib/health";
import type { RequestItem } from "../lib/pipeline";

const SEG: Array<{ key: "needs_change_order" | "ask_me" | "agreed_extra" | "in_scope"; label: string; bar: string }> = [
  { key: "needs_change_order", label: "Needs change order", bar: "bg-change" },
  { key: "ask_me", label: "Ask me", bar: "bg-ask" },
  { key: "agreed_extra", label: "Agreed extra", bar: "bg-agreed" },
  { key: "in_scope", label: "In scope", bar: "bg-scope" },
];

export function ScopeHealth({ items }: { items: RequestItem[] }) {
  const [rateText, setRateText] = useState("");
  const h = scopeHealth(items);
  const active = SEG.reduce((n, s) => n + h.counts[s.key], 0);
  const rate = rateText.trim() === "" ? null : Number(rateText);
  const validRate = rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null;
  const confirmedMoney = formatMoney(h.confirmedUnpaid, validRate);
  const possibleMoney = formatMoney(h.possibleUnpaid, validRate);

  return (
    <section aria-label="Scope health" className="rounded-xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg">Scope health</h3>
        <p className="text-xs text-muted">{active} active request{active === 1 ? "" : "s"}{h.counts.withdrawn ? ` · ${h.counts.withdrawn} withdrawn (not counted)` : ""}{h.uncounted ? ` · ${h.uncounted} not counted yet` : ""}</p>
      </div>

      {active > 0 && (
        <>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-line/70" role="img"
            aria-label={SEG.map((s) => `${s.label}: ${h.counts[s.key]}`).join(", ")}>
            {SEG.map((s) => h.counts[s.key] > 0 && <div key={s.key} className={s.bar} style={{ width: `${(h.counts[s.key] / active) * 100}%` }} />)}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {SEG.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5"><span className={`inline-block h-2 w-2 rounded-full ${s.bar}`} />{s.label} <b className="text-ink">{h.counts[s.key]}</b></li>
            ))}
          </ul>
        </>
      )}

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-change-bg/60 px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-change">Unpaid work found</dt>
          <dd className="mt-0.5"><b>{formatHours(h.confirmedUnpaid)}</b> <span className="text-xs text-muted">across {h.confirmedUnpaid.items} request{h.confirmedUnpaid.items === 1 ? "" : "s"} needing a change order</span>
            {confirmedMoney && <span className="block text-xs">≈ {confirmedMoney} at your rate</span>}
          </dd>
        </div>
        <div className="rounded-lg bg-ask-bg/60 px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ask">Possibly unpaid</dt>
          <dd className="mt-0.5"><b>{formatHours(h.possibleUnpaid)}</b> <span className="text-xs text-muted">in {h.possibleUnpaid.items} unresolved Ask me item{h.possibleUnpaid.items === 1 ? "" : "s"}</span>
            {possibleMoney && <span className="block text-xs">≈ {possibleMoney} at your rate</span>}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <label className="flex items-center gap-2">
          Optional hourly rate
          <input inputMode="decimal" value={rateText} onChange={(e) => setRateText(e.target.value)} placeholder="e.g. 40"
            className="w-24 rounded-md border border-line bg-paper px-2 py-1 text-ink" aria-describedby="rate-note" />
        </label>
        <span id="rate-note">Money is shown only if you type a rate (no currency assumed).</span>
      </div>
      <p className="mt-2 text-xs text-muted">
        <b className="text-ink">Rough estimate, confirm with your own judgement.</b> Hours come from the model’s expected effort score per request (under 1 h, 2–6 h, 16–24 h, or 40 h+), summed. They are not a quote. Withdrawn and in-scope items are never counted.
      </p>
    </section>
  );
}
