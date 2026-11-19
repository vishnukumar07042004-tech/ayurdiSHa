/**
 * scripts/kb/fetch-gaps.mjs parsing on fixtures (no network): link discovery on an NTA-style page,
 * HTML and PDF text extraction, chunk shape and caps, manifest / chunk merging, robots.txt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TARGETS, discoverLinks, parseHtmlDoc, docChunks, mergeChunks, mergeManifest, coverageByStream, fileNameFor,
  parseRobots, robotsAllows, looksPdf, pdfExtractor, pdfText, tidyPdfText,
} from "../scripts/kb/fetch-gaps.mjs";
import { loadSources } from "../scripts/kb/lib.mjs";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/kb-gaps");
const html = fs.readFileSync(path.join(FIX, "nta-aiapget.html"), "utf8");
const BASE = "https://exams.nta.ac.in/AIAPGET/";
const sources = loadSources();
const aiapget = TARGETS.find(t => t.id === "aiapget");

test("every target host is on the allow-list (natboard + clinicalestablishments added)", () => {
  for (const t of TARGETS) {
    for (const url of [...t.pages, ...(t.discover ? t.discover.from : [])]) {
      assert.ok(sources.some(s => [s.domain, ...(s.aliases || [])].some(d => new URL(url).hostname.replace(/^www\./, "").endsWith(d))), `${t.id}: ${url}`);
    }
  }
  for (const d of ["natboard.edu.in", "clinicalestablishments.gov.in", "upsc.gov.in", "ncismindia.org", "dha.gov.ae", "doh.gov.ae", "mohap.gov.ae"]) {
    assert.ok(sources.some(s => s.domain === d && s.authority === "regulator"), d);
  }
});

test("discoverLinks: allow-listed, matching, PDFs first; Hindi copies, images, off-list and unrelated links dropped", () => {
  const links = discoverLinks(html, BASE, { match: aiapget.discover.match, sources, max: 5 });
  assert.deepEqual(links.map(l => l.url), [
    "https://exams.nta.ac.in/AIAPGET/images/AIAPGET-2026-Information-Bulletin.pdf",
    "https://exams.nta.ac.in/AIAPGET/public-notice-dates",
  ]);
  assert.equal(links[0].pdf, true);
  const capped = discoverLinks(html, BASE, { match: aiapget.discover.match, sources, max: 1 });
  assert.equal(capped.length, 1);
  const excluded = discoverLinks(html, BASE, { match: aiapget.discover.match, sources, exclude: new Set([links[0].url]) });
  assert.deepEqual(excluded.map(l => l.url), [links[1].url]);
});

test("parseHtmlDoc: title, main text without nav / footer, published date", () => {
  const d = parseHtmlDoc(html, BASE);
  assert.equal(d.kind, "html");
  assert.match(d.title, /AIAPGET/);
  assert.match(d.text, /National Testing Agency \(NTA\) conducts/);
  assert.doesNotMatch(d.text, /All rights reserved|window\.dataLayer/);
  assert.equal(d.publishedAt, "2026-03-12");
  assert.ok(d.text.length > 300);
});

test("PDF fixture: detected and read (title, date, text)", async t => {
  const file = path.join(FIX, "aiapget-bulletin.pdf");
  assert.equal(looksPdf(fs.readFileSync(file)), true);
  assert.equal(looksPdf(Buffer.from("<html>"), "application/pdf"), true, "content type alone counts");
  if (!(await pdfExtractor())) { t.skip("no PDF extractor on this machine (pypdf / unpdf)"); return; }
  const p = await pdfText(file);
  assert.match(p.text, /conducted by the National Testing Agency/);
  assert.match(p.text, /30 June 2026/);
  assert.match(p.title || "AIAPGET", /AIAPGET/);
});

test("tidyPdfText re-joins wrapped lines and drops page numbers", () => {
  assert.equal(tidyPdfText("Candidates must hold\na BAMS degree.\n\n12\n\nNext paragraph."), "Candidates must hold a BAMS degree.\n\nNext paragraph.");
});

test("docChunks: KB contract shape, source authority and streams, no embeddings, capped per document", () => {
  const text = Array.from({ length: 30 }, (_, i) => `Section ${i + 1}. The AIAPGET information bulletin explains eligibility for postgraduate admission, the examination scheme and counselling. Candidates must read every part of the bulletin carefully before applying online for the entrance examination.`).join("\n\n");
  const doc = { url: "https://exams.nta.ac.in/AIAPGET/images/AIAPGET-2026-Information-Bulletin.pdf", title: "AIAPGET 2026 Information Bulletin", text: text.repeat(4), publishedAt: "2026-03-10" };
  const chunks = docChunks(doc, { fetchedAt: "2026-10-31T00:00:00.000Z", sources, max: 3 });
  assert.equal(chunks.length, 3);
  for (const c of chunks) {
    assert.deepEqual(Object.keys(c).sort(), ["authority", "contentHash", "fetchedAt", "id", "publishedAt", "streams", "text", "title", "tokens", "url"].sort());
    assert.equal(c.authority, "regulator");
    assert.ok(c.streams.includes("pg-entrance"), JSON.stringify(c.streams));
    assert.equal(c.embedding, undefined);
  }
  assert.equal(docChunks({ ...doc, url: "https://random-coaching-blog.example/x.pdf" }, { fetchedAt: "x", sources }).length, 0, "off allow-list → nothing");
});

test("mergeChunks replaces a refetched URL and skips duplicate text; mergeManifest is keyed by URL", () => {
  const old = [{ id: "a", url: "https://x.gov.in/1", contentHash: "h1" }, { id: "b", url: "https://x.gov.in/2", contentHash: "h2" }];
  const fresh = [{ id: "c", url: "https://x.gov.in/1", contentHash: "h3" }, { id: "d", url: "https://x.gov.in/3", contentHash: "h2" }];
  const m = mergeChunks(old, fresh);
  assert.deepEqual(m.chunks.map(c => c.id), ["b", "c"]);
  assert.equal(m.added, 1);
  assert.equal(m.replaced, 1);
  const man = mergeManifest([{ url: "u1", file: "old.pdf", gap: "aiapget" }], [{ url: "u1", file: "new.pdf", gap: "aiapget" }, { url: "u2", file: "b.html", gap: "gulf" }]);
  assert.deepEqual(man.map(e => e.file), ["new.pdf", "b.html"]);
});

test("coverageByStream, fileNameFor, robots.txt", () => {
  assert.deepEqual(coverageByStream([{ streams: ["pg-entrance"] }, { streams: ["*"] }, { streams: ["pg-entrance", "govt-jobs"] }]), { "pg-entrance": 2, "all-streams": 1, "govt-jobs": 1 });
  const f = fileNameFor("https://exams.nta.ac.in/AIAPGET/images/AIAPGET 2026 Bulletin.pdf", "pdf");
  assert.match(f, /^exams-nta-ac-in-aiapget-images-aiapget-2026-bulletin-[0-9a-f]{8}\.pdf$/);
  assert.equal(fileNameFor("https://exams.nta.ac.in/AIAPGET/images/AIAPGET 2026 Bulletin.pdf", "pdf"), f, "deterministic");
  const rules = parseRobots("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\nAllow: /admin/public\n");
  assert.equal(robotsAllows(rules, "https://upsc.gov.in/examinations/active-exams"), true);
  assert.equal(robotsAllows(rules, "https://upsc.gov.in/admin/x"), false);
  assert.equal(robotsAllows(rules, "https://upsc.gov.in/admin/public/notice.pdf"), true);
});
