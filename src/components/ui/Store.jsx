import React, { Children, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Picture from "../editorial/Picture.jsx";
import { MoreLink } from "./Button.jsx";

/**
 * Store-style page header: a large left title with a grey continuation and a
 * short helper block on the right (small "… ›" links).
 */
export const StoreHeader = React.forwardRef(function StoreHeader(
  { title, soft, eyebrow, helpers = [], titleId, children, className = "" },
  ref
) {
  return (
    <header ref={ref} className={`st-header ${className}`}>
      <div className="ui-container st-header-inner">
        <div className="st-header-main">
          {eyebrow && <p className="st-header-eyebrow ui-rise" style={{ "--i": 0 }}>{eyebrow}</p>}
          <h1 id={titleId} className="st-title ui-rise" style={{ "--i": 1 }}>
            {title}
            {soft && <span className="st-title-soft"> {soft}</span>}
          </h1>
          {children}
        </div>
        {helpers.length > 0 && (
          <ul className="st-helpers ui-rise" style={{ "--i": 2 }}>
            {helpers.map((h) => (
              <li key={h.label} className="st-helper">
                {h.icon && <span className="st-helper-icon" aria-hidden="true">{h.icon}</span>}
                <span className="st-helper-copy">
                  {h.text && <span className="st-helper-text">{h.text}</span>}
                  <MoreLink to={h.to} href={h.href} onClick={h.onClick} className="st-helper-link">
                    {h.label}
                  </MoreLink>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </header>
  );
});

/** "Bold lead. Grey continuation." shelf heading with an optional right action. */
export function ShelfHead({ id, title, soft, action, as: H = "h2", className = "" }) {
  return (
    <div className={`st-shelf-head ${className}`}>
      <H id={id} className="st-shelf-title">
        {title}
        {soft && <span className="st-soft"> {soft}</span>}
      </H>
      {action && <div className="st-shelf-action">{action}</div>}
    </div>
  );
}

/** One card slot inside a <Shelf>. size: standard | wide | compact */
export function ShelfItem({ size = "standard", children, className = "" }) {
  return <li className={`st-shelf-item st-shelf-item--${size} ${className}`}>{children}</li>;
}

/**
 * Horizontal card carousel: native scroll + snap (touch swipe, trackpad,
 * arrow keys when focused) with previous / next paddles. Cards align to the
 * page container and the next card peeks past the right edge.
 */
export function Shelf({ label, children, className = "" }) {
  const scrollerRef = useRef(null);
  const updateRef = useRef(() => {});
  const [edge, setEdge] = useState({ start: true, end: true });
  const count = Children.count(children);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth - 4;
      setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft >= max });
    };
    updateRef.current = update;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [count]);

  function page(dir, single = false) {
    const el = scrollerRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const item = el.querySelector(".st-shelf-item");
    const step = item ? item.getBoundingClientRect().width + 20 : 320;
    const perPage = single ? 1 : Math.max(1, Math.floor((el.clientWidth * 0.86) / step));
    const left = dir * step * perPage;
    const start = el.scrollLeft;
    el.scrollBy({ left, behavior: reduce ? "auto" : "smooth" });
    // Some embedded webviews drop smooth scrolls on snap containers.
    window.setTimeout(() => {
      if (!reduce && Math.abs(el.scrollLeft - start) < 2) el.scrollBy({ left, behavior: "auto" });
      updateRef.current();
    }, 320);
  }

  function onKeyDown(event) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      page(event.key === "ArrowRight" ? 1 : -1, true);
    }
  }

  const scrollable = !(edge.start && edge.end);

  return (
    <div className={`st-shelf ${className}`}>
      <div className="st-shelf-scroller" ref={scrollerRef} tabIndex={0} role="group" aria-label={label} onKeyDown={onKeyDown}>
        <ul className="st-shelf-track">{children}</ul>
      </div>
      <div className={`ui-container st-shelf-controls${scrollable ? "" : " is-idle"}`}>
        <button
          type="button"
          className="st-paddle"
          onClick={() => page(-1)}
          disabled={edge.start}
          aria-label={`Previous — ${label}`}
        >
          <ChevronLeft size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="st-paddle"
          onClick={() => page(1)}
          disabled={edge.end}
          aria-label={`Next — ${label}`}
        >
          <ChevronRight size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * Icon quick-nav tiles that double as a single-choice filter.
 * options: [{ value, label, count?, icon }]
 */
export function QuickNav({ options, value, onChange, label, className = "" }) {
  return (
    <div className={`st-quicknav ${className}`} role="group" aria-label={label}>
      <div className="st-quicknav-track">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              className={`st-qn${on ? " is-active" : ""}`}
              aria-pressed={on}
              onClick={() => onChange(o.value)}
            >
              <span className="st-qn-icon">{o.icon}</span>
              <span className="st-qn-label">{o.label}</span>
              {o.count != null && (
                <span className="st-qn-count">
                  {o.count}
                  <span className="aym-visually-hidden"> {o.countLabel || "items"}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Large image card with copy laid over the top (Store "full image" card). */
export function FeatureCard({
  image,
  alt = "",
  width,
  height,
  eyebrow,
  title,
  text,
  meta,
  action,
  as: H = "h3",
  className = "",
  sizes = "(max-width: 767px) 86vw, 420px",
}) {
  return (
    <article className={`st-fcard ${className}`}>
      <div className="st-fcard-media">
        <Picture src={image} alt={alt} width={width} height={height} sizes={sizes} />
      </div>
      <div className="st-fcard-veil" aria-hidden="true" />
      <div className="st-fcard-copy">
        {eyebrow && <p className="st-fcard-eyebrow">{eyebrow}</p>}
        <H className="st-fcard-title">{title}</H>
        {text && <p className="st-fcard-text">{text}</p>}
        {meta && <p className="st-fcard-meta">{meta}</p>}
      </div>
      {action && <div className="st-fcard-action">{action}</div>}
    </article>
  );
}

/** Specialist-style help row: icon, one line of copy and a "… ›" link per item. */
export function HelpRow({ items, className = "" }) {
  return (
    <ul className={`st-help ${className}`}>
      {items.map((it) => (
        <li key={it.label} className="st-help-item">
          {it.icon && <span className="st-help-icon" aria-hidden="true">{it.icon}</span>}
          <div className="st-help-copy">
            <p className="st-help-title">{it.title}</p>
            {it.text && <p className="st-help-text">{it.text}</p>}
            <MoreLink to={it.to} href={it.href} onClick={it.onClick}>{it.label}</MoreLink>
          </div>
        </li>
      ))}
    </ul>
  );
}
