/**
 * Ask Desk draft — question fields only, sessionStorage (cleared on successful submit).
 * No identity, hall, or consent fields (those stay session-local in React state only).
 */

export const ASK_QUESTION_DRAFT_KEY = "aym-ask-q-draft-v2";

/** Legacy key (localStorage, broader fields) — cleared when migrating. */
const LEGACY_ASK_DRAFT_KEY = "aym-ask-draft-v1";

export function loadAskQuestionDraft() {
  try {
    const raw = sessionStorage.getItem(ASK_QUESTION_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      theme: String(parsed.theme || ""),
      subtheme: String(parsed.subtheme || ""),
      question: String(parsed.question || ""),
      context: String(parsed.context || ""),
      outcome: String(parsed.outcome || ""),
    };
  } catch {
    return null;
  }
}

export function saveAskQuestionDraft(fields) {
  try {
    const keep = {
      theme: fields.theme || "",
      subtheme: fields.subtheme || "",
      question: fields.question || "",
      context: fields.context || "",
      outcome: fields.outcome || "",
    };
    sessionStorage.setItem(ASK_QUESTION_DRAFT_KEY, JSON.stringify(keep));
  } catch { /* private mode */ }
}

export function clearAskQuestionDraft() {
  try { sessionStorage.removeItem(ASK_QUESTION_DRAFT_KEY); } catch { /* ignore */ }
  try { localStorage.removeItem(LEGACY_ASK_DRAFT_KEY); } catch { /* ignore */ }
}

/** True when there is unsaved question text worth warning about on leave. */
export function askQuestionDraftDirty(fields) {
  const q = String(fields?.question || "").trim();
  return q.length > 0;
}
