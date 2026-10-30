// typer-holes-s472.test.js — s472-boot-typer-holes: two fail-open holes in the
// bootstrap typer (analyze.scrml THE TYPER), found by the S472 backfill review
// (bf1, F1 / F2 / O2), each reproduced on main c8070b56a.
//
//   F1 g-boot-literal-init-non-primitive-annotation-unchecked-s472 — a LITERAL
//      initializer was judged by neither checkInit (its §7.5.1 table covers the
//      four primitive annotations) nor the non-literal limb, so a literal into a
//      `T | not`, an enum, a struct or a tape compiled: `let <admin:bool |
//      not="false"/>` then `if (@admin)` rendered ADMIN. Now ONE rule
//      (checkAnnotInit): every annotated initializer, literal or not, is checked
//      against its annotation (§7.5.1, §66.1 rule 5, E-TYPE-031 / E-TYPE-041).
//   F2 g-boot-mixed-arm-type-unresolved-fail-open-s472 — a value `match` /
//      ternary whose arms had KNOWN but different types collapsed to Unknown,
//      and Unknown passes every typed position. Now: a `match` is §18.4 rule 3's
//      E-TYPE-001 ("If arms produce types `A` and `B` with no subtype
//      relationship, this SHALL be a compile error (E-TYPE-001)"); a ternary is
//      a CHOICE (VType.OneOf — §17.6's union rule, "If arms lift different
//      types, the result type is their union") whose every member each typed
//      position checks.
//   O2 g-boot-markup-interp-non-primitive-unchecked-s472 — markup text `${e}` is
//      a text sink (§14.13.2): a known struct / tape / payload-enum value (or a
//      `T | not` of one, or a choice member) is E-TEXT-NON-PRIMITIVE.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code).sort();
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
let k = 0;
const shows = async (src, want) => {
  await loadProgram(clean(src).core, "s472th-" + k++, []);
  expect(document.querySelector("#o").textContent).toBe(want);
};
const prog = (decls, markup = `<p id="o">x</p>`) => `<program>\n${decls}\n    <main>${markup}</main>\n</program>\n`;
const C = `    type C:enum = { A, B }\n    let <c:C=.A/>`;
const P = `    type P:struct = { n: int }\n    let <pt:P=({ n: 1 })/>`;

// ---------------------------------------------------------------------------
describe("F1 — a literal initializer is checked against every annotation type (one rule)", () => {
  const BAD = [
    ["a cell `bool | not` given a string literal (the review's ADMIN repro)", `    let <admin:bool | not="false"/>`, "E-TYPE-031"],
    ["a cell `int | not` given a string literal", `    let <x:int | not="s"/>`, "E-TYPE-031"],
    ["a cell `int | not` given a parenthesized string literal", `    let <x:int | not=("s")/>`, "E-TYPE-031"],
    ["a cell `string | not` given a bool literal", `    let <x:string | not=true/>`, "E-TYPE-031"],
    ["a cell `int | not` given a non-integer literal", `    let <x:int | not=1.5/>`, "E-TYPE-031"],
    ["a cell of an enum given an int literal", `    type C:enum = { A, B }\n    let <x:C=5/>`, "E-TYPE-031"],
    ["a cell `C | not` given an int literal", `    type C:enum = { A, B }\n    let <x:C | not=5/>`, "E-TYPE-031"],
    ["a cell of a struct given an int literal", `    type P:struct = { n: int }\n    let <x:P=5/>`, "E-TYPE-031"],
    ["a declaration field `C | not` given an int literal", `    type C:enum = { A, B }\n    <box k:C | not=5>\n    </>\n    renders <p>x</p>`, "E-TYPE-031"],
    ["a struct literal's `int | not` field given a string literal", `    type P:struct = { n: int | not }\n    let <pt:P=({ n: "s" })/>`, "E-TYPE-031"],
    ["a local `int | not` given a string literal", `    fn f() -> int {\n        let y: int | not = "s";\n        return 1;\n    }`, "E-TYPE-031"],
    ["a local of an enum given a string literal", `    type C:enum = { A, B }\n    fn f() -> int {\n        const y: C = "A";\n        return 1;\n    }`, "E-TYPE-031"],
  ];
  for (const [name, decls, code] of BAD) {
    test(`${code} — ${name}`, () => { expect(codes(prog(decls))).toEqual([code]); });
  }
  test("E-TYPE-031 — a use-site attribute of an enum field given a quoted string", () => {
    expect(codes(prog(`    type K:enum = { Primary, Plain }\n    <btn kind:K=.Plain>\n    </>\n    renders <p>x</p>`, `<btn kind="Primary"/>`))).toEqual(["E-TYPE-031"]);
  });
  test("E-TYPE-041 — `not` into a non-optional annotation keeps its own code", () => {
    expect(codes(prog(`    let <x:int=not/>`))).toEqual(["E-TYPE-041"]);
  });
  test("the primitive table keeps its §7.5.1 message (`let <x:int=\"s\"/>`)", () => {
    const d = run(prog(`    let <x:int="s"/>`)).diags;
    expect(d.map((x) => x.code)).toEqual(["E-TYPE-031"]);
    expect(d[0].message).toContain("§7.5.1");
  });
  test("legal twins — each annotation given a literal that fits compiles and runs", async () => {
    await shows(prog(`    type C:enum = { A, B }\n    type P:struct = { n: int }\n    let <a:int | not=5/>\n    let <b:number | not=5/>\n    let <c:C | not=.A/>\n    let <d:int | not=not/>\n    let <pt:P=({ n: 1 })/>\n    let <s:string | not="hi"/>\n    fn g() -> string {\n        let y: int | not = 3;\n        const z: C = .B;\n        if (@a is given) { return \`a\${@a}\`; }\n        return "none";\n    }`,
      `<p id="o">\${g()}</p>`), "a5");
  });
  test("legal twin — the ADMIN shape with a bool literal renders the value it was given", async () => {
    await shows(prog(`    let <admin:bool | not=false/>\n    fn label() -> string {\n        if (@admin is given) {\n            if (@admin) { return "ADMIN"; }\n            return "user";\n        }\n        return "anon";\n    }`,
      `<p id="o">\${label()}</p>`), "user");
  });
});

// ---------------------------------------------------------------------------
describe("F2 — a match whose arms disagree is E-TYPE-001 (§18.4 rule 3)", () => {
  const M = `match @c { .A :> "five", .B :> 6, }`;
  const BAD = [
    ["into an `int` cell", `${C}\n    let <n:int=(${M})/>`],
    ["into an annotated local", `${C}\n    fn g() -> int {\n        const v: int = ${M};\n        return v;\n    }`],
    ["as an argument", `${C}\n    fn h(x: int) -> int { return x; }\n    fn g() -> int { return h(${M}); }`],
    ["as a return", `${C}\n    fn g() -> int { return ${M}; }`],
    ["into a `string` return (int arm first)", `${C}\n    fn g() -> string { return match @c { .A :> 5, .B :> "b", }; }`],
    ["a `{ lift … }` block arm", `    let <n:int=1/>\n    fn g() -> int { return match @n { 1 :> { lift "one"; }, else :> 0, }; }`],
    ["a literal-arm match", `    let <s:string="a"/>\n    fn g() -> int { return match @s { "a" :> "A", else :> 0, }; }`],
    ["in markup text, a struct arm beside a string arm", `${C}\n${P}`, `<p id="o">\${match @c { .A :> @pt, .B :> "b", }}</p>`],
    ["in markup text, two primitive arms of different types", C, `<p id="o">\${match @c { .A :> 1, .B :> "x", }}</p>`],
  ];
  for (const [name, decls, markup] of BAD) {
    test(`E-TYPE-001 — ${name}`, () => { expect(codes(prog(decls, markup))).toEqual(["E-TYPE-001"]); });
  }
  test("reported once, at the conflicting arm, naming both types", () => {
    const d = run(prog(`${C}\n    let <n:int=(match @c { .A :> "five", .B :> 6, })/>`)).diags;
    expect(d.length).toBe(1);
    expect(d[0].message).toContain("`int`");
    expect(d[0].message).toContain("`string`");
    expect(d[0].message).toContain("§18.4");
  });
  test("legal — arms that unify: `int` with `not` (→ `int | not`), `int` with `number` (→ `number`)", async () => {
    await shows(prog(`${C}\n    fn g() -> int | not { return match @c { .A :> 1, .B :> not, }; }\n    fn h() -> number { return match @c { .A :> 1, .B :> 2.5, }; }`, `<p id="o">\${h()}</p>`), "1");
  });
  test("control — uniform wrong-typed arms stay E-TYPE-031 at the position", () => {
    expect(codes(prog(`${C}\n    fn g() -> string { return match @c { .A :> 1, .B :> 2, }; }`))).toEqual(["E-TYPE-031"]);
  });
});

describe("F2 — a ternary whose arms disagree is a choice; every typed position checks each arm", () => {
  const T = `@b ? "five" : 6`;
  const B = `    let <b:bool=true/>`;
  const BAD = [
    ["a `bool` cell given `@b ? \"false\" : false` (the review's ADMIN repro)", `${B}\n    let <admin:bool=(@b ? "false" : false)/>`, [], "E-TYPE-031"],
    ["into an annotated local", `${B}\n    fn g() -> int {\n        const v: int = ${T};\n        return v;\n    }`, [], "E-TYPE-031"],
    ["as a return", `${B}\n    fn g() -> int { return ${T}; }`, [], "E-TYPE-031"],
    ["through an UNANNOTATED local into an argument", `${B}\n    fn h(x: int) -> int { return x; }\n    fn g() -> int {\n        const v = ${T};\n        return h(v);\n    }`, [], "E-TYPE-031"],
    ["as an operand of `+` (a number and a string)", `${B}\n    fn k() -> string {\n        const v = ${T};\n        const w = v + 1;\n        return "x";\n    }`, [], "E-OPERATOR-OPERAND-TYPE"],
    ["a struct arm in a template slot", `${B}\n${P}\n    fn g() -> string { return \`v \${@b ? @pt : "x"}\`; }`, [], "E-TEXT-NON-PRIMITIVE"],
    ["a struct arm in markup text", `${B}\n${P}`, [`<p id="o">\${@b ? @pt : "x"}</p>`], "E-TEXT-NON-PRIMITIVE"],
    ["an element of a mixed array literal into `int[]`", `    fn g() -> int {\n        const xs: int[] = [1, "a"];\n        return 1;\n    }`, [], "E-TYPE-031"],
  ];
  for (const [name, decls, markup, code] of BAD) {
    test(`${code} — ${name}`, () => { expect(codes(prog(decls, ...markup))).toEqual([code]); });
  }
  test("the message names the member that does not fit and the choice", () => {
    const d = run(prog(`${B}\n    let <admin:bool=(@b ? "false" : false)/>`)).diags;
    expect(d[0].message).toContain("may be `string`");
    expect(d[0].message).toContain("`string` or `bool`");
  });
  test("a choice as a condition stays refused (E-COND-NOT-BOOLEAN, as an unresolved one was)", () => {
    expect(codes(prog(`${B}\n    fn g() -> string { const v = @b ? "s" : true; if (v) { return "y"; } return "n"; }`))).toEqual(["E-COND-NOT-BOOLEAN"]);
  });
  test("legal — a choice of primitives in markup text renders the branch taken", async () => {
    await shows(prog(`    let <b:bool=false/>`, `<p id="o">\${@b ? 1 : "x"}</p>`), "x");
  });
  test("legal — a choice whose every member fits the position", async () => {
    await shows(prog(`${B}\n    fn g() -> number { return @b ? 1 : 2.5; }`, `<p id="o">\${g()}</p>`), "1");
  });
  test("flow-insensitive local joins stay unprovable (`let a = \"s\"; a = 1` is not a choice)", () => {
    expect(codes(prog(`    let <x:int=0/>\n    function f() { let a = "s"; a = 1; @x = a; }`))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("O2 — markup text is a text sink (§14.13.2): a known non-primitive is E-TEXT-NON-PRIMITIVE", () => {
  const BAD = [
    ["a struct", P, `<p id="o">\${@pt}</p>`],
    ["a tape", `    <xs:int[]=([1, 2])/>`, `<p id="o">\${@xs}</p>`],
    ["a `P | not`", `    type P:struct = { n: int }\n    let <pt:P | not=not/>`, `<p id="o">\${@pt}</p>`],
    ["a payload enum value", `    type S:enum = { On(n: int), Off }\n    let <s:S=(S.On(1))/>`, `<p id="o">\${@s}</p>`],
  ];
  for (const [name, decls, markup] of BAD) {
    test(`E-TEXT-NON-PRIMITIVE — ${name}`, () => { expect(codes(prog(decls, markup))).toEqual(["E-TEXT-NON-PRIMITIVE"]); });
  }
  test("legal — a field read, a `T | not` of a primitive (renders nothing when `not`), a unit enum", async () => {
    await shows(prog(`${P}\n    let <m:int | not=not/>\n${C}`, `<p id="o">\${@pt.n}|\${@m}|\${@c}</p>`), "1||A");
  });
});

// ---------------------------------------------------------------------------
// s473 r1 HIGH-1 (review of #1621): a lifted value is markup text ONLY when the
// lift's sink is markup (a `${ for … { lift e; } }` gather, §17.4). A lift into
// a BOUND value loop is a tape element (§49.6 rule 2: "Its element type is the
// type of the lifted values"), and a `{ lift … }` match arm is the arm's value —
// neither is a §14.13.1 text sink, so neither is E-TEXT-NON-PRIMITIVE.
describe("r1 HIGH-1 — the text-sink check follows the lift's sink", () => {
  const XS = `    <xs:int[]=([1, 2])/>`;
  const B = `    let <b:bool=true/>`;
  test("FR1 — a value loop lifting a struct into `P[]` compiles and runs", async () => {
    await shows(prog(`${P}\n${XS}\n    fn g() -> int {\n        const ps: P[] = for (x of @xs) { lift @pt; };\n        return ps.length;\n    }`, `<p id="o">\${g()}</p>`), "2");
  });
  test("FR3 — a value loop lifting a tape compiles and runs", async () => {
    await shows(prog(`${XS}\n    fn g() -> int {\n        const ps = for (x of @xs) { lift @xs; };\n        return ps.length;\n    }`, `<p id="o">\${g()}</p>`), "2");
  });
  test("a value loop lifting a choice with a struct member compiles", () => {
    expect(codes(prog(`${B}\n${P}\n${XS}\n    fn g() -> int {\n        const ps = for (x of @xs) { lift @b ? @pt : "s"; };\n        return 1;\n    }`, `<p id="o">\${g()}</p>`))).toEqual([]);
  });
  test("a `{ lift … }` match arm lifting a struct is the arm's value, not text", () => {
    expect(codes(prog(`${C}\n${P}\n    fn h(q: P) -> int { return q.n; }\n    fn g() -> int { return h(match @c { .A :> { lift @pt; }, .B :> @pt, }); }`, `<p id="o">\${g()}</p>`))).toEqual([]);
  });
  test("L1 control — a MARKUP gather lifting a struct stays E-TEXT-NON-PRIMITIVE", () => {
    expect(codes(prog(`${P}\n${XS}`, `<p id="o">\${ for (x of @xs) { lift @pt; } }</p>`))).toEqual(["E-TEXT-NON-PRIMITIVE"]);
  });
  test("control — a markup gather lifting a struct inside an `if` is refused too", () => {
    expect(codes(prog(`${B}\n${P}\n${XS}`, `<p id="o">\${ for (x of @xs) { if (@b) { lift @pt; } } }</p>`))).toEqual(["E-TEXT-NON-PRIMITIVE"]);
  });
  test("control — a value loop nested in a markup gather keeps its struct lifts; the gather's own lift is judged", () => {
    expect(codes(prog(`${P}\n${XS}`, `<p id="o">\${ for (x of @xs) { const ps = for (y of @xs) { lift @pt; }; lift ps.length; } }</p>`))).toEqual([]);
  });
  test("legal — a markup gather lifting primitives renders them", async () => {
    await shows(prog(XS, `<p id="o">\${ for (x of @xs) { lift x; } }</p>`), "12");
  });
});

// ---------------------------------------------------------------------------
// s473 r1 LOW-1 (review of #1621): §18.4 rule 3 also judges an arm that is itself
// a choice (a ternary, §17.6 union): `int | string` beside `bool` has no subtype
// relationship (E-TYPE-001); beside `int` the choice holds it (unifies).
describe("r1 LOW-1 — §18.4 rule 3 with a choice arm", () => {
  const CB = `${C}\n    let <b:bool=true/>`;
  test("M1 — a choice arm (`int | string`) beside a `bool` arm is E-TYPE-001", () => {
    expect(codes(prog(CB, `<p id="o">\${match @c { .A :> (@b ? 1 : "s"), .B :> true, }}</p>`))).toEqual(["E-TYPE-001"]);
  });
  test("two choice arms with no subtype relationship are E-TYPE-001", () => {
    expect(codes(prog(CB, `<p id="o">\${match @c { .A :> (@b ? 1 : "s"), .B :> (@b ? true : 2), }}</p>`))).toEqual(["E-TYPE-001"]);
  });
  test("legal — a choice arm beside an arm whose type it holds renders the arm taken", async () => {
    await shows(prog(CB, `<p id="o">\${match @c { .A :> (@b ? 1 : "s"), .B :> 2, }}</p>`), "1");
  });
  test("the message names both arms (by pattern) and both types, a choice by every member", () => {
    const d = run(prog(CB, `<p id="o">\${match @c { .A :> (@b ? 1 : "s"), .B :> true, }}</p>`)).diags;
    expect(d.length).toBe(1);
    expect(d[0].message).toContain("this arm (`.B`) produces `bool`");
    expect(d[0].message).toContain("does not unify with the arm(s) `.A` (`int` or `string`)");
    expect(d[0].message).toContain("§18.4 rule 3");
  });
});

// ---------------------------------------------------------------------------
// s473 r2 LOW-A (re-review of #1621): §18.4 rule 3 is judged PAIRWISE — each arm
// against every earlier arm, never against their running join — so the verdict
// does not depend on arm order. {`int`, `string`, `int | string`}: `int` and
// `string` have no subtype relationship, so E-TYPE-001 in every order.
describe("r2 LOW-A — §18.4 rule 3 is order-invariant", () => {
  const C3 = `    type C:enum = { A, B, D }\n    let <c:C=.A/>\n    let <b:bool=true/>`;
  const ORDERS = [
    ["O1 (1, \"s\", choice)", `1`, `"s"`, `(@b ? 1 : "s")`],
    ["O2 (choice, \"s\", 1)", `(@b ? 1 : "s")`, `"s"`, `1`],
    ["O3 (1, choice, \"s\")", `1`, `(@b ? 1 : "s")`, `"s"`],
    ["O4 (\"s\", choice, 1)", `"s"`, `(@b ? 1 : "s")`, `1`],
  ];
  test("the same verdict, E-TYPE-001, in all four orders", () => {
    const verdicts = ORDERS.map(([, x, y, z]) => codes(prog(C3, `<p id="o">\${match @c { .A :> ${x}, .B :> ${y}, .D :> ${z}, }}</p>`)));
    for (const v of verdicts) expect(v).toEqual(["E-TYPE-001"]);
  });
  test("the message names the earlier arm it conflicts with (O2: `1` against `.B`'s `string`)", () => {
    const d = run(prog(C3, `<p id="o">\${match @c { .A :> (@b ? 1 : "s"), .B :> "s", .D :> 1, }}</p>`)).diags;
    expect(d.length).toBe(1);
    expect(d[0].message).toContain("this arm (`.D`) produces `int`");
    expect(d[0].message).toContain("`.B` (`string`)");
    expect(d[0].message).not.toContain("`.A` (");
  });
  test("legal — arms that pairwise unify stay clean in every order (`int`, `int | string`, `string | int`)", () => {
    const xs = [`1`, `(@b ? 1 : "s")`, `(@b ? "t" : 2)`];
    for (const [x, y, z] of [[0, 1, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
      expect(codes(prog(C3, `<p id="o">\${match @c { .A :> ${xs[x]}, .B :> ${xs[y]}, .D :> ${xs[z]}, }}</p>`))).toEqual([]);
    }
  });
});
