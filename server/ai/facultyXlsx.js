/**
 * Minimal styled XLSX writer (Node only, no dependencies): header styling, wrapped text, column
 * widths, frozen header row, auto-filter and per-column fills. The bundled SheetJS community build
 * cannot write cell styles, and faculty review the enriched workbook in Excel.
 */

import zlib from "node:zlib";

/* ---------------------------------------------------------------- */
/* ZIP                                                               */
/* ---------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  // 2026-01-01 00:00 in DOS date/time; a fixed stamp keeps output byte-stable.
  const time = 0;
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, "utf8");
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/* ---------------------------------------------------------------- */
/* SpreadsheetML                                                     */
/* ---------------------------------------------------------------- */

function esc(s) {
  return String(s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function colName(i) {
  let s = "";
  let n = i + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Fill colours (ARGB) a column may use; index = style slot. */
export const FILLS = Object.freeze({ none: "", header: "FF2F5233", enriched: "FFFFF8E1", review: "FFE8F3EA", info: "FFF3F4F6" });
const FILL_KEYS = Object.keys(FILLS);

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="${2 + FILL_KEYS.length - 1}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${FILL_KEYS.slice(1).map(k => `<fill><patternFill patternType="solid"><fgColor rgb="${FILLS[k]}"/><bgColor indexed="64"/></patternFill></fill>`).join("")}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD0D5DD"/></left><right style="thin"><color rgb="FFD0D5DD"/></right><top style="thin"><color rgb="FFD0D5DD"/></top><bottom style="thin"><color rgb="FFD0D5DD"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${3 + FILL_KEYS.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>${FILL_KEYS.map((k, i) => `<xf numFmtId="0" fontId="0" fillId="${k === "none" ? 0 : i + 1}" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`).join("")}<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Style index for a body cell with the named fill (see STYLES_XML: 0 default, 1 header, 2.. fills, last = bold). */
function bodyStyle(fill) {
  const i = FILL_KEYS.indexOf(fill || "none");
  return 2 + (i < 0 ? 0 : i);
}
const BOLD_STYLE = 2 + FILL_KEYS.length;

function estimateHeight(row, widths) {
  let lines = 1;
  row.forEach((v, i) => {
    const w = Math.max(6, (widths[i] || 12) * 1.15);
    const n = String(v == null ? "" : v).split("\n").reduce((acc, seg) => acc + Math.max(1, Math.ceil(seg.length / w)), 0);
    if (n > lines) lines = n;
  });
  return Math.min(409, Math.max(18, lines * 15 + 3));
}

function sheetXml({ rows, widths = [], fills = [], freeze = true, autoFilter = true, header = true, boldFirstColumn = false }) {
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const view = freeze && header
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" xSplit="${boldFirstColumn ? 1 : 0}" topLeftCell="${boldFirstColumn ? "B2" : "A2"}" activePane="${boldFirstColumn ? "bottomRight" : "bottomLeft"}" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const body = rows.map((row, r) => {
    const isHeader = header && r === 0;
    const ht = isHeader ? Math.min(60, estimateHeight(row, widths)) : estimateHeight(row, widths);
    const cells = row.map((v, c) => {
      const ref = `${colName(c)}${r + 1}`;
      const s = isHeader ? 1 : (boldFirstColumn && c === 0 ? BOLD_STYLE : bodyStyle(fills[c]));
      if (v == null || v === "") return `<c r="${ref}" s="${s}"/>`;
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join("");
    return `<row r="${r + 1}" ht="${ht}" customHeight="1">${cells}</row>`;
  }).join("");
  const width = Math.max(1, ...rows.map(r => r.length));
  const filter = autoFilter && header && rows.length > 1 ? `<autoFilter ref="A1:${colName(width - 1)}${rows.length}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${view}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${body}</sheetData>${filter}</worksheet>`;
}

function safeSheetName(n, used) {
  let s = String(n || "Sheet").replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Sheet";
  let k = 2;
  while (used.has(s)) s = `${s.slice(0, 28)} ${k++}`;
  used.add(s);
  return s;
}

/**
 * @param {{name:string, rows:any[][], widths?:number[], fills?:string[], freeze?:boolean, autoFilter?:boolean, header?:boolean, boldFirstColumn?:boolean}[]} sheets
 * @returns {Buffer} .xlsx bytes
 */
export function writeStyledXlsx(sheets) {
  const used = new Set();
  const list = sheets.map(s => ({ ...s, name: safeSheetName(s.name, used) }));
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${list.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${list.some(s => s.autoFilter !== false && s.header !== false && s.rows.length > 1) ? `<definedNames>${list.map((s, i) => (s.autoFilter !== false && s.header !== false && s.rows.length > 1 ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(s.name).replace(/'/g, "''")}'!$A$1:$${colName(Math.max(1, ...s.rows.map(r => r.length)) - 1)}$${s.rows.length}</definedName>` : "")).join("")}</definedNames>` : ""}</workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: STYLES_XML },
    ...list.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  return zip(files);
}
