import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const header = readFileSync(join(root, "src/AppHeader.jsx"), "utf8");
const footer = readFileSync(join(root, "src/SiteFooter.jsx"), "utf8");

const primaryBlock = header.match(/const primaryLinks = \[([\s\S]*?)\n  \];/)[1];
const primaryKeys = [...primaryBlock.matchAll(/key: "([a-z]+)"/g)].map((m) => m[1]);

test("primary nav order is Home, The Hall, Meet Mentors", () => {
  assert.deepEqual(primaryKeys.slice(0, 3), ["home", "hall", "mentors"]);
  assert.equal(new Set(primaryKeys).size, primaryKeys.length, "no duplicate nav keys");
});

test("The Hall nav item links to /#hall and highlights on that hash", () => {
  assert.match(primaryBlock, /key: "hall", label: "The Hall", to: "\/#hall", active: hallActive/);
  assert.match(header, /const hallActive = location\.pathname === "\/" && location\.hash === "#hall";/);
});

test("desktop and mobile nav render the same primaryLinks list", () => {
  assert.match(header, /<nav className="ed-nav-links"[^>]*>\s*\{primaryLinks\.map/);
  assert.match(header, /<ul className="ed-overlay-primary">\s*\{primaryLinks\.map/);
});

test("the Hall is not duplicated in the More flyout or mobile groups", () => {
  assert.doesNotMatch(header, /Enter the Hall/);
  assert.doesNotMatch(header, /id: "hall"/);
  assert.doesNotMatch(header, /go\("hall"\)/);
});

test("About lives in More (desktop) and the mobile groups, not the primary row", () => {
  assert.ok(!primaryKeys.includes("about"));
  const flyout = header.match(/className="ui-flyout"[\s\S]*?<\/header>/)[0];
  const overlayGroups = header.match(/className="ed-overlay-groups"[\s\S]*?<\/nav>/)[0];
  assert.match(flyout, /<Link to="\/about"/);
  assert.match(overlayGroups, /<Link to="\/about"/);
});

test("header CTA is a Profile chip, not Meet a mentor; Meet Mentors stays in primaryLinks", () => {
  assert.match(primaryBlock, /key: "mentors", label: "Meet Mentors"/);
  assert.match(header, /ed-account-chip/);
  assert.match(header, /to="\/account"/);
  assert.doesNotMatch(header, /Meet a mentor/i);
  assert.doesNotMatch(header, /className="[^"]*ed-nav-cta/);
  assert.match(header, /className="ui-btn ui-btn--primary[^"]*"[^>]*>\s*Profile/);
});

test("footer Explore lists The Hall after Home", () => {
  const explore = footer.match(/aria-label="Explore">([\s\S]*?)<\/nav>/)[1];
  const hrefs = [...explore.matchAll(/<Link to="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs.slice(0, 3), ["/", "/#hall", "/mentors"]);
});
