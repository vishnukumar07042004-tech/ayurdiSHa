import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

const GLOBALS = new Set([
  "Map", "Set", "WeakMap", "WeakSet", "Image", "Text", "Option", "Event", "Element", "Node",
  "Request", "Response", "Headers", "Promise", "Date", "Error", "Infinity", "NaN", "Object",
  "Array", "Symbol", "Function", "File", "Blob", "URL", "String", "Number", "Boolean",
  "Proxy", "Reflect", "JSON", "Math", "Intl", "RegExp", "Audio", "Location", "History",
  "Storage", "Notification", "Worker", "FormData", "BigInt", "Comment", "Range", "Selection",
  "Screen", "Navigator", "Window", "Document", "Crypto", "Cache", "Clipboard",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(name)) out.push(p);
  }
  return out;
}

function lucideLocalNames(source) {
  const names = [];
  const re = /import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/g;
  let m;
  while ((m = re.exec(source))) {
    for (const raw of m[1].split(",")) {
      const spec = raw.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "").trim();
      if (!spec) continue;
      const parts = spec.split(/\s+as\s+/);
      names.push((parts[1] || parts[0]).trim());
    }
  }
  return names;
}

test("lucide-react imports never shadow JS/DOM globals", () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    for (const name of lucideLocalNames(readFileSync(file, "utf8"))) {
      if (GLOBALS.has(name)) offenders.push(`${relative(ROOT, file)}: ${name}`);
    }
  }
  assert.deepEqual(offenders, [], `Alias these lucide icons (e.g. "Map as MapIcon"):\n${offenders.join("\n")}`);
});
