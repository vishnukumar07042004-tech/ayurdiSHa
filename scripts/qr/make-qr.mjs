#!/usr/bin/env node
/**
 * QR codes for the Ask Desk short link, written to public/qr/ and docs/qr/:
 *   ask-qr.png / ask-qr.svg                    plain black-on-white, error correction H, 4-module quiet zone
 *   ask-qr-branded.png / ask-qr-branded.svg    forest-green card with "Ask a WAC mentor"
 * Every PNG is decoded back with jsQR and must return the exact URL.
 *   node scripts/qr/make-qr.mjs [--url=https://ayushmarg.vercel.app/ask?src=qr]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { PNG } from "pngjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? true]; }));
const URL = String(args.url || "https://ayushmarg.vercel.app/ask?src=qr");
const GREEN = "#173F35";
const OUT_DIRS = [path.join(ROOT, "public/qr"), path.join(ROOT, "docs/qr")];
const QUIET = 4;

const qr = QRCode.create(URL, { errorCorrectionLevel: "H" });
const size = qr.modules.size;
const dark = (x, y) => qr.modules.get(y, x) === 1;

function modulePath(ox, oy, scale) {
  let d = "";
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!dark(x, y)) { x++; continue; }
      let run = 1;
      while (x + run < size && dark(x + run, y)) run++;
      d += `M${ox + x * scale} ${oy + y * scale}h${run * scale}v${scale}h${-run * scale}z`;
      x += run;
    }
  }
  return d;
}

function plainSvg() {
  const n = size + QUIET * 2;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="1200" height="1200" shape-rendering="crispEdges">
  <title>QR code: ${URL}</title>
  <rect width="${n}" height="${n}" fill="#ffffff"/>
  <path fill="#000000" d="${modulePath(QUIET, QUIET, 1)}"/>
</svg>
`;
}

function brandedSvg() {
  const W = 1200, H = 1500, qrBox = 1000, x0 = 100, y0 = 230;
  const scale = qrBox / (size + QUIET * 2);
  const ox = x0 + QUIET * scale, oy = y0 + QUIET * scale;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <title>Ask a WAC mentor — scan to open the AYURDISHA Ask Desk</title>
  <rect width="${W}" height="${H}" rx="48" fill="${GREEN}"/>
  <text x="${W / 2}" y="150" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="92" font-weight="700" fill="#FCFBF7">Ask a WAC mentor</text>
  <rect x="${x0}" y="${y0}" width="${qrBox}" height="${qrBox}" rx="28" fill="#ffffff"/>
  <path fill="${GREEN}" shape-rendering="crispEdges" d="${modulePath(ox, oy, scale)}"/>
  <text x="${W / 2}" y="1340" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="44" fill="#FCFBF7">Scan to open the Ask Desk</text>
  <text x="${W / 2}" y="1410" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="34" fill="#C49A52">ayushmarg.vercel.app/ask · AYURDISHA · WAC 2026</text>
</svg>
`;
}

function decodePng(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const hit = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return { text: hit ? hit.data : null, width: png.width, height: png.height };
}

async function main() {
  for (const dir of OUT_DIRS) fs.mkdirSync(dir, { recursive: true });
  const [pub, docs] = OUT_DIRS;
  const plainPng = path.join(pub, "ask-qr.png");
  await QRCode.toFile(plainPng, URL, { errorCorrectionLevel: "H", margin: QUIET, width: 1200, color: { dark: "#000000", light: "#ffffff" } });
  fs.writeFileSync(path.join(pub, "ask-qr.svg"), plainSvg());
  fs.writeFileSync(path.join(pub, "ask-qr-branded.svg"), brandedSvg());

  // Branded PNG: green modules rendered here, card + caption composed with Pillow (system fonts).
  const greenPng = path.join(pub, ".ask-qr-green.png");
  await QRCode.toFile(greenPng, URL, { errorCorrectionLevel: "H", margin: QUIET, width: 960, color: { dark: GREEN, light: "#ffffff" } });
  execFileSync("python3", [path.join(ROOT, "scripts/qr/brand-qr.py"), greenPng, path.join(pub, "ask-qr-branded.png")], { stdio: "inherit" });
  fs.unlinkSync(greenPng);

  for (const f of ["ask-qr.png", "ask-qr.svg", "ask-qr-branded.png", "ask-qr-branded.svg"]) {
    fs.copyFileSync(path.join(pub, f), path.join(docs, f));
  }
  let ok = true;
  for (const f of ["ask-qr.png", "ask-qr-branded.png"]) {
    const r = decodePng(path.join(pub, f));
    const pass = r.text === URL;
    ok = ok && pass;
    console.log(`[qr] ${f} ${r.width}x${r.height} decode=${JSON.stringify(r.text)} ${pass ? "OK" : "MISMATCH"}`);
  }
  console.log(`[qr] version=${qr.version} modules=${size} ecc=H url=${URL}`);
  if (!ok) process.exit(1);
}

main().catch(err => { console.error("[qr] fatal:", err); process.exit(1); });
