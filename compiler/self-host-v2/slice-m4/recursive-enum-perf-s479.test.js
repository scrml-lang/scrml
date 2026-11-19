// recursive-enum-perf-s479.test.js — s479-recursive-enum-perf (g-boot-recursive-enum-exponential-s479):
// a self-recursive enum no longer compiles in exponential time.
//
// The defect: analyze.scrml containsHost (§21.3.3 rule 15, "A value whose type contains one at any
// depth … SHALL NOT …") walked a type's fields by plain recursion bounded only by depth 12, and
// expanded a named type again inside itself. `type E:enum = { Leaf(v: int), V1(a: E, b: E[]), … }`
// with k such variants cost about (2k)^12 steps per field: 0 / 1 / 11 s for k = 1 / 2 / 3, past 60 s
// at k = 4, and the bootstrap never finished on its own ast.scrml / core.scrml / link.scrml. It is
// now a worklist that expands each named type once (a `seen` set of type identities), so the walk
// is linear in the size of the type graph — and, no longer cut at depth 12, it finds a host handle
// at ANY depth, as the rule says.
//
// The survey of the other depth-bounded walks over named types found the same re-walk in
// analyze.scrml hostResultOk (a `<host>` binding's result type, §21.3.3 rule 13) and check.scrml
// hostDecodes (its C-HB4 twin): on a struct graph with sharing — `D0 { f0: D1, … f4: D1 }`,
// `D1 { … D2 … }` — they walked every path, 5^depth. Both are now (type, depth) worklists that
// expand a struct once per depth; the verdict (incl. the depth-12 cap) is unchanged.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mods } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { compileSource } from "../../../scripts/scrml-boot.ts";

beforeAll(() => { mods(); }, { timeout: 120000 });

const ENTRY = "app.scrml";
const run = (src) => frontEnd(mods(), [{ path: ENTRY, src }], ENTRY);
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (src) => errs(run(src)).map((d) => d.code).sort();

// a program whose logic declares `E` with `k` variants that each hold `E` and a tape of `E`
const recEnum = (k) => {
  const vs = [];
  for (let i = 1; i <= k; i++) vs.push(`        V${i}(a: E, b: E[]),`);
  return `<program>\n\${\n    type E:enum = {\n        Leaf(v: int),\n${vs.join("\n")}\n    }\n}\n<p>x</p>\n</program>\n`;
};
const best = (src, n) => {
  let b = Infinity;
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    run(src);
    b = Math.min(b, performance.now() - t0);
  }
  return b;
};

describe("a self-recursive enum compiles in time linear in its variants", () => {
  test("k = 1..8 variants of `Vi(a: E, b: E[])` compile clean", () => {
    for (let k = 1; k <= 8; k++) expect(codes(recEnum(k))).toEqual([]);
  }, 60_000);

  test("k = 8 costs at most 5x k = 2 (on the old walk k = 4 did not finish in 60 s)", () => {
    best(recEnum(1), 2); // warm
    let ok = false;
    let last = "";
    for (let a = 0; a < 3 && !ok; a++) {
      const t2 = best(recEnum(2), 3);
      const t8 = best(recEnum(8), 3);
      last = `k=2 ${t2.toFixed(1)} ms, k=8 ${t8.toFixed(1)} ms`;
      // a generous bound (ratio plus a fixed slack for timer noise on a loaded runner)
      ok = t8 < 5 * t2 + 100;
    }
    if (!ok) console.log(last);
    expect(ok).toBe(true);
  }, 60_000);

  test("core.scrml's shape: an Expr enum with a `Lambda(params: Sym[], body: Expr)` variant", () => {
    const src = `<program>\n\${\n    type Sym:struct = { id: int, hint: string }\n    type Expr:enum = {\n        Lit(v: int),\n        Var(s: Sym),\n        Call(f: Expr, args: Expr[]),\n        Bin(op: string, l: Expr, r: Expr),\n        If(c: Expr, t: Expr, e: Expr),\n        Let(s: Sym, v: Expr, body: Expr),\n        Lambda(params: Sym[], body: Expr),\n        Tup(xs: Expr[]),\n    }\n}\n<p>x</p>\n</program>\n`;
    const t0 = performance.now();
    expect(codes(src)).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(20_000);
  }, 60_000);
});

describe("results unchanged: a handle anywhere in the type graph is still found (§21.3.3 rule 15)", () => {
  const H = "<host>\n  mq(q: string) -> MediaQueryList = window.matchMedia(q)\n</host>\n";
  const P = (logic) => `${H}<program>\n\${\n${logic}\n}\n<p>x</p>\n</program>\n`;

  test("a recursive enum whose leaf holds a handle: every payload that reaches it is refused by name", () => {
    const r = run(P("    type E:enum = {\n        Leaf(m: MediaQueryList),\n        V1(a: E, b: E[]),\n        V2(a: E, b: E[]),\n    }"));
    const msgs = errs(r).filter((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED").map((d) => d.message.match(/variant `([^`]+)`/)[1]);
    expect(msgs.sort()).toEqual(["E.Leaf", "E.V1", "E.V1", "E.V2", "E.V2"]);
  });

  test("a struct field of a recursive enum that reaches a handle: E-HOST-HANDLE-NOT-DATA", () => {
    expect(codes(P("    type E:enum = {\n        Leaf(m: MediaQueryList),\n        V1(a: E, b: E[]),\n    }\n    type W:struct = { e: E | not }"))).toContain("E-HOST-HANDLE-NOT-DATA");
  });

  test("a recursive enum with no handle is not refused", () => {
    expect(codes(P("    type E:enum = {\n        Leaf(v: int),\n        V1(a: E, b: E[]),\n    }\n    type W:struct = { e: E[] }"))).toEqual([]);
  });

  test("\"at any depth\": a handle 14 struct levels down is found (the old walk stopped at depth 12)", () => {
    const lines = [];
    for (let i = 0; i < 14; i++) lines.push(`    type S${i}:struct = { n: S${i + 1} }`);
    lines.push("    type S14:struct = { m: MediaQueryList }");
    const r = run(P(lines.join("\n")));
    const named = errs(r).filter((d) => d.code === "E-HOST-HANDLE-NOT-DATA").map((d) => d.message.match(/struct `([^`]+)`/)[1]);
    expect(named.sort()).toEqual(Array.from({ length: 15 }, (_, i) => `S${i}`).sort());
  });
});

// a `<host src=>` binding's result type is judged by hostResultOk (analyze) and hostDecodes (check)
describe("a `<host>` binding's struct result: each shared struct is judged once per depth", () => {
  const BASE = join(homedir(), ".cache", "scrml-agent-tmp", "recursive-enum-perf-s479");
  let tmp;
  let seq = 0;
  beforeAll(() => { mkdirSync(BASE, { recursive: true }); tmp = mkdtempSync(join(BASE, "t-")); });
  afterAll(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });
  const hostApp = (ret, logic) => {
    const d = join(tmp, "p" + seq++);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "scrml.toml"), "");
    writeFileSync(join(d, "glue.js"), "export function dg() { return null; }\n");
    writeFileSync(join(d, "app.scrml"), `<host src="./glue.js">\n  dg() -> ${ret}\n</host>\n<program>\n\${\n${logic}\n}\n<p>x</p>\n</program>\n`);
    return join(d, "app.scrml");
  };
  const errsOf = async (entry) => (await compileSource(entry)).diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code} returns ${(d.message.match(/returns `([^`]+)`/) ?? [])[1]}`);
  // C0 { n: C1 } … C<n> { x: int }: C<n>'s field lies n + 1 steps down
  const chain = (n) => Array.from({ length: n }, (_, i) => `    type C${i}:struct = { n: C${i + 1}, y: int }`).concat([`    type C${n}:struct = { x: int }`]).join("\n");

  test("a 5-wide struct graph 11 deep whose LAST top field is an enum: refused, without walking 5^10 paths", async () => {
    const fs = (i) => [0, 1, 2, 3, 4].map((j) => `f${j}: D${i + 1}`).join(", ");
    const lines = Array.from({ length: 11 }, (_, i) => `    type D${i}:struct = { ${fs(i)} }`);
    lines.push("    type D11:struct = { x: int }");
    lines[0] = "    type D0:struct = { f0: D1, f1: D1, f2: D1, f3: D1, f4: E }";
    lines.push("    type E:enum = { A, B }");
    const entry = hostApp("D0", lines.join("\n"));
    const t0 = performance.now();
    const es = await errsOf(entry);
    expect(es).toEqual(["E-BOOTSTRAP-UNSUPPORTED returns D0"]);
    expect(performance.now() - t0).toBeLessThan(10_000);
  }, 60_000);

  test("the depth cap is unchanged: 12 steps decode, 13 are refused; a cyclic struct is refused", async () => {
    expect(await errsOf(hostApp("C0", chain(11)))).toEqual([]);
    expect(await errsOf(hostApp("C0", chain(12)))).toEqual(["E-BOOTSTRAP-UNSUPPORTED returns C0"]);
    expect(await errsOf(hostApp("C0[] | not", chain(9)))).toEqual([]);
    expect(await errsOf(hostApp("C0[] | not", chain(10)))).toEqual(["E-BOOTSTRAP-UNSUPPORTED returns C0[] | not"]);
    expect(await errsOf(hostApp("R", "    type R:struct = { kids: R[], x: int }"))).toEqual(["E-BOOTSTRAP-UNSUPPORTED returns R"]);
  }, 60_000);
});
