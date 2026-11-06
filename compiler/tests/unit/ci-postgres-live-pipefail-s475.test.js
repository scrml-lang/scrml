/**
 * ci-postgres-live-pipefail-s475.test.js — the `postgres-live` step fails when its tests fail (S475 r1,
 * review F1 on #1753).
 *
 * WHY: the step pipes `bun test … 2>&1 | tee pg-live.log`. With no `shell:` key Actions runs it as
 * `bash -e {0}` (no pipefail), so the pipeline's status is tee's 0 and the job is green with ` 1 fail` in
 * the log. `shell: bash` makes it `bash --noprofile --norc -eo pipefail {0}`. This file extracts the step
 * from ci.yml and EXECUTES its `run:` under the shell its own `shell:` key selects
 * (helpers/actions-shell.js), with a stand-in `bun` on PATH:
 *   failing tests → nonzero; passing tests → 0; a skipped live test → nonzero (the step's own grep).
 * And it pins the hazard itself: the same text under the no-`shell:` default exits 0 on failing tests.
 */
import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, chmodSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { actionsShellArgv, runActionsStep } from "../helpers/actions-shell.js";

const REPO = join(import.meta.dir, "../../..");
const ci = Bun.YAML.parse(readFileSync(join(REPO, ".github/workflows/ci.yml"), "utf8"));
const JOB = ci.jobs["postgres-live"];
const STEP = JOB?.steps.find((s) => /^Bootstrap live Postgres tests/.test(s.name ?? ""));

const roots = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

/** A sandbox whose PATH has a stand-in `bun` printing `output` and exiting `rc`. */
function runWithStandIn(step, output, rc) {
  const root = mkdtempSync(join(tmpdir(), "pg-live-pipefail-s475-"));
  roots.push(root);
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(root, "bun-output.txt"), output + "\n");
  writeFileSync(join(bin, "bun"), `#!/bin/sh\ncat '${join(root, "bun-output.txt")}'\nexit ${rc}\n`);
  chmodSync(join(bin, "bun"), 0o755);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  return runActionsStep(step, { cwd: root, env, job: JOB, workflow: ci });
}

const FAILING = " 3 pass\n 1 fail\nRan 4 tests across 3 files.";
const PASSING = " 4 pass\n 0 fail\nRan 4 tests across 3 files.";
const SKIPPED = " 3 pass\n 1 skip\n 0 fail\nRan 4 tests across 3 files.";

describe("ci.yml postgres-live: the live-PG step's exit status follows the tests (pipefail)", () => {
  test("the step exists and pipes through tee (the shape this file guards)", () => {
    expect(STEP).toBeDefined();
    expect(String(STEP.run)).toMatch(/bun test[\s\S]*\|\s*tee pg-live\.log/);
  });

  test("it runs under pipefail: its own shell is `bash --noprofile --norc -eo pipefail`", () => {
    expect(actionsShellArgv(STEP, JOB, ci)).toEqual(["bash", "--noprofile", "--norc", "-eo", "pipefail"]);
  });

  test("EXECUTED BITE: failing tests → the step exits nonzero", () => {
    const r = runWithStandIn(STEP, FAILING, 1);
    expect(r.out).toContain(" 1 fail");
    expect(r.rc).not.toBe(0);
  });

  test("EXECUTED: passing tests → 0", () => {
    expect(runWithStandIn(STEP, PASSING, 0).rc).toBe(0);
  });

  test("EXECUTED BITE: a SKIPPED live test → nonzero, even though bun exits 0", () => {
    const r = runWithStandIn(STEP, SKIPPED, 0);
    expect(r.rc).toBe(1);
    expect(r.out).toContain("was SKIPPED");
  });

  test("the hazard, pinned: the same text with NO `shell:` (Actions' `bash -e`) is green on failing tests", () => {
    const { shell, ...noShell } = STEP;
    const r = runWithStandIn(noShell, FAILING, 1);
    expect(r.argv.slice(0, 2)).toEqual(["bash", "-e"]);
    expect(r.rc).toBe(0);
  });
});
