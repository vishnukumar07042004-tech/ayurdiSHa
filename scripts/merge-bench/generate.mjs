#!/usr/bin/env node
/**
 * Builds the labelled merge benchmark: node scripts/merge-bench/generate.mjs [count=1200] [seed=2026]
 * Writes tests/fixtures/merge-1200.json. Deterministic for a given count + seed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { T, SUBS, SLOTS, INTENTS, SINGLES, PREFIXES, SUFFIXES, CONTEXTS } from "./intents.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const COUNT = Number(process.argv[2] || 1200);
const SEED = Number(process.argv[3] || 2026);

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const pick = arr => arr[Math.floor(rnd() * arr.length)];

function fill(tpl) {
  return tpl.replace(/\{([A-Z]+)\}/g, (_, k) => pick(SLOTS[k]));
}

function typo(text) {
  const words = text.split(" ");
  const idx = words.map((w, i) => (/^[A-Za-z]{6,}$/.test(w) ? i : -1)).filter(i => i >= 0);
  if (!idx.length) return text;
  const i = pick(idx);
  const w = words[i];
  const p = 1 + Math.floor(rnd() * (w.length - 2));
  const kind = rnd();
  words[i] = kind < 0.4 ? w.slice(0, p) + w[p + 1] + w[p] + w.slice(p + 2)
    : kind < 0.75 ? w.slice(0, p) + w.slice(p + 1)
      : w.slice(0, p) + w[p] + w.slice(p);
  return words.join(" ");
}

function studentise(q) {
  let s = q;
  if (rnd() < 0.18) s = typo(s);
  if (rnd() < 0.05) s = typo(s);
  if (rnd() < 0.3) s = pick(PREFIXES) + s.charAt(0).toLowerCase() + s.slice(1);
  if (rnd() < 0.22) s = s.replace(/[?.]*$/, "") + pick(SUFFIXES);
  const c = rnd();
  if (c < 0.28) s = s.toLowerCase();
  else if (c < 0.31) s = s.toUpperCase();
  if (rnd() < 0.15) s = s.replace(/[?.!,—:]/g, "");
  return s.replace(/\s+/g, " ").trim();
}

function placeFor(intent) {
  const r = rnd();
  const home = [intent.theme, intent.sub];
  if (r < 0.8) return home;
  if (r < 0.92 && intent.alt.length) return pick(intent.alt);
  if (r < 0.97 && intent.theme !== "NS") return [intent.theme, pick(SUBS[intent.theme])];
  const other = pick(Object.keys(SUBS).filter(k => k !== intent.theme));
  return [other, pick(SUBS[other])];
}

const totalW = INTENTS.reduce((a, x) => a + x.w, 0);
const budget = COUNT - SINGLES.length;
const counts = INTENTS.map(x => Math.max(2, Math.round((x.w / totalW) * budget)));
let diff = budget - counts.reduce((a, b) => a + b, 0);
for (let i = 0; diff !== 0; i = (i + 1) % counts.length) {
  if (diff > 0) { counts[i]++; diff--; } else if (counts[i] > 2) { counts[i]--; diff++; }
}

const items = [];
INTENTS.forEach((intent, k) => {
  for (let n = 0; n < counts[k]; n++) {
    const [tk, sub] = placeFor(intent);
    items.push({
      intent: intent.id, fam: intent.fam, homeTheme: T[intent.theme],
      theme: T[tk], subtheme: sub,
      question: studentise(fill(pick(intent.t))),
      context: rnd() < 0.4 ? pick(CONTEXTS) : "",
    });
  }
});
SINGLES.forEach(([tk, sub, text], i) => {
  items.push({ intent: `single_${i}`, fam: `single_${i}`, homeTheme: T[tk], theme: T[tk], subtheme: sub, question: studentise(text), context: rnd() < 0.4 ? pick(CONTEXTS) : "" });
});

for (let i = items.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [items[i], items[j]] = [items[j], items[i]];
}
const t0 = Date.UTC(2026, 10, 12, 4, 0, 0);
const subs = items.map((x, i) => ({
  id: `B${String(i + 1).padStart(4, "0")}`, ticket: `AYM-Q-B${String(i + 1).padStart(4, "0")}`,
  createdAt: t0 + i * 17_000, ...x,
}));

const out = path.join(here, "../../tests/fixtures", `merge-${COUNT}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ seed: SEED, count: subs.length, intents: INTENTS.length + SINGLES.length, subs }, null, 1));
const offHome = subs.filter(s => s.theme !== s.homeTheme).length;
console.log(`Wrote ${subs.length} questions, ${INTENTS.length} intents + ${SINGLES.length} one-offs → ${path.relative(process.cwd(), out)}`);
console.log(`Students who picked a different theme than their intent's home: ${offHome} (${((offHome / subs.length) * 100).toFixed(1)}%)`);
