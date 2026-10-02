import { useEffect, useState } from "react";

export function prefersReducedMotion() {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const easeOut = (t) => 1 - (1 - t) ** 3;

/**
 * Scroll-linked motion for children of `rootRef`, driven by one passive,
 * rAF-throttled scroll handler and an IntersectionObserver that limits work
 * to on-screen elements.
 *
 * - `[data-parallax="N"]` — layer drift. Writes `--parallax` (±N px) from the
 *   position of the element's *parent*, so the shift never feeds back into
 *   its own measurement. Negative N lags behind the scroll, positive N leads.
 *   CSS applies it through the individual `translate` property so it
 *   composes with reveal/entrance `transform`s instead of fighting them.
 * - `[data-scroll-img]` — a clipped photo frame. Writes `--img-y` and
 *   `--img-s` for its `<picture>`: the photo settles from scale 1.1 to 1 as
 *   the frame enters and drifts through its `--bleed` (CSS) while it passes.
 *
 * Reduced motion: nothing runs. Small screens / coarse pointers: halved.
 */
export function useParallax(rootRef, deps = []) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return undefined;

    const damp = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches ? 0.5 : 1;
    const layers = [...root.querySelectorAll("[data-parallax]")].map((el) => ({
      el,
      kind: "layer",
      anchor: el.parentElement || el,
      max: (Number(el.dataset.parallax) || 24) * damp,
    }));
    const frames = [...root.querySelectorAll("[data-scroll-img]")].map((el) => ({
      el,
      kind: "img",
      anchor: el,
      max: (parseFloat(getComputedStyle(el).getPropertyValue("--bleed")) || 32) * damp,
    }));
    const items = [...layers, ...frames];
    if (!items.length) return undefined;

    const byAnchor = new Map();
    items.forEach((it) => {
      const list = byAnchor.get(it.anchor) || [];
      list.push(it);
      byAnchor.set(it.anchor, list);
    });
    const live = new Set();

    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      for (const it of live) {
        const r = it.anchor.getBoundingClientRect();
        if (it.kind === "layer") {
          const p = clamp((r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2), -1, 1);
          it.el.style.setProperty("--parallax", `${(p * it.max).toFixed(1)}px`);
        } else {
          const t = clamp((vh - r.top) / (vh + r.height), 0, 1);
          const y = (t - 0.5) * 2 * it.max;
          const s = 1 + 0.1 * (1 - easeOut(clamp(t / 0.55, 0, 1)));
          it.el.style.setProperty("--img-y", `${y.toFixed(1)}px`);
          it.el.style.setProperty("--img-s", s.toFixed(4));
        }
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          (byAnchor.get(e.target) || []).forEach((it) => {
            if (e.isIntersecting) live.add(it);
            else live.delete(it);
            it.el.classList.toggle("is-moving", e.isIntersecting);
          });
        });
        schedule();
      },
      { rootMargin: "25% 0px" }
    );
    byAnchor.forEach((_, anchor) => io.observe(anchor));

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Hero scroll progress. Writes `--hero-p` (0 at rest → 1 once the hero has
 * scrolled its own height) on `ref`; CSS turns it into the image scale-up and
 * copy fade. Reduced motion: stays at 0. Small screens: half the travel.
 */
export function useHeroScroll(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return undefined;
    const damp = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches ? 0.5 : 1;
    el.style.setProperty("--hero-damp", String(damp));
    let frame = 0;
    let visible = true;
    const update = () => {
      frame = 0;
      const h = el.offsetHeight || 1;
      const p = clamp(window.scrollY / (h * 0.8), 0, 1);
      el.style.setProperty("--hero-p", p.toFixed(4));
    };
    const onScroll = () => {
      if (visible && !frame) frame = requestAnimationFrame(update);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) onScroll();
    });
    io.observe(el);
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}

/** True once the window has scrolled past `threshold` px. */
export function useScrolled(threshold = 24) {
  const [scrolled, setScrolled] = useState(
    () => typeof window !== "undefined" && window.scrollY > threshold
  );
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      setScrolled(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);
  return scrolled;
}
