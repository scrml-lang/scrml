// position-write-s472.test.js — s472-boot-position-write: POSITION writes
// (`xs[i] = v`) and writes to a PART of a local (`p.f = v`, `a.xs[i] = v`,
// `xs[i].f = v`) — gaps g-boot-position-write-s472, g-boot-local-part-write-s472.
//
// SPEC §66.12.6 rule 3: "`xs[i] = v` | a position write | `write`"; §66.12.2:
// "`write` | positions may be overwritten in place (`xs[i] = v`; …)" and "The old
// spelling `writable` is refused: it is `E-GRANT-UNKNOWN`". Rule 3: "An index
// write at or past the end … breaks the per-position type"; §66.12.8 rule 7: "a
// negative index WRITE `xs[-1] = v` traps". Rule 1: a tape's grants govern every
// write in "a local binding: `let`, `const`, or the keywordless binding" and "a
// function parameter"; "Inference never invents a grant." §66.11.4: "a field
// write is an edit — a field is writable along its own contract … a field with
// no contract is fixed". §66.11.7: "every granted in-place edit notifies
// subscribers exactly as a whole-value write does".
//
//   A. a CELL's position write — Core PositionAt, granted by `write` through the
//      one grant reader, re-checked in Core (C3), reactive, the trap out of range.
//   B. a LOCAL's part write — Core Assign with a path (value semantics), judged
//      by the deepest field's contract / the tape's own grants.
//   C. what stays refused (value positions, sub-field tapes, rows, counted heads).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, takePageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

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
// A click whose handler is expected to TRAP: the test's own capture (as
// loops-s469.test.js does), the shared page-error capture drained.
const clickTrap = (el) => {
  const errs = [];
  const onErr = (e) => errs.push(e.error);
  window.addEventListener("error", onErr);
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  window.removeEventListener("error", onErr);
  takePageErrors();
  return errs;
};
let k = 0;
const load = (src) => loadProgram(clean(src).core, "s472pw-" + k++, []);
const find = (n, pred, out = []) => {
  if (n && typeof n === "object") {
    if (pred(n)) out.push(n);
    for (const v of Object.values(n)) find(v, pred, out);
  }
  return out;
};

// a program: declarations, a `go()` function body, and markup
const prog = (decls, body, markup = `        <p id="o">\${@shown}</p>`) =>
  `<program>\n${decls}\n    let <shown:string=""/>\n    function go() {\n${body}\n    }\n    <main>\n        <button onclick=go()>go</button>\n${markup}\n    </main>\n</program>\n`;
const cells = (t) => `    <xs:${t}=(["a", "b", "c"])/>`;
const showXs = `        <p id="o">\${@xs.join(",")}</p>`;

// ---------------------------------------------------------------------------
describe("A — a cell's position write `@xs[i] = v` (§66.12.6 rule 3)", () => {
  test("granted by `write`: lowered to ONE Write of PositionAt, and Core check is clean", () => {
    const r = clean(prog(cells("string[write]"), `        @xs[1] = "B";`, showXs));
    const ws = find(r.core.fns, (n) => n.variant === "Write");
    expect(ws.length).toBe(1);
    expect(ws[0].data.edit.variant).toBe("PositionAt");
    expect(ws[0].data.edit.data.loc).toMatch(/^t\.scrml:\d+$/);
  });

  test("it runs, and the render re-runs — the write notifies like a whole write (§66.11.7)", async () => {
    await load(prog(cells("string[write]"), `        @xs[1] = "B";\n        @xs[2] = "C";`, showXs));
    expect($("#o").textContent).toBe("a,b,c");
    click(btn("go"));
    expect($("#o").textContent).toBe("a,B,C");
  });

  test("`replace` subsumes the position write (§66.11.3)", () => {
    clean(prog(cells("string[replace]"), `        @xs[0] = "z";`, showXs));
  });

  test("a tape that does not grant `write` is refused — E-WRITE-NOT-GRANTED", () => {
    expect(codes(prog(cells("string[free, append]"), `        @xs[0] = "z";`, showXs))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog(cells("string[]"), `        @xs[0] = "z";`, showXs))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("`writable` is not the grant's spelling — E-GRANT-UNKNOWN (§66.12.2, O10 RULED S469)", () => {
    expect(codes(prog(cells("string[writable]"), `        @xs[0] = "z";`, showXs))).toContain("E-GRANT-UNKNOWN");
  });

  test("the value is an element, the index an `int` — E-TYPE-031", () => {
    expect(codes(prog(cells("string[write]"), `        @xs[0] = 1;`, showXs))).toEqual(["E-TYPE-031"]);
    expect(codes(prog(cells("string[write]"), `        @xs["0"] = "z";`, showXs))).toEqual(["E-TYPE-031"]);
  });

  test("an index outside the tape is the E-INDEX-OUT-OF-RANGE-RT trap, and nothing is written (§66.12.6 rule 3; §66.12.8 rule 7)", async () => {
    await load(prog(cells("string[write]") + `\n    <n:int=3/>`, `        @xs[0] = "z";\n        @xs[@n] = "past";`, showXs));
    const errs = clickTrap(btn("go"));
    expect(errs.length).toBe(1);
    expect(errs[0].code).toBe("E-INDEX-OUT-OF-RANGE-RT");
    expect(errs[0].detail).toEqual({ index: 3, length: 3, at: "t.scrml:7" });
    // the first write landed; the trapping one wrote nothing (no growth, no padding)
    expect($("#o").textContent).toBe("z,b,c");
  });

  test("a NEGATIVE index traps too — no counting from the end (§66.12.8 rule 7)", async () => {
    await load(prog(cells("string[write]") + `\n    <n:int=(0 - 1)/>`, `        @xs[@n] = "neg";`, showXs));
    const errs = clickTrap(btn("go"));
    expect(errs.length).toBe(1);
    expect(errs[0].code).toBe("E-INDEX-OUT-OF-RANGE-RT");
    expect($("#o").textContent).toBe("a,b,c");
  });

  test("an element whose struct holds a tape: replacing the element replaces that tape — its own grants (§66.12.6 rule 4)", () => {
    const decls = (g) => `    type K:struct = { name: string, kids: int[${g}] }\n    <ks:K[write]=([{ name: "a", kids: [] }])/>`;
    expect(codes(prog(decls("free, append"), `        @ks[0] = { name: "b", kids: [] };`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    clean(prog(decls("free, append, replace"), `        @ks[0] = { name: "b", kids: [] };`));
  });

  test("Core check C3 refuses a PositionAt whose field does not grant `write` (defence in depth)", () => {
    const r = clean(prog(cells("string[write]"), `        @xs[1] = "B";`, showXs));
    const core = structuredClone(r.core);
    const xs = find(core.decls, (n) => n.sym && n.sym.hint === "xs" && n.grants)[0];
    xs.grants.edits = xs.grants.edits.filter((e) => e !== "PositionWrite" && e.variant !== "PositionWrite");
    xs.grants.replace = false;
    expect(mods.check.checkCore(core).some((m) => m.startsWith("C3:") && m.includes("position write"))).toBe(true);
  });

  test("a position write in a VALUE position stays refused — E-VALUE-WRITES-STATE (§6.15)", () => {
    const src = `<program>\n${cells("string[write]")}\n    function bump() -> string {\n        @xs[0] = "z";\n        return "x";\n    }\n    <main>\n        <p>\${bump()}</p>\n    </main>\n</program>\n`;
    expect(codes(src)).toContain("E-VALUE-WRITES-STATE");
  });

  test("a position write of a SUB-FIELD tape stays refused (Core writes a struct field whole) — E-BOOTSTRAP-UNSUPPORTED", () => {
    const decls = `    type Box:struct = { title: string, xs: int[write] }\n    let <b:Box=({ title: "t", xs: [1] })/>`;
    expect(codes(prog(decls, `        @b.xs[0] = 2;`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

// ---------------------------------------------------------------------------
const AR = `    type Ar:struct = { nxt: int[write], let head: int, tail: int, txt: string[free, append, write] }`;

describe("B — a write to a part of a local (value semantics; §66.11.4, §66.12.6 rule 1)", () => {
  test("a parameter's tape field, a `let` field, a `let` local's fixed field, a local tape — run, and the caller's value is untouched", async () => {
    const src = prog(`${AR}\n    fn link(ar: Ar, i: int, v: int) -> Ar {\n        ar.nxt[i] = v;\n        ar.head = v;\n        return ar;\n    }`,
      `        let a: Ar = { nxt: [0, 0, 0], head: -1, tail: 0, txt: ["x"] };\n        const b: Ar = link(a, 1, 7);\n        a.tail = 3;\n        a.txt[0] = "y";\n        let ys: int[write] = [1, 2];\n        ys[0] = 9;\n        @shown = \`\${b.nxt[1]},\${b.head},\${a.nxt[1]},\${a.head},\${a.tail},\${a.txt[0]},\${ys[0]}\`;`);
    const r = clean(src);
    // a part write is ONE Assign with a path — never a Write (a local is not a cell)
    const as = find(r.core.fns, (n) => n.variant === "Assign" && n.data.path.length > 0);
    expect(as.length).toBe(5);
    expect(find(r.core.fns, (n) => n.variant === "Write").length).toBe(1);   // only `@shown = …`
    await load(src);
    click(btn("go"));
    // link wrote ITS copy (b); `a` is the caller's value, unchanged by the call (§66.10)
    expect($("#o").textContent).toBe("7,7,0,-1,3,y,9");
  });

  test("an alias keeps the value it was given — no alias sees the write (§66.10)", async () => {
    await load(prog(AR, `        let a: Ar = { nxt: [0], head: 1, tail: 0, txt: [] };\n        const c: Ar = a;\n        a.head = 5;\n        a.nxt[0] = 4;\n        @shown = \`\${c.head},\${c.nxt[0]},\${a.head},\${a.nxt[0]}\`;`));
    click(btn("go"));
    expect($("#o").textContent).toBe("1,0,5,4");
  });

  test("nested parts: a field of a field, a field of a tape element, a position of a position", async () => {
    const decls = `    type In:struct = { let n: int }\n    type Out:struct = { inner: In, rows: In[write] }`;
    await load(prog(decls, `        let o: Out = { inner: { n: 1 }, rows: [{ n: 2 }, { n: 3 }] };\n        o.inner.n = 10;\n        o.rows[1].n = 30;\n        let g: int[write][write] = [[1, 2], [3, 4]];\n        g[1][0] = 33;\n        const r0: In = o.rows[0];\n        const r1: In = o.rows[1];\n        @shown = \`\${o.inner.n},\${r0.n},\${r1.n},\${g[1][0]},\${g[0][0]}\`;`));
    click(btn("go"));
    expect($("#o").textContent).toBe("10,2,30,33,1");
  });

  test("an index outside a local tape is the E-INDEX-OUT-OF-RANGE-RT trap — the local is not grown", async () => {
    await load(prog("    <n:int=2/>", `        let ys: int[write] = [1, 2];\n        @shown = "before";\n        ys[@n] = 3;\n        @shown = "after";`));
    const errs = clickTrap(btn("go"));
    expect(errs.length).toBe(1);
    expect(errs[0].code).toBe("E-INDEX-OUT-OF-RANGE-RT");
    expect($("#o").textContent).toBe("before");
  });

  test("a local tape is judged by its TYPE's grants: no `write`, an inferred type (rule 1), a parameter's type — E-WRITE-NOT-GRANTED", () => {
    expect(codes(prog("", `        let ys: int[free, append] = [1];\n        ys[0] = 2;`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("", `        let ys = [1];\n        ys[0] = 2;`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("    <src:int[write]=([1])/>", `        let ys = @src;\n        ys[0] = 2;`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    // a tape ELEMENT of an inferred local is part of the inferred type too — no grant (fail closed);
    // annotated, the written type grants it
    expect(codes(prog("    <g:int[write][write]=([[1]])/>", `        let h = @g;\n        h[0][0] = 2;`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    clean(prog("    <g:int[write][write]=([[1]])/>", `        let h: int[write][write] = @g;\n        h[0][0] = 2;`));
    // a tape reached through a struct FIELD carries the field's declared grants, inferred holder or not
    clean(prog(`    type Q:struct = { nxt: int[write] }\n    <q:Q=({ nxt: [0] })/>`, `        let a = @q;\n        a.nxt[0] = 1;`));
    expect(codes(prog("    fn f(xs: int[]) -> int {\n        xs[0] = 1;\n        return 1;\n    }", `        @shown = "x";`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog(`    type Q:struct = { nxt: int[] }\n    fn f(q: Q) -> int {\n        q.nxt[0] = 1;\n        return 1;\n    }`, `        @shown = "x";`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("`const` freezes the BINDING, not the value: the part's own contract decides (§50.9; §66.12.6; dpa-052 Q2)", () => {
    // a tape with `write` held by a `const`, a `let` field through a `const` / a parameter: granted
    clean(prog(AR, `        const ys: int[write] = [1];\n        ys[0] = 2;\n        const a: Ar = { nxt: [0], head: 1, tail: 0, txt: [] };\n        a.head = 2;\n        a.nxt[0] = 1;`));
    // a contract-free field through a `const` or a parameter: fixed — nothing grants it
    expect(codes(prog(AR, `        const a: Ar = { nxt: [0], head: 1, tail: 0, txt: [] };\n        a.tail = 2;`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog(`${AR}\n    fn f(a: Ar) -> Ar {\n        a.tail = 2;\n        return a;\n    }`, `        @shown = "x";`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("a field inside a tape element is judged by its own contract alone (dpa-052 Q3) — fixed there even in a `let` local", () => {
    const decls = (f) => `    type E:struct = { ${f}: int }`;
    expect(codes(prog(decls("n"), `        let es: E[write] = [{ n: 1 }];\n        es[0].n = 2;`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    clean(prog(decls("let n"), `        let es: E[] = [{ n: 1 }];\n        es[0].n = 2;`));
  });

  test("a tape FIELD written whole is classified and judged by the field's own grants (§66.11.2; §66.12.6 rules 1 and 4)", async () => {
    const box = (g) => `    type Box:struct = { title: string, xs: int[${g}] }`;
    expect(codes(prog(box("free, append"), `        let q: Box = { title: "t", xs: [] };\n        q.xs = [];`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    clean(prog(box("free, append, replace"), `        let q: Box = { title: "t", xs: [] };\n        q.xs = [];`));
    // a classified shape: `q.xs = q.xs.filter(…)` is a shrink-anywhere (`remove`)
    expect(codes(prog(box("free, append"), `        let q: Box = { title: "t", xs: [] };\n        q.xs = q.xs.filter(x => x > 1);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog(box("remove"), `        let q: Box = { title: "t", xs: [] };\n        q.xs = q.xs.filter(x => x > 1);`))).toEqual(["E-WRITE-INVARIANT"]);
    await load(prog(box("free, remove"), `        let q: Box = { title: "t", xs: [1, 2, 3] };\n        q.xs = q.xs.filter(x => x > 1);\n        @shown = \`\${q.xs.length}\`;`));
    click(btn("go"));
    expect($("#o").textContent).toBe("2");
  });

  test("a struct field written whole replaces the tapes inside it — their own grants (§66.12.6 rule 4)", () => {
    const decls = `    type Inner:struct = { ys: int[free, append] }\n    type Outer:struct = { name: string, inner: Inner }`;
    expect(codes(prog(decls, `        let o: Outer = { name: "o", inner: { ys: [] } };\n        o.inner = { ys: [] };`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    clean(prog(decls, `        let o: Outer = { name: "o", inner: { ys: [] } };\n        o.name = "p";`));
  });

  test("the value and the index are type-checked against the part — E-TYPE-031", () => {
    expect(codes(prog(AR, `        let a: Ar = { nxt: [0], head: 1, tail: 0, txt: [] };\n        a.head = "x";`))).toEqual(["E-TYPE-031"]);
    expect(codes(prog(AR, `        let a: Ar = { nxt: [0], head: 1, tail: 0, txt: [] };\n        a.nxt["0"] = 1;`))).toEqual(["E-TYPE-031"]);
    expect(codes(prog(AR, `        let a: Ar = { nxt: [0], head: 1, tail: 0, txt: [] };\n        a.nope = 1;`))).toEqual(["E-SCOPE-001"]);
  });

  test("a part write drops the narrowing of that part (a later read is unproven again)", () => {
    const decls = `    type P:struct = { let v: int | not }\n    fn f(q: P) -> int {\n        let p: P = q;\n        if (p.v is given) {\n            p.v = not;\n            const z: int = p.v;\n            return z;\n        }\n        return 0;\n    }`;
    expect(codes(prog(decls, `        @shown = "x";`))).toContain("E-TYPE-031");
  });

  // review r1 F2: §35.2 — "The binding is immutable … The compiler SHALL reject any reassignment to a
  // `lin`-declared identifier": a part write rebinds it to a copy nothing may read — refused like `t = …`
  test("a part write of a `lin` binding is refused like its reassignment — E-ASSIGN-CONST (§35.2)", () => {
    const decls = `    type T:struct = { let n: int }\n    <c:T=({ n: 1 })/>\n    function use(t: T) -> int {\n        return t.n;\n    }`;
    expect(codes(prog(decls, `        lin t = @c;\n        t.n = 2;`))).toEqual(["E-ASSIGN-CONST"]);
    expect(codes(prog(decls + `\n    function f(lin t: T) -> int {\n        t.n = 2;\n        return 1;\n    }`, `        @shown = "x";`))).toEqual(["E-ASSIGN-CONST"]);
    // after a use it is ALSO a second use
    expect(codes(prog(decls, `        lin t = @c;\n        const a: int = use(t);\n        t.n = 2;`))).toEqual(["E-ASSIGN-CONST", "E-LIN-002"]);
  });

  // review r1 F1: an element that is itself a tape — replacing it is a `replace` of the INNER tape,
  // judged by its own grants (§66.12.6 rules 1 and 4) — cell, local, parameter, nested depth, and C3
  test("an element that is itself a tape: replacing it needs the INNER tape's `replace` — cell, local, parameter, nested", () => {
    const G = (inner) => `    <g:int[${inner}][write]=([[1, 2]])/>`;
    expect(codes(prog(G("free, append"), `        @g[0] = [];`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    clean(prog(G("free, append, replace"), `        @g[0] = [];`));
    expect(codes(prog(G("free, append"), `        let h: int[free, append][write] = @g;\n        h[0] = [];`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("    fn f(h: int[free, append][write]) -> int {\n        h[0] = [];\n        return h[0].length;\n    }", `        @shown = "x";`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("", `        let d: int[free, append][write][write] = [[[1]]];\n        d[0][0] = [];`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    clean(prog("", `        let d: int[free, append, replace][write][write] = [[[1]]];\n        d[0][0] = [];`));
    // the middle tape grants `write` but not `replace`: replacing ITS element-tape is refused too
    expect(codes(prog("", `        let d: int[free, append, replace][write][write] = [[[1]]];\n        d[0] = [[2]];`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    // in place, the inner tape is judged by its own grants (unchanged)
    clean(prog(G("write"), `        @g[0][0] = 9;`.replace("@g[0][0] = 9;", "let h: int[write][write] = @g;\n        h[0][0] = 9;")));
  });

  test("Core check C3 refuses a PositionAt that replaces an inner tape without `replace` (defence in depth)", () => {
    const r = clean(prog(`    <g:int[free, append, replace][write]=([[1, 2]])/>`, `        @g[0] = [];`));
    const core = structuredClone(r.core);
    const inner = find(core.decls, (n) => n.variant === "Seq" && (n.data.elem === "Int" || n.data.elem?.variant === "Int") && n.data.grants && n.data.grants.replace === true);
    expect(inner.length).toBeGreaterThan(0);
    for (const t of inner) t.data.grants.replace = false;
    expect(mods.check.checkCore(core).some((m) => m.startsWith("C3:") && m.includes("itself a tape"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("C — what stays refused", () => {
  test("a counted head's step rebinds its counters — a part write there is refused", () => {
    expect(codes(prog("", `        let ys: int[write] = [0, 0];\n        for (let i = 0; i < 2; ys[0] = i) {\n            @shown = "x";\n        }`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a write THROUGH a cell's tape position (`@xs[i][j]`) is not in the bootstrap yet", () => {
    expect(codes(prog("    <g:int[write][write]=([[1]])/>", `        @g[0][0] = 2;`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

// ---------------------------------------------------------------------------
describe("D — a part write in a SERVER function (the server runtime's writePath)", () => {
  test("printed as `rt.writePath(…)` and run by the server artifact: the right value; the trap is a fixed 500", async () => {
    const SA = await import("./server-artifact-harness.js");
    const src = `<program db="./app.db">\n    let <n:int=0/>\n    server function put(i: int, v: int) -> int {\n        let ys: int[write] = [1, 2, 3];\n        ys[i] = v;\n        return ys[0] + ys[1] + ys[2];\n    }\n    <main>\n        <button id="go" onclick={ @n = put(1, 10) !{ .Transport(t) :> return }; }>go</button>\n    </main>\n</program>\n`;
    const { core } = SA.compile(src);
    expect(SA.check(core)).toEqual([]);
    const { srv, routes, js } = await SA.serve(core, SA.spyDriver().fn);
    expect(js).toContain("writePath(");
    const ok = await SA.post(srv, SA.pathOf(routes, "put"), [1, 10]);
    expect([ok.status, ok.json]).toEqual([200, 14]);
    const bad = await SA.post(srv, SA.pathOf(routes, "put"), [3, 10]);
    expect(bad.status).toBe(500);
    expect(bad.text).not.toContain("E-INDEX-OUT-OF-RANGE-RT");     // §19.17: the index, the length and the location stay off the wire
  });

  // the granted twins of the S239 reviewer's `s1/indexWrite` await probe (server-await-review.test.js
  // pins the ungranted original as REFUSED): the waiting call's value is what is written — awaited
  // (S467 §13 amendment item 4: no wrong password is WELCOMEd)
  test("await probe, granted: a waiting call in the value of a position write is refused (its index would run after it — the U1b ANF follow-up); fail closed", async () => {
    const SA = await import("./server-artifact-harness.js");
    const { program } = await import("./server-await-probes.js");
    expect(SA.codes(program(`        let a: boolean[write] = [false];\n        a[0] = check(pass, row.pw);\n        if (!a[0]) return "REJECTED";\n        return "WELCOME"`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("await probe: a waiting call in the INDEX of a position write is refused at the front end (it was left un-awaited — checkCore C-S8s — before s472)", async () => {
    const SA = await import("./server-artifact-harness.js");
    const { program } = await import("./server-await-probes.js");
    const top = `    function idx(p: string, h: string) -> int {\n        if (check(p, h)) return 1;\n        return 0;\n    }`;
    const src = program(`        let a: boolean[write] = [false, false];\n        a[idx(pass, row.pw)] = true;\n        if (!a[1]) return "REJECTED";\n        return "WELCOME"`, top);
    const ds = (await import("./harness.js")).frontEnd(SA.mods(), [{ path: "app.scrml", src }]).diags;
    expect(ds.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(ds[0].message).toContain("an index of an indexed write");
  });
  for (const [name, top, body] of [
    ["the value evaluated first, then a position write `a[0] = v`", "", `        let a: boolean[write] = [false];\n        const v: boolean = check(pass, row.pw);\n        a[0] = v;\n        if (!a[0]) return "REJECTED";\n        return "WELCOME"`],
    ["a field write `b.ok = check(…)`", `    type B:struct = { let ok: boolean }`, `        let b: B = { ok: false };\n        b.ok = check(pass, row.pw);\n        if (!b.ok) return "REJECTED";\n        return "WELCOME"`],
  ]) {
    test(`await probe, granted: ${name} — wrong → REJECTED, right → WELCOME`, async () => {
      const SA = await import("./server-artifact-harness.js");
      const { program, RIGHT, WRONG } = await import("./server-await-probes.js");
      const { core } = SA.compile(program(body, top));
      expect(SA.check(core)).toEqual([]);
      const sql = await SA.realDb(["CREATE TABLE users (name TEXT, pw TEXT)"], { users: [{ name: "bob", pw: RIGHT }] });
      const { srv, routes } = await SA.serve(core, sql);
      const wrong = await SA.post(srv, SA.pathOf(routes, "f"), ["bob", WRONG]);
      const right = await SA.post(srv, SA.pathOf(routes, "f"), ["bob", RIGHT]);
      expect([wrong.json, right.json]).toEqual(["REJECTED", "WELCOME"]);
    }, 60000);
  }
});
