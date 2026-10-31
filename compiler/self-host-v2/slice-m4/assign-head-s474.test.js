// assign-head-s474.test.js — s474: the §50 KEPT assignment-as-expression (S473 D10,
// user-voice "§50 keeps only the double-parenthesized assignment-in-condition head;
// other assignment-as-expression forms are refused"; D29 "E-ASSIGN-POSITION follows D10").
//
//   1. the kept form compiles and RUNS: `if ((x = e))`, `else if ((x = e))`,
//      `for ((x = e))`, and a parenthesized operand `for ((m = xs.at(i)) is given)` —
//      the local is rebound, the expression's value is the assigned value, a
//      presence test of it narrows the local in the body (§50.3.1, §50.4.1);
//   2. printed: `(x = v)` in the head, the local declared `let`;
//   3. typed per §50.4.1: the value against the local's type; a `const` target
//      is E-ASSIGN-CONST (the statement form's code); a cell target is refused
//      by name (E-BOOTSTRAP-UNSUPPORTED);
//   4. every other assignment-as-expression stays E-ASSIGN-POSITION: single
//      parentheses, a chain, an initializer, an argument, a return value, an
//      operand outside a condition head, a ternary arm in a head, a counted
//      head's condition, a member target.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (src) => [...new Set(errs(src).map((d) => d.code))].sort();
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const $ = (sel) => document.querySelector(sel);
let k = 0;
const load = (src) => loadProgram(clean(src).core, "s474asg-" + k++, []);
const js = (src) => mods.print.printProgram(clean(src).core, "t.client.js", "scrml-runtime.js").js;

// one function `f` with body `b` (its return type `ret`), shown in `#o`
const prog = (decls, body) => `<program>\n${decls}\n    <main>\n${body}\n    </main>\n</program>\n`;
const fnProg = (b, ret = "int", decls = "") => prog(`${decls}\n    function f() -> ${ret} {\n${b}\n    }`, `        <p id="o">\${f()}</p>`);
const fnCodes = (b, ret = "int", decls = "") => codes(fnProg(b, ret, decls));

// ---------------------------------------------------------------------------
describe("1 — the kept form compiles and runs", () => {
  test("`for ((x = xs.at(i)) is given)` — the regex idiom's shape: the body sees `x` present (narrowed)", async () => {
    await load(fnProg(`        const xs: int[] = [4, 5, 6];
        let i = 0;
        let total = 0;
        let x: int | not = not;
        for ((x = xs.at(i)) is given) {
            total = total + x;
            i = i + 1;
        }
        return total * 10 + i;`));
    expect($("#o").textContent).toBe("153");
  });
  test("`if ((x = e))` — the whole condition; the assigned value decides the branch and stays bound after", async () => {
    await load(fnProg(`        let ok = false;
        let n = 0;
        if ((ok = 2 > 1)) {
            n = 1;
        }
        if ((ok = 1 > 2)) {
            n = n + 10;
        }
        if (ok) { n = n + 100; }
        return n;`));
    expect($("#o").textContent).toBe("1");
  });
  test("`else if ((x = e))`, and an operand of a comparison (`((n = g()) > 1)`)", async () => {
    await load(fnProg(`        let a = 0;
        let b = 0;
        if (a > 5) {
            b = 1;
        } else if ((a = 7) > 5) {
            b = a;
        }
        return b;`));
    expect($("#o").textContent).toBe("7");
  });
  test("`for ((x = e))` — the whole condition of a loop, re-evaluated each iteration (and on `continue`)", async () => {
    await load(fnProg(`        let i = 0;
        let more = true;
        let seen = 0;
        for ((more = i < 4)) {
            i = i + 1;
            if (i == 2) { continue; }
            seen = seen * 10 + i;
        }
        if (more) { return -1; }
        return seen;`));
    expect($("#o").textContent).toBe("134");
  });
  test("`&&`: the right operand's assignment runs only when the left holds (JavaScript's short circuit, kept)", async () => {
    await load(fnProg(`        let x = 0;
        let y = 0;
        if (1 > 2 && (x = 5) > 0) { y = 1; }
        if (2 > 1 && (y = 9) > 0) { y = y + 1; }
        return x * 100 + y;`));
    expect($("#o").textContent).toBe("10");
  });
});

// ---------------------------------------------------------------------------
describe("2 — printed", () => {
  test("`(x = v)` stands in the head; the local is a `let`", () => {
    const out = js(fnProg(`        const xs: int[] = [1];
        let x: int | not = not;
        let n = 0;
        if ((x = xs.at(0)) is given) { n = x; }
        return n;`));
    expect(out).toMatch(/let x\w* = null;/);
    expect(out).toMatch(/if \(\(x\w* = /);
  });
});

// ---------------------------------------------------------------------------
describe("3 — typed per §50.4.1; the targets", () => {
  test("the value must fit the local: a string into an `int`-annotated local is a type error", () => {
    const c = fnCodes(`        let x: int = 0;
        if ((x = "a") == "a") { return 1; }
        return 0;`);
    expect(c.length).toBeGreaterThan(0);
    expect(c).not.toContain("E-ASSIGN-POSITION");
  });
  test("a `const` target is E-ASSIGN-CONST (the statement form's code, §50.3.5)", () => {
    expect(fnCodes(`        const x = 0;
        if ((x = 1) > 0) { return 1; }
        return 0;`)).toEqual(["E-ASSIGN-CONST"]);
  });
  test("a cell target is refused by name — not built (§50.3.4)", () => {
    const src = fnProg(`        if ((@n = 2) > 1) { return 1; }
        return 0;`, "int", `    let <n:int=0/>`);
    const d = errs(src).find((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED");
    expect(d && d.message).toContain("CELL as the target of a condition-head assignment");
  });
});

// ---------------------------------------------------------------------------
describe("4 — every other assignment-as-expression stays E-ASSIGN-POSITION (S473 D10 / D29)", () => {
  const cases = [
    ["single parentheses `if (x = e)`", `        let x = 0;\n        if (x = 1) { return 1; }\n        return 0;`],
    ["single parentheses `for (x = e)`", `        let x = 0;\n        for (x = 1) { break; }\n        return 0;`],
    ["a chain `a = b = c`", `        let a = 0;\n        let b = 0;\n        a = b = 1;\n        return a;`],
    ["an initializer", `        let x = 0;\n        let y = (x = 5);\n        return y;`],
    ["an argument", `        let x = 0;\n        return g((x = 1));`],
    ["a return value", `        let x = 0;\n        return (x = 1);`],
    ["an operand outside a condition head", `        let x = 0;\n        const y = (x = 1) + 1;\n        return y;`],
    ["a ternary arm inside a condition head", `        let x = 0;\n        if (true ? (x = 1) > 0 : false) { return 1; }\n        return 0;`],
    ["a counted head's condition", `        let x = 0;\n        for (let i = 0; (x = i) < 2; i = i + 1) { }\n        return x;`],
    ["inside a kept assignment's own value", `        let x = 0;\n        let y = 0;\n        if ((x = (y = 1)) > 0) { return 1; }\n        return 0;`],
    ["an argument inside a condition head", `        let x = 0;\n        if (g((x = 1)) > 0) { return 1; }\n        return 0;`],
  ];
  const G = `    function g(n: int) -> int { return n; }`;
  for (const [name, b] of cases) {
    test(name, () => { expect(fnCodes(b, "int", G)).toContain("E-ASSIGN-POSITION"); });
  }
  test("a member target `((p.n = e))` is not an lvalue (§50.2.1) — not the kept form", () => {
    const c = fnCodes(`        let p: P = { n: 0 };\n        if ((p.n = 1) > 0) { return 1; }\n        return 0;`, "int", `    type P:struct = { n: int }`);
    expect(c).toContain("E-ASSIGN-POSITION");
  });
  test("near-miss: the statement assignment is unaffected", () => {
    expect(fnCodes(`        let x = 0;\n        x = 1;\n        return x;`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// #1700 review round r1
describe("r1 — F1: a kept target named again in the same head is refused by name (no stale narrowing)", () => {
  test("the reviewer's repros: a second kept assignment of `m` in a later operand", () => {
    for (const b of [
      `        const xs: int[] = [1];\n        let m: int | not = not;\n        if ((m = xs.at(0)) is given && ((m = xs.at(9)) is not || true)) { return m + 1; }\n        return 0;`,
      `        const xs: int[] = [1];\n        let m: int | not = not;\n        let q = 0;\n        if ((m = xs.at(0)) is given && (q = 1) > 0 && ((m = xs.at(9)) == m)) { return m + 1; }\n        return 0;`,
      `        const xs: int[] = [1];\n        let m: int | not = not;\n        for ((m = xs.at(0)) is given && ((m = xs.at(9)) is not || true)) { return m + 1; }\n        return 0;`,
    ]) {
      const e = errs(fnProg(b)).filter((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED");
      expect([b, e.length > 0]).toEqual([b, true]);
      expect(e[0].message).toContain("named again elsewhere in the same head");
    }
  });
  test("a read / test of the target in another operand (before or after it) is refused too", () => {
    expect(fnCodes(`        const xs: int[] = [1];\n        let m: int | not = not;\n        if (m is given && (m = xs.at(9)) is not) { return 1; }\n        return 0;`)).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(fnCodes(`        const xs: int[] = [1];\n        let m: int | not = not;\n        if ((m = xs.at(0)) is given && m > 0) { return 1; }\n        return 0;`)).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("near-misses: its own value may read it; two DIFFERENT kept locals; a member of another name", async () => {
    expect(fnCodes(`        let m = 0;\n        if ((m = m + 1) > 0) { return m; }\n        return 0;`)).toEqual([]);
    expect(fnCodes(`        const xs: int[] = [1, 2];\n        let a: int | not = not;\n        let b: int | not = not;\n        if ((a = xs.at(0)) is given && (b = xs.at(1)) is given) { return a + b; }\n        return 0;`)).toEqual([]);
    await load(fnProg(`        let m = 0;\n        if ((m = m + 1) > 0) { m = m * 10; }\n        return m;`));
    expect($("#o").textContent).toBe("10");
  });
});

describe("r1 — F4: the kept form takes the statement form's executable-sink judgement", () => {
  test("an attribute node bound through a kept head is E-LOGIC-EXECUTABLE-SINK, as the statement form", () => {
    expect(fnCodes(`        let n = not;\n        n = document.body.attributes[0];\n        return 0;`)).toContain("E-LOGIC-EXECUTABLE-SINK");
    expect(fnCodes(`        let n = not;\n        if ((n = document.body.attributes[0]) is given) { n.value = "x"; }\n        return 0;`)).toContain("E-LOGIC-EXECUTABLE-SINK");
  });
});
