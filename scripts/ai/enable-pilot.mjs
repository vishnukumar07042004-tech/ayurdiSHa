#!/usr/bin/env node
/**
 * Turn on the AI drafting pilot on a deploy, draft the questions that were asked before AI was on,
 * run the worker a few times and print what happened. Calls the staff ops on /api/aym-store with the
 * service token (`Authorization: Bearer`).
 *
 *   node scripts/ai/enable-pilot.mjs --status                 # read-only summary
 *   node scripts/ai/enable-pilot.mjs                          # enable pg-entrance + govt-jobs, shadow off, $10 cap, backfill 30, run worker
 *   node scripts/ai/enable-pilot.mjs --all-streams --cap=15 --limit=50 --runs=10
 *   node scripts/ai/enable-pilot.mjs --disable                # AI off (drafts and jobs are kept)
 *   node scripts/ai/enable-pilot.mjs --redraft-insufficient --runs=12   # redraft "insufficient source" drafts (mentor-assist); no config change
 *   node scripts/ai/enable-pilot.mjs --redraft-scripted --runs=12 --limit=50  # re-triage pending OFF_TOPIC/UNFOCUSED scripted drafts
 *
 * Options: --base=https://ayushmarg.vercel.app  --cap=10  --limit=30  --runs=8  --all-streams  --no-run
 * Each worker run (staff `aiRunNow`, 25 s budget) drafts about one question with the live model;
 * whatever is left drains when staff press "Process queue now" on the desk or the daily cron runs.
 * `--status` changes nothing (listing the queue may kick the worker for jobs already due, exactly
 * like opening the desk). The service token comes from AYM_SERVICE_TOKEN, else STAFF_SERVICE_TOKEN
 * in .env.local; it is never printed.
 */
import { serviceHeaders, hasServiceToken, checkServiceAuth, NO_TOKEN_HELP } from "../lib/staffAuth.mjs";

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...rest] = a.replace(/^--/, "").split("=");
  return [k, rest.length ? rest.join("=") : true];
}));
const BASE = String(args.base || "https://ayushmarg.vercel.app").replace(/\/$/, "");
const PILOT_STREAMS = ["pg-entrance", "govt-jobs"];
const num = (v, d) => (Number.isFinite(Number(v)) && v !== true ? Number(v) : d);
const CAP = num(args.cap, 10);
const LIMIT = Math.max(1, Math.floor(num(args.limit, 30)));
const RUNS = Math.max(0, Math.floor(num(args.runs, 8)));
/** Gap between worker runs: the desk kick and unauthenticated worker calls are throttled to ~1/min; staff runs only need the previous run's locks released. */
const RUN_GAP_MS = 4000;
const STOP_REASONS = new Set(["spend cap", "provider unavailable", "provider not configured", "disabled"]);

/** Staff worker runs until the queue is empty, a stop reason is hit, or RUNS is reached. */
async function runWorker() {
  let errors = 0;
  for (let i = 1; i <= RUNS; i++) {
    const r = await call("aiRunNow", { wait: true }, { timeoutMs: 45000 });
    if (r.status !== 200) {
      errors++;
      console.log(`Worker run ${i}: HTTP ${r.status} ${String(r.data && r.data.error || "").slice(0, 120)}`);
      if (errors >= 2) { console.log("Two worker runs failed in a row — stopping; the daily cron and the desk will keep draining."); break; }
      await sleep(RUN_GAP_MS * 2);
      continue;
    }
    errors = 0;
    const rep = r.data.report || {};
    console.log(`Worker run ${i}: processed ${rep.processed || 0} · done ${rep.done || 0} · skipped ${rep.skipped || 0} · retried ${rep.retried || 0} · failed ${rep.failed || 0} · ${usd(rep.spendUSD)} · ${rep.queued ?? "?"} due at start${rep.stopped ? ` · stopped: ${rep.stopped}` : ""}`);
    if (STOP_REASONS.has(rep.stopped)) break;
    if (!rep.processed && !(rep.queued > 0)) break;
    await sleep(RUN_GAP_MS);
  }
}

const AUTH = serviceHeaders();
const jar = new Map();
async function call(op, body = {}, { timeoutMs = 40000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}/api/aym-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH, ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}) },
      body: JSON.stringify({ op, ...body }),
      signal: ctrl.signal,
    });
    const cookies = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [r.headers.get("set-cookie")].filter(Boolean);
    for (const c of cookies) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      if (i < 0) continue;
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || attrs.some(a => /max-age=0/i.test(a))) jar.delete(k); else jar.set(k, v);
    }
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  } catch (err) {
    return { status: 0, data: { error: err.name === "AbortError" ? `timed out after ${timeoutMs / 1000}s` : String(err.message || err) } };
  } finally {
    clearTimeout(timer);
  }
}

function must(r, what) {
  if (r.status === 200) return r.data;
  console.error(`✗ ${what} failed (HTTP ${r.status}): ${String(r.data && r.data.error || "").slice(0, 200)}`);
  process.exitCode = 1;
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const usd = v => `$${(Number(v) || 0).toFixed(3)}`;
const line = (label, value) => console.log(`  ${label.padEnd(22)} ${value}`);
const kv = obj => Object.entries(obj || {}).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") || "—";

function configLine(info) {
  const c = info.config || {};
  const on = Object.entries(c.streams || {}).filter(([, v]) => v).map(([k]) => k);
  return `enabled=${c.enabled} shadowMode=${c.shadowMode !== false} cap=$${c.dailySpendCapUSD} streams=[${on.join(", ") || "none"}]`;
}

function backfillLine(b) {
  return `eligible ${b.eligible} (${b.eligibleStudents} students) · would queue ${b.willEnqueue} · est ${usd(b.spend && b.spend.estimatedUSD)} · byStream {${kv(b.byStream)}} · skipped {${kv(b.skipped)}}`;
}

async function summary(title) {
  const [info, stats, queue] = await Promise.all([call("aiConfigGet"), call("aiStats"), call("aiQueue", { status: "all", shadow: true })]);
  const cfg = must(info, "aiConfigGet");
  const st = must(stats, "aiStats");
  const q = must(queue, "aiQueue");
  if (!cfg || !st || !q) return;
  const items = q.items || [];
  const byStatus = {};
  const blocked = {};
  const triage = {};
  let shadowHidden = 0;
  let mentorAssist = 0;
  for (const it of items) {
    const a = it.aiDraft || {};
    byStatus[a.status || "pending"] = (byStatus[a.status || "pending"] || 0) + 1;
    if (a.mode === "mentor-assist" && a.status === "pending") mentorAssist++;
    if (a.status === "blocked") blocked[a.blockedReason || "unspecified"] = (blocked[a.blockedReason || "unspecified"] || 0) + 1;
    const cat = (a.triage && a.triage.category) || "untriaged";
    triage[cat] = (triage[cat] || 0) + 1;
    if (it.shadow && a.status === "pending") shadowHidden++;
  }
  const drafted = items.filter(it => it.aiDraft && it.aiDraft.status !== "blocked").length;
  console.log(`\n== ${title} — ${BASE}`);
  line("Config", configLine(cfg));
  line("Provider", `${(cfg.provider && cfg.provider.label) || "?"} ${(cfg.provider && cfg.provider.configured) ? "configured" : "NOT configured"} · KB ${(cfg.kb && cfg.kb.chunks) || 0} passages (${(cfg.kb && cfg.kb.source) || "none"})`);
  if (cfg.config && cfg.config.alert) line("Alert", `${cfg.config.alert.type}: ${String(cfg.config.alert.message || "").slice(0, 180)}`);
  line("Queue (jobs)", `queued ${st.stats.jobs.queued} · running ${st.stats.jobs.running} · done ${st.stats.jobs.done} · failed ${st.stats.jobs.failed}`);
  line("Desk", `waiting ${q.counts.pending} · shadow ${q.counts.shadow} · blocked ${q.counts.blocked} · answered elsewhere ${q.counts.superseded || 0}`);
  line("Drafts", `${items.length} total · drafted ${drafted} · by status {${kv(byStatus)}}${shadowHidden ? ` · ${shadowHidden} hidden by shadow mode` : ""}`);
  line("Insufficient source", String(blocked.insufficient_source || 0));
  line("Mentor-assist", `${mentorAssist} waiting ("Limited sources — mentor to complete")`);
  line("Blocked / medical", `medical ${blocked.medical || 0} · other blocked {${kv(Object.fromEntries(Object.entries(blocked).filter(([k]) => k !== "medical" && k !== "insufficient_source")))}}`);
  line("Triage categories", kv(triage));
  const failed = q.failed || [];
  line("Failures", failed.length ? `${failed.length}: ${failed.slice(0, 3).map(f => `${f.id} (${String(f.error || "").replace(/^\w+ \d{3}: /, "").slice(0, 90)})`).join("; ")}` : "none");
  const retrying = (q.working || []).filter(j => j.error);
  if (retrying.length) line("Waiting to retry", `${retrying.length}: ${String(retrying[0].error).slice(0, 120)}`);
  line("Spend today", `${usd(st.stats.spend.todayUSD)} of $${st.stats.spend.capUSD} cap (${st.stats.spend.todayCalls} calls) · month ${usd(st.stats.spend.monthUSD)}`);
  if (st.stats.approvalRate != null) line("Approval rate", `${Math.round(st.stats.approvalRate * 100)}% of ${st.stats.reviewed} reviewed`);
}

/* ---------------------------------------------------------------- main */

if (!hasServiceToken()) {
  console.error(NO_TOKEN_HELP);
  process.exit(1);
}
const auth = await checkServiceAuth(async (op, b) => { const r = await call(op, b); return { status: r.status, body: r.data }; });
if (!auth.ok) {
  console.error(`✗ Staff auth failed (HTTP ${auth.status}): ${auth.error}`);
  process.exit(1);
}
console.log(`Authenticated as staff (service token) on ${BASE}.`);

try {
  if (args.status) {
    await summary("Status (read-only)");
    const pending = await call("aiBackfill", { dryRun: true });
    const all = await call("aiBackfill", { dryRun: true, allStreams: true });
    if (pending.status === 200) line("Backfill (on streams)", backfillLine(pending.data));
    else line("Backfill", `not available on this deploy (HTTP ${pending.status})`);
    if (all.status === 200) line("Backfill (all streams)", backfillLine(all.data));
    const redraft = await call("aiBackfill", { dryRun: true, redraftInsufficient: true });
    if (redraft.status === 200 && redraft.data.mode === "redraft-insufficient") line("Redraft insufficient", backfillLine(redraft.data));
    const scripted = await call("aiBackfill", { dryRun: true, redraftScripted: true });
    if (scripted.status === 200 && scripted.data.mode === "redraft-scripted") line("Redraft scripted", backfillLine(scripted.data));
  } else if (args["redraft-scripted"]) {
    const before = must(await call("aiConfigGet"), "aiConfigGet");
    if (!before) throw new Error("stop");
    console.log(`Config: ${configLine(before)}`);
    if (!before.config || !before.config.enabled) {
      console.error("✗ AI drafting is off on this deploy — run the enable command first (no config is changed here).");
      throw new Error("stop");
    }
    const dry = await call("aiBackfill", { dryRun: true, redraftScripted: true, limit: LIMIT });
    if (dry.status !== 200 || dry.data.mode !== "redraft-scripted") {
      console.error(`✗ This deploy does not support redraftScripted yet (HTTP ${dry.status}) — deploy the skill-learning build first.`);
      throw new Error("stop");
    }
    console.log(`Redraft scripted preview: ${backfillLine(dry.data)}`);
    if (dry.data.willEnqueue) {
      const real = await call("aiBackfill", { redraftScripted: true, limit: LIMIT });
      if (real.status === 200) console.log(`Redraft scripted: queued ${real.data.enqueued} (${(real.data.enqueuedIds || []).slice(0, 10).join(", ")}${real.data.enqueued > 10 ? ", …" : ""})`);
      else console.log(`Redraft not queued (HTTP ${real.status}): ${String(real.data && real.data.error || "").slice(0, 200)}`);
    }
    if (!args["no-run"]) await runWorker();
    await summary("Redraft scripted summary");
    console.log("\nNext: open the staff desk → AI drafts. Genuine skill asks should now show step-by-step drafts with learning links — not Off-topic declines.");
  } else if (args["redraft-insufficient"]) {
    const before = must(await call("aiConfigGet"), "aiConfigGet");
    if (!before) throw new Error("stop");
    console.log(`Config: ${configLine(before)}`);
    if (!before.config || !before.config.enabled) {
      console.error("✗ AI drafting is off on this deploy — run the enable command first (no config is changed here).");
      throw new Error("stop");
    }
    if (args.cap !== undefined && Number(args.cap) !== before.config.dailySpendCapUSD) {
      const set = must(await call("aiConfigSet", { patch: { dailySpendCapUSD: CAP }, reviewer: "enable-pilot script" }), "aiConfigSet");
      if (set) console.log(`Spend cap set: ${configLine(set)}`);
    }
    const dry = await call("aiBackfill", { dryRun: true, redraftInsufficient: true, limit: LIMIT });
    if (dry.status !== 200 || dry.data.mode !== "redraft-insufficient") {
      console.error(`✗ This deploy does not support redraftInsufficient yet (HTTP ${dry.status}) — deploy the mentor-assist build first.`);
      throw new Error("stop");
    }
    console.log(`Redraft preview: ${backfillLine(dry.data)}`);
    if (dry.data.willEnqueue) {
      const real = await call("aiBackfill", { redraftInsufficient: true, limit: LIMIT });
      if (real.status === 200) console.log(`Redraft: queued ${real.data.enqueued} (${(real.data.enqueuedIds || []).slice(0, 10).join(", ")}${real.data.enqueued > 10 ? ", …" : ""})`);
      else console.log(`Redraft not queued (HTTP ${real.status}): ${String(real.data && real.data.error || "").slice(0, 200)}`);
    }
    if (!args["no-run"]) await runWorker();
    await summary("Redraft summary");
    console.log("\nNext: open the staff desk → AI drafts → filter \"Limited sources\". Add the specific facts from official sources, then Edit then send.");
  } else if (args.disable) {
    const r = must(await call("aiConfigSet", { patch: { enabled: false }, reviewer: "enable-pilot script" }), "aiConfigSet");
    if (r) console.log(`AI drafting turned OFF. ${configLine(r)}. Drafts, jobs and approved answers are kept.`);
    await summary("After disable");
  } else {
    const before = must(await call("aiConfigGet"), "aiConfigGet");
    if (!before) throw new Error("stop");
    console.log(`Before: ${configLine(before)}`);
    const streamIds = args["all-streams"] ? (before.streams || []).map(s => s.id) : PILOT_STREAMS;
    const patch = {
      enabled: true,
      shadowMode: false,
      dailySpendCapUSD: CAP,
      streams: Object.fromEntries(streamIds.map(id => [id, true])),
    };
    const set = must(await call("aiConfigSet", { patch, reviewer: "enable-pilot script" }), "aiConfigSet");
    if (!set) throw new Error("stop");
    console.log(`After:  ${configLine(set)}${set.promoted ? ` · ${set.promoted} shadow drafts moved into the review queue` : ""}`);
    if (set.provider && !set.provider.configured) console.log("! The provider is not configured on this deploy — jobs will wait in the queue.");

    const dry = await call("aiBackfill", { dryRun: true, limit: LIMIT });
    const preview = must(dry, "aiBackfill (dry run)");
    if (!preview) throw new Error("stop");
    console.log(`Backfill preview: ${backfillLine(preview)}`);
    if (preview.willEnqueue) {
      const real = await call("aiBackfill", { limit: LIMIT });
      if (real.status === 200) console.log(`Backfill: queued ${real.data.enqueued} (${(real.data.enqueuedIds || []).slice(0, 10).join(", ")}${real.data.enqueued > 10 ? ", …" : ""})`);
      else console.log(`Backfill not queued (HTTP ${real.status}): ${String(real.data && real.data.error || "").slice(0, 200)}`);
    }

    if (!args["no-run"]) await runWorker();
    await summary("Pilot summary");
    console.log("\nNext: open the staff desk → AI drafts, review and approve. Students see an answer on Track only after approval.");
  }
} catch (err) {
  if (String(err && err.message) !== "stop") console.error(`✗ ${String(err && err.message || err).slice(0, 200)}`);
  process.exitCode = 1;
}
