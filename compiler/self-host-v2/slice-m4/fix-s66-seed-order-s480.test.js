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

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";
import { fixS66, S66_RULES } from "../../src/commands/fix-s66.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const ENTRY = "app.scrml";
const F = "/virtual/app.scrml";
const errs = (r) => r.diags.filter((d) => d.severity === "Error");
const SEED_NOTE = /which a statement before it writes/;
let k = 0;

/** fixS66 (every rule), then the bootstrap on the result: { blockers, clean, text }. */
async function migrateAndRun(src) {
  const fx = fixS66(src, { filePath: F, entry: true, rules: S66_RULES, allowNonCompiling: true });
  const blockers = fx.blockers.map((b) => `${b.rule}@${b.line}: ${b.reason}`);
  const r = frontEnd(mods, [{ path: ENTRY, src: fx.output }], ENTRY);
  if (errs(r).length > 0) return { blockers, clean: false, output: fx.output };
  await loadProgram(r.core, "s480-seed-" + k++);
  return { blockers, clean: true, output: fx.output, text: document.querySelector("#c").textContent.replace(/\s+/g, " ").trim() };
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
});
