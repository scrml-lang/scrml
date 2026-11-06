// handled-landing-check-r1-s475.test.js — s475-boot-handled-landing-check r1 (#1777 review).
//
// §66.1 rule 5: "every cell and field write is type-checked against the target's declared
// type". §19.4.3 (value position): every arm SHALL "Yield a value of the call's success
// type". §18.5 (ruled S469): a statement-holding block arm yields its value with `lift`.
//
// F1 (HIGH): typeHandled took an arm's value only from a one-expression arm, so a block arm
//   `{ const z = "q"; lift z; }` joined nothing and "q" landed in an `int` cell — at a cell
//   write, an annotated const, a `-> int` return, a call argument, a failable `match` arm,
//   `{ @msg = "x"; lift "q"; }`, and a server callee's `!{}`.
// F2 (MED): (a) a join with one unproven branch was Unknown (nothing checks an Unknown), so a
//   proven-wrong branch beside it landed unchecked — a `!{}` whose success is "str" and one arm
//   is unproven, and the plain `@n = @ok ? u(1) : "s"`. Now that join is `Partial` (its proven
//   members, checked where it lands). (b) a recursive return joined the recursive call's
//   Unknown, so `r(i)! L { … return r(i - 1)?; return "s"; }` was unchecked. Now the return
//   type is a LEAST fixpoint: a return that is a call (or `?`) of a function not yet settled
//   contributes nothing, so recursion contributes nothing to its own type (also mutual).
// Every "red on ca40f34e1" test compiled clean on #1777's head ca40f34e1 (the review's
// run-time proof: the wrong value reached the cell).

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });

const WDSM = "W-DEPRECATED-SERVER-MODIFIER";
const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code).filter((c) => c !== WDSM);

const DECLS = [
  "    let <n:int=0/>",
  "    let <ok:bool=true/>",
  "    let <msg:string=\"\"/>",
  "    type L:enum = { NotFound(id: string), Timeout }",
].join("\n");
const P = (d) => `<program>\n${DECLS}\n${d}\n    <main>\n        <button onclick=h()>go</button>\n        <p id="n">\${@n}</p>\n    </main>\n</program>\n`;

const GI = `    function gi(i: int)! L { if (i < 0) fail L.Timeout; return 1; }\n`;
const G = `    function g(i: int)! L { if (i < 0) fail L.Timeout; return "str"; }\n`;
// a value the typer proves only in part: `k * u(k - 1)` is not proven (the recursive call is
// a `*` operand), so u's return is `int` beside an unproven branch
const U = `    function u(k: int) { if (k <= 1) return 1; return k * u(k - 1); }\n`;
const LIFT = `{ const z = "q"; lift z; }`;

const RED = {
  // F1 — every landing site of a `lift` block arm
  "F1 cell write": GI + `    function h() { @n = gi(-1) !{ .NotFound(id) :> 0, .Timeout :> ${LIFT} }; }`,
  "F1 annotated const": GI + `    function k() -> int { const r: int = gi(-1) !{ .NotFound(id) :> 0, .Timeout :> ${LIFT} }; return r; }\n    function h() { @n = k(); }`,
  "F1 -> int return": GI + `    function k() -> int { return gi(-1) !{ .NotFound(id) :> 0, .Timeout :> ${LIFT} }; }\n    function h() { @n = k(); }`,
  "F1 call argument": GI + `    function f(v: int) -> int { return v; }\n    function h() { const r = gi(-1) !{ .NotFound(id) :> 0, .Timeout :> ${LIFT} }; @n = f(r); }`,
  "F1 failable match arm": GI + `    function h() { @n = match gi(-1) { .Ok(v) :> v, .NotFound(id) :> 0, .Timeout :> ${LIFT} }; }`,
  "F1 write then lift": GI + `    function h() { @n = gi(-1) !{ .NotFound(id) :> 0, .Timeout :> { @msg = "x"; lift "q"; } }; }`,
  "F1 server callee (#1676 F3 shape)": `    server function fi() -> int { return 1; }\n    function h() { @n = fi() !{ .Transport(t) :> ${LIFT} }; }`,
  // F2a — an unproven branch no longer hides a proven-wrong one
  "F2a !{} success \"str\" beside an unproven arm": G + U + `    function h() { @n = g(1) !{ .NotFound(id) :> u(1), .Timeout :> 0 }; }`,
  "F2a plain ternary (on main too)": U + `    function h() { @n = @ok ? u(1) : "s"; }`,
  // F2b — least fixpoint: recursion contributes nothing to its own type
  "F2b self-recursive ! function": `    function r(i: int)! L { if (i < 0) fail L.Timeout; if (i > 0) return r(i - 1)?; return "s"; }\n    function h() { @n = r(1) !{ .NotFound(id) :> 0, .Timeout :> 0 }; }`,
  "F2b mutually recursive ! functions": `    function a(i: int)! L { if (i < 0) fail L.Timeout; return b(i - 1)?; }\n    function b(i: int)! L { if (i > 0) return a(i)?; return "s"; }\n    function h() { @n = a(1) !{ .NotFound(id) :> 0, .Timeout :> 0 }; }`,
  "F2b non-tail recursion (Partial)": U + `    function h() { @msg = u(3); }`,
};

describe("a wrong value reaching an int cell is refused, E-TYPE-031 (red on ca40f34e1)", () => {
  for (const [name, d] of Object.entries(RED)) {
    test(name, () => {
      expect(codes(P(d))).toEqual(["E-TYPE-031"]);
    });
  }
  test("the Partial message names the proven branch", () => {
    const r = run(P(U + `    function h() { @n = @ok ? u(1) : "s"; }`));
    expect(r.diags[0].message).toContain("may be `string`");
  });
});

// controls: the same shapes with values that fit compile AND run to the right value
const OK = {
  "F1 lift block arm, int": [GI + `    function h() { @n = gi(-1) !{ .NotFound(id) :> 0, .Timeout :> { const z = 7; lift z; } }; }`, "7"],
  "F1 failable match, int lift": [GI + `    function h() { @n = match gi(-1) { .Ok(v) :> v, .NotFound(id) :> 0, .Timeout :> { const z = 8; lift z; } }; }`, "8"],
  "F1 -> int return, int lift": [GI + `    function k() -> int { return gi(-1) !{ .NotFound(id) :> 0, .Timeout :> { const z = 9; lift z; } }; }\n    function h() { @n = k(); }`, "9"],
  "F2a !{} with an unproven int arm": [GI + U + `    function h() { @n = gi(1) !{ .NotFound(id) :> u(3), .Timeout :> 0 }; }`, "1"],
  "F2a ternary with an unproven int branch": [U + `    function h() { @n = @ok ? u(3) : 2; }`, "6"],
  "F2b self-recursive, int": [`    function r(i: int)! L { if (i < 0) fail L.Timeout; if (i > 0) return r(i - 1)?; return 3; }\n    function h() { @n = r(2) !{ .NotFound(id) :> 0, .Timeout :> 0 }; }`, "3"],
  "F2b mutual, int": [`    function a(i: int)! L { if (i < 0) fail L.Timeout; return b(i - 1)?; }\n    function b(i: int)! L { if (i > 0) return a(i)?; return 4; }\n    function h() { @n = a(2) !{ .NotFound(id) :> 0, .Timeout :> 0 }; }`, "4"],
  "F2b non-tail recursion into int": [U + `    function h() { @n = u(4); }`, "24"],
};

describe("controls — fitting values compile and run (green on both)", () => {
  let k = 0;
  for (const [name, [d, want]] of Object.entries(OK)) {
    test(name, async () => {
      const r = run(P(d));
      expect(r.diags.map((x) => `${x.code}: ${x.message}`).filter((c) => !c.startsWith(WDSM))).toEqual([]);
      expect(mods.check.checkCore(r.core)).toEqual([]);
      await loadProgram(r.core, "landing-r1-" + k++, []);
      click(document.querySelector("button"));
      await new Promise((res) => setTimeout(res, 20));
      expect(document.querySelector("#n").textContent).toBe(want);
    }, { timeout: 60000 });
  }
});
