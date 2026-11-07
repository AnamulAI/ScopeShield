// Input caps for live runs (protect credits and request size).
export const LIMITS = { contract: 6000, thread: 12000, clientMessages: 30 } as const;

import { cpLength, parseThread } from "./thread";

export interface InputCheck { ok: boolean; problems: string[]; speakers: string[]; clientMessages: number }

export function checkInputs(contract: string, thread: string, clientName: string): InputCheck {
  const problems: string[] = [];
  const messages = parseThread(thread, clientName);
  const speakers = [...new Set(messages.map((m) => m.speaker))];
  const clientMessages = messages.filter((m) => m.isClient).length;
  if (!contract.trim()) problems.push("Paste the agreed contract or scope.");
  else if (cpLength(contract) > LIMITS.contract) problems.push(`Contract is over ${LIMITS.contract.toLocaleString()} characters.`);
  if (!thread.trim()) problems.push("Paste the client thread, one message per line as “Name: text”.");
  else if (cpLength(thread) > LIMITS.thread) problems.push(`Thread is over ${LIMITS.thread.toLocaleString()} characters.`);
  else if (messages.length === 0) problems.push("No messages found. Each message must start with “Name:”.");
  if (thread.trim() && messages.length > 0) {
    if (!clientName.trim()) problems.push("Enter the client’s name exactly as it appears in the thread.");
    else if (clientMessages === 0) problems.push(`No messages from “${clientName.trim()}”. Speakers in this thread: ${speakers.join(", ")}.`);
    else if (clientMessages > LIMITS.clientMessages) problems.push(`${clientMessages} client messages found; the live limit is ${LIMITS.clientMessages}.`);
  }
  return { ok: problems.length === 0, problems, speakers, clientMessages };
}
