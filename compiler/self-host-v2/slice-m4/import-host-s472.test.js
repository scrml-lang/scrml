// import-host-s472.test.js — s472-boot-import-host-math: the bootstrap reads the
// `import:<tag> { … } from "…"` host-import declaration (SPEC §21.3.1) and
// judges it by the §21.3.1 / §22.13 rules, each its own code:
//
//   §21.3.1 "`import:host` SHALL appear only at file top level, OUTSIDE any `${}`
//   logic context. An `import:host` declaration inside a `${}` block or any
//   nested scope SHALL be a compile error (`E-IMPORT-003` — same as plain
//   `import`)."
//   §21.3.1 "The `host-tag` SHALL be `host` in v1. Any other host-tag value SHALL
//   be a compile error (`E-IMPORT-009` …)."
//   §21.3.1 "A file outside the allow-list using `import:host` SHALL be a compile
//   error (`E-IMPORT-008`)." — the allow-list is the stdlib (`scrml/stdlib/**`,
//   S471); §22.13: "in an adopter project `import:host` is E-IMPORT-008 whatever
//   the entry says".
//
// Before s472 the bootstrap read `import:host …` as a malformed plain import (a
// wall of E-PARSE-* plus "a JavaScript module import is not in the bootstrap").
//
// An admitted declaration (a stdlib file, file top, tag `host`, a JS/TS module)
// is still refused BY NAME: the bootstrap does not yet load or emit a host
// module — where the host file lands in the output and what scrml type a host
// binding has are not said by the SPEC (docs/changes/s472-boot-import-host-math/
// progress.md, "SPEC silences").

import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "node:path";
import { loadM2, frontEnd } from "./harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const ENTRY = "app.scrml";
const STD = "scrml:hm/index.scrml"; // a stdlib file, as the driver names one (link.scrml stdlibPrefix)
const FIXTURE = join(import.meta.dir, "src", "stdlib-s472h");

const run = (files, entry = ENTRY) => frontEnd(mods, files, entry);
const codes = (r) => r.diags.map((d) => d.code).sort();
const user = (src) => run([{ path: ENTRY, src }]);
// a stdlib file + an entry that imports it
const std = (libSrc, use = "<p>${fl(2)}</p>") =>
  run([{ path: STD, src: libSrc }, { path: ENTRY, src: `<program>\n\${ import { fl } from "scrml:hm"; }\n${use}\n</program>\n` }]);
const LIB_BODY = "${\n    export fn fl(x: int) -> int {\n        return x;\n    }\n}\n";

describe("§21.3.1 in an adopter (non-stdlib) file: E-IMPORT-008", () => {
  test("file top, tag `host`, a .js module: E-IMPORT-008 alone, at the declaration — no parse wall, and the use is not also E-SCOPE-001", () => {
    const src = 'import:host { hfloor } from "./h.js";\n<program>\n<p>${hfloor(2)}</p>\n</program>\n';
    const r = user(src);
    expect(codes(r)).toEqual(["E-IMPORT-008"]);
    expect(src.slice(r.diags[0].span.start, r.diags[0].span.end)).toContain('import:host { hfloor } from "./h.js"');
  });

  test("a library (non-entry) project file: E-IMPORT-008 too", () => {
    const r = run([
      { path: "lib.scrml", src: 'import:host { h } from "./h.js";\n' + LIB_BODY },
      { path: ENTRY, src: '<program>\n${ import { fl } from "./lib.scrml"; }\n<p>${fl(1)}</p>\n</program>\n' },
    ]);
    expect(r.diags.map((d) => [d.code, d.file])).toEqual([["E-IMPORT-008", "lib.scrml"]]);
  });

  test("a project file whose own directory is named `stdlib/` is still an adopter file (stdlib-ness is the build's, not the path text)", () => {
    const r = run([
      { path: "stdlib/math/index.scrml", src: 'import:host { h } from "./h.js";\n' + LIB_BODY },
      { path: ENTRY, src: '<program>\n${ import { fl } from "./stdlib/math/index.scrml"; }\n<p>${fl(1)}</p>\n</program>\n' },
    ]);
    expect(codes(r)).toEqual(["E-IMPORT-008"]);
  });

  test("`import:` with no host-tag is a parse error (E-PARSE-IMPORT), never a plain import", () => {
    const r = user('import: { h } from "./h.js";\n<program>\n<p>hi</p>\n</program>\n');
    expect(codes(r)).toEqual(["E-PARSE-IMPORT"]);
  });

  test("a bad host-tag in an adopter file: E-IMPORT-009 and E-IMPORT-008", () => {
    expect(codes(user('import:wasm { f } from "./m.wasm";\n<program>\n<p>${f()}</p>\n</program>\n'))).toEqual(["E-IMPORT-008", "E-IMPORT-009"]);
  });

  test("inside a `${}` block and inside a `<program>` body: E-IMPORT-003 and E-IMPORT-008", () => {
    expect(codes(user('<program>\n${ import:host { h } from "./h.js"; }\n<p>${h()}</p>\n</program>\n'))).toEqual(["E-IMPORT-003", "E-IMPORT-008"]);
    expect(codes(user('${ import:host { h } from "./h.js"; }\n<program>\n<p>${h()}</p>\n</program>\n'))).toEqual(["E-IMPORT-003", "E-IMPORT-008"]);
    expect(codes(user('<program>\nimport:host { h } from "./h.js";\n<p>${h()}</p>\n</program>\n'))).toEqual(["E-IMPORT-003", "E-IMPORT-008"]);
  });
});

describe("§21.3.1 in a stdlib file", () => {
  test("a bad host-tag: E-IMPORT-009 alone (the file is inside the allow-list)", () => {
    const r = std('import:wasm { h } from "./h.js";\n' + LIB_BODY);
    expect(r.diags.map((d) => [d.code, d.file])).toEqual([["E-IMPORT-009", STD]]);
    expect(r.diags[0].message).toContain("`wasm`");
  });

  test("`host` naming a non-JS/TS module: E-IMPORT-009 (as impl#1), and the `.scrml` it names is NOT linked as a module import", () => {
    const r = run([
      { path: "scrml:hm/other.scrml", src: "${\n    export fn other() -> int {\n        return 1;\n    }\n}\n" },
      { path: STD, src: 'import:host { other } from "./other.scrml";\n' + LIB_BODY },
      { path: ENTRY, src: '<program>\n${ import { fl } from "scrml:hm"; }\n<p>${fl(2)}</p>\n</program>\n' },
    ]);
    expect(r.diags.map((d) => [d.code, d.file])).toEqual([["E-IMPORT-009", STD]]);
    expect(mods.link.importsOfItems(mods.parse.parseFile(STD, 'import:host { other } from "./other.scrml";\n', 0).ast.items)).toEqual([]);
  });

  test("not at file top: E-IMPORT-003 alone", () => {
    const r = std('${\n    import:host { h } from "./h.js";\n    export fn fl(x: int) -> int {\n        return x;\n    }\n}\n');
    expect(r.diags.map((d) => [d.code, d.file])).toEqual([["E-IMPORT-003", STD]]);
  });

  test("admitted (file top, `host`, a .js module): refused BY NAME — the bootstrap does not yet emit a host module; no E-IMPORT-003/008/009", () => {
    const r = std('import:host { hfloor } from "./h.js";\n' + LIB_BODY);
    expect(r.diags.map((d) => [d.code, d.file])).toEqual([["E-BOOTSTRAP-UNSUPPORTED", STD]]);
    expect(r.diags[0].message).toContain("does not yet load or emit a host module");
  });

  test("`name as local` binds `local` (§21.3.1 named-binding): a use of `local` does not cascade; the host-side name is not in scope", () => {
    const lib = 'import:host { floor as hfloor } from "./h.js";\n${\n    export fn fl(x: int) -> int {\n        return hfloor(x) + floor(x);\n    }\n}\n';
    const r = std(lib);
    const at = (d) => lib.slice(d.span.start, d.span.end);
    expect(r.diags.map((d) => [d.code, d.code === "E-SCOPE-001" ? at(d) : ""]).sort()).toEqual([["E-BOOTSTRAP-UNSUPPORTED", ""], ["E-SCOPE-001", "floor"]]);
    const imp = mods.link.hostImportsOfItems(mods.parse.parseFile(STD, lib, 0).ast.items)[0];
    expect([imp.host, imp.top, imp.from, imp.names.map((n) => n.name)]).toEqual(["host", true, "./h.js", ["hfloor"]]);
  });

  test("through the stdlib driver: a module whose source holds a host import is withdrawn; the user's import of it is refused by name", () => {
    const r = frontEndStdlib(mods, [{ path: ENTRY, src: '<program>\n${ import { fl } from "scrml:hm"; }\n<p>${fl(2)}</p>\n</program>\n' }], ENTRY, { stdlibRoot: FIXTURE });
    expect(r.diags.map((d) => [d.code, d.file])).toEqual([["E-BOOTSTRAP-UNSUPPORTED", ENTRY]]);
    expect(r.stdlib.refused.map((x) => [x.module, x.diags.map((d) => d.code)])).toEqual([["hm", ["E-BOOTSTRAP-UNSUPPORTED"]]]);
  });
});

describe("plain imports are unchanged", () => {
  test("a plain import records no host-tag and still links", () => {
    const items = mods.parse.parseFile(ENTRY, '${ import { fl } from "./lib.scrml"; }\n', 0).ast.items;
    const plain = mods.link.importsOfItems(items);
    expect(plain.map((i) => [i.host, i.from])).toEqual([[null, "./lib.scrml"]]);
    expect(mods.link.hostImportsOfItems(items)).toEqual([]);
  });
});
