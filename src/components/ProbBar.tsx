import { useInViewOnce } from "./motion";

interface Props { label: string; value: number; ticks?: number[]; tone: string; hint?: string }

/**
 * One probability: calm thin bar, decision thresholds as faint notches, exact percentage on the right.
 * The fill slides in once when the bar first becomes visible (transform only; the parent clips it).
 * With reduced motion the bar is simply drawn at its final value.
 */
export function ProbBar({ label, value, ticks = [], tone, hint }: Props) {
  const pct = Math.round(value * 100);
  const [ref, seen] = useInViewOnce<HTMLDivElement>();
  return (
    <div className="grid grid-cols-[7.5rem_1fr_2.75rem] items-center gap-3 text-xs sm:grid-cols-[8.5rem_1fr_2.75rem]" title={hint}>
      <span className="text-muted">{label}</span>
      <div ref={ref} role="img" aria-label={`${label}: ${pct}%`} className="relative h-1.5 rounded-full bg-paper-deep">
        <div className="h-full overflow-hidden rounded-full" style={{ width: `${Math.max(pct, 1)}%` }}>
          <div className={`bar-fill h-full w-full rounded-full ${tone} ${seen ? "is-in" : ""}`} />
        </div>
        {ticks.map((t) => (
          <span key={t} aria-hidden className="absolute -top-1 h-3.5 w-px bg-ink/20" style={{ left: `${t * 100}%` }} />
        ))}
      </div>
      <span className="text-right font-semibold tnum text-ink">{pct}%</span>
    </div>
  );
}
