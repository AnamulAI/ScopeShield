interface Props { label: string; value: number; ticks?: number[]; tone: string; hint?: string }

/** One probability as a bar with the app's decision thresholds marked as ticks. */
export function ProbBar({ label, value, ticks = [], tone, hint }: Props) {
  const pct = Math.round(value * 100);
  return (
    <div className="grid grid-cols-[8.5rem_1fr_2.6rem] items-center gap-2 text-xs" title={hint}>
      <span className="text-muted">{label}</span>
      <div role="img" aria-label={`${label}: ${pct}%`} className="relative h-2 rounded-full bg-line/70">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(pct, 1)}%` }} />
        {ticks.map((t) => (
          <span key={t} aria-hidden className="absolute -top-0.5 h-3 w-px bg-ink/40" style={{ left: `${t * 100}%` }} />
        ))}
      </div>
      <span className="text-right font-mono tabular-nums text-ink">{pct}%</span>
    </div>
  );
}
