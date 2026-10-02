/**
 * Intersection Observer scroll reveal. By default re-fires whenever elements
 * enter or leave the viewport (toggles `is-visible`); pass `once: true` for a
 * one-shot reveal. Respects prefers-reduced-motion by forcing visible state.
 *
 * @param {ParentNode} root
 * @param {{ selector?: string, threshold?: number, rootMargin?: string, once?: boolean }} [options]
 * @returns {() => void} disconnect / cleanup
 */
export function observeScrollReveal(root, options = {}) {
  if (!root) return () => {};

  const selector = options.selector || "[data-reveal]";
  const nodes = root.querySelectorAll(selector);
  if (!nodes.length) return () => {};

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    nodes.forEach((el) => el.classList.add("is-visible"));
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (options.once) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
          return;
        }
        entry.target.classList.toggle("is-visible", entry.isIntersecting);
      });
    },
    {
      threshold: options.threshold ?? 0.12,
      rootMargin: options.rootMargin ?? "0px 0px -8% 0px",
    }
  );

  nodes.forEach((el) => observer.observe(el));
  return () => observer.disconnect();
}
