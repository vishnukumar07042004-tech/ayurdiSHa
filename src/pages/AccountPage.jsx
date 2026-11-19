import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ShieldCheck, UserRound } from "lucide-react";
import { setPageMeta } from "../siteMeta.js";
import { displayPassId, WAC_DELEGATE_ID_LABEL, PASS_NUMBER_LABEL } from "../../shared/passId.js";
import { WAC_SHARE_FIELDS } from "../../shared/wacId.js";
import {
  accountKind, accountRoleLabel, accountDisplayName, accountInitials,
  maskPersonal, shareFieldDisplay, accountOwnEmail, isStaffKind, shouldDropHallPass,
  displayAskerName, displayAskerEmail,
} from "../../shared/account.js";
import "../styles/account.css";

function Row({ label, value, source, masked }) {
  const empty = value == null || String(value).trim() === "";
  return (
    <div className="acct-row">
      <dt>{label}</dt>
      <dd>
        {empty ? <span className="acct-empty">Not set</span> : (
          <span className={masked ? "acct-masked" : undefined}>{value}</span>
        )}
        {source && !empty ? <span className="acct-src">{source}</span> : null}
      </dd>
    </div>
  );
}

export default function AccountPage({
  profile,
  staffMe,
  staff,
  sessionToken,
  onGoRegister,
  onGoStaff,
  onStaffAccess,
  onSignOutDelegate,
  onSignOutStaff,
  onProfile,
  apiFn,
}) {
  const kind = accountKind({ staffMe, profile });
  const role = accountRoleLabel(kind);
  const staffKind = isStaffKind(kind);
  const name = accountDisplayName({ profile, staffMe, kind });
  const ownEmail = accountOwnEmail({ staffMe, kind });
  const emailRaw = ownEmail || (profile && profile.email) || "";
  const emailShown = ownEmail || maskPersonal("email", emailRaw);
  const initials = accountInitials(name, emailRaw);
  const showHallPass = Boolean(profile) && !shouldDropHallPass(staffMe, profile);
  const pass = displayPassId(profile || {});
  const token = sessionToken || "";

  const [share, setShare] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setPageMeta({
      title: "Account · AYURDISHA",
      description: "Your AYURDISHA profile — role, pass, and optional WAC delegate details.",
      path: "/account",
      robots: "noindex",
    });
  }, []);

  useEffect(() => {
    if (!token || !apiFn) return undefined;
    let live = true;
    apiFn("accountGet", { token }).then(r => { if (live) setShare(r); }).catch(() => {});
    return () => { live = false; };
  }, [token, apiFn]);

  async function setAllow(allow) {
    if (!token || !apiFn) return;
    setBusy(true);
    setErr("");
    try {
      const r = await apiFn("accountWacShare", { token, allow });
      setShare(r);
      if (r.profile && onProfile) onProfile(token, r.profile);
    } catch (e) {
      setErr(e.message || "Could not update sharing.");
    }
    setBusy(false);
  }

  const w = (profile && profile.wac) || {};
  const offer = share && share.wacOffer;
  const fields = (offer && offer.fields) || {};
  const consented = Boolean((share && share.wacShareConsent) || (profile && profile.wacShareConsent));

  return (
    <main className="acct" id="main">
      <p className="acct-kicker">AYURDISHA account</p>
      <h1>Personal info</h1>
      <p className="acct-lead">
        {staffKind
          ? "Your staff identity on this device."
          : "Details you use in the Meet the Mentors hall. Email and mobile stay masked on this page. WAC delegate fields are used only if you allow it."}
      </p>

      <section className="acct-hero" aria-label="Signed in as">
        <div className="acct-hero-avatar" aria-hidden="true">{kind === "visitor" ? <UserRound size={28} /> : initials}</div>
        <div>
          <h2>{kind === "visitor" ? "You're not signed in" : name}</h2>
          <p>{emailShown || (kind === "visitor" ? "Register or sign in to keep your seat on this device." : role)}</p>
          {kind !== "visitor" && <span className="acct-role-pill">{role}</span>}
        </div>
      </section>

      {kind === "visitor" && (
        <section className="acct-card acct-guest">
          <h2>Create or open your profile</h2>
          <p>
            After registration this page is your account: name, Delegate ID or pass number, and an option
            to use details from the official WAC list.
          </p>
          <div className="acct-actions">
            <button type="button" className="aym-btn aym-btn-gold" onClick={onGoRegister}>Register / WAC ID</button>
            <button type="button" className="aym-btn aym-btn-outline" onClick={onStaffAccess}>Staff access</button>
          </div>
        </section>
      )}

      {kind !== "visitor" && (staff || staffKind) && (
        <section className="acct-card">
          <h3>Staff</h3>
          <Row label="Role" value={role} source="Stays signed in on this device until you sign out, or the device is unused for 90 days." />
          <Row label="Email" value={ownEmail} source="Your staff sign-in on this device" />
          <div className="acct-share">
            <div className="acct-actions">
              {staff && <button type="button" className="aym-btn aym-btn-gold" onClick={onGoStaff}><ShieldCheck size={15} /> Staff portal</button>}
              {onSignOutStaff && <button type="button" className="aym-btn aym-btn-outline" onClick={onSignOutStaff}>Sign out of staff</button>}
            </div>
          </div>
        </section>
      )}

      {showHallPass && (
        <section className="acct-card">
          <h3>{staffKind ? "Hall pass · Delegate" : "AYURDISHA"}</h3>
          {staffKind && (
            <p className="acct-note">This is the hall / delegate record on this device — not your staff name.</p>
          )}
          <Row label="Name" value={displayAskerName(profile) || profile.name} source={staffKind ? "Delegate session on this device" : "You entered this"} />
          <Row label="Email" value={maskPersonal("email", displayAskerEmail(profile) || profile.email)} source="Verified · masked on this page" masked />
          <Row label={pass.kind === "wac" ? WAC_DELEGATE_ID_LABEL : PASS_NUMBER_LABEL} value={pass.id} />
          <Row label="Age" value={profile.age} source="You entered this — not on the WAC list" />
          <Row label="Sex" value={profile.sex} source="You entered this — not on the WAC list" />
          <Row label="Institute" value={profile.institute} source="You entered this" />
          <div className="acct-share">
            <div className="acct-actions">
              <Link to="/#ask" className="aym-btn aym-btn-gold">Ask Desk</Link>
              {onSignOutDelegate && (
                <button type="button" className="aym-btn aym-btn-outline" onClick={onSignOutDelegate}>Sign out of this device</button>
              )}
            </div>
          </div>
        </section>
      )}

      {showHallPass && (
        <section className="acct-card">
          <h3>World Ayurveda Congress</h3>
          {consented && (
            <>
              <Row label="Organisation" value={w.institution || fields.institution} source="WAC delegate list" />
              <Row label="Category" value={w.category || fields.category} source="WAC delegate list" />
              <Row label="Country" value={w.country || fields.country} source="WAC delegate list" />
              <Row label="State" value={w.state || fields.state} source="WAC delegate list" />
              <Row label="Email" value={shareFieldDisplay("email", fields.email)} source="WAC delegate list · masked" masked />
              <Row label="Mobile" value={shareFieldDisplay("phone", fields.phone)} source="WAC delegate list · masked" masked />
            </>
          )}
          <div className="acct-share">
            {share && share.wacShareAmbiguous && (
              <p>Your email matches more than one Delegate ID. Link the right ID from Register, then allow sharing here.</p>
            )}
            {!consented && offer && offer.available && offer.fields && !share.wacShareAmbiguous && (
              <>
                <p>{offer.consentText}</p>
                <ul className="acct-share-fields">
                  {WAC_SHARE_FIELDS.map(([k, label]) => (
                    <li key={k}><span>{label}</span><b className={(k === "email" || k === "phone") ? "acct-masked" : undefined}>{shareFieldDisplay(k, offer.fields[k])}</b></li>
                  ))}
                </ul>
              </>
            )}
            {offer && !offer.available && !share.wacShareAmbiguous && (
              <p>No WAC delegate record matches this email yet. If you registered on the WAC site with another inbox, sign in with your WAC Delegate ID.</p>
            )}
            {err && <p className="acct-note" role="alert">{err}</p>}
            <div className="acct-actions">
              {!consented && offer && offer.available && offer.fields && (
                <button type="button" className="aym-btn aym-btn-gold" disabled={busy} onClick={() => setAllow(true)}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                  Allow WAC details on this profile
                </button>
              )}
              {consented && (
                <button type="button" className="aym-btn aym-btn-outline" disabled={busy} onClick={() => setAllow(false)}>
                  Stop using WAC details
                </button>
              )}
            </div>
            <p className="acct-note">AYURDISHA does not change the WAC site. Payment, address and tracking fields from that export are never stored here. Age and sex stay as you entered them at AYURDISHA registration.</p>
          </div>
        </section>
      )}
    </main>
  );
}
