#!/usr/bin/env node
/**
 * DISHA compare mode (Hybrid = GPT draft + Gemini check, the primary, vs Gemini only) on a deploy:
 * turn it on / off, draft the missing side for drafts already on the desk, run the worker and print
 * counts and costs. Calls the staff ops on /api/aym-store with the service token
 * (`Authorization: Bearer`), like enable-pilot.
 *
 *   node scripts/ai/compare-drafts.mjs --status                         # read-only summary
 *   node scripts/ai/compare-drafts.mjs --enable                         # compareMode on (nothing else changes)
 *   node scripts/ai/compare-drafts.mjs --enable --backfill --limit=20 --runs=15
 *   node scripts/ai/compare-drafts.mjs --backfill --limit=20 --runs=15  # aiCompareBackfill, then K worker runs
 *   node scripts/ai/compare-drafts.mjs --disable                        # compareMode off (drafts are kept)
 *
 * Options: --base=https://ayushmarg.vercel.app (alias --url)  --limit=20  --runs=10  --no-run
 * Each worker run (staff `aiRunNow`, 45 s budget, ≤ 55 s of provider time) drafts about one question
 * per side; a Gemini-only side that runs out of time continues as its own job in the next run. Prints
 * counts and costs only — no question text, ids or names. The service token comes from
 * AYM_SERVICE_TOKEN, else STAFF_SERVICE_TOKEN in .env.local; it is never printed.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { serviceHeaders, hasServiceToken, checkServiceAuth, NO_TOKEN_HELP } from "../lib/staffAuth.mjs";

export const DEFAULT_BASE = "https://ayushmarg.vercel.app";
/** Gap between worker runs: staff runs only need the previous run's job locks released. */
export const RUN_GAP_MS = 4000;
/** Client wait for one `aiRunNow {wait}`: the server's run ends by ~55 s (maxDuration 60). */
export const RUN_TIMEOUT_MS = 70000;
const STOP_REASONS = new Set(["spend cap", "provider unavailable", "provider not configured", "disabled"]);
const SIDES = [["hybrid", "Hybrid"], ["gemini", "Gemini only"]];
/** Spend is booked per provider family (a Hybrid draft is GPT draft + Gemini check). */
const FAMILIES = [["openai", "GPT"], ["gemini", "Gemini"]];

const int = (v, d, min, max) => {
  const n = Number(v);
  return v === true || v === undefined || !Number.isFinite(n) ? d : Math.min(max, Math.max(min, Math.floor(n)));
};

/** `--k=v` / `--flag` → options. Unknown flags are an error so a typo never starts a live run. */
export function parseArgs(argv = []) {
  const known = new Set(["status", "enable", "disable", "backfill", "limit", "runs", "base", "url", "no-run", "help"]);
  const raw = {};
  const unknown = [];
  for (const a of argv) {
    if (!a.startsWith("--")) { unknown.push(a); continue; }
    const [k, ...rest] = a.slice(2).split("=");
    if (!known.has(k)) unknown.push(a);
    raw[k] = rest.length ? rest.join("=") : true;
  }
  const errors = unknown.length ? [`Unknown option${unknown.length === 1 ? "" : "s"}: ${unknown.join(" ")}`] : [];
  if (raw.enable && raw.disable) errors.push("Use --enable or --disable, not both.");
  if (raw.status && (raw.enable || raw.disable || raw.backfill)) errors.push("--status is read-only; run it on its own.");
  const help = Boolean(raw.help) || (!raw.status && !raw.enable && !raw.disable && !raw.backfill);
  return {
    help,
    status: Boolean(raw.status),
    enable: Boolean(raw.enable),
    disable: Boolean(raw.disable),
    backfill: Boolean(raw.backfill),
    limit: int(raw.limit, 20, 1, 200),
    runs: int(raw.runs, 10, 0, 60),
    noRun: Boolean(raw["no-run"]),
    base: String(raw.base && raw.base !== true ? raw.base : raw.url && raw.url !== true ? raw.url : DEFAULT_BASE).replace(/\/+$/, ""),
    errors,
  };
}

export const USAGE = "Usage: node scripts/ai/compare-drafts.mjs --status | --enable [--backfill] | --backfill [--limit=20] [--runs=10] [--no-run] | --disable  [--base=URL]";

/** Staff client: service token header + a cookie jar (same contract as enable-pilot). */
export function makeClient(base, { headers = serviceHeaders() } = {}) {
  const jar = new Map();
  const call = async (op, body = {}, { timeoutMs = 40000 } = {}) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(`${base}/api/aym-store`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers, ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}) },
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
      return { status: r.status, data: await r.json().catch(() => ({})) };
    } catch (err) {
      return { status: 0, data: { error: err.name === "AbortError" ? `timed out after ${timeoutMs / 1000}s` : String(err.message || err) } };
    } finally {
      clearTimeout(timer);
    }
  };
  return call;
}

const usd = v => `$${(Number(v) || 0).toFixed(3)}`;
const pct = x => (x == null ? "—" : `${Math.round(x * 100)}%`);
const kv = obj => Object.entries(obj || {}).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ") || "—";
const errText = r => String((r && r.data && r.data.error) || "").replace(/^\w+ \d{3}: /, "").slice(0, 160);

export function configLines(info) {
  const c = info.config || {};
  const by = (info.today && info.today.byProvider) || {};
  const sides = new Map((info.compareProviders || []).map(s => [s.side, s]));
  const steps = ((info.pipeline && info.pipeline.steps) || []).map(s => `${s.step} ${s.label}${s.model ? ` ${s.model}` : ""}${s.fallback ? ` (fallback ${s.fallback.model || s.fallback.label})` : ""}`);
  return [
    ["Config", `enabled=${Boolean(c.enabled)} primary=${c.primary || "hybrid"} compareMode=${Boolean(c.compareMode)} shadowMode=${c.shadowMode !== false} cap=$${c.dailySpendCapUSD} providers=[${(c.providers || []).join(", ")}]`],
    ...(steps.length ? [["Pipeline", steps.join(" · ")]] : []),
    ...SIDES.map(([id, label]) => {
      const s = sides.get(id) || {};
      return [`${label} models`, `${s.draftModel || "—"} · verify ${s.verifyModel || "—"} · ${s.configured ? "configured" : "NOT configured"}`];
    }),
    ["Spend today", `${usd(info.today && info.today.costUSD)} of $${c.dailySpendCapUSD} (${(info.today && info.today.calls) || 0} calls) · ${FAMILIES.map(([id, label]) => `${label} ${usd(by[id] && by[id].costUSD)}`).join(" · ")}`],
  ];
}

export function statsLines(compare) {
  const c = compare || {};
  const out = [["Compared", `${c.compared || 0} drafts with both sides · sent ${c.reviewed || 0} · rejected ${c.rejected || 0} · to mentor ${c.toMentor || 0}`]];
  for (const p of c.providers || []) {
    out.push([p.label || p.provider, `drafts ${p.drafts} · failed ${p.errors} · blocked ${p.blocked} · chosen ${p.chosen} (${pct(p.chosenRate)}; edited ${p.edited}, avg edit ${pct(p.avgEditRatio)}) · latency ${p.avgLatencyMs != null ? `${(p.avgLatencyMs / 1000).toFixed(1)} s` : "—"} · ${p.avgCostUSD != null ? `$${p.avgCostUSD.toFixed(4)}` : "—"}/draft · claims supported ${pct(p.supportRate)} · confidence ${pct(p.avgConfidence)}`]);
  }
  return out;
}

export function backfillLine(b) {
  const u = b.undrafted || {};
  return `eligible ${b.eligible} · would queue ${b.willEnqueue} (Hybrid side ${b.missingHybrid || 0}, Gemini-only side ${b.missingGemini || 0}) + ${u.willEnqueue || 0} undrafted · est ${usd(b.spend && b.spend.estimatedUSD)} · today ${usd(b.spend && b.spend.todayUSD)} of $${b.spend && b.spend.capUSD} · skipped {${kv(b.skipped)}}`;
}

/**
 * The whole flow against a signed-in staff client. `log(label, value)` receives counts / costs only.
 * Returns what happened (for tests): `{ ok, config, backfill, runs, stats }`.
 */
export async function runCompare(call, opts, { log = () => {}, gapMs = RUN_GAP_MS } = {}) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const result = { ok: true, config: null, backfill: null, runs: [], stats: null };
  const fail = (what, r) => { result.ok = false; log("✗ " + what, `HTTP ${r.status}${errText(r) ? `: ${errText(r)}` : ""}`); return result; };

  let info = await call("aiConfigGet");
  if (info.status !== 200) return fail("aiConfigGet", info);
  if (opts.enable || opts.disable) {
    const set = await call("aiConfigSet", { patch: { compareMode: Boolean(opts.enable) }, reviewer: "compare-drafts script" });
    if (set.status !== 200) return fail("aiConfigSet", set);
    info = set;
    log("Compare mode", opts.enable ? "ON — new DISHA jobs draft as Hybrid and as Gemini only (evaluation; turn off after review)" : "OFF — the primary drafts alone (existing compare drafts are kept)");
  }
  result.config = info.data.config || {};
  for (const [k, v] of configLines(info.data)) log(k, v);
  if (opts.enable && !result.config.enabled) log("!", "DISHA itself is off on this deploy — nothing is drafted until it is turned on (not changed here).");
  if (opts.enable && (info.data.compareProviders || []).some(s => s.side === "hybrid" && !s.configured)) log("!", "No AI provider key for the Hybrid side on this deploy — its drafts will fail.");

  if (opts.status || opts.backfill) {
    const dry = await call("aiCompareBackfill", { dryRun: true, limit: opts.limit });
    if (dry.status !== 200) return fail("aiCompareBackfill (dry run)", dry);
    log("Backfill preview", backfillLine(dry.data));
    result.backfill = { preview: dry.data };
    if (opts.backfill) {
      if (!result.config.compareMode) log("!", "compareMode is off — only questions with no draft are queued, as single (primary) drafts. Add --enable.");
      if (dry.data.willEnqueue || (dry.data.undrafted && dry.data.undrafted.willEnqueue)) {
        const real = await call("aiCompareBackfill", { limit: opts.limit });
        if (real.status !== 200) return fail("aiCompareBackfill", real);
        result.backfill.enqueued = real.data.enqueued || 0;
        log("Backfill", `queued ${real.data.enqueued || 0}${real.data.undrafted && real.data.undrafted.enqueued ? ` (incl. ${real.data.undrafted.enqueued} undrafted)` : ""}`);
      } else {
        result.backfill.enqueued = 0;
        log("Backfill", "nothing to queue");
      }
      if (!opts.noRun) {
        let errors = 0;
        for (let i = 1; i <= opts.runs; i++) {
          const r = await call("aiRunNow", { wait: true }, { timeoutMs: RUN_TIMEOUT_MS });
          if (r.status !== 200) {
            errors++;
            log(`Worker run ${i}`, `HTTP ${r.status} ${errText(r)}`);
            if (errors >= 2) { log("!", "Two worker runs failed in a row — stopping; the desk and the daily cron keep draining."); break; }
            await sleep(gapMs * 2);
            continue;
          }
          errors = 0;
          const rep = (r.data && r.data.report) || {};
          result.runs.push(rep);
          log(`Worker run ${i}`, `processed ${rep.processed || 0} · done ${rep.done || 0} · retried ${rep.retried || 0} · failed ${rep.failed || 0}${rep.followUps ? ` · one side continues next run ${rep.followUps}` : ""}${rep.deferred ? ` · deferred ${rep.deferred}` : ""} · ${usd(rep.spendUSD)} · ${rep.queued ?? "?"} due at start${rep.stopped ? ` · stopped: ${rep.stopped}` : ""}`);
          if (STOP_REASONS.has(rep.stopped)) break;
          if (!rep.processed && !(rep.queued > 0)) break;
          if (i < opts.runs) await sleep(gapMs);
        }
      }
    }
  }

  const stats = await call("aiCompareStats");
  if (stats.status !== 200) return fail("aiCompareStats", stats);
  result.stats = stats.data.compare || {};
  for (const [k, v] of statsLines(result.stats)) log(k, v);
  const today = stats.data.today || {};
  log("Spend today", `${usd(today.costUSD)} · ${FAMILIES.map(([id, label]) => `${label} ${usd(today.byProvider && today.byProvider[id] && today.byProvider[id].costUSD)}`).join(" · ")}`);
  return result;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.errors.length) { for (const e of opts.errors) console.error(`✗ ${e}`); console.error(USAGE); process.exit(2); }
  if (opts.help) { console.log(USAGE); return; }
  if (!hasServiceToken()) { console.error(NO_TOKEN_HELP); process.exit(1); }
  const call = makeClient(opts.base);
  const auth = await checkServiceAuth(async (op, b) => { const r = await call(op, b); return { status: r.status, body: r.data }; });
  if (!auth.ok) {
    console.error(`✗ Staff auth failed (HTTP ${auth.status}): ${auth.error}`);
    process.exit(1);
  }
  console.log(`Authenticated as staff (service token) on ${opts.base}.`);
  const r = await runCompare(call, opts, { log: (label, value) => console.log(`  ${String(label).padEnd(18)} ${value}`) });
  if (!r.ok) process.exitCode = 1;
  else if (opts.enable || opts.backfill) console.log("\nNext: open the staff desk → DISHA drafts. Each question shows the Hybrid and Gemini-only drafts side by side; approve one.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
