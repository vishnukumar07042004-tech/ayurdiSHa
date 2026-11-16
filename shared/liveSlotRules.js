/**
 * Live-slot access rules (stub + pure helpers).
 * Automation NEVER decides access — these helpers only score eligibility / caps for
 * human curators and appointment coordinators. No DB migration required.
 *
 * Spec: one live slot per student; ≤10% of slots from one institution;
 * ~80% pre-book / 20% draw among verified Congress in-person delegates.
 */

export const LIVE_SLOT_RULES = Object.freeze({
  maxSlotsPerStudent: 1,
  institutionCapShare: 0.1,
  preBookShare: 0.8,
  drawShare: 0.2,
  requiresCongressRegistered: true,
  requiresInPerson: true,
  automationMayDecideAccess: false,
});

/**
 * @param {{ registered?: string, inPerson?: string, wacId?: string }} row
 * @returns {{ eligible: boolean, reasons: string[] }}
 */
export function liveSlotEligibility(row = {}) {
  const reasons = [];
  const registered = String(row.registered || "").trim();
  const inPerson = String(row.inPerson || "").trim();
  const hasWac = Boolean(String(row.wacId || "").trim());
  if (LIVE_SLOT_RULES.requiresCongressRegistered) {
    const ok = registered === "Yes" || hasWac;
    if (!ok) reasons.push("not-congress-registered");
  }
  if (LIVE_SLOT_RULES.requiresInPerson && inPerson !== "Yes") {
    reasons.push("not-in-person");
  }
  return { eligible: reasons.length === 0, reasons };
}

/**
 * How many seats one institution may hold for a given pool size (floor, min 1 when pool ≥ 1).
 * @param {number} poolSize
 * @param {number} [capShare]
 */
export function institutionSeatCap(poolSize, capShare = LIVE_SLOT_RULES.institutionCapShare) {
  const n = Math.max(0, Math.floor(Number(poolSize) || 0));
  if (n <= 0) return 0;
  return Math.max(1, Math.floor(n * capShare));
}

/**
 * Split a pool into pre-book vs draw seats (pre-book gets the remainder when rounding).
 * @param {number} poolSize
 */
export function splitPreBookAndDraw(poolSize) {
  const n = Math.max(0, Math.floor(Number(poolSize) || 0));
  const draw = Math.floor(n * LIVE_SLOT_RULES.drawShare);
  const preBook = n - draw;
  return { preBook, draw, total: n };
}

/** Staff-facing note — show on scheduling desks until full ladder ships. */
export const LIVE_SLOT_ADMIN_NOTE =
  "Live slots: verified Congress in-person only; one slot per student; ≤10% per institution; ~80/20 pre-book/draw. Automation never decides access — curator + coordinator only.";
