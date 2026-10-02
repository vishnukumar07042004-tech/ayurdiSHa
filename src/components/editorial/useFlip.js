import { useLayoutEffect, useRef } from "react";
import { prefersReducedMotion } from "./motion.js";

/**
 * FLIP-animate `[data-flip-key]` children of `containerRef` whenever `key`
 * changes: survivors glide to their new slot, newcomers fade up.
 * Uses offsets relative to the container so scrolling doesn't skew it.
 */
export default function useFlip(containerRef, key) {
  const prev = useRef(new Map());
  const first = useRef(true);

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const items = [...root.querySelectorAll("[data-flip-key]")];
    const next = new Map();
    for (const el of items) {
      next.set(el.dataset.flipKey, { x: el.offsetLeft, y: el.offsetTop });
    }

    if (!first.current && !prefersReducedMotion() && typeof root.animate === "function") {
      items.forEach((el, i) => {
        const was = prev.current.get(el.dataset.flipKey);
        const now = next.get(el.dataset.flipKey);
        if (was) {
          const dx = was.x - now.x;
          const dy = was.y - now.y;
          if (dx || dy) {
            el.animate(
              [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
              { duration: 560, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
            );
          }
        } else {
          el.animate(
            [
              { opacity: 0, transform: "translateY(18px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 520, delay: Math.min(i, 8) * 40, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" }
          );
        }
      });
    }

    first.current = false;
    prev.current = next;
  }, [containerRef, key]);
}
