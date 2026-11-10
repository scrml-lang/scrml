// tape-forms-s477.test.js — s477-boot-tape-forms: the tape forms #1812 left INTERIM.
//
//   A. an edit METHOD on a PART of a local (gap g-boot-local-tape-part-edit-s475).
//      SPEC §66.12.6 rule 1: "A tape's grants govern every write to it, in each position
//      that can hold one: … a struct field whose type is a tape (§66.11.4: the field's tape
//      type carries its grants); a tuple position whose type is a tape (… the tape's own
//      grants govern edits of the tape in it)"; "Inference never invents a grant." Rule 3:
//      "Each method is a write: it is checked against the target's grants exactly as a
//      whole-value write is". §66.10 rule 1: "A binding, argument or field initialized from
//      a cell (or from any value) holds a snapshot of that value."
//
// Every positive case is RUN (print → the slice runtime in happy-dom), and the value
// semantics are read back through aliases taken before the edit.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => { expectNoPageErrors(); });

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
const load = (src) => loadProgram(clean(src).core, "s477tf-" + k++, []);
const find = (n, pred, out = []) => {
  if (n && typeof n === "object") {
    if (pred(n)) out.push(n);
    for (const v of Object.values(n)) find(v, pred, out);
  }
  return out;
};
const opName = (op) => (typeof op === "string" ? op : op && op.variant);

// a program: declarations, a `go()` function body, and markup showing `@shown`
const prog = (decls, body) =>
  `<program>\n${decls}\n    let <shown:string=""/>\n    function go() {\n${body}\n    }\n    <main>\n        <button onclick=go()>go</button>\n        <p id="o">\${@shown}</p>\n    </main>\n</program>\n`;
// the text of an int tape, "1,2,3"
const txt = (x) => `${x}.map(v => \`\${v}\`).join(",")`;
const show = (...xs) => `        @shown = ${xs.map(txt).join(' + "|" + ')};`;
const runShown = async (decls, body) => {
  await load(prog(decls, body));
  click(btn("go"));
  return $("#o").textContent;
};

const B = "    type B:struct = { n: int, xs: int[free, append, prepend, pop, shift, remove] }";

// ---------------------------------------------------------------------------
describe("A1 — an edit of a PART of a local runs (§66.12.6 rules 1 and 3)", () => {
  test("a tape FIELD of a struct local: append / prepend / pop / shift / remove — each ONE Assign of the local WITH a path", () => {
    const r = clean(prog(B, `        const b: B = { n: 1, xs: [1, 2, 3] };\n        b.xs.append(4);\n        b.xs.prepend(0);\n        b.xs.pop();\n        b.xs.shift();\n        b.xs.remove(1);\n${show("b.xs")}`));
    const as = find(r.core.fns, (n) => n.variant === "Assign" && n.data.value && n.data.value.variant === "Prim");
    expect(as.map((a) => opName(a.data.value.data.op))).toEqual(["TapeAppend", "TapePrepend", "TapeDropEnd", "TapeDropFront", "TapeRemoveAt"]);
    expect(as.every((a) => a.data.path.length === 1)).toBe(true);
  });

  test("the values — a `const` struct local's tape field, [1,2,3] → 1,3 (the edit rebinds no name, RULED S475)", async () => {
    expect(await runShown(B, `        const b: B = { n: 1, xs: [1, 2, 3] };\n        b.xs.append(4);\n        b.xs.prepend(0);\n        b.xs.pop();\n        b.xs.shift();\n        b.xs.remove(1);\n        @shown = ${txt("b.xs")} + "|" + \`\${b.n}\`;`)).toBe("1,3|1");
  });

  test("a tape POSITION of a tape-of-tapes local, granted by the local's written type", async () => {
    expect(await runShown("", `        let g: int[free, append, pop][write] = [[1], [2, 3]];\n        g[0].append(9);\n        g[1].pop();\n        const a: int[] = g[0];\n        const b: int[] = g[1];\n${show("a", "b")}`)).toBe("1,9|2");
  });

  test("a tape field of a tape element (`bs[i].xs.append(v)`), the index read once", async () => {
    const decls = `${B}\n    let <calls:int=0/>\n    function first() -> int {\n        @calls = @calls + 1;\n        return 0;\n    }`;
    expect(await runShown(decls, `        let bs: B[] = [{ n: 1, xs: [] }, { n: 2, xs: [5] }];\n        bs[first()].xs.append(7);\n        bs[1].xs.append(6);\n        const a: B = bs[0];\n        const b: B = bs[1];\n        @shown = ${txt("a.xs")} + "|" + ${txt("b.xs")} + "|" + \`\${@calls}\`;`)).toBe("7|5,6|1");
  });

  test("a part edit of a PARAMETER changes the callee's copy only", async () => {
    const decls = `${B}\n    fn grow(b: B, x: int) -> B {\n        b.xs.append(x);\n        return b;\n    }`;
    expect(await runShown(decls, `        const a: B = { n: 1, xs: [1] };\n        const c: B = grow(a, 2);\n${show("a.xs", "c.xs")}`)).toBe("1|1,2");
  });

  test("in a loop: a struct local's tape field built by appends", async () => {
    expect(await runShown(B, `        let b: B = { n: 0, xs: [] };\n        for (i of 0..4) { b.xs.append(i * 10); }\n${show("b.xs")}`)).toBe("0,10,20,30");
  });
});

// ---------------------------------------------------------------------------
describe("A2 — value semantics: no earlier value sees a part edit (§66.10)", () => {
  test("a struct alias, a field alias and a cell copy taken before the edit keep their values", async () => {
    const decls = `${B}\n    <keep:int[replace]=([])/>`;
    expect(await runShown(decls, `        let b: B = { n: 1, xs: [1] };\n        const c: B = b;\n        const ys: int[] = b.xs;\n        @keep = b.xs;\n        b.xs.append(2);\n        b.xs.shift();\n${show("b.xs", "c.xs", "ys", "@keep")}`)).toBe("2|1|1|1");
  });

  test("a tape-of-tapes alias taken before a position edit keeps its value", async () => {
    expect(await runShown("", `        let g: int[free, append][write] = [[1]];\n        const h: int[][] = g;\n        g[0].append(2);\n        const a: int[] = g[0];\n        const b: int[] = h[0];\n${show("a", "b")}`)).toBe("1,2|1");
  });
});

// ---------------------------------------------------------------------------
describe("A3 — judged by the PART's own tape grants, with the codes a cell gets", () => {
  test("an edit the field's type does not grant: E-WRITE-NOT-GRANTED; a fixed length: E-WRITE-INVARIANT", () => {
    const P = "    type P:struct = { xs: int[free, append], fx: int[append] }";
    expect(codes(prog(P, `        let p: P = { xs: [], fx: [1] };\n        p.xs.pop();`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog(P, `        let p: P = { xs: [], fx: [1] };\n        p.xs.prepend(1);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog(P, `        let p: P = { xs: [], fx: [1] };\n        p.fx.append(1);`))).toEqual(["E-WRITE-INVARIANT"]);
  });

  test("a position of the local's own type: its written type's grants; an inferred type grants none", () => {
    expect(codes(prog("", `        let g: int[][write] = [[1]];\n        g[0].append(1);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("", `        let g = [[1]];\n        g[0].append(1);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("    fn f(g: int[free, append][]) -> int {\n        g[0].pop();\n        return 0;\n    }", ""))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("    fn f(g: int[free, append][]) -> int {\n        g[0].append(1);\n        return g[0].length;\n    }", ""))).toEqual([]);
  });

  test("the element against the part's element type (E-TYPE-031); `remove`'s position an `int`; an index an `int`", () => {
    expect(codes(prog(B, `        let b: B = { n: 1, xs: [] };\n        b.xs.append("a");`))).toEqual(["E-TYPE-031"]);
    expect(codes(prog(B, `        let b: B = { n: 1, xs: [] };\n        b.xs.remove("a");`))).toEqual(["E-TYPE-031"]);
    expect(codes(prog("", `        let g: int[free, append][write] = [[1]];\n        g["a"].append(1);`))).toEqual(["E-TYPE-031"]);
  });

  test("a part that is not a tape, a JS method name, `insert` (⚑ O36)", () => {
    expect(codes(prog(B, `        let b: B = { n: 1, xs: [] };\n        b.n.append(1);`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(prog(B, `        let b: B = { n: 1, xs: [] };\n        b.xs.push(1);`))).toEqual(["E-TAPE-JS-METHOD"]);
    const r = run(prog("    type I:struct = { xs: int[free, insert] }", `        let b: I = { xs: [] };\n        b.xs.insert(0, 1);`));
    expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("O36");
  });
});
