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

// ===========================================================================
//   B. a removal used as a VALUE (gap g-boot-tape-removal-value-s475). SPEC §66.12.6
//      rule 3: "`pop`, `shift` and `remove` return the removed value, typed `T | not`:
//      on an empty tape, or a `remove(i)` with no position `i`, nothing is removed and
//      the result is `not`".
const OR = "    fn txtOr(v: int | not) -> string {\n        if (v is given) return `${v}`;\n        return \"not\";\n    }";
const all = (...vs) => vs.map((v) => `txtOr(${v})`).join(' + "," + ');

describe("B1 — `pop` / `shift` / `remove(i)` as a value, on a local, a part, a cell (§66.12.6 rule 3)", () => {
  test("a local: the removed values in order, then `not` on an empty tape; the tape shrinks", async () => {
    expect(await runShown(OR, `        let xs: int[free, pop, shift, remove] = [1, 2, 3, 4];\n        const a: int | not = xs.pop();\n        const b: int | not = xs.shift();\n        let c: int | not = xs.remove(0);\n        const d: int | not = xs.pop();\n        c = xs.pop();\n        @shown = ${all("a", "b", "c", "d")} + "|" + \`\${xs.length}\`;`)).toBe("4,1,not,3|0");
  });

  test("`remove(i)` with no position `i` (past the end, negative) is `not` and removes nothing", async () => {
    expect(await runShown(OR, `        let xs: int[free, remove] = [5, 6];\n        const a: int | not = xs.remove(7);\n        const b: int | not = xs.remove(-1);\n        const c: int | not = xs.remove(1);\n        @shown = ${all("a", "b", "c")} + "|" + ${txt("xs")};`)).toBe("not,not,6|5");
  });

  test("a cell: `@xs.pop()` / `@xs.shift()` give the removed element and shrink the cell", async () => {
    expect(await runShown(`${OR}\n    <xs:int[free, pop, shift]=([5, 6, 7])/>`, `        const a: int | not = @xs.pop();\n        const b: int | not = @xs.shift();\n        @shown = ${all("a", "b")} + "|" + ${txt("@xs")};`)).toBe("7,5|6");
  });

  test("a part of a local, a `return`, an assignment to a cell; `remove(i)`'s position read once", async () => {
    const decls = `${OR}\n${B}\n    let <calls:int=0/>\n    let <last:int | not=(not)/>\n    function one() -> int {\n        @calls = @calls + 1;\n        return 1;\n    }\n    fn top(xs: int[free, pop]) -> int | not {\n        return xs.pop();\n    }`;
    expect(await runShown(decls, `        const b: B = { n: 0, xs: [10, 20, 30] };\n        const p: int | not = b.xs.pop();\n        const q: int | not = b.xs.remove(one());\n        @last = top([8, 9]);\n        @shown = ${all("p", "q", "@last")} + "|" + ${txt("b.xs")} + "|" + \`\${@calls}\`;`)).toBe("30,20,9|10|1");
  });
});

describe("B2 — value semantics: the removal is never visible through an earlier value (§66.10)", () => {
  test("a local alias, a cell snapshot and a caller's argument keep every element", async () => {
    const decls = `${OR}\n    <cs:int[free, pop]=([1, 2])/>\n    fn top(xs: int[free, pop]) -> int | not {\n        return xs.pop();\n    }`;
    expect(await runShown(decls, `        let xs: int[free, pop] = [1, 2, 3];\n        const before: int[] = xs;\n        const snap: int[] = @cs;\n        const a: int | not = xs.pop();\n        const b: int | not = @cs.pop();\n        const arg: int[free, pop] = [4, 5];\n        const c: int | not = top(arg);\n        @shown = ${all("a", "b", "c")} + "|" + ${txt("before")} + "|" + ${txt("snap")} + "|" + ${txt("arg")} + "|" + ${txt("xs")} + "|" + ${txt("@cs")};`)).toBe("3,2,5|1,2,3|1,2|4,5|1,2|1");
  });
});

describe("B3 — judged, typed, and where it stays refused (INTERIM)", () => {
  test("the value is `T | not` (E-TYPE-031 into `T`); the edit is judged by the grants (E-WRITE-NOT-GRANTED)", () => {
    expect(codes(prog("", `        let xs: int[free, pop] = [1];\n        const t: int = xs.pop();`))).toEqual(["E-TYPE-031"]);
    expect(codes(prog("", `        let xs: int[free, pop] = [1];\n        const t: int | not = xs.shift();`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("    <xs:int[free, append]=([1])/>", `        const t: int | not = @xs.pop();`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("", `        let xs = [1];\n        const t: int | not = xs.pop();`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("a removal's value anywhere but a whole statement value: E-BOOTSTRAP-UNSUPPORTED, naming the gap", () => {
    for (const body of [
      `        let xs: int[free, pop] = [1];\n        @shown = txtOr(xs.pop());`,
      `        let xs: int[free, pop] = [1, 2];\n        const t: bool = xs.pop() is given;`,
      `        let xs: int[free, pop] = [1];\n        let ys: (int | not)[write] = [not];\n        ys[0] = xs.pop();`,
    ]) {
      const r = run(prog(OR, body));
      expect(r.diags.map((d) => d.code)).toContain("E-BOOTSTRAP-UNSUPPORTED");
      expect(r.diags.map((d) => d.message).join("\n")).toContain("g-boot-tape-removal-value-position-s477");
    }
  });
});

// FIX ROUND 1 (S239 review F1): the removal's value is admitted only at a statement whose
// LOWERING reads it first (FailCtx.pre, threaded by position — not by wholeWhat's wording).
// Every other assignment position is refused by name, never compiled to an unminted read.
const STEP = (v) => `        let s: string = "";\n        let v: int | not = 0;\n        for (let i: int = 0; i < 2; v = ${v}) {\n            s = s + txtOr(v);\n            i = i + 1;\n        }\n        @shown = s;`;
const KD = `${OR}\n    type K:enum = { A, B }`;
const AUTH = `    type AuthErr:enum = { Denied, Locked }\n    function check(p: string)! AuthErr {\n        if (p == "locked") fail AuthErr.Locked;\n        return "ok";\n    }`;
describe("B4 — FIX ROUND 1: every assignment position is either lowered with the removal or refused", () => {
  const refusedAt = (decls, body) => {
    const r = run(prog(decls, body));
    expect(r.diags.map((d) => d.code)).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(r.diags.map((d) => d.message).join("\n")).toContain("g-boot-tape-removal-value-position-s477");
  };
  test("a counted head's `step` (a local, a cell, a part) and `init` (an assignment, a `let`): refused, naming the gap", () => {
    refusedAt(OR, `        let xs: int[free, pop] = [1, 2, 3];\n${STEP("xs.pop()")}`);
    refusedAt(`${OR}\n    <cx:int[free, pop]=([1, 2, 3])/>`, STEP("@cx.pop()"));
    refusedAt(`${OR}\n    type P:struct = { xs: int[free, pop] }`, `        const b: P = { xs: [1, 2, 3] };\n${STEP("b.xs.pop()")}`);
    refusedAt(OR, `        let xs: int[free, pop] = [1, 2, 3];\n        let s: string = "";\n        let v: int | not = 0;\n        for (v = xs.pop(); v is given; v = not) {\n            s = s + txtOr(v);\n        }\n        @shown = s;`);
    refusedAt(OR, `        let xs: int[free, pop] = [1, 2, 3];\n        let s: string = "";\n        for (let v: int | not = xs.pop(); v is given; v = not) {\n            s = s + txtOr(v);\n        }\n        @shown = s;`);
  });
  test("a value `match` arm, a value `if` arm, a condition-head assignment, a `lift` operand: refused, naming the gap", () => {
    refusedAt(KD, `        let xs: int[free, pop] = [1, 2, 3];\n        const k: K = K.A;\n        const v: int | not = match k { .A :> xs.pop(), .B :> not, };\n        @shown = txtOr(v);`);
    refusedAt(OR, `        let xs: int[free, pop] = [1, 2, 3];\n        const b: bool = true;\n        const v: int | not = if (b) { xs.pop() } else { not };\n        @shown = txtOr(v);`);
    refusedAt(OR, `        let xs: int[free, pop] = [1, 2, 3];\n        let v: int | not = not;\n        if ((v = xs.pop())) {\n            @shown = txtOr(v);\n        }`);
    refusedAt(OR, `        let xs: int[free, pop] = [1, 2, 3];\n        lift xs.pop();\n        @shown = "a";`);
  });
  test("a statement `match` arm's assignment (a local, a cell): lowered with the removal, runs", async () => {
    expect(await runShown(KD, `        let xs: int[free, pop] = [1, 2, 3];\n        let v: int | not = 0;\n        const k: K = K.A;\n        match k {\n            .A :> v = xs.pop(),\n            .B :> v = not,\n        }\n        @shown = txtOr(v) + "|" + ${txt("xs")};`)).toBe("3|1,2");
    expect(await runShown(`${KD}\n    <cx:int[free, pop]=([1, 2, 3])/>\n    let <cv:int | not=(not)/>`, `        const k: K = K.B;\n        match k {\n            .A :> @cv = not,\n            .B :> @cv = @cx.pop(),\n        }\n        @shown = txtOr(@cv) + "|" + ${txt("@cx")};`)).toBe("3|1,2");
    // the arm NOT taken removes nothing
    expect(await runShown(KD, `        let xs: int[free, pop] = [1, 2, 3];\n        let v: int | not = 0;\n        const k: K = K.B;\n        match k {\n            .A :> v = xs.pop(),\n            .B :> v = not,\n        }\n        @shown = txtOr(v) + "|" + ${txt("xs")};`)).toBe("not|1,2,3");
  });
  test("a handled statement arm's assignment: lowered with the removal, runs only when the arm is taken", async () => {
    const body = (p) => `        let xs: int[free, pop] = [1, 2, 3];\n        let v: int | not = 0;\n        check("${p}") !{ _ :> v = xs.pop() };\n        @shown = txtOr(v) + "|" + ${txt("xs")};`;
    expect(await runShown(`${OR}\n${AUTH}`, body("locked"))).toBe("3|1,2");
    expect(await runShown(`${OR}\n${AUTH}`, body("fine"))).toBe("0|1,2,3");
  });
  test("a single-statement `if` / `else` body's assignment: runs", async () => {
    expect(await runShown(OR, `        let xs: int[free, pop] = [1, 2, 3];\n        let v: int | not = 0;\n        if (true) v = xs.pop();\n        @shown = txtOr(v) + "|" + ${txt("xs")};`)).toBe("3|1,2");
    expect(await runShown(OR, `        let xs: int[free, pop] = [1, 2, 3];\n        let v: int | not = 0;\n        if (false) { v = 1; } else v = xs.pop();\n        @shown = txtOr(v) + "|" + ${txt("xs")};`)).toBe("3|1,2");
  });
});

// ===========================================================================
//   C. a spread as a VALUE (gap g-boot-spread-value-s475). §66.12.1: "Non-mutating
//      operations (`map`, `filter`, `slice`, `concat`, …) are always allowed; they return
//      new values." §66.10: the new tape shares no identity with its operands.
describe("C1 — `[...a, x]` / `[x, ...a, ...b]` in a const, a return, an argument, a cell write", () => {
  test("the values, in order; an empty operand; a spread of a parameter and of a call result", async () => {
    const decls = `    <c:int[replace]=([])/>\n    fn ends(xs: int[], x: int) -> int[] {\n        return [x, ...xs, x];\n    }\n    fn sum(xs: int[]) -> int {\n        let s: int = 0;\n        for (v of xs) { s = s + v; }\n        return s;\n    }`;
    expect(await runShown(decls, `        const a: int[] = [1, 2];\n        const e: int[] = [];\n        const b: int[] = [...a, 3];\n        const d: int[] = [0, ...a, ...e, ...b];\n        @c = [...ends(a, 9), 7];\n        const n: int = sum([...a, ...a]);\n        @shown = ${txt("b")} + "|" + ${txt("d")} + "|" + ${txt("@c")} + "|" + \`\${n}\`;`)).toBe("1,2,3|0,1,2,1,2,3|9,1,2,9,7|6");
  });

  test("value semantics: the new tape is not its operand — an edit of either is never seen by the other", async () => {
    expect(await runShown("", `        let a: int[free, append] = [1];\n        let b: int[free, append] = [...a];\n        a.append(2);\n        b.append(3);\n        const s: int[] = [...b];\n        b.append(4);\n${show("a", "b", "s")}`)).toBe("1,2|1,3,4|1,3");
  });
});

describe("C2 — judged: the operand is a tape of the element type; a whole write is still classified", () => {
  test("a spread of a non-tape: E-TYPE-031; elements of another type: E-TYPE-031", () => {
    expect(codes(prog("", `        const s: string = "ab";\n        const b: string[] = [...s];`))).toEqual(["E-TYPE-031"]);
    expect(codes(prog("", `        const a: string[] = ["x"];\n        const b: int[] = [...a, 1];`))).toContain("E-TYPE-031");
  });

  test("a whole write of another tape's spread is a `replace` (§66.12.6 rule 4) — not granted by `append`", () => {
    expect(codes(prog("    <c:int[free, append]=([])/>", `        const a: int[] = [1];\n        @c = [...a, 2];`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("", `        let xs: int[free, append] = [];\n        const a: int[] = [1];\n        xs = [...a, 2];`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("a call-argument spread `f(...xs)` stays refused — the parser takes no spread argument (gap g-boot-call-spread-s477)", () => {
    const r = run(prog("    fn f(a: int, b: int) -> int { return a + b; }", `        const xs: int[] = [1, 2];\n        const n: int = f(...xs);`));
    expect(r.diags.map((d) => d.code)).toContain("E-PARSE-EXPR");
  });
});

// ===========================================================================
//   D. other tape methods SPEC names (§66.12.1): `concat` built; the rest INTERIM.
describe("D — `a.concat(b)` (§66.12.1): a new tape; one tape argument of the element type", () => {
  test("runs, leaves both operands unchanged, and carries no grant", async () => {
    expect(await runShown("", `        const a: int[] = [1, 2];\n        const b: int[] = [3];\n        const c: int[] = a.concat(b);\n        const d: int[] = c.concat([]);\n${show("a", "b", "c", "d")}`)).toBe("1,2|3|1,2,3|1,2,3");
    expect(codes(prog("", `        const a: int[] = [1];\n        let c = a.concat([2]);\n        c.append(3);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("the argument is a tape of the element type (E-TYPE-031); exactly one (E-CALL-ARITY)", () => {
    expect(codes(prog("", `        const a: int[] = [1];\n        const c: int[] = a.concat(["x"]);`))).toContain("E-TYPE-031");
    expect(codes(prog("", `        const a: int[] = [1];\n        const c: int[] = a.concat(2);`))).toContain("E-TYPE-031");
    expect(codes(prog("", `        const a: int[] = [1];\n        const c: int[] = a.concat([2], [3]);`))).toEqual(["E-CALL-ARITY"]);
  });

  test("still refused by name (INTERIM): tape `slice` / `indexOf` / `find` / `findIndex` / `reduce` / `fill` / `copyWithin`", () => {
    for (const m of ["slice(1)", "indexOf(1)", "find(x => x > 0)", "findIndex(x => x > 0)", "reduce((s, x) => s + x, 0)", "fill(0)", "copyWithin(0, 1)"]) {
      expect(codes(prog("", `        const a: int[] = [1];\n        const r: int[] = a.${m};`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
    }
  });
});
