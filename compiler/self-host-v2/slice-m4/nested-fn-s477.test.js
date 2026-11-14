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
    expect(C(`    function a(n: int) -> int {\n        let xs: int[append] = [];\n        fn push() { xs.append(1); }\n        push();\n        return n;\n    }`)).toContain("E-FN-003");
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
