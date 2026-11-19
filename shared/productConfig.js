/**
 * Product dates, plan mode, and public promise line.
 * Optional deadline fields are empty by default — the Ask Desk stays open until
 * intakeClosesAt is set later via an audited staff setting (Phase A/D).
 * Congress 10–13 Dec 2026 is event info only (see src/content/site.js WAC).
 */

/** free = Spark/Hobby constraints; paid = Blaze/PITR path when funded. */
export const PLAN_MODE = "free";

/**
 * Optional calendar days (YYYY-MM-DD) or "". Empty = do not show a deadline and
 * do not close intake.
 */
export const KEY_DATES = {
  intakeOpensAt: "",
  intakeClosesAt: "",
  mentorBriefsAt: "",
  rosterConfirmedAt: "",
  answerBankPublishAt: "",
  /** Event info only (not an intake deadline). */
  congressStart: "2026-12-10",
  congressEnd: "2026-12-13",
};

/** @deprecated Use intakeClosesAt — kept so older call sites keep compiling. */
Object.defineProperty(KEY_DATES, "intakeCloses", {
  enumerable: true,
  get() { return this.intakeClosesAt; },
});
Object.defineProperty(KEY_DATES, "answerBankBy", {
  enumerable: true,
  get() { return this.answerBankPublishAt; },
});
Object.defineProperty(KEY_DATES, "mentorBriefs", {
  enumerable: true,
  get() { return this.mentorBriefsAt; },
});
Object.defineProperty(KEY_DATES, "roster", {
  enumerable: true,
  get() { return this.rosterConfirmedAt; },
});

export const CONGRESS_CORE_DAYS = [
  "10 December 2026",
  "11 December 2026",
  "12 December 2026",
  "13 December 2026",
];

export const DATES_ANNOUNCED_COPY =
  "Dates will be announced by the WAC Secretariat.";

/** Canonical meta / OG description — no personal-mentor guarantee; no hard intake deadline. */
export const META_DESCRIPTION =
  "AYURDISHA Meet the Mentors at the 11th World Ayurveda Congress, Janata Maidan, Bhubaneswar, 10–13 Dec 2026. Ask one focused career question; every valid ask gets a written or recorded answer via the answer bank and clustered composites — not a personal mentor slot promise.";

export const PROMISE_SHORT =
  "Every valid question gets a written or recorded answer through clustered composites and the answer bank — not a personal mentor guarantee. A live slot is separate and limited.";

function dayEndIst(iso) {
  const s = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = new Date(`${s}T23:59:59.999+05:30`).getTime();
  return Number.isFinite(t) ? t : null;
}

/** ms at end of intake day IST, or null when unset. */
export function intakeClosesAt(dates = KEY_DATES) {
  return dayEndIst(dates.intakeClosesAt || dates.intakeCloses);
}

/** Open when no close date is configured, or before that day's end IST. */
export function isIntakeOpen(now = Date.now(), dates = KEY_DATES) {
  const closes = intakeClosesAt(dates);
  if (closes == null) return true;
  return now <= closes;
}

export function formatKeyDate(iso) {
  const s = String(iso || "").trim();
  if (!s) return "";
  try {
    return new Date(`${s}T12:00:00+05:30`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return s;
  }
}

/** Neutral line for UI: deadline text only when a close date is set. */
export function intakeStatusLine(dates = KEY_DATES) {
  const closes = dates.intakeClosesAt || dates.intakeCloses;
  if (!closes) return DATES_ANNOUNCED_COPY;
  return `Questions accepted until ${formatKeyDate(closes)}.`;
}
