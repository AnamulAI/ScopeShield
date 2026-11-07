import type { Queue } from "../lib/routing";

export interface QueueMeta { label: string; blurb: string; text: string; bg: string; border: string }

// Order shown in the results.
export const QUEUE_ORDER: Queue[] = ["needs_change_order", "ask_me", "in_scope", "agreed_extra", "withdrawn"];

export const QUEUES: Record<Queue, QueueMeta> = {
  needs_change_order: { label: "Needs change order", blurb: "Outside the contract and no agreement to pay was found.", text: "text-change", bg: "bg-change-bg", border: "border-change" },
  ask_me: { label: "Ask me", blurb: "The model is unsure. You know the real story.", text: "text-ask", bg: "bg-ask-bg", border: "border-ask" },
  in_scope: { label: "In scope", blurb: "Covered by the agreed contract.", text: "text-scope", bg: "bg-scope-bg", border: "border-scope" },
  agreed_extra: { label: "Agreed extra", blurb: "Outside the contract, but the client agreed to pay. Check it is invoiced.", text: "text-agreed", bg: "bg-agreed-bg", border: "border-agreed" },
  withdrawn: { label: "Withdrawn", blurb: "The client later dropped these requests.", text: "text-withdrawn", bg: "bg-withdrawn-bg", border: "border-withdrawn" },
};
