/**
 * Staff auth for scripts (docs/security/STAFF-ACCESS-SPEC.md §6): the service token, sent as
 * `Authorization: Bearer <token>`. Read from AYM_SERVICE_TOKEN, else STAFF_SERVICE_TOKEN in the
 * environment / .env.local / .env. Never printed — use `redactToken` on anything you log.
 * The staff passcode (ADMIN_PIN) no longer opens staff ops and is not read here.
 */
import { loadServerEnv } from "../../server/env.js";

export const MIN_TOKEN_LEN = 32;

export const NO_TOKEN_HELP =
  "No service token: set AYM_SERVICE_TOKEN (the server's STAFF_SERVICE_TOKEN, ≥ 32 chars) in the environment " +
  "or STAFF_SERVICE_TOKEN in .env.local. It is never printed.";

export function serviceToken() {
  const direct = String(process.env.AYM_SERVICE_TOKEN || "").trim();
  if (direct) return direct;
  return String(loadServerEnv().STAFF_SERVICE_TOKEN || "").trim();
}

export function hasServiceToken() {
  return serviceToken().length >= MIN_TOKEN_LEN;
}

export function serviceHeaders() {
  const t = serviceToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Replaces the token (if any) in text that is about to be printed. */
export function redactToken(text) {
  const t = serviceToken();
  const s = String(text == null ? "" : text);
  return t ? s.split(t).join("<service-token>") : s;
}

/**
 * Confirms the server accepts the token as admin. `call(op, body)` → `{ status, body }`.
 * @returns {Promise<{ ok: boolean, status: number, error: string }>}
 */
export async function checkServiceAuth(call) {
  if (!hasServiceToken()) return { ok: false, status: 0, error: NO_TOKEN_HELP };
  const r = await call("whoami", {});
  const body = (r && r.body) || {};
  if (r && r.status === 200 && body.staff === true && body.role === "admin") return { ok: true, status: 200, error: "" };
  const why = r && r.status === 200
    ? "the server did not accept the service token (check STAFF_SERVICE_TOKEN on the deploy)"
    : String(body.error || "no answer").slice(0, 160);
  return { ok: false, status: (r && r.status) || 0, error: redactToken(why) };
}

/** A minimal JSON client for `/api/aym-store` that sends the service token. */
export function serviceClient(base, { fetchImpl = fetch, timeoutMs = 60000, headers = serviceHeaders() } = {}) {
  return async function call(op, body = {}, url = "/api/aym-store") {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(`${base}${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ op, ...body }),
        signal: ctrl.signal,
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    } catch (err) {
      return { status: 0, body: { error: err && err.name === "AbortError" ? `timed out after ${timeoutMs / 1000}s` : "network error" } };
    } finally {
      clearTimeout(timer);
    }
  };
}
