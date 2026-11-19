/** Firestore backup script (offline, fake Firestore) + backups stay out of git. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { backupFirestore, toPlain } from "../scripts/ops/backup-firestore.mjs";

function fakeDb(collections) {
  const query = docs => {
    const q = (lim = Infinity, after = null) => ({
      orderBy: () => q(lim, after),
      limit: n => q(n, after),
      startAfter: d => q(lim, d),
      async get() {
        const sorted = [...docs].sort((a, b) => a.ref.path.localeCompare(b.ref.path));
        const from = after ? sorted.findIndex(d => d.ref.path === after.ref.path) + 1 : 0;
        const page = sorted.slice(from, from + lim);
        return { empty: !page.length, size: page.length, docs: page };
      },
    });
    return q();
  };
  const doc = (p, data) => ({ ref: { path: p }, data: () => data });
  return {
    async listCollections() { return Object.keys(collections).filter(k => !k.includes("/")).map(id => ({ id })); },
    collection: id => query(Object.entries(collections[id] || {}).map(([k, v]) => doc(`${id}/${k}`, v))),
    collectionGroup: id => query(Object.entries(collections)
      .filter(([k]) => k.endsWith(`/${id}`))
      .flatMap(([k, docs]) => Object.entries(docs).map(([dk, v]) => doc(`${k}/${dk}`, v)))),
  };
}

test("backup: every root collection + faculty parts to NDJSON with a manifest; types made plain", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "aym-backup-"));
  const ts = { seconds: 1, toDate: () => new Date("2026-11-08T00:00:00Z") };
  const big = Object.fromEntries(Array.from({ length: 1203 }, (_, i) => [`q${String(i).padStart(5, "0")}`, { id: i }]));
  const db = fakeDb({
    questions: big,
    staff_members: { "owner%40x.test": { email: "owner@x.test", at: ts } },
    faculty_bank: { e1: { id: "e1" } },
    "faculty_bank/e1/parts": { long: { answerMarked: "x" } },
  });
  const { dir, manifest } = await backupFirestore(db, { outDir: out, projectId: "demo", now: new Date("2026-11-08T10:30:00Z") });
  assert.match(path.basename(dir), /^firestore-demo-2026-11-08T10-30$/);
  assert.equal(manifest.collections.questions, 1203, "pages past 500");
  assert.equal(manifest.collections.staff_members, 1);
  assert.equal(manifest.subcollections.parts, 1);
  const line = JSON.parse(fs.readFileSync(path.join(dir, "staff_members.ndjson"), "utf8").trim());
  assert.deepEqual(line.data.at, { _ts: "2026-11-08T00:00:00.000Z" });
  assert.equal((fs.statSync(path.join(dir, "questions.ndjson")).mode & 0o077), 0, "owner-only file");
  fs.rmSync(out, { recursive: true, force: true });
});

test("toPlain: vectors, bytes, nested values", () => {
  assert.deepEqual(toPlain({ v: { toArray: () => [1, 2] }, b: Buffer.from("hi"), n: [{ x: 1 }] }), { v: [1, 2], b: { _b64: "aGk=" }, n: [{ x: 1 }] });
});

test("backups/ and env / service-account files are gitignored", () => {
  const gi = fs.readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
  for (const p of ["backups/", ".env.local", "*firebase-adminsdk*.json", "**/serviceAccount*.json"]) assert.ok(gi.includes(p), p);
});
