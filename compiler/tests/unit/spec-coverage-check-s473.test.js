/**
 * spec-coverage-check-s473.test.js — pins the bootstrap SPEC-coverage gate (scripts/spec-coverage-check.ts).
 *
 * WHY. SPEC §47 sat unimplemented in the bootstrap with no gap, refusal or ruling until someone
 * tripped over it; the S473 audit found ~90 more SILENT rows. docs/bootstrap-spec-coverage.md now
 * records every section, and the gate makes a SILENT row without a gap impossible to land. A gate that
 * is never proven to bite rots (pa-base §8), so each rule is exercised here against fixtures:
 *   (a) a top-level § in SPEC-INDEX with no row        → violation
 *   (b) a SILENT-* row with no gap id                  → violation
 *   (c) a cited gap id with no @gap marker             → violation
 *   (d) a closed gap cited on a SILENT/PARTIAL row     → WARNING only
 *   plus: unknown status, malformed gap token, stale totals block → violation;
 *         nothing parsed (index / coverage / gaps)     → fatal (exit 2), never a vacuous pass.
 * The last test runs the gate over the LIVE repo files, so the unit suite catches a rotted table too.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  checkCoverage, coverageRows, indexTops, topOf, renderTotals, main, lf,
} from "../../../scripts/spec-coverage-check.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "fixtures", "spec-coverage");
// Read as LF: the cases below mutate the fixtures with "\n"-terminated rows, and a Windows checkout
// (core.autocrlf) hands them over as CRLF (S473 windows-red). The gate's OWN CRLF handling is pinned
// in "line endings" below, against CRLF made from these.
const INDEX = lf(readFileSync(join(FIX, "index.md"), "utf8"));
const GAPS = lf(readFileSync(join(FIX, "gaps.md"), "utf8"));
const OK = lf(readFileSync(join(FIX, "coverage-ok.md"), "utf8"));
const crlf = (s) => s.replace(/\n/g, "\r\n");

/** Re-render the totals so a mutated fixture fails only for the rule under test. */
function withTotals(cov) {
  const s = cov.indexOf("<!-- @generated:coverage-totals START");
  const e = cov.indexOf("<!-- @generated:coverage-totals END -->") + "<!-- @generated:coverage-totals END -->".length;
  return cov.slice(0, s) + renderTotals(coverageRows(cov)) + cov.slice(e);
}

describe("spec-coverage-check — parsing", () => {
  test("topOf reads numbers, subsections, bold and appendices", () => {
    expect(topOf("§6.4.1")).toBe("6");
    expect(topOf("47.1.1b")).toBe("47");
    expect(topOf("**47** (preamble)")).toBe("47");
    expect(topOf("App. D.1")).toBe("D");
    expect(topOf("§ 12.2 T3")).toBe("12");
    expect(topOf("prose")).toBeNull();
  });

  test("indexTops reads only the Sections table and skips the TOC row", () => {
    expect(indexTops(INDEX).map((t) => t.id)).toEqual(["1", "2", "A"]);
  });

  test("coverageRows keeps an escaped pipe inside one cell and splits gap ids", () => {
    const rows = coverageRows(OK);
    expect(rows.length).toBe(6);
    expect(rows[1].title).toBe("A pipe | inside a cell");
    expect(rows[1].status).toBe("BUILT");
    expect(rows[3].gaps).toEqual(["g-fix-narrowed", "g-fix-open-one"]);
    expect(rows[0].gaps).toEqual([]);
  });
});

describe("spec-coverage-check — rules", () => {
  test("the OK fixture passes with no warnings", () => {
    const r = checkCoverage(INDEX, OK, GAPS);
    expect(r.fatal).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.totalsCurrent).toBe(true);
  });

  test("(a) a top-level § with no row is a violation", () => {
    const cov = withTotals(OK.replace("| App. A | Matrix | N/A | summary table | — | (P3) |\n", ""));
    const r = checkCoverage(INDEX, cov, GAPS);
    expect(r.errors.some((e) => e.startsWith("(a) §A"))).toBe(true);
  });

  test("(a) is top-level only: a subsection the doc does not list needs no row", () => {
    // §1 is covered by `§1` and `§1.2`; dropping §1.2 must not fail anything.
    const cov = withTotals(OK.replace(/\| §1\.2 .*\n/, ""));
    expect(checkCoverage(INDEX, cov, GAPS).errors).toEqual([]);
  });

  test("(b) a SILENT row with no gap id is a violation, for both SILENT kinds", () => {
    for (const [from, to] of [
      ["| SILENT-ACCEPT | probe w.scrml | g-fix-open-one |", "| SILENT-ACCEPT | probe w.scrml | — |"],
      ["| SILENT-ABSENT | grep = 0 | g-fix-narrowed, g-fix-open-one |", "| SILENT-ABSENT | grep = 0 |  |"],
    ]) {
      const r = checkCoverage(INDEX, withTotals(OK.replace(from, to)), GAPS);
      expect(r.errors.filter((e) => e.startsWith("(b)")).length).toBe(1);
    }
  });

  test("(c) a cited gap id with no @gap marker is a violation", () => {
    const cov = withTotals(OK.replace("| PARTIAL | half built | g-fix-open-one |", "| PARTIAL | half built | g-fix-renamed-away |"));
    const r = checkCoverage(INDEX, cov, GAPS);
    expect(r.errors.some((e) => e.startsWith("(c)") && e.includes("g-fix-renamed-away"))).toBe(true);
  });

  test("(d) a closed gap on a SILENT or PARTIAL row warns but does not fail", () => {
    const cov = withTotals(OK.replace("| PARTIAL | half built | g-fix-open-one |", "| PARTIAL | half built | g-fix-resolved |"));
    const r = checkCoverage(INDEX, cov, GAPS);
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBe(1);
    expect(r.warnings[0]).toContain("g-fix-resolved");
  });

  test("(d) a closed gap on a BUILT row is fine (it records history)", () => {
    const cov = withTotals(OK.replace("| BUILT | x.scrml:f; t.test.js | — |", "| BUILT | x.scrml:f; t.test.js | g-fix-resolved |"));
    const r = checkCoverage(INDEX, cov, GAPS);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  test("an unknown status and a malformed gap token are violations", () => {
    const cov = withTotals(OK
      .replace("| BUILT | x.scrml:f", "| MOSTLY-BUILT | x.scrml:f")
      .replace("| PARTIAL | half built | g-fix-open-one |", "| PARTIAL | half built | G_Fix |"));
    const r = checkCoverage(INDEX, cov, GAPS);
    expect(r.errors.some((e) => e.includes('unknown status "MOSTLY-BUILT"'))).toBe(true);
    expect(r.errors.some((e) => e.includes('malformed gap id token "G_Fix"'))).toBe(true);
  });

  test("a stale totals block is a violation", () => {
    const cov = OK.replace("| BUILT | x.scrml:f; t.test.js |", "| REFUSED-LOUD | x.scrml:f; t.test.js |");
    const r = checkCoverage(INDEX, cov, GAPS);
    expect(r.totalsCurrent).toBe(false);
    expect(r.errors.some((e) => e.includes("coverage-totals"))).toBe(true);
  });

  test("nothing parsed is FATAL, never a vacuous pass", () => {
    expect(checkCoverage("# no sections table\n", OK, GAPS).fatal).toMatch(/SPEC-INDEX/);
    expect(checkCoverage(INDEX, "# no tables here\n", GAPS).fatal).toMatch(/no coverage rows/);
    expect(checkCoverage(INDEX, OK, "# no markers\n").fatal).toMatch(/@gap/);
  });
});

describe("spec-coverage-check — line endings (S473 windows-red: a CRLF checkout read every totals block as stale)", () => {
  test("CRLF inputs give the same verdict as LF — the OK fixture passes, totals current", () => {
    const r = checkCoverage(crlf(INDEX), crlf(OK), crlf(GAPS));
    expect(r.fatal).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.totalsCurrent).toBe(true);
    expect(r.rows.length).toBe(coverageRows(OK).length);
  });

  test("CRLF does not hide a violation: a SILENT row with no gap still fails", () => {
    const bad = withTotals(OK.replace("| SILENT-ACCEPT | probe w.scrml | g-fix-open-one |", "| SILENT-ACCEPT | probe w.scrml | — |"));
    expect(checkCoverage(crlf(INDEX), crlf(bad), crlf(GAPS)).errors.filter((e) => e.startsWith("(b)")).length).toBe(1);
  });

  test("--write on a CRLF file repairs the totals and keeps the file CRLF", () => {
    const dir = mkdtempSync(join(tmpdir(), "spec-cov-crlf-"));
    try {
      const stale = join(dir, "stale.md");
      writeFileSync(stale, crlf(OK.replace("| BUILT | x.scrml:f; t.test.js |", "| REFUSED-LOUD | x.scrml:f; t.test.js |")));
      const a = ["--index", join(FIX, "index.md"), "--coverage", stale, "--gaps", join(FIX, "gaps.md")];
      expect(main(a)).toBe(1);
      expect(main([...a, "--write"])).toBe(0);
      const after = readFileSync(stale, "utf8");
      expect(after.includes("\r\n")).toBe(true);
      expect(/[^\r]\n/.test(after)).toBe(false);
      expect(main(a)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("spec-coverage-check — CLI", () => {
  const args = (cov) => ["--index", join(FIX, "index.md"), "--coverage", cov, "--gaps", join(FIX, "gaps.md")];

  test("exit 0 on the OK fixture, 1 on a violation, 2 on an unreadable input; --write repairs totals", () => {
    const dir = mkdtempSync(join(tmpdir(), "spec-cov-"));
    try {
      expect(main(args(join(FIX, "coverage-ok.md")))).toBe(0);
      const bad = join(dir, "bad.md");
      writeFileSync(bad, withTotals(OK.replace("| SILENT-ACCEPT | probe w.scrml | g-fix-open-one |", "| SILENT-ACCEPT | probe w.scrml | — |")));
      expect(main(args(bad))).toBe(1);
      expect(main(args(join(dir, "missing.md")))).toBe(2);
      const stale = join(dir, "stale.md");
      writeFileSync(stale, OK.replace("| BUILT | x.scrml:f; t.test.js |", "| REFUSED-LOUD | x.scrml:f; t.test.js |"));
      expect(main(args(stale))).toBe(1);
      expect(main([...args(stale), "--write"])).toBe(0);
      expect(main(args(stale))).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the live repo table passes: every SPEC § has a row and every SILENT row has a real gap", () => {
    expect(main([])).toBe(0);
  });
});
