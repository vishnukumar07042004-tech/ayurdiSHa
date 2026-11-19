import test from "node:test";
import assert from "node:assert/strict";
import { draftLetter } from "../shared/draftLetter.js";

test("draftLetter reads answer, then letter/body/scripted, and skips JSON blobs in text", () => {
  assert.equal(draftLetter(null), "");
  assert.equal(draftLetter({ answer: "  GPT letter.  " }), "GPT letter.");
  assert.equal(draftLetter({ answer: "", letter: "On the letter field." }), "On the letter field.");
  assert.equal(draftLetter({ answer: "", body: "On body." }), "On body.");
  assert.equal(draftLetter({ answer: "", scripted: { answer: "Scripted reply." } }), "Scripted reply.");
  assert.equal(draftLetter({ answer: "", text: "Plain prose from the model." }), "Plain prose from the model.");
  assert.equal(draftLetter({ answer: "", text: '{"answer":""}' }), "");
  assert.equal(draftLetter({ Answer: "Capital A." }), "Capital A.");
  assert.equal(draftLetter({ answer: ["Para one.", "Para two."] }), "Para one.\n\nPara two.");
});
