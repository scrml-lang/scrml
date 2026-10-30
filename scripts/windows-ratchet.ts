#!/usr/bin/env bun
// windows-ratchet — the judge of the `windows` CI job (S473 ruling, scrml-support user-voice-scrml.md,
// "RULED — S473 Windows: impl#1 routeMap fix exception + CI ratchet guard", item 2).
//
// WHY: main's `windows` job went red at #1620 and stayed red. It was not required, so every later Windows
// regression (#1658, #1664, #1673) merged with a red `windows` on its own PR: a new failure looked exactly
// like the old ones. The ratchet makes the job's verdict mean "nothing NEW broke on Windows", which is what
// lets it be required:
//
//   • a committed baseline (.github/windows-baseline.json) lists the known Windows-failing tests, each tied
//     to an open gap id in docs/known-gaps.md;
//   • the job FAILS on any failing test outside the baseline;
//   • the job FAILS on a baseline entry that now passes, is skipped, or no longer exists (a stale entry) —
//     so the baseline can only shrink;
//   • failed tests outside the baseline get ONE retry (their files are re-run once); a test that fails and
//     then passes is listed as a flake and does not fail the job.
//
// A test id is `<file> > <describe> > … > <test name>`: the repo-relative POSIX path, then the describe
// chain outermost first, then the test's name — the same string bun prints after `(fail)`, prefixed by
// the file.
//
// Subcommands (exit 0 = ok · 1 = the ratchet failed · 2 = bad invocation or an unreadable input):
//
//   bun scripts/windows-ratchet.ts validate [--baseline <json>] [--gaps <md>]
//       Schema of the baseline; every gap id exists in docs/known-gaps.md and is not resolved; every file
//       exists; no duplicate ids. Runs in the Linux `checks` job, so a bad baseline fails every PR.
//
//   bun scripts/windows-ratchet.ts retry-list --junit <xml>… [--expect <dir>…] [--baseline <json>]
//       Prints (one per line, `./`-prefixed) the test files to re-run once: every file with a failure
//       outside the baseline, plus every expected file that did not report. Prints nothing when there is
//       nothing to retry, or when more than --max-files (default 40) would be — a mass failure is not a
//       flake, and retrying it would only double the job.
//
//   bun scripts/windows-ratchet.ts judge --junit <name>=<xml>[:<rc>]… [--retry <xml>] [--expect <dir>…]
//                                        [--baseline <json>] [--gaps <md>]
//       The verdict. <rc> is the suite's bun exit code: a non-zero exit with no failing test and no
//       unreported file is a failure in itself (a crash, or an error outside every test). A missing or
//       empty first-run report is a failure. Writes a markdown summary to $GITHUB_STEP_SUMMARY when set.
//
//   bun scripts/windows-ratchet.ts report [--repo <owner/name>] [--branch main] [--limit 60]
//       main's windows history (via `gh api`): the latest judged conclusion, and when it is red, the first
//       red run and SHA (walking back to the last green). Exit 1 when main's latest windows run is red.
//
// The XML is read with a tag scanner, like scripts/ci-shards.ts: bun's junit output is machine-written.
// ⚑ bun 1.4.3 OMITS a test file that throws while loading (no <testsuite> at all; the console says
// "1 error"). That is why `--expect` exists: an expected test file absent from the report is a failure,
// recorded under the id `<file> > (file did not report)`.

import { existsSync, readdirSync, readFileSync, statSync, appendFileSync } from "fs";
import { join, relative, resolve } from "path";

const REPO = resolve(import.meta.dir, "..");
export const DEFAULT_BASELINE = ".github/windows-baseline.json";
export const DEFAULT_GAPS = "docs/known-gaps.md";
export const FILE_DID_NOT_REPORT = "(file did not report)";

// ── junit ────────────────────────────────────────────────────────────────────────────────────────────

export type Status = "pass" | "fail" | "skip";
export interface Report {
  /** test id → status; a duplicated id is `fail` if any occurrence failed. */
  tests: Map<string, Status>;
  /** the files that reported (depth-1 <testsuite>), POSIX, repo-relative as bun wrote them. */
  files: Set<string>;
}

const unescape = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#(\d+)|#x([0-9a-fA-F]+));/g, (_m, n, d, h) =>
    n === "lt" ? "<" : n === "gt" ? ">" : n === "quot" ? '"' : n === "apos" ? "'" : n === "amp" ? "&"
      : String.fromCodePoint(d ? Number(d) : parseInt(h, 16)));
const attr = (s: string, n: string) => { const m = new RegExp(`\\b${n}="([^"]*)"`).exec(s); return m ? unescape(m[1]) : ""; };
export const posix = (p: string) => p.split("\\").join("/").replace(/^\.\//, "");
export const testId = (file: string, chain: string[], name: string) => [posix(file), ...chain, name].join(" > ");

export function parseJunit(xml: string): Report {
  const tests = new Map<string, Status>();
  const files = new Set<string>();
  // Stack of open <testsuite> names; [0] is the file-level suite (its name is the file, not a describe).
  const stack: { name: string; file: string }[] = [];
  let open: { id: string; status: Status } | null = null;
  const put = (id: string, st: Status) => {
    const prev = tests.get(id);
    tests.set(id, prev === "fail" || st === "fail" ? "fail" : prev === "pass" || st === "pass" ? "pass" : st);
  };
  for (const m of xml.matchAll(/<(\/?)(testsuite|testcase|failure|error|skipped)\b([^>]*?)(\/?)>/g)) {
    const [, close, tag, attrs, selfClose] = m;
    if (tag === "testsuite") {
      if (close) { stack.pop(); continue; }
      const file = posix(attr(attrs, "file") || attr(attrs, "name"));
      if (stack.length === 0) files.add(file);
      if (!selfClose) stack.push({ name: attr(attrs, "name"), file });
      continue;
    }
    if (tag === "testcase") {
      if (close) { if (open) put(open.id, open.status); open = null; continue; }
      const file = posix(attr(attrs, "file") || stack[0]?.file || "");
      const id = testId(file, stack.slice(1).map((s) => s.name), attr(attrs, "name"));
      if (selfClose) put(id, "pass");
      else open = { id, status: "pass" };
      continue;
    }
    if (!open || close) continue;
    if (tag === "skipped") open.status = open.status === "fail" ? "fail" : "skip";
    else open.status = "fail"; // <failure> or <error>
  }
  return { tests, files };
}

export function mergeReports(rs: Report[]): Report {
  const out: Report = { tests: new Map(), files: new Set() };
  for (const r of rs) {
    for (const f of r.files) out.files.add(f);
    for (const [id, st] of r.tests) {
      const prev = out.tests.get(id);
      out.tests.set(id, prev === "fail" || st === "fail" ? "fail" : prev === "pass" || st === "pass" ? "pass" : st);
    }
  }
  return out;
}

const fileOf = (id: string) => id.split(" > ")[0];

// ── baseline ─────────────────────────────────────────────────────────────────────────────────────────

export interface Entry { file: string; test: string; gap: string; reason: string }
export const entryId = (e: Entry) => `${posix(e.file)} > ${e.test}`;

/** gap id → status, from the `<!-- @gap id=… status=… -->` markers of docs/known-gaps.md. */
export function gapStatuses(md: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of md.matchAll(/<!--\s*@gap\b([^>]*?)-->/g)) {
    const id = /\bid=(\S+)/.exec(m[1])?.[1];
    if (id) out.set(id, /\bstatus=(\S+)/.exec(m[1])?.[1] ?? "open");
  }
  return out;
}

/** Problems with a baseline (empty = valid). `fileExists` is injectable for the unit tests. */
export function validateBaseline(json: unknown, gaps: Map<string, string>, fileExists: (f: string) => boolean): string[] {
  const errs: string[] = [];
  const entries = (json as any)?.entries;
  if (!Array.isArray(entries)) return ["the baseline has no `entries` list"];
  const seen = new Set<string>();
  entries.forEach((e: any, i: number) => {
    const where = `entries[${i}]`;
    for (const k of ["file", "test", "gap", "reason"]) {
      if (typeof e?.[k] !== "string" || e[k].trim() === "") errs.push(`${where}: \`${k}\` must be a non-empty string`);
    }
    if (typeof e?.file !== "string" || typeof e?.test !== "string") return;
    const id = entryId(e);
    if (e.file !== posix(e.file)) errs.push(`${where}: \`file\` must be a repo-relative POSIX path (got ${e.file})`);
    if (seen.has(id)) errs.push(`${where}: duplicate test id ${id}`);
    seen.add(id);
    if (!fileExists(posix(e.file))) errs.push(`${where}: file does not exist: ${e.file}`);
    if (typeof e.gap === "string" && e.gap) {
      const st = gaps.get(e.gap);
      if (st === undefined) errs.push(`${where}: gap id ${e.gap} is not in docs/known-gaps.md`);
      else if (st === "resolved") errs.push(`${where}: gap ${e.gap} is RESOLVED — a resolved gap cannot excuse a failing test`);
    }
  });
  return errs;
}

// ── retry + judge ────────────────────────────────────────────────────────────────────────────────────

/** bun test's discovery rule (same as scripts/ci-shards.ts). */
const TEST_FILE = /(\.test|_test|\.spec|_spec)\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/;
export function enumerate(dir: string, root = REPO): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      if (e === "node_modules") continue;
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (TEST_FILE.test(e)) out.push(posix(relative(root, p)));
    }
  };
  walk(join(root, dir));
  return out.sort();
}

export function retryFiles(first: Report, baseline: Set<string>, expected: string[]): string[] {
  const files = new Set<string>();
  for (const [id, st] of first.tests) if (st === "fail" && !baseline.has(id)) files.add(fileOf(id));
  for (const f of expected) if (!first.files.has(f)) files.add(f);
  return [...files].sort();
}

export interface Suite { name: string; report: Report | null; rc: number | null; path: string }
export interface Verdict {
  newFailures: string[];       // failing, not in the baseline, not rescued by the retry
  flakes: string[];            // failed on the first run, passed on the retry
  stillKnown: string[];        // baseline entries that still fail
  stale: { id: string; why: string }[];
  suiteErrors: string[];       // a missing/empty report, or a non-zero exit with nothing failing
  ok: boolean;
}

export function judge(suites: Suite[], retry: Report | null, baseline: Entry[], expected: string[]): Verdict {
  const v: Verdict = { newFailures: [], flakes: [], stillKnown: [], stale: [], suiteErrors: [], ok: false };
  for (const s of suites) {
    if (!s.report) { v.suiteErrors.push(`${s.name}: no junit report at ${s.path} (the suite crashed or never ran)`); continue; }
    if (s.report.files.size === 0) v.suiteErrors.push(`${s.name}: the junit report at ${s.path} has no test files`);
  }
  const first = mergeReports(suites.flatMap((s) => (s.report ? [s.report] : [])));
  const base = new Map(baseline.map((e) => [entryId(e), e]));

  // An expected file that did not report: judge it on the retry if the retry ran it, else it is one failure.
  const unreported = expected.filter((f) => !first.files.has(f));
  for (const f of unreported) {
    const id = `${f} > ${FILE_DID_NOT_REPORT}`;
    if (base.has(id)) { v.stillKnown.push(id); continue; }
    if (retry?.files.has(f)) {
      const rows = [...retry.tests].filter(([t]) => fileOf(t) === f);
      const failing = rows.filter(([t, st]) => st === "fail" && !base.has(t)).map(([t]) => t);
      if (failing.length) v.newFailures.push(...failing.map((t) => `${t}   (its file did not report on the first run)`));
      else v.flakes.push(`${id} — the retry ran it cleanly`);
      for (const [t, st] of rows) if (st === "fail" && base.has(t)) v.stillKnown.push(t);
    } else {
      v.newFailures.push(id);
    }
  }

  for (const [id, st] of first.tests) {
    if (st !== "fail") continue;
    if (base.has(id)) { v.stillKnown.push(id); continue; }
    if (retry?.tests.get(id) === "pass") v.flakes.push(id);
    else v.newFailures.push(id);
  }

  for (const [id] of base) {
    if (id.endsWith(` > ${FILE_DID_NOT_REPORT}`)) {
      if (first.files.has(fileOf(id))) v.stale.push({ id, why: "the file reports now" });
      continue;
    }
    const st = first.tests.get(id);
    if (st === "pass") v.stale.push({ id, why: "it PASSES now — delete the entry (and resolve or narrow its gap)" });
    else if (st === "skip") v.stale.push({ id, why: "it is skipped now — a skipped test is not a known failure" });
    else if (st === undefined && first.files.has(fileOf(id))) v.stale.push({ id, why: "no test with this id ran — renamed or deleted?" });
    // st undefined and its file did not report: that file is already a failure (above), not a stale entry.
  }

  // A non-zero exit that nothing in the report explains (a crash, an error outside every test).
  // (An unreported expected file explains it too: bun exits non-zero for a file that threw while loading.)
  for (const s of suites) {
    if (!s.report || s.rc === null || s.rc === 0) continue;
    const explained = [...s.report.tests.values()].some((st) => st === "fail") || unreported.length > 0;
    if (!explained) v.suiteErrors.push(`${s.name}: bun exited ${s.rc} but its report has no failing test — a crash or an error outside every test; read the step log`);
  }

  v.newFailures = [...new Set(v.newFailures)].sort();
  v.flakes = [...new Set(v.flakes)].sort();
  v.stillKnown = [...new Set(v.stillKnown)].sort();
  v.ok = v.newFailures.length === 0 && v.stale.length === 0 && v.suiteErrors.length === 0;
  return v;
}

export function render(v: Verdict, baselineSize: number, baselinePath: string): string {
  const L: string[] = [];
  L.push(`windows-ratchet: ${v.ok ? "PASS" : "FAIL"} — baseline ${baselineSize} entr${baselineSize === 1 ? "y" : "ies"} (${baselinePath})`);
  if (v.suiteErrors.length) { L.push("", `✗ suite errors (${v.suiteErrors.length}):`); for (const e of v.suiteErrors) L.push(`  ✗ ${e}`); }
  if (v.newFailures.length) {
    L.push("", `✗ NEW Windows failures — not in the baseline, failed again on the retry (${v.newFailures.length}):`);
    for (const id of v.newFailures) L.push(`  ✗ ${id}`);
    L.push("  Fix them. A failure you cannot fix in this PR goes in the baseline only with an open gap id in docs/known-gaps.md.");
  }
  if (v.stale.length) {
    L.push("", `✗ STALE baseline entries — the baseline only shrinks (${v.stale.length}):`);
    for (const s of v.stale) L.push(`  ✗ ${s.id}\n      ${s.why}`);
  }
  if (v.flakes.length) { L.push("", `~ failed once, passed on the retry (flakes; not judged) (${v.flakes.length}):`); for (const id of v.flakes) L.push(`  ~ ${id}`); }
  if (v.stillKnown.length) { L.push("", `· known Windows failures, still failing (baseline) (${v.stillKnown.length}):`); for (const id of v.stillKnown) L.push(`  · ${id}`); }
  return L.join("\n");
}

// ── report (main's windows history) ──────────────────────────────────────────────────────────────────

export interface RunRow { runId: number; sha: string; event: string; createdAt: string; windows: string | null; url?: string }
export interface History { latest: RunRow | null; firstRed: RunRow | null; lastGreen: RunRow | null; redRuns: number; boundless: boolean }

/** `rows` newest first. Rows whose windows job did not conclude success/failure (absent, skipped, cancelled) are not judged. */
export function summarize(rows: RunRow[]): History {
  const judged = rows.filter((r) => r.windows === "success" || r.windows === "failure");
  const h: History = { latest: judged[0] ?? null, firstRed: null, lastGreen: null, redRuns: 0, boundless: false };
  if (!h.latest) return h;
  for (const r of judged) {
    if (r.windows === "failure") { h.firstRed = r; h.redRuns++; continue; }
    h.lastGreen = r;
    break;
  }
  if (h.latest.windows === "success") h.firstRed = null;
  h.boundless = h.latest.windows === "failure" && h.lastGreen === null;
  return h;
}

export function renderHistory(h: History, branch: string): string {
  if (!h.latest) return `windows-main-report: no ${branch} run with a concluded windows job in the window searched`;
  const s = (r: RunRow) => `${r.sha.slice(0, 9)} (run ${r.runId}, ${r.event}, ${r.createdAt})${r.url ? ` ${r.url}` : ""}`;
  if (h.latest.windows === "success") {
    return `windows-main-report: ${branch} windows is GREEN — latest ${s(h.latest)}`;
  }
  const L = [`windows-main-report: ${branch} windows is RED — latest ${s(h.latest)}`,
    `  red for ${h.redRuns} consecutive judged run(s)`,
    h.boundless ? `  first red: OLDER than the window searched (earliest red seen: ${s(h.firstRed!)}) — raise --limit`
      : `  first red: ${s(h.firstRed!)}`];
  if (h.lastGreen) L.push(`  last green: ${s(h.lastGreen)}`);
  L.push(`  read the first red run's log: gh run view ${h.firstRed!.runId} --log-failed`);
  return L.join("\n");
}

async function gh(args: string[]): Promise<any> {
  const p = Bun.spawnSync(["gh", "api", ...args], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`gh api ${args.join(" ")}: ${p.stderr.toString().trim()}`);
  return JSON.parse(p.stdout.toString());
}

async function report(repo: string, branch: string, limit: number): Promise<number> {
  const runs = (await gh([`repos/${repo}/actions/workflows/ci.yml/runs?branch=${branch}&status=completed&per_page=${Math.min(limit, 100)}`])).workflow_runs ?? [];
  const rows: RunRow[] = [];
  for (const r of runs.slice(0, limit)) {
    const jobs = (await gh([`repos/${repo}/actions/runs/${r.id}/jobs?per_page=100`])).jobs ?? [];
    const w = jobs.find((j: any) => j.name === "windows");
    rows.push({ runId: r.id, sha: r.head_sha, event: r.event, createdAt: r.created_at, windows: w?.conclusion ?? null, url: r.html_url });
    // Stop once a green is found below a red (or the latest is green): the answer is known.
    const h = summarize(rows);
    if (h.latest && (h.latest.windows === "success" || h.lastGreen)) break;
  }
  const h = summarize(rows);
  const text = renderHistory(h, branch);
  console.log(text);
  summary(["## windows on " + branch, "", "```", text, "```"].join("\n"));
  if (h.latest?.windows === "failure") {
    console.log(`::error title=windows is red on ${branch}::${esc(`first red ${h.firstRed?.sha.slice(0, 9)} (run ${h.firstRed?.runId}); latest ${h.latest.sha.slice(0, 9)} — see the job log`)}`);
    return 1;
  }
  return 0;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────

/** A workflow-command message: `%`, CR and LF must be percent-encoded or the annotation is cut. */
const esc = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

function summary(md: string) {
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (f) try { appendFileSync(f, md + "\n"); } catch { /* the summary is a convenience */ }
}

function readReport(path: string): Report | null {
  if (!existsSync(path)) return null;
  return parseJunit(readFileSync(path, "utf8"));
}

function loadBaseline(path: string): Entry[] {
  return JSON.parse(readFileSync(resolve(REPO, path), "utf8")).entries;
}

function flags(argv: string[]) {
  const out: Record<string, string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { (out._ ??= []).push(a); continue; }
    const k = a.slice(2);
    (out[k] ??= []);
    while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out[k].push(argv[++i]);
  }
  return out;
}

function validateCmd(baselinePath: string, gapsPath: string): number {
  let json: unknown;
  try { json = JSON.parse(readFileSync(resolve(REPO, baselinePath), "utf8")); }
  catch (e) { console.error(`windows-ratchet validate: cannot read ${baselinePath}: ${e}`); return 2; }
  const gaps = gapStatuses(readFileSync(resolve(REPO, gapsPath), "utf8"));
  const errs = validateBaseline(json, gaps, (f) => existsSync(resolve(REPO, f)));
  for (const e of errs) console.log(`✗ ${baselinePath}: ${e}`);
  if (errs.length) { console.error(`windows-ratchet validate: ${errs.length} problem(s)`); return 1; }
  console.log(`windows-ratchet validate: ${baselinePath} ok — ${(json as any).entries.length} entr${(json as any).entries.length === 1 ? "y" : "ies"}, every gap open in ${gapsPath}`);
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const f = flags(rest);
  const baselinePath = f.baseline?.[0] ?? DEFAULT_BASELINE;
  const gapsPath = f.gaps?.[0] ?? DEFAULT_GAPS;
  const expected = (f.expect ?? []).flatMap((d) => enumerate(d));
  if (cmd === "validate") return validateCmd(baselinePath, gapsPath);
  if (cmd === "retry-list") {
    const first = mergeReports((f.junit ?? []).map((p) => readReport(p.replace(/^[^=]*=/, "").replace(/:-?\d+$/, ""))).filter((r): r is Report => !!r));
    const base = new Set(loadBaseline(baselinePath).map(entryId));
    const files = retryFiles(first, base, expected);
    const max = Number(f["max-files"]?.[0] ?? 40);
    if (files.length > max) { console.error(`windows-ratchet retry-list: ${files.length} files failed (> ${max}) — not a flake; no retry`); return 0; }
    for (const x of files) console.log(`./${x}`);
    return 0;
  }
  if (cmd === "judge") {
    if (!f.junit?.length) { console.error("windows-ratchet judge: at least one --junit <name>=<xml>[:<rc>]"); return 2; }
    if (validateCmd(baselinePath, gapsPath) !== 0) return 1;
    const suites: Suite[] = f.junit.map((spec) => {
      const m = /^([^=]+)=(.+?)(?::(-?\d+))?$/.exec(spec);
      if (!m) throw new Error(`bad --junit ${spec}`);
      return { name: m[1], path: m[2], rc: m[3] === undefined ? null : Number(m[3]), report: readReport(m[2]) };
    });
    const retry = f.retry?.[0] ? readReport(f.retry[0]) : null;
    if (f.retry?.[0] && !retry) console.log(`windows-ratchet: the retry report ${f.retry[0]} is missing — judging on the first run alone`);
    const baseline = loadBaseline(baselinePath);
    const v = judge(suites, retry, baseline, expected);
    const text = render(v, baseline.length, baselinePath);
    console.log(text);
    summary(["## windows ratchet", "", "```", text, "```"].join("\n"));
    for (const id of v.newFailures) console.log(`::error title=windows - new failure (not in the baseline)::${esc(id)}`);
    for (const s of v.stale) console.log(`::error title=windows - stale baseline entry::${esc(`${s.id} — ${s.why}`)}`);
    for (const e of v.suiteErrors) console.log(`::error title=windows - suite error::${esc(e)}`);
    for (const id of v.flakes) console.log(`::warning title=windows - flake (passed on retry)::${esc(id)}`);
    return v.ok ? 0 : 1;
  }
  if (cmd === "report") {
    return report(f.repo?.[0] ?? process.env.GITHUB_REPOSITORY ?? "scrml-lang/scrml", f.branch?.[0] ?? "main", Number(f.limit?.[0] ?? 60));
  }
  console.error("usage: bun scripts/windows-ratchet.ts validate|retry-list|judge|report … (see the header)");
  return 2;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
