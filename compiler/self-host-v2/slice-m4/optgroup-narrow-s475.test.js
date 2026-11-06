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
