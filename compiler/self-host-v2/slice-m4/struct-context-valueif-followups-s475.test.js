// struct-context-valueif-followups-s475.test.js — s475-boot-struct-context-valueif-followups:
// the follow-ups of the #1762 review.
//
// 1. g-boot-object-literal-struct-context-positions-s475 — §18.5: "An arm body `{ … }`
//    whose content is an object literal SHALL be that object, in every position a `match`
//    appears (declaration, `return`, argument, statement), exactly as `return { … }` and
//    `f({ … })` read it." An object literal is a struct value of the type its POSITION
//    gives (§66.18: constructed by field name); §14.10 names the positions that carry a
//    type: "a function parameter type", "a function return type". §19.4.3: a value arm
//    of a handler SHALL "Yield a value of the call's success type". So a `return`
//    operand takes the function's declared return type, an argument its parameter's
//    type, and a `!{}` / failable-`match` arm's value the POSITION's type (or, where
//    the position has none, the callee's declared success type) — r1 (#1767 review F1),
//    see struct-context-valueif-followups-r1-s475.test.js.
//
// 2. A markup value `if` whose bare condition starts with `(` — §17.6.10
//    `value-form-if ::= 'if' condition '{' expression '}'`: `${ if (@ok) && @n > 0 { … } }`.
//    The `(` is the head's own only when a `{` follows its `)` (§17.6.1).
// 3. A value `if` as a match / `!{}` arm's brace body — §7.2.2 rule 3: "a `{ … }`
//    holding exactly ONE expression and no `;` at its own top level, written as the
//    body of a `match` or `!{}` arm whose value is used (§18.5) … is that
//    expression". In a STATEMENT position the brace is a statement list (§7.2.2
//    rule 3: "In a STATEMENT position … the arm's `{ … }` is a statement list"), so
//    its `if` is a statement `if`.
// 4. A `[computed]` or number key in an object literal — §18.5's object test reads
//    the brace as an object, but an object literal is a struct value built by field
//    name (§66.18; §14.3 fields are identifiers): ONE E-PARSE-OBJECT, no cascade.
//
// Graded on diagnostic codes, checkCore, and the RUNTIME through the slice runtime in
// happy-dom.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const $ = (sel) => document.querySelector(sel);
let k = 0;
const load = async (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  await loadProgram(r.core, "scvf-" + k++, []);
};

const DECLS = [
  "    let <n:int=0/>",
  "    let <ok:bool=true/>",
  "    type K:enum = { A, B, C }",
  "    type S:struct = { a: int, b: int }",
  "    type L:enum = { NotFound(id: string), Timeout }",
  "    function one() -> int { return 1; }",
].join("\n");
const BUTTONS = `        <button onclick={ @ok = !@ok; }>flip</button>\n        <button onclick={ @n = @n + 1; }>bump</button>`;
const P = (decls, main = "        <p>x</p>") => `<program>\n${DECLS}\n${decls}\n    <main>\n${main}\n${BUTTONS}\n    </main>\n</program>\n`;
const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);
const CHECK = `    function check(p: string)! L { if (p == "x") fail L.Timeout; return true; }`;

// ---------------------------------------------------------------------------
describe("1 — an object literal takes its struct type from a `return`, an argument, a handler arm (§18.5, §14.10, §19.4.3)", () => {
  test("`return { … }` in a `-> S` function, and in a `-> S | not` one (runtime)", async () => {
    await load(P(`    function mk(a: int) -> S { return { a: a, b: a + 1 }; }
    function opt(c: bool) -> S | not { if (c) return not; return { b: 7, a: 6 }; }
    function h() -> int { const s: S = mk(3); const o = opt(false); return match o { not :> -1, else :> s.a * 100 + s.b * 10 + 0 }; }`,
      `        <p id="v">\${h()}</p>`));
    expect($("#v").textContent).toBe("340");
  });

  test("an argument `f({ … })` takes the parameter's struct type (runtime)", async () => {
    await load(P(`    function g(s: S) -> int { return s.a * 10 + s.b; }
    function h(x: int) -> int { return g({ a: x, b: 2 }) + g({ b: 1, a: 0 }); }`,
      `        <p id="v">\${h(3)}</p>`));
    expect($("#v").textContent).toBe("33");
  });

  test("an object arm under `return match` and under a `match` argument (runtime)", async () => {
    await load(P(`    function g(s: S) -> int { return s.a * 10 + s.b; }
    function r(k: K, a: int, b: int) -> S { return match k { .A :> { a, b }, .B :> { a: b, b: a }, else :> { a: 0, b: 0 } }; }
    function q(k: K) -> int { return g(match k { .A :> { a: 1, b: 2 }, else :> { a: 3, b: 4 } }); }
    function h(k: K) -> int { const s: S = r(k, 1, 2); return s.a * 10 + s.b; }`,
      `        <p id="v">\${h(.A)} \${h(.B)} \${h(.C)} \${q(.A)} \${q(.B)}</p>`));
    expect($("#v").textContent).toBe("12 21 0 12 34");
  });

  test("a `!{}` arm under `return` in a `-> S` function, and a `{ lift { … }; }` arm (runtime)", async () => {
    await load(P(`    function get(id: string)! L { if (id == "x") fail L.NotFound(id); if (id == "t") fail L.Timeout; const s: S = { a: 9, b: 9 }; return s; }
    function h(id: string) -> S { return get(id) !{ .NotFound(i) :> { a: 1, b: 0 }, .Timeout :> { lift { a: 2, b: 0 }; } }; }
    function w(id: string) -> int { const s: S = h(id); return s.a; }`,
      `        <p id="v">\${w("x")} \${w("t")} \${w("y")}</p>`));
    expect($("#v").textContent).toBe("1 2 9");
  });

  test("the struct's own checks apply in those positions: a missing / unknown field is E-TYPE-STRUCT-FIELD", () => {
    expect(codes(P(`    function h() -> S { return { a: 1, c: 2 }; }`))).toEqual(["E-TYPE-STRUCT-FIELD", "E-TYPE-STRUCT-FIELD"]);
    expect(codes(P(`    function g(s: S) -> int { return s.a; }
    function h() -> int { return g({ a: 1 }); }`))).toEqual(["E-TYPE-STRUCT-FIELD"]);
  });

  test("a position that carries no struct type stays E-TYPE-STRUCT-CONTEXT (fail closed)", () => {
    // a non-struct return type
    expect(codes(P(`    function h() -> int { return { a: 1 }; }`))).toEqual(["E-TYPE-STRUCT-CONTEXT"]);
    // an unannotated binding of a match, and of a handler on a callee with no declared success type
    expect(codes(P(`    function h(k: K) -> int { const v = match k { .A :> { a: 1, b: 2 }, else :> { a: 3, b: 4 } }; return 0; }`))).toEqual(["E-TYPE-STRUCT-CONTEXT", "E-TYPE-STRUCT-CONTEXT"]);
    expect(codes(P(`    function get(id: string)! L { if (id == "x") fail L.Timeout; return true; }
    function h() -> int { const r = get("y") !{ .NotFound(i) :> { a: 1, b: 2 }, _ :> { a: 0, b: 0 } }; return 0; }`))).toEqual(["E-TYPE-STRUCT-CONTEXT", "E-TYPE-STRUCT-CONTEXT"]);
    // an unannotated parameter
    expect(codes(P(`    function h() { const v = { a: 1, b: 2 }; }`))).toEqual(["E-TYPE-STRUCT-CONTEXT"]);
  });

  test("a bare variant in an argument / `return` resolves against the position's enum (§14.10): an unknown one is E-TYPE-VARIANT", () => {
    expect(codes(P(`    function g(k: K) -> int { return 1; }
    function h() -> int { return g(.B); }`))).toEqual([]);
    expect(codes(P(`    function g(k: K) -> int { return 1; }
    function h() -> int { return g(.Timeout); }`))).toEqual(["E-TYPE-VARIANT"]);
    expect(codes(P(`    function h() -> K { return .Timeout; }`))).toEqual(["E-TYPE-VARIANT"]);
  });
});

// ---------------------------------------------------------------------------
describe("2 — a markup value `if` whose bare condition starts with `(` (§17.6.10 `'if' condition '{'`)", () => {
  test("`(@ok) && @n > 0`, `(@ok) || …` with `else`, a grouped operand `(@n + 1) * 2 > 3`; reactive (runtime)", async () => {
    await load(P(``, `        <p id="a">\${ if (@ok) && @n > 0 { "y" } }</p>
        <p id="b">\${ if (@ok) || @n > 1 { "y" } else { "n" } }</p>
        <p id="c">\${ if (@n + 1) * 2 > 3 { "big" } else { "small" } }</p>`));
    expect([$("#a").textContent, $("#b").textContent, $("#c").textContent]).toEqual(["", "y", "small"]);
    click(btn("bump"));
    expect([$("#a").textContent, $("#b").textContent, $("#c").textContent]).toEqual(["y", "y", "big"]);
    click(btn("flip"));
    expect([$("#a").textContent, $("#b").textContent, $("#c").textContent]).toEqual(["", "n", "big"]);
  });

  test("an `else if` with a `(`-led bare condition; the parenthesized head and the operand form are unchanged (runtime)", async () => {
    await load(P(``, `        <p id="a">\${ if @n > 2 { "big" } else if (@n) > 0 && @ok { "small" } else { "zero" } }</p>
        <p id="b">\${ if (@ok) { "Y" } else { "N" } }</p>
        <p id="c">\${ if (@ok) { "y" } else { "n" } + "!" }</p>`));
    expect([$("#a").textContent, $("#b").textContent, $("#c").textContent]).toEqual(["zero", "Y", "y!"]);
    click(btn("bump"));
    expect($("#a").textContent).toBe("small");
  });

  test("still refused: an unbraced branch (§17.6.1), and a bare head outside a markup `${ }`'s sole content", () => {
    expect(codes(P(``, `        <p>\${ if (@ok) "y" else "n" }</p>`))).toEqual(["E-PARSE-EXPECTED", "E-PARSE-EXPECTED"]);
    expect(codes(P(`    function h(c: bool, n: int) -> int { return if (c) && n > 0 { 1 } else { 2 }; }`))).toContain("E-PARSE-EXPECTED");
  });
});

// ---------------------------------------------------------------------------
describe("3 — a value `if` as an arm's one-expression brace (§7.2.2 rule 3, §18.5)", () => {
  test("`return match` / `const v = match` / `!{}` arms: `{ if … }`, `{ if …; }`, `{ e; }` branches, `else if`, no `else` (runtime)", async () => {
    await load(P(`${CHECK}
    function a(k: K, c: bool) -> int { return match k { .A :> { if (c) { 1 } else { 2 } }, .B :> { if (c) { 3; } else { 4; } }, else :> { if (c) { 5 } else if (!c) { 6 } else { 7 }; } }; }
    function b(k: K, c: bool) -> int { const v = match k { .A :> { if (c) { 8 } }, else :> 0 }; return match v { not :> -1, else :> v }; }
    function h(p: string, c: bool) -> int { const v = check(p) !{ .Timeout :> { if (c) { 10 } else { 20 } }, _ :> 0 }; return 0; }
    function g(p: string, c: bool) -> int { return match check(p) { .Ok(x) :> 1, .Timeout :> { if (c) { 30 } else { 40 } }, _ e :> 0 }; }`,
      `        <p id="v">\${a(.A, true)} \${a(.A, false)} \${a(.B, true)} \${a(.B, false)} \${a(.C, true)} \${a(.C, false)} \${b(.A, true)} \${b(.A, false)} \${g("x", true)} \${g("x", false)} \${g("y", true)}</p>`));
    expect($("#v").textContent).toBe("1 2 3 4 5 6 8 -1 30 40 1");
  });

  test("in a STATEMENT-position `match` / `!{}` the brace is a statement list — its `if` is a statement `if` (runtime)", async () => {
    await load(P(`${CHECK}
    function w(k: K, c: bool) { match k { .A :> { if (c) { @n = 1; } else { @n = 2; } }, .B :> { if (c) { @n = 7; } }, else :> { @n = 3; } } }
    function x(c: bool) { check("x") !{ .Timeout :> { if (c) { @n = 4; } else { @n = 5; } }, _ :> { } }; }
    function y(j: K, c: bool) { match K.A { .A :> { match j { .B :> { if (c) { @n = 6; } }, else :> { } } }, else :> { } } }`,
      `        <p id="v">\${@n}</p>
        <button onclick={ w(.A, true); }>wa</button>
        <button onclick={ w(.A, false); }>wb</button>
        <button onclick={ x(false); }>xb</button>
        <button onclick={ y(.B, true); }>yb</button>`));
    click(btn("wa")); expect($("#v").textContent).toBe("1");
    click(btn("wb")); expect($("#v").textContent).toBe("2");
    click(btn("xb")); expect($("#v").textContent).toBe("5");
    click(btn("yb")); expect($("#v").textContent).toBe("6");
  });

  test("statement position keeps the statement list's rules: a branch's bare `e` owes its `;` (§7.2.2 rule 1)", () => {
    expect(codes(P(`    function h(k: K, c: bool) { match k { .A :> { if (c) { one() } else { one() } }, else :> { } } }`))).toEqual(["E-STMT-MISSING-SEMICOLON", "E-STMT-MISSING-SEMICOLON"]);
    expect(codes(P(`    function h(k: K, c: bool) { match k { .A :> { if (c) { one(); } }, else :> { } } }`))).toEqual([]);
  });

  test("the value reading's own rules: an assignment branch is E-ASSIGN-POSITION; statements after the `if` make the brace a block", () => {
    expect(codes(P(`    function h(k: K, c: bool) -> int { return match k { .A :> { if (c) { @n = 1; } else { 2 } }, else :> 0 }; }`))).toEqual(["E-ASSIGN-POSITION"]);
    expect(codes(P(`    function h(k: K, c: bool) -> int { return match k { .A :> { if (c) { one(); } one(); lift 2; }, else :> 0 }; }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

// ---------------------------------------------------------------------------
describe("4 — a `[computed]` or number key in an object literal: ONE E-PARSE-OBJECT, no cascade", () => {
  test("in an annotated declaration, and as an arm's object body", () => {
    expect(codes(P(`    function h(s: string) -> int { const o: S = { [s]: 1, b: 2 }; return 0; }`))).toEqual(["E-PARSE-OBJECT"]);
    expect(codes(P(`    function h(k: K, s: string) -> S { return match k { .A :> { [s]: 1 }, else :> { a: 0, b: 0 } }; }`))).toEqual(["E-PARSE-OBJECT"]);
    expect(codes(P(`    function h() -> int { const o: S = { 1: 2, b: 2 }; return 0; }`))).toEqual(["E-PARSE-OBJECT"]);
    expect(codes(P(`    function h(k: K) -> S { return match k { .A :> { 1: 2, b: 3 }, else :> { a: 0, b: 0 } }; }`))).toEqual(["E-PARSE-OBJECT"]);
  });

  test("the message names the struct rule", () => {
    const d = run(P(`    function h(s: string) -> int { const o: S = { [s]: 1, b: 2 }; return 0; }`)).diags[0];
    expect(d.message).toContain("computed key");
    expect(d.message).toContain("§66.18");
  });
});
