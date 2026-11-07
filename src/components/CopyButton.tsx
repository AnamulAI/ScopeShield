import { useEffect, useRef, useState } from "react";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

interface Props { text: string; label: string; blockedReason?: string; primary?: boolean }

export function CopyButton({ text, label, blockedReason, primary }: Props) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  const t = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(t.current), []);
  const blocked = Boolean(blockedReason);
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={blocked} title={blockedReason}
        onClick={async () => { setState((await copy(text)) ? "done" : "fail"); window.clearTimeout(t.current); t.current = window.setTimeout(() => setState("idle"), 2000); }}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${primary ? "bg-navy text-white hover:bg-navy/90" : "border border-navy/30 bg-card text-navy hover:border-navy"}`}>
        {label}
      </button>
      <span role="status" className="text-xs text-muted">{state === "done" ? "Copied" : state === "fail" ? "Copy failed. Select the text manually." : ""}</span>
    </span>
  );
}
