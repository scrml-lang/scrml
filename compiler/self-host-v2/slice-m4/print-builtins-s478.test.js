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
import { loadM2 } from "./harness.js";
import { frontEndNoUnusedLint as frontEnd } from "../slice-m2/no-unused-lint.js";  // s480: fixtures hold incidental unread locals — W-UNUSED-BINDING is tested in slice-m4/unused-binding-s480.test.js

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
  ];
  for (const [what, pre, body] of cases) {
    test(what, () => {
      const c = codes(tool(body, pre));
      expect(c).toContain("E-PRINT-NON-PRIMITIVE");
      expect(c).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
    });
  }

  // S478 open-Qs ruling (user-voice) item 23 — "keep the fail-closed rule (§20.7.2 allow-list, §14.13.2)":
  // an unannotated foreign value (`asIs`) is a print argument of unresolved type, E-PRINT-NON-PRIMITIVE.
  // (Red before: refused by name, E-BOOTSTRAP-UNSUPPORTED citing g-boot-print-asis-arg-s478.)
  test("an unannotated foreign value (asIs) is E-PRINT-NON-PRIMITIVE (fail closed, §14.13.2)", () => {
    const d = run(tool(`        const v = _={ 1 + 1 }=;\n        println(v);`)).diags;
    expect(d.map((x) => x.code)).toEqual(["E-PRINT-NON-PRIMITIVE"]);
    expect(d[0].message).toContain("cannot resolve this value's type");
  });

  test("an ANNOTATED foreign value is not refused (the §23.2.4a call-site annotation)", () => {
    expect(codes(tool(`        const v: int = _={ 1 + 1 }=;\n        println(v);`))).toEqual([]);
  });

  test("a narrowed `T | not` is its primitive", () => {
    expect(codes(tool(`        const s: string | not = "a";\n        if (s is given) {\n            println(s);\n        }`))).toEqual([]);
  });

  test("a `session` value printed: E-SESSION-VALUE is reported (the print of the unresolved local may also be)", () => {
    const c = codes(tool(`        const s = session;\n        println(s);`));
    expect(c).toContain("E-SESSION-VALUE");
    expect(c).not.toContain("E-BOOTSTRAP-UNSUPPORTED");     // the print itself is built
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
    expect(codes(tool(`        const print = 1;\n        const k = print + 1;\n        println("x");`))).toEqual([]);   // `println` stays the built-in
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
    const d = run(`<program>\n    <n:int=0/>\n    function go() {\n        println("x");\n        @n = 1;\n    }\n    <p>\${@n}</p>\n</program>\n`).diags;
    const u = d.filter((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED");
    expect(u.length).toBe(1);
    expect(u[0].message).toContain("split across the client/server boundary");
    expect(u[0].message).toContain("a `print` / `println` call");
  });

  test("print + a DOM read is unplaceable (E-ROUTE-005)", () => {
    expect(codes(web(`    function go() {\n        println("x");\n        const t = document.title;\n    }`))).toContain("E-ROUTE-005");
  });

  for (const [what, src, why] of [
    ["an event handler", `<program>\n    <button id="b" onclick={ println("x"); }>go</button>\n</program>\n`, "outside a `function` body"],
    ["a value position", tool(`        const v = println("x");`), "used as a value"],
  ]) {
    test(`refused by name (INTERIM) in ${what}`, () => {
      const d = run(src).diags;
      const u = d.filter((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED");
      expect(u.length).toBe(1);
      expect(u[0].message).toContain(why);
      expect(d.map((x) => x.code)).not.toContain("E-SCOPE-001");
    });
  }

  // S478 open-Qs ruling (user-voice) item 24 — §48.3.4: "A `print` / `println` call (§20.7) SHALL NOT
  // appear inside a `fn` body (nested functions included); it is `E-FN-004`." (Red before: refused by name.)
  test("in a pure `fn` → E-FN-004 (§48.3.4, S478 ruling item 24)", () => {
    const d = run(tool(`        const k = f();`, "    fn f() -> int {\n        println(\"x\");\n        return 1;\n    }\n")).diags;
    expect(d.map((x) => x.code)).toEqual(["E-FN-004"]);
    expect(d[0].message).toContain("`fn f`");
  });

  test("in a function nested in a pure `fn` → E-FN-004, naming both", () => {
    const pre = "    fn f() -> int {\n        function g() {\n            print(\"x\");\n        }\n        return 1;\n    }\n";
    const d = run(tool(`        const k = f();`, pre)).diags;
    expect(d.map((x) => x.code)).toContain("E-FN-004");
    expect(d.map((x) => x.code)).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
  });

  test("a `fn` used as a value position print → still E-FN-004 (the purity rule comes first)", () => {
    const d = run(tool(`        const k = f();`, "    fn f() -> int {\n        const v = println(\"x\");\n        return 1;\n    }\n")).diags;
    expect(d.map((x) => x.code)).toContain("E-FN-004");
  });

  test("the bare name (a function value) stays refused by name", () => {
    const d = run(tool(`        const f = println;`)).diags;
    const u = d.filter((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED");
    expect(u.length).toBe(1);
    expect(u[0].message).toContain("named without a call");
    expect(d.map((x) => x.code)).not.toContain("E-SCOPE-001");
  });
});

// =============================================================================
// E. r1 (#1900 review HIGH-1) — the §64.3 exit-harness ("`const code = await main(…); process.exit(code);`")
// must not drop output: printOut writes synchronously, so a tool piped into a SLOW reader keeps every byte
// and its exit code. (An async stdout write lost ~90% of 574 kB here: process.exit dropped the buffer.)
// =============================================================================
describe("E — output survives process.exit through a pipe (§64.3, §20.7.4)", () => {
  const big = `<program kind="tool" lang="js">
    function main(args: string[]) -> number {
        for (const i of 1..101) {
            for (const j of 1..101) {
                println("line-with-some-padding-text-padding-text-padding", i, j);
            }
        }
        return 3;
    }
</program>
`;
  async function buildBig() {
    const dir = mkdtempSync(join(tmp, "big-"));
    const file = join(dir, "t.scrml");
    writeFileSync(file, big);
    const r = await compileFile(file, { outDir: join(dir, "out") });
    return { errors: r.diagnostics.filter((d) => d.severity === "error"), js: join(dir, "out", "t.js"), dir };
  }
  // the bytes the program writes: 10000 lines, "line-… i j\n"
  let expected = 0;
  for (let i = 1; i <= 100; i++) for (let j = 1; j <= 100; j++) expected += `line-with-some-padding-text-padding-text-padding ${i} ${j}\n`.length;

  test("a slow reader (sleeps before reading) gets every byte, and the exit code is main's", async () => {
    const b = await buildBig();
    expect(b.errors).toEqual([]);
    expect(expected).toBeGreaterThan(256 * 1024);       // well past a pipe buffer — not vacuous
    const p = Bun.spawnSync(["bash", "-c", `bun "$0" | (sleep 1; wc -c); echo "exit=\${PIPESTATUS[0]}"`, b.js], { cwd: b.dir, stdout: "pipe", stderr: "pipe" });
    const lines = p.stdout.toString().trim().split("\n");
    expect(Number(lines[0].trim())).toBe(expected);
    expect(lines[1]).toBe("exit=3");
  });

  test("a reader that closes early (`| head`): the program still exits with main's code, no EPIPE crash", async () => {
    const b = await buildBig();
    expect(b.errors).toEqual([]);
    const p = Bun.spawnSync(["bash", "-c", `bun "$0" 2>/dev/null | head -c 10 >/dev/null; echo "exit=\${PIPESTATUS[0]}"`, b.js], { cwd: b.dir, stdout: "pipe", stderr: "pipe" });
    expect(p.stdout.toString().trim()).toBe("exit=3");
  });
});

// =============================================================================
// F. r1 (#1900 review HIGH-2) — §20.7.3: "a `function` that calls `print` / `println` is **server-placed**
// by Route Inference (§12), exactly like a function that touches `?{}` SQL". Its CLIENT call is a server
// call (§19.9.10): unhandled → E-ERROR-002, `!{ .Transport(t) :> … }` handles it, lowered as a remote call
// — never an ill-formed Core (E-BOOTSTRAP-CORE-ILL-FORMED, C-S3) as before.
// =============================================================================
describe("F — a client call of a printing function is a server call (§20.7.3, §19.9.10)", () => {
  const W = (b) => `<program>\n${b}\n</program>\n`;
  const shapes = [
    ["a handler calls it", W(`    function report(k: int) {\n        println("SECRET", k);\n    }\n    <button onclick={ report(1); }>go</button>`)],
    ["a handler uses its value", W(`    let <n:int=0/>\n    function report(k: int) -> int {\n        println("SECRET", k);\n        return k;\n    }\n    <button onclick={ @n = report(1); }>go</button>\n    <p>\${@n}</p>`)],
    ["a client function calls a function that calls it", W(`    function inner(k: int) {\n        println("SECRET", k);\n    }\n    function outer(k: int) {\n        inner(k);\n    }\n    <button onclick={ outer(1); }>go</button>`)],
    ["a client function (it writes a cell) calls it", W(`    let <n:int=0/>\n    function report(k: int) {\n        println("SECRET", k);\n    }\n    function bump() {\n        @n = @n + 1;\n        report(@n);\n    }\n    <button onclick={ bump(); }>go</button>\n    <p>\${@n}</p>`)],
    ["the print is in a nested function", W(`    function report() {\n        function inner() {\n            println("SECRET");\n        }\n        inner();\n    }\n    <button onclick={ report(); }>go</button>`)],
    ["the print is in a defer", W(`    function report() {\n        defer {\n            println("SECRET");\n        }\n    }\n    <button onclick={ report(); }>go</button>`)],
    ["the print is in a loop in an if", W(`    type C:enum = { Red, Green }\n    function go(c: C) {\n        if (c == C.Red) {\n            for (const i of [1]) {\n                println("SECRET");\n            }\n        }\n    }\n    <button onclick={ go(C.Red); }>go</button>`)],
    ["the print is in a match arm", W(`    type C:enum = { Red, Green }\n    function go(c: C) {\n        match c {\n            .Red :> { println("SECRET"); },\n            .Green :> { },\n        }\n    }\n    <button onclick={ go(C.Red); }>go</button>`)],
    ["the function is declared in markup logic", W(`    <div>\n        \${\n            function go() {\n                println("SECRET");\n            }\n        }\n        <button onclick={ go(); }>go</button>\n    </div>`)],
  ];
  for (const [what, src] of shapes) {
    test(`unhandled → E-ERROR-002 (${what})`, () => {
      const d = run(src).diags;
      expect(d.map((x) => x.code)).toEqual(["E-ERROR-002"]);
      expect(d[0].message).toMatch(/is a server function and (this call is made on|an event handler runs on) the client/);
    });
  }

  test("handled with `.Transport(t)`: compiles, the print is in the server artifact only", async () => {
    const dir = mkdtempSync(join(tmp, "web-"));
    const file = join(dir, "t.scrml");
    writeFileSync(file, W(`    function report(k: int) {\n        println("SECRET", k);\n    }\n    <button onclick={ report(1) !{ .Transport(t) :> {} }; }>go</button>`));
    const out = join(dir, "out");
    const r = await compileFile(file, { outDir: out });
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const client = readFileSync(join(out, "program.client.js"), "utf8");
    const server = readFileSync(join(out, "program.server.js"), "utf8");
    expect(client).not.toContain("SECRET");
    expect(client).not.toContain("printOut");
    expect(server).toContain("SECRET");
    expect(server).toContain("rt.printOut(");
  });

  test("the same codes as a `?{}` function at the same sites (less the query's own unhandled failure)", () => {
    const D = (b) => `<program db="./a.db">\n${b}\n</program>\n`;
    const shape = (x) => `    function report() {\n        ${x}\n    }\n    function outer() {\n        report();\n    }\n    <button onclick={ outer(); }>go</button>\n    <button onclick={ report() !{ .Transport(t) :> {} }; }>h</button>`;
    const p = codes(D(shape(`println("x");`)));
    const q = codes(D(shape("?{`DELETE FROM t WHERE id = 1`}.run() !{ _ :> {} };")));
    expect(p).toEqual(["E-ERROR-002"]);
    expect(q).toEqual(p);
  });

  test("a user `print` shadows the built-in: its function is NOT server-placed by it", () => {
    const r = run(W(`    let <n:int=0/>\n    function print(s: string) {\n        @n = 1;\n    }\n    function go() {\n        print("x");\n    }\n    <button onclick={ go(); }>go</button>\n    <p>\${@n}</p>`));
    expect(r.diags.map((x) => x.code)).toEqual(["W-PRINT-SHADOWED"]);
    expect(mods.check.checkCore(r.core)).toEqual([]);
  });
});
