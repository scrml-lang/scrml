// struct-context-valueif-followups-r1-s475.test.js — s475-boot-struct-context-valueif-followups,
// fix round r1 (#1767 review F1-F3).
//
// F1 — §14.10 / §18.5: an object literal is a struct value of the type its POSITION gives
//    ("exactly as `return { … }` and `f({ … })` read it"). A `match` / `!{}` arm on a call
//    is resolved against the position's type; the callee's declared success type
//    (§19.4.3 "a value of the call's success type") is the fallback only where the
//    position has none. Preferring the callee's type built an object arm as the
//    callee's struct, and that value then landed in the position unchecked
//    (g-boot-handled-call-result-landing-unchecked-s473): wrong-typed programs that
//    were refused (E-TYPE-STRUCT-CONTEXT) before s475 compiled. Each is refused again.
//    INTERIM: a `!{}` in a position of a type other than the callee's success type gives
//    its arms no struct context (its success value would land unchecked) — refused as
//    before s475 until that gap's landing check exists.
// F2 — a value-`if` arm brace re-read as a statement list (statement-position form)
//    reports its soft diagnostics once, not once per reading.
// F3 — a statement `match` as the LAST of two or more statements in a value-position
//    block arm is a statement (the bare tail is E-ARM-TAIL-VALUE): its value-`if` arms
//    are statement lists, so the arm draws E-ARM-TAIL-VALUE alone.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const WDSM = "W-DEPRECATED-SERVER-MODIFIER";   // every program here declares `server function srv`
const codes = (src) => run(src).diags.map((d) => d.code).filter((c) => c !== WDSM);
const count = (cs, c) => cs.filter((x) => x === c).length;

const DECLS = [
  "    let <n:int=0/>",
  "    type K:enum = { A, B, C }",
  "    type S:struct = { a: int, b: int }",
  "    type R:struct = { a: int, c: int }",
  "    function one() -> int { return 1; }",
  "    server function srv() -> S { const s: S = { a: 1, b: 2 }; return s; }",
].join("\n");
const P = (decls) => `<program>\n${DECLS}\n${decls}\n    <main>\n        <p>x</p>\n    </main>\n</program>\n`;
const errs = (src) => codes(src).filter((c) => !c.startsWith("W-"));
const compiles = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => d.code).filter((c) => c !== WDSM)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
};

const SRV_MATCH_SB = `match srv() { .Ok(s) :> { a: 1, b: 2 }, .Transport(t) :> { a: 0, b: 0 } }`;

describe("F1 — a handler arm takes its position's type, not the callee's success type", () => {
  const refused = {
    "a `-> R` function returns a match whose arms build S": `    function h() -> R { return ${SRV_MATCH_SB}; }`,
    "`const r: R` from a match whose arms build S": `    function h() -> int { const r: R = ${SRV_MATCH_SB}; return r.c; }`,
    "`const r: int` from a match whose arms build S": `    function h() -> int { const r: int = ${SRV_MATCH_SB}; return r; }`,
    "`const r: int` from a match whose arms build S, read once": `    function h() -> int { const r: int = ${SRV_MATCH_SB}; return r + 1; }`,
    "an argument `x: R` from a match whose arms build S": `    function g(x: R) -> int { return x.c; }\n    function h() -> int { return g(${SRV_MATCH_SB}); }`,
    "`const r: int` from a `!{}` whose arm builds S": `    function h() -> int { const r: int = srv() !{ .Transport(t) :> { a: 0, b: 0 } }; return r; }`,
    "a `-> int` function returns a `!{}` whose arm builds S": `    function h() -> int { return srv() !{ .Transport(t) :> { a: 0, b: 0 } }; }`,
    // INTERIM (g-boot-handled-call-result-landing-unchecked-s473): S's success value would land in R
    "a `-> R` function returns a `!{}` on an `-> S` call (arm builds R)": `    function h() -> R { return srv() !{ .Transport(t) :> { a: 0, c: 0 } }; }`,
  };
  for (const [name, d] of Object.entries(refused)) {
    test(`refused: ${name}`, () => {
      expect(errs(P(d)).length).toBeGreaterThan(0);
    });
  }

  test("a `-> R` function returning a match whose arms build R compiles", () => {
    compiles(P(`    function h() -> R { return match srv() { .Ok(s) :> { a: 1, c: 1 }, .Transport(t) :> { a: 0, c: 0 } }; }`));
  });
  test("`const r: R` from a match whose arms build R compiles", () => {
    compiles(P(`    function h() -> int { const r: R = match srv() { .Ok(s) :> { a: 1, c: 1 }, .Transport(t) :> { a: 0, c: 0 } }; return r.c; }`));
  });
  test("an argument `x: R` from a match whose arms build R compiles", () => {
    compiles(P(`    function g(x: R) -> int { return x.c; }\n    function h() -> int { return g(match srv() { .Ok(s) :> { a: 1, c: 1 }, .Transport(t) :> { a: 0, c: 0 } }); }`));
  });
  test("a `!{}` whose arm builds the callee's (= the position's) struct compiles", () => {
    compiles(P(`    function h() -> S { return srv() !{ .Transport(t) :> { a: 0, b: 0 } }; }`));
    compiles(P(`    function h() -> int { const r: S = srv() !{ .Transport(t) :> { a: 0, b: 0 } }; return r.a; }`));
  });
  test("with no position type, the arm takes the callee's success type (the fallback)", () => {
    compiles(P(`    function h() -> int { const r = srv() !{ .Transport(t) :> { a: 0, b: 0 } }; return 0; }`));
  });
  test("a wrong-shaped arm against the position's struct names the position's struct", () => {
    const ds = run(P(`    function h() -> R { return ${SRV_MATCH_SB}; }`)).diags.filter((d) => d.code === "E-TYPE-STRUCT-FIELD");
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) expect(d.message).toContain("`R`");
  });
});

describe("F2 — a statement-position value-`if` arm brace reports its soft diagnostics once", () => {
  test("W-IS-SOME-DEPRECATED once", () => {
    const cs = codes(P(`    function h(k: K, v: int | not) { match k { .A :> { if (v is some) { one(); } else { one(); } }, else :> { } } }`));
    expect(count(cs, "W-IS-SOME-DEPRECATED")).toBe(1);
    expect(errs(P(`    function h(k: K, v: int | not) { match k { .A :> { if (v is some) { one(); } else { one(); } }, else :> { } } }`))).toEqual([]);
  });
  test("W-STRING-INTERP-LITERAL once (beside the undeclared `log`'s own report)", () => {
    const cs = codes(P(`    function h(k: K, c: bool) { match k { .A :> { if (c) { one(); } else { log("a \${c}"); } }, else :> { } } }`));
    expect(count(cs, "W-STRING-INTERP-LITERAL")).toBe(1);
  });
  test("the value-position reading reports it once too", () => {
    const cs = codes(P(`    function h(k: K, v: int | not) -> int { return match k { .A :> { if (v is some) { 1 } else { 2 } }, else :> 0 }; }`));
    expect(cs).toEqual(["W-IS-SOME-DEPRECATED"]);
  });
});

describe("F3 — a `match` as the last of several statements in a value-position block arm is a statement", () => {
  test("E-ARM-TAIL-VALUE alone (no E-ASSIGN-POSITION from a value-`if` reading of its arm)", () => {
    expect(codes(P(`    function h(k: K, j: K, c: bool) -> int { const v: int = match k { .A :> { one(); match j { .B :> { if (c) { @n = 1; } else { @n = 2; } }, else :> { } } }, else :> 0 }; return v; }`))).toEqual(["E-ARM-TAIL-VALUE"]);
  });
  test("with `lift` after it, the bootstrap's one refusal of a statement-holding value arm, no cascade", () => {
    expect(codes(P(`    function h(k: K, j: K, c: bool) -> int { const v: int = match k { .A :> { one(); match j { .B :> { if (c) { @n = 1; } else { @n = 2; } }, else :> { } } lift 3; }, else :> 0 }; return v; }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("in a statement-position arm, its statement `if` branches owe their `;` once each", () => {
    expect(codes(P(`    function h(k: K, j: K, c: bool) { match k { .A :> { one(); match j { .B :> { if (c) { one() } else { one() } }, else :> { } } }, else :> { } } }`))).toEqual(["E-STMT-MISSING-SEMICOLON", "E-STMT-MISSING-SEMICOLON"]);
  });
  test("in a statement-position arm, a well-formed nested statement `match` compiles", () => {
    compiles(P(`    function h(k: K, j: K, c: bool) { match k { .A :> { one(); match j { .B :> { if (c) { @n = 1; } else { @n = 2; } }, else :> { } } }, else :> { } } }`));
  });
  test("a lone `match` arm body stays the arm's value (one expression)", () => {
    compiles(P(`    function h(k: K, j: K, c: bool) -> int { return match k { .A :> { match j { .B :> { if (c) { 1 } else { 2 } }, else :> 3 } }, else :> 0 }; }`));
  });
});
