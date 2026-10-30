// ruled-refusals-s473.test.js — s473-boot-ruled-refusals: the compile-time refusals bryan ruled in
// S473 (user-voice-scrml.md "⭐ RULED — SPEC-coverage audit decisions D1–D34", "⭐ RULED — S473
// review-surfaced decisions, all PA recs", "⭐ RULED — S473: the transitive `!` envelope counts
// QUERIES, not writes"), each with the SPEC code #1682 wrote for it. Every block is red on base
// (origin/main 2603affc6) and green here.
//
//   1. §8.9.2 amendment (review-surfaced 1, refined): the interim refusal reads the TRANSITIVE query set.
//   2. §8.9.2 amendment (review-surfaced 2): E-SQL-JOURNAL-OFF.
//   3. §66.15.2 (D11): slot multiplicity — E-COMPONENT-021 / E-COMPONENT-020 / E-DECL-SLOT-OUTSIDE-RENDERS.
//   4. §66.6.8 (D12): a use or `<*x/>` of a declaration with no `renders` — refused, citing O51.
//   5. §26.2 (D13): I-TAILWIND-NOT-BUILT, once per compile.
//   6. §7.6 (D14): a function-body local named like a cell — E-NAME-COLLIDES-STATE.
//   7. §6.5.3 / §17.4b (review-surfaced 5): legacy `key=` on a lifted element — refused with a hint.
//   8. §8.1 E-SQL-SLOT-IN-LITERAL (S468) and §7.5 E-PARAM-TYPE-REQUIRED (S469), re-coded.
//   9. §50 (D10): only the double-parenthesized condition-head assignment — E-ASSIGN-POSITION.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (src) => errs(src).map((d) => d.code);
const SQ = "?" + "{";
const DBP = (body) => `<program db="./app.db">\n${body}\n    let <r:int=0/>\n    <main><button onclick={ @r = move(1) !{ _ :> 0, }; }>go</button></main>\n</program>\n`;
// a non-`!` helper running one query (handled at the site)
const helper = (name, sql) => `    function ${name}(a: int) -> int {\n        ${SQ}\`${sql}\`}.run() !{ _ :> { return 0; } };\n        return 1;\n    }\n`;
const bang = (body) => `    function move(a: int)! SqlError {\n${body}        return 1;\n    }\n`;
// a call of a helper from a `!` body that has no query of its own (it is client-placed, so the call is
// remote and handled — §19.9.10)
const hcall = (v, name, arg) => `const ${v}: int = ${name}(${arg}) !{ _ :> { return 0; } };`;
const own = (sql, nb = "") => `        ${SQ}\`${sql}\`}${nb}.run();\n`;

// ---------------------------------------------------------------------------
describe("1 — §8.9.2 amendment: the interim envelope refusal reads the TRANSITIVE query set", () => {
  test("two queries, each through a non-`!` helper (none in the `!` body)", () => {
    const src = DBP(helper("logIt", "INSERT INTO log (a) VALUES (${a})") + helper("bump", "UPDATE acct SET n = n - ${a}") +
      bang(`        ${hcall("x", "logIt", "a")}\n        ${hcall("y", "bump", "a")}\n`));
    const e = errs(src).filter((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED");
    expect(e.length).toBe(1);
    expect(e[0].message).toContain("transitive query set");
    expect(e[0].message).toContain("§8.9.2");
    expect(e[0].message).toContain("move() → logIt()");
    expect(e[0].message).toContain("move() → bump()");
  });

  test("SELECT in the body + UPDATE through a helper (a read-then-write keeps its envelope)", () => {
    const src = DBP(helper("bump", "UPDATE acct SET n = n - ${a}") +
      bang(own("SELECT n FROM acct") + "        const y: int = bump(a);\n"));
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("one in its own body");
    expect(e[0].message).toContain("move() → bump()");
  });

  test("two levels down: a helper that calls a helper", () => {
    const src = DBP(helper("bump", "UPDATE acct SET n = n - ${a}") +
      "    function mid(a: int) -> int {\n        return bump(a);\n    }\n" +
      bang(own("SELECT n FROM acct") + "        const y: int = mid(a);\n"));
    expect(codes(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errs(src)[0].message).toContain("move() → mid() → bump()");
  });

  test("one query inside a loop — in the body, and through a helper called in a loop", () => {
    const inBody = DBP(bang("        for (let i = 0; i < 3; i = i + 1) {\n    " + own("UPDATE acct SET n = n - 1") + "        }\n"));
    const e = errs(inBody);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("more than once");
    expect(e[0].message).toContain("inside a loop");
    const viaCall = DBP(helper("bump", "UPDATE acct SET n = n - ${a}") +
      bang(`        for (let i = 0; i < 3; i = i + 1) {\n            ${hcall("y", "bump", "i")}\n        }\n`));
    expect(codes(viaCall)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errs(viaCall)[0].message).toContain("a call of `bump()`");
  });

  test("near-misses: one query (own, or through one helper) compiles; a `!` callee keeps its own envelope; `.nobatch()` is not counted", () => {
    expect(codes(DBP(bang(own("UPDATE acct SET n = 1"))))).toEqual([]);
    expect(codes(DBP(helper("bump", "UPDATE acct SET n = n - ${a}") + bang(`        ${hcall("y", "bump", "a")}\n`)))).toEqual([]);
    // a `!` callee is not followed (its queries are its own envelope's)
    const g = `    function g(a: int)! SqlError {\n${own("UPDATE acct SET n = 2")}        return 1;\n    }\n`;
    expect(codes(DBP(g + bang(own("SELECT n FROM acct") + `        ${hcall("y", "g", "a")}\n`)))).toEqual([]);
    // a loop that runs no query, beside one query outside it
    expect(codes(DBP(bang(own("UPDATE acct SET n = 1") + "        for (let i = 0; i < 3; i = i + 1) {\n            const z: int = i;\n        }\n")))).toEqual([]);
    // a helper whose one query carries `.nobatch()`, beside one own query
    const nb = `    function bump(a: int) -> int {\n        ${SQ}\`UPDATE acct SET n = 0\`}.nobatch().run() !{ _ :> { return 0; } };\n        return 1;\n    }\n`;
    expect(codes(DBP(nb + bang(own("SELECT n FROM acct") + "        const y: int = bump(a);\n")))).toEqual([]);
  });
});
