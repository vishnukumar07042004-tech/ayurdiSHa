#!/usr/bin/env node
/** Top confusions (wrong merges) and top misses for one setting. Same flags as run.mjs plus --t, --sub on|off. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const M = await import(pathToFileURL(path.resolve(arg("--engine", path.join(here, "../../shared/merge.js")))).href);
const { subs } = JSON.parse(fs.readFileSync(path.resolve(arg("--fixture", path.join(here, "../../tests/fixtures/merge-1200.json"))), "utf8"));
const t = Number(arg("--t", M.MERGE_DEFAULTS.threshold));
const useSub = arg("--sub", "on") === "on";
const extra = JSON.parse(arg("--opts", "{}"));
const byId = new Map(subs.map(s => [s.id, s]));
let n = 0;
const cl = M.buildClusters(subs, t, useSub, [], { idFactory: () => `C${++n}`, ...extra });

const conf = new Map();
const examples = new Map();
cl.forEach(c => {
  const ms = c.memberIds.map(id => byId.get(id));
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
    if (ms[i].intent === ms[j].intent) continue;
    const k = [ms[i].intent, ms[j].intent].sort().join(" × ");
    conf.set(k, (conf.get(k) || 0) + 1);
    if (!examples.has(k)) examples.set(k, [ms[i].question, ms[j].question, M.scorePair(ms[i], ms[j]).toFixed(2)]);
  }
});
console.log(`Wrong-merge pairs @${t} sub ${useSub ? "on" : "off"} — top 15`);
[...conf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => {
  const [a, b, s] = examples.get(k);
  console.log(`  ${String(v).padStart(4)}  ${k}\n        e.g. "${a}"  ~  "${b}"  (pair ${s})`);
});

const key = s => `${s.intent}|${s.theme}|${useSub ? s.subtheme : ""}`;
const pool = new Map();
subs.forEach(s => { if (!pool.has(key(s))) pool.set(key(s), []); pool.get(key(s)).push(s.id); });
const groupOf = new Map();
cl.forEach(c => c.memberIds.forEach(id => groupOf.set(id, c)));
const miss = [];
pool.forEach((ids, k) => {
  if (ids.length < 2) return;
  const singles = ids.filter(id => groupOf.get(id).memberIds.length === 1);
  const groups = new Set(ids.map(id => groupOf.get(id).id)).size;
  const ideal = Math.ceil(ids.length / (extra.maxPack || M.MERGE_DEFAULTS.maxPack));
  miss.push({ k, n: ids.length, groups, ideal, singles: singles.length, sample: singles.slice(0, 3).map(id => byId.get(id).question) });
});
console.log(`\nMost fragmented intents (same theme${useSub ? " + sub-area" : ""}) — groups used vs ideal`);
miss.sort((a, b) => (b.groups - b.ideal) - (a.groups - a.ideal)).slice(0, 14).forEach(m => {
  console.log(`  ${m.k.padEnd(62)} n=${String(m.n).padStart(3)} groups=${String(m.groups).padStart(3)} ideal=${m.ideal} singles=${m.singles}`);
  m.sample.forEach(q => console.log(`        single: ${q}`));
});
