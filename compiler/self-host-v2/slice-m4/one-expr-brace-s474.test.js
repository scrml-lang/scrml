// one-expr-brace-s474.test.js — s474 #1512: the one-expression brace `{ e }`
// is a value (user-voice S469 "⭐ RULED — `{ e }` in a value-position match arm
// is that expression" — "Allow { e } in arms too (Recommended)": "a brace
// holding ONE expression is that expression"; and S469 "three spec-follow-up
// opens", if-branch — "Keep { e }, lift once a statement (Rec)").
//
// SPEC §18.5 (the arm rule) and §7.2.2 rule 3 (a single-expression position,
// no `;`). Before this, the bootstrap read every arm block as a statement list
// (§7.2.2 rule 1) and refused `.B :> { 2 }` with E-STMT-MISSING-SEMICOLON.
//
//   A. value position: `{ e }` is `e` — match arms, `!{}` arms; boundaries
//      (a multi-line expression, comments, `{ e; }`).
//   B. still a statement list: a second item, a statement, a stray `;`, `lift`
//      without `;`; a statement-position `match` / `!{}` (the value is not
//      used, so §7.2.2 rule 1 applies); the lone shorthand name and the empty
//      brace keep their own readings.
//   C. value-form `if` (refused whole in the bootstrap, E-BOOTSTRAP-UNSUPPORTED):
//      a `{ e }` branch draws no E-STMT-MISSING-SEMICOLON beside the refusal.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const TYPES = `    type K:enum = { A, B, C }\n    type L:enum = { NotFound(id: string), Timeout }`;
const LOAD = `    function load(id: string)! L {\n        if (id == "x") fail L.NotFound(id);\n        if (id == "t") fail L.Timeout;\n        return id;\n    }\n    function one() -> int { return 1; }`;
const P = (decls, main = "        <p>x</p>") => `<program>\n    let <n:int=0/>\n${TYPES}\n${LOAD}\n${decls}\n    <main>\n${main}\n    </main>\n</program>\n`;
// the line up to each missing-`;` report (where the `;` goes), trimmed; every span is empty
const semis = (src) => run(src).diags.filter((d) => d.code === "E-STMT-MISSING-SEMICOLON").map((d) => {
  expect(d.span.end).toBe(d.span.start);
  return src.slice(src.lastIndexOf("\n", d.span.start - 1) + 1, d.span.start).trim();
});
const $ = (sel) => document.querySelector(sel);
let k = 0;
const load = async (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  await loadProgram(r.core, "oeb-" + k++, []);
};

// ---------------------------------------------------------------------------
describe("A — in a value position a brace holding ONE expression is that expression", () => {
  test("the review repro: `.B :> { 2 }` compiles, the same as `.B :> { 2; }` and `.B :> 2` (runtime)", async () => {
    await load(P(`    function g(k: K) -> int { const v = match k { .A :> 1, .B :> { 2 }, .C :> { 3; } }; return v; }`,
      `        <p id="v">\${g(.A)} \${g(.B)} \${g(.C)}</p>`));
    expect($("#v").textContent).toBe("1 2 3");
  });

  test("§18.5's own example shape: a computed one-expression body, a call, a `return match` (runtime)", async () => {
    await load(P(`    function area(k: K, r: int) -> int { return match k { .A :> { r * r * 3 }, .B :> { one() + r }, .C :> 0 }; }`,
      `        <p id="v">\${area(.A, 2)} \${area(.B, 2)} \${area(.C, 2)}</p>`));
    expect($("#v").textContent).toBe("12 3 0");
  });

  test("boundaries: a multi-line expression, a trailing `//` comment, `/* */` comments (runtime)", async () => {
    await load(P(`    function m(k: K) -> int {
        const v = match k {
            .A :> {
                1 +
                    2
            },
            .B :> { 4 // a trailing comment
            },
            .C :> { /* c */ 5 /* d */ },
        };
        return v;
    }`, `        <p id="v">\${m(.A)} \${m(.B)} \${m(.C)}</p>`));
    expect($("#v").textContent).toBe("3 4 5");
  });

  test("a `!{}` handler's value-position arm too (§18.5 states one arm grammar for both) (runtime)", async () => {
    await load(P(`    function g(id: string) -> string {\n        const v = load(id) !{ .NotFound(m) :> { "nf:" + m }, .Timeout :> { "t" } };\n        return v;\n    }`,
      `        <p id="v">\${g("x")} \${g("t")} \${g("ok")}</p>`));
    expect($("#v").textContent).toBe("nf:x t ok");
  });
});

// ---------------------------------------------------------------------------
describe("B — a brace that holds a statement (or a second item) is still a statement list", () => {
  const fn = (body) => `    function f(k: K) -> int {\n${body}\n    }`;
  test("a second item: the bare tail after a statement owes its `;` (then E-ARM-TAIL-VALUE)", () => {
    const src = P(fn(`        const v = match k { .A :> 1, .B :> { one(); 2 }, .C :> 3 };\n        return v;`));
    expect(semis(src)).toEqual(["const v = match k { .A :> 1, .B :> { one(); 2"]);
    expect(codes(P(fn(`        const v = match k { .A :> 1, .B :> { one(); 2; }, .C :> 3 };\n        return v;`)))).toEqual(["E-ARM-TAIL-VALUE"]);
  });
  test("a declaration is a statement, not an expression: `{ const x = 2 }` owes its `;`", () => {
    expect(semis(P(fn(`        const v = match k { .A :> 1, .B :> { const x = 2 }, .C :> 3 };\n        return v;`)))).toEqual(["const v = match k { .A :> 1, .B :> { const x = 2"]);
  });
  test("a `;` anywhere at the top level makes it a statement list: `{ ; 2 }` owes the `;` after `2`", () => {
    expect(semis(P(fn(`        const v = match k { .A :> 1, .B :> { ; 2 }, .C :> 3 };\n        return v;`)))).toEqual(["const v = match k { .A :> 1, .B :> { ; 2"]);
  });
  test("`lift <expr>` is a statement and still takes its `;`", () => {
    expect(semis(P(fn(`        const v = match k { .A :> 1, .B :> { lift 2 }, .C :> 3 };\n        return v;`)))).toEqual(["const v = match k { .A :> 1, .B :> { lift 2"]);
  });
  test("a statement-position `match`: the arm's value is not used, so `{ e }` is a statement list (§7.2.2 rule 1)", () => {
    const src = P(fn(`        match k { .A :> { one() }, .B :> { @n = 2 }, .C :> { 3 } }\n        return 0;`));
    expect(semis(src)).toEqual(["match k { .A :> { one()", "match k { .A :> { one() }, .B :> { @n = 2", "match k { .A :> { one() }, .B :> { @n = 2 }, .C :> { 3"]);
    // (one report per place: the `{ 3 }` no-effect tail is the terminator's root cause, not a second error)
    expect(codes(src)).toEqual(["E-STMT-MISSING-SEMICOLON", "E-STMT-MISSING-SEMICOLON", "E-STMT-MISSING-SEMICOLON"]);
    expect(codes(P(fn(`        match k { .A :> { one(); }, .B :> { @n = 2; }, .C :> @n = 3 }\n        return 0;`)))).toEqual([]);
  });
  test("a statement-position `!{}` handler likewise", () => {
    const src = P(`    function g(id: string) -> int {\n        load(id) !{ .NotFound(m) :> { @n = 1 }, .Timeout :> { @n = 2; } };\n        return 0;\n    }`);
    expect(semis(src)).toEqual(["load(id) !{ .NotFound(m) :> { @n = 1"]);
  });
  test("readings that come first are unchanged: a lone shorthand name, and an empty brace", () => {
    expect(codes(P(fn(`        const v = match k { .A :> 1, .B :> { x }, .C :> 3 };\n        return v;`)))).toContain("E-MATCH-ARM-SHORTHAND-AMBIGUOUS");
    expect(codes(P(fn(`        const v = match k { .A :> 1, .B :> { x }, .C :> 3 };\n        return v;`)))).not.toContain("E-STMT-MISSING-SEMICOLON");
    // `{}` holds no expression: a block arm of no statements (its refusal is the bootstrap's, unchanged)
    expect(codes(P(fn(`        const v = match k { .A :> 1, .B :> {}, .C :> 3 };\n        return v;`)))).not.toContain("E-STMT-MISSING-SEMICOLON");
  });
});

// ---------------------------------------------------------------------------
describe("C — a value-form `if` branch (the form itself is not in the bootstrap)", () => {
  test("`{ e }` branches draw only the refusal, no E-STMT-MISSING-SEMICOLON — else-if chains included", () => {
    expect(codes(P(`    function h(c: bool) -> int { const v = if (c) { 2 } else if (!c) { 3 } else { 4 }; return v; }`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("a branch holding a statement is a statement list; a statement `if` is unchanged", () => {
    expect(semis(P(`    function h(c: bool) -> int { const v = if (c) { one(); 2 } else { 3; }; return v; }`))).toEqual(["function h(c: bool) -> int { const v = if (c) { one(); 2"]);
    expect(semis(P(`    function j(c: bool) -> int { if (c) { one() } return 0; }`))).toEqual(["function j(c: bool) -> int { if (c) { one()"]);
  });
});
