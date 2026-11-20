// nullish-coalesce-s480.test.js — s480-boot-cheap-wins item 1: `a ?? b` (g-boot-nullish-coalesce-unparsed-s480).
//
// SPEC: §7 lists `??` among "a binary (infix) operator" (the §7.2.2 expression-end list). §34
// E-EXPR-NULLISH-MIX: "`??` cannot be combined with `&&` or `||` without parentheses (a JS grammar
// restriction scrml inherits)." §42.8: "`not` … Its runtime representation in compiled JavaScript is
// `null`" and an absence test matches "both JavaScript `null` and `undefined`" — what JavaScript's
// `??` tests. RULED S440 Gotcha Q2: "`!`, `&&`, `||` … take booleans only; defaults use `??`";
// Gotcha Q3: "a `T | not` operand must be narrowed before `+`, arithmetic, comparison, or use in a
// template" — `??` is the default that narrows: the value is the left operand where it is present.
//
// Before (red on base): `??` did not parse anywhere — parse.scrml binPrec had no `??` row, so every
// use was E-PARSE-EXPECTED / E-PARSE-TRAILING / E-STMT-MISSING-SEMICOLON.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const fe = (src) => frontEnd(mods, [{ path: "app.scrml", src }], "app.scrml");
const errs = (r) => r.diags.filter((d) => d.severity === "Error");
const codes = (src) => errs(fe(src)).map((d) => d.code);
// the rules: a program whose `go` is a no-op beside the function under test
const rule = (fn) => prog(fn + "\nfunction go() { }");
const $ = (sel) => document.querySelector(sel);
let k = 0;

const prog = (fns, markup = "") => `<program>
let <n:int | not=(not)/>
let <name:string | not=(not)/>
let <ok:bool | not=(not)/>
let <flag:bool=false/>
let <out=""/>
let <ri:int=0/>
${fns}
<button id="b" onclick=go()>go</button>
<p id="o">\${@out}</p>
<p id="i">\${@ri}</p>
${markup}
</program>
`;

async function run(src) {
  const r = fe(src);
  expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  await loadProgram(r.core, "s480-nullish-" + k++);
  return r;
}

describe("`a ?? b` — the left operand where present, else the right (run)", () => {
  test("markup: `${@n ?? \"none\"}` reads the fallback, then the value once present", async () => {
    await run(prog(`function go() { @n = 5; }`, `<p id="m">\${@n ?? "none"}</p><p id="s">\${(@n ?? 0) + 2}</p>`));
    expect($("#m").textContent).toBe("none");
    expect($("#s").textContent).toBe("2");
    click($("#b"));
    expect($("#m").textContent).toBe("5");
    expect($("#s").textContent).toBe("7");
  });

  test("logic: a `T | not` narrowed by `??` is a `T` (return, arithmetic, a chain)", async () => {
    await run(prog(`function total() -> int { return (@n ?? 0) + 1; }
function label() -> string { return @name ?? @name ?? "anon"; }
function go() { @out = label(); @ri = total(); @name = "zed"; @n = 41; @out = @out + "|" + label(); @ri = @ri * 100 + total(); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("anon|zed");
    expect($("#i").textContent).toBe("142");
  });

  test("the right operand runs only where the left is absent", async () => {
    await run(prog(`function side() -> int { @out = @out + "x"; return 9; }
function go() { const a: int = @n ?? side(); @n = 3; const b: int = @n ?? side(); @ri = a * 10 + b; }`));
    click($("#b"));
    expect($("#o").textContent).toBe("x");
    expect($("#i").textContent).toBe("93");
  });

  test("a parenthesized mix with `||` / `&&` is legal and prints as valid JavaScript", async () => {
    await run(prog(`function go() {
    const a: bool = (@ok ?? false) || @flag;
    const b: bool = @ok ?? (true && !@flag);
    if (!a && b) { @out = "ok"; }
}`));
    click($("#b"));
    expect($("#o").textContent).toBe("ok");
  });
});

describe("`??` — the rules (§34 E-EXPR-NULLISH-MIX; S440 typing)", () => {
  test("an unparenthesized mix with `||` or `&&` is E-EXPR-NULLISH-MIX, once, with no cascade", () => {
    expect(codes(prog(`function go() { const a: bool = @ok ?? false || @flag; }`))).toEqual(["E-EXPR-NULLISH-MIX"]);
    expect(codes(prog(`function go() { const a: bool = @flag && @ok ?? true; }`))).toEqual(["E-EXPR-NULLISH-MIX"]);
    expect(codes(prog(`function go() { const a: bool = @flag || @ok ?? true; }`))).toEqual(["E-EXPR-NULLISH-MIX"]);
    expect(codes(prog(`function go() { const a: bool = @ok ?? @flag && true; }`))).toEqual(["E-EXPR-NULLISH-MIX"]);
  });

  test("the result is the left's present type joined with the right's — checked where it lands", () => {
    expect(codes(rule(`function f() -> string { return @n ?? 0; }`))).toEqual(["E-TYPE-031"]);
    expect(codes(rule(`function f() -> int { return @n ?? "x"; }`))).toEqual(["E-TYPE-031"]);
    expect(codes(rule(`function f() -> int { return @n ?? 0; }`))).toEqual([]);
  });

  test("precedence: `??` is below comparison and arithmetic, above the conditional", () => {
    // `@n ?? 0 + 1` is `@n ?? (0 + 1)`; `@n ?? 0 > 1` is `@n ?? (0 > 1)` — an int-or-bool, not an int
    expect(codes(rule(`function f() -> int { return @n ?? 0 + 1; }`))).toEqual([]);
    expect(codes(rule(`function f() -> int { return @n ?? 0 > 1; }`))).toEqual(["E-TYPE-031"]);
    expect(codes(rule(`function f() -> string { return @ok ?? false ? "y" : "n"; }`))).toEqual([]);
  });
});
