/**
 * Strip personal data from a student's question + context before any text leaves for an AI
 * provider: names (the record's own name plus "my name is …" / "I am Dr. …" introductions),
 * email addresses, phone numbers, Aadhaar-like ids, WAC registration numbers (11WAC/2026/NNNN),
 * Ask Desk ticket ids, and links / @handles that point at a person's profile.
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const WAC = /\b\d{1,2}\s*WAC\s*[/\-_ ]?\s*\d{4}\s*[/\-_ ]?\s*\d{1,6}\b/gi;
const TICKET = /\bAYM[-\s]?Q[-\s]?[A-Z0-9]{4,10}\b/gi;
const PROFILE_URL = /\b(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|facebook\.com|fb\.com|linkedin\.com\/in|twitter\.com|x\.com|t\.me|wa\.me|youtube\.com\/@|youtube\.com\/c(?:hannel)?|github\.com|threads\.net|snapchat\.com\/add|tiktok\.com\/@)\/?[^\s,;)]*/gi;
const ANY_URL_WITH_HANDLE = /\bhttps?:\/\/[^\s,;)]*(?:\/@|\/~|\/u\/|\/user\/|\/profile\/|\/in\/)[^\s,;)]*/gi;
const HANDLE = /(^|[\s(])@[A-Za-z0-9_.]{3,30}\b/g;
const AADHAAR = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
const PHONE = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,5}\b/g;

/** "my name is ravi kumar", "Myself Dr. Anjali", "I am Dr Mehta", "mera naam Priya" — any case. */
const INTRO_NAME = /\b(my\s+name\s+is|my\s+name's|myself|i\s*(?:am|'m)\s+dr\.?|i\s*(?:am|'m)\s+called|mera\s+naam)\s+((?:dr\.?\s+)?[a-z][a-z'.-]+(?:\s+[a-z][a-z'.-]+){0,2})/gi;
/** "I am Kavya Menon", "This is Ravi" — plain "I am" is ambiguous, so only Title-Case words count. */
const INTRO_TITLE_NAME = /\b(I\s*am|I'm|Im|This\s+is|this\s+is)\s+([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+){0,2})/g;
const NOT_A_TITLE_NAME = new Set("indian keralite malayali tamilian bengali gujarati marathi punjabi kannadiga telugu odia nepali ayurveda ayurvedic interested confused worried planning currently studying doing working from very really not also just new here".split(" "));
const NOT_A_NAME = new Set("a an the and from in at of student studying doing pursuing final first second third intern bams md ms phd graduate pg currently also working".split(" "));

function trimIntroName(words) {
  const kept = [];
  for (const w of words.split(/\s+/)) {
    if (NOT_A_NAME.has(w.toLowerCase().replace(/[.']/g, ""))) break;
    kept.push(w);
  }
  return kept;
}
const SIGN_OFF = /\b(regards|thanks|thank\s+you|sincerely|yours\s+truly|warm\s+regards)\s*[,.-]?\s*\n?\s*((?:dr\.?\s+)?[A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+){0,2})\s*\.?\s*$/;

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Words of a known person's name worth hiding (skip initials and very short words). */
function nameParts(name) {
  return String(name || "")
    .replace(/^\s*dr\.?\s+/i, "")
    .split(/[\s.]+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !/^(dr|mr|mrs|ms|the|and)$/i.test(w));
}

function countDigits(s) {
  return (String(s).match(/\d/g) || []).length;
}

/**
 * @param {string} text
 * @param {{ names?: string[], emails?: string[] }} known  values from the question record
 * @returns {{ text: string, found: Record<string, number> }}
 */
export function redactText(text, known = {}) {
  let s = String(text || "");
  const found = {};
  const bump = (k, n = 1) => { found[k] = (found[k] || 0) + n; };
  const sub = (re, label, keep) => {
    s = s.replace(re, (...m) => {
      if (keep && keep(...m)) return m[0];
      bump(label);
      return typeof label === "string" ? `[${label.toUpperCase()}]` : "";
    });
  };

  sub(EMAIL, "email");
  for (const e of known.emails || []) {
    if (e && s.toLowerCase().includes(String(e).toLowerCase())) {
      s = s.replace(new RegExp(escapeRe(e), "gi"), () => { bump("email"); return "[EMAIL]"; });
    }
  }
  sub(PROFILE_URL, "link");
  sub(ANY_URL_WITH_HANDLE, "link");
  s = s.replace(HANDLE, (m, lead) => { bump("handle"); return `${lead}[HANDLE]`; });
  sub(WAC, "wac-id");
  sub(TICKET, "ticket");
  sub(AADHAAR, "id-number");
  s = s.replace(PHONE, m => {
    const digits = countDigits(m);
    // 10–13 digits = a phone number; leave years ("2026"), fees ("1,50,000"), ranks alone.
    if (digits < 10 || digits > 13) return m;
    bump("phone");
    return "[PHONE]";
  });

  s = s.replace(INTRO_NAME, (m, lead, words) => {
    const kept = trimIntroName(words);
    if (!kept.length || (kept.length === 1 && /^dr\.?$/i.test(kept[0]))) return m;
    bump("name");
    const rest = words.split(/\s+/).slice(kept.length).join(" ");
    return `${lead} [NAME]${rest ? ` ${rest}` : ""}`;
  });
  s = s.replace(INTRO_TITLE_NAME, (m, lead, words) => {
    const kept = [];
    for (const w of words.split(/\s+/)) {
      if (NOT_A_TITLE_NAME.has(w.toLowerCase()) || NOT_A_NAME.has(w.toLowerCase().replace(/[.']/g, ""))) break;
      kept.push(w);
    }
    if (!kept.length) return m;
    bump("name");
    const rest = words.split(/\s+/).slice(kept.length).join(" ");
    return `${lead} [NAME]${rest ? ` ${rest}` : ""}`;
  });
  s = s.replace(SIGN_OFF, (m, lead) => { bump("name"); return `${lead}, [NAME]`; });
  for (const n of known.names || []) {
    for (const part of nameParts(n)) {
      const re = new RegExp(`\\b${escapeRe(part)}\\b`, "gi");
      if (re.test(s)) {
        s = s.replace(re, () => { bump("name"); return "[NAME]"; });
      }
    }
  }
  s = s.replace(/\[NAME\](?:\s+\[NAME\])+/g, "[NAME]");
  return { text: s.trim(), found };
}

/** Redact the parts of a question record that may go to a provider. */
export function redactQuestion(rec) {
  const r = rec && typeof rec === "object" ? rec : {};
  const known = {
    names: [r.name, r.fullName].filter(Boolean),
    emails: [r.email].filter(Boolean),
  };
  const q = redactText(r.question || r.text || "", known);
  const c = redactText(r.context || "", known);
  const o = redactText(r.outcome || "", known);
  const found = {};
  for (const f of [q.found, c.found, o.found]) {
    for (const [k, v] of Object.entries(f)) found[k] = (found[k] || 0) + v;
  }
  return {
    question: q.text,
    context: c.text,
    outcome: o.text,
    theme: String(r.theme || ""),
    subtheme: String(r.subtheme || ""),
    stage: String(r.stage || ""),
    found,
  };
}

/** True if any known personal value from `rec` is still present in `text` (leak check). */
export function leaksPersonalData(text, rec = {}) {
  const t = String(text || "");
  const lower = t.toLowerCase();
  if (rec.email && lower.includes(String(rec.email).toLowerCase())) return true;
  if (EMAIL.test(t)) { EMAIL.lastIndex = 0; return true; }
  EMAIL.lastIndex = 0;
  if (new RegExp(WAC.source, "i").test(t)) return true;
  if (new RegExp(TICKET.source, "i").test(t)) return true;
  for (const m of t.match(PHONE) || []) {
    const d = countDigits(m);
    if (d >= 10 && d <= 13) return true;
  }
  for (const n of [rec.name].filter(Boolean)) {
    for (const part of nameParts(n)) {
      if (new RegExp(`\\b${escapeRe(part)}\\b`, "i").test(t)) return true;
    }
  }
  return false;
}
