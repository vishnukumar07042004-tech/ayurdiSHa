/**
 * Single source for Congress / intake key dates and the public promise line.
 * Used by the browser and the Ask Desk close gate. Times are India (Asia/Kolkata).
 */

/** Calendar day strings (YYYY-MM-DD) — editable without a migration. */
export const KEY_DATES = {
  intakeCloses: "2026-11-25",
  mentorBriefs: "2026-12-01",
  roster: "2026-12-05",
  congressStart: "2026-12-10",
  congressEnd: "2026-12-13",
  answerBankBy: "2026-12-31",
};

export const CONGRESS_CORE_DAYS = [
  "10 December 2026",
  "11 December 2026",
  "12 December 2026",
  "13 December 2026",
];

/** Canonical meta / OG description — no personal-mentor guarantee. */
export const META_DESCRIPTION =
  "AYURDISHA Meet the Mentors at the 11th World Ayurveda Congress, Bhubaneswar, 10–13 Dec 2026. Ask one focused career question; every valid ask gets a written or recorded answer via the answer bank and clustered composites — not a personal mentor slot promise.";

export const PROMISE_SHORT =
  "Every valid question gets a written or recorded answer through clustered composites and the answer bank — not a personal mentor guarantee. A live slot is separate and limited.";

/** End of intake day in Asia/Kolkata (inclusive through 25 Nov 2026). */
export function intakeClosesAt(dates = KEY_DATES) {
  // 23:59:59.999 IST on intakeCloses
  return new Date(`${dates.intakeCloses}T23:59:59.999+05:30`).getTime();
}

export function isIntakeOpen(now = Date.now(), dates = KEY_DATES) {
  return now <= intakeClosesAt(dates);
}

export function formatKeyDate(iso) {
  try {
    return new Date(`${iso}T12:00:00+05:30`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return iso;
  }
}
