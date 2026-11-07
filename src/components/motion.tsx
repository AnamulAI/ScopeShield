import { useEffect, useRef, useState } from "react";

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** True once the element has been on screen. Without IntersectionObserver, or with reduced motion, content is simply shown. */
export function useInViewOnce<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined" || prefersReducedMotion());
  useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { threshold: 0.2 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Counts the numbers in `text` up from 0, once, the first time it is visible and `ready`.
 * Later changes snap to the new value. The real value is always in the DOM for assistive tech (`sr-only`).
 */
export function CountUp({ text, ready = true, className = "", duration = 700 }: { text: string; ready?: boolean; className?: string; duration?: number }) {
  const [ref, seen] = useInViewOnce<HTMLSpanElement>();
  const [t, setT] = useState(() => (prefersReducedMotion() ? 1 : 0));
  const done = useRef(prefersReducedMotion());
  useEffect(() => {
    if (!seen || !ready || done.current) return;
    done.current = true;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setT(ease(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, ready, duration]);
  // While the analysis is still running (`ready` false) the real, changing numbers are shown. Once ready and visible, count up once.
  const shown = ready && t < 1 ? text.replace(/\d+/g, (n) => String(Math.round(Number(n) * t))) : text;
  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true" className="tnum">{shown}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
