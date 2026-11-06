// partial-followups-r1-s475.test.js — s475-boot-partial-followups r1 (#1782 review).
//
//   F1  (over-refusal) `==` / `!=` with a choice or `Partial` operand fired E-EQ-001 when ANY
//       member pair mismatched, refusing `(@ok ? 1 : "a") == (@ok ? 2 : "b")` and `a == a`.
//       §45.3 / S469 "same type only": refused only where a proven member of one side has
//       NO same-type partner among the other side's proven members.
//   F2  §48.8: "If `return` statements produce different types, E-FN-007 fires" — a
//       `return c ? 1 : "s"` beside `return 1` no longer excuses the disagreement
//       (§48.4.1's only way out is "an explicit union return type").
//   F3  E-INT-DIVISION judges a choice's / a `Partial`'s proven members: `@n = u(3) / 4`
//       ran with n = 1.5 in an `int` cell.
//   key the `<each key=…>` ATTRIBUTE form gets the loop-key rule (E-KEY-001): `key=@pt`
//       compiled and threw "`<each>`: duplicate key [object Object]" at run time.
// "red on b30d0277f" = the #1782 head before this round.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 180000 });

const WDSM = "W-DEPRECATED-SERVER-MODIFIER";
const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const diags = (src) => run(src).diags.filter((d) => d.code !== WDSM);
const codes = (src) => diags(src).map((d) => d.code);

const DECLS = [
  "    let <n:int=0/>",
  "    let <ok:bool=true/>",
  "    let <msg:string=\"\"/>",
  "    type S:struct = { a: int, b: int }",
  "    let <pt:S=({ a: 0, b: 0 })/>",
  "    type K:enum = { A, B }",
  "    let <k:K=.A/>",
  "    <ps:S[replace]=([{ a: 1, b: 2 }, { a: 3, b: 4 }])/>",
  // proven only in part: `q * u(q - 1)` is an unproven branch beside the proven `return 1`
  "    function u(q: int) { if (q <= 1) return 1; return q * u(q - 1); }",
  "    fn uf(q: int) { if (q <= 1) return 1; return q * uf(q - 1); }",
  "    function us(q: int) { if (q <= 1) return \"a\"; return us(q - 1) + \"b\"; }",
].join("\n");
const P = (d, m = "") => `<program>\n${DECLS}\n${d}\n    <main>\n        <button onclick=h()>go</button>\n        <p id="n">\${@n}</p>\n        <p id="m">\${@msg}</p>\n${m}    </main>\n</program>\n`;

const RED = {
  // F2 (§48.8) — red on b30d0277f: silent
  "F2 three returns, one a choice of the other two": [`    fn f(c: int) { if (c == 1) { return 1; } if (c == 2) { return "s"; } return c == 3 ? 1 : "s"; }\n    function h() { @n = 1; }`, "", ["E-FN-007"]],
  "F2 the choice return first": [`    fn f(c: int) { if (c == 3) { return c == 3 ? 1 : "s"; } if (c == 1) { return 1; } return "s"; }\n    function h() { @n = 1; }`, "", ["E-FN-007"]],
  "F2 a Partial int beside a choice": [`    fn f(c: int) { if (c == 1) { return uf(c); } return c == 3 ? 2 : "x"; }\n    function h() { @n = 1; }`, "", ["E-FN-007"]],
  "F2 a choice beside one of its members": [`    fn f(c: bool) { if (c) { return c ? 1 : "s"; } return 1; }\n    function h() { @n = 1; }`, "", ["E-FN-007"]],
  // F3 — red on b30d0277f: silent, ran n = 1.5
  "F3 Partial int / int": [`    function h() { @n = u(3) / 4; }`, "", ["E-INT-DIVISION"]],
  "F3 int / Partial int": [`    function h() { @n = 8 / u(3); }`, "", ["E-INT-DIVISION"]],
  "F3 Partial int / Partial int": [`    function h() { @n = u(3) / u(2); }`, "", ["E-INT-DIVISION"]],
  // key= attribute — red on b30d0277f: silent, threw at run time
  "key= a struct cell": [`    function h() { @n = 1; }`, `        <each in=@ps key=@pt as c><p>x</p></each>\n`, ["E-KEY-001"]],
  "key= a Partial with a struct branch": [`    function h() { @n = 1; }`, `        <each in=@ps key=(@ok ? @pt : u(1)) as c><p>x</p></each>\n`, ["E-KEY-001"]],
  "key= the row itself": [`    function h() { @n = 1; }`, `        <each in=@ps key=c as c><p>x</p></each>\n`, ["E-KEY-001"]],
};

// kept refused (green on b30d0277f and here): a member with no same-type partner
const KEPT = {
  "F1 choice == int: the string branch meets only int": [`    function h() { @ok = (@ok ? 1 : "s") == 1; }`, ["E-EQ-001"]],
  "F1 choice == enum cell": [`    function h() { @ok = (@ok ? 1 : "s") == @k; }`, ["E-EQ-001"]],
  "F1 OneOf twin (#1782 test)": [`    function h() { @ok = (@ok ? "s" : 2) == 1; }`, ["E-EQ-001"]],
  "F1 Partial string == int": [`    function h() { @ok = (@ok ? "s" : u(1)) == 1; }`, ["E-EQ-001"]],
  "F1 Partial call string == int": [`    function h() { @ok = us(2) == 1; }`, ["E-EQ-001"]],
  "F1 int == choice (either side)": [`    function h() { @ok = 1 != (@ok ? 1 : "s"); }`, ["E-EQ-001"]],
};

describe("r1 — red on b30d0277f", () => {
  for (const [name, [d, m, want]] of Object.entries(RED)) {
    test(name, () => { expect(codes(P(d, m))).toEqual(want); });
  }
  test("F2 names both types", () => {
    const ds = diags(P(`    fn f(c: int) { if (c == 1) { return 1; } if (c == 2) { return "s"; } return c == 3 ? 1 : "s"; }\n    function h() { @n = 1; }`));
    expect(ds[0].message).toContain("`int`");
    expect(ds[0].message).toContain("`string`");
  });
});

describe("r1 — kept refused", () => {
  for (const [name, [d, want]] of Object.entries(KEPT)) {
    test(name, () => { expect(codes(P(d))).toEqual(want); });
  }
  test("F1 message names the lone member", () => {
    const ds = diags(P(`    function h() { @ok = (@ok ? 1 : "s") == 1; }`));
    expect(ds[0].message).toContain("may be `string`");
  });
});

// compile clean (no run needed: the value's correctness is not in question)
const CLEAN = {
  "F2 one return of a choice": `    fn f(c: int) { return c == 3 ? 1 : "s"; }\n    function h() { @n = 1; }`,
  "F2 two returns of the same choice": `    fn f(c: int) { if (c == 1) { return c == 2 ? 1 : "s"; } return c == 3 ? "t" : 2; }\n    function h() { @n = 1; }`,
  "F2 a Partial int beside an int": `    fn f(c: int) { if (c == 1) { return 1; } return c == 3 ? 2 : uf(3); }\n    function h() { @n = 1; }`,
  "F3 Partial int / number": `    function h() { const z = u(3) / 4.5; @n = 1; }`,
};

describe("r1 — compile clean", () => {
  for (const [name, d] of Object.entries(CLEAN)) {
    test(name, () => { expect(codes(P(d))).toEqual([]); });
  }
});

// controls — red on b30d0277f where noted (F1 over-refusal); compile AND run to the right value
const OK = {
  // F1 — red on b30d0277f (E-EQ-001)
  "F1 two correlated choices": [`    function h() { if ((@ok ? 1 : "a") == (@ok ? 1 : "b")) { @n = 5; } }`, "", "5", "#n"],
  "F1 a choice local with itself": [`    function h() { const a = @ok ? 1 : "a"; if (a == a) { @n = 6; } }`, "", "6", "#n"],
  "F1 two locals of the same choice": [`    function h() { const a = @ok ? 1 : "a"; const b = @ok ? 2 : "b"; if (a != b) { @n = 7; } }`, "", "7", "#n"],
  "F1 `!=` of two choices": [`    function h() { if ((@ok ? 1 : "a") != (@ok ? 2 : "b")) { @n = 8; } }`, "", "8", "#n"],
  "F1 the Partial form": [`    function h() { const a = @ok ? (@ok ? 1 : "s") : u(1); if (a == a) { @n = 9; } }`, "", "9", "#n"],
  // key= attribute, primitive key — green on both
  "key= a primitive field": [`    function h() { @n = 1; }`, `        <p id="t"><each in=@ps key=c.a as c>\${c.b}</each></p>\n`, "24", "#t"],
};

describe("r1 controls — compile and run", () => {
  let k = 0;
  for (const [name, [d, m, want, sel]] of Object.entries(OK)) {
    test(name, async () => {
      const r = run(P(d, m));
      expect(r.diags.map((x) => `${x.code}: ${x.message}`).filter((c) => !c.startsWith(WDSM))).toEqual([]);
      expect(mods.check.checkCore(r.core)).toEqual([]);
      await loadProgram(r.core, "partial-followups-r1-" + k++, []);
      click(document.querySelector("button"));
      await new Promise((res) => setTimeout(res, 20));
      expect(document.querySelector(sel).textContent).toBe(want);
    }, { timeout: 60000 });
  }
});
