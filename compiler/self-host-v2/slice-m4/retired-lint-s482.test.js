// retired-lint-s482.test.js — s482-retired-lint: the #2095 r1 review follow-ups (item 0) and R3.
//
// RULINGS (scrml-support/user-voice-scrml.md):
//   "the `/}` "terse closer" is the retired trailing-slash closer; Appendix E governs (S482)" —
//     Appendix E: "Any source file using bare `/` or trailing content`/` closers SHALL be rejected
//     by the compiler with a diagnostic pointing to §4.4. The diagnostic SHALL include a hint:
//     "Did you mean `</>`?""
//   "every retirement / deprecation PR adds a retired-forms ledger row and migrates (S482)" — the
//     same answer confirmed R3: "`<x>` in an expression is not a read form — §4 table: "`@x`
//     reads"; the parser gives one targeted error with a fix-it to `@x`".
//
// (a) #2095 r1 LOW-4 — a markup value in logic (`return <div>…`) is read by its own reader; the
//     retired closers that reader finds are named (they were dropped with its MP). RED ON BASE.
// (c) LOW-1 — a legal `and/` in a `<p>…</>` is not named because an UNRELATED element is unclosed
//     (an inner element left unclosed with no candidate, or an element closed by its own name
//     around it). RED ON BASE. LOW-2 — a legacy `{<n> > 0 /* c */}` / `{<n> && /x/}` attribute
//     value gets no E-SYNTAX-050 at the comment's / regex's `/`. RED ON BASE.
// R3 — `<n>` read as a value is one E-CELL-ANGLE-READ with the `@n` fix-it. RED ON BASE.
// Guards — the real retired closers stay named (the corpus's 145 sample lines are pinned by the
// corpus run in the PR; here the shapes that broke while building the rule).

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2 } from "../slice-m2/harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 180000 });

const run = (src) => frontEndStdlib(mods, [{ path: "s.scrml", src }], "s.scrml");
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info" && (d.file ?? "s.scrml") === "s.scrml");
const codes = (r) => errs(r).map((d) => d.code);
const P = (body) => `<program>\n${body}\n</program>\n`;
const s050 = (r) => errs(r).filter((d) => d.code === "E-SYNTAX-050");
const at = (src, d) => src.slice(d.span.start, d.span.end);

describe("(a) LOW-4 — a markup value's own reader's retired closers are named", () => {
  test("`return <div>⏎<p>hi/⏎</>;` in a function: E-SYNTAX-050 at the `/`, with the hint", () => {
    const src = P(`\${ fn card() { return <div>\n<p>hi/\n</>; } }\n<div>\${card()}</div>`);
    const ds = s050(run(src));
    expect(ds.length).toBe(1);
    expect(src.slice(ds[0].span.start - 2, ds[0].span.end)).toBe("hi/");
    expect(ds[0].message).toContain("Did you mean `</>`?");
  });

  test("a closed markup value with a prose `/` gets none", () => {
    expect(s050(run(P(`\${ fn card() { return <div>\n<p>and/\nor</p>\n</div>; } }\n<div>\${card()}</div>`)))).toEqual([]);
  });
});

describe("(c) LOW-1 — legal prose `/` under an unrelated unclosed element is not named", () => {
  const cases = [
    ["an inner element left unclosed (`<span>x`)", `<div>\n<p>either this or that and/\nmore</>\n<span>x`],
    ["a fraction", `<div>\n<p>about 1/\n2 of it</>\n<span>x`],
    ["before a tag", `<div>\n<p>see docs/<b>here</b></>\n<span>x`],
    ["an ancestor closed by its own name (`</div>`) under an unclosed `<section>`", `<section>\n<div>\n<p>and/\nmore</>\n</div>\n<ul>\n<li>x</li>\n</ul>`],
  ];
  for (const [name, body] of cases) {
    test(name, () => {
      const r = run(P(body));
      expect(s050(r)).toEqual([]);
      expect(codes(r).some((c) => c === "E-PARSE-UNCLOSED" || c === "E-PARSE-CLOSER")).toBe(true);
    });
  }

  test("still named: the retired reading re-balances (`<code>x⏎<p>and/⏎more</>` — the `/` closes `<p>`, the `</>` `<code>`)", () => {
    expect(s050(run(P(`<code>x\n<p>and/\nmore</>\n<p>b</p>`))).length).toBe(1);
  });

  test("still named: an inner element's retired closer, a same-name `</div>` around it (samples/kanban-r11.scrml's shape)", () => {
    const src = P(`<div>\n<div class="cards">\${\n    for (let c of [1]) {\n        lift <div class="card">\n            <p>\${c}/\n            <div>\n                <button>Move/\n            </div>\n        </div>\n    }\n}</>\n<p if=true>x</>\n</div>`);
    const ds = s050(run(src));
    expect(ds.map((d) => src.slice(d.span.start - 4, d.span.end))).toEqual(["\${c}/", "Move/"]);
  });

  test("still named: each `<td>x/` of a lift row (samples/gauntlet-r11-go-url-shortener.scrml's shape)", () => {
    const src = P(`<table><tbody>\${\n    for (let u of [1]) {\n        lift <tr>\n            <td>\${u}/\n            <td>\${u}/\n            <td>\n                <button>Delete/\n            </td>\n        </tr>\n    }\n}</tbody></table>`);
    expect(s050(run(src)).length).toBe(3);
  });
});

describe("(c) LOW-2 — a legacy-read attribute value's comment / regex `/` is not a retired closer", () => {
  test("`if={<n> > 0 /* c */}`: no E-SYNTAX-050; the `<n>` is the R3 error", () => {
    const r = run(P(`let <n:int=1/>\n<div if={<n> > 0 /* c */}>x</div>`));
    expect(s050(r)).toEqual([]);
    expect(codes(r)).toContain("E-CELL-ANGLE-READ");
  });

  test("`if={<n> && /x/}`: no E-SYNTAX-050", () => {
    expect(s050(run(P(`let <n:int=1/>\n<div if={<n> && /x/}>x</div>`)))).toEqual([]);
  });

  test("still named: `fallback={<div><b>x</b> err/}` (prose starting with a tag)", () => {
    expect(s050(run(P(`<errorBoundary fallback={<div><b>x</b> err/}>\n<p>b</p>\n</>`))).length).toBe(1);
  });
});

describe("R3 — `<x>` read as a value is E-CELL-ANGLE-READ, fix-it `@x`", () => {
  const cases = [
    ["an operand in a function", `let <n:int=1/>\n\${ fn f() -> int { return <n> + 1; } }\n<p>\${f()}</p>`, "<n>"],
    ["a `let` initializer", `let <n:int=1/>\n\${ fn f() -> int { let a = <n>; return a; } }\n<p>\${f()}</p>`, "<n>"],
    ["a member read `<xs>.length`", `let <xs:string[]=[]/>\n\${ fn f() -> int { return <xs>.length; } }\n<p>\${f()}</p>`, "<xs>"],
    ["an interpolation `\${<n>}`", `let <n:int=1/>\n<p>\${<n>}</p>`, "<n>"],
    ["an interpolation `\${<n> + 1}`", `let <n:int=1/>\n<p>\${<n> + 1}</p>`, "<n>"],
    ["a paren attribute `if=(<n> > 0)`", `let <n:int=1/>\n<p if=(<n> > 0)>x</p>`, "<n>"],
    ["a statement `<n> + 1;`", `let <n:int=1/>\n\${ fn f() { <n> + 1; } }`, "<n>"],
    // #2101 r1 LOW-2: the right operand of an operator, and one report (no E-BOOTSTRAP-UNSUPPORTED beside it)
    ["the right operand `1 + <n>`", `let <n:int=1/>\n\${ fn f() -> int { return 1 + <n>; } }\n<p>\${f()}</p>`, "<n>"],
    ["the right operand `@n == <n>`", `let <n:int=1/>\n\${ fn f() -> bool { return @n == <n>; } }\n<p>\${f()}</p>`, "<n>"],
    ["an argument `f(<n>)` in a file-scope `let`", `let <n:int=1/>\n\${ fn g(a: int) -> int { return a; } let y = g(<n>); }`, "<n>"],
    ["an HTML-named cell `g(<data>)` (the bootstrap rule is authoritative; the lint matches it)", `let <data:int=1/>\n\${ fn g(a: int) -> int { return a; } fn f() -> int { return g(<data>); } }\n<p>\${f()}</p>`, "<data>"],
    ["a braced attribute `if={<n> > 0}`", `let <n:int=1/>\n<p if={<n> > 0}>x</p>`, "<n>"],
  ];
  for (const [name, body, want] of cases) {
    test(name + ": ONE error, at the `<n>`, naming `@n`", () => {
      const src = P(body);
      const r = run(src);
      const ds = errs(r).filter((d) => d.code === "E-CELL-ANGLE-READ");
      expect(ds.length).toBe(1);
      expect(at(src, ds[0])).toBe(want);
      expect(ds[0].message).toContain("`@" + want.slice(1, -1) + "`");
      expect(ds[0].severity).toBe("Error");
      expect(codes(r).filter((c) => c.startsWith("E-PARSE"))).toEqual([]);
      expect(codes(r).filter((c) => c === "E-BOOTSTRAP-UNSUPPORTED")).toEqual([]);
    });
  }

  const legal = [
    ["a markup value `<b>x</b>`", `\${ fn g() { return <b>x</b>; } }`],
    ["a markup value whose prose starts with an operator `<li> - item</li>`", `\${ fn g() { return <li> - item</li>; } }`],
    ["a void element `<br>`", `\${ fn g() { return <br>; } }`],
    ["a `lift` row", `<ul>\${ for (x of [1,2]) { lift <li>\${x}</li>; } }</ul>`],
    ["a ternary of markup values", `let <f:boolean=true/>\n\${ fn g() { return @f ? <b>a</b> : <i>b</i>; } }`],
    ["the retired declaration `<n> = 5` (not a read; left as it was)", `\${ <n> = 5; }`],
    ["`a <b> 3` comparison chain", `\${ const a = 1; const b = 2; const c = a <b> 3; }`],
    ["a comparison after an operator `a + 1 < b`", `\${ fn g(a: int, b: int) -> bool { return a + 1 < b; } }`],
  ];
  for (const [name, body] of legal) {
    test("not E-CELL-ANGLE-READ: " + name, () => {
      expect(codes(run(P(body)))).not.toContain("E-CELL-ANGLE-READ");
    });
  }
});
