import crypto from "node:crypto";
import { ENV_FILES, parseEnvFile } from "./env.js";
import { createAymStore, K_Q, K_CLUSTERS, K_CONFIG, K_WAC_RESULTS, K_PODCASTS, ClustersVersionConflictError, WacVersionConflictError } from "./store.js";
import {
  regStart, regResend, regVerify, regMe, regSaveWac, regRecover, regUsers, K_USER, K_EMAIL, K_REGNO, isDemoDelegate,
  upsertDelegateIntoDb, backfillDelegatesFromQuestions, delegateCardsFromDb,
  validRegNo, publicProfile, wacOwnedByOtherEmail, ensureSessionIssuedRegNo, regnoIndexKey,
} from "./register.js";
import { appendCookie, readSessTicket, makeSessTicket, setSessCookie } from "./otpTicket.js";
import { sendSelectionEmail } from "./mailer.js";
import { notifyAnswerOnce, notifyNewlyPublishedClusters } from "./answerNotify.js";
import { knowledgeChatHandler } from "./knowledgeChat.js";
import { publicStats } from "./publicStats.js";

const COOKIE = "aym_staff";

function sha256(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

/** Authority PIN from .env.local first, then process.env. Never from the UI or store.json. */
function loadAdminPin() {
  for (const p of ENV_FILES) {
    const pin = (parseEnvFile(p).ADMIN_PIN || "").trim();
    if (pin) return pin;
  }
  if (process.env.ADMIN_PIN) return String(process.env.ADMIN_PIN).trim();
  return "";
}

function pinConfigured() {
  return loadAdminPin().length >= 4;
}

function cookieValue() {
  const pin = loadAdminPin();
  if (!pin) return "";
  return crypto.createHmac("sha256", sha256(pin)).update("aym-staff").digest("hex").slice(0, 40);
}

function parseCookie(req) {
  const raw = req.headers.cookie || "";
  const map = {};
  raw.split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i < 0) return;
    map[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return map;
}

function isStaff(req) {
  const expected = cookieValue();
  if (!expected) return false;
  return parseCookie(req)[COOKIE] === expected;
}

function pinMatches(entered) {
  const expected = loadAdminPin();
  if (!expected || expected.length < 4) return false;
  const a = Buffer.from(sha256(String(entered || "").trim()), "hex");
  const b = Buffer.from(sha256(expected), "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function cookieAttrs() {
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function applyCookies(res, cookies) {
  if (!cookies || !cookies.length) return;
  for (const c of cookies) {
    if (typeof res.appendHeader === "function") res.appendHeader("Set-Cookie", c);
    else {
      const prev = res.getHeader("Set-Cookie");
      if (!prev) res.setHeader("Set-Cookie", c);
      else res.setHeader("Set-Cookie", [].concat(prev, c));
    }
  }
}

function publishedClusters(clusters) {
  return (Array.isArray(clusters) ? clusters : [])
    .filter(c => c.status === "Published" && c.answer)
    .map(c => ({
      id: c.id, theme: c.theme, subtheme: c.subtheme, status: c.status,
      composite: c.composite, representative: c.representative,
      answer: c.answer, actions: c.actions, mistake: c.mistake,
      resources: c.resources, mentorName: c.mentorName,
      memberIds: c.memberIds || [],
    }));
}

function clusterOwnsQuestion(c, s) {
  const ids = (c.memberIds || []).map(x => String(x || "").trim()).filter(Boolean);
  if (!ids.length || !s) return false;
  const id = String(s.id || "").trim();
  const ticket = String(s.ticket || "").trim();
  return (id && ids.includes(id)) || (ticket && ids.includes(ticket));
}

function pickStoredAnswer(rec) {
  if (!rec || typeof rec !== "object") return "";
  return String(rec.individualAnswer || rec.answer || rec.mentorAnswer || rec.mergedAnswer || "").trim();
}

function clusterAnswerText(c) {
  if (!c || typeof c !== "object") return "";
  return String(c.answer || c.mergedAnswer || c.mentorAnswer || "").trim();
}

function clusterStatusFor(s, clusters) {
  const c = (clusters || []).find(x => clusterOwnsQuestion(x, s));
  if (!c) return null;
  const ready = Boolean(clusterAnswerText(c));
  return {
    id: c.id,
    memberIds: c.memberIds || [],
    status: c.status,
    kind: c.kind || ((c.memberIds || []).length >= 2 ? "merged" : "unique"),
    answer: ready ? clusterAnswerText(c) : "",
    composite: ready ? (c.composite || "") : "",
    representative: ready ? (c.representative || "") : "",
    actions: ready ? (c.actions || []) : [],
    mistake: ready ? (c.mistake || "") : "",
    resources: ready ? (c.resources || []) : [],
    mentorName: ready ? (c.mentorName || "") : "",
  };
}

function publicConfig() {
  return { hasPin: pinConfigured() };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const WAC_MAIL_BATCH = 6;
const WAC_MAIL_GAP_MS = 400;
const WAC_MAX_ROWS = 2000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STORE_BODY_TIMEOUT_MS = 30000;
const STORE_BODY_MAX_BYTES = 4 * 1024 * 1024;

function normalizeWacRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(r => {
    const selectedRaw = r && r.selected;
    const selected = selectedRaw === false || /^(no|n|0|false)$/i.test(String(selectedRaw ?? "").trim())
      ? false
      : true;
    return {
      name: String(r && r.name || "").trim().slice(0, 120),
      email: String(r && r.email || "").trim().slice(0, 160),
      institute: String(r && r.institute || "").trim().slice(0, 180),
      regNo: String(r && r.regNo || "").trim().slice(0, 24),
      selected,
    };
  }).filter(r => r.name || r.email || r.regNo).slice(0, WAC_MAX_ROWS);
}

function wacPayload(data, staff) {
  const rec = data && typeof data === "object" ? data : {};
  const published = Boolean(rec.published);
  const rows = Array.isArray(rec.rows) ? rec.rows : [];
  if (!staff && !published) {
    return { published: false };
  }
  const selected = rows.filter(r => r && r.selected !== false);
  return {
    published,
    filename: rec.filename || "",
    updatedAt: rec.updatedAt || 0,
    publishedAt: rec.publishedAt || null,
    version: rec.version || 1,
    count: selected.length,
    total: rows.length,
    rows: staff || published ? rows : [],
    mail: staff ? (rec.mail || null) : undefined,
  };
}

const PODCAST_MAX = 50;

function httpUrl(s, max = 600) {
  const u = String(s || "").trim();
  if (!/^https?:\/\//i.test(u)) return "";
  if (u.length > max) return "";
  return u;
}

function normalizeTalk(raw, i = 0) {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title || "").trim().slice(0, 160);
  const videoUrl = httpUrl(raw.videoUrl);
  if (!title || !videoUrl) return null;
  const id = String(raw.id || `talk-${Date.now().toString(36)}-${i}`).replace(/[^\w.-]/g, "").slice(0, 80)
    || `talk-${Date.now().toString(36)}-${i}`;
  const thumbnail = httpUrl(raw.thumbnail) || "";
  return {
    id,
    title,
    mentorName: String(raw.mentorName || "").trim().slice(0, 120),
    description: String(raw.description || "").trim().slice(0, 800),
    videoUrl,
    ...(thumbnail ? { thumbnail } : {}),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
  };
}

function normalizeTalks(list) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < (Array.isArray(list) ? list.length : 0); i++) {
    const talk = normalizeTalk(list[i], i);
    if (!talk || seen.has(talk.id)) continue;
    seen.add(talk.id);
    out.push(talk);
    if (out.length >= PODCAST_MAX) break;
  }
  return out;
}

function podcastPayload(rec) {
  const talks = normalizeTalks(rec && rec.talks);
  return { ok: true, talks, updatedAt: rec && rec.updatedAt ? rec.updatedAt : 0 };
}

async function persistPodcasts(store, writer) {
  const prev = (await store.get(K_PODCASTS)) || {};
  const rec = writer(prev && typeof prev === "object" ? prev : {}) || {};
  rec.talks = normalizeTalks(rec.talks);
  rec.updatedAt = Date.now();
  await store.set(K_PODCASTS, rec);
  return rec;
}

function backendInfo(store) {
  return {
    backend: store.name,
    firestore: store.name === "firestore",
    projectId: store.projectId || null,
  };
}

async function clustersMeta(store) {
  if (typeof store.getClustersMeta === "function") {
    return store.getClustersMeta();
  }
  const value = (await store.get(K_CLUSTERS)) || [];
  return { value: Array.isArray(value) ? value : [], version: 1, updatedAt: 0 };
}

async function persistClusters(store, clusters, expectedVersion) {
  if (typeof store.saveClusters === "function") {
    return store.saveClusters(clusters, expectedVersion);
  }
  await store.set(K_CLUSTERS, clusters);
  return { clusters, version: (expectedVersion || 1) + 1, updatedAt: Date.now() };
}

function sendClustersConflict(res, currentVersion) {
  send(res, 409, {
    error: "The curation desk was updated by another staff member. Reload to see their changes before saving again.",
    conflict: true,
    clustersVersion: currentVersion,
  });
}

function sendWacConflict(res, currentVersion) {
  send(res, 409, {
    error: "The WAC selection list was updated by another staff member. Reload before saving again.",
    conflict: true,
    wacVersion: currentVersion,
  });
}

async function loadKvChunk(store, keys) {
  const out = {};
  for (let i = 0; i < keys.length; i += 12) {
    const slice = keys.slice(i, i + 12);
    const vals = await Promise.all(slice.map(k => store.get(k)));
    slice.forEach((k, j) => { if (vals[j] != null) out[k] = vals[j]; });
  }
  return out;
}

async function buildStaffSnapshot(store) {
  if (typeof store.listQuestions !== "function") return null;

  const [questions, meta, userKeys, emailKeys, regnoKeys] = await Promise.all([
    store.listQuestions(),
    clustersMeta(store),
    store.list(K_USER),
    store.list(K_EMAIL),
    store.list(K_REGNO),
  ]);

  const delegateKeys = [...userKeys, ...emailKeys, ...regnoKeys];
  const db = await loadKvChunk(store, delegateKeys);
  questions.forEach(q => {
    if (q && q.id) db[K_Q + q.id] = q;
  });

  const patch = backfillDelegatesFromQuestions(db);
  if (patch && Object.keys(patch).length) {
    try {
      if (typeof store.merge === "function") await store.merge(patch);
      else {
        for (const [k, v] of Object.entries(patch)) await store.set(k, v);
      }
      Object.assign(db, patch);
    } catch (err) {
      console.error("[aym-store] delegate backfill persist failed:", err && err.message ? err.message : err);
    }
  }

  const filtered = questions.filter(s => s && s.id && !isDemoDelegate(s));
  filtered.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return {
    questions: filtered,
    users: delegateCardsFromDb(db),
    clusters: meta.value,
    clustersVersion: meta.version,
  };
}

async function persistWac(store, writer, expectedVersion) {
  if (typeof store.saveVersionedKv === "function") {
    return store.saveVersionedKv(K_WAC_RESULTS, writer, expectedVersion);
  }
  const prev = (await store.get(K_WAC_RESULTS)) || {};
  const currentVersion = prev.version || 1;
  if (expectedVersion != null && expectedVersion !== currentVersion) {
    throw new WacVersionConflictError(currentVersion);
  }
  const rec = writer(prev) || prev;
  rec.version = currentVersion + 1;
  await store.set(K_WAC_RESULTS, rec);
  return rec;
}

async function handleOp(req, res, msg, store) {
  const staff = isStaff(req);
  const { op, key, val, prefix, pin, query } = msg;

  if (op === "publicStats") {
    res.setHeader("Cache-Control", "no-store");
    send(res, 200, { ok: true, ...(await publicStats(store)) });
    return;
  }

  if (op === "ping" || op === "whoami") {
    send(res, 200, { ok: true, staff, hasPin: pinConfigured(), ...backendInfo(store) });
    return;
  }

  if (op === "login") {
    if (!pinConfigured()) {
      send(res, 503, { error: "Staff access is not configured." });
      return;
    }
    const entered = String(pin || "").trim();
    if (entered.length < 4) {
      send(res, 403, { error: "That code does not match." });
      return;
    }
    if (!pinMatches(entered)) {
      send(res, 403, { error: "That code does not match." });
      return;
    }
    appendCookie(res, `${COOKIE}=${cookieValue()}; ${cookieAttrs()}`);
    send(res, 200, { ok: true, staff: true, hasPin: true, ...backendInfo(store) });
    return;
  }

  if (op === "logout") {
    appendCookie(res, `${COOKIE}=; ${cookieAttrs()}; Max-Age=0`);
    send(res, 200, { ok: true, staff: false });
    return;
  }

  if (op === "regStart") {
    const r = await regStart(msg, store, req, res);
    send(res, r.code, r.body);
    return;
  }
  if (op === "regResend") {
    const r = await regResend(msg, store, req, res);
    send(res, r.code, r.body);
    return;
  }
  if (op === "regVerify") {
    const r = await regVerify(msg, store, req, res);
    send(res, r.code, r.body);
    return;
  }
  if (op === "regMe") {
    const r = await regMe(msg, store, req, res);
    send(res, r.code, r.body);
    return;
  }
  if (op === "regSaveWac") {
    const r = await regSaveWac(msg, store, req, res, { staff });
    send(res, r.code, r.body);
    return;
  }
  if (op === "regRecover") {
    const r = await regRecover(msg, store, req, res);
    send(res, r.code, r.body);
    return;
  }
  if (op === "regUsers") {
    if (!staff) { send(res, 403, { error: "staff only", users: [] }); return; }
    const r = await regUsers(store);
    send(res, r.code, r.body);
    return;
  }

  if (op === "staffSnapshot") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    try {
      const targeted = await buildStaffSnapshot(store);
      if (targeted) {
        send(res, 200, { ok: true, ...targeted, ...backendInfo(store) });
        return;
      }

      let db = typeof store.snapshot === "function" ? await store.snapshot() : null;
      if (!db || typeof db !== "object") {
        db = {};
        const keys = await store.list("");
        for (let i = 0; i < keys.length; i += 12) {
          const slice = keys.slice(i, i + 12);
          const chunk = await Promise.all(slice.map(k => store.get(k)));
          slice.forEach((k, j) => { db[k] = chunk[j]; });
        }
      }
      const patch = backfillDelegatesFromQuestions(db);
      if (patch && Object.keys(patch).length) {
        try {
          if (typeof store.merge === "function") await store.merge(patch);
          else {
            for (const [k, v] of Object.entries(patch)) await store.set(k, v);
          }
        } catch (err) {
          console.error("[aym-store] delegate backfill persist failed:", err && err.message ? err.message : err);
        }
      }
      const questions = Object.keys(db)
        .filter(k => k.startsWith(K_Q))
        .map(k => db[k])
        .filter(s => s && s.id && !isDemoDelegate(s));
      const users = delegateCardsFromDb(db);
      const meta = await clustersMeta(store);
      const clusters = Array.isArray(db[K_CLUSTERS]) ? db[K_CLUSTERS] : meta.value;
      questions.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      send(res, 200, {
        ok: true, questions, users, clusters, clustersVersion: meta.version, ...backendInfo(store),
      });
    } catch (err) {
      console.error("[aym-store] staffSnapshot failed:", err && err.message ? err.message : err);
      send(res, 500, { error: "Could not load the live desk. Refresh and try again." });
    }
    return;
  }

  if (op === "answerIndividual") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    const id = String(msg.id || "").trim();
    const answer = String(msg.answer || "").trim();
    if (!id || !answer) { send(res, 400, { error: "Write an answer before saving." }); return; }
    const rec = await store.get(K_Q + id);
    if (!rec || !rec.id) { send(res, 404, { error: "That question is not on the desk." }); return; }
    rec.individualAnswer = answer;
    rec.individualMentor = String(msg.mentorName || "").trim();
    rec.individualActions = Array.isArray(msg.actions) ? msg.actions.map(a => String(a || "").trim()).filter(Boolean).slice(0, 3) : [];
    rec.individualMistake = String(msg.mistake || "").trim();
    rec.individualResources = Array.isArray(msg.resources) ? msg.resources.map(a => String(a || "").trim()).filter(Boolean).slice(0, 2) : [];
    rec.individualAt = Date.now();
    await store.set(K_Q + id, rec);
    const notified = await notifyAnswerOnce(store, rec, { answer, mentorName: rec.individualMentor });
    send(res, 200, { ok: true, question: notified || rec });
    return;
  }

  if (op === "clustersSave") {
    if (!staff) { send(res, 403, { error: "staff only — sign in to merge questions." }); return; }
    const clusters = Array.isArray(msg.clusters) ? msg.clusters : null;
    if (!clusters) { send(res, 400, { error: "No merged groups to save." }); return; }
    const expectedVersion = msg.version != null ? Number(msg.version) : null;
    let prevClusters = null;
    try { prevClusters = (await clustersMeta(store)).value; }
    catch { prevClusters = null; }
    try {
      const saved = await persistClusters(store, clusters, expectedVersion);
      if (prevClusters) await notifyNewlyPublishedClusters(store, prevClusters, saved.clusters);
      send(res, 200, { ok: true, clusters: saved.clusters, clustersVersion: saved.version });
    } catch (err) {
      if (err instanceof ClustersVersionConflictError) {
        sendClustersConflict(res, err.currentVersion);
        return;
      }
      console.error("[aym-store] clustersSave failed:", err && err.message ? err.message : err);
      send(res, 500, { error: "Could not save merged groups. Try again." });
    }
    return;
  }

  if (op === "clustersMerge") {
    if (!staff) { send(res, 403, { error: "staff only — sign in to merge questions." }); return; }
    const ids = Array.isArray(msg.ids) ? msg.ids.map(String) : [];
    if (ids.length < 2) {
      send(res, 400, { error: "Select at least two groups, then Merge." });
      return;
    }
    let clusters = [];
    try { clusters = (await store.get(K_CLUSTERS)) || []; }
    catch { clusters = []; }
    if (!Array.isArray(clusters)) clusters = [];
    const idSet = new Set(ids);
    const chosen = clusters.filter(c => c && idSet.has(String(c.id)));
    if (chosen.length < 2) {
      send(res, 400, { error: "Those groups are no longer on the desk. Reload and try again." });
      return;
    }
    const rest = clusters.filter(c => c && !idSet.has(String(c.id)));
    const base = chosen[0];
    const memberIds = [...new Set(chosen.flatMap(c => Array.isArray(c.memberIds) ? c.memberIds : []))];
    const longest = chosen.reduce((a, c) =>
      String(c.representative || "").length > String(a.representative || "").length ? c : a, chosen[0]);
    const merged = {
      ...base,
      memberIds,
      representative: longest.representative || base.representative || "",
      variants: chosen.flatMap(c => c.variants || []).filter(Boolean).slice(0, 3),
      composite: chosen.map(c => c.composite).find(Boolean) || base.composite || "",
    };
    const next = [merged, ...rest].sort((a, b) =>
      ((b.memberIds || []).length - (a.memberIds || []).length));
    const expectedVersion = msg.version != null ? Number(msg.version) : null;
    try {
      const saved = await persistClusters(store, next, expectedVersion);
      send(res, 200, {
        ok: true, clusters: saved.clusters, mergedId: merged.id, clustersVersion: saved.version,
      });
    } catch (err) {
      if (err instanceof ClustersVersionConflictError) {
        sendClustersConflict(res, err.currentVersion);
        return;
      }
      console.error("[aym-store] clustersMerge failed:", err && err.message ? err.message : err);
      send(res, 500, { error: "Could not save the merge. Try again." });
    }
    return;
  }

  if (op === "lookup") {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) { send(res, 200, { hits: [] }); return; }
    // Ticket lookup is public; email lookup requires staff or a matching delegate session.
    if (needle.includes("@") && !staff) {
      let sessEmail = "";
      try {
        const sess = readSessTicket(req);
        sessEmail = String(sess && sess.profile && sess.profile.email || "").trim().toLowerCase();
      } catch { /* no session */ }
      if (!sessEmail || sessEmail !== needle) {
        send(res, 200, { hits: [] });
        return;
      }
    }
    const clusters = (await store.get(K_CLUSTERS)) || [];
    const hits = (await store.lookup(needle)).map(s => ({
      id: s.id, ticket: s.ticket, question: s.question,
      theme: s.theme, subtheme: s.subtheme, createdAt: s.createdAt,
      consentPublish: s.consentPublish || "",
      individualAnswer: pickStoredAnswer(s),
      individualMentor: s.individualMentor || s.mentorName || "",
      individualAt: s.individualAt || 0,
      individualActions: s.individualActions || [],
      individualMistake: s.individualMistake || "",
      individualResources: s.individualResources || [],
      cluster: clusterStatusFor(s, Array.isArray(clusters) ? clusters : []),
    }));
    send(res, 200, { hits });
    return;
  }

  if (op === "get") {
    if (key === K_CONFIG) { send(res, 200, { value: publicConfig() }); return; }
    if (key === K_CLUSTERS) {
      const cl = (await store.get(K_CLUSTERS)) || [];
      send(res, 200, { value: staff ? cl : publishedClusters(cl) });
      return;
    }
    if (!staff) {
      send(res, 403, { error: "staff only", value: null });
      return;
    }
    send(res, 200, { value: await store.get(key) });
    return;
  }

  if (op === "list") {
    if (!staff) {
      send(res, 403, { error: "staff only", keys: [] });
      return;
    }
    send(res, 200, { keys: await store.list(prefix || "") });
    return;
  }

  if (op === "stats") {
    if (!staff) {
      send(res, 403, { error: "staff only", value: null });
      return;
    }
    send(res, 200, { value: await store.stats() });
    return;
  }

  if (op === "set") {
    if (key === K_CONFIG) {
      send(res, 403, { error: "staff only" });
      return;
    }
    if (key === K_PODCASTS) {
      send(res, 400, { error: "Use podcastsSave to add talks." });
      return;
    }
    const isQuestion = String(key || "").startsWith(K_Q);
    if (!isQuestion && !staff) { send(res, 403, { error: "staff only" }); return; }
    if (isQuestion && !staff) {
      const existing = await store.get(key);
      if (existing) {
        // A retry of a question that already landed (e.g. after a gateway timeout) is a no-op success.
        if (val && existing.ticket && existing.ticket === val.ticket) {
          send(res, 200, { ok: true, duplicate: true });
          return;
        }
        send(res, 403, { error: "staff only" });
        return;
      }
    }
    if (isQuestion && val && typeof val === "object") {
      if (!val.id || !val.ticket || !val.question) {
        send(res, 400, { error: "invalid question" }); return;
      }
      let sess = null;
      try { sess = readSessTicket(req); } catch { sess = null; }
      const sessProfile = sess && sess.profile ? sess.profile : null;
      let issuedUser = null;
      if (!staff) {
        try {
          const issued = await ensureSessionIssuedRegNo(msg, store, req);
          issuedUser = issued && issued.user;
        } catch (err) {
          console.error("[aym-store] issue WAC for question failed:", err && err.message ? err.message : err);
          send(res, 500, { error: "Could not issue your WAC registration number. Try again." });
          return;
        }
      }
      const wac = staff
        ? (validRegNo(val.regNo) || validRegNo(val.delegateNo) || validRegNo(issuedUser && issuedUser.regNo) || validRegNo(sessProfile && sessProfile.regNo))
        : (validRegNo(issuedUser && issuedUser.regNo) || validRegNo(sessProfile && sessProfile.regNo));
      if (!staff && !wac) {
        send(res, 400, { error: "Register first — the hall issues your WAC registration number." });
        return;
      }
      val.regNo = wac || String(val.regNo || "").trim();
      val.delegateNo = val.regNo;
      const fields = {
        name: (issuedUser && issuedUser.name) || (sessProfile && sessProfile.name) || val.name,
        email: (issuedUser && issuedUser.email) || (sessProfile && sessProfile.email) || val.email,
        institute: (issuedUser && issuedUser.institute) || (sessProfile && sessProfile.institute) || val.institution,
        institution: val.institution,
        age: (issuedUser && issuedUser.age) || (sessProfile && sessProfile.age),
        sex: (issuedUser && issuedUser.sex) || (sessProfile && sessProfile.sex),
        regNo: val.regNo,
        delegateNo: val.regNo,
        createdAt: (issuedUser && issuedUser.createdAt) || (sessProfile && sessProfile.createdAt) || val.createdAt,
      };
      let savedUser = null;
      const writeQuestion = db => {
        if (wac && wacOwnedByOtherEmail(db, wac, fields.email)) {
          const err = new Error("That WAC registration number is already linked to a different AYURDISHA profile.");
          err.code = 409;
          throw err;
        }
        db[key] = val;
        savedUser = upsertDelegateIntoDb(db, fields);
        return db;
      };
      try {
        if (typeof store.transactKeys === "function") {
          const emailLower = String(fields.email || "").trim().toLowerCase();
          const rawReg = String(wac || "").trim();
          const keys = [
            emailLower && K_EMAIL + emailLower,
            regnoIndexKey(rawReg),
            rawReg && K_REGNO + rawReg,
            issuedUser && issuedUser.id && K_USER + issuedUser.id,
            sess && sess.userId && K_USER + sess.userId,
          ];
          const expand = db => Object.keys(db)
            .filter(k => k.startsWith(K_EMAIL) || k.startsWith(K_REGNO))
            .map(k => db[k] && db[k].userId ? K_USER + db[k].userId : "");
          await store.transactKeys(keys, writeQuestion, expand);
        } else if (typeof store.transact === "function") {
          await store.transact(writeQuestion);
        } else {
          const db = typeof store.snapshot === "function" ? (await store.snapshot()) || {} : {};
          if (wac && wacOwnedByOtherEmail(db, wac, fields.email)) {
            send(res, 409, { error: "That WAC registration number is already linked to a different AYURDISHA profile." });
            return;
          }
          await store.set(key, val);
          db[key] = val;
          savedUser = upsertDelegateIntoDb(db, fields);
          if (savedUser && typeof store.merge === "function") {
            const patch = { [K_USER + savedUser.id]: savedUser };
            if (savedUser.emailLower) patch[K_EMAIL + savedUser.emailLower] = { userId: savedUser.id };
            if (savedUser.regNo) {
              const rk = String(savedUser.regNo).trim().toUpperCase().replace(/[\s_\-/]+/g, "");
              if (rk) patch[K_REGNO + rk] = { userId: savedUser.id };
            }
            await store.merge(patch);
          }
        }
      } catch (err) {
        if (err && err.code === 409) {
          send(res, 409, { error: err.message || "That WAC registration number is already linked to a different AYURDISHA profile." });
          return;
        }
        console.error("[aym-store] question persist failed:", err && err.message ? err.message : err);
        send(res, 500, { error: "Could not save the question. Try again." });
        return;
      }
      if (sess && savedUser && res) {
        try {
          setSessCookie(res, makeSessTicket({
            token: sess.token,
            userId: sess.userId || savedUser.id,
            profile: publicProfile(savedUser),
          }));
        } catch { /* question is saved even if cookie refresh fails */ }
      }
      send(res, 200, { ok: true, profile: savedUser ? publicProfile(savedUser) : undefined });
      return;
    }
    await store.set(key, val);
    send(res, 200, { ok: true });
    return;
  }

  if (op === "del") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    await store.del(key);
    send(res, 200, { ok: true });
    return;
  }

  if (op === "podcastsList") {
    const rec = (await store.get(K_PODCASTS)) || {};
    send(res, 200, podcastPayload(rec));
    return;
  }

  if (op === "podcastsSave") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    try {
      const rec = await persistPodcasts(store, prev => {
        let talks = normalizeTalks(prev.talks);
        if (Array.isArray(msg.talks)) {
          talks = normalizeTalks(msg.talks);
        }
        if (msg.talk) {
          const added = normalizeTalk(msg.talk, talks.length);
          if (!added) {
            const err = new Error("Title and a https:// video URL are required.");
            err.code = 400;
            throw err;
          }
          talks = normalizeTalks([added, ...talks.filter(t => t.id !== added.id)]);
        }
        if (msg.removeId) {
          const rid = String(msg.removeId);
          talks = talks.filter(t => t.id !== rid);
        }
        return { ...prev, talks };
      });
      send(res, 200, podcastPayload(rec));
    } catch (err) {
      if (err && err.code === 400) {
        send(res, 400, { error: err.message });
        return;
      }
      console.error("[aym-store] podcastsSave failed:", err && err.message ? err.message : err);
      send(res, 500, { error: "Could not save the talk. Try again." });
    }
    return;
  }

  if (op === "wacResultsGet") {
    const rec = (await store.get(K_WAC_RESULTS)) || {};
    send(res, 200, { ok: true, ...wacPayload(rec, staff) });
    return;
  }

  if (op === "wacResultsSave") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    const rows = normalizeWacRows(msg.rows);
    if (!rows.length) {
      send(res, 400, { error: "No student rows to save. Check the Excel columns (name, email, institute, WAC registration number)." });
      return;
    }
    const expectedVersion = msg.version != null ? Number(msg.version) : null;
    try {
      const rec = await persistWac(store, prev => ({
        published: Boolean(prev.published),
        publishedAt: prev.publishedAt || null,
        filename: String(msg.filename || prev.filename || "selected-students.xlsx").slice(0, 180),
        updatedAt: Date.now(),
        rows,
        mail: prev.mail || null,
      }), expectedVersion);
      send(res, 200, { ok: true, ...wacPayload(rec, true) });
    } catch (err) {
      if (err instanceof WacVersionConflictError) {
        sendWacConflict(res, err.currentVersion);
        return;
      }
      console.error("[aym-store] wacResultsSave failed:", err && err.message ? err.message : err);
      send(res, 500, { error: "Could not save the selection list. Try again." });
    }
    return;
  }

  if (op === "wacResultsPublish") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    const expectedVersion = msg.version != null ? Number(msg.version) : null;
    const want = msg.published !== false;
    try {
      const rec = await persistWac(store, prev => {
        const rows = Array.isArray(prev.rows) ? prev.rows : [];
        if (want && !rows.length) {
          const err = new Error("Upload or load a selection list before publishing.");
          err.code = 400;
          throw err;
        }
        return {
          ...prev,
          rows,
          filename: prev.filename || "selected-students.xlsx",
          published: want,
          publishedAt: want ? Date.now() : null,
          updatedAt: Date.now(),
        };
      }, expectedVersion);
      send(res, 200, { ok: true, ...wacPayload(rec, true) });
    } catch (err) {
      if (err instanceof WacVersionConflictError) {
        sendWacConflict(res, err.currentVersion);
        return;
      }
      if (err.code === 400) {
        send(res, 400, { error: err.message });
        return;
      }
      console.error("[aym-store] wacResultsPublish failed:", err && err.message ? err.message : err);
      send(res, 500, { error: "Could not update publication. Try again." });
    }
    return;
  }

  if (op === "wacResultsMail") {
    if (!staff) { send(res, 403, { error: "staff only" }); return; }
    const prev = (await store.get(K_WAC_RESULTS)) || {};
    const rows = (Array.isArray(prev.rows) ? prev.rows : []).filter(r => r && r.selected !== false && EMAIL_RE.test(String(r.email || "").trim()));
    if (!rows.length) {
      send(res, 400, { error: "No selected students with an email address." });
      return;
    }
    const offset = Math.max(0, Number(msg.offset) || 0);
    const slice = rows.slice(offset, offset + WAC_MAIL_BATCH);
    let sent = 0;
    let failed = 0;
    const errors = [];
    let delivery = "email";
    for (const row of slice) {
      try {
        const r = await sendSelectionEmail(row);
        if (r && r.delivery === "console") delivery = "console";
        sent += 1;
      } catch (err) {
        failed += 1;
        errors.push({ email: row.email, error: String(err && err.message ? err.message : err).slice(0, 180) });
      }
      await sleep(WAC_MAIL_GAP_MS);
    }
    const nextOffset = offset + slice.length;
    const remaining = Math.max(0, rows.length - nextOffset);
    const mail = {
      lastAt: Date.now(),
      sent: (prev.mail && prev.mail.sent || 0) + sent,
      failed: (prev.mail && prev.mail.failed || 0) + failed,
      delivery,
    };
    try {
      await persistWac(store, prev => ({ ...prev, mail, updatedAt: Date.now() }), null);
    } catch { /* mail already went out */ }
    send(res, 200, {
      ok: true, sent, failed, remaining, nextOffset, total: rows.length, delivery, errors,
    });
    return;
  }

  send(res, 400, { error: "unknown op" });
}

const storePromise = createAymStore();

export function aymStoreHandler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, { error: "POST only" });
    return;
  }
  let body = "";
  let bytes = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    req.destroy();
    if (!res.writableEnded) send(res, 408, { error: "Request timed out. Try again with a smaller change." });
  }, STORE_BODY_TIMEOUT_MS);

  req.on("data", chunk => {
    if (timedOut) return;
    bytes += chunk.length;
    if (bytes > STORE_BODY_MAX_BYTES) {
      timedOut = true;
      req.destroy();
      if (!res.writableEnded) send(res, 413, { error: "Request too large." });
      return;
    }
    body += chunk;
  });
  req.on("end", () => {
    clearTimeout(timer);
    if (timedOut || res.writableEnded) return;
    let msg = {};
    try { msg = body ? JSON.parse(body) : {}; }
    catch { send(res, 400, { error: "invalid json" }); return; }

    storePromise
      .then(store => handleOp(req, res, msg, store))
      .catch(err => {
        console.error("[aym-store] request failed:", err);
        if (!res.writableEnded) send(res, 500, { error: "store failed" });
      });
  });
  req.on("error", () => {
    clearTimeout(timer);
    if (!res.writableEnded) send(res, 400, { error: "Could not read request body." });
  });
}

export function aymStorePlugin() {
  return {
    name: "aym-store",
    configureServer(server) {
      server.middlewares.use("/api/aym-store", aymStoreHandler);
      server.middlewares.use("/api/knowledge-chat", knowledgeChatHandler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/aym-store", aymStoreHandler);
      server.middlewares.use("/api/knowledge-chat", knowledgeChatHandler);
    },
  };
}
