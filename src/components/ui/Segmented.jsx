import React, { useLayoutEffect, useRef, useState } from "react";

/**
 * Pill segmented control with a sliding active background. Buttons keep
 * `aria-pressed`, so screen readers get the same toggle semantics as chips.
 *
 * options: [{ value, label, count? }]
 */
export default function Segmented({ options, value, onChange, label, className = "", size = "md" }) {
  const trackRef = useRef(null);
  const [thumb, setThumb] = useState(null);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const measure = () => {
      const el = track.querySelector('[aria-pressed="true"]');
      if (!el) { setThumb(null); return; }
      setThumb({ x: el.offsetLeft, w: el.offsetWidth, h: el.offsetHeight, y: el.offsetTop });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [value, options.length]);

  function scrollActiveIntoView(target) {
    const track = trackRef.current;
    if (!track || track.scrollWidth <= track.clientWidth) return;
    const left = target.offsetLeft - (track.clientWidth - target.offsetWidth) / 2;
    track.scrollTo({ left, behavior: "smooth" });
  }

  return (
    <div className={`ui-seg ui-seg--${size} ${className}`} role="group" aria-label={label}>
      <div className="ui-seg-track" ref={trackRef}>
        {thumb && (
          <span
            className="ui-seg-thumb"
            aria-hidden="true"
            style={{ width: thumb.w, height: thumb.h, transform: `translate3d(${thumb.x}px, ${thumb.y}px, 0)` }}
          />
        )}
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              className={`ui-seg-btn${on ? " is-active" : ""}`}
              aria-pressed={on}
              onClick={(e) => { onChange(o.value); scrollActiveIntoView(e.currentTarget); }}
            >
              <span>{o.label}</span>
              {o.count != null && <span className="ui-seg-count" aria-hidden="true">{o.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
