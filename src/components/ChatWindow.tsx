import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { avatarColor, initials, participants } from "../lib/chat";
import type { Analysis } from "../lib/pipeline";
import { PauseIcon, PlayIcon, RestartIcon, SkipEndIcon } from "./icons";
import { prefersReducedMotion } from "./motion";
import { ThreadView } from "./ThreadView";
import type { useReplay } from "./useReplay";

export interface ChatHandle { scrollToEvidence: (spanId: string) => void }

interface Props {
  analysis: Analysis; recorded: boolean; replay: ReturnType<typeof useReplay>;
  openIds: Set<string>; activeId: string | null; onPick: (id: string) => void; onRetryMessage: (idx: number) => void;
  onInclude?: (idx: number) => void; onWithhold?: (idx: number) => void;
}

const ctl = "press inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold shadow-card";

/**
 * The thread as an original, generic chat window: header (participants taken from the thread), scrollable log, and,
 * in Demo mode, a composer-style bar that holds the REPLAY controls (there is no text input).
 * Nothing here is invented: no timestamps, no presence or read status, no photos.
 */
export const ChatWindow = forwardRef<ChatHandle, Props>(function ChatWindow({ analysis, recorded, replay, openIds, activeId, onPick, onRetryMessage, onInclude, onWithhold }, ref) {
  const body = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(false); // the reader scrolled the chat themselves: stop auto-scrolling for this replay
  const people = useMemo(() => participants(analysis.messages), [analysis.messages]);
  const smooth = (): ScrollBehavior => (prefersReducedMotion() ? "auto" : "smooth");

  // Scrolls ONLY the chat body, never the page.
  const scrollBodyTo = (li: HTMLElement | null, where: "center" | "bottom") => {
    const el = body.current;
    if (!el || !li) return;
    const l = li.getBoundingClientRect(), b = el.getBoundingClientRect();
    const rel = l.top - b.top + el.scrollTop;
    const top = where === "center" ? rel - (el.clientHeight - l.height) / 2 : rel + l.height - el.clientHeight + 28;
    el.scrollTo({ top: Math.max(0, top), behavior: smooth() });
  };

  useImperativeHandle(ref, () => ({
    scrollToEvidence: (spanId) => scrollBodyTo(document.getElementById(`ev-${spanId}`)?.closest("li") as HTMLElement | null, "center"),
  }));

  // Replay: follow the newest bubble (or the typing dots) unless the reader scrolled away.
  useEffect(() => {
    if (!recorded) return;
    if (replay.revealed === 0 && replay.typing === null) { userScrolled.current = false; body.current?.scrollTo({ top: 0 }); return; }
    if (!replay.playing || userScrolled.current) return;
    const idx = replay.typing ?? replay.revealed - 1;
    scrollBodyTo(body.current?.querySelector(`#msg-${idx}`) as HTMLElement | null, "bottom");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay.revealed, replay.typing, replay.playing, recorded]);

  const names = people.map((p) => p.name).join(", ");
  const pct = replay.total ? replay.revealed / replay.total : 1;

  return (
    <section id="chat-window" aria-label="Chat window: the thread" className="chat-window scroll-mt-20 flex h-[calc(100dvh-9.5rem)] min-h-[28rem] flex-col overflow-hidden lg:h-[calc(100vh-7rem)] lg:max-h-[780px]">
      <header className="flex items-center gap-3 border-b border-line bg-card px-4 py-3">
        <div className="flex -space-x-2" aria-hidden="true">
          {people.slice(0, 4).map((p) => (
            <span key={p.name} className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-card ring-2 ring-card" style={{ background: avatarColor(people, p.name) }}>{initials(p.name)}</span>
          ))}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">{names || "Thread"}</h3>
          <p className="text-xs text-muted">{analysis.messages.length} messages</p>
        </div>
        <span className={`t-eyebrow ml-auto shrink-0 rounded-full px-2.5 py-1 border border-line bg-paper-deep text-ink`}>{recorded ? "Recorded thread" : "Your thread"}</span>
      </header>

      <div ref={body} role="log" aria-label="Chat thread" aria-live="polite" aria-relevant="additions" tabIndex={0}
        onWheel={() => (userScrolled.current = true)} onTouchMove={() => (userScrolled.current = true)}
        onKeyDown={(e) => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) userScrolled.current = true; }}
        className="chat-canvas chat-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ThreadView analysis={analysis} openIds={openIds} activeId={activeId} onPick={onPick} onRetryMessage={onRetryMessage}
          revealed={recorded ? replay.revealed : undefined} typingIndex={recorded ? replay.typing : null} onInclude={onInclude} onWithhold={onWithhold} />
      </div>

      {recorded && (
        <footer className="border-t border-line bg-card px-3 py-3">
          <p className="mb-2 px-1 text-xs leading-5 text-muted">Replaying a recorded thread. Verdicts come from the recorded Clocked run.</p>
          <div role="group" aria-label="Replay controls" className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-paper p-1.5 pl-3">
            <span className="t-eyebrow tnum mr-auto text-muted">Replay {replay.revealed}/{replay.total}</span>
            <button onClick={() => { userScrolled.current = false; (replay.playing ? replay.pause : replay.play)(); }} className={`${ctl} bg-navy text-paper hover:bg-navy/90`}>
              {replay.playing ? <PauseIcon width={14} height={14} /> : <PlayIcon width={14} height={14} />}{replay.playing ? "Pause" : replay.revealed >= replay.total ? "Replay" : "Play"}
            </button>
            <button onClick={replay.finish} disabled={replay.revealed >= replay.total} className={`${ctl} border border-line bg-card text-navy hover:bg-paper-deep disabled:opacity-50`}><SkipEndIcon width={14} height={14} />Skip to end</button>
            <button onClick={() => { userScrolled.current = false; replay.restart(); }} className={`${ctl} border border-line bg-card text-navy hover:bg-paper-deep`}><RestartIcon width={14} height={14} />Restart</button>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-paper-deep" aria-hidden="true">
            <div className="h-full origin-left bg-navy/70 transition-transform duration-300" style={{ transform: `scaleX(${pct})` }} />
          </div>
          <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="replay-live">{replay.live}</p>
        </footer>
      )}
    </section>
  );
});
