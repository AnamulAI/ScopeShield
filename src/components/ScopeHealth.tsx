import { useState } from "react";
import { formatHours, formatMoney, scopeHealth } from "../lib/health";
import type { RequestItem } from "../lib/pipeline";
import type { Queue } from "../lib/routing";
import { QUEUE_ORDER, QUEUES } from "./queues";
import { QueueIcon } from "./icons";
import { CountUp } from "./motion";

const BAR: Record<string, string> = { needs_change_order: "bg-change", ask_me: "bg-ask", agreed_extra: "bg-agreed", in_scope: "bg-scope" };

/** Where requests landed (counts per queue, linking to each section) and the rough unpaid-effort estimate. */
export function ScopeHealth({ items, ready = true, onJump }: { items: RequestItem[]; ready?: boolean; onJump?: (q: Queue) => void }) {
  const [rateText, setRateText] = useState("");
  const h = scopeHealth(items);
  const active = h.counts.needs_change_order + h.counts.ask_me + h.counts.agreed_extra + h.counts.in_scope;
  const rate = rateText.trim() === "" ? null : Number(rateText);
  const validRate = rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null;
  const confirmedMoney = formatMoney(h.confirmedUnpaid, validRate);
  const possibleMoney = formatMoney(h.possibleUnpaid, validRate);
  const hc = h.confirmedUnpaid;
  // Open-ended bands give a minimum only, shown as "58+ h"; ranges as "≈ 18–30 h".
  const headline = items.length === 0 ? "—" : hc.items === 0 ? "None" : hc.max === null ? `${hc.min}+ h` : `≈ ${formatHours(hc)}`;

  return (
    <section aria-label="Scope health" className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="order-2 lg:order-1">
        <p className="t-eyebrow text-muted">Where the requests landed</p>
        {active > 0 && (
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-paper-deep" role="img"
            aria-label={QUEUE_ORDER.filter((q) => q !== "withdrawn").map((q) => `${QUEUES[q].label}: ${h.counts[q]}`).join(", ")}>
            {(["needs_change_order", "ask_me", "agreed_extra", "in_scope"] as const).map((k) => h.counts[k] > 0 && <div key={k} className={`${BAR[k]} first:rounded-l-full last:rounded-r-full`} style={{ width: `${(h.counts[k] / active) * 100}%` }} />)}
          </div>
        )}
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {QUEUE_ORDER.map((q) => (
            <li key={q} className="last:col-span-2 sm:last:col-span-1">
              <a href={`#queue-${q}`} onClick={() => onJump?.(q)} className={`block rounded-xl border-l-4 px-3 py-3 transition-transform hover:-translate-y-0.5 hover:shadow-card ${QUEUES[q].bg} ${QUEUES[q].border}`}
                aria-label={`${QUEUES[q].label}: ${h.counts[q]}. Jump to this queue`}>
                <span className={`flex items-center justify-between ${QUEUES[q].text}`}><CountUp text={String(h.counts[q])} ready={ready} className="font-display text-[2rem] leading-none" /><QueueIcon queue={q} width={20} height={20} /></span>
                <span className="mt-1 block text-xs font-semibold leading-4 text-ink/85">{QUEUES[q].label}</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">{active} active request{active === 1 ? "" : "s"}{h.counts.withdrawn ? ` · ${h.counts.withdrawn} withdrawn (not counted)` : ""}{h.uncounted ? ` · ${h.uncounted} not counted yet` : ""}</p>

        <div className="mt-6 rounded-xl bg-paper px-4 py-4">
          <label className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink">
            Optional hourly rate
            <input inputMode="decimal" value={rateText} onChange={(e) => setRateText(e.target.value)} placeholder="e.g. 40"
              className="w-28 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-ink placeholder:text-muted/80" aria-describedby="rate-note" />
          </label>
          <p id="rate-note" className="mt-1.5 text-xs text-muted">Money is shown only if you type a rate (no currency assumed).</p>
          <p className="mt-3 text-xs leading-5 text-muted">
            <b className="text-ink">Rough estimate, confirm with your own judgement.</b> Hours come from the model’s expected effort score per request (under 1 h, 2–6 h, 16–24 h, or 40 h+), summed. They are not a quote. Withdrawn and in-scope items are never counted.
          </p>
        </div>
      </div>

      <div className="order-1 rounded-2xl bg-navy p-5 text-paper shadow-lift sm:p-6 lg:order-2 lg:self-start">
        <p className="t-eyebrow text-paper/85">Scope health · unpaid work found</p>
        <p className="mt-3 font-display text-[3rem] leading-none"><CountUp text={headline} ready={ready} /></p>
        <p className="mt-3 text-sm text-paper/85">{items.length === 0 ? "No requests analysed yet. " : ""}{hc.max === null && hc.items > 0 ? "at least, " : ""}across {hc.items} request{hc.items === 1 ? "" : "s"} needing a change order</p>
        {confirmedMoney && <p className="mt-1 text-sm font-semibold">≈ {confirmedMoney} at your rate</p>}
        <div className="mt-4 border-t border-paper/20 pt-4 text-sm">
          <p><span className="text-paper/85">Possibly unpaid:</span> <b>{formatHours(h.possibleUnpaid)}</b> <span className="text-paper/85">in {h.possibleUnpaid.items} unresolved Ask me item{h.possibleUnpaid.items === 1 ? "" : "s"}</span></p>
          {possibleMoney && <p className="mt-1 text-xs text-paper/85">≈ {possibleMoney} at your rate</p>}
        </div>
      </div>
    </section>
  );
}
