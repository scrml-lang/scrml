// tape-inplace-s476.test.js — s476-boot-tape-inplace: a granted edit of a LOCAL tape
// (`xs.append(v)` … `xs.remove(i)`) and a part write of a local (`xs[i] = v`, `p.f = v`)
// edit the local's value IN PLACE when no other binding can see it — and copy, as
// before, whenever one could. The edit is semantics-inert: the same program prints the
// same output; only time changes.
//
// SPEC §66.10 item 1: "A binding, argument or field initialized from a cell (or from any
// value) holds a **snapshot** of that value." Item 2: "No write to a source is observable
// through a value taken from it earlier; no write through such a value is observable in its
// source". Item 5 (non-normative): "The implementation lean is copy-on-write, so a snapshot
// costs nothing unless mutated. The copy strategy is not part of the contract."
//
// The proof (print.scrml `ownedLocals`): a local is edited in place only when, in the whole
// function body, the local is read only where its value is not kept — a position read, its
// `.length`, a built-in that makes a new value, a lambda's `map` / `filter` receiver, or a
// `return` — and never captured by a `defer`. Any other read (an argument, a binding, a cell
// write, a struct or tape element, a `for … of` iterable, a `match`) makes it copy, every write.
//
//   A. every alias shape stays a snapshot (these outputs are identical on the base build).
//   B. the printed shape — in place where the proof holds, a copy where it does not.
//   C. time: 100,000 appends / slot writes on a local, amortized O(1) each.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";
import * as rt from "../slice-m1/runtime/runtime.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => { expectNoPageErrors(); });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const clean = (src) => {
  const r = run(src);
  expect(r.diags.filter((d) => d.severity === "Error").map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const printed = (src) => mods.print.printProgram(clean(src).core, "t.client.js", "scrml-runtime.js").js;
const $ = (sel) => document.querySelector(sel);
const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);
let k = 0;
const load = (src) => loadProgram(clean(src).core, "s476tip-" + k++, []);

// a program: declarations, a `go()` function body, and markup showing `@shown`
const prog = (decls, body) =>
  `<program>\n${decls}\n    let <shown:string=""/>\n    function go() {\n${body}\n    }\n    <main>\n        <button onclick=go()>go</button>\n        <p id="o">\${@shown}</p>\n    </main>\n</program>\n`;
// the text of an int tape, "1,2,3"
const txt = (x) => `${x}.map(v => \`\${v}\`).join(",")`;
const show = (...xs) => `        @shown = ${xs.map(txt).join(' + "|" + ')};`;
const outOf = async (decls, body) => {
  await load(prog(decls, body));
  click(btn("go"));
  return $("#o").textContent;
};
// the body of one function `f` (from `function f(` to the next top-level function)
const fnText = (js, name) => {
  const at = js.indexOf(`function ${name}(`);
  expect(at).toBeGreaterThanOrEqual(0);
  const next = js.indexOf("\nfunction ", at + 1);
  return js.slice(at, next < 0 ? js.length : next);
};
const ALL = "int[free, append, prepend, pop, shift, remove]";

// ---------------------------------------------------------------------------
describe("A — every alias shape is a snapshot (§66.10 items 1-2)", () => {
  test("`const b = a; a.append(2)` leaves `b`", async () => {
    expect(await outOf("", `        let a: int[free, append] = [1];\n        const b: int[] = a;\n        a.append(2);\n${show("a", "b")}`)).toBe("1,2|1");
  });

  test("an edit after passing the local to a function: the callee's result keeps the old value", async () => {
    const decls = "    fn keep(xs: int[]) -> int[] { return xs; }";
    expect(await outOf(decls, `        let a: int[free, append] = [1];\n        const k: int[] = keep(a);\n        a.append(2);\n${show("a", "k")}`)).toBe("1,2|1");
  });

  test("a callee's edit of its parameter changes neither the caller's local nor what the caller keeps", async () => {
    const decls = "    fn grow(xs: int[free, append]) -> int[] {\n        xs.append(9);\n        xs.append(8);\n        return xs;\n    }";
    expect(await outOf(decls, `        let a: int[free, append] = [1];\n        const g: int[] = grow(a);\n        a.append(2);\n        const h: int[] = grow(a);\n${show("a", "g", "h")}`)).toBe("1,2|1,9,8|1,2,9,8");
  });

  test("an edit after storing the local in a cell: the cell keeps the old value", async () => {
    const decls = "    <c:int[replace]=([0])/>";
    expect(await outOf(decls, `        let a: int[free, append] = [1];\n        @c = a;\n        a.append(2);\n${show("a", "@c")}`)).toBe("1,2|1");
  });

  test("an edit of a value a function returned: the function's other results and the caller's copies are untouched", async () => {
    const decls = "    fn mk() -> int[] {\n        let out: int[free, append] = [];\n        out.append(1);\n        return out;\n    }";
    expect(await outOf(decls, `        const r: int[] = mk();\n        let s: int[free, append] = r;\n        s.append(5);\n        let t: int[free, append] = mk();\n        t.append(6);\n${show("r", "s", "t", "mk()")}`)).toBe("1|1,5|1,6|1");
  });

  test("a `defer` that edits the local after `return` reads it: the returned value is the one at the return (§19.16.2)", async () => {
    const decls = "    fn f() -> int[] {\n        let out: int[free, append] = [1];\n        defer { out.append(2); }\n        return out;\n    }";
    expect(await outOf(decls, `        const r: int[] = f();\n${show("r")}`)).toBe("1");
  });

  test("a local returned inside a struct literal (twice): the caller's edit of one field leaves the other and the struct", async () => {
    const decls = "    type Box:struct = { xs: int[], ys: int[] }\n    fn mk2() -> Box {\n        let a: int[free, append] = [];\n        a.append(1);\n        return { xs: a, ys: a };\n    }";
    expect(await outOf(decls, `        const b: Box = mk2();\n        let x: int[free, append] = b.xs;\n        x.append(2);\n        x.append(3);\n${show("x", "b.xs", "b.ys")}`)).toBe("1,2,3|1|1");
  });

  test("an edit after putting the local in a struct: the struct keeps the old value", async () => {
    const decls = "    type Box:struct = { xs: int[] }";
    expect(await outOf(decls, `        let a: int[free, append] = [1];\n        const b: Box = { xs: a };\n        a.append(2);\n${show("a", "b.xs")}`)).toBe("1,2|1");
  });

  test("an edit after putting the local in a tape: the outer tape's element keeps the old value", async () => {
    expect(await outOf("", `        let a: int[free, append] = [1];\n        let rows: int[][free, append] = [];\n        rows.append(a);\n        a.append(2);\n        rows.append(a);\n        @shown = rows.map(r => ${txt("r")}).join("|") + "|" + ${txt("a")};`)).toBe("1|1,2|1,2");
  });

  test("a loop that keeps the previous iteration's value, then edits: each kept value is a snapshot", async () => {
    expect(await outOf("", `        let a: int[free, append] = [];\n        let prev: int[replace] = [];\n        let older: int[replace] = [];\n        for (i of 0..3) {\n            older = prev;\n            prev = a;\n            a.append(i);\n        }\n${show("a", "prev", "older")}`)).toBe("0,1,2|0,1|0");
  });

  test("`for (x of a)` over the local while appending to it iterates the snapshot", async () => {
    expect(await outOf("", `        let a: int[free, append] = [1, 2];\n        for (x of a) { a.append(x * 10); }\n${show("a")}`)).toBe("1,2,10,20");
  });

  test("a slot write after aliasing leaves the alias", async () => {
    expect(await outOf("", `        let a: int[write] = [1, 2, 3];\n        const b: int[] = a;\n        a[0] = 9;\n        a[2] = a[0] + b[0];\n${show("a", "b")}`)).toBe("9,2,10|1,2,3");
  });

  test("a slot write on a local copied from a parameter: the caller's value is unchanged", async () => {
    const decls = "    fn bump(m: int[]) -> int[] {\n        let c: int[write] = m;\n        c[0] = c[0] + 1;\n        c[0] = c[0] + 1;\n        return c;\n    }";
    expect(await outOf(decls, `        const m: int[] = [1, 5];\n        const b: int[] = bump(m);\n        const b2: int[] = bump(b);\n${show("m", "b", "b2")}`)).toBe("1,5|3,5|5,5");
  });

  test("an element read before a slot write keeps the old element; a write inside an element leaves a read copy", async () => {
    const decls = "    type P:struct = { let n: int }";
    expect(await outOf(decls, `        let a: int[replace][write] = [[1], [2]];\n        const e: int[] = a[0];\n        a[0] = [7];\n        let ps: P[write] = [{ n: 1 }, { n: 2 }];\n        const p: P = ps[1];\n        ps[1].n = 5;\n        const q: P = ps[1];\n        const a0: int[] = a[0];\n        @shown = ${txt("e")} + "|" + ${txt("a0")} + "|" + \`\${p.n},\${q.n}\`;`)).toBe("1|7|2,5");
  });

  test("a lambda that returns the whole local keeps the value it saw", async () => {
    expect(await outOf("", `        let a: int[free, append] = [1];\n        const seen: int[][] = [0, 1].map(i => a);\n        a.append(2);\n        @shown = seen.map(s => ${txt("s")}).join("|") + "|" + ${txt("a")};`)).toBe("1|1|1,2");
  });

  test("a rebinding from another local, then an edit: the other local is unchanged", async () => {
    expect(await outOf("", `        let a: int[free, append] = [1];\n        let b: int[free, append, replace] = [5];\n        b = a;\n        b.append(2);\n        a.append(3);\n${show("a", "b")}`)).toBe("1,3|1,2");
  });

  test("the edits run in place with their meaning: append / prepend / pop / shift / remove, empties and a missing position", async () => {
    expect(await outOf("", `        let xs: ${ALL} = [1, 2, 3];\n        xs.append(4);\n        xs.prepend(0);\n        xs.pop();\n        xs.shift();\n        xs.remove(1);\n        xs.remove(7);\n        xs.remove(-1);\n        let e: ${ALL} = [];\n        e.pop();\n        e.shift();\n${show("xs", "e")}`)).toBe("1,3|");
  });

  test("a struct local's field write in place: an alias taken before is unchanged", async () => {
    const decls = "    type P:struct = { n: int, m: int }";
    expect(await outOf(decls, `        let p: P = { n: 1, m: 2 };\n        p.n = 3;\n        p.m = p.n + 1;\n        let q: P = { n: 0, m: 0 };\n        const r: P = q;\n        q.n = 9;\n        @shown = \`\${p.n},\${p.m}|\${q.n}|\${r.n}\`;`)).toBe("3,4|9|0");
  });
});

// ---------------------------------------------------------------------------
describe("B — the printed shape: in place where nothing else can see the value, a copy otherwise", () => {
  const decls = [
    "    fn build(n: int) -> int[] {",
    "        let out: int[free, append] = [];",
    "        for (i of 0..n) { out.append(i); }",
    "        return out;",
    "    }",
    "    fn aliased(n: int) -> int[] {",
    "        let out: int[free, append] = [];",
    "        const first: int[] = out;",
    "        for (i of 0..n) { out.append(i); }",
    "        return first;",
    "    }",
    "    fn counts(m: int[]) -> int[] {",
    "        let c: int[write] = m;",
    "        c[0] = c[0] + 1;",
    "        return c;",
    "    }",
    "    type Pair:struct = { a: int[], b: int[] }",
    "    fn pair(n: int) -> Pair {",
    "        let a: int[free, append] = [];",
    "        let b: int[free, append] = [];",
    "        for (i of 0..n) { a.append(i); b.append(i * 2); }",
    "        return { a: a, b: b };",
    "    }",
    "    fn iterated(n: int) -> int {",
    "        let out: int[free, append] = [1];",
    "        for (x of out) { out.append(x); }",
    "        return out.length;",
    "    }",
  ].join("\n");
  const js = () => printed(prog(decls, `        @shown = \`\${build(2).length},\${aliased(2).length},\${counts([1]).length},\${iterated(1)}\`;`));

  test("a fresh local never read elsewhere: `rt.tapeAppendOwned(true …)`, no ownership flag", () => {
    const f = fnText(js(), "build");
    expect(f).toContain("tapeAppendOwned(true");
    expect(f).not.toContain("$own");
    expect(f).not.toMatch(/rt\.tapeAppend\(/);
  });

  test("a local another binding reads: the copying `rt.tapeAppend(…)`", () => {
    const f = fnText(js(), "aliased");
    expect(f).toMatch(/rt\.tapeAppend\(/);
    expect(f).not.toContain("Owned(");
  });

  test("locals returned as a struct literal's fields: in place too (the frame ends at the `return`)", () => {
    const f = fnText(js(), "pair");
    expect(f).toContain("tapeAppendOwned(true /* a alone holds its value */, a,");
    expect(f).toContain("tapeAppendOwned(true /* b alone holds its value */, b,");
  });

  test("a local iterated by `for … of`: the copying `rt.tapeAppend(…)`", () => {
    const f = fnText(js(), "iterated");
    expect(f).toMatch(/rt\.tapeAppend\(/);
    expect(f).not.toContain("Owned(");
  });

  test("a local bound to a value someone else may hold: a flag — the first write copies, the rest are in place", () => {
    const f = fnText(js(), "counts");
    expect(f).toMatch(/let c\$own = false/);
    expect(f).toMatch(/writePathOwned\(c\$own, c,/);
    expect(f).toMatch(/c\$own = true/);
  });

  test("an in-place slot write goes through the CHECKED writer (an index outside the tape traps, §66.12.6 rule 3)", () => {
    const src = prog("", `        let a: int[write] = [1, 2];\n        a[2] = 9;\n${show("a")}`);
    const js = printed(src);
    expect(js).toContain("writePathOwned(");
    expect(js).toMatch(/E-INDEX|"t\.scrml:\d+/);
  });

  test("the program runs: 2,0,1,2", async () => {
    await load(prog(decls, `        @shown = \`\${build(2).length},\${aliased(2).length},\${counts([1]).length},\${iterated(1)}\`;`));
    click(btn("go"));
    expect($("#o").textContent).toBe("2,0,1,2");
  });
});

// ---------------------------------------------------------------------------
// C — time. Base (copy per edit): 100,000 appends were measured at ~18 s in headless
// Chromium (the adopter report). The bound is generous for slow CI; the real numbers print.
describe("C — 100,000 edits of a local are amortized O(1) each", () => {
  const BOUND_MS = 2000;
  const timed = async (decls, body) => {
    await load(prog(decls, body));
    const t0 = performance.now();
    click(btn("go"));
    const ms = performance.now() - t0;
    return { ms, out: $("#o").textContent };
  };

  test("100,000 appends in a pure `fn`", async () => {
    const decls = "    fn build(n: int) -> int[] {\n        let out: int[free, append] = [];\n        for (i of 0..n) { out.append(i); }\n        return out;\n    }";
    const { ms, out } = await timed(decls, `        const xs: int[] = build(100000);\n        @shown = \`\${xs.length},\${xs[99999]}\`;`);
    console.log(`[s476] 100,000 appends: ${ms.toFixed(1)} ms`);
    expect(out).toBe("100000,99999");
    expect(ms).toBeLessThan(BOUND_MS);
  }, 60000);

  test("100,000 slot writes on a 10,000-slot local table (fresh, and copied from a parameter)", async () => {
    const decls = [
      "    fn zeros(n: int) -> int[] {",
      "        let out: int[free, append] = [];",
      "        for (out.length < n) { out.append(0); }",
      "        return out;",
      "    }",
      "    fn tally(n: int) -> int {",
      "        let c: int[free, append, write] = [];",
      "        for (c.length < 10000) { c.append(0); }",
      "        for (i of 0..n) { c[i % 10000] = c[i % 10000] + 1; }",
      "        return c[3];",
      "    }",
      "    fn tallyFrom(m: int[], n: int) -> int {",
      "        let c: int[write] = m;",
      "        for (i of 0..n) { c[i % 10000] = c[i % 10000] + 1; }",
      "        return c[3] + m[3];",
      "    }",
    ].join("\n");
    const { ms, out } = await timed(decls, `        @shown = \`\${tally(100000)},\${tallyFrom(zeros(10000), 100000)}\`;`);
    console.log(`[s476] 2 x 100,000 slot writes (10,000 slots) + 20,000 appends: ${ms.toFixed(1)} ms`);
    expect(out).toBe("10,10");
    expect(ms).toBeLessThan(BOUND_MS);
  }, 60000);
});

// ---------------------------------------------------------------------------
// D — the runtime's in-place writers, directly: `owned` false is the copying writer exactly;
// `owned` true edits the operand; an index outside the tape is the same trap, nothing written.
describe("D — the runtime's owned writers", () => {
  test("owned = false: a NEW tape, the operand untouched (the copying writer)", () => {
    const a = [1, 2];
    const b = rt.tapeAppendOwned(false, a, 3);
    expect(b).toEqual([1, 2, 3]);
    expect(a).toEqual([1, 2]);
    expect(b).not.toBe(a);
    const c = rt.writePathOwned(false, a, [0], 9, "t:1");
    expect(c).toEqual([9, 2]);
    expect(a).toEqual([1, 2]);
  });

  test("owned = true: the operand itself, edited", () => {
    const a = [1, 2, 3];
    expect(rt.tapeAppendOwned(true, a, 4)).toBe(a);
    expect(rt.tapePrependOwned(true, a, 0)).toBe(a);
    expect(rt.tapeDropEndOwned(true, a)).toBe(a);
    expect(rt.tapeDropFrontOwned(true, a)).toBe(a);
    expect(rt.tapeRemoveAtOwned(true, a, 1)).toBe(a);
    expect(a).toEqual([1, 3]);
    expect(rt.tapeRemoveAtOwned(true, a, 5)).toEqual([1, 3]);
    expect(rt.tapeRemoveAtOwned(true, a, -1)).toEqual([1, 3]);
    expect(rt.tapeRemoveAtOwned(true, a, 0.5)).toEqual([1, 3]);
    const e = [];
    expect(rt.tapeDropEndOwned(true, e)).toEqual([]);
    expect(rt.tapeDropFrontOwned(true, e)).toEqual([]);
    expect(rt.writePathOwned(true, a, [1], 7, "t:1")).toBe(a);
    expect(a).toEqual([1, 7]);
    const p = { n: 1, m: 2 };
    expect(rt.writePathOwned(true, p, ["n"], 5, "t:1")).toBe(p);
    expect(p).toEqual({ n: 5, m: 2 });
  });

  test("a deeper path copies below the owned top: an element another binding holds is untouched", () => {
    const inner = { n: 1 };
    const a = [inner];
    expect(rt.writePathOwned(true, a, [0, "n"], 4, "t:1")).toBe(a);
    expect(a[0]).toEqual({ n: 4 });
    expect(inner).toEqual({ n: 1 });
  });

  test("an index outside the tape: the E-INDEX-OUT-OF-RANGE-RT trap, the same text as the copying writer, nothing written", () => {
    for (const path of [[2], [-1], [0.5], [0, 3]]) {
      const a = [[1], [2]];
      let mine, theirs;
      try { rt.writePathOwned(true, a, path, 9, "t:7"); } catch (e) { mine = e; }
      try { rt.writePath(a, path, 9, "t:7"); } catch (e) { theirs = e; }
      expect(mine).toBeInstanceOf(rt.ScrmlTrap);
      expect(mine.code).toBe("E-INDEX-OUT-OF-RANGE-RT");
      expect(mine.message).toBe(theirs.message);
      expect(a).toEqual([[1], [2]]);
    }
  });
});
