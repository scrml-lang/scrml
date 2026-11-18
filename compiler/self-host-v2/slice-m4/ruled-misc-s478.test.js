// ruled-misc-s478.test.js — s478-ruled-misc: the S478 open-Qs rulings (user-voice
// "⭐ RULED — open owner questions, PA recs adopted wholesale (S478, 2026-11-17)").
// Each describe block names its ruling item and quotes the SPEC sentence it builds.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 300000 });

const ENTRY = "app.scrml";
const run = (src) => frontEnd(mods, [{ path: ENTRY, src }], ENTRY);
const errs = (src) => run(src).diags.filter((d) => d.severity === "Error");
const codes = (src) => run(src).diags.map((d) => d.code);

// ---------------------------------------------------------------------------
// item 27 — §23.2.4a: "JavaScript comments … MAY stand between the header's tokens — after `in`,
// around the `:`, the braces, each name and each `,` … an implementation SHALL read the header the
// same with or without them." Red before: `in: { a /* c */, b }` was E-FOREIGN-007.
// ---------------------------------------------------------------------------
describe("item 27 — comments inside a foreign crossing header (§23.2.4a)", () => {
  const tool = (slice) => `<program kind="tool" lang="js">\n    function main(args: string[]) -> number {\n        const n = 1;\n        const v: int = ${slice};\n        return 0;\n    }\n</program>\n`;
  const f007 = (slice) => errs(tool(slice)).filter((d) => d.code === "E-FOREIGN-007");
  test("a comment between names, around `:` / `{` / `}`, and a line comment", () => {
    for (const s of [
      "_={ in: { n /* c */, args } n }=",
      "_={ in /* c */ : /* d */ { /* e */ n /* f */ } n }=",
      "_={ in: { n, // the count\n            args } n }=",
      "_={ in: { n, /* trailing */ } n }=",
    ]) expect(f007(s)).toEqual([]);
  });
  test("the header's names are still checked through a comment (a name crossed twice)", () => {
    const ds = f007("_={ in: { n /* c */, n } n }=");
    expect(ds.length).toBe(1);
    expect(ds[0].message).toContain("crosses `n` twice");
  });
  test("a header AFTER a comment stays E-FOREIGN-007 (the header is at the top of the block)", () => {
    expect(f007("_={ /* note */ in: { n } n + 1 }=").length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// item 28 — §51.12.3: "A quoted duration is the same literal as the bare one" · "Units are
// lowercase only … SHALL be refused with `E-SYNTAX-DURATION`; the message SHALL name the lowercase unit".
// ---------------------------------------------------------------------------
describe("item 28 — DURATION: the quoted form and the unit case (§51.12.3)", () => {
  const P = (attrs) => `<program>\nlet <x:int=0 ${attrs}/>\nfunction f() { @x = 1; }\n<main><p>\${@x}</p><button onclick=f()>f</button></main>\n</program>\n`;
  const timing = (attrs) => {
    const r = run(P(attrs));
    expect(r.diags.filter((d) => d.code.startsWith("E-"))).toEqual([]);
    const prog = r.core.decls.find((d) => d.sym.id === r.core.program.id);
    return prog.fields.find((f) => f.sym.hint === "x").timing;
  };
  test("debounced=\"300ms\" is debounced=300ms", () => {
    expect(timing(`debounced="300ms"`)).toEqual(timing(`debounced=300ms`));
    expect(timing(`throttled="2s"`)).toEqual({ throttle: true, ms: 2000 });
  });
  for (const [v, want] of [["300MS", "300ms"], ["2S", "2s"], ["5M", "5m"], ["1H", "1h"], ["\"300Ms\"", "300ms"]]) {
    test(`debounced=${v} → E-SYNTAX-DURATION naming \`${want}\``, () => {
      const ds = errs(P(`debounced=${v}`)).filter((d) => d.code === "E-SYNTAX-DURATION");
      expect(ds.length).toBe(1);
      expect(ds[0].message).toContain("lowercase");
      expect(ds[0].message).toContain("`" + want + "`");
    });
  }
  test("a unit that is no unit in any case keeps the plain message", () => {
    const ds = errs(P(`debounced=300sec`)).filter((d) => d.code === "E-SYNTAX-DURATION");
    expect(ds.length).toBe(1);
    expect(ds[0].message).not.toContain("lowercase");
  });
});
