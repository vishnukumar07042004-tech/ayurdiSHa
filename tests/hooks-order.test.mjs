/**
 * Rules of hooks across src/ (2026-11-03: a `useState` after AskView's `if (done) return` crashed
 * the Ask Desk the moment a question was sent — "Rendered fewer hooks than expected").
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hooksOrderViolations, sourceFiles } from "./helpers/hooksOrder.mjs";

test("no component or custom hook calls a hook after an early return or conditionally", async () => {
  const all = [];
  for (const f of sourceFiles("src")) all.push(...await hooksOrderViolations(f));
  assert.deepEqual(all, []);
});

test("the checker catches the AskView pattern, conditional hooks, and allows hooks in callbacks", async () => {
  const file = path.join(os.tmpdir(), `aym-hooks-${process.pid}.jsx`);
  fs.writeFileSync(file, `
    import { useState, useEffect } from "react";
    export function Bad({ done }) {
      const [a] = useState(1);
      if (done) { return <p>done</p>; }
      const [b] = useState(2);
      return <p>{a}{b}</p>;
    }
    function Cond({ on }) {
      if (on) useEffect(() => {});
      return null;
    }
    const Fine = ({ x }) => {
      const [v, setV] = useState(x);
      function onClick() { if (v) return; setV(1); }
      useEffect(() => { if (!v) return; }, [v]);
      return <button onClick={onClick}>{v}</button>;
    };
  `);
  try {
    const found = await hooksOrderViolations(file);
    assert.deepEqual(found.map(v => `${v.component}:${v.hook}:${v.problem.split(" (")[0]}`).sort(), [
      "Bad:useState:after an early return",
      "Cond:useEffect:inside a condition or loop",
    ]);
  } finally { fs.unlinkSync(file); }
});
