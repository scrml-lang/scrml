/**
 * generated-stale-exit-codes-s474.test.js — S474 "generated files move to a post-merge bot".
 * change-id: s474-generated-files-bot.
 *
 * OWNER RULING (scrml-support user-voice-scrml.md, S474): "PRs stop committing regenerated blocks (known-gaps
 * counts, coverage totals, `severity.scrml`, SPEC-INDEX, bootstrap-conformance.md and the like); a post-merge
 * bot (the FACTS.md pattern) regenerates them on main; CI checks only the sources."
 *
 * So every producer reserves exit 4 for STALE ONLY, and every PR-side caller warns on exactly 4 and FAILS on
 * anything else. pa-base §8: a gate flipped to "warn" must still be shown to BITE — so each producer is run
 * here against a deliberately broken input (structural → non-4, red), a merely stale one (→ 4), and a current
 * one (→ 0), and each caller is run verbatim against a stub `bun` exiting a chosen code. Mirrors
 * facts-check-exit-codes-s472.test.js (FACTS, S469/S472), which pins the first instance of this pattern.
 *
 * Pinned here:
 *   - regen-spec-index.ts --check: stale totals / row ranges → 4; a SPEC § with no row, a row naming a
 *     missing §, missing totals anchors → 1; structural wins over stale.
 *   - state.ts --check: stale gap-counts → 4; missing anchor → 3; stray anchor → 1; unclassifiable status → 1
 *     (throws); zero markers → 2.
 *   - gen-bootstrap-severity.ts --check: stale → 4; a crash → 1 (never 4).
 *   - (spec-coverage-check.ts: pinned in spec-coverage-check-s473.test.js — stale → 4, violation → 1.)
 *   - scripts/ci-stale-warn.sh, every ci.yml currency step's use of it, pre-push's SPEC-INDEX block and
 *     pre-commit's SPEC-coverage block: only 4 warns.
 *   - generated-regen.yml's producer step: a failing producer's files are RESTORED (never committed), the
 *     others still regenerate, the failure is reported; a producer writing outside FILES fails the step.
 *   (bootstrap-conformance.ts --check is a ~2-minute bootstrap run, too slow for the unit tier: its 4 is
 *    bite-proved by hand in docs/changes/s474-generated-files-bot/progress.md.)
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

/**
 * process.env WITHOUT any GIT_* variable. ⚑ LOAD-BEARING: the pre-commit hook runs this suite with git's
 * hook environment (GIT_INDEX_FILE, and GIT_DIR in some setups) exported. A child `git init` / `git add -A`
 * in a temp sandbox then writes the REAL repository's index — measured at S474: the first run of this file
 * inside the hook replaced the committing worktree's index with the sandbox's seven files. Every child
 * process here gets this env, and the sandbox test asserts its git resolves to the sandbox.
 */
const BASE_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));
const roots = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});
const tmp = (p) => {
  const d = mkdtempSync(join(tmpdir(), p));
  roots.push(d);
  return d;
};
const run = (cmd, args, cwd, env = {}) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...BASE_ENV, ...env } });
  return { rc: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
};

// S474 r1 — the preload (compiler/tests/helpers/tmp-root-preload.js) scrubs git's hook env for the WHOLE
// suite; this file's own BASE_ENV is now belt-and-braces. Under the pre-commit hook this is the line that
// would go red if the scrub regressed.
test("no GIT_* variable reaches a test process (tmp-root-preload scrubGitEnv)", () => {
  expect(Object.keys(process.env).filter((k) => /^GIT_/.test(k))).toEqual([]);
  const r = spawnSync(process.execPath, ["-e", "console.log(Object.keys(process.env).filter(k=>/^GIT_/.test(k)).join(','))"], { encoding: "utf8" });
  expect(r.stdout.trim()).toBe("");
});

// ------------------------------------------------------------------ regen-spec-index.ts

describe("regen-spec-index.ts --check — stale is 4, structural is 1 (S474)", () => {
  // The script reads compiler/SPEC.md + compiler/SPEC-INDEX.md relative to its CWD, so a temp dir holding
  // COPIES is a complete, isolated input — the real checkout is never touched.
  const SPEC = readFileSync(join(REPO, "compiler/SPEC.md"), "utf8");
  const INDEX = readFileSync(join(REPO, "compiler/SPEC-INDEX.md"), "utf8");
  const SCRIPT = join(REPO, "scripts/regen-spec-index.ts");
  function tree(spec, index) {
    const d = tmp("specidx-s474-");
    mkdirSync(join(d, "compiler"));
    writeFileSync(join(d, "compiler/SPEC.md"), spec);
    writeFileSync(join(d, "compiler/SPEC-INDEX.md"), index);
    return d;
  }
  /** INDEX regenerated against `spec` (so a case fails only for the defect under test). */
  function current(spec = SPEC) {
    const d = tree(spec, INDEX);
    expect(run("bun", [SCRIPT], d).rc).toBe(0);
    return readFileSync(join(d, "compiler/SPEC-INDEX.md"), "utf8");
  }
  const check = (spec, index) => run("bun", [SCRIPT, "--check"], tree(spec, index));
  // A Sections row by key, e.g. "47".
  const rowRe = (key) => new RegExp(`^\\| ${key} \\| [^\\n]*\\n`, "m");

  test("a current index passes (0)", () => {
    expect(check(SPEC, current()).rc).toBe(0);
  });

  test("one line appended to SPEC.md → totals + last row stale → 4", () => {
    const r = check(SPEC + "extra line\n", current());
    expect(r.out).toContain("STALE");
    expect(r.rc).toBe(4);
  });

  test("a SPEC section with NO row (row deleted) → 1, structural: --write never adds a row", () => {
    const idx = current();
    expect(rowRe("47").test(idx)).toBe(true);
    const r = check(SPEC, idx.replace(rowRe("47"), ""));
    expect(r.out).toContain("TRUNCATED");
    expect(r.rc).toBe(1);
  });

  test("a row naming a section SPEC.md does not have → 1", () => {
    const idx = current().replace(rowRe("47"), (m) => m + m.replace(/^\| 47 \|/, "| 999 |"));
    const r = check(SPEC, idx);
    expect(r.out).toContain("does not have");
    expect(r.rc).toBe(1);
  });

  test("a DUPLICATE section heading in SPEC.md (`## 47.` twice) → 1, not 4 (S474 r1, review F5)", () => {
    const h = SPEC.match(/^## 47\.[^\n]*$/m);
    expect(h).not.toBeNull();
    const dup = SPEC.replace(/^## 48\./m, `${h[0]}\n\nduplicate\n\n## 48.`);
    expect(dup).not.toBe(SPEC);
    const r = check(dup, current());
    expect(r.out).toContain("duplicate SPEC section heading");
    expect(r.rc).toBe(1);
  });

  test("missing totals anchors → 1", () => {
    const idx = current().replace(/<!-- @generated:spec-index-totals END -->\n?/, "");
    expect(check(SPEC, idx).rc).toBe(1);
  });

  test("stale AND structurally broken → 1 (a stale table never hides a missing row)", () => {
    const r = check(SPEC + "extra line\n", current().replace(rowRe("47"), ""));
    expect(r.rc).toBe(1);
  });
});

// ------------------------------------------------------------------ state.ts

/**
 * A mirror tree for state.ts (whose ROOT is its own script's parent dir): every top-level entry is a symlink
 * to the real repo EXCEPT scripts/ (a copy of state.ts), docs/ (per-entry symlinks + a real known-gaps.md
 * COPY) and master-list.md (a real COPY) — the two files `--write` writes, so a write can never reach
 * through a symlink into the checkout. `.git` is symlinked so recent-sessions reads the real history.
 */
function stateMirror(gaps) {
  const root = tmp("state-s474-");
  const SPECIAL = new Set(["scripts", "docs", "master-list.md", "node_modules"]);
  for (const e of readdirSync(REPO)) {
    if (SPECIAL.has(e)) continue;
    symlinkSync(join(REPO, e), join(root, e));
  }
  mkdirSync(join(root, "scripts"));
  copyFileSync(join(REPO, "scripts/state.ts"), join(root, "scripts/state.ts"));
  mkdirSync(join(root, "docs"));
  for (const e of readdirSync(join(REPO, "docs"))) {
    if (e === "known-gaps.md") continue;
    symlinkSync(join(REPO, "docs", e), join(root, "docs", e));
  }
  writeFileSync(join(root, "docs/known-gaps.md"), gaps);
  copyFileSync(join(REPO, "master-list.md"), join(root, "master-list.md"));
  return root;
}

describe("state.ts --check — stale is 4; missing anchor 3; stray/unparseable 1; zero 2 (S474)", () => {
  const SCRIPT = (root) => join(root, "scripts/state.ts");
  let GAPS;
  beforeAll(() => {
    // Regenerate in a mirror first: the branch's own blocks may legitimately be stale (the bot owns main).
    const m = stateMirror(readFileSync(join(REPO, "docs/known-gaps.md"), "utf8"));
    expect(run("bun", [SCRIPT(m), "--write"], m).rc).toBe(0);
    GAPS = readFileSync(join(m, "docs/known-gaps.md"), "utf8");
  }, 60000);
  const checkWith = (gaps, { fresh = true } = {}) => {
    const m = stateMirror(gaps);
    if (fresh) {
      // Make recent-sessions current in THIS mirror without touching the ledger under test.
      const saved = readFileSync(join(m, "docs/known-gaps.md"), "utf8");
      run("bun", [SCRIPT(m), "--write"], m);
      writeFileSync(join(m, "docs/known-gaps.md"), saved);
    }
    return run("bun", [SCRIPT(m), "--check"], m);
  };
  const S = "<!-- @generated:gap-counts START";
  const E = "<!-- @generated:gap-counts END -->";

  test("a current mirror passes (0)", () => {
    expect(checkWith(GAPS).rc).toBe(0);
  }, 30000);

  test("a gap-counts table that disagrees with the markers → 4 (stale only)", () => {
    const s = GAPS.indexOf(S);
    const e = GAPS.indexOf(E);
    const body = GAPS.slice(s, e);
    const stale = GAPS.slice(0, s) + body.replace(/\| (\d+) \|/, (m, n) => `| ${Number(n) + 1} |`) + GAPS.slice(e);
    expect(stale).not.toBe(GAPS);
    const r = checkWith(stale);
    expect(r.out).toContain("STALE");
    expect(r.rc).toBe(4);
  }, 30000);

  test("a MISSING anchor (END deleted) → 3, never 4", () => {
    expect(checkWith(GAPS.replace(E, "")).rc).toBe(3);
  }, 30000);

  test("a STRAY second START anchor → 1", () => {
    const r = checkWith(GAPS.replace("\n## ", `\n${S} (stray) -->\n\n## `));
    expect(r.out).toContain("STRAY");
    expect(r.rc).toBe(1);
  }, 30000);

  test("an unclassifiable @gap status → non-zero, non-4 (the S307 fail-loud throw)", () => {
    const bad = GAPS.replace(/(<!-- @gap [^>]*?status=)open\b/, "$1bogus-status-s474");
    expect(bad).not.toBe(GAPS);
    const r = checkWith(bad, { fresh: false });
    expect(r.rc).not.toBe(0);
    expect(r.rc).not.toBe(4);
  }, 30000);

  test("a ledger with ZERO @gap markers → 2 (degenerate projection)", () => {
    const r = checkWith(GAPS.replace(/<!-- @gap /g, "<!-- @nogap "), { fresh: false });
    expect(r.out).toContain("MEASURED ZERO");
    expect(r.rc).toBe(2);
  }, 30000);
});

// ------------------------------------------------------------------ gen-bootstrap-severity.ts

describe("gen-bootstrap-severity.ts --check — stale is 4, a crash is not (S474)", () => {
  /** scripts/ copies, compiler/ and compiler/self-host-v2/ as per-entry symlinks with a real severity copy. */
  function sevMirror({ severity = null, specIsDir = false, mutate = null } = {}) {
    const root = tmp("sev-s474-");
    for (const e of readdirSync(REPO)) {
      if (e === "scripts" || e === "compiler" || e === "node_modules") continue;
      symlinkSync(join(REPO, e), join(root, e));
    }
    mkdirSync(join(root, "scripts"));
    for (const f of ["gen-bootstrap-severity.ts", "s34-catalog.ts"]) copyFileSync(join(REPO, "scripts", f), join(root, "scripts", f));
    if (mutate) {
      const p = join(root, "scripts/gen-bootstrap-severity.ts");
      const src = readFileSync(p, "utf8");
      const next = mutate(src);
      expect(next).not.toBe(src);
      writeFileSync(p, next);
    }
    mkdirSync(join(root, "compiler"));
    for (const e of readdirSync(join(REPO, "compiler"))) {
      if (e === "self-host-v2" || (specIsDir && e === "SPEC.md")) continue;
      symlinkSync(join(REPO, "compiler", e), join(root, "compiler", e));
    }
    if (specIsDir) mkdirSync(join(root, "compiler/SPEC.md"));
    mkdirSync(join(root, "compiler/self-host-v2"));
    for (const e of readdirSync(join(REPO, "compiler/self-host-v2"))) {
      if (e === "severity.scrml") continue;
      symlinkSync(join(REPO, "compiler/self-host-v2", e), join(root, "compiler/self-host-v2", e));
    }
    writeFileSync(join(root, "compiler/self-host-v2/severity.scrml"), severity ?? readFileSync(join(REPO, "compiler/self-host-v2/severity.scrml"), "utf8"));
    return root;
  }
  const check = (root) => run("bun", [join(root, "scripts/gen-bootstrap-severity.ts"), "--check"], root);

  test("regenerated → 0; one byte off → 4", () => {
    const m = sevMirror();
    expect(run("bun", [join(m, "scripts/gen-bootstrap-severity.ts")], m).rc).toBe(0);
    expect(check(m).rc).toBe(0);
    const cur = readFileSync(join(m, "compiler/self-host-v2/severity.scrml"), "utf8");
    const r = check(sevMirror({ severity: cur + "// stale\n" }));
    expect(r.out).toContain("STALE");
    expect(r.rc).toBe(4);
  });

  // S474 r1 (review F1): severity.test.js grades the ON-DISK table, so a broken render() would land green
  // and only break `slices` on the bot's regen PR (auto-merge never fires; every block stops updating).
  test("GENERATOR drift that changes an answer (Info rendered as Warning) → 1, never 4", () => {
    const r = check(sevMirror({ mutate: (s) => s.replace('Severity.${sev}`)', 'Severity.${sev === "Info" ? "Warning" : sev}`)') }));
    expect(r.out).toContain("DIFFERENT ANSWERS");
    expect(r.rc).toBe(1);
  });

  test("answer-neutral drift: a code moved from the `_` default to an explicit arm of the SAME severity → 4", async () => {
    const { answerMap, answerDiff } = await import("../../../scripts/gen-bootstrap-severity.ts");
    const cur = readFileSync(join(REPO, "compiler/self-host-v2/severity.scrml"), "utf8");
    const withArm = cur.replace(/^(\s*)_ :> Severity\.Error/m, '$1"E-S474-NEUTRAL" :> Severity.Error\n$1_ :> Severity.Error');
    expect(withArm).not.toBe(cur);
    expect(answerDiff(answerMap(cur), answerMap(withArm))).toEqual([]);
    expect(answerDiff(answerMap(cur), answerMap(withArm.replace('"E-S474-NEUTRAL" :> Severity.Error', '"E-S474-NEUTRAL" :> Severity.Info')))).toEqual(["E-S474-NEUTRAL: Error -> Info"]);
  });

  test("an unreadable SPEC.md (a directory) crashes → non-zero, non-4", () => {
    const r = check(sevMirror({ specIsDir: true }));
    expect(r.rc).not.toBe(0);
    expect(r.rc).not.toBe(4);
  });
});

// ------------------------------------------------------------------ bootstrap-conformance ratchet (pure)

describe("bootstrap-conformance --check ratchet — staleness never hides a CRASH/INVALID rise (S474 r1, review F2)", () => {
  test("the committed report's bucket table parses; a CRASH rise regresses, a FAIL rise does not", async () => {
    const { reportCounts, ratchetDelta } = await import("../../../scripts/bootstrap-conformance.ts");
    const was = reportCounts(readFileSync(join(REPO, "docs/bootstrap-conformance.md"), "utf8"));
    expect(was).not.toBeNull();
    // the reviewer's measurement: a broken severity.scrml took CRASH 0 → 707, PASS 283 → 247
    const crash = ratchetDelta({ ...was, CRASH: 0, PASS: 283 }, { ...was, CRASH: 707, PASS: 247 });
    expect(crash.regressed).toEqual(["CRASH 0→707"]);
    expect(crash.summary).toContain("PASS 283→247 (-36)");
    expect(ratchetDelta(was, { ...was, INVALID: (was.INVALID ?? 0) + 1 }).regressed.length).toBe(1);
    const fail = ratchetDelta(was, { ...was, FAIL: was.FAIL + 5, PASS: was.PASS - 5 });
    expect(fail.regressed).toEqual([]);
    expect(fail.summary).toContain("FAIL");
    expect(reportCounts("# no table here\n")).toBeNull();
  });
});

// ------------------------------------------------------------------ callers (stub bun)

let stubDir;
beforeAll(() => {
  stubDir = tmp("s474-stub-");
  writeFileSync(join(stubDir, "bun"), `#!/bin/sh\nprintf '%s\\n' "\${FAKE_OUT:-stub bun rc=$FAKE_RC}"\nexit "$FAKE_RC"\n`);
  chmodSync(join(stubDir, "bun"), 0o755);
});
function runShell(script, rc, cwd = REPO) {
  const r = spawnSync("bash", ["-c", script], {
    cwd, encoding: "utf8",
    env: { ...BASE_ENV, PATH: `${stubDir}:${process.env.PATH}`, FAKE_RC: String(rc) },
  });
  return { rc: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
const NON_STALE = [1, 2, 3, 5];

describe("scripts/ci-stale-warn.sh — only exit 4 warns", () => {
  // Relative to REPO (runShell's cwd), never an absolute path: a Windows path's backslashes would be
  // read by bash as escapes.
  const W = `scripts/ci-stale-warn.sh "some/block.md" bun scripts/whatever.ts --check`;
  test("rc 0 passes silently; rc 4 warns and passes", () => {
    expect(runShell(W, 0).rc).toBe(0);
    const w = runShell(W, 4);
    expect(w.rc).toBe(0);
    expect(w.out).toContain("::warning title=some/block.md stale");
  });
  for (const rc of NON_STALE) {
    test(`rc ${rc} FAILS with the same code (a broken source/instrument is never "stale")`, () => {
      const r = runShell(W, rc);
      expect(r.rc).toBe(rc);
      expect(r.out).not.toContain("::warning");
    });
  }
});

describe("ci.yml — every derived-block currency step goes through ci-stale-warn.sh; class (b) does not", () => {
  const CI = readFileSync(join(REPO, ".github/workflows/ci.yml"), "utf8");
  const ci = Bun.YAML.parse(CI);
  const steps = ci.jobs.checks.steps;
  const step = (re) => {
    const s = steps.find((x) => re.test(x.name ?? ""));
    expect(s).toBeDefined();
    return String(s.run);
  };
  test.each([
    [/^SPEC-INDEX gate/, "bun run scripts/regen-spec-index.ts --check"],
    [/^SPEC-coverage gate/, "bun scripts/spec-coverage-check.ts"],
    [/^Gap ledger \+ session index/, "bun scripts/state.ts --check"],
    [/^Bootstrap severity table/, "bun scripts/gen-bootstrap-severity.ts --check"],
    [/^Bootstrap conformance report/, "bun scripts/bootstrap-conformance.ts --check"],
  ])("%s runs `%s` through scripts/ci-stale-warn.sh", (re, cmd) => {
    const body = step(re);
    expect(body).toContain(`scripts/ci-stale-warn.sh `);
    expect(body).toMatch(new RegExp(`ci-stale-warn\\.sh .*${cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    // no bare second invocation that would bypass the mapping
    expect(body.split(cmd).length - 1).toBe(1);
  });
  test("the md shim gate (generated CODE the runtime loads) stays a plain BLOCKING check", () => {
    const body = step(/^scrml:md shim gate/);
    expect(body.trim()).toBe("bun scripts/gen-md-shim.ts --check");
  });
  test("the severity table is no longer only in the non-blocking tracking job", () => {
    expect(ci.jobs.tracking.steps.some((s) => /gen-bootstrap-severity/.test(String(s.run ?? "")))).toBe(false);
  });
});

describe("pre-push SPEC-INDEX block — only exit 4 is a warning", () => {
  const src = readFileSync(join(REPO, "scripts/git-hooks/pre-push"), "utf8");
  const m = src.match(/# BEGIN spec-index-currency\n([\s\S]*?)\n\s*# END spec-index-currency/);
  const block = () => {
    expect(m).not.toBeNull();
    return `set -e\nCURRENCY_FAILED=0\n${m[1]}\necho "CURRENCY_FAILED=$CURRENCY_FAILED"\n`;
  };
  test("rc 0 → not failed; rc 4 → WARN, not failed", () => {
    expect(runShell(block(), 0).out).toContain("CURRENCY_FAILED=0");
    const w = runShell(block(), 4);
    expect(w.out).toContain("WARN");
    expect(w.out).toContain("CURRENCY_FAILED=0");
  });
  for (const rc of NON_STALE) {
    test(`rc ${rc} → CURRENCY_FAILED=1 (push blocked)`, () => {
      const r = runShell(block(), rc);
      expect(r.out).toContain("CURRENCY_FAILED=1");
      expect(r.out).not.toContain("WARN");
    });
  }
});

describe("pre-commit SPEC-coverage block — only exit 4 is a warning", () => {
  const src = readFileSync(join(REPO, "scripts/git-hooks/pre-commit"), "utf8");
  const m = src.match(/# BEGIN spec-coverage\n([\s\S]*?)\n\s*# END spec-coverage/);
  const block = () => {
    expect(m).not.toBeNull();
    return `set -e\n${m[1]}\necho "COMMIT-ALLOWED"\n`;
  };
  test("rc 0 and rc 4 allow the commit (4 with a warning)", () => {
    expect(runShell(block(), 0).out).toContain("COMMIT-ALLOWED");
    const w = runShell(block(), 4);
    expect(w.rc).toBe(0);
    expect(w.out).toContain("stale (non-blocking");
  });
  for (const rc of [1, 2]) {
    test(`rc ${rc} blocks the commit`, () => {
      const r = runShell(block(), rc);
      expect(r.rc).toBe(1);
      expect(r.out).not.toContain("COMMIT-ALLOWED");
    });
  }
});

// ------------------------------------------------------------------ the bot's producer step

describe("generated-regen.yml — token scope, stuck-PR detection, triggers (S474 r1, review F3/F8/F9)", () => {
  const wf = Bun.YAML.parse(readFileSync(join(REPO, ".github/workflows/generated-regen.yml"), "utf8"));
  const job = wf.jobs.regen;
  test("MAPS_PAT is on the landing step only; the checkout persists no credentials", () => {
    expect(job.env.GH_TOKEN).toBeUndefined();
    const co = job.steps.find((s) => String(s.uses ?? "").startsWith("actions/checkout"));
    expect(co.with.token).toBeUndefined();
    expect(co.with["persist-credentials"]).toBe(false);
    expect(co.with["fetch-depth"]).toBe(0);
    expect(co.with.filter).toBe("blob:none");
    const withToken = job.steps.filter((s) => /MAPS_PAT/.test(JSON.stringify(s)));
    expect(withToken.map((s) => s.name)).toEqual(["Land the regen through the merge queue (only if drift)"]);
    expect(String(withToken[0].run)).toContain("git remote set-url origin");
  });
  test("an open bot PR left as is with a FAILED required check ends the run red", () => {
    const land = String(job.steps.find((s) => /^Land the regen/.test(s.name ?? "")).run);
    expect(land).toMatch(/gh pr checks "\$PR" --required/);
    expect(land).toMatch(/STUCK[\s\S]*exit 1/);
  });
  test("runs on main pushes, release tags, a daily schedule and dispatch", () => {
    expect(wf.on.push.branches).toEqual(["main"]);
    expect(wf.on.push.tags).toEqual(["v*"]);
    expect(wf.on.schedule.length).toBe(1);
    expect("workflow_dispatch" in wf.on).toBe(true);
  });
  test("cloud-maps (now read-only) no longer uses MAPS_PAT", () => {
    expect(readFileSync(join(REPO, ".github/workflows/cloud-maps.yml"), "utf8")).not.toMatch(/secrets\.MAPS_PAT/);
  });
});

// The workflow runs on ubuntu-latest only, so its shell is exercised on POSIX only (a Windows run would test
// Git-Bash path translation, not the workflow).
describe.skipIf(process.platform === "win32")("generated-regen.yml producer step — a broken producer is never committed", () => {
  const wf = Bun.YAML.parse(readFileSync(join(REPO, ".github/workflows/generated-regen.yml"), "utf8"));
  const job = wf.jobs.regen;
  const FILES = String(job.env.FILES).trim().split(/\s+/);
  const produce = String(job.steps.find((s) => s.id === "produce").run);

  /** A throwaway git repo holding every FILES path, and a `bun` stub that "regenerates" (appends to) the
   *  file its script names, exiting 1 for the script named in $FAIL_SCRIPT, or writing STRAY.md if asked. */
  function sandbox() {
    const d = tmp("regen-s474-");
    const git = (...a) => expect(spawnSync("git", a, { cwd: d, env: BASE_ENV }).status).toBe(0);
    git("init", "-q");
    // Isolation guard (see BASE_ENV): this sandbox's git must be the sandbox, never the repo under test.
    const top = spawnSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: d, env: BASE_ENV, encoding: "utf8" }).stdout.trim();
    expect(top.startsWith(d) || top.includes(d.split("/").pop())).toBe(true);
    for (const f of FILES) {
      mkdirSync(join(d, f, ".."), { recursive: true });
      writeFileSync(join(d, f), "original\n");
    }
    git("add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "base");
    const bin = join(d, ".stub");
    mkdirSync(bin);
    writeFileSync(join(bin, "bun"), `#!/bin/bash
case "$*" in
  *gen-bootstrap-severity*) f=compiler/self-host-v2/severity.scrml; s=gen-bootstrap-severity ;;
  *regen-spec-index*)       f=compiler/SPEC-INDEX.md;               s=regen-spec-index ;;
  *spec-coverage-check*)    f=docs/bootstrap-spec-coverage.md;      s=spec-coverage-check ;;
  *state.ts*)               f="docs/known-gaps.md master-list.md";  s=state ;;
  *bootstrap-conformance*)  f=docs/bootstrap-conformance.md;        s=bootstrap-conformance ;;
  *facts.ts*)               f=docs/FACTS.md;                        s=facts ;;
  *) exit 99 ;;
esac
for x in $f; do echo regenerated >> "$x"; done
[ "$s" = "$STRAY_SCRIPT" ] && echo oops > STRAY.md
[ "$s" = "$FAIL_SCRIPT" ] && exit 1
exit 0
`);
    chmodSync(join(bin, "bun"), 0o755);
    writeFileSync(join(d, ".stub/.gitignore"), "*\n");
    return { d, bin };
  }
  function runProduce(env) {
    const { d, bin } = sandbox();
    const out = join(d, ".stub/out");
    writeFileSync(out, "");
    const r = spawnSync("bash", ["-c", produce], {
      cwd: d, encoding: "utf8",
      env: { ...BASE_ENV, PATH: `${bin}:${process.env.PATH}`, FILES: FILES.join(" "), GITHUB_OUTPUT: out, ...env },
    });
    const changed = spawnSync("git", ["diff", "--name-only"], { cwd: d, encoding: "utf8", env: BASE_ENV }).stdout.trim().split("\n").filter(Boolean);
    return { rc: r.status, out: (r.stdout ?? "") + (r.stderr ?? ""), changed, ghOut: readFileSync(out, "utf8") };
  }

  test("FILES is exactly the class-(a) set (+ severity.scrml); the md shim is NOT in it", () => {
    expect(FILES.sort()).toEqual([
      "compiler/SPEC-INDEX.md", "compiler/self-host-v2/severity.scrml", "docs/FACTS.md",
      "docs/bootstrap-conformance.md", "docs/bootstrap-spec-coverage.md", "docs/known-gaps.md", "master-list.md",
    ]);
  });

  test("all producers succeed → every file regenerated, nothing reported failed", () => {
    const r = runProduce({});
    expect(r.rc).toBe(0);
    expect(r.changed.sort()).toEqual([...FILES].sort());
    expect(r.ghOut).toMatch(/^failed=\s*$/m);
  });

  test("one producer fails → ITS files are restored, the others still land, the failure is reported", () => {
    const r = runProduce({ FAIL_SCRIPT: "state" });
    expect(r.rc).toBe(0); // the step continues; the last workflow step turns the run red
    expect(r.changed).not.toContain("docs/known-gaps.md");
    expect(r.changed).not.toContain("master-list.md");
    expect(r.changed).toContain("docs/FACTS.md");
    expect(r.changed).toContain("compiler/SPEC-INDEX.md");
    expect(r.ghOut).toMatch(/^failed=.*\bstate\b/m);
    expect(r.out).toContain("::error title=generated-regen: state failed");
  });

  test("a producer writing outside FILES fails the step (the list would be wrong)", () => {
    const r = runProduce({ STRAY_SCRIPT: "facts" });
    expect(r.rc).toBe(1);
    expect(r.out).toContain("wrote outside FILES");
  });

  test("the final step fails the run whenever a producer failed", () => {
    const last = job.steps[job.steps.length - 1];
    expect(String(last.if)).toContain("steps.produce.outputs.failed != ''");
    expect(String(last.run)).toContain("exit 1");
  });
});
