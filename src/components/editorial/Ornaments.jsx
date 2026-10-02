import React from "react";

/* Decorative line art. Always aria-hidden; strokes use currentColor so
   each placement sets its own tint and opacity from CSS. */

const LEAF = "M0 0 C 9 -11, 27 -13, 42 0 C 27 13, 9 11, 0 0 Z";
const RIB = "M2 0 L 38 0";

function Leaf({ x, y, angle, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
      <path d={LEAF} pathLength="1" />
      <path d={RIB} pathLength="1" />
    </g>
  );
}

const SPRIG_LEAVES = [
  { x: 61, y: 262, angle: -32, scale: 1.05 },
  { x: 59, y: 236, angle: 212, scale: 1 },
  { x: 62, y: 200, angle: -40, scale: 0.95 },
  { x: 60, y: 172, angle: 218, scale: 0.92 },
  { x: 60, y: 136, angle: -46, scale: 0.84 },
  { x: 58, y: 108, angle: 222, scale: 0.78 },
  { x: 57, y: 74, angle: -52, scale: 0.68 },
  { x: 58, y: 50, angle: 228, scale: 0.6 },
];

export function Sprig({ className = "", ...rest }) {
  return (
    <svg
      className={`ed-ornament ed-sprig ${className}`}
      {...rest}
      viewBox="0 0 120 320"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M60 316 C 57 256, 66 196, 60 128 S 53 50, 61 14" pathLength="1" />
      {SPRIG_LEAVES.map((l, i) => (
        <Leaf key={i} {...l} />
      ))}
      <circle cx="61" cy="12" r="3" pathLength="1" />
    </svg>
  );
}

const BRANCH_LEAVES = [
  { x: 92, y: 300, angle: -118, scale: 1.25 },
  { x: 120, y: 262, angle: -18, scale: 1.2 },
  { x: 140, y: 236, angle: -128, scale: 1.1 },
  { x: 172, y: 204, angle: -24, scale: 1.1 },
  { x: 196, y: 176, angle: -138, scale: 1 },
  { x: 230, y: 150, angle: -30, scale: 0.95 },
  { x: 258, y: 122, angle: -146, scale: 0.85 },
  { x: 292, y: 100, angle: -36, scale: 0.78 },
  { x: 318, y: 74, angle: -152, scale: 0.7 },
  { x: 150, y: 290, angle: 34, scale: 0.9 },
  { x: 176, y: 300, angle: -8, scale: 0.8 },
];

export function Branch({ className = "", ...rest }) {
  return (
    <svg
      className={`ed-ornament ed-branch ${className}`}
      {...rest}
      viewBox="0 0 400 400"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M40 380 C 90 320, 150 250, 230 170 S 330 70, 372 40" pathLength="1" />
      <path d="M128 282 C 150 290, 170 300, 196 318" pathLength="1" />
      {BRANCH_LEAVES.map((l, i) => (
        <Leaf key={i} {...l} />
      ))}
    </svg>
  );
}

export function Rings({ className = "", ...rest }) {
  return (
    <svg
      className={`ed-ornament ed-rings ${className}`}
      {...rest}
      viewBox="0 0 400 400"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.8"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="200" cy="200" r="196" pathLength="1" />
      <circle cx="200" cy="200" r="158" pathLength="1" strokeDasharray="0.004 0.012" />
      <circle cx="200" cy="200" r="118" pathLength="1" />
    </svg>
  );
}

/** Eight-petal lotus outline — used small, as a seal. */
export function Lotus({ className = "", ...rest }) {
  const petals = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg
      className={`ed-ornament ed-lotus ${className}`}
      {...rest}
      viewBox="-60 -60 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {petals.map((a) => (
        <path key={a} d="M0 -8 C 10 -22, 10 -40, 0 -52 C -10 -40, -10 -22, 0 -8 Z" transform={`rotate(${a})`} pathLength="1" />
      ))}
      <circle r="8" pathLength="1" />
      <circle r="56" pathLength="1" opacity="0.5" />
    </svg>
  );
}

export function QuoteMark({ className = "" }) {
  return (
    <svg className={`ed-ornament ed-quote-mark ${className}`} viewBox="0 0 96 72" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M40 6C22 12 8 28 8 48c0 11 7 18 16 18 8 0 14-6 14-14 0-8-6-13-13-13-2 0-3 0-4 1 2-12 11-22 22-27L40 6zm48 0C70 12 56 28 56 48c0 11 7 18 16 18 8 0 14-6 14-14 0-8-6-13-13-13-2 0-3 0-4 1 2-12 11-22 22-27L88 6z"
      />
    </svg>
  );
}

export function Watermark({ children = "AYURDISHA", className = "" }) {
  return (
    <span className={`ed-watermark ${className}`} aria-hidden="true">
      {children}
    </span>
  );
}
