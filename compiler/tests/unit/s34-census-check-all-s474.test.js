/**
 * s34-census-check-all-s474.test.js — the CENSUS (not only its resolver module) checks every
 * citation form over the live SPEC.
 *
 * WHY (S474 review F3): s34-census-provenance-s474.test.js imports only scripts/s34-provenance.ts,
 * so reverting scripts/s34-census.ts to its pre-S474 self left it green — the census could stop
 * calling the resolver, or stop reading .scrml identifiers, and nothing would notice. This runs the
 * census end to end (`--check-all --json`, every §34 row) and pins what it must see.
 *
 * The stale set is pinned EXACTLY. When one of the two known-stale rows below is fixed in SPEC,
 * remove it here — that is the point: a new stale row (a rename that staled a citation) turns this
 * red on the PR that caused it, instead of waiting for someone to touch the row.
 */

import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// Both cite `compiler/self-host/`, the v1 self-host tree retired at S447 (PR 1230). Left for a PA
// ruling (S474): newly rejecting over a backlog is not this gate's call.
const KNOWN_STALE = ["E-CLASS-NOT-IN-SCRML", "E-DYNAMIC-IMPORT-NOT-IN-SCRML"];

test("--check-all checks every citation form over the live SPEC; only the known-stale rows fail", () => {
  const r = spawnSync("bun", ["scripts/s34-census.ts", "--check-all", "--json"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let out;
  try { out = JSON.parse(r.stdout); } catch { throw new Error(`census --check-all --json printed no JSON (exit ${r.status}):\n${r.stdout.slice(0, 500)}\n${r.stderr.slice(0, 500)}`); }
  expect(out.rows).toBeGreaterThan(1000);
  // the bootstrap's parenthesized form IS parsed and checked (it was checked 0 times before S474)
  expect(out.checked["path-paren (.scrml)"]).toBeGreaterThan(0);
  expect(out.checked["path-sym"]).toBeGreaterThan(0);
  expect(out.checked["bare-sym"]).toBeGreaterThan(0);
  expect([...new Set(out.stale.map((s) => s.code))].sort()).toEqual([...KNOWN_STALE].sort());
}, 60000);
