// inner-forever-loop-s473.test.js — s473-boot-loop-inner-forever (gap
// g-spec-bound-loop-inner-forever-hang-s473): E-LOOP-008 widens to a bound or
// Tier-0 loop that an inner forever loop strands.
//
//   Ruling (S473 "owner questions round 2, PA recs", item 4,
//   user-voice-scrml.md, verbatim): "The exit-less loop rule (E-LOOP-008)
//   widens to catch an inner forever loop."
//
//   SPEC §49.6 rule 10 (the S473 sentence): a bound loop whose head does end
//   it is still E-LOOP-008 when no path through its body finishes an
//   iteration — reaches the body's end, a `continue` of this loop, or a way out
//   of it — because every path runs into an inner loop that never completes.
//
// The shapes that compiled clean before (and hang: review #1631 F3, A40/A41
// rc=124): an iterate / condition / counted bound loop whose body, on every
// path, reaches an inner `for { }`, `for (;;)` or `for (true)` that has no
// `break` of its own. The inner loop is statement-position, so the ruling's
// "a statement-position `for { }` stays legal" still holds for it on its own:
// what is refused is the BOUND loop it strands.
//
// RED ON BASE: every E-LOOP-008 expectation in the first describe (the
// "stranded" shapes compiled with no diagnostic). The negatives were green on
// base and must stay green.

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
const load = (src) => loadProgram(clean(src).core, "s473if-" + k++, []);

const prog = (decls, body) => `<program>\n${decls}\n    <main>\n${body}\n    </main>\n</program>\n`;
const ZS = `    <zs:int[]=([3, 4, 5])/>`;
const fnProg = (b) => prog(`${ZS}\n    function f(ys: int[]) -> int {\n${b}\n    }`, `        <p id="o">\${f(@zs)}</p>`);
const fnCodes = (b) => codes(fnProg(b));
const R = `\n        return xs.length;`;
const bound = (loop) => fnCodes(`        const xs = ${loop};${R}`);
const t0Prog = (loop) => prog(`    <zs:int[]=([1, 2])/>`, `        <p id="o">${loop}</p>`);
const ENUM = `    type K:enum = { A, B }`;
const kProg = (b) => prog(`${ENUM}\n    function f(k: K) -> int {\n${b}\n    }`, `        <p id="o">\${f(K.A)}</p>`);
const ERR = `    type E:enum = { Bad }\n    let <n:int=0/>\n    function h(v: int)! E {\n        if (v > 2) fail .Bad;\n        return v;\n    }`;
const errProg = (b) => prog(`${ERR}\n    function f(v: int)! E {\n${b}\n    }\n    function go() { @n = f(1) !{ _ :> 0 }; }`, `        <p id="o">\${@n}</p>`);
const notProg = (b) => prog(`    function f(m: int | not) -> int {\n${b}\n    }`, `        <p id="o">\${f(1)}</p>`);

// ---------------------------------------------------------------------------
describe("stranded by an inner forever loop: E-LOOP-008 (red on base)", () => {
  test("review #1631 F3 / A40: `for (y of ys) { lift y; for { } }`", () => {
    expect(bound(`for (y of ys) { lift y; for { } }`)).toEqual(["E-LOOP-008"]);
  });
  test("review #1631 F3 / A41: the Tier-0 form `${ for (z of @zs) { lift <li>x</li>; for { } } }`", () => {
    expect(codes(t0Prog(`\${ for (z of @zs) { lift <li>x</li>; for { } } }`))).toEqual(["E-LOOP-008"]);
  });
  test("every forever head of the inner loop: `for (true)`, `for (;;)`, `for (;true;)`", () => {
    expect(bound(`for (y of ys) { lift y; for (true) { } }`)).toEqual(["E-LOOP-008"]);
    expect(bound(`for (y of ys) { lift y; for (;;) { } }`)).toEqual(["E-LOOP-008"]);
    expect(bound(`for (y of ys) { lift y; for (;true;) { } }`)).toEqual(["E-LOOP-008"]);
  });
  test("every ending head of the outer loop: iterate, condition, counted", () => {
    expect(fnCodes(`        let i = 0;\n        const xs = for (i < 3) { lift i; i = i + 1; for (;;) { i = i + 1; } };${R}`)).toEqual(["E-LOOP-008"]);
    expect(bound(`for (let i = 0; i < 3; i = i + 1) { lift i; for { } }`)).toEqual(["E-LOOP-008"]);
    expect(bound(`for (i of 0..3) { lift i; for { } }`)).toEqual(["E-LOOP-008"]);
  });
  test("the inner loop's own `break` / `continue` leave only the inner-inner loop, or restart the inner one", () => {
    expect(bound(`for (y of ys) { lift y; for { for { break; } } }`)).toEqual(["E-LOOP-008"]);
    expect(bound(`for (y of ys) { lift y; for { continue; } }`)).toEqual(["E-LOOP-008"]);
    expect(bound(`for (y of ys) { lift y; a: for { for { break; } } }`)).toEqual(["E-LOOP-008"]);
  });
  test("every branch strands: an `if` both of whose branches, and a `match` every arm of which, reach a forever loop", () => {
    expect(bound(`for (y of ys) { lift y; if (y > 3) { for { } } else { for (true) { } } }`)).toEqual(["E-LOOP-008"]);
    expect(codes(kProg(`        const xs = for (i of 0..3) { lift i; match k { .A :> { for { } }, .B :> { for { } } } };${R}`))).toEqual(["E-LOOP-008"]);
  });
  test("a forever loop BEFORE the lift: both facts (the lift is unreachable, E-LOOP-007; the loop never finishes, E-LOOP-008)", () => {
    expect(bound(`for (y of ys) { for { } lift y; }`)).toEqual(["E-LOOP-007", "E-LOOP-008"]);
  });
  test("a loop bound in a handler block and inside an `<each>` row", () => {
    expect(codes(prog(`    let <n:int=0/>`, `        <button onclick={ const xs = for (i of 0..3) { lift i; for { } }; @n = xs.length; }>go</button>`))).toEqual(["E-LOOP-008"]);
    expect(codes(prog(ZS, `        <ul><each in=@zs>\${ for (i of 0..2) { lift i; for { } } }</each></ul>`))).toEqual(["E-LOOP-008"]);
  });
  test("the message names the binder, the inner loop and the fix; the Tier-0 one says the page never finishes", () => {
    const ds = diags(fnProg(`        const xs = for (y of ys) { lift y; for { } };${R}`), "E-LOOP-008");
    expect(ds.length).toBe(1);
    expect(ds[0].message).toContain("`xs`");
    expect(ds[0].message).toContain("inner loop");
    expect(ds[0].message).toContain("break");
    expect(diags(t0Prog(`\${ for (z of @zs) { lift <li>x</li>; for { } } }`), "E-LOOP-008")[0].message).toContain("never finishes rendering");
  });
  test("already caught before this lane (regression guard): a forever outer loop whose `break` sits after a stranding inner loop", () => {
    expect(bound(`for { lift 1; for (true) { if (ys.length > 0) { lift 2; } } break; }`)).toEqual(["E-LOOP-008"]);
    expect(bound(`for { lift 1; for (true) { break; } }`)).toEqual(["E-LOOP-008"]);
  });
});

// ---------------------------------------------------------------------------
describe("legal: an inner forever loop that does exit, or a path that gets past it", () => {
  test("the inner forever loop `break`s — compiles and runs", async () => {
    await load(fnProg(`        const xs = for (y of ys) { lift y; for { break; } };${R}`));
    expect($("#o").textContent).toBe("3");
  });
  test("the inner forever loop `break`s under a condition", () => {
    expect(bound(`for (y of ys) { lift y; for { if (y > 3) { break; } } }`)).toEqual([]);
  });
  test("the inner forever loop `return`s — compiles and runs", async () => {
    await load(fnProg(`        const xs = for (y of ys) { lift y; for { return 7; } };${R}`));
    expect($("#o").textContent).toBe("7");
  });
  test("the inner forever loop `fail`s, or a `?` in it propagates", () => {
    expect(codes(errProg(`        const xs = for (i of 0..3) { lift i; for { fail .Bad; } };${R}`))).toEqual([]);
    expect(codes(errProg(`        const xs = for (i of 0..3) { lift i; for { h(i)?; lift i; } };${R}`))).toEqual([]);
  });
  test("labelled: `break outer` from the inner forever loop leaves the bound loop — compiles and runs", async () => {
    await load(fnProg(`        const xs = o: for (y of ys) { lift y; for { break o; } };${R}`));
    expect($("#o").textContent).toBe("1");
  });
  test("labelled: `continue outer` from the inner forever loop finishes the iteration — compiles and runs", async () => {
    await load(fnProg(`        const xs = o: for (y of ys) { lift y; for { continue o; } };${R}`));
    expect($("#o").textContent).toBe("3");
  });
  test("labelled: `break a` naming the inner forever loop from an inner-inner loop completes it", () => {
    expect(bound(`for (y of ys) { lift y; a: for { for { break a; } } }`)).toEqual([]);
  });
  test("a `continue` or a `break` reached before the forever loop", () => {
    expect(bound(`for (y of ys) { lift y; if (y > 0) { continue; } for { } }`)).toEqual([]);
    expect(bound(`for (y of ys) { lift y; if (y > 0) { break; } for { } }`)).toEqual([]);
  });
  test("one branch strands, the other falls through (some path finishes the iteration)", () => {
    expect(bound(`for (y of ys) { lift y; if (y > 30) { for { } } }`)).toEqual([]);
    expect(codes(kProg(`        let n = 0;\n        const xs = for (i of 0..3) { lift i; match k { .A :> { for { } }, .B :> { n = 1; } } };${R}`))).toEqual([]);
  });
  test("a `match` whose arms all leave (`continue` / `break`), or one arm strands and the other `continue`s", () => {
    expect(codes(kProg(`        const xs = for (i of 0..3) { lift i; match k { .A :> { continue; }, .B :> { break; } } };${R}`))).toEqual([]);
    expect(codes(kProg(`        const xs = for (i of 0..3) { lift i; match k { .A :> { for { } }, .B :> { continue; } } };${R}`))).toEqual([]);
  });
  test("review #1631 r1 R1-1 kept: a lone `not :>` arm falls through for a value, so a forever loop in it strands nothing", () => {
    expect(codes(notProg(`        const xs = for (i of 0..3) { lift i; match m { not :> { for { } } } };${R}`))).toEqual(["W-MATCH-002"]);
    expect(codes(notProg(`        const xs = for { lift 1; match m { not :> { continue; } } break; };${R}`))).toEqual(["W-MATCH-002"]);
  });
  test("an inner loop with an ENDING head may run zero times, so it strands nothing (even over a forever loop)", () => {
    expect(bound(`for (y of ys) { lift y; for (z of ys) { if (z > 0) { break; } } }`)).toEqual([]);
    expect(bound(`for (y of ys) { lift y; for (z of ys) { for { } } }`)).toEqual([]);
  });
  test("the ruling's statement-position `for { }` stays legal, also inside a statement loop", () => {
    expect(fnCodes(`        for (y of ys) { for { } }\n        return 1;`)).toEqual([]);
  });
  test("a Tier-0 loop whose inner forever loop `break`s", () => {
    expect(codes(t0Prog(`\${ for (z of @zs) { lift <li>x</li>; for { break; } } }`))).toEqual([]);
  });
  test("a forever outer loop with a `break` reached before a stranding inner loop (some path leaves)", () => {
    expect(bound(`for { lift 1; if (ys.length > 0) { break; } for { } }`)).toEqual([]);
  });
  test("a plain bound loop", () => {
    expect(bound(`for (y of ys) { lift y; }`)).toEqual([]);
  });
});
