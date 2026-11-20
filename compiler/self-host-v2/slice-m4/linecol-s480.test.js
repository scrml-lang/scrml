// linecol-s480.test.js — s480-boot-fn-count-perf: scripts/scrml-boot.ts places a diagnostic
// (`lineCol`) and prints its source lines (`formatDiagnostic` pretty, `byteColumn`) from line
// starts computed once per source text. Each used to rescan the text from offset 0 (lineCol) or
// split all of it (sourceContext, byteColumn) PER DIAGNOSTIC: O(diagnostics × file) — ~8 s of the
// self-host parse.scrml compile (17.5k diagnostics). Same answers as the rescans (checked here
// against them), and many diagnostics on a large text stay fast.

import { describe, test, expect } from "bun:test";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const boot = await import(join(ROOT, "scripts", "scrml-boot.ts"));

// the old definitions, as the oracle
function naiveLineCol(src, offset) {
  let line = 1, last = -1;
  const end = Math.max(0, Math.min(offset, src.length));
  for (let i = 0; i < end; i++) if (src.charCodeAt(i) === 10) { line++; last = i; }
  return { line, col: end - last };
}

describe("s480 — lineCol from precomputed line starts", () => {
  test("matches the rescan at every offset (line feeds, CRLF, leading / trailing / repeated newlines, out of range)", () => {
    const texts = ["", "a", "\n", "\n\n", "ab\ncd", "ab\r\ncd\r\n", "\nx\n\ny\n", "é😀\nz", "line1\nline2\nline3"];
    for (const src of texts) {
      for (let off = -2; off <= src.length + 2; off++) {
        expect(boot.lineCol(src, off)).toEqual(naiveLineCol(src, off));
      }
    }
  });

  test("20,000 diagnostics on a ~1 MB text are placed and printed fast", () => {
    const line = "    const x: int = f(y) + g(z) // some text\n";
    const src = line.repeat(Math.ceil(1_000_000 / line.length));
    const file = "/virtual/big.scrml";
    const sources = new Map([[file, src]]);
    const t0 = performance.now();
    let sum = 0;
    for (let k = 0; k < 20_000; k++) {
      const off = src.length - 1 - ((k * 7919) % 5000);
      const lc = boot.lineCol(src, off);
      sum += lc.line;
      const d = { severity: "error", code: "E-X", message: "m", file, line: lc.line, col: lc.col };
      sum += boot.formatDiagnostic(d, "pretty", "/", sources).length;
      sum += boot.byteColumn(d, sources) ?? 0;
    }
    const ms = performance.now() - t0;
    expect(sum).toBeGreaterThan(0);
    // the rescans took minutes here (20,000 × ~1 MB scans and splits); 30 s is generous for a slow runner
    expect(ms).toBeLessThan(30_000);
  }, 600_000);

  test("the pretty source context is the text's own lines", () => {
    const src = "one\ntwo\r\nthree\nfour\nfive\nsix";
    const file = "/virtual/s.scrml";
    const out = boot.formatDiagnostic({ severity: "error", code: "E-X", message: "m", file, line: 4, col: 2 }, "pretty", "/", new Map([[file, src]]));
    const lines = out.split("\n").slice(2).map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    expect(lines).toEqual(["      2 | two\r", "      3 | three", " >    4 | four", "      5 | five", "      6 | six"]);
  });
});
