/**
 * Run a GitHub Actions `run:` step the way the Linux runner does, choosing the shell from the step's
 * own `shell:` key (and job/workflow `defaults.run.shell`) — S475 r1, review F1 on #1753.
 *
 * WHY: a step with NO `shell:` runs as `bash -e {0}` — no pipefail — so `bun test … | tee log` returns
 * tee's 0 and the step is green while the tests fail. Only `shell: bash` gets
 * `bash --noprofile --norc -eo pipefail {0}`. A harness that always runs `-eo pipefail` tests a shell
 * the step does not get. Source: docs.github.com, "Workflow syntax — jobs.<job_id>.steps[*].shell"
 * (the `bash` row: "unspecified … bash -e {0}"; "bash … bash --noprofile --norc -eo pipefail {0}";
 * "sh … sh -e {0}").
 *
 * Only the Linux shells are modelled; anything else throws (the caller must not pretend).
 */
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

/** argv prefix for the shell Actions uses for `step` (the script path is appended). */
export function actionsShellArgv(step, job = {}, workflow = {}) {
  const shell = step.shell ?? job.defaults?.run?.shell ?? workflow.defaults?.run?.shell;
  if (shell === undefined) return ["bash", "-e"];
  if (shell === "bash") return ["bash", "--noprofile", "--norc", "-eo", "pipefail"];
  if (shell === "sh") return ["sh", "-e"];
  throw new Error(`actionsShellArgv: shell '${shell}' is not modelled`);
}

/** Write `step.run` to a script file and execute it as Actions would. Returns { rc, out, argv }. */
export function runActionsStep(step, { cwd, env, job, workflow } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "actions-step-"));
  try {
    const script = join(dir, "step.sh");
    writeFileSync(script, String(step.run));
    const argv = [...actionsShellArgv(step, job, workflow), script];
    const r = spawnSync(argv[0], argv.slice(1), { cwd, env, encoding: "utf8" });
    return { rc: r.status, out: (r.stdout ?? "") + (r.stderr ?? ""), argv };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
