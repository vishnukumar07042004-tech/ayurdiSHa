/**
 * Staff access UI (docs/security/STAFF-ACCESS-SPEC.md §3, §9): the 3-step entry dialog and its result
 * states, the "Signed in as …" bar + weak-passcode banner, the admin Access requests / Audit log
 * panels, and the labelled "Staff access" header / footer buttons with the pending badge.
 * Real components bundled with esbuild, rendered with react-dom/server (no network).
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, ".qa");
const entry = path.join(dir, `staff-ui-entry-${process.pid}.jsx`);
const outFile = path.join(dir, `staff-ui-${process.pid}.mjs`);
let mod;
let h;
let render;

before(async () => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(entry, [
    `export * from "../src/staff/StaffAccess.jsx";`,
    `export { default as AppHeader } from "../src/AppHeader.jsx";`,
    `export { default as AccountPage } from "../src/pages/AccountPage.jsx";`,
    `export { default as SiteFooter } from "../src/SiteFooter.jsx";`,
    `export { MemoryRouter } from "react-router-dom";`,
  ].join("\n"));
  await build({
    entryPoints: [entry], bundle: true, format: "esm", platform: "browser", outfile: outFile, logLevel: "silent",
    external: ["react", "react-dom", "react-dom/client", "react-dom/server", "react/jsx-runtime"],
    jsx: "automatic",
    loader: { ".css": "empty", ".png": "empty", ".jpg": "empty", ".webp": "empty", ".svg": "empty", ".avif": "empty" },
  });
  mod = await import(pathToFileURL(outFile).href);
  ({ createElement: h } = await import("react"));
  ({ renderToStaticMarkup: render } = await import("react-dom/server"));
});

after(() => {
  for (const f of [entry, outFile]) { try { fs.unlinkSync(f); } catch { /* gone */ } }
});

const noop = () => {};
const text = html => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const dialog = props => render(h(mod.StaffAccessDialog, { onClose: noop, onSignedIn: noop, ...props }));

test("entry dialog step 1: passcode field (password type), step indicator, no access granted by the passcode alone", () => {
  const html = dialog({});
  const t = text(html);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(t, /Staff access · Step 1 of 3/);
  assert.match(t, /Enter the staff passcode/);
  assert.match(html, /type="password"/);
  assert.match(html, /autoComplete="current-password"|autocomplete="current-password"/i);
  assert.match(t, /passcode alone does not open the staff area/);
  assert.match(t, /Continue/);
  assert.match(t, /Cancel/);
});

test("entry dialog steps 2 and 3: email then the 6-digit code", () => {
  const email = text(dialog({ initialStep: "email" }));
  assert.match(email, /Step 2 of 3/);
  assert.match(email, /Send code/);
  assert.match(email, /Back/);
  const codeHtml = dialog({ initialStep: "code", initialEmail: "co@staff-qa.test" });
  assert.match(text(codeHtml), /Step 3 of 3/);
  assert.match(text(codeHtml), /Enter the code we emailed you/);
  assert.match(codeHtml, /one-time-code/);
  assert.match(codeHtml, /inputMode="numeric"|inputmode="numeric"/i);
  assert.match(text(codeHtml), /Verify/);
});

test("result states: pending (check again / sign out), denied, revoked — none shows staff data", () => {
  const pending = text(dialog({ initialStatus: "pending", initialEmail: "co@staff-qa.test" }));
  assert.match(pending, /Waiting for admin approval/);
  assert.match(pending, /Check again/);
  assert.match(pending, /Sign out/);
  assert.match(pending, /Signed in as co@staff-qa\.test/);
  assert.match(pending, /no staff data until it is approved/);
  assert.match(text(dialog({ initialStatus: "denied" })), /Access was not approved/);
  assert.match(text(dialog({ initialStatus: "revoked" })), /Your staff access was revoked/);
  assert.match(text(dialog({ initialStatus: "signed-out" })), /Sign in again/);
  assert.ok(!/Check again/.test(text(dialog({ initialStatus: "denied" }))), "denied cannot re-request from the dialog");
});

test("identity bar: 'Signed in as <email> (Admin) · Sign out'; weak passcode banner only for the admin", () => {
  const admin = text(render(h(mod.StaffIdentityBar, { me: { staff: true, email: "owner@staff-qa.test", role: "admin", weakPasscode: true }, onSignOut: noop })));
  assert.match(admin, /Signed in as owner@staff-qa\.test \(Admin\)/);
  assert.match(admin, /Sign out/);
  assert.match(admin, /staff passcode is short/);
  assert.match(admin, /12\+ characters/);
  const strong = text(render(h(mod.StaffIdentityBar, { me: { staff: true, email: "owner@staff-qa.test", role: "admin", weakPasscode: false }, onSignOut: noop })));
  assert.ok(!/passcode is short/.test(strong));
  const co = text(render(h(mod.StaffIdentityBar, { me: { staff: true, email: "co@staff-qa.test", role: "co-admin", weakPasscode: true }, onSignOut: noop })));
  assert.match(co, /\(Co-admin\)/);
  assert.ok(!/passcode is short/.test(co), "co-admins never see the passcode banner");
  assert.equal(render(h(mod.StaffIdentityBar, { me: { staff: false, status: "pending" }, onSignOut: noop })), "");
});

test("Access requests panel: pending first with Approve / Deny; co-admins with Revoke; denied / revoked can be approved", () => {
  const initial = {
    ok: true, admins: ["owner@staff-qa.test"],
    pending: [{ email: "new@staff-qa.test", status: "pending", requestedAt: Date.UTC(2026, 10, 8, 10) }],
    approved: [{ email: "co@staff-qa.test", status: "approved", decidedAt: Date.UTC(2026, 10, 8, 11), decidedBy: "owner@staff-qa.test" }],
    denied: [{ email: "no@staff-qa.test", status: "denied", decidedAt: 1 }],
    revoked: [],
  };
  const html = render(h(mod.AccessRequestsPanel, { initial, apiFn: async () => initial }));
  const t = text(html);
  assert.match(t, /Access requests/);
  assert.match(t, /Waiting for approval 1/);
  assert.ok(t.indexOf("new@staff-qa.test") < t.indexOf("co@staff-qa.test"), "pending listed first");
  assert.match(t, /new@staff-qa\.test Requested .* Approve Deny/);
  assert.match(t, /co@staff-qa\.test .* by owner@staff-qa\.test Revoke/);
  assert.match(t, /no@staff-qa\.test .* Approve/);
  assert.match(t, /owner@staff-qa\.test\) is fixed/);
  assert.ok(!/Revoked/.test(t), "empty groups other than pending are hidden");
  const empty = text(render(h(mod.AccessRequestsPanel, { initial: { pending: [], approved: [], denied: [], revoked: [], admins: [] }, apiFn: noop })));
  assert.match(empty, /No pending requests/);
});

test("Audit log panel: entries newest first with who / role / action / target / result; filter + paging", () => {
  const initial = {
    entries: [
      { id: "2", at: 2, who: "owner@staff-qa.test", role: "admin", action: "access.approve", target: "co@staff-qa.test", ok: true },
      { id: "1", at: 1, who: "x@staff-qa.test", role: "", action: "passcode.fail", target: "x@staff-qa.test", ok: false },
    ],
    next: 1,
  };
  const html = render(h(mod.AuditLogPanel, { initial, apiFn: noop }));
  const t = text(html);
  assert.match(t, /Audit log/);
  assert.match(t, /owner@staff-qa\.test · Admin access\.approve co@staff-qa\.test OK/);
  assert.match(t, /passcode\.fail x@staff-qa\.test Refused/);
  assert.match(html, /<select/);
  assert.match(t, /Access decisions/);
  assert.match(t, /Load older entries/);
  assert.match(t, /never recorded/);
});

test("Retention panel: limits per record kind, save, preview and run cleanup", () => {
  const initial = { auditDays: 365, sessionDays: 45, otpRateDays: 2, wacRateDays: 2, probeDays: 7 };
  const html = render(h(mod.RetentionPanel, { initial, apiFn: noop }));
  const t = text(html);
  assert.match(t, /Data retention/);
  for (const label of ["Audit log", "Delegate session records", "Email-code rate records", "WAC-ID rate records", "Test-probe data"]) assert.ok(t.includes(label), label);
  assert.match(html, /value="365"/);
  assert.match(html, /min="30"/);
  assert.match(t, /Save limits/);
  assert.match(t, /Preview cleanup/);
  assert.match(t, /Run cleanup now/);
  assert.match(t, /Staff members and questions are never deleted/);
});

test("admin panels render for the admin only", () => {
  assert.equal(render(h(mod.StaffAdminPanels, { me: { staff: true, role: "co-admin" } })), "");
  assert.equal(render(h(mod.StaffAdminPanels, { me: { staff: false, role: "", status: "pending" } })), "");
  assert.match(text(render(h(mod.StaffAdminPanels, { me: { staff: true, role: "admin" }, apiFn: () => new Promise(noop) }))), /One-time review link .* Access requests .* Audit log .* Data retention/);
});

test("identity bar shows read-only review banner with expiry", () => {
  const html = text(render(h(mod.StaffIdentityBar, {
    me: { staff: true, role: "review", reviewOnly: true, expiresAt: Date.UTC(2026, 10, 17, 12, 30) },
    onSignOut: noop,
  })));
  assert.match(html, /one-time review/);
  assert.match(html, /Review session/);
  assert.match(html, /read-only/);
  assert.match(html, /expires/);
});

test("Review invite panel: create button and TTL choices", () => {
  const html = text(render(h(mod.ReviewInvitePanel, { apiFn: () => new Promise(noop) })));
  assert.match(html, /One-time review link/);
  assert.match(html, /Create one-time review link/);
  assert.match(html, /30 minutes/);
  assert.match(html, /45 minutes/);
  assert.match(html, /60 minutes/);
  assert.match(html, /No passcode in the link/);
});

test("header: labelled 'Staff access' button (no lock icon); signed-in admin sees 'Staff portal' + pending badge", () => {
  const header = props => render(h(mod.MemoryRouter, null, h(mod.AppHeader, { tab: "hall", onGoTab: noop, brandToIntro: noop, onOpenWelcome: noop, onStaffClick: noop, ...props })));
  const out = header({ staff: false });
  assert.match(out, /class="ed-staff-access"/);
  assert.match(text(out), /Staff access/);
  assert.ok(!/lucide-lock|lucide-unlock/.test(out), "no padlock icon");
  const signedIn = header({ staff: true, staffBadge: 3 });
  assert.match(text(signedIn), /Staff portal/);
  assert.match(signedIn, /class="ed-staff-badge"[^>]*>3</);
  assert.match(signedIn, /aria-label="Staff portal — 3 access requests waiting"/);
  assert.ok(!/ed-staff-badge/.test(header({ staff: true, staffBadge: 0 })));
  assert.ok(!/ed-staff-badge/.test(header({ staff: false, staffBadge: 4 })), "no badge for signed-out visitors");
});

test("header CTA is a Profile chip (not Meet a mentor); Meet Mentors stays in the primary row; roles mask email", () => {
  const header = props => render(h(mod.MemoryRouter, null, h(mod.AppHeader, { tab: "hall", onGoTab: noop, brandToIntro: noop, onOpenWelcome: noop, onStaffClick: noop, ...props })));
  const guest = text(header({ staff: false }));
  assert.match(guest, /Meet Mentors/);
  assert.match(guest, /Profile/);
  assert.match(guest, /Guest/);
  assert.ok(!/Meet a mentor/i.test(guest));
  assert.match(header({ staff: false }), /class="ed-account-chip"/);
  const adminHtml = header({ staff: true, staffMe: { staff: true, role: "admin", email: "owner@staff-qa.test" } });
  const admin = text(adminHtml);
  assert.match(admin, /Admin/);
  assert.ok(!/owner@staff-qa\.test/.test(admin), "Profile chip does not show the full staff email");
  const co = text(header({ staff: true, staffMe: { staff: true, role: "co-admin", email: "co@staff-qa.test" } }));
  assert.match(co, /Co-admin/);
  assert.ok(!/co@staff-qa\.test/.test(co));
  const del = text(header({ profile: { name: "Ananya Rao", email: "ananya.rao@gmail.com" } }));
  assert.match(del, /Delegate/);
  assert.match(del, /Ananya/);
  assert.ok(!/ananya\.rao@gmail\.com/.test(del));
  const leftover = header({
    staff: true,
    staffMe: { staff: true, role: "admin", email: "vishnukumar07042004@gmail.com" },
    profile: { name: "Harsh", email: "harsh@wac.test", wacId: "ZZQ1" },
  });
  const leftoverText = text(leftover);
  assert.match(leftoverText, /Vishnu/);
  assert.match(leftoverText, /Admin/);
  assert.ok(!/Harsh/.test(leftoverText), "leftover delegate name must not appear on the Profile chip");
  assert.ok(!/vishnukumar07042004@gmail\.com/.test(leftoverText), "chip does not show the full admin email");
  const dropped = text(header({ profile: { name: "Harsh", email: "harsh@wac.test", wacId: "ZZQ1" } }));
  assert.ok(!/Harsh/.test(dropped), "operator Harsh hall pass is not the Profile chip even before staff loads");
  assert.match(dropped, /Guest|Profile/);
});

test("account page hero uses staff identity when a leftover delegate session named Harsh is present", () => {
  const staffMe = { staff: true, role: "admin", email: "vishnukumar07042004@gmail.com" };
  const profile = { name: "Harsh", email: "harsh@wac.test", wacId: "ZZQ1" };
  const html = render(h(mod.MemoryRouter, null, h(mod.AccountPage, { staffMe, profile, staff: true })));
  const t = text(html);
  assert.match(html, /<h2>Vishnu Kumar<\/h2>/);
  assert.doesNotMatch(html, /<h2>Harsh<\/h2>/);
  assert.match(t, /Admin/);
  assert.match(t, /vishnukumar07042004@gmail\.com/);
  assert.ok(!/Hall pass · Delegate/.test(t), "leftover Harsh hall pass is not listed");
  assert.ok(!/Harsh/.test(t), "Harsh must not appear anywhere on the account page for this admin");
  assert.ok(!html.includes("harsh@wac.test"), "delegate email stays off the page");
  const visitorHtml = render(h(mod.MemoryRouter, null, h(mod.AccountPage, { profile })));
  const visitorText = text(visitorHtml);
  assert.ok(!/Harsh/.test(visitorText), "operator Harsh hall pass is not the account hero");
  assert.doesNotMatch(visitorHtml, /<h2>Harsh<\/h2>/);
  const other = render(h(mod.MemoryRouter, null, h(mod.AccountPage, {
    staffMe, staff: true, profile: { name: "Ananya Rao", email: "ananya.rao@gmail.com" },
  })));
  assert.match(text(other), /Hall pass · Delegate/);
  assert.match(text(other), /Ananya Rao/);
});

test("trusted device: a remembered staff email opens with a session check, never a flash of the passcode form", () => {
  const checking = dialog({ remembered: { email: "owner@staff-qa.test", trusted: true } });
  const t = text(checking);
  assert.match(t, /Opening the staff area/);
  assert.match(t, /Checking this device's sign-in for owner@staff-qa\.test/);
  assert.ok(!/type="password"/.test(checking), "no passcode field while the session is checked");
  assert.ok(!/Step 1 of 3/.test(t));
  const signedOut = dialog({ remembered: { email: "owner@staff-qa.test", trusted: false } });
  assert.match(text(signedOut), /Step 1 of 3/, "after Sign out the full flow starts again");
  const emailStep = dialog({ remembered: { email: "owner@staff-qa.test", trusted: false }, initialStep: "email" });
  assert.match(emailStep, /value="owner@staff-qa\.test"/, "the remembered email is filled in");
  assert.match(text(dialog({ remembered: null })), /Step 1 of 3/);
  assert.match(text(dialog({ remembered: { email: "co@staff-qa.test", trusted: true }, initialStatus: "pending" })), /Waiting for admin approval/);
});

test("identity bar: 'Sign out all my devices' on a trusted device (not for the service token)", () => {
  const me = { staff: true, email: "co@staff-qa.test", role: "co-admin", trustedDevice: true };
  assert.match(text(render(h(mod.StaffIdentityBar, { me, onSignOut: noop }))), /Sign out · Sign out all my devices/);
  const svc = text(render(h(mod.StaffIdentityBar, { me: { staff: true, service: true, role: "admin" }, onSignOut: noop })));
  assert.ok(!/all my devices/.test(svc));
});

test("Access requests panel: each co-admin's devices with last seen, 'Sign out this device' and 'Sign out all devices'", () => {
  const initial = {
    ok: true, admins: ["owner@staff-qa.test"], pending: [], denied: [], revoked: [],
    approved: [
      { email: "co@staff-qa.test", status: "approved", decidedAt: 1, decidedBy: "owner@staff-qa.test" },
      { email: "quiet@staff-qa.test", status: "approved", decidedAt: 1 },
    ],
  };
  const initialSessions = [
    { device: "d1", email: "co@staff-qa.test", browser: "Chrome on macOS", lastSeenAt: Date.UTC(2026, 10, 9, 8), createdAt: 1, current: false },
    { device: "d2", email: "co@staff-qa.test", browser: "Safari on iOS", lastSeenAt: Date.UTC(2026, 10, 8, 8), createdAt: 1, current: false },
  ];
  const t = text(render(h(mod.AccessRequestsPanel, { initial, initialSessions, apiFn: noop })));
  assert.match(t, /co@staff-qa\.test .* Revoke Chrome on macOS last seen .* Sign out this device Safari on iOS last seen .* Sign out this device Sign out all devices/i);
  assert.match(t, /quiet@staff-qa\.test .* Revoke Not signed in on any device/);
});

test("footer: 'Staff access' button", () => {
  const out = render(h(mod.MemoryRouter, null, h(mod.SiteFooter, { onStaff: noop })));
  assert.match(out, /class="ui-footer-staff"[^>]*>Staff access</);
});

test("the app no longer signs in with the passcode alone", () => {
  const app = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
  assert.ok(!/api\(\s*["']login["']/.test(app), "no `login` op from the browser");
  assert.ok(!/StaffPinModal/.test(app));
  assert.match(app, /StaffAccessDialog/);
});
