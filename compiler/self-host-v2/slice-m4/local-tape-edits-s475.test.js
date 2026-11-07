// local-tape-edits-s475.test.js — s475-boot-local-tape-edits: grant-checked
// in-place edits of a LOCAL tape (a `let`, a `const`, a parameter) — gap
// g-boot-local-tape-edit-s475; and a built-in method on a call result
// (gap g-boot-method-on-call-result-s475).
//
// SPEC §66.12.6 rule 1: "A tape's grants govern every write to it, in each
// position that can hold one: … a local binding: `let`, `const`, or the
// keywordless binding … On a local, `let` makes only the NAME rebindable; it
// grants the tape nothing" · "a function parameter: the callee can do only what
// its parameter type grants" · "Inference never invents a grant." Rule 3: "A tape
// is edited in place only by the methods named for the grant each one uses …
// Each method is a write: it is checked against the target's grants exactly as a
// whole-value write is". §66.10 rule 1: "A binding, argument or field initialized
// from a cell (or from any value) holds a snapshot of that value." The SPEC's own
// example (§66.12.6): `let out: int[free, append] = []; out.append(n); return out;`
// and `let bare = []; bare.append(n);` → E-WRITE-NOT-GRANTED.
//
//   A. the edits run — Core rebinds the local to a NEW tape (Assign of a Prim).
//   B. value semantics — an alias, a cell copy and a caller's argument are untouched.
//   C. loops, a returned local, a parameter.
//   D. judged by the TYPE's grants — the same codes a cell gets.
//   E. what stays refused (INTERIM): `insert`, an edit of a part of a local.
//   F. `three().sort()` — a declared return type gives the receiver its type.

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
const load = (src) => loadProgram(clean(src).core, "s475lte-" + k++, []);
const find = (n, pred, out = []) => {
  if (n && typeof n === "object") {
    if (pred(n)) out.push(n);
    for (const v of Object.values(n)) find(v, pred, out);
  }
  return out;
};

// a program: declarations, a `go()` function body, and markup showing `@shown`
const prog = (decls, body) =>
  `<program>\n${decls}\n    let <shown:string=""/>\n    function go() {\n${body}\n    }\n    <main>\n        <button onclick=go()>go</button>\n        <p id="o">\${@shown}</p>\n    </main>\n</program>\n`;
// the text of an int tape, "1,2,3"
const txt = (x) => `${x}.map(v => \`\${v}\`).join(",")`;
const show = (...xs) => `        @shown = ${xs.map(txt).join(' + "|" + ')};`;
const ALL = "int[free, append, prepend, pop, shift, remove]";
// a unit variant (a PrimOp) as Core holds it: its name, or `{ variant }`
const opName = (op) => (typeof op === "string" ? op : op && op.variant);

// ---------------------------------------------------------------------------
describe("A — an edit of a local tape runs (§66.12.6 rules 1 and 3)", () => {
  test("append / prepend / pop / shift / remove: each ONE Assign of the local to a Prim Tape* — never a Write", () => {
    const r = clean(prog("", `        let xs: ${ALL} = [1, 2, 3];\n        xs.append(4);\n        xs.prepend(0);\n        xs.pop();\n        xs.shift();\n        xs.remove(1);\n${show("xs")}`));
    const as = find(r.core.fns, (n) => n.variant === "Assign" && n.data.value && n.data.value.variant === "Prim");
    expect(as.map((a) => opName(a.data.value.data.op))).toEqual(["TapeAppend", "TapePrepend", "TapeDropEnd", "TapeDropFront", "TapeRemoveAt"]);
    expect(as.every((a) => a.data.path.length === 0)).toBe(true);
    expect(find(r.core.fns, (n) => n.variant === "Write").length).toBe(1);     // only `@shown = …`
  });

  test("the values — [1,2,3] → append 4, prepend 0, pop, shift, remove(1) → 1,3", async () => {
    await load(prog("", `        let xs: ${ALL} = [1, 2, 3];\n        xs.append(4);\n        xs.prepend(0);\n        xs.pop();\n        xs.shift();\n        xs.remove(1);\n${show("xs")}`));
    click(btn("go"));
    expect($("#o").textContent).toBe("1,3");
  });

  test("pop / shift on an empty tape and remove(i) with no position i remove nothing (§66.12.6 rule 3)", async () => {
    await load(prog("", `        let xs: ${ALL} = [];\n        xs.pop();\n        xs.shift();\n        let ys: ${ALL} = [5, 6];\n        ys.remove(7);\n        ys.remove(-1);\n        @shown = \`\${xs.length}\` + "|" + ${txt("ys")};`));
    click(btn("go"));
    expect($("#o").textContent).toBe("0|5,6");
  });

  test("`insert` / `remove` grants cover the end and the front (S442), and `const` edits its tape (the name is not rebound)", async () => {
    await load(prog("", `        const xs: int[free, insert, remove] = [2];\n        xs.append(3);\n        xs.prepend(1);\n        xs.pop();\n${show("xs")}`));
    click(btn("go"));
    expect($("#o").textContent).toBe("1,2");
  });

  test("the recognized grow shapes on a local, `xs = [...xs, e]` / `xs = [e, ...xs]` (§66.11.2), run as TapeConcat", async () => {
    const src = prog("", `        let xs: int[free, append, prepend] = [2];\n        xs = [...xs, 3, 4];\n        xs = [1, ...xs];\n${show("xs")}`);
    const r = clean(src);
    expect(find(r.core.fns, (n) => n.variant === "Prim" && opName(n.data.op) === "TapeConcat").length).toBe(2);
    await load(src);
    click(btn("go"));
    expect($("#o").textContent).toBe("1,2,3,4");
  });

  test("an element is a value of the element type — a struct literal has its struct", async () => {
    await load(prog("    type P:struct = { n: int }", `        let ps: P[free, append] = [];\n        ps.append({ n: 4 });\n        ps.append({ n: 5 });\n        @shown = ${txt("ps.map(p => p.n)")};`));
    click(btn("go"));
    expect($("#o").textContent).toBe("4,5");
  });
});

// ---------------------------------------------------------------------------
describe("B — value semantics: no alias sees the edit (§66.10)", () => {
  test("an alias taken before the edit keeps its value", async () => {
    await load(prog("", `        let a: int[free, append] = [1];\n        const b: int[free, append] = a;\n        a.append(2);\n        b.append(3);\n${show("a", "b")}`));
    click(btn("go"));
    expect($("#o").textContent).toBe("1,2|1,3");
  });

  test("a local initialised from a cell is a snapshot — the cell is unchanged", async () => {
    await load(prog("    <xs:int[replace]=([1, 2])/>", `        let local: int[free, append] = @xs;\n        local.append(9);\n${show("local", "@xs")}`));
    click(btn("go"));
    expect($("#o").textContent).toBe("1,2,9|1,2");
  });

  test("a parameter's edit changes the callee's copy only — the caller's cell is unchanged", async () => {
    const decls = `    <xs:int[free, append]=([1])/>\n    fn grow(log: int[free, append], x: int) -> int[free, append] {\n        log.append(x);\n        return log;\n    }`;
    await load(prog(decls, `        const g: int[free, append] = grow(@xs, 7);\n${show("g", "@xs")}`));
    click(btn("go"));
    expect($("#o").textContent).toBe("1,7|1");
  });
});

// ---------------------------------------------------------------------------
describe("C — loops, a returned local, a parameter", () => {
  test("a local built in a loop and returned (the SPEC's `fn one`, grown)", async () => {
    const decls = `    fn upto(n: int) -> int[] {\n        let out: int[free, append] = [];\n        for (i of 0..n) { out.append(i * i); }\n        return out;\n    }`;
    await load(prog(decls, `        const sq: int[] = upto(4);\n${show("sq")}`));
    click(btn("go"));
    expect($("#o").textContent).toBe("0,1,4,9");
  });

  test("a condition loop that shrinks a local until it is empty", async () => {
    await load(prog("", `        let st: int[free, append, pop] = [1, 2, 3];\n        let n: int = 0;\n        for (st.length > 0) {\n            st.pop();\n            n = n + 1;\n        }\n        @shown = \`\${n},\${st.length}\`;`));
    click(btn("go"));
    expect($("#o").textContent).toBe("3,0");
  });

  test("a loop that draws distinct values into a local (the lotto shape)", async () => {
    const decls = `    fn has(xs: int[], x: int) -> bool {\n        for (y of xs) { if (y == x) return true; }\n        return false;\n    }\n    fn distinct(src: int[]) -> int[] {\n        let picks: int[free, append] = [];\n        for (x of src) { if (!has(picks, x)) { picks.append(x); } }\n        return picks;\n    }`;
    await load(prog(decls, `        const d: int[] = distinct([3, 1, 3, 2, 1]);\n${show("d")}`));
    click(btn("go"));
    expect($("#o").textContent).toBe("3,1,2");
  });
});

// ---------------------------------------------------------------------------
describe("D — judged by the local's TYPE grants, with the codes a cell gets", () => {
  test("an un-annotated local: inferred, no grant — E-WRITE-NOT-GRANTED (the SPEC's `let bare = []`)", () => {
    expect(codes(prog("", `        let bare = [];\n        bare.append(1);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("", `        let ys = [1];\n        ys.append(2);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("    <src:int[free, append]=([1])/>", `        let ys = @src;\n        ys.append(2);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("an edit the type does not grant: E-WRITE-NOT-GRANTED; a grow of a fixed length: E-WRITE-INVARIANT", () => {
    expect(codes(prog("", `        let xs: int[free, append] = [1];\n        xs.pop();`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("", `        let xs: int[free, append] = [1];\n        xs.shift();`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("", `        let xs: int[free, append] = [1];\n        xs.prepend(0);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("", `        let xs: int[free, pop, shift] = [1];\n        xs.remove(0);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("", `        let xs: int[] = [1];\n        xs.append(2);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("", `        let xs: int[append] = [1];\n        xs.append(2);`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog("", `        let xs: int[free, append] = [1];\n        xs = [...xs, 2];\n        xs = [0, ...xs];`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("a parameter can do only what its parameter type grants (§66.12.3)", () => {
    expect(codes(prog("    fn f(xs: int[]) -> int[] {\n        xs.append(1);\n        return xs;\n    }", ""))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("    fn f(xs: int[free, append]) -> int[] {\n        xs.pop();\n        return xs;\n    }", ""))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("    fn f(xs: int[free, append]) -> int[] {\n        xs.append(1);\n        return xs;\n    }", ""))).toEqual([]);
  });

  test("the element against the element type (E-TYPE-031), `remove`'s position an `int`, JS names refused (E-TAPE-JS-METHOD)", () => {
    expect(codes(prog("", `        let xs: int[free, append] = [];\n        xs.append("a");`))).toEqual(["E-TYPE-031"]);
    expect(codes(prog("", `        let xs: int[free, remove] = [1];\n        xs.remove("a");`))).toEqual(["E-TYPE-031"]);
    expect(codes(prog("", `        let xs: int[free, append] = [];\n        xs.push(1);`))).toEqual(["E-TAPE-JS-METHOD"]);
  });
});

// ---------------------------------------------------------------------------
describe("E — what stays refused (INTERIM, named)", () => {
  test("`insert(i, x)` — its out-of-range enforcement is ⚑ O36 (gap g-boot-tape-insert-remove-s475)", () => {
    const r = run(prog("", `        let xs: int[free, insert] = [1];\n        xs.insert(0, 2);`));
    expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("O36");
  });

  test("an edit of a PART of a local (gap g-boot-local-tape-part-edit-s475)", () => {
    const decls = "    type B:struct = { xs: int[free, append] }";
    const r = run(prog(decls, `        let b: B = { xs: [] };\n        b.xs.append(1);`));
    expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("part of a local");
  });

  test("a spread value outside a recognized edit shape (gap g-boot-spread-value-s475)", () => {
    expect(codes(prog("", `        let a: int[] = [1];\n        const b: int[] = [...a, 2];`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

// ---------------------------------------------------------------------------
describe("F — a built-in method on a call result takes the declared return type", () => {
  test("`three().sort()` with `fn three() -> int[]` compiles and sorts numerically", async () => {
    const decls = "    fn three() -> int[] { return [30, 1, 2]; }";
    await load(prog(decls, `        const s: int[] = three().sort();\n        const r: int[] = three().reverse();\n        const f: int[] = three().filter(x => x > 1);\n${show("s", "r", "f")}`));
    click(btn("go"));
    expect($("#o").textContent).toBe("1,2,30|2,1,30|30,2");
  });

  test("a call result whose function declares no tape is still refused", () => {
    expect(codes(prog("    fn n() -> int { return 1; }", `        const s: int = n().sort();`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});
