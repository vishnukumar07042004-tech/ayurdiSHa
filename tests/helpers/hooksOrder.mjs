/**
 * Minimal rules-of-hooks check (no ESLint in this repo): JSX → JS with esbuild, ESTree via
 * rollup's parser, then for every component / custom hook flag hook calls that run after an
 * early `return` or inside a condition / loop. Either makes React throw "Rendered fewer hooks
 * than expected" the moment the branch flips (e.g. the Ask Desk "done" screen).
 */
import fs from "node:fs";
import path from "node:path";
import { transform } from "esbuild";
import { parseAst } from "rollup/parseAst";

const HOOK_RE = /^use[A-Z0-9]/;
const FN_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
const CONDITIONAL = new Set(["IfStatement", "ConditionalExpression", "LogicalExpression", "ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement", "SwitchStatement"]);

function isHookCall(node) {
  if (node.type !== "CallExpression") return "";
  const c = node.callee;
  if (c.type === "Identifier" && HOOK_RE.test(c.name)) return c.name;
  if (c.type === "MemberExpression" && !c.computed && c.object.type === "Identifier" && c.object.name === "React" && HOOK_RE.test(c.property.name)) return c.property.name;
  return "";
}

/** Walk without entering nested functions; `cond` = inside a conditional / loop. */
function walk(node, visit, cond = false) {
  if (!node || typeof node.type !== "string") return;
  visit(node, cond);
  const nextCond = cond || CONDITIONAL.has(node.type);
  for (const [k, v] of Object.entries(node)) {
    if (k === "start" || k === "end" || k === "type") continue;
    const kids = Array.isArray(v) ? v : [v];
    for (const ch of kids) {
      if (!ch || typeof ch.type !== "string") continue;
      if (FN_TYPES.has(ch.type)) continue;
      // `a && useX()` only branches on the right-hand side; the test of an if/?: always runs.
      const isTest = (node.type === "IfStatement" || node.type === "ConditionalExpression") && k === "test";
      const isLeft = node.type === "LogicalExpression" && k === "left";
      walk(ch, visit, isTest || isLeft ? cond : nextCond);
    }
  }
}

function checkBody(name, body, lineOf, out) {
  if (!body || body.type !== "BlockStatement") return;
  let returnedAt = 0;
  for (const stmt of body.body) {
    if (FN_TYPES.has(stmt.type)) continue;
    let hasReturn = stmt.type === "ReturnStatement";
    walk(stmt, (node, cond) => {
      const hook = isHookCall(node);
      if (hook) {
        if (returnedAt) out.push({ component: name, hook, line: lineOf(node.start), problem: `after an early return (line ${returnedAt})` });
        else if (cond) out.push({ component: name, hook, line: lineOf(node.start), problem: "inside a condition or loop" });
      }
      if (node.type === "ReturnStatement") hasReturn = true;
    });
    if (hasReturn && !returnedAt) returnedAt = lineOf(stmt.start);
  }
}

function componentFns(ast) {
  const found = [];
  const consider = (name, fn) => {
    if (!name || !fn || !FN_TYPES.has(fn.type)) return;
    if (/^[A-Z]/.test(name) || HOOK_RE.test(name)) found.push({ name, fn });
  };
  const unwrap = init => {
    // memo(function X() {}), forwardRef((p, ref) => …)
    if (init && init.type === "CallExpression" && init.arguments.length) return init.arguments.find(a => FN_TYPES.has(a.type)) || init;
    return init;
  };
  const visitAll = node => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "FunctionDeclaration" && node.id) consider(node.id.name, node);
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier") consider(node.id.name, unwrap(node.init));
    for (const [k, v] of Object.entries(node)) {
      if (k === "start" || k === "end") continue;
      for (const ch of Array.isArray(v) ? v : [v]) if (ch && typeof ch.type === "string") visitAll(ch);
    }
  };
  visitAll(ast);
  return found;
}

export async function hooksOrderViolations(file) {
  const src = fs.readFileSync(file, "utf8");
  const { code } = await transform(src, { loader: file.endsWith(".jsx") ? "jsx" : "js", jsx: "transform", format: "esm", sourcefile: file });
  const ast = parseAst(code);
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === "\n") starts.push(i + 1);
  const lineOf = pos => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
  const out = [];
  for (const { name, fn } of componentFns(ast)) checkBody(name, fn.body, lineOf, out);
  return out.map(v => ({ file: path.relative(process.cwd(), file), ...v }));
}

export function sourceFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(jsx|js)$/.test(e.name)) out.push(p);
  }
  return out;
}
