/**
 * Phase A quota meter + lite mode (server/quota.js).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PLAN_MODE } from "../shared/productConfig.js";
import { effectivePageMax, isLiteMode, noteRead, noteWrite, quotaSnapshot } from "../server/quota.js";

test("PLAN_MODE is free until funded; lite is opt-in", () => {
  assert.equal(PLAN_MODE, "free");
  assert.equal(isLiteMode({}), false);
  assert.equal(isLiteMode({ AYM_LITE_MODE: "1" }), true);
  assert.equal(effectivePageMax(50), 50);
  process.env.AYM_LITE_MODE = "1";
  try {
    assert.equal(effectivePageMax(50), 25);
  } finally {
    delete process.env.AYM_LITE_MODE;
  }
});

test("meter accumulates and surfaces recommendLite thresholds without secrets", () => {
  noteRead(100);
  noteWrite(50);
  const q = quotaSnapshot({ AYM_LITE_MODE: "" });
  assert.equal(q.planMode, "free");
  assert.equal(q.liteMode, false);
  assert.ok(q.estimatedReads >= 100);
  assert.ok(q.estimatedWrites >= 50);
  assert.equal(typeof q.readPct, "number");
  assert.equal(typeof q.writePct, "number");
  assert.equal("recommendLite" in q, true);
  assert.doesNotMatch(JSON.stringify(q), /token|secret|password|pin/i);
});
