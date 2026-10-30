/**
 * hook-slice-trigger-list-s472.test.js — the pre-commit hook's bootstrap-slice trigger list
 * (g-hook-slice-trigger-list-misses-stdlib-s472).
 *
 * WHY THIS EXISTS. pre-commit runs the native bootstrap's slice suite only when a staged path is on a
 * hand-measured list of things the slices read ("inotify, S469"). Since S471 the slices also read the
 * REAL `stdlib/` (slice-m2/lowered.js STDLIB_ROOT; acceptance case imports/stdlib-format-refused), and
 * `stdlib/` was not on the list — so a `stdlib/`-only commit printed "Bootstrap slices: skipped" while
 * it could red a slice case. Nothing kept the list current as the slices grew new readers.
 *
 * Pinned here:
 *   1. The hook's decision block, run VERBATIM against a stub `git` that "stages" a chosen path:
 *      a stdlib-only change turns the slices ON.
 *   2. Every LITERAL repo-root read in the slice sources (`join(<file dir>, "..", …, "<top>", …)` that
 *      climbs exactly to the repo root) names a path the trigger list covers. A new slice reader of a
 *      new top-level dir goes red here until the list learns it. (Reads through a computed variable are
 *      not seen — the inotify measurement noted in the hook stays the primary method.)
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, dirname, sep } from "path";
import { spawnSync } from "child_process";

const REPO = join(import.meta.dir, "../../..");
const HOOK = readFileSync(join(REPO, "scripts/git-hooks/pre-commit"), "utf8");

/** `RUN_SLICES=0` … the `fi` closing the staged-path scan. */
function decisionBlock() {
  const m = HOOK.match(/\nRUN_SLICES=0\n[\s\S]*?\n\s*done < <\(git diff --cached --name-only --no-renames\)\nfi\n/);
  expect(m).not.toBeNull();
  return m[0];
}

/** The `case "$path" in` pattern list, as JS regexes (bash glob `*` matches `/` in `case`). */
function triggerPatterns() {
  const m = HOOK.match(/case "\$path" in\n([\s\S]*?)\)\n\s*RUN_SLICES=1/);
  expect(m).not.toBeNull();
  return m[1]
    .replace(/\\\n/g, "")
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => new RegExp("^" + p.replace(/[.+?^${}()[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"));
}

// The stub `git` is a bash FUNCTION defined ahead of the decision block, not a script put first on
// PATH (S473 windows-red): `${stub}:${PATH}` is not a PATH on Windows (`;` delimits there), so the
// real git ran, nothing was staged, and the slices always read as skipped. A function shadows the
// `git` command on every OS, and the `< <(git …)` process substitution inherits it.
const STUB_GIT = `git() { printf '%s\\n' "$STAGED"; }\n`;

function decide(staged) {
  const env = { ...process.env, STAGED: staged };
  delete env.SCRML_HOOK_SLICES;
  const r = spawnSync("bash", ["-c", `${STUB_GIT}${decisionBlock()}\necho "RUN_SLICES=$RUN_SLICES"`], { cwd: REPO, env, encoding: "utf8" });
  expect(r.status).toBe(0);
  return r.stdout.trim();
}

describe("pre-commit — bootstrap-slice trigger decision (run verbatim)", () => {
  test("a stdlib/-only staged change runs the slices (S472)", () => {
    expect(decide("stdlib/format/index.scrml")).toBe("RUN_SLICES=1");
  });
  test("control: a docs-only change still skips them; a self-host-v2 change still runs them", () => {
    expect(decide("docs/articles/x.md")).toBe("RUN_SLICES=0");
    expect(decide("compiler/self-host-v2/lex.scrml")).toBe("RUN_SLICES=1");
  });
});

function walk(d, out = []) {
  for (const e of readdirSync(d)) {
    if (e === "node_modules" || e === "dist") continue;
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|ts)$/.test(e)) out.push(p);
  }
  return out;
}

describe("pre-commit — the trigger list covers every literal repo-root read in the slices", () => {
  const SH = join(REPO, "compiler/self-host-v2");
  const files = readdirSync(SH)
    .filter((e) => e.startsWith("slice-"))
    .flatMap((e) => walk(join(SH, e)));

  test("there are slice sources to scan (the scan is not vacuous)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  test("each `join(dir, '..'×depth, '<top>', …)` read is covered by a trigger pattern", () => {
    const pats = triggerPatterns();
    const reads = [];
    const RE = /(?:join|resolve)\(\s*(?:HERE|__dirname|import\.meta\.dir|dirname\([^)]*\))\s*((?:,\s*"\.\."\s*)+)((?:,\s*"[^"]+"\s*)+)\)/g;
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const depth = relative(REPO, dirname(f)).split(sep).length;
      for (const m of src.matchAll(RE)) {
        const ups = (m[1].match(/"\.\."/g) ?? []).length;
        if (ups !== depth) continue; // not a repo-root-relative read
        const segs = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
        reads.push({ file: relative(REPO, f), path: segs.join("/") });
      }
    }
    // The S471 stdlib reader must be found, or the scan has gone blind.
    expect(reads.some((r) => r.path === "stdlib")).toBe(true);
    const uncovered = reads.filter(({ path }) => !pats.some((re) => re.test(path + "/x") || re.test(path)));
    expect(uncovered).toEqual([]);
  });
});
