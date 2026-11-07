import type { SVGProps } from "react";
import type { Queue } from "../lib/routing";

// One consistent icon family: 24x24 grid, 1.75 stroke, round caps and joins, currentColor. Drawn for this product.
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;
type P = SVGProps<SVGSVGElement>;

/** Shield with a check: the logo, and "in scope" (covered by the contract). */
export const ShieldCheckIcon = (p: P) => (
  <svg {...base} {...p}><path d="M12 3 4.5 5.8v5.6c0 4.5 3.1 7.7 7.5 9.6 4.4-1.9 7.5-5.1 7.5-9.6V5.8L12 3Z" /><path d="m8.8 12 2.4 2.4 4-4.6" /></svg>
);
/** Message bubble; with `check` it means "the client said yes" (agreed extra). */
export const MessageIcon = ({ check, ...p }: P & { check?: boolean }) => (
  <svg {...base} {...p}><path d="M5 5.5h14A1.5 1.5 0 0 1 20.5 7v8a1.5 1.5 0 0 1-1.5 1.5h-8L6.5 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z" />{check ? <path d="m8.6 11 2.2 2.2 4-4.2" /> : <path d="M8 9.5h8M8 12.5h5" />}</svg>
);
/** Receipt: a change order. */
export const ReceiptIcon = (p: P) => (
  <svg {...base} {...p}><path d="M6 3.5h12v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5v-17Z" /><path d="M9 8.5h6M9 12h6M9 15.5h3" /></svg>
);
/** Question mark in a circle: Ask me. */
export const QuestionIcon = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.6a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.1.9-1.1 1.7" /><path d="M12 16.8h.01" /></svg>
);
/** Undo arrow. */
export const UndoIcon = (p: P) => (
  <svg {...base} {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
);
/** Arrow dropped onto a line: a request the client dropped (withdrawn). */
export const DroppedIcon = (p: P) => (
  <svg {...base} {...p}><path d="M12 4v10.5" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M6 20h12" /></svg>
);

/** One icon per queue. */
export function QueueIcon({ queue, ...p }: P & { queue: Queue }) {
  switch (queue) {
    case "needs_change_order": return <ReceiptIcon {...p} />;
    case "ask_me": return <QuestionIcon {...p} />;
    case "agreed_extra": return <MessageIcon check {...p} />;
    case "in_scope": return <ShieldCheckIcon {...p} />;
    case "withdrawn": return <DroppedIcon {...p} />;
  }
}
