import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
export const PREVIEW_ROOT = path.resolve(dir, "..");

export const ENV_FILES = [
  path.resolve(PREVIEW_ROOT, ".env.local"),
  path.resolve(PREVIEW_ROOT, ".env"),
];

export function parseEnvFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const out = {};
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const key = line.slice(0, i).trim();
      let val = line.slice(i + 1).trim();
      if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Non-empty process.env wins (so `AI_PROVIDER=vertex node script` works locally), then .env.local,
 * then .env. Never expose this to the client.
 */
export function loadServerEnv() {
  const merged = {};
  for (const p of [...ENV_FILES].reverse()) {
    Object.assign(merged, parseEnvFile(p));
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (v != null && String(v).length) merged[k] = String(v);
  }
  return merged;
}
