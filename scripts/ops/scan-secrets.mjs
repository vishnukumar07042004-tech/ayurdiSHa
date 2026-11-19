#!/usr/bin/env node
/**
 * Secret scan: the client bundle (`dist/`) and the repo files that could be committed.
 *   1. Secret-looking strings (Google / OpenAI / Resend / Vercel Blob / GitHub / Slack keys, private keys).
 *   2. The literal VALUES of secret keys in .env.local / .env (ADMIN_PIN, *_KEY, *_SECRET, *_TOKEN,
 *      *_PASS, *_JSON …) — compared in memory only.
 * Prints file, line and the kind / key NAME only — never a value. Exit 1 when anything is found.
 *
 *   npm run build && npm run scan:secrets          # dist + repo
 *   node scripts/ops/scan-secrets.mjs --dist-only
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const PATTERNS = [
  ["google-api-key", /AIza[0-9A-Za-z_-]{35}/],
  ["openai-key", /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/],
  ["resend-key", /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/],
  ["vercel-blob-token", /vercel_blob_rw_[A-Za-z0-9]{10,}_[A-Za-z0-9]{20,}/],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{36,}/],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{20,}/],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["service-account-key", /"private_key"\s*:\s*"-----BEGIN/],
];

const SECRET_KEY_RE = /(PIN|KEY|SECRET|TOKEN|PASS|PASSWORD|_JSON|CREDENTIALS)$/i;
const NOT_SECRET = new Set(["AI_EMBED_MODEL", "MAIL_FROM"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "backups", ".qa", ".vercel", ".vite", "dist-ssr"]);
const SKIP_FILE_RE = /(^|\/)(\.env(\..*)?|.*firebase-adminsdk.*\.json|serviceAccount.*\.json|data\/store\.json)$/;
const SKIP_PATH_PREFIXES = ["data/kb/cache/"];
const BINARY_RE = /\.(png|jpe?g|gif|webp|ico|pdf|zip|xlsx|xls|docx?|pptx|mp4|mp3|woff2?|ttf|otf|eot)$/i;
const MAX_BYTES = 8 * 1024 * 1024;

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

/** `[name, value]` pairs worth looking for (values ≥ 8 chars; JSON blobs contribute their private key line). */
export function secretValues(root = ROOT) {
  const out = [];
  for (const f of [".env.local", ".env"]) {
    let env = {};
    try { env = parseEnv(fs.readFileSync(path.join(root, f), "utf8")); } catch { continue; }
    for (const [k, v] of Object.entries(env)) {
      if (!SECRET_KEY_RE.test(k) || NOT_SECRET.has(k) || !v) continue;
      if (k.endsWith("_JSON")) {
        try {
          const j = JSON.parse(v);
          if (j && j.private_key) out.push([k, String(j.private_key).replace(/\\n/g, "\n").split("\n").find(l => l.length > 40) || ""]);
        } catch { /* not JSON */ }
        continue;
      }
      if (v.length >= 8) out.push([k, v]);
    }
  }
  return out.filter(([, v]) => v);
}

function* walk(dir, rel = "") {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || SKIP_PATH_PREFIXES.some(p => `${r}/`.startsWith(p))) continue;
      yield* walk(path.join(dir, e.name), r);
    } else if (e.isFile()) {
      yield r;
    }
  }
}

/** Third-party pages crawled into the knowledge base embed their own public browser keys (e.g. Maps). */
const THIRD_PARTY_PAGE_RE = /^data\/kb\/(manual|raw|pages)\//;
const PLACEHOLDER_KEY_RE = /PRIVATE KEY-----(\\n)?\.\.\./;

export function scanText(text, values, file = "") {
  const hits = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const [kind, re] of PATTERNS) {
      if (!re.test(line)) continue;
      if (kind === "private-key" && PLACEHOLDER_KEY_RE.test(line)) continue;
      if (kind === "google-api-key" && THIRD_PARTY_PAGE_RE.test(file)) continue;
      hits.push({ line: i + 1, kind });
    }
    for (const [name, v] of values) if (line.includes(v)) hits.push({ line: i + 1, kind: `value of ${name}` });
  });
  return hits;
}

/** `{ findings: [{ file, line, kind }], scanned }`. */
export function scan({ root = ROOT, distOnly = false, values = secretValues(root) } = {}) {
  const findings = [];
  let scanned = 0;
  const roots = distOnly ? ["dist"] : [""];
  for (const start of roots) {
    const base = path.join(root, start);
    if (!fs.existsSync(base)) continue;
    for (const r of walk(base, start)) {
      if (SKIP_FILE_RE.test(r) || BINARY_RE.test(r)) continue;
      const p = path.join(root, r);
      let st;
      try { st = fs.statSync(p); } catch { continue; }
      if (st.size > MAX_BYTES) continue;
      let text;
      try { text = fs.readFileSync(p, "utf8"); } catch { continue; }
      scanned += 1;
      for (const h of scanText(text, values, r)) findings.push({ file: r, ...h });
    }
  }
  return { findings, scanned };
}

function main() {
  const distOnly = process.argv.includes("--dist-only");
  const values = secretValues();
  if (!fs.existsSync(path.join(ROOT, "dist"))) console.log("note: no dist/ — run `npm run build` first to scan the client bundle.");
  const { findings, scanned } = scan({ distOnly, values });
  console.log(`== Secret scan: ${scanned} files (${distOnly ? "dist/ only" : "repo + dist/"}), ${values.length} secret env values compared (names only shown)`);
  if (!findings.length) { console.log("OK — no secrets found."); return 0; }
  for (const f of findings) console.log(`  ✗ ${f.file}:${f.line}  ${f.kind}`);
  console.log(`${findings.length} finding(s). Remove the secret, rotate it (docs/ops/SECURITY-RUNBOOK.md) and re-run.`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(main());
