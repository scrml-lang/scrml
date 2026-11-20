#!/usr/bin/env bun
// ci-slices — what one leg of the sharded `slices` CI job runs (S480, change-id s480-ci-slices-timeout).
//
// WHY THIS EXISTS. `slices` was one job running every native-bootstrap slice suite + the e2e-render-map
// tier in series. By S480 it took 908–1180 s on a GitHub runner against a 20-min (1200 s) timeout, and
// 11 of the last 39 completed CI runs had it CANCELLED at the timeout (merge-queue runs for PRs 2006/2007/2008/
// 2010/2011 among them — `gate` then fails and the PR leaves the queue). One suite is ~70% of it:
// slice-m4 (241 files, ~756 s on run 44658840576); everything else is ~340 s.
//
// HOW IT SPLITS (every test runs in exactly one leg, by construction):
//   - slice-m4 is split with bun's own `--shard=i/N`, balanced by scripts/ci-test-timings.json (the same
//     mechanism and table as the unit / integration jobs). It writes a junit report, and `gate` runs
//     `scripts/ci-shards.ts reconcile … slice-m4=compiler/self-host-v2/slice-m4`, which fails unless the
//     legs' slice-m4 files are an exact partition of the directory (none missing, none run twice).
//   - every OTHER step (the two lints, slice-m1, slice-m2, slice-m1 on the LOWERED core, slice-m3,
//     slice-codec, e2e-render-map) runs WHOLE in exactly one leg: `GROUPS` below is dealt across the N
//     legs (longest first onto the least-loaded leg; ties by list order, then by lowest leg). The deal
//     is a pure function of (GROUPS, N), so each group lands in one leg and only one.
//   `weight` is the step's seconds on a GitHub runner (run 44658840576). A stale weight changes WHICH
//   leg runs a group, never WHETHER it runs.
//
// Every step of a leg runs even when an earlier one failed (each reports; the old job ran e2e-render-map
// under `if: !cancelled()` for the same reason); the leg exits 1 if any step failed.
//
// USAGE
//   bun scripts/ci-slices.ts plan <N>                         print what each of N legs runs
//   bun scripts/ci-slices.ts run <i>/<N> [--reports <dir>]    run leg i of N (junit + timings into <dir>)
// Exit 0 = every step passed · 1 = a step failed · 2 = bad invocation.

import { spawnSync } from "bun";
import { join, resolve } from "path";

const REPO = resolve(import.meta.dir, "..");

interface Group { name: string; cmd: string[]; env?: Record<string, string>; weight: number }

/** Run WHOLE, in exactly one leg. Order is the tie-break of the deal; keep new groups at the end. */
const GROUPS: Group[] = [
  // dpa-051 §3.4 — total matches over IR enums.
  { name: "lint-no-default-arm", cmd: ["bun", "scripts/lint-no-default-arm.js"], weight: 1 },
  // S473 — two top-level functions of one name in a bootstrap file (g-impl1-bootstrap-duplicate-fn-last-wins-s473).
  { name: "lint-duplicate-fn", cmd: ["bun", "scripts/lint-duplicate-fn.js"], weight: 1 },
  { name: "slice-m1", cmd: ["bun", "test", "./compiler/self-host-v2/slice-m1/"], weight: 14 },
  { name: "slice-m2", cmd: ["bun", "test", "./compiler/self-host-v2/slice-m2/"], weight: 132 },
  // M1's suite re-run on the LOWERED programs — M1 is M2's `lower` oracle.
  { name: "slice-m1 (SLICE_CORE=lowered)", cmd: ["bun", "test", "./compiler/self-host-v2/slice-m1/"], env: { SLICE_CORE: "lowered" }, weight: 72 },
  { name: "slice-m3", cmd: ["bun", "test", "./compiler/self-host-v2/slice-m3/"], weight: 13 },
  { name: "slice-codec", cmd: ["bun", "test", "./compiler/self-host-v2/slice-codec/"], weight: 57 },
  // S427 — the e2e-render-map tier's ASSERTIONS (happy-dom only; g-e2e-render-map-tier-runs-in-no-ci-job-at-all).
  { name: "e2e-render-map", cmd: ["bun", "test", "compiler/tests/e2e-render-map/"], weight: 48 },
];

/** The sharded suite: every leg runs its `--shard=i/N` part. */
const SHARDED_DIR = "./compiler/self-host-v2/slice-m4/";
const SHARDED_SUITE = "slice-m4";   // the junit name `gate`'s reconcile reads: junit-slice-m4-<i>-of-<N>.xml

function deal(n: number): Group[][] {
  const legs: Group[][] = Array.from({ length: n }, () => []);
  const load = new Array(n).fill(0);
  const order = GROUPS.map((g, idx) => ({ g, idx })).sort((a, b) => b.g.weight - a.g.weight || a.idx - b.idx);
  for (const { g } of order) {
    let best = 0;
    for (let i = 1; i < n; i++) if (load[i] < load[best]) best = i;
    legs[best].push(g);
    load[best] += g.weight;
  }
  // Within a leg, keep the original list order (lints first).
  return legs.map((l) => l.sort((a, b) => GROUPS.indexOf(a) - GROUPS.indexOf(b)));
}

function shardedCmd(i: number, n: number, reports: string | null): string[] {
  const cmd = ["bun", "test", SHARDED_DIR, `--shard=${i}/${n}`];
  if (reports) {
    cmd.push(
      `--timings=${join(reports, "timings.json")}`, "--timings=scripts/ci-test-timings.json", "--update-timings",
      "--reporter=junit", `--reporter-outfile=${join(reports, `junit-${SHARDED_SUITE}-${i}-of-${n}.xml`)}`,
    );
  } else {
    cmd.push("--timings=scripts/ci-test-timings.json");
  }
  return cmd;
}

function parseLeg(s: string | undefined): [number, number] | null {
  const m = /^(\d+)\/(\d+)$/.exec(s ?? "");
  if (!m) return null;
  const i = Number(m[1]), n = Number(m[2]);
  return n >= 1 && i >= 1 && i <= n ? [i, n] : null;
}

function plan(n: number): number {
  const legs = deal(n);
  for (let i = 1; i <= n; i++) {
    const w = legs[i - 1].reduce((a, g) => a + g.weight, 0);
    console.log(`leg ${i}/${n}: ${SHARDED_SUITE} --shard=${i}/${n}  +  ${legs[i - 1].map((g) => g.name).join(", ") || "(nothing else)"}  (~${w} s besides ${SHARDED_SUITE})`);
  }
  return 0;
}

function run(i: number, n: number, reports: string | null): number {
  const steps: { name: string; cmd: string[]; env?: Record<string, string> }[] = [
    ...deal(n)[i - 1],
    { name: `${SHARDED_SUITE} --shard=${i}/${n}`, cmd: shardedCmd(i, n, reports) },
  ];
  const results: { name: string; ok: boolean; secs: number }[] = [];
  for (const s of steps) {
    const env = { ...process.env, ...(s.env ?? {}) };
    const shown = [...Object.entries(s.env ?? {}).map(([k, v]) => `${k}=${v}`), ...s.cmd].join(" ");
    console.log(`::group::${s.name} — ${shown}`);
    const t0 = performance.now();
    const r = spawnSync(s.cmd, { cwd: REPO, env, stdout: "inherit", stderr: "inherit" });
    const secs = Math.round((performance.now() - t0) / 1000);
    console.log("::endgroup::");
    const ok = r.exitCode === 0;
    if (!ok) console.log(`::error::slices leg ${i}/${n}: ${s.name} failed (exit ${r.exitCode ?? r.signalCode})`);
    results.push({ name: s.name, ok, secs });
  }
  console.log(`\nslices leg ${i}/${n}:`);
  for (const r of results) console.log(`  ${r.ok ? "pass" : "FAIL"}  ${String(r.secs).padStart(4)} s  ${r.name}`);
  return results.every((r) => r.ok) ? 0 : 1;
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "plan" && rest.length === 1 && /^[1-9]\d*$/.test(rest[0])) process.exit(plan(Number(rest[0])));
if (cmd === "run") {
  const leg = parseLeg(rest[0]);
  const r = rest.indexOf("--reports");
  const reports = r >= 0 ? rest[r + 1] ?? null : null;
  const ok = leg && (r < 0 ? rest.length === 1 : rest.length === 3 && reports);
  if (ok) process.exit(run(leg[0], leg[1], reports));
}
console.error("usage: bun scripts/ci-slices.ts plan <N>\n       bun scripts/ci-slices.ts run <i>/<N> [--reports <dir>]");
process.exit(2);
