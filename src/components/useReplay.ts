import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { announcement, replayBudget, replayDelay, TYPING_MS, type ReplayMsg } from "../lib/replay";
import { onFirstVisible, prefersReducedMotion } from "./motion";

/**
 * Replay of a RECORDED thread: messages are revealed one by one. No network, no "analysing" states.
 * The default state is the finished thread (revealed === total). Autoplay starts once, the first time the panel is visible,
 * and never with reduced motion. A watchdog finishes the replay if timers stall, so nothing can stay hidden.
 */
export function useReplay(msgs: ReplayMsg[], enabled: boolean, verdictsFor: (index: number) => string[]) {
  const total = msgs.length;
  const [revealed, setRevealed] = useState(total);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState("");
  const [typing, setTyping] = useState<number | null>(null); // index of the bubble about to appear
  const panel = useRef<HTMLElement | null>(null);
  const timer = useRef(0);
  const dog = useRef(0);
  const shown = useRef(total); // mirrors `revealed` for timer callbacks
  const started = useRef(false);

  const clear = () => { window.clearTimeout(timer.current); window.clearTimeout(dog.current); };
  const set = (n: number) => { shown.current = n; setRevealed(n); };

  const finish = useCallback(() => { clear(); set(total); setTyping(null); setPlaying(false); }, [total]);

  // Show a bubble: typing dots first (replay only, not with reduced motion), then the bubble, then wait before the next.
  const tick = useCallback((next: number) => {
    if (next >= total) { finish(); return; }
    const reveal = () => {
      setTyping(null);
      set(next + 1);
      setLive(announcement(msgs[next], verdictsFor(next)));
      if (next + 1 >= total) { clear(); setPlaying(false); return; }
      timer.current = window.setTimeout(() => tick(next + 1), replayDelay(msgs[next]));
    };
    if (prefersReducedMotion()) { reveal(); return; }
    setTyping(next);
    timer.current = window.setTimeout(reveal, TYPING_MS);
  }, [msgs, total, finish, verdictsFor]);

  const run = useCallback((from: number) => {
    clear();
    setPlaying(true);
    dog.current = window.setTimeout(finish, replayBudget(msgs));
    timer.current = window.setTimeout(() => tick(from), from === 0 ? 300 : 0);
  }, [msgs, finish, tick]);

  const play = useCallback(() => { if (shown.current >= total) { flushSync(() => set(0)); run(0); } else run(shown.current); }, [total, run]);
  const pause = useCallback(() => { clear(); setTyping(null); setPlaying(false); }, []);
  const restart = useCallback(() => { flushSync(() => set(0)); run(0); }, [run]);

  // Autoplay once, when the thread panel is first visible (and the user has not asked for reduced motion).
  useLayoutEffect(() => {
    if (!enabled || started.current || total === 0 || !panel.current) return;
    return onFirstVisible(panel.current, () => {
      if (started.current) return;
      started.current = true;
      flushSync(() => set(0)); // hide before the first paint, so the thread does not flash in its final state first
      run(0);
    });
  }, [enabled, total, run]);

  useEffect(() => clear, []);

  return { panel, revealed, playing, live, typing, total, play, pause, restart, finish };
}
