// invariant-c7-r1-s483.test.js — lane s483-invariant-2, fix round r1 (#2128 review L2): check.scrml C7 verifies a
// Commit's declaration-invariant check, not only where it stands. A lowering that DROPS the check, DUPLICATES it,
// or MIS-TARGETS it (an entry naming another field or another value, another instance) fails checkCore; and a
// lone write's check must name that write. SPEC §66.13.5 "When it is checked" (ruling:user-voice-scrml.md-S483-
// struct-invariant-syntax item 2: "The grouped write is the existing spread … one snapshot, all or nothing, checked
// once"). Non-invariant Commits are judged as before (one write, a non-check Eval).

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2 } from "./harness.js";
import { frontEndNoUnusedLint as frontEnd } from "../slice-m2/no-unused-lint.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const WIN = (inv) => `<program>
<win:struct>
    let <start:int=0/>
    let <end:int=10/>
</>
${inv}
function go(a: int, b: int) { @win = { ...@win, start: a, end: b }; }
function one(a: int) { @win.start = a; }
<main><button onclick=go(1, 2)>x</button><button onclick=one(3)>y</button></main>
</program>
`;

function coreOf(src) {
  const r = frontEnd(mods, [{ path: "w.scrml", src }]);
  expect(r.diags.filter((d) => d.severity === "error").map((d) => d.code)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r.core;
}
const fnOf = (core, name) => core.fns.find((f) => f.sym.hint === name);
const stmtOf = (fn, v) => fn.body.stmts.find((s) => s.variant === v);
const c7 = (core) => mods.check.checkCore(core).filter((m) => m.startsWith("C7"));

describe("C7 — a Commit's invariant check is verified", () => {
  test("the lowered Commit passes; dropping, duplicating or reordering its check fails", () => {
    const core = coreOf(WIN("invariant (start <= end) [ordered]"));
    const commit = stmtOf(fnOf(core, "go"), "Commit");
    const orig = commit.data.writes;
    const ws = orig.filter((s) => s.variant === "Write");
    const g = orig.find((s) => s.variant === "Eval");
    expect(ws.length).toBe(2);
    expect(g).toBeDefined();
    const redo = (xs) => { commit.data.writes = xs; try { return c7(core); } finally { commit.data.writes = orig; } };
    expect(redo(orig)).toEqual([]);
    expect(redo([...ws]).join(" ")).toContain("holds no invariant check");
    expect(redo([...ws, g, g]).join(" ")).toContain("holds 2 invariant checks");
    expect(redo([g, ...ws]).join(" ")).toContain("a Write follows the Commit's invariant check");
    // the check judges two writes, the Commit holds them in the other order: each entry mis-targets its Write
    expect(redo([ws[1], ws[0], g]).join(" ")).toContain("names field");
  });

  test("a check whose entry judges another value is refused", () => {
    const core = coreOf(WIN("invariant (start <= end) [ordered]"));
    const commit = stmtOf(fnOf(core, "go"), "Commit");
    const g = commit.data.writes.find((s) => s.variant === "Eval");
    const entries = g.data.e.data.args[1].data.elems;
    const saved = entries[0].data.elems[3];
    entries[0].data.elems[3] = entries[1].data.elems[3];
    try {
      expect(c7(core).join(" ")).toContain("does not judge its Write's value");
    } finally {
      entries[0].data.elems[3] = saved;
    }
  });

  test("a lone write's check must name that write's field", () => {
    const core = coreOf(WIN("invariant (start <= end) [ordered]"));
    const w = stmtOf(fnOf(core, "one"), "Write");
    const entry = w.data.value.data.args[1].data.elems[0].data.elems;
    const saved = entry[0];
    entry[0] = { variant: "Lit", data: { lit: { variant: "Int", data: { v: 1 } } } };
    try {
      expect(c7(core).join(" ")).toContain("names another field");
    } finally {
      entry[0] = saved;
    }
  });

  test("without an invariant nothing is owed (the non-invariant Commit is unchanged)", () => {
    const core = coreOf(WIN(""));
    const commit = stmtOf(fnOf(core, "go"), "Commit");
    expect(commit.data.writes.every((s) => s.variant === "Write")).toBe(true);
    expect(c7(core)).toEqual([]);
    const orig = commit.data.writes;
    commit.data.writes = [orig[0]];
    try {
      expect(c7(core).join(" ")).toContain("groups 1 write(s)");
    } finally {
      commit.data.writes = orig;
    }
  });
});
