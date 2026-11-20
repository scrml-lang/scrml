// endpoint-opener-s480.test.js — s480-boot-endpoint-opener: SPEC §61.2 "The opener is read whole",
// in the bootstrap (parse.scrml endpointItem), matching impl#1's reader (compiler/src/ast-builder.js
// readEndpointOpenerAttrs). The S239 review of #2007 found the bootstrap compiling
// `<endpoint path="/a" method='GET' accepts=Op>` (a `'…'` value) and
// `<endpoint … accepts=Op /* cors="*" */>` (a comment the bare value's lexer absorbed) with no error.
//
// §61.2: "an attribute string is `"…"` only (§4.18.3). A character that reader drops (a `'`, a
// backtick, a `{…}` / `${…}` block or a comment with no attribute name, a value it cannot read) or a
// stray `=` / value is `E-ATTR-001` at that character, never skipped … A second `path=` is
// `E-ENDPOINT-PATH-INVALID`, a second `method=` `E-ENDPOINT-METHOD-INVALID`, a second `accepts=`
// `E-ENDPOINT-ACCEPTS-MISSING` … a `path=` / `method=` / `accepts=` / `cors=` written with no value,
// or with a value that is not its production's form, is that attribute's code."
// §61.7: "A `path=` SHALL be an absolute path: it begins with `/`" (an empty `path=""` compiled).

import { describe, test, expect, beforeAll } from "bun:test";
import { mods } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

beforeAll(() => { mods(); }, { timeout: 300000 });

const errs = (src) => frontEnd(mods(), [{ path: "app.scrml", src }], "app.scrml").diags.filter((d) => d.severity === "Error");
const codes = (src) => [...new Set(errs(src).map((d) => d.code))].sort();
const prog = (attrs) => `<program>\n\${\n  type Op:enum = {\n    Ping\n  }\n}\n<endpoint ${attrs}>\n  <Ping : { pong: true }>\n</endpoint>\n<p>hi</p>\n</program>\n`;
// the source text each E-ATTR-001 is reported at
const attr001At = (attrs) => {
  const src = prog(attrs);
  return errs(src).filter((d) => d.code === "E-ATTR-001").map((d) => src.slice(d.span.start, d.span.start + 2));
};

describe("§61.2 — a character the markup attribute reader drops is E-ATTR-001, never read", () => {
  test("a `'…'` value: `method='GET'` / `path='/b'` / `accepts='Op'` (it compiled, the `'`-string read as the value)", () => {
    expect(codes(prog(`path="/a" method='GET' accepts=Op`))).toEqual(["E-ATTR-001", "E-ENDPOINT-METHOD-INVALID"]);
    expect(codes(prog(`path='/b' method="POST" accepts=Op`))).toEqual(["E-ATTR-001", "E-ENDPOINT-PATH-MISSING"]);
    expect(codes(prog(`path="/a" method="POST" accepts='Op'`))).toEqual(["E-ATTR-001", "E-ENDPOINT-ACCEPTS-MISSING"]);
    expect(attr001At(`path="/a" method='GET' accepts=Op`)).toEqual(["'G"]);
  });

  test("a comment in the opener: `accepts=Op /* cors=\"*\" */` (it compiled), `// …`, `<!-- … -->`", () => {
    expect(codes(prog(`path="/a" method="POST" accepts=Op /* cors="*" */`))).toEqual(["E-ATTR-001"]);
    expect(attr001At(`path="/a" method="POST" accepts=Op /* cors="*" */`)).toEqual(["/*"]);
    expect(codes(prog(`path="/a" method="POST" accepts=Op/* x */`))).toEqual(["E-ATTR-001"]);
    expect(attr001At(`path="/a" /* x */ method="POST" accepts=Op`)).toEqual(["/*"]);
    expect(attr001At(`path="/a" method="POST" <!-- x --> accepts=Op`)).toEqual(["<!"]);
  });

  test("a backtick and a `{…}` / `${…}` block with no attribute name", () => {
    expect(attr001At("path=\"/a\" method=\"POST\" accepts=Op note=`x`")).toEqual(["`x"]);
    expect(attr001At(`path="/a" method="POST" accepts=Op \${ cors="*" }`)).toEqual(["\${"]);
    expect(attr001At(`{ x } path="/a" method="POST" accepts=Op`)).toEqual(["{ "]);
  });

  test("text inside a `'…'` run is not read as the endpoint's own attribute", () => {
    // impl#1 before #1998 r2: `note='x' path="/b"` / `note='x cors="*" y'` configured the route
    expect(attr001At(`path="/a" method="POST" accepts=Op note='x path="/b" y'`)).toEqual(["'x"]);
    expect(codes(prog(`path="/a" method="POST" accepts=Op note='x path="/b" y'`))).toEqual(["E-ATTR-001", "E-ENDPOINT-ATTR-INVALID"]);
  });

  test("not dropped: a `\"…\"` string, a `{…}` / `${…}` / `(…)` value, quotes and comments inside one", () => {
    expect(codes(prog(`path="/a" method=GET accepts=Op`))).toEqual([]);
    expect(codes(prog(`path="/a" method="POST" accepts=Op note="it's /* fine */"`))).toEqual(["E-ENDPOINT-ATTR-INVALID"]);
    expect(attr001At(`path="/a" method="POST" accepts=Op note=\${"x"}`)).toEqual([]);
    expect(attr001At(`path="/a" method="POST" accepts=Op note=f('x')`)).toEqual([]);
    expect(attr001At(`path="/a" method="POST" accepts=Op note={ 'x' }`)).toEqual([]);
  });
});

describe("§61.2 — a stray value, a repeated attribute, a value not of its production's form", () => {
  test("a validator call (`req(x)`) is a value with no `name=` — E-ATTR-001 (as impl#1), not E-ENDPOINT-ATTR-INVALID", () => {
    expect(codes(prog(`path="/a" method="POST" accepts=Op req(x)`))).toEqual(["E-ATTR-001"]);
  });

  test("a second path= / method= / accepts= is that attribute's code (was E-BOOTSTRAP-UNSUPPORTED)", () => {
    expect(codes(prog(`path="/a" path="/b" method="POST" accepts=Op`))).toEqual(["E-ENDPOINT-PATH-INVALID"]);
    expect(codes(prog(`path="/a" method="POST" method=GET accepts=Op`))).toEqual(["E-ENDPOINT-METHOD-INVALID"]);
    expect(codes(prog(`path="/a" method="POST" accepts=Op accepts=Op`))).toEqual(["E-ENDPOINT-ACCEPTS-MISSING"]);
  });

  test("path= not a string literal is E-ENDPOINT-PATH-MISSING; accepts= not a bare name is E-ENDPOINT-ACCEPTS-MISSING (were E-BOOTSTRAP-UNSUPPORTED)", () => {
    expect(codes(prog(`path=p method="POST" accepts=Op`))).toEqual(["E-ENDPOINT-PATH-MISSING"]);
    expect(codes(prog(`path="/a" method="POST" accepts=Op.Ping`))).toEqual(["E-ENDPOINT-ACCEPTS-MISSING"]);
  });

  test("§61.7: an empty `path=\"\"` is E-ENDPOINT-PATH-INVALID (it compiled)", () => {
    expect(codes(prog(`path="" method="POST" accepts=Op`))).toEqual(["E-ENDPOINT-PATH-INVALID"]);
  });

  test("a value the unquoted reader refused whole keeps its own code alone (no MISSING after it)", () => {
    expect(codes(prog(`path="/a" method="POST" accepts=Op -cors="*"`))).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
  });
});
