/**
 * Auto-link by verified email. An account whose email has passed an email code is linked to the
 * WAC delegate record carrying exactly that email (lower-case match):
 *
 *   one record, not linked elsewhere → link: wacId, wacVerified (by email code), wacLinkedAt; empty
 *                                      profile fields prefilled; the record marked linked
 *   several records for the email    → wacLinkPending (the delegate picks via "Link your Delegate
 *                                      ID", or staff resolve it); staff alert
 *   record linked to another account → nothing changes; staff alert
 *   no record                        → nothing changes
 *
 * Phones are never used: registration does not verify them (that needs an SMS code first).
 * Every path is idempotent. Runs after email verify, on regMe and in the staff backfill
 * (`wacAutoLinkAll`). Nothing here logs names, emails or IDs.
 */
import { updateKey, createKeyIfAbsent, bestEffort } from "./passIssuer.js";
import { K_USER, isDemoDelegate } from "./register.js";
import { K_Q } from "./store.js";
import {
  wacEnv, delegateRepo, markDelegateLinked, raiseWacAlert, K_WACLINK, K_WACDEL_META,
} from "./wacDelegates.js";
import { wacIdKey, normEmail, validEmail } from "../shared/wacId.js";

const META_TTL_MS = 60 * 1000;
const BACKFILL_PAGE = 200;
const BACKFILL_MAX_PAGE = 500;

let metaCache = null;
/** Import / clear call this so the next check sees the new list at once (on this instance). */
export function resetAutoLinkCache() { metaCache = null; }

/** When the delegate list last changed; 0 when there is no list. Cached briefly per instance. */
async function listStamp(store, now) {
  if (metaCache && metaCache.store === store && now - metaCache.at < META_TTL_MS) return metaCache.stamp;
  const r = await bestEffort(() => store.get(K_WACDEL_META), { ms: 1500, label: "wac list meta" });
  if (!r.ok) return 0;
  const meta = r.value;
  const stamp = meta && Number(meta.total) > 0
    ? Number(meta.updatedAt || (meta.lastImport && meta.lastImport.at) || 1)
    : 0;
  metaCache = { store, at: now, stamp };
  return stamp;
}

const blank = v => !String(v == null ? "" : v).trim();

/** Pure: what auto-link would do for `user` given the delegate records found for its email. */
export function planAutoLink(user, records) {
  if (!user || !user.id) return { action: "skipped" };
  if (user.wacId) return { action: "already" };
  const email = normEmail(user.emailLower || user.email);
  const mine = (records || []).filter(r => r && normEmail(r.emailLower || r.email) === email);
  if (!mine.length) return { action: "none" };
  if (mine.length > 1) return { action: "pending", count: mine.length };
  const rec = mine[0];
  if (rec.linked && rec.linkedUserId && rec.linkedUserId !== user.id) return { action: "conflict", record: rec };
  return { action: "link", record: rec };
}

/**
 * Link `user` to one delegate record. Shared by auto-link and the signed-in "Link your Delegate ID"
 * flow. One WAC ID → one account; an account keeps its first WAC ID. Resolves `{ ok, user }` or
 * `{ ok: false, reason }` (a staff alert is raised for refusals).
 */
export async function linkUserToDelegate(store, user, record, { now = Date.now(), via = "email-otp" } = {}) {
  const key = record.key || wacIdKey(record.wacId);
  const emailLower = normEmail(user.emailLower || user.email);
  const refuse = async reason => {
    await raiseWacAlert(store, { kind: reason, wacId: record.wacId, emailLower, now });
    return { ok: false, reason };
  };
  if (!key) return { ok: false, reason: "invalid" };
  if (user.wacId && wacIdKey(user.wacId) !== key) return refuse("account-has-other-wac-id");

  const linkKey = K_WACLINK + key;
  const created = await createKeyIfAbsent(store, linkKey, { userId: user.id, at: now });
  if (!created) {
    const cur = await store.get(linkKey).catch(() => null);
    if (!cur || cur.userId !== user.id) return refuse("wac-id-linked-elsewhere");
  }

  let clash = "";
  const saved = await updateKey(store, K_USER + user.id, cur => {
    // Only saved accounts are linked (a cookie-only session has no record to attach to).
    if (!cur) { clash = "no-account"; return undefined; }
    const base = cur;
    if (base.wacId && wacIdKey(base.wacId) !== key) { clash = "account-has-other-wac-id"; return undefined; }
    const next = {
      ...base,
      wacId: record.wacId,
      passLabel: record.wacId,
      wacVerified: true,
      wacVerifiedBy: base.wacVerifiedBy || via,
      wacLinkedAt: base.wacLinkedAt || now,
      wac: {
        category: record.category || "", country: record.country || "", state: record.state || "",
        attendance: record.attendance || "", institution: record.institution || "",
      },
    };
    if (blank(base.name) && record.name) next.name = record.name;
    if (blank(base.institute) && record.institution) next.institute = record.institution;
    delete next.wacLinkPending;
    return next;
  });
  if (clash) {
    if (created) await bestEffort(() => store.del(linkKey), { ms: 1500, label: "release wac link" });
    return clash === "no-account" ? { ok: false, reason: clash } : refuse(clash);
  }
  await bestEffort(() => markDelegateLinked(store, key, user.id), { ms: 2000, label: "wac mark linked" });
  return { ok: true, user: saved || user };
}

async function markChecked(store, user, { now, pending }) {
  const saved = await updateKey(store, K_USER + user.id, cur => {
    if (!cur || cur.wacId) return undefined;
    const next = { ...cur, wacAutoLinkAt: now };
    if (pending) next.wacLinkPending = true;
    else delete next.wacLinkPending;
    return next;
  });
  return saved || user;
}

/**
 * The verified-email link for one account. `{ status, user }` with status linked | pending |
 * conflict | none | already | skipped. A no-match is remembered until the list next changes, so
 * regMe on every page load costs one cached read, not a query.
 */
export async function autoLinkByEmail(store, user, { now = Date.now(), force = false } = {}) {
  if (!user || !user.id || user.probe) return { status: "skipped", user };
  if (user.wacId) return { status: "already", user };
  if (wacEnv().off) return { status: "skipped", user };
  const emailLower = normEmail(user.emailLower || user.email);
  if (!validEmail(emailLower)) return { status: "skipped", user };
  const stamp = await listStamp(store, now);
  if (!stamp) return { status: "none", user };
  if (!force && Number(user.wacAutoLinkAt) >= stamp) {
    return { status: user.wacLinkPending ? "pending" : "none", user };
  }

  // One alert per account per list version, however often regMe or the backfill runs.
  const firstLook = !(Number(user.wacAutoLinkAt) >= stamp);
  const repo = await delegateRepo(store);
  const plan = planAutoLink(user, await repo.findByEmail(emailLower));
  if (plan.action === "link") {
    const r = await linkUserToDelegate(store, user, plan.record, { now, via: "email-otp" });
    if (r.ok) {
      console.log("[aym-wac] auto-linked by verified email");
      return { status: "linked", user: r.user };
    }
    if (r.reason === "no-account") return { status: "skipped", user };
    return { status: "conflict", user: await markChecked(store, user, { now }) };
  }
  if (plan.action === "pending") {
    if (!user.wacLinkPending) {
      await raiseWacAlert(store, { kind: "email-matches-several-wac-ids", wacId: "", emailLower, now });
    }
    return { status: "pending", user: await markChecked(store, user, { now, pending: true }) };
  }
  if (plan.action === "conflict") {
    if (firstLook) await raiseWacAlert(store, { kind: "wac-id-linked-elsewhere", wacId: plan.record.wacId, emailLower, now });
    return { status: "conflict", user: await markChecked(store, user, { now }) };
  }
  return { status: "none", user: await markChecked(store, user, { now }) };
}

/** Best-effort wrapper for request paths: never slows a sign-in past `ms`, never throws. */
export async function autoLinkQuietly(store, user, { ms = 4000 } = {}) {
  const r = await bestEffort(async () => {
    const out = await autoLinkByEmail(store, user);
    if (out.status === "linked") {
      await bestEffort(() => stampQuestionsWithWacId(store, out.user), { ms: 2000, label: "wac stamp questions" });
    }
    return out;
  }, { ms, label: "wac auto-link" });
  return r.ok && r.value && r.value.user ? r.value.user : user;
}

/** Questions filed by a linked account that do not carry its WAC ID yet. */
async function questionsMissingWacId(store, user) {
  if (typeof store.lookup !== "function") return [];
  const email = normEmail(user.emailLower || user.email);
  if (!email) return [];
  const qs = await store.lookup(email);
  return (qs || []).filter(q => q && q.id && normEmail(q.email) === email && !q.wacId);
}

export async function stampQuestionsWithWacId(store, user, { dryRun = false } = {}) {
  if (!user || !user.wacId) return 0;
  const todo = await questionsMissingWacId(store, user);
  if (dryRun) return todo.length;
  for (const q of todo) await store.set(K_Q + q.id, { ...q, wacId: user.wacId });
  return todo.length;
}

function backfillUser(u) {
  return u && u.id && u.email && u.name && !u.probe && !isDemoDelegate(u);
}

/**
 * Staff backfill over existing accounts, one page per call (`cursor` → `next`). Dry run (default)
 * writes nothing and returns counts only; apply links, marks pending and stamps questions.
 */
export async function wacAutoLinkAll(store, { dryRun = true, cursor = 0, limit = BACKFILL_PAGE, now = Date.now() } = {}) {
  const keys = (await store.list(K_USER)).sort();
  const start = Math.max(0, Number(cursor) || 0);
  const size = Math.min(BACKFILL_MAX_PAGE, Math.max(1, Number(limit) || BACKFILL_PAGE));
  const page = keys.slice(start, start + size);
  const counts = {
    scanned: 0, linkable: 0, linked: 0, ambiguous: 0, conflicts: 0, alreadyLinked: 0, noMatch: 0,
    skipped: 0, questionsUpdated: 0,
  };
  const repo = await delegateRepo(store);

  for (let i = 0; i < page.length; i += 8) {
    const users = await Promise.all(page.slice(i, i + 8).map(k => store.get(k).catch(() => null)));
    for (const u of users) {
      if (!backfillUser(u)) { counts.skipped += 1; continue; }
      counts.scanned += 1;
      if (u.wacId) {
        counts.alreadyLinked += 1;
        counts.questionsUpdated += await stampQuestionsWithWacId(store, u, { dryRun });
        continue;
      }
      const emailLower = normEmail(u.emailLower || u.email);
      let plan = planAutoLink(u, await repo.findByEmail(emailLower));
      if (plan.action === "link") {
        const link = await store.get(K_WACLINK + (plan.record.key || wacIdKey(plan.record.wacId))).catch(() => null);
        if (link && link.userId && link.userId !== u.id) plan = { action: "conflict" };
      }
      if (plan.action === "none") { counts.noMatch += 1; continue; }
      if (plan.action === "pending") counts.ambiguous += 1;
      if (plan.action === "conflict") counts.conflicts += 1;
      if (plan.action !== "link") {
        if (!dryRun) await autoLinkByEmail(store, u, { now });
        continue;
      }
      counts.linkable += 1;
      if (dryRun) {
        counts.questionsUpdated += (await questionsMissingWacId(store, u)).length;
        continue;
      }
      const r = await autoLinkByEmail(store, u, { now, force: true });
      if (r.status === "linked") {
        counts.linked += 1;
        counts.questionsUpdated += await stampQuestionsWithWacId(store, r.user);
      } else if (r.status === "conflict") {
        counts.linkable -= 1;
        counts.conflicts += 1;
      }
    }
  }
  const next = start + size < keys.length ? start + size : null;
  console.log(`[aym-wac] auto-link ${dryRun ? "dry run" : "apply"}: ${counts.scanned} scanned, ${counts.linkable} linkable, ${counts.ambiguous} ambiguous, ${counts.conflicts} conflicts`);
  return { dryRun, counts, cursor: start, next, totalUsers: keys.length };
}
