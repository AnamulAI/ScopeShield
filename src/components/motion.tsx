import { useEffect, useLayoutEffect, useRef } from "react";

export const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Calls `cb` once, the first time `el` is on screen (immediately, before first paint, if it already is).
 * Does nothing without IntersectionObserver or with reduced motion: callers keep the FINAL state in the DOM at all times
 * and only play an entrance when this fires, so print, full-page screenshots and failures all show real values.
 */
export function onFirstVisible(el: Element, cb: () => void): () => void {
  if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") return () => {};
  const r = el.getBoundingClientRect();
  if (r.bottom > 0 && r.top < window.innerHeight && r.width > 0) { cb(); return () => {}; }
  let done = false;
  const io = new IntersectionObserver((entries) => {
    if (!done && entries.some((e) => e.isIntersecting)) { done = true; io.disconnect(); cb(); }
  }, { threshold: 0.2 });
  io.observe(el);
  return () => io.disconnect();
}

/** Slides a bar fill in from the left (transform only). The static style is already the final state; failure leaves it final. */
export function playBarIn(fill: HTMLElement | null) {
  try {
    fill?.animate([{ transform: "translateX(-101%)" }, { transform: "translateX(0)" }], { duration: 700, easing: "cubic-bezier(.2,.7,.2,1)" });
  } catch { /* final state stays */ }
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Shows `text` (the real value) at all times. The first time it is visible, and `ready`, the numbers in it count up from 0 once.
 * Safety net: whatever happens (no rAF, hidden tab, errors) the real value is restored after duration + 300 ms.
 * The animated node is managed here, not by React, so React re-renders cannot fight the animation; the real value is also in `sr-only`.
 */
export function CountUp({ text, ready = true, className = "", duration = 700 }: { text: string; ready?: boolean; className?: string; duration?: number }) {
  const el = useRef<HTMLSpanElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const played = useRef(false);

  // The real value is always what the DOM holds, unless a count-up is in flight.
  useLayoutEffect(() => {
    stop.current?.();
    stop.current = null;
    if (el.current) el.current.textContent = text;
  }, [text]);

  useLayoutEffect(() => {
    const node = el.current;
    if (!node || !ready || played.current) return;
    return onFirstVisible(node, () => {
      if (played.current) return;
      played.current = true;
      const start = performance.now();
      let raf = 0;
      let timer = 0;
      const finish = () => { cancelAnimationFrame(raf); window.clearTimeout(timer); node.textContent = text; stop.current = null; };
      stop.current = finish;
      const frame = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        node.textContent = text.replace(/\d+/g, (n) => String(Math.round(Number(n) * ease(p))));
        if (p < 1) raf = requestAnimationFrame(frame); else finish();
      };
      node.textContent = text.replace(/\d+/g, "0");
      raf = requestAnimationFrame(frame);
      timer = window.setTimeout(finish, duration + 300);
    });
  }, [ready, text, duration]);

  useEffect(() => () => stop.current?.(), []);

  return (
    <span className={className}>
      <span ref={el} aria-hidden="true" className="tnum" />
      <span className="sr-only">{text}</span>
    </span>
  );
}
