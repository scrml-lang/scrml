/**
 * facts-check-exit-codes-s472.test.js — `scripts/facts.ts --check` exit codes and every caller's
 * mapping of them (g-facts-check-crash-exit-1-warned-as-stale-s472).
 *
 * WHY THIS EXISTS. Since S469 a STALE FACTS.md is a warning, not a failure, on the PR side (ci.yml
 * "Facts currency") and in pre-push. Stale used to be exit 1 — which is ALSO bun's exit code for any
 * uncaught exception. So a facts.ts that CRASHED (repro: one dangling symlink under stdlib/ →
 * statSync ENOENT) was warned through as "figures differ", the PR went green, and facts-regen.yml
 * then failed on every push to main while docs/FACTS.md silently stopped updating.
 *
 * Pinned here:
 *   - facts.ts: stale → 4 (a dedicated code), dangling symlink → 5 (named, fail-closed),
 *     a crash → 1 with a named "CRASHED" line, current → 0. Run against a MIRROR tree (symlinks to
 *     the real repo dirs) so the real checkout is never mutated.
 *   - the CI step's `run:` block and pre-push's facts block are extracted VERBATIM from the files and
 *     run against a stub `bun` that exits a chosen code: only 4 may warn-and-pass; 1, 2, 3, 5 fail.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  mkdtempSync, mkdirSync, symlinkSync, readdirSync, copyFileSync, writeFileSync, readFileSync,
  rmSync, chmodSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

const REPO = join(import.meta.dir, "../../..");

// ---------------------------------------------------------------- mirror tree

/**
 * A tree whose every top-level entry is a symlink to the real repo, except `scripts/` (holds a COPY
 * of facts.ts, so its ROOT resolves to the mirror), `stdlib/` and `docs/` (real dirs of per-entry
 * symlinks, so a case can add a dangling link or replace FACTS.md without touching the checkout).
 */
function mirror({ dangling = false, factsMd = null, factsMdIsDir = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "facts-s472-"));
  const SPECIAL = new Set(["scripts", "stdlib", "docs", ".git", "node_modules"]);
  for (const e of readdirSync(REPO)) {
    if (SPECIAL.has(e)) continue;
    symlinkSync(join(REPO, e), join(root, e));
  }
  mkdirSync(join(root, "scripts"));
  copyFileSync(join(REPO, "scripts/facts.ts"), join(root, "scripts/facts.ts"));
  mkdirSync(join(root, "stdlib"));
  for (const e of readdirSync(join(REPO, "stdlib"))) symlinkSync(join(REPO, "stdlib", e), join(root, "stdlib", e));
  if (dangling) symlinkSync(join(root, "nowhere"), join(root, "stdlib", "dangling"));
  mkdirSync(join(root, "docs"));
  for (const e of readdirSync(join(REPO, "docs"))) {
    if (e === "FACTS.md") continue;
    symlinkSync(join(REPO, "docs", e), join(root, "docs", e));
  }
  if (factsMdIsDir) mkdirSync(join(root, "docs/FACTS.md"));
  else writeFileSync(join(root, "docs/FACTS.md"), factsMd ?? readFileSync(join(REPO, "docs/FACTS.md"), "utf8"));
  return root;
}

function runFacts(root) {
  const r = spawnSync("bun", [join(root, "scripts/facts.ts"), "--check"], { cwd: root, encoding: "utf8" });
  return { rc: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

describe("facts.ts --check — exit codes (S472)", () => {
  const roots = [];
  const make = (o) => {
    const r = mirror(o);
    roots.push(r);
    return r;
  };
  afterAll(() => {
    for (const r of roots) rmSync(r, { recursive: true, force: true });
  });

  test("a current mirror passes (exit 0) — the mirror measures the real tree", () => {
    // The real FACTS.md may be stale on a branch (the bot regenerates main), so regenerate the
    // mirror's copy first, then check it.
    const root = make();
    const w = spawnSync("bun", [join(root, "scripts/facts.ts"), "--write"], { cwd: root, encoding: "utf8" });
    expect(w.status).toBe(0);
    expect(runFacts(root).rc).toBe(0);
  });

  test("STALE exits 4 — a dedicated code, never 1 (bun's uncaught-exception code)", () => {
    const real = readFileSync(join(REPO, "docs/FACTS.md"), "utf8");
    // Corrupt one figure inside the generated table (keeps both anchors intact).
    const stale = real.replace(/(\| compiler version \| `)[^`]*(`)/, "$10.0.0-stale$2");
    expect(stale).not.toBe(real);
    const { rc, out } = runFacts(make({ factsMd: stale }));
    expect(out).toContain("STALE");
    expect(rc).toBe(4);
  });

  test("a dangling symlink under a measured dir is a NAMED refusal (exit 5), not a crash", () => {
    const { rc, out } = runFacts(make({ dangling: true }));
    expect(out).toContain("BROKEN TREE");
    expect(out).toContain("stdlib/dangling");
    expect(rc).toBe(5);
  });

  test("an uncaught exception is reported as CRASHED and exits non-4", () => {
    // docs/FACTS.md as a DIRECTORY: existsSync is true, readFileSync throws EISDIR.
    const { rc, out } = runFacts(make({ factsMdIsDir: true }));
    expect(out).toContain("facts: CRASHED");
    expect(rc).not.toBe(0);
    expect(rc).not.toBe(4);
  });
});

// ------------------------------------------------------------- caller mapping

/** A dir holding a stub `bun` that prints $FAKE_OUT (or which code it returns) and exits $FAKE_RC. */
let stubDir;
beforeAll(() => {
  stubDir = mkdtempSync(join(tmpdir(), "facts-s472-stub-"));
  writeFileSync(join(stubDir, "bun"), `#!/bin/sh\nprintf '%s\\n' "\${FAKE_OUT:-stub bun rc=$FAKE_RC}"\nexit "$FAKE_RC"\n`);
  chmodSync(join(stubDir, "bun"), 0o755);
});
afterAll(() => rmSync(stubDir, { recursive: true, force: true }));

function runShell(script, rc, out = "") {
  const r = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}`, FAKE_RC: String(rc), FAKE_OUT: out },
  });
  return { rc: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

/** The `run: |` block of the ci.yml step named "Facts currency …", de-indented. */
function ciFactsStep() {
  const lines = readFileSync(join(REPO, ".github/workflows/ci.yml"), "utf8").split("\n");
  const at = lines.findIndex((l) => /- name: Facts currency/.test(l));
  expect(at).toBeGreaterThan(-1);
  const runAt = lines.findIndex((l, i) => i > at && /^\s+run: \|\s*$/.test(l));
  expect(runAt).toBeGreaterThan(at);
  const indent = lines[runAt + 1].match(/^\s*/)[0].length;
  const body = [];
  for (let i = runAt + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() !== "" && l.match(/^\s*/)[0].length < indent) break;
    body.push(l.slice(indent));
  }
  return body.join("\n");
}

/** pre-push's `# BEGIN facts-currency` … `# END facts-currency` block. */
function prePushFactsBlock() {
  const src = readFileSync(join(REPO, "scripts/git-hooks/pre-push"), "utf8");
  const m = src.match(/# BEGIN facts-currency\n([\s\S]*?)\n\s*# END facts-currency/);
  expect(m).not.toBeNull();
  return `set -e\nCURRENCY_FAILED=0\n${m[1]}\necho "CURRENCY_FAILED=$CURRENCY_FAILED"\n`;
}

describe("ci.yml 'Facts currency' — only exit 4 is a warning", () => {
  test("rc 0 passes; rc 4 warns and passes", () => {
    expect(runShell(ciFactsStep(), 0).rc).toBe(0);
    const w = runShell(ciFactsStep(), 4);
    expect(w.rc).toBe(0);
    expect(w.out).toContain("::warning");
  });
  for (const rc of [1, 2, 3, 5]) {
    test(`rc ${rc} FAILS the step (a crash / broken instrument is never "stale")`, () => {
      const r = runShell(ciFactsStep(), rc);
      expect(r.rc).toBe(rc);
      expect(r.out).not.toContain("::warning");
    });
  }
});

describe("pre-push facts block — only exit 4 is a warning", () => {
  test("rc 0 → not failed; rc 4 → WARN, not failed", () => {
    expect(runShell(prePushFactsBlock(), 0).out).toContain("CURRENCY_FAILED=0");
    const w = runShell(prePushFactsBlock(), 4);
    expect(w.out).toContain("WARN");
    expect(w.out).toContain("CURRENCY_FAILED=0");
  });
  for (const rc of [1, 2, 3, 5]) {
    test(`rc ${rc} → CURRENCY_FAILED=1 (push blocked)`, () => {
      const r = runShell(prePushFactsBlock(), rc);
      expect(r.out).toContain("CURRENCY_FAILED=1");
      expect(r.out).not.toContain("WARN");
    });
  }
  // VERSION SKEW: the hook runs from the main checkout against the PUSHED tree's facts.ts, and a
  // branch cut before S472 still exits 1 for stale. rc 1 is stale only with facts.ts's own verdict.
  const LEGACY_STALE = "  STALE @generated:facts-table (docs/FACTS.md)\n\nSTALE — docs/FACTS.md is out of date with this tree. main is regenerated automatically after";
  test("rc 1 WITH the legacy facts.ts stale verdict → WARN, not failed (a pre-S472 branch)", () => {
    const r = runShell(prePushFactsBlock(), 1, LEGACY_STALE);
    expect(r.out).toContain("WARN");
    expect(r.out).toContain("CURRENCY_FAILED=0");
  });
  test("rc 1 with a stack trace and no verdict → blocked", () => {
    const r = runShell(prePushFactsBlock(), 1, "TypeError: x is not a function\n    at scripts/facts.ts:311");
    expect(r.out).toContain("CURRENCY_FAILED=1");
  });
  test("rc 1 with the verdict text AND a CRASHED line → blocked (a crash never passes as stale)", () => {
    const r = runShell(prePushFactsBlock(), 1, `${LEGACY_STALE}\nfacts: CRASHED — boom`);
    expect(r.out).toContain("CURRENCY_FAILED=1");
  });
  test("the verdict line mid-line (not facts.ts's own line) does not count", () => {
    const r = runShell(prePushFactsBlock(), 1, "error: expected STALE — docs/FACTS.md is out of date");
    expect(r.out).toContain("CURRENCY_FAILED=1");
  });
});
