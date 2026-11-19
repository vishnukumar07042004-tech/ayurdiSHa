/**
 * Mentor pack Excel round-trip — pure helpers (no XLSX import, no DOM) so the browser and the
 * Node tests share exactly the same row layout and parsing rules.
 */
import { displayPassId } from "./passId.js";
import { displayAskerEmail, displayAskerName } from "./account.js";

export const BRIEF_COLS = [
  "Cluster_ID", "Theme", "Subtheme", "Students_In_Cluster", "Composite_Question",
  "Representative_Wording", "Ticket_ID", "Question_ID", "Pass_ID", "Name", "Email",
  "Original_Question", "MERGED_ANSWER", "INDIVIDUAL_ANSWER",
  "ACTION_1", "ACTION_2", "ACTION_3", "COMMON_MISTAKE",
  "RESOURCE_1", "RESOURCE_2", "MENTOR_NAME_DESIGNATION", "Assigned_Mentor",
];

/** One row per student in each group; group columns repeat on every member row. */
export function mentorBriefRows(clusters, subs) {
  const byId = Object.fromEntries((subs || []).map(s => [s.id, s]));
  const rows = [BRIEF_COLS];
  (clusters || []).forEach(c => {
    const memberIds = Array.isArray(c.memberIds) ? c.memberIds : [];
    const members = memberIds.map(id => byId[id]).filter(Boolean);
    const base = [
      c.id, c.theme, c.subtheme, memberIds.length,
      c.composite || c.representative, c.representative,
    ];
    const actions = Array.isArray(c.actions) ? c.actions : [];
    const resources = Array.isArray(c.resources) ? c.resources : [];
    const tail = [
      actions[0] || "", actions[1] || "", actions[2] || "",
      c.mistake || "", resources[0] || "", resources[1] || "",
      c.mentorName || "", c.mentor || "",
    ];
    if (!members.length) {
      rows.push([...base, "", "", "", "", "", "", c.answer || "", "", ...tail]);
      return;
    }
    members.forEach(m => rows.push([
      ...base,
      m.ticket, m.id, displayPassId(m).id, displayAskerName(m), displayAskerEmail(m),
      m.question, c.answer || "", m.individualAnswer || "", ...tail,
    ]));
  });
  return rows;
}

/**
 * Parse the MENTOR_BRIEF grid (array of arrays, header first). Returns
 * `{ kind: "cluster", id, answer, composite, actions, mistake, resources, mentorName }` per group
 * plus `{ kind: "individual", ticket, id, answer, … }` for INDIVIDUAL_ANSWER cells.
 */
export function parseAnswerGrid(grid) {
  if (!Array.isArray(grid) || !grid.length) throw new Error("The file has no rows.");
  const head = (grid[0] || []).map(h => String(h).trim());
  const at = name => head.indexOf(name);
  const get = (r, name) => { const i = at(name); return i < 0 ? "" : String(r[i] ?? "").trim(); };
  const extras = r => ({
    actions: [get(r, "ACTION_1"), get(r, "ACTION_2"), get(r, "ACTION_3")],
    mistake: get(r, "COMMON_MISTAKE"),
    resources: [get(r, "RESOURCE_1"), get(r, "RESOURCE_2")],
    mentorName: get(r, "MENTOR_NAME_DESIGNATION"),
  });
  const mergedAnswer = r => get(r, "MERGED_ANSWER") || get(r, "ANSWER");

  if (at("Ticket_ID") >= 0 && at("Cluster_ID") < 0) {
    return grid.slice(1).filter(r => get(r, "Ticket_ID")).map(r => ({
      kind: "individual",
      ticket: get(r, "Ticket_ID"),
      id: get(r, "Question_ID"),
      answer: get(r, "ANSWER") || get(r, "INDIVIDUAL_ANSWER"),
      ...extras(r),
    }));
  }
  if (at("Cluster_ID") < 0) {
    throw new Error("Use a sheet exported from the mentor pack (Cluster_ID or Ticket_ID column).");
  }

  const clusterMap = new Map();
  const individuals = [];
  grid.slice(1).forEach(r => {
    const cid = get(r, "Cluster_ID");
    if (!cid) return;
    const ticket = get(r, "Ticket_ID");
    const indAns = get(r, "INDIVIDUAL_ANSWER");
    if (ticket && indAns) {
      individuals.push({ kind: "individual", ticket, id: get(r, "Question_ID"), answer: indAns, ...extras(r) });
    }
    if (!clusterMap.has(cid)) {
      clusterMap.set(cid, {
        kind: "cluster", id: cid, answer: "", composite: get(r, "Composite_Question"),
        actions: ["", "", ""], mistake: "", resources: ["", ""], mentorName: "",
      });
    }
    const c = clusterMap.get(cid);
    const mAns = mergedAnswer(r);
    if (mAns && !c.answer) c.answer = mAns;
    if (!c.composite) c.composite = get(r, "Composite_Question");
    const ex = extras(r);
    ex.actions.forEach((a, i) => { if (a && !c.actions[i]) c.actions[i] = a; });
    if (!c.mistake) c.mistake = ex.mistake;
    ex.resources.forEach((res, i) => { if (res && !c.resources[i]) c.resources[i] = res; });
    if (!c.mentorName) c.mentorName = ex.mentorName;
  });

  return [...clusterMap.values(), ...individuals];
}

/** Apply parsed group answers. Rows without an answer leave the group untouched. */
export function applyClusterAnswers(clusters, clusterRows) {
  const map = Object.fromEntries((clusterRows || []).map(r => [r.id, r]));
  let filled = 0;
  const next = (clusters || []).map(c => {
    const r = map[c.id];
    if (!r || !r.answer) return c;
    filled++;
    return {
      ...c, answer: r.answer, actions: r.actions, mistake: r.mistake,
      resources: r.resources, mentorName: r.mentorName || c.mentorName || "",
      composite: r.composite || c.composite,
      status: "Published",
    };
  });
  const known = new Set((clusters || []).map(c => c.id));
  const unknown = (clusterRows || []).filter(r => r.answer && !known.has(r.id)).map(r => r.id);
  return { clusters: next, filled, unknown };
}
