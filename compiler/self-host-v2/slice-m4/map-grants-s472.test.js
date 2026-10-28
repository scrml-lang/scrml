// map-grants-s472.test.js — s472-boot-map-grants: a `map` (or `sort` / `reverse`)
// written back REPLACES every element, so it needs the grants a position write of
// each element would — gap g-boot-map-position-write-bypasses-element-tape-grants-s472.
//
// SPEC §66.11.2: "`@x = @x.map(…)` is a **position-write** (granted by `write`)".
// §66.12.6 rule 3: "`xs[i] = v` | a position write | `write`" and "Writing the result
// back, `xs = xs.sort();`, is a whole-value write (rule 4). It keeps the length and
// changes positions, so it is classified as a position write, granted by `write`, like
// `xs = xs.map(…)`". Rule 1: "A tape's grants govern every write to it, in each position
// that can hold one". Rule 4: "A whole-struct write that changes a tape field is a
// `replace` of that field … checked against the FIELD's grants, not the struct's" and
// "No spelling reaches a write the grants refuse."
//
// RULED S472 (user-voice-scrml.md "five PA recs", items 1 and 2):
//   1. "An outer `replace` does NOT override inner tapes' grants. A `replace` (or any whole
//      write) of a tape counts as a `replace` of every tape its elements hold, RECURSIVELY"
//      — so `@g = [[]]` on `int[free, append][write, replace]` is refused, "as are
//      alias/helper spellings (`const h = @g.map(…); @g = h;`, `@g = remap(@g)`) and deeper
//      levels".
//   2. "`sort` / `reverse` write-backs (permutations) are EXEMPT from inner-tape `replace` —
//      they create no new element value. A map that rebuilds elements (incl. a spreading map)
//      is not a permutation and stays judged."
// The one grant reader judges it (analyze `innerTapeHits` / `tapeWriteInnerProblems`,
// `structTapeWrites` recursing into a tape field's elements); Core C3 mirrors it
// (`innerTapeKept`, `structTapeKept`, `positionTapeProblem`). The map's callback is not walked:
// an identity or spreading map is judged as rebuilding every element.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code).sort();
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const $ = (sel) => document.querySelector(sel);
const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);
let k = 0;
const load = (src) => loadProgram(clean(src).core, "s472mg-" + k++, []);
const find = (n, pred, out = []) => {
  if (n && typeof n === "object") {
    if (pred(n)) out.push(n);
    for (const v of Object.values(n)) find(v, pred, out);
  }
  return out;
};

const prog = (decls, body, markup = `        <p id="o">\${@shown}</p>`) =>
  `<program>\n${decls}\n    let <shown:string=""/>\n    function go() {\n${body}\n    }\n    <main>\n        <button onclick=go()>go</button>\n${markup}\n    </main>\n</program>\n`;

// a struct element holding a tape field; `mk` builds a fresh element
const K = (kids) => `    type K:struct = { name: string, kids: int[${kids}] }\n    fn mk(k: K) -> K {\n        const r: K = { name: k.name + "!", kids: [] };\n        return r;\n    }`;
const KS = (kids) => `${K(kids)}\n    <ks:K[write]=([{ name: "a", kids: [1, 2] }])/>`;
const G = (inner, outer = "write") => `    <g:int[${inner}][${outer}]=([[1, 2]])/>`;
const showG = `        <p id="o">\${@g[0].length}</p>`;

// ---------------------------------------------------------------------------
describe("a cell's tape written back through map / sort / reverse", () => {
  test("struct elements: `@ks = @ks.map(k => mk(k))` replaces each element's append-only `kids` — refused (rule 4)", () => {
    expect(codes(prog(KS("free, append"), `        @ks = @ks.map(k => mk(k));`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    const m = run(prog(KS("free, append"), `        @ks = @ks.map(k => mk(k));`)).diags[0].message;
    expect(m).toContain("kids");
    expect(m).toContain("§66.12.6");
    expect(m).toContain("RULED S472");
  });

  test("tape of tapes: `@g = @g.map(r => [])` replaces each append-only inner tape — refused (rule 1)", () => {
    expect(codes(prog(G("free, append"), `        @g = @g.map(r => []);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("an identity map and a spread that keeps the tape field are refused too — the callback is not walked (fail closed)", () => {
    expect(codes(prog(G("free, append"), `        @g = @g.map(r => r);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog(KS("free, append"), `        @ks = @ks.map(k => k);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("`reverse` / `sort` written back are EXEMPT — a permutation creates no new element value (RULED S472 item 2); they run", async () => {
    clean(prog(G("free, append"), `        @g = @g.reverse();`));
    clean(prog(KS("free, append"), `        @ks = @ks.sort((a, b) => a.kids.length - b.kids.length);`));
    clean(prog(`    <d:int[free, append][write][write]=([[[1]], [[2, 3]]])/>`, `        @d = @d.reverse();`));
    await load(prog(`    <g:int[free, append][write]=([[1, 2], [3]])/>`, `        @g = @g.reverse();`, showG));
    expect($("#o").textContent).toBe("2");
    click(btn("go"));
    expect($("#o").textContent).toBe("1");
  });

  test("a spreading map rebuilds every element — it stays judged (RULED S472 item 2)", () => {
    // the bootstrap has no struct context for a callback's object literal, so that more basic
    // refusal comes first; the map itself is judged whatever its callback (`mk`, `k => k` above)
    expect(codes(prog(KS("free, append"), `        @ks = @ks.map(k => ({ ...k, name: "z" }));`))).toEqual(["E-TYPE-STRUCT-CONTEXT"]);
    expect(codes(prog(KS("free, append"), `        @ks = @ks.map(k => k);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("a more basic refusal of the value comes first (a two-parameter callback; a sort with no natural order)", () => {
    expect(codes(prog(G("free, append"), `        @g = @g.map((r, i) => []);`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(prog(G("free, append"), `        @g = @g.sort();`))).toEqual(["E-TYPE-031"]);
  });

  test("an outer `replace` does NOT override the inner tapes' grants — every spelling (RULED S472 item 1)", () => {
    const GR = G("free, append", "write, replace");
    const helpers = `\n    fn fresh() -> int[free, append][write, replace] {\n        const r: int[free, append][write, replace] = [[]];\n        return r;\n    }\n    fn remap(g: int[free, append][write, replace]) -> int[free, append][write, replace] {\n        return g;\n    }`;
    expect(codes(prog(GR, `        @g = @g.map(r => []);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog(GR, `        @g = [[]];`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog(GR, `        const h = @g.map(r => []);\n        @g = h;`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog(GR + helpers, `        @g = remap(@g);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog(GR + helpers, `        @g = fresh();`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    // the place itself keeps every element; appending a new element replaces none
    clean(prog(GR, `        @g = @g;`));
    clean(prog(G("free, append", "write, replace, free, append"), `        @g = [...@g, []];`));
    // granted all the way down: the whole replace is admitted
    clean(prog(G("free, append, replace", "write, replace"), `        @g = [[]];`));
  });

  test("deeper levels: a map whose middle tape grants `replace` still replaces the innermost append-only tapes", () => {
    expect(codes(prog(`    <d:int[free, append][write, replace][write]=([[[1, 2]]])/>`, `        @d = @d.map(r => [[]]);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog(`    <d:int[free, append][write, replace][write]=([[[1, 2]]])/>`, `        @d[0] = [[]];`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    clean(prog(`    <d:int[free, append, replace][write, replace][write]=([[[1, 2]]])/>`, `        @d = @d.map(r => [[]]);`));
    // the struct twin: K2 holds `rows: R[write, replace]`, R holds `kids: int[free, append]`
    const K2 = (kids) => `    type R:struct = { kids: int[${kids}] }\n    type K2:struct = { rows: R[write, replace] }\n    fn mk2(k: K2) -> K2 {\n        const r: K2 = { rows: [] };\n        return r;\n    }\n    <ks:K2[write]=([{ rows: [{ kids: [1] }] }])/>`;
    expect(codes(prog(K2("free, append"), `        @ks = @ks.map(k => mk2(k));`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    clean(prog(K2("free, append, replace"), `        @ks = @ks.map(k => mk2(k));`));
    // a whole-struct write of a struct holding a tape of structs holding a tape
    const B2 = `    type R:struct = { kids: int[free, append] }\n    type B2:struct = { rows: R[write, replace] }\n    let <b:B2=({ rows: [{ kids: [1] }] })/>`;
    expect(codes(prog(B2, `        @b = { rows: [] };`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("nested depth: a tape field inside a struct inside the element is replaced too", () => {
    const decls = `    type In:struct = { ys: int[free, append] }\n    type N:struct = { name: string, inner: In }\n    fn mkN(n: N) -> N {\n        const r: N = { name: n.name, inner: { ys: [] } };\n        return r;\n    }\n    <ns:N[write]=([{ name: "a", inner: { ys: [1] } }])/>`;
    expect(codes(prog(decls, `        @ns = @ns.map(n => mkN(n));`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("granted control: inner tapes that grant `replace` — the map is clean, runs, and Core is clean", async () => {
    await load(prog(G("free, append, replace"), `        @g = @g.map(r => []);`, showG));
    expect($("#o").textContent).toBe("2");
    click(btn("go"));
    expect($("#o").textContent).toBe("0");
    await load(prog(KS("free, append, replace"), `        @ks = @ks.map(k => mk(k));\n        const k0 = @ks[0];\n        @shown = k0.name;`));
    click(btn("go"));
    expect($("#o").textContent).toBe("a!");
  });

  test("an element with no tape in it is unaffected — `write` alone grants the map", () => {
    clean(prog(`    <xs:int[write]=([1, 2])/>`, `        @xs = @xs.map(x => x + 1);`));
  });
});

// ---------------------------------------------------------------------------
describe("a local, a parameter and a struct field rebound through map", () => {
  test("a local tape of tapes / of structs: `h = h.map(…)` — refused", () => {
    expect(codes(prog("", `        let h: int[free, append][write] = [[1]];\n        h = h.map(r => []);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog(K("free, append"), `        let ks: K[write] = [{ name: "a", kids: [] }];\n        ks = ks.map(k => mk(k));`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    clean(prog("", `        let h: int[free, append, replace][write] = [[1]];\n        h = h.map(r => []);`));
    // a whole replace of a local, its outer `replace` granted (RULED S472 item 1)
    expect(codes(prog("", `        let h: int[free, append][write, replace] = [[1]];\n        h = [[]];`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    clean(prog("", `        let h: int[free, append][write, replace] = [[1]];\n        h = h.reverse();`));
  });

  test("nested depth on a local: `d = d.map(…)` on `int[free, append][write][write]` replaces each middle tape (no `replace`)", () => {
    expect(codes(prog("", `        let d: int[free, append, replace][write][write] = [[[1]]];\n        d = d.map(r => r);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    clean(prog("", `        let d: int[free, append, replace][write, replace][write] = [[[1]]];\n        d = d.map(r => r);`));
  });

  test("a parameter's tape field rebound through map — refused", () => {
    const decls = `    type B:struct = { g: int[free, append][write] }\n    fn f(b: B) -> int {\n        b.g = b.g.map(r => []);\n        return 1;\n    }`;
    expect(codes(prog(decls, `        @shown = "x";`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("a local struct's tape field: `b.g = b.g.map(…)` — refused; granted control clean", () => {
    const B = (inner) => `    type B:struct = { g: int[${inner}][write] }`;
    expect(codes(prog(B("free, append"), `        let b: B = { g: [[1]] };\n        b.g = b.g.map(r => []);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    clean(prog(B("free, append, replace"), `        let b: B = { g: [[1]] };\n        b.g = b.g.map(r => []);`));
  });

  const BC = (inner) => `    type B:struct = { g: int[${inner}][write, replace] }\n    let <b:B=({ g: [[1]] })/>`;
  test("a cell's struct field: `@b.g = @b.g.map(…)` stays refused (a sub-field tape edit is not in the bootstrap)", () => {
    expect(codes(prog(BC("free, append"), `        @b.g = @b.g.map(r => []);`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("a cell's instance-spread override `@b = { ...@b, g: @b.g.map(…) }` — refused on the inner tapes; granted control clean", () => {
    expect(codes(prog(BC("free, append"), `        @b = { ...@b, g: @b.g.map(r => []) };`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    clean(prog(BC("free, append, replace"), `        @b = { ...@b, g: @b.g.map(r => []) };`));
  });
});

// ---------------------------------------------------------------------------
describe("Core check C3 — a PositionWrite replaces every element (defence in depth)", () => {
  test("a whole Replace `@g = [[]]`, its inner `replace` flipped off in Core: C3 refuses (RULED S472 item 1)", () => {
    const r = clean(prog(G("free, append, replace", "write, replace"), `        @g = [[]];`));
    const ws = find(r.core.fns, (n) => n.variant === "Write");
    expect(ws.map((w) => w.data.edit.variant ?? w.data.edit)).toEqual(["Replace"]);
    const core = structuredClone(r.core);
    const inner = find(core.decls, (n) => n.variant === "Seq" && (n.data.elem === "Int" || n.data.elem?.variant === "Int") && n.data.grants && n.data.grants.replace === true);
    expect(inner.length).toBeGreaterThan(0);
    for (const t of inner) t.data.grants.replace = false;
    expect(mods.check.checkCore(core).some((m) => m.startsWith("C3:") && m.includes("held by an element"))).toBe(true);
  });

  test("a granted map rewritten in Core to a Replace still fails C3 once the inner `replace` is off", () => {
    const r = clean(prog(G("free, append, replace", "write, replace"), `        @g = @g.map(r => []);`));
    const core = structuredClone(r.core);
    for (const t of find(core.decls, (n) => n.variant === "Seq" && (n.data.elem === "Int" || n.data.elem?.variant === "Int") && n.data.grants)) t.data.grants.replace = false;
    for (const w of find(core.fns, (n) => n.variant === "Write")) w.data.edit = typeof w.data.edit === "string" ? "Replace" : { variant: "Replace" };
    expect(mods.check.checkCore(core).some((m) => m.startsWith("C3:"))).toBe(true);
  });

  test("a reverse written back passes C3 with the inner `replace` off (a permutation is exempt)", () => {
    const r = clean(prog(G("free, append"), `        @g = @g.reverse();`));
    expect(mods.check.checkCore(r.core)).toEqual([]);
  });

  test("a granted map, its inner `replace` flipped off in Core: C3 refuses", () => {
    const r = clean(prog(G("free, append, replace"), `        @g = @g.map(r => []);`));
    const ws = find(r.core.fns, (n) => n.variant === "Write");
    expect(ws.map((w) => w.data.edit.variant ?? w.data.edit)).toEqual(["PositionWrite"]);
    const core = structuredClone(r.core);
    const inner = find(core.decls, (n) => n.variant === "Seq" && n.data.grants && n.data.grants.replace === true);
    expect(inner.length).toBeGreaterThan(0);
    for (const t of inner) t.data.grants.replace = false;
    expect(mods.check.checkCore(core).some((m) => m.startsWith("C3:") && m.includes("itself a tape"))).toBe(true);
  });

  test("struct elements: the tape field's `replace` flipped off in Core: C3 refuses", () => {
    const r = clean(prog(KS("free, append, replace"), `        @ks = @ks.map(k => mk(k));`));
    const core = structuredClone(r.core);
    const inner = find(core.types ?? core, (n) => n.variant === "Seq" && n.data.grants && n.data.grants.replace === true);
    const fds = find(core, (n) => n && n.sym && n.sym.hint === "kids" && n.grants);
    expect(fds.length + inner.length).toBeGreaterThan(0);
    for (const f of fds) f.grants.replace = false;
    for (const t of inner) t.data.grants.replace = false;
    expect(mods.check.checkCore(core).some((m) => m.startsWith("C3:") && m.includes("kids"))).toBe(true);
  });

  test("a FieldAt override that maps a tape field, its inner `replace` flipped off in Core: C3 refuses", () => {
    const src = prog(`    type B:struct = { g: int[free, append, replace][write, replace] }\n    let <b:B=({ g: [[1]] })/>`, `        @b = { ...@b, g: @b.g.map(r => []) };`);
    const r = clean(src);
    const core = structuredClone(r.core);
    const inner = find(core, (n) => n.variant === "Seq" && n.data.grants && n.data.grants.replace === true && (n.data.elem === "Int" || n.data.elem?.variant === "Int"));
    expect(inner.length).toBeGreaterThan(0);
    for (const t of inner) t.data.grants.replace = false;
    expect(mods.check.checkCore(core).some((m) => m.startsWith("C3:") && m.includes("held by an element"))).toBe(true);
  });
});
