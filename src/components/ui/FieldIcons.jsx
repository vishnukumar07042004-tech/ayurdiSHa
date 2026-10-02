import React from "react";

/** Line glyphs for the mentor fields (and generic categories). 48×48, currentColor. */
const PATHS = {
  all: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="3.5" />
      <rect x="27" y="9" width="12" height="12" rx="3.5" />
      <rect x="9" y="27" width="12" height="12" rx="3.5" />
      <path d="M33 26.5c3.6 1.2 6 4.4 6 6.5 0 3.3-2.7 6-6 6s-6-2.7-6-6c0-2.1 2.4-5.3 6-6.5Z" />
    </>
  ),
  clinical: (
    <>
      <path d="M6 27h8l3.5-8 5 16 4.5-12 2.5 4H42" />
      <path d="M24 12.5c2.8-4.6 10-4.2 11.4 1 1.3 4.9-3.2 8.3-6.9 10.5" />
      <path d="M24 12.5c-2.8-4.6-10-4.2-11.4 1-.5 1.9-.2 3.6.6 5" />
    </>
  ),
  academics: (
    <>
      <path d="M8 13.5c5.5-1.8 11-1.3 16 2v21c-5-3.3-10.5-3.8-16-2v-21Z" />
      <path d="M40 13.5c-5.5-1.8-11-1.3-16 2v21c5-3.3 10.5-3.8 16-2v-21Z" />
      <path d="M12.5 20c2.6-.5 5-.2 7.3.7M12.5 25c2.6-.5 5-.2 7.3.7M28.2 20.7c2.3-.9 4.7-1.2 7.3-.7M28.2 25.7c2.3-.9 4.7-1.2 7.3-.7" />
    </>
  ),
  research: (
    <>
      <path d="M19 7h10M21 7v12.5L11.2 36.4A3 3 0 0 0 13.8 41h20.4a3 3 0 0 0 2.6-4.6L27 19.5V7" />
      <path d="M15.5 30h17" />
      <path d="M24 34.5c0-2.5 2-4.5 4.5-4.5M21 36.5c1-.8 2-1.2 3-1.2" />
    </>
  ),
  pharma: (
    <>
      <path d="M9 24h30c0 8.3-6.7 15-15 15S9 32.3 9 24Z" />
      <path d="M17 39.5h14" />
      <path d="m27 21 11-12.5a2.6 2.6 0 0 1 3.8 3.5L31.5 22.5" />
      <path d="M14.5 20c1.6-3.4 4.4-4.8 7.5-4.3-1 3.2-3.8 4.9-7.5 4.3Z" />
    </>
  ),
  guide: (
    <>
      <path d="M13 7h16l8 8v26H13z" />
      <path d="M29 7v8h8M18 23h14M18 29h14M18 35h8" />
    </>
  ),
  talk: (
    <>
      <rect x="18" y="6" width="12" height="22" rx="6" />
      <path d="M12 23c0 6.6 5.4 12 12 12s12-5.4 12-12M24 35v7M18 42h12" />
    </>
  ),
  global: (
    <>
      <circle cx="24" cy="24" r="16" />
      <path d="M8 24h32M24 8c4.4 4.4 6.5 9.8 6.5 16S28.4 35.6 24 40c-4.4-4.4-6.5-9.8-6.5-16S19.6 12.4 24 8Z" />
    </>
  ),
  enterprise: (
    <>
      <path d="M7 40V22l10 6v-6l10 6v-6l10 6V10h4v30z" />
      <path d="M7 40h34" />
    </>
  ),
};

const FIELD_KEYS = {
  All: "all",
  "Clinical Practice": "clinical",
  "Academics & Samhita": "academics",
  "Research & Evidence": "research",
  "Pharmacology & GMP": "pharma",
};

export function fieldKey(field) {
  return FIELD_KEYS[field] || "all";
}

export default function FieldIcon({ name = "all", size = 32, className = "", strokeWidth = 1.6 }) {
  return (
    <svg
      className={`ui-field-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name] || PATHS.all}
    </svg>
  );
}
