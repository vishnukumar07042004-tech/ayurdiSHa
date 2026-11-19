/**
 * Delegate / staff account page: own profile + optional use of the official WAC delegate list.
 * Age and sex are never taken from WAC (that export does not include them).
 */
import { sessionUser, publicProfile, K_USER } from "./register.js";
import { updateKey } from "./passIssuer.js";
import { delegateRepo } from "./wacDelegates.js";
import { linkUserToDelegate } from "./wacAutoLink.js";
import { maskEmail, maskPhone, normEmail, WAC_SHARE_CONSENT_TEXT } from "../shared/wacId.js";

function sharePreview(rec) {
  if (!rec) return { available: false };
  return {
    available: true,
    fields: {
      wacId: rec.wacId || "",
      name: rec.name || "",
      email: maskEmail(rec.email || rec.emailLower),
      institution: rec.institution || "",
      category: rec.category || "",
      country: rec.country || "",
      state: rec.state || "",
      phone: maskPhone(rec.phone),
    },
    notOnWacList: ["age", "sex"],
    consentText: WAC_SHARE_CONSENT_TEXT,
  };
}

async function recordsFor(store, user) {
  const email = normEmail(user && (user.emailLower || user.email));
  if (!email) return [];
  try {
    const repo = await delegateRepo(store);
    return (await repo.findByEmail(email)) || [];
  } catch {
    return [];
  }
}

function accountBody(user, records, extra = {}) {
  const consent = Boolean(user && user.wacShareConsent);
  const rec = records.length === 1 ? records[0] : (records.find(r => user && user.wacId && r.wacId === user.wacId) || null);
  return {
    ok: true,
    profile: publicProfile(user),
    wacShareConsent: consent,
    wacShareAmbiguous: records.length > 1 && !user.wacId,
    wacOffer: rec ? sharePreview(rec) : { available: records.length > 0, ambiguous: records.length > 1 },
    ...extra,
  };
}

export async function accountGet(msg, store, req) {
  const sess = await sessionUser(msg, store, req);
  if (!sess || !sess.user) return { code: 403, body: { error: "Sign in to see your profile.", code: "signed_out" } };
  const records = await recordsFor(store, sess.user);
  return { code: 200, body: accountBody(sess.user, records) };
}

export async function accountWacShare(msg, store, req, res) {
  const sess = await sessionUser(msg, store, req);
  if (!sess || !sess.user) return { code: 403, body: { error: "Sign in to change sharing.", code: "signed_out" } };
  const allow = msg && msg.allow === true;
  const now = Date.now();
  const records = await recordsFor(store, sess.user);
  const rec = records.length === 1
    ? records[0]
    : (records.find(r => sess.user.wacId && r.wacId === sess.user.wacId) || null);

  if (allow) {
    if (!rec) {
      return { code: 400, body: { error: records.length > 1
        ? "Your email matches more than one WAC Delegate ID. Link the right ID first."
        : "No WAC delegate record matches this email yet." } };
    }
    if (!sess.user.wacId) {
      const linked = await linkUserToDelegate(store, sess.user, rec, { now, via: "profile-share" });
      if (linked && linked.ok && linked.user) sess.user = linked.user;
    }
    const saved = await updateKey(store, K_USER + sess.user.id, cur => {
      if (!cur) return undefined;
      return {
        ...cur,
        wacShareConsent: true,
        wacShareConsentAt: now,
        wac: {
          category: rec.category || "",
          country: rec.country || "",
          state: rec.state || "",
          attendance: rec.attendance || "",
          institution: rec.institution || "",
        },
      };
    });
    const user = saved || sess.user;
    if (res) {
      try {
        const { setSessCookie, makeSessTicket } = await import("./otpTicket.js");
        setSessCookie(res, makeSessTicket({ token: sess.token, userId: user.id, profile: publicProfile(user) }));
      } catch { /* profile is saved */ }
    }
    return { code: 200, body: accountBody(user, records) };
  }

  const saved = await updateKey(store, K_USER + sess.user.id, cur => {
    if (!cur) return undefined;
    return { ...cur, wacShareConsent: false, wacShareRevokedAt: now };
  });
  const user = saved || { ...sess.user, wacShareConsent: false };
  return { code: 200, body: accountBody(user, records) };
}
