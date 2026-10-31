/**
 * bot-owned-untouched-s474.test.js — a PR must not modify or delete docs/generated/** (S474).
 *
 * WHY: generated-regen.yml rewrites docs/generated/* on main after every merge; GitHub's merge runs no
 * custom merge driver, so a PR carrying its own copy of a line the bot rewrites goes DIRTY when the bot
 * lands (#1702 → #1699, #1701 DIRTY on the gap-counts rows). scripts/bot-owned-untouched.sh is the CI
 * guard (ci.yml `checks`). Pinned: add = allowed; modify / delete / rename-away = refused; main's own
 * changes merged into the branch never count (three-dot); an uncomputable diff fails closed. Plus the
 * wiring: ci.yml runs it on pull_request, exempting only the bot's branch.
 */
import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, renameSync, symlinkSync, copyFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

const REPO = join(import.meta.dir, "../../..");
const SCRIPT = join(REPO, "scripts/bot-owned-untouched.sh");
// No GIT_* from a hook environment may reach the sandbox's git (see generated-stale-exit-codes-s474).
const ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))),
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
};
const roots = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "bot-owned-s474-"));
  roots.push(root);
  const g = (...a) => {
    const r = spawnSync("git", a, { cwd: root, env: ENV, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`);
    return r.stdout;
  };
  g("init", "-q", "-b", "main");
  g("config", "core.hooksPath", "/dev/null");
  mkdirSync(join(root, "docs/generated"), { recursive: true });
  writeFileSync(join(root, "docs/known-gaps.md"), "ledger\n");
  writeFileSync(join(root, "docs/generated/gap-counts.md"), "| HIGH | 1 | 0 |\n");
  g("add", "-A"); g("commit", "-qm", "base");
  g("checkout", "-qb", "pr");
  const check = () => {
    const r = spawnSync("bash", [SCRIPT, "main"], { cwd: root, env: ENV, encoding: "utf8" });
    return { rc: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
  };
  const commit = (msg) => { g("add", "-A"); g("commit", "-qm", msg); };
  return { root, g, check, commit };
}

describe("scripts/bot-owned-untouched.sh", () => {
  test("a PR editing only hand-written files passes (0)", () => {
    const s = sandbox();
    writeFileSync(join(s.root, "docs/known-gaps.md"), "ledger\nnew gap\n");
    s.commit("gap");
    expect(s.check().rc).toBe(0);
  });

  test("ADDING a file under docs/generated/ is allowed (how a block moves there)", () => {
    const s = sandbox();
    writeFileSync(join(s.root, "docs/generated/recent-sessions.md"), "- x\n");
    s.commit("add");
    expect(s.check().rc).toBe(0);
  });

  test("BITE: modifying a bot-owned file → 1, naming it", () => {
    const s = sandbox();
    writeFileSync(join(s.root, "docs/generated/gap-counts.md"), "| HIGH | 2 | 0 |\n");
    s.commit("regen by habit");
    const r = s.check();
    expect(r.rc).toBe(1);
    expect(r.out).toContain("docs/generated/gap-counts.md");
  });

  test("BITE: deleting or renaming one away → 1", () => {
    const s = sandbox();
    renameSync(join(s.root, "docs/generated/gap-counts.md"), join(s.root, "docs/gap-counts.md"));
    s.commit("move away");
    expect(s.check().rc).toBe(1);
  });

  test("main's own bot regen, merged into the branch, does not count (three-dot diff)", () => {
    const s = sandbox();
    writeFileSync(join(s.root, "docs/known-gaps.md"), "ledger\nnew gap\n");
    s.commit("gap");
    s.g("checkout", "-q", "main");
    writeFileSync(join(s.root, "docs/generated/gap-counts.md"), "| HIGH | 9 | 0 |\n");
    s.commit("bot regen");
    s.g("checkout", "-q", "pr");
    s.g("merge", "-q", "--no-edit", "main");
    expect(s.check().rc).toBe(0);
  });

  // POSIX only: a symlink needs a privilege on Windows (and core.symlinks=false there checks it out as text).
  test.skipIf(process.platform === "win32")("BITE (S474 r1 F3): a bot-owned file replaced by a SYMLINK (type change) → 1", () => {
    const s = sandbox();
    rmSync(join(s.root, "docs/generated/gap-counts.md"));
    symlinkSync("../known-gaps.md", join(s.root, "docs/generated/gap-counts.md"));
    s.commit("type change");
    expect(s.g("diff", "--name-status", "main...HEAD")).toMatch(/^T\s+docs\/generated\/gap-counts\.md/m);
    const r = s.check();
    expect(r.rc).toBe(1);
    expect(r.out).toContain("docs/generated/gap-counts.md");
  });

  test("an uncomputable diff (unknown base) fails closed → 1", () => {
    const s = sandbox();
    const r = spawnSync("bash", [SCRIPT, "no-such-ref"], { cwd: s.root, env: ENV, encoding: "utf8" });
    expect(r.status).toBe(1);
  });
});

describe("scripts/bot-owned-untouched.sh --bot (S474 r1 F4: the bot is checked, not waved through)", () => {
  /** A sandbox carrying the real generated-regen.yml, so --bot reads the real FILES list. */
  function botSandbox() {
    const s = sandbox();
    s.g("checkout", "-q", "main");
    mkdirSync(join(s.root, ".github/workflows"), { recursive: true });
    copyFileSync(join(REPO, ".github/workflows/generated-regen.yml"), join(s.root, ".github/workflows/generated-regen.yml"));
    s.commit("wf");
    s.g("checkout", "-q", "-B", "bot/generated-regen");
    const bot = () => {
      const r = spawnSync("bash", [SCRIPT, "--bot", "main"], { cwd: s.root, env: ENV, encoding: "utf8" });
      return { rc: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
    };
    return { ...s, bot };
  }
  test("the bot changing only its FILES passes", () => {
    const s = botSandbox();
    writeFileSync(join(s.root, "docs/generated/gap-counts.md"), "| HIGH | 3 | 0 |\n");
    s.commit("regen");
    expect(s.bot().rc).toBe(0);
  });
  test("BITE: a bot-named branch that also edits a hand-written file → 1, naming it", () => {
    const s = botSandbox();
    writeFileSync(join(s.root, "docs/generated/gap-counts.md"), "| HIGH | 3 | 0 |\n");
    writeFileSync(join(s.root, "docs/known-gaps.md"), "tampered\n");
    s.commit("regen + more");
    const r = s.bot();
    expect(r.rc).toBe(1);
    expect(r.out).toContain("docs/known-gaps.md");
  });
  test("BITE (#1707 r2 N1): a head that WIDENS its own FILES (compiler/src + the workflow) → 1 — FILES is read from the base", () => {
    const s = botSandbox();
    mkdirSync(join(s.root, "compiler/src"), { recursive: true });
    writeFileSync(join(s.root, "compiler/src/runtime-url-guard.js"), "// forged\n");
    const wf = join(s.root, ".github/workflows/generated-regen.yml");
    // LF-normalised: a Windows checkout (core.autocrlf) reads this file CRLF, and the regex is LF-only.
    // Written back LF — git stores LF either way, and the script reads the committed blob (git show).
    const original = readFileSync(wf, "utf8").replace(/\r\n/g, "\n");
    const widened = original.replace(
      /(\n[ \t]+FILES: >-\n)([ \t]+)/,
      (_, head, ind) => `${head}${ind}compiler/src/runtime-url-guard.js\n${ind}.github/workflows/generated-regen.yml\n${ind}`,
    );
    expect(widened).not.toBe(original);
    // the widening really parses (the forge would succeed against the head's own copy)
    expect(String(Bun.YAML.parse(widened).jobs.regen.env.FILES)).toContain("compiler/src/runtime-url-guard.js");
    writeFileSync(wf, widened);
    s.commit("forge FILES");
    const r = s.bot();
    expect(r.rc).toBe(1);
    expect(r.out).toContain("compiler/src/runtime-url-guard.js");
  });
  test("--bot fails closed when the base has no generated-regen.yml", () => {
    const s = sandbox(); // base without the workflow
    writeFileSync(join(s.root, "docs/generated/gap-counts.md"), "| HIGH | 3 | 0 |\n");
    s.commit("regen");
    const r = spawnSync("bash", [SCRIPT, "--bot", "main"], { cwd: s.root, env: ENV, encoding: "utf8" });
    expect(r.status).toBe(1);
  });
});

describe("ci.yml wiring", () => {
  const ci = Bun.YAML.parse(readFileSync(join(REPO, ".github/workflows/ci.yml"), "utf8"));
  const step = ci.jobs.checks.steps.find((x) => /^Bot-owned generated files untouched/.test(x.name ?? ""));
  test("the `checks` job runs it against the PR base, blocking (no continue-on-error)", () => {
    expect(step).toBeDefined();
    expect(String(step.run)).toContain("scripts/bot-owned-untouched.sh");
    expect(String(step.env.BASE)).toContain("github.event.pull_request.base.sha");
    expect(step["continue-on-error"]).toBeUndefined();
  });
  test("on every pull_request; the bot is recognised by branch AND same-repo head, then checked with --bot", () => {
    expect(String(step.if)).toContain("github.event_name == 'pull_request'");
    expect(String(step.if)).not.toContain("head_ref");            // no PR skips the step by its branch name
    expect(String(step.env.IS_BOT)).toContain("github.head_ref == 'bot/generated-regen'");
    expect(String(step.env.IS_BOT)).toContain("github.event.pull_request.head.repo.full_name == github.repository");
    expect(String(step.run)).toMatch(/IS_BOT.*--bot/s);
  });
  test("generated-regen.yml writes exactly the files this guard protects (and no hand-edited file)", () => {
    const regen = Bun.YAML.parse(readFileSync(join(REPO, ".github/workflows/generated-regen.yml"), "utf8"));
    const files = String(regen.jobs.regen.env.FILES).trim().split(/\s+/);
    expect(files).toContain("docs/generated/gap-counts.md");
    expect(files).toContain("docs/generated/recent-sessions.md");
    expect(files).not.toContain("docs/known-gaps.md");
    expect(files).not.toContain("master-list.md");
  });
  test("the bot's PR body names the new locations (#1707 F10)", () => {
    const src = readFileSync(join(REPO, ".github/workflows/generated-regen.yml"), "utf8");
    const body = src.slice(src.indexOf("gh pr create"), src.indexOf("PR=$(gh pr list", src.indexOf("gh pr create")));
    expect(body).toContain("docs/generated/gap-counts.md");
    expect(body).toContain("docs/generated/recent-sessions.md");
    expect(body).not.toContain("master-list recent-sessions");
  });
});
