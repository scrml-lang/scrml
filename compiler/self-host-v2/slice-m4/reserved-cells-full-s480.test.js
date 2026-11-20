// reserved-cells-full-s480.test.js — s480-reserved-cells-full: the FULL §4.15 reserved-name list applies
// to program cells, not only `db` / `schema` / `md`.
//
// Ruling: scrml-support/user-voice-scrml.md "⭐ RULED — stored driver text, reserved names on program
// cells (S480), PA recs adopted (S480, 2026-11-20)" item 2:
//   "The full §4.15 reserved-name list applies to program cells, not only `db` / `schema` / `md`. …
//    Rec: "apply the full list to cells, after measuring the corpus". RULED yes."
// (ruling:user-voice-scrml.md-S480-driver-text-reserved-cells). SPEC §4.15 reserved-name bullet (S480);
// the code is E-NAME-COLLIDES-RESERVED. One list for both scopes: analyze.scrml `reservedElementName`,
// called from `userDeclStub` (a user declaration) and `programFields` (a program / `<page>` cell).
// Every test is red on base (origin/main 0f6637ac4) unless marked "(unchanged)".

import { describe, test, expect, beforeAll } from "bun:test";
import { mods } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

beforeAll(() => { mods(); }, { timeout: 120000 });

const run = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const errsOf = (src) => run(src).diags.filter((d) => d.severity === "Error").map((d) => d.code);
const cell = (decl, name) => `<program>\n ${decl}\n<p id="z">\${@${name}}</p>\n</program>\n`;

// §4.15's list, less the three #2026 already reserved for cells (db, schema, md).
const NAMES = ["engine", "match", "each", "errors", "onTransition", "onTimeout", "onIdle", "onMount",
  "render", "page", "endpoint", "onchange", "theme", "defaults"];

describe("S480 item 2 — a program cell with any §4.15 reserved name is E-NAME-COLLIDES-RESERVED", () => {
  for (const n of NAMES) {
    test(`\`let <${n}:int=3/>\` in a program body is refused, once, at the declaration`, () => {
      const src = cell(`let <${n}:int=3/>`, n);
      expect(errsOf(src)).toEqual(["E-NAME-COLLIDES-RESERVED"]);
      const d = run(src).diags.find((x) => x.code === "E-NAME-COLLIDES-RESERVED");
      expect(d.span.start).toBe(src.indexOf("<" + n + ":"));
      expect(d.message).toContain("`" + n + "`");
      expect(d.message).toContain("§4.15");
    });
  }
  test("compared lowercase (§24.4): `Engine`, `PAGE`, `Theme` are reserved too", () => {
    expect(errsOf(cell("let <Engine:int=3/>", "Engine"))).toEqual(["E-NAME-COLLIDES-RESERVED"]);
    expect(errsOf(cell("let <PAGE:int=3/>", "PAGE"))).toEqual(["E-NAME-COLLIDES-RESERVED"]);
    expect(errsOf(cell("let <Theme:int=3/>", "Theme"))).toEqual(["E-NAME-COLLIDES-RESERVED"]);
  });
  test("the keywordless form and an own value without a type are refused too", () => {
    expect(errsOf(cell("<engine:int=3/>", "engine"))).toEqual(["E-NAME-COLLIDES-RESERVED"]);
    expect(errsOf(cell("<page=1/>", "page"))).toEqual(["E-NAME-COLLIDES-RESERVED"]);
  });
  test("a cell in a `<page>` body is refused too", () => {
    expect(errsOf(`<program>\n<page>\n let <theme:int=3/>\n<p id="z">\${@theme}</p>\n</page>\n</program>\n`)).toEqual(["E-NAME-COLLIDES-RESERVED"]);
  });
  test("a CHILD field named `engine` of a declaration is not a cell and compiles clean (unchanged)", () => {
    expect(errsOf(`<program>\n <card:struct>\n  <engine:int=4/>\n </card>\n<p id="z">\${@card.engine}</p>\n</program>\n`)).toEqual([]);
  });
  test("a name that only starts with a reserved one compiles clean (unchanged)", () => {
    expect(errsOf(cell("let <pageNo:int=3/>", "pageNo"))).toEqual([]);
    expect(errsOf(cell("let <engines:int=3/>", "engines"))).toEqual([]);
  });
  test("a declaration opener named `theme` is a declaration (E-NAME-COLLIDES-RESERVED), not the refused `<theme>` element", () => {
    // base: E-BOOTSTRAP-UNSUPPORTED (`<theme>` … is not in the bootstrap) + E-STATE-UNDECLARED
    expect(errsOf(`let <theme:int=3/>\n<program>\n<p id="z">\${@theme}</p>\n</program>\n`)).toEqual(["E-NAME-COLLIDES-RESERVED"]);
  });
  test("a `<theme>` element is still refused by name (unchanged)", () => {
    expect(errsOf(`<program>\n<theme>\n</theme>\n<p id="z">x</p>\n</program>\n`)).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a file-scope declaration named `engine` stays E-NAME-COLLIDES-RESERVED, once (unchanged)", () => {
    expect(errsOf(`let <engine:int=3/>\n<program>\n<p id="z">\${@engine}</p>\n</program>\n`)).toEqual(["E-NAME-COLLIDES-RESERVED"]);
  });
});
