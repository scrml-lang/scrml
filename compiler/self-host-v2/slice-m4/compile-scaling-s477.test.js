// compile-scaling-s477.test.js — s477-boot-compile-perf: the bootstrap's compile time grows
// (near) LINEARLY with the program.
//
// An adopter's ~2,700-line app took 10–18 s to compile: the compile was super-quadratic
// (234 lines 0.16 s · 924 lines 1.65 s · 1,844 lines 11.4 s). walk.allNodes copied its whole
// prefix per node (O(n²) per walk), and several passes re-derived a whole-program (or
// whole-file) fact once PER ITEM they checked: check.scrml onceBoundInit per tape-replace
// write; print.scrml isParam / reinitUsed per declared field; analyze's fnWrites / voidFns /
// fallOffPass per function, singleProgramField per element, hostImportBinding per name,
// importBringing per file-scope name, isLaterProgram per item; the lexer re-advanced from
// offset 0 per region (cursorAt); the name supply re-tested every taken candidate per mint.
// Each now reads its fact once.
//
// The gate is a RATIO, not a time budget: the same generated program at N and 2N replicas
// (~900 and ~1,800 lines), compiled in process (scripts/scrml-boot.ts compileSource, the whole
// pipeline: front end, check, print) in a FRESH child process (compile-scaling-s477.probe.js),
// each timed as the best of several interleaved runs. A linear compile doubles. Measured at
// this change: ~2.4×; before it: ~6.0×; with only allNodes fixed (the per-item re-derivations
// back): ~3.4×. The bound, 3×, fails both and leaves the linear compile room for a loaded machine.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const PROBE = join(import.meta.dir, "compile-scaling-s477.probe.js");
const N = 40;
const RUNS = 5;
let dir;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "boot-scaling-s477-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("s477-boot-compile-perf — bootstrap compile time scales linearly", () => {
  test("doubling the program (~900 -> ~1,800 lines) at most triples the compile time", () => {
    const r = spawnSync(process.execPath, [PROBE, dir, String(N), String(RUNS)], { encoding: "utf8", timeout: 540_000 });
    if (r.status !== 0) throw new Error(`the probe failed (status ${r.status}):\n${r.stderr}\n${r.stdout}`);
    const lines = r.stdout.trim().split("\n");
    const { small, large } = JSON.parse(lines[lines.length - 1]);
    const ratio = large / small;
    if (ratio >= 3) console.log(`compile ${Math.round(small)} ms at N=${N}, ${Math.round(large)} ms at 2N: ratio ${ratio.toFixed(2)}`);
    expect(ratio).toBeLessThan(3);
  }, 600_000);
});
