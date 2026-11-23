// e-type-044-wild-alt-s482.test.js — lane s482-place-fu, item 3 (#2078 review LOW-1).
//
// E-TYPE-044 (a `not` arm on a subject whose type does not include `| not`, §17.6 / §42.7) was silent
// for a `not` inside a WILDCARD alternation (`.A :> …, not | _ :> …`; `.A, .B | not | else`;
// `1, not | else`; `true, not | else`), while `.A | not :> …, else` reported it. #2078 keeps a wildcard
// alternation's alternates out of `notSeen` (right for W-MATCH-001), and that also hid the `not` from
// the FPlain notArm fact, E-TYPE-044's only input. That fact now reads `notNamed` (every `not` an arm
// names); `notSeen` — `maybe`, `absentDone`, W-MATCH-001 — is unchanged (restoring `notSeen = dNot`
// would turn `maybe` true on a subject that is not `| not`).

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const prog = (decls) => `<program>\n\${\n    type K:enum = { A, B, C, D }\n${decls}\n}\n</program>\n`;
const list = (arms) => arms.map((a) => "            " + a + ",").join("\n");
const pm = (ty, arms) => `    fn f(x: ${ty}) -> string {\n        return match x {\n${list(arms)}\n        };\n    }\n`;
const diags = (src) => frontEnd(mods, [{ path: "s.scrml", src }]).diags;
const codes = (src) => diags(src).filter((d) => d.severity === "Error").map((d) => d.code);
const allCodes = (src) => diags(src).map((d) => d.code);

describe("E-TYPE-044 on a `not` inside a wildcard alternation", () => {
  test("`.A :> …, not | _ :> …` on K", () => {
    expect(codes(prog(pm("K", [`.A :> "a"`, `not | _ :> "w"`])))).toEqual(["E-TYPE-044"]);
  });
  test("`.A :> …, .B | not | else :> …` on K", () => {
    expect(codes(prog(pm("K", [`.A :> "a"`, `.B | not | else :> "w"`])))).toEqual(["E-TYPE-044"]);
  });
  test("int `1 :> …, not | else :> …`", () => {
    expect(codes(prog(pm("int", [`1 :> "a"`, `not | else :> "w"`])))).toEqual(["E-TYPE-044"]);
  });
  test("bool `true :> …, not | else :> …`", () => {
    expect(codes(prog(pm("boolean", [`true :> "a"`, `not | else :> "w"`])))).toEqual(["E-TYPE-044"]);
  });
});

describe("guards", () => {
  test("the plain alternation `.A | not :> …, else` still reports it, once", () => {
    expect(codes(prog(pm("K", [`.A | not :> "a"`, `else :> "w"`])))).toEqual(["E-TYPE-044"]);
  });
  test("`not :> …, _ :> …` still reports it, once", () => {
    expect(codes(prog(pm("K", [`not :> "n"`, `_ :> "w"`])))).toEqual(["E-TYPE-044"]);
  });
  test("on a `K | not` subject a wildcard alternation's `not` is clean", () => {
    expect(codes(prog(pm("K | not", [`.A :> "a"`, `not | _ :> "w"`])))).toEqual([]);
  });
  test("on a `K | not` subject, no `not` and no wildcard is still E-MATCH-012", () => {
    expect(codes(prog(pm("K | not", [`.A :> "a"`, `.B :> "b"`, `.C :> "c"`, `.D :> "d"`])))).toEqual(["E-MATCH-012"]);
  });
  test("a non-maybe subject with a partial `not | _` arm: no E-MATCH-012, no W-MATCH-001", () => {
    const cs = allCodes(prog(pm("K", [`.A :> "a"`, `.B :> "b"`, `not | _ :> "w"`])));
    expect(cs).not.toContain("E-MATCH-012");
    expect(cs).not.toContain("W-MATCH-001");
    expect(cs.filter((c) => c === "E-TYPE-044")).toEqual(["E-TYPE-044"]);
  });
  test("every case named, then `not | _`: W-MATCH-001 (unchanged) and E-TYPE-044", () => {
    const cs = allCodes(prog(pm("K", [`.A :> "a"`, `.B :> "b"`, `.C :> "c"`, `.D :> "d"`, `not | _ :> "w"`])));
    expect(cs).toContain("W-MATCH-001");
    expect(cs.filter((c) => c === "E-TYPE-044")).toEqual(["E-TYPE-044"]);
  });
  test("a reachable wildcard alternation without `not` stays clean (no false W-MATCH-001)", () => {
    expect(allCodes(prog(pm("K", [`.A :> "a"`, `.B | .C | .D | _ :> "w"`])))).not.toContain("W-MATCH-001");
  });
});
