// typer-rulings-s480.test.js — s480-typer: three S479 rulings (user-voice-scrml.md "⭐ RULED — the rest
// of S478 hand-off §3.B", items 11, 13 and 25).
//
// Item 13 (BUILT here; red on base): "admit `.join(sep)` on primitive and unit-enum elements via the
// §20.7.2 template text; refuse struct/tape/payload-enum elements (alternative `xs.map(fmt).join(sep)`)".
// Before: `.join(sep)` on any tape but `string[]` was E-TYPE-031 ("there is no ruled conversion").
//
// Item 11 (#1917 loop narrowing): the SPEC now states the shipped reading (§42.3.5: a write to the
// narrowed place anywhere in a loop's head or body ends the narrowing for the whole loop and after it)
// and §42.4 statement 2 names a presence-test `for` head's body as narrowed. The bootstrap already
// built both (s469 typeLoopCond / typeCounted, s478 tLoopEnv): these tests PIN them (green on base).
// The INTERIM — a call of a nested function ends every narrowing — is pinned against its gap,
// g-boot-nested-fn-call-ends-every-narrowing-s480.
//
// Item 25 (g-bare-arrow-binding-false-e-mu-001): "option (a) — legal const per S422 Calls 1/3; unused =
// lint". The bootstrap already reads a keywordless binding as `const` (§50.8.5) and, since #1961, an
// unread one is not an error: these tests PIN it for an arrow value (green on base).

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

const HEAD = `type User:struct = { name: string }
type Node:struct = { v: string, next: Node | not }
type C:enum = { Red, Green }
type P:enum = { A(n: int), B }
let <user:User | not=({ name: "ann" })/>
let <s:string | not=("")/>
let <out=""/>`;

const prog = (fns) => `<program>
${HEAD}
${fns}
<button id="b" onclick=go()>go</button>
<p id="o">\${@out}</p>
<p id="u">\${@user is given ? "u" : "-"}\${@s is given ? "s" : "-"}</p>
</program>
`;

async function run(src) {
  const r = fe(src);
  expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  await loadProgram(r.core, "s480-typer-" + k++);
  return r;
}

const go = (body) => prog(`function go() { ${body} }`);

describe("item 13 — `.join(sep)` on a primitive / unit-enum tape joins each element's honest text (§20.7.2)", () => {
  test("an `int[]`: decimal digits, a leading `-`", async () => {
    await run(go(`const xs: int[] = [3, -12, 0]; @out = xs.join(",");`));
    click($("#b"));
    expect($("#o").textContent).toBe("3,-12,0");
  });

  test("a `number[]`: Number::toString (`0.1 + 0.2`, `1e21`, `-0`)", async () => {
    await run(go(`const z: number = 0.0; const xs: number[] = [0.1 + 0.2, 1e21, 0.0 - z, 2.5]; @out = xs.join(" ");`));
    click($("#b"));
    expect($("#o").textContent).toBe("0.30000000000000004 1e+21 0 2.5");
  });

  test("a `bool[]`: true / false", async () => {
    await run(go(`const xs: bool[] = [true, false]; @out = xs.join("|");`));
    click($("#b"));
    expect($("#o").textContent).toBe("true|false");
  });

  test("a unit-enum tape: each variant's declared name", async () => {
    await run(go(`const xs: C[] = [C.Green, C.Red]; @out = xs.join("+");`));
    click($("#b"));
    expect($("#o").textContent).toBe("Green+Red");
  });

  test("a `string[]` is unchanged, and an empty tape joins to the empty string", async () => {
    await run(go(`const xs: string[] = ["a", "b"]; const ys: int[] = []; @out = xs.join("") + "[" + ys.join(",") + "]";`));
    click($("#b"));
    expect($("#o").textContent).toBe("ab[]");
  });

  test("in markup, on a cell (`${@ns.join(\", \")}`)", async () => {
    const src = `<program>
<ns:int[]=([1, 2, 3])/>
<p id="m">\${@ns.join(", ")}</p>
</program>
`;
    await run(src);
    expect($("#m").textContent).toBe("1, 2, 3");
  });

  test("the separator is still a `string`", () => {
    expect(codes(go(`const xs: int[] = [1]; @out = xs.join(1);`))).toContain("E-TYPE-031");
  });

  for (const [what, decl] of [
    ["a struct", `const xs: User[] = [{ name: "a" }];`],
    ["a payload enum", `const xs: P[] = [P.B];`],
    ["a tape", `const xs: int[][] = [[1]];`],
  ]) {
    test(`refused on ${what} element — E-TYPE-031 naming \`xs.map(fmt).join(sep)\``, () => {
      const e = errs(fe(go(`${decl} @out = xs.join(",");`)));
      expect(e.map((d) => d.code)).toEqual(["E-TYPE-031"]);
      expect(e[0].message).toContain("xs.map(fmt).join(sep)");
      expect(e[0].message).toContain("§20.7.2");
    });
  }

  test("the capable form for a struct tape: map to text, then join", async () => {
    await run(go(`const xs: User[] = [{ name: "a" }, { name: "b" }]; @out = xs.map(u => u.name).join(";");`));
    click($("#b"));
    expect($("#o").textContent).toBe("a;b");
  });
});

describe("item 11 — a presence-test `for` head narrows its body (§42.4 statement 2; pinned)", () => {
  test("`for (@user)` — the body reads a member; a write later in the body ends it for that iteration", async () => {
    await run(go(`for (@user) { @out = @out + @user.name; @user = not; }`));
    click($("#b"));
    expect($("#o").textContent).toBe("ann");
    expect($("#u").textContent).toBe("-s");
  });

  test("the test is presence, not truthiness: `\"\"` is present (`for (@s)` runs once)", async () => {
    await run(go(`for (@s) { @out = "[" + @s + "]"; @s = not; }`));
    click($("#b"));
    expect($("#o").textContent).toBe("[]");
  });

  test("a local walk: `for (n) { …n.v…; n = n.next; }` — re-tested before each iteration", async () => {
    await run(go(`let n: Node | not = { v: "a", next: { v: "b", next: not } }; for (n) { @out = @out + n.v; n = n.next; }`));
    click($("#b"));
    expect($("#o").textContent).toBe("ab");
  });

  test("a counted head's condition narrows its body too", async () => {
    await run(go(`for (let i = 0; @user; i = i + 1) { @out = @user.name; @user = not; }`));
    click($("#b"));
    expect($("#o").textContent).toBe("ann");
  });

  test("a write BEFORE the read in the body ends it (E-TYPE-046)", () => {
    expect(codes(go(`for (@user) { @user = not; @out = @user.name; }`))).toEqual(["E-TYPE-046"]);
  });

  test("a local written before the read ends it (E-TYPE-046)", () => {
    expect(codes(go(`let n: Node | not = { v: "a", next: not }; for (n) { n = n.next; @out = n.v; }`))).toEqual(["E-TYPE-046"]);
  });

  test("after the loop the place is not narrowed (the head's false side; a `break` leaves from anywhere)", () => {
    expect(codes(go(`for (@user) { @out = @user.name; break; } @out = @user.name;`))).toEqual(["E-TYPE-046"]);
  });

  test("a `bool | not` head is still E-COND-NOT-BOOLEAN, not a presence test (§42.4 statement 3)", () => {
    const src = prog(`let <b:bool | not=(true)/>\nfunction go() { for (@b) { @out = "x"; break; } }`);
    expect(codes(src)).toEqual(["E-COND-NOT-BOOLEAN"]);
  });
});

describe("item 11 — a write anywhere in a loop ends an outer narrowing for the whole loop and after it (§42.3.5; pinned)", () => {
  test("a write later in the body ends it at the top of the body (the back-edge)", () => {
    expect(codes(go(`if (@user is given) { for (let i = 0; i < 2; i = i + 1) { @out = @user.name; @user = not; } }`))).toEqual(["E-TYPE-046"]);
  });

  test("a write in an inner loop ends a presence head's narrowing inside that inner loop", () => {
    expect(codes(go(`for (@user) { for (let i = 0; i < 2; i = i + 1) { @out = @user.name; @user = not; } }`))).toEqual(["E-TYPE-046"]);
  });

  test("a loop that never writes the place keeps it, in the body and after — a counted head too (s480: was dropped in its body)", async () => {
    await run(go(`if (@user is given) { for (let i = 0; i < 2; i = i + 1) { @out = @out + @user.name; } @out = @out + "!" + @user.name; }`));
    click($("#b"));
    expect($("#o").textContent).toBe("annann!ann");
  });

  test("INTERIM (g-boot-nested-fn-call-ends-every-narrowing-s480): a call of a nested function ends every narrowing, even one it does not write", () => {
    expect(codes(go(`function f() -> string { return "!"; } if (@user is given) { const x: string = f(); @out = @user.name + x; }`))).toEqual(["E-TYPE-046"]);
    expect(codes(go(`function f() -> int { return 1; } if (@user is given) { for (let i = 0; i < 1; i = i + 1) { @out = @user.name; const x: int = f(); } }`))).toEqual(["E-TYPE-046"]);
  });
});

describe("item 25 — a keywordless arrow binding is a legal `const` (S422 Calls 1/3; pinned)", () => {
  test("`fmt = (n: string) => …` then called: compiles and runs", async () => {
    await run(go(`fmt = (n: string) => "$" + n; @out = fmt("5");`));
    click($("#b"));
    expect($("#o").textContent).toBe("$5");
  });

  test("an unread keywordless arrow binding is no error (unused = lint, not E-MU-001)", () => {
    const d = fe(go(`fmt = (n: string) => "$" + n; @out = "x";`)).diags;
    expect(d.filter((x) => x.code === "E-MU-001")).toEqual([]);
    expect(errs({ diags: d })).toEqual([]);
  });

  test("it is a `const`: rebinding it is E-ASSIGN-CONST, as for `const fmt = …`", () => {
    expect(codes(go(`fmt = (n: string) => n; fmt = (n: string) => "$" + n; @out = fmt("1");`))).toEqual(["E-ASSIGN-CONST"]);
    expect(codes(go(`const fmt = (n: string) => n; fmt = (n: string) => "$" + n; @out = fmt("1");`))).toEqual(["E-ASSIGN-CONST"]);
  });
});
