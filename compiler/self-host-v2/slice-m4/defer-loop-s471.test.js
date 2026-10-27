// defer-loop-s471.test.js — s471: a `defer` in a LOOP BODY (SPEC §19.16.2),
// compiled from §66 source by the bootstrap front end and run in happy-dom.
//
// §19.16.2 "Registration. Executing a `defer` statement registers its deferred
// body against the enclosing block — the innermost statement list that contains
// the `defer`: a function body, an `if`/`else` branch, a loop body (once per
// iteration), …". §19.16.6: "A loop body is its own block, so each iteration
// has its own stack instance and its deferred statements run at that
// iteration's exit."
//
// Before s471 the bootstrap refused every `defer` in a loop body
// (E-BOOTSTRAP-UNSUPPORTED, analyze.scrml loopDefer; check.scrml C19 "a Loop's
// body holds a Defer"). Fail-closed, but the construct is ruled scrml. The
// Core loop body is its own Block, which print.scrml's blockJs wraps in its own
// `try { … } finally { rt.runDefers(defers$) }` — so `continue`, `break`,
// `return` and `fail` out of an iteration all run that iteration's deferred
// bodies, last registered first.
//
// Still refused (by name): a `defer` DIRECTLY in the body of a loop bound as a
// value — §19.16.2 E-DEFER-UNSUPPORTED-SITE ("a `defer` written directly in an
// arm of a `match` / `if` / `for` that is used for its VALUE") — and a loop
// INSIDE a deferred body (E-BOOTSTRAP-UNSUPPORTED, unchanged).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const $ = (sel) => document.querySelector(sel);
const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);

// A program with a string log, an int cell, the given functions and one button per name.
const P = (fns, buttons) =>
  `<program>\n    let <log:string=""/>\n    let <n:int=0/>\n${fns}\n    <main>\n${buttons
    .map((b) => `        <button onclick=${b}()>${b}</button>`)
    .join("\n")}\n        <p id="log">\${@log}</p>\n        <p id="n">\${@n}</p>\n    </main>\n</program>\n`;

let k = 0;
async function runProgram(fns, buttons, press) {
  const r = clean(P(fns, buttons));
  await loadProgram(r.core, "defer-loop-" + k++);
  for (const b of press) click(btn(b));
  return { log: $("#log").textContent, n: $("#n").textContent };
}

const XS = `["a", "b", "c", "d", "e"]`;

describe("§19.16.2 — a defer in a loop body runs at each ITERATION's exit (executed)", () => {
  test("fall-through: every iteration runs its own deferred bodies, LIFO, before the next iteration", async () => {
    const o = await runProgram(
      `    function go() {\n        for (s of ["a", "b"]) {\n            defer @log = @log + "d" + s + ";";\n            defer @log = @log + "e" + s + ";";\n            @log = @log + "b" + s + ";";\n        }\n        @log = @log + "end;";\n    }`,
      ["go"], ["go"]);
    expect(o.log).toBe("ba;ea;da;bb;eb;db;end;");
  });

  test("`continue` and `break` out of an iteration run that iteration's deferred bodies", async () => {
    const o = await runProgram(
      `    function go() {\n        for (s of ${XS}) {\n            defer @log = @log + "d" + s + ";";\n            if (s == "b") continue;\n            if (s == "d") break;\n            @log = @log + "b" + s + ";";\n        }\n        @log = @log + "end;";\n    }`,
      ["go"], ["go"]);
    expect(o.log).toBe("ba;da;db;bc;dc;dd;end;");
  });

  test("`return` from inside the loop: the value is computed first, the iteration's then the function's deferred bodies run", async () => {
    const o = await runProgram(
      `    function f() -> int {\n        defer @log = @log + "fn;";\n        for (s of ${XS}) {\n            defer @log = @log + "d" + s + ";";\n            if (s == "b") return @n;\n        }\n        return 9;\n    }\n    function go() {\n        @n = 4;\n        @n = f() + 1;\n    }`,
      ["go"], ["go"]);
    expect(o.log).toBe("da;db;fn;");
    expect(o.n).toBe("5");
  });

  test("`fail` from inside the loop runs the iteration's deferred body before the caller's handler", async () => {
    const o = await runProgram(
      `    type E:enum = { Stop }\n    function f()! E {\n        for (s of ${XS}) {\n            defer @log = @log + "d" + s + ";";\n            if (s == "c") fail E.Stop;\n        }\n        return 1;\n    }\n    function go() {\n        f() !{ _ :> @log = @log + "caught;" };\n    }`,
      ["go"], ["go"]);
    expect(o.log).toBe("da;db;dc;caught;");
  });

  test("a range head and a counted head: each iteration's binding is the one the deferred body sees", async () => {
    const o = await runProgram(
      `    function go() {\n        for (i of 0..3) {\n            defer @n = @n * 10 + i;\n        }\n        for (let j = 1; j < 3; j = j + 1) {\n            defer @n = @n * 10 + j;\n        }\n    }`,
      ["go"], ["go"]);
    expect(o.n).toBe("1212");
  });

  test("nested loops: the inner body's stack runs at the inner iteration's exit, before the outer's", async () => {
    const o = await runProgram(
      `    function go() {\n        for (s of ["a", "b"]) {\n            defer @log = @log + "O" + s + ";";\n            for (t of ["x", "y"]) {\n                defer @log = @log + "i" + s + t + ";";\n            }\n        }\n    }`,
      ["go"], ["go"]);
    expect(o.log).toBe("iax;iay;Oa;ibx;iby;Ob;");
  });

  test("not reached, not registered: an iteration that leaves before the defer registers nothing", async () => {
    const o = await runProgram(
      `    function go() {\n        for (s of ["a", "b", "c"]) {\n            if (s == "b") continue;\n            defer @log = @log + "d" + s + ";";\n        }\n    }`,
      ["go"], ["go"]);
    expect(o.log).toBe("da;dc;");
  });

  test("a defer in an `if` branch nested in a loop bound as a value is that branch's (it runs)", async () => {
    const o = await runProgram(
      `    function go() {\n        const ys: string[] = for (s of ["a", "b"]) {\n            if (s == "b") {\n                defer @log = @log + "d;";\n                @log = @log + "i;";\n            }\n            lift s;\n        };\n        @log = @log + ys.join(",");\n    }`,
      ["go"], ["go"]);
    expect(o.log).toBe("i;d;a,b");
  });

  test("§19.16.3 rule 1: a loop INSIDE the deferred body, with `break` / `continue` targeting it, is permitted and runs at exit", async () => {
    const o = await runProgram(
      `    function go() {\n        defer {\n            rows: for (s of ${XS}) {\n                if (s == "b") continue;\n                for (t of ["x", "y"]) {\n                    if (t == "y") break;\n                    if (s == "d") break rows;\n                    @log = @log + s + t + ";";\n                }\n            }\n            @log = @log + "done;";\n        }\n        @log = @log + "body;";\n    }`,
      ["go"], ["go"]);
    expect(o.log).toBe("body;ax;cx;done;");
  });

  test("the printed shape: the loop body is wrapped whole in its own try/finally", () => {
    const r = clean(P(`    function go() {\n        for (s of ["a"]) {\n            defer @n = 1;\n            @log = s;\n        }\n    }`, ["go"]));
    const js = mods.print.printProgram(r.core, "t.client.js", "scrml-runtime.js").js;
    expect(js).toMatch(/for \(const s of \[[^\]]*\]\) \{\s*const defers\$ = \[\];\s*try \{/);
    expect(js).toContain("rt.runDefers(defers$);");
  });
});

describe("what stays refused — by name, never mis-lowered", () => {
  test("E-DEFER-UNSUPPORTED-SITE — a defer DIRECTLY in the body of a loop bound as a value (§19.16.2)", () => {
    const c = codes(P(`    function go() {\n        const ys: string[] = for (s of ["a"]) {\n            defer @n = 1;\n            lift s;\n        };\n        @log = ys.join(",");\n    }`, ["go"]));
    expect(c).toEqual(["E-DEFER-UNSUPPORTED-SITE"]);
  });
  test("a loop BOUND AS A VALUE inside a deferred body stays E-BOOTSTRAP-UNSUPPORTED (Core has no Gather in a Defer body)", () => {
    const c = codes(P(`    function go() {\n        defer {\n            const ys: string[] = for (s of ["a"]) { lift s; };\n            @log = ys.join(",");\n        }\n    }`, ["go"]));
    expect(c).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a `break` / `continue` in the deferred body naming a loop OUTSIDE it is E-DEFER-CONTROL-FLOW (labelled too)", () => {
    expect(codes(P(`    function go() {\n        for (s of ["a"]) {\n            defer {\n                for (t of ["x"]) { @log = t; }\n                break;\n            }\n        }\n    }`, ["go"]))).toEqual(["E-DEFER-CONTROL-FLOW"]);
    expect(codes(P(`    function go() {\n        outer: for (s of ["a"]) {\n            defer {\n                for (t of ["x"]) { continue outer; }\n            }\n        }\n    }`, ["go"]))).toEqual(["E-DEFER-CONTROL-FLOW"]);
  });
  test("the deferred-body rules reach a loop body: `return` / `break` inside the deferred body are E-DEFER-CONTROL-FLOW", () => {
    expect(codes(P(`    function go() {\n        for (s of ["a"]) {\n            defer { return; }\n        }\n    }`, ["go"]))).toContain("E-DEFER-CONTROL-FLOW");
    expect(codes(P(`    function go() {\n        for (s of ["a"]) {\n            defer { break; }\n        }\n    }`, ["go"]))).toContain("E-DEFER-CONTROL-FLOW");
  });
  test("E-DEFER-LATER-SHADOW reaches a loop body", () => {
    expect(codes(P(`    function go() {\n        for (s of ["a"]) {\n            defer @log = v;\n            const v = "x";\n        }\n    }`, ["go"]))).toContain("E-DEFER-LATER-SHADOW");
  });
  test("a markup loop body is no function body: E-DEFER-OUTSIDE-FUNCTION", () => {
    const src = `<program>\n    let <log:string=""/>\n    <main>\n        \${ for (s of ["a"]) { defer @log = s; lift s; } }\n    </main>\n</program>\n`;
    expect(codes(src)).toContain("E-DEFER-OUTSIDE-FUNCTION");
  });
});

// s471 review (S239) — each of these reached checkCore as E-BOOTSTRAP-CORE-ILL-FORMED
// ("compiler defect") instead of being refused by name in analysis.
describe("s471 review — refused by name in analysis, never a Core defect", () => {
  test("F2 — a `lift` inside a deferred body is E-DEFER-CONTROL-FLOW naming `lift` (RULED user-voice S471: §19.16.3 rule 1 gains `lift`)", () => {
    const r = run(P(`    function go() {\n        const ys: string[] = for (s of ["a", "b"]) {\n            if (s == "a") { defer { lift s; } }\n            lift s;\n        };\n        @log = ys.join(",");\n    }`, ["go"]));
    expect(r.diags.map((d) => d.code)).toEqual(["E-DEFER-CONTROL-FLOW"]);
    expect(r.diags[0].message).toContain("cannot contain a `lift`");
    expect(r.core).toBeFalsy();
    // the same through a loop inside the deferred body
    expect(codes(P(`    function go() {\n        const ys: string[] = for (s of ["a", "b"]) {\n            if (s == "a") { defer { for (t of ["x"]) { lift t; } } }\n            lift s;\n        };\n        @log = ys.join(",");\n    }`, ["go"]))).toContain("E-DEFER-CONTROL-FLOW");
  });
  test("F1 — a server call in a loop or an `if` inside a deferred body is refused by the suspension plan (named), not C-E2 / C-S3", () => {
    const SRV = `    server function save(s: string) -> string { return s; }\n`;
    for (const body of [
      `        defer {\n            for (s of ["a", "b"]) { save(s) !{ _ :> @log = @log + "err;" }; }\n        }`,
      `        defer { if (@log == "") { save("a") !{ _ :> @log = @log + "err;" }; } }`,
    ]) {
      const r = run(P(`${SRV}    function go() {\n${body}\n        @log = @log + "body;";\n    }`, ["go"]));
      expect(r.diags.map((d) => d.code)).toContain("E-BOOTSTRAP-UNSUPPORTED");
      expect(r.diags.map((d) => d.message).join("\n")).toContain("a `defer` body");
      expect(r.core).toBeFalsy();
    }
  });
  test("F3 — a loop HEAD inside a deferred body obeys the deferred-body rules (`?` in the head is E-DEFER-CONTROL-FLOW)", () => {
    const src = P(`    type E:enum = { Bad }\n    function names()! E -> string[] {\n        return ["a"];\n    }\n    function go()! E {\n        defer {\n            for (s of names()?) { @log = s; }\n        }\n        @n = 1;\n    }`, []);
    expect(codes(src)).toContain("E-DEFER-CONTROL-FLOW");
  });
});
