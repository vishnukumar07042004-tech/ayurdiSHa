import test from "node:test";
import assert from "node:assert/strict";
import { redactText, redactQuestion, leaksPersonalData } from "../../server/ai/redact.js";

test("redact: email, phone, WAC number, ticket, profile links and handles", () => {
  const { text, found } = redactText(
    "Mail me at ravi.k@gmail.com or call +91 98765 43210 / 9876543210. WAC 11WAC/2026/0042, ticket AYM-Q-M4KX2P9. " +
    "Insta instagram.com/ravi_ayur, linkedin https://www.linkedin.com/in/ravi-kumar-12, @ravi_ayur.",
  );
  for (const bad of ["ravi.k@gmail.com", "98765 43210", "9876543210", "11WAC/2026/0042", "AYM-Q-M4KX2P9", "instagram.com", "linkedin.com/in", "@ravi_ayur"]) {
    assert.ok(!text.includes(bad), `${bad} removed from: ${text}`);
  }
  assert.ok(found.email >= 1 && found.phone >= 2 && found["wac-id"] === 1 && found.ticket === 1 && found.link >= 2 && found.handle >= 1);
});

test("redact: names from the record and from introductions, in any case", () => {
  const r = redactQuestion({
    name: "Ananya Rao",
    email: "ananya@x.in",
    question: "Hello, my name is ananya rao and I am a final year student. Should I take AIAPGET this year?",
    context: "Myself Dr. Kiran Mehta from Pune. Regards, Ananya",
  });
  assert.ok(!/ananya/i.test(r.question), r.question);
  assert.ok(!/kiran|mehta/i.test(r.context), r.context);
  assert.match(r.question, /AIAPGET this year/, "the career question itself survives");
  assert.match(r.context, /from Pune/, "non-personal context survives");
});

test("redact: keeps years, fees, ranks and course names intact", () => {
  const { text } = redactText("Is the AIAPGET 2026 fee Rs 2,700 and is rank 1500 enough for MD Kayachikitsa? I scored 312 marks in 2025.");
  assert.equal(text, "Is the AIAPGET 2026 fee Rs 2,700 and is rank 1500 enough for MD Kayachikitsa? I scored 312 marks in 2025.");
});

test("redact: an introduction without a name is left alone", () => {
  const { text } = redactText("I am a BAMS intern. Myself final year student from Kerala.");
  assert.equal(text, "I am a BAMS intern. Myself final year student from Kerala.");
  const t2 = redactText("I am Indian and I am interested in AIAPGET. I'm BAMS final year. This is AIIA's notice.").text;
  assert.equal(t2, "I am Indian and I am interested in AIAPGET. I'm BAMS final year. This is AIIA's notice.");
});

test("redact: 'I am <Name>' introductions without the name on the record", () => {
  const { text } = redactText("Who conducts AIAPGET? I am Kavya Menon, final year. This is Ravi from Pune.");
  assert.ok(!/kavya|menon|ravi/i.test(text), text);
  assert.match(text, /from Pune/);
});

test("leak check: flags remaining personal values, passes redacted text", () => {
  const rec = { name: "Ravi Kumar", email: "ravi@gmail.com" };
  assert.equal(leaksPersonalData("Dear Ravi, AIAPGET is run by NTA.", rec), true);
  assert.equal(leaksPersonalData("Call 9876543210", rec), true);
  assert.equal(leaksPersonalData("Your number 11WAC/2026/0001", rec), true);
  assert.equal(leaksPersonalData("AIAPGET is conducted by NTA every year; the 2026 fee is Rs 2,700.", rec), false);
});
