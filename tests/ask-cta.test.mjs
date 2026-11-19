/** Home Ask Desk CTA + floating button (spec: docs/design/copy/ASK-CTA-AND-COPY-SPEC.md §1–3). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { askFabAllowedOn, askFabVisible, ASK_FAB_SCROLL_MIN } from "../src/askFabRules.js";
import { ASK_DESK, ASK_HREF, ASK_KICKER } from "../src/content/glossary.js";
import { ASK_EXAMPLES, ASK_PROMPTS, pickAskExample } from "../src/content/askPrompts.js";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const read = (p) => readFileSync(join(root, p), "utf8");

test("glossary: short Ask Desk wording and the QR short link", () => {
  assert.equal(ASK_DESK, "Ask Desk");
  assert.equal(ASK_KICKER, "Career question?");
  assert.equal(ASK_HREF, "/ask");
});

test("floating button is hidden on the Ask flow, Track, welcome and staff routes", () => {
  for (const loc of [
    { pathname: "/", hash: "#ask" },
    { pathname: "/", hash: "#register" },
    { pathname: "/", hash: "#track" },
    { pathname: "/", hash: "#curate" },
    { pathname: "/", hash: "#insights" },
    { pathname: "/", hash: "#pack" },
    { pathname: "/", hash: "#ai" },
    { pathname: "/", hash: "#staff" },
    { pathname: "/ask", hash: "" },
    { pathname: "/A/", hash: "" },
    { pathname: "/welcome", hash: "" },
    { pathname: "/track-answer", hash: "" },
    { pathname: "/staff/curation", hash: "" },
  ]) {
    assert.equal(askFabAllowedOn(loc), false, `${loc.pathname}${loc.hash}`);
  }
  for (const loc of [
    { pathname: "/", hash: "" },
    { pathname: "/", hash: "#hall" },
    { pathname: "/", hash: "#board" },
    { pathname: "/mentors", hash: "" },
    { pathname: "/mentors/dr-x", hash: "" },
    { pathname: "/programs", hash: "" },
    { pathname: "/about", hash: "" },
  ]) {
    assert.equal(askFabAllowedOn(loc), true, `${loc.pathname}${loc.hash}`);
  }
});

test("floating button appears only after scrolling past every in-page Ask CTA", () => {
  const past = ASK_FAB_SCROLL_MIN + 1;
  assert.equal(askFabVisible({ scrollY: 0 }), false, "top of page");
  assert.equal(askFabVisible({ scrollY: ASK_FAB_SCROLL_MIN }), false, "threshold is exclusive");
  assert.equal(askFabVisible({ scrollY: past }), true);
  assert.equal(askFabVisible({ scrollY: past, ctaInView: true }), false, "hero/band CTA still visible");
  assert.equal(askFabVisible({ scrollY: past, footerInView: true }), false, "near footer");
  assert.equal(askFabVisible({ scrollY: past, dismissed: true }), false, "dismissed this session");
  assert.equal(askFabVisible({ scrollY: past, allowed: false }), false, "hidden route");
  assert.equal(askFabVisible({ scrollY: past, menuOpen: true }), false, "mobile menu open");
});

test("hero: Ask Desk is the single filled primary and links to /ask", () => {
  const hero = read("src/pages/home/HomeHero.jsx");
  assert.match(hero, /<Link to=\{ASK_HREF\}[^>]*className="hx-ask"[^>]*data-ask-cta/);
  assert.match(hero, /\{ASK_KICKER\}/);
  assert.match(hero, /\{ASK_DESK\}/);
  assert.match(hero, /variant="on-dark-secondary"[^>]*>\s*Explore mentors/);
  assert.doesNotMatch(hero, /variant="on-dark"[\s>]/, "no second filled button in the hero");
  assert.doesNotMatch(hero, /A WAC mentor answers in writing/);
  assert.doesNotMatch(hero, /BAMS students/);
});

test("hero CTA: one-time sheen, ≥ 48 px, focus ring, reduced-motion off switch", () => {
  const css = read("src/styles/home-hero.css");
  const block = css.match(/\.hx-ask \{([\s\S]*?)\n\}/)[1];
  assert.match(block, /min-height:\s*58px/);
  assert.match(block, /animation:\s*hx-ask-glow[^;]*\b1\b/, "glow runs once");
  assert.match(css, /\.hx-ask::after \{[\s\S]*?animation:\s*hx-ask-sheen[^;]*\b1\b/, "sheen runs once");
  assert.match(css, /\.hx-ask:focus-visible \{[\s\S]*?outline:/);
  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\}\s*$/)[1];
  assert.match(reduced, /\.hx-ask::after \{ display: none; \}/);
  assert.match(reduced, /\.hx-ask,[\s\S]*animation: none !important/);
});

test("floating button: mounted once site-wide, links to /ask, dismissible, reduced motion", () => {
  const footer = read("src/SiteFooter.jsx");
  assert.match(footer, /<AskDeskFab \/>/);
  const fab = read("src/components/AskDeskFab.jsx");
  assert.match(fab, /<Link to=\{ASK_HREF\}/);
  assert.match(fab, /aria-label="Hide Ask Desk button"/);
  assert.match(fab, /setAttribute\("inert"/);
  const css = read("src/styles/ask-fab.css");
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /min-height:\s*5[24]px/);
});

test("Ask Desk band CTA uses the glossary and is watched by the floating button", () => {
  const band = read("src/pages/home/HomeAskDesk.jsx");
  assert.match(band, /data-ask-cta=""[^>]*>\s*<span>\{ASK_DESK\}<\/span>/);
});

test("Ask examples are inclusive and the BAMS-only heading is gone", () => {
  assert.ok(ASK_EXAMPLES.length >= 3 && ASK_EXAMPLES.length <= 4);
  for (const e of ASK_EXAMPLES) assert.doesNotMatch(e, /BAMS/);
  assert.equal(pickAskExample(() => 0), ASK_EXAMPLES[0]);
  assert.equal(pickAskExample(() => 0.9999), ASK_EXAMPLES[ASK_EXAMPLES.length - 1]);
  const app = read("src/App.jsx");
  assert.match(app, /What should my next career step in Ayurveda be\?/);
  assert.doesNotMatch(app, /What should I do after BAMS/);
  for (const p of ASK_PROMPTS) assert.ok(p.label.length <= 22, `chip label too long: ${p.label}`);
});
