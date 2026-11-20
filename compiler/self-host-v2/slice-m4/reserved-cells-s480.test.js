// reserved-cells-s480.test.js — s480-records-3: the cell names `db`, `schema` and `md` are reserved.
//
// Ruling: scrml-support/user-voice-scrml.md "⭐ RULED — bootstrap census build order, carve-out 2
// widening, four smaller questions, PA recs adopted (S480, 2026-11-20)" item 9:
//   "Reserve the cell names `db`, `schema` and `md` in §4.15, with a test. Rec: "yes". RULED yes."
// (ruling:user-voice-scrml.md-S480-census-recs). SPEC §4.15 reserved-name bullet; the code is the
// one §4.15 already names, E-NAME-COLLIDES-RESERVED. Gap g-boot-reserved-name-cell-db-s480.
// Newly-rejecting for a program cell named `db` / `schema` / `md` (any case); corpus count 0.
// Every test is red on base (origin/main 1765c43a2) unless marked "(unchanged)".

import { describe, test, expect, beforeAll } from "bun:test";
import { mods } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

beforeAll(() => { mods(); }, { timeout: 120000 });

const run = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const errsOf = (src) => run(src).diags.filter((d) => d.severity === "Error").map((d) => d.code);
const cell = (decl, name) => `<program>\n ${decl}\n<p id="z">\${@${name}}</p>\n</program>\n`;

describe("S480 census recs item 9 — a cell named `db`, `schema` or `md` is E-NAME-COLLIDES-RESERVED (§4.15)", () => {
  for (const n of ["db", "schema", "md"]) {
    test(`\`let <${n}:int=3/>\` in a program body is refused, at the declaration`, () => {
      const src = cell(`let <${n}:int=3/>`, n);
      expect(errsOf(src)).toEqual(["E-NAME-COLLIDES-RESERVED"]);
      const d = run(src).diags.find((x) => x.code === "E-NAME-COLLIDES-RESERVED");
      expect(d.span.start).toBe(src.indexOf("<" + n + ":"));
      expect(d.message).toContain("`" + n + "`");
      expect(d.message).toContain("§4.15");
    });
  }
  test("compared lowercase (§24.4): `Db`, `SCHEMA`, `Md` are reserved too", () => {
    expect(errsOf(cell("let <Db:int=3/>", "Db"))).toEqual(["E-NAME-COLLIDES-RESERVED"]);
    expect(errsOf(cell("let <SCHEMA:int=3/>", "SCHEMA"))).toEqual(["E-NAME-COLLIDES-RESERVED"]);
    expect(errsOf(cell("let <Md:int=3/>", "Md"))).toEqual(["E-NAME-COLLIDES-RESERVED"]);
  });
  test("the keywordless and `single` forms are refused too", () => {
    expect(errsOf(cell("<db:int=3/>", "db"))).toEqual(["E-NAME-COLLIDES-RESERVED"]);
    expect(errsOf(`type P:enum = { A, B }\n<program>\n <md:P=.A single/>\n<p id="z">x</p>\n</program>\n`)).toEqual(["E-NAME-COLLIDES-RESERVED"]);
  });
  test("a cell in a `<page>` body is refused too", () => {
    expect(errsOf(`<program>\n<page>\n let <schema:int=3/>\n<p id="z">\${@schema}</p>\n</page>\n</program>\n`)).toEqual(["E-NAME-COLLIDES-RESERVED"]);
  });
  test("a name that only starts with a reserved one compiles clean (unchanged)", () => {
    expect(errsOf(cell("let <dbx:int=3/>", "dbx"))).toEqual([]);
    expect(errsOf(cell("let <mdText:int=3/>", "mdText"))).toEqual([]);
  });
  test("a CHILD field named `db` of a declaration is not a cell and compiles clean (unchanged)", () => {
    expect(errsOf(`<program>\n <card:struct>\n  <db:int=3/>\n </card>\n<p id="z">\${@card.db}</p>\n</program>\n`)).toEqual([]);
  });
  test("a file-scope declaration named `db` stays E-NAME-COLLIDES-RESERVED, once (unchanged)", () => {
    expect(errsOf(`let <db:int=3/>\n<program>\n<p id="z">\${@db}</p>\n</program>\n`)).toEqual(["E-NAME-COLLIDES-RESERVED"]);
  });
});
