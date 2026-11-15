/**
 * S478 (s478-impl1-fn-text-scans) — the §48.3 `fn` purity scans in
 * `checkFnBodyProhibitions` (type-system.ts) read CODE only.
 *
 * Gaps: g-fn-001-text-scan-fires-on-string-literal,
 *       g-fn-004-text-scan-fires-on-string-literal.
 *
 * The text heuristics (E-FN-001 `?{`, E-FN-002 DOM APIs, E-FN-003 call of a
 * `function`, E-FN-004 non-deterministic calls / global reads) ran over the
 * statement text with string literals included, so prose such as
 * `"a ?{ query } sigil"` or `` "`Date.now()` is non-deterministic" `` was
 * refused. The scans now read `nodeCodeText` — the statement text through the
 * shared `codeOnlyView` fence — so literal and comment text is invisible while
 * a template literal's `${…}` interior (code) is still seen.
 *
 * Every "does not fire" case has a "still fires" twin.
 */

import { describe, test, expect } from "bun:test";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "path";
import { writeFileSync, rmSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";

const testDir = dirname(fileURLToPath(new URL(import.meta.url)));
let tmpCounter = 0;

function compileSource(scrmlSource) {
  const tag = `s478-fn-scan-${++tmpCounter}`;
  const tmpDir = resolve(testDir, `_tmp_${tag}`);
  const tmpInput = resolve(tmpDir, `${tag}.scrml`);
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(tmpInput, scrmlSource);
  try {
    return compileScrml({ inputFiles: [tmpInput], outDir: tmpDir, emitClient: true, emitServer: true });
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

const codes = (result) => (result.errors ?? []).map((e) => e.code);

/** A one-fn program; `body` is the fn body text. */
function fnProgram(body, ret = "string", extra = "") {
  return `<program>
\${
${extra}
  fn f() -> ${ret} { ${body} }
}
<p>\${f()}</p>
</program>`;
}

describe("E-FN-001 — `?{` inside a literal is prose (g-fn-001-text-scan-fires-on-string-literal)", () => {
  test("double-quoted string (the bootstrap reproducer)", () => {
    expect(codes(compileSource(fnProgram(`return "a ?{ query } sigil"`)))).not.toContain("E-FN-001");
  });
  test("single-quoted string", () => {
    expect(codes(compileSource(fnProgram(`return 'a ?{ query } sigil'`)))).not.toContain("E-FN-001");
  });
  test("template static text", () => {
    expect(codes(compileSource(fnProgram("return `tmpl ?{ x } text`")))).not.toContain("E-FN-001");
  });
  test("string nested inside a template hole", () => {
    expect(codes(compileSource(fnProgram("return `a ${\"?{ x }\"} b`")))).not.toContain("E-FN-001");
  });
  test("STILL FIRES: a real `?{}` in a template hole", () => {
    const src = `<program db="sqlite:./t.db">
\${
  fn f() -> string { return \`hole \${?{\`SELECT 1 AS a\`}.get()}\` }
}
<p>\${f()}</p>
</program>`;
    expect(codes(compileSource(src))).toContain("E-FN-001");
  });
  test("STILL FIRES: a real `?{}` init", () => {
    const src = `<program db="sqlite:./t.db">
\${
  fn f() -> string { let r = ?{\`SELECT 1 AS a\`}.get()
    return "x" }
}
<p>\${f()}</p>
</program>`;
    expect(codes(compileSource(src))).toContain("E-FN-001");
  });
});

describe("E-FN-004 — a non-deterministic name inside a literal is prose (g-fn-004-text-scan-fires-on-string-literal)", () => {
  test("double-quoted string holding a backticked `Date.now()` (the bootstrap reproducer)", () => {
    expect(codes(compileSource(fnProgram('return "`Date.now()` is non-deterministic"')))).not.toContain("E-FN-004");
  });
  test("double-quoted string (the gap reproducer)", () => {
    expect(codes(compileSource(fnProgram('return "call Date.now() for time"')))).not.toContain("E-FN-004");
  });
  test("single-quoted string", () => {
    expect(codes(compileSource(fnProgram("return 'Math.random() is random'")))).not.toContain("E-FN-004");
  });
  test("template static text", () => {
    expect(codes(compileSource(fnProgram("return `tmpl Math.random() text`")))).not.toContain("E-FN-004");
  });
  test("global-state read named in a string (`window.location`)", () => {
    expect(codes(compileSource(fnProgram('return "window.location is global"')))).not.toContain("E-FN-004");
  });
  test("global-state read named in template text (`document.cookie`)", () => {
    expect(codes(compileSource(fnProgram("return `read document.cookie later`")))).not.toContain("E-FN-004");
  });
  test("STILL FIRES: a template hole IS code — `${Date.now()}`", () => {
    expect(codes(compileSource(fnProgram("return `t ${Date.now()}`")))).toContain("E-FN-004");
  });
  test("STILL FIRES: a global read in a template hole — `${window.innerWidth}`", () => {
    expect(codes(compileSource(fnProgram("return `w ${window.innerWidth}`")))).toContain("E-FN-004");
  });
  test("STILL FIRES: a real call beside a string that names it", () => {
    expect(codes(compileSource(fnProgram('return "Math.random()" + `${Math.random()}`')))).toContain("E-FN-004");
  });
  test("STILL FIRES: a bare `Date.now()` call", () => {
    expect(codes(compileSource(fnProgram("return Date.now()", "number")))).toContain("E-FN-004");
  });
  test("STILL FIRES: an imported scrml:time `now()` call in a template hole", () => {
    const src = `<program>
\${
  import { now } from 'scrml:time'
  fn f() -> string { return \`at \${now()}\` }
}
<p>\${f()}</p>
</program>`;
    expect(codes(compileSource(src))).toContain("E-FN-004");
  });
  test("an imported scrml:time `now()` named in a string does not fire", () => {
    const src = `<program>
\${
  import { now } from 'scrml:time'
  fn f() -> string { return "call now() for time" }
}
<p>\${f()}</p>
</program>`;
    expect(codes(compileSource(src))).not.toContain("E-FN-004");
  });
});

describe("E-FN-002 / E-FN-003 — the same scan family", () => {
  test("E-FN-002: a DOM API named in a string does not fire", () => {
    expect(codes(compileSource(fnProgram('return "el.appendChild(x)"')))).not.toContain("E-FN-002");
  });
  test("E-FN-002: a DOM API named in template text does not fire", () => {
    expect(codes(compileSource(fnProgram("return `set .innerHTML here`")))).not.toContain("E-FN-002");
  });
  test("STILL FIRES E-FN-002: a DOM API in a template hole", () => {
    expect(codes(compileSource(fnProgram("return `${document.createElement(\"p\")}`")))).toContain("E-FN-002");
  });
  const side = "  function side() { return 1 }";
  test("E-FN-003: a `function` name called in a string does not fire", () => {
    expect(codes(compileSource(fnProgram('return "call side() here"', "string", side)))).not.toContain("E-FN-003");
  });
  test("E-FN-003: a `function` name called in template text does not fire", () => {
    expect(codes(compileSource(fnProgram("return `call side() here`", "string", side)))).not.toContain("E-FN-003");
  });
  test("STILL FIRES E-FN-003: a `function` called in a template hole", () => {
    expect(codes(compileSource(fnProgram("return `n ${side()}`", "string", side)))).toContain("E-FN-003");
  });
  test("STILL FIRES E-FN-003: a bare `function` call", () => {
    expect(codes(compileSource(fnProgram("return side()", "number", side)))).toContain("E-FN-003");
  });
});
