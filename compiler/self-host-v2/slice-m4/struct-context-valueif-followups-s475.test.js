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
//    type, and a `!{}` / failable-`match` arm's value the callee's success type (or,
//    for a callee that declares none, the position's).
//
// Graded on diagnostic codes, checkCore, and the RUNTIME through the slice runtime in
// happy-dom.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

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
const P = (decls, main = "        <p>x</p>") => `<program>\n${DECLS}\n${decls}\n    <main>\n${main}\n    </main>\n</program>\n`;

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
