/**
 * hook-prepush-suite-verdict-s478.test.js — change-id s478-hook-shards, gap g-hook-sharded-prepush-exit-s477.
 *
 * SYMPTOM (S477): the sharded pre-push suite exited non-zero with "0 fail", and once printed no counts at all.
 * ROOT: bun reports an error thrown OUTSIDE any test ("# Unhandled error between tests") as " 0 fail" +
 * " 1 error" and exit 1, with no `(fail)` line. scripts/test-sharded.ts did not count it, and the pre-push hook
 * printed only the counts and the `(fail)` lines — so the cause (that error, or a shard killed at the memory
 * ceiling / by a signal / by its timeout, or an integrity error) never reached the user. A runner that died
 * before its TOTAL line printed "Tests: , , ".
 *
 * Pinned here (pa-base §8: a gate must be shown to BITE, and a probe's error must never read as success):
 *   1. the runner, run for real on throwaway test files: a passing file → exit 0 + "RESULT: PASS"; a failing
 *      test → exit 1 + "RESULT: FAIL — 1 test(s) failed"; an unhandled error with 0 failing tests → exit 1,
 *      the error counted, "RESULT: FAIL — 1 unhandled error(s)…".
 *   2. pre-push's `suite-verdict` block, run verbatim: every non-zero exit blocks and prints its reason; an
 *      exit 0 with no summary, or with a RESULT: FAIL line, blocks too; a finished green run passes — for the
 *      sharded runner (current and pre-S478 output) and for the single-process `bun test` output.
 */

import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

const REPO = join(import.meta.dir, "../../..");
// Each runner test starts a nested `bun test`; on a box loaded by other lanes' hooks that can pass bun's 5 s
// default (cf. g-test-import-host-js-decorators-timeout-flake-s477), so they get their own bound.
const RUN_TIMEOUT = 60000;
const roots = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});
const tmp = (p) => {
  const d = mkdtempSync(join(tmpdir(), p));
  roots.push(d);
  return d;
};

// ------------------------------------------------------------------ 1. the runner, for real

// The sharded runner is the POSIX git-hook tool (process trees, RSS sampling); it does not run on Windows.
describe.skipIf(process.platform === "win32")("test-sharded.ts — exit status and RESULT line follow the run (S478)", () => {
  // SCRML_TEST_TIMINGS in a private dir moves the timing cache, the run logs AND the machine-wide slot pool
  // there (all three live next to the cache), so these runs never touch or wait on the real hooks' slots.
  const dir = tmp("s478-verdict-");
  const env = { ...process.env, SCRML_TEST_TIMINGS: join(dir, "timings.json"), SCRML_HOOK_SLOTS: "2" };
  delete env.SCRML_HOOK_SHARDS;
  const file = (name, body) => {
    const p = join(dir, name);
    writeFileSync(p, `import { test, expect, afterAll } from "bun:test";\n${body}\n`);
    return p;
  };
  const runWith = (args) => {
    const r = spawnSync(process.execPath, [join(REPO, "scripts/test-sharded.ts"), ...args], {
      cwd: REPO,
      encoding: "utf8",
      env,
      timeout: 120000,
    });
    return { rc: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
  };
  const runner = (...files) => {
    const r = spawnSync(process.execPath, [join(REPO, "scripts/test-sharded.ts"), "--shards=2", ...files], {
      cwd: REPO,
      encoding: "utf8",
      env,
      timeout: 120000,
    });
    return { rc: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
  };
  const ok = file("ok.test.js", `test("ok", () => { expect(1).toBe(1); });`);

  test("all green → exit 0, RESULT: PASS", () => {
    const r = runner(ok, file("ok2.test.js", `test("ok2", () => { expect(2).toBe(2); });`));
    expect(r.out).toContain("RESULT: PASS");
    expect(r.rc).toBe(0);
  }, RUN_TIMEOUT);

  test("a failing test → exit 1, RESULT names it (the bite)", () => {
    const r = runner(ok, file("bad.test.js", `test("deliberately red", () => { expect(1).toBe(2); });`));
    expect(r.rc).toBe(1);
    expect(r.out).toMatch(/^RESULT: FAIL — 1 test\(s\) failed/m);
    expect(r.out).toContain("(fail) deliberately red");
  }, RUN_TIMEOUT);

  test("an unhandled error outside any test (0 fail) → exit 1, counted and named", () => {
    const r = runner(ok, file("late.test.js", `test("fine", () => { expect(1).toBe(1); });\nafterAll(() => { Promise.reject(new Error("late reject")); });`));
    expect(r.rc).toBe(1);
    expect(r.out).toMatch(/^TOTAL: 2 pass, 0 fail, 1 error,/m);
    expect(r.out).toMatch(/^RESULT: FAIL — 1 unhandled error\(s\) outside any test/m);
    expect(r.out).toMatch(/\(error\) Unhandled error between tests in .*late\.test\.js/);
    expect(r.out).toContain("late reject"); // the failure report carries the error itself
  }, RUN_TIMEOUT);

  // Review F2 (S478 fix round 1): the banner and the " N errors" count are acted on only when the shard exits
  // non-zero. A PASSING test that prints both used to bail the run under --bail and end RESULT: FAIL, rc 1.
  test("a passing test that PRINTS '# Unhandled error…' and ' 3 errors' → PASS under --bail", () => {
    const printy = file("printy.test.js", `test("prints", () => { console.log(" 3 errors"); console.log("# Unhandled error between tests"); expect(1).toBe(1); });`);
    const r = runWith(["--shards=2", "--bail", ok, printy]);
    expect(r.out).toMatch(/^TOTAL: 2 pass, 0 fail, 0 error,/m);
    expect(r.out).toContain("RESULT: PASS");
    expect(r.out).not.toContain("(error) Unhandled error");
    expect(r.rc).toBe(0);
  }, RUN_TIMEOUT);

  test("…and a REAL unhandled error (afterAll rejection) still FAILS under --bail", () => {
    const late = file("late2.test.js", `test("fine", () => { expect(1).toBe(1); });\nafterAll(() => { Promise.reject(new Error("late reject 2")); });`);
    const r = runWith(["--shards=2", "--bail", ok, late]);
    expect(r.rc).toBe(1);
    expect(r.out).toMatch(/^RESULT: FAIL — 1 unhandled error\(s\) outside any test/m);
    expect(r.out).toMatch(/\(error\) Unhandled error between tests in .*late2\.test\.js/);
  }, RUN_TIMEOUT);
});

// ------------------------------------------------------------------ 1b. the memory ceiling: env floor vs exact flag

// The sharded runner is the POSIX git-hook tool (process trees, RSS sampling); it does not run on Windows.
describe.skipIf(process.platform === "win32")("test-sharded.ts — SCRML_HOOK_SHARD_MEM_MB is a floor, --shard-mem is exact (S478 review F1)", () => {
  const dir = tmp("s478-ceiling-");
  const env = { ...process.env, SCRML_TEST_TIMINGS: join(dir, "timings.json"), SCRML_HOOK_SLOTS: "2" };
  delete env.SCRML_HOOK_SHARDS;
  delete env.SCRML_HOOK_SHARD_MEM_MB;
  const okFile = join(dir, "ok.test.js");
  writeFileSync(okFile, `import { test, expect } from "bun:test";\ntest("ok", () => { expect(1).toBe(1); });\n`);
  const run = (extraEnv, args, files = [okFile]) => {
    const r = spawnSync(process.execPath, [join(REPO, "scripts/test-sharded.ts"), ...args, ...files], {
      cwd: REPO,
      encoding: "utf8",
      env: { ...env, ...extraEnv },
      timeout: 120000,
    });
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    return { rc: r.status, out, header: out.split("\n").find((l) => /^test-sharded: \d+ files in/.test(l)) ?? "" };
  };

  // The lane workaround (SCRML_HOOK_SHARD_MEM_MB=4608) with memory short (a huge reserve -> memory-derived N=1):
  // the whole suite in one shard gets the adaptive 7680, not a 4608 cap (measured N=1 peak 5009 MB — 4608 killed
  // it). The header names the floor.
  test("explicit env 4608 at a memory-derived N=1 → ceiling 7680 (adaptive), floor named", () => {
    const r = run({ SCRML_HOOK_MEM_RESERVE_MB: "10000000", SCRML_HOOK_SHARD_MEM_MB: "4608" }, []);
    expect(r.header).toContain("1 shard(s)");
    expect(r.header).toContain("ceiling 7680 MB per shard (adaptive, floor 4608 MB from SCRML_HOOK_SHARD_MEM_MB)");
    expect(r.rc).toBe(0);
  }, RUN_TIMEOUT);

  test("an env value above the adaptive ceiling raises it (a floor, not ignored)", () => {
    const r = run({ SCRML_HOOK_SHARD_MEM_MB: "9000" }, ["--shards=1", "--plan"]);
    expect(r.out).toMatch(/^shard 0: 1 files, est [0-9.]+, ceiling 9000 MB$/m);
  }, RUN_TIMEOUT);

  test("--shard-mem is exact: below the adaptive value, and over the env floor", () => {
    const r = run({ SCRML_HOOK_SHARD_MEM_MB: "4608" }, ["--shards=1", "--shard-mem=600"]);
    expect(r.header).toContain("ceiling 600 MB per shard (--shard-mem, exact)");
  }, RUN_TIMEOUT);

  // The review's probe of the ceiling itself: an exact 600 MB ceiling and a ~1 GB allocation must be killed.
  test("--shard-mem=600 with a 1 GB allocation → MEMORY CEILING kill, RESULT: FAIL (the bite)", () => {
    const mem = join(dir, "mem.test.js");
    writeFileSync(
      mem,
      `import { test, expect } from "bun:test";\ntest("mem", async () => { const a = []; for (let i = 0; i < 40; i++) a.push(Buffer.alloc(25 * 1024 * 1024, 1)); await Bun.sleep(4000); expect(a.length).toBe(40); }, 20000);\n`,
    );
    const r = run({}, ["--shards=1", "--shard-mem=600"], [mem]);
    expect(r.out).toMatch(/MEMORY CEILING: \d+ MB > 600 MB/);
    expect(r.out).toMatch(/^RESULT: FAIL — shard 0: memory/m);
    expect(r.rc).toBe(1);
  }, RUN_TIMEOUT);
});

// ------------------------------------------------------------------ 2. pre-push's verdict block, verbatim

describe("pre-push suite-verdict block — no failure without its cause, no exit 0 without a finished run", () => {
  const src = readFileSync(join(REPO, "scripts/git-hooks/pre-push"), "utf8");
  const m = src.match(/# BEGIN suite-verdict\n([\s\S]*?)\n\s*# END suite-verdict/);
  const logDir = tmp("s478-prepush-log-");
  const verdict = (sharded, exitCode, output) => {
    expect(m).not.toBeNull();
    const script = `set -e\nSHARDED=${sharded}\nEXIT_CODE=${exitCode}\nTEST_OUTPUT=$(cat "$1")\n${m[1]}\necho "SUITE_BLOCK=$SUITE_BLOCK"\n`;
    const input = join(logDir, `out-${Math.random().toString(36).slice(2)}.txt`);
    writeFileSync(input, output);
    const r = spawnSync("bash", ["-c", script, "verdict", input], {
      encoding: "utf8",
      env: { ...process.env, XDG_CACHE_HOME: logDir },
    });
    return { rc: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
  };

  const shardedGreen = [
    "[s0] ok: 3 files, 10 pass, 0 fail, 0 skip, 1.0s",
    "TOTAL: 10 pass, 0 fail, 0 error, 0 skip, 0 todo, 12 expect() calls; ran 10 tests across 3 files in 1.0s wall",
    "",
    "RESULT: PASS",
  ].join("\n");
  const shardedUnhandled = [
    "[s1] (error) Unhandled error between tests in compiler/tests/unit/x.test.js",
    "[s1] FAILED (exit 1): 1 files, 4 pass, 0 fail, 1 UNHANDLED ERROR(S), 0 skip, 0.1s",
    "# Unhandled error between tests",
    "error: late reject",
    "TOTAL: 10 pass, 0 fail, 1 error, 0 skip, 0 todo, 12 expect() calls; ran 10 tests across 3 files in 1.0s wall",
    "FAILED shard(s): 1 (failed)",
    "",
    'RESULT: FAIL — 1 unhandled error(s) outside any test (bun prints "# Unhandled error between tests"; exit 1 with 0 fail)',
  ].join("\n");
  const shardedMemoryKill = [
    "[s2] MEMORY CEILING: 3100 MB > 3072 MB — killing shard 2",
    "PARTIAL TOTAL (not every shard finished): 8 pass, 0 fail, 0 error, 0 skip, 0 todo, 9 expect() calls; ran 8 tests across 2 files in 9.0s wall",
    "FAILED shard(s): 2 (memory)",
    "",
    "RESULT: FAIL — shard 2: memory",
  ].join("\n");

  test("sharded, green → not blocked", () => {
    const r = verdict(1, 0, shardedGreen);
    expect(r.out).toContain("SUITE_BLOCK=0");
    expect(r.out).toContain("Tests: 10 pass, 0 fail, 0 error, 0 skip");
  });

  test("sharded, pre-S478 runner (TOTAL, no RESULT line), green → not blocked", () => {
    const r = verdict(1, 0, "TOTAL: 10 pass, 0 fail, 0 skip, 0 todo, 1 expect() calls; ran 10 tests across 3 files in 1.0s wall\n");
    expect(r.out).toContain("SUITE_BLOCK=0");
  });

  test("sharded, exit 1 with 0 fail from an unhandled error → blocked, the cause printed", () => {
    const r = verdict(1, 1, shardedUnhandled);
    expect(r.out).toContain("SUITE_BLOCK=1");
    expect(r.out).toContain("Tests: 10 pass, 0 fail, 1 error, 0 skip");
    expect(r.out).toContain("RESULT: FAIL — 1 unhandled error(s)");
    expect(r.out).toContain("(error) Unhandled error between tests in compiler/tests/unit/x.test.js");
  });

  test("sharded, exit 1 from a memory-ceiling kill → blocked, the shard and reason printed", () => {
    const r = verdict(1, 1, shardedMemoryKill);
    expect(r.out).toContain("SUITE_BLOCK=1");
    expect(r.out).toContain("RESULT: FAIL — shard 2: memory");
  });

  test("sharded, exit 1 and no TOTAL line (runner died) → blocked, says it is not a test result, shows the tail", () => {
    const r = verdict(1, 3, "test-sharded: 3 files in 2 shard(s)\nTypeError: boom\n    at main (scripts/test-sharded.ts:1:1)\n");
    expect(r.out).toContain("SUITE_BLOCK=1");
    expect(r.out).toContain("No test summary was printed");
    expect(r.out).toContain("TypeError: boom");
  });

  test("sharded, exit 0 but no TOTAL line → blocked (an exit 0 is not evidence of a pass)", () => {
    const r = verdict(1, 0, "test-sharded: 3 files in 2 shard(s)\n");
    expect(r.out).toContain("SUITE_BLOCK=1");
    expect(r.out).toContain("printed no test summary");
  });

  test("sharded, exit 0 but RESULT: FAIL → blocked", () => {
    const r = verdict(1, 0, shardedMemoryKill);
    expect(r.out).toContain("SUITE_BLOCK=1");
    expect(r.out).toContain("its verdict is FAIL");
  });

  const bunSummary = (pass, fail, error) =>
    [`some test output mentioning 99 pass`, "", ` ${pass} pass`, ` ${fail} fail`, ...(error ? [` ${error} error`] : []), " 5 expect() calls", `Ran ${pass + fail} tests across 2 files. [1.00s]`].join("\n");

  test("single-process, green → not blocked; counts come from bun's summary lines, not stray text", () => {
    const r = verdict(0, 0, bunSummary(5, 0, 0));
    expect(r.out).toContain("SUITE_BLOCK=0");
    expect(r.out).toContain("Tests: 5 pass, 0 fail, 0 error,");
  });

  test("single-process, exit 1 with 0 fail + 1 error → blocked, the error count shown", () => {
    const out = "x.test.js:\n\n# Unhandled error between tests\nerror: late reject\n" + bunSummary(5, 0, 1);
    const r = verdict(0, 1, out);
    expect(r.out).toContain("SUITE_BLOCK=1");
    expect(r.out).toContain("Tests: 5 pass, 0 fail, 1 error,");
    expect(r.out).toContain("# Unhandled error between tests");
  });

  test("single-process, exit 0 with no 'Ran N tests' line → blocked", () => {
    const r = verdict(0, 0, "bun test v1.4.3\n");
    expect(r.out).toContain("SUITE_BLOCK=1");
  });

  // Review F3 (S478 fix round 1): one log per run — the single machine-wide file let concurrent pushes overwrite
  // each other's log.
  const logPath = (out) => /Full output: (\S+)/.exec(out)?.[1];
  // git-bash on Windows prints the mktemp path in POSIX form (/c/...), which a Windows `join` cannot match.
  test.skipIf(process.platform === "win32")("the full output is kept on disk, in a per-run file, and its path printed", () => {
    const a = verdict(1, 1, shardedUnhandled);
    const b = verdict(1, 1, shardedMemoryKill);
    const pa = logPath(a.out);
    const pb = logPath(b.out);
    expect(pa).toStartWith(join(logDir, "scrml/pre-push-suite-logs/pre-push-suite-"));
    expect(pb).toStartWith(join(logDir, "scrml/pre-push-suite-logs/pre-push-suite-"));
    expect(pa).not.toBe(pb);
    expect(readFileSync(pa, "utf8")).toContain("late reject");
    expect(readFileSync(pb, "utf8")).toContain("shard 2: memory");
  });
});
