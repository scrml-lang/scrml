// derived-no-inner-wcap-s476.test.js — s476-boot-derived-no-inner-wcap: a DERIVED cell is not
// seeded by grants inside its type (shape 2 of the S476 design pass,
// scrml-support/docs/deep-dives/derived-cell-with-grants-2026-11-08.md).
//
// SPEC §66.9 rule 3: "**Derived = locked + a reactive initializer.** A locked declaration whose
// initializer reads cells is **DERIVED**: it recomputes when a dependency changes (the §6.6.3
// lazy-pull semantics) and cannot be written". No §66 sentence seeds a locked cell at its
// declaration; O60 (§66.9 rule 8) seeds only "a LIVE initializer **at a use site**".
//
// Before this change the bootstrap minted a write capability (Field.wcap) for a locked + reads
// cell whenever its TYPE reached a `replace`-admitting struct field — a `let` field, or a
// `T[replace]` tape field, of the cell's own struct type or of its element struct — and the
// printer, keying on wcap, emitted `rt.seeded` (read once, never tracks). Those grants are
// INNER: they describe what the value's parts admit in a holder that can write them, and a
// derived cell is never written. RED ON BASE (f92d1a8fb): every "tracks" test below rendered
// the stale first value, and the inner-grant writes compiled.
//
// OUT OF SCOPE, pinned UNCHANGED: a locked + reads cell with an OWN grant on its outermost tape
// (`<xs:int[append]=([@k])/>`, `<xs:int[write, free, append, replace]=(@src…)/>`) — owner
// questions Q1/Q2 of the design pass — and the use-site case (Q3: a component attribute given a
// live value).

import { describe, test, expect, beforeAll } from "bun:test";
import { mods, compile, artifacts, check } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, click, warmLoadProgram } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 120000 });

const one = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const codes = (src) => one(src).diags.map((d) => d.code);
const P = (decls, markup = "<p>x</p>") => `<program>\n${decls}\n    <main>${markup}</main>\n</program>\n`;
// the printed constructor of a program cell, by name: "seeded" | "derived"
const ctorOf = (src, name) => {
  const { core } = compile(src);
  const js = artifacts(core).client;
  const text = typeof js === "string" ? js : js.js;
  const m = new RegExp("/\\* " + name + " \\*/\\] = rt\\.(seeded|derived)\\(").exec(text);
  return m ? m[1] : null;
};
const fieldOf = (core, name) => {
  for (const d of core.decls) for (const f of d.fields) if (f.sym.hint === name) return f;
  return null;
};
const BUMP = "    function bump() { @k = @k + 1; }";
const BTN = "<button id=\"b\" onclick=bump()>+</button>";
const bumps = (n) => { for (let i = 0; i < n; i++) click(document.querySelector("#b")); };
const text = (sel) => document.querySelector(sel).textContent;

describe("the adopter repro (p2): an element struct's `T[replace]` field does not seed a derived tape", () => {
  const SRC = P(
    "    type Row:struct = { xs: int[replace] }\n    let <n:int=1/>\n    <rows:Row[]=(make(@n))/>\n" +
    "    fn make(n: int) -> Row[] {\n        let out: Row[free, append] = [];\n        let i: int = 0;\n" +
    "        for (i < n) { out.append({ xs: [i] }); i = i + 1; }\n        return out;\n    }\n" +
    "    function bump() { @n = @n + 1; }",
    "<button id=\"inc\" onclick=bump()>+</button><p id=\"o\">${@n} ${@rows.length}</p>");
  test("it is printed as a Derived, with no write capability and no inner grant", () => {
    expect(codes(SRC)).toEqual([]);
    expect(ctorOf(SRC, "rows")).toBe("derived");
    const f = fieldOf(compile(SRC).core, "rows");
    expect(f.wcap == null).toBe(true);
    expect(f.grants.edits.length).toBe(0);
    expect(f.grants.replace).toBe(false);
  });
  test("RUNS: after two bumps the derived tape tracks (`3 3`; base rendered `3 1`)", async () => {
    await loadProgram(compile(SRC).core, "s476-p2");
    expect(text("#o")).toBe("1 1");
    click(document.querySelector("#inc"));
    click(document.querySelector("#inc"));
    expect(text("#o")).toBe("3 3");
  });
});

describe("p3: a struct type's `let` field does not seed a derived struct", () => {
  const SRC = P("    type P:struct = { n: int, let tag: string }\n    let <k:int=1/>\n    <pp:P=({ n: @k, tag: \"t\" })/>\n" + BUMP,
    BTN + "<p id=\"o\">${@pp.n} ${@pp.tag}</p>");
  test("derived, no wcap", () => {
    expect(codes(SRC)).toEqual([]);
    expect(ctorOf(SRC, "pp")).toBe("derived");
    expect(fieldOf(compile(SRC).core, "pp").wcap == null).toBe(true);
  });
  test("RUNS: the derived struct tracks @k", async () => {
    await loadProgram(compile(SRC).core, "s476-p3");
    expect(text("#o")).toBe("1 t");
    bumps(3);
    expect(text("#o")).toBe("4 t");
  });
  test("a write through the inner `let` field of the DERIVED cell is refused (§6.6.18 / §66.9 rule 5); base accepted it", () => {
    const c = codes(P("    type P:struct = { n: int, let tag: string }\n    let <k:int=1/>\n    <pp:P=({ n: @k, tag: \"t\" })/>\n    function w() { @pp.tag = \"u\"; }", "<p>${@pp.n}</p><button onclick=w()>w</button>"));
    expect(c.length).toBe(1);
    expect(c[0]).toBe("E-DERIVED-VALUE-MUTATE");
  });
  test("twin: `let` before the `<` is the seeded form — the inner field write stays granted", async () => {
    const src = P("    type P:struct = { n: int, let tag: string }\n    let <k:int=1/>\n    let <pp:P=({ n: @k, tag: \"t\" })/>\n" + BUMP + "\n    function w() { @pp.tag = \"u\"; }",
      BTN + "<button id=\"w\" onclick=w()>w</button><p id=\"o\">${@pp.n} ${@pp.tag}</p>");
    expect(codes(src)).toEqual([]);
    expect(ctorOf(src, "pp")).toBe("seeded");
    await loadProgram(compile(src).core, "s476-p3-let");
    bumps(2);
    click(document.querySelector("#w"));
    expect(text("#o")).toBe("1 u");
  });
  test("twin: a LOCKED struct with a literal initializer (not derived) keeps its inner `let` field write", () => {
    const src = P("    type P:struct = { n: int, let tag: string }\n    <pp:P=({ n: 1, tag: \"t\" })/>\n    function w() { @pp.tag = \"u\"; }", "<p>${@pp.tag}</p><button onclick=w()>w</button>");
    expect(codes(src)).toEqual([]);
    expect(ctorOf(src, "pp")).toBe("seeded");
  });
});

describe("other inner grants on a derived cell are inert", () => {
  test("v2e: a struct's own `T[replace]` tape field — derived, tracks", async () => {
    const src = P("    type Box:struct = { xs: int[replace] }\n    let <k:int=1/>\n    <b:Box=({ xs: [@k, @k] })/>\n" + BUMP,
      BTN + "<p id=\"o\">${@b.xs[0]}</p>");
    expect(codes(src)).toEqual([]);
    expect(ctorOf(src, "b")).toBe("derived");
    await loadProgram(compile(src).core, "s476-v2e");
    bumps(2);
    expect(text("#o")).toBe("3");
  });
  test("an element struct's `let` scalar field — derived, tracks; the element-field write is refused", async () => {
    const decl = "    type R:struct = { id: int, let tag: string }\n    let <k:int=1/>\n    <rs:R[]=([{ id: @k, tag: \"a\" }])/>\n" +
      "    fn firstId(rs: R[]) -> int { const r = rs[0]; return r.id; }\n";
    const src = P(decl + BUMP, BTN + "<p id=\"o\">${firstId(@rs)}</p>");
    expect(codes(src)).toEqual([]);
    expect(ctorOf(src, "rs")).toBe("derived");
    await loadProgram(compile(src).core, "s476-elem-let");
    bumps(4);
    expect(text("#o")).toBe("5");
    const c = codes(P(decl + "    function w() { @rs[0].tag = \"b\"; }", "<p>${@rs.length}</p><button onclick=w()>w</button>"));
    expect(c.length).toBe(1);
    expect(c[0]).toBe("E-DERIVED-VALUE-MUTATE");
  });
  test("nested element tapes: `Row[][]` over `Row = { xs: int[replace] }` — derived, tracks", async () => {
    const src = P("    type Row:struct = { xs: int[replace] }\n    let <k:int=1/>\n    <gg:Row[][]=([[{ xs: [@k] }], [{ xs: [@k, @k] }]])/>\n" +
      "    fn deep(g: Row[][]) -> int { const a = g[1]; const r = a[0]; const ys = r.xs; return ys[1]; }\n" + BUMP,
      BTN + "<p id=\"o\">${@gg.length} ${deep(@gg)}</p>");
    expect(codes(src)).toEqual([]);
    expect(ctorOf(src, "gg")).toBe("derived");
    await loadProgram(compile(src).core, "s476-nested");
    bumps(2);
    expect(text("#o")).toBe("2 3");
  });
  test("a struct holding a tape of granted structs — derived, tracks", async () => {
    const src = P("    type Row:struct = { let tag: string, xs: int[replace] }\n    type Tbl:struct = { rows: Row[] }\n    let <k:int=1/>\n    <t:Tbl=({ rows: [{ tag: \"a\", xs: [@k] }] })/>\n" +
      "    fn top(t: Tbl) -> int { const rs = t.rows; const r = rs[0]; const ys = r.xs; return ys[0]; }\n" + BUMP,
      BTN + "<p id=\"o\">${top(@t)}</p>");
    expect(codes(src)).toEqual([]);
    expect(ctorOf(src, "t")).toBe("derived");
    await loadProgram(compile(src).core, "s476-tbl");
    bumps(1);
    expect(text("#o")).toBe("2");
  });
});

describe("writes into a derived cell through an inner grant (§6.6.18 item 2: E-DERIVED-VALUE-MUTATE)", () => {
  test("`@b.xs = [5]` where `Box.xs: int[replace]` — refused, naming the cell, what it reads and the ways out", () => {
    const r = one(P("    type Box:struct = { xs: int[replace] }\n    let <k:int=1/>\n    <b:Box=({ xs: [@k] })/>\n    function w() { @b.xs = [5]; }", "<p>${@b.xs.length}</p><button onclick=w()>w</button>"));
    expect(r.diags.map((d) => d.code)).toEqual(["E-DERIVED-VALUE-MUTATE"]);
    const m = r.diags[0].message;
    expect(m).toContain("`@b`");
    expect(m).toContain("@k");
    expect(m).toContain("`let`");
  });
  test("a whole write of the derived tape stays E-DERIVED-WRITE", () => {
    expect(codes(P("    type Row:struct = { xs: int[replace] }\n    let <k:int=1/>\n    <rows:Row[]=([{ xs: [@k] }])/>\n    function w() { @rows = []; }", "<p>${@rows.length}</p><button onclick=w()>w</button>"))).toEqual(["E-DERIVED-WRITE"]);
  });
  test("UNCHANGED: a sub-field write where the type grants no part (`P.tag` plain) keeps its code", () => {
    expect(codes(P("    type P:struct = { n: int, tag: string }\n    let <k:int=1/>\n    <pp:P=({ n: @k, tag: \"t\" })/>\n    function w() { @pp.tag = \"u\"; }", "<p>${@pp.n}</p><button onclick=w()>w</button>"))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });
});

describe("the design pass's \"not triggered\" shapes stay derived (unchanged)", () => {
  test("v2b: a struct field with an EDIT grant (`int[append]`, no replace)", () => {
    expect(ctorOf(P("    type Box:struct = { xs: int[append] }\n    let <k:int=1/>\n    <b:Box=({ xs: [@k] })/>", "<p>${@b.xs.length}</p>"), "b")).toBe("derived");
  });
  test("v2d: an inner tape edit grant (`int[append][]`)", () => {
    expect(ctorOf(P("    let <k:int=1/>\n    <g:int[append][]=([[@k]])/>", "<p>${@g.length}</p>"), "g")).toBe("derived");
  });
  test("a plain derived scalar and a plain derived tape", () => {
    expect(ctorOf(P("    let <k:int=1/>\n    <d:int=(@k + 1)/>", "<p>${@d}</p>"), "d")).toBe("derived");
    expect(ctorOf(P("    let <k:int=1/>\n    <d:int[]=([@k])/>", "<p>${@d.length}</p>"), "d")).toBe("derived");
  });
});

describe("PIN — OUT OF SCOPE, UNCHANGED: an OWN grant on the derived cell's outermost tape (owner Q1/Q2)", () => {
  test("v1b `<xs:int[append]=([@k])/>` (no writes) is still printed `seeded`", () => {
    const src = P("    let <k:int=1/>\n    <xs:int[append]=([@k])/>", "<p>${@xs.length}</p>");
    expect(codes(src)).toEqual([]);
    expect(ctorOf(src, "xs")).toBe("seeded");
  });
  test("shape 1 `<xs:int[write, free, append, replace]=(@src.map(…))/>` + granted writes: still `seeded`, writes accepted", () => {
    const src = P("    let <k:int=1/>\n    <src:int[]=([@k, 2, 3])/>\n    <xs:int[write, free, append, replace]=(@src.map(x => x + 1))/>\n    function a() { @xs[0] = 9; }\n    function b() { @xs.append(4); }",
      "<p>${@xs.length}</p><button onclick=a()>a</button><button onclick=b()>b</button>");
    expect(codes(src)).toEqual([]);
    expect(ctorOf(src, "xs")).toBe("seeded");
    expect(ctorOf(src, "src")).toBe("derived");
  });
  test("an own `[replace]` whose elements also carry inner grants: still `seeded` (the own grant decides; inner ones kept)", () => {
    const src = P("    type Row:struct = { let tag: string }\n    let <k:int=1/>\n    <dd:Row[replace]=(mk(@k))/>\n" +
      "    fn mk(n: int) -> Row[] { let out: Row[free, append] = []; let i: int = 0; for (i < n) { out.append({ tag: \"b\" }); i = i + 1; } return out; }\n" +
      "    function w() { @dd[0].tag = \"z\"; }",
      "<p>${@dd.length}</p><button onclick=w()>w</button>");
    expect(codes(src)).toEqual([]);
    expect(ctorOf(src, "dd")).toBe("seeded");
    const f = fieldOf(compile(src).core, "dd");
    expect(f.wcap == null).toBe(false);
    expect(f.grants.replace).toBe(true);
    expect(f.grants.edits.some((e) => e.variant === "FieldAt")).toBe(true);
  });
  test("Q3 (use site): a component attribute `rows:Row[]` given a live value is still `rt.seeded(rows$ …)`", () => {
    const src = P("    type Row:struct = { xs: int[replace] }\n    let <n:int=1/>\n    <src:Row[]=([{ xs: [@n] }])/>\n    <tbl rows:Row[]/>\n        renders <p>${rows.length}</p>", "<tbl rows=(@src)/>");
    expect(codes(src)).toEqual([]);
    const js = artifacts(compile(src).core).client;
    expect((typeof js === "string" ? js : js.js)).toContain("/* rows */] = rt.seeded(rows$");
    // the declaration-site `src` is in scope: derived now
    expect(ctorOf(src, "src")).toBe("derived");
  });
});

describe("Core invariant C1b: a Derived field carries no inner (FieldAt) grant", () => {
  test("a hand-built Core with a Derived field granted an inner FieldAt is refused by checkCore", () => {
    const { core } = compile(P("    type P:struct = { n: int, let tag: string }\n    <pp:P=({ n: 1, tag: \"t\" })/>\n    function w() { @pp.tag = \"u\"; }", "<p>${@pp.tag}</p><button onclick=w()>w</button>"));
    expect(check(core)).toEqual([]);
    const derivedMode = fieldOf(compile(P("    let <k:int=1/>\n    <d:int=(@k)/>", "<p>${@d}</p>")).core, "d").mode;
    const f = fieldOf(core, "pp");
    f.mode = derivedMode;
    const found = check(core);
    expect(found.some((m) => m.startsWith("C1b:"))).toBe(true);
  });
  test("every compiled program in this file satisfies it (no C1b on real output)", () => {
    expect(check(compile(P("    type P:struct = { n: int, let tag: string }\n    let <k:int=1/>\n    <pp:P=({ n: @k, tag: \"t\" })/>", "<p>${@pp.n}</p>")).core)).toEqual([]);
  });
});
