/**
 * Production test data markers. Probe delegates only ever use `aym-probe+<tag>@ayurdisha-qa.test`
 * (a reserved .test domain: mail to it is never sent). Their questions start with "[TEST]";
 * load-test questions start with "[TEST][LOAD]" and are never queued for DISHA drafting, so a load
 * test cannot spend the daily AI cap.
 */
export const PROBE_EMAIL_RE = /^aym-probe\+[a-z0-9-]{1,40}@ayurdisha-qa\.test$/;
export const TEST_MARK = "[TEST]";
export const LOAD_MARK = "[TEST][LOAD]";

export const isProbeEmail = email => PROBE_EMAIL_RE.test(String(email || "").trim().toLowerCase());

export const isProbeQuestion = q => Boolean(q && isProbeEmail(q.email) && String(q.question || "").trim().startsWith(TEST_MARK));

export const isLoadProbeQuestion = q => Boolean(q && isProbeEmail(q.email) && String(q.question || "").trim().startsWith(LOAD_MARK));

/** Reserved-for-testing domains (RFC 2606 / 6761): never deliverable, so never handed to a provider. */
export const isUndeliverableTestAddress = email => /@([a-z0-9-]+\.)*(test|example|invalid|localhost)$/i.test(String(email || "").trim());
