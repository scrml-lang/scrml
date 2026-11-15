// defer-arm-site-s478.test.js — s478 (lane s478-boot-parser-smalls, triage cluster C19): `defer` as
// the whole UNBRACED body of a match / `!{}` arm is E-DEFER-UNSUPPORTED-SITE.
//
// §34 E-DEFER-UNSUPPORTED-SITE (§19.16.2): "`defer` in a bare `{ }` block, a single-statement
// (unbraced) `match` / `!{}` arm, the unbraced body of an `if` / `else` / loop arm, or an arm of a
// value-producing `match` / `if` / `for` — not a stage-1 defer site". Before s478 the bootstrap read
// the arm `.A :> defer D("a;")` as an expression: E-SCOPE-001 "`defer` is not declared" plus
// E-PARSE-ARM "unexpected `D` in an arm".

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);

const P = (fns) => `<program>\n    type Mode:enum = { A, B }\n    let <trace:string=""/>\n    function D(s: string) {\n        @trace = @trace + s;\n    }\n${fns}\n    <p>\${@trace}</p>\n</program>\n`;

describe("§19.16.2 — an unbraced `defer` arm is not a defer site", () => {
  test("statement-position match: E-DEFER-UNSUPPORTED-SITE, the site's one diagnostic", () => {
    const src = P(`    function arm(m: Mode) {\n        match m {\n            .A :> defer D("a;"),\n            .B :> D("b;")\n        }\n    }`);
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["E-DEFER-UNSUPPORTED-SITE"]);
    expect(src.slice(r.diags[0].span.start, r.diags[0].span.end)).toBe("defer");
    expect(r.diags[0].message).toContain("§19.16.2");
  });

  test("the braced arm is a defer site (unchanged)", () => {
    expect(codes(P(`    function arm(m: Mode) {\n        match m {\n            .A :> { defer D("a;"); },\n            .B :> D("b;")\n        }\n    }`))).toEqual([]);
  });

  test("a `defer` block arm `defer { … }` is refused the same way", () => {
    expect(codes(P(`    function arm(m: Mode) {\n        match m {\n            .A :> defer { D("a;"); },\n            .B :> D("b;")\n        }\n    }`))).toEqual(["E-DEFER-UNSUPPORTED-SITE"]);
  });
});
