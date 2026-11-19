import test from "node:test";
import assert from "node:assert/strict";
import { citeIds, citeGroups, stripCitationMarks } from "../../shared/citations.js";
import { verifyDraft } from "../../server/ai/verify.js";
import { setAllowListForTests } from "../../server/ai/sources.js";
import { ALLOW, CHUNKS, NOW } from "./helpers.mjs";

test("combined citation markers are parsed and stripped", () => {
  const text = "AIAPGET is run by NTA [c:a, c:b]. Fee is Rs 2,700 [c:a;c:b] and [c:c,d]. Single [c:e].";
  assert.deepEqual(citeIds(text), ["a", "b", "a", "b", "c", "d", "e"]);
  assert.deepEqual(citeGroups("x [c:a, c:b]")[0].ids, ["a", "b"]);
  const plain = stripCitationMarks(text);
  assert.ok(!/\[\s*c:/.test(plain), plain);
  assert.equal(plain, "AIAPGET is run by NTA. Fee is Rs 2,700 and. Single.");
  assert.equal(stripCitationMarks("Line one [c:a]\n\nLine two [ c:b , c:c ]"), "Line one\n\nLine two");
});

function chunkMap(ids) {
  return new Map(CHUNKS.filter(c => ids.includes(c.id)).map(c => [c.id, c]));
}

test("verifier accepts combined markers as valid citations", async () => {
  setAllowListForTests(ALLOW);
  const draft = {
    answer: "BAMS graduates take AIAPGET for Ayurveda postgraduate seats [c:nta-aiapget-2026-1, c:nbems-neetpg-1].",
    actions: [], mistake: "", citations: [],
  };
  const r = await verifyDraft({ draft, chunksById: chunkMap(["nta-aiapget-2026-1", "nbems-neetpg-1"]), now: NOW });
  assert.equal(r.counts.invalidCitations, 0);
  assert.ok(r.claimChecks.every(c => c.chunkIds.length === 2), JSON.stringify(r.claimChecks));
});

test("verifier does not reject a year that only appears in the source title or date", async () => {
  setAllowListForTests(ALLOW);
  const chunk = { ...CHUNKS.find(c => c.id === "nbems-neetpg-1") };
  const draft = {
    answer: "As per the 2026 NEET-PG eligibility notice, only MBBS graduates can appear for NEET-PG [c:nbems-neetpg-1].",
    actions: [], mistake: "", citations: [],
  };
  const r = await verifyDraft({ draft, chunksById: new Map([[chunk.id, chunk]]), now: NOW });
  assert.ok(!r.claimChecks.some(c => /number 2026/.test(c.note)), JSON.stringify(r.claimChecks));
});

test("verifier accepts academic-year ranges written either way", async () => {
  setAllowListForTests(ALLOW);
  const chunk = { ...CHUNKS[0], id: "range-1", text: "Admissions for session 2026-2027 follow the AIAPGET merit list." };
  const draft = { answer: "Admissions for the 2026-27 session use the AIAPGET merit list [c:range-1].", actions: [], mistake: "", citations: [] };
  const r = await verifyDraft({ draft, chunksById: new Map([[chunk.id, chunk]]), now: NOW });
  assert.ok(!r.claimChecks.some(c => /not found in the cited source/.test(c.note)), JSON.stringify(r.claimChecks));
});

test("verifier still rejects a number missing from the source", async () => {
  setAllowListForTests(ALLOW);
  const draft = { answer: "The AIAPGET 2026 fee is Rs 9,999 [c:nta-aiapget-2026-1].", actions: [], mistake: "", citations: [] };
  const r = await verifyDraft({ draft, chunksById: chunkMap(["nta-aiapget-2026-1"]), now: NOW });
  assert.ok(r.claimChecks.some(c => c.status === "unsupported" && /9999/.test(c.note)), JSON.stringify(r.claimChecks));
});
