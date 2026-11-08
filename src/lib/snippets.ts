// M13 Inspect: find code snippets the CLIENT pasted into the thread (deterministic heuristic), and check each with Clocked's /script.
import type { ScriptEvidence, ScriptResponse } from "./clocked-types";
import { cpLength, sliceCp, type Message } from "./thread";

export const MAX_SNIPPETS = 3;
export const MAX_SNIPPET_CHARS = 5000;

export interface Snippet { messageIndex: number; /** thread code-point offsets */ start: number; end: number; text: string }
export interface SnippetScan { snippets: Snippet[]; /** found but not checked: more than MAX_SNIPPETS, or longer than MAX_SNIPPET_CHARS */ skipped: number }

const POWERSHELL = /\b(?:Invoke-WebRequest|Invoke-Expression|Invoke-RestMethod|IEX|Set-MpPreference|Add-MpPreference|Set-ExecutionPolicy|Start-Process|New-Object\s+Net\.WebClient|DownloadString|DownloadFile|Get-Service|Restart-Service|Stop-Service)\b/;
const CURL_PIPE = /^.*\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b.*$/gim;
const FENCE = /```[A-Za-z0-9_+-]*[ \t]*\n([\s\S]*?)```/g;
const SCRIPT_TAG = /<script\b[\s\S]*?<\/script\s*>/gi;
const JS_BLOCK = /(?:\bfunction\b[^{}\n]*\([^)]*\)\s*\{|=>\s*\{)/g;

interface Span { s: number; e: number } // UTF-16 offsets inside one message

function lineStart(t: string, i: number) { return t.lastIndexOf("\n", i - 1) + 1; }

/** From the first "{" at or after `from`, the index just past its matching "}" (or the end of the text if unbalanced). */
function braceEnd(t: string, from: number): number {
  const open = t.indexOf("{", from);
  if (open < 0) return t.length;
  let depth = 0;
  for (let i = open; i < t.length; i++) {
    if (t[i] === "{") depth++;
    else if (t[i] === "}" && --depth === 0) return i + 1;
  }
  return t.length;
}

/** Candidate code spans in one message text. Order of preference: fences, <script> tags, curl|sh lines, PowerShell lines, JS blocks. */
export function codeSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const m of text.matchAll(FENCE)) spans.push({ s: m.index! + m[0].indexOf(m[1]), e: m.index! + m[0].indexOf(m[1]) + m[1].length });
  for (const m of text.matchAll(SCRIPT_TAG)) spans.push({ s: m.index!, e: m.index! + m[0].length });
  for (const m of text.matchAll(CURL_PIPE)) spans.push({ s: m.index!, e: m.index! + m[0].length });
  // PowerShell: consecutive lines (blank lines allowed between) that contain a cmdlet or comment
  const lines: { s: number; e: number; t: string }[] = [];
  let at = 0;
  for (const t of text.split("\n")) { lines.push({ s: at, e: at + t.length, t }); at += t.length + 1; }
  let run: Span | null = null;
  for (const l of lines) {
    if (POWERSHELL.test(l.t)) run = run ? { s: run.s, e: l.e } : { s: l.s, e: l.e };
    else if (run && l.t.trim() !== "" && !/^\s*#/.test(l.t)) { spans.push(run); run = null; }
  }
  if (run) spans.push(run);
  for (const m of text.matchAll(JS_BLOCK)) {
    const s = lineStart(text, m.index!);
    spans.push({ s, e: braceEnd(text, m.index!) });
  }
  // merge overlapping or touching spans
  spans.sort((a, b) => a.s - b.s);
  const merged: Span[] = [];
  for (const sp of spans) {
    const last = merged[merged.length - 1];
    if (last && sp.s <= last.e) last.e = Math.max(last.e, sp.e);
    else merged.push({ ...sp });
  }
  return merged;
}

/** Client messages only. At most MAX_SNIPPETS snippets in thread order, each at most MAX_SNIPPET_CHARS characters. No snippet, no API call. */
export function detectSnippets(messages: Message[]): SnippetScan {
  const found: Snippet[] = [];
  for (const m of messages) {
    if (!m.isClient) continue;
    for (const sp of codeSpans(m.text)) {
      const text = m.text.slice(sp.s, sp.e).replace(/^\n+|\s+$/g, "");
      if (text.trim() === "") continue;
      const lead = m.text.slice(sp.s, sp.e).length - m.text.slice(sp.s, sp.e).replace(/^\n+/, "").length;
      const start = m.start + cpLength(m.text.slice(0, sp.s + lead));
      found.push({ messageIndex: m.index, start, end: start + cpLength(text), text });
    }
  }
  const ok = found.filter((f) => cpLength(f.text) <= MAX_SNIPPET_CHARS);
  const snippets = ok.slice(0, MAX_SNIPPETS);
  return { snippets, skipped: found.length - snippets.length };
}

export const INSPECT_INSTRUCTIONS =
  "A freelancer has been asked by their client to add this snippet to the client's website or to run it on their own machine. Treat it as untrusted. Report whether it only does what a normal analytics or embed snippet does, or whether it reads cookies or credentials, sends data to third parties, downloads and runs remote code, disables security tools, or hides what it does.";

export const buildInspectRequest = (script: string) => ({ script, instructions: INSPECT_INSTRUCTIONS, evidence: true });

export type ScriptRisk = "routine" | "suspicious" | "harmful";

/** Model estimate in plain words. harmful/suspicious need the probability to reach the response's own threshold. */
export function riskOf(r: Pick<ScriptResponse, "malicious" | "suspicious" | "verdict" | "threshold">): ScriptRisk {
  const t = typeof r.threshold === "number" ? r.threshold : 0.5;
  if (r.verdict === "malicious" || r.malicious >= t) return "harmful";
  if (r.verdict === "suspicious" || r.suspicious >= t) return "suspicious";
  return "routine";
}
export const isFlagged = (risk: ScriptRisk | undefined) => risk === "suspicious" || risk === "harmful";

export interface ScriptCheck {
  messageIndex: number;
  /** the snippet's place in the thread (code points) */
  start: number;
  end: number;
  status: "running" | "done" | "failed";
  error?: string;
  result?: { risk: ScriptRisk; malicious: number; suspicious: number; category?: string; severity?: string };
  /** evidence lines located in the thread (code points) */
  evidence?: { line: string; start: number; end: number }[];
}

/** Maps evidence offsets (in the snippet) to thread offsets; a line is kept only if it reproduces from the thread. */
export function mapScriptEvidence(snippet: Snippet, thread: string, evidence: ScriptEvidence[]): { line: string; start: number; end: number }[] {
  const out: { line: string; start: number; end: number }[] = [];
  for (const ev of evidence) {
    if (sliceCp(snippet.text, ev.start, ev.end) !== ev.line) { out.push({ line: ev.line, start: -1, end: -1 }); continue; }
    const start = snippet.start + ev.start, end = snippet.start + ev.end;
    out.push(sliceCp(thread, start, end) === ev.line ? { line: ev.line, start, end } : { line: ev.line, start: -1, end: -1 });
  }
  return out;
}
