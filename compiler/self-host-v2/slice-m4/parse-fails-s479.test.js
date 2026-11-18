// parse-fails-s479.test.js — s479-parse-fails: three bootstrap conformance FAILs on main, all in
// compiler/self-host-v2/parse.scrml.
//
// (1) A braceless `type` alias at a `<program>` body top (g-boot-body-top-type-alias-region-s478).
//   §7.2.2 rule 1: "In a statement list, every statement that is not block-like (rule 2) SHALL end
//   with `;` … A statement with no `;` after it SHALL be **`E-STMT-MISSING-SEMICOLON`** (§34)";
//   rule 7: "`let a = 1 let b = 2;` is E-STMT-MISSING-SEMICOLON after `1`"; §40.8: "a `type` alias
//   ends where its type expression ends (§7.5 `type-expr`, which has no juxtaposition — `type N =
//   number extra` compiles `number` only)". Ruling: user-voice-scrml.md S478 "⭐ RULED — open owner
//   questions, PA recs adopted wholesale" item 2 — "E-STMT-MISSING-SEMICOLON (after `number` and
//   after `"b"`; the bootstrap's E-PARSE-ITEM / E-PARSE-TYPE follow-ons on `extra` / `more words`
//   are a separate cascade to quiet)".
//
// RED ON MAIN: the alias was read with LexStop.Statement ("stop after a `}` that returns to depth
// 0"), so its region ran on past its `;` and every statement after it was E-PARSE-ITEM.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2 } from "../slice-m2/harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 180000 });

const run = (src) => frontEndStdlib(mods, [{ path: "s.scrml", src }], "s.scrml");
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (r) => errs(r).map((d) => d.code);
const P = (body) => `<program>\n${body}\n</program>\n`;

describe("§7.2.2 / §40.8 — a `type` alias at a body top is ONE declaration ending at its `;`", () => {
  test("a terminated alias: the statements and markup after it are read (no E-PARSE-ITEM, no lost closer)", () => {
    const r = run(P(`let <count:int=1/>\ntype N = number;\n@count = 2;\n<p>\${@count}</p>`));
    expect(codes(r)).toEqual([]);
  });

  test("an exported alias, and a braced enum after it, read as items", () => {
    const r = run(P(`let <count:int=1/>\nexport type N = number;\ntype E:enum = { A, B }\n@count = 2;\n<p>\${@count}</p>`));
    expect(codes(r)).toEqual([]);
  });

  test("trailing words on the alias's line: ONE E-STMT-MISSING-SEMICOLON after the type, naming the skipped text", () => {
    const src = P(`let <count:int=1/>\ntype N = number extra\nexport type T = number | not more words\n@count = 2;\n<p>\${@count}</p>`);
    const r = run(src);
    expect(codes(r)).toEqual(["E-STMT-MISSING-SEMICOLON", "E-STMT-MISSING-SEMICOLON"]);
    const [a, b] = errs(r);
    expect(src.slice(0, a.span.start).endsWith("type N = number")).toBe(true);
    expect(a.message).toContain("after `number`");
    expect(a.message).toContain("`extra`");
    expect(src.slice(0, b.span.start).endsWith("number | not")).toBe(true);
    expect(b.message).toContain("`more words`");
  });

  test("an alias missing its `;` before a statement on the NEXT line: that statement is read, not skipped", () => {
    const r = run(P(`let <count:int=1/>\ntype N = number\n@count = "x";\n<p>\${@count}</p>`));
    // the `;` owed after `number`, and the write on the next line is still checked
    expect(codes(r)).toContain("E-STMT-MISSING-SEMICOLON");
    expect(codes(r).length).toBeGreaterThan(1);
  });

  test("in a `${ … }`, the skip stops at the block's `}`", () => {
    const r = run(P(`let <count:int=1/>\n\${ type N = number }\n<p>\${@count}</p>`));
    expect(codes(r)).toEqual(["E-STMT-MISSING-SEMICOLON"]);
  });

  test("a general union alias is refused by name (the bootstrap has `T | not` only), not a misplaced `;`", () => {
    const src = P(`let <count:int=1/>\ntype U = number | string;\n<p>\${@count}</p>`);
    const r = run(src);
    expect(codes(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    const d = errs(r)[0];
    expect(src.slice(d.span.start, d.span.end)).toBe("number | string");
  });
});

// (2) `sql/query-not-readable-neg` (g-boot-sql-query-not-readable-code-s478). §34 E-SQL-QUERY-NOT-READABLE:
//   "In a compilation with a database, a `?{` in an `if` / `while` condition … whose body is not ONE backtick SQL
//   template closed by `}` — written with no backtick template (an unbackticked `?{ SELECT 1; select 2 }`), with a
//   backtick inside the body, or with anything but `}` right after the closing backtick. There it is the more
//   specific code for E-SQL-003's non-template body (ruling S473 D29: "one code per rule, the more specific
//   winning")". RED ON MAIN: E-SQL-003 in every position.
const DB = (fnBody) => `<program db="./app.db">\n    function check() {\n        ${fnBody}\n    }\n    <button onclick=\${ check() }>check</button>\n</program>\n`;

describe("§8.1.2 / §34 — an unreadable `?{ … }` in an `if` condition is E-SQL-QUERY-NOT-READABLE", () => {
  test("an unbackticked, `;`-chained body in an `if` condition", () => {
    const r = run(DB(`if (?{ SELECT 1; select 2 }.get()) { return 1; }\n        return 0;`));
    expect(codes(r)).toEqual(["E-SQL-QUERY-NOT-READABLE"]);
    expect(errs(r)[0].message).toContain("bind the query to a local first");
  });

  test("text after the closing backtick, in an `if` condition", () => {
    const r = run(DB("if (?{`SELECT 1` x }.get()) { return 1; }\n        return 0;"));
    expect(codes(r)).toEqual(["E-SQL-QUERY-NOT-READABLE"]);
  });

  test("an unbackticked body in a value-`if` condition", () => {
    const r = run(DB(`const v: int = if (?{ SELECT 1 }.get()) { 1 } else { 0 };\n        return v;`));
    expect(codes(r)).toContain("E-SQL-QUERY-NOT-READABLE");
    expect(codes(r)).not.toContain("E-SQL-003");
  });

  test("outside a condition the general rule stays E-SQL-003", () => {
    const r = run(DB(`const row = ?{ SELECT 1 }.get();\n        return 0;`));
    expect(codes(r)).toContain("E-SQL-003");
    expect(codes(r)).not.toContain("E-SQL-QUERY-NOT-READABLE");
  });

  test("an all-interpolation (backticked) body in a condition stays E-SQL-003", () => {
    const r = run(DB("const q: string = \"x\";\n        if (?{`${q}`}.get()) { return 1; }\n        return 0;"));
    expect(codes(r)).toContain("E-SQL-003");
    expect(codes(r)).not.toContain("E-SQL-QUERY-NOT-READABLE");
  });
});

// (3) `type-state-codes/e-type-045-prefix-not-negation-pos` (g-boot-e-type-045-prefix-not-s478). §42.10: "`not`
//   SHALL NOT appear in prefix position before a boolean expression — in EITHER form (bare `not @x` / `not f(...)` /
//   `not obj.prop`, OR parenthesized `not (expr)`) and in ANY expression position … The compiler SHALL emit
//   E-TYPE-045 in all such positions." RED ON MAIN: E-PARSE-EXPECTED / E-PARSE-TRAILING at the operand.
describe("§42.10 — a prefix `not` is E-TYPE-045, once, with the operand read", () => {
  test("`if=(not @ready)` on an element", () => {
    const src = P(`let <ready:bool=false/>\n<p id="p" if=(not @ready)>waiting</p>`);
    const r = run(src);
    expect(codes(r)).toEqual(["E-TYPE-045"]);
    const d = errs(r)[0];
    expect(src.slice(d.span.start, d.span.end)).toBe("not");
    expect(d.message).toContain("`!expr`");
    expect(d.message).toContain("`x is not`");
  });

  test("the parenthesized form, a call operand and a name operand in logic", () => {
    const r = run(P(`let <a:int=1/>\nfunction f() -> bool { return true; }\nfunction g(o: int) -> bool {\n    const x: bool = not (@a == 1);\n    const y: bool = not f();\n    return not x;\n}\n<p>\${@a}</p>`));
    expect(codes(r).filter((c) => c === "E-TYPE-045").length).toBe(3);
    expect(codes(r)).not.toContain("E-PARSE-EXPECTED");
    expect(codes(r)).not.toContain("E-PARSE-TRAILING");
  });

  test("`not` as the absence value is not E-TYPE-045", () => {
    const r = run(P(`let <n:int | not=not/>\nfunction h() -> int | not { if (@n is not) { return not; } return @n; }\n<p>\${h()}</p>`));
    expect(codes(r)).not.toContain("E-TYPE-045");
  });

  test("`not !{ … }` is a handler on the value `not`, not a prefix `not` before `!`", () => {
    const r = run(P(`let <a:int=1/>\nfunction go() {\n    let data = not !{ _ :> 1 };\n}\n<p>\${@a}</p>`));
    expect(codes(r)).not.toContain("E-TYPE-045");
    expect(codes(r)).toContain("E-ERROR-013");
  });

  test("a legacy newline-terminated `@a = not⏎@b = not` keeps its `;` report (INTERIM same-line reading)", () => {
    const r = run(P(`let <a:int | not=1/>\nlet <b:int | not=1/>\nfunction go() {\n    @a = not\n    @b = not;\n}\n<p>\${@a}</p>`));
    expect(codes(r)).not.toContain("E-TYPE-045");
    expect(codes(r)).toContain("E-STMT-MISSING-SEMICOLON");
  });
});

// ---------------------------------------------------------------------------
// Fix round r1 (review s479-1963). Each red on c75c7eaa.

// MED-1 — §4.18.7: "One diagnostic covers each maximal run of consecutive statements that are not valid
//   code, and the statements it covers raise no other diagnostic". RED ON c75c7eaa: a prose line with a
//   `not` before a word drew E-TYPE-045 plus E-STMT-MISSING-SEMICOLON / E-SCOPE-001.
describe("§4.18.7 — a body-top prose line with `not word` is ONE E-UNQUOTED-DISPLAY-TEXT", () => {
  test("`It does not need a validator.`", () => {
    const src = P(`It does not need a validator.`);
    const r = run(src);
    expect(codes(r)).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
    const d = errs(r)[0];
    expect(src.slice(d.span.start, d.span.end)).toBe("It does not need a validator.");
  });

  test("`not a clue` (the `not` opens the line)", () => {
    const r = run(P(`not a clue`));
    expect(codes(r)).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
  });

  test("a prefix `not` in valid body-top code keeps E-TYPE-045 (and is not display text)", () => {
    const r = run(P(`let <b:bool=true/>\nlet <a:bool=true/>\n@a = not @b;\n<p>\${@a}</p>`));
    expect(codes(r)).toEqual(["E-TYPE-045"]);
  });

  test("a prefix `not` in a `\${ }` block keeps E-TYPE-045 in each position", () => {
    const r = run(P(`let <b:bool=true/>\n\${\n    if (not (@b)) { @b = false; }\n    @b = not @b;\n}\n<p>\${@b}</p>`));
    expect(codes(r)).toEqual(["E-TYPE-045", "E-TYPE-045"]);
  });
});

// LOW-3 — §7.2.2 rule 7: "`let a = 1 let b = 2;` is E-STMT-MISSING-SEMICOLON after `1`"; the §7.2.2 newline
//   table row: "the remainder is then read as the statement that follows it". RED ON c75c7eaa: the rest of the
//   alias's line was skipped whole, so a declaration on it was lost (E-SCOPE-001 at its uses).
describe("§7.2.2 — after an alias's missing `;`, the next statement on its line is read", () => {
  test("`type A = number const QQK = 1;` declares QQK", () => {
    const r = run(P(`let <count:int=1/>\ntype A = number const QQK = 1;\n@count = QQK;\n<p>\${@count}</p>`));
    expect(codes(r)).toEqual(["E-STMT-MISSING-SEMICOLON"]);
  });

  test("in a `\${ }` block too", () => {
    const r = run(P(`let <count:int=1/>\n\${\n    type A = number const QQK = 1;\n    @count = QQK;\n}\n<p>\${@count}</p>`));
    expect(codes(r)).toEqual(["E-STMT-MISSING-SEMICOLON"]);
  });

  test("words before the statement are skipped and named; a group they open and close is skipped whole", () => {
    const r = run(P(`let <count:int=1/>\ntype A = number extra(a) const QQK = 1;\n@count = QQK;\n<p>\${@count}</p>`));
    expect(codes(r)).toEqual(["E-STMT-MISSING-SEMICOLON"]);
    expect(errs(r)[0].message).toContain("`extra(a)`");
    expect(errs(r)[0].message).toContain("`const` is read as the statement that follows");
  });

  test("an opener left unclosed on the line is reported and swallows nothing past the line", () => {
    const r = run(P(`let <count:int=1/>\ntype A = number extra(\n@count = "x";\n<p>\${@count}</p>`));
    const [a] = errs(r);
    expect(a.code).toBe("E-STMT-MISSING-SEMICOLON");
    expect(a.message).toContain("`(` is not closed");
    // the write on the next line is still read and checked
    expect(codes(r).length).toBeGreaterThan(1);
  });

  test("a group the skipped text opens and closes on a later line is skipped whole (legacy `= struct { … }`)", () => {
    const r = run(P(`let <count:int=1/>\ntype Order = struct {\n    id: number,\n    amount: number\n}\n@count = 2;\n<p>\${@count}</p>`));
    // (`struct` is read as the aliased type name: E-TYPE-UNKNOWN; no parse cascade from the body)
    expect(codes(r)).toEqual(["E-STMT-MISSING-SEMICOLON", "E-TYPE-UNKNOWN"]);
    expect(errs(r)[0].message).toContain("`{ id: number, amount: number }`, is not read");
  });

  test("an unclosed opener in a `\${ }` block skips only its line", () => {
    const r = run(P(`let <count:int=1/>\n\${\n    type A = number extra(\n    @count = 2;\n}\n<p>\${@count}</p>`));
    const [a] = errs(r);
    expect(a.code).toBe("E-STMT-MISSING-SEMICOLON");
    expect(a.message).toContain("`extra(`, is not read");
    expect(a.message).toContain("`(` is not closed");
  });

  test("an unclosed opener hides no statement start after it on the line", () => {
    const r = run(P(`let <count:int=1/>\ntype A = number extra( const QQK = 1;\n@count = QQK;\n<p>\${@count}</p>`));
    expect(codes(r)).toEqual(["E-STMT-MISSING-SEMICOLON"]);
    expect(errs(r)[0].message).toContain("`(` is not closed");
  });
});

// LOW-4 — §49.3.1: "This is the loop the retired `while (cond)` spelled", so the §34 E-SQL-QUERY-NOT-READABLE
//   "`if` / `while` condition" covers a `for (cond)` head. RED ON c75c7eaa: E-SQL-003.
describe("§34 — an unreadable `?{ … }` in a `for (cond)` head is E-SQL-QUERY-NOT-READABLE", () => {
  test("an unbackticked body in a `for` condition head", () => {
    const r = run(DB(`for (?{ SELECT 1 }.get()) { break; }\n        return 0;`));
    expect(codes(r)).toContain("E-SQL-QUERY-NOT-READABLE");
    expect(codes(r)).not.toContain("E-SQL-003");
  });

  test("outside the condition head (a counted loop's body) E-SQL-003 stands", () => {
    const r = run(DB(`for (let i = 0; i < 1; i = i + 1) { const row = ?{ SELECT 1 }.get(); }\n        return 0;`));
    expect(codes(r)).toContain("E-SQL-003");
  });
});
