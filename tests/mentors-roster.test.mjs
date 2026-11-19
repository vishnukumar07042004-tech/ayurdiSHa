/**
 * Meet the Mentors roster: official AIIA faculty plus the existing WAC tentative list.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MENTORS, MENTORS_META, mentorsWithNames, mentorPortraitUrl, mentorDocumentPhotoUrl } from "../src/mentors.js";
import { getMentorDomain } from "../src/mentorDomains.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const named = mentorsWithNames(MENTORS);
const names = named.map((m) => m.name);

test("roster count matches named mentors", () => {
  assert.equal(named.length, MENTORS_META.count);
  assert.equal(MENTORS.length, MENTORS_META.count);
});

test("official AIIA faculty are on the Meet the Mentors roster with given titles", () => {
  const byName = Object.fromEntries(named.map((m) => [m.name, m]));

  const director = byName["Prof. Vd. Pradeep Kumar Prajapati"];
  assert.ok(director, "Director Prajapati");
  assert.equal(director.designation, "Director");
  assert.equal(director.affiliation, "All India Institute of Ayurveda");
  assert.equal(director.area, "academic");

  const dean = byName["Prof. Dr. Sujata Kadam"];
  assert.ok(dean, "Dean Kadam");
  assert.equal(dean.designation, "Dean");
  assert.equal(dean.affiliation, "All India Institute of Ayurveda Goa");
  assert.equal(dean.area, "clinician");

  const assoc = byName["Prof. Dr. Mohan Joshi"];
  assert.ok(assoc, "Associate Dean Joshi");
  assert.equal(assoc.designation, "Associate Dean and HOD, Department of Samhita and Siddhant");
  assert.equal(assoc.affiliation, "All India Institute of Ayurveda Goa");
  assert.equal(assoc.expertise, "education technologist");
  assert.equal(assoc.area, "academic");
});

test("AIIA leadership sits at the front of the hall roster", () => {
  assert.equal(named[0].name, "Prof. Vd. Pradeep Kumar Prajapati");
  assert.equal(named[1].name, "Prof. Dr. Sujata Kadam");
  assert.equal(named[2].name, "Prof. Dr. Mohan Joshi");
});

test("existing tentative mentors remain", () => {
  assert.ok(names.includes("Vd. Hiten Vaja"));
  assert.ok(names.includes("Dr. Galib"));
  assert.ok(names.includes("Dr. P. Rammanohar (Rammanohar Puthiyedath)"));
});

test("AIIA Director and Associate Dean group under Academics & Samhita; Dean is Clinical Practice", () => {
  const byName = Object.fromEntries(named.map((m) => [m.name, m]));
  assert.equal(getMentorDomain(byName["Prof. Vd. Pradeep Kumar Prajapati"]), "Academics & Samhita");
  assert.equal(getMentorDomain(byName["Prof. Dr. Mohan Joshi"]), "Academics & Samhita");
  assert.equal(getMentorDomain(byName["Prof. Dr. Sujata Kadam"]), "Clinical Practice");
});

test("each mentor card has a unique illustrated portrait file", () => {
  const urls = named.map((m) => mentorPortraitUrl(m));
  assert.equal(new Set(urls).size, urls.length);
  for (const m of named) {
    const url = mentorPortraitUrl(m);
    assert.match(url, /^\/assets\/mentors\/portraits\/m\d+\.webp$/);
    assert.equal(fs.existsSync(path.join(root, "public", url)), true, url);
  }
});

test("a real portrait photo wins and a document scan does not replace the illustration", () => {
  const dinesh = named.find((m) => m.id === "m19");
  assert.equal(dinesh.photoKind, "document");
  assert.equal(mentorDocumentPhotoUrl(dinesh), "/mentors/dinesh-ks.jpg");
  assert.equal(mentorPortraitUrl(dinesh), "/assets/mentors/portraits/m19.webp");
  assert.equal(mentorPortraitUrl({ id: "m01", photo: "/faculty/real.jpg", photoKind: "portrait" }), "/faculty/real.jpg");
});
