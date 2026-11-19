#!/usr/bin/env node
/**
 * Firestore backup: every root collection (plus the `parts` sub-collections of the faculty bank) to
 * NDJSON files in a dated folder under the gitignored `backups/` directory. Read-only.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/ops/backup-firestore.mjs
 *   … --out=backups --collections=questions,kv --subcollections=parts
 *
 * Output: backups/firestore-<project>-<YYYY-MM-DDTHH-MM>/<collection>.ndjson (one `{path, data}` per
 * line; Timestamps → {"_ts": ISO}, vectors → arrays, bytes → {"_b64": …}) + manifest.json with counts.
 * The folder holds personal data: keep it on an encrypted disk, never commit or share it.
 * Restore notes and the managed alternatives (PITR, scheduled exports): docs/ops/BACKUPS.md.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Firestore value → plain JSON (no class instances). */
export function toPlain(v) {
  if (v == null || typeof v !== "object") return v;
  if (typeof v.toDate === "function" && typeof v.seconds === "number") return { _ts: v.toDate().toISOString() };
  if (typeof v.toArray === "function") return v.toArray();
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { _b64: Buffer.from(v).toString("base64") };
  if (typeof v.path === "string" && typeof v.id === "string" && v.firestore) return { _ref: v.path };
  if (typeof v.latitude === "number" && typeof v.longitude === "number") return { _geo: [v.latitude, v.longitude] };
  if (Array.isArray(v)) return v.map(toPlain);
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = toPlain(x);
  return out;
}

function stamp(d = new Date()) {
  return d.toISOString().slice(0, 16).replace(/:/g, "-");
}

async function writeQuery(query, file, { pageSize = 500 } = {}) {
  const fd = fs.openSync(file, "w", 0o600);
  let count = 0;
  let last = null;
  try {
    for (;;) {
      let q = query.limit(pageSize);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      for (const d of snap.docs) {
        fs.writeSync(fd, JSON.stringify({ path: d.ref.path, data: toPlain(d.data()) }) + "\n");
        count += 1;
      }
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }
  } finally {
    fs.closeSync(fd);
  }
  return count;
}

/**
 * `db` = a Firestore instance (or a test double with listCollections / collection / collectionGroup).
 * Resolves the manifest.
 */
export async function backupFirestore(db, { outDir, only = [], subcollections = ["parts"], projectId = "", now = new Date(), log = () => {} } = {}) {
  const dir = path.join(outDir, `firestore-${projectId || "project"}-${stamp(now)}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const roots = (await db.listCollections()).map(c => c.id).filter(id => !only.length || only.includes(id)).sort();
  const manifest = { projectId, startedAt: now.toISOString(), collections: {}, subcollections: {} };
  for (const id of roots) {
    const n = await writeQuery(db.collection(id).orderBy("__name__"), path.join(dir, `${id}.ndjson`));
    manifest.collections[id] = n;
    log(`  ${id.padEnd(28)} ${n}`);
  }
  for (const id of subcollections) {
    const n = await writeQuery(db.collectionGroup(id).orderBy("__name__"), path.join(dir, `_group_${id}.ndjson`));
    manifest.subcollections[id] = n;
    log(`  ${("(group) " + id).padEnd(28)} ${n}`);
  }
  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return { dir, manifest };
}

function arg(name, def = "") {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
}

async function main() {
  const credPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (!credPath || !fs.existsSync(credPath)) {
    console.error("Set GOOGLE_APPLICATION_CREDENTIALS to the Firebase service-account JSON path (read-only use; never commit it).");
    return 2;
  }
  let sa;
  try { sa = JSON.parse(fs.readFileSync(credPath, "utf8")); } catch { console.error("The service-account file is not valid JSON."); return 2; }
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = initializeApp({ credential: cert(sa), projectId: sa.project_id }, "aym-backup");
  const db = getFirestore(app);
  const outDir = path.resolve(ROOT, arg("out", "backups"));
  const only = arg("collections").split(",").map(s => s.trim()).filter(Boolean);
  const subs = arg("subcollections", "parts").split(",").map(s => s.trim()).filter(Boolean);
  console.log(`== Firestore backup of ${sa.project_id} → ${path.relative(ROOT, outDir)}/ (counts only)`);
  const { dir, manifest } = await backupFirestore(db, { outDir, only, subcollections: subs, projectId: sa.project_id, log: m => console.log(m) });
  const total = Object.values(manifest.collections).reduce((a, b) => a + b, 0);
  console.log(`Done: ${total} documents in ${Object.keys(manifest.collections).length} collections → ${path.relative(ROOT, dir)}/`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().then(code => process.exit(code), err => { console.error(`✗ ${String((err && err.message) || err).slice(0, 200)}`); process.exit(1); });
}
