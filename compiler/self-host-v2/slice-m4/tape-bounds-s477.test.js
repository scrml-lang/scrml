// tape-bounds-s477.test.js — s477-boot-tape-bounds: bounded-length tape types
// (`T[min..=max, …]`, SPEC §66.12.2) and `insert(i, x)` (§66.12.6 rule 3) —
// gap g-boot-bounded-length-unenforced-s475.
//
// SPEC §66.11.2: "Invariants — length bounds and per-position types (§66.12) —
// are checked on EVERY write, however it is spelled." §66.12.2: the length axis is
// "fixed · bounded (e.g. `1..=10`) · free". O36 RULED S477 (ruling:user-voice-scrml.md
// S477 "⭐ RULED — O36"): "a write that PROVABLY violates a sequence invariant … stays a
// compile error (`E-WRITE-INVARIANT`); a write whose effect the compiler cannot prove is
// checked at RUN TIME and TRAPS on violation (the §19.17 trap kind), extending the S473
// index-past-end trap (`E-INDEX-OUT-OF-RANGE-RT`)."
//
//   A. the bound is read in every position (cell, field, local, parameter, return).
//   B. a provable violation is E-WRITE-INVARIANT.
//   C. a proven write carries no run-time check.
//   D. an unprovable write is checked at run time: E-WRITE-INVARIANT-RT, nothing written.
//   E. `insert(i, x)`: the grant, the bound, the position (E-INDEX-OUT-OF-RANGE-RT).
//   F. value semantics (§66.10) hold through the checked edits.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, takePageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => d.severity === "Error");
const codes = (src) => errs(src).map((d) => d.code).sort();
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const $ = (sel) => document.querySelector(sel);
const btn = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent === label);
const clickTrap = (el) => {
  const out = [];
  const onErr = (e) => out.push(e.error);
  window.addEventListener("error", onErr);
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  window.removeEventListener("error", onErr);
  takePageErrors();
  return out;
};
let k = 0;
const load = (src) => loadProgram(clean(src).core, "s477tb-" + k++, []);
const find = (n, pred, out = []) => {
  if (n && typeof n === "object") {
    if (pred(n)) out.push(n);
    for (const v of Object.values(n)) find(v, pred, out);
  }
  return out;
};
const opName = (op) => (typeof op === "string" ? op : op && op.variant);
const lengthChecks = (core) => find(core, (n) => n.variant === "Prim" && opName(n.data.op) === "LengthCheck");
const runtimeLength = (core) => find(core, (n) => n && n.variant === "RuntimeLength");

// a program: declarations, a `go()` function body, and markup showing `@shown`
const prog = (decls, body) =>
  `<program>\n${decls}\n    let <shown:string=""/>\n    function go() {\n${body}\n    }\n    <main>\n        <button onclick=go()>go</button>\n        <p id="o">\${@shown}</p>\n    </main>\n</program>\n`;
const txt = (x) => `${x}.map(v => \`\${v}\`).join(",")`;
const show = (x) => `        @shown = ${txt(x)};`;

// ---------------------------------------------------------------------------
describe("A — the bound is a length-axis value in every position (§66.12.2, §66.12.6 rule 1)", () => {
  test("a cell, a local, a `const`, a parameter and a return type compile; a cell's and a parameter's Core type carries LengthGrant.Bounded", () => {
    const decls = `    <c:int[1..=3, append]=([1])/>\n    fn f(xs: int[0..4, append]) -> int[1..=5, append] {\n        let out: int[1..=5, append] = [1];\n        return out;\n    }`;
    const r = clean(prog(decls, `        const ys: int[2..=2] = [1, 2];\n        @shown = \`\${ys.length},\${f([1]).length},\${@c.length}\`;`));
    const bs = find(r.core, (n) => n && n.variant === "Bounded");
    // Core types a cell and a parameter (a local's and a return's type stay analyze's — their bounds act through the checks)
    expect(bs.map((b) => `${b.data.min}..${b.data.max}`)).toEqual(expect.arrayContaining(["1..3", "0..3"]));
  });

  test("`a..b` is half-open and `a..=b` inclusive — the range glyphs of a loop head (S469 F3)", () => {
    expect(codes(prog("", `        const xs: int[0..3] = [1, 2];`))).toEqual([]);
    expect(codes(prog("", `        const xs: int[0..3] = [1, 2, 3];`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog("", `        const xs: int[0..=3] = [1, 2, 3];`))).toEqual([]);
    expect(codes(prog("", `        const xs: int[0..=3] = [1, 2, 3, 4];`))).toEqual(["E-WRITE-INVARIANT"]);
  });

  test("an empty or malformed range, and a length named twice (`free` beside a bound), are E-GRANT-UNKNOWN", () => {
    expect(codes(prog("", `        const xs: int[3..=1] = [1];`))).toEqual(["E-GRANT-UNKNOWN"]);
    expect(codes(prog("", `        const xs: int[2..2] = [1];`))).toEqual(["E-GRANT-UNKNOWN"]);
    const twice = errs(prog("", `        let xs: int[1..=3, free, append] = [1];`));
    expect(twice.map((d) => d.code)).toEqual(["E-GRANT-UNKNOWN"]);
    expect(twice[0].message).toContain("length axis has one value");
  });
});

// ---------------------------------------------------------------------------
describe("B — a provable violation is E-WRITE-INVARIANT (O36 RULED S477)", () => {
  test("a literal outside the bound: a local, a cell, an argument, a return, a struct field", () => {
    expect(codes(prog("", `        const xs: int[1..=3] = [1, 2, 3, 4, 5];`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog("    <c:int[1..=3]=([])/>", ""))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog("    fn f(xs: int[1..=2]) -> int { return xs.length; }", `        @shown = \`\${f([1, 2, 3])}\`;`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog("    fn f() -> int[1..=2] { return []; }", ""))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog("    type B:struct = { xs: int[1..=2] }", `        const b: B = { xs: [1, 2, 3] };`))).toEqual(["E-WRITE-INVARIANT"]);
  });

  test("an element tape inside the bound's element type, checked element by element", () => {
    expect(codes(prog("", `        const g: int[1..=2][] = [[1], [1, 2, 3]];`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog("", `        const g: int[1..=2][] = [[1], [1, 2]];`))).toEqual([]);
  });

  test("a bound of ONE length: every grow, and every shrink above 0, leaves it — local and cell", () => {
    expect(codes(prog("", `        let xs: int[2..=2, append] = [1, 2];\n        xs.append(3);`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog("", `        let xs: int[2..=2, pop] = [1, 2];\n        xs.pop();`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog("    <c:int[2..=2, append]=([1, 2])/>", `        @c.append(3);`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog("    <c:int[2..=2, shift]=([1, 2])/>", `        @c.shift();`))).toEqual(["E-WRITE-INVARIANT"]);
  });

  test("a grow shape that adds more values than the bound spans (`@c = [...@c, a, b, c]` on `0..=2`)", () => {
    const e = errs(prog("    <c:int[0..=2, append]=([])/>", `        @c = [...@c, 1, 2, 3];`));
    expect(e.map((d) => d.code)).toEqual(["E-WRITE-INVARIANT"]);
    expect(e[0].message).toContain("adds 3 values");
  });

  test("the existing fixed-length rule is unchanged: an edit of a tape with no length grant", () => {
    expect(codes(prog("", `        let xs: int[append] = [1];\n        xs.append(2);`))).toEqual(["E-WRITE-INVARIANT"]);
  });
});

// ---------------------------------------------------------------------------
describe("C — a proven write carries no run-time check (§66.12.8 rule 5's principle)", () => {
  test("a literal in range, a shrink of a bound starting at 0, a declared-bounded value into a wider bound", () => {
    const decls = `    <c:int[0..=3, pop, shift]=([1, 2])/>\n    fn total(xs: int[0..=10]) -> int { return xs.length; }`;
    const r = clean(prog(decls, `        const a: int[1..=3] = [1, 2];\n        @c.pop();\n        @c.shift();\n        let b: int[0..=5, pop] = [1];\n        b.pop();\n        @shown = \`\${total(a)},\${total(b)},\${total(@c)}\`;`));
    expect(lengthChecks(r.core)).toEqual([]);
    expect(runtimeLength(r.core)).toEqual([]);
  });

  test("a map written back keeps the length — no check", () => {
    const r = clean(prog("    <c:int[1..=3, write]=([1, 2])/>", `        @c = @c.map(v => v + 1);\n${show("@c")}`));
    expect(lengthChecks(r.core)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("D — an unprovable write is checked at run time: E-WRITE-INVARIANT-RT, nothing written (O36 RULED S477)", () => {
  test("a local grown in a loop past its bound traps at the write that would leave it", async () => {
    const src = prog("    <n:int=5/>", `        let xs: int[0..=3, append] = [];\n        @shown = "start";\n        for (i of 0..@n) {\n            xs.append(i);\n            @shown = ${txt("xs")};\n        }`);
    const r = clean(src);
    expect(lengthChecks(r.core).length).toBe(1);
    await load(src);
    const e = clickTrap(btn("go"));
    expect(e.length).toBe(1);
    expect(e[0].code).toBe("E-WRITE-INVARIANT-RT");
    expect(e[0].detail).toEqual({ length: 4, min: 0, max: 3, at: "t.scrml:8" });
    expect($("#o").textContent).toBe("0,1,2");
  });

  test("a cell: append past the max and pop below the min trap; the cell keeps its value", async () => {
    const decls = `    <c:int[1..=2, append, pop]=([1])/>\n    let <mode:int=0/>`;
    const src = prog(decls, `        if (@mode == 0) { @c.append(2); @c.append(3); } else { @c.pop(); @c.pop(); }\n${show("@c")}`);
    const r = clean(src);
    expect(runtimeLength(r.core).length).toBe(4);
    await load(src);
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect(e[0].detail).toEqual({ length: 3, min: 1, max: 2, at: "t.scrml:6" });
  });

  test("a cell's grow shape is checked once for all its values, before any write (all-or-nothing)", async () => {
    const src = prog("    <c:int[0..=3, append]=([1, 2])/>", `        @c = [...@c, 3, 4];\n${show("@c")}`);
    await load(src);
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect(e[0].detail.length).toBe(4);
  });

  test("a parameter given a tape whose length the caller cannot prove: checked at the call", async () => {
    const decls = `    fn sum(xs: int[1..=2]) -> int {\n        let t: int = 0;\n        for (x of xs) { t = t + x; }\n        return t;\n    }`;
    const src = prog(decls, `        let ys: int[free, append] = [1];\n        @shown = \`\${sum(ys)}\`;\n        ys.append(2);\n        ys.append(3);\n        @shown = \`\${sum(ys)}\`;`);
    const r = clean(src);
    expect(lengthChecks(r.core).length).toBe(2);
    await load(src);
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect(e[0].detail.length).toBe(3);
  });

  test("a return of a computed tape, and a whole write of a filtered value below the min", async () => {
    const decls = `    <c:int[2..=3, remove]=([1, 2, 3])/>\n    fn odd(xs: int[]) -> int[1..=9] { return xs.filter(v => v % 2 == 1); }`;
    const src = prog(decls, `        @shown = ${txt("odd([1, 2, 3])")};\n        @c = @c.filter(v => v > 2);`);
    await load(src);
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect(e[0].detail).toEqual({ length: 1, min: 2, max: 3, at: "t.scrml:7" });
  });

  test("a write that stays inside the bound runs unchecked by any trap", async () => {
    await load(prog("    <c:int[1..=3, append, pop]=([1])/>", `        @c.append(2);\n        @c.append(3);\n        @c.pop();\n${show("@c")}`));
    click(btn("go"));
    expect($("#o").textContent).toBe("1,2");
  });

  test("the generated code is readable: the bound and the source line are spelled in the call", () => {
    const r = clean(prog("    <c:int[1..=3, append]=([1])/>", `        @c.append(2);`));
    const rt = runtimeLength(r.core);
    expect(rt[0].data).toEqual({ min: 1, max: 3, loc: "t.scrml:5" });
  });
});

// ---------------------------------------------------------------------------
describe("E — `insert(i, x)` (§66.12.6 rule 3: grow anywhere, granted by `insert`)", () => {
  test("x becomes position i; i == length adds at the end", async () => {
    await load(prog("", `        let xs: int[free, insert] = [1, 3];\n        xs.insert(1, 2);\n        xs.insert(0, 0);\n        xs.insert(4, 4);\n${show("xs")}`));
    click(btn("go"));
    expect($("#o").textContent).toBe("0,1,2,3,4");
  });

  test("the grant: `append` does not grant `insert`; `insert` covers append and prepend (S442)", () => {
    expect(codes(prog("", `        let xs: int[free, append] = [1];\n        xs.insert(0, 2);`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(prog("", `        let xs: int[free, insert] = [1];\n        xs.append(2);\n        xs.prepend(0);`))).toEqual([]);
  });

  test("the position is an `int`, the value an element; a fixed length cannot grow", () => {
    expect(codes(prog("", `        let xs: int[free, insert] = [1];\n        xs.insert("0", 2);`))).toEqual(["E-TYPE-031"]);
    expect(codes(prog("", `        let xs: int[free, insert] = [1];\n        xs.insert(0, "a");`))).toEqual(["E-TYPE-031"]);
    expect(codes(prog("", `        let xs: int[insert] = [1];\n        xs.insert(0, 2);`))).toEqual(["E-WRITE-INVARIANT"]);
  });

  test("a literal position past every length the bound admits is E-WRITE-INVARIANT", () => {
    const e = errs(prog("", `        let xs: int[0..=3, insert] = [1];\n        xs.insert(5, 2);`));
    expect(e.map((d) => d.code)).toEqual(["E-WRITE-INVARIANT"]);
    expect(e[0].message).toContain("past the end");
  });

  test("a position past the end at run time traps — E-INDEX-OUT-OF-RANGE-RT, nothing written", async () => {
    await load(prog("    <n:int=3/>", `        let xs: int[free, insert] = [1, 2];\n        @shown = "before";\n        xs.insert(@n, 9);\n        @shown = "after";`));
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    expect(e[0].detail).toEqual({ index: 3, length: 2, at: "t.scrml:7" });
    expect($("#o").textContent).toBe("before");
  });

  test("a negative position traps — no counting from the end (§66.12.8 rule 7)", async () => {
    await load(prog("    <n:int=(0 - 1)/>", `        let xs: int[free, insert] = [1];\n        xs.insert(@n, 9);`));
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
  });

  test("insert on a bounded tape: the bound is checked too (a run-time check past the max)", async () => {
    const src = prog("", `        let xs: int[1..=2, insert] = [1];\n        xs.insert(0, 0);\n        @shown = ${txt("xs")};\n        xs.insert(1, 5);`);
    expect(lengthChecks(clean(src).core).length).toBe(2);
    await load(src);
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
  });
});

// ---------------------------------------------------------------------------
describe("F — value semantics hold through the checked edits (§66.10)", () => {
  test("an alias of a bounded local, and a cell copied into one, are not changed by its edits", async () => {
    await load(prog("    <c:int[1..=4, append]=([1])/>", `        let xs: int[1..=4, append, insert] = @c;\n        const a: int[] = xs;\n        xs.append(2);\n        xs.insert(0, 0);\n        @shown = ${txt("xs")} + "|" + ${txt("a")} + "|" + ${txt("@c")};`));
    click(btn("go"));
    expect($("#o").textContent).toBe("0,1,2|1|1");
  });

  // s477 r-merge: composes with the in-place edits of an OWNED local (#1824, print.scrml ownedLocals):
  // a checked edit (LengthCheck) is not an in-place self-edit, so it copies; `insert` builds a new tape
  test("an owned local edited in place, then inserted into and bound-checked, in a loop — values exact, alias untouched", async () => {
    await load(prog("", `        let xs: int[0..=6, append, insert] = [];\n        let ys: int[free, append, insert] = [];\n        for (i of 0..3) {\n            xs.append(i);\n            ys.append(i);\n            ys.insert(0, 9);\n        }\n        const a: int[] = ys;\n        ys.append(7);\n        xs.insert(1, 5);\n        @shown = ${txt("xs")} + "|" + ${txt("ys")} + "|" + ${txt("a")};`));
    click(btn("go"));
    expect($("#o").textContent).toBe("0,5,1,2|9,9,9,0,1,2,7|9,9,9,0,1,2");
  });
});
