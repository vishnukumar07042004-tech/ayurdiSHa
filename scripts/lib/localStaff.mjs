/**
 * Staff access for scripts that run the API in-process on a throwaway store (render checks, smokes).
 * `useLocalStaffSecrets()` sets random, test-only staff secrets in process.env — call it BEFORE the
 * server modules are imported — so the real ADMIN_PIN / service token in .env.local are never used.
 * `signInStaff()` then runs the real flow (passcode + email code) through the script's own client.
 */
import crypto from "node:crypto";

export const LOCAL_ADMIN = "owner@ayurdisha-qa.test";

export function useLocalStaffSecrets({ admin = LOCAL_ADMIN } = {}) {
  const passcode = `local-passphrase-${crypto.randomBytes(8).toString("hex")}`;
  const token = `local-svc-${crypto.randomBytes(24).toString("hex")}`;
  Object.assign(process.env, {
    ADMIN_PIN: passcode,
    STAFF_SERVICE_TOKEN: token,
    AYM_SERVICE_TOKEN: token,
    STAFF_ADMIN_EMAILS: admin,
    OTP_COOKIE_SECRET: `local-cookie-${crypto.randomBytes(12).toString("hex")}`,
    AYM_STAFF_DELAY_MS: "0",
  });
  return { passcode, token, admin };
}

/**
 * Passcode + email code → staff session cookie in the client's jar.
 * @param {(op: string, body?: object) => Promise<{ status: number, body: object }>} call
 * @param {{ passcode: string, email: string, otpFor: (email: string) => string | undefined }} opts
 * @returns {Promise<{ ok: boolean, status: string, error: string }>}
 */
export async function signInStaff(call, { passcode, email, otpFor }) {
  const start = await call("staffStart", { passcode, email });
  if (start.status !== 200) return { ok: false, status: "", error: `staffStart HTTP ${start.status}: ${String((start.body && start.body.error) || "").slice(0, 120)}` };
  const otp = otpFor(email.toLowerCase());
  if (!/^\d{6}$/.test(String(otp || ""))) return { ok: false, status: "", error: "staff code not captured from the console mail log" };
  const v = await call("staffVerify", { email, otp });
  if (v.status !== 200) return { ok: false, status: "", error: `staffVerify HTTP ${v.status}: ${String((v.body && v.body.error) || "").slice(0, 120)}` };
  return { ok: v.body.status === "approved", status: v.body.status, error: v.body.status === "approved" ? "" : `status ${v.body.status}` };
}
