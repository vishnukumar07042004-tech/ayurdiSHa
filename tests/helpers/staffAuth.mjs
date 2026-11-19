/**
 * Staff auth for HTTP tests: a random per-run service token (never a real one), set in process.env
 * so the in-process server accepts it (`Authorization: Bearer …`). Import before making calls.
 */
import crypto from "node:crypto";

export const TEST_SERVICE_TOKEN = `test-svc-${crypto.randomBytes(24).toString("hex")}`;
process.env.STAFF_SERVICE_TOKEN = TEST_SERVICE_TOKEN;
// Scripts prefer AYM_SERVICE_TOKEN; pin it so a real token in the parent env cannot leak into local tests.
process.env.AYM_SERVICE_TOKEN = TEST_SERVICE_TOKEN;

export const serviceHeaders = () => ({ authorization: `Bearer ${TEST_SERVICE_TOKEN}` });

/** Env for a spawned script that should act as the service. */
export const serviceEnv = (extra = {}) => ({ ...process.env, AYM_SERVICE_TOKEN: TEST_SERVICE_TOKEN, ...extra });
