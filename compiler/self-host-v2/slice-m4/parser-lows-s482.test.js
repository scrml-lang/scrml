// parser-lows-s482.test.js — s482-parser-lows: four parse.scrml known-gaps residue items.
//
// (1) g-boot-body-top-let-decl-after-type-alias-s479 — a body-top `let <x…/>` after a
//   `;`-terminated `type A = B;` was read as a logic-block `let`. Re-measured on main d64e7e060:
//   it compiles — PR #1963 (s479-parse-fails) reads a body-top `type` with LexStop.Decl, so the
//   alias's region ends at its `;`. PINNING tests only (green on base and head).
// (2) g-boot-body-top-not-stmt-with-parse-error-s480 — a body-top prose line opening with `not`
//   whose statement also carries an E-PARSE-* error (`not 100%`, `not @x +`, `not (really`) is
//   prose: §4.18.7 "One diagnostic covers each maximal run of consecutive statements that are not
//   valid code, and the statements it covers raise no other diagnostic". RED ON BASE: E-TYPE-045
//   plus the parse cascade.
// (3) g-boot-alias-skipped-decls-incomplete-s480 — §40.8 "a statement whose head expression was
//   parsed as a valid prefix with the rest discarded is not compiled unless an error reports the
//   discarded text": the alias-skip report names destructurings, `let <x/>` cells and keywordless
//   bindings too. RED ON BASE: only `const QQZ` was named.
// (4) g-boot-e-type-045-in-misread-markup-s479 — a `{<tag …>…</>}` attribute value (§19.6.2) is
//   not read as code: one named refusal over the value (INTERIM — `<errorBoundary>` is not built),
//   no E-PARSE-* cascade and no E-TYPE-045 from a `not` in the element's text. RED ON BASE.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2 } from "../slice-m2/harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 180000 });

const run = (src) => frontEndStdlib(mods, [{ path: "s.scrml", src }], "s.scrml");
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (r) => errs(r).map((d) => d.code);
const P = (body) => `<program>\n${body}\n</program>\n`;

describe("(1) a body-top `let <x…/>` after a `;`-terminated alias is a declaration (pinned; fixed by #1963)", () => {
  test("`type N = int;` then `let <count:N=0/>`", () => {
    const r = run(P(`    type N = int;\n    let <count:N=0/>\n    <p>\${@count}</p>`));
    expect(codes(r)).toEqual([]);
  });

  test("a blank line between the alias and the `let`", () => {
    const r = run(P(`    type N = int;\n\n    let <count:N=0/>\n    <p>\${@count}</p>`));
    expect(codes(r)).toEqual([]);
  });

  test("the conformance twin shape: an alias of an enum, then a cell of it with a variant value", () => {
    const src = P(`    type LoadResult:enum = { Loaded(v: string), Failed(reason: string) }\n    type Loaded = LoadResult;\n    let <result:LoadResult=(.Failed("unset"))/>\n    <p>x</p>`);
    const r = run(src);
    expect(codes(r).filter((c) => c.startsWith("E-PARSE") || c === "E-BOOTSTRAP-UNSUPPORTED")).toEqual([]);
  });
});

describe("(2) §4.18.7 — a body-top `not` line whose statement has an E-PARSE-* error is prose", () => {
  for (const line of ["not 100%", "not @x +", "not (really"]) {
    test(`\`${line}\` → E-UNQUOTED-DISPLAY-TEXT at the line, no E-TYPE-045`, () => {
      const src = P(`    ${line}\n    <p>hi</p>`);
      const r = run(src);
      const cs = codes(r);
      expect(cs).not.toContain("E-TYPE-045");
      expect(cs[0]).toBe("E-UNQUOTED-DISPLAY-TEXT");
      expect(src.slice(errs(r)[0].span.start).startsWith("not ")).toBe(true);
    });
  }

  test("`not 100%` and `not @x +` are the line's only diagnostic", () => {
    expect(codes(run(P(`    not 100%\n    <p>hi</p>`)))).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
    expect(codes(run(P(`    not @x +\n    <p>hi</p>`)))).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
  });

  test("a parsed `not` statement keeps E-TYPE-045 (`not @x;`)", () => {
    const r = run(P(`    let <x:int=0/>\n    not @x;\n    <p>hi</p>`));
    expect(codes(r)).toEqual(["E-TYPE-045"]);
  });
});

describe("(3) §40.8 — the alias-skip report names every declaration its skipped text swallows", () => {
  test("destructurings, a keywordless binding and a `let <x/>` cell are named with `const QQZ`", () => {
    const src = P(`    type A = number extra(\n        const { a, b } = obj;\n        const [c] = xs;\n        y = 1;\n        let <z:int=0/>\n        const QQZ = 1;\n    )\n    <p>hi</p>`);
    const r = run(src);
    expect(codes(r)).toEqual(["E-STMT-MISSING-SEMICOLON"]);
    const m = errs(r)[0].message;
    expect(m).toContain("the declarations in it (`const { a, b }`, `const [c]`, `y = …`, `let <z/>`, `const QQZ`) are not declared");
  });

  test("a name and `=` mid-expression is not a binding (`extra(a = 1)` names nothing)", () => {
    const r = run(P(`    type A = number extra(f, a = 1)\n    <p>hi</p>`));
    expect(codes(r)).toEqual(["E-STMT-MISSING-SEMICOLON"]);
    expect(errs(r)[0].message).not.toContain("are not declared");
  });
});

describe("(4) §19.6.2 — a `{<tag>…</>}` attribute value is refused by name, never read as code", () => {
  const EB = (fb) => `<program>\n    <errorBoundary fallback=${fb}>\n        <p>body</p>\n    </>\n    <footer>End</>\n</program>\n`;

  test("`fallback={<div class=\"x\">Could not load profile</>}`: no E-TYPE-045, no E-PARSE-* cascade", () => {
    const src = EB(`{<div class="x">Could not load profile</>}`);
    const r = run(src);
    const cs = codes(r);
    expect(cs).not.toContain("E-TYPE-045");
    expect(cs.filter((c) => c.startsWith("E-PARSE"))).toEqual([]);
    const d = errs(r).find((x) => x.message.includes("markup as an attribute value"));
    expect(d.code).toBe("E-BOOTSTRAP-UNSUPPORTED");
    expect(src.slice(d.span.start, d.span.end)).toBe(`{<div class="x">Could not load profile</>}`);
  });

  // s482-closer-cleanup — there is no terse `/}` closer (retired for `</>`, §4.4, Appendix E):
  // the value is refused E-SYNTAX-050 at the `/`, and still never read as code.
  test("a retired `/}` closer, with an apostrophe and a `${ }` slot in the text: E-SYNTAX-050", () => {
    const src = EB(`{<div class="x">It can't load \${1}/}`);
    const r = run(src);
    expect(codes(r).filter((c) => c.startsWith("E-PARSE") || c === "E-TYPE-045")).toEqual([]);
    expect(errs(r).find((x) => x.message.includes("markup as an attribute value"))).toBeUndefined();
    const d = errs(r).find((x) => x.code === "E-SYNTAX-050");
    expect(src.slice(d.span.start, d.span.end)).toBe("/");
    expect(src.slice(d.span.start - 2, d.span.end + 1)).toBe("1}/}");
    expect(d.message).toContain("Did you mean `</>`?");
  });

  test("a `{ … }` value that is code (a comparison, a block) keeps its reading", () => {
    const r = run(P(`    let <n:int=1/>\n    <p title={@n < 2}>x</p>`));
    expect(errs(r).map((d) => d.message).join(" ")).not.toContain("markup as an attribute value");
  });
});
