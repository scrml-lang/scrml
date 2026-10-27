// imports-s471.test.js — s471-bootstrap-stdlib-import step 1: an import the
// bootstrap cannot resolve is a NAMED refusal at the import, never a silent
// drop (link.scrml `importTarget` is the one resolver; analyze.scrml
// `checkImports` judges every import against it).
//
// Before s471: `import { slug } from "scrml:format"` added nothing and the use
// failed as `slug` "not declared" (E-SCOPE-001, a misleading error); an import
// inside `<program>` was never checked at all; and a name was accepted when ANY
// file exported it, not the file the import names (§21.3).

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const ENTRY = "app.scrml";
const run = (entrySrc, aux = []) => frontEnd(mods, [...aux, { path: ENTRY, src: entrySrc }], ENTRY);
const codes = (entrySrc, aux) => run(entrySrc, aux).diags.map((d) => d.code).sort();
const prog = (imp, body = "<p>hi</p>") => `<program>\n\${ ${imp} }\n${body}\n</program>\n`;
const LIB = { path: "lib.scrml", src: '${ export fn helper() -> string { return "x"; } }\n' };
const OTHER = { path: "other.scrml", src: '${ export fn elsewhere() -> string { return "y"; } }\n' };

describe("an unresolved import is refused by name at the import", () => {
  test("`scrml:format` with no stdlib source supplied: E-BOOTSTRAP-UNSUPPORTED naming the module — and the use is not also E-SCOPE-001", () => {
    const src = `<program>\n\${ import { slug } from "scrml:format"; }\nlet <title:string="Hello World"/>\n<p>\${slug(@title)}</p>\n</program>\n`;
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    const d = r.diags[0];
    expect(d.message).toContain("`scrml:format`");
    // at the import statement (line 2), not at the use
    expect(src.slice(d.span.start, d.span.end)).toContain('import { slug } from "scrml:format"');
  });

  test("the `scrml:compiler` family is refused as KNOWN-DEFERRED (§41.17)", () => {
    for (const from of ["scrml:compiler", "scrml:compiler/bs"]) {
      const r = run(prog(`import { compileScrml } from "${from}";`));
      expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(r.diags[0].message).toContain("§41.17");
    }
  });

  test("a relative `.scrml` source that is not in the build: E-IMPORT-006", () => {
    expect(codes(prog('import { helper } from "./missing.scrml";'))).toEqual(["E-IMPORT-006"]);
  });

  test("a JavaScript module, `vendor:`, `bun:` and `node:` sources: E-BOOTSTRAP-UNSUPPORTED", () => {
    for (const from of ["./helper.js", "vendor:picker", "bun:sqlite", "node:fs"]) {
      const r = run(prog(`import { x } from "${from}";`));
      expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(r.diags[0].message).toContain("`" + from + "`");
    }
  });

  test("a bare npm-style source: E-IMPORT-005 (§41.4)", () => {
    expect(codes(prog('import { x } from "lodash";'))).toEqual(["E-IMPORT-005"]);
  });
});

describe("a resolved import is judged against THE FILE IT NAMES (§21.3)", () => {
  test("a name the target exports: clean", () => {
    const r = run(prog('import { helper } from "./lib.scrml";', "<p>${helper()}</p>"), [LIB]);
    expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  });

  test("an import inside `<program>` of a name its target does not export: E-IMPORT-004 at the name", () => {
    const src = prog('import { nothere } from "./lib.scrml";');
    const r = run(src, [LIB]);
    expect(r.diags.map((d) => d.code)).toEqual(["E-IMPORT-004"]);
    expect(src.slice(r.diags[0].span.start, r.diags[0].span.end)).toBe("nothere");
  });

  test("a name exported by ANOTHER file in the build is still not exported by the file the import names", () => {
    expect(codes(prog('import { elsewhere } from "./lib.scrml";'), [LIB, OTHER])).toEqual(["E-IMPORT-004"]);
  });

  test("a use of a name its refused import brings is not also E-SCOPE-001; an unimported unknown name still is", () => {
    const src = prog('import { nothere } from "./lib.scrml";', "<p>${nothere()} ${neverImported()}</p>");
    expect(codes(src, [LIB])).toEqual(["E-IMPORT-004", "E-SCOPE-001"]);
  });
});

describe("link.scrml importTarget — the one resolver", () => {
  const t = (importer, from, paths) => mods.link.importTarget(importer, from, paths);
  test("relative sources resolve against the importer's directory, to a path in the set", () => {
    expect(t("app.scrml", "./lib.scrml", ["app.scrml", "lib.scrml"])).toBe("lib.scrml");
    expect(t("ui/app.scrml", "../lib.scrml", ["ui/app.scrml", "lib.scrml"])).toBe("lib.scrml");
    expect(t("app.scrml", "./lib.scrml", ["app.scrml"])).toBe("");
  });
  test("`scrml:NAME` resolves to the stdlib prefix: the directory form first, then the file form", () => {
    expect(t("app.scrml", "scrml:format", ["scrml:format/index.scrml", "scrml:format.scrml"])).toBe("scrml:format/index.scrml");
    expect(t("app.scrml", "scrml:format", ["scrml:format.scrml"])).toBe("scrml:format.scrml");
    expect(t("app.scrml", "scrml:format", ["format/index.scrml"])).toBe("");
  });
  test("a stdlib module's relative imports stay inside the prefix; no relative source crosses it either way", () => {
    const paths = ["app.scrml", "lib.scrml", "scrml:auth/index.scrml", "scrml:auth/jwt.scrml"];
    expect(t("scrml:auth/index.scrml", "./jwt.scrml", paths)).toBe("scrml:auth/jwt.scrml");
    expect(t("scrml:auth/index.scrml", "../lib.scrml", paths)).toBe("");
    expect(t("app.scrml", "./scrml:auth/jwt.scrml", paths)).toBe("");
  });
});
