#!/usr/bin/env node
/**
 * Upload data/kb/chunks.jsonl to Firestore collection `kb_chunks` (doc id = chunk id).
 *   node scripts/kb/upload.mjs [--dry] [--prune]
 *
 * Uses the same credentials resolution as server/store.js (FIREBASE_* env, FIREBASE_SERVICE_ACCOUNT_JSON,
 * GOOGLE_APPLICATION_CREDENTIALS or a dropped service-account JSON). Touches ONLY `kb_chunks`.
 * Idempotent: unchanged docs (same contentHash + embeddingModel) are skipped. Docs whose contentHash
 * changed get `changedAt`; added / changed / removed ids go to data/kb/changed.json.
 * --prune deletes kb_chunks docs that are no longer in chunks.jsonl (off by default).
 * Embeddings are stored as Firestore vectors (FieldValue.vector) for findNearest().
 */
import path from "node:path";
import { CHUNKS_FILE, KB_DIR, VECTORS_FILE, readJsonl, writeJson } from "./lib.mjs";
import { resolveFirebaseCreds } from "../../server/store.js";

const COLLECTION = "kb_chunks";
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));

async function main() {
  const chunks = readJsonl(CHUNKS_FILE);
  if (!chunks.length) { console.log("[upload] no chunks — run crawl first"); return; }
  const vectors = new Map(readJsonl(VECTORS_FILE).map(r => [`${r.id}|${r.contentHash}`, r]));
  for (const c of chunks) {
    const v = vectors.get(`${c.id}|${c.contentHash}`);
    if (v && !c.embedding) { c.embedding = v.embedding; c.embeddingModel = v.model; }
  }
  const creds = resolveFirebaseCreds();
  if (!creds) {
    console.log(`[upload] SKIP — no Firebase credentials found (FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY, FIREBASE_SERVICE_ACCOUNT_JSON or serviceAccount.json). ${chunks.length} chunks stay local.`);
    return;
  }
  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  const appName = "aym-kb-upload";
  const app = getApps().find(a => a.name === appName) || initializeApp({
    credential: cert({ projectId: creds.projectId, clientEmail: creds.clientEmail, privateKey: creds.privateKey }),
    projectId: creds.projectId,
  }, appName);
  const db = getFirestore(app);
  const col = db.collection(COLLECTION);
  console.log(`[upload] project=${creds.projectId} collection=${COLLECTION} chunks=${chunks.length}${args.dry ? " (dry run)" : ""}`);

  // Existing state (only the fields needed for the diff).
  const existing = new Map();
  const snap = await col.select("contentHash", "embeddingModel", "changedAt").get();
  snap.forEach(d => existing.set(d.id, d.data()));

  const now = new Date().toISOString();
  const added = [], changed = [], unchanged = [], removed = [];
  const writer = args.dry ? null : db.bulkWriter();
  if (writer) writer.onWriteError(err => err.failedAttempts < 3);

  for (const c of chunks) {
    const prev = existing.get(c.id);
    const sameText = prev && prev.contentHash === c.contentHash;
    const sameEmb = prev && (prev.embeddingModel || null) === (c.embedding ? c.embeddingModel : null);
    if (sameText && sameEmb) { unchanged.push(c.id); continue; }
    const { embedding, ...rest } = c;
    const doc = { ...rest, embeddingModel: embedding ? c.embeddingModel : null, uploadedAt: now };
    if (embedding) doc.embedding = FieldValue.vector(embedding);
    if (!prev) added.push(c.id);
    else if (!sameText) { changed.push({ id: c.id, url: c.url, title: c.title }); doc.changedAt = now; }
    else if (prev.changedAt) doc.changedAt = prev.changedAt;
    if (writer) writer.set(col.doc(c.id), doc);
  }
  const local = new Set(chunks.map(c => c.id));
  for (const id of existing.keys()) {
    if (local.has(id)) continue;
    removed.push(id);
    if (writer && args.prune) writer.delete(col.doc(id));
  }
  if (writer) await writer.close();

  const summary = { finishedAt: now, project: creds.projectId, collection: COLLECTION, dry: Boolean(args.dry), pruned: Boolean(args.prune), counts: { total: chunks.length, added: added.length, changed: changed.length, unchanged: unchanged.length, removed: removed.length }, added, changed, removed };
  writeJson(path.join(KB_DIR, "changed.json"), summary);
  console.log(`[upload] added=${added.length} changed=${changed.length} unchanged=${unchanged.length} removed(${args.prune ? "deleted" : "kept"})=${removed.length} → data/kb/changed.json`);
}

main().catch(err => { console.error("[upload] fatal:", err.message || err); process.exit(1); });
