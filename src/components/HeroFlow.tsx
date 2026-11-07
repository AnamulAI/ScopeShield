import type { CSSProperties } from "react";
import { QUEUE_ORDER } from "./queues";
import { QueueIcon, ShieldCheckIcon } from "./icons";
import type { Queue } from "../lib/routing";

// Decorative hero animation: five client message lines pass through the shield and sort into the five queues.
// ~3.4 s, plays once on load. The base style of every line is its final sorted position (see index.css), so with
// reduced motion (or no CSS animation) the finished picture is shown. Only transform and opacity animate.
const W = 560, H = 176;
const ROW = (i: number) => 18 + i * 35;
const WIDTHS = [104, 76, 92, 68, 86];
const TARGET: Queue[] = ["in_scope", "needs_change_order", "withdrawn", "ask_me", "agreed_extra"]; // where message i ends up
const COLORS: Record<Queue, { fg: string; bg: string }> = {
  needs_change_order: { fg: "var(--color-change)", bg: "var(--color-change-bg)" },
  ask_me: { fg: "var(--color-ask)", bg: "var(--color-ask-bg)" },
  agreed_extra: { fg: "var(--color-agreed)", bg: "var(--color-agreed-bg)" },
  in_scope: { fg: "var(--color-scope)", bg: "var(--color-scope-bg)" },
  withdrawn: { fg: "var(--color-withdrawn)", bg: "var(--color-withdrawn-bg)" },
};
const LANE_X = 372, LANE_W = 180, LINE_END_X = 418, START_X = 8, SHIELD_X = 250;

export function HeroFlow() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" width="100%" style={{ aspectRatio: `${W} / ${H}`, display: "block", maxWidth: 560 }}
      aria-label="Client messages pass through a shield and are sorted into five queues: needs change order, ask me, agreed extra, in scope and withdrawn.">
      {/* lanes: one per queue */}
      {QUEUE_ORDER.map((q, i) => (
        <g key={q} className="flow-lane" style={{ animationDelay: `${i * 80}ms` }}>
          <rect x={LANE_X} y={ROW(i) - 15} width={LANE_W} height={30} rx={15} fill={COLORS[q].bg} stroke={COLORS[q].fg} strokeOpacity={0.35} />
          <g style={{ color: COLORS[q].fg }}>
            <QueueIcon queue={q} x={LANE_X + 8} y={ROW(i) - 11} width={22} height={22} />
          </g>
        </g>
      ))}

      {/* the thread the messages come from (stays put, faint) */}
      {WIDTHS.map((w, n) => <rect key={n} x={START_X} y={ROW(n) - 6} width={w} height={12} rx={6} fill="#e4dccb" />)}

      {/* messages: neutral line that turns into its queue's colour after the shield */}
      {TARGET.map((q, n) => {
        const w = WIDTHS[n];
        const laneIdx = QUEUE_ORDER.indexOf(q);
        const style = {
          "--n": n,
          "--dx": `${LINE_END_X - START_X}px`,
          "--dy": `${ROW(laneIdx) - ROW(n)}px`,
          "--mx": `${SHIELD_X - START_X - w / 2}px`,
        } as CSSProperties;
        return (
          <g key={n} className="flow-item" style={style}>
            <rect className="flow-neutral" x={START_X} y={ROW(n) - 6} width={w} height={12} rx={6} fill="#cfc6af" />
            <rect className="flow-tint" x={START_X} y={ROW(n) - 6} width={w} height={12} rx={6} fill={COLORS[q].fg} />
          </g>
        );
      })}

      {/* the shield, drawn over the lines with a soft fill so lines dim while inside it */}
      <g className="flow-shield" style={{ color: "var(--color-navy)" }}>
        <path d="M250 38 214 52v27c0 21 17 37 36 46 19-9 36-25 36-46V52L250 38Z" fill="var(--color-card)" fillOpacity={0.78} stroke="currentColor" strokeWidth={3} strokeLinejoin="round" />
        <ShieldCheckIcon x={226} y={58} width={48} height={48} strokeWidth={1.4} />
      </g>
    </svg>
  );
}
