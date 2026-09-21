/**
 * Intersection Observer scroll reveal that re-fires whenever elements
 * enter or leave the viewport (toggles `is-visible`, not one-shot).
 * Respects prefers-reduced-motion by forcing visible state immediately.
 *
 * @param {ParentNode} root
 * @param {{ selector?: string, threshold?: number, rootMargin?: string }} [options]
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
