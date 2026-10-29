// rulings-s473-one-name.test.js — s473-boot-one-name-per-program: the S473 round-2 owner ruling
// (user-voice-scrml.md "⭐ RULED — S473 owner questions round 2, PA recs", item 5):
//
//   "One name per program for every user declaration (extends the §7.6 uniform E-SCOPE-010
//    ruling past file scope)."
//
// §7.6 (S473): a program-level name — a `const`, a `function`, a `type`, a user declaration
// (`<card>`), a program cell — is bound ONCE in the program: a second binding of it, in the
// same file or in any other user file of the program, of the same kind or another, is
// E-SCOPE-010. Two COMPONENTS of one name keep their more specific code
// (E-COMPONENT-NAME-DUPLICATE, §9.1). Not program-level (unchanged): a local, a parameter, a
// loop binder (they shadow); an import (it names a declaration made elsewhere, so two files
// importing one name are not two bindings); a stdlib module's names (not user declarations).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { join } from "node:path";
import { loadM2, frontEnd } from "./harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";
import { expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const ENTRY = "app.scrml";
const FIXTURE = join(import.meta.dir, "src", "stdlib-s472");
const prog = (entrySrc, aux = []) => frontEnd(mods, [...aux, { path: ENTRY, src: entrySrc }], ENTRY);
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const at = (r) => errs(r).map((d) => [d.code, d.file]);
const clean = (r) => {
  expect(errs(r).map((d) => `${d.code} ${d.file}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const P = (decls, main = `        <p>x</p>`) => `<program>\n${decls}\n    <main>\n${main}\n    </main>\n</program>\n`;
const lib = (path, body) => ({ path, src: `\${\n${body}\n}\n` });
const FN = (name, exp = "") => `    ${exp}fn ${name}() -> string {\n        return "${name}";\n    }`;
const USE = (name) => `    export fn use_${name.replace(/\W/g, "")}() -> string {\n        return "u";\n    }`;

// ---------------------------------------------------------------------------
describe("2a — one name per program: two user files binding one name are E-SCOPE-010 (§7.6, S473 r2 #5)", () => {
  test("two PRIVATE functions of one name in two library files", () => {
    const A = lib("a.scrml", `${FN("helper")}\n    export fn fromA() -> string {\n        return helper();\n    }`);
    const B = lib("b.scrml", `${FN("helper")}\n    export fn fromB() -> string {\n        return helper();\n    }`);
    const r = prog(`<program>\n    \${ import { fromA } from "./a.scrml"; import { fromB } from "./b.scrml"; }\n    <p>\${fromA()} \${fromB()}</p>\n</program>\n`, [A, B]);
    expect(at(r)).toEqual([["E-SCOPE-010", "b.scrml"]]);
    expect(errs(r)[0].message).toContain("a.scrml");
    expect(errs(r)[0].message).toContain("§7.6");
  });
  test("a library's private function and the page's function of one name: reported in the page", () => {
    const A = lib("a.scrml", `${FN("helper")}\n${USE("a")}`);
    const r = prog(P(`    \${ import { use_a } from "./a.scrml"; }\n    function helper() -> string {\n        return "APP";\n    }`), [A]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("two private types of one name in two files", () => {
    const TA = lib("ta.scrml", `    type Box:struct = { v: string }\n${USE("ta")}`);
    const TB = lib("tb.scrml", `    type Box:struct = { n: int }\n${USE("tb")}`);
    const r = prog(P(`    \${ import { use_ta } from "./ta.scrml"; import { use_tb } from "./tb.scrml"; }`), [TA, TB]);
    expect(at(r)).toEqual([["E-SCOPE-010", "tb.scrml"]]);
  });
  test("across kinds: a function in one file, a type of its name in another", () => {
    const A = lib("a.scrml", `    export fn Box() -> string {\n        return "b";\n    }`);
    const r = prog(P(`    type Box:enum = { A, B }`), [A]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("across kinds: a constant in one file, a function of its name in another", () => {
    const A = lib("a.scrml", `    export const LIMIT = 3;\n${USE("a")}`);
    const r = prog(P(`    function LIMIT() -> int {\n        return 1;\n    }`), [A]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("across kinds: a function in a library, a user declaration (`<card>`) of its name in the page", () => {
    const A = lib("a.scrml", `    export fn card() -> int {\n        return 1;\n    }`);
    const r = prog(P(`    <card x:string/>\n    renders <p>\${x}</p>`), [A]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("two same-named declarations that are NOT both components: E-SCOPE-010 (was E-BOOTSTRAP-UNSUPPORTED)", () => {
    const A = { path: "a.scrml", src: `export <card t:string/>\n` };
    const r = prog(P(`    <card x:string/>\n    renders <p>\${x}</p>`), [A]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("two components of one name in two files keep E-COMPONENT-NAME-DUPLICATE — one report, not two", () => {
    const A = { path: "a.scrml", src: `export <card t:string/>\nrenders <div>\${t}</div>\n` };
    const r = prog(P(`    <card x:string/>\n    renders <p>\${x}</p>`), [A]);
    expect(at(r)).toEqual([["E-COMPONENT-NAME-DUPLICATE", ENTRY]]);
  });
  test("three files binding one name: one report per later binding (two)", () => {
    const A = lib("a.scrml", `${FN("helper")}\n${USE("a")}`);
    const B = lib("b.scrml", `${FN("helper")}\n${USE("b")}`);
    const r = prog(P(`    \${ import { use_a } from "./a.scrml"; import { use_b } from "./b.scrml"; }\n    function helper() -> string {\n        return "APP";\n    }`), [A, B]);
    expect(at(r).map((x) => x[0])).toEqual(["E-SCOPE-010", "E-SCOPE-010"]);
    expect(at(r).map((x) => x[1]).sort()).toEqual([ENTRY, "b.scrml"].sort());
  });
  test("two server functions of one name in two files", () => {
    const SA = lib("sa.scrml", `    server function load(id: string) -> string {\n        return "a:" + id;\n    }\n${USE("sa")}`);
    const r = prog(P(`    \${ import { use_sa } from "./sa.scrml"; }\n    function load(id: int) -> string {\n        return "b";\n    }`), [SA]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("a file the entry does not import is still part of the program when the driver links it: refused", () => {
    // frontEnd links every file it is given; the CLI gives it the entry's import closure
    const A = lib("a.scrml", `${FN("helper")}`);
    const r = prog(P(`    function helper() -> string {\n        return "APP";\n    }`), [A]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
});

describe("2b — program cells are program-level names too (§7.6, S473 r2 #5)", () => {
  test("a program cell and a function of its name, one file", () => {
    const r = prog(P(`    let <count:int=0/>\n    function count() -> int {\n        return 1;\n    }`));
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("a program cell and a type of its name, one file", () => {
    const r = prog(P(`    let <tone:string="x"/>\n    type tone:enum = { A, B }`));
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("a program cell and a library function of its name", () => {
    const A = lib("a.scrml", `    export fn count() -> int {\n        return 1;\n    }`);
    const r = prog(P(`    let <count:int=0/>`), [A]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("a program cell beside an IMPORTED constant of its name (g-boot-imported-const-like-cell-s472): E-SCOPE-010", () => {
    const A = lib("a.scrml", `    export const count = 3;\n${USE("a")}`);
    const r = prog(P(`    \${ import { count } from "./a.scrml"; }\n    let <count:int=0/>`), [A]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("a file that declares a name AND imports it: one report (linkage's, at the import)", () => {
    const A = lib("a.scrml", `    export fn twice(n: int) -> int {\n        return n * 2;\n    }`);
    const src = P(`    \${ import { twice } from "./a.scrml"; }\n    function twice(n: int) -> int {\n        return n + n;\n    }`);
    const r = prog(src, [A]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
    expect(src.slice(errs(r)[0].span.start, errs(r)[0].span.end)).toBe("twice");
    expect(errs(r)[0].span.start).toBeLessThan(src.indexOf("function twice"));
  });
  test("a constant beside a cell of its name keeps E-NAME-COLLIDES-STATE (one report)", () => {
    const r = prog(P(`    let <count:int=0/>\n    \${ const count = 1; }`));
    expect(at(r)).toEqual([["E-NAME-COLLIDES-STATE", ENTRY]]);
  });
});

describe("2c — not program-level bindings: unchanged", () => {
  test("an imported name used in two files is one declaration, not two", () => {
    const A = lib("a.scrml", `    export fn shout(s: string) -> string {\n        return s + "!";\n    }`);
    const B = lib("b.scrml", `    import { shout } from "./a.scrml";\n    export fn viaB() -> string {\n        return shout("b");\n    }`);
    clean(prog(`<program>\n    \${ import { shout } from "./a.scrml"; import { viaB } from "./b.scrml"; }\n    <p>\${shout("a")} \${viaB()}</p>\n</program>\n`, [A, B]));
  });
  test("a parameter or a local named like another file's function shadows it: clean", () => {
    const A = lib("a.scrml", `    export fn size() -> int {\n        return 1;\n    }`);
    clean(prog(`<program>\n    \${ import { size } from "./a.scrml"; }\n    function grow(size: int) -> int {\n        const n: int = size + 1;\n        return n;\n    }\n    function twice(k: int) -> int {\n        const size: int = k * 2;\n        return size;\n    }\n    <p>\${grow(size())} \${twice(2)}</p>\n</program>\n`, [A]));
  });
  test("a loop binder named like another file's function: clean", () => {
    const A = lib("a.scrml", `    export fn item() -> int {\n        return 1;\n    }`);
    clean(prog(`<program>\n    \${ import { item } from "./a.scrml"; }\n    function total(xs: int[]) -> int {\n        let s: int = item();\n        for (const item of xs) { s = s + item; }\n        return s;\n    }\n    <p>\${total([1, 2])}</p>\n</program>\n`, [A]));
  });
  test("distinct names in two files: clean", () => {
    const A = lib("a.scrml", `    export fn fromA() -> string {\n        return "a";\n    }`);
    clean(prog(`<program>\n    \${ import { fromA } from "./a.scrml"; }\n    function fromApp() -> string {\n        return "p";\n    }\n    <p>\${fromA()} \${fromApp()}</p>\n</program>\n`, [A]));
  });
  test("a stdlib module's private name is not a user declaration: the page may bind it (fixture scrml:vis has a private `helper`)", () => {
    const r = frontEndStdlib(mods, [{ path: ENTRY, src: `<program>\n    \${ import { pub } from "scrml:vis"; }\n    function helper() -> string {\n        return "app";\n    }\n    <p>\${pub("x")} \${helper()}</p>\n</program>\n` }], ENTRY, { stdlibRoot: FIXTURE });
    expect(r.stdlib.refused).toEqual([]);
    clean(r);
  });
  test("one file: the §7.6 file-scope rule is unchanged (one report per later binding)", () => {
    const r = prog(P(`    type card:enum = { A, B }\n    function card() -> int {\n        return 1;\n    }`));
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
});
