// rulings-s473-one-name.test.js — s473-boot-one-name-per-program: the S473 round-2 owner ruling
// (user-voice-scrml.md "⭐ RULED — S473 owner questions round 2, PA recs", item 5), as NARROWED
// ("⭐ RULED — 'one name per program' narrowed to exported names", S473):
//
//   "The program-wide one-name rule covers only names a file exports: two user files exporting
//    the same name is E-SCOPE-010. A non-exported (private) name never collides with a name in
//    another file, so two libraries may each keep a private `helper`. Unchanged: within one file,
//    §7.6 file scope stays uniform (one name per file, #1636), and an imported name colliding
//    with a local declaration stays E-SCOPE-010."
//
// s474 (door 3, "⭐ RULED — permanent-restrictions re-review: the four one-way doors", item 3)
// LIFTS the exported-name half: "two files exporting one name: INTERIM". The 2a pins and the
// cross-file component pins below are flipped to clean; the one-file rules are unchanged.
//
// Also pinned: a program cell is a file-scope binding (§7.6.1), so a cell beside a function or a
// type of its name in one file is E-SCOPE-010; a cell beside an IMPORT of its name, from any
// source (a stdlib module included), is E-SCOPE-010 (review MED-1); each binding is reported once
// (review LOW-1, LOW-2); the report names the first binding by file:line:col (review LOW-5).

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
const std = (entrySrc) => frontEndStdlib(mods, [{ path: ENTRY, src: entrySrc }], ENTRY, { stdlibRoot: FIXTURE });
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
// s474 (door 3, user-voice-scrml.md "⭐ RULED — permanent-restrictions re-review: the four one-way
// doors", item 3): "Same-name components across files, and two files exporting one name: INTERIM.
// The CSS scope key and output names are always per-file qualified." The S473 refusal pinned here
// (E-SCOPE-010 at the second exporter) is LIFTED: every pair below now compiles. Importing two of
// them into ONE file is the collision — slice-m4/scope-keys-s474.test.js.
describe("2a — two user files EXPORTING one name: legal (S474 door 3; was E-SCOPE-010, S473 narrowed)", () => {
  test("two exported functions of one name in two libraries", () => {
    const A = lib("a.scrml", `${FN("helper", "export ")}`);
    const B = lib("b.scrml", `${FN("helper", "export ")}\n${USE("b")}`);
    expect(at(prog(P(`    \${ import { use_b } from "./b.scrml"; }`), [A, B]))).toEqual([]);
  });
  test("across kinds: an exported type in one file, an exported function of its name in another", () => {
    const A = lib("a.scrml", `    export type Box:enum = { A, B }`);
    const B = lib("b.scrml", `    export fn Box() -> string {\n        return "b";\n    }`);
    expect(at(prog(P(`    <p>x</p>`), [A, B]))).toEqual([]);
  });
  test("across kinds: an exported constant and an exported user declaration of its name", () => {
    const A = lib("a.scrml", `    export const card = 3;`);
    const B = { path: "b.scrml", src: `export <card t:string/>\n` };
    expect(at(prog(P(`    <p>x</p>`), [A, B]))).toEqual([]);
  });
  test("two exported non-component declarations of one name", () => {
    const A = { path: "a.scrml", src: `export <card t:string/>\n` };
    const B = { path: "b.scrml", src: `export <card u:string/>\n` };
    expect(at(prog(P(`    <p>x</p>`), [A, B]))).toEqual([]);
  });
  test("r2 LOW-A shape: a private `<card>` first, then two files EXPORTING `<card>`", () => {
    const r = prog(P(`    <p>x</p>`), [{ path: "a.scrml", src: `<card t:string/>\n` }, { path: "b.scrml", src: `export <card u:string/>\n` }, { path: "c.scrml", src: `export <card v:string/>\n` }]);
    expect(at(r)).toEqual([]);
  });
  test("three files exporting one name", () => {
    const A = lib("a.scrml", FN("helper", "export "));
    const B = lib("b.scrml", FN("helper", "export "));
    const C = lib("c.scrml", FN("helper", "export "));
    expect(at(prog(P(`    <p>x</p>`), [A, B, C]))).toEqual([]);
  });
});

describe("2b — a private name never collides with another file's (S473 narrowed)", () => {
  test("two PRIVATE functions of one name in two libraries: clean", () => {
    const A = lib("a.scrml", `${FN("helper")}\n    export fn fromA() -> string {\n        return helper();\n    }`);
    const B = lib("b.scrml", `${FN("helper")}\n    export fn fromB() -> string {\n        return helper();\n    }`);
    clean(prog(`<program>\n    \${ import { fromA } from "./a.scrml"; import { fromB } from "./b.scrml"; }\n    <p>\${fromA()} \${fromB()}</p>\n</program>\n`, [A, B]));
  });
  test("a private name beside an EXPORTED one of its spelling in another file, not imported: clean", () => {
    const A = lib("a.scrml", `${FN("helper", "export ")}\n${USE("a")}`);
    clean(prog(`<program>\n    \${ import { use_a } from "./a.scrml"; }\n    function helper() -> string {\n        return "APP";\n    }\n    <p>\${use_a()} \${helper()}</p>\n</program>\n`, [A]));
  });
  test("the page's private `<card>` component beside a library's exported `fn card`: clean", () => {
    const A = lib("a.scrml", `    export fn card() -> int {\n        return 1;\n    }`);
    clean(prog(P(`    <card x:string/>\n    renders <p>\${x}</p>`), [A]));
  });
  test("a program cell beside another file's exported function of its name, not imported: clean", () => {
    const A = lib("a.scrml", `    export fn count() -> int {\n        return 1;\n    }`);
    clean(prog(P(`    let <count:int=0/>`), [A]));
  });
  // s474 (door 3): was E-COMPONENT-NAME-DUPLICATE (S473 item 4) — the scope key is per file now
  test("two components of one name in two files: clean (S474 door 3)", () => {
    const A = { path: "a.scrml", src: `export <card t:string/>\nrenders <div>\${t}</div>\n` };
    clean(prog(P(`    <card x:string/>\n    renders <p>\${x}</p>`), [A]));
  });
  // s474 (door 3): was the bootstrap limit E-BOOTSTRAP-UNSUPPORTED (g-boot-decl-same-name-noncomponent-s473)
  test("a private non-component declaration pair: clean (S474 door 3)", () => {
    const A = { path: "a.scrml", src: `export <card t:string/>\n` };
    clean(prog(P(`    <card x:string/>\n    renders <p>\${x}</p>`), [A]));
  });
});

describe("2c — one file: the §7.6 file scope (cells included) and the import-vs-local rule", () => {
  test("a program cell and a function of its name, one file", () => {
    const src = P(`    let <count:int=0/>\n    function count() -> int {\n        return 1;\n    }`);
    const r = prog(src);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
    expect(errs(r)[0].message).toContain("app.scrml:2:");
  });
  test("a program cell and a type of its name, one file", () => {
    expect(at(prog(P(`    let <tone:string="x"/>\n    type tone:enum = { A, B }`)))).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("a constant beside a cell of its name keeps E-NAME-COLLIDES-STATE (one report)", () => {
    expect(at(prog(P(`    let <count:int=0/>\n    \${ const count = 1; }`)))).toEqual([["E-NAME-COLLIDES-STATE", ENTRY]]);
  });
  test("a program cell beside a user IMPORT of its name: E-SCOPE-010 at the cell", () => {
    const A = lib("a.scrml", `    export const count = 3;\n${USE("a")}`);
    expect(at(prog(P(`    \${ import { count } from "./a.scrml"; }\n    let <count:int=0/>`), [A]))).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("review MED-1: a program cell beside a STDLIB import of its name (a function, a type): E-SCOPE-010", () => {
    const r1 = std(`<program>\n    \${ import { pub } from "scrml:vis"; }\n    let <pub:int=0/>\n    <p>\${pub("x")}</p>\n</program>\n`);
    expect(at(r1)).toEqual([["E-SCOPE-010", ENTRY]]);
    expect(errs(r1)[0].message).toContain("scrml:vis");
    const r2 = std(`<program>\n    \${ import { Tone } from "scrml:vis"; }\n    let <Tone:int=0/>\n    <p>x</p>\n</program>\n`);
    expect(at(r2)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("a file that declares a name AND imports it: one report (linkage's, at the import)", () => {
    const A = lib("a.scrml", `    export fn twice(n: int) -> int {\n        return n * 2;\n    }`);
    const src = P(`    \${ import { twice } from "./a.scrml"; }\n    function twice(n: int) -> int {\n        return n + n;\n    }`);
    const r = prog(src, [A]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
    expect(errs(r)[0].span.start).toBeLessThan(src.indexOf("function twice"));
  });
  test("review LOW-2: importing `<card>` and declaring one: one report, not two", () => {
    const A = { path: "a.scrml", src: `export <card t:string/>\n` };
    const r = prog(P(`    \${ import { card } from "./a.scrml"; }\n    <card x:string/>`), [A]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("r2 LOW-B: importing a COMPONENT `<card>` and declaring one: one report (linkage's), not two", () => {
    const A = { path: "a.scrml", src: `export <card t:string/>\nrenders <div>\${t}</div>\n` };
    const r = prog(P(`    \${ import { card } from "./a.scrml"; }\n    <card x:string/>\n    renders <p>\${x}</p>`), [A]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("nit: E-NAME-COLLIDES-STATE names the cell by file:line:col", () => {
    const r = prog(P(`    let <count:int=0/>\n    \${ const count = 1; }`));
    expect(errs(r)[0].message).toContain("app.scrml:2:");
  });
  test("review LOW-1: a cell beside a `<card>` of its file and another file's private `fn card` — one report, not two at one span", () => {
    const X = lib("x.scrml", `    fn card() -> int {\n        return 1;\n    }\n${USE("x")}`);
    const r = prog(P(`    let <card:int=0/>\n    <card t:string/>`), [X]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("review LOW-1: an owned pair does not hide an unowned clash of the same binding", () => {
    // b.scrml: `export <card>` (a component) beside a.scrml's exported component — legal since s474
    // (door 3; was E-COMPONENT-NAME-DUPLICATE) — AND beside b.scrml's own later `fn card` (file
    // scope, E-SCOPE-010: kept, PERMANENT). The one-file clash is still reported.
    const A = { path: "a.scrml", src: `export <card t:string/>\nrenders <div>\${t}</div>\n` };
    const B = { path: "b.scrml", src: `export <card u:string/>\nrenders <i>\${u}</i>\n\${\n    fn card() -> int {\n        return 1;\n    }\n}\n` };
    const r = prog(P(`    <p>x</p>`), [A, B]);
    expect(at(r)).toEqual([["E-SCOPE-010", "b.scrml"]]);
  });
});

describe("2d — not program-level bindings: unchanged", () => {
  test("an imported name used in two files is one declaration, not two", () => {
    const A = lib("a.scrml", `    export fn shout(s: string) -> string {\n        return s + "!";\n    }`);
    const B = lib("b.scrml", `    import { shout } from "./a.scrml";\n    export fn viaB() -> string {\n        return shout("b");\n    }`);
    clean(prog(`<program>\n    \${ import { shout } from "./a.scrml"; import { viaB } from "./b.scrml"; }\n    <p>\${shout("a")} \${viaB()}</p>\n</program>\n`, [A, B]));
  });
  test("a parameter, a local, a loop binder named like another file's exported function: clean", () => {
    const A = lib("a.scrml", `    export fn size() -> int {\n        return 1;\n    }`);
    clean(prog(`<program>\n    \${ import { size } from "./a.scrml"; }\n    function grow(size: int) -> int {\n        const n: int = size + 1;\n        return n;\n    }\n    function total(xs: int[]) -> int {\n        let s: int = size();\n        for (const size of xs) { s = s + size; }\n        return s;\n    }\n    <p>\${grow(size())} \${total([1, 2])}</p>\n</program>\n`, [A]));
  });
  test("a stdlib module's private name: the page may bind it (fixture scrml:vis has a private `helper`)", () => {
    const r = std(`<program>\n    \${ import { pub } from "scrml:vis"; }\n    function helper() -> string {\n        return "app";\n    }\n    <p>\${pub("x")} \${helper()}</p>\n</program>\n`);
    expect(r.stdlib.refused).toEqual([]);
    clean(r);
  });
});
