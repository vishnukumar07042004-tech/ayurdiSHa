import test from "node:test";
import assert from "node:assert/strict";
import { medicalScreen, classifyQuestion, intentOf } from "../../server/ai/classify.js";

const MEDICAL = [
  "My mother has diabetes, which Ayurvedic medicine should she take?",
  "What is the dose of ashwagandha for stress?",
  "How to cure psoriasis permanently?",
  "Can I take triphala with metformin?",
  "I have had a headache for three weeks, what should I do?",
  "Best treatment for PCOD in Ayurveda?",
  "How much chyawanprash should a 5 year old eat daily?",
  "Is it safe to give giloy to my baby?",
  "My patient has kidney stones, which kashayam works best?",
  "Side effects of shilajit capsules?",
  "mujhe acidity hai, kaunsi dawa lu? what is the remedy for acidity",
  "How do I treat hair fall naturally?",
  "Can a pregnant woman take ashwagandha churna?",
  "What is the ayurvedic medicine for thyroid?",
  "Which Ayurvedic medicine should my mother take for diabetes?",
  "Which medicine should I take for diabetes?",
  "What should my father take for his BP?",
  "Which herbs are best to take for hair fall?",
];

const CAREER = [
  "How do I get my first patients after opening a clinic?",
  "Is there scope for Panchakarma therapy centres in Kerala?",
  "Can BAMS doctors prescribe allopathic medicines legally?",
  "I have a lump sum of 5 lakh to invest in a clinic, where should I start?",
  "What is the salary of a Panchakarma therapist in Dubai?",
  "Is it safe to do an internship in a private hospital instead of a government one?",
  "How should I prepare for AIAPGET in six months?",
  "Can BAMS graduates write NEET-PG?",
  "Which journals accept case reports from BAMS interns?",
  "How do I get a GMP licence for an Ayurvedic medicine manufacturing unit?",
  "What are the rules for advertising Ayurvedic products on social media?",
  "How much time should I give to AIAPGET preparation every day?",
  "How many times can I take the AIAPGET exam?",
];

test("medical screen: clinical questions are never drafted (verdict yes)", () => {
  for (const q of MEDICAL) {
    const r = medicalScreen(q);
    assert.equal(r.verdict, "yes", `${q} → ${JSON.stringify(r)}`);
  }
});

test("medical screen: career questions that mention patients, medicines or safety stay draftable", () => {
  for (const q of CAREER) {
    const r = medicalScreen(q);
    assert.equal(r.verdict, "no", `${q} → ${JSON.stringify(r)}`);
  }
});

test("medical screen: weak career framing around a disease is 'maybe'; a treatment ask or a relative's illness is 'yes'; a strong career context is 'no'", () => {
  assert.equal(medicalScreen("I am suffering from anxiety about the AIAPGET exam, how should I prepare?").verdict, "maybe");
  for (const q of [
    "Which PG branch is best for treating skin diseases?",
    "My mother has arthritis — should I specialise in Kayachikitsa to treat her?",
  ]) {
    assert.equal(medicalScreen(q).verdict, "yes", q);
  }
  const thesis = medicalScreen("Is management of PCOS a good PG thesis topic?");
  assert.equal(thesis.verdict, "no");
  assert.equal(thesis.careerContext, true);
});

test("intent: NEET-PG and AIAPGET get different intent keys; same ask shares one", () => {
  const theme = "Academics, Teaching & Higher Education";
  const a = intentOf("Can BAMS students write NEET-PG?", "", theme);
  const b = intentOf("Can BAMS students appear for AIAPGET?", "", theme);
  const c = intentOf("Am I allowed to appear in AIAPGET after BAMS?", "", theme);
  assert.notEqual(a.key, b.key);
  assert.ok(b.subjects.includes("aiapget") && c.subjects.includes("aiapget"));
  assert.ok(a.subjects.includes("neetpg"));
});

test("intent: different countries never share an intent", () => {
  const t = "Practice Abroad & Practitioner Mobility";
  assert.notEqual(intentOf("How can I practise Ayurveda in the UK?", "", t).key, intentOf("How can I practise Ayurveda in the USA?", "", t).key);
});

test("streams: AIAPGET and government-job questions route to their pilot streams", () => {
  const pg = classifyQuestion({ question: "What is the AIAPGET cut-off for MD Kayachikitsa?", context: "", theme: "Academics, Teaching & Higher Education", subtheme: "Choosing a PG branch" });
  assert.equal(pg.stream, "pg-entrance");
  const neet = classifyQuestion({ question: "Can BAMS students write NEET-PG?", context: "", theme: "Academics, Teaching & Higher Education", subtheme: "Choosing a PG branch" });
  assert.equal(neet.stream, "pg-entrance", "NEET-PG vs AIAPGET confusion is answered by the PG-entrance expert");
  const gov = classifyQuestion({ question: "How do I become an Ayurveda medical officer through the state PSC exam?", context: "", theme: "Policy, Public Health & Global Agencies", subtheme: "Government service routes" });
  assert.equal(gov.stream, "govt-jobs");
  const branch = classifyQuestion({ question: "Is Kayachikitsa a good PG branch if I like clinical work?", context: "", theme: "Academics, Teaching & Higher Education", subtheme: "Choosing a PG branch" });
  assert.equal(branch.stream, "pg-entrance");
});

test("streams: a persona registry is used when present", () => {
  const personas = {
    streams: [{ id: "pg-entrance", label: "PG entrance" }, { id: "general", label: "General" }],
    personaFor: theme => (theme.startsWith("Academics") ? { id: "pg-entrance", label: "PG mentor" } : { id: "general" }),
  };
  const r = classifyQuestion({ question: "Is Kayachikitsa a good PG branch?", context: "", theme: "Academics, Teaching & Higher Education", subtheme: "" }, personas);
  assert.equal(r.stream, "pg-entrance");
  assert.equal(r.persona.label, "PG mentor");
});

test("streams: a self-introduction as an intern does not override the topic", async () => {
  const { getPersonas } = await import("../../server/ai/runtime.js");
  const personas = await getPersonas();
  const abroad = classifyQuestion({ question: "I am a BAMS intern. What is the eligibility for practising Ayurveda in Australia?", context: "", theme: "Practice Abroad & Practitioner Mobility", subtheme: "Licensing & registration" }, personas);
  assert.equal(abroad.stream, "practice-abroad");
  const clinic = classifyQuestion({ question: "I am a BAMS intern. What registrations do I need to open an Ayurveda clinic in Karnataka?", context: "", theme: "Clinical Practice & Integrative Care", subtheme: "Setting up private practice" }, personas);
  assert.equal(clinic.stream, "clinical-practice");
  const intern = classifyQuestion({ question: "I am a BAMS intern. Is a private hospital internship as good as a government one?", context: "", theme: "Clinical Practice & Integrative Care", subtheme: "Setting up private practice" }, personas);
  assert.equal(intern.stream, "internship-early-career");
});
