// s479-binding-rulings — SPEC §7.3.3 (S479): "a binder that repeats an earlier binder of the SAME arm
// is E-SCOPE-REDECLARE, reported at the repeat, wherever the `match` stands … The wildcard `_` binds
// nothing and may repeat; two arms may each bind the same name" (§18.7). Ruling: user-voice S478
// "open owner questions" item 14; code chosen by the PA (S479). Gap g-boot-match-duplicate-binder-s478.
import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const errs = (src) => {
  const r = frontEnd(mods, [{ path: "s.scrml", src }]);
  return [...(r.parseDiags || []), ...r.diags].filter((d) => d.severity === "Error");
};
const codes = (src) => [...new Set(errs(src).map((d) => d.code))].sort();

const TYPE = `    type Pair:enum = { Loaded(a: int, b: int), Twice(a: int, b: int), Empty }\n`;
const valueProg = (arms) => `<program>\n${TYPE}    function f(p: Pair) -> int {\n        return match p {\n${arms}\n        };\n    }\n    <p>\${f(Pair.Empty)}</p>\n</program>\n`;
const elemProg = (arms) => `<program>\n${TYPE}    <pair:Pair=.Empty/>\n    <match for=Pair on=@pair>\n${arms}\n    </match>\n</program>\n`;

describe("§7.3.3 / §18.7 — one arm binds each name once", () => {
  test("value match: `.Loaded(n, n)` is E-SCOPE-REDECLARE, at the second `n`", () => {
    const src = valueProg(`            .Loaded(n, n) :> n,\n            .Twice(a, b) :> a + b,\n            .Empty :> 0`);
    const es = errs(src).filter((d) => d.code === "E-SCOPE-REDECLARE");
    expect(codes(src)).toEqual(["E-SCOPE-REDECLARE"]);
    const at = src.indexOf(".Loaded(n, n)") + ".Loaded(n, ".length;
    expect(es.every((d) => d.span.start === at)).toBe(true);
    expect(es[0].message).toContain("`n` is bound twice");
  });

  test("`<match>` arm: `<Loaded(n, n)>` is E-SCOPE-REDECLARE", () => {
    const src = elemProg(`        <Loaded(n, n)>\n            <p>\${n}</p>\n        </>\n        <Twice(a, b)>\n            <p>\${a + b}</p>\n        </>\n        <Empty/>`);
    expect(codes(src)).toEqual(["E-SCOPE-REDECLARE"]);
  });

  test("a `!{}` handler arm reads the same pattern (§19.4.3): `.Bad(x, x)` is E-SCOPE-REDECLARE", () => {
    const src = `<program>\n    type E:enum = { Bad(a: int, b: int) }\n    function g()! E -> int { fail E.Bad(1, 2); }\n    function h() -> int {\n        const v: int = g() !{ .Bad(x, x) :> x };\n        return v;\n    }\n    <p>\${h()}</p>\n</program>\n`;
    expect(codes(src)).toContain("E-SCOPE-REDECLARE");
  });

  test("distinct binders, repeated `_`, and one name in two arms are legal — both forms", () => {
    expect(codes(valueProg(`            .Loaded(n, m) :> n + m,\n            .Twice(n, _) :> n,\n            .Empty :> 0`))).toEqual([]);
    expect(codes(valueProg(`            .Loaded(_, _) :> 1,\n            .Twice(_, _) :> 2,\n            .Empty :> 0`))).toEqual([]);
    expect(codes(elemProg(`        <Loaded(n, m)>\n            <p>\${n + m}</p>\n        </>\n        <Twice(n, _)>\n            <p>\${n}</p>\n        </>\n        <Empty/>`))).toEqual([]);
  });

  test("three binders, the repeat not adjacent: `.V(a, b, a)`", () => {
    const src = `<program>\n    type T:enum = { V(x: int, y: int, z: int), W }\n    function f(t: T) -> int {\n        return match t {\n            .V(a, b, a) :> a + b,\n            .W :> 0\n        };\n    }\n    <p>\${f(T.W)}</p>\n</program>\n`;
    expect(codes(src)).toEqual(["E-SCOPE-REDECLARE"]);
  });
});
