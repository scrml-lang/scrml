// w-match-001-failing-s475.test.js — s475-boot-small-fixes item 1
// (g-boot-w-match-001-fires-on-failing-programs-s474).
//
// §18.6: "If the `else` arm is unreachable (all variants are already covered by explicit arms),
// the compiler SHALL emit a warning (W-MATCH-001)." On a failable result `else` covers `.Ok` only
// (§19.7.1), so the warning says ".Ok and every error variant already have an arm". Before this
// fix analyze.scrml counted arms written AFTER the `else` (each already E-SYNTAX-010) and arms
// whose pattern was recovered from a parse error (`.Ok(true)` read as `.Ok()`) as covering, so the
// warning fired on programs that already fail, and its message was false there.
// Now W-MATCH-001 reads only the arms BEFORE the wildcard, and never when one of them drew an Error.
// "red on base" = failed on origin/main be56b6dad.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const AUTH = `    type AuthErr:enum = { Denied, Locked }
    function check(p: string)! AuthErr {
        if (p == "locked") fail AuthErr.Locked;
        if (p != "secret") fail AuthErr.Denied;
        return true;
    }`;
const P = (fns) => `<program>\n    let <msg:string=""/>\n${AUTH}\n${fns}\n    function login() {\n        @msg = "x";\n    }\n    <main>\n        <button onclick=login()>go</button>\n        <p id="msg">\${@msg}</p>\n    </main>\n</program>\n`;
const A = (arms) => P(`    function a(p: string) -> string {\n        return match check(p) { ${arms} };\n    }`);
const codes = (src) => frontEnd(mods, [{ path: "t.scrml", src }]).diags.map((d) => d.code);

describe("W-MATCH-001 counts only the arms before the wildcard (§18.6)", () => {
  test("error arms written AFTER the `else`: E-SYNTAX-010 twice, no W-MATCH-001 (red on base)", () => {
    expect(codes(A(`.Ok(v) :> "IN", else :> "LOGGED IN", .Locked :> "l", .Denied :> "d"`))).toEqual(["E-SYNTAX-010", "E-SYNTAX-010"]);
  });
  test("one error arm after the `else`: E-SYNTAX-010, no W-MATCH-001 (red on base)", () => {
    expect(codes(A(`.Ok(v) :> "IN", .Locked :> "l", else :> "LOGGED IN", .Denied :> "d"`))).toEqual(["E-SYNTAX-010"]);
  });
  test("a recovered `.Ok(true)` pattern before the `else`: no W-MATCH-001 (red on base)", () => {
    const c = codes(A(`.Ok(true) :> "T", .Locked :> "l", .Denied :> "d", else :> "F"`));
    expect(c).not.toContain("W-MATCH-001");
    expect(c).toContain("E-PARSE-ARM");
  });
  test("a recovered `.Ok(.A)` nested pattern before the `else`: no W-MATCH-001 (red on base)", () => {
    const c = codes(A(`.Ok(.A) :> "A", .Locked :> "l", .Denied :> "d", else :> "B?"`));
    expect(c).not.toContain("W-MATCH-001");
    expect(c).toContain("E-SYNTAX-012");
  });
  test("valid program: `.Ok(v)` and every error before the `else` still warns (green on both)", () => {
    expect(codes(A(`.Ok(v) :> "IN", .Locked :> "l", .Denied :> "d", else :> "LOGGED IN"`))).toEqual(["W-MATCH-001"]);
  });
  test("valid program, `_` alias: still warns (green on both)", () => {
    expect(codes(A(`.Ok(v) :> "IN", .Denied :> "d", .Locked :> "l", _ :> "?"`))).toEqual(["W-MATCH-001"]);
  });
});

// s475 r1 (review F2): only a PATTERN error silences W-MATCH-001 — an Error in an arm's BODY says
// nothing about which variants the arms cover. "red on 317d02879" = failed on PR #1755's head before
// r1, which read every diagnostic of the arm, body included.
const AUTH2 = `    type AuthErr:enum = { Denied(reason: string), Locked }
    function check(p: string)! AuthErr {
        if (p == "locked") fail AuthErr.Locked;
        if (p != "secret") fail AuthErr.Denied("no");
        return true;
    }`;
const A2 = (arms) => `<program>\n    let <msg:string=""/>\n${AUTH2}\n    function a(p: string) -> string {\n        return match check(p) { ${arms} };\n    }\n    function login() {\n        @msg = "x";\n    }\n    <main>\n        <button onclick=login()>go</button>\n        <p id="msg">\${@msg}</p>\n    </main>\n</program>\n`;
describe("W-MATCH-001: an Error in an arm body does not silence it (r1 F2)", () => {
  test("unknown name in an arm body before the `else`: E-SCOPE-001 AND W-MATCH-001 (red on 317d02879)", () => {
    expect(codes(A2(`.Ok(v) :> "IN", .Denied(r) :> nosuch, .Locked :> "l", else :> "X"`))).toEqual(["E-SCOPE-001", "W-MATCH-001"]);
  });
  test("same program without the body error: W-MATCH-001 only (green on both)", () => {
    expect(codes(A2(`.Ok(v) :> "IN", .Denied(r) :> r, .Locked :> "l", else :> "X"`))).toEqual(["W-MATCH-001"]);
  });
  test("a pattern error (wrong payload arity) before the `else` still silences it (green on both)", () => {
    const c = codes(A2(`.Ok(v) :> "IN", .Denied(r, q) :> r, .Locked :> "l", else :> "X"`));
    expect(c).toContain("E-TYPE-021");
    expect(c).not.toContain("W-MATCH-001");
  });
});
