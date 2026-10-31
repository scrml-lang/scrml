/**
 * windows-filter-s474.test.js — the `windows` job's PR path filter covers what its suites run and read.
 *
 * WHY (S474): until S474 a test-only PR skipped Windows (#1694), and #1698's Windows EBUSY was caught only
 * because that PR also touched compiler/src. The #1707 review (S474 r1) then traced, under inotify, every
 * tracked file the job's own commands open (`bun test compiler/tests/unit compiler/tests/conformance`, then
 * `bun test compiler/tests/e2e-render-map/`): the filter still missed the .sh scripts and git hooks the unit
 * suite spawns through bash, the workflow files it parses, .md fixtures, and examples/22-multifile. Nothing
 * tested the regex. This file pins it:
 *   1. STRUCTURAL — every path in the trace fixture (fixtures/windows-suite-reads-s474.txt) triggers the job
 *      or sits under an ALLOWLIST prefix that says why it may not. A new reader added to a suite under an
 *      uncovered path fails here once the fixture is re-traced.
 *      THE FIXTURE is the FULL trace, unreduced, one path per line, sorted (7752 tracked files): the
 *      reviewer's inotify trace of the job's own commands on a Linux checkout
 *      (~/.cache/scrml/review/s474-1707/tools/run-trace.sh → opened-tracked.txt). r1 committed a reduction
 *      (one path per first-3-dir-segments + extension); #1707 r2 N2 showed it unsound — rules cut inside
 *      filenames (compiler/tests/native- vs compiler/tests/parser-conformance-*.test.js), so 8 siblings of an
 *      allowlisted representative escaped while this test passed. STATIC: a reader added later is caught
 *      only after someone re-traces; regenerate by re-running that script and `sort`.
 *   2. A table of named paths, each with the expected decision.
 *   3. The step's own bash, run against real git history: a rename OUT of a watched path still triggers
 *      (`--no-renames`), and an uncomputable diff runs (fail closed).
 */
import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, renameSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

const REPO = join(import.meta.dir, "../../..");
const ci = Bun.YAML.parse(readFileSync(join(REPO, ".github/workflows/ci.yml"), "utf8"));
const step = ci.jobs.windows.steps.find((s) => s.id === "need");
const TRIGGER = new RegExp(step?.env?.WIN_TRIGGER ?? "(?!)");
const MD_TRIGGER = new RegExp(step?.env?.WIN_MD_TRIGGER ?? "(?!)");
/** The step's decision for one changed path, in JS (the bash below is checked to agree). */
const triggers = (p) => TRIGGER.test(p) && (!p.endsWith(".md") || MD_TRIGGER.test(p));

/**
 * Paths the suites READ that deliberately do NOT trigger Windows. Each prefix carries its reason; a prefix
 * the trace no longer needs fails the "no dead allowlist entry" test, so the list cannot grow stale.
 * `.md` anywhere outside WIN_MD_TRIGGER is the stated trade in ci.yml's windows header (SPEC.md,
 * known-gaps.md, FACTS.md … change on most PRs) and is handled by the `md` rule, not by a prefix.
 */
const ALLOW = [
  ["compiler/self-host-v2/", "its tests run in `slices` (Linux); unit tests read its sources as content (hook trigger scan, URL-guard verbatim via readText)"],
  ["compiler/tests/browser/", "listed by test-partition / hook-trigger unit tests, never executed here"],
  ["compiler/tests/commands/", "listed, not executed here"],
  ["compiler/tests/integration/", "listed, not executed here"],
  ["compiler/tests/lsp/", "listed, not executed here"],
  ["compiler/tests/parser-conformance/", "listed, not executed here"],
  ["compiler/tests/native-", "root-level parser tests: listed, not executed here"],
  ["compiler/tests/parser-conformance-", "root-level parser-conformance-*.test.js: listed, not executed here (#1707 r2 N2)"],
  ["samples/", "compile-input corpus: content, OS-neutral"],
  ["benchmarks/", "compile-input corpus"],
  ["dashboard/", "compile-input corpus"],
  ["docs/website/", "compile-input corpus"],
  ["docs/readme-snippets/", "doc snippets compiled as content"],
  ["docs/tutorial-snippets/", "doc snippets compiled as content"],
  ["examples/", "content corpus — EXCEPT examples/22-multifile/ (the multi-file path class), which triggers"],
  // (docs/generated/*.md is read too — bot-owned, and .md, so the `md` rule already covers it.)
  ["scrml.toml", "project config read as content"],
];
const allowed = (p) => ALLOW.find(([pre]) => p.startsWith(pre));

const TRACE = readFileSync(join(REPO, "compiler/tests/unit/fixtures/windows-suite-reads-s474.txt"), "utf8")
  .split(/\r?\n/).filter((l) => l && !l.startsWith("#")); // CRLF on a Windows checkout (core.autocrlf)

describe("windows filter — structural: every path the suites open is covered or allowlisted", () => {
  test("the step declares its filter as env (WIN_TRIGGER, WIN_MD_TRIGGER)", () => {
    expect(typeof step?.env?.WIN_TRIGGER).toBe("string");
    expect(typeof step?.env?.WIN_MD_TRIGGER).toBe("string");
  });
  test("the trace fixture is the real population (hundreds of classes, not a stub)", () => {
    expect(TRACE.length).toBeGreaterThan(200);
  });
  test("no traced path is uncovered", () => {
    const uncovered = TRACE.filter((p) => !triggers(p) && !allowed(p) && !p.endsWith(".md"));
    expect(uncovered).toEqual([]);
  });
  test("a traced .md that does not trigger is outside the suite trees (the stated trade), never a fixture", () => {
    const bad = TRACE.filter((p) => p.endsWith(".md") && !triggers(p) && !allowed(p) && MD_TRIGGER.test(p));
    expect(bad).toEqual([]);
  });
  test("no dead allowlist entry: each prefix still covers a traced path the filter does not", () => {
    const dead = ALLOW.filter(([pre]) => !TRACE.some((p) => p.startsWith(pre) && !triggers(p) && !p.endsWith(".md")));
    expect(dead.map(([pre]) => pre)).toEqual([]);
  });
});

describe("windows filter — named paths", () => {
  test.each([
    // S474 r1 F1: shell scripts + hooks the unit suite spawns through bash, and workflow files it parses
    ["scripts/bot-owned-untouched.sh", true],
    ["scripts/ci-stale-warn.sh", true],
    ["scripts/git-hooks/pre-commit", true],
    ["scripts/state.ts", true],
    [".github/workflows/generated-regen.yml", true],
    [".github/workflows/ci.yml", true],
    [".github/windows-baseline.json", true],
    [".gitattributes", true],
    // F6: .md fixtures inside the suite trees trigger
    ["compiler/tests/unit/fixtures/spec-coverage/coverage.md", true],
    ["scripts/flograph-fixture/sample.md", true],
    // F7
    ["examples/22-multifile/app.scrml", true],
    ["compiler/src/codegen/emit-expr.ts", true],
    ["compiler/tests/unit/some.test.js", true],
    ["conformance/cases/x/case.scrml", true],
    // the stated .md trade and the deliberate exclusions
    ["compiler/SPEC.md", false],
    ["docs/known-gaps.md", false],
    ["compiler/src/codegen/README.md", false],
    ["compiler/self-host-v2/lex.scrml", false],
    ["compiler/tests/integration/x.test.js", false],
    ["examples/23-trucking-dispatch/app.scrml", false],
    ["handOffs/hand-off-474.md", false],
    [".github/CI.md", false],
  ])("%s → %p", (p, want) => {
    expect(triggers(p)).toBe(want);
  });
});

// The step's real bash against real git history. POSIX only: on Windows it would test Git Bash path
// translation of the sandbox, not the step (the step itself runs in Git Bash on the runner).
describe.skipIf(process.platform === "win32")("windows filter — the step's own script", () => {
  const ENV = {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))),
    GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
  };
  const roots = [];
  afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });
  function repo() {
    const root = mkdtempSync(join(tmpdir(), "win-filter-s474-"));
    roots.push(root);
    const g = (...a) => {
      const r = spawnSync("git", a, { cwd: root, env: ENV, encoding: "utf8" });
      if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`);
    };
    g("init", "-q", "-b", "main");
    g("config", "core.hooksPath", "/dev/null");
    mkdirSync(join(root, "compiler/src"), { recursive: true });
    writeFileSync(join(root, "compiler/src/guard.js"), "export const x = 1;\n".repeat(20));
    writeFileSync(join(root, "README.md"), "r\n");
    g("add", "-A"); g("commit", "-qm", "base");
    return { root, g };
  }
  const runStep = (root, event = "pull_request") => {
    const out = join(root, ".gh-out");
    writeFileSync(out, "");
    const r = spawnSync("bash", ["-eo", "pipefail", "-c", String(step.run)], {
      cwd: root, encoding: "utf8",
      env: { ...ENV, EVENT: event, WIN_TRIGGER: step.env.WIN_TRIGGER, WIN_MD_TRIGGER: step.env.WIN_MD_TRIGGER, GITHUB_OUTPUT: out },
    });
    expect(r.status).toBe(0);
    return readFileSync(out, "utf8").trim();
  };

  test("BITE (F2): a file moved OUT of a watched path still triggers (--no-renames lists the source)", () => {
    const { root, g } = repo();
    mkdirSync(join(root, "compiler/self-host-v2"), { recursive: true });
    renameSync(join(root, "compiler/src/guard.js"), join(root, "compiler/self-host-v2/guard.js"));
    g("add", "-A"); g("commit", "-qm", "move");
    expect(runStep(root)).toBe("run=true");
  });

  test("a docs-only change does not trigger; the bash agrees with the JS reading", () => {
    const { root, g } = repo();
    writeFileSync(join(root, "README.md"), "changed\n");
    g("commit", "-qam", "docs");
    expect(runStep(root)).toBe("run=false");
  });

  test("an .md fixture inside a suite tree triggers in the bash too", () => {
    const { root, g } = repo();
    mkdirSync(join(root, "scripts/flograph-fixture"), { recursive: true });
    writeFileSync(join(root, "scripts/flograph-fixture/sample.md"), "s\n");
    g("add", "-A"); g("commit", "-qm", "fixture");
    expect(runStep(root)).toBe("run=true");
  });

  test("an uncomputable diff (no parent commit) runs — fail closed", () => {
    const { root } = repo();
    expect(runStep(root)).toBe("run=true");
  });

  test("a non-PR event always runs", () => {
    const { root } = repo();
    expect(runStep(root, "push")).toBe("run=true");
  });
});
