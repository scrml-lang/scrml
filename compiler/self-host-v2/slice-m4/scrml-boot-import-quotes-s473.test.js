// S473 (flogence S60 report) — scrml-boot's source closure (scripts/scrml-boot.ts `sourceClosure`)
// follows a project's `.scrml` imports with the BOOTSTRAP PARSER's own import reading
// (parse.scrml `parseFile` + link.scrml `importsOfItems`), not a text regex. Before, a regex that
// accepted only DOUBLE-quoted specifiers left `from '../graph-read.scrml'` out of the build, so the
// import was a false E-IMPORT-006 ("does not resolve to a `.scrml` file in this build", §21.3).
// The regex also followed an import written inside a comment or a string.
import { describe, test, expect } from "bun:test";

const LIB = "${\n    export fn fl(x: int) -> int {\n        return x;\n    }\n}\n";
const app = (imp) => "<program>\n${ " + imp + " }\n<p>${fl(1)}</p>\n</program>\n";
const ROOT = "/scrml-boot-s473-virtual";

async function compile(files) {
  const { compileSource } = await import("../../../scripts/scrml-boot.ts");
  const overlay = new Map(Object.entries(files).map(([p, src]) => [`${ROOT}/${p}`, src]));
  return compileSource(`${ROOT}/app.scrml`, { overlay });
}
const shownFiles = (c) => c.files.map((f) => f.slice(ROOT.length + 1)).sort();
const codes = (c) => c.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);

describe("scrml-boot sourceClosure — an import's quote style does not decide whether it is followed", () => {
  test("a SINGLE-quoted relative import is followed (was a false E-IMPORT-006)", async () => {
    const c = await compile({ "app.scrml": app("import { fl } from './lib.scrml';"), "lib.scrml": LIB });
    expect(codes(c)).toEqual([]);
    expect(c.ok).toBe(true);
    expect(shownFiles(c)).toEqual(["app.scrml", "lib.scrml"]);
  }, 120000);

  test("a DOUBLE-quoted relative import is still followed", async () => {
    const c = await compile({ "app.scrml": app('import { fl } from "./lib.scrml";'), "lib.scrml": LIB });
    expect(codes(c)).toEqual([]);
    expect(shownFiles(c)).toEqual(["app.scrml", "lib.scrml"]);
  }, 120000);

  test("single-quoted imports are followed transitively, across directories (`'../x.scrml'`)", async () => {
    const c = await compile({
      "app.scrml": app("import { fl } from './view/mid.scrml';"),
      "view/mid.scrml": "${\n    import { base } from '../base.scrml';\n    export fn fl(x: int) -> int {\n        return base(x);\n    }\n}\n",
      "base.scrml": "${\n    export fn base(x: int) -> int {\n        return x;\n    }\n}\n",
    });
    expect(codes(c)).toEqual([]);
    expect(shownFiles(c)).toEqual(["app.scrml", "base.scrml", "view/mid.scrml"]);
  }, 120000);

  test("an import written in a COMMENT or a STRING is not an import: its file is not pulled into the build", async () => {
    // other.scrml does not compile; it must not be read. A regex over the text followed both.
    const c = await compile({
      "app.scrml": "<program>\n${\n    import { fl } from './lib.scrml';\n    // import { gone } from \"./other.scrml\"\n    const s = 'from \"./other.scrml\"';\n}\n<p>${fl(1)}</p>\n<p>${s}</p>\n</program>\n",
      "lib.scrml": LIB,
      "other.scrml": "${ this is not scrml }\n",
    });
    expect(shownFiles(c)).toEqual(["app.scrml", "lib.scrml"]);
    expect(codes(c)).toEqual([]);
  }, 120000);

  test("a single-quoted import of a file that does not exist is still E-IMPORT-006", async () => {
    const c = await compile({ "app.scrml": app("import { fl } from './missing.scrml';") });
    expect(codes(c)).toContain("E-IMPORT-006");
  }, 120000);
});
