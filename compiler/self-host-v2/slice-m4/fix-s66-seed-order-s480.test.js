// fix-s66-seed-order-s480.test.js — PR #2025 r1, review F1 (HIGH): `scrml fix` (fixS66) must not move a
// §66 cell declaration out of a `${ … }` block past a statement that writes what its initializer reads.
//
// Why: a §66 cell's initializer is seeded when the program record is CONSTRUCTED (slice-m1/runtime
// `rt.seeded` / `construct`), before `render_program` runs the body's statements; impl#1 runs a `${ … }`
// block top to bottom. On 5592223b3 the unwrap split (and the full unwrap) moved the declaration out, the
// bootstrap compiled the result CLEAN, and it rendered a different value than impl#1 renders for the
// original program — a silent miscompile ("6 0" where impl#1 renders "6 12").
//
// The contract pinned here, per program: the migrated program either renders on the bootstrap exactly
// what impl#1 renders for the original, or it is NOT compiled clean and fixS66 says why (a fix NOTE on
// the block). The expected texts are impl#1's renders of the ORIGINAL sources (conformance/adapters/
// impl1-ts.ts run, recorded in the r1 report).

//
// r3 (PR #2025 r2 re-review F2): every runtime case here runs on the SHIPPING path — the bootstrap CLI
// artifact (scripts/scrml-boot.ts `compileSource` → print.scrml's client module, executed by the
// conformance runner's `runBootstrapArtifact`). Up to r2 they ran on slice-m4/harness.js `frontEnd` +
// slice-m1/load-program.js, which seeds a program's file-scope bindings differently from the artifact
// (the artifact evaluates EVERY file-scope `let` / `const` at module initialization, before
// `rt.construct`), so a miscompile on the CLI path (r01 / r03 / r05 below) rendered correctly there.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixS66, S66_RULES } from "../../src/commands/fix-s66.js";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s480-seed-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

const F = "/virtual/app.scrml";
// r2: the guard fails closed — the note names the first unit before the declaration that is not
// provably free of writes and calls (r1's note named a read / write pair).
const SEED_NOTE = /is not provably free of writes and calls/;
let k = 0;

/** fixS66 (every rule), then the bootstrap CLI artifact on the result: { blockers, clean, text }. */
async function migrateAndRun(src) {
  const fx = fixS66(src, { filePath: F, entry: true, rules: S66_RULES, allowNonCompiling: true });
  const blockers = fx.blockers.map((b) => `${b.rule}@${b.line}: ${b.reason}`);
  const file = join(dir, `app${k++}.scrml`);
  writeFileSync(file, fx.output);
  const res = await compileSource(file);
  if (!res.ok) return { blockers, clean: false, output: fx.output };
  const run = await runBootstrapArtifact(res.client.html, res.client.js, [], {}, [], undefined);
  const el = run.body.querySelector("#c");
  return { blockers, clean: true, output: fx.output, text: String(el?.textContent ?? "<no #c>").replace(/\s+/g, " ").trim() };
}

const CASES = [
  // review probe s3: a loop writes @count before `<doubled>` reads it
  ["s3 — a loop writes the cell the next declaration reads", [
    "<program>", "${", "    <count>: number = 0", "    for (const i of [1, 2, 3]) {", "        @count = @count + i",
    "    }", "    <doubled>: number = @count * 2", "}", '<p id="c">${@count} ${@doubled}</p>', "</program>", "",
  ].join("\n"), "6 12"],
  // review probe s4: a file-scope `let` reassigned (and in a loop) before `<y>` reads it
  ["s4 — a reassigned `let` the declaration reads", [
    "<program>", "${", "    let base: number = 2", "    <x>: number = base * 3", "    base = 10",
    "    for (const i of [1]) { base = base + i }", "    <y>: number = base", "}", '<p id="c">${@x} ${@y}</p>', "</program>", "",
  ].join("\n"), "6 11"],
  // review probe s2: the FULL unwrap path (every statement is an impl#1 item; `@a = @a + 1` runs in order)
  ["s2 — the full unwrap: legacy `@a = …` items run before the next declaration's seed", [
    "<program>", "${", "    <a>: number = 1", "    @a = @a + 1", "    <x>: number = @a * 10", "    @a = 5",
    "    <y>: number = f(@x)", "    function f(v: number) -> number { return v + 1 }", "}", '<p id="c">${@x} ${@y} ${@a}</p>', "</program>", "",
  ].join("\n"), "20 21 5"],
];

describe("fixS66 never moves a §66 declaration past a write it reads (review F1)", () => {
  for (const [name, src, impl1] of CASES) {
    test(name, async () => {
      const r = await migrateAndRun(src);
      if (r.clean) expect(r.text).toBe(impl1);
      else expect(r.blockers.join("\n")).toMatch(SEED_NOTE);
    }, 120000);
  }

  test("s3 / s4 / s2 are refused (left in `${}` with a note), not compiled into another value", async () => {
    for (const [, src] of CASES) {
      const r = await migrateAndRun(src);
      expect(r.clean).toBe(false);
      expect(r.blockers.join("\n")).toMatch(SEED_NOTE);
    }
  }, 300000);

  test("s5 — a `const` binding before the declaration is safe (module initialization, before any seed): split, and renders impl#1's value", async () => {
    const src = ["<program>", "${", "    const k: number = 3", "    <x>: number = k * 2", "    @x = @x + 1", "}", '<p id="c">${@x}</p>', "</program>", ""].join("\n");
    const r = await migrateAndRun(src);
    expect(r.blockers.join("\n")).not.toMatch(SEED_NOTE);
    expect(r.clean).toBe(true);
    expect(r.text).toBe("7");
  }, 120000);

  test("a write AFTER the declaration does not block the unwrap", async () => {
    const src = ["<program>", "${", "    <n>: number = 2", "    <m>: number = @n + 1", "    @n = 9", "}", '<p id="c">${@n} ${@m}</p>', "</program>", ""].join("\n");
    const r = await migrateAndRun(src);
    expect(r.blockers.join("\n")).not.toMatch(SEED_NOTE);
    expect(r.clean).toBe(true);
    expect(r.text).toBe("9 3");
  }, 120000);

  test("r2: a call before the declaration refuses it whatever its initializer reads (`<count pinned> = 0` after `@count = readEarly()`)", () => {
    // r1 kept this move (the literal seed reads nothing); r2 refuses on the call alone — a fail-closed
    // guard does not consult what the initializer reads, only whether anything before it can write.
    const src = ["${", "    function readEarly() {", "        return @count;", "    }", "    @count = readEarly()", "    <count pinned> = 0", "}", "<p>x</>", ""].join("\n");
    const fx = fixS66(src, { filePath: F, entry: true, rules: S66_RULES, allowNonCompiling: true, wrapPageRoot: true });
    expect(fx.blockers.map((b) => b.reason).join("\n")).toMatch(SEED_NOTE);
  });

  test("a call before the declaration refuses a seed that reads anything (the callee may write it)", () => {
    const src = ["<program>", "${", "    <a>: number = 1", "    bump()", "    <b>: number = @a + 1", "    function bump() { @a = 5 }", "}", '<p id="c">${@b}</p>', "</program>", ""].join("\n");
    const fx = fixS66(src, { filePath: F, entry: true, rules: S66_RULES, allowNonCompiling: true });
    expect(fx.blockers.map((b) => b.reason).join("\n")).toMatch(/declaration on line 5 [^\n]*the statement on line 4 is not provably free of writes and calls/);
  });
});

// ---------------------------------------------------------------------------------------------------
// r2 (PR #2025 re-review N1 / N2 / N3): r1's read / write reader failed OPEN on what it could not see —
// a template literal (one STRING token), a KEYWORD-class name (`get`, `set`, `env`, `using`, `changes`,
// `partial`, …), a user function that shadows a "pure" library callee (`function Number(v)`). Every
// re-review probe (~/.cache/scrml/review/s480-2025-r1rev/scratch/p/) is pinned here: the migrated program
// renders impl#1's value for the original, or it is refused with the note. On 7d3877965 each of them
// compiled clean on the bootstrap and rendered another value. impl#1's renders are the recorded ones
// (conformance/adapters/impl1-ts.ts on the original).
const prog = (...lines) => ["<program>", ...lines, "</program>", ""].join("\n");
const R2_CASES = [
  // N1 — a template literal reads the cell inside its `${ }`
  ["k01 — split: a loop writes @count, then `<s> = `n=${@count}``", prog("${", "    <count>: number = 0", "    for (const i of [1, 2, 3]) {", "        @count = @count + i", "    }",
    "    <s>: string = `n=${@count}`", "}", '<p id="c">${@count} ${@s}</p>'), "6 n=6"],
  ["c01 — split: `@c = 5`, then `<d> = `v${@c}``", prog("${", "    <c>: number = 1", "    @c = 5", "    <d>: string = `v${@c}`", "}", '<p id="c">${@c} ${@d}</p>'), "5 v5"],
  ["c02 — full unwrap: `${ @c = 5 }` in an earlier block, then `<d> = `v${@c}``", prog("${ <c>: number = 1 }", "${ @c = 5 }", "${", "    <d>: string = `v${@c}`", "}", '<p id="c">${@c} ${@d}</p>'), "5 v5"],
  // N2 — a KEYWORD-class name is a binding the initializer reads and an earlier block writes
  ...["get", "set", "env", "using", "changes", "partial"].map((kw) => [`g-${kw} — \`let ${kw}\` reassigned in an earlier block`,
    prog(`\${ let ${kw}: number = 2 }`, `\${ ${kw} = 10 }`, "${", `    <x>: number = ${kw} * 3`, "}", '<p id="c">${@x}</p>'), "30"]),
  ["k02 — split: `let get` reassigned in the same block", prog("${", "    let get: number = 2", "    get = 10", "    <x>: number = get * 3", "}", '<p id="c">${@x}</p>'), "30"],
  ["h01 — `function set()` writes @c; `set()` runs before `<d>`", prog("${ <c>: number = 1 }", "${ function set() { @c = 5 } }", "${ set() }", "${", "    <d>: number = @c * 2", "}", '<p id="c">${@c} ${@d}</p>'), "5 10"],
  ["h02 — `function get()` reads @c, written before `<d> = get() * 2`", prog("${ <c>: number = 1 }", "${ @c = 5 }", "${ function get() -> number { return @c } }", "${", "    <d>: number = get() * 2", "}", '<p id="c">${@c} ${@d}</p>'), "5 10"],
  // N3 — a user function shadowing a library callee is not pure
  ["i01 — a user `function Number(v)` reads @c", prog("${ <c>: number = 1 }", "${ @c = 5 }", "${ function Number(v: number) -> number { return v + @c } }", "${", "    <d>: number = Number(1)", "}", '<p id="c">${@c} ${@d}</p>'), "5 6"],
  ["i02 — a user `function String(v)` writes @c and is called before `<d>`", prog("${ <c>: number = 1 }", '${ function String(v: number) -> string { @c = 5; return "" } }', "${ String(1) }", "${", "    <d>: number = @c * 2", "}", '<p id="c">${@c} ${@d}</p>'), "5 10"],
];
// impl#1 itself does not render these two (a KEYWORD name it reads differently): the only safe outcome is a refusal
const R2_REFUSE_ONLY = ["cleanup", "upload"].map((kw) => [`g-${kw} — \`let ${kw}\` reassigned in an earlier block`,
  prog(`\${ let ${kw}: number = 2 }`, `\${ ${kw} = 10 }`, "${", `    <x>: number = ${kw} * 3`, "}", '<p id="c">${@x}</p>')]);

describe("r2 — the seed-order guard fails closed (re-review N1 / N2 / N3 probes)", () => {
  for (const [name, src, impl1] of R2_CASES) {
    test(name, async () => {
      const r = await migrateAndRun(src);
      if (r.clean) expect(r.text).toBe(impl1);
      else expect(r.blockers.join("\n")).toMatch(SEED_NOTE);
    }, 120000);
  }
  for (const [name, src] of R2_REFUSE_ONLY) {
    test(`${name}: refused with the note`, async () => {
      const r = await migrateAndRun(src);
      expect(r.clean).toBe(false);
      expect(r.blockers.join("\n")).toMatch(SEED_NOTE);
    }, 120000);
  }

  // the other side: the guard is not a blanket refusal — a declaration with only provably-free code
  // before it (file-scope `let` / `const` from literals and earlier bindings, a function declaration,
  // other cell declarations, a markup interpolation of a bound cell) still moves out of `${ }`, and the
  // migrated program renders impl#1's value
  test("a declaration with only provably-free code before it still moves (and renders impl#1's value)", async () => {
    const src = prog("${ let base: number = 2 }", "${ const k: number = base + 1 }", "${ function twice(v: number) -> number { return v * 2 } }",
      "${", "    <x>: number = twice(k)", "    @x = @x + 1", "}", '<p id="c">${@x}</p>');
    const r = await migrateAndRun(src);
    expect(r.blockers.join("\n")).not.toMatch(SEED_NOTE);
    expect(r.output).toContain("let <x:number=(twice(k))/>");
    expect(r.output).not.toMatch(/\$\{\s*let <x/);
    expect(r.clean).toBe(true);
    expect(r.text).toBe("7");
  }, 120000);

  test("an enum variant constructor `.Name(…)` is not a call; a method call on a receiver is", () => {
    const run = (pre) => fixS66(prog(pre, "${", "    <x>: number = 1", "    <y>: number = @x", "}", '<p id="c">${@x}</p>'),
      { filePath: F, entry: true, rules: S66_RULES, allowNonCompiling: true }).blockers.map((b) => b.reason).join("\n");
    expect(run('${ type R:enum = { Ok(n: int) Failed(reason: string) } }\n${ <r>: R = .Failed("unset") }')).not.toMatch(SEED_NOTE);
    expect(run("${ let a = x.f(1) }")).toMatch(SEED_NOTE);
    expect(run("${ let a = (1).f(1) }")).toMatch(SEED_NOTE);
    expect(run("${ let a = [1].length }")).not.toMatch(SEED_NOTE);
  });

  test("cell declarations and function declarations before a declaration do not refuse it (the common program head)", async () => {
    const src = prog("${", "    <count>: number = 0", "    <step>: number = 1", "    function inc() { @count = @count + @step }", "    <total>: number = @count + @step", "}", '<p id="c">${@count} ${@step} ${@total}</p>');
    const r = await migrateAndRun(src);
    expect(r.blockers.join("\n")).not.toMatch(SEED_NOTE);
    expect(r.clean).toBe(true);
    expect(r.text).toBe("0 1 1");
  }, 120000);
});

// ---------------------------------------------------------------------------------------------------
// r3 (PR #2025 r2 re-review F1 / F3 / F4). Probes ~/.cache/scrml/review/s480-2025-r2rev/scratch/p/.
// F1: the CLI artifact evaluates EVERY file-scope binding at module initialization — before
// `rt.construct` seeds the cells — so a `let` / `const` written AFTER the moved declaration (a later
// block, or later in the same block) runs before its seed there, and after it in impl#1. On 1caa16f4c
// r01 / r03 / r05 compiled clean and rendered "20 10 0" (impl#1: "2 1 0").
const R3_CASES = [
  ["r01 — a later block's `const k = bump()` (bump writes the `let` the declaration reads)",
    prog("${ let n: number = 1 }", "${ function bump() -> number { n = 10; return 0 } }", "${", "    <d>: number = n * 2", "}", "${ const k: number = bump() }", '<p id="c">${@d} ${n} ${k}</p>'), "2 1 0"],
  ["r03 — a later block's `let k = bump()`",
    prog("${ let n: number = 1 }", "${ function bump() -> number { n = 10; return 0 } }", "${", "    <d>: number = n * 2", "}", "${ let k: number = bump() }", '<p id="c">${@d} ${n} ${k}</p>'), "2 1 0"],
  ["r05 — the same block's later `const k = bump()` (split)",
    prog("${ let n: number = 1 }", "${ function bump() -> number { n = 10; return 0 } }", "${", "    <d>: number = n * 2", "    const k: number = bump()", "}", '<p id="c">${@d} ${n} ${k}</p>'), "2 1 0"],
  // r3 probe x02: a `const` in a LATER markup interpolation is a file-scope binding too (the artifact
  // prints `const w = bump();` at module initialization) — on 1caa16f4c "20 10 0"
  ["x02 — a later markup interpolation's `const w = bump()`",
    prog("${ let n: number = 1 }", "${ function bump() -> number { n = 10; return 0 } }", "${", "    <d>: number = n * 2", "}", "<div>${ const w: number = bump() }</div>", '<p id="c">${@d} ${n} ${w}</p>'), "2 1 0"],
];

describe("r3 — the seed comes after EVERY file-scope binding on the CLI artifact (re-review F1)", () => {
  for (const [name, src, impl1] of R3_CASES) {
    test(`${name}: renders impl#1's value or is refused with the note`, async () => {
      const r = await migrateAndRun(src);
      if (r.clean) expect(r.text).toBe(impl1);
      else expect(r.blockers.join("\n")).toMatch(SEED_NOTE);
    }, 120000);
    test(`${name}: refused (left in \`\${}\` with the note)`, () => {
      const fx = fixS66(src, { filePath: F, entry: true, rules: S66_RULES, allowNonCompiling: true });
      expect(fx.blockers.map((b) => b.reason).join("\n")).toMatch(/(file-scope binding|expression) on line \d+ is not provably free of writes and calls/);
    });
  }

  test("a later binding that is provably free does not refuse the move (and renders impl#1's value)", async () => {
    const src = prog("${ let n: number = 1 }", "${", "    <d>: number = n * 2", "}", "${ const k: number = n + 1 }", '<p id="c">${@d} ${k}</p>');
    const r = await migrateAndRun(src);
    expect(r.blockers.join("\n")).not.toMatch(SEED_NOTE);
    expect(r.output).toContain("let <d:number=(n * 2)/>");
    expect(r.clean).toBe(true);
    expect(r.text).toBe("2 2");
  }, 120000);

  test("a later statement that is not a binding runs at render on both — it does not refuse the move", async () => {
    // r04: `${ n = 10 }` after the declaration — the artifact runs it in render_program, after the seed
    const src = prog("${ let n: number = 1 }", "${", "    <d>: number = n * 2", "}", "${ n = 10 }", '<p id="c">${@d} ${n}</p>');
    const r = await migrateAndRun(src);
    expect(r.blockers.join("\n")).not.toMatch(SEED_NOTE);
    expect(r.clean).toBe(true);
    expect(r.text).toBe("2 10");
  }, 120000);
});

describe("r3 — F3 `?.(` is a call; F4 component code is not skipped", () => {
  const seedNote = (src) => fixS66(src, { filePath: F, entry: true, rules: S66_RULES, allowNonCompiling: true })
    .blockers.map((b) => b.reason).join("\n");

  // F3: the bootstrap refuses `?.(` today, so this is pinned at the guard (fixS66's note), not at runtime
  test("q01c — `arr?.push?.(5)` before the declaration is a call: refused", () => {
    expect(seedNote(prog("${ let arr = [1] }", "${ let t = arr?.push?.(5) }", "${", "    <n>: number = arr.length", "}", '<p id="c">${@n}</p>')))
      .toMatch(/statement on line 3 is not provably free of writes and calls/);
    // the same without the call still moves
    expect(seedNote(prog("${ let arr = [1] }", "${ let t = arr?.length }", "${", "    <n>: number = arr.length", "}", '<p id="c">${@n}</p>')))
      .not.toMatch(SEED_NOTE);
  });

  // F4: impl#1 runs an instantiated component's body where the instance stands — before a later
  // declaration — while the artifact renders it after the seed
  test("o03 — a component definition's body calls a writer, instantiated before the declaration: refused", () => {
    expect(seedNote(prog("${ <c>: number = 1 }", "${ function bump() -> number { @c = 5; return 7 } }", "${ const Comp = <span>${bump()}</span> }", "<Comp/>",
      "${", "    <d>: number = @c * 2", "}", '<p id="c">${@c} ${@d}</p>'))).toMatch(SEED_NOTE);
  });
  test("o07 — a component body's logic writes the cell: refused", () => {
    expect(seedNote(prog("${ <c>: number = 1 }", "${ const Comp = <span>${ @c = 5 }x</span> }", "<Comp/>",
      "${", "    <d>: number = @c * 2", "}", '<p id="c">${@c} ${@d}</p>'))).toMatch(SEED_NOTE);
  });
  test("an imported component instantiated before the declaration: refused (its body is not in this file)", () => {
    expect(seedNote(prog('${ import { Comp } from "./comp.scrml" }', "${ <c>: number = 1 }", "<Comp/>",
      "${", "    <d>: number = @c * 2", "}", '<p id="c">${@c} ${@d}</p>'))).toMatch(/component instance `<Comp>`[^\n]* is not provably free of writes and calls/);
  });
});
