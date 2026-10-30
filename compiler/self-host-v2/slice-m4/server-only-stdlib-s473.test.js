// server-only-stdlib-s473.test.js — s473-boot-failclosed-sql-protect, item 7: SPEC §12.2 Trigger 3.
//
//   "calling a binding imported from any of [the escalation-server-only stdlib modules] escalates the
//    function that calls it … Membership criterion (normative): a stdlib module is
//    escalation-server-only if EITHER (a) its implementation reaches a host API that does not exist in
//    a browser — `Bun.*`, `process.*`, or an import of `bun` / `bun:*` / `node:*` — or (b) it accepts
//    or transmits a credential that must not reach a client"
//
// The bootstrap builds NO Trigger-3 escalation, so an import of a server-only module is REFUSED
// (analyze.scrml isServerOnlyStdlib / checkImports). Before s473 it was refused only while the module
// did not compile on the bootstrap — the first port would have placed its callers on the client (the
// S299 founding defect). The fixture `src/stdlib-s473t3` holds a module NAMED `auth` that compiles:
// on base it imports clean (red), on head it is refused (green).
//
// The list in analyze.scrml is §12.2's evaluation of the criterion. Limb (a) is re-derived here from
// the stdlib's own sources (comments stripped) on every run, and must be covered — so a module that
// starts reaching a host API cannot be imported on the bootstrap unnoticed. impl#1's
// ESCALATION_SERVER_ONLY_MODULES (route-inference.ts) must be covered too.

import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "node:path";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { loadM2, frontEnd } from "./harness.js";
import { frontEndStdlib, STDLIB_ROOT } from "../slice-m2/lowered.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const ENTRY = "app.scrml";
const FIXTURE = join(import.meta.dir, "src", "stdlib-s473t3");
const std = (src) => frontEndStdlib(mods, [{ path: ENTRY, src }], ENTRY, { stdlibRoot: FIXTURE });
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const P = (imp, call) => `<program>\n    \${ ${imp} }\n    <main><p>\${${call}}</p></main>\n</program>\n`;

describe("§12.2 T3 — importing a server-only stdlib module is refused until escalation is built", () => {
  test("`scrml:auth` (it compiles on the bootstrap): refused at the import, naming Trigger 3", () => {
    const r = std(P(`import { sign } from "scrml:auth";`, `sign("x")`));
    const e = errs(r);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].file).toBe(ENTRY);
    expect(e[0].message).toContain("§12.2 Trigger 3");
    expect(e[0].message).toContain("server-only");
  });

  test("a submodule of one (`scrml:auth/jwt`) is the module's", () => {
    const e = errs(std(P(`import { token } from "scrml:auth/jwt";`, `token("x")`)));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("§12.2 Trigger 3");
  });

  test("near-miss: a module off the list imports clean", () => {
    expect(errs(std(P(`import { twice } from "scrml:plain";`, `twice("x")`)))).toEqual([]);
  });

  test("every listed module is refused by name, whether or not the build supplies its source", () => {
    for (const m of ["auth", "crypto", "cron", "fs", "mcp", "oauth", "path", "process", "redis", "store"]) {
      const e = errs(frontEnd(mods, [{ path: ENTRY, src: P(`import { x } from "scrml:${m}";`, `1`) }], ENTRY));
      expect([m, e.some((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED" && d.message.includes("§12.2 Trigger 3"))]).toEqual([m, true]);
    }
  });
});

// ---------------------------------------------------------------------------
// The list does not rot: limb (a), derived from the stdlib's sources, and impl#1's set are covered.
function filesUnder(d) {
  const out = [];
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else if (/\.(scrml|js|mjs|ts|mts)$/.test(e)) out.push(p);
  }
  return out;
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
const HOST_REACH = /\bBun\.|\bprocess\.|from\s+["']bun["']|["']bun:|["']node:/;

describe("§12.2 T3 — the bootstrap's server-only set covers the criterion", () => {
  test("limb (a): every stdlib module whose implementation reaches Bun.* / process.* / bun / bun:* / node:* is refused", () => {
    const derived = [];
    for (const m of readdirSync(STDLIB_ROOT)) {
      const p = join(STDLIB_ROOT, m);
      if (!statSync(p).isDirectory()) continue;
      if (filesUnder(p).some((f) => HOST_REACH.test(stripComments(readFileSync(f, "utf8"))))) derived.push(m);
    }
    expect(derived.length).toBeGreaterThan(3);   // the scan reads something
    for (const m of derived) {
      const e = errs(frontEnd(mods, [{ path: ENTRY, src: P(`import { x } from "scrml:${m}";`, `1`) }], ENTRY));
      expect([m, e.some((d) => d.message.includes("§12.2 Trigger 3"))]).toEqual([m, true]);
    }
  });

  test("impl#1's ESCALATION_SERVER_ONLY_MODULES is covered", async () => {
    const { ESCALATION_SERVER_ONLY_MODULES } = await import("../../src/route-inference.ts");
    expect(ESCALATION_SERVER_ONLY_MODULES.size).toBeGreaterThan(0);
    for (const spec of ESCALATION_SERVER_ONLY_MODULES) {
      const e = errs(frontEnd(mods, [{ path: ENTRY, src: P(`import { x } from "${spec}";`, `1`) }], ENTRY));
      expect([spec, e.some((d) => d.message.includes("§12.2 Trigger 3"))]).toEqual([spec, true]);
    }
  });
});
