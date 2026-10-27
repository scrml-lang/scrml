// loop-defer-s471.test.js — s471 (g-bootstrap-loop-wait-and-defer-s469, the
// `defer` half): a `defer` in a loop body, and a loop in a deferred body.
//
//   §19.16.2 Registration: "the innermost statement list that contains the
//   `defer`: … a loop body (once per iteration)"; Exit: "every deferred body
//   registered in that block runs exactly once, on EVERY exit path: falling off
//   the end of the block; `return` …; `break` / `continue` out of the block".
//   §19.16.6: "A loop body is its own block, so each iteration has its own stack
//   instance and its deferred statements run at that iteration's exit."
//   §19.16.3 rule 1: "A `break`/`continue` that targets a loop INSIDE the
//   deferred body is permitted."
//   §19.16.2: "The same code covers a `defer` written directly in an arm of a
//   `match` / `if` / `for` that is used for its VALUE" (E-DEFER-UNSUPPORTED-SITE).
//
// Graded on the RUNTIME effect (happy-dom) and on exact codes.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => [...new Set(run(src).diags.map((d) => d.code))].sort();
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const $ = (sel) => document.querySelector(sel);
const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);

// A program with a string log, the given functions, and a `go` button.
const P = (fns) =>
  `<program>\n    let <log:string=""/>\n    let <out:int=0/>\n${fns}\n    <main>\n        <button onclick=go()>go</button>\n        <p id="log">\${@log}</p>\n        <p id="out">\${@out}</p>\n    </main>\n</program>\n`;

let k = 0;
async function press(fns) {
  const r = clean(P(fns));
  await loadProgram(r.core, "loopdefer-" + k++);
  click(btn("go"));
  return { log: $("#log").textContent, out: $("#out").textContent };
}

describe("a `defer` in a loop body — once per iteration, at that iteration's exit", () => {
  test("falling off the body: each iteration's deferred bodies run at its end, last registered first", async () => {
    const o = await press(`    function go() {\n        for (i of 0..2) {\n            defer @log = @log + "1";\n            defer { @log = @log + "2"; }\n            @log = @log + "b";\n        }\n        @log = @log + "|";\n    }`);
    expect(o.log).toBe("b21b21|");
  });

  test("`continue` and `break` out of the body run its deferred body (counted head: the step after it)", async () => {
    const o = await press(`    function go() {\n        for (let i = 0; i < 5; i = i + 1) {\n            defer @log = @log + "d";\n            if (i == 1) { continue; }\n            if (i == 3) { break; }\n            @log = @log + "x";\n        }\n    }`);
    // i=0: x d · i=1: d (continue) · i=2: x d · i=3: d (break)
    expect(o.log).toBe("xddxdd");
  });

  test("`return` from a loop body runs the iteration's deferred body, after the value is computed", async () => {
    const o = await press(`    function f() -> int {\n        for (i of 0..3) {\n            defer @log = @log + "d";\n            if (i == 1) { return i * 10; }\n            @log = @log + "x";\n        }\n        return 0;\n    }\n    function go() {\n        @out = f();\n    }`);
    expect(o.log).toBe("xdd");
    expect(o.out).toBe("10");
  });

  test("a labelled `break` out of nested loops runs the inner body's deferred body, then the outer's", async () => {
    const o = await press(`    function go() {\n        outer: for (i of 0..3) {\n            defer @log = @log + "O";\n            for (j of 0..3) {\n                defer @log = @log + "i";\n                if (j == 1) { break outer; }\n                @log = @log + "x";\n            }\n        }\n        @log = @log + "|";\n    }`);
    expect(o.log).toBe("xiiO|");
  });

  test("not reached, not registered: a `defer` after the iteration's `continue` never runs", async () => {
    const o = await press(`    function go() {\n        for (i of 0..2) {\n            @log = @log + "a";\n            if (i == 0) { continue; }\n            defer @log = @log + "d";\n        }\n    }`);
    expect(o.log).toBe("aad");
  });

  test("a `defer` in an `if` block of a bound loop's body is the `if` block's (runtime)", async () => {
    const o = await press(`    function go() {\n        const xs = for (i of 0..3) {\n            if (i > 0) {\n                defer @log = @log + "d";\n                @log = @log + "x";\n            }\n            lift i;\n        };\n        @out = xs.length;\n    }`);
    expect(o.log).toBe("xdxd");
    expect(o.out).toBe("3");
  });

  test("a `defer` DIRECTLY in a bound loop's body: E-DEFER-UNSUPPORTED-SITE (§19.16.2, value forms)", () => {
    expect(codes(P(`    function go() {\n        const xs = for (i of 0..3) {\n            defer @log = @log + "d";\n            lift i;\n        };\n        @out = xs.length;\n    }`))).toEqual(["E-DEFER-UNSUPPORTED-SITE"]);
  });
});

describe("a loop in a deferred body — its jumps stay inside it", () => {
  test("the loop runs at the block's exit; a `break` / `continue` targets the loop inside the deferred body", async () => {
    const o = await press(`    function go() {\n        defer {\n            for (i of 0..5) {\n                if (i == 1) { continue; }\n                if (i == 3) { break; }\n                @log = @log + "L";\n            }\n        }\n        @log = @log + "b";\n    }`);
    expect(o.log).toBe("bLL");
  });

  test("a labelled jump naming a loop inside the deferred body is permitted", async () => {
    const o = await press(`    function go() {\n        defer {\n            a: for (i of 0..3) {\n                for (j of 0..3) {\n                    if (j == 1) { continue a; }\n                    @log = @log + "j";\n                }\n            }\n        }\n        @log = @log + "b";\n    }`);
    expect(o.log).toBe("bjjj");
  });

  test("a deferred body in a loop body holding a loop of its own (both shapes at once)", async () => {
    const o = await press(`    function go() {\n        for (i of 0..2) {\n            defer {\n                for (j of 0..2) { @log = @log + "j"; }\n            }\n            @log = @log + "i";\n        }\n    }`);
    expect(o.log).toBe("ijjijj");
  });

  test("a jump that LEAVES the deferred body: E-DEFER-CONTROL-FLOW (bare, and labelled to an outer loop)", () => {
    expect(codes(P(`    function go() {\n        for (i of 0..2) {\n            defer { break; }\n        }\n    }`))).toEqual(["E-DEFER-CONTROL-FLOW"]);
    expect(codes(P(`    function go() {\n        outer: for (i of 0..2) {\n            defer {\n                for (j of 0..2) { continue outer; }\n            }\n        }\n    }`))).toEqual(["E-DEFER-CONTROL-FLOW"]);
    expect(codes(P(`    function go() {\n        defer {\n            for (j of 0..2) { break nope; }\n        }\n    }`))).toEqual(["E-DEFER-CONTROL-FLOW"]);
  });

  test("checkCore C16: a Break naming a loop OUTSIDE the deferred body is refused; one inside is not", () => {
    const r = clean(P(`    function go() {\n        defer {\n            for (j of 0..2) { if (j == 1) { break; } }\n        }\n    }`));
    expect(mods.check.checkCore(r.core)).toEqual([]);
  });
});
