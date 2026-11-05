/**
 * ci-pr-base-s475.test.js — the PR-relative CI steps diff against the merge ref's HEAD^1, not the stale
 * pull_request.base.sha (gap g-ci-pr-base-sha-stale-in-currency-and-census-steps-s474).
 *
 * WHY: pull_request.base.sha is fixed at the push event; actions/checkout gives a pull_request run the merge
 * ref, which GitHub can build on a NEWER main. Diffing against base.sha charges whatever landed on main in
 * between to the PR (#1711 @cb04c75d1, base.sha 62214cc1f, regen 82f6c7741). #1719 fixed the bot-owned
 * guard; the conformance-currency step, the s34-census --base and the tracking de-dup still read base.sha.
 * They now all read scripts/ci-pr-base.sh. This file:
 *   - REPRODUCES the stale-base choice on a synthetic merge ref: the old expression charges main's own
 *     self-host-v2 / §34 change to a docs-only PR; the script's base does not;
 *   - RUNS the real ci.yml step bodies (extracted from the workflow) in that sandbox with the CI env;
 *   - pins every refusal of the script (fast-forward checkout, wrong PR head, bad merge_group base, no event).
 */
import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, copyFileSync, chmodSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import { runActionsStep } from "../helpers/actions-shell.js";

const REPO = join(import.meta.dir, "../../..");
const SCRIPT = join(REPO, "scripts/ci-pr-base.sh");
const ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))),
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
};
const roots = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

const ci = Bun.YAML.parse(readFileSync(join(REPO, ".github/workflows/ci.yml"), "utf8"));
const stepOf = (job, re) => ci.jobs[job].steps.find((x) => re.test(x.name ?? ""));
const CURRENCY = stepOf("checks", /^Bootstrap conformance report/);
const CENSUS = stepOf("checks", /^§34\.0 row-provenance gate/);
const TRACKING = stepOf("tracking", /^Bootstrap conformance count/);

/**
 * main@B0 ← PR branch (docs only) ; then main moves (another PR lands a self-host-v2 file + a §34 row)
 * and GitHub builds the merge ref on that NEWER main. Returns { baseSha (pull_request.base.sha at push),
 * prHead, root, g }. HEAD is the detached merge ref, parents [new main tip, PR head].
 */
function staleBaseRepo() {
  const root = mkdtempSync(join(tmpdir(), "ci-pr-base-s475-"));
  roots.push(root);
  const g = (...a) => {
    const r = spawnSync("git", a, { cwd: root, env: ENV, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  const commit = (m) => { g("add", "-A"); g("commit", "-qm", m); };
  g("init", "-q", "-b", "main");
  g("config", "core.hooksPath", "/dev/null");
  mkdirSync(join(root, "compiler/self-host-v2"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "compiler/self-host-v2/a.scrml"), "a\n");
  writeFileSync(join(root, "compiler/SPEC.md"), "## 34. Errors\n| E-OLD | x |\n");
  writeFileSync(join(root, "docs/notes.md"), "n\n");
  commit("base");
  const baseSha = g("rev-parse", "HEAD");                 // pull_request.base.sha, frozen at the push event
  g("checkout", "-qb", "pr");
  writeFileSync(join(root, "docs/notes.md"), "n\nmore\n");
  commit("pr: docs only");
  const prHead = g("rev-parse", "HEAD");
  g("checkout", "-q", "main");                            // another PR lands on main AFTER the push event
  writeFileSync(join(root, "compiler/self-host-v2/a.scrml"), "a\nb\n");
  writeFileSync(join(root, "compiler/SPEC.md"), "## 34. Errors\n| E-OLD | x |\n| E-MAINS-OWN | no provenance |\n");
  commit("main moves");
  const mainTip = g("rev-parse", "HEAD");
  g("checkout", "-q", "--detach", "main");
  g("merge", "-q", "--no-ff", "--no-edit", "pr");         // the merge ref GitHub builds on the NEWER main
  return { root, g, baseSha, prHead, mainTip };
}

const base = (root, env, ...args) => {
  const r = spawnSync("bash", [SCRIPT, ...args], { cwd: root, env: { ...ENV, ...env }, encoding: "utf8" });
  return { rc: r.status, out: (r.stdout ?? "").trim(), err: r.stderr ?? "" };
};

/** Run a ci.yml step body the way Actions does — the shell its `shell:` key selects (none → `bash -e`;
 *  helpers/actions-shell.js, S475 r1) — with the repo's scripts stubbed in. */
function runStep(s, step, env) {
  mkdirSync(join(s.root, "scripts"), { recursive: true });
  copyFileSync(SCRIPT, join(s.root, "scripts/ci-pr-base.sh"));
  chmodSync(join(s.root, "scripts/ci-pr-base.sh"), 0o755);
  // stand-ins that record what the step decided, so the real check / census need not run here
  writeFileSync(join(s.root, "scripts/ci-stale-warn.sh"), "#!/bin/bash\necho RAN-CURRENCY-CHECK\n");
  chmodSync(join(s.root, "scripts/ci-stale-warn.sh"), 0o755);
  writeFileSync(join(s.root, "scripts/s34-census.ts"), "console.log('CENSUS-ARGS ' + process.argv.slice(2).join(' '));\n");
  const job = Object.values(ci.jobs).find((j) => (j.steps ?? []).includes(step));
  const r = runActionsStep(step, { cwd: s.root, env: { ...ENV, ...env }, job, workflow: ci });
  return { rc: r.rc, out: r.out };
}

describe("the stale-base repro (g-ci-pr-base-sha-stale-in-currency-and-census-steps-s474)", () => {
  test("REPRO: the old base.sha expression charges main's self-host-v2 change to a docs-only PR; HEAD^1 does not", () => {
    const s = staleBaseRepo();
    const touched = (b) => spawnSync("git", ["diff", "--quiet", `${b}...HEAD`, "--", "conformance/cases", "compiler/self-host-v2"],
      { cwd: s.root, env: ENV }).status !== 0;
    expect(touched(s.baseSha)).toBe(true);               // the pre-S475 wiring: a false "touched"
    const b = base(s.root, { EVENT_NAME: "pull_request", PR_HEAD: s.prHead });
    expect(b.rc).toBe(0);
    expect(b.out).toBe(s.mainTip);
    expect(touched(b.out)).toBe(false);
  });

  test("REPRO (census): the merge-base the census diffs from base.sha carries main's own §34 row; from HEAD^1 it does not", () => {
    const s = staleBaseRepo();
    const added = (ref) => {
      const mb = s.g("merge-base", ref, "HEAD");          // what s34-census.ts does with --base
      return s.g("diff", "-U0", mb, "--", "compiler/SPEC.md");
    };
    expect(added(s.baseSha)).toContain("+| E-MAINS-OWN");  // charged to the PR → a false §34.0 failure
    const b = base(s.root, { EVENT_NAME: "pull_request", PR_HEAD: s.prHead }).out;
    expect(added(b)).not.toContain("E-MAINS-OWN");
  });
});

describe("ci.yml step bodies, executed", () => {
  test("currency step: a docs-only PR on a moved main does NOT re-run the check", () => {
    const s = staleBaseRepo();
    const r = runStep(s, CURRENCY, { EVENT_NAME: "pull_request", PR_HEAD: s.prHead, MERGE_GROUP_BASE: "" });
    expect(r.rc).toBe(0);
    expect(r.out).not.toContain("RAN-CURRENCY-CHECK");
    expect(r.out).toContain("no conformance/cases or compiler/self-host-v2 change");
  });
  test("currency step: a PR that DOES touch self-host-v2 runs the check", () => {
    const s = staleBaseRepo();
    s.g("checkout", "-q", "pr");
    writeFileSync(join(s.root, "compiler/self-host-v2/b.scrml"), "b\n");
    s.g("add", "-A"); s.g("commit", "-qm", "touch");
    const prHead = s.g("rev-parse", "HEAD");
    s.g("checkout", "-q", "--detach", "main"); s.g("merge", "-q", "--no-ff", "--no-edit", "pr");
    const r = runStep(s, CURRENCY, { EVENT_NAME: "pull_request", PR_HEAD: prHead, MERGE_GROUP_BASE: "" });
    expect(r.out).toContain("RAN-CURRENCY-CHECK");
  });
  test("currency step: not the merge ref → no base → the check RUNS (fail closed)", () => {
    const s = staleBaseRepo();
    s.g("checkout", "-q", "pr");                          // a branch checkout: HEAD has one parent
    const r = runStep(s, CURRENCY, { EVENT_NAME: "pull_request", PR_HEAD: s.prHead, MERGE_GROUP_BASE: "" });
    expect(r.out).toContain("RAN-CURRENCY-CHECK");
  });
  test("currency step on merge_group reads merge_group.base_sha", () => {
    const s = staleBaseRepo();
    const r = runStep(s, CURRENCY, { EVENT_NAME: "merge_group", PR_HEAD: "", MERGE_GROUP_BASE: s.mainTip });
    expect(r.out).not.toContain("RAN-CURRENCY-CHECK");
  });
  test("census step: --base is the merge ref's HEAD^1 on a PR, HEAD~1 on a dispatch; a non-merge-ref PR checkout fails", () => {
    const s = staleBaseRepo();
    let r = runStep(s, CENSUS, { EVENT_NAME: "pull_request", PR_HEAD: s.prHead, MERGE_GROUP_BASE: "" });
    expect(r.rc).toBe(0);
    expect(r.out).toContain(`CENSUS-ARGS --check-new --base ${s.mainTip}`);
    r = runStep(s, CENSUS, { EVENT_NAME: "workflow_dispatch", PR_HEAD: "", MERGE_GROUP_BASE: "" });
    expect(r.out).toContain(`CENSUS-ARGS --check-new --base ${s.g("rev-parse", "HEAD~1")}`);
    r = runStep(s, CENSUS, { EVENT_NAME: "pull_request", PR_HEAD: "0".repeat(40), MERGE_GROUP_BASE: "" });
    expect(r.rc).not.toBe(0);
    expect(r.out).not.toContain("CENSUS-ARGS");
  });
  test("tracking step skips on a PR exactly when the blocking step runs (same touched-test)", () => {
    const touchedTest = 'BASE=$(scripts/ci-pr-base.sh) && git diff --quiet "$BASE"...HEAD -- conformance/cases compiler/self-host-v2';
    expect(String(CURRENCY.run)).toContain(touchedTest);
    expect(String(TRACKING.run)).toContain(touchedTest);
    const s = staleBaseRepo();
    const r = runStep(s, TRACKING, { EVENT_NAME: "pull_request", PR_HEAD: s.prHead });
    expect(r.out).toContain("RAN-CURRENCY-CHECK");        // untouched PR → tracking reports
  });
  test("no PR-relative step reads pull_request.base.sha any more", () => {
    for (const st of [CURRENCY, CENSUS, TRACKING]) {
      expect(JSON.stringify(st)).not.toContain("pull_request.base.sha");
    }
    expect(readFileSync(join(REPO, ".github/workflows/ci.yml"), "utf8")).not.toMatch(/\$\{\{[^}]*pull_request\.base\.sha/);
  });
});

describe("scripts/ci-pr-base.sh refusals (fail closed)", () => {
  test("pull_request on a fast-forward / branch checkout (HEAD has no second parent) → 1", () => {
    const s = staleBaseRepo();
    s.g("checkout", "-q", "pr");
    const r = base(s.root, { EVENT_NAME: "pull_request", PR_HEAD: s.prHead });
    expect(r.rc).toBe(1);
    expect(r.out).toBe("");
    expect(r.err).toContain("not the PR's merge ref");
  });
  test("pull_request whose HEAD^2 is not the PR head → 1", () => {
    const s = staleBaseRepo();
    const r = base(s.root, { EVENT_NAME: "pull_request", PR_HEAD: s.baseSha });
    expect(r.rc).toBe(1);
    expect(r.out).toBe("");
  });
  test("pull_request with an empty PR_HEAD → 1", () => {
    const s = staleBaseRepo();
    expect(base(s.root, { EVENT_NAME: "pull_request", PR_HEAD: "" }).rc).toBe(1);
  });
  test("merge_group: unresolvable or non-ancestor base → 1", () => {
    const s = staleBaseRepo();
    expect(base(s.root, { EVENT_NAME: "merge_group", MERGE_GROUP_BASE: "f".repeat(40) }).rc).toBe(1);
    expect(base(s.root, { EVENT_NAME: "merge_group", MERGE_GROUP_BASE: "" }).rc).toBe(1);
    s.g("checkout", "-q", "--detach", s.baseSha);         // HEAD older than the claimed base
    expect(base(s.root, { EVENT_NAME: "merge_group", MERGE_GROUP_BASE: s.mainTip }).rc).toBe(1);
  });
  test("any other event without --fallback → 1; with it → the fallback", () => {
    const s = staleBaseRepo();
    expect(base(s.root, { EVENT_NAME: "push" }).rc).toBe(1);
    const r = base(s.root, { EVENT_NAME: "push" }, "--fallback", "HEAD~1");
    expect(r.rc).toBe(0);
    expect(r.out).toBe(s.g("rev-parse", "HEAD~1"));
  });
});
