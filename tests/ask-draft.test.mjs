/**
 * Ask Desk question draft helpers (sessionStorage, question fields only).
 */
import test from "node:test";
import assert from "node:assert/strict";

// Minimal sessionStorage / localStorage for Node.
function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
  };
}

globalThis.sessionStorage = makeStorage();
globalThis.localStorage = makeStorage();

const {
  ASK_QUESTION_DRAFT_KEY,
  loadAskQuestionDraft,
  saveAskQuestionDraft,
  clearAskQuestionDraft,
  askQuestionDraftDirty,
} = await import("../src/askDraft.js");

test("save/load round-trip keeps only question fields", () => {
  clearAskQuestionDraft();
  saveAskQuestionDraft({
    theme: "Research, Evidence & Publication",
    subtheme: "Framing a research question",
    question: "How do I start in research?",
    context: "Intern year",
    outcome: "Pick a lab",
    name: "should-not-persist",
    consentAnonPublish: true,
  });
  const raw = JSON.parse(sessionStorage.getItem(ASK_QUESTION_DRAFT_KEY));
  assert.equal(raw.name, undefined);
  assert.equal(raw.consentAnonPublish, undefined);
  const loaded = loadAskQuestionDraft();
  assert.equal(loaded.theme, "Research, Evidence & Publication");
  assert.equal(loaded.question, "How do I start in research?");
  assert.equal(loaded.context, "Intern year");
});

test("clear removes session draft and legacy localStorage key", () => {
  saveAskQuestionDraft({ question: "hello world enough chars" });
  localStorage.setItem("aym-ask-draft-v1", JSON.stringify({ question: "legacy" }));
  clearAskQuestionDraft();
  assert.equal(sessionStorage.getItem(ASK_QUESTION_DRAFT_KEY), null);
  assert.equal(localStorage.getItem("aym-ask-draft-v1"), null);
});

test("askQuestionDraftDirty only when question has text", () => {
  assert.equal(askQuestionDraftDirty({ question: "" }), false);
  assert.equal(askQuestionDraftDirty({ question: "   " }), false);
  assert.equal(askQuestionDraftDirty({ question: "Why research?" }), true);
});
