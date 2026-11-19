#!/usr/bin/env node
/**
 * Link existing AYURDISHA accounts to their WAC Delegate ID by verified email, through the staff
 * `wacAutoLinkAll` op (one page of accounts per call, following `next`).
 *
 *   AYM_SERVICE_TOKEN=... node scripts/wac/autolink-existing.mjs --dry-run                       # default: counts only
 *   AYM_SERVICE_TOKEN=... node scripts/wac/autolink-existing.mjs --apply --url=https://ayushmarg.vercel.app
 *
 * Options: --url=<base> (dry run defaults to the production URL; --apply requires it) · --limit=150
 * (accounts per call).
 *
 * Prints counts only — never a name, email or Delegate ID. Apply is idempotent: linked accounts
 * are skipped, alerts are raised once per account, questions already carrying the ID are left.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeClient, callWithRetry, errText } from "./import-delegates.mjs";
import { hasServiceToken, checkServiceAuth, NO_TOKEN_HELP } from "../lib/staffAuth.mjs";

const PROD_URL = "https://ayushmarg.vercel.app";
export const DEFAULT_LIMIT = 150;
const COUNT_KEYS = ["scanned", "linkable", "linked", "ambiguous", "conflicts", "alreadyLinked", "noMatch", "skipped", "questionsUpdated"];

/** Every page of `wacAutoLinkAll`; resolves summed counts or `{ ok: false, cursor, … }` on a failed page. */
export async function runAutoLink(call, { dryRun = true, limit = DEFAULT_LIMIT, relogin, wait, log = () => {} } = {}) {
  const totals = Object.fromEntries(COUNT_KEYS.map(k => [k, 0]));
  let cursor = 0;
  let pages = 0;
  for (let guard = 0; guard < 10000 && cursor != null; guard++) {
    const r = await callWithRetry(call, "wacAutoLinkAll", { dryRun, cursor, limit }, { relogin, wait, log });
    if (r.status !== 200) {
      return { ok: false, cursor, status: r.status, error: errText(r), unknownOp: r.status === 400 && /unknown op/i.test(errText(r)), pages, totals };
    }
    const d = r.data || {};
    for (const k of COUNT_KEYS) totals[k] += Number(d.counts && d.counts[k]) || 0;
    pages += 1;
    log(`  accounts ${cursor + 1}–${d.next == null ? d.totalUsers : d.next} of ${d.totalUsers}: ${(d.counts && d.counts.scanned) || 0} scanned`);
    cursor = d.next == null ? null : Number(d.next);
  }
  return { ok: true, pages, totals };
}

export function summaryLines(t, { dryRun }) {
  return [
    `  Accounts scanned           ${t.scanned} (skipped: test / probe / incomplete ${t.skipped})`,
    `  Already linked             ${t.alreadyLinked}`,
    `  Linkable (one match)       ${t.linkable}${dryRun ? "" : ` · linked now ${t.linked}`}`,
    `  Ambiguous (several IDs)    ${t.ambiguous}  → marked "choose your Delegate ID"${dryRun ? " on apply" : ""}`,
    `  Linked to another account  ${t.conflicts}  → staff alert${dryRun ? " on apply" : ""}`,
    `  No delegate record         ${t.noMatch}`,
    `  Questions ${dryRun ? "to stamp" : "stamped"}          ${t.questionsUpdated}`,
  ];
}

function parseArgs(argv) {
  const flags = {};
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const [k, ...rest] = a.slice(2).split("=");
    flags[k] = rest.length ? rest.join("=") : true;
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const apply = Boolean(flags.apply);
  const dryRun = !apply;
  const given = String(flags.url || flags.base || "").replace(/\/$/, "");
  if (apply && !given) { console.error("--apply needs --url=https://…"); return 1; }
  const base = given || PROD_URL;
  if (!hasServiceToken()) { console.error(NO_TOKEN_HELP); return 1; }
  const limit = Math.max(1, Math.min(500, Math.floor(Number(flags.limit) || DEFAULT_LIMIT)));

  const call = makeClient(base);
  const login = async () => {
    const r = await checkServiceAuth(async (op, b) => { const x = await callWithRetry(call, op, b); return { status: x.status, body: x.data }; });
    if (!r.ok) throw new Error(`staff auth failed (HTTP ${r.status}): ${r.error}`);
  };
  try {
    await login();
    console.log(`\n== WAC Delegate ID auto-link — ${apply ? "APPLY" : "DRY RUN (nothing is written)"} on ${base} (counts only)`);
    const out = await runAutoLink(call, { dryRun, limit, relogin: login, log: m => console.log(m) });
    if (!out.ok) {
      console.error(`✗ Page at account ${out.cursor} failed (HTTP ${out.status || "network"}): ${out.error}`);
      if (out.unknownOp) console.error("  This deploy has no auto-link yet — deploy it first.");
      console.error("  Safe to re-run: linked accounts are skipped.");
      return 1;
    }
    console.log("");
    for (const l of summaryLines(out.totals, { dryRun })) console.log(l);
    if (dryRun) console.log(`\nNothing was written. Re-run with --apply --url=${base} to link ${out.totals.linkable} account(s).`);
    return 0;
  } catch (err) {
    console.error(`✗ ${String((err && err.message) || err).slice(0, 200)}`);
    return 1;
  } finally {
    await call("logout").catch(() => {});
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().then(code => { process.exitCode = code; }, err => {
    console.error(`✗ ${String((err && err.message) || err).slice(0, 200)}`);
    process.exitCode = 1;
  });
}
