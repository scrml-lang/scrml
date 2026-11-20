// is-variant-s480.test.js — s480-boot-cheap-wins item 3: `x is .V` (g-boot-is-variant-unbuilt-s480).
//
// SPEC §18.17: "`expr is .V` evaluates to `true` if and only if `expr`'s runtime value is the variant
// `V` of its enum type. It evaluates to `false` for all other variants. No payload is bound or
// accessible by the `is` expression itself." · "The `is` operator SHALL be valid only when the
// left-hand operand is of an enum type. If the operand is not an enum type, this SHALL be a compile
// error (E-TYPE-062 …)." · "An unknown variant name SHALL be a compile error (E-TYPE-063 …)." ·
// "`expression is .VariantName` SHALL have result type `boolean`." · "`is` MAY be used in: `if`
// conditions, `class=` dynamic binding expressions, ternary expressions, … and any position where a
// boolean expression is valid."
//
// Before (red on base): every `x is .V` was refused by name — E-BOOTSTRAP-UNSUPPORTED "`is <variant>`
// (§18.17) is not in the bootstrap yet" (refusals.scrml). Now the parser reads it as the `match` that
// says it (`match x { .V :> true, else :> false }`, parse.scrml variantTest), its arms marked `test`
// so analyze reports §18.17's codes.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const fe = (src) => frontEnd(mods, [{ path: "app.scrml", src }], "app.scrml");
const errs = (r) => r.diags.filter((d) => d.severity === "Error");
const codes = (src) => errs(fe(src)).map((d) => d.code);
const $ = (sel) => document.querySelector(sel);
let k = 0;

async function run(src) {
  const r = fe(src);
  expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  await loadProgram(r.core, "s480-isvar-" + k++);
  return r;
}

const prog = (fns, markup = "") => `<program>
type S:enum = { A, B(n: int) }
let <s:S=.A/>
let <o:S | not=(not)/>
<name:string="x"/>
${fns}
<button id="b" onclick=flip()>flip</button>
${markup}
</program>
`;

describe("§18.17 — `x is .V` is a `bool`: true exactly for that variant (run)", () => {
  test("in markup, a ternary, `if=`, a function — a unit variant and a payload variant", async () => {
    await run(prog(`fn isA() -> bool { return @s is .A; }
fn notB() -> bool { return !@s is .B; }
function flip() { @s = .B(3); }`,
    `<p id="t">\${@s is .A ? "a" : "b"}</p><p id="f">\${isA() ? "y" : "n"}\${notB() ? "y" : "n"}</p><p id="w" if=(@s is .B)>bee</p>`));
    expect($("#t").textContent).toBe("a");
    expect($("#f").textContent).toBe("yy");
    expect($("#w")).toBeNull();
    click($("#b"));
    expect($("#t").textContent).toBe("b");
    expect($("#f").textContent).toBe("nn");
    expect($("#w").textContent).toBe("bee");
  });

  test("a narrowed `E | not` operand: `x is given && x is .V`", async () => {
    await run(prog(`fn hasB() -> bool { return @o is given && @o is .B; }
function flip() { @o = .B(1); }`, `<p id="h">\${hasB() ? "y" : "n"}</p>`));
    expect($("#h").textContent).toBe("n");
    click($("#b"));
    expect($("#h").textContent).toBe("y");
  });
});

describe("§18.17 — the codes", () => {
  const rule = (fn) => prog(fn + "\nfunction flip() { }");
  test("E-TYPE-062: a non-enum operand; an un-narrowed `E | not` operand", () => {
    expect(codes(rule(`fn f() -> bool { return @name is .B; }`))).toEqual(["E-TYPE-062"]);
    expect(codes(rule(`fn f() -> bool { return @o is .B; }`))).toEqual(["E-TYPE-062"]);
  });
  test("E-TYPE-063: an unknown variant name", () => {
    expect(codes(rule(`fn f() -> bool { return @s is .Zed; }`))).toEqual(["E-TYPE-063"]);
  });
  test("the result is a `bool` (into a non-bool is E-TYPE-031); no payload is bound", () => {
    expect(codes(rule(`fn f() -> int { return @s is .A; }`))).toEqual(["E-TYPE-031"]);
    expect(codes(rule(`fn f() -> bool { return @s is .B; }`))).toEqual([]);
  });
});
