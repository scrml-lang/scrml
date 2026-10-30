/**
 * claim-gate-c2-s473.test.js — the C2 (derived-number) half of the claim gate.
 *
 * WHY THIS EXISTS. scripts/facts.ts states the policy — a public document SHALL cite docs/FACTS.md
 * rather than hardcode a figure that decays — and nothing enforced it. DESIGN.md said "The spec is
 * 18,000 lines. The compiler has 5,500+ tests." while the spec passed 53,000 lines. C2
 * (scripts/claim-gate-c2.js, run by scripts/claim-gate.js) fails a number next to a repo-derived
 * noun on the public surface unless its line or paragraph cites FACTS.md, or the line carries
 * `<!-- claim: not-derived -->`.
 *
 * Pinned: positive fixtures (each must hit), negative fixtures (prose the matcher was tuned
 * against on the real surface), the citation / opt-out escapes, the real surface is clean, and
 * claim-gate.js fails end to end on an uncited figure.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { findDerivedNumberClaims } from "../../../scripts/claim-gate-c2.js";

const ROOT = join(import.meta.dir, "../../..");
const B = "```";
const hits = (text) => findDerivedNumberClaims(text).map((h) => h.match);

describe("claim-gate C2 — derived figures must cite docs/FACTS.md (S473)", () => {
  test("positive: the DESIGN.md figures that rotted, and the shapes around them, all hit", () => {
    expect(hits("The spec is 18,000 lines. The compiler has 5,500+ tests.")).toEqual(["18,000 lines", "5,500+ tests"]);
    expect(hits("SPEC.md is ~24,382 lines.")).toEqual(["~24,382 lines"]);
    expect(hits("The suite runs 47k tests in 1,840 test files.")).toEqual(["47k tests", "1,840 test files"]);
    expect(hits("It ships 18 modules and 14 CLI verbs.")).toEqual(["18 modules", "14 CLI verbs"]);
    expect(hits("There are 1813 conformance cases and 81 diagnostic codes.")).toEqual(["1813 conformance cases", "81 diagnostic codes"]);
    expect(hits("The spec has 66 sections and 700 diagnostics.")).toEqual(["66 sections", "700 diagnostics"]);
    expect(hits("362,085 LOC of compiler.")).toEqual(["362,085 LOC"]);
  });

  test("negative: ranges, refs, versions, singular nouns, hyphenated adjectives, function words", () => {
    expect(hits("lodash functions are typically 5–15 lines")).toEqual([]); // docs/external-js.md
    expect(hits("most missing-stdlib cases are 10–30 lines")).toEqual([]); // docs/external-js.md
    expect(hits("a 10-30 lines helper")).toEqual([]);
    expect(hits("SPEC §66.3 sections and §34 codes")).toEqual([]);
    expect(hits("v0.8.0 modules")).toEqual([]);
    expect(hits("impl#1 tests")).toEqual([]);
    expect(hits("emits E-SYNTAX-042 codes")).toEqual([]);
    expect(hits("Tier 0 code and a 3-line config")).toEqual([]);
    expect(hits("compiled at exit 0 with zero diagnostics")).toEqual([]);
    expect(hits("step 857, match tests")).toEqual([]);
  });

  test("negative: numbers in fences and inline code spans are C1's business", () => {
    expect(hits(`${B}\n// 5,500 tests\n${B}`)).toEqual([]);
    expect(hits("run `bun test # 47k tests` once")).toEqual([]);
  });

  test("a FACTS.md citation on the line or anywhere in the paragraph clears it", () => {
    expect(hits("over 50,000 lines (current figure: docs/FACTS.md)")).toEqual([]);
    expect(hits("over 50,000 lines and\n1,800 test files —\nsee [FACTS](docs/FACTS.md).")).toEqual([]);
    // ... but not across a blank line: the citation belongs to its own paragraph.
    expect(hits("over 50,000 lines.\n\nSee docs/FACTS.md.")).toEqual(["50,000 lines"]);
  });

  test("the opt-out marker clears its own line only", () => {
    expect(hits("a draft of 9 lines <!-- claim: not-derived -->")).toEqual([]);
    expect(hits("a draft of 9 lines <!-- claim: not-derived — a tweet, not the repo -->")).toEqual([]);
    expect(hits("a draft of 9 lines <!-- claim: not-derived -->\nand 12 tests")).toEqual(["12 tests"]);
  });

  test("the real public surface carries no uncited derived figure", () => {
    const r = spawnSync("bun", ["scripts/claim-gate.js", "--report"], { cwd: ROOT, encoding: "utf8" });
    expect(r.stdout).toContain("claim-gate C2: 0 uncited derived-number claim(s).");
  });
});

describe("scripts/claim-gate.js runs C2 end to end", () => {
  let dir;
  let bad;
  let good;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "claim-gate-c2-"));
    bad = join(dir, "bad.md");
    good = join(dir, "good.md");
    writeFileSync(bad, "# x\n\nThe spec is 18,000 lines.\n");
    writeFileSync(good, "# x\n\nThe spec runs past 50,000 lines (current figure: docs/FACTS.md).\n");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("an uncited figure fails the gate and is named", () => {
    const r = spawnSync("bun", ["scripts/claim-gate.js", bad], { cwd: ROOT, encoding: "utf8" });
    expect(r.stdout).toContain("claim-gate C2: 1 uncited derived-number claim(s)");
    expect(r.stderr).toContain("C2 uncited derived figure «18,000 lines»");
    expect(r.status).toBe(1);
  });

  test("a cited figure passes", () => {
    const r = spawnSync("bun", ["scripts/claim-gate.js", good], { cwd: ROOT, encoding: "utf8" });
    expect(r.stdout).toContain("claim-gate C2: 0 uncited derived-number claim(s).");
    expect(r.status).toBe(0);
  });
});
