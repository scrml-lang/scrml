// parser-lows-fu-s482.test.js — s482-parser-lows-fu: the three LOWs of the #2083 review
// (~/.cache/scrml/review/s482-2083/review.md). All are diagnostics on programs that are
// already refused; nothing here changes what compiles.
//
// LOW-1 — markupValueOpens fired on any `{<letter`, so a legacy cell read `{<count>}`,
//   `{<count> == 1}`, `{ <n> < 2 }` were named "markup as an attribute value … `<errorBoundary
//   fallback=>`", and a component prop `header={<h1>…</h1>}` was attributed to errorBoundary.
//   Now: the value is markup only when its element CLOSES before the value's `}`; the
//   errorBoundary clause is given only for `fallback=`. RED ON BASE.
// LOW-2 — the value's end was found by counting raw braces, so a `}` in a quoted attribute
//   value, a `${ "}" }` slot or the body text ended it early (cascade: E-PARSE-TAG,
//   E-UNQUOTED-DISPLAY-TEXT, E-PARSE-CLOSER, E-PARSE-ITEM …). Now the lexer's element extent
//   (markupAttrValueExtentAt) finds it. RED ON BASE.
// LOW-3 — skippedDecls named call arguments (`extra(⏎ a = 1,⏎ b = 2⏎)`), a destructuring
//   default twice (`const { a = 1, b }`), object-literal lines and arrow-block lines as
//   keywordless bindings, and rendered `...e` as `. . .e`, `b: {…}` as `b :…`. RED ON BASE.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2 } from "../slice-m2/harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 180000 });

const run = (src) => frontEndStdlib(mods, [{ path: "s.scrml", src }], "s.scrml");
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (r) => errs(r).map((d) => d.code);
const P = (body) => `<program>\n${body}\n</program>\n`;
const MV = "markup as an attribute value";
const mvDiag = (r) => errs(r).find((d) => d.message.includes(MV));

describe("LOW-1 — only a closed element is a markup value; errorBoundary named only for `fallback=`", () => {
  test("a legacy cell read `{<count>}` / `{<count> == 1}` is not called a markup value", () => {
    const r = run(P(`    let <count:int=0/>\n    <p title={<count>}>x</p>\n    <p if={<count> == 1}>y</p>`));
    expect(codes(r).length).toBeGreaterThan(0);
    expect(mvDiag(r)).toBeUndefined();
    expect(errs(r).map((d) => d.message).join(" ")).not.toContain("errorBoundary");
  });

  test("`{ <n> < 2 }` is not called a markup value", () => {
    const r = run(P(`    let <n:int=1/>\n    <p title={ <n> < 2 }>x</p>`));
    expect(codes(r).length).toBeGreaterThan(0);
    expect(mvDiag(r)).toBeUndefined();
  });

  test("a component prop `header={<h1>Hi</h1>}` is a markup value, not errorBoundary's", () => {
    const src = P(`    <div header={<h1>Hi</h1>}>x</div>`);
    const r = run(src);
    const d = mvDiag(r);
    expect(d.code).toBe("E-BOOTSTRAP-UNSUPPORTED");
    expect(d.message).not.toContain("errorBoundary");
    expect(src.slice(d.span.start, d.span.end)).toBe(`{<h1>Hi</h1>}`);
  });

  test("`fallback=` keeps the errorBoundary attribution", () => {
    const r = run(P(`    <errorBoundary fallback={<div>x</>}>\n        <p>body</p>\n    </>`));
    expect(mvDiag(r).message).toContain("`<errorBoundary>`");
  });
});

describe("LOW-2 — a `}` inside the element does not end the value", () => {
  const EB = (fb) => `<program>\n    <errorBoundary fallback=${fb}>\n        <p>body</p>\n    </>\n    <footer>End</>\n</program>\n`;
  const cases = [
    ["a quoted attribute value", `{<div title="}">x</>}`],
    ["a single-quoted attribute value", `{<div title='}'>x</>}`],
    ["a `${ \"}\" }` slot", `{<div>\${ "}" } oops</>}`],
    ["body text after `//`", `{<div>x // }\n        y</>}`],
    ["an `<!-- } -->` comment", `{<div>x <!-- } --> y</>}`],
    ["a nested `{ {a:1} }` attribute", `{<div style={ {a:1} }>x</>}`],
    ["text after the closed element", `{<div>a</> extra}`],
  ];
  for (const [what, fb] of cases) {
    test(`${what}: one refusal over the whole value, no cascade`, () => {
      const src = EB(fb);
      const r = run(src);
      const d = mvDiag(r);
      expect(d.code).toBe("E-BOOTSTRAP-UNSUPPORTED");
      expect(src.slice(d.span.start, d.span.end)).toBe(fb);
      expect(codes(r).filter((c) => c.startsWith("E-PARSE") || c === "E-UNQUOTED-DISPLAY-TEXT" || c === "E-TYPE-045")).toEqual([]);
      expect(errs(r).map((x) => x.message).join(" ")).not.toContain("outside any `<program>`");
    });
  }

  test("an element never closed keeps the block reading (no runaway, no markup-value refusal)", () => {
    const r = run(`<program>\n    <errorBoundary fallback={<div>x</>\n        <p>body</p>\n    </>\n</program>\n`);
    expect(mvDiag(r)).toBeUndefined();
  });
});

describe("LOW-3 — skippedDecls names only declarations", () => {
  const msg = (body) => {
    const r = run(P(`    type A = number extra(\n${body}\n    )\n    <p>hi</p>`));
    expect(codes(r)).toEqual(["E-STMT-MISSING-SEMICOLON"]);
    return errs(r)[0].message;
  };

  test("multi-line call arguments `a = 1,` / `b = 2` are not bindings", () => {
    expect(msg(`        a = 1,\n        b = 2`)).not.toContain("are not declared");
  });

  test("a destructuring default is named once, with the pattern", () => {
    const m = msg(`        const { a = 1, b } = obj;\n        let { c = 2 } = o2;`);
    expect(m).toContain("the declarations in it (`const { a = 1, b }`, `let { c = 2 }`) are not declared");
  });

  test("`...e` and a nested pattern are rendered as written", () => {
    const m = msg(`        const { a = 1, b: { c } } = obj;\n        const [d = 2, ...e] = xs;`);
    expect(m).toContain("the declarations in it (`const { a = 1, b: … }`, `const [d = 2, ...e]`) are not declared");
  });

  test("an object-literal line `k = 1` inside `{ }` is not a binding", () => {
    const r = run(P(`    type A = number extra({\n        k = 1\n    })\n    <p>hi</p>`));
    expect(codes(r)).toEqual(["E-STMT-MISSING-SEMICOLON"]);
    expect(errs(r)[0].message).not.toContain("are not declared");
  });

  test("an arrow body line `tmp = v` is not a binding of the skipped text", () => {
    const r = run(P(`    type A = number extra(xs.map((v) => {\n        tmp = v\n    }))\n    <p>hi</p>`));
    expect(codes(r)).toEqual(["E-STMT-MISSING-SEMICOLON"]);
    expect(errs(r)[0].message).not.toContain("are not declared");
  });

  test("a `;`-terminated `y = 1;` in the group is still a binding", () => {
    expect(msg(`        y = 1;\n        const QQZ = 1;`)).toContain("the declarations in it (`y = …`, `const QQZ`) are not declared");
  });
});
