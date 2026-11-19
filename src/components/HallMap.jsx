import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, X } from "lucide-react";
import { HALL_MAP_SCROLL_KEY, HALL_MAP_ZONES, hallZoneHref } from "./hallMapZones.js";
import "../styles/hall-map.css";

const WIDE_QUERY = "(min-width: 900px)";

function useWide() {
  const [wide, setWide] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia(WIDE_QUERY).matches : true
  );
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}

function ZoneCard({ zone, n, id, titleId, onClose, onGo, cardRef, className = "", style }) {
  const href = hallZoneHref(zone);
  const onCta = (e) => {
    if (!zone.tab || !onGo || e.defaultPrevented) return;
    e.preventDefault();
    onGo(zone.tab);
  };
  return (
    <div
      ref={cardRef}
      id={id}
      className={`hm-card ${className}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={style}
    >
      <div className="hm-card-head">
        <span className="hm-card-n" aria-hidden="true">{n}</span>
        <h3 id={titleId} className="hm-card-title">{zone.label}</h3>
        <button type="button" className="hm-card-close" onClick={onClose} aria-label="Close">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <p className="hm-card-body">{zone.body}</p>
      {zone.tab ? (
        <a className="hm-card-cta" href={href} onClick={onCta}>
          {zone.cta} <ArrowRight size={15} aria-hidden="true" />
        </a>
      ) : (
        <Link className="hm-card-cta" to={href}>
          {zone.cta} <ArrowRight size={15} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/** Tappable map of the Meet the Mentors hall; `onGo(tab)` handles in-app hash views. */
export default function HallMap({ onGo }) {
  const uid = useId();
  const wide = useWide();
  const [active, setActive] = useState(null);
  const openerRef = useRef(null);
  const cardRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    let flag = "";
    try { flag = sessionStorage.getItem(HALL_MAP_SCROLL_KEY) || ""; } catch { flag = ""; }
    if (flag !== "1") return undefined;
    try { sessionStorage.removeItem(HALL_MAP_SCROLL_KEY); } catch { /* private mode */ }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => {
      rootRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }, 180);
    return () => window.clearTimeout(t);
  }, []);

  const cardId = `${uid}-card`;
  const titleId = `${uid}-title`;

  const close = useCallback((restoreFocus = true) => {
    setActive(null);
    if (restoreFocus) openerRef.current?.focus();
  }, []);

  const toggle = (zoneId, e) => {
    if (active === zoneId) { close(false); return; }
    openerRef.current = e.currentTarget;
    setActive(zoneId);
  };

  useEffect(() => {
    if (!active) return undefined;
    cardRef.current?.focus({ preventScroll: wide });
    const onKey = (e) => { if (e.key === "Escape") close(true); };
    const onPointer = (e) => {
      const root = rootRef.current;
      if (!root || !root.contains(e.target)) { close(false); return; }
      if (cardRef.current?.contains(e.target)) return;
      if (e.target.closest?.("[data-hm-trigger]")) return;
      close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [active, close, wide]);

  const activeIndex = HALL_MAP_ZONES.findIndex(z => z.id === active);
  const activeZone = activeIndex >= 0 ? HALL_MAP_ZONES[activeIndex] : null;

  const cardFor = (zone, i, extra) => (
    <ZoneCard
      zone={zone}
      n={i + 1}
      id={cardId}
      titleId={titleId}
      cardRef={cardRef}
      onClose={() => close(true)}
      onGo={onGo}
      {...extra}
    />
  );

  const floatStyle = (pt) => ({
    ...(pt.x > 58 ? { right: `${100 - pt.x}%` } : { left: `${pt.x}%` }),
    ...(pt.y > 55 ? { bottom: `${100 - pt.y}%` } : { top: `${pt.y}%` }),
  });
  const floatClass = (pt) => `hm-card--float ${pt.x > 58 ? "is-left" : "is-right"} ${pt.y > 55 ? "is-up" : "is-down"}`;

  return (
    <section className="hm" id="hall-map" aria-labelledby={`${uid}-heading`} ref={rootRef}>
      <header className="hm-head">
        <p className="hm-eyebrow">Meet the Mentors · Bhubaneswar</p>
        <h2 id={`${uid}-heading`} className="hm-title">How the hall <em>works</em></h2>
        <p className="hm-sub">Eight places on the floor. Tap one to see what happens there — and where to go next in the app.</p>
      </header>

      <div className="hm-layout">
        <figure className="hm-figure">
          <div className="hm-frame" role="group" aria-label="Hall map — scroll sideways to see the whole floor" tabIndex={wide ? undefined : 0}>
            <div className="hm-canvas">
              <picture>
                <source media="(max-width: 899px)" srcSet="/assets/hall/hall-map-m.webp" width="900" height="675" />
                <img
                  className="hm-img"
                  src="/assets/hall/hall-map.webp"
                  width="1600"
                  height="1200"
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable="false"
                />
              </picture>

              {HALL_MAP_ZONES.map((zone, i) => zone.points.map((pt, j) => {
                const pos = { left: `${pt.x}%`, top: `${pt.y}%` };
                const isOn = active === zone.id;
                if (j > 0) {
                  return (
                    <span
                      key={`${zone.id}-${j}`}
                      className={`hm-dot${isOn ? " is-on" : ""}`}
                      style={pos}
                      aria-hidden="true"
                      data-hm-trigger=""
                      onClick={(e) => { if (active !== zone.id) { openerRef.current = null; setActive(zone.id); } else close(false); e.stopPropagation(); }}
                    />
                  );
                }
                return (
                  <button
                    key={zone.id}
                    type="button"
                    className={`hm-pin${isOn ? " is-on" : ""}${zone.labelSide === "left" || pt.x > 70 ? " hm-pin--label-left" : ""}`}
                    style={{ ...pos, "--hm-delay": `${i * 0.35}s` }}
                    aria-expanded={isOn}
                    aria-controls={isOn ? cardId : undefined}
                    data-hm-trigger=""
                    onClick={(e) => toggle(zone.id, e)}
                  >
                    <span className="hm-pin-n" aria-hidden="true">{i + 1}</span>
                    <span className="hm-pin-label">
                      <span className="aym-visually-hidden">{i + 1}. </span>{zone.label}
                    </span>
                  </button>
                );
              }))}

              {wide && activeZone && cardFor(activeZone, activeIndex, {
                className: floatClass(activeZone.points[0]),
                style: floatStyle(activeZone.points[0]),
              })}
            </div>
          </div>
          <figcaption className="hm-caption">Illustrative layout of the Meet the Mentors hall at WAC 2026, Bhubaneswar.</figcaption>
        </figure>

        <ol className="hm-legend" aria-label="Places in the hall">
          {HALL_MAP_ZONES.map((zone, i) => {
            const isOn = active === zone.id;
            return (
              <li key={zone.id} className={`hm-legend-item${isOn ? " is-on" : ""}`}>
                <button
                  type="button"
                  className="hm-legend-btn"
                  aria-expanded={isOn}
                  aria-controls={isOn ? cardId : undefined}
                  data-hm-trigger=""
                  onClick={(e) => toggle(zone.id, e)}
                >
                  <span className="hm-legend-n" aria-hidden="true">{i + 1}</span>
                  <span className="hm-legend-text">
                    <span className="hm-legend-label">{zone.label}</span>
                    {!wide && <span className="hm-legend-hint">{zone.cta}</span>}
                  </span>
                </button>
                {!wide && isOn && cardFor(zone, i, { className: "hm-card--inline" })}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
