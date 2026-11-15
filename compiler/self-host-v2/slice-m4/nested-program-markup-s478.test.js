// nested-program-markup-s478.test.js — s478 (lane s478-boot-parser-smalls, triage cluster C15): a
// `<program>` nested THROUGH MARKUP gets the §4.12.2 nested-program diagnostics.
//
// §4.12: "A `<program>` element MAY appear as a child of another `<program>` element — directly or
// through intervening markup"; "a `<program>` inside another `<program>` or inside a `<page>` is
// nested however much markup sits between them (so `auth=` on it is `E-PROGRAM-NESTED-AUTH`,
// §4.12.2)". §4.12.2: every application-level attribute on a nested program "SHALL be a compile
// error on a nested `<program>` (`E-PROGRAM-NESTED-ATTR`), once per offending attribute". §34
// E-PROGRAM-NESTED-AUTH: it "is that declaration's only diagnostic".
//
// Before s478 the parser refused any `<program>` inside markup as E-PARSE-PROGRAM, so a
// `<div>`-wrapped worker never reached the §4.12.2 checks (g-boot-nested-program-workers-unbuilt-s473
// keeps the workers themselves unbuilt: a well-formed nested program is still refused by name).
// Also s478: a nested program that §4.12.2 already rejects gets no refusal beside its error.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);

const wrapped = (attrs, outer = "program") => `<${outer}>\n<p>app</p>\n<div>\n<section>\n<program name="w" ${attrs}>\n<p>w</p>\n</program>\n</section>\n</div>\n</${outer}>\n`;

describe("§4.12 — a `<program>` inside markup inside a `<program>` is NESTED", () => {
  test("`auth=` → E-PROGRAM-NESTED-AUTH, the site's one diagnostic (no E-PARSE-PROGRAM, no refusal)", () => {
    expect(codes(wrapped(`auth="required"`))).toEqual(["E-PROGRAM-NESTED-AUTH"]);
  });

  test("application-level attributes → E-PROGRAM-NESTED-ATTR once each", () => {
    expect(codes(wrapped(`ratelimit="1/min" headers="strict"`))).toEqual(["E-PROGRAM-NESTED-ATTR", "E-PROGRAM-NESTED-ATTR"]);
  });

  test("session attributes → E-PROGRAM-NESTED-SESSION", () => {
    expect(codes(wrapped(`sessionExpiry="1h"`))).toEqual(["E-PROGRAM-NESTED-SESSION"]);
  });

  test("a well-formed nested program is refused by name (workers are not in the bootstrap)", () => {
    const d = run(wrapped(`restart="on-error" max-restarts=3 within=60`)).diags;
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(d[0].message).toContain("nested `<program>`");
  });

  test("a markup-wrapped program inside a nested program is walked too", () => {
    const src = `<program>\n<program name="a">\n<div><program name="b" auth="none"></program></div>\n</program>\n</program>\n`;
    expect(codes(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-PROGRAM-NESTED-AUTH"]);
  });

  test("at the file top level a `<div>`-wrapped `<program>` stays refused (E-PARSE-PROGRAM, as before)", () => {
    const cs = codes(`<div>\n<program>\n<p>x</p>\n</program>\n</div>\n`);
    expect(cs).toContain("E-PARSE-PROGRAM");
    expect(cs).not.toContain("E-PROGRAM-NESTED-AUTH");
  });
});
