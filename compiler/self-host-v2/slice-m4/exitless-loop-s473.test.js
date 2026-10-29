// exitless-loop-s473.test.js — s473-boot-exitless-loop (gap
// g-bootstrap-exitless-bound-loop-render-hang-s472): an exit-less bound or
// Tier-0 loop is a compile error, E-LOOP-008.
//
//   Ruling (S472 "five PA recs", item 5, user-voice-scrml.md): "An exit-less
//   bound or Tier-0 loop is a compile error (`const xs = for { lift 1; };`,
//   `${ for { lift 1; } }` with no reachable `break`/`return`); a
//   statement-position `for { }` stays legal."
//
//   SPEC §49.6 rule 10 (written for this ruling): a bound loop — a
//   `for-binding` or a Tier-0 `${ for … }` — whose head never ends it (`for { }`,
//   `for (;;)`, a condition that is the literal `true`) SHALL hold a reachable
//   way out of it: a `break` that leaves THIS loop, or a `return`, a `fail` or a
//   `?` (§49.3.6's ways out). Otherwise E-LOOP-008.
//
// What counts as "reachable" (fail closed — toward the error, never the hang):
//   - a `break` in an inner loop leaves only that loop (unless it names this one);
//   - a statement after one that always leaves its block is not reached;
//   - a `defer`'s body runs only when the scope ends, so it is not a way out;
//   - the bootstrap folds no constants, so `if (false) { break; }` counts.
//
// RED ON BASE: every E-LOOP-008 expectation below (the loops compiled clean).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => [...new Set(run(src).diags.map((d) => d.code))].sort();
const diags = (src, code) => run(src).diags.filter((d) => d.code === code);
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const $ = (sel) => document.querySelector(sel);
let k = 0;
const load = (src) => loadProgram(clean(src).core, "s473xl-" + k++, []);

const prog = (decls, body) => `<program>\n${decls}\n    <main>\n${body}\n    </main>\n</program>\n`;
const ZS = `    <zs:int[]=([3, 4, 5])/>`;
const fnProg = (b) => prog(`${ZS}\n    function f(ys: int[]) -> int {\n${b}\n    }`, `        <p id="o">\${f(@zs)}</p>`);
const fnCodes = (b) => codes(fnProg(b));
const t0Prog = (loop, decls = `    let <n:int=0/>`) => prog(decls, `        <p id="o">${loop}</p>`);
const ENUM = `    type K:enum = { A, B }`;
const kProg = (b) => prog(`${ENUM}\n    function f(k: K) -> int {\n${b}\n    }`, `        <p id="o">\${f(K.A)}</p>`);
const ERR = `    type E:enum = { Bad }\n    let <n:int=0/>\n    function h(v: int)! E {\n        if (v > 2) fail .Bad;\n        return v;\n    }`;
const errProg = (b) => prog(`${ERR}\n    function f(v: int)! E {\n${b}\n    }\n    function go() { @n = f(1) !{ _ :> 0 }; }`, `        <p id="o">\${@n}</p>`);

// ---------------------------------------------------------------------------
describe("the two ruled spellings are E-LOOP-008", () => {
  test("`const xs = for { lift 1; };` — a bound loop with no way out", () => {
    expect(fnCodes(`        const xs = for { lift 1; };\n        return xs.length;`)).toEqual(["E-LOOP-008"]);
  });
  test("`${ for { lift 1; } }` — a Tier-0 loop with no way out", () => {
    expect(codes(t0Prog(`\${ for { lift 1; } }`))).toEqual(["E-LOOP-008"]);
  });
  test("every forever head: `for (;;)`, a counted head with no condition, and the literal `for (true)` / `for (;true;)`", () => {
    expect(fnCodes(`        const xs = for (;;) { lift 1; };\n        return xs.length;`)).toEqual(["E-LOOP-008"]);
    expect(fnCodes(`        const xs = for (let i = 0; ; i = i + 1) { lift i; };\n        return xs.length;`)).toEqual(["E-LOOP-008"]);
    expect(fnCodes(`        const xs = for (true) { lift 1; };\n        return xs.length;`)).toEqual(["E-LOOP-008"]);
    expect(fnCodes(`        const xs = for (;true;) { lift 1; };\n        return xs.length;`)).toEqual(["E-LOOP-008"]);
    expect(codes(t0Prog(`\${ for (;;) { lift 1; } }`))).toEqual(["E-LOOP-008"]);
    expect(codes(t0Prog(`\${ for (true) { lift 1; } }`))).toEqual(["E-LOOP-008"]);
  });
  test("the message names the binder and the fix, at the loop", () => {
    const ds = diags(fnProg(`        const xs = for { lift 1; };\n        return xs.length;`), "E-LOOP-008");
    expect(ds.length).toBe(1);
    expect(ds[0].message).toContain("`xs`");
    expect(ds[0].message).toContain("break");
    expect(diags(t0Prog(`\${ for { lift 1; } }`), "E-LOOP-008")[0].message).toContain("never finishes rendering");
  });
  test("a bound loop in a handler block and in a `fn` body too", () => {
    expect(codes(prog(`    let <n:int=0/>`, `        <button onclick={ const xs = for { lift 1; }; @n = xs.length; }>go</button>`))).toEqual(["E-LOOP-008"]);
    expect(codes(prog(`    fn g() -> int { const xs = for { lift 1; }; return xs[0]; }`, `        <p id="o">\${g()}</p>`))).toEqual(["E-LOOP-008"]);
  });
  test("a Tier-0 loop inside an `<each>` row", () => {
    expect(codes(prog(ZS, `        <ul><each in=@zs>\${ for { lift 1; } }</each></ul>`))).toEqual(["E-LOOP-008"]);
  });
  test("an exit-less loop that also lifts nothing gets both codes (two facts)", () => {
    expect(fnCodes(`        let n = 0;\n        const xs = for { n = n + 1; };\n        return n;`)).toEqual(["E-LOOP-007", "E-LOOP-008"]);
  });
});

// ---------------------------------------------------------------------------
describe("legal: a statement-position `for { }`, and a bound loop with a reachable way out", () => {
  test("a statement-position `for { }` stays legal (the ruling)", () => {
    expect(fnCodes(`        for { }\n        return 1;`)).toEqual([]);
    expect(fnCodes(`        let n = 0;\n        for { n = n + 1; }\n        return n;`)).toEqual([]);
  });
  test("a `break` in an `if` — compiles and runs", async () => {
    const src = fnProg(`        let n = 0;\n        const xs = for { n = n + 1; if (n > 3) { break; } lift n; };\n        return xs.length;`);
    await load(src);
    expect($("#o").textContent).toBe("3");
  });
  test("a Tier-0 loop with a `break` in an `if`", () => {
    expect(codes(t0Prog(`\${ for (;;) { lift 1; if (@n == 0) { break; } } }`))).toEqual([]);
  });
  test("a `return` in a function's value loop — compiles and runs", async () => {
    await load(fnProg(`        let n = 0;\n        const xs = for { n = n + 1; if (n > 6) { return n; } lift n; };\n        return xs.length;`));
    expect($("#o").textContent).toBe("7");
  });
  test("a `return` inside an inner loop leaves the function, so it leaves the bound loop too", () => {
    expect(fnCodes(`        let n = 0;\n        const xs = for { lift 1; for (y of ys) { n = n + y; if (n > 20) { return n; } } };\n        return xs.length;`)).toEqual([]);
  });
  test("a `fail` or a `?` leaves the function (§49.3.6), so it is a way out", () => {
    expect(codes(errProg(`        let i = 0;\n        const xs = for { i = i + 1; if (i > 5) { fail .Bad; } lift i; };\n        return xs.length;`))).toEqual([]);
    expect(codes(errProg(`        let i = 0;\n        const xs = for { i = i + 1; h(i)?; lift i; };\n        return xs.length;`))).toEqual([]);
  });
  test("the bootstrap folds no constants: `if (false) { break; }` is a reachable `break`", () => {
    expect(fnCodes(`        const xs = for { lift 1; if (false) { break; } };\n        return xs.length;`)).toEqual([]);
  });
  test("a condition head that is not the literal `true` and every iterate head is not a forever head", () => {
    expect(fnCodes(`        let c = 0;\n        const xs = for (c < 4) { c = c + 1; lift c; };\n        return xs.length;`)).toEqual([]);
    expect(fnCodes(`        const xs = for (y of ys) { lift y; };\n        return xs.length;`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("what is NOT a way out", () => {
  test("a loop whose only `break` is in an inner loop is E-LOOP-008", () => {
    expect(fnCodes(`        const xs = for { lift 1; for { break; } };\n        return xs.length;`)).toEqual(["E-LOOP-008"]);
    expect(fnCodes(`        const xs = for { lift 1; for (y of ys) { if (y > 3) { break; } } };\n        return xs.length;`)).toEqual(["E-LOOP-008"]);
    expect(codes(t0Prog(`\${ for { lift 1; for (y of 0..3) { if (y == 1) { break; } } } }`))).toEqual(["E-LOOP-008"]);
  });
  test("a nested BOUND loop's `break` ends only the nested loop: the outer one is E-LOOP-008, the inner one is fine", () => {
    const ds = diags(fnProg(`        const xs = for { const ys2 = for { lift 1; break; }; lift ys2[0]; };\n        return xs.length;`), "E-LOOP-008");
    expect(ds.length).toBe(1);
    expect(ds[0].message).toContain("`xs`");
  });
  test("a `break` no path reaches (after a `continue`, or after an `if` both of whose branches leave) does not count", () => {
    expect(fnCodes(`        const xs = for { lift 1; continue; break; };\n        return xs.length;`)).toEqual(["E-LOOP-008"]);
    expect(fnCodes(`        let n = 0;\n        const xs = for { n = n + 1; lift n; if (n > 2) { continue; } else { continue; } break; };\n        return xs.length;`)).toEqual(["E-LOOP-008"]);
  });
  test("a `return` no path reaches does not count", () => {
    expect(fnCodes(`        const xs = for { lift 1; continue; return 2; };\n        return xs.length;`)).toEqual(["E-LOOP-008"]);
  });
});

// ---------------------------------------------------------------------------
describe("`match` arms and labels", () => {
  test("a `break` in a statement `match` arm leaves the loop — compiles and runs", async () => {
    await load(kProg(`        let n = 0;\n        const xs = for { n = n + 1; lift n; match k { .A :> { if (n > 1) { break; } }, .B :> { break; } } };\n        return xs.length;`));
    expect($("#o").textContent).toBe("2");
  });
  test("a `break` in a `!{}` arm leaves the loop", () => {
    expect(codes(prog(`${ERR}\n    function f() -> int {\n        let i = 0;\n        const xs = for { i = i + 1; h(i) !{ _ :> { break; } }; lift i; };\n        return xs.length;\n    }`, `        <p id="o">\${f()}</p>`))).toEqual([]);
  });
  test("a `match` arm's `break` inside an inner loop leaves only the inner loop", () => {
    expect(codes(kProg(`        const xs = for { lift 1; for (y of 0..2) { match k { .A :> { break; }, .B :> { } } } };\n        return xs.length;`))).toEqual(["E-LOOP-008"]);
  });
  test("`break outer` from an inner loop names the bound loop: a way out", () => {
    expect(fnCodes(`        const xs = outer: for { lift 1; for (y of ys) { if (y > 3) { break outer; } } };\n        return xs.length;`)).toEqual([]);
    expect(codes(t0Prog(`\${ outer: for { lift 1; for { break outer; } } }`))).toEqual([]);
  });
  test("`break inner` names the inner loop only: E-LOOP-008", () => {
    expect(fnCodes(`        const xs = outer: for { lift 1; inner: for { break inner; } };\n        return xs.length;`)).toEqual(["E-LOOP-008"]);
  });
  test("review #1631 F1: a `break` after a `match` every arm of which leaves is not reached", () => {
    // every arm `continue`s: E-LOOP-008 (this hung at run time before the fix)
    expect(codes(kProg(`        const xs = for { lift 1; match k { .A :> { continue; }, .B :> { continue; } } break; };\n        return xs.length;`))).toEqual(["E-LOOP-008"]);
    expect(codes(kProg(`        const xs = for { lift 1; match k { .A :> { continue; }, _ :> { continue; } } break; };\n        return xs.length;`))).toEqual(["E-LOOP-008"]);
    expect(fnCodes(`        let b = true;\n        const xs = for { lift 1; match b { true :> { continue; }, false :> { continue; } } break; };\n        return xs.length;`)).toEqual(["E-LOOP-008"]);
    expect(codes(t0Prog(`\${ for { lift 1; match @n { 0 :> { continue; }, _ :> { continue; } } break; } }`))).toEqual(["E-LOOP-008"]);
  });
  test("review #1631 F1: a `match` whose arms `return` leaves the loop (legal); one arm that falls through keeps the `break` reachable", async () => {
    await load(kProg(`        const xs = for { lift 1; match k { .A :> { return 5; }, .B :> { return 6; } } break; };\n        return xs.length;`));
    expect($("#o").textContent).toBe("5");
    expect(codes(kProg(`        const xs = for { lift 1; match k { .A :> { continue; }, .B :> { return 2; } } break; };\n        return xs.length;`))).toEqual([]);
    expect(codes(kProg(`        let n = 0;\n        const xs = for { lift 1; match k { .A :> { continue; }, .B :> { n = 1; } } break; };\n        return xs.length;`))).toEqual([]);
  });
  test("review #1631 F1: a literal `match` with no wildcard may fall through, so the `break` after it is reached", () => {
    expect(fnCodes(`        let n = 0;\n        const xs = for { n = n + 1; lift n; match n { 1 :> { continue; }, 2 :> { continue; } } break; };\n        return xs.length;`)).toEqual(["W-MATCH-002"]);
  });
  test("review #1631 F1: a `!{}` guard whose arms all leave does not end the path (its subject may succeed)", () => {
    expect(codes(prog(`${ERR}\n    function f() -> int {\n        let i = 0;\n        const xs = for { i = i + 1; lift i; h(i) !{ _ :> { continue; } }; break; };\n        return xs.length;\n    }`, `        <p id="o">\${f()}</p>`))).toEqual([]);
  });
  test("review #1631 F1, shared walk: a `lift` after a `match` every arm of which leaves is not reached (E-LOOP-007)", () => {
    expect(codes(kProg(`        const xs = for (i of 0..3) { match k { .A :> { continue; }, .B :> { break; } } lift i; };\n        return xs.length;`))).toEqual(["E-LOOP-007"]);
  });
  test("review #1631 F2: an inner `for (true) { }` / `for (;true;) { }` ends the path as `for { }` does", () => {
    expect(fnCodes(`        const xs = for { lift 1; for (true) { } break; };\n        return xs.length;`)).toEqual(["E-LOOP-008"]);
    expect(fnCodes(`        const xs = for { lift 1; for (;true;) { } break; };\n        return xs.length;`)).toEqual(["E-LOOP-008"]);
    expect(fnCodes(`        const xs = for { lift 1; for { } break; };\n        return xs.length;`)).toEqual(["E-LOOP-008"]);
    expect(codes(t0Prog(`\${ for { lift 1; for (true) { } break; } }`))).toEqual(["E-LOOP-008"]);
  });
  test("review #1631 F2, one definition: a function that ends in `for (true) { }` no longer falls off its end (as with `for { }`)", () => {
    expect(fnCodes(`        for { }`)).toEqual([]);
    expect(fnCodes(`        for (true) { }`)).toEqual([]);
    expect(fnCodes(`        for (;true;) { }`)).toEqual([]);
    expect(fnCodes(`        let n = 0;\n        for (n < 3) { n = n + 1; }`)).toEqual(["E-TYPE-043"]);
  });
  test("F4 (documented): only the literal forms are read — `for (true && true)` is not caught", () => {
    expect(fnCodes(`        const xs = for (true && true) { lift 1; };\n        return xs.length;`)).toEqual([]);
  });
  test("a `defer` body is not a way out (it runs when the scope ends)", () => {
    // `defer` directly in a bound body is refused anyway; inside an inner block it still runs only at exit
    expect(fnCodes(`        const xs = for { lift 1; defer { break; } };\n        return xs.length;`)).toContain("E-LOOP-008");
  });
});
