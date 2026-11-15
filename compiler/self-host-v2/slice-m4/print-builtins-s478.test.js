// print-builtins-s478.test.js — s478-boot-print-builtins: the §20.7 clean-stdout built-ins
// `print(…)` / `println(…)` on the bootstrap.
//
// Before this lane both names were refused by name (builtinUnbuilt, g-boot-s20-builtins-unbuilt-s473).
// The governing sentences (SPEC §20.7; quoted in docs/changes/s478-boot-print-builtins/progress.md):
//   §20.7.1 "Arguments are **space-joined** (`println(\"a\", \"b\")` emits `a b\n`) … `print()` with no args
//           emits the empty string; `println()` with no args emits a bare newline." · "Statement-position".
//   §20.7.2 "A `print` / `println` argument SHALL be a **string**, **int**, **number**, **bool** or **unit enum
//           value** … A **non-primitive** argument — a struct, payload enum value, tape, value-native map
//           (§59), markup-as-value, or `not` — is **`E-PRINT-NON-PRIMITIVE`**" + the honest text of each.
//   §14.13.2 a text sink refuses "a value whose type the compiler cannot resolve" (fail closed) and
//           "A `print` / `println` argument keeps its own code, `E-PRINT-NON-PRIMITIVE`".
//   §20.7.3 "a `function` that calls `print` / `println` is **server-placed** by Route Inference" ·
//           "In a **`kind=\"tool\"` program** … write the tool process's stdout directly".
//   §20.7.5 "A user-declared in-scope binding named `print` / `println` wins … with an info-level lint
//           **`W-PRINT-SHADOWED`** at the shadowing use".
//   §20.7.6 "raw text with NO origin tag / `file:line` / side classification".

import { describe, test, expect, beforeAll, afterAll, setDefaultTimeout } from "bun:test";
setDefaultTimeout(180000);
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 180000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const tool = (body, pre = "") => `<program kind="tool" lang="js">\n${pre}    function main(args: string[]) -> number {\n${body}\n        return 0;\n    }\n</program>\n`;

// =============================================================================
// A. The tool, compiled by the driver and RUN: the captured stdout is the contract
// =============================================================================
let tmp;
let compileFile;
beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "s478-print-"));
  ({ compileFile } = await import("../../../scripts/scrml-boot.ts"));
});
afterAll(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

async function runTool(src) {
  const dir = mkdtempSync(join(tmp, "t-"));
  const file = join(dir, "t.scrml");
  writeFileSync(file, src);
  const out = join(dir, "out");
  const r = await compileFile(file, { outDir: out });
  const errors = r.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) return { errors, out: "", js: "" };
  const js = join(out, "t.js");
  const p = Bun.spawnSync(["bun", js], { cwd: dir, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  return { errors, code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString(), js: readFileSync(js, "utf8") };
}

describe("A — §20.7.1 / §20.7.6: raw, space-joined stdout", () => {
  test("println space-joins and appends one newline; print appends nothing; no decoration", async () => {
    const r = await runTool(tool(`        println("hello", 42);\n        print("no-newline");`));
    expect(r.errors).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.out).toBe("hello 42\nno-newline");
    expect(r.out).not.toContain("[server]");
    expect(r.js).toContain("rt.printOut(");
  });

  test("no arguments: print() writes nothing, println() a bare newline", async () => {
    const r = await runTool(tool(`        print();\n        println();\n        print("|");`));
    expect(r.errors).toEqual([]);
    expect(r.out).toBe("\n|");
  });

  test("§20.7.2 the honest text of each primitive: int, number (Number::toString), bool, unit enum", async () => {
    const pre = "    type Color:enum = { Red, Green }\n";
    const body = [
      "        const n: int = -42;",
      "        const x: number = 0.1 + 0.2;",
      "        const big: number = 1e21;",
      "        const b: bool = true;",
      "        println(n, x, big, b, Color.Green);",
      "        println(`n=${n}`, \"s\");",
    ].join("\n");
    const r = await runTool(tool(body, pre));
    expect(r.errors).toEqual([]);
    expect(r.out).toBe("-42 0.30000000000000004 1e+21 true Green\nn=-42 s\n");
  });

  test("arguments are evaluated left to right, then written once — in loops and branches", async () => {
    const body = [
      "        for (const a of [\"x\", \"y\"]) {",
      "            if (a == \"x\") {",
      "                println(\"first\", a);",
      "            } else {",
      "                println(\"then\", a);",
      "            }",
      "        }",
    ].join("\n");
    const r = await runTool(tool(body));
    expect(r.errors).toEqual([]);
    expect(r.out).toBe("first x\nthen y\n");
  });

  test("a helper function of the tool prints too (every tool function runs in process, §64.5.1)", async () => {
    const pre = "    function say(s: string) {\n        println(\"say:\", s);\n    }\n";
    const r = await runTool(tool(`        say("a");\n        say("b");`, pre));
    expect(r.errors).toEqual([]);
    expect(r.out).toBe("say: a\nsay: b\n");
  });

  test("§23.2.4a an ANNOTATED foreign value is typed by its annotation, and prints", async () => {
    const r = await runTool(tool(`        const v: string = _={ "it" + "'s" }=;\n        println(v);`));
    expect(r.errors).toEqual([]);
    expect(r.out).toBe("it's\n");
  });
});

// =============================================================================
// B. §20.7.2 E-PRINT-NON-PRIMITIVE
// =============================================================================
describe("B — E-PRINT-NON-PRIMITIVE (§20.7.2, §14.13.2)", () => {
  const cases = [
    ["a struct", "    type P:struct = { a: int }\n", `        const p: P = { a: 1 };\n        println(p);`],
    ["a tape", "", `        const xs: int[] = [1, 2];\n        println(xs);`],
    ["`not`", "", `        println(not);`],
    ["a `T | not` (it may be `not`)", "", `        const s: string | not = not;\n        println("v", s);`],
    ["a payload enum value", "    type R:enum = { Ok(v: int)\n        No }\n", `        const r: R = R.Ok(1);\n        print(r);`],
    ["an unannotated foreign value (asIs — unresolved, fail closed)", "", `        const v = _={ 1 + 1 }=;\n        println(v);`],
  ];
  for (const [what, pre, body] of cases) {
    test(what, () => {
      const c = codes(tool(body, pre));
      expect(c).toContain("E-PRINT-NON-PRIMITIVE");
      expect(c).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
    });
  }

  test("a narrowed `T | not` is its primitive", () => {
    expect(codes(tool(`        const s: string | not = "a";\n        if (s is given) {\n            println(s);\n        }`))).toEqual([]);
  });

  test("a `session` value printed: E-SESSION-VALUE is reported (the print of the unresolved local may also be)", () => {
    const c = codes(tool(`        const s = session;\n        println(s);`));
    expect(c).toContain("E-SESSION-VALUE");
  });
});

// =============================================================================
// C. §20.7.5 shadowing
// =============================================================================
describe("C — a user binding named print / println wins (§20.7.5)", () => {
  test("the call is the user's function, with info-level W-PRINT-SHADOWED", async () => {
    const pre = "    function println(s: string) {\n        print(\"<\" + s + \">\");\n    }\n";
    const d = run(tool(`        println("x");`, pre)).diags;
    expect(d.map((x) => x.code)).toEqual(["W-PRINT-SHADOWED"]);
    expect(String(d[0].severity).toLowerCase()).toBe("info");
    const r = await runTool(tool(`        println("x");`, pre));
    expect(r.errors).toEqual([]);
    expect(r.out).toBe("<x>");
  });

  test("`print` is not a reserved identifier: a local of the name is legal", () => {
    expect(codes(tool(`        const print = 1;\n        const k = print + 1;`))).toEqual([]);
  });
});

// =============================================================================
// D. §20.7.3 placement — host stdout is a server-only resource
// =============================================================================
describe("D — placement (§20.7.3)", () => {
  const web = (fns) => `<program>\n${fns}\n    <p>hi</p>\n</program>\n`;

  test("a web `function` that calls println is server-placed", () => {
    const r = run(web(`    function report(n: int) {\n        println("n", n);\n    }`));
    expect(r.diags.filter((d) => String(d.severity).toLowerCase() === "error")).toEqual([]);
    expect(r.core.server.map((s) => s.sym.hint)).toContain("report");
    expect(r.core.fns.map((f) => f.sym.hint)).not.toContain("report");
    expect(mods.check.checkCore(r.core)).toEqual([]);
  });

  test("print + a reactive write splits the function, as a `?{}` does (§19.9.5) — refused by name (the split is unbuilt)", () => {
    const c = codes(`<program>\n    <n:int=0/>\n    function go() {\n        println("x");\n        @n = 1;\n    }\n    <p>\${@n}</p>\n</program>\n`);
    expect(c).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });

  test("print + a DOM read is unplaceable (E-ROUTE-005)", () => {
    expect(codes(web(`    function go() {\n        println("x");\n        const t = document.title;\n    }`))).toContain("E-ROUTE-005");
  });

  for (const [what, src] of [
    ["an event handler", `<program>\n    <button id="b" onclick={ println("x"); }>go</button>\n</program>\n`],
    ["a pure `fn`", tool(`        const k = f();`, "    fn f() -> int {\n        println(\"x\");\n        return 1;\n    }\n")],
    ["a value position", tool(`        const v = println("x");`)],
  ]) {
    test(`refused by name (INTERIM) in ${what}`, () => {
      const c = codes(src);
      expect(c).toContain("E-BOOTSTRAP-UNSUPPORTED");
      expect(c).not.toContain("E-SCOPE-001");
    });
  }

  test("the bare name (a function value) stays refused by name", () => {
    const c = codes(tool(`        const f = println;`));
    expect(c).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(c).not.toContain("E-SCOPE-001");
  });
});
