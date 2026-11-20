// Input caps for live runs (protect credits and request size).
export const LIMITS = { contract: 6000, thread: 12000, clientMessages: 30 } as const;

import { tEn, type Key, type Vars } from "../i18n/core";
import { cpLength, parseThread } from "./thread";

/** A problem with the input as a translation key plus values; `problems` is the same list in English. */
export interface InputIssue { key: Key; vars?: Vars }
export interface InputCheck { ok: boolean; problems: string[]; issues: InputIssue[]; speakers: string[]; clientMessages: number }

export function checkInputs(contract: string, thread: string, clientName: string): InputCheck {
  const issues: InputIssue[] = [];
  const messages = parseThread(thread, clientName);
  const speakers = [...new Set(messages.map((m) => m.speaker))];
  const clientMessages = messages.filter((m) => m.isClient).length;
  if (!contract.trim()) issues.push({ key: "limits.noContract" });
  else if (cpLength(contract) > LIMITS.contract) issues.push({ key: "limits.contractTooLong", vars: { n: LIMITS.contract.toLocaleString() } });
  if (!thread.trim()) issues.push({ key: "limits.noThread" });
  else if (cpLength(thread) > LIMITS.thread) issues.push({ key: "limits.threadTooLong", vars: { n: LIMITS.thread.toLocaleString() } });
  else if (messages.length === 0) issues.push({ key: "limits.noMessages" });
  if (thread.trim() && messages.length > 0) {
    if (!clientName.trim()) issues.push({ key: "limits.noClientName" });
    else if (clientMessages === 0) issues.push({ key: "limits.noClientMessages", vars: { name: clientName.trim(), speakers: speakers.join(", ") } });
    else if (clientMessages > LIMITS.clientMessages) issues.push({ key: "limits.tooManyClient", vars: { n: clientMessages, max: LIMITS.clientMessages } });
  }
  return { ok: issues.length === 0, problems: issues.map((i) => tEn(i.key, i.vars)), issues, speakers, clientMessages };
}
