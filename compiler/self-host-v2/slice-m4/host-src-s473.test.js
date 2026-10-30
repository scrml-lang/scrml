// host-src-s473.test.js — s473-host-allowlist-a (lane A, design host-binding-allowlist-design-2026-10-29.md
// §10 step 1): DRAFT SPEC §21.3.3 rule 3 for `<host src="./file.js">` in the bootstrap — the STATIC export
// read, the §21.3 file checks and copy closure, and the client artifact's import of the copy.
//
// Rule 3 (verbatim): "The exports of a `src=` file SHALL be determined by parsing its ES module export
// declarations (`export function` / `class` / `const` / `let` / `var`, `export { … }`, `export default`, and
// `export … from` / `export * from` followed through the §21.3 copy closure). The compiler SHALL NOT load,
// import, or evaluate a `src=` file, or any file it reaches, at build time. A binding without a target calls
// the export of its own name with its parameters in order. A name that the file does not export, or that it
// reaches only through a form the parse cannot resolve, SHALL be `E-IMPORT-004`." And: "a file that does not
// exist is `E-IMPORT-006`; a file that resolves outside the project root, or whose `_scrml_local/` copy path
// falls in a §47.13 denied class, is `E-IMPORT-011`."
//
// Ruling: scrml-support/user-voice-scrml.md S473 "⭐ RULED — `<host>` rule 8 moves from a sink denylist to an
// allowlist" (Q1: "`src=` is the one explicit, audited escape"). Design §5.6 ("`src=` is the escape"), §7
// (#1659's probe tests need rule 3 first).
//
// Red on base: every test — on base a valid `src=` is refused by name (E-BOOTSTRAP-UNSUPPORTED, "the static
// export read … not built") and scripts/scrml-boot.ts copies no `src=` file.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import "../slice-m1/load-program.js"; // happy-dom
import { compileFile, compileSource } from "../../../scripts/scrml-boot.ts";

const BASE = join(homedir(), ".cache", "scrml-agent-tmp", "host-src-s473");
let tmp;
beforeAll(async () => {
  mkdirSync(BASE, { recursive: true });
  tmp = mkdtempSync(join(BASE, "t-"));
  // warm the bootstrap bundle (a cold build compiles the bootstrap)
  const d = project({ "app.scrml": "<program>\n<p>x</p>\n</program>\n" });
  await compileSource(join(d, "app.scrml"));
}, { timeout: 300000 });
afterAll(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

let seq = 0;
/** A fresh project (a `scrml.toml` marks its root) holding `files` (path → text). */
function project(files, root = true) {
  const d = join(tmp ?? mkdtempSync(join(BASE, "t-")), "p" + seq++);
  mkdirSync(d, { recursive: true });
  if (root) writeFileSync(join(d, "scrml.toml"), "");
  for (const [p, t] of Object.entries(files)) {
    mkdirSync(dirname(join(d, p)), { recursive: true });
    writeFileSync(join(d, p), t);
  }
  return d;
}
const app = (host, body, src = "./glue.js") => `<host src="${src}">\n${host}\n</host>\n<program>\n${body}\n</program>\n`;
const errCodes = (r) => r.diagnostics.filter((d) => d.severity === "error").map((d) => d.code).sort();
const check = async (d, entry = "app.scrml") => compileSource(join(d, entry));

/** Compile, write, and load the page in happy-dom; returns the output dir. */
async function runPage(d, entry = "app.scrml") {
  const out = join(d, "dist");
  const r = await compileFile(join(d, entry), { outDir: out });
  expect(r.diagnostics.filter((x) => x.severity === "error").map((x) => `${x.code}: ${x.message}`)).toEqual([]);
  const html = readFileSync(join(out, "index.html"), "utf8");
  document.head.innerHTML = /<head>([\s\S]*)<\/head>/.exec(html)[1].replace(/<script[^>]*><\/script>/g, "");
  document.body.innerHTML = "";
  await import(join(out, "program.client.js"));
  return { out, r };
}

describe("rule 3 — a binding without a target calls the export of its own name", () => {
  test("clean; the file is copied to _scrml_local/, imported through _scrml/host-src/0.js, and called at run time", async () => {
    const d = project({
      "glue.js": "export function add(a, b) { return a + b; }\n",
      "app.scrml": app("  add(a: int, b: int) -> int", '<p id="o">${add(2, 3)}</p>'),
    });
    const { out, r } = await runPage(d);
    expect(r.written).toContain("_scrml_local/glue.js");
    expect(r.written).toContain("_scrml/host-src/0.js");
    expect(readFileSync(join(out, "_scrml/host-src/0.js"), "utf8")).toContain('export * from "../../_scrml_local/glue.js"');
    expect(readFileSync(join(out, "program.client.js"), "utf8")).toContain('from "./_scrml/host-src/0.js"');
    expect(document.getElementById("o").textContent).toBe("5");
  }, 60000);

  test("a target rooted at an export (`= api.twice(x)`) and a bare export call (`= add(x, y)`): clean, and run", async () => {
    const d = project({
      "lib/glue.js": "export const api = { twice(x) { return x * 2; } };\nexport function add(a, b) { return a + b; }\n",
      "app.scrml": app("  tw(x: int) -> int = api.twice(x)\n  plus(x: int, y: int) -> int = add(x, y)", '<p id="o">${tw(21)}/${plus(1, 2)}</p>', "./lib/glue.js"),
    });
    const { r } = await runPage(d);
    expect(r.written).toContain("_scrml_local/lib/glue.js");
    expect(document.getElementById("o").textContent).toBe("42/3");
  }, 60000);

  test("the result is still decoded (rule 13): an export returning a string where int is declared traps E-HOST-VALUE-MISMATCH-RT", async () => {
    const d = project({
      "glue.js": "export function n() { return 'x'; }\n",
      "app.scrml": app("  n() -> int", '<p id="o">${n()}</p>'),
    });
    let code = "";
    try { await runPage(d); } catch (e) { code = e && e.code; }
    expect(code).toBe("E-HOST-VALUE-MISMATCH-RT");
  }, 60000);
});

describe("rule 3 — exports are read statically, NEVER by loading the file", () => {
  test("a src file whose top level would run code compiles clean, and nothing in it ran at build time", async () => {
    const d = project({
      "glue.js": "globalThis.__hostSrcEvaluated = 1;\nthrow new Error('evaluated at build time');\nexport function f() { return 1; }\n",
      "app.scrml": app("  f() -> int", "<p>${f()}</p>"),
    });
    const r = await check(d);
    expect(errCodes(r)).toEqual([]);
    expect(globalThis.__hostSrcEvaluated).toBe(undefined);
  }, 60000);

  test("every export form: function, class, const / let / var (destructuring included), `export { a as b }`, `export { x } from`, `export * from`, `export * as ns from`", async () => {
    const d = project({
      "glue.js": [
        "export function f1() { return 1; }",
        "export class C2 {}",
        "export const k3 = 3, { k4, deep: [k5] } = { k4: 4, deep: [5] };",
        "export let l6 = 6; export var v7 = 7;",
        "function hidden() { return 8; } export { hidden as f8 };",
        "export { r9 } from './b.js';",
        "export * from './c.js';",
        "export * as ns11 from './c.js';",
      ].join("\n"),
      "b.js": "export function r9() { return 9; }\n",
      "c.js": "export function s10() { return 10; }\n",
      "app.scrml": app([
        "  f1() -> int", "  k3a() -> int = k3.valueOf()", "  f8() -> int", "  r9() -> int", "  s10() -> int",
        "  ns(x: int) -> int = ns11.s10(x)",
      ].join("\n"), '<p id="o">${f1()} ${f8()} ${r9()} ${s10()}</p>'),
    });
    const { r } = await runPage(d);
    expect(r.written).toEqual(expect.arrayContaining(["_scrml_local/glue.js", "_scrml_local/b.js", "_scrml_local/c.js"]));
    expect(document.getElementById("o").textContent).toBe("1 8 9 10");
  }, 60000);

  test("a name the file does not export: E-IMPORT-004 (no target) / E-HOST-TARGET-UNBOUND (a target's root)", async () => {
    const d = project({
      "glue.js": "export function add(a, b) { return a + b; }\nfunction secret() {}\n",
      "app.scrml": app("  secret() -> int\n  t(x: int) -> int = nope.f(x)", "<p>x</p>"),
    });
    const r = await check(d);
    expect(errCodes(r)).toEqual(["E-HOST-TARGET-UNBOUND", "E-IMPORT-004"]);
    const m = r.diagnostics.find((x) => x.code === "E-IMPORT-004");
    expect(m.message).toContain("`secret` is not exported by `glue.js`");
    expect(m.line).toBe(2);
  }, 60000);

  test("`export default` is not a bindable name; a local name shadowed is not exported", async () => {
    const d = project({
      "glue.js": "export default function () { return 1; }\n",
      "app.scrml": app("  default2() -> int", "<p>x</p>"),
    });
    expect(errCodes(await check(d))).toEqual(["E-IMPORT-004"]);
  }, 60000);

  test("a name reached only through a form the parse cannot resolve (`export * from \"lodash\"`): E-IMPORT-004 naming the form", async () => {
    const d = project({
      "glue.js": "export * from 'lodash';\nexport function a() { return 1; }\n",
      "app.scrml": app("  chunk() -> int", "<p>x</p>"),
    });
    const r = await check(d);
    expect(errCodes(r)).toEqual(["E-IMPORT-004"]);
    expect(r.diagnostics[0].message).toContain("export * from \"lodash\"");
  }, 60000);

  test("a file that is not an ES module: E-IMPORT-004 for each binding", async () => {
    const d = project({
      "glue.js": "export function ( {\n",
      "app.scrml": app("  f() -> int", "<p>x</p>"),
    });
    const r = await check(d);
    expect(errCodes(r)).toEqual(["E-IMPORT-004"]);
    expect(r.diagnostics[0].message).toContain("does not parse as an ES module");
  }, 60000);

  test("a re-export of a name its source does not export: E-IMPORT-004 (the browser would refuse to link the module)", async () => {
    const d = project({
      "glue.js": "export { gone } from './b.js';\nexport function f() { return 1; }\n",
      "b.js": "export function other() {}\n",
      "app.scrml": app("  f() -> int", "<p>x</p>"),
    });
    const r = await check(d);
    expect(errCodes(r)).toEqual(["E-IMPORT-004"]);
    expect(r.diagnostics[0].message).toContain("does not export `gone`");
  }, 60000);

  test("two `export *` of DIFFERENT bindings under one name: ambiguous, so not exported (ES excludes it)", async () => {
    const d = project({
      "glue.js": "export * from './b.js';\nexport * from './c.js';\n",
      "b.js": "export function same() { return 1; }\n",
      "c.js": "export function same() { return 2; }\n",
      "app.scrml": app("  same() -> int", "<p>x</p>"),
    });
    expect(errCodes(await check(d))).toEqual(["E-IMPORT-004"]);
  }, 60000);

  test("an `export *` cycle terminates", async () => {
    const d = project({
      "glue.js": "export * from './b.js';\nexport function f() { return 1; }\n",
      "b.js": "export * from './glue.js';\nexport function g() { return 2; }\n",
      "app.scrml": app("  f() -> int\n  g() -> int", "<p>${f()}${g()}</p>"),
    });
    expect(errCodes(await check(d))).toEqual([]);
  }, 60000);
});

describe("rule 3 — the file checks and the §21.3 copy closure", () => {
  test("a src= file that does not exist: E-IMPORT-006", async () => {
    const d = project({ "app.scrml": app("  f() -> int", "<p>x</p>", "./missing.js") });
    expect(errCodes(await check(d))).toEqual(["E-IMPORT-006"]);
  }, 60000);

  test("a src= file outside the project root: E-IMPORT-011 (a `..` path, and a symlink that leads out)", async () => {
    const outside = project({ "evil.js": "export function f() { return 1; }\n" }, false);
    const d = project({ "app.scrml": app("  f() -> int", "<p>x</p>", "../" + outside.split("/").pop() + "/evil.js") });
    expect(errCodes(await check(d))).toEqual(["E-IMPORT-011"]);
    const d2 = project({ "app.scrml": app("  f() -> int", "<p>x</p>", "./link.js") });
    symlinkSync(join(outside, "evil.js"), join(d2, "link.js"));
    expect(errCodes(await check(d2))).toEqual(["E-IMPORT-011"]);
  }, 60000);

  test("a src= above the source root but INSIDE the project root is admitted (copied under the project-root path)", async () => {
    const d = project({
      "shared/glue.js": "export function f() { return 7; }\n",
      "web/app.scrml": app("  f() -> int", '<p id="o">${f()}</p>', "../shared/glue.js"),
    });
    const { r } = await runPage(d, "web/app.scrml");
    expect(r.written).toContain("_scrml_local/shared/glue.js");
    expect(document.getElementById("o").textContent).toBe("7");
  }, 60000);

  test("a copy path in a §47.13 denied class (`*.server.*`, a dot-path): E-IMPORT-011", async () => {
    const d = project({
      "glue.server.js": "export function f() { return 1; }\n",
      "app.scrml": app("  f() -> int", "<p>x</p>", "./glue.server.js"),
    });
    expect(errCodes(await check(d))).toEqual(["E-IMPORT-011"]);
    const d2 = project({
      ".hidden/glue.js": "export function f() { return 1; }\n",
      "app.scrml": app("  f() -> int", "<p>x</p>", "./.hidden/glue.js"),
    });
    expect(errCodes(await check(d2))).toEqual(["E-IMPORT-011"]);
  }, 60000);

  test("the copy closure: a relative import of the src file is copied beside it; a missing one is E-IMPORT-006, one outside the root E-IMPORT-011", async () => {
    const d = project({
      "glue.js": "import { h } from './helper.mjs';\nexport function f() { return h(); }\n",
      "helper.mjs": "export function h() { return 11; }\n",
      "app.scrml": app("  f() -> int", '<p id="o">${f()}</p>'),
    });
    const { r } = await runPage(d);
    expect(r.written).toEqual(expect.arrayContaining(["_scrml_local/glue.js", "_scrml_local/helper.mjs"]));
    expect(document.getElementById("o").textContent).toBe("11");
    const d2 = project({
      "glue.js": "import { h } from './nohelper.js';\nexport function f() { return 1; }\n",
      "app.scrml": app("  f() -> int", "<p>x</p>"),
    });
    expect(errCodes(await check(d2))).toEqual(["E-IMPORT-006"]);
    const outside = project({ "x.js": "export const y = 1;\n" }, false);
    const d3 = project({
      "glue.js": `import { y } from '../${outside.split("/").pop()}/x.js';\nexport function f() { return y; }\n`,
      "app.scrml": app("  f() -> int", "<p>x</p>"),
    });
    expect(errCodes(await check(d3))).toEqual(["E-IMPORT-011"]);
  }, 60000);

  test("a build that refuses writes no copy", async () => {
    const d = project({
      "glue.js": "export function f() { return 1; }\n",
      "app.scrml": app("  f() -> int\n  g() -> int", "<p>x</p>"),
    });
    const r = await compileFile(join(d, "app.scrml"), { outDir: join(d, "dist") });
    expect(r.ok).toBe(false);
    expect(existsSync(join(d, "dist", "_scrml_local"))).toBe(false);
  }, 60000);
});
