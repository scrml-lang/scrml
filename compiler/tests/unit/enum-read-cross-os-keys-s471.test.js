/**
 * enum-read-cross-os-keys-s471.test.js — g-windows-imported-alias-chain-refusal-not-emitted-s470.
 *
 * The S470 enum-read refusal (E-TYPE-004 / E-TYPE-031, enum-value-member-read-s470.test.js) follows a
 * type through a dependency's OWN imports and re-exports (`_enumReadModules`, type-system.ts). That map
 * was a plain `Map` SET with the native AST `filePath` and read with paths in two forms — the native
 * `filePath`, and the posix `absSource` api.js stamps as a dependency registry's span file — resolved by
 * a raw `node:path` resolve. On Windows (`\`) the posix lookups missed, the chain read "unknown", and
 * the refusal silently passed: 10 cases red on the `windows` CI job only.
 *
 * The fix routes the chain through the compiler's ONE path boundary (`path-canonical.js` PathKeyedMap /
 * toPosix, `module-resolver.js` resolveModulePath), and FAILS CLOSED when a scrml-module specifier the
 * chain must follow resolves to no module of the compilation unit (E-TYPE-031), rather than reading
 * that miss as "not an enum".
 *
 * Windows-guard-without-a-Windows-runner (as path-canonical.test.js): the entry path is given in both
 * the native and the posix form; on the Linux gate the two are identical, on the `windows` job the
 * posix form is the opposite key shape from the native gathered dependencies.
 */

import { describe, test, expect } from "bun:test";
import { resolve, dirname } from "path";
import { tmpdir } from "os";
import { writeFileSync, rmSync, mkdirSync } from "fs";
import { compileScrml } from "../../src/api.js";
import { toPosix } from "../../src/path-canonical.js";

function compileFiles(files, entryForm = (p) => p) {
  const uniq = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = resolve(process.env.TMPDIR || tmpdir(), `scrml-s471-eros-${uniq}`);
  for (const [name, src] of Object.entries(files)) {
    mkdirSync(dirname(resolve(dir, name)), { recursive: true });
    writeFileSync(resolve(dir, name), src);
  }
  try {
    const result = compileScrml({ inputFiles: [entryForm(resolve(dir, "app.scrml"))], write: true, outputDir: resolve(dir, "out"), log: () => {} });
    return (result.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const codesOf = (files, entryForm) => compileFiles(files, entryForm).map((e) => e.code);

const H = "${\n    export type Inner:enum = { Bad(reason: string), Ok2 }\n    export type I2 = Inner\n    export function mk() -> Inner { return Inner::Bad(\"bad\") }\n}\n";
const PAGE = (imports, body) => `${imports}\n<msg> = ""\n\${\n    function go() { ${body} }\n}\n<button onclick=go()>\${@msg}</button>\n`;

describe("the imported-alias chain is keyed the same whatever the path form (S471)", () => {
  const ALIAS2 = {
    "h.scrml": H,
    "h2.scrml": "import { I2 } from \"./h.scrml\"\n${\n    export type I3 = I2\n}\n",
    "app.scrml": PAGE(`import { Inner } from "./h.scrml"\nimport { I3 } from "./h2.scrml"`, `const x: I3 = Inner::Bad("bad")\n @msg = x.reason`),
  };
  // (A dependency's alias of a name that arrives through `export *`. The ENTRY file importing straight
  // through `export *` is a different, all-OS path — api.js importedTypesByFile; see progress.md.)
  const STAR = {
    "h.scrml": H,
    "s.scrml": "${\n    export * from \"./h.scrml\"\n}\n",
    "m.scrml": "import { I2 } from \"./s.scrml\"\n${\n    export type K = I2\n}\n",
    "app.scrml": PAGE(`import { Inner } from "./h.scrml"\nimport { K } from "./m.scrml"`, `const x: K = Inner::Bad("bad")\n @msg = x.reason`),
  };
  const FN = {
    "h.scrml": H,
    "h2.scrml": "import { mk } from \"./h.scrml\"\n${\n    export function mk2() { return mk() }\n}\n",
    "app.scrml": PAGE(`import { mk2 } from "./h2.scrml"`, `@msg = mk2().reason`),
  };
  for (const [label, files] of [["alias of an imported alias", ALIAS2], ["`export *` re-export", STAR], ["imported fn through the dependency's import", FN]]) {
    test(`${label}: native entry path -> E-TYPE-004`, () => {
      expect(codesOf(files)).toContain("E-TYPE-004");
    });
    test(`${label}: posix-form entry path -> E-TYPE-004`, () => {
      expect(codesOf(files, toPosix)).toContain("E-TYPE-004");
    });
  }
  test("ALLOWED: `.variant` through the same chain is not refused", () => {
    const files = { ...ALIAS2, "app.scrml": PAGE(`import { Inner } from "./h.scrml"\nimport { I3 } from "./h2.scrml"`, `const x: I3 = Inner::Bad("bad")\n @msg = x.variant`) };
    expect(codesOf(files)).toEqual([]);
    expect(codesOf(files, toPosix)).toEqual([]);
  });
});

describe("a chain lookup that misses is REFUSED, not read as 'not an enum' (fail closed, S471)", () => {
  // `./hdir` names a scrml module (no extension) that resolves to no module of the compilation unit
  // (see progress.md: the resolver returns the directory itself). Before S471 the chain read it as
  // unknown and the payload read compiled with no diagnostic.
  const refused = (codes) => codes.includes("E-TYPE-031") || codes.includes("E-TYPE-004");
  test("an alias imported by a dependency through an unresolvable scrml specifier", () => {
    const codes = codesOf({
      "hdir/index.scrml": H,
      "h.scrml": H,
      "h2.scrml": "import { I2 } from \"./hdir\"\n${\n    export type I3 = I2\n}\n",
      "app.scrml": PAGE(`import { Inner } from "./h.scrml"\nimport { I3 } from "./h2.scrml"`, `const x: I3 = Inner::Bad("bad")\n @msg = x.reason`),
    });
    expect(refused(codes)).toBe(true);
  });
  test("a function imported by a dependency through an unresolvable scrml specifier", () => {
    const codes = codesOf({
      "hdir/index.scrml": H,
      "h2.scrml": "import { mk } from \"./hdir\"\n${\n    export function mk2() { return mk() }\n}\n",
      "app.scrml": PAGE(`import { mk2 } from "./h2.scrml"`, `@msg = mk2().reason`),
    });
    expect(refused(codes)).toBe(true);
  });
  test("the refusal names the unresolved import as a cause", () => {
    const errs = compileFiles({
      "hdir/index.scrml": H,
      "h2.scrml": "import { mk } from \"./hdir\"\n${\n    export function mk2() { return mk() }\n}\n",
      "app.scrml": PAGE(`import { mk2 } from "./h2.scrml"`, `@msg = mk2().reason`),
    });
    const e = errs.find((x) => x.code === "E-TYPE-031");
    // If the resolver ever resolves `./hdir` to `hdir/index.scrml`, the chain is READ and the read is
    // the plain E-TYPE-004 — still refused; only the cause text changes.
    if (!e) {
      expect(errs.map((x) => x.code)).toContain("E-TYPE-004");
      return;
    }
    expect(e.message).toContain("an import it cannot resolve to a module of this compilation");
    expect(e.message).toContain("impl#1 limitation");
  });
  test("ALLOWED: a foreign `./x.js` import is not a scrml module — unknown, not refused", () => {
    const codes = codesOf({
      "cfg.js": "export const cfg = { name: 'x' }\n",
      "app.scrml": PAGE(`import { cfg } from "./cfg.js"`, `@msg = cfg.name`),
    });
    expect(codes).toEqual([]);
  });
});
