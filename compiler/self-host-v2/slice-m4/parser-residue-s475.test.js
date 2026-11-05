// parser-residue-s475.test.js — s475-boot-parser-residue item 2 (g-boot-parser-restructure-residue-s474):
// markup the HTML parser restructures that the S474 analyzer did not model. Each was caught only at run
// time by the shape check (SPEC §24.5 item 3): the template was not mounted, which fails closed but can
// blank the page. SPEC §24.5: "Markup the parser restructures can never appear on the page as written,
// so a compiler cannot give it its written meaning. … So such markup SHALL be a compile error."
//
// Every refused shape below, and every guard, was measured in Chromium 152 (a `<template>`'s content
// parsed by the browser vs. the same markup parsed as XML — the tree as written; the s475 probe, see
// docs/changes/s475-boot-parser-residue/progress.md). The refused shapes compile clean on base.
//   - the customizable-`<select>` rules: an `<input>` / `<select>` with a `<select>` in scope closes it;
//     an `<hr>` directly in an `<option>` / `<optgroup>` of a `<select>` closes them;
//   - a table part (`td` `th` `tr` `tbody` `thead` `tfoot` `caption` `col` `colgroup`) outside its
//     table part: dropped ("in body"), or it closes an open cell / caption — `<td><td>` included;
//   - a template's ROOT: its first element sets the "in template" mode; a later root table part of
//     another kind is dropped or wrapped; after a root `<col>` every other element / text is dropped; a
//     `<table>` outside a cell in a table-mode template is dropped;
//   - `<plaintext>` (no end tag: the rest of the template becomes its text);
//   - `<*x/>` (§66.6.2): the shared instance's renders and a graph field's state-child bodies in a
//     foreign context; a child field's inlined `renders` in this template's context.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { gateProgram } from "./foreign-content-fixtures.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const S = `show=(@pw == "secret")`;
const errs = (markup, top = "") => frontEnd(mods, [{ path: "app.scrml", src: gateProgram(markup, top) }]).diags.filter((d) => d.code.startsWith("E-"));
const codes = (markup, top) => errs(markup, top).map((d) => d.code);
const BRK = "E-HTML-FOREIGN-BREAKOUT";
const REP = "E-HTML-PARSER-REPAIR";

describe("the customizable-`<select>` rules (red on base)", () => {
  const REPROS = {
    selectInput: `<select><input/></select><span ${S}>SECRET</span>`,
    selectDivInput: `<select><div><span><input/></span></div></select>`,
    selectButtonInput: `<select><button><input/></button></select>`,
    selectLabelInput: `<select><label><input/></label></select>`,
    selectOptionInput: `<select><option><input/></option></select>`,
    selectSelect: `<select><select></select></select>`,
    selectOptionSelect: `<select><option><select></select></option></select>`,
    optgroupHr: `<select><optgroup><hr/></optgroup></select>`,
    optionHr: `<select><option>a<hr/></option></select>`,
    optgroupOptionHr: `<select><optgroup><option>a<hr/></option></optgroup></select>`,
  };
  for (const [name, markup] of Object.entries(REPROS)) test(name, () => expect(codes(markup)).toEqual([REP]));

  test("the message names the change", () => {
    const m = errs(`<select><input/></select>`)[0].message;
    expect(m).toContain("CLOSES the `<select>`");
    expect(m).toContain("SPEC §24.5");
  });

  test("guards — what Chromium keeps in a `<select>` compiles clean", () => {
    for (const m of [
      `<select><div>x</div><span>y</span><textarea>t</textarea><button>b</button><option>a</option></select>`,
      `<select><option>a</option><hr/><optgroup><option>b</option></optgroup></select>`,   // an `<hr>` between options
      `<select><option><div><hr/></div></option></select>`,
      `<select><table><tbody><tr><td><input/></td></tr></tbody></table></select>`,         // td bounds the scope
      `<select><object><input/></object></select>`,
      `<select><svg><foreignObject><input/></foreignObject></svg></select>`,
      `<select><option>a</option></select><input/>`,
      `<option><input/></option>`,                                                          // no select open
      `<option><hr/></option>`,
      `<select><option if=(@pw == "x")><input/></option></select>`,                        // an arm is its own template
    ]) expect({ m, c: codes(m) }).toEqual({ m, c: [] });
  });
});

describe("a table part outside its table part (red on base)", () => {
  const REPROS = {
    tdTd: `<table><tbody><tr><td><td>x</td></td></tr></tbody></table><span ${S}>SECRET</span>`,
    tdDivTd: `<table><tbody><tr><td><div><td>x</td></div></td></tr></tbody></table>`,
    tdTh: `<table><tbody><tr><td><th>x</th></td></tr></tbody></table>`,
    tdTr: `<table><tbody><tr><td><div><tr></tr></div></td></tr></tbody></table>`,
    tdForeignTd: `<table><tbody><tr><td><svg><foreignObject><td>x</td></foreignObject></svg></td></tr></tbody></table>`,
    divTd: `<div><td>x</td></div>`,
    spanThead: `<span><thead></thead></span>`,
    pCol: `<p><col/></p>`,
    captionTr: `<table><caption><tr></tr></caption></table>`,
    captionCaption: `<table><caption><caption>c</caption></caption></table>`,
    selectTd: `<select><td>x</td></select>`,
    miTd: `<math><mi><td>x</td></mi></math>`,
  };
  for (const [name, markup] of Object.entries(REPROS)) test(name, () => expect(codes(markup)).toEqual([REP]));

  test("guards — a table part inside its table part, a nested table in a cell", () => {
    for (const m of [
      `<table><caption>c</caption><colgroup><col/></colgroup><thead><tr><th>h</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table>`,
      `<table><tbody><tr><td><table><tbody><tr><td>x</td></tr></tbody></table></td></tr></tbody></table>`,
      `<table><caption><div>x</div></caption></table>`,
      `<svg><td></td></svg>`,                                                                // an SVG element named td
      `<div><template><td>x</td></template></div>`,                                          // template content: its own root
    ]) expect({ m, c: codes(m) }).toEqual({ m, c: [] });
  });
});

describe("a template's root — its first element sets the mode (red on base)", () => {
  const row = (body) => `<table><tbody><each in=@ws as w>${body}</each></tbody></table>`;
  const REPROS = {
    trThenTd: row(`<tr><td>\${w}</td></tr><td>s</td>`),
    trThenCaption: row(`<tr><td>\${w}</td></tr><caption>c</caption>`),
    trThenNestedTable: row(`<tr><td>\${w}</td></tr><div><span><table></table></span></div>`),
    tdThenTr: `<table><tbody><tr><each in=@ws as w><td>\${w}</td><tr></tr></each></tr></tbody></table>`,
    spanThenTd: `<div><each in=@ws as w><span>\${w}</span><td>x</td></each></div>`,
    captionThenCol: `<table><each in=@ws as w><caption>c</caption><col/></each></table>`,
    colThenSpan: `<table><colgroup><each in=@ws as w><col/><span>x</span></each></colgroup></table>`,
    colThenText: `<table><colgroup><each in=@ws as w><col/>x</each></colgroup></table>`,
  };
  for (const [name, markup] of Object.entries(REPROS)) test(name, () => expect(codes(markup)).toEqual([REP]));

  test("guards — a root of one table kind, and non-table elements after a table root", () => {
    for (const m of [
      row(`<tr><td>\${w}</td></tr><tr><td>s</td></tr>`),
      row(`<tr><td>\${w}</td></tr><div><form></form><input/></div>`),
      `<table><tbody><tr><each in=@ws as w><td>\${w}</td><th>h</th></each></tr></tbody></table>`,
      `<table><each in=@ws as w><caption>c</caption><colgroup><col/></colgroup><tbody><tr><td>x</td></tr></tbody></each></table>`,
      `<table><colgroup><each in=@ws as w><col/> <col/></each></colgroup></table>`,
      `<table><tbody><tr><td><form></form><table></table></td></tr></tbody></table>`,
    ]) expect({ m, c: codes(m) }).toEqual({ m, c: [] });
    expect(codes(`<table><tbody><row n=1/></tbody></table>`, `    <row n:int/>\n    renders <tr><td>r</td></tr>`)).toEqual([]);
  });
});

describe("`<plaintext>` — no end tag (red on base)", () => {
  test("refused", () => expect(codes(`<div><plaintext>x</plaintext></div><span ${S}>SECRET</span>`)).toEqual([REP]));
});

describe("`<*x/>` — the renders it shows, judged where they are shown (red on base)", () => {
  const BADGE = (r) => `    <badge n:int=1/>\n    renders ${r}`;
  const PHASE = (idle) => `    type Phase:enum = { Idle, Done }\n    <phase:Phase=.Idle single>\n        <Idle rule=.Done>${idle}</>\n        <Done rule=.Idle><text>d</text></>\n    </>`;
  const FIELD = (fr, r) => `    <signup:struct>\n        let <email:string=""/>\n        renders ${fr}\n    </>\n    renders ${r}`;

  test("the shared instance in `<svg>`: its `<p>` breaks out — reported at the `<*x/>`", () => {
    const e = errs(`<svg><*badge/></svg>`, BADGE(`<p>b</p>`));
    expect(e.map((d) => d.code)).toEqual([BRK]);
    expect(e[0].message).toContain("`<*badge/>` is rendered inside SVG content");
  });
  test("the shared instance in `<math>`", () => expect(codes(`<math><*badge/></math>`, BADGE(`<div>b</div>`))).toEqual([BRK]));
  test("a graph field's state-child body in `<svg>`", () => expect(codes(`<svg><*phase/></svg>`, PHASE(`<p>x</p>`))).toEqual([BRK]));
  test("a child field's inlined renders: a `<div>` in the `<p>` the `<*email/>` stands in", () => {
    const e = errs(`<*signup/>`, FIELD(`<div>e</div>`, `<form><p><*email/></p></form>`));
    expect(e.map((d) => d.code)).toEqual([REP]);
    expect(e[0].message).toContain("`<*email/>` is rendered here");
  });
  test("a child field's inlined renders in `<svg>`", () => expect(codes(`<*signup/>`, FIELD(`<p>e</p>`, `<form><svg><*email/></svg></form>`))).toEqual([BRK]));
  test("a child field's inlined `<input>` in a `<select>`", () => expect(codes(`<*signup/>`, FIELD(`<input/>`, `<form><select><*email/></select></form>`))).toEqual([REP]));

  test("guards — markup that holds where it is shown; a fault of the markup itself is reported once, at its own site", () => {
    expect(codes(`<svg><*badge/></svg>`, BADGE(`<g><text>b</text></g>`))).toEqual([]);
    expect(codes(`<svg><foreignObject><*badge/></foreignObject></svg>`, BADGE(`<p>b</p>`))).toEqual([]);
    expect(codes(`<div><*badge/></div>`, BADGE(`<p>b</p>`))).toEqual([]);
    expect(codes(`<svg><*phase/></svg>`, PHASE(`<text>x</text>`))).toEqual([]);
    expect(codes(`<p><*phase/></p>`, PHASE(`<div>x</div>`))).toEqual([]);                // an arm is its own template
    expect(codes(`<*signup/>`, FIELD(`<span>e</span>`, `<form><p><*email/></p></form>`))).toEqual([]);
    expect(codes(`<*signup/>`, FIELD(`<p><div>e</div></p>`, `<form><*email/></form>`))).toEqual([REP]);
  });
});
