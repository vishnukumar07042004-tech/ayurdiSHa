/**
 * Ask Desk client: specific failure messages (never a bare "store failed"), shared option lists,
 * and no browser-only fallback for the question on a built site.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { askSubmitError, isRetryable } from "../src/askSubmitError.js";
import { ASK_STAGES, ASK_STATES, OUTSIDE_INDIA } from "../shared/askOptions.js";

const err = (status, error, extra = {}) => Object.assign(new Error(error || `Request failed (${status}).`), { status, data: error ? { error } : {}, ...extra });

test("network, timeout, 429 and 5xx messages say the question is still on the page", () => {
  const net = Object.assign(new TypeError("Failed to fetch"), { network: true });
  assert.match(askSubmitError(net), /couldn't reach the Ask Desk.*still here/);
  assert.match(askSubmitError(Object.assign(new Error("Request timed out."), { timeout: true })), /took too long.*still here.*not be sent twice/);
  assert.match(askSubmitError(err(504)), /took too long/);
  assert.match(askSubmitError(err(429, "Too many")), /wait a minute/);
  assert.match(askSubmitError(err(500, "store failed")), /having trouble.*still here/);
  assert.match(askSubmitError(err(502)), /having trouble/);
});

test("server 4xx / save_failed messages are shown as sent", () => {
  assert.equal(askSubmitError(err(400, "Register first — the hall issues your WAC registration number.")), "Register first — the hall issues your WAC registration number.");
  assert.match(askSubmitError(err(409, "That WAC registration number is already linked")), /already linked/);
  assert.match(askSubmitError(err(500, "We could not save your question just now. It is still on this page — press Send again in a moment.")), /still on this page/);
});

test("only network errors and gateway 502/503/504 are resent automatically", () => {
  assert.equal(isRetryable(Object.assign(new TypeError("Load failed"), {})), true);
  assert.equal(isRetryable(err(503)), true);
  assert.equal(isRetryable(err(400, "x")), false);
  assert.equal(isRetryable(err(500, "x")), false);
});

test("Track input: pasted / autocorrected / prefix-less tickets and emails normalise to the stored form", async () => {
  const { normalizeLookupQuery } = await import("../shared/ticket.js");
  for (const raw of ["AYM-Q-MR8SVH8X", " aym-q-mr8svh8x ", "AYM Q MR8SVH8X", "AYM–Q–MR8SVH8X", "#AYM-Q-MR8SVH8X", "aymq mr8svh8x", "MR8SVH8X", "AYM_Q_MR8SVH8X."]) {
    assert.equal(normalizeLookupQuery(raw), "aym-q-mr8svh8x", raw);
  }
  assert.equal(normalizeLookupQuery(" Student@Example.IN "), "student@example.in");
  assert.equal(normalizeLookupQuery("AYM-Q-E2EQ0"), "aym-q-e2eq0", "older short tickets unchanged");
  assert.equal(normalizeLookupQuery(""), "");
});

test("App.jsx: dropdowns come from shared/askOptions.js; new stages present; no local fallback in production", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  assert.match(app, /const STAGES = ASK_STAGES;/);
  assert.match(app, /const STATES = ASK_STATES;/);
  for (const s of ["Ayurveda student (other course)", "Researcher", "Changing careers"]) assert.ok(ASK_STAGES.includes(s), s);
  assert.equal(ASK_STATES.at(-1), OUTSIDE_INDIA);
  assert.match(app, /if \(API_REQUIRED \|\| await hasApi\(\)\)/, "Ask submit always uses the API on a built site");
  assert.match(app, /apiAvailable === false && Date\.now\(\) - apiCheckedAt < API_RETRY_MS/, "a failed ping is retried, not cached for the visit");
  assert.match(app, /regNo: String\(\(profile && profile\.regNo\) \|\| f\.regNo \|\| ""\)\.trim\(\)/, "payload still sends regNo");
});
