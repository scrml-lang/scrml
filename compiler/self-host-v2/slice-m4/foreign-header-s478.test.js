// foreign-header-s478.test.js — s478-boot-markup-value-foreign (g-boot-foreign-header-checks-unbuilt-s473).
//
// The `in: { … }` crossing header of a §23.2.4a foreign slice (parse.scrml foreignHeader). Before this
// lane three headers were read without a word — a duplicate crossing, a reserved-word crossing, and a
// header after a comment (read as NO header, so its crossings went unseen) — and each makes the sealed
// slice unbuildable. SPEC §23.2.4a: "A slice that is not valid JavaScript as the body of a strict-mode
// async function whose parameters are its crossings SHALL be a compile error (E-FOREIGN-007)"; "The
// crossings are the parameters of the sealed slice"; the header is declared "ONCE, at the top of the
// block, inside the braces".

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 300000 });

const ENTRY = "app.scrml";
const errs = (src) => frontEnd(mods, [{ path: ENTRY, src }], ENTRY).diags.filter((d) => d.severity === "Error");
const tool = (slice) => `<program kind="tool" lang="js">\n    function main(args: string[]) -> number {\n        const n = 1;\n        const v = ${slice};\n        return 0;\n    }\n</program>\n`;
const f007 = (slice) => errs(tool(slice)).filter((d) => d.code === "E-FOREIGN-007");

describe("§23.2.4a — a header that makes the sealed slice unbuildable is E-FOREIGN-007 at the block", () => {
  test("a name crossed twice", () => {
    const ds = f007("_={ in: { n, args, n } n }=");
    expect(ds.length).toBe(1);
    expect(ds[0].message).toContain("crosses `n` twice");
  });
  test("a reserved word, `await`, `eval` / `arguments` as a crossing", () => {
    for (const w of ["if", "await", "eval", "arguments", "let", "yield"]) {
      const ds = f007(`_={ in: { ${w} } 1 }=`);
      expect(ds.length).toBe(1);
      expect(ds[0].message).toContain("crosses `" + w + "`");
    }
  });
  test("a header after a block comment or a line comment", () => {
    expect(f007("_={ /* note */ in: { n } n + 1 }=").length).toBe(1);
    expect(f007("_={ // note\n            in: { n } n + 1 }=").length).toBe(1);
  });
});

describe("headers that build are untouched", () => {
  test("distinct names, a comment AFTER the header, a slice that only starts with a comment", () => {
    expect(f007("_={ in: { n, args } n + args.length }=")).toEqual([]);
    expect(f007("_={ in: { n } /* note */ n + 1 }=")).toEqual([]);
    expect(f007("_={ /* note */ 1 + 1 }=")).toEqual([]);
    expect(f007("_={ in: {} 1 }=")).toEqual([]);
  });
});
