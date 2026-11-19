/** Secret scanner: patterns + env-value matching, reporting names only; placeholders and crawled pages ignored. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scan, scanText } from "../scripts/ops/scan-secrets.mjs";

const FAKE_GOOGLE = "AIza" + "x".repeat(35);
const FAKE_VALUE = "fake-passphrase-for-scan-test";
const PK_HEADER = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");

test("scanText: secret patterns and env values; placeholder private keys skipped", () => {
  const hits = scanText(`a\nconst k = "${FAKE_GOOGLE}";\nPIN is ${FAKE_VALUE}\nFIREBASE_PRIVATE_KEY="${PK_HEADER}\\n...\\n"`, [["ADMIN_PIN", FAKE_VALUE]]);
  assert.deepEqual(hits, [{ line: 2, kind: "google-api-key" }, { line: 3, kind: "value of ADMIN_PIN" }]);
  assert.deepEqual(scanText(`<script src="maps?key=${FAKE_GOOGLE}">`, [], "data/kb/manual/page.html"), [], "third-party crawled page");
});

test("scan: walks the tree, skips .env / service accounts / backups / node_modules, never echoes values", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aym-scan-"));
  const w = (p, t) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), t); };
  w(".env.local", `ADMIN_PIN=${FAKE_VALUE}\nMAIL_FROM=AYURDISHA <x@y.z>\n`);
  w("dist/assets/app.js", `var a="${FAKE_VALUE}"`);
  w("docs/ok.md", "nothing here");
  w("backups/firestore-x/q.ndjson", FAKE_VALUE);
  w("node_modules/x/i.js", FAKE_VALUE);
  w("firebase-adminsdk-abc.json", FAKE_VALUE);
  const { findings } = scan({ root });
  assert.deepEqual(findings, [{ file: "dist/assets/app.js", line: 1, kind: "value of ADMIN_PIN" }]);
  assert.ok(!JSON.stringify(findings).includes(FAKE_VALUE));
  assert.deepEqual(scan({ root, distOnly: true }).findings.length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});
