/**
 * Explainable risk signals for the review desk — replaces fake self-reported % confidence
 * as the primary badge copy (confidence may still be stored for ranking).
 */

export function riskReasonsFrom({
  risk = "medium",
  claimChecks = [],
  mode = "",
  flags = [],
  verifyFlags = [],
  triage = null,
  unsupportedConfirmNeeded = false,
} = {}) {
  const reasons = [];
  const checks = Array.isArray(claimChecks) ? claimChecks : [];
  const unsupported = checks.filter(c => c && c.status === "unsupported").length;
  const outdated = checks.filter(c => c && c.status === "outdated").length;
  const limited = mode === "mentor-assist" || (Array.isArray(flags) && flags.includes("limited-sources"));
  if (limited) reasons.push("Limited sources — mentor should complete facts");
  if (unsupported) reasons.push(`${unsupported} unsupported claim${unsupported === 1 ? "" : "s"}`);
  if (outdated) reasons.push(`${outdated} possibly outdated claim${outdated === 1 ? "" : "s"}`);
  if (triage && triage.category === "RESTRICTED") reasons.push(`Restricted: ${triage.subtype || "safety"}`);
  if (triage && triage.needsHumanTriage) reasons.push("Needs human triage");
  if (unsupportedConfirmNeeded || unsupported > 0) reasons.push("Confirm before approve if claims lack sources");
  const vf = Array.isArray(verifyFlags) ? verifyFlags : [];
  for (const f of vf) {
    const s = String(f || "").trim();
    if (s && reasons.length < 5 && !reasons.some(r => r.includes(s.slice(0, 24)))) reasons.push(s.slice(0, 120));
  }
  if (!reasons.length) {
    if (risk === "high") reasons.push("High risk — review carefully");
    else if (risk === "medium") reasons.push("Medium risk — spot-check facts");
    else reasons.push("Low risk — sources look adequate");
  }
  return reasons.slice(0, 5);
}

/** Desk badge label without a fake percentage. */
export function riskBadgeLabel(risk, riskReasons) {
  const r = String(risk || "high");
  const head = `${r.charAt(0).toUpperCase() + r.slice(1)} risk`;
  const first = Array.isArray(riskReasons) && riskReasons[0] ? riskReasons[0] : "";
  return first ? `${head} · ${first}` : head;
}
