// value-if-object-arm-s475.test.js — s475-boot-value-if-object-arm: two bootstrap
// gaps built.
//
// 1. g-bootstrap-value-form-if-unbuilt-s474 — the value `if` (SPEC §17.6
//    if-as-expression; §17.6.10 the value form in a markup `${ … }`). §17.6.2: "An
//    if-as-expression arm body SHALL produce its result value via a `lift`
//    statement, or by being exactly one expression, which is sugar for `lift` of
//    that expression (§17.6.10)"; "The result of an if-as-expression when no arm
//    body executes SHALL be `not`"; the type is the union of the lifted types.
//    §17.6.10: "A value-form SHALL re-evaluate reactively on change of any reactive
//    cell it reads." RULED S469 ("Keep { e }, lift once a statement"): a branch that
//    holds a statement yields only by `lift`; a bare tail is E-ARM-TAIL-VALUE.
//    BUILT: every branch that is ONE value (`{ e }`, `{ e; }`, `{ lift e; }`, a
//    nested value `if`) — §17.6.8's single-lift ternary form. INTERIM (refused by
//    name): a branch holding statements before its `lift`.
// 2. g-bootstrap-object-literal-arm-body-refused-s474 — §18.5: "A brace body that
//    reads as an object literal is the arm's value … exactly as `return { … }` and
//    `f({ … })` read it."
//
// Graded on diagnostic codes, checkCore, and the RUNTIME (values, rendering,
// reactivity) through the slice runtime in happy-dom.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const diag = (src, code) => run(src).diags.find((d) => d.code === code);
const $ = (sel) => document.querySelector(sel);
const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);
let k = 0;
const load = async (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  await loadProgram(r.core, "vio-" + k++, []);
};
const js = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  return mods.print.printProgram(r.core, "t.client.js", "scrml-runtime.js").js;
};

const DECLS = [
  "    let <n:int=0/>",
  "    let <ok:bool=true/>",
  "    type K:enum = { A, B, C }",
  "    type S:struct = { a: int, b: int }",
  "    type L:enum = { NotFound(id: string), Timeout }",
  "    function one() -> int { return 1; }",
  "    function check(p: string)! L { if (p == \"x\") fail L.Timeout; return true; }",
].join("\n");
const BUTTONS = `        <button onclick={ @ok = !@ok; }>flip</button>\n        <button onclick={ @n = @n + 1; }>bump</button>`;
const P = (decls, main = "        <p>x</p>") => `<program>\n${DECLS}\n${decls}\n    <main>\n${main}\n${BUTTONS}\n    </main>\n</program>\n`;

// ---------------------------------------------------------------------------
describe("1A — a value `if` in a logic position is the chosen branch's value (runtime)", () => {
  test("bound: `{ e }`, `{ e; }`, `{ lift e; }`; an `else if` chain", async () => {
    await load(P(`    function h(x: int) -> int { const v = if (x > 1) { 10 } else if (x > 0) { lift 20; } else { 30; }; return v; }`,
      `        <p id="v">\${h(2)} \${h(1)} \${h(0)}</p>`));
    expect($("#v").textContent).toBe("10 20 30");
  });

  test("no `else`: the false path is `not` (§17.6.4) — the value is `int | not`", async () => {
    await load(P(`    function h(c: bool) -> int { const v = if (c) { 5 }; return match v { not :> -1, _ :> 1 }; }`,
      `        <p id="v">\${h(true)} \${h(false)}</p>`));
    expect($("#v").textContent).toBe("1 -1");
  });

  test("a `return` operand, a call argument, an operand (§17.6.1 rule 2), an object field", async () => {
    await load(P(`    function g(x: int) -> int { return x * 2; }
    function r(c: bool) -> int { return if (c) { 1 } else { 2 }; }
    function a(c: bool) -> int { return g(if (c) { 3 } else { 4 }); }
    function o(c: bool) -> int { return if (c) { 1 } else { 2 } + 10; }
    function f(c: bool) -> int { const s: S = { a: if (c) { 7 } else { 8 }, b: 0 }; return s.a; }`,
      `        <p id="v">\${r(true)} \${r(false)} \${a(true)} \${a(false)} \${o(true)} \${o(false)} \${f(true)} \${f(false)}</p>`));
    expect($("#v").textContent).toBe("1 2 6 8 11 12 7 8");
  });

  test("nested: a branch that is itself a value `if` (g-nested-value-form-if-renders-empty-s462's shape)", async () => {
    await load(P(`    function h(c: bool, d: bool) -> string { return if (c) { if (d) { "cd" } else { "c" } } else { "none" }; }`,
      `        <p id="v">\${h(true, true)} \${h(true, false)} \${h(false, true)}</p>`));
    expect($("#v").textContent).toBe("cd c none");
  });

  test("the condition narrows its branch (`x is given`); a kept head assignment (§50) is the condition", async () => {
    await load(P(`    function g(s: string) -> string | not { if (s == "") { return not; } return s + "!"; }
    function h(x: string | not) -> string { return if (x is given) { x } else { "none" }; }
    function m(s: string) -> string { let q: string | not = not; return if ((q = g(s)) is given) { q } else { "z" }; }`,
      `        <p id="v">\${h("a")} \${h(not)} \${m("b")} \${m("")}</p>`));
    expect($("#v").textContent).toBe("a none b! z");
  });

  test("the branch is evaluated only when taken (a call in the other branch does not run)", async () => {
    await load(P(`    function h(c: bool) -> int { let k = 0; const v = if (c) { 1 } else { k + 2 }; return v; }`,
      `        <p id="v">\${h(true)}</p>`));
    expect($("#v").textContent).toBe("1");
  });
});

// ---------------------------------------------------------------------------
describe("1B — the value form in a markup `${ … }` (§17.6.10): renders, reactively", () => {
  test("paren-less and parenthesized heads; re-rendered when the condition's cell changes", async () => {
    await load(P(``, `        <p id="a">\${ if @ok { "Admin" } else { "User" } }</p>\n        <p id="b">\${ if (@ok) { "Y" } else { "N" } }</p>`));
    expect([$("#a").textContent, $("#b").textContent]).toEqual(["Admin", "Y"]);
    click(btn("flip"));
    expect([$("#a").textContent, $("#b").textContent]).toEqual(["User", "N"]);
    click(btn("flip"));
    expect([$("#a").textContent, $("#b").textContent]).toEqual(["Admin", "Y"]);
  });

  test("no `else` renders NOTHING on the false path (g-value-form-if-no-else-renders-nothing: §17.6.10 \"SHALL render as nothing\")", async () => {
    await load(P(``, `        <p id="a">\${ if @ok { "YES" } }</p>`));
    expect($("#a").textContent).toBe("YES");
    click(btn("flip"));
    expect($("#a").textContent).toBe("");
    click(btn("flip"));
    expect($("#a").textContent).toBe("YES");
  });

  test("an empty-string branch renders \"\" and its sibling still renders (g-value-form-if-empty-string-branch-renders-nothing)", async () => {
    await load(P(``, `        <p id="a">\${ if @ok { "" } else { "msg" } }</p>`));
    expect($("#a").textContent).toBe("");
    click(btn("flip"));
    expect($("#a").textContent).toBe("msg");
  });

  test("a nested value `if` renders its inner value (g-nested-value-form-if-renders-empty-s462)", async () => {
    await load(P(``, `        <p id="a">\${ if @ok { if @n > 0 { "cd" } else { "c" } } else { "none" } }</p>`));
    expect($("#a").textContent).toBe("c");
    click(btn("bump"));
    expect($("#a").textContent).toBe("cd");
    click(btn("flip"));
    expect($("#a").textContent).toBe("none");
  });

  test("an `else if` chain; a branch reading a cell re-renders on that cell", async () => {
    await load(P(``, `        <p id="a">\${ if @n > 1 { "big" } else if @n > 0 { "small" } else { "zero" } }</p>\n        <p id="b">\${ if @ok { @n * 10 } else { 0 } }</p>`));
    expect([$("#a").textContent, $("#b").textContent]).toEqual(["zero", "0"]);
    click(btn("bump"));
    expect([$("#a").textContent, $("#b").textContent]).toEqual(["small", "10"]);
    click(btn("bump"));
    expect([$("#a").textContent, $("#b").textContent]).toEqual(["big", "20"]);
  });

  test("a function-call condition re-renders when a cell the function reads changes (g-value-form-if-fn-condition-not-reactive)", async () => {
    await load(P(`    function isOn() -> bool { return @ok; }`, `        <p id="a">\${ if isOn() { "on" } else { "off" } }</p>`));
    expect($("#a").textContent).toBe("on");
    click(btn("flip"));
    expect($("#a").textContent).toBe("off");
  });

  test("printed: the value `if` is one conditional expression — valid JS, no `if (` in an expression (g-value-form-if-in-expression-invalid-js-s465)", () => {
    const out = js(P(`    function f(c: bool) -> int { const s: S = { a: if (c) { 7 } else { 8 }, b: 0 }; return s.a; }`, `        <p id="a">\${ if @ok { "Y" } else { "N" } } \${f(@ok)}</p>`));
    expect(() => new Function(out.replace(/^import .*$/gm, "").replace(/^export /gm, ""))).not.toThrow();
    expect(out).not.toMatch(/:\s*if\s*\(/);
  });
});

// ---------------------------------------------------------------------------
describe("1C — typing (§17.6.2 / §17.6.3 / §17.6.4)", () => {
  test("the arms' types join (a union is not an error, §17.6.2 \"SHALL NOT require all arms to lift the same concrete type\")", () => {
    expect(codes(P(`    function h(c: bool) -> int { const v = if (c) { "a" } else { 1 }; return 0; }`))).toEqual([]);
  });
  test("no `else` into a `T` slot is E-TYPE-031 (§17.6.4: \"If the binding site has a type annotation of `T` … SHALL emit E-TYPE-031\")", () => {
    expect(codes(P(`    function h(c: bool) -> int { const v: int = if (c) { 2 }; return v; }`))).toEqual(["E-TYPE-031"]);
    expect(codes(P(`    function h(c: bool) -> int { return if (c) { 2 }; }`))).toEqual(["E-TYPE-031"]);
  });
  test("a condition is a `bool` — E-COND-NOT-BOOLEAN names the `if` condition", () => {
    const d = diag(P(`    function h(c: int) -> int { return if (c) { 1 } else { 2 }; }`), "E-COND-NOT-BOOLEAN");
    expect(d.message).toMatch(/^an `if` condition needs a `bool`/);
  });
  test("a statement `if` is unchanged", () => {
    expect(codes(P(`    function h(c: bool) -> int { if (c) { return 1; } else if (!c) { return 2; } return 3; }`))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("1D — branch shapes: errors by their own code, the INTERIM refusal", () => {
  test("a bare tail after a statement is E-ARM-TAIL-VALUE (RULED S469; with the `;` it is the only report)", () => {
    expect(codes(P(`    function h(c: bool) -> int { const v = if (c) { one(); 2; } else { 3 }; return v; }`))).toEqual(["E-ARM-TAIL-VALUE"]);
    expect(codes(P(`    function h(c: bool) -> int { const v = if (c) { one(); 2 } else { 3 }; return v; }`)).sort()).toEqual(["E-ARM-TAIL-VALUE", "E-STMT-MISSING-SEMICOLON"]);
  });
  test("a second `lift` on one branch's path is E-LIFT-002 (§17.6.9 Example 6)", () => {
    expect(codes(P(`    function h(c: bool) -> int { const v = if (c) { lift 1; lift 2; } else { 3 }; return v; }`))).toEqual(["E-LIFT-002"]);
  });
  test("INTERIM: statements before the `lift` — refused by name, naming the buildable form", () => {
    const src = P(`    function h(c: bool) -> int { const v = if (c) { one(); lift 2; } else { 3 }; return v; }`);
    expect(codes(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(diag(src, "E-BOOTSTRAP-UNSUPPORTED").message).toMatch(/holds statements before its `lift`.*`\{ e \}` or `\{ lift e; \}`/);
  });
  test("INTERIM: an empty branch; a branch whose `lift` is on only some paths", () => {
    expect(codes(P(`    function h(c: bool) -> int { const v = if (c) { } else { 3 }; return 1; }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(P(`    function h(c: bool, d: bool) -> int { const v = if (c) { one(); if (d) { lift 1; } } else { 3 }; return 1; }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("every branch is braced (§17.6.1); a logic-position head takes its parentheses", () => {
    expect(codes(P(`    function h(c: bool) -> int { const v = if (c) 1 else 2; return v; }`))).toEqual(["E-PARSE-EXPECTED", "E-PARSE-EXPECTED"]);
    expect(codes(P(`    function h(c: bool) -> int { const v = if c { 1 } else { 2 }; return v; }`))).toContain("E-PARSE-EXPECTED");
  });
});

// ---------------------------------------------------------------------------
describe("1E — a failable call reached through a value `if` is E-ERROR-002 (g-value-form-if-for-unwalked-for-e-error-002-s469 / -failable-call-unchecked-s469)", () => {
  test("in the condition", () => {
    expect(codes(P(`    function h(p: string) -> bool { const r = if (check(p)) { true } else { false }; return r; }`))).toEqual(["E-ERROR-002"]);
  });
  test("in a branch (a `{ e }` branch and a `{ lift e; }` branch)", () => {
    expect(codes(P(`    function h(p: string) -> bool { const r = if (p != "") { check(p) } else { false }; return r; }`))).toEqual(["E-ERROR-002"]);
    expect(codes(P(`    function h(p: string) -> bool { const r = if (p != "") { lift check(p); } else { false }; return r; }`))).toEqual(["E-ERROR-002"]);
  });
  test("in a markup value form", () => {
    expect(codes(P(``, `        <p>\${ if check("x") { "in" } else { "out" } }</p>`))).toContain("E-ERROR-002");
  });
});

// ---------------------------------------------------------------------------
describe("2 — an arm body that reads as an object literal is that object (§18.5)", () => {
  test("`key: value` entries, string keys, keys in any order — the object (runtime)", async () => {
    await load(P(`    function h(k: K) -> int { const v: S = match k { .A :> { a: 1, b: 2 }, .B :> { "a": 3, "b": 4 }, .C :> { b: 6, a: 5 } }; return v.a * 10 + v.b; }`,
      `        <p id="v">\${h(.A)} \${h(.B)} \${h(.C)}</p>`));
    expect($("#v").textContent).toBe("12 34 56");
  });

  test("shorthand entries `{ a, b }` (two or more), a trailing `,`, a value that is an expression (runtime)", async () => {
    await load(P(`    function h(k: K, a: int, b: int) -> int { const v: S = match k { .A :> { a, b }, .B :> { a: a + b, b: one(), }, .C :> { a: 0, b } }; return v.a * 10 + v.b; }`,
      `        <p id="v">\${h(.A, 1, 2)} \${h(.B, 1, 2)} \${h(.C, 1, 2)}</p>`));
    expect($("#v").textContent).toBe("12 31 2");
  });

  test("a `!{}` handler arm reads the object too; its struct type is not carried into handler arms yet (g-boot-object-literal-struct-context-positions-s475)", () => {
    // the parse is §18.5's (no E-STMT-MISSING-SEMICOLON / E-PARSE-EXPR, as before);
    // the annotated binding's struct type does not reach a `!{}` arm's value —
    // fails closed, E-TYPE-STRUCT-CONTEXT, as `return { … }` does today
    expect(codes(P(`    function get(id: string)! L { if (id == "x") fail L.NotFound(id); const s: S = { a: 9, b: 9 }; return s; }
    function h(id: string) -> int { const v: S = get(id) !{ .NotFound(i) :> { a: 1, b: 0 }, .Timeout :> { a: 2, b: 0 } }; return v.a; }`))).toEqual(["E-TYPE-STRUCT-CONTEXT", "E-TYPE-STRUCT-CONTEXT"]);
  });

  test("the object's position gives its struct type, as for any object literal (an unannotated one is E-TYPE-STRUCT-CONTEXT, like `const v = { … }`)", () => {
    expect(codes(P(`    function h(k: K) -> int { const v = match k { .A :> { a: 1, b: 2 }, else :> { a: 3, b: 4 } }; return 0; }`))).toEqual(["E-TYPE-STRUCT-CONTEXT", "E-TYPE-STRUCT-CONTEXT"]);
    expect(codes(P(`    function h(k: K) -> int { const v = { a: 1, b: 2 }; return 0; }`))).toEqual(["E-TYPE-STRUCT-CONTEXT"]);
  });

  test("the other readings are unchanged: a lone shorthand name is E-MATCH-ARM-SHORTHAND-AMBIGUOUS; `{ e; }` / `{ e }` is the one expression; a statement list is a block", async () => {
    expect(codes(P(`    function h(k: K, a: int) -> int { const v = match k { .A :> { a }, else :> 2 }; return v; }`))).toEqual(["E-MATCH-ARM-SHORTHAND-AMBIGUOUS"]);
    expect(codes(P(`    function h(k: K) -> int { const v = match k { .A :> { one(); }, .B :> { one() }, else :> 2 }; return v; }`))).toEqual([]);
    expect(codes(P(`    function h(k: K) -> int { const v = match k { .A :> { one(); lift 4; }, else :> 2 }; return v; }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("an object literal outside an arm takes shorthand entries too (`{ a, b }` is `{ a: a, b: b }`, runtime)", async () => {
    await load(P(`    function h(a: int, b: int) -> int { const v: S = { a, b }; return v.a * 10 + v.b; }`, `        <p id="v">\${h(3, 4)}</p>`));
    expect($("#v").textContent).toBe("34");
  });
});
