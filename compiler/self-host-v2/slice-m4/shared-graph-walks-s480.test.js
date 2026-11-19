// shared-graph-walks-s480.test.js — s480-boot-shared-graph-walks (review:#1991 F1–F3): a struct type
// graph WITH SHARING — `D0 { f0: D1, f1: D1 }`, `D1 { f0: D2, f1: D2 }`, … — compiles in time (and to an
// output) linear in the graph, not in its number of paths.
//
// F1 (g-boot-tape-grant-walk-exponential-s480) — §66.12.6 rule 4 ("A whole-struct write that changes a
// tape field is a `replace` of that field … checked against the FIELD's grants") and rule 1 (S472, "a
// `replace` of every tape its elements hold, recursively"). analyze.scrml structTapeWrites / innerTapeHits
// and the Core twin check.scrml structTapeKept carried only a PATH `seen` set, so `@b = v` on the graph
// above walked every path: n = 14 levels 0.6 s / 16 384 E-WRITE-NOT-GRANTED for ONE write, n = 16 9.6 s /
// 65 536, n = 17 past 80 s. Each walk now also keeps `done` — the named types already expanded with no
// value to compare — and reports each offending tape FIELD once, at the first path that reaches it.
//
// F2 (g-boot-host-desc-exponential-s480) — §21.3.3 rule 13 ("A binding's result … SHALL be decoded
// against its declared type"). print.scrml hostDescJs printed the decode descriptor as a TREE: 16 fields
// per struct, depth 4 was a 6.3 MB client.js, depth 5 101 MB, depth 6 out of memory. A struct the
// descriptor names from two or more places is now printed once (`const hostty$K`) and named; the runtime
// decode only reads the descriptor, so it decodes exactly as before.
//
// F3 — §21.3.3 rule 15 ("A struct field SHALL NOT be of a type that contains a declared `:host` type").
// hostTypeDataDiags walked the whole reachable graph once PER FIELD: 200 mutually reachable structs 1.2 s,
// 400 8.5 s. It (and the server / cell checks) now read one per-type answer (analyze.scrml hostyIds).
//
// Red on base: the count / size / time assertions of every "linear" test (base reports 2^n diagnostics,
// prints a 6 MB descriptor, and takes seconds where these bounds are milliseconds).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mods } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import "../slice-m1/load-program.js"; // happy-dom
import { compileFile, compileSource } from "../../../scripts/scrml-boot.ts";

const ENTRY = "app.scrml";
const run = (src) => frontEnd(mods(), [{ path: ENTRY, src }], ENTRY);
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const tapeFields = (r) => errs(r).filter((d) => d.code === "E-WRITE-NOT-GRANTED").map((d) => (d.message.match(/the tape (?:field )?`([^`]+)`/) ?? [])[1]);

// `n` levels of `w`-wide sharing, a tape at the bottom with `grants`; `@b = v` writes it whole
const tapeGraph = (n, w, grants) => {
  const L = [];
  for (let i = 0; i < n; i++) L.push(`    type D${i}:struct = { ${Array.from({ length: w }, (_, j) => `f${j}: D${i + 1}`).join(", ")} }`);
  L.push(`    type D${n}:struct = { kids: int[${grants}] }`);
  return `<program>\n\${\n${L.join("\n")}\n}\n    let <b:D0 | not=(not)/>\n    function go(v: D0) {\n        @b = v;\n    }\n<p>\${@b is given}</p>\n</program>\n`;
};
const timed = (f) => { const t0 = performance.now(); const v = f(); return [v, performance.now() - t0]; };

beforeAll(() => { mods(); }, { timeout: 300000 });

describe("F1 — a whole-struct write over a shared struct graph (§66.12.6 rules 1 and 4)", () => {
  test("ungranted tape 14 levels down a 2-wide shared graph: ONE E-WRITE-NOT-GRANTED, at the first path (base: 16 384)", () => {
    const r = run(tapeGraph(14, 2, "free, append"));
    expect(tapeFields(r)).toEqual(["@b" + ".f0".repeat(14) + ".kids"]);
  }, 60_000);

  test("40 levels: still one diagnostic, in well under a second (base: 2^40 paths)", () => {
    const [r, ms] = timed(() => run(tapeGraph(40, 2, "free, append")));
    expect(tapeFields(r)).toEqual(["@b" + ".f0".repeat(40) + ".kids"]);
    expect(ms).toBeLessThan(5_000);
  }, 60_000);

  test("granted (`replace`) 24 levels down a 2-wide graph: clean, analyze AND Core check (check.scrml structTapeKept) fast", () => {
    const [r, ms] = timed(() => run(tapeGraph(24, 2, "free, append, replace")));
    expect(errs(r)).toEqual([]);
    const [c, cms] = timed(() => mods().check.checkCore(r.core));
    expect(c).toEqual([]);
    // base: ~1.5 s each at 20 levels, x4 per two more — ~24 s each at 24
    expect(ms).toBeLessThan(5_000);
    expect(cms).toBeLessThan(5_000);
  }, 120_000);

  const P = (types, cell, fn) => `<program>\n\${\n${types}\n}\n    ${cell}\n    ${fn}\n<p>x</p>\n</program>\n`;

  test("a graph WITHOUT sharing: every offending field reported, as before (direct, nested, element-held)", () => {
    const r = run(P(
      "    type A:struct = { xs: int[free, append], b: B, c: C }\n    type B:struct = { ys: string[free], zs: int[free, replace] }\n    type C:struct = { rows: R[free, replace] }\n    type R:struct = { k: int[free, append] }",
      "let <a:A | not=(not)/>", "function go(v: A) {\n        @a = v;\n    }"));
    expect(tapeFields(r)).toEqual(["@a.xs", "@a.b.ys", "@a.c.rows[…].k"]);
    expect(errs(r)[2].message).toContain("replaces the tapes inside `@a`");
  });

  // s480 r1 (review:#1994 HIGH-1): there is no path `seen` cut any more; `done` stops the cycle. The
  // walk also reaches `@t.kids[…].kids`, the tape the ELEMENTS of `@t.kids` hold (§66.12.6 rule 1,
  // RULED S472 item 1). s480 r2 (LOW-a): that is the same field DECLARATION `T.kids`, with the same
  // grants — one fix — so it is reported once, at the first path. Granting `replace` makes it go.
  test("a recursive struct: the tape field declaration, once (`done` stops the cycle, `fields` the repeat)", () => {
    const r = run(P("    type T:struct = { kids: T[free, append], n: int }", "let <t:T | not=(not)/>", "function go(v: T) {\n        @t = v;\n    }"));
    expect(tapeFields(r)).toEqual(["@t.kids"]);
    expect(errs(r)[0].message).toContain("§66.12.6 rule 4");
    const g = run(P("    type T:struct = { kids: T[free, append, replace], n: int }", "let <t:T | not=(not)/>", "function go(v: T) {\n        @t = v;\n    }"));
    expect(tapeFields(g)).toEqual([]);
  });

  // s480 r2 (LOW-a): `B.xs` is one declaration — reported once, at the first path; the element-held
  // wording stays for a declaration reached ONLY through elements.
  test("a struct shared by a field and by a tape's elements: its tape field reported once, at the first path", () => {
    const r = run(P("    type B:struct = { xs: int[free, append] }\n    type R:struct = { a: B, list: B[free, replace], again: B }",
      "let <r:R | not=(not)/>", "function go(v: R) {\n        @r = v;\n    }"));
    expect(tapeFields(r)).toEqual(["@r.a.xs"]);
    const e = run(P("    type B:struct = { xs: int[free, append] }\n    type R:struct = { list: B[free, replace], n: int }",
      "let <r:R | not=(not)/>", "function go(v: R) {\n        @r = v;\n    }"));
    expect(tapeFields(e)).toEqual(["@r.list[…].xs"]);
    expect(errs(e)[0].message).toContain("replaces the tapes inside `@r`");
  });

  test("an object literal is still judged field by field (a literal is never skipped as `done`)", () => {
    const r = run(P("    type B:struct = { xs: int[free, append] }\n    type R:struct = { a: B, b: B, c: B }",
      "let <r:R | not=(not)/>", "function go(v: B) {\n        @r = { a: v, b: { xs: [] }, c: @r.c };\n    }"));
    // s480 r2 (LOW-a): `@r.a.xs` and `@r.b.xs` are one declaration `B.xs` — once, at the first path
    expect(tapeFields(r)).toEqual(["@r.a.xs"]);
    const k = run(P("    type B:struct = { xs: int[free, append] }\n    type R:struct = { a: B, b: B, c: B }",
      "let <r:R | not=(not)/>", "function go(v: B) {\n        @r = { a: @r.a, b: { xs: [] }, c: @r.c };\n    }"));
    expect(tapeFields(k)).toEqual(["@r.b.xs"]);
  });

  test("`reset(@b)` over a shared graph: refused naming the first path, fast (resetTapeProblem)", () => {
    const L = [];
    for (let i = 0; i < 30; i++) L.push(`    type D${i}:struct = { f0: D${i + 1}, f1: D${i + 1} }`);
    L.push("    type D30:struct = { kids: int[free, append] }");
    const [r, ms] = timed(() => run(`<program>\n\${\n${L.join("\n")}\n}\n    let <b:D0 | not=(not)/>\n    function go() {\n        reset(@b);\n    }\n<p>x</p>\n</program>\n`));
    const e = errs(r);
    expect(e.length).toBeGreaterThan(0);
    expect(e.map((d) => d.message).join("\n")).toContain("@b" + ".f0".repeat(30) + ".kids");
    expect(ms).toBeLessThan(5_000);
  }, 60_000);
});

// s480 r1 (review:#1994 HIGH-1, g-boot-tape-walk-literal-cycle-cut-s480) — §66.12.6 rule 4 ("A whole-struct
// write that changes a tape field is a `replace` of that field … checked against the FIELD's grants"). The
// path `seen` cut stopped the edge back to a struct on the stack. Against a struct written with an OBJECT
// LITERAL that is unsound: the literal keeps `y.t`, but `s: x` replaces `@r.y.s` whole — `@r.y.s.y.t`
// with it — and the cut edge `S.y -> Y` was never walked. preexist1 compiled on base and on e8e943792;
// failopen1 compiled on e8e943792 (the `done` set then hid the second path `s2: z`), refused on base.
// Both are red on e8e943792, analyze AND Core check (structTapeKept, the defence in depth).
describe("r1 — a cycle back to an object-literal-bearing struct (§66.12.6 rule 4)", () => {
  const Y = (g) => `    type Y:struct = { t: int[${g}], s: S | not }\n    type S:struct = { y: Y | not }`;
  const fo = (g) => `<program>\n\${\n${Y(g)}\n    type R:struct = { y: Y, s2: S }\n}\n    let <r:R | not=(not)/>\n    function go(x: S, z: S) {\n        if (@r is given) {\n            @r = { y: { t: @r.y.t, s: x }, s2: z };\n        }\n    }\n<p>x</p>\n</program>\n`;
  const pe = (g) => `<program>\n\${\n${Y(g)}\n    type R:struct = { y: Y }\n}\n    let <r:R | not=(not)/>\n    function go(x: S) {\n        if (@r is given) {\n            @r = { y: { t: @r.y.t, s: x } };\n        }\n    }\n<p>x</p>\n</program>\n`;
  const find = (n, pred, out = []) => {
    if (n && typeof n === "object") {
      if (pred(n)) out.push(n);
      for (const v of Object.values(n)) find(v, pred, out);
    }
    return out;
  };
  // compiled with `replace` granted (clean), then the grant flipped off in Core: C3 must refuse
  const flipped = (src) => {
    const r = run(src);
    expect(errs(r)).toEqual([]);
    expect(mods().check.checkCore(r.core)).toEqual([]);
    const core = structuredClone(r.core);
    const fds = find(core.types, (n) => n.sym && n.sym.hint === "t" && n.grants);
    expect(fds.length).toBeGreaterThan(0);
    for (const f of fds) f.grants.replace = false;
    return mods().check.checkCore(core);
  };

  test("failopen1: `s: x` and `s2: z` both replace `Y.t` — refused (e8e943792: compiled clean; base: refused)", () => {
    expect(tapeFields(run(fo("free, append")))).toEqual(["@r.y.s.y.t"]);
  });
  test("failopen1, Core: C3 refuses (e8e943792: [])", () => {
    const c = flipped(fo("free, append, replace"));
    expect(c.some((m) => m.startsWith("C3:") && m.includes("tape field `r.y.s.y.t`"))).toBe(true);
  });
  test("preexist1: `s: x` replaces `@r.y.s.y.t` under a literal that keeps `@r.y.t` — refused (base AND e8e943792: compiled)", () => {
    expect(tapeFields(run(pe("free, append")))).toEqual(["@r.y.s.y.t"]);
  });
  test("preexist1, Core: C3 refuses (base AND e8e943792: [])", () => {
    const c = flipped(pe("free, append, replace"));
    expect(c.some((m) => m.startsWith("C3:") && m.includes("tape field `r.y.s.y.t`"))).toBe(true);
  });
  // literals three deep through the cycle R -> Y -> S -> Y -> S: every state is a literal until `y: not` /
  // `s: @r.y.s.y.s`. Writing `not` over a `Y | not` that may hold a tape replaces it (as base does for any
  // optional struct field: `@a = { b: not }` refuses `@a.b.xs`).
  test("literals at several depths through the cycle: each replaced tape refused once; granted: clean; terminates", () => {
    const lit = (inner, g = "free, append") => `<program>\n\${\n${Y(g)}\n    type R:struct = { y: Y }\n}\n    let <r:R | not=(not)/>\n    function go() {\n        if (@r is given) {\n            @r = { y: { t: @r.y.t, s: { y: ${inner} } } };\n        }\n    }\n<p>x</p>\n</program>\n`;
    // depth 2: `t: @r.y.t` is not the place @r.y.s.y.t; depth 3: `y: not` replaces @r.y.s.y.s.y.t —
    // the same declaration `Y.t` (s480 r2 LOW-a: once, at the first path); granting `replace` on it clears both
    expect(tapeFields(run(lit("{ t: @r.y.t, s: { y: not } }")))).toEqual(["@r.y.s.y.t"]);
    expect(tapeFields(run(lit("{ t: @r.y.s.y.t, s: { y: not } }")))).toEqual(["@r.y.s.y.s.y.t"]);
    const k = run(lit("{ t: @r.y.t, s: { y: not } }", "free, append, replace"));
    expect(errs(k)).toEqual([]);
    expect(mods().check.checkCore(k.core)).toEqual([]);
  });
});

// s480 r2 (review:#1994 HIGH-2): check.scrml keptWalk followed a once-bound let into its literal on EVERY
// path to it — a let used twice made the walk a tree walk, 2^depth over a let DAG. With r1's cut gone a
// recursive type no longer bounded it; on a non-recursive chain base was exponential too. A clean literal
// state is now memoized by (the Local, the struct, the path class — the path only when some literal field
// in the program reads a place under it). 1597b0515: plain24 / reclet24 > 90 s, tri13 6.6 s, let24 47 s
// (checkCore alone).
describe("r2 — a let-bound literal shared along many paths (§66.12.6 rule 4, Core C3)", () => {
  const prog = (types, cell, body, params = "") => `<program>\n\${\n${types}\n}\n    ${cell}\n    function go(${params}) {\n        if (@${cell.match(/<(\w+)/)[1]} is given) {\n${body}\n        }\n    }\n<p>x</p>\n</program>\n`;
  const chain = (n, w, last, lit) => {
    const L = [`            const l0: ${lit(0)};`];
    for (let k = 1; k <= n; k++) L.push(`            const l${k}: ${last(k, Array.from({ length: w }, () => "l" + (k - 1)))};`);
    return L.join("\n");
  };
  const coreTimed = (src) => {
    const r = run(src);
    expect(errs(r)).toEqual([]);
    return timed(() => mods().check.checkCore(r.core));
  };
  test("plain24: a recursive struct with no tape, a 2-wide let DAG 24 deep — Core clean, fast", () => {
    const L = chain(24, 2, (k, xs) => `T = { a: ${xs[0]}, b: ${xs[1]}, n: ${k} }`, () => "T = { a: not, b: not, n: 0 }");
    const [c, ms] = coreTimed(prog("    type T:struct = { a: T | not, b: T | not, n: int }", "let <t:T | not=(not)/>", L + "\n            @t = l24;"));
    expect(c).toEqual([]);
    expect(ms).toBeLessThan(2_000);
  }, 120_000);
  test("reclet24: the same with a granted tape field — Core clean, fast", () => {
    const L = chain(24, 2, (k, xs) => `T = { a: ${xs[0]}, b: ${xs[1]}, xs: [] }`, () => "T = { a: v, b: v, xs: [] }");
    const [c, ms] = coreTimed(prog("    type T:struct = { a: T | not, b: T | not, xs: int[free, append, replace] }", "let <t:T | not=(not)/>", L + "\n            @t = l24;", "v: T"));
    expect(c).toEqual([]);
    expect(ms).toBeLessThan(2_000);
  }, 120_000);
  test("tri13: 3-wide sharing 13 deep — Core clean, fast", () => {
    const L = chain(13, 3, (k, xs) => `T = { a: ${xs[0]}, b: ${xs[1]}, c: ${xs[2]}, n: ${k} }`, () => "T = { a: not, b: not, c: not, n: 0 }");
    const [c, ms] = coreTimed(prog("    type T:struct = { a: T | not, b: T | not, c: T | not, n: int }", "let <t:T | not=(not)/>", L + "\n            @t = l13;"));
    expect(c).toEqual([]);
    expect(ms).toBeLessThan(2_000);
  }, 120_000);
  test("let24: a NON-recursive chain S_k { a: S_k-1, b: S_k-1 } over a let DAG (exponential on base too) — Core clean, fast", () => {
    const T = ["    type S0:struct = { t: int[free, append, replace] }"];
    for (let k = 1; k <= 24; k++) T.push(`    type S${k}:struct = { a: S${k - 1}, b: S${k - 1} }`);
    const L = chain(24, 2, (k, xs) => `S${k} = { a: ${xs[0]}, b: ${xs[1]} }`, () => "S0 = { t: [] }");
    const [c, ms] = coreTimed(prog(T.join("\n"), "let <r:S24 | not=(not)/>", L + "\n            @r = l24;"));
    expect(c).toEqual([]);
    expect(ms).toBeLessThan(2_000);
  }, 120_000);

  // Behaviour: a let-bound literal that KEEPS a tape field at one path and replaces it at another. Compiled
  // with `replace` granted (analyze treats a let as an opaque value), then the grant flipped off in Core.
  const B = "    type B:struct = { xs: int[free, append, replace] }\n    type R:struct = { a: B, b: B }";
  const flip = (body) => {
    const r = run(prog(B, "let <r:R | not=(not)/>", body));
    expect(errs(r)).toEqual([]);
    expect(mods().check.checkCore(r.core)).toEqual([]);
    const core = structuredClone(r.core);
    const td = core.types.find((t) => JSON.stringify(t).includes('"hint":"xs"'));
    let n = 0;
    const walk = (o) => { if (o && typeof o === "object") { if (o.sym && o.sym.hint === "xs" && o.grants) { o.grants.replace = false; n++; } for (const v of Object.values(o)) walk(v); } };
    walk(td);
    expect(n).toBeGreaterThan(0);
    return mods().check.checkCore(core).filter((m) => m.startsWith("C3:"));
  };
  test("a let kept at its own path, the other field kept by place: Core clean", () => {
    expect(flip("            const k: B = { xs: @r.a.xs };\n            @r = { a: k, b: @r.b };")).toEqual([]);
  });
  test("the same let at its own path AND another: the other path replaces — refused naming it (the memo must not carry the first path's keep)", () => {
    const c = flip("            const k: B = { xs: @r.a.xs };\n            @r = { a: k, b: k };");
    expect(c.length).toBe(1);
    expect(c[0]).toContain("tape field `r.b.xs`");
  });
  test("reverse order: the let keeps `@r.b.xs`, first reached at `a` — refused naming `r.a.xs`", () => {
    const c = flip("            const k: B = { xs: @r.b.xs };\n            @r = { a: k, b: k };");
    expect(c.length).toBe(1);
    expect(c[0]).toContain("tape field `r.a.xs`");
  });
  test("a let reached twice where neither path keeps: refused; where both keep (two lets): clean", () => {
    const c = flip("            const k: B = { xs: [] };\n            @r = { a: k, b: k };");
    expect(c.length).toBe(1);
    expect(c[0]).toContain("tape field `r.a.xs`");
    expect(flip("            const k: B = { xs: @r.a.xs };\n            const m: B = { xs: @r.b.xs };\n            @r = { a: k, b: m };")).toEqual([]);
  });
  test("a shared let two levels down keeps only along its own path: the second path is refused", () => {
    const T = "    type B:struct = { xs: int[free, append, replace] }\n    type M:struct = { p: B, q: B }\n    type R:struct = { a: M, b: M }";
    const r = run(prog(T, "let <r:R | not=(not)/>", "            const k: B = { xs: @r.a.p.xs };\n            const m: M = { p: k, q: @r.a.q };\n            @r = { a: m, b: { p: @r.b.p, q: @r.b.q } };\n            @r = { a: { p: @r.a.p, q: @r.a.q }, b: m };"));
    expect(errs(r)).toEqual([]);
    const core = structuredClone(r.core);
    const walk = (o) => { if (o && typeof o === "object") { if (o.sym && o.sym.hint === "xs" && o.grants) o.grants.replace = false; for (const v of Object.values(o)) walk(v); } };
    walk(core.types);
    const c = mods().check.checkCore(core).filter((m) => m.startsWith("C3:"));
    expect(c.length).toBe(1);
    expect(c[0]).toContain("tape field `r.b.p.xs`");
  });

  // LOW-b: under a value the write replaces whole, `name: <path>` is not writable — the hint rebuilds down to it
  test("the keep hint for a field under a replaced parameter value names the nested rebuild", () => {
    const r = run(prog("    type C:struct = { xs: int[free, append] }\n    type B:struct = { c: C }\n    type R:struct = { b: B }", "let <r:R | not=(not)/>", "            @r = { b: v };", "v: B"));
    const e = errs(r).filter((d) => d.code === "E-WRITE-NOT-GRANTED");
    expect(e.length).toBe(1);
    expect(e[0].message).toContain("`{ ...@r, b: { ...@r.b, c: { ...@r.b.c, xs: @r.b.c.xs } } }`");
    const d = run(prog("    type B:struct = { xs: int[free, append] }\n    type R:struct = { b: B }", "let <r:R | not=(not)/>", "            @r = { b: { xs: [] } };"));
    expect(errs(d)[0].message).toContain("Keep the field as it was (`xs: @r.b.xs`)");
  });
});

describe("F3 — rule 15 over many mutually reachable structs (hostTypeDataDiags)", () => {
  const H = "<host>\n  mq(q: string) -> MediaQueryList = window.matchMedia(q)\n</host>\n";
  // n structs, each with 3 fields `S_k[] | not` reaching others; all mutually reachable
  const ring = (n, leaf) => {
    const L = [];
    for (let i = 0; i < n; i++) L.push(`    type S${i}:struct = { ${[0, 1, 2].map((j) => `f${j}: S${(i + 1 + j) % n}[] | not`).join(", ")} }`);
    if (leaf) L[n - 1] = `    type S${n - 1}:struct = { f0: S0[] | not, m: MediaQueryList | not }`;
    return `${leaf ? H : ""}<program>\n\${\n${L.join("\n")}\n}\n<p>x</p>\n</program>\n`;
  };

  test("400 mutually reachable structs, no handle: clean, fast (base: 8.5 s)", () => {
    const [r, ms] = timed(() => run(ring(400, false)));
    expect(errs(r)).toEqual([]);
    expect(ms).toBeLessThan(4_000);
  }, 60_000);

  test("the same with one handle field: every struct's fields that reach it are refused, and only those", () => {
    const r = run(ring(40, true));
    const named = errs(r).filter((d) => d.code === "E-HOST-HANDLE-NOT-DATA").map((d) => d.message.match(/struct `([^`]+)` has the field `([^`]+)`/).slice(1).join("."));
    // S0..S38 each have three fields reaching S39 (whose `m` is the handle); S39: `f0` (reaches itself through S0) and `m`
    const want = [];
    for (let i = 0; i < 39; i++) for (const j of [0, 1, 2]) want.push(`S${i}.f${j}`);
    want.push("S39.f0", "S39.m");
    expect(named.sort()).toEqual(want.sort());
  });

  test("a struct that reaches no handle is not refused; one that reaches it through an enum payload is", () => {
    const r = run(`${H}<program>\n\${\n    type E:enum = { A(m: MediaQueryList), B }\n    type Ok:struct = { n: int[] | not }\n    type Bad:struct = { e: E[] }\n}\n<p>x</p>\n</program>\n`);
    const named = errs(r).filter((d) => d.code === "E-HOST-HANDLE-NOT-DATA").map((d) => d.message.match(/struct `([^`]+)`/)[1]);
    expect(named).toEqual(["Bad"]);
  });
});

// the survey's fixes (each walked a graph with sharing once per PATH)
describe("survey — other walks over a graph with sharing", () => {
  const R = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join("\n");
  const structs = (n, leaf) => `    type D${n}:struct = { ${leaf} }\n${R(n, (i) => `    type D${i}:struct = { a: D${i + 1}, b: D${i + 1}, c: D${i + 1}, d: D${i + 1} }`)}`;
  const chan = (n, leaf) => `<program>\n\${\n${structs(n, leaf)}\n}\n<channel name="room">\n    let <s:D0 | not=(not)/>\n</channel>\n<p>x</p>\n</program>\n`;

  test("a `<channel>` cell of a 4-wide struct graph 20 deep: synced, fast (analyze.scrml chInnerContract; base: 2.8 s at 12, x16 per level)", () => {
    const [r, ms] = timed(() => run(chan(20, "x: int")));
    expect(errs(r)).toEqual([]);
    expect(ms).toBeLessThan(5_000);
  }, 60_000);

  test("the same graph with an ungranted tape at the bottom: still refused by name (verdict unchanged)", () => {
    const r = run(chan(8, "xs: int[free, append]"));
    expect(errs(r).map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errs(r)[0].message).toContain("holds a tape whose type grants no `replace`");
  }, 60_000);

  const calls = (n, leafBody) => `<program>\n\${\n    function f${n}() -> int { ${leafBody} }\n${R(n, (i) => `    function f${i}() -> int { return f${i + 1}() + f${i + 1}(); }`)}\n    function log(x: int) { }\n}\n    let <c:int=0/>\n    <effect deps=[@c]>\${ log(f0()); }</>\n<p>\${@c}</p>\n</program>\n`;

  test("an Effect calling a write-free 40-level doubling call DAG: Core C11 clean, fast (check.scrml blockWriteWitness; base: 1.1 s at 20, x2 per level)", () => {
    const r = run(calls(40, "return 1;"));
    expect(errs(r)).toEqual([]);
    const [c, ms] = timed(() => mods().check.checkCore(r.core));
    expect(c).toEqual([]);
    expect(ms).toBeLessThan(5_000);
  }, 60_000);

  const derived = (n, cyc) => `<program>\n${R(n, (i) => `    <a${i}:int=(@a${i + 1} + @b${i + 1})/>\n    <b${i}:int=(@a${i + 1} + @b${i + 1})/>`)}\n    ${cyc ? `<a${n}:int=(@a0 + 1)/>` : `let <a${n}:int=1/>`}\n    let <b${n}:int=1/>\n<p>\${@a0}</p>\n</program>\n`;

  test("a 2-lane derived DAG 40 deep: no cycle, fast (analyze.scrml derivedPath; base: 8.2 s at 24, x2 per level)", () => {
    const [r, ms] = timed(() => run(derived(40, false)));
    expect(errs(r)).toEqual([]);
    expect(ms).toBeLessThan(5_000);
  }, 60_000);

  test("the same DAG closed into a cycle at its bottom: E-DERIVED-CIRCULAR-DEP still found", () => {
    const r = run(derived(12, true));
    expect(errs(r).map((d) => d.code)).toContain("E-DERIVED-CIRCULAR-DEP");
  }, 60_000);
});

describe("F2 — a `<host src=>` result over a shared struct graph: the descriptor is printed once per struct (§21.3.3 rule 13)", () => {
  const BASE = join(homedir(), ".cache", "scrml-agent-tmp", "shared-graph-walks-s480");
  let tmp;
  let seq = 0;
  beforeAll(() => { mkdirSync(BASE, { recursive: true }); tmp = mkdtempSync(join(BASE, "t-")); });
  afterAll(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });
  const project = (files) => {
    const d = join(tmp, "p" + seq++);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "scrml.toml"), "");
    for (const [p, t] of Object.entries(files)) writeFileSync(join(d, p), t);
    return d;
  };
  const graph = (w, depth, leaf = "x: int") => {
    const L = [];
    for (let i = 0; i < depth; i++) L.push(`    type D${i}:struct = { ${Array.from({ length: w }, (_, j) => `f${j}: D${i + 1}`).join(", ")} }`);
    L.push(`    type D${depth}:struct = { ${leaf} }`);
    return L.join("\n");
  };
  // glue: a w-wide value `depth` deep whose leaves count 0, 1, 2, … in field order; `bad` puts a string at leaf `bad`
  const glue = (w, depth, bad = -1) => `let n = 0;\nfunction mk(d) {\n  if (d === ${depth}) { const v = n++; return { x: v === ${bad} ? "s" : v }; }\n  const o = {};\n  for (let j = 0; j < ${w}; j++) o["f" + j] = mk(d + 1);\n  return o;\n}\nexport function dg() { n = 0; return mk(0); }\n`;
  const app = (w, depth, body, logic = "") => `<host src="./glue.js">\n  dg() -> D0\n</host>\n<program>\n\${\n${graph(w, depth)}\n${logic}\n}\n${body}\n</program>\n`;
  // a function reading the decoded value at `path` (a member access on a call result is not in the bootstrap)
  const reader = (name, path) => `    function ${name}() -> int {\n        const v: D0 = dg();\n        return v.${path}.x;\n    }`;

  async function runPage(d) {
    const out = join(d, "dist");
    const r = await compileFile(join(d, ENTRY), { outDir: out });
    expect(r.diagnostics.filter((x) => x.severity === "error").map((x) => `${x.code}: ${x.message}`)).toEqual([]);
    const html = readFileSync(join(out, "index.html"), "utf8");
    document.head.innerHTML = /<head>([\s\S]*)<\/head>/.exec(html)[1].replace(/<script[^>]*><\/script>/g, "");
    document.body.innerHTML = "";
    await import(join(out, "program.client.js"));
    return { out, r, js: readFileSync(join(out, "program.client.js"), "utf8") };
  }

  test("16 fields per struct, depth 4: a small client.js (base: 6.3 MB)", async () => {
    const d = project({ "glue.js": glue(16, 4), [ENTRY]: app(16, 4, "<p>x</p>") });
    const r = await compileSource(join(d, ENTRY));
    expect(r.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
    expect(r.client.js.length).toBeLessThan(64_000);
  }, 120_000);

  test("depth 8: linear growth — each struct printed once (base: out of memory past depth 5)", async () => {
    const d = project({ "glue.js": glue(16, 8), [ENTRY]: app(16, 8, "<p>x</p>") });
    const t0 = performance.now();
    const p = await compileSource(join(d, ENTRY));
    const ms = performance.now() - t0;
    expect(p.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
    expect(p.client.js.length).toBeLessThan(64_000);
    // D1..D8 are each named from 16 places: printed once each (D0, the result, is printed where it stands)
    for (let k = 0; k < 8; k++) expect(p.client.js.split(`const hostty$${k} = `).length).toBe(2);
    expect(p.client.js).not.toContain("const hostty$8 = ");
    expect(ms).toBeLessThan(20_000);
  }, 120_000);

  test("run: a 3-wide value 4 deep decodes field by field (the leaf at f2.f1.f0.f1 is leaf 2*27+1*9+0*3+1 = 64)", async () => {
    const d = project({ "glue.js": glue(3, 4), [ENTRY]: app(3, 4, '<p id="o">${r1()}/${r2()}/${r3()}</p>', [reader("r1", "f2.f1.f0.f1"), reader("r2", "f0.f0.f0.f0"), reader("r3", "f2.f2.f2.f2")].join("\n")) });
    const { js } = await runPage(d);
    expect(js).toContain("const hostty$0 = ");
    expect(document.getElementById("o").textContent).toBe("64/0/80");
  }, 120_000);

  test("run: a mismatch deep in the value traps E-HOST-VALUE-MISMATCH-RT naming the same path as before", async () => {
    const d = project({ "glue.js": glue(3, 3, 22), [ENTRY]: app(3, 3, '<p id="o">${r1()}</p>', reader("r1", "f0.f0.f0")) });
    let e = null;
    try { await runPage(d); } catch (x) { e = x; }
    expect(e && e.code).toBe("E-HOST-VALUE-MISMATCH-RT");
    // leaf 22 = f2.f1.f1 (2*9 + 1*3 + 1)
    expect(e.message).toContain("its result's field `f2`'s field `f1`'s field `f1`'s field `x` is \"s\" where its declared type is int");
  }, 120_000);

  test("a descriptor WITHOUT sharing is printed inline, byte for byte as before", async () => {
    const d = project({
      "glue.js": "export function dg() { return null; }\n",
      [ENTRY]: `<host src="./glue.js">\n  dg() -> A | not\n</host>\n<program>\n\${\n    type A:struct = { b: B, n: int[] }\n    type B:struct = { s: string, h: bool | not }\n}\n<p>x</p>\n</program>\n`,
    });
    const r = await compileSource(join(d, ENTRY));
    expect(r.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
    expect(r.client.js).not.toContain("hostty$");
    expect(r.client.js).toContain('rt.hostCall(() => hostsrc$0.dg(), { k: "maybe", inner: { k: "struct", name: "A", fields: [{ name: "b", ty: { k: "struct", name: "B", fields: [{ name: "s", ty: { k: "string" } }, { name: "h", ty: { k: "maybe", inner: { k: "bool" } } }] } }, { name: "n", ty: { k: "tape", elem: { k: "int" } } }] } }, "dg() — the `<host>` binding")');
  }, 120_000);
});
