// value-form-s469.test.js — s469-boot-loop-value-form: SPEC §49.6 "the value form —
// a loop bound as a value" and §17.4 "the Tier-0 `${ for … lift }`" in the bootstrap
// (gap g-bootstrap-loop-value-form-s469):
//
//   1. `const xs = for (…) { … lift e; … };` from EVERY head (rule 1): a fresh tape
//      with no grants (rule 2), in lift order (3), `[]` when nothing is lifted at run
//      time (4), `break` keeps the prefix and `continue` keeps what was lifted (5);
//      the bound loop is a break boundary (6, E-LOOP-005); a `lift` goes to the
//      NEAREST bound loop — through `if`s and statement loops; a nested binding
//      captures its own (7); a bound loop that lifts nothing is E-LOOP-007 (§49.4.4);
//   2. the Tier-0 `${ for … }` in markup: its lifts are the rendered rows (markup or
//      text), re-rendered when a cell the loop reads changes; a render position
//      (§6.15: no writes);
//   3. the refusals (fail closed, by name) where the SPEC is silent or the bootstrap
//      has no machinery;
//   4. Core: Stmt.Gather / Stmt.Lift / View.Gather, and check.scrml C20.
//
// Graded on diagnostic codes, the Core shape, checkCore, and the RUNTIME effect.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => [...new Set(run(src).diags.map((d) => d.code))].sort();
const diag = (src, code) => run(src).diags.find((d) => d.code === code);
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const $ = (sel) => document.querySelector(sel);
const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);
let k = 0;
const load = (src) => loadProgram(clean(src).core, "s469vf-" + k++, []);
const js = (src) => mods.print.printProgram(clean(src).core, "t.client.js", "scrml-runtime.js").js;

const prog = (decls, body) => `<program>\n${decls}\n    <main>\n${body}\n    </main>\n</program>\n`;
// one function `f(ys)` over the tape `@zs`, shown in `#o`
const ZS = `    <zs:int[]=([3, 4, 5])/>\n    <ws:string[]=(["a", "b"])/>`;
const fnProg = (b, ret = "int", sig = "ys: int[]", call = "f(@zs)") => prog(`${ZS}\n    function f(${sig}) -> ${ret} {\n${b}\n    }`, `        <p id="o">\${${call}}</p>`);
const fnCodes = (b, ret = "int", sig = "ys: int[]") => codes(fnProg(b, ret, sig));
const shows = async (b, want, ret = "int", sig = "ys: int[]", call = "f(@zs)") => {
  await load(fnProg(b, ret, sig, call));
  expect($("#o").textContent).toBe(want);
};

// ---------------------------------------------------------------------------
describe("rule 1 — every head binds as a value (runtime)", () => {
  test("an iterate head over a tape", async () => {
    await shows(`        const xs = for (y of ys) { lift y * 10; };\n        return xs[0] + xs[1] + xs[2] + xs.length;`, "123");
  });
  test("a range head, half-open and inclusive", async () => {
    await shows(`        const a = for (i of 0..4) { lift i * i; };\n        const b = for (i of 1..=3) { lift i; };\n        return a[3] * 100 + a.length * 10 + b.length;`, "943");
  });
  test("a condition head", async () => {
    await shows(`        let c = 0;\n        const xs = for (c < 4) { c = c + 1; lift c; };\n        return xs.length * 10 + xs[3];`, "44");
  });
  test("a counted head", async () => {
    await shows(`        const xs = for (let i = 0; i < 5; i = i + 2) { lift i; };\n        return xs.length * 10 + xs[2];`, "34");
  });
  test("the infinite head, ended by `break`", async () => {
    await shows(`        let n = 0;\n        const xs = for { n = n + 1; if (n > 3) { break; } lift n; };\n        return xs.length;`, "3");
    await shows(`        let n = 0;\n        const xs = for (;;) { n = n + 1; if (n > 2) { break; } lift n; };\n        return xs.length;`, "2");
  });
  test("a string tape: the element type is the lifted value's (`.join` reads it)", async () => {
    await shows(`        const xs = for (w of ys) { lift w + "!"; };\n        return xs.join(",");`, "a!,b!", "string", "ys: string[]", "f(@ws)");
  });
  test("rule 2: the tape carries no grant — a `let` binder is rebindable only when its written type grants `replace`; a written type is the binder's", async () => {
    expect(fnCodes(`        let xs = for (y of ys) { lift y; };\n        const big = for (y of ys) { if (y > 3) { lift y; } };\n        xs = big;\n        return xs.length;`)).toEqual(["E-WRITE-NOT-GRANTED"]);
    await shows(`        let xs: int[replace] = for (y of ys) { lift y; };\n        const big = for (y of ys) { if (y > 3) { lift y; } };\n        xs = big;\n        return xs.length;`, "2");
    await shows(`        const xs: int[] = for (y of ys) { lift y + 1; };\n        return xs[0];`, "4");
  });
  test("a bound loop in a handler block", async () => {
    await load(prog(`${ZS}\n    let <n:int=0/>`, `        <button onclick={ const xs = for (y of @zs) { if (y != 4) { lift y; } }; @n = xs.length; }>go</button>\n        <p id="n">\${@n}</p>`));
    click(btn("go"));
    expect($("#n").textContent).toBe("2");
  });
});

// ---------------------------------------------------------------------------
describe("rules 2-7 — the tape, order, prefix, nesting", () => {
  test("rule 4: zero lifts at run time give `[]`", async () => {
    await shows(`        const a = for (i of 0..0) { lift i; };\n        const b = for (y of ys) { if (y > 100) { lift y; } };\n        return a.length * 10 + b.length;`, "0");
  });
  test("rule 3: elements in the order their lifts ran (two lifts an iteration)", async () => {
    await shows(`        const xs = for (i of 0..3) { lift i; lift i * 10; };\n        return xs[2] * 100 + xs[3] * 10 + xs.length;`, "206");
  });
  test("rule 5: `break` keeps the prefix; `continue` keeps what the iteration already lifted", async () => {
    await shows(`        const xs = for (y of ys) { if (y == 5) { break; } lift y; };\n        return xs.length * 10 + xs[1];`, "24");
    await shows(`        const xs = for (y of ys) { lift y; if (y == 4) { continue; } lift 0; };\n        return xs.length;`, "5");
  });
  test("rule 6: a `break` / `continue` naming the bound loop itself, or a loop inside it, is fine", async () => {
    await shows(`        const xs = outer: for (y of ys) { for (i of 0..9) { if (i == 1) { continue outer; } lift y; } };\n        return xs.length;`, "3");
    await shows(`        const xs = outer: for (y of ys) { inner: for (i of 0..9) { if (i == 2) { break inner; } lift i; } };\n        return xs.length;`, "6");
  });
  test("rule 7: a `lift` reaches the NEAREST bound loop through `if`s and statement loops; a nested binding captures its own", async () => {
    await shows(`        const xs = for (y of ys) {\n            const inner = for (i of 0..y) { lift i; };\n            for (j of 0..2) { if (j == 1) { lift inner.length; } }\n        };\n        return xs[0] * 100 + xs[1] * 10 + xs.length;`, "343");
  });
  test("rule 6: `return` leaves the function from inside a bound loop", async () => {
    await shows(`        const xs = for (y of ys) { if (y == 4) { return 99; } lift y; };\n        return xs.length;`, "99");
  });
  test("the binder is in scope AFTER the loop, not in its own body (E-SCOPE-001)", () => {
    expect(fnCodes(`        const xs = for (y of ys) { lift xs.length; };\n        return 1;`)).toContain("E-SCOPE-001");
  });
  test("rule 2: the tape has no grants — an edit of it is refused as for any grantless tape", () => {
    const c = fnCodes(`        const xs = for (y of ys) { lift y; };\n        xs.append(1);\n        return 1;`);
    expect(c.length).toBeGreaterThan(0);
    expect(c).not.toContain("E-INTERNAL-RECOVERED-UNREPORTED");
  });
});

// ---------------------------------------------------------------------------
describe("the refusals with §34 codes — E-LOOP-005, E-LOOP-007", () => {
  test("E-LOOP-005: `break outer` / `continue outer` from inside a bound loop (§49.6 rule 6)", () => {
    expect(fnCodes(`        let t = 0;\n        outer: for (r of ys) {\n            const cells = for (c of ys) { if (c == 4) { break outer; } lift c; };\n            t = t + cells.length;\n        }\n        return t;`)).toEqual(["E-LOOP-005"]);
    expect(fnCodes(`        let t = 0;\n        outer: for (r of ys) {\n            const cells = for (c of ys) { if (c == 4) { continue outer; } lift c; };\n            t = t + cells.length;\n        }\n        return t;`)).toEqual(["E-LOOP-005"]);
    // through a statement loop inside the bound loop too
    expect(fnCodes(`        let t = 0;\n        outer: for (r of ys) {\n            const cells = for (c of ys) { for (i of 0..2) { if (i == 1) { break outer; } } lift c; };\n            t = t + cells.length;\n        }\n        return t;`)).toEqual(["E-LOOP-005"]);
  });
  test("E-LOOP-005's message names the boundary", () => {
    const d = diag(fnProg(`        let t = 0;\n        outer: for (r of ys) {\n            const cells = for (c of ys) { if (c == 4) { break outer; } lift c; };\n            t = t + cells.length;\n        }\n        return t;`), "E-LOOP-005");
    expect(d.message).toContain("bound loop");
  });
  test("E-LOOP-007: a bound loop that lifts nothing (§49.4.4) — every head", () => {
    expect(fnCodes(`        let t = 0;\n        const xs = for (y of ys) { t = t + y; };\n        return t;`)).toEqual(["E-LOOP-007"]);
    expect(fnCodes(`        let n = 0;\n        const xs = for { n = n + 1; if (n > 2) { break; } };\n        return n;`)).toEqual(["E-LOOP-007"]);
    expect(diag(fnProg(`        let t = 0;\n        const xs = for (y of ys) { t = t + y; };\n        return t;`), "E-LOOP-007").message).toContain("`xs`");
  });
  test("E-LOOP-007: a `lift` no path reaches (after a `break` / `continue` / `return` in its block) does not count (§49.4.4 \"reachable on some path\")", () => {
    expect(fnCodes(`        const xs = for (y of ys) { break; lift y; };\n        return 1;`)).toEqual(["E-LOOP-007"]);
    expect(fnCodes(`        const xs = for (y of ys) { if (y > 0) { continue; } else { break; } lift y; };\n        return 1;`)).toEqual(["E-LOOP-007"]);
    // reachable: the `break` is only on one path
    expect(fnCodes(`        const xs = for (y of ys) { if (y > 4) { break; } lift y; };\n        return xs.length;`)).toEqual([]);
  });
  test("E-LOOP-007: lifts that belong to a NESTED bound loop do not count for the outer one", () => {
    expect(fnCodes(`        const xs = for (y of ys) { const inner = for (i of 0..y) { lift i; }; };\n        return 1;`)).toEqual(["E-LOOP-007"]);
  });
});

// ---------------------------------------------------------------------------
describe("refused by name (E-BOOTSTRAP-UNSUPPORTED) — not in the SPEC's words or not in the bootstrap", () => {
  test("a `lift` outside any bound loop: in a bare `function` it is E-SYNTAX-002 (§10.4, §49.6.2)", () => {
    expect(fnCodes(`        lift 3;\n        return 1;`)).toEqual(["E-SYNTAX-002"]);
    expect(fnCodes(`        for (y of ys) { lift y; }\n        return 1;`)).toEqual(["E-SYNTAX-002"]);
    expect(diag(fnProg(`        for (y of ys) { lift y; }\n        return 1;`), "E-SYNTAX-002").message).toContain("bare `function`");
  });
  test("a `lift` outside any bound loop in a `fn` (its `~`, §48.5, is not built) or a handler block: refused by name", () => {
    expect(codes(prog(ZS + `\n    fn g(ys: int[]) -> int {\n        for (y of ys) { lift y; }\n        return 1;\n    }`, `        <p>\${g(@zs)}</p>`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(prog(ZS, `        <button onclick={ for (y of @zs) { lift y; } }>b</button>`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("a `lift` inside an arm block of a bound loop's body (§49.6 rule 7 vs §18.5 — an open reading)", () => {
    const T = `    type E:enum = { A, B }`;
    const src = prog(`${ZS}\n${T}\n    function f(ys: int[], e: E) -> int {\n        const xs = for (y of ys) {\n            match e {\n                .A :> { lift y; lift 0; },\n                .B :> { }\n            }\n        };\n        return xs.length;\n    }`, `        <p>\${f(@zs, E.A)}</p>`);
    expect(codes(src)).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("lifted MARKUP in a statement-bound loop (markup is not a value in the bootstrap's logic)", () => {
    // (a function body is lexed as logic, so the element's text cascades — the refusal is the first report)
    const r = run(fnProg(`        const xs = for (y of ys) { lift <li>x</li>; };\n        return 1;`));
    expect(r.diags[0].code).toBe("E-BOOTSTRAP-UNSUPPORTED");
    expect(r.diags[0].message).toContain("Tier-0");
    expect(r.core).toBeFalsy();
  });
  test("values of different types lifted (a union tape, §49.6 rule 2)", () => {
    expect(fnCodes(`        const xs = for (y of ys) { if (y == 3) { lift "a"; } lift y; };\n        return 1;`)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("a written type that is not a tape, or whose element the lifts do not fit", () => {
    expect(fnCodes(`        const xs: int = for (y of ys) { lift y; };\n        return 1;`).length).toBeGreaterThan(0);
    expect(fnCodes(`        const xs: string[] = for (y of ys) { lift y; };\n        return 1;`).length).toBeGreaterThan(0);
  });
  test("a `for` in an operand / argument / `return` position (§49.4.4: a syntax error the SPEC names no code for)", () => {
    expect(fnCodes(`        return 1 + for (y of ys) { lift y; };`)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(fnCodes(`        return for (y of ys) { lift y; };`, "int[]")).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("`for … else` on a bound loop (§17.4a) stays refused", () => {
    expect(fnCodes(`        const xs = for (y of ys) { lift y; } else { lift 0; };\n        return 1;`)).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a bound loop cannot wait (a server call in its body) — as a statement loop cannot", () => {
    const S = `    function g(id: string) -> string {\n        const r: string = ?{\`SELECT name FROM t WHERE id = \${id}\`}.get() !{ _ :> { return ""; } };\n        return r;\n    }`;
    const src = prog(`    <program db="sqlite::memory:">\n${S}\n    function f() -> int {\n        const xs = for (x of ["a"]) { lift g(x); };\n        return xs.length;\n    }`, `        <p>x</p>`);
    expect(codes(src)).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
});

// ---------------------------------------------------------------------------
describe("the Tier-0 `${ for … lift }` in markup (§17.4, §49.6.2)", () => {
  const T0 = (body, decls = "") => prog(`    <xs:int[]=([1, 2, 3])/>\n    let <n:int=0/>\n    function bump() { @n = @n + 1; }${decls}`, `${body}\n        <button onclick=bump()>bump</button>`);
  test("lifted markup rows render in order; a row reads the loop's locals", async () => {
    await load(T0(`        <ul id="u">\${ for (x of @xs) { if (x != 2) { lift <li class="r">\${x * 10}</li>; } } }</ul>`));
    expect([...document.querySelectorAll("#u li.r")].map((e) => e.textContent)).toEqual(["10", "30"]);
  });
  test("lifted VALUES render as text, every head (a range, a counted head, the infinite head)", async () => {
    await load(T0(`        <p id="a">\${ for (i of 0..3) { lift i; } }</p>\n        <p id="b">\${ for (let i = 0; i < 3; i = i + 1) { lift i * 2; } }</p>\n        <p id="c">\${ for { lift 7; break; } }</p>`));
    expect([$("#a").textContent, $("#b").textContent, $("#c").textContent]).toEqual(["012", "024", "7"]);
  });
  test("re-rendered when a cell the loop reads changes (the loop) — and a row's own read (the row)", async () => {
    await load(T0(`        <ul id="u">\${ for (i of 0..@n) { lift <li>\${i + @n * 10}</li>; } }</ul>`));
    expect($("#u").children.length).toBe(0);
    click(btn("bump"));
    expect([...$("#u").children].map((e) => e.textContent)).toEqual(["10"]);
    click(btn("bump"));
    expect([...$("#u").children].map((e) => e.textContent)).toEqual(["20", "21"]);
  });
  test("a row snapshots the loop's locals WHEN it was lifted (a later rebinding does not reach it)", async () => {
    await load(T0(`        <ul id="u">\${ for (x of @xs) { let v = x; lift <li>\${v}</li>; v = 0; } }</ul>`));
    expect([...$("#u").children].map((e) => e.textContent)).toEqual(["1", "2", "3"]);
  });
  test("`break` keeps the rows lifted before it; a labelled loop; a nested row loop", async () => {
    await load(T0(`        <ol id="o">\${ for (x of @xs) { if (x == 3) { break; } lift <li>\${x}</li>; } }</ol>\n        <div id="d">\${ rows: for (x of @xs) { lift <p>\${ for (i of 0..x) { lift i; } }</p>; } }</div>`));
    expect([...$("#o").children].map((e) => e.textContent)).toEqual(["1", "2"]);
    expect([...$("#d").children].map((e) => e.textContent)).toEqual(["0", "01", "012"]);
  });
  test("a row's handler is an action position (it may write)", async () => {
    await load(T0(`        <div id="d">\${ for (x of @xs) { lift <button onclick={ @n = x; }>b\${x}</button>; } }</div>\n        <p id="n">\${@n}</p>`));
    click(btn("b3"));
    expect($("#n").textContent).toBe("3");
  });
  test("printed: `rt.gather(…)` over row thunks that snapshot their locals", () => {
    const out = js(T0(`        <ul id="u">\${ for (x of @xs) { lift <li>\${x}</li>; } }</ul>`));
    expect(out).toContain("rt.gather(");
    expect(out).toMatch(/\.push\(\(\(?x\w*\)? => \(scope\$, anchor\$\) =>/);
  });
  test("E-LOOP-007: a Tier-0 loop that lifts nothing", () => {
    expect(codes(T0(`        <p>\${ for (x of @xs) { let y = x; } }</p>`))).toEqual(["E-LOOP-007"]);
  });
  test("§6.15: the loop is a render position — a write in it is E-VALUE-WRITES-STATE (directly, or through a call)", () => {
    expect(codes(T0(`        <p>\${ for (x of @xs) { @n = x; lift x; } }</p>`))).toContain("E-VALUE-WRITES-STATE");
    expect(codes(T0(`        <p>\${ for (x of @xs) { bump(); lift x; } }</p>`))).toContain("E-VALUE-WRITES-STATE");
    expect(codes(T0(`        <p>\${ for (x of @xs) { lift x + bumped(); } }</p>`, `\n    function bumped() -> int { @n = 1; return 1; }`))).toContain("E-VALUE-WRITES-STATE");
  });
  test("a handled failable call in a Tier-0 loop body (an Attempt in a render position) compiles and runs", async () => {
    const decls = `\n    type E:enum = { Bad }\n    function half(x: int)! E {\n        if (x == 2) fail E.Bad;\n        return x * 10;\n    }`;
    await load(T0(`        <p id="h">\${ for (x of @xs) { const v: int = half(x) !{ _ :> { lift 0; } }; lift v; } }</p>`, decls));
    expect($("#h").textContent).toBe("10030");
  });
  test("a `return` / `fail` in a Tier-0 loop has no function to leave (refused by name)", () => {
    expect(codes(T0(`        <p>\${ for (x of @xs) { if (x == 2) { return; } lift x; } }</p>`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("the loop is the SOLE content of the `${ }` (§49.4.4) — anything after it is refused", () => {
    expect(codes(T0(`        <p>\${ for (x of @xs) { lift x; }; 1 }</p>`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("an unlabelled `break` in a Tier-0 loop leaves it; a label that names nothing is E-LOOP-003", () => {
    expect(codes(T0(`        <p>\${ for (x of @xs) { if (x == 2) { break nope; } lift x; } }</p>`))).toEqual(["E-LOOP-003"]);
  });
  test("markup text inside a lifted row is markup, not tokens (an apostrophe, a `{`, an `if`)", async () => {
    await load(T0(`        <ul id="u">\${ for (x of @xs) { lift <li>it's x { if \${x}</li>; } }</ul>`));
    expect($("#u").children[0].textContent).toBe("it's x { if 1");
  });
});

// ---------------------------------------------------------------------------
describe("Core — Stmt.Gather / Stmt.Lift / View.Gather, and C20", () => {
  const body = `        const xs = for (y of ys) { if (y == 5) { break; } lift y; };\n        return xs.length;`;
  const fOf = (r) => r.core.fns.find((x) => x.sym.hint === "f");
  test("a bound loop is ONE Core Gather; its lifts name its bind", () => {
    const r = clean(fnProg(body));
    const g = fOf(r).body.stmts.find((s) => s.variant === "Gather");
    expect(g).toBeTruthy();
    const json = JSON.stringify(g);
    expect(json).toContain('"Lift"');
    expect(json).toContain('"LValue"');
    expect(json).toContain(`"id":${g.data.g.bind.id}`);
  });
  test("C20: a Gather with no Lift into it (E-LOOP-007 re-checked over Core)", () => {
    const r = clean(fnProg(body));
    const g = fOf(r).body.stmts.find((s) => s.variant === "Gather");
    g.data.g.body.stmts = g.data.g.body.stmts.filter((s) => s.variant !== "Lift");
    expect(mods.check.checkCore(r.core).join("\n")).toContain("C20");
  });
  test("C20: a Lift outside any Gather; a Lift into a Gather that is not the nearest", () => {
    const r = clean(fnProg(body));
    const f = fOf(r);
    const g = f.body.stmts.find((s) => s.variant === "Gather");
    const lift = JSON.parse(JSON.stringify(g.data.g.body.stmts.find((s) => s.variant === "Lift")));
    f.body.stmts.splice(0, 0, lift);
    expect(mods.check.checkCore(r.core).join("\n")).toContain("C20: a Lift");
    const r2 = clean(fnProg(`        const xs = for (y of ys) { const inner = for (i of 0..y) { lift i; }; lift inner.length; };\n        return xs.length;`));
    const outer = fOf(r2).body.stmts.find((s) => s.variant === "Gather");
    const inner = outer.data.g.body.stmts.find((s) => s.variant === "Gather");
    inner.data.g.body.stmts.find((s) => s.variant === "Lift").data.into = outer.data.g.bind;
    expect(mods.check.checkCore(r2.core).join("\n")).toContain("nearest");
  });
  test("C19/C20: a Break inside a Gather naming a loop outside it (E-LOOP-005 re-checked)", () => {
    const r = clean(fnProg(`        let t = 0;\n        outer: for (r of ys) {\n            const cells = for (c of ys) { if (c == 4) { break; } lift c; };\n            t = t + cells.length;\n        }\n        return t;`));
    const f = fOf(r);
    const loop = f.body.stmts.find((s) => s.variant === "Loop");
    const g = loop.data.body.stmts.find((s) => s.variant === "Gather");
    const brk = g.data.g.body.stmts.find((s) => s.variant === "If").data.thenB.stmts[0];
    brk.data.target = loop.data.label;
    expect(mods.check.checkCore(r.core).join("\n")).toContain("bound loop");
  });
  test("C20: a row Lift in a Stmt.Gather; a View.Gather's loop that writes or returns", () => {
    const r = clean(fnProg(body));
    const g = fOf(r).body.stmts.find((s) => s.variant === "Gather");
    g.data.g.body.stmts.find((s) => s.variant === "Lift").data.what = { variant: "LRow", data: { idx: 0 } };
    expect(mods.check.checkCore(r.core).join("\n")).toContain("row Lift");
  });
  test("the Tier-0 form is ONE View.Gather with its rows", () => {
    const r = clean(prog(`    <xs:int[]=([1, 2])/>`, `        <ul>\${ for (x of @xs) { lift <li>\${x}</li>; } }</ul>`));
    const json = JSON.stringify(r.core);
    expect(json).toContain('"Gather"');
    expect(json).toContain('"LRow"');
    expect(json).toContain('"rows"');
  });
});
