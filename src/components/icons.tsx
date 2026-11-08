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

// Replay controls and small UI marks (same family)
export const PlayIcon = (p: P) => (<svg {...base} {...p}><path d="M8 5.5v13l10.5-6.5L8 5.5Z" /></svg>);
export const PauseIcon = (p: P) => (<svg {...base} {...p}><path d="M8.5 5.5v13M15.5 5.5v13" /></svg>);
export const SkipEndIcon = (p: P) => (<svg {...base} {...p}><path d="M5.5 6v12l9-6-9-6Z" /><path d="M18.5 6v12" /></svg>);
export const RestartIcon = (p: P) => (<svg {...base} {...p}><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" /><path d="M4.5 4.5v4h4" /></svg>);
export const ExternalIcon = (p: P) => (<svg {...base} {...p}><path d="M9 6H6.5A1.5 1.5 0 0 0 5 7.5v10A1.5 1.5 0 0 0 6.5 19h10a1.5 1.5 0 0 0 1.5-1.5V15" /><path d="M13 5h6v6M19 5l-8 8" /></svg>);
export const ChevronIcon = (p: P) => (<svg {...base} {...p}><path d="m7 10 5 5 5-5" /></svg>);

/** Shield with an exclamation mark: Guard flagged something. */
export const ShieldAlertIcon = (p: P) => (<svg {...base} {...p}><path d="M12 3 4.5 5.8v5.6c0 4.5 3.1 7.7 7.5 9.6 4.4-1.9 7.5-5.1 7.5-9.6V5.8L12 3Z" /><path d="M12 8.5v4.2" /><path d="M12 15.8h.01" /></svg>);
/** Two crossing strokes: a possible conflict between two texts. */
export const ConflictIcon = (p: P) => (<svg {...base} {...p}><path d="M5 8h13" /><path d="m14 4 4 4-4 4" /><path d="M19 16H6" /><path d="m10 12-4 4 4 4" /></svg>);
/** Page with a lock-less fold: the masked evidence pack. */
export const PackIcon = (p: P) => (<svg {...base} {...p}><path d="M7 3.5h7l4 4V20.5H7V3.5Z" /><path d="M14 3.5v4h4" /><path d="M9.500 12h6M9.500 15.500h4" /></svg>);
/** Ruler-like mark for the governing clause: a section sign. */
export const ClauseIcon = (p: P) => (<svg {...base} {...p}><path d="M14.500 6.500a3 3 0 0 0-5.500 1.500c0 3.500 6 2.500 6 6.500a3 3 0 0 1-5.500 1.500" /><path d="M8 17.500a3 3 0 0 0 5.500 1.500" /></svg>);

/** Angle brackets with a slash: a code snippet. */
export const CodeIcon = (p: P) => (<svg {...base} {...p}><path d="m8.500 8-4 4 4 4" /><path d="m15.500 8 4 4-4 4" /><path d="m13.500 5.500-3 13" /></svg>);
