/**
 * Read-only structural summary of DISHA compare slots. Prints lengths and statuses only.
 * Never prints questions, answers, emails, or tokens.
 */
import { serviceHeaders, hasServiceToken, checkServiceAuth } from "../lib/staffAuth.mjs";

const BASE = "https://ayushmarg.vercel.app";
if (!hasServiceToken()) {
  console.error("NO_TOKEN");
  process.exit(1);
}

async function call(op, body = {}) {
  const r = await fetch(`${BASE}/api/aym-store`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...serviceHeaders() },
    body: JSON.stringify({ op, ...body }),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

const auth = await checkServiceAuth(async (op, b) => {
  const r = await call(op, b);
  return { status: r.status, body: r.data };
});
console.log(JSON.stringify({
  authOk: auth.ok,
  authStatus: auth.status,
  authError: auth.error ? String(auth.error).slice(0, 80) : "",
}));
if (!auth.ok) process.exit(1);

const cfg = await call("aiConfigGet");
const root = cfg.data || {};
const conf = root.config || {};
const sides = (root.compareProviders || []).map(s => ({
  side: s.side,
  draftModel: s.draftModel || "",
  configured: !!s.configured,
  gptConfigured: s.gptConfigured,
}));
console.log(JSON.stringify({
  cfgStatus: cfg.status,
  enabled: conf.enabled,
  compareMode: conf.compareMode,
  primary: conf.primary,
  providers: conf.providers,
  shadowMode: conf.shadowMode,
  gptConfigured: root.gptConfigured,
  gptOk: root.gpt && root.gpt.configured,
  sides,
  alertType: conf.alert && conf.alert.type || "",
}));

const q = await call("aiQueue", { status: "all", shadow: "all" });
const items = (q.data && q.data.items) || [];

function shape(v) {
  if (!v || typeof v !== "object") return null;
  return {
    keys: Object.keys(v).sort().join(","),
    status: v.status || "",
    provider: v.provider || "",
    model: v.model || "",
    code: v.code || "",
    ans: String(v.answer || "").trim().length,
    actions: Array.isArray(v.actions) ? v.actions.filter(a => String(a || "").trim()).length : 0,
    mistake: String(v.mistake || "").trim().length,
    err: v.error ? String(v.error).slice(0, 90) : "",
    blocked: v.blockedReason || "",
    drafter: v.drafter || "",
    fallback: v.draftFallback ? `${v.draftFallback.from}->${v.draftFallback.to}` : "",
    legacy: !!v.legacyGpt,
  };
}

const rows = items.map(it => {
  const d = it.aiDrafts || {};
  const a = it.aiDraft || {};
  return {
    top: a.status || "",
    drafter: a.drafter || "",
    provider: a.provider || "",
    model: a.model || "",
    topAns: String(a.answer || "").trim().length,
    keys: Object.keys(d).sort().join(","),
    h: shape(d.hybrid),
    g: shape(d.gemini),
    o: shape(d.openai),
    overflow: !!(it.overflow || it.quotaDeferred),
    regen: !!it.regenerating,
    jobOnly: it.job && it.job.only || "",
    jobSt: it.job && it.job.status || "",
    jobErr: it.job && it.job.error ? String(it.job.error).slice(0, 90) : "",
  };
});

const interesting = rows.filter(r => {
  const gLetter = r.g && r.g.ans > 0;
  const hLetter = (r.h && r.h.ans > 0) || (r.o && r.o.ans > 0) || (r.drafter === "hybrid" && r.topAns > 0);
  const hErr = r.h && (r.h.status === "error" || r.h.err);
  return gLetter && !hLetter && !hErr;
});

console.log(JSON.stringify({
  queueStatus: q.status,
  n: items.length,
  total: q.data && q.data.total,
  counts: q.data && q.data.counts,
  interesting: interesting.length,
  interestingRows: interesting.slice(0, 20),
  sample: rows.slice(0, 25),
}, null, 2));
