// fn-type-s478.test.js — s478-boot-fn-type: FUNCTION VALUES in the bootstrap (the rest of
// g-bootstrap-function-values-slice-s451 after #1918's event listener).
//
// §14.3 (S469 R2′): "A function-holding value MAY be bound, passed, returned and called. It SHALL
// NOT reach a cell, a struct field, `==` / ordering, a map key, any serialization …". §7.5: "A
// function-valued parameter is annotated with a function signature type … `f: (x: int) => int`".
// §7.5 (S469): a lambda's parameters are inferred only where the position fixes them — "(3) an
// argument to a parameter whose declared type spells the function signature"; "A standalone lambda
// (`const f = (x) => …`) must annotate its parameters". §7.3.4: a call is checked for arity
// (E-CALL-ARITY) and argument types (E-TYPE-031). §6.7.4 rule 4: "a call through a function-typed
// binding the compiler cannot resolve to a known set of scrml functions" fails closed. §42.3.5: a
// lambda "does NOT inherit the narrowing of reactive cells". §35.6: "Capturing a `lin` variable in a
// closure counts as one consumption". §13.2 (S469 R3′): waiting-ness is part of a function's type,
// built after RP1 — until then the bootstrap refuses a waiting function value by name.
// Every program is compiled from source by the bootstrap; the clean ones are Core-checked, printed
// and RUN (happy-dom).

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
  await loadProgram(r.core, "s478-fnt-" + k++);
  return r;
}

// a program: `fns` declared at the top, a button that runs `go()`, `@out` shown in #o
const P = (fns, extra = "") => `<program>
    let <out:int=0/>
    let <txt:string=""/>
${fns}
    <button id="b" onclick=go()>b</button>
${extra}
    <p id="o">\${@out}</p>
    <p id="t">\${@txt}</p>
</program>
`;

const TWICE = `    function twice(x: int) -> int { return x * 2; }`;
const APPLY = `    function apply(f: (x: int) => int, n: int) -> int { return f(n); }`;

describe("function values (run)", () => {
  test("a named function bound by `const`, passed to a function-typed parameter, and called through", async () => {
    await run(P(`${TWICE}\n${APPLY}\n    function go() { const g = twice; @out = apply(g, 3) + g(1) + apply(twice, 10); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("28");
  });
  test("an arrow with written parameter types, bound by `const` (§7.5 S469)", async () => {
    await run(P(`    function go() { const inc = (x: int) => x + 1; const join = (a: string, b: string) => a + b; @out = inc(41); @txt = join("a", "b"); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("42");
    expect($("#t").textContent).toBe("ab");
  });
  test("an arrow's bare parameters typed by the parameter it is passed to (§7.5 S469 position (3))", async () => {
    await run(P(`${APPLY}\n    function go() { @out = apply((x) => x * 10, 4) + apply((y) => { const z: int = y + 1; return z; }, 1); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("42");
  });
  test("a function expression `function (x: int) { … }` as an argument", async () => {
    await run(P(`${APPLY}\n    function go() { @out = apply(function (x: int) { if (x > 0) { return x; } return 0 - x; }, 0 - 7); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("7");
  });
  test("a closure over a parameter, returned from a function that declares the function type", async () => {
    await run(P(`    function adder(n: int) -> (x: int) => int { return (x: int) => x + n; }\n    function go() { const add3 = adder(3); const add10 = adder(10); @out = add3(4) + add10(1); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("18");
  });
  test("a closure captures a local by reference (JavaScript closure semantics, §7.3.1)", async () => {
    await run(P(`${APPLY}\n    function go() { let base: int = 1; base = 5; @out = apply((x) => x + base, 2); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("7");
  });
  test("a `let` holding a function value is rebound to another of the same signature", async () => {
    await run(P(`${TWICE}\n    function thrice(x: int) -> int { return x * 3; }\n    function go() { let g: (x: int) => int = twice; if (@out == 0) { g = thrice; } @out = g(5); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("15");
  });
  test("a function value of a `void` function, called as a statement", async () => {
    await run(P(`    function bump(n: int) { @out = @out + n; }\n    function each2(f: (n: int) => void) { f(1); f(2); }\n    function go() { each2(bump); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("3");
  });
  test("a higher-order function taking and returning functions", async () => {
    await run(P(`${TWICE}\n    function inc(x: int) -> int { return x + 1; }\n    function compose(f: (x: int) => int, g: (x: int) => int) -> (x: int) => int { return (x: int) => g(f(x)); }\n    function go() { const h = compose(twice, inc); @out = h(20); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("41");
  });
  test("a `fn` (pure) function named as a value", async () => {
    await run(P(`    fn sq(x: int) -> int { return x * x; }\n${APPLY}\n    function go() { @out = apply(sq, 6); }`));
    click($("#b"));
    expect($("#o").textContent).toBe("36");
  });
  test("a function value passed in a handler call's argument (`onclick=show(noop)`)", async () => {
    await run(`<program>
    let <out:int=0/>
    function seven() -> int { return 7; }
    function show(cb: () => int) { @out = cb(); }
    <button id="b" onclick=show(seven)>b</button>
    <p id="o">\${@out}</p>
</program>
`);
    click($("#b"));
    expect($("#o").textContent).toBe("7");
  });
  test("printed: the function itself (`const g = twice`) and a plain JavaScript call through it", () => {
    const r = fe(P(`${TWICE}\n    function go() { const g = twice; @out = g(2); }`));
    expect(errs(r)).toEqual([]);
    const js = mods.print.printProgram(r.core, "t.client.js", "scrml-runtime.js").js;
    expect(js).toContain("const g = twice;");
    expect(js).toMatch(/g\(2\)/);
  });
});

describe("a call through a value is checked like a direct call (§7.3.4)", () => {
  test("NEGATIVE: wrong arity through a value is E-CALL-ARITY", () => {
    expect(codes(P(`${TWICE}\n    function go() { const g = twice; @out = g(1, 2); }`))).toEqual(["E-CALL-ARITY"]);
    expect(codes(P(`${TWICE}\n    function go() { const g = twice; @out = g(); }`))).toEqual(["E-CALL-ARITY"]);
  });
  test("NEGATIVE: a mismatched argument type through a value is E-TYPE-031", () => {
    expect(codes(P(`${TWICE}\n    function go() { const g = twice; @out = g("a"); }`))).toEqual(["E-TYPE-031"]);
  });
  test("NEGATIVE: a function of another signature passed to a function-typed parameter is E-TYPE-031 (no variance assumed)", () => {
    expect(codes(P(`    function len(s: string) -> int { return 1; }\n${APPLY}\n    function go() { @out = apply(len, 1); }`))).toEqual(["E-TYPE-031"]);
    expect(codes(P(`    function half(x: number) -> int { return 1; }\n${APPLY}\n    function go() { @out = apply(half, 1); }`))).toEqual(["E-TYPE-031"]);
    expect(codes(P(`    function noop(x: int) { }\n${APPLY}\n    function go() { @out = apply(noop, 1); }`))).toEqual(["E-TYPE-031"]);
  });
  test("NEGATIVE: an arrow whose value is not the signature's return type is E-TYPE-031", () => {
    expect(codes(P(`${APPLY}\n    function go() { @out = apply((x) => "s", 1); }`))).toEqual(["E-TYPE-031"]);
  });
  test("NEGATIVE: the call's value is the return type (`string` into an `int` cell)", () => {
    expect(codes(P(`    function name(x: int) -> string { return "a"; }\n    function go() { const g = name; @out = g(1); }`))).toEqual(["E-TYPE-031"]);
  });
  test("NEGATIVE: a rebinding to another signature is E-TYPE-031 (the local's type is its initializer's)", () => {
    expect(codes(P(`${TWICE}\n    function name(x: int) -> string { return "a"; }\n    function go() { let g = twice; g = name; }`))).toEqual(["E-TYPE-031"]);
  });
  test("NEGATIVE: a `void` function value used as a value is E-TYPE-001", () => {
    expect(codes(P(`    function noop(x: int) { }\n    function go() { const g = noop; @out = g(1); }`))).toEqual(["E-TYPE-001"]);
  });
  test("NEGATIVE: an arrow's bare parameter where no position fixes it is E-PARAM-TYPE-REQUIRED (§7.5 S469)", () => {
    expect(codes(P(`    function go() { const f = (x) => x + 1; }`))).toContain("E-PARAM-TYPE-REQUIRED");
  });
});

describe("what a direct call would check stays checked (fail closed)", () => {
  test("NEGATIVE: passing a `!` function where a non-failable is expected, and calling it unhandled, is E-ERROR-002", () => {
    const src = P(`    type E:enum = { Bad }\n    function risky(x: int)! -> E { if (x < 0) { fail E.Bad; } return x; }\n${APPLY}\n    function go() { @out = apply(risky, 1); }`);
    expect(codes(src)).toEqual(["E-ERROR-002"]);
    expect(codes(P(`    type E:enum = { Bad }\n    function risky(x: int)! -> E { if (x < 0) { fail E.Bad; } return x; }\n    function go() { const g = risky; }`))).toEqual(["E-ERROR-002"]);
  });
  test("NEGATIVE: capturing a `lin` value in a closure is its one consumption — a second use is E-LIN-002 (§35.6)", () => {
    const U = `    function use(x: int) -> int { return x; }`;
    expect(codes(P(`${U}\n    function go() { lin t = 5; const f = () => use(t); @out = f() + use(t); }`))).toEqual(["E-LIN-002"]);
    expect(codes(P(`${U}\n    function go() { lin t = 5; const f = () => use(t); const g = () => use(t); @out = f() + g(); }`))).toEqual(["E-LIN-002"]);
    expect(codes(P(`${U}\n    function go() { lin t = 5; const f = () => use(t); @out = f(); }`))).toEqual([]);
  });
  test("NEGATIVE: a function with a `lin` parameter as a value, and a `lin` parameter in a function type, are refused by name", () => {
    const ms = msgs(P(`    function eat(lin x: int) -> int { return x; }\n    function go() { const g = eat; }`));
    expect(ms.length).toBe(1);
    expect(ms[0]).toStartWith("E-BOOTSTRAP-UNSUPPORTED: `eat` names a function without calling it — a function with a `lin` parameter");
    expect(codes(P(`    function call1(f: (lin x: int) => int) -> int { return 1; }\n    function go() { }`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("NEGATIVE: returning a SERVER function to the client is refused by name", () => {
    const ms = msgs(P(`    server function isOk(n: int) -> bool { return n > 100; }\n    function getF() -> (n: int) => bool { return isOk; }\n    function go() { const f = getF(); }`));
    expect(ms.length).toBe(1);
    expect(ms[0]).toStartWith("E-BOOTSTRAP-UNSUPPORTED: `isOk` names a SERVER function without calling it");
  });
  test("NEGATIVE: a function that WAITS (reaches a server call) as a value is refused by name (§13.2 S469 R3′, INTERIM)", () => {
    const ms = msgs(P(`    server function isOk(n: int) -> bool { return n > 100; }\n    function check(n: int) -> bool { const ok: bool = isOk(n) !{ _ :> false }; return ok; }\n    function go() { const f = check; }`));
    expect(ms.length).toBe(1);
    expect(ms[0]).toStartWith("E-BOOTSTRAP-UNSUPPORTED: `check` names a function that waits for the server");
  });
  test("NEGATIVE: an arrow whose body calls a waiting function is refused (no awaited call through a value)", () => {
    const src = P(`    server function isOk(n: int) -> bool { return n > 100; }\n    function check(n: int) -> bool { const ok: bool = isOk(n) !{ _ :> false }; return ok; }\n    function apply(f: (x: int) => bool, n: int) -> bool { return f(n); }\n    function go() { if (apply((n: int) => check(n), 1)) { @out = 1; } }`);
    expect(codes(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("NEGATIVE: recursion through a value is refused by name", () => {
    const ms = msgs(P(`    function fact(n: int) -> int { const g = fact; if (n <= 1) { return 1; } return n * g(n - 1); }\n    function go() { @out = fact(4); }`));
    expect(ms.length).toBe(1);
    expect(ms[0]).toStartWith("E-BOOTSTRAP-UNSUPPORTED: `fact` is named as a value inside a function it reaches");
    // mutual: `a` names `b` as a value, and `b` calls `a`
    expect(codes(P(`    function a(n: int) -> int { const g = b; return 1; }\n    function b(n: int) -> int { return a(n); }\n    function go() { @out = b(1); }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("NEGATIVE: a function value in a server function's body is refused by name", () => {
    const src = P(`${TWICE}\n    server function s(n: int) -> int { const g = twice; return g(n); }\n    function go() { @out = s(1) !{ _ :> 0 }; }`);
    expect(codes(src)).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("NEGATIVE: a server function's function-typed parameter is E-ROUTE-004 (§12.5)", () => {
    expect(codes(P(`    server function s(f: (x: int) => int) -> int { return 1; }\n    function go() { }`))).toContain("E-ROUTE-004");
  });
  test("NEGATIVE: a call through a value inside a pure `fn` is refused by name (§48.6.2: purity not verifiable)", () => {
    const ms = msgs(P(`    fn one(x: int) -> int { return x; }\n    fn via(f: (x: int) => int) -> int { return f(1); }\n    function go() { @out = via(one); }`));
    expect(ms.length).toBe(1);
    expect(ms[0]).toStartWith("E-BOOTSTRAP-UNSUPPORTED: `f(…)` calls through a function value inside a `fn` body");
  });
  test("NEGATIVE: a local named like a function in scope is not called through (the narrowing pass reads calls by name)", () => {
    expect(codes(P(`${TWICE}\n    function apply2(twice: (x: int) => int) -> int { return twice(1); }\n    function go() { @out = apply2(twice); }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

describe("§6.7.4 rule 4 / §42.3.5 — what a call through a value may do is not proven", () => {
  test("a markup value reaching a call through a value is E-VALUE-WRITE-UNPROVEN (§6.15)", () => {
    expect(codes(P(`    fn one(x: int) -> int { return x; }\n    function via() -> int { const k = one; return k(1); }\n    function go() { }`, `    <p>\${via()}</p>`))).toEqual(["E-VALUE-WRITE-UNPROVEN"]);
  });
  test("an `<effect>` body calling through a value is E-EFFECT-WRITE-UNPROVEN", () => {
    const src = `<program>
    let <n:int=0/>
    function beacon(v: int) -> int { return v; }
    <effect deps=[@n]>\${
        const g = beacon;
        g(@n);
    }</>
    <p>\${@n}</p>
</program>
`;
    expect(codes(src)).toEqual(["E-EFFECT-WRITE-UNPROVEN"]);
  });
  test("a call through a value ends a cell's narrowing; a lambda does not inherit one", () => {
    const src = `<program>
    let <n:int | not=(not)/>
    let <out:int=0/>
    function noop() { }
    function show(cb: () => void) { if (@n is given) { cb(); @out = @n + 1; } }
    function show2() { if (@n is given) { const f: () => int = () => @n + 1; @out = f(); } }
    function show3() { if (@n is given) { noop(); @out = @n + 1; } }
    <button id="b" onclick=show(noop)>go</button>
    <button id="c" onclick=show2()>go</button>
    <button id="d" onclick=show3()>go</button>
    <p id="o">\${@out}</p>
</program>
`;
    expect(codes(src)).toEqual(["E-OPERAND-NOT-NARROWED", "E-OPERAND-NOT-NARROWED"]);
  });
});

describe("never silently accepted — where a function value may not stand (§14.3 R2′)", () => {
  const one = (body) => msgs(P(`${TWICE}\n    function thrice(x: int) -> int { return x * 3; }\n    function go() { ${body} }`));
  test("NEGATIVE: an array literal, a ternary (a join), a template, `==`, a cell write", () => {
    for (const body of [
      "const fs = [twice];",
      "const g = @out > 1 ? twice : thrice;",
      "const g = twice; const s: string = `${g}`;",
      "const g = twice; const h = twice; if (g == h) { @out = 1; }",
      "const g = twice; @out = g;",
    ]) {
      const ms = one(body);
      expect(ms.length).toBeGreaterThan(0);
      for (const m of ms) expect(m).toStartWith("E-BOOTSTRAP-UNSUPPORTED");
    }
  });
  test("NEGATIVE: a struct field of function type is E-STRUCT-FUNCTION-FIELD (§14.3)", () => {
    expect(codes(`<program>\n    type S:struct = { f: (x: int) => int }\n    <p>x</p>\n</program>\n`)).toEqual(["E-STRUCT-FUNCTION-FIELD"]);
  });
  test("NEGATIVE: a nested function, an unannotated return, a returned function without a declared type", () => {
    expect(one("function inner(x: int) -> int { return x; } const g = inner;")[0]).toStartWith("E-BOOTSTRAP-UNSUPPORTED: `inner` names a function without calling it — a NESTED function");
    expect(msgs(P(`    function tw(x: int) { return x * 2; }\n    function go() { const g = tw; }`))[0]).toStartWith("E-BOOTSTRAP-UNSUPPORTED: `tw` names a function without calling it — the bootstrap types a function VALUE by its signature");
    expect(msgs(P(`${TWICE}\n    function getF() { return twice; }\n    function go() { }`))[0]).toStartWith("E-BOOTSTRAP-UNSUPPORTED: this `return` gives a function value from a function that does not declare a function return type");
  });
  test("NEGATIVE: a function value assigned to a local not declared with a function type", () => {
    expect(one("let g: int = 1; g = twice;")[0]).toStartWith("E-BOOTSTRAP-UNSUPPORTED: the local `g` is not declared with a function type");
  });
});
