/**
 * Visible mentor-letter text on a DISHA draft or a model JSON object.
 *
 * GPT (Hybrid) sometimes puts the letter on `letter` / `body` / `text` / `scripted.answer`
 * instead of `answer`. Reading only `answer` left the Hybrid card blank beside a finished
 * Gemini draft. Never used to publish.
 */

function asText(x) {
  if (x == null) return "";
  if (typeof x === "string") return x.trim();
  if (typeof x === "number" && Number.isFinite(x)) return String(x);
  if (Array.isArray(x)) return x.map(asText).filter(Boolean).join("\n\n").trim();
  if (typeof x === "object") return asText(x.answer || x.text || x.body || x.letter || "");
  return "";
}

const LETTER_KEYS = ["answer", "Answer", "letter", "body", "content", "response"];

export function draftLetter(v) {
  if (v == null) return "";
  if (typeof v !== "object" || Array.isArray(v)) return asText(v);
  for (const k of LETTER_KEYS) {
    if (!(k in v)) continue;
    const s = asText(v[k]);
    if (s) return s;
  }
  if (v.scripted) {
    const s = draftLetter(v.scripted);
    if (s) return s;
  }
  if (typeof v.text === "string") {
    const t = v.text.trim();
    if (t && t[0] !== "{" && t[0] !== "[") return t;
  }
  return "";
}
