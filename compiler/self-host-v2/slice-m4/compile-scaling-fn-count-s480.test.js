// compile-scaling-fn-count-s480.test.js — s480-boot-fn-count-perf: the bootstrap's compile time grows
// (near) LINEARLY with the number of top-level functions.
//
// The S480 blocker census measured N one-line top-level functions at 500 / 2,000 / 4,000 / 8,000:
// 0.44 / 4.3 / 16 / 120 s — super-quadratic, and the self-host parse.scrml took 196–285 s. The
// passes copied or scanned a whole-program list once PER declaration or per reference: the lexer
// appended each token to the whole run (concat), toPToks / programKids / boundSyms / fnItems /
// the binder's fact tables / the typer's expression list grew one concat per element, sccOrder
// rebuilt its tapes per vertex, inheritedFns dropped one link of a call chain per pass, boundAs /
// scopeHit / fnNamed / nodeIdx / placeOf / NameTable scanned per lookup, and printFileBound /
// userNamed / linOuterRunLins / errorSpansIn re-read the file per function.
//
// The gate is a RATIO, not a time budget: the same generated program at N and 4N functions,
// compiled in process (scripts/scrml-boot.ts compileSource — the whole pipeline) in a FRESH child
// process (compile-scaling-fn-count-s480.probe.js), each the best of several interleaved runs. A
// linear compile is 4×, a quadratic one 16×. Measured at N = 500 (local):
//   shape   before   after
//   indep    12.9×    ~6×    (N one-line functions)
//   chain    20.1×    ~6×    (each calls the one before it)
//   fan      20.4×    ~8×    (each calls up to 8 earlier ones)
// Residual super-linear terms (per-call scans that remain — gap g-boot-compile-superquadratic-fn-count-s480)
// keep "after" above 4×. The bounds fail every "before" and leave the "after" room for a loaded
// runner; a fresh probe is tried up to ATTEMPTS times and the best ratio judged (as compile-scaling-s477).
// s480-records-3 (review of #2020): indep / chain tightened 10× -> 8×. Five single-attempt probes
// (local, N = 400): indep 5.67–6.35×, chain 5.55–6.73×.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const PROBE = join(import.meta.dir, "compile-scaling-fn-count-s480.probe.js");
const N = 400;
const RUNS = 3;
const ATTEMPTS = 3;
let dir;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "boot-scaling-fn-s480-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function bestRatio(shape, bound) {
  let best = Infinity;
  for (let a = 0; a < ATTEMPTS && best >= bound; a++) {
    const r = spawnSync(process.execPath, [PROBE, dir, shape, String(N), String(RUNS)], { encoding: "utf8", timeout: 400_000 });
    if (r.status !== 0) throw new Error(`the probe failed (status ${r.status}):\n${r.stderr}\n${r.stdout}`);
    const lines = r.stdout.trim().split("\n");
    const { small, large } = JSON.parse(lines[lines.length - 1]);
    const ratio = large / small;
    if (ratio >= bound) console.log(`${shape} attempt ${a + 1}: ${Math.round(small)} ms at N=${N}, ${Math.round(large)} ms at 4N: ratio ${ratio.toFixed(2)}`);
    best = Math.min(best, ratio);
  }
  return best;
}

describe("s480-boot-fn-count-perf — compile time scales with the function count", () => {
  test("N -> 4N independent one-line functions: under 8x (quadratic is 16x)", () => {
    expect(bestRatio("indep", 8)).toBeLessThan(8);
  }, 1_500_000);

  test("N -> 4N functions in a call chain: under 8x", () => {
    expect(bestRatio("chain", 8)).toBeLessThan(8);
  }, 1_500_000);

  test("N -> 4N functions each calling up to 8 others: under 13x", () => {
    expect(bestRatio("fan", 13)).toBeLessThan(13);
  }, 1_500_000);
});
