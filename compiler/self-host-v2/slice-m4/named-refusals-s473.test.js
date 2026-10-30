// named-refusals-s473.test.js — S473 D28: every construct the bootstrap does not build gets a NAMED
// refusal, from ONE table (compiler/self-host-v2/refusals.scrml).
//
// Governing text: user-voice-scrml.md S473 D28 ("your recs on all") — "every construct the bootstrap
// does not build gets a NAMED refusal, from one table." D22 — "`flush()` and E-REACTIVE-004 are
// retired" (a `flush()` call is named, under E-SCOPE-001: the SPEC names no dedicated code). D29 —
// "one code per rule, the more specific winning": a construct that is NOT scrml is refused with the
// SPEC's own code (§7.2.1's E-*-NOT-IN-SCRML family, E-TYPE-ANY-FORBIDDEN, …), never as a bootstrap
// limit. Gap: g-bootstrap-unimplemented-construct-reported-as-generic-code.
//
// The contract pinned here:
//   1. each listed construct is refused by name (its row's code; an E-BOOTSTRAP-UNSUPPORTED message
//      names the construct and its §) and the generic cascade it used to cause is gone;
//   2. RE-LABEL ONLY: the table never refuses a program the front end accepted — the table's words in
//      prose, strings and comments compile clean;
//   3. the table is data in one place: every row's code has a §34 severity (or is the bootstrap's own
//      E-BOOTSTRAP-UNSUPPORTED) and every row's section is a SPEC heading.

import { describe, test, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadM2 } from "../slice-m2/harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 180000 });

const run = (src) => frontEndStdlib(mods, [{ path: "s.scrml", src }], "s.scrml");
const P = (logic, markup = `    <main><p>x</p></main>`) => `<program>\n${logic}\n${markup}\n</program>\n`;
const UNS = "E-BOOTSTRAP-UNSUPPORTED";

// [construct, source, code]; an E-BOOTSTRAP-UNSUPPORTED row's message must name `construct` and its §.
const CASES = [
  // ---- not scrml: the SPEC's own code ----
  ["try", P(`    function f() -> int { try { return 1; } catch (e) { return 0; } }`), "E-TRY-NOT-IN-SCRML"],
  ["throw", P(`    function f() -> int { throw 1; }`), "E-THROW-NOT-IN-SCRML"],
  ["async fn", P(`    async fn f() -> int { return 1; }`), "E-FN-005"],
  ["catch", P(`    function f() -> int {\n        try {\n            return 1;\n        } catch (e) {\n            return 0;\n        }\n    }`), "E-TRY-NOT-IN-SCRML"],
  ["async", P(`    async function f() -> int { return 1; }`), "E-ASYNC-NOT-IN-SCRML"],
  ["await", P(`    function g() -> int { return 1; }\n    function f() -> int { const x: int = await g(); return x; }`), "E-AWAIT-NOT-IN-SCRML"],
  ["for await", P(`    let <xs:int[]=[]/>\n    function f() { for await (const x of @xs) { log(x); } }`), "E-FOR-AWAIT-NOT-IN-SCRML"],
  ["class", P(`    \${\n    class Foo { }\n    }`), "E-CLASS-NOT-IN-SCRML"],
  ["switch", P(`    function f(n: int) -> int { switch (n) { } return 1; }`), "E-SWITCH-FORBIDDEN"],
  ["import(…)", P(`    function f() { const m = import("./x.scrml"); }`), "E-DYNAMIC-IMPORT-NOT-IN-SCRML"],
  ["any", P(`    let <x:any=0/>`), "E-TYPE-ANY-FORBIDDEN"],
  ["fn … = expr", P(`    fn f(x: int) -> int = x * 2;`), "E-FN-EQUALS-BODY"],
  ["fn(…) => expr", P(`    let <xs:int[]=[]/>\n    function f() -> int { const d = @xs.map(fn(n) => n * 2); return 1; }`), "E-FN-ARROW-BODY"],
  ["match-arm guard", P(`    type C:enum = { Red, Green }\n    function grd(c: C, n: int) -> int { return match c { .Red if n > 0 :> 1, else :> 2, }; }`), "E-SYNTAX-011"],
  ["nested pattern", P(`    type In:enum = { X(n: int), Y }\n    type Out:enum = { A(i: In), B }\n    function nest(o: Out) -> int { return match o { .A(.X(n)) :> n, else :> 0, }; }`), "E-SYNTAX-012"],
  ["reflect()", P(`    function f() { reflect(int); }`), "E-META-008"],
  ["x is <value>", P(`    let <n:int=0/>\n    function f() -> bool { return @n is 0; }`), "E-EQ-005"],
  ["{ @x } shorthand", P(`    let <owner:string="a"/>\n    function f() -> string { const o = { @owner }; return o.owner; }`), "E-OBJECT-SHORTHAND-CELL"],
  ["struct field of function type", P(`    type T:struct = { n: int, cb: () -> int }`), "E-STRUCT-FUNCTION-FIELD"],
  // ---- retired (D22): named, under the SPEC's unknown-function code ----
  ["flush()", P(`    let <p:int=1/>\n    <d:int=(@p * 2)/>\n    function go() -> int { @p = 5; flush(); return @d; }`), "E-SCOPE-001"],
  // ---- scrml the bootstrap does not build yet ----
  ["partial match", P(`    type C:enum = { Red, Green }\n    function part(c: C) -> int { let r = 0; partial match c { .Red :> { r = 1; }, }; return r; }`), UNS],
  ["multi-scrutinee match", P(`    type C:enum = { Red, Green }\n    function ms(a: C, b: C) -> int { return match (a, b) { (.Red, .Red) :> 1, (_, _) :> 2, }; }`), UNS],
  ["named payload binding", P(`    type S:enum = { A(x: int, y: int), B }\n    function g(s: S) -> int { return match s { .A(x: q, y: w) :> q, .B :> 0, }; }`), UNS],
  ["is <variant>", P(`    type C:enum = { Red, Green }\n    let <c:C=.Red/>\n    function f() -> bool { return @c is .Green; }`), UNS],
  ["pure function", P(`    pure function f() -> int { return 1; }`), UNS],
  ["pinned", P(`    fn a() -> int { return b(); }\n    pinned fn b() -> int { return 1; }`), UNS],
  ["animationFrame()", P(`    function draw() { log("f"); }\n    function go() { animationFrame(draw); }`), UNS],
  ["enum transitions block", P(`    type S:enum = { Idle, Loading, Done transitions { .Idle => .Loading } }`), UNS],
  ["EnumType.variants", P(`    type Role:enum = { Admin, User }\n    function f() -> int { return Role.variants.length; }`), UNS],
  ["`::` in an expression", P(`    type Role:enum = { Admin, User }\n    let <r:Role=.Admin/>\n    function f() { @r = Role::User; }`), UNS],
  ["snippet type", P(`    function f(s: snippet) -> int { return 1; }`), UNS],
  ["renders on an enum variant", P(`    type E:enum = { Bad(why: string) renders <p>x</p>, Worse }`), UNS],
  ["httpStatus(…) on a variant", P(`    type ApiError:enum = { NotFound(r: string) httpStatus(404), Gone }`), UNS],
  ["^{ } in logic", P(`    let <count:int=0/>\n    function bump() { ^{ emit("x"); } @count = @count + 1; }`), UNS],
  ["use foreign:", P(`    use foreign:ml { predict }`), UNS],
  ["use", `use scrml:ui\n<program>\n<main><p>x</p></main>\n</program>\n`, UNS],
  ["?. optional chaining", P(`    type U:struct = { name: string }\n    let <u:U | not=not/>\n    function f() -> string { return @u?.name; }`), UNS],
  ["word-form `or`", P(`    let <n:int=0/>\n    let <b:bool=false/>\n    function f() { @b = @n > 1 or @n < 0; }`), UNS],
  ["map literal [:]", P(`    let <m:[string: int]=[:]/>`), UNS],
  ["map type [K: V]", P(`    type T:struct = { m: [string: int] }`), UNS],
  ["anonymous fn expression", P(`    let <n:int=0/>\n    function f() -> int { const g = fn (x: int) -> int { return x; }; return g(1); }`), UNS],
  ["replay()", P(`    let <n:int=0/>\n    function rp() { replay(@n, @n, 0); }`), UNS],
  ["@currentUser", `<program db="./app.db">\n    <main><p>\${@currentUser.id}</p></main>\n</program>\n`, UNS],
  ["on mount { }", P(``, `    <main><p>x</p>\${ on mount { log("m"); } }</main>`), UNS],
  ["new X(…)", P(`    function f() -> int { const a = new Float64Array(3); return 1; }`), UNS],
];

describe("D28 — each listed construct is refused by name, from the one table", () => {
  for (const [construct, src, code] of CASES) {
    test(`${construct} → ${code}`, () => {
      const r = run(src);
      const named = r.diags.filter((d) => d.code === code && (code !== UNS || d.message.includes("`" + construct + "`")));
      expect(named.length).toBeGreaterThanOrEqual(1);
      if (code === UNS) expect(named[0].message).toMatch(/\((§[0-9][0-9.a-z]*|App\. [A-Z])\) is not in the bootstrap yet/);
      if (code === "E-SCOPE-001") expect(named[0].message).toContain("retired");
      // the generic cascade is gone: no parse-structure / unknown-name code beside the named refusal
      // (E-SCOPE-001 is the flush() row's own code)
      const generic = r.diags.filter((d) => /^E-PARSE-(ITEM|TRAILING|EXPECTED|TAG|TYPE|ARM|EXPR|UNCLOSED|CLOSER)$/.test(d.code));
      expect(generic.map((d) => d.code)).toEqual([]);
    });
  }
});

describe("D28 — a built `::V` match-arm pattern is not refused", () => {
  test("`::V` in a match arm compiles (§14.5: built in a pattern)", () => {
    const src = P(`    type C:enum = { Red, Green }\n    function f(c: C) -> int { return match c { ::Red :> 1, ::Green :> 2, }; }`);
    expect(run(src).diags.filter((d) => d.severity === "Error").map((d) => d.code)).toEqual([]);
  });
});

describe("D28 — re-label only: the table never refuses a program the front end accepts", () => {
  test("the table's words in prose, a string and a comment compile clean", () => {
    const src = P(
      `    let <n:int=0/>\n    // try async await throw partial match use pure pinned flush() is .V\n    function f() -> string { return "try { } or and use x"; }`,
      `    <main><p>Use it or lose it, and try again</p><p>\${f()}</p></main>`,
    );
    expect(run(src).diags.filter((d) => d.severity === "Error").map((d) => d.code)).toEqual([]);
  });
  test("a construct's words with no error on their line are left alone; a specific code elsewhere stays", () => {
    // `@n is not` is built; the E-TYPE-031 on another line is not part of any cascade
    const src = P(`    let <n:int | not=not/>\n    let <s:string=""/>\n    function f() -> bool { return @n is not; }\n    function g() { @s = 1; }`);
    expect(run(src).diags.map((d) => d.code)).toEqual(["E-TYPE-031"]);
  });
  test("a named refusal is an Error — the compile still fails", () => {
    for (const [, src] of CASES) {
      const r = run(src);
      expect(r.diags.some((d) => d.severity === "Error")).toBe(true);
    }
  });
});

describe("D28 — the table is data in one place", () => {
  const SPEC = readFileSync(join(import.meta.dir, "..", "..", "SPEC.md"), "utf8");
  test("every row's code is the bootstrap's E-BOOTSTRAP-UNSUPPORTED or a §34 code, and every row's section is a SPEC heading", () => {
    const rows = mods.refusals.refusalTable();
    expect(rows.length).toBeGreaterThanOrEqual(40);
    for (const r of rows) {
      if (r.code !== UNS) expect(SPEC).toContain(`| ${r.code} |`);
      const sec = r.section.replace(/^§/, "");
      if (r.section.startsWith("App. ")) expect(SPEC).toContain(`## Appendix ${r.section.slice(5)}:`);
      else expect(SPEC).toMatch(new RegExp(`^#+ ${sec.replace(/\./g, "\\.")}[ .]`, "m"));
    }
  });
  test("every listed construct is a row of the table (the test and the table agree)", () => {
    const names = new Set(mods.refusals.refusalTable().map((r) => r.construct));
    for (const [construct] of CASES) expect(names.has(construct)).toBe(true);
  });
});
