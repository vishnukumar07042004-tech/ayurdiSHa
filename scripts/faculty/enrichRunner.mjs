/**
 * Concurrent, spend-capped, crash-safe driver for faculty-row enrichment (no network of its own:
 * the provider objects are passed in). `enrich.mjs` wires it to the real providers; tests use a
 * mock provider and temp files.
 *
 * - Bounded worker pool over entries; with several providers (`--both`) the sides of one entry run
 *   in parallel, each provider behind its own gate of `concurrency` in-flight calls.
 * - 429 / 5xx → exponential backoff with jitter (Retry-After honoured); repeated 429s halve that
 *   provider's gate, a long run of successes grows it back by one up to the start value.
 * - One writer: every result is merged onto the latest bank object (sides of the same entry never
 *   overwrite each other) and persisted with an atomic write (`<file>.tmp` + rename) every
 *   `saveEvery` completed entries and at the end.
 * - Global spend cap: checked before every call (spent + in-flight estimate + next call); once
 *   reached no new call starts, in-flight calls finish.
 */

import nodeFs from "node:fs";
import path from "node:path";
import { alreadyEnriched, applyEnrichment, enrichRepairMessages } from "./enrichLib.mjs";
import { normalizeUsage, providerFamily } from "../../server/ai/usage.js";

export const MAX_CONCURRENCY = 8;
export const DEFAULT_CONCURRENCY = 4;

/**
 * GPT-5.x / 6.x reasoning tokens count against max_output_tokens; at the default 3000 + 2048 the
 * enrichment JSON (answer, citations, 8–10 paraphrases incl. Devanagari) was often cut off or empty.
 * Low effort and 4000 visible + 3000 reasoning; the provider retries a short reply once (lower
 * effort, doubled cap).
 */
export const OPENAI_ENRICH_ARGS = Object.freeze({ openai: Object.freeze({ thinking: "low", maxTokens: 4000, reasoningHeadroom: 3000 }) });

/** `--concurrency` value → integer in 1..8 (default 4). */
export function parseConcurrency(v) {
  const n = Math.floor(Number(v));
  if (v === undefined || v === true || !Number.isFinite(n)) return DEFAULT_CONCURRENCY;
  return Math.min(MAX_CONCURRENCY, Math.max(1, n));
}

/** Write `data` to `<file>.tmp`, fsync, then rename over `file`: readers see the old or the new file, never half of one. */
export function writeFileAtomic(file, data, { fs = nodeFs } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
  return file;
}

export function writeJsonAtomic(file, obj, opts) {
  return writeFileAtomic(file, `${JSON.stringify(obj, null, 1)}\n`, opts);
}

/**
 * The single writer: `apply(id, fn)` merges onto the current bank synchronously, `entryDone()`
 * counts completed entries and saves every `every`, `flush()` saves if anything changed.
 */
export function createBankWriter({ bank, save, every = 5 }) {
  let current = bank;
  let dirty = false;
  let pending = 0;
  let writes = 0;
  const writer = {
    get bank() { return current; },
    get writes() { return writes; },
    entry: id => current.entries.find(e => e.id === id),
    apply(id, fn) {
      current = { ...current, entries: current.entries.map(e => (e.id === id ? fn(e) : e)) };
      dirty = true;
    },
    entryDone() {
      pending++;
      if (pending >= every) writer.flush();
    },
    flush() {
      pending = 0;
      if (!dirty) return false;
      save(current);
      dirty = false;
      writes++;
      return true;
    },
  };
  return writer;
}

/** Counting semaphore whose limit can change while waiters queue. */
export function createGate(max) {
  let limit = Math.max(1, max);
  let active = 0;
  const waiters = [];
  const pump = () => {
    while (waiters.length && active < limit) { active++; waiters.shift()(); }
  };
  return {
    get max() { return limit; },
    get active() { return active; },
    setMax(n) { limit = Math.max(1, n); pump(); },
    acquire() {
      if (active < limit) { active++; return Promise.resolve(); }
      return new Promise(r => waiters.push(r));
    },
    release() { active--; pump(); },
  };
}

export function errorStatus(err) {
  return Number(err && (err.status ?? err.statusCode ?? (err.response && err.response.status))) || 0;
}

export function isRateLimited(err) {
  return errorStatus(err) === 429;
}

export function isRetryable(err) {
  const s = errorStatus(err);
  return s === 429 || (s >= 500 && s < 600);
}

function header(h, name) {
  if (!h) return undefined;
  if (typeof h.get === "function") return h.get(name);
  return h[name] ?? h[name.toLowerCase()];
}

/** Retry-After in ms from an error (`retryAfterMs`, `retryAfter` seconds / HTTP date, or response headers); 0 if none. */
export function retryAfterMs(err, nowMs = Date.now()) {
  if (!err) return 0;
  if (Number.isFinite(err.retryAfterMs)) return Math.max(0, err.retryAfterMs);
  const v = err.retryAfter ?? header(err.headers, "retry-after") ?? header(err.response && err.response.headers, "retry-after");
  if (v === undefined || v === null || v === "") return 0;
  const s = Number(v);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? Math.max(0, t - nowMs) : 0;
}

/** Delay before retry `attempt` (0-based): Retry-After when given, else base·2^attempt with ±50 % jitter, capped. */
export function backoffDelay(attempt, err, { baseMs = 1000, maxMs = 60_000, random = Math.random, nowMs = Date.now() } = {}) {
  const ra = retryAfterMs(err, nowMs);
  if (ra > 0) return Math.round(Math.min(ra, 2 * maxMs) + random() * 250);
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(exp / 2 + random() * (exp / 2));
}

const label = id => (id === "openai" ? "gpt" : id);
const secs = ms => `${(ms / 1000).toFixed(1)}s`;

export function formatEta(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

const SECRET = /\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}|ya29\.[0-9A-Za-z._-]{10,})|\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

export function redactSecrets(s) {
  return String(s ?? "").replace(SECRET, "[redacted]");
}

/**
 * `--debug-raw` record of one failed side: every reply's text, parsed JSON keys and finish status
 * plus the final error. No prompt, headers or keys.
 */
export function failureRecord({ entry, side, tries = [], error, at = new Date().toISOString() }) {
  const u = r => (r && r.usage) || {};
  return {
    id: entry.id,
    provider: side.id,
    variant: Boolean(side.variant),
    at,
    error: redactSecrets((error && error.message) || error || "").slice(0, 600),
    attempts: tries.map(r => {
      const text = typeof r.text === "string" ? r.text : "";
      const json = r.json && typeof r.json === "object" ? r.json : null;
      return {
        model: r.model || "",
        finish: u(r).stop ?? null,
        inputTokens: u(r).inputTokens ?? null,
        outputTokens: u(r).outputTokens ?? null,
        reasoningTokens: u(r).thoughtTokens ?? null,
        jsonKeys: json ? Object.keys(json) : null,
        textChars: text.length,
        text: redactSecrets(text || (json ? JSON.stringify(json) : "")),
      };
    }),
  };
}

/**
 * Run the enrichment over `rows` (bank entries) with `plan` = `[{ id, variant }]` and
 * `providers[id].chat(...)`. `prepare(entry)` → `{ prompt, passages, prompts? }` (`prompts[id]`
 * overrides `prompt` for that provider); `parse(raw, { entry, passages })` → `parseEnrichOutput`
 * result. A side in `repairSides` whose reply has no usable answer gets one corrective turn
 * (`repair(prompt, reply)` → messages). `onFailure(failureRecord(...))` is called per failed side.
 * Returns counts, spend and the final per-provider limits.
 */
export async function runEnrichment({
  writer, rows, plan, providers, prepare, parse,
  repair = enrichRepairMessages, repairSides = ["openai"], onFailure = null,
  apply = applyEnrichment, isDone = alreadyEnriched, family = providerFamily,
  costOf = r => normalizeUsage(r.usage, r.model).costUSD,
  chatArgs = { role: "draft", json: true, maxTokens: 3000, timeoutMs: 90_000 }, providerChatArgs = OPENAI_ENRICH_ARGS,
  concurrency = DEFAULT_CONCURRENCY, cap = 5, limit = Infinity, force = false,
  retries = 4, baseMs = 1000, maxMs = 60_000, adaptAfter = 3, recoverAfter = 20,
  log = console.log, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)), random = Math.random,
}) {
  const workers = parseConcurrency(concurrency);
  const needs = e => plan.filter(p => force || !isDone(writer.entry(e.id) || e, p.id, { variant: p.variant }));
  const todo = rows.filter(e => needs(e).length).slice(0, Number.isFinite(limit) ? Math.max(0, limit) : undefined);
  const state = Object.fromEntries(plan.map(p => [p.id, { gate: createGate(workers), start: workers, inFlight: 0, costs: 0, calls: 0, streak429: 0, okStreak: 0 }]));
  const res = { done: 0, failed: 0, processed: 0, calls: 0, retries: 0, spent: 0, stoppedByCap: false, total: todo.length, stats: { words: [], limited: 0, removed: 0 } };
  const t0 = now();
  let next = 0;

  const projected = id => {
    const st = state[id];
    const avg = st.calls ? st.costs / st.calls : 0;
    const inFlight = Object.values(state).reduce((a, s) => a + s.inFlight * (s.calls ? s.costs / s.calls : 0), 0);
    return res.spent + inFlight + avg;
  };
  const capHit = id => {
    if (res.stoppedByCap) return true;
    if (projected(id) > cap) {
      res.stoppedByCap = true;
      log(`Spend cap reached ($${res.spent.toFixed(3)} of $${cap}) — no new calls; letting in-flight calls finish. Re-run to resume.`);
    }
    return res.stoppedByCap;
  };
  const on429 = id => {
    const st = state[id];
    st.okStreak = 0;
    if (++st.streak429 < adaptAfter) return;
    st.streak429 = 0;
    const from = st.gate.max;
    const to = Math.max(1, Math.floor(from / 2));
    if (to < from) { st.gate.setMax(to); log(`! ${label(id)}: repeated 429s — concurrency ${from} → ${to}`); }
  };
  const onOk = id => {
    const st = state[id];
    st.streak429 = 0;
    if (++st.okStreak >= recoverAfter && st.gate.max < st.start) {
      st.okStreak = 0;
      st.gate.setMax(st.gate.max + 1);
      log(`${label(id)}: concurrency back to ${st.gate.max}`);
    }
  };

  const failed = (entry, side, tries, error) => {
    if (onFailure) {
      try { onFailure(failureRecord({ entry, side, tries, error })); } catch (e) { log(`  ! --debug-raw write failed: ${String((e && e.message) || e).slice(0, 120)}`); }
    }
    return error;
  };

  async function runSide(entry, side, prep) {
    const st = state[side.id];
    if (res.stoppedByCap) return { status: "cap" };
    await st.gate.acquire();
    const started = now();
    let prompt = (prep.prompts && prep.prompts[side.id]) || prep.prompt;
    let repaired = false;
    const tries = [];
    try {
      for (let attempt = 0; ; attempt++) {
        if (capHit(side.id)) return { status: "cap" };
        st.inFlight++;
        let r;
        try {
          res.calls++;
          r = await providers[side.id].chat({ ...prompt, ...chatArgs, ...((providerChatArgs && providerChatArgs[side.id]) || {}) });
        } catch (err) {
          st.inFlight--;
          // A cut-off reply is billed: keep the spend cap honest.
          const lost = err && err.usage ? Number(costOf({ usage: err.usage, model: err.model || "" })) || 0 : 0;
          if (lost) { res.spent += lost; st.costs += lost; st.calls++; }
          if (isRateLimited(err)) on429(side.id);
          if (isRetryable(err) && attempt < retries) {
            res.retries++;
            await sleep(backoffDelay(attempt, err, { baseMs, maxMs, random, nowMs: now() }));
            continue;
          }
          return { status: "fail", ms: now() - started, error: failed(entry, side, tries, err) };
        }
        st.inFlight--;
        tries.push(r);
        const cost = Number(costOf(r)) || 0;
        st.calls++;
        st.costs += cost;
        res.spent += cost;
        onOk(side.id);
        try {
          const out = parse(r.json || r.text, { entry, passages: prep.passages });
          if (!out || !out.ok) {
            if (repair && !repaired && repairSides.includes(side.id)) {
              repaired = true;
              res.retries++;
              prompt = { ...prompt, messages: repair(prompt, r.text || r.json) };
              continue;
            }
            const stop = r && r.usage && r.usage.stop ? ` (stop: ${r.usage.stop}, ${r.usage.outputTokens || 0} output tokens)` : "";
            throw new Error(`${(out && out.error) || "unusable output"}${stop}${repaired ? " — also after a corrective retry" : ""}`);
          }
          const at = new Date().toISOString();
          writer.apply(entry.id, x => apply(x, out, { provider: family(side.id, r.model), model: r.model, at, variant: side.variant }));
          if (!side.variant) {
            res.stats.words.push(out.words);
            if ((out.flags || []).includes("limited-sources")) res.stats.limited++;
            if ((out.flags || []).includes("unsupported-claims-removed")) res.stats.removed++;
          }
          return { status: "ok", ms: now() - started, out };
        } catch (err) {
          return { status: "fail", ms: now() - started, error: failed(entry, side, tries, err) };
        }
      }
    } finally {
      st.gate.release();
    }
  }

  async function processEntry(entry) {
    const want = new Set(needs(entry).map(p => p.id));
    if (!want.size) return;
    let prep;
    try {
      prep = prepare(writer.entry(entry.id) || entry);
    } catch (err) {
      res.processed++;
      res.failed += want.size;
      log(`[${res.processed}/${res.total}] ${entry.id} FAILED to prepare — ${String((err && err.message) || err).slice(0, 200)}`);
      return;
    }
    const results = await Promise.all(plan.map(p => (want.has(p.id) ? runSide(entry, p, prep) : { status: "done" })));
    if (results.every(r => r.status === "cap" || r.status === "done")) return;
    res.processed++;
    if (results.some(r => r.status === "ok")) res.done++;
    res.failed += results.filter(r => r.status === "fail").length;
    const k = res.processed;
    const eta = ((now() - t0) / k) * (res.total - k);
    const sides = plan.map((p, i) => {
      const r = results[i];
      if (r.status === "ok") return `${label(p.id)} ✓ (${secs(r.ms)})`;
      if (r.status === "fail") return `${label(p.id)} ✗ (${secs(r.ms)})`;
      return `${label(p.id)} ${r.status === "cap" ? "– cap" : "= already"}`;
    });
    log(`[${k}/${res.total}] ${entry.id} ${sides.join(" ")} · $${res.spent.toFixed(3)} · ETA ${formatEta(res.stoppedByCap ? 0 : eta)}`);
    plan.forEach((p, i) => {
      const r = results[i];
      if (r.status === "fail") log(`  ${entry.id} ${label(p.id)}: FAILED — ${String((r.error && r.error.message) || r.error).slice(0, 200)}`);
    });
    writer.entryDone();
  }

  async function worker() {
    while (!res.stoppedByCap && next < todo.length) await processEntry(todo[next++]);
  }

  try {
    await Promise.all(Array.from({ length: Math.min(workers, todo.length) }, worker));
  } finally {
    writer.flush();
  }
  res.limits = Object.fromEntries(Object.entries(state).map(([id, s]) => [id, s.gate.max]));
  res.elapsedMs = now() - t0;
  return res;
}
