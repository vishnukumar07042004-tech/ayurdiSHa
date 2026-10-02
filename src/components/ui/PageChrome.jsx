import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { observeScrollReveal } from "../../scrollReveal.js";

/** Reveal `[data-reveal]` children of `ref` once they scroll into view. */
export function useReveal(ref, deps = []) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    return observeScrollReveal(root, { once: true, threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Consistent inner-page hero: eyebrow, headline, one-line subhead, actions. */
export const PageHero = React.forwardRef(function PageHero(
  { eyebrow, title, lead, actions, meta, align = "center", children, className = "", titleId },
  ref
) {
  return (
    <header ref={ref} className={`ui-page-hero ui-page-hero--${align} ${className}`}>
      <div className="ui-page-hero-glow" aria-hidden="true" />
      <div className="ui-container ui-page-hero-inner">
        {eyebrow && <p className="ui-eyebrow ui-rise" style={{ "--i": 0 }}>{eyebrow}</p>}
        <h1 id={titleId} className="ui-display ui-rise" style={{ "--i": 1 }}>{title}</h1>
        {lead && <p className="ui-page-hero-lead ui-rise" style={{ "--i": 2 }}>{lead}</p>}
        {actions && <div className="ui-btn-row ui-page-hero-actions ui-rise" style={{ "--i": 3 }}>{actions}</div>}
        {meta && <div className="ui-page-hero-meta ui-rise" style={{ "--i": 4 }}>{meta}</div>}
        {children}
      </div>
    </header>
  );
});

/**
 * Sticky local sub-nav (page title + section links + small CTA pill). It
 * slides in under the global bar once `watchRef` (usually the page hero)
 * has scrolled out of view.
 */
export function LocalNav({ title, titleTo, links = [], cta, watchRef }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = watchRef?.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => setShown(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { rootMargin: "-48px 0px 0px 0px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [watchRef]);

  return (
    <div className={`ui-localnav${shown ? " is-shown" : ""}`} aria-hidden={!shown} inert={!shown}>
      <div className="ui-localnav-inner">
        {titleTo ? (
          <Link to={titleTo} className="ui-localnav-title">{title}</Link>
        ) : (
          <button type="button" className="ui-localnav-title" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            {title}
          </button>
        )}
        <nav className="ui-localnav-links" aria-label={`${typeof title === "string" ? title : "Page"} sections`}>
          {links.map((l) =>
            l.to != null ? (
              <Link key={l.label} to={l.to} className="ui-localnav-link">{l.label}</Link>
            ) : (
              <a
                key={l.label}
                href={l.href}
                className="ui-localnav-link"
                onClick={(e) => {
                  const id = l.href?.startsWith("#") ? l.href.slice(1) : null;
                  const target = id && document.getElementById(id);
                  if (!target) return;
                  e.preventDefault();
                  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
                }}
              >
                {l.label}
              </a>
            )
          )}
          {cta && (
            cta.to != null ? (
              <Link to={cta.to} onClick={cta.onClick} className="ui-btn ui-btn--primary ui-btn--sm ui-localnav-cta">{cta.label}</Link>
            ) : (
              <button type="button" onClick={cta.onClick} className="ui-btn ui-btn--primary ui-btn--sm ui-localnav-cta">{cta.label}</button>
            )
          )}
        </nav>
      </div>
    </div>
  );
}
