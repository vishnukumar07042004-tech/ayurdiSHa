import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { HALL_MAP_ZONES, hallZoneHref } from "../src/components/hallMapZones.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appSrc = readFileSync(join(root, "src/App.jsx"), "utf8");

const tabIds = JSON.parse(
  appSrc.match(/const APP_TAB_IDS = (\[[^\]]+\]);/)[1]
);
const publicTabs = new Set(
  [...appSrc.matchAll(/\{ id: "([a-z]+)", label: "[^"]+", icon: \w+, public: true \}/g)].map(m => m[1])
);
publicTabs.add("podcast");
const routePaths = new Set([...appSrc.matchAll(/<Route path="([^"]+)"/g)].map(m => m[1]));

test("hall map has the eight zones with unique ids", () => {
  assert.equal(HALL_MAP_ZONES.length, 8);
  assert.equal(new Set(HALL_MAP_ZONES.map(z => z.id)).size, 8);
});

test("every zone has a sentence-case label, a one-line body and a CTA", () => {
  for (const z of HALL_MAP_ZONES) {
    assert.ok(z.label && z.label.trim() === z.label, `${z.id} label`);
    assert.match(z.label, /^[A-Z][a-z-]*( [a-z-]+)*$/, `${z.id} label is sentence case`);
    assert.ok(z.body.length > 20 && z.body.length < 140, `${z.id} body length`);
    assert.ok(!/\n/.test(z.body), `${z.id} body is one line`);
    assert.ok(z.cta && z.cta.length < 30, `${z.id} cta`);
    assert.doesNotMatch(`${z.label} ${z.body}`, /AIIA|Goa|AyurDisha/, `${z.id} copy`);
  }
});

test("every zone targets a public in-app view or an existing route", () => {
  for (const z of HALL_MAP_ZONES) {
    assert.ok(Boolean(z.tab) !== Boolean(z.to), `${z.id} has exactly one of tab/to`);
    if (z.tab) {
      assert.ok(tabIds.includes(z.tab), `${z.id}: #${z.tab} is an app tab`);
      assert.ok(publicTabs.has(z.tab), `${z.id}: #${z.tab} is public`);
      assert.equal(hallZoneHref(z), `/#${z.tab}`);
    } else {
      assert.ok(routePaths.has(z.to), `${z.id}: ${z.to} is a route`);
      assert.equal(hallZoneHref(z), z.to);
    }
  }
});

test("every point sits inside the image (0–100%)", () => {
  for (const z of HALL_MAP_ZONES) {
    assert.ok(z.points.length >= 1, `${z.id} has a pin`);
    for (const p of z.points) {
      for (const v of [p.x, p.y]) {
        assert.ok(Number.isFinite(v) && v >= 0 && v <= 100, `${z.id} coordinate ${v}`);
      }
    }
  }
});

test("primary pins are not stacked on top of each other", () => {
  const pins = HALL_MAP_ZONES.map(z => z.points[0]);
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      const d = Math.hypot(pins[i].x - pins[j].x, pins[i].y - pins[j].y);
      assert.ok(d > 6, `pins ${i + 1} and ${j + 1} are ${d.toFixed(1)}% apart`);
    }
  }
});

test("hall map images exist within budget", () => {
  for (const [file, maxKb] of [["hall-map.webp", 220], ["hall-map-m.webp", 120]]) {
    const p = join(root, "public/assets/hall", file);
    assert.ok(existsSync(p), file);
    assert.ok(statSync(p).size / 1024 <= maxKb, `${file} ≤ ${maxKb} KB`);
  }
});
