/**
 * Learning-loop numbers for the AI drafts desk and the monthly report: approval rate, edit size,
 * reject reasons, weak streams / personas, risk mix, spend.
 */

const REVIEWED_STATES = ["approved", "edited", "rejected", "to-mentor"];

function bump(map, key, field, n = 1) {
  const k = key || "unknown";
  if (!map[k]) map[k] = { drafted: 0, approved: 0, edited: 0, rejected: 0, toMentor: 0, blocked: 0, pending: 0, editRatioSum: 0, edits: 0 };
  map[k][field] += n;
  return map[k];
}

function finish(map) {
  return Object.entries(map).map(([id, v]) => {
    const reviewed = v.approved + v.edited + v.rejected + v.toMentor;
    return {
      id,
      ...v,
      reviewed,
      approvalRate: reviewed ? Math.round(((v.approved + v.edited) / reviewed) * 1000) / 1000 : null,
      lightEditRate: reviewed ? Math.round(((v.approved + v.lightEdits) / reviewed) * 1000) / 1000 : null,
      avgEditRatio: v.edits ? Math.round((v.editRatioSum / v.edits) * 1000) / 1000 : null,
    };
  }).sort((a, b) => (a.approvalRate ?? 2) - (b.approvalRate ?? 2));
}

/**
 * @param {{drafts: object[], jobs?: object[], usage?: object[], cfg?: object, today?: string, since?: number, until?: number}} args
 */
export function computeStats({ drafts = [], jobs = [], usage = [], cfg = {}, today = "", since = 0, until = Infinity }) {
  const inRange = drafts.filter(d => (d.createdAt || 0) >= since && (d.createdAt || 0) < until);
  const byStream = {};
  const byPersona = {};
  const reasons = {};
  const blockedReasons = {};
  const risk = { low: 0, medium: 0, high: 0 };
  let editRatioSum = 0;
  let edits = 0;
  let lightEdits = 0;
  const totals = { drafted: 0, pending: 0, approved: 0, edited: 0, rejected: 0, toMentor: 0, blocked: 0, shadowPending: 0, mentorAssist: 0, unsupportedClaims: 0, claims: 0 };

  for (const d of inRange) {
    const a = d.aiDraft || {};
    const s = a.status || "pending";
    totals.drafted++;
    const field = s === "to-mentor" ? "toMentor" : s;
    if (field in totals) totals[field]++;
    if (s === "pending" && d.shadow) totals.shadowPending++;
    if (a.mode === "mentor-assist") totals.mentorAssist++;
    for (const map of [[byStream, d.stream], [byPersona, a.persona]]) {
      const row = bump(map[0], map[1], "drafted");
      if (field in row) row[field]++;
      row.lightEdits = row.lightEdits || 0;
    }
    if (a.risk && a.risk in risk && s !== "blocked") risk[a.risk]++;
    for (const c of a.claimChecks || []) {
      totals.claims++;
      if (c.status === "unsupported") totals.unsupportedClaims++;
    }
    if (s === "edited" && a.editDiff) {
      const r = Number(a.editDiff.ratio) || 0;
      editRatioSum += r;
      edits++;
      if (r <= 0.2) lightEdits++;
      for (const map of [[byStream, d.stream], [byPersona, a.persona]]) {
        const row = map[0][map[1] || "unknown"];
        row.editRatioSum += r;
        row.edits++;
        if (r <= 0.2) row.lightEdits++;
      }
    }
    if (s === "rejected") {
      const key = String(a.rejectTag || a.rejectReason || "unspecified").toLowerCase().slice(0, 80);
      reasons[key] = (reasons[key] || 0) + 1;
    }
    if (s === "blocked") {
      const key = a.blockedReason || "unspecified";
      blockedReasons[key] = (blockedReasons[key] || 0) + 1;
    }
  }

  const reviewed = REVIEWED_STATES.reduce((n, s) => n + (totals[s === "to-mentor" ? "toMentor" : s] || 0), 0);
  const day = (usage || []).find(u => u.day === today) || { costUSD: 0, calls: 0 };
  const monthKey = String(today || "").slice(0, 7);
  const month = (usage || []).filter(u => String(u.day || "").startsWith(monthKey)).reduce((s, u) => s + (u.costUSD || 0), 0);
  return {
    totals,
    reviewed,
    approvalRate: reviewed ? Math.round(((totals.approved + totals.edited) / reviewed) * 1000) / 1000 : null,
    approvableWithLightEdits: reviewed ? Math.round(((totals.approved + lightEdits) / reviewed) * 1000) / 1000 : null,
    avgEditRatio: edits ? Math.round((editRatioSum / edits) * 1000) / 1000 : null,
    risk,
    topRejectReasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([reason, n]) => ({ reason, n })),
    blockedReasons,
    byStream: finish(byStream),
    byPersona: finish(byPersona),
    jobs: {
      queued: jobs.filter(j => j.status === "queued").length,
      running: jobs.filter(j => j.status === "running").length,
      failed: jobs.filter(j => j.status === "failed").length,
      done: jobs.filter(j => j.status === "done").length,
    },
    spend: {
      todayUSD: Math.round((day.costUSD || 0) * 10000) / 10000,
      todayCalls: day.calls || 0,
      monthUSD: Math.round(month * 10000) / 10000,
      capUSD: cfg.dailySpendCapUSD || 0,
    },
  };
}
