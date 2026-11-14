// nested-fn-s477.test.js — s477-boot-nested-fn (g-boot-nested-function-decl-unbuilt-s473).
//
// A nested function declaration in a function body (SPEC §7.3.1) — parsed (parse.scrml parseStmt →
// AStmtK.LocalFn), scoped and hoisted in its block (analyze.scrml bindLocalFns / resolveLocalFns, §48.6.4),
// typed in its block's final scope, placed with the function that declares it, lowered to Core
// `Stmt.LocalFn` and printed IN PLACE as a host function declaration (print.scrml localFnJs). Before:
// E-STMT-MISSING-SEMICOLON after `function` plus a parse cascade (probes
// docs/changes/s473-spec-coverage/probes/part-2/s7/nested.scrml, nested2.scrml).
// Governing sentences: docs/changes/s477-boot-nested-fn/progress.md. Every program here is compiled from
// source by the bootstrap and RUN (happy-dom; the server half against a real in-memory SQLite).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadM2, frontEnd } from "./harness.js";
import { check, realDb, serve, post, pathOf } from "./server-artifact-harness.js";
import { program, RIGHT, WRONG } from "./server-await-probes.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const REPO = join(import.meta.dir, "..", "..", "..");
const ENTRY = "app.scrml";
const fe = (src) => frontEnd(mods, [{ path: ENTRY, src }], ENTRY);
const errs = (r) => r.diags.filter((d) => d.severity === "Error");
const codes = (src) => errs(fe(src)).map((d) => d.code);
const $ = (sel) => document.querySelector(sel);
let k = 0;

// `fns` declares functions; a click sets `@out` to `expr` (an int).
const prog = (fns, expr) => `<program>\n    let <out:int=0/>\n    let <hits:int=0/>\n${fns}\n    function go() { @out = ${expr}; }\n    <button id="b" onclick=go()>b</button>\n    <p id="c">\${@out}</p>\n    <p id="h">\${@hits}</p>\n</program>\n`;

// Compile clean, check the Core, mount, click once; the rendered `#c` (and `#h`).
async function run(src) {
  const r = fe(src);
  expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  await loadProgram(r.core, "s477-nested-" + k++);
  click($("#b"));
  return { c: $("#c").textContent, h: $("#h").textContent, core: r.core };
}

// Every Core node of `variant` under `node` (Core JSON).
function variantsIn(node, variant, out = []) {
  if (Array.isArray(node)) { for (const x of node) variantsIn(x, variant, out); return out; }
  if (node && typeof node === "object") {
    if (node.variant === variant) out.push(node.data);
    for (const key of Object.keys(node)) variantsIn(node[key], variant, out);
  }
  return out;
}

describe("§7.3.1 — the s473 probes now compile and run", () => {
  test("nested2.scrml — `function adv(k)` inside `f`: f(2) is 3", async () => {
    const src = readFileSync(join(REPO, "docs/changes/s473-spec-coverage/probes/part-2/s7/nested2.scrml"), "utf8");
    const r = fe(src);
    expect(errs(r)).toEqual([]);
    expect(mods.check.checkCore(r.core)).toEqual([]);
    await loadProgram(r.core, "s477-probe2-" + k++);
    click(document.querySelector("button"));
    expect(document.querySelector("button").textContent).toBe("3");
  });
  test("nested.scrml — a closure that MUTATES the outer `let pos` (§7.3.1 \"MAY mutate outer `let` bindings\")", async () => {
    const src = readFileSync(join(REPO, "docs/changes/s473-spec-coverage/probes/part-2/s7/nested.scrml"), "utf8");
    const r = fe(src);
    expect(errs(r)).toEqual([]);
    await loadProgram(r.core, "s477-probe1-" + k++);
    click(document.querySelector("button"));
    expect(document.querySelector("button").textContent).toBe("3");
  });
});

describe("§7.3.1 / §48.6.4 — scope, hoisting, closures (run)", () => {
  test("mutual recursion between nested functions, a forward call (hoisted to the block)", async () => {
    const fns = `    function parity(n: int) -> int {
        const base: int = 100;
        function isEven(k: int) -> bool {
            if (k == 0) { return true; }
            return isOdd(k - 1);
        }
        function isOdd(k: int) -> bool {
            if (k == 0) { return false; }
            return isEven(k - 1);
        }
        if (isEven(n)) { return base + n; }
        return n;
    }`;
    expect((await run(prog(fns, "parity(4) + parity(3)"))).c).toBe("107");
  });
  test("a nested function named like a PARAMETER replaces it for the whole body (§7.3.3, S439 #6 B1)", async () => {
    const fns = `    function shadow(x: int) -> int {
        function x() -> int { return 7; }
        return x();
    }`;
    expect((await run(prog(fns, "shadow(1)"))).c).toBe("7");
  });
  test("two levels of nesting: the innermost closure rebinds a `let` two functions out", async () => {
    const fns = `    function deep(n: int) -> int {
        let acc = n;
        function mid(m: int) -> int {
            function leaf() { acc = acc + m; }
            leaf();
            return acc;
        }
        return mid(2) + mid(3);
    }`;
    expect((await run(prog(fns, "deep(1)"))).c).toBe("9");
  });
  test("a nested `fn` READS a captured binding (allowed — §7.3.1 \"they may read outer bindings\")", async () => {
    const fns = `    function readOnly(n: int) -> int {
        let k: int = n * 2;
        fn twice() -> int { return k + k; }
        return twice();
    }`;
    expect((await run(prog(fns, "readOnly(1)"))).c).toBe("4");
  });
  test("a closure reads a binding declared AFTER it, once that binding is initialized", async () => {
    const fns = `    function later() -> int {
        function g() -> int { return k; }
        const k: int = 5;
        return g();
    }`;
    expect((await run(prog(fns, "later()"))).c).toBe("5");
  });
  test("a nested function writes a cell, runs a loop with `break`, holds a `defer` (its own exits)", async () => {
    const fns = `    function tally(n: int) -> int {
        let total = 0;
        function addUpTo(k: int) {
            defer @hits = @hits + 1;
            for (let i = 0; i < 100; i = i + 1) {
                if (i >= k) { break; }
                total = total + i;
            }
        }
        addUpTo(n);
        addUpTo(2);
        return total;
    }`;
    const r = await run(prog(fns, "tally(4)"));
    expect([r.c, r.h]).toEqual(["7", "2"]);
  });
  test("a tape a closure can see is never edited in place (§66.10 snapshot — s476 in-place edits)", async () => {
    const fns = `    function snapLen() -> int {
        let xs: int[free, append] = [];
        function snap() -> int[free, append] { return xs; }
        xs.append(1);
        const a: int[free, append] = snap();
        xs.append(2);
        xs.append(3);
        return a.length * 10 + xs.length;
    }`;
    expect((await run(prog(fns, "snapLen()"))).c).toBe("13");
  });
  test("a nested `fn` calling a nested `fn` (§48.6.1) inside a `fn`", async () => {
    const fns = `    fn p4(n: int) -> int {
        fn sq(k: int) -> int { return k * k; }
        fn quad(k: int) -> int { return sq(sq(k)); }
        return quad(n);
    }`;
    expect((await run(prog(fns, "p4(2)"))).c).toBe("16");
  });
  test("a nested function calls a file-level function and reads a cell", async () => {
    const fns = `    function inc(k: int) -> int { return k + 1; }
    function outer2(n: int) -> int {
        function viaCell() -> int { return inc(@hits) + n; }
        return viaCell();
    }`;
    expect((await run(prog(fns, "outer2(10)"))).c).toBe("11");
  });
});

describe("Core and the printed JS", () => {
  const fns = `    function f(n: int) -> int {
        let pos = 0;
        function adv() { pos = pos + 1; }
        adv();
        return pos + n;
    }`;
  test("a nested function is a Core `Stmt.LocalFn` in its declarer's body — never in CoreProgram.fns / .server", () => {
    const r = fe(prog(fns, "f(2)"));
    expect(errs(r)).toEqual([]);
    const f = r.core.fns.find((x) => x.sym.hint === "f");
    const lfs = variantsIn(f.body, "LocalFn");
    expect(lfs.map((l) => l.f.sym.hint)).toEqual(["adv"]);
    expect(r.core.fns.map((x) => x.sym.hint)).not.toContain("adv");
    expect(r.core.server.map((x) => x.sym.hint)).not.toContain("adv");
    expect(lfs[0].f.waits).toBe(false);
  });
  test("printed in place as a host declaration; the captured `let` prints as `let` (it is rebound)", () => {
    const r = fe(prog(fns, "f(2)"));
    const out = mods.print.printProgram(r.core, "app.client.js", "scrml-runtime.js");
    expect(out.js).toContain("function f(n) {\n  let pos = 0;\n  function adv() {\n    pos = pos + 1;\n  }\n  adv();\n  return pos + n;\n}");
  });
});

describe("§7.3.1 / §48 — purity, scope and naming rules (refused)", () => {
  const C = (fns) => codes(prog(fns, "0"));
  test("a nested `fn` writing a captured `let` is E-FN-003 (§7.3.1 \"may not mutate them\")", () => {
    expect(C(`    function a(n: int) -> int {\n        let pos = 0;\n        fn bump() -> int { pos = pos + 1; return pos; }\n        return bump() + n;\n    }`)).toEqual(["E-FN-003"]);
  });
  test("a nested `fn` growing a captured tape is E-FN-003", () => {
    expect(C(`    function a(n: int) -> int {\n        let xs: int[free, append] = [];\n        fn push() { xs.append(1); }\n        push();\n        return n;\n    }`)).toContain("E-FN-003");
  });
  test("a `fn` calling a nested `function` is E-FN-003 (§48.6.2)", () => {
    expect(C(`    fn p1(n: int) -> int {\n        function helper() -> int { return n; }\n        return helper();\n    }`)).toEqual(["E-FN-003"]);
  });
  test("a nested `function` in a `fn` writing a cell is E-FN-003 (§48.3 \"including inside nested closures\")", () => {
    expect(C(`    fn p2(n: int) -> int {\n        function w() { @out = 1; }\n        return n;\n    }`)).toEqual(["E-FN-003"]);
  });
  test("a nested `fn` reading the clock is E-FN-004", () => {
    expect(C(`    function p3(n: int) -> int {\n        fn now() -> number { return Date.now(); }\n        return n;\n    }`)).toEqual(["E-FN-004"]);
  });
  // s477 fix r1 (F3) — the report names the `fn` that makes the body pure (before: "a `function` body is pure")
  test("E-FN-004 names the pure function: the nested `fn` itself, or the `fn` a nested `function` is inside", () => {
    const msg = (fns) => errs(fe(prog(fns, "0"))).map((d) => d.code + ": " + d.message);
    const own = msg(`    function p3(n: int) -> int {\n        fn now() -> number { return Date.now(); }\n        return n;\n    }`);
    expect(own.length).toBe(1);
    expect(own[0]).toContain("`fn now` is pure");
    const outer = msg(`    fn p4(n: int) -> int {\n        function w() -> number { return Date.now(); }\n        return n;\n    }`);
    expect(outer.length).toBe(1);
    expect(outer[0]).toContain("E-FN-004: ");
    expect(outer[0]).toContain("the nested function `w` is inside `fn p4`, which is pure");
    expect(outer[0]).not.toContain("a `function` body is pure");
  });
  test("a nested function is not visible outside the body that declares it (E-SCOPE-001)", () => {
    expect(C(`    function outside() -> int { return helper(); }\n    function host(n: int) -> int {\n        function helper() -> int { return n; }\n        return helper();\n    }`)).toEqual(["E-SCOPE-001"]);
  });
  test("a `let` after a nested function of its name, and a nested function after a `let`: E-SCOPE-REDECLARE (§7.3.3)", () => {
    expect(C(`    function d(n: int) -> int {\n        function dup() -> int { return 1; }\n        let dup: int = 2;\n        return n;\n    }`)).toEqual(["E-SCOPE-REDECLARE"]);
    expect(C(`    function d(n: int) -> int {\n        let dup: int = 2;\n        function dup() -> int { return 1; }\n        return n;\n    }`)).toEqual(["E-SCOPE-REDECLARE"]);
  });
  test("two nested functions of one name in one block compile; the LATER one is the one called (§7.3.3, §19.16.6)", async () => {
    const fns = `    function e(n: int) -> int {\n        function twice() -> int { return 1; }\n        function twice() -> int { return 2; }\n        return twice() + n;\n    }`;
    expect((await run(prog(fns, "e(10)"))).c).toBe("12");
  });
  test("…and in a block that contains a `defer` they are E-DEFER-DUPLICATE-FUNCTION, reported once (§19.16.6)", () => {
    expect(C(`    function e(n: int) -> int {\n        defer @hits = @hits + 1;\n        function twice() -> int { return 1; }\n        function twice() -> int { return 2; }\n        return twice();\n    }`)).toEqual(["E-DEFER-DUPLICATE-FUNCTION"]);
  });
  test("a nested function shadows a file-level function of its name inside its body only", async () => {
    const fns = `    function v() -> int { return 1; }\n    function s(n: int) -> int {\n        function v() -> int { return 40; }\n        return v() + n;\n    }`;
    expect((await run(prog(fns, "s(2) + v()"))).c).toBe("43");
  });
  test("a nested function used as a VALUE is refused (no function values — it never escapes its declarer)", () => {
    expect(C(`    function h(n: int) -> int {\n        function v() -> int { return 1; }\n        const x = v;\n        return n;\n    }`)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("a call of a nested function ends the narrowing of a binding it may rebind", () => {
    expect(C(`    function narrowed(n: int) -> int {\n        let x: int | not = n;\n        function clear() { x = not; }\n        if (x is given) {\n            clear();\n            return x + 1;\n        }\n        return 0;\n    }`)).toEqual(["E-OPERAND-NOT-NARROWED"]);
  });
});

// s477 fix r1 (F1) — §7.5.1 position 3: the arguments of a call of a NESTED function are checked
// against its parameters exactly as a file-level callee's are (before: a nested callee had no `fnw`
// entry, so checkArgs found no parameter nids and skipped every check — a string landed in an `int`).
describe("§7.5.1 position 3 — arguments to a nested function are type-checked", () => {
  const F = (body) => `    function f(n: int) -> int {\n${body}\n    }`;
  const C = (fns) => errs(fe(prog(fns, "f(0)")));
  const e031 = (ds, part) => {
    expect(ds.map((d) => d.code)).toEqual(["E-TYPE-031"]);
    expect(ds[0].message).toContain(part);
  };
  test("a string literal into a nested `function`'s `int` parameter", () => {
    e031(C(F(`        function g(k: int) -> int { return k; }\n        return g("x");`)), "argument 1 of `g` expects `int`");
  });
  test("a string into a nested `fn`'s `int` parameter", () => {
    e031(C(F(`        fn g(k: int) -> int { return k * 2; }\n        return g("ab");`)), "argument 1 of `g` expects `int`");
  });
  test("an `int` into a nested function's struct parameter", () => {
    e031(C(`    type S:struct = { a: int }\n` + F(`        function g(s: S) -> int { return s.a; }\n        return g(5);`)), "expects `S`");
  });
  test("an un-narrowed `int | not` into an `int` parameter", () => {
    e031(C(F(`        function g(k: int) -> int { return k + 1; }\n        let x: int | not = not;\n        return g(x);`)), "`int | not`");
  });
  test("two levels deep", () => {
    e031(C(F(`        function g(k: int) -> int {\n            function h(m: int) -> int { return m; }\n            return h("q");\n        }\n        return g(1);`)), "argument 1 of `h`");
  });
  test("a nested call in an argument ends the narrowing of the next argument (as for a file-level `add`)", () => {
    const body = `        let x: int | not = n;\n        function clear() -> int { x = not; return 0; }\n        if (x is given) {\n            return add(clear(), x);\n        }\n        return 0;`;
    e031(C(F(`        fn add(a: int, b: int) -> int { return a + b; }\n` + body)), "argument 2 of `add`");
    e031(C(`    fn add(a: int, b: int) -> int { return a + b; }\n` + F(body)), "argument 2 of `add`");
  });
  test("a tape argument to a nested function must grant what the parameter does (§66.12.3)", () => {
    const ds = C(F(`        let xs: int[] = [1];\n        function g(ys: int[free, append]) -> int { return ys.length; }\n        return g(xs);`));
    expect(ds.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(ds[0].message).toContain("argument 1 of `g` is the tape `xs`");
  });
  test("a well-typed call still compiles and runs", async () => {
    expect((await run(prog(F(`        function g(k: int) -> int { return k + 1; }\n        return g(n);`), "f(4)"))).c).toBe("5");
  });
});

describe("INTERIM refusals — by name, never a silent guess (the language allows or does not rule these)", () => {
  const C = (fns, markup = "") => errs(fe(prog(fns, "0").replace("</program>", markup + "</program>")));
  const one = (ds, part) => {
    expect(ds.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(ds[0].message).toContain(part);
  };
  test("inside a block of the body (an `if`) — scope after the block not ruled", () => {
    one(C(`    function b(n: int) -> int {\n        if (n > 0) {\n            function inner() -> int { return 1; }\n            return inner();\n        }\n        return 0;\n    }`), "TOP LEVEL of a function body");
  });
  test("in an event handler — §7.3.1 names a function body only", () => {
    const ds = C("", `    <button id="x" onclick={ function inHandler() { @out = 2; } }>x</button>\n`);
    expect(ds.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(ds[0].message).toContain("outside a function body");
  });
  test("a call that can run before a captured binding is declared (JS temporal dead zone)", () => {
    one(C(`    function c(n: int) -> int {\n        const r: int = early();\n        let k: int = n;\n        function early() -> int { return k; }\n        return r;\n    }`), "temporal dead zone");
  });
  test("…through a sibling it calls", () => {
    one(C(`    function c(n: int) -> int {\n        const r: int = a();\n        let k: int = n;\n        function a() -> int { return b(); }\n        function b() -> int { return k; }\n        return r;\n    }`), "temporal dead zone");
  });
  // s477 fix r1 (F2) — a WRITE in the dead zone is the same host error as a read (before: only
  // bare-name reads were captures, so these compiled and threw "Cannot access 'k' before initialization")
  test("…a call that ASSIGNS a captured binding before it is declared", () => {
    one(C(`    function c(n: int) -> int {\n        const r: int = a();\n        let k: int = n;\n        function a() -> int { k = 5; return 1; }\n        return r + k;\n    }`), "runs before `k`, which it reads or writes");
  });
  test("…a part write and an in-place tape edit", () => {
    one(C(`    type P:struct = { a: int }\n    function c(n: int) -> int {\n        const r: int = a();\n        let p: P = { a: 1 };\n        function a() -> int { p.a = 5; return 1; }\n        return r + p.a;\n    }`), "runs before `p`");
    one(C(`    function c(n: int) -> int {\n        const r: int = a();\n        let xs: int[free, append] = [];\n        function a() -> int { xs.append(1); return 1; }\n        return r + xs.length;\n    }`), "runs before `xs`");
  });
  test("…a write through a sibling it calls", () => {
    one(C(`    function c(n: int) -> int {\n        const r: int = a();\n        let k: int = n;\n        function a() -> int { return b(); }\n        function b() -> int { k = 2; return 1; }\n        return r + k;\n    }`), "runs before `k`");
  });
  test("the same writing call AFTER the declaration compiles and runs", async () => {
    expect((await run(prog(`    function c(n: int) -> int {\n        let k: int = n;\n        function a() -> int { k = 5; return 1; }\n        const r: int = a();\n        return r + k;\n    }`, "c(1)"))).c).toBe("6");
  });
  test("a nested function named like a cell — §7.6 D14 leaves it undecided", () => {
    one(C(`    function f6(n: int) -> int {\n        function hits() -> int { return 1; }\n        return hits();\n    }`), "takes the name of the cell");
  });
  test("`server` on a nested declaration", () => {
    one(C(`    function f4(n: int) -> int {\n        server function s() -> int { return 1; }\n        return n;\n    }`), "the `server` modifier on a nested");
  });
  test("a failable (`!`) nested function", () => {
    one(C(`    type E:enum = { Bad }\n    function f3(n: int) -> int {\n        function chk(k: int)! E { if (k < 0) { fail E.Bad; } return k; }\n        return chk(n) !{ _ :> 0 };\n    }`), "failable nested function");
  });
  test("a `lin` binding captured by a nested declaration — §35.6 names expressions; where a hoisted declaration consumes is not ruled", () => {
    one(C(`    function f5(n: int) -> int {\n        lin tok = n;\n        function use() -> int { return tok; }\n        return use();\n    }`), "names the `lin` binding");
  });
});

describe("server code — a nested function runs where its declarer runs (§12, §7.3.2 \"a nested function in server code\")", () => {
  test("a nested helper in a server function: compiled into the route, wrong password rejected", async () => {
    const src = program(`        function same(a: string) -> string { return a; }\n        if (!check(same(pass), row.pw)) return "REJECTED";\n        return "WELCOME"`);
    const r = fe(src);
    expect(errs(r).map((d) => d.code)).toEqual([]);
    expect(check(r.core)).toEqual([]);
    const f = r.core.server.find((s) => s.sym.hint === "f");
    expect(variantsIn(f.body, "LocalFn").map((l) => l.f.sym.hint)).toEqual(["same"]);
    expect(r.core.server.map((s) => s.sym.hint)).not.toContain("same");
    const sql = await realDb(["CREATE TABLE users (name TEXT, pw TEXT)"], { users: [{ name: "bob", pw: RIGHT }] });
    const { srv, routes } = await serve(r.core, sql);
    expect(routes.map((x) => x.fn)).not.toContain("same");
    const wrong = await post(srv, pathOf(routes, "f"), ["bob", WRONG]);
    const right = await post(srv, pathOf(routes, "f"), ["bob", RIGHT]);
    expect({ wrong: [wrong.status, wrong.json], right: [right.status, right.json] })
      .toEqual({ wrong: [200, "REJECTED"], right: [200, "WELCOME"] });
  });
  test("a nested function that WAITS (calls a server-waiting function) is refused by name, INTERIM — never an unawaited call", () => {
    const src = program(`        function ok() -> boolean { return check(pass, row.pw); }\n        if (!ok()) return "REJECTED";\n        return "WELCOME"`);
    const ds = errs(fe(src));
    expect(ds.map((d) => d.code)).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(ds.some((d) => d.message.includes("waits"))).toBe(true);
  });
  test("a nested function running a `?{}` is refused by name, INTERIM", () => {
    const SQ = "?" + "{";
    const src = program(`        function again() -> boolean {\n            const r2: Ok = ${SQ}\`SELECT 1 AS ok\`}.get() !{ _ :> { return false; } };\n            return r2.ok == 1;\n        }\n        if (!again()) return "REJECTED";\n        return "WELCOME"`);
    const ds = errs(fe(src));
    expect(ds.map((d) => d.code)).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(ds.some((d) => d.message.includes("query"))).toBe(true);
  });
});

// s477 merge composition (s477-boot-nested-fn × s477-boot-tape-forms #1834): a removal used as a
// VALUE and an edit of a PART of a local, inside a nested function body and on a binding a closure
// captures. §66.10 rule 1 (a binding holds a snapshot) — a tape a closure can see is never edited in
// place (print.scrml ownStmt LocalFn arm); §7.3.1 / §48.3.3 — a nested `fn` may not mutate what it
// closes over (analyze.scrml capWrite, now on the removal-value and part-edit paths too).
describe("nested functions × tape forms (removal as a value, part edits) — run", () => {
  const B = "    type B:struct = { n: int, xs: int[free, append, pop] }";
  test("a removal as a value on the nested function's OWN tape", async () => {
    const fns = `    function f(n: int) -> int {
        function popTop() -> int {
            let xs: int[free, pop, remove] = [1, 2, n];
            const top: int | not = xs.pop();
            const first: int | not = xs.remove(0);
            if (top is given) {
                if (first is given) { return top * 100 + first * 10 + xs.length; }
            }
            return 0;
        }
        return popTop();
    }`;
    expect((await run(prog(fns, "f(7)"))).c).toBe("711");
  });
  test("a closure-visible tape: a removal as a value copies once a closure saw it (never in place)", async () => {
    const fns = `    function g(n: int) -> int {
        let xs: int[free, pop] = [1, 2, n];
        function snap() -> int[free, pop] { return xs; }
        const t0: int | not = xs.pop();
        const a: int[free, pop] = snap();
        const t1: int | not = xs.pop();
        if (t0 is given) {
            if (t1 is given) { return t0 * 1000 + t1 * 100 + a.length * 10 + xs.length; }
        }
        return 0;
    }`;
    expect((await run(prog(fns, "g(3)"))).c).toBe("3221");
  });
  test("a nested `function` taking a removal value from a CAPTURED tape rebinds the outer `let`", async () => {
    const fns = `    function t(n: int) -> int {
        let xs: int[free, pop] = [n, 2, 3];
        const before: int[free, pop] = xs;
        function take() -> int {
            const v: int | not = xs.pop();
            if (v is given) { return v; }
            return 0;
        }
        const a: int = take();
        const b: int = take();
        return xs.length * 1000 + a * 100 + b * 10 + before.length;
    }`;
    expect((await run(prog(fns, "t(1)"))).c).toBe("1323");
  });
  test("part edits of a captured struct's tape field, inside and outside a closure — snapshots hold", async () => {
    const fns = `${B}
    function h(n: int) -> int {
        let b: B = { n: 1, xs: [1] };
        const keep: B = b;
        function grow() { b.xs.append(n); }
        grow();
        grow();
        function snap() -> B { return b; }
        const s: B = snap();
        b.xs.pop();
        return keep.xs.length * 100 + s.xs.length * 10 + b.xs.length;
    }`;
    expect((await run(prog(fns, "h(5)"))).c).toBe("132");
  });
  test("a part edit on the nested `fn`'s OWN struct is allowed (it closes over nothing it writes)", async () => {
    const fns = `${B}
    function h2(n: int) -> int {
        fn grown(k: int) -> int {
            const b: B = { n: k, xs: [k] };
            b.xs.append(k);
            const v: int | not = b.xs.pop();
            if (v is given) { return v + b.xs.length; }
            return 0;
        }
        return grown(n);
    }`;
    expect((await run(prog(fns, "h2(4)"))).c).toBe("5");
  });
  test("a nested `fn` taking a removal value from, or part-editing, a CAPTURED binding is E-FN-003", () => {
    const C = (fns) => codes(prog(fns, "0"));
    expect(C(`    function a(n: int) -> int {\n        let xs: int[free, pop] = [1];\n        fn take() -> int { const v: int | not = xs.pop(); return n; }\n        return take();\n    }`)).toContain("E-FN-003");
    expect(C(`${B}\n    function a(n: int) -> int {\n        let b: B = { n: 1, xs: [] };\n        fn grow() { b.xs.append(n); }\n        grow();\n        return n;\n    }`)).toContain("E-FN-003");
  });
});

// s477 merge composition (× s477-boot-compile-perf #1835 NameTable / mint): nested-function names
// minted with the rest — one name in two declarers, a file-level function of the same name, and a
// local of that name in a third function each keep their own binding.
describe("nested-function names × the minted NameTable (#1835)", () => {
  test("`step` nested in two functions, at file level, and as a local: each call reaches its own", async () => {
    const fns = `    function step(k: int) -> int { return k + 1000; }
    function a(n: int) -> int {
        function step(k: int) -> int { return k + 10; }
        return step(n);
    }
    function b(n: int) -> int {
        function step(k: int) -> int { return k + 100; }
        return step(n) + a(n);
    }
    function c(n: int) -> int {
        const s: int = step(n);
        let r: int = 0;
        function bump() -> int { r = r + s; return r; }
        return bump() + bump();
    }`;
    // b(1) = 101 + 11 = 112; c(1): s = 1001, bump twice → 1001 + 2002 = 3003
    expect((await run(prog(fns, "b(1) + c(1)"))).c).toBe("3115");
  });
});
