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
  // a CHECKED edit (one carrying a LengthCheck) is not an in-place self-edit, so it copies; a PROVEN
  // edit of a bounded local (a shrink of a bound whose min is 0) carries no LengthCheck and so takes
  // #1824's in-place path, as an unbounded local's does; `insert` builds a new tape
  test("an owned local edited in place, then inserted into and bound-checked, in a loop — values exact, alias untouched", async () => {
    await load(prog("", `        let xs: int[0..=6, append, insert] = [];\n        let ys: int[free, append, insert] = [];\n        for (i of 0..3) {\n            xs.append(i);\n            ys.append(i);\n            ys.insert(0, 9);\n        }\n        const a: int[] = ys;\n        ys.append(7);\n        xs.insert(1, 5);\n        @shown = ${txt("xs")} + "|" + ${txt("ys")} + "|" + ${txt("a")};`));
    click(btn("go"));
    expect($("#o").textContent).toBe("0,5,1,2|9,9,9,0,1,2,7|9,9,9,0,1,2");
  });
});

// ---------------------------------------------------------------------------
// s477 FIX ROUND 1 (review of #1830): positions a value flows into a bounded slot that were
// unchecked — a `fail` payload (F1), a struct literal's field as a call argument or a return
// value (F2), and a `match` arm's struct literal (the F2 audit). §66.11.2: "Invariants — length
// bounds … — are checked on EVERY write, however it is spelled"; §66.12.6 rule 1.
const B2 = `    type B:struct = { xs: int[1..=2] }\n`;
describe("G — every position into a bounded slot is checked (review of #1830, F1 / F2)", () => {
  test("F1: a `fail` payload's literal past the bound is E-WRITE-INVARIANT", () => {
    const decl = `    type Er:enum = { Big(xs: int[1..=2]) }\n    function bad()! Er {\n        fail Er.Big([1, 2, 3, 4, 5]);\n        return 0;\n    }`;
    expect(codes(prog(decl, `        const n: int = match bad() { .Big(xs) :> xs.length, else :> 0 };\n        @shown = \`\${n}\`;`))).toEqual(["E-WRITE-INVARIANT"]);
  });

  test("F1: a computed `fail` payload past the bound traps (E-WRITE-INVARIANT-RT); in range it is delivered", async () => {
    const decl = `    type Er:enum = { Big(xs: int[1..=2]) }\n    function bad(ys: int[])! Er {\n        fail Er.Big(ys);\n        return 0;\n    }`;
    await load(prog(decl, `        const n: int = match bad([1, 2]) { .Big(xs) :> xs.length, else :> 0 };\n        @shown = \`\${n}\`;\n        const m: int = match bad([1, 2, 3, 4]) { .Big(xs) :> xs.length, else :> 0 };\n        @shown = \`\${m}\`;`));
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect($("#o").textContent).toBe("2");
  });

  test("F2: a struct literal's bounded field as a return value / a call argument — a literal past it is E-WRITE-INVARIANT", () => {
    expect(codes(prog(B2 + `    fn mk() -> B { return { xs: [1, 2, 3, 4, 5] }; }`, `        const b: B = mk();\n        @shown = \`\${b.xs.length}\`;`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog(B2 + `    fn n(b: B) -> int { return b.xs.length; }`, `        @shown = \`\${n({ xs: [1, 2, 3, 4, 5] })}\`;`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog(B2 + `    fn n(bs: B[]) -> int { return bs.length; }`, `        @shown = \`\${n([{ xs: [1, 2, 3, 4, 5] }])}\`;`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog(B2 + `    <c:bool=(true)/>\n    fn mk() -> B { return @c ? { xs: [1, 2, 3, 4, 5] } : { xs: [1] }; }`, `        const b: B = mk();\n        @shown = \`\${b.xs.length}\`;`))).toEqual(["E-WRITE-INVARIANT"]);
  });

  test("F2: the same positions close the field-TYPE hole (`{ xs: \"s\" }` into `{ xs: int[] }`, §66.1 rule 5)", () => {
    const T = `    type B:struct = { xs: int[] }\n`;
    expect(codes(prog(T + `    fn mk() -> B { return { xs: "s" }; }`, `        const b: B = mk();\n        @shown = "ran";`))).toEqual(["E-TYPE-031"]);
    expect(codes(prog(T + `    fn n(b: B) -> int { return 1; }`, `        @shown = \`\${n({ xs: "s" })}\`;`))).toEqual(["E-TYPE-031"]);
  });

  test("F2: a computed field value past the bound traps at the return / the argument; in range runs", async () => {
    await load(prog(B2 + `    fn mk(ys: int[]) -> B { return { xs: ys }; }\n    fn n(b: B) -> int { return b.xs.length; }`, `        const ok: B = mk([1, 2]);\n        @shown = \`\${ok.xs.length + n({ xs: [7] })}\`;\n        const b: B = mk([1, 2, 3]);\n        @shown = "unreached";`));
    expect(clickTrap(btn("go")).map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect($("#o").textContent).toBe("3");
    await load(prog(B2 + `    fn n(b: B) -> int { return b.xs.length; }`, `        const ys: int[] = [1, 2, 3];\n        @shown = \`\${n({ xs: ys })}\`;`));
    expect(clickTrap(btn("go")).map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect($("#o").textContent).toBe("");
  });

  test("audit: a `match` arm's struct literal is checked field by field (bound and type)", async () => {
    const K = `    type K:enum = { A, C }\n    <k:K=(K.A)/>`;
    expect(codes(prog(B2 + K, `        const b: B = match @k { .A :> { xs: [1, 2, 3, 4, 5] }, else :> { xs: [1] } };\n        @shown = \`\${b.xs.length}\`;`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog(B2 + K + `\n    fn mk() -> B { return match @k { .A :> { xs: [1, 2, 3, 4, 5] }, else :> { xs: [1] } }; }`, `        const b: B = mk();\n        @shown = \`\${b.xs.length}\`;`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog(`    type B:struct = { xs: int[] }\n` + K, `        const b: B = match @k { .A :> { xs: "s" }, else :> { xs: [1] } };\n        @shown = "ran";`))).toEqual(["E-TYPE-031"]);
    await load(prog(B2 + K, `        const ys: int[] = [1, 2, 3];\n        const b: B = match @k { .A :> { xs: ys }, else :> { xs: [1] } };\n        @shown = \`\${b.xs.length}\`;`));
    expect(clickTrap(btn("go")).map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect($("#o").textContent).toBe("");
  });
});

// ---------------------------------------------------------------------------
// H — the merge with s477-boot-tape-forms (#1834): every edit path that PR added is
// judged against the length bound exactly as a whole-local edit is (§66.11.2: "checked
// on EVERY write, however it is spelled"; O36 RULED S477) — compile E-WRITE-INVARIANT
// where provable, the E-WRITE-INVARIANT-RT trap otherwise, the check BEFORE the write.
const P = `    type P:struct = { n: int, xs: int[1..=2, append, prepend, pop, shift, remove, insert] }`;
const P1 = `    type Q:struct = { xs: int[2..=2, append, pop] }`;
const P0 = `    type Z:struct = { xs: int[0..=2, pop, shift, remove] }`;
const OR = "    fn txtOr(v: int | not) -> string {\n        if (v is given) return `${v}`;\n        return \"not\";\n    }";
// a program with a second button `see` that shows the cell `@c` after a trapped `go`
const prog2 = (decls, body) =>
  `<program>\n${decls}\n    let <shown:string=""/>\n    function go() {\n${body}\n    }\n    function see() {\n        @shown = ${txt("@c")};\n    }\n    <main>\n        <button onclick=go()>go</button>\n        <button onclick=see()>see</button>\n        <p id="o">\${@shown}</p>\n    </main>\n</program>\n`;
// the Assigns of a local WITH a path whose value is a LengthCheck of a tape edit
const checkedPartAssigns = (core) => find(core.fns, (n) => n.variant === "Assign" && n.data.path && n.data.path.length > 0 && n.data.value && n.data.value.variant === "Prim" && opName(n.data.value.data.op) === "LengthCheck");

describe("H1 — a PART edit on a bounded tape (`b.xs.append(v)`, `g[i].pop()`) is bound-checked", () => {
  test("a field part: provable violations are E-WRITE-INVARIANT (a one-length bound, grow and shrink)", () => {
    expect(codes(prog(P1, `        let b: Q = { xs: [1, 2] };\n        b.xs.append(3);`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog(P1, `        let b: Q = { xs: [1, 2] };\n        b.xs.pop();`))).toEqual(["E-WRITE-INVARIANT"]);
  });

  test("a field part: a shrink of a bound starting at 0 is proven — no run-time check", () => {
    const r = clean(prog(P0, `        let b: Z = { xs: [1, 2] };\n        b.xs.pop();\n        b.xs.shift();\n${show("b.xs")}`));
    expect(lengthChecks(r.core).length).toBe(0);
  });

  test("a field part: an unprovable grow is checked BEFORE the Assign (LengthCheck is its value) and traps past the max", async () => {
    const src = prog(P, `        let b: P = { n: 0, xs: [1] };\n        b.xs.append(2);\n${show("b.xs")}\n        b.xs.append(3);\n        @shown = "unreached";`);
    const r = clean(src);
    const as = checkedPartAssigns(r.core);
    expect(as.length).toBe(2);
    expect(as.map((a) => opName(a.data.value.data.args[0].data.op))).toEqual(["TapeAppend", "TapeAppend"]);
    await load(src);
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect(e[0].detail).toEqual({ length: 3, min: 1, max: 2, at: "t.scrml:8" });
    expect($("#o").textContent).toBe("1,2");
  });

  test("a field part: an unprovable shrink below the min traps (prepend / shift / remove run in range)", async () => {
    await load(prog(P, `        let b: P = { n: 0, xs: [1, 2] };\n        b.xs.shift();\n        b.xs.prepend(7);\n        b.xs.remove(0);\n${show("b.xs")}\n        b.xs.pop();\n        @shown = "unreached";`));
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect(e[0].detail.length).toBe(0);
    expect($("#o").textContent).toBe("2");
  });

  test("a POSITION part of a tape-of-bounded-tapes (`g[i].append(v)`): checked, traps; the in-range edit runs", async () => {
    expect(codes(prog("", `        let g: int[2..=2, append][write] = [[1, 2]];\n        g[0].append(3);`))).toEqual(["E-WRITE-INVARIANT"]);
    await load(prog("", `        let g: int[1..=2, append, pop][write] = [[1], [5]];\n        g[1].append(6);\n        const a: int[] = g[1];\n${show("a")}\n        g[0].append(2);\n        g[0].append(3);\n        @shown = "unreached";`));
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect(e[0].detail.length).toBe(3);
    expect($("#o").textContent).toBe("5,6");
  });

  test("a part of a tape ELEMENT (`bs[i].xs.append(v)`) and of a PARAMETER: checked against the field's bound", async () => {
    await load(prog(`${P}\n    fn grow(b: P) -> P {\n        b.xs.append(9);\n        return b;\n    }`, `        const ok: P = grow({ n: 0, xs: [1] });\n${show("ok.xs")}\n        let bs: P[] = [{ n: 0, xs: [1, 2] }];\n        bs[0].xs.append(3);\n        @shown = "unreached";`));
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect($("#o").textContent).toBe("1,9");
  });

  test("`insert(i, x)` on a part: the bound (a literal position past the max is E-WRITE-INVARIANT; past the max at run time traps)", async () => {
    expect(codes(prog(P, `        let b: P = { n: 0, xs: [1] };\n        b.xs.insert(3, 5);`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog(`    type Q:struct = { xs: int[2..=2, insert] }`, `        let b: Q = { xs: [1, 2] };\n        b.xs.insert(0, 5);`))).toEqual(["E-WRITE-INVARIANT"]);
    await load(prog(P, `        let b: P = { n: 0, xs: [1] };\n        b.xs.insert(0, 0);\n${show("b.xs")}\n        b.xs.insert(1, 5);\n        @shown = "unreached";`));
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect($("#o").textContent).toBe("0,1");
  });

  test("`insert(i, x)` on a part: a position past the end at run time is E-INDEX-OUT-OF-RANGE-RT, nothing written", async () => {
    await load(prog(`    type W:struct = { xs: int[free, insert] }\n    <i:int=5/>`, `        let b: W = { xs: [1] };\n        b.xs.insert(@i, 2);\n        @shown = "unreached";`));
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-INDEX-OUT-OF-RANGE-RT"]);
    expect($("#o").textContent).toBe("");
  });
});

describe("H2 — a removal used as a VALUE on a bounded tape is bound-checked (local, part, cell)", () => {
  test("provable: a one-length bound's removal value is E-WRITE-INVARIANT (local, part, cell)", () => {
    expect(codes(prog("", `        let xs: int[2..=2, pop] = [1, 2];\n        const v: int | not = xs.pop();`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog(P1, `        let b: Q = { xs: [1, 2] };\n        const v: int | not = b.xs.pop();`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog("    <c:int[2..=2, pop]=([1, 2])/>", `        const v: int | not = @c.pop();`))).toEqual(["E-WRITE-INVARIANT"]);
  });

  test("a local: the value is the removed element (the check wraps the EDIT, never the value); below the min it traps", async () => {
    const src = prog(OR, `        let xs: int[1..=3, pop, shift, remove] = [1, 2, 3];\n        const a: int | not = xs.pop();\n        const b: int | not = xs.shift();\n        @shown = txtOr(a) + "," + txtOr(b) + "|" + ${txt("xs")};\n        const c: int | not = xs.remove(0);\n        @shown = "unreached";`);
    const r = clean(src);
    const lc = lengthChecks(r.core);
    expect(lc.map((p) => opName(p.data.args[0].data.op))).toEqual(["TapeDropEnd", "TapeDropFront", "TapeRemoveAt"]);
    await load(src);
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect(e[0].detail.length).toBe(0);
    expect($("#o").textContent).toBe("3,1|2");
  });

  test("a local whose bound starts at 0: proven — no check, `not` once empty", async () => {
    const src = prog(OR, `        let xs: int[0..=2, pop] = [7];\n        const a: int | not = xs.pop();\n        const b: int | not = xs.pop();\n        @shown = txtOr(a) + "," + txtOr(b);`);
    expect(lengthChecks(clean(src).core).length).toBe(0);
    await load(src);
    click(btn("go"));
    expect($("#o").textContent).toBe("7,not");
  });

  test("a part (`let v = b.xs.pop()`), a `return`, an assignment: checked, traps below the min", async () => {
    await load(prog(`${OR}\n${P}\n    fn top(xs: int[1..=2, pop]) -> int | not {\n        return xs.pop();\n    }`, `        const t: int | not = top([4, 5]);\n        let b: P = { n: 0, xs: [1, 2] };\n        let v: int | not = b.xs.pop();\n        @shown = txtOr(t) + "," + txtOr(v) + "|" + ${txt("b.xs")};\n        v = b.xs.pop();\n        @shown = "unreached";`));
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect($("#o").textContent).toBe("5,2|1");
  });

  test("a cell (`const v = @c.pop()`): checked; on the trap the cell keeps its value (nothing written)", async () => {
    await load(prog2(`${OR}\n    <c:int[1..=2, pop, shift]=([1, 2])/>`, `        const a: int | not = @c.shift();\n        @shown = txtOr(a);\n        const b: int | not = @c.pop();\n        @shown = "unreached";`));
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect($("#o").textContent).toBe("1");
    click(btn("see"));
    expect($("#o").textContent).toBe("2");
  });
});

describe("H3 — a spread / concat WHOLE write into a bounded slot is bound-checked", () => {
  test("provable from the literal and the operands' declared bounds: E-WRITE-INVARIANT", () => {
    expect(codes(prog("", `        const a: int[] = [1];\n        const b: int[0..=2] = [1, 2, 3, ...a];`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog("", `        const a: int[2..=3] = [1, 2];\n        const b: int[0..=3] = [9, 9, ...a];`))).toEqual(["E-WRITE-INVARIANT"]);
    expect(codes(prog("", `        const a: int[0..=1] = [];\n        const b: int[3..=5] = [...a, 1];`))).toEqual(["E-WRITE-INVARIANT"]);
  });

  test("proven from the operands' declared bounds: no run-time check", () => {
    const r = clean(prog("", `        const a: int[1..=2] = [1];\n        const b: int[2..=3] = [...a, 9];\n${show("b")}`));
    expect(lengthChecks(r.core).length).toBe(0);
  });

  const SP = (m) => `    <c:int[1..=2, replace]=([1])/>\n    fn two(xs: int[]) -> int[1..=2] {\n        return [...xs, 0];\n    }\n    fn len(xs: int[1..=2]) -> int { return xs.length; }\n    <m:int=${m}/>`;
  const SPB = `        const s: int[] = [1, 2];\n        const e: int[] = [];\n        if (@m == 0) { const a: int[1..=2] = [...s, 3]; }\n        if (@m == 1) { let b: int[1..=2, replace] = [1]; b = [...s, ...s]; }\n        if (@m == 2) { const r: int[] = two(s); }\n        if (@m == 3) { @shown = \`\${len([...s, 4])}\`; }\n        if (@m == 4) { @c = [...s, ...s]; }\n        if (@m == 5) { const ok: int[1..=2] = [...e, 1]; @c = [...e, 7]; @shown = \`ok \${ok.length} \${@c.length}\`; }`;
  for (const m of [0, 1, 2, 3, 4]) {
    test(`a spread past the max traps at run time — position ${["a const", "a local rebind", "a return", "an argument", "a cell write"][m]}`, async () => {
      await load(prog(SP(m), SPB));
      const e = clickTrap(btn("go"));
      expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
      expect(e[0].detail.length).toBeGreaterThan(2);
    });
  }
  test("a spread inside the bound runs (a const, a cell write)", async () => {
    await load(prog(SP(5), SPB));
    click(btn("go"));
    expect($("#o").textContent).toBe("ok 1 1");
  });

  test("`a.concat(b)` into a bounded const / argument: checked, trapping; in range runs", async () => {
    await load(prog("    fn len(xs: int[1..=2]) -> int { return xs.length; }", `        const a: int[] = [1];\n        const ok: int[1..=2] = a.concat([2]);\n        @shown = \`\${ok.length},\${len(a.concat([]))}\`;\n        const bad: int[1..=2] = ok.concat(a);\n        @shown = "unreached";`));
    const e = clickTrap(btn("go"));
    expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
    expect(e[0].detail.length).toBe(3);
    expect($("#o").textContent).toBe("2,1");
  });
});

// ---------------------------------------------------------------------------
// FIX ROUND 2 (review of #1830, F1 — fail-open): an edit written as the ONE EXPRESSION of a
// statement `match` arm or a `!{}` handler arm (`.A :> xs.append(3),`) was never typed — no
// bound, grant, element-type or element-bound check (typeCall typed a local edit only when it
// was a removal value). §66.11.2: "checked on EVERY write, however it is spelled"; §66.12.6
// rule 3: each method is a write checked against the target's grants.
describe("H4 — an edit as a `match` / `!{}` arm's EXPRESSION is checked as in statement position", () => {
  const K = `    type K:enum = { A, C }\n    <k:K=(K.A)/>`;
  const E = `    type AuthErr:enum = { Denied, Locked }\n    function check(p: string)! AuthErr {\n        if (p != "secret") fail AuthErr.Denied;\n        return true;\n    }`;
  const ARMS = {
    match: { decls: K, wrap: (x) => `        match @k {\n            .A :> ${x},\n            else :> ${x}\n        }` },
    handled: { decls: E, wrap: (x) => `        check("x") !{ _ :> ${x} };` },
  };
  // a target: its declarations and body, given the tape type, its initial value and the edit
  const TARGETS = {
    local: (ty, init, ed, arm) => ["", `        let xs: ${ty} = ${init};\n${arm(`xs.${ed}`)}\n        @shown = "unreached";`],
    part: (ty, init, ed, arm) => [`    type P:struct = { n: int, xs: ${ty} }`, `        let b: P = { n: 0, xs: ${init} };\n${arm(`b.xs.${ed}`)}\n        @shown = "unreached";`],
    "parameter part": (ty, init, ed, arm) => [`    type P:struct = { n: int, xs: ${ty} }\n    function grow(b: P) -> int {\n${arm(`b.xs.${ed}`)}\n        return b.xs.length;\n    }`, `        @shown = \`\${grow({ n: 0, xs: ${init} })}\`;`],
    cell: (ty, init, ed, arm) => [`    <c:${ty}=(${init})/>`, `${arm(`@c.${ed}`)}\n        @shown = "unreached";`],
  };
  // the edit: an end-append, or (for "part insert") an insert at 0
  const EDITS = { append: { grant: "append", ed: (v) => `append(${v})` }, insert: { grant: "insert", ed: (v) => `insert(0, ${v})` } };
  const COMBOS = [];
  for (const t of Object.keys(TARGETS)) COMBOS.push([t, t, EDITS.append]);
  COMBOS.push(["part insert", "part", EDITS.insert]);
  COMBOS.push(["local insert", "local", EDITS.insert]);
  const src = (armName, tgt, ty, init, ed) => {
    const a = ARMS[armName];
    const [d, b] = TARGETS[tgt](ty, init, ed, a.wrap);
    return prog(`${a.decls}\n${d}`, b);
  };
  const uniq = (cs) => [...new Set(cs)];
  for (const armName of Object.keys(ARMS)) {
    for (const [label, tgt, ed] of COMBOS) {
      const g = ed.grant;
      test(`${armName} arm · ${label}: an unprovable edit past the bound traps (E-WRITE-INVARIANT-RT), nothing after it runs`, async () => {
        const s = src(armName, tgt, `int[1..=2, ${g}]`, "[1, 2]", ed.ed("3"));
        await load(s);
        const e = clickTrap(btn("go"));
        expect(e.map((x) => x.code)).toEqual(["E-WRITE-INVARIANT-RT"]);
        expect($("#o").textContent).toBe("");
      });
      test(`${armName} arm · ${label}: a provable bound violation is E-WRITE-INVARIANT`, () => {
        expect(uniq(codes(src(armName, tgt, `int[2..=2, ${g}]`, "[1, 2]", ed.ed("3"))))).toEqual(["E-WRITE-INVARIANT"]);
      });
      test(`${armName} arm · ${label}: an ungranted edit is E-WRITE-NOT-GRANTED`, () => {
        expect(uniq(codes(src(armName, tgt, "int[free]", "[1, 2]", ed.ed("3"))))).toEqual(["E-WRITE-NOT-GRANTED"]);
      });
      test(`${armName} arm · ${label}: a wrongly typed element is E-TYPE-031`, () => {
        expect(uniq(codes(src(armName, tgt, `int[free, ${g}]`, "[1, 2]", ed.ed(`"s"`))))).toEqual(["E-TYPE-031"]);
      });
      test(`${armName} arm · ${label}: an element past the element bound is E-WRITE-INVARIANT`, () => {
        expect(uniq(codes(src(armName, tgt, `int[1..=2][free, ${g}]`, "[]", ed.ed("[1, 2, 3]"))))).toEqual(["E-WRITE-INVARIANT"]);
      });
    }
  }

  test("an in-range edit in an arm's expression runs, and carries its check", async () => {
    const s = prog(K, `        let xs: int[1..=3, append] = [1, 2];\n        match @k {\n            .A :> xs.append(3),\n            else :> xs.append(4)\n        }\n${show("xs")}`);
    expect(lengthChecks(clean(s).core).length).toBeGreaterThan(0);
    await load(s);
    click(btn("go"));
    expect($("#o").textContent).toBe("1,2,3");
  });
});
