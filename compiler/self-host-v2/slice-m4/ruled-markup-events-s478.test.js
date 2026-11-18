// ruled-markup-events-s478.test.js — s478-ruled-markup-events: the S478 open-Qs rulings
// (user-voice-scrml.md "⭐ RULED — open owner questions, PA recs adopted wholesale (S478)")
// that are not covered by an existing slice file. (Items 1, 12, 13 are in
// markup-in-logic-s478 / body-top-s478 / match-block-s478.)
//
// SPEC, verbatim:
//   §18.10 (amended S478) "The compiler SHALL also emit E-SYNTAX-011 when a `|` after an arm
//          pattern is followed by something that is not a pattern (`.Admin | p.active :> …`): that
//          is the same guard, spelled with a pipe. A `|` between two patterns stays alternation."
//
// RED ON BASE: the item-15 guard tests (base: E-PARSE-ARM "alternation … not yet supported").

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 300000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => d.severity === "Error");
const codes = (src) => errs(src).map((d) => d.code);
const FN = (arms) => `<program>
type Role:enum = { Admin, Editor, Viewer }
type Post:struct = { role: Role, active: boolean }
fn label(p: Post) -> string {
    return match p.role {
        ${arms}
    };
}
<p>${"${"}label({ role: .Admin, active: true })}</p>
</program>
`;

describe("item 15 — §18.10: `| <non-pattern>` after an arm pattern is E-SYNTAX-011", () => {
  test("`.Admin | p.active :>` is E-SYNTAX-011, one report at the `|`", () => {
    const e = errs(FN(`.Admin | p.active :> "admin",\n        .Editor :> "editor",\n        .Viewer :> "viewer"`));
    expect(e.map((d) => d.code)).toEqual(["E-SYNTAX-011"]);
    expect(e[0].message).toContain("§18.10");
  });
  test("a bare-name guard and a call guard are E-SYNTAX-011 too", () => {
    expect(codes(FN(`.Admin | ok :> "admin",\n        _ :> "x"`))).toEqual(["E-SYNTAX-011"]);
    expect(codes(FN(`.Admin | isOn(p) :> "admin",\n        _ :> "x"`))).toEqual(["E-SYNTAX-011"]);
  });
  test("a `|` between two patterns stays alternation (not built: E-PARSE-ARM, by name)", () => {
    const c = codes(FN(`.Admin | .Editor :> "staff",\n        .Viewer :> "viewer"`));
    expect(c).toContain("E-PARSE-ARM");
    expect(c).not.toContain("E-SYNTAX-011");
    expect(codes(FN(`.Admin | _ :> "any"`))).not.toContain("E-SYNTAX-011");
  });
  test("the `if` guard keeps its E-SYNTAX-011", () => {
    expect(codes(FN(`.Admin if p.active :> "admin",\n        _ :> "x"`))).toContain("E-SYNTAX-011");
  });
});
