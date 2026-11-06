// partial-followups-s475.test.js — s475-boot-partial-followups (#1777 final review).
//
// #1777 added `VType.Partial(ts)` — the proven members of a join beside an unproven
// branch — and checked it where a value LANDS (checkValue / checkIndex). §66.1 rule 5:
// "every cell and field write is type-checked against the target's declared type"; each
// branch of a join is the value when it is taken, so each PROVEN member must fit. The
// review found the other consumers still read a Partial as Unknown (silent) where they
// judge a OneOf:
//   F1  a tape-literal element (checkNotElems): `[@ok ? "s" : u(2)]` into `int[]` held "s".
//   F2  markup text `${…}` rendered "[object Object]"; `==` (E-EQ-001), a loop `key`
//       (E-KEY-001) and `<each in=>` (E-EACH-NOT-SEQUENCE) — the last two judged no
//       choice either, so both are built.
//   iv  arithmetic / boolean / `+` operands (the gap's residual iv): `"x" + r(i - 1)` with
//       base `return 1` landed "xx1" in an `int` cell; `(@ok ? "s" : u(1)) * 2` landed NaN.
//   F3  a block arm ending in a BARE expression yielded it (armValues ignored `lifted`), so
//       E-ARM-TAIL-VALUE came with a cascaded E-TYPE-031.
//   F4  E-FN-007 named no types once a Partial was in the join, and fired or not by the
//       order of the `return`s.
// Every "red on 8045e0e35" test compiled clean (or as noted) on origin/main 8045e0e35.

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
  "    type L:enum = { NotFound(id: string), Timeout }",
  "    type K:enum = { A, B }",
  "    let <k:K=.A/>",
  // a value the typer proves only in part: `q * u(q - 1)` is an unproven branch beside
  // the proven `return 1`, so a call of u is `Partial([int])`
  "    function u(q: int) { if (q <= 1) return 1; return q * u(q - 1); }",
  "    fn uf(q: int) { if (q <= 1) return 1; return q * uf(q - 1); }",
  "    function us(q: int) { if (q <= 1) return \"a\"; return us(q - 1) + \"b\"; }",
].join("\n");
const P = (d, m = "") => `<program>\n${DECLS}\n${d}\n    <main>\n        <button onclick=h()>go</button>\n        <p id="n">\${@n}</p>\n        <p id="m">\${@msg}</p>\n${m}    </main>\n</program>\n`;
const GI = `    function gi(i: int)! L { if (i < 0) fail L.Timeout; return 1; }\n`;

const RED = {
  // F1
  "F1 Partial tape element into int[]": [`    function h() { const ns: int[] = [@ok ? "s" : u(2)]; @n = ns.length; }`, "", ["E-TYPE-031"]],
  "F1 nested tape element into int[][]": [`    function h() { const ns: int[][] = [[@ok ? "s" : u(2)]]; @n = ns.length; }`, "", ["E-TYPE-031"]],
  // F2
  "F2 markup text of a Partial struct": [`    function h() { @n = 1; }`, `        <p id="t">\${@ok ? @pt : u(1)}</p>\n`, ["E-TEXT-NON-PRIMITIVE"]],
  "F2 == with a Partial string": [`    function h() { @ok = (@ok ? "s" : u(1)) == 1; }`, "", ["E-EQ-001"]],
  "F2 == with a choice (OneOf twin)": [`    function h() { @ok = (@ok ? "s" : 2) == 1; }`, "", ["E-EQ-001"]],
  "F2 <each in=> over a Partial int": [`    function h() { @n = 1; }`, `        <each in=(@ok ? 5 : u(1)) as c><p>x</p></each>\n`, ["E-EACH-NOT-SEQUENCE"]],
  "F2 <each in=> over a choice (OneOf twin)": [`    function h() { @n = 1; }`, `        <each in=(@ok ? [1] : 5) as c><p>x</p></each>\n`, ["E-EACH-NOT-SEQUENCE"]],
  // iv
  "iv `+` string with a recursive int base": [`    function r(i: int) { if (i <= 0) return 1; return "x" + r(i - 1); }\n    function h() { @n = r(2); }`, "", ["E-OPERATOR-OPERAND-TYPE"]],
  "iv `*` on a Partial string": [`    function h() { @n = (@ok ? "s" : u(1)) * 2; }`, "", ["E-OPERATOR-OPERAND-TYPE"]],
  "iv `<` on a Partial string": [`    function h() { @ok = (@ok ? "s" : u(1)) < 2; }`, "", ["E-OPERATOR-OPERAND-TYPE"]],
  // a ternary operand of `&&` is judged arm by arm: `1` and u's proven `int` are both reported
  "iv `&&` on a Partial int": [`    function h() { @ok = (@ok ? 1 : u(1)) && @ok; }`, "", ["E-OPERATOR-OPERAND-TYPE", "E-OPERATOR-OPERAND-TYPE"]],
  "iv `&&` on a Partial call": [`    function h() { @ok = u(1) && @ok; }`, "", ["E-OPERATOR-OPERAND-TYPE"]],
  "iv `+` Partial mixing int and string": [`    function h() { @msg = "" + (@ok ? (@ok ? 1 : "s") : u(1)); }`, "", ["E-OPERATOR-OPERAND-TYPE"]],
  // a `match` whose arms are `string` and an `int` proven in part do not unify (§18.4 rule 3)
  "F2 match arms: string beside a Partial int": [`    function h() { const v = match @k { .A :> "s", .B :> u(1) }; @n = 1; }`, "", ["E-TYPE-001"]],
  // F3 — one diagnostic, no cascade
  "F3 bare block-arm tail": [GI + `    function h() { @n = gi(-1) !{ .NotFound(id) :> 0, .Timeout :> { const z = "q"; z; } }; }`, "", ["E-ARM-TAIL-VALUE"]],
};

describe("a Partial's proven members are judged where a OneOf's are (red on 8045e0e35)", () => {
  for (const [name, [d, m, want]] of Object.entries(RED)) {
    test(name, () => {
      expect(codes(P(d, m))).toEqual(want);
    });
  }
  test("F1 message names the proven branch", () => {
    const ds = diags(P(`    function h() { const ns: int[] = [@ok ? "s" : u(2)]; @n = ns.length; }`));
    expect(ds[0].message).toContain("may be `string`");
  });
  test("F2 loop key: a Partial key names its non-primitive proven member", () => {
    // (on 8045e0e35 this was E-KEY-001 too, as "the type … is not known": a Partial key
    // is refused by its unproven branch either way; the message now names the proven one)
    const ds = diags(P(`    <ps:S[replace]=([{ a: 1, b: 2 }])/>\n    function h() { @n = 1; }`, `        <ul>\${ for (const p of @ps key @ok ? p : u(1)) { lift <li>\${p.a}</li>; } }</ul>\n`));
    expect(ds.map((d) => d.code)).toEqual(["E-KEY-001"]);
    expect(ds[0].message).toContain("may be `S`");
  });
});

// F4 — every order of three returns (an unproven one among them) reports E-FN-007 naming
// both proven types; on 8045e0e35 two orders were silent and one named no types.
describe("F4 E-FN-007 is order-independent and names the types", () => {
  const RETS = ["return uf(1)", "return 1", "return \"s\""];
  const orders = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [1, 0, 2]];
  for (const o of orders) {
    test("order " + o.join(""), () => {
      const body = `if (c == 0) { ${RETS[o[0]]}; } if (c == 1) { ${RETS[o[1]]}; } ${RETS[o[2]]};`;
      const ds = diags(P(`    fn f(c: int) { ${body} }\n    function h() { @n = 1; }`));
      expect(ds.map((d) => d.code)).toEqual(["E-FN-007"]);
      expect(ds[0].message).toContain("`int`");
      expect(ds[0].message).toContain("`string`");
    });
  }
  test("one return of a choice is not a disagreement", () => {
    expect(codes(P(`    fn f(c: bool) { return c ? 1 : "s"; }\n    function h() { @n = 1; }`))).toEqual([]);
  });
  // (#1782 review r1 F2, §48.8 literal: a choice `return` beside `return 1` is two
  // different types — E-FN-007; was asserted silent here before r1)
  test("a choice return beside one of its members disagrees (§48.8)", () => {
    expect(codes(P(`    fn f(c: bool) { if (c) { return c ? 1 : "s"; } return 1; }\n    function h() { @n = 1; }`))).toEqual(["E-FN-007"]);
  });
});

// controls — fitting values compile AND run to the right value
const OK = {
  "F1 Partial int element into int[]": [`    function h() { const ns: int[] = [@ok ? 3 : u(2)]; @n = ns[0]; }`, "", "3", "#n"],
  "F2 markup text of a Partial int": [`    function h() { @n = 1; }`, `        <p id="t">\${@ok ? 7 : u(1)}</p>\n`, "7", "#t"],
  "F2 == of Partial int with int": [`    function h() { if ((@ok ? 2 : u(1)) == 2) { @n = 5; } }`, "", "5", "#n"],
  "F2 <each in=> over a Partial tape": [`    function h() { @n = 1; }`, `        <p id="t"><each in=(@ok ? [4] : [u(1)]) as c>\${c}</each></p>\n`, "4", "#t"],
  "iv `*` on a Partial int": [`    function h() { @n = (@ok ? 3 : u(1)) * 2; }`, "", "6", "#n"],
  "iv `+` on a recursive int": [`    function r(i: int) { if (i <= 0) return 1; return 1 + r(i - 1); }\n    function h() { @n = r(2); }`, "", "3", "#n"],
  "iv `+` on a recursive string": [`    function h() { @msg = "x" + us(3); }`, "", "xabb", "#m"],
  "F3 lifted block-arm tail": [GI + `    function h() { @n = gi(-1) !{ .NotFound(id) :> 0, .Timeout :> { const z = 4; lift z; } }; }`, "", "4", "#n"],
};

describe("controls — fitting values compile and run", () => {
  let k = 0;
  for (const [name, [d, m, want, sel]] of Object.entries(OK)) {
    test(name, async () => {
      const r = run(P(d, m));
      expect(r.diags.map((x) => `${x.code}: ${x.message}`).filter((c) => !c.startsWith(WDSM))).toEqual([]);
      expect(mods.check.checkCore(r.core)).toEqual([]);
      await loadProgram(r.core, "partial-followups-" + k++, []);
      click(document.querySelector("button"));
      await new Promise((res) => setTimeout(res, 20));
      expect(document.querySelector(sel).textContent).toBe(want);
    }, { timeout: 60000 });
  }
});
