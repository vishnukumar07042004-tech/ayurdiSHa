/**
 * Lightweight Firestore quota meter + lite mode (Phase A).
 * Per-instance estimates only — enough for an on-duty admin to enable AYM_LITE_MODE
 * before Spark daily caps are exhausted. Never blocks public ask/register by itself.
 */
import { PLAN_MODE } from "../shared/productConfig.js";

const SPARK_READ_DAY = 50_000;
const SPARK_WRITE_DAY = 20_000;
const LITE_PAGE_MAX = 25;

let dayKey = "";
let reads = 0;
let writes = 0;

function rollDay() {
  const d = new Date().toISOString().slice(0, 10);
  if (d !== dayKey) {
    dayKey = d;
    reads = 0;
    writes = 0;
  }
}

export function noteRead(n = 1) {
  rollDay();
  reads += Math.max(0, Math.floor(Number(n) || 0));
}

export function noteWrite(n = 1) {
  rollDay();
  writes += Math.max(0, Math.floor(Number(n) || 0));
}

/** Opt-in via AYM_LITE_MODE=1 (or true/on/yes). */
export function isLiteMode(env = process.env) {
  return /^(1|true|on|yes)$/i.test(String(env.AYM_LITE_MODE || "").trim());
}

export function effectivePageMax(baseMax = 50) {
  return isLiteMode() ? Math.min(baseMax, LITE_PAGE_MAX) : baseMax;
}

export function quotaSnapshot(env = process.env) {
  rollDay();
  const free = PLAN_MODE === "free";
  const readPct = free ? Math.min(100, Math.round((100 * reads) / SPARK_READ_DAY)) : null;
  const writePct = free ? Math.min(100, Math.round((100 * writes) / SPARK_WRITE_DAY)) : null;
  const lite = isLiteMode(env);
  return {
    planMode: PLAN_MODE,
    liteMode: lite,
    day: dayKey,
    estimatedReads: reads,
    estimatedWrites: writes,
    readBudget: free ? SPARK_READ_DAY : null,
    writeBudget: free ? SPARK_WRITE_DAY : null,
    readPct,
    writePct,
    /** Hint for admins — turn on AYM_LITE_MODE when either meter looks hot. */
    recommendLite: free && !lite && ((readPct != null && readPct >= 60) || (writePct != null && writePct >= 60)),
  };
}
