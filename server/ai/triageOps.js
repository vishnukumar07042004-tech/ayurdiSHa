/**
 * Staff ops for triaged drafts (staff-PIN gated: they are part of AI_OPS in ops.js).
 * - aiRefile: move a question (or merged group) to the right theme / sub-area, re-run its merge
 *   assignment with the clusters version check (409 on conflict), then redraft.
 * - aiAskRephrase: send the clarifying "please narrow this down" reply through the normal approve path.
 */

import { K_Q } from "../store.js";
import { MERGE_DEFAULTS, analyzeQuestion, clusterAnswerText, detachMember, isLockedCluster, pairVerdict, questionSimilarity, sanitizeClusters, typoFoldMap } from "../../shared/merge.js";
import { isValidPair, detectLanguage } from "../../shared/triageRules.js";
import { aiStoreFor } from "./aiStore.js";
import { enqueueCluster, enqueueQuestion, REVIEWED } from "./queue.js";
import { scriptedReply } from "./triageTemplates.js";

export const TRIAGE_OPS = new Set(["aiRefile", "aiAskRephrase"]);

function str(v, max = 200) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

function autoPair(a, b) {
  const fold = typoFoldMap([a, b]);
  const x = analyzeQuestion(a.question || "", "", fold);
  const y = analyzeQuestion(b.question || "", "", fold);
  return pairVerdict(x, y, questionSimilarity(x, y)).tier === "auto";
}

const has = (c, id) => (c.memberIds || []).map(String).includes(String(id));

/** Where a re-filed question should sit: its own group in the new area, or an open group it clearly belongs to. */
async function reassign(store, clusters, rec, theme, subtheme) {
  const own = clusters.find(c => has(c, rec.id));
  if (own && isLockedCluster(own)) return { error: "This question's group is already with a mentor. Re-file it from the Curation desk." };
  const moved = { ...rec, theme, subtheme };
  let next = clusters;
  if (own && (own.memberIds || []).length >= 2) {
    const byId = new Map([[String(rec.id), moved]]);
    for (const m of own.memberIds) if (!byId.has(String(m))) { const r = await store.get(K_Q + m); if (r) byId.set(String(m), r); }
    next = detachMember(clusters, own.id, rec.id, byId);
  } else if (own) {
    next = clusters.map(c => (c === own ? { ...c, theme, subtheme } : c));
  }
  let joined = null;
  const open = next.filter(c => c.theme === theme && (c.subtheme || "") === subtheme && !has(c, rec.id) && !isLockedCluster(c)
    && !clusterAnswerText(c) && (c.memberIds || []).length >= 1 && (c.memberIds || []).length < MERGE_DEFAULTS.maxPack);
  for (const c of open) {
    const members = await Promise.all(c.memberIds.map(m => store.get(K_Q + m)));
    if (members.some(m => !m)) continue;
    if (members.every(m => autoPair(moved, m))) { joined = c; break; }
  }
  if (joined) {
    next = next
      .filter(c => !((c.memberIds || []).length === 1 && has(c, rec.id)))
      .map(c => (c.id === joined.id ? { ...c, memberIds: [...c.memberIds.map(String), String(rec.id)], kind: "merged", cohesion: null, confidence: null, why: null } : c));
  }
  return { next, changed: Boolean(own || joined), joinedId: joined ? joined.id : "" };
}

async function persist(ctx, store, next, version) {
  try {
    return { saved: await ctx.persistClusters(store, sanitizeClusters(next).clusters, version) };
  } catch (err) {
    if (err instanceof ctx.ClustersVersionConflictError) { ctx.sendClustersConflict(err.currentVersion); return { conflict: true }; }
    throw err;
  }
}

function refileLog(rec, theme, subtheme, reviewer, now) {
  return [...(Array.isArray(rec.refiled) ? rec.refiled : []), { from: { theme: rec.theme || "", subtheme: rec.subtheme || "" }, to: { theme, subtheme }, at: now, by: reviewer }].slice(-5);
}

async function refile(store, msg, ctx) {
  const aiStore = await aiStoreFor(store);
  const d = await aiStore.getDraft(str(msg.id));
  if (!d) { ctx.send(404, { error: "That draft is no longer on the desk. Refresh the queue." }); return; }
  const a = d.aiDraft || {};
  if (REVIEWED.has(a.status)) { ctx.send(409, { error: "This draft was already approved.", code: "reviewed" }); return; }
  const tri = a.triage || {};
  const theme = str(msg.theme, 120) || tri.suggestedTheme || "";
  const subtheme = str(msg.subtheme, 120) || tri.suggestedSubtheme || "";
  if (!isValidPair(theme, subtheme)) { ctx.send(400, { error: "Pick a theme and sub-area from the Ask Desk list." }); return; }
  if (theme === d.theme && subtheme === d.subtheme) { ctx.send(400, { error: "It is already filed there." }); return; }
  const reviewer = str(msg.reviewer, 80) || "staff";
  const now = Date.now();
  const cfg = await aiStore.getConfig();
  const meta = await ctx.clustersMeta(store);
  const clusters = Array.isArray(meta.value) ? meta.value : [];
  let queued = null;
  let joinedGroup = null;
  let clustersVersion = meta.version;

  if (d.targetType === "question") {
    const rec = await store.get(K_Q + d.targetId);
    if (!rec || !rec.id) { ctx.send(404, { error: "That question is not on the desk." }); return; }
    if (String(rec.individualAnswer || "").trim()) { ctx.send(409, { error: "This question already has an answer.", code: "answered" }); return; }
    const plan = await reassign(store, clusters, rec, theme, subtheme);
    if (plan.error) { ctx.send(409, { error: plan.error, code: "locked" }); return; }
    let saved = null;
    if (plan.changed) {
      const p = await persist(ctx, store, plan.next, meta.version);
      if (p.conflict) return;
      saved = p.saved;
      clustersVersion = saved.version;
    }
    const next = { ...rec, refiled: refileLog(rec, theme, subtheme, reviewer, now), theme, subtheme };
    await store.set(K_Q + rec.id, next);
    if (plan.joinedId) {
      const group = ((saved && saved.clusters) || plan.next).find(c => String(c.id) === String(plan.joinedId));
      joinedGroup = group ? { id: group.id, size: (group.memberIds || []).length } : null;
      await aiStore.putDraft({ ...d, theme, subtheme, updatedAt: now, aiDraft: { ...a, status: "refiled", reviewer, reviewedAt: now, refiledInto: plan.joinedId } });
      if (cfg.enabled && group) queued = await enqueueCluster(store, group, { cfg, force: true, priority: 10, anyStream: true });
    } else {
      if (cfg.enabled) queued = await enqueueQuestion(store, next, { cfg, force: true, priority: 10, anyStream: true });
      await aiStore.putDraft({ ...d, theme, subtheme, updatedAt: now, regenerating: Boolean(queued && queued.queued), refiled: { from: { theme: d.theme, subtheme: d.subtheme }, at: now, by: reviewer } });
    }
  } else {
    const c = clusters.find(x => String(x.id) === String(d.targetId));
    if (!c) { ctx.send(404, { error: "That merged group no longer exists." }); return; }
    if (isLockedCluster(c) || clusterAnswerText(c)) { ctx.send(409, { error: "This group is already with a mentor or answered.", code: "locked" }); return; }
    const p = await persist(ctx, store, clusters.map(x => (x === c ? { ...x, theme, subtheme } : x)), meta.version);
    if (p.conflict) return;
    clustersVersion = p.saved.version;
    for (const mid of c.memberIds || []) {
      const rec = await store.get(K_Q + mid);
      if (rec) await store.set(K_Q + mid, { ...rec, refiled: refileLog(rec, theme, subtheme, reviewer, now), theme, subtheme });
    }
    const group = p.saved.clusters.find(x => String(x.id) === String(c.id));
    if (cfg.enabled && group) queued = await enqueueCluster(store, group, { cfg, force: true, priority: 10, anyStream: true });
    await aiStore.putDraft({ ...d, theme, subtheme, updatedAt: now, regenerating: Boolean(queued && queued.queued), refiled: { from: { theme: d.theme, subtheme: d.subtheme }, at: now, by: reviewer } });
  }
  if (queued && queued.queued) ctx.kickWorker();
  ctx.send(200, { ok: true, theme, subtheme, joinedGroup, queued: Boolean(queued && queued.queued), queueReason: queued ? queued.reason || "" : (cfg.enabled ? "" : "disabled"), clustersVersion });
}

async function askRephrase(store, msg, ctx, handleAiOp) {
  const aiStore = await aiStoreFor(store);
  const d = await aiStore.getDraft(str(msg.id));
  if (!d) { ctx.send(404, { error: "That draft is no longer on the desk. Refresh the queue." }); return; }
  const a = d.aiDraft || {};
  if (REVIEWED.has(a.status)) { ctx.send(409, { error: "This draft was already approved.", code: "reviewed" }); return; }
  if (d.targetType !== "question") { ctx.send(400, { error: "Ask to rephrase works on one student's question. For a group, use Edit then send." }); return; }
  let fields;
  if (str(msg.answer, 6000)) {
    fields = { answer: msg.answer, actions: msg.actions, mistake: msg.mistake, resources: msg.resources };
  } else if (a.triage && a.triage.category === "UNFOCUSED" && a.scripted && String(a.answer || "").trim()) {
    fields = { answer: a.answer, actions: a.actions, mistake: a.mistake, resources: a.resources };
  } else {
    const rec = (await store.get(K_Q + d.targetId)) || {};
    const lang = (a.triage && a.triage.lang) || detectLanguage(`${rec.question || d.question || ""}`);
    const r = scriptedReply({ category: "UNFOCUSED", lang }, { theme: rec.theme || d.theme, ticket: rec.ticket || d.ticket });
    fields = { answer: r.answer, actions: r.actions, mistake: r.mistake, resources: r.resources };
  }
  const reviewer = str(msg.reviewer, 80) || "staff";
  await aiStore.putDraft({ ...d, rephraseRequested: { at: Date.now(), by: reviewer } });
  await handleAiOp("aiEditApprove", { id: d.id, ...fields, mentorName: str(msg.mentorName, 120), reviewer }, store, ctx);
}

/**
 * @param {Function} handleAiOp  ops.js dispatcher (passed in to avoid an import cycle)
 */
export async function handleTriageOp(op, msg, store, ctx, handleAiOp) {
  if (op === "aiRefile") return refile(store, msg, ctx);
  if (op === "aiAskRephrase") return askRephrase(store, msg, ctx, handleAiOp);
  ctx.send(400, { error: "unknown op" });
}
