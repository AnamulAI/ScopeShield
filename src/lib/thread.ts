// Thread parsing and Unicode-safe offset mapping.
// ALL offsets are Unicode code points of the ORIGINAL string (never normalised).

export const cpLength = (s: string): number => {
  let n = 0;
  for (const _ of s) n++; // string iteration is by code point
  return n;
};

/** Code-point slice: [start, end). Never use String.slice for API offsets. */
export const sliceCp = (s: string, start: number, end: number): string => Array.from(s).slice(start, end).join("");

export interface Message {
  index: number;
  speaker: string;
  isClient: boolean;
  /** Exact slice of the original thread (may span several lines). */
  text: string;
  /** Code-point offsets of `text` inside the original thread: [start, end). */
  start: number;
  end: number;
}

// "Name: text". Label: starts with a letter, <= 40 chars, no colon. A "//" right after the colon means a URL, not a speaker.
const LABEL = /^[ \t]*(\p{L}[^:\n\r]{0,39}):(?!\/\/)[ \t]*/u;

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

export function parseThread(thread: string, clientName: string): Message[] {
  const parts = thread.split(/(\r\n|\n|\r)/); // [line, eol, line, eol, ..., line]
  const messages: Message[] = [];
  let pos = 0; // code-point position of the current line start
  let cur: { speaker: string; start: number; end: number } | null = null;

  const flush = () => {
    if (!cur) return;
    messages.push({
      index: messages.length,
      speaker: cur.speaker,
      isClient: sameName(cur.speaker, clientName),
      text: sliceCp(thread, cur.start, cur.end),
      start: cur.start,
      end: cur.end,
    });
    cur = null;
  };

  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i];
    const eol = parts[i + 1] ?? "";
    const lineCp = cpLength(line);
    const m = LABEL.exec(line);
    if (m) {
      flush();
      const prefixCp = cpLength(m[0]);
      cur = { speaker: m[1].trim(), start: pos + prefixCp, end: pos + lineCp };
    } else if (cur && line.trim() !== "") {
      cur.end = pos + lineCp; // continuation line extends the current message
    }
    pos += lineCp + cpLength(eol);
  }
  flush();
  return messages;
}

/** Map an offset pair relative to a message's text to offsets in the whole thread. */
export const toThreadOffsets = (msg: Message, start: number, end: number) => ({ start: msg.start + start, end: msg.start + end });

export const clientMessages = (messages: Message[]) => messages.filter((m) => m.isClient);
