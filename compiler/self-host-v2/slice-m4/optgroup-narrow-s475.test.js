// optgroup-narrow-s475.test.js — lane s475-boot-optgroup-narrow: SPEC §24.5 item 2 refused "an
// `<optgroup>` directly inside an `<option>` / `<optgroup>`" with no `<select>` condition. HTML
// §13.2.6.4.7 ("in body"), a start tag whose tag name is "optgroup":
//   "If the stack of open elements has a select element in scope: Generate implied end tags. …
//    Otherwise, if the current node is an option element, then pop the current node from the stack
//    of open elements."
// So an `<optgroup>` closes an open `<option>` always, but closes an open `<optgroup>` only with a
// `<select>` in scope. Measured in Chromium 152.0.7977.82 (`<template>` innerHTML, DOMParser and
// div.innerHTML agree):
//   <div><optgroup><optgroup>x</optgroup></optgroup></div>     → div(optgroup(optgroup("x")))   kept
//   <div><option><optgroup>x</optgroup></option></div>         → div(option,optgroup("x"))      repaired
//   <select><optgroup><optgroup>x</optgroup></optgroup></select>→ select(optgroup,optgroup("x")) repaired
//   <select><option><optgroup>x</optgroup></option></select>   → select(option,optgroup("x"))   repaired
//   <select><optgroup><div><optgroup>x</optgroup></div></optgroup></select> → kept (not direct)
//   <div><option><hr></option></div> → div(option(hr)) kept; <select><option><hr></option></select> → select(option,hr)
// Direction of change: newly-accepting (only `<optgroup>` directly in `<optgroup>` with no `<select>`
// in scope); every other verdict is unchanged.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { gateProgram } from "./foreign-content-fixtures.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const REP = "E-HTML-PARSER-REPAIR";
const run = (markup) => frontEnd(mods, [{ path: "app.scrml", src: gateProgram(markup) }]);
const codes = (markup) => run(markup).diags.filter((d) => d.code.startsWith("E-")).map((d) => d.code);

describe("an `<optgroup>` directly inside an `<optgroup>` is refused only with a `<select>` in scope", () => {
  test("outside a `<select>`: accepted, and the emitted HTML keeps the nesting as written (red on base)", () => {
    const r = run(`<optgroup label="a"><optgroup label="b"><option>x</option></optgroup></optgroup>`);
    expect(r.diags.filter((d) => d.code.startsWith("E-")).map((d) => d.code)).toEqual([]);
    const html = mods.print.printProgram(r.core, "app.client.js", "scrml-runtime.js").html;
    expect(html).toMatch(/<optgroup label="a"><optgroup label="b"><option>x<\/option><\/optgroup><\/optgroup>/);
  });

  test("outside a `<select>`, in a `<div>`: accepted (red on base)", () => {
    expect(codes(`<div><optgroup><optgroup>x</optgroup></optgroup></div>`)).toEqual([]);
  });

  test("inside a `<select>`: still refused, same code", () => {
    expect(codes(`<select><optgroup><optgroup><option>x</option></optgroup></optgroup></select>`)).toEqual([REP]);
    expect(codes(`<select><div><optgroup><optgroup>x</optgroup></optgroup></div></select>`)).toEqual([REP]);
  });

  test("inside a `<select>`, not directly: kept as written, accepted", () => {
    expect(codes(`<select><optgroup><div><optgroup>x</optgroup></div></optgroup></select>`)).toEqual([]);
  });

  test("a `<td>` bounds the `<select>` scope: accepted", () => {
    expect(codes(`<select><table><tbody><tr><td><optgroup><optgroup>x</optgroup></optgroup></td></tr></tbody></table></select>`)).toEqual([]);
  });
});

describe("an `<optgroup>` directly inside an `<option>` stays refused both ways", () => {
  test("outside a `<select>`", () => expect(codes(`<div><option><optgroup>x</optgroup></option></div>`)).toEqual([REP]));
  test("inside a `<select>`", () => expect(codes(`<select><option><optgroup>x</optgroup></option></select>`)).toEqual([REP]));
});

describe("the `<hr>` bullet is unchanged", () => {
  test("inside a `<select>`: refused", () => {
    expect(codes(`<select><option>a<hr/></option></select>`)).toEqual([REP]);
    expect(codes(`<select><optgroup><hr/></optgroup></select>`)).toEqual([REP]);
  });
  test("outside a `<select>`: accepted", () => {
    expect(codes(`<div><option>a<hr/></option></div>`)).toEqual([]);
    expect(codes(`<div><optgroup><hr/></optgroup></div>`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------
// r1 (review of #1769, F1): the narrowing let `<optgroup><optgroup>` at the root of a template that is
// PLACED inside a `<select>` compile. The DOM is then select > … optgroup > optgroup > option, built as
// written by DOM calls, and the inner option is not in `select.options` (Chromium 152, review opts.mjs:
// options.length 1, the value cannot be set) — a silent dead option. A content-model rule, its own code;
// INTERIM (the capable form is a general content-model check across composition).
const NEST = "E-HTML-OPTGROUP-NESTED";
const X = `<optgroup label="a"><optgroup label="b"><option>x</option></optgroup></optgroup>`;
const G = `if=(@pw == "secret")`;
const runT = (markup, top) => frontEnd(mods, [{ path: "app.scrml", src: gateProgram(markup, top) }]);
const codesT = (markup, top = "") => runT(markup, top).diags.filter((d) => d.code.startsWith("E-")).map((d) => d.code);
const GRP = `    <grp n:int/>\n    renders ${X}`;
const ONE = `    <grp n:int/>\n    renders <optgroup label="b"><option>x</option></optgroup>`;

describe("r1 F1: an `<optgroup>` in an `<optgroup>` placed inside a `<select>` across a template boundary is refused", () => {
  test("E1 a component whose renders nest groups, used in a `<select>` (red on #1769 head)", () => {
    const e = runT(`<select><grp n=1/></select>`, GRP).diags.filter((d) => d.code.startsWith("E-"));
    expect(e.map((d) => d.code)).toEqual([NEST]);
    expect(e[0].message).toContain("`<grp>` is used inside a `<select>`");
  });
  test("E2 an `if=` arm", () => {
    expect(codesT(`<select><optgroup label="a" ${G}><optgroup label="b"><option>x</option></optgroup></optgroup></select>`)).toEqual([NEST]);
  });
  test("E3 an `<each>` row", () => {
    expect(codesT(`<select><each in=@ws as w><optgroup label="a"><optgroup label="b"><option>\${w}</option></optgroup></optgroup></each></select>`)).toEqual([NEST]);
  });
  test("E4 a `for … lift` row", () => {
    expect(codesT(`<select>\${ for (w of @ws) { lift <optgroup label="a"><optgroup label="b"><option>\${w}</option></optgroup></optgroup>; } }</select>`)).toEqual([NEST]);
  });
  test("E7 slot content filled into a `<slot/>` that sits in a `<select>`", () => {
    expect(codesT(`<frame n=1>${X}</frame>`, `    <frame n:int/>\n    renders <select><slot/></select>`)).toEqual([NEST]);
  });
  test("E8 a component whose root `<optgroup>` sits in a static `<optgroup>` of a `<select>` (accepted on base too)", () => {
    expect(codesT(`<select><optgroup label="a"><grp n=1/></optgroup></select>`, ONE)).toEqual([NEST]);
  });
  test("an arm `<optgroup>` directly in a static `<optgroup>` of a `<select>`", () => {
    expect(codesT(`<select><optgroup label="a"><optgroup label="b" ${G}><option>x</option></optgroup></optgroup></select>`)).toEqual([NEST]);
  });
  test("a use of a use: the placement crosses both", () => {
    expect(codesT(`<select><outer n=1/></select>`, `${GRP}\n    <outer n:int/>\n    renders <grp n=1/>`)).toEqual([NEST]);
  });
});

describe("r1 F1: what stays accepted", () => {
  test("static `<div><optgroup><optgroup>`, no `<select>` anywhere", () => {
    expect(codesT(`<div>${X}</div>`)).toEqual([]);
  });
  test("a component with nested groups used outside any `<select>`", () => {
    expect(codesT(`<div><grp n=1/></div>`, GRP)).toEqual([]);
  });
  test("an arm / row of nested groups outside any `<select>`", () => {
    expect(codesT(`<div><optgroup label="a" ${G}><optgroup label="b">x</optgroup></optgroup></div>`)).toEqual([]);
    expect(codesT(`<div><each in=@ws as w>${X}</each></div>`)).toEqual([]);
  });
  test("slot content of a `<slot/>` in no `<select>`", () => {
    expect(codesT(`<frame n=1>${X}</frame>`, `    <frame n:int/>\n    renders <div><slot/></div>`)).toEqual([]);
  });
  test("a `<td>` between the `<select>` and the placement bounds it", () => {
    expect(codesT(`<select><table><tbody><tr><td><grp n=1/></td></tr></tbody></table></select>`, GRP)).toEqual([]);
  });
  test("one group per level, placed in a `<select>`: accepted", () => {
    expect(codesT(`<select><each in=@ws as w><optgroup label="a"><option>\${w}</option></optgroup></each></select>`)).toEqual([]);
    expect(codesT(`<select><grp n=1/></select>`, ONE)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------
// r1 (review F2): with a `<select>` in scope, an `<optgroup>` / `<hr>` start tag "generates implied end
// tags" (pops an open dd dt li optgroup option p rb rp rt rtc), an `<option>` the same except optgroup
// (HTML §13.2.6.4.7). Measured Chromium 152.0.7977.82 (template innerHTML vs the same markup as XML):
//   <select><optgroup><p><optgroup>        → select(optgroup(p),optgroup,p)       repaired
//   <select><optgroup><li><optgroup>       → select(optgroup(li),optgroup)        repaired
//   <select><optgroup><dt><optgroup>       → select(optgroup(dt),optgroup)        repaired
//   <select><optgroup><ruby><rt><optgroup> → select(optgroup(ruby(rt,optgroup)))  repaired
//   <select><option><p><optgroup>          → select(option(p),optgroup,p)         repaired
//   <select><option><li><hr>               → select(option(li),hr)                repaired
//   <select><option><li><option>           → select(option(li),option)            repaired
//   <select><p><option> / <select><li><option> / <select><optgroup><p><option>    repaired
//   <select><optgroup><option> / <select><optgroup><span><optgroup> / <select><optgroup><div><option> kept
//   <div><optgroup><p><optgroup> / <div><option><li><option> / <div><li><hr>     kept (no select)
//   <select><table>…<td><p><option>                                              kept (td bounds it)
describe("r1 F2: implied end tags with a `<select>` in scope", () => {
  const refused = [
    `<select><optgroup label="a"><p><optgroup label="b"><option>x</option></optgroup></p></optgroup></select>`,
    `<select><optgroup label="a"><li><optgroup label="b"><option>x</option></optgroup></li></optgroup></select>`,
    `<select><optgroup label="a"><dt><optgroup label="b"><option>x</option></optgroup></dt></optgroup></select>`,
    `<select><optgroup label="a"><ruby><rt><optgroup label="b">x</optgroup></rt></ruby></optgroup></select>`,
    `<select><option><p><optgroup label="b">x</optgroup></p></option></select>`,
    `<select><option><li><hr/></li></option></select>`,
    `<select><option><li><option>y</option></li></option></select>`,
    `<select><p><option>x</option></p></select>`,
    `<select><li><option>x</option></li></select>`,
    `<select><optgroup><p><option>x</option></p></optgroup></select>`,
  ];
  for (const m of refused) test(`refused: ${m}`, () => expect(codes(m)).toEqual([REP]));
  const kept = [
    `<select><optgroup><option>x</option></optgroup></select>`,
    `<select><optgroup><span><optgroup>x</optgroup></span></optgroup></select>`,
    `<select><optgroup><div><option>x</option></div></optgroup></select>`,
    `<div><optgroup><p><optgroup>x</optgroup></p></optgroup></div>`,
    `<div><option><li><option>y</option></li></option></div>`,
    `<div><li><hr/></li></div>`,
    `<select><table><tbody><tr><td><p><option>x</option></p></td></tr></tbody></table></select>`,
  ];
  for (const m of kept) test(`kept: ${m}`, () => expect(codes(m)).toEqual([]));
});
