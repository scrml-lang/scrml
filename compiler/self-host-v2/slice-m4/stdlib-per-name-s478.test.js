// stdlib-per-name-s478.test.js — s478-ruled-stdlib-data: PER-NAME supply of a barrel stdlib module.
//
// RULED (scrml-support/user-voice-scrml.md, "⭐ RULED — open owner questions, PA recs adopted
// wholesale (S478, 2026-11-17)", item 55): "Q1: per-name supply of a barrel module. RULED: yes,
// INTERIM — it unblocks the modules whose other names compile." The rec it adopts
// (docs/known-gaps.md g-boot-stdlib-data-owner-questions-s478): "compile only the re-export targets a
// program reaches, and refuse a failing name by name (rather than failing the whole import)".
//
// The driver (slice-m2/lowered.js stdlibSources / frontEndStdlib / withheldRefusals):
//   - a named re-export is followed only for the names something needs; one no one needs is blanked
//     in the supplied text and its target never supplied;
//   - a reached re-export target that fails is withdrawn ALONE, and a name a program imports through
//     it is refused BY NAME at that import (E-BOOTSTRAP-UNSUPPORTED) — never silently missing, never
//     the "not exported" E-IMPORT-004;
//   - a failing module ENTRY, or a file its entry IMPORTS, still withdraws the module (s471).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { join } from "node:path";
import { loadM2 } from "./harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const ENTRY = "app.scrml";
const FIXTURE = join(import.meta.dir, "src", "stdlib-s478d");
const fe = (src) => frontEndStdlib(mods, [{ path: ENTRY, src }], ENTRY, { stdlibRoot: FIXTURE });
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const spanOf = (src, s) => ({ start: src.indexOf(s), end: src.indexOf(s) + s.length });
let k = 0;

describe("a barrel supplies only the re-export targets a program reaches", () => {
  const SRC = `<program>
\${ import { good, Tone } from "scrml:bar"; }
let <n:int=1/>
<main><p id="g">\${good(@n)}</p></main>
</program>
`;
  test("only the reached target is supplied; the unreached re-exports are blanked (same length, same lines)", () => {
    const r = fe(SRC);
    expect(errs(r).map((d) => `${d.code} ${d.file}: ${d.message}`)).toEqual([]);
    expect(r.stdlib.refused).toEqual([]);
    expect(r.stdlib.withheld).toEqual([]);
    expect(r.stdlib.supplied.map((s) => [s.module, s.files])).toEqual([["bar", ["scrml:bar/good.scrml", "scrml:bar/index.scrml"]]]);
    const idx = r.stdlib.sources.find((s) => s.path === "scrml:bar/index.scrml");
    expect(idx.src).toContain("export { good, Tone } from './good.scrml';");
    expect(idx.src).not.toContain("./bad.scrml");
    expect(idx.src).not.toContain("./unused.scrml");
    const disk = require("node:fs").readFileSync(join(FIXTURE, "bar", "index.scrml"), "utf8");
    expect(idx.src.length).toBe(disk.length);
    expect(idx.src.split("\n").length).toBe(disk.split("\n").length);
    expect(mods.check.checkCore(r.core)).toEqual([]);
  });

  test("compiled and RUN: the reached name computes in the page", async () => {
    const r = fe(SRC);
    await loadProgram(r.core, "s478pn-" + k++);
    expect(document.querySelector("#g").textContent).toBe("2");
  });
});

describe("a reached target that does not compile is withdrawn alone; its names are refused BY NAME", () => {
  const SRC = `<program>
\${ import { good, bad } from "scrml:bar"; }
<main><p id="g">\${good(1)}</p><p>\${bad("x")}</p></main>
</program>
`;
  test("E-BOOTSTRAP-UNSUPPORTED at the withheld name (not E-IMPORT-004, not a cascade at its use); the sibling name is supplied", () => {
    const r = fe(SRC);
    expect(errs(r).map((d) => [d.code, d.file, d.span])).toEqual([["E-BOOTSTRAP-UNSUPPORTED", ENTRY, spanOf(SRC, "bad")]]);
    expect(errs(r)[0].message).toContain("`bad` cannot be imported from `scrml:bar`");
    expect(errs(r)[0].message).toContain("scrml:bar/bad.scrml");
    expect(errs(r)[0].message).toContain("E-PARAM-TYPE-REQUIRED");
    expect(r.stdlib.refused).toEqual([]);
    expect(r.stdlib.withheld.map((w) => [w.module, w.file, w.name, w.target])).toEqual([
      ["bar", "scrml:bar/index.scrml", "bad", "scrml:bar/bad.scrml"],
    ]);
    expect(r.stdlib.supplied.map((s) => [s.module, s.files])).toEqual([["bar", ["scrml:bar/good.scrml", "scrml:bar/index.scrml"]]]);
  });

  test("a name of the same withdrawn target that compiles on its own is withheld too (the unit is the target file)", () => {
    const src = `<program>\n\${ import { alsoBad } from "scrml:bar"; }\n</program>\n`;
    const r = fe(src);
    expect(errs(r).map((d) => [d.code, d.span])).toEqual([["E-BOOTSTRAP-UNSUPPORTED", spanOf(src, "alsoBad")]]);
  });

  test("a project re-export of a withheld name is refused by name as well", () => {
    const src = `\${ export { bad } from "scrml:bar"; }\n<program>\n</program>\n`;
    const r = fe(src);
    expect(errs(r).map((d) => [d.code, d.span])).toEqual([["E-BOOTSTRAP-UNSUPPORTED", spanOf(src, "bad")]]);
  });

  test("a name the barrel does not export at all stays E-IMPORT-004 (never relabelled)", () => {
    const src = `<program>\n\${ import { nope } from "scrml:bar"; }\n</program>\n`;
    const r = fe(src);
    expect(errs(r).map((d) => d.code)).toEqual(["E-IMPORT-004"]);
    expect(r.stdlib.withheld).toEqual([]);
  });

  test("a namespace import reaches the module whole: with a withheld name it is refused at the statement", () => {
    const src = `<program>\n\${ import * as b from "scrml:bar"; }\n</program>\n`;
    const r = fe(src);
    const e = errs(r);
    expect(e.map((d) => [d.code, d.file])).toEqual([["E-BOOTSTRAP-UNSUPPORTED", ENTRY]]);
    expect(e[0].span.start).toBe(src.indexOf("import * as b"));
    expect(e[0].message).toContain("`bad`");
    expect(e[0].message).toContain("`unused`");
    expect(e[0].message).not.toContain("`good`");
  });
});

describe("an entry, or a file its entry IMPORTS, failing still withdraws the module (s471)", () => {
  test("the module is refused at the import; its cause (the imported file) is reported first", () => {
    const src = `<program>\n\${ import { hub } from "scrml:hub"; }\n</program>\n`;
    const r = fe(src);
    expect(errs(r).map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errs(r)[0].message).toContain("the bootstrap cannot import this stdlib module");
    expect(r.stdlib.refused.map((x) => [x.module, x.direct])).toEqual([["hub", true]]);
    expect(r.stdlib.refused[0].diags[0].file).toBe("scrml:hub/helper.scrml");
    expect(r.stdlib.refused[0].sources.map((s) => s.path).sort()).toEqual(["scrml:hub/helper.scrml", "scrml:hub/index.scrml"]);
  });
});
