import { useLayoutEffect, useRef } from "react";
import { onFirstVisible, playBarIn } from "./motion";

interface Props { label: string; value: number; ticks?: number[]; tone: string; hint?: string }

/**
 * One probability: calm thin bar, decision thresholds as faint notches, exact percentage on the right.
 * The bar is ALWAYS drawn at its real value (so print, screenshots and failures are correct). The first time it is
 * visible, the fill slides in once (transform only; the parent clips it). With reduced motion it is just drawn.
 */
export function ProbBar({ label, value, ticks = [], tone, hint }: Props) {
  const pct = Math.round(value * 100);
  const track = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => (track.current ? onFirstVisible(track.current, () => playBarIn(fill.current)) : undefined), []);
  return (
    <div className="grid grid-cols-[7.5rem_1fr_2.75rem] items-center gap-3 text-xs sm:grid-cols-[8.5rem_1fr_2.75rem]" title={hint}>
      <span className="text-muted">{label}</span>
      <div ref={track} role="img" aria-label={`${label}: ${pct}%`} className="relative h-1.5 rounded-full bg-paper-deep">
        <div className="h-full overflow-hidden rounded-full" style={{ width: `${Math.max(pct, 1)}%` }}>
          <div ref={fill} className={`bar-fill h-full w-full rounded-full ${tone}`} />
        </div>
        {ticks.map((t) => (
          <span key={t} aria-hidden className="absolute -top-1 h-3.5 w-px bg-ink/20" style={{ left: `${t * 100}%` }} />
        ))}
      </div>
      <span className="text-right font-semibold tnum text-ink">{pct}%</span>
    </div>
  );
}
