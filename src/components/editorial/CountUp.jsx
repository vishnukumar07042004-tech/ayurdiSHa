import React, { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion.js";

/**
 * Counts from 0 to `value` when first scrolled into view; later changes
 * (live data) animate from the number currently shown.
 */
export default function CountUp({ value, duration = 1400, suffix = "" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const shownRef = useRef(shown);
  const seenRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) {
      shownRef.current = value;
      setShown(value);
      return undefined;
    }
    let frame = 0;
    const run = () => {
      const from = shownRef.current;
      if (from === value) return;
      const start = performance.now();
      const span = seenRef.current ? Math.min(duration, 900) : duration;
      const tick = (now) => {
        const t = Math.min(1, (now - start) / span);
        const eased = 1 - Math.pow(1 - t, 3);
        const next = Math.round(from + eased * (value - from));
        shownRef.current = next;
        setShown(next);
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    if (seenRef.current) {
      run();
      return () => { if (frame) cancelAnimationFrame(frame); };
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        run();
        seenRef.current = true;
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <span ref={ref} aria-label={`${value}${suffix}`}>
      <span aria-hidden="true">{shown}{suffix}</span>
    </span>
  );
}
