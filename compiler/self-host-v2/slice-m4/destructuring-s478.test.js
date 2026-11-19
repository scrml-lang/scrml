// destructuring-s478.test.js — s478-boot-destructuring (g-boot-destructuring-local-unbuilt-s478).
//
// A destructuring declaration (`const { a, b: c } = e;`, `let { … } = e;`) and a destructuring
// `for` binder (`for (const { id, name } of xs) { … }`) — read by parse.scrml parseDestructDecl /
// parseDestructIter AS one `const` temp holding the value and one local per bound name holding the
// member read off it (the JavaScript meaning of an object binding pattern; SPEC §7.2 "All
// JavaScript that is valid in a Bun execution context is valid inside `${ }`, except the
// constructs §7.2.1 excludes"; §49.2.1 `for-binder ::= ('let' | 'const')? (Identifier |
// destructuring-pattern)`). Each bound name is typed / checked / lowered as that member read.
// Before: E-PARSE-LOCAL "expected a name after `let` / `const`" (a declaration) and
// E-BOOTSTRAP-UNSUPPORTED "a destructuring `for` binder is not in the bootstrap yet" (a binder).
// Every positive program is compiled from source by the bootstrap and RUN (happy-dom).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const ENTRY = "app.scrml";
const fe = (src) => frontEnd(mods, [{ path: ENTRY, src }], ENTRY);
const errs = (r) => r.diags.filter((d) => d.severity === "Error");
const codes = (src) => errs(fe(src)).map((d) => d.code);
const msgs = (src) => errs(fe(src)).map((d) => `${d.code}: ${d.message}`);
const $ = (sel) => document.querySelector(sel);
let k = 0;

const TYPES = `    type Q:struct = { z: int }\n    type P:struct = { id: int, name: string, inner: Q }\n`;
// `body` is go()'s body; a click runs it; `#c` shows `@out` (an int).
const prog = (body) => `<program>\n${TYPES}    let <out:int=0/>\n    function go() {\n${body}\n    }\n    <button id="b" onclick=go()>b</button>\n    <p id="c">\${@out}</p>\n</program>\n`;
const P1 = `        const p: P = { id: 3, name: "ab", inner: { z: 7 } };`;

async function run(src) {
  const r = fe(src);
  expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  await loadProgram(r.core, "s478-destr-" + k++);
  click($("#b"));
  return $("#c").textContent;
}

describe("a destructuring declaration — built, typed from the struct fields, and run", () => {
  test("shorthand, rename and a nested pattern read the right fields", async () => {
    expect(await run(prog(`${P1}\n        const { id, name: nm, inner: { z } } = p;\n        @out = nm.length * 1000 + id * 100 + z * 10;`))).toBe("2370");
  });

  test("`let { … }` binds mutable names; the source is not written", async () => {
    expect(await run(prog(`${P1}\n        let { id: k } = p;\n        k = k + 5;\n        @out = k * 10 + p.id;`))).toBe("83");
  });

  test("a `const` bound name is immutable — the same code as a plain `const` write", () => {
    const plain = codes(prog(`${P1}\n        const id = p.id;\n        id = 2;\n        @out = id;`));
    expect(plain).toEqual(["E-ASSIGN-CONST"]);
    expect(codes(prog(`${P1}\n        const { id } = p;\n        id = 2;\n        @out = id;`))).toEqual(plain);
  });

  test("the value is read ONCE: one temp holds it, each name reads a field of the temp", () => {
    const r = fe(prog(`${P1}\n        const { id, name: nm } = p;\n        @out = id + nm.length;`));
    expect(errs(r)).toEqual([]);
    // `p` appears in the Core exactly as often as in `const t = p;` (its declaration + ONE
    // read) — not once per bound name
    const n = (src) => (JSON.stringify(fe(src).core).match(/"hint":"p"/g) || []).length;
    const once = n(prog(`${P1}\n        const t = p;\n        @out = t.id + t.name.length;`));
    expect(once).toBeGreaterThan(0);
    expect(n(prog(`${P1}\n        const { id, name: nm } = p;\n        @out = id + nm.length;`))).toBe(once);
    expect(JSON.stringify(r.core)).toMatch(/"hint":"destructured#\d+"/);
  });

  test("a bound name is typed from its field (an int field is not a string)", () => {
    expect(codes(prog(`${P1}\n        const { id, name } = p;\n        @out = name + id;`))).toContain("E-OPERATOR-OPERAND-TYPE");
  });

  test("a field the struct does not declare is the member read's E-TYPE-004", () => {
    expect(msgs(prog(`${P1}\n        const { nope } = p;\n        @out = 1;`))).toEqual(["E-TYPE-004: `P` has no field `nope`"]);
  });

  test("destructuring a value that is not a struct is refused as its member read is", () => {
    const m = msgs(prog(`        const n: int = 4;\n        const { q } = n;\n        @out = q;`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("E-BOOTSTRAP-UNSUPPORTED: member access `.q` on a value that is not a struct");
  });

  test("a bound name is in its block's scope — redeclaring it is E-SCOPE-REDECLARE", () => {
    expect(codes(prog(`${P1}\n        const { id } = p;\n        const id = 2;\n        @out = id;`))).toContain("E-SCOPE-REDECLARE");
  });

  test("in an `if` block, an unbraced `if` arm and a `match` arm block", async () => {
    expect(await run(prog(`${P1}\n        if (p.id > 0) { const { id } = p; @out = id; }`))).toBe("3");
    expect(errs(fe(prog(`${P1}\n        if (p.id > 0) const { id } = p;\n        @out = 1;`)))).toEqual([]);
    expect(await run(prog(`${P1}\n        const b = p.id > 0;\n        match b { true :> { const { inner: { z } } = p; @out = z; }, false :> { @out = 0; } }`))).toBe("7");
  });
});

describe("a destructuring `for` binder — built and run", () => {
  const XS = `        const xs: P[] = [{ id: 3, name: "ab", inner: { z: 1 } }, { id: 4, name: "c", inner: { z: 2 } }];`;
  test("`for (const { id, name } of xs)` reads each element's fields", async () => {
    expect(await run(prog(`${XS}\n        let s = 0;\n        for (const { id, name } of xs) { s = s + id * 10 + name.length; }\n        @out = s;`))).toBe("73");
  });

  test("keywordless binder, rename and a nested pattern", async () => {
    expect(await run(prog(`${XS}\n        let s = 0;\n        for ({ id: j, inner: { z } } of xs) { s = s + j * z; }\n        @out = s;`))).toBe("11");
  });

  test("a keywordless binder's names are `const` (§50.8.5) — the same code as a plain binder write", () => {
    const plain = codes(prog(`${XS}\n        for (o of xs) { o = xs[0]; }\n        @out = 1;`));
    expect(plain.length).toBe(1);
    expect(codes(prog(`${XS}\n        for ({ id } of xs) { id = 1; }\n        @out = 1;`))).toEqual(["E-ASSIGN-CONST"]);
  });

  test("`for (let { id } of xs)` — a mutable per-iteration name; the tape is not written", async () => {
    expect(await run(prog(`${XS}\n        let s = 0;\n        for (let { id } of xs) { id = id + 1; s = s + id; }\n        const x0: P = xs[0];\n        @out = s * 10 + x0.id;`))).toBe("93");
  });

  test("a value loop (`const ys = for … { lift … }`)", async () => {
    expect(await run(prog(`${XS}\n        const ys = for (const { id } of xs) { lift id * 2; };\n        @out = ys[0] * 10 + ys[1];`))).toBe("68");
  });

  test("INTERIM (pinned): the bound names open the body's block, so the body redeclaring one is E-SCOPE-REDECLARE (a plain binder may be shadowed there)", () => {
    expect(codes(prog(`${XS}\n        for (o of xs) { const o = 1; @out = o; }`))).toEqual([]);
    expect(codes(prog(`${XS}\n        for ({ id } of xs) { const id = 1; @out = id; }`))).toEqual(["E-SCOPE-REDECLARE"]);
  });

  test("a missing field in a binder is E-TYPE-004", () => {
    expect(msgs(prog(`${XS}\n        for (const { nope } of xs) { @out = 1; }`))).toEqual(["E-TYPE-004: `P` has no field `nope`"]);
  });
});

describe("refused by name (INTERIM) — each ONE report, no cascade on the names it binds", () => {
  const one = (body, frag) => {
    const m = msgs(prog(`${P1}\n${body}`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(m[0]).toContain(frag);
  };
  test("a default value", () => one(`        const { id = 1 } = p;\n        @out = id;`, "a default value in a destructuring pattern"));
  test("a rest element", () => one(`        const { id, ...rest } = p;\n        @out = id;`, "a rest element"));
  test("a computed key", () => one(`        const { ["id"]: v } = p;\n        @out = v;`, "a computed, string or number key"));
  test("a tape pattern", () => one(`        const [a, b] = [1, 2];\n        @out = a + b;`, "a tape destructuring pattern"));
  test("a nested tape pattern", () => one(`        const { inner: [a] } = p;\n        @out = a;`, "a tape destructuring pattern"));
  test("a type annotation on the pattern", () => one(`        const { id }: P = p;\n        @out = id;`, "a type annotation on a destructuring pattern"));
  test("a `key` clause on a destructuring binder", () => {
    const m = msgs(prog(`        const xs: P[] = [];\n        for (const { id } of xs key id) { @out = id; }`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("a `key` clause on a destructuring `for` binder");
  });
  test("a destructured `lin` value (whether its names are `lin` is unruled)", () => {
    const m = msgs(prog(`        const q: P = { id: 3, name: "ab", inner: { z: 7 } };\n        lin p = q;\n        const { id } = p;\n        @out = id;`));
    expect(m.length).toBe(1);
    expect(m[0]).toContain("destructuring a `lin` value is not in the bootstrap yet");
  });
  test("at file scope (the top level of a logic block)", () => {
    const src = `<program>\n${TYPES}    let <out:int=0/>\n</program>\n\${\n    const p: P = { id: 3, name: "ab", inner: { z: 7 } };\n    const { id } = p;\n}\n`;
    expect(msgs(src).some((x) => x.includes("a file-scope destructuring `const`"))).toBe(true);
  });
  test("a malformed pattern is the §34 pattern codes", () => {
    expect(codes(prog(`${P1}\n        const { 1 } = p;\n        @out = 1;`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(codes(prog(`${P1}\n        const { -x } = p;\n        @out = 1;`))).toContain("E-STMT-PATTERN-PROPERTY");
    expect(codes(prog(`${P1}\n        const { id: 2 } = p;\n        @out = 1;`))).toContain("E-STMT-BINDING-NAME");
  });
  // s478 (review-followups-3) — §6.1.2: "`@varname` SHALL NOT be a DESTRUCTURING TARGET
  // (`const { @varname } = o`, `const { k: @varname } = o`, …) — same code" (E-OBJECT-SHORTHAND-CELL).
  // The one report: the name after `@` is not kept as a local (no E-NAME-COLLIDES-STATE).
  test("a cell as a destructuring target is E-OBJECT-SHORTHAND-CELL, alone", () => {
    expect(codes(prog(`${P1}\n        const { @out } = p;`))).toEqual(["E-OBJECT-SHORTHAND-CELL"]);
    expect(codes(prog(`${P1}\n        const { id: @out } = p;`))).toEqual(["E-OBJECT-SHORTHAND-CELL"]);
    expect(codes(prog(`${P1}\n        const { id, inner: { z: @out } } = p;\n        @out = id;`))).toEqual(["E-OBJECT-SHORTHAND-CELL"]);
    expect(msgs(prog(`${P1}\n        const { @out } = p;`))[0]).toContain("`@out = out;`");
  });
  // An unclosed pattern stops at the statement's `;` (a pattern never holds a depth-0 `;`):
  // the declaration is skipped, the rest of the function is not read as pattern tokens.
  test("an unclosed pattern is a bounded report, not a file-long cascade", () => {
    const a = codes(prog(`${P1}\n        const { id = p;\n        @out = 1;`));
    expect(a).toContain("E-STMT-UNCLOSED-PATTERN");
    expect(a.length).toBeLessThanOrEqual(6);
    for (const c of ["E-SCOPE-001", "E-ASSIGN-CONST", "E-STMT-MISSING-SEMICOLON", "E-PARSE-EXPECTED"]) expect(a).not.toContain(c);
    const b = codes(prog(`${P1}\n        const { id, name\n        @out = 1;`));
    expect(b).toContain("E-STMT-UNCLOSED-PATTERN");
    expect(b.length).toBeLessThanOrEqual(5);
    expect(b).not.toContain("E-ASSIGN-POSITION");
  });
});
