// fn-types-ruled-s478.test.js — s478-ruled-fn-types: the S478 owner rulings on function types
// (user-voice-scrml.md "⭐ RULED — open owner questions, PA recs adopted wholesale (S478)", items
// 3–8; gap g-boot-fn-values-residue-s478 owner questions 1–6).
//
// Item 3 — §19.4.3 "The failable function type (S478)": "The type of a failable function value is
//   spelled as the declaration is: `(x: T)! E => R` … A call through a value of a failable function
//   type is a call to a `!` function under this section … an unhandled one is E-ERROR-002."
// Item 4 — §48.6.3 "The pure function type (S478)": "Inside a `fn` body, a call through a function
//   value SHALL have a callee of a pure function type … E-FN-003"; "A `fn` SHALL return only a value
//   of a pure function type … E-FN-003".
// Item 5 — §7.5 "Function types (S478)": "`(x: T) -> R` and the `fn(…)` spelling with no `=>` …
//   SHALL be a parse error, E-PARSE-TYPE, whose message names the fix".
// Item 6 — §7.5.1 "Function types — invariance (S478)" (stated; already the bootstrap's rule).
// Item 7 — §7.3.4 "A call through a function value (S478)" (stated; already the bootstrap's rule).
// Item 8 — §12.5.3 "A function-typed result is E-ROUTE-003 (S478)" (⚑ PA reading: the ruling said
//   "widen E-ROUTE-004"; E-ROUTE-003 already names the shape — see the SPEC note).
// Every clean program is Core-checked, printed and RUN (happy-dom).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const fe = (src) => frontEnd(mods, [{ path: "app.scrml", src }], "app.scrml");
const errs = (r) => r.diags.filter((d) => d.severity === "Error");
const codes = (src) => errs(fe(src)).map((d) => d.code);
const msgs = (src) => errs(fe(src)).map((d) => `${d.code}: ${d.message}`);
const $ = (sel) => document.querySelector(sel);
let k = 0;

async function run(src) {
  const r = fe(src);
  expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  await loadProgram(r.core, "s478-rft-" + k++);
  return r;
}

const P = (fns) => `<program>
    let <out:int=0/>
${fns}
    <button id="b" onclick=go()>b</button>
    <p id="o">\${@out}</p>
</program>
`;

const E = `    type E:enum = { Bad }`;
const RISKY = `    function risky(x: int)! E { if (x < 0) { fail E.Bad; } return x * 2; }`;

describe("item 3 — the failable function type `(x: T)! E => R` (§19.4.3)", () => {
  test("a `!` function bound by a failable-typed local; a call through it handled by `!{}` (success and failure)", async () => {
    await run(P(`${E}\n${RISKY}\n    function go() { const g: (x: int)! E => int = risky; const a: int = g(3) !{ .Bad :> 0 }; const b: int = g(-1) !{ .Bad :> 100 }; @out = a + b; }`));
    click($("#b"));
    expect($("#o").textContent).toBe("106");
  });

  test("passed to a failable-typed parameter and called through there", async () => {
    await run(P(`${E}\n${RISKY}\n    function applyF(f: (x: int)! E => int, n: int) -> int { return f(n) !{ .Bad :> -1 }; }\n    function go() { @out = applyF(risky, 3) * 10 + applyF(risky, -5); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("59");
  });

  test("a `match` on a call through the value (an unannotated local takes the failable type)", async () => {
    await run(P(`${E}\n${RISKY}\n    function go() { const g = risky; @out = match g(-3) { .Ok(v) :> v, .Bad :> 7 }; }`));
    click($("#b"));
    expect($("#o").textContent).toBe("7");
  });

  test("`?` through the value inside a `!` function of the same error enum", async () => {
    await run(P(`${E}\n${RISKY}\n    function mid(f: (x: int)! E => int, n: int)! E { return f(n)?; }\n    function go() { const a: int = mid(risky, 4) !{ .Bad :> 0 }; const b: int = mid(risky, -4) !{ .Bad :> 1000 }; @out = a + b; }`));
    click($("#b"));
    expect($("#o").textContent).toBe("1008");
  });

  test("a bare `!` is the built-in `Error` enum: `(x: int)! => int`", async () => {
    await run(P(`    function risky(x: int)! { if (x < 0) { fail Error.Generic("neg"); } return x * 2; }\n    function go() { const g: (x: int)! => int = risky; @out = g(2) !{ _ :> 0 }; }`));
    click($("#b"));
    expect($("#o").textContent).toBe("4");
  });

  test("a void failable value handled as a statement", async () => {
    await run(P(`${E}\n    function put(x: int)! E { if (x < 0) { fail E.Bad; } @out = x; }\n    function go() { const g = put; g(-3) !{ .Bad :> @out = 9 }; }`));
    click($("#b"));
    expect($("#o").textContent).toBe("9");
  });

  test("an unhandled call through a failable value is E-ERROR-002", () => {
    expect(codes(P(`${E}\n${RISKY}\n    function go() { const g = risky; @out = g(3); }`))).toEqual(["E-ERROR-002"]);
  });

  test("a failable value where a non-failable function type is declared is E-TYPE-031 (§7.5.1 invariance)", () => {
    const m = msgs(P(`${E}\n${RISKY}\n    function apply(f: (x: int) => int, n: int) -> int { return f(n); }\n    function go() { @out = apply(risky, 3); }`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("E-TYPE-031");
    expect(m[0]).toContain("(int)! E => int");
  });

  test("another error enum does not fit (failability is invariant)", () => {
    expect(codes(P(`${E}\n    type F:enum = { Worse }\n${RISKY}\n    function go() { const g: (x: int)! F => int = risky; @out = 1; }`))).toEqual(["E-TYPE-031"]);
  });

  test("an arrow (it cannot fail) where a failable function type is declared is E-TYPE-031", () => {
    expect(codes(P(`${E}\n    function go() { const g: (x: int)! E => int = (x) => x + 1; @out = 1; }`))).toEqual(["E-TYPE-031"]);
  });

  test("a non-enum error type in a failable function type is E-ERROR-011", () => {
    expect(codes(P(`    function one(x: int) -> int { return x; }\n    function go() { const g: (x: int)! int => int = one; @out = 1; }`))).toContain("E-ERROR-011");
  });

  test("reading the success value of a void failable value is E-TYPE-001", () => {
    expect(codes(P(`${E}\n    function put(x: int)! E { if (x < 0) { fail E.Bad; } @out = x; }\n    function go() { const g = put; @out = g(3) !{ .Bad :> 9 }; }`))).toEqual(["E-TYPE-001"]);
  });
});

describe("item 4 — the pure function type `fn (x: T) => R` (§48.6.3)", () => {
  test("a `fn` passed to a pure-typed parameter and called through it inside a `fn` body", async () => {
    await run(P(`    fn twice(x: int) -> int { return x * 2; }\n    fn applyP(f: fn (x: int) => int, n: int) -> int { return f(n); }\n    function go() { @out = applyP(twice, 3); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("6");
  });

  test("a pure local inside a `fn` body", async () => {
    await run(P(`    fn twice(x: int) -> int { return x * 2; }\n    fn use3() -> int { const g: fn (x: int) => int = twice; return g(3); }\n    function go() { @out = use3(); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("6");
  });

  test("a `fn` returning a pure function value", async () => {
    await run(P(`    fn one() -> int { return 41; }\n    fn getW() -> fn () => int { return one; }\n    function go() { const g = getW(); @out = g() + 1; }`));
    click($("#b"));
    expect($("#o").textContent).toBe("42");
  });

  test("a pure value fits the impure type of its signature (the one widening, §7.5.1)", async () => {
    await run(P(`    fn twice(x: int) -> int { return x * 2; }\n    function apply(f: (x: int) => int, n: int) -> int { return f(n); }\n    function go() { @out = apply(twice, 5); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("10");
  });

  test("a pure failable value handled inside a `fn` body", async () => {
    await run(P(`${E}\n    fn risky(x: int)! E { if (x < 0) { fail E.Bad; } return x * 2; }\n    fn applyF(f: fn (x: int)! E => int, n: int) -> int { return f(n) !{ .Bad :> 0 }; }\n    function go() { @out = applyF(risky, 3) + applyF(risky, -3); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("6");
  });

  test("a call through an IMPURE value inside a `fn` body is E-FN-003", () => {
    const m = msgs(P(`    fn applyP(f: (x: int) => int, n: int) -> int { return f(n); }\n    function go() { @out = 1; }`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("E-FN-003");
    expect(m[0]).toContain("§48.6.3");
  });

  test("an impure value where the pure type is declared is E-TYPE-031", () => {
    expect(codes(P(`    function twice(x: int) -> int { return x * 2; }\n    fn applyP(f: fn (x: int) => int, n: int) -> int { return f(n); }\n    function go() { @out = applyP(twice, 3); }`))).toEqual(["E-TYPE-031"]);
  });

  test("a `fn` whose return type is an impure function type is E-FN-003 (#1929 review L3)", () => {
    expect(codes(P(`    function setOut() { @out = 5; }\n    fn getW() -> () => void { return setOut; }\n    function go() { @out = 1; }`))).toEqual(["E-FN-003"]);
  });

  test("a pure function type whose result is impure is E-FN-003", () => {
    expect(codes(P(`    fn one() -> int { return 1; }\n    function go() { const f: fn () => () => void = go; @out = 1; }`))).toContain("E-FN-003");
  });

  test("an arrow as a pure function value is refused by name (INTERIM)", () => {
    const m = msgs(P(`    fn applyP(f: fn (x: int) => int, n: int) -> int { return f(n); }\n    function go() { @out = applyP((x) => x + 1, 3); }`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(m[0]).toContain("PURE function type");
  });
});

describe("item 5 — `=>` is the one spelling (§7.5)", () => {
  test("`(x: T) -> R` in a type is E-PARSE-TYPE naming the `=>` fix, with no cascade", () => {
    const m = msgs(P(`    function apply(f: (x: int) -> int, n: int) -> int { return f(n); }\n    function go() { @out = apply(apply, 1); }`).replace("apply(apply, 1)", "1"));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("E-PARSE-TYPE");
    expect(m[0]).toContain("`=>`");
  });

  test("`fn()` in a type is E-PARSE-TYPE naming the fix", () => {
    const m = msgs(P(`    function apply(f: fn(), n: int) -> int { return n; }\n    function go() { @out = 1; }`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("E-PARSE-TYPE");
    expect(m[0]).toContain("`() => void`");
  });

  test("`fn(x: T) -> R` in a type is one E-PARSE-TYPE", () => {
    expect(codes(P(`    function apply(f: fn(x: int) -> int, n: int) -> int { return n; }\n    function go() { @out = 1; }`))).toEqual(["E-PARSE-TYPE"]);
  });

  test("the retired spelling in a struct field: E-PARSE-TYPE (the field's own E-STRUCT-FUNCTION-FIELD after the fix)", () => {
    expect(codes(P(`    type T:struct = { cb: () -> void, label: string }\n    function go() { @out = 1; }`))).toContain("E-PARSE-TYPE");
    expect(codes(P(`    type T:struct = { cb: () => void, label: string }\n    function go() { @out = 1; }`))).toEqual(["E-STRUCT-FUNCTION-FIELD"]);
  });

  test("the declaration's own `-> R` is untouched", async () => {
    await run(P(`    function one() -> int { return 1; }\n    function go() { @out = one(); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("1");
  });
});

describe("item 8 — a server function's function-typed result (§12.5.3)", () => {
  test("is E-ROUTE-003, and not refused again as having no wire descriptor", () => {
    const c = codes(P(`    server function badRet() -> () => void { return badRet; }\n    function go() { @out = 1; }`));
    expect(c).toContain("E-ROUTE-003");
    expect(c.filter((x) => x === "E-ROUTE-003").length).toBe(1);
    expect(msgs(P(`    server function badRet() -> () => void { return badRet; }\n    function go() { @out = 1; }`)).some((m) => m.includes("no wire descriptor"))).toBe(false);
  });

  test("a function-typed parameter stays E-ROUTE-004, reported once", () => {
    expect(codes(P(`    server function badP(cb: () => void) -> string { return "ok"; }\n    function go() { @out = 1; }`))).toEqual(["E-ROUTE-004"]);
  });
});
