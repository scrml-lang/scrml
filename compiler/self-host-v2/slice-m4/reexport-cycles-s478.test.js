// reexport-cycles-s478.test.js — s478-boot-modules: the bootstrap reads the §21.4 re-export forms
// and REPORTS an import cycle (E-IMPORT-002) instead of breaking it silently.
//
// Gaps: g-boot-reexport-from-s473 (the re-export forms were E-PARSE-ITEM "found `{`"), and
// g-boot-import-cycle-unreported-s473 (link.scrml placed a cyclic file by path order and said
// nothing).
//
// SPEC §21.4 (ruling:user-voice-scrml.md S458 "ratify 21.4", S462 Q19):
//   - "A re-export (named, renamed `export { a as b } from`, or `export * from`) SHALL link its
//     source module exactly as an `import` of that specifier does (§21.3). The name it binds is the
//     same binding the source module exports: it resolves to the module that DECLARES it."
//   - "`export * from './m.scrml'` SHALL re-export every name `./m.scrml` exports by name … including
//     names `./m.scrml` itself re-exports."
//   - "A name the file exports explicitly … SHALL take precedence over every `export *` of the file"
//   - "A name that two or more `export *` sources of one file resolve to DIFFERENT declarations is
//     ambiguous … Importing it by name … SHALL be a compile error (E-IMPORT-004); the message SHALL
//     say the name is ambiguous and name the stars that disagree. An ambiguous name that is never
//     imported or re-exported by name is not an error. The SAME declaration reached through two or
//     more paths (a diamond) is not ambiguous."
//   - "Re-export edges … are edges of the import graph, so a cycle closed by a re-export SHALL be a
//     compile error (E-IMPORT-002, §21.3)."
//   - "A named re-export of a name its source module does not export SHALL be a compile error
//     (E-IMPORT-004), reported at the re-export"
//   - "A relative re-export … whose target file cannot be found SHALL be a compile error
//     (E-IMPORT-006), reported at the re-export. A name only that missing module could supply SHALL
//     NOT be reported again as E-IMPORT-004 at an importer."
//   - "An `export *` from a module outside the compilation — a stdlib `scrml:` module … — SHALL NOT be
//     expanded … Importing a name that file reaches only that way SHALL be a compile error
//     (E-IMPORT-004), and the message SHALL name the unexpanded star … A named re-export from a
//     `scrml:` module SHALL be checked against that module's exports"
// SPEC §21.3: "Circular imports SHALL be a compile error (E-IMPORT-002). The compiler SHALL detect
// cycles in the import graph before any stage runs and report all files in the cycle." — every
// cycle (§21.3 names none that is allowed): through the entry, of one file (a self-import), of
// imports only, of re-exports only, mixed.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { join } from "node:path";
import { loadM2, frontEnd } from "./harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const ENTRY = "app.scrml";
const FIXTURE = join(import.meta.dir, "src", "stdlib-s471");
const prog = (files) => frontEnd(mods, files, ENTRY);
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const at = (r) => errs(r).map((d) => [d.code, d.file]);
const clean = (r) => {
  expect(r.diags.map((d) => `${d.code} ${d.file}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const $ = (sel) => document.querySelector(sel);
let k = 0;

// a logic-block module
const mod = (path, body) => ({ path, src: `\${\n${body}\n}\n` });
const LIB = mod("lib.scrml", `    export fn greet(n: string) -> string {\n        return "hi " + n;\n    }\n    export type Box:struct = { v: string }\n    export type Hue:enum = { Red, Blue }\n    export const ANSWER = 42;`);
// the entry: its imports, then a program body
const app = (imports, body, fns = "") => ({ path: ENTRY, src: `<program>\n    \${ ${imports}${fns} }\n    <main>${body}</main>\n</program>\n` });
const USE_ALL = `
    fn open(b: Box) -> string {
        return b.v;
    }
    fn hue(h: Hue) -> string {
        return match h {
            .Red :> "r",
            .Blue :> "b",
        };
    }
    fn mk() -> string {
        const b: Box = { v: "boxed" };
        return open(b);
    }`;
const ALL_BODY = `<p id="g">\${greet("ann")}</p><p id="o">\${mk()}</p><p id="h">\${hue(.Blue)}</p><p id="a">\${ANSWER}</p>`;

describe("§21.4 named re-export: a re-exported function is callable, a re-exported type usable", () => {
  test("parse: `export { a, b as c } from \"…\";` is one re-export item; link reads it as an edge, scope does not", () => {
    const items = mods.parse.parseFile("r.scrml", `\${\n    export { greet, Box as Crate } from "./lib.scrml";\n    export * from "./other.scrml";\n    export { mine };\n}\n`, 0).ast.items;
    expect(mods.link.importsOfItems(items)).toEqual([]);
    const re = mods.link.reexportsOfItems(items);
    expect(re.map((r) => [r.re, r.from, r.names.map((n) => [n.orig, n.name])])).toEqual([
      ["Reexport", "./lib.scrml", [["greet", "greet"], ["Box", "Crate"]]],
      ["ReexportAll", "./other.scrml", []],
    ]);
    expect(mods.link.localExportsOfItems(items).map((r) => [r.re, r.from, r.names.map((n) => n.name)])).toEqual([["ExportList", "", ["mine"]]]);
    expect(mods.link.linkFromsOfItems(items).map((r) => r.from)).toEqual(["./lib.scrml", "./other.scrml"]);
  });
  test("RUNS: function, struct type, enum and constant through `export { … } from` (was E-PARSE-ITEM)", async () => {
    const R = mod("barrel.scrml", `    export { greet, Box, Hue, ANSWER } from "./lib.scrml";`);
    const r = clean(prog([LIB, R, app(`import { greet, Box, Hue, ANSWER } from "./barrel.scrml";`, ALL_BODY, USE_ALL)]));
    await loadProgram(r.core, "s478-reexport-named-" + k++);
    expect($("#g").textContent).toBe("hi ann");
    expect($("#o").textContent).toBe("boxed");
    expect($("#h").textContent).toBe("b");
    expect($("#a").textContent).toBe("42");
  });
  test("RUNS: a RENAMED re-export binds the declaration under its new name; the old name is not exported", async () => {
    const R = mod("barrel.scrml", `    export { greet as hello, Box as Crate } from "./lib.scrml";`);
    const fns = `\n    fn mk() -> string {\n        const b: Crate = { v: "crated" };\n        return b.v;\n    }`;
    const r = clean(prog([LIB, R, app(`import { hello, Crate } from "./barrel.scrml";`, `<p id="g">\${hello("bo")}</p><p id="o">\${mk()}</p>`, fns)]));
    await loadProgram(r.core, "s478-reexport-renamed-" + k++);
    expect($("#g").textContent).toBe("hi bo");
    expect($("#o").textContent).toBe("crated");
    const old = prog([LIB, R, app(`import { greet } from "./barrel.scrml";`, `<p>\${greet("x")}</p>`)]);
    expect(at(old)).toEqual([["E-IMPORT-004", ENTRY]]);
    expect(errs(old)[0].message).toContain("`greet` is not exported by `./barrel.scrml`");
  });
  test("a re-export binds nothing in the re-exporting file's scope (ES semantics): a use there is E-SCOPE-001", () => {
    const R = mod("barrel.scrml", `    export { greet } from "./lib.scrml";\n    export fn twice(n: string) -> string {\n        return greet(n) + greet(n);\n    }`);
    const r = prog([LIB, R, app(`import { twice } from "./barrel.scrml";`, `<p>\${twice("x")}</p>`)]);
    expect(at(r)).toEqual([["E-SCOPE-001", "barrel.scrml"], ["E-SCOPE-001", "barrel.scrml"]]);
  });
  test("a namespace import over a re-exporting module reaches the re-exported member (§21.3 rule 1)", async () => {
    const R = mod("barrel.scrml", `    export { greet as outer } from "./lib.scrml";\n    export fn own() -> string {\n        return "own";\n    }`);
    const r = clean(prog([LIB, R, { path: ENTRY, src: `import * as b from "./barrel.scrml";\n<program>\n    <main><p id="o">\${b.outer("ns")}</p><p id="w">\${b.own()}</p></main>\n</program>\n` }]));
    await loadProgram(r.core, "s478-reexport-ns-" + k++);
    expect($("#o").textContent).toBe("hi ns");
    expect($("#w").textContent).toBe("own");
  });
  test("a re-export inside a `<program>` body is read too (an item position, like an import)", () => {
    const R = mod("barrel.scrml", `    export { greet } from "./lib.scrml";`);
    const items = mods.parse.parseFile(ENTRY, `<program>\n    export { x } from "./lib.scrml";\n    <main><p>a</p></main>\n</program>\n`, 0);
    expect(items.diags.map((d) => d.code)).toEqual([]);
    clean(prog([LIB, R, app(`import { greet } from "./barrel.scrml";`, `<p>\${greet("x")}</p>`)]));
  });
});

describe("§21.4 `export *`", () => {
  test("RUNS: every name, types and enums included, through a star", async () => {
    const R = mod("barrel.scrml", `    export * from "./lib.scrml";`);
    const r = clean(prog([LIB, R, app(`import { greet, Box, Hue, ANSWER } from "./barrel.scrml";`, ALL_BODY, USE_ALL)]));
    await loadProgram(r.core, "s478-reexport-star-" + k++);
    expect($("#g").textContent).toBe("hi ann");
    expect($("#o").textContent).toBe("boxed");
    expect($("#h").textContent).toBe("b");
    expect($("#a").textContent).toBe("42");
  });
  test("RUNS: a star of a module that itself re-exports (names it re-exports included), and a diamond is not ambiguous", async () => {
    const MID = mod("mid.scrml", `    export * from "./lib.scrml";\n    export const MID = "mid";`);
    const TOP = mod("top.scrml", `    export * from "./mid.scrml";\n    export { greet } from "./lib.scrml";\n    export * from "./lib.scrml";`);
    const r = clean(prog([LIB, MID, TOP, app(`import { greet, MID, ANSWER } from "./top.scrml";`, `<p id="g">\${greet(MID)}</p><p id="a">\${ANSWER}</p>`)]));
    await loadProgram(r.core, "s478-reexport-chain-" + k++);
    expect($("#g").textContent).toBe("hi mid");
    expect($("#a").textContent).toBe("42");
  });
  const C = mod("c.scrml", `    export fn w() -> string {\n        return "c";\n    }`);
  const D = mod("d.scrml", `    export fn w() -> string {\n        return "d";\n    }\n    export fn onlyD() -> string {\n        return "od";\n    }`);
  test("two stars binding one name to DIFFERENT declarations: importing it is E-IMPORT-004, saying it is ambiguous and naming both stars", () => {
    const B = mod("b.scrml", `    export * from "./c.scrml";\n    export * from "./d.scrml";`);
    const r = prog([C, D, B, app(`import { w } from "./b.scrml";`, `<p>\${w()}</p>`)]);
    expect(at(r)).toEqual([["E-IMPORT-004", ENTRY]]);
    const m = errs(r)[0].message;
    expect(m).toContain("`w` is ambiguous in `./b.scrml`");
    expect(m).toContain('`export * from "./c.scrml"`');
    expect(m).toContain('`export * from "./d.scrml"`');
  });
  test("…an ambiguous name never imported is not an error; the other names of the stars still come through", async () => {
    const B = mod("b.scrml", `    export * from "./c.scrml";\n    export * from "./d.scrml";`);
    const r = clean(prog([C, D, B, app(`import { onlyD } from "./b.scrml";`, `<p id="d">\${onlyD()}</p>`)]));
    await loadProgram(r.core, "s478-reexport-amb-unused-" + k++);
    expect($("#d").textContent).toBe("od");
  });
  test("RUNS: an explicit re-export wins over the stars (the SPEC's fix for the ambiguity)", async () => {
    const B = mod("b.scrml", `    export { w } from "./d.scrml";\n    export * from "./c.scrml";\n    export * from "./d.scrml";`);
    const r = clean(prog([C, D, B, app(`import { w } from "./b.scrml";`, `<p id="w">\${w()}</p>`)]));
    await loadProgram(r.core, "s478-reexport-explicit-wins-" + k++);
    expect($("#w").textContent).toBe("d");
  });
  test("RUNS: a LOCAL export wins over a star of the same name", async () => {
    const B = mod("b.scrml", `    export * from "./c.scrml";\n    export fn w() -> string {\n        return "b";\n    }`);
    const r = clean(prog([C, B, app(`import { w } from "./b.scrml";`, `<p id="w">\${w()}</p>`)]));
    await loadProgram(r.core, "s478-reexport-local-wins-" + k++);
    expect($("#w").textContent).toBe("b");
  });
  test("an ambiguous name of a star SOURCE stays ambiguous one level up (re-exporting it by name is E-IMPORT-004 at the re-export)", () => {
    const B = mod("b.scrml", `    export * from "./c.scrml";\n    export * from "./d.scrml";`);
    const T = mod("t.scrml", `    export * from "./b.scrml";`);
    const r1 = prog([C, D, B, T, app(`import { w } from "./t.scrml";`, `<p>\${w()}</p>`)]);
    expect(at(r1)).toEqual([["E-IMPORT-004", ENTRY]]);
    expect(errs(r1)[0].message).toContain("is ambiguous");
    const N = mod("n.scrml", `    export { w } from "./b.scrml";`);
    const r2 = prog([C, D, B, N, app(`import { w } from "./n.scrml";`, `<p>\${w()}</p>`)]);
    expect(at(r2)).toEqual([["E-IMPORT-004", "n.scrml"]]);
    expect(errs(r2)[0].message).toContain("is ambiguous");
  });
});

describe("§21.4 faults at the re-export, never again at the importer", () => {
  test("a named re-export of a name its source does not export: E-IMPORT-004 at the re-export only", () => {
    const B = mod("b.scrml", `    export { greet, Nope } from "./lib.scrml";`);
    const r = prog([LIB, B, app(`import { greet, Nope } from "./b.scrml";`, `<p>\${greet("x")}</p>`)]);
    expect(at(r)).toEqual([["E-IMPORT-004", "b.scrml"]]);
    expect(errs(r)[0].message).toContain("`Nope` is not exported by `./lib.scrml`");
    const span = errs(r)[0].span;
    expect(B.src.slice(span.start, span.end)).toBe("Nope");
  });
  test("a named re-export of a missing file: E-IMPORT-006 at the re-export; the importer is not reported", () => {
    const B = mod("b.scrml", `    export { M1 } from "./missing.scrml";`);
    const r = prog([B, app(`import { M1 } from "./b.scrml";`, `<p>\${M1}</p>`)]);
    expect(at(r)).toEqual([["E-IMPORT-006", "b.scrml"]]);
  });
  test("a star of a missing file: E-IMPORT-006 at the star; a name only it could supply is not reported at the importer", () => {
    const B = mod("b.scrml", `    export * from "./missing2.scrml";\n    export const HERE = 1;`);
    const r = prog([B, app(`import { M2, HERE } from "./b.scrml";`, `<p>\${HERE}</p>`)]);
    expect(at(r)).toEqual([["E-IMPORT-006", "b.scrml"]]);
  });
  test("one exported name naming two declarations (a local export and a named re-export) is refused (E-SCOPE-010)", () => {
    const B = mod("b.scrml", `    export { greet } from "./lib.scrml";\n    export fn greet(n: string) -> string {\n        return n;\n    }`);
    const r = prog([LIB, B, app(`import { greet } from "./b.scrml";`, `<p>\${greet("x")}</p>`)]);
    expect(at(r)).toContainEqual(["E-SCOPE-010", "b.scrml"]);
  });
  test("the same declaration re-exported twice under one name is not a clash", () => {
    const B = mod("b.scrml", `    export { greet } from "./lib.scrml";\n    export { greet } from "./lib.scrml";`);
    clean(prog([LIB, B, app(`import { greet } from "./b.scrml";`, `<p>\${greet("x")}</p>`)]));
  });
});

describe("§21.4 stdlib re-exports (fixture stdlib root)", () => {
  const fe = (files) => frontEndStdlib(mods, files, ENTRY, { stdlibRoot: FIXTURE });
  test("RUNS: a named re-export of a `scrml:` module's export (the module is supplied through the re-export)", async () => {
    const B = mod("b.scrml", `    export { greet } from "scrml:greet";`);
    const r = clean(fe([B, app(`import { greet } from "./b.scrml";`, `<p id="g">\${greet("st")}</p>`)]));
    await loadProgram(r.core, "s478-reexport-stdlib-" + k++);
    expect($("#g").textContent).toBe("Hello, ST!");
  });
  test("a named re-export of a name the `scrml:` module does not export: E-IMPORT-004 at the re-export", () => {
    const B = mod("b.scrml", `    export { greet, NotAThing } from "scrml:greet";`);
    const r = fe([B, app(`import { greet } from "./b.scrml";`, `<p>\${greet("x")}</p>`)]);
    expect(at(r)).toEqual([["E-IMPORT-004", "b.scrml"]]);
    expect(errs(r)[0].message).toContain("`NotAThing` is not exported by `scrml:greet`");
  });
  test("an `export *` from a `scrml:` module is NOT expanded: importing through it is E-IMPORT-004 naming the star and the explicit fix", () => {
    const B = mod("b.scrml", `    export * from "scrml:greet";`);
    const r = fe([B, app(`import { greet } from "./b.scrml";`, `<p>\${greet("x")}</p>`)]);
    expect(at(r)).toEqual([["E-IMPORT-004", ENTRY]]);
    const m = errs(r)[0].message;
    expect(m).toContain('`export * from "scrml:greet"`');
    expect(m).toContain("not expanded");
    expect(m).toContain('export { greet } from "scrml:greet";');
  });
});

describe("§21.3 E-IMPORT-002: every import cycle is reported, at every file in it", () => {
  const A = mod("a.scrml", `    import { fromB } from "./b.scrml";\n    export fn fromA() -> string {\n        return "a";\n    }`);
  const B = mod("b.scrml", `    import { fromA } from "./a.scrml";\n    export fn fromB() -> string {\n        return fromA();\n    }`);
  test("two files importing each other: one E-IMPORT-002 per file, at its import, naming the cycle (was: compiled clean)", () => {
    const r = prog([A, B, app(`import { fromB } from "./b.scrml";`, `<p>\${fromB()}</p>`)]);
    expect(at(r)).toEqual([["E-IMPORT-002", "a.scrml"], ["E-IMPORT-002", "b.scrml"]]);
    const m = errs(r)[0].message;
    expect(m).toContain("`a.scrml` → `b.scrml` → `a.scrml`");
    const span = errs(r)[0].span;
    expect(A.src.slice(span.start, span.end)).toContain('import { fromB } from "./b.scrml"');
  });
  test("the report does not depend on the order the files are handed in", () => {
    const one = prog([A, B, app(`import { fromB } from "./b.scrml";`, `<p>\${fromB()}</p>`)]);
    const two = prog([app(`import { fromB } from "./b.scrml";`, `<p>\${fromB()}</p>`), B, A]);
    expect(two.diags.map((d) => [d.code, d.file, d.span.start, d.message])).toEqual(one.diags.map((d) => [d.code, d.file, d.span.start, d.message]));
  });
  test("a cycle through the ENTRY is a cycle", () => {
    const L = mod("l.scrml", `    import { fromEntry } from "./app.scrml";\n    export fn fromL() -> string {\n        return "l";\n    }`);
    const E = { path: ENTRY, src: `\${\n    import { fromL } from "./l.scrml";\n    export fn fromEntry() -> string {\n        return "e";\n    }\n}\n<program>\n    <main><p>\${fromL()}</p></main>\n</program>\n` };
    const r = prog([L, E]);
    expect(at(r)).toEqual([["E-IMPORT-002", "l.scrml"], ["E-IMPORT-002", ENTRY]]);
  });
  test("a file importing itself is a cycle of one", () => {
    const S = mod("s.scrml", `    import { s2 } from "./s.scrml";\n    export fn s2() -> string {\n        return "s";\n    }`);
    const r = prog([S, app(`import { s2 } from "./s.scrml";`, `<p>\${s2()}</p>`)]);
    expect(at(r)).toContainEqual(["E-IMPORT-002", "s.scrml"]);
    expect(errs(r).find((d) => d.code === "E-IMPORT-002").message).toContain("imports itself");
  });
  test("a three-file cycle reports all three files", () => {
    const X = mod("x.scrml", `    import { y } from "./y.scrml";\n    export const x = 1;`);
    const Y = mod("y.scrml", `    import { z } from "./z.scrml";\n    export const y = 2;`);
    const Z = mod("z.scrml", `    import { x } from "./x.scrml";\n    export const z = 3;`);
    const r = prog([X, Y, Z, app(`import { x } from "./x.scrml";`, `<p>\${x}</p>`)]);
    const cyc = errs(r).filter((d) => d.code === "E-IMPORT-002");
    expect(cyc.map((d) => d.file).sort()).toEqual(["x.scrml", "y.scrml", "z.scrml"]);
    expect(cyc.find((d) => d.file === "x.scrml").message).toContain("`x.scrml` → `y.scrml` → `z.scrml` → `x.scrml`");
  });
  test("cycles closed by re-exports — named, star, mixed with an import — are the one error (no E-IMPORT-004)", () => {
    const named = prog([mod("x.scrml", `    export const A = "aa";\n    export { B } from "./y.scrml";`), mod("y.scrml", `    export const B = "bb";\n    export { A } from "./x.scrml";`),
      app(`import { A, B } from "./x.scrml";`, `<p>\${A + B}</p>`)]);
    expect(at(named)).toEqual([["E-IMPORT-002", "x.scrml"], ["E-IMPORT-002", "y.scrml"]]);
    const star = prog([mod("x.scrml", `    export const A = "aa";\n    export * from "./y.scrml";`), mod("y.scrml", `    export const B = "bb";\n    export * from "./x.scrml";`),
      app(`import { A, B } from "./x.scrml";`, `<p>\${A + B}</p>`)]);
    expect(at(star)).toEqual([["E-IMPORT-002", "x.scrml"], ["E-IMPORT-002", "y.scrml"]]);
    const mixed = prog([mod("x.scrml", `    export const A = "aa";\n    export { B } from "./y.scrml";`), mod("y.scrml", `    import { A } from "./x.scrml";\n    export const B = A + "bb";`),
      app(`import { A, B } from "./x.scrml";`, `<p>\${A + B}</p>`)]);
    expect(at(mixed)).toEqual([["E-IMPORT-002", "x.scrml"], ["E-IMPORT-002", "y.scrml"]]);
  });
  // s478 (boot-false-positives; conformance module/e-import-002-circular-import-reject): a
  // constant read across the cycle is one the link order could not initialize first. The read is
  // legal by the rule E-SCOPE-001 states ("… or in a file this one imports"); E-IMPORT-002 owns it.
  test("a constant read across the cycle: E-IMPORT-002 only — no E-SCOPE-001 'read before it is initialized', no untyped-constant refusal", () => {
    const A2 = mod("a.scrml", `    import { fromEntry } from "./app.scrml";\n    export const fromA = fromEntry;`);
    const E = { path: ENTRY, src: `\${\n    import { fromA } from "./a.scrml";\n    export const fromEntry = 1;\n}\n<program>\n    <main><p>\${fromA}</p></main>\n</program>\n` };
    const r = prog([A2, E]);
    expect(at(r)).toEqual([["E-IMPORT-002", "a.scrml"], ["E-IMPORT-002", ENTRY]]);
  });
  test("guard: inside a cyclic file, a SAME-file read before initialization is still E-SCOPE-001", () => {
    const A2 = mod("a.scrml", `    import { fromEntry } from "./app.scrml";\n    export const fromA = later + 1;\n    const later = 2;`);
    const E = { path: ENTRY, src: `\${\n    import { fromA } from "./a.scrml";\n    export const fromEntry = 1;\n}\n<program>\n    <main><p>\${fromA}</p></main>\n</program>\n` };
    const r = prog([A2, E]);
    expect(at(r)).toContainEqual(["E-SCOPE-001", "a.scrml"]);
    expect(at(r)).toContainEqual(["E-IMPORT-002", "a.scrml"]);
  });
  // s478 (review-followups-2, #1895 LOW-3): the untyped-constant refusal is let through only for
  // the read the cycle owns — not for every constant of a file that lies on a cycle.
  test("guard: an untyped constant of a cyclic file that reads nothing across the cycle keeps its refusal", () => {
    const A2 = mod("a.scrml", `    import { fromEntry } from "./app.scrml";\n    export const fromA = fromEntry;\n    export const odd = not;`);
    const E = { path: ENTRY, src: `\${\n    import { fromA } from "./a.scrml";\n    export const fromEntry = 1;\n}\n<program>\n    <main><p>\${fromA}</p></main>\n</program>\n` };
    const r = prog([A2, E]);
    expect(at(r)).toContainEqual(["E-BOOTSTRAP-UNSUPPORTED", "a.scrml"]);
    expect(errs(r).find((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED").message).toContain("`odd` is not known");
  });
  test("a constant built from one the cycle left untyped: E-IMPORT-002 only (no cascade)", () => {
    const A2 = mod("a.scrml", `    import { fromEntry } from "./app.scrml";\n    export const fromA = fromEntry;\n    export const fromA2 = fromA + 1;`);
    const E = { path: ENTRY, src: `\${\n    import { fromA } from "./a.scrml";\n    export const fromEntry = 1;\n}\n<program>\n    <main><p>\${fromA}</p></main>\n</program>\n` };
    const r = prog([A2, E]);
    expect(at(r)).toEqual([["E-IMPORT-002", "a.scrml"], ["E-IMPORT-002", ENTRY]]);
  });
  // #1895 LOW-1: the cycle set is computed once per run (Globals.cycles), not per read.
  test("a ring of 120 files each reading the next: reported, and in linear-ish time", () => {
    const nm = (i) => `f${String(i).padStart(3, "0")}.scrml`;
    const fs = [];
    for (let i = 0; i < 120; i++) {
      const nx = (i + 1) % 120;
      let b = `    import { c${nx}_0 } from "./${nm(nx)}";\n`;
      for (let j = 0; j < 5; j++) b += `    export const c${i}_${j} = c${nx}_0 + ${j};\n`;
      fs.push(mod(nm(i), b));
    }
    const t0 = performance.now();
    const r = prog([...fs, app(`import { c0_0 } from "./f000.scrml";`, `<p>\${c0_0}</p>`)]);
    const ms = performance.now() - t0;
    expect(errs(r).filter((d) => d.code === "E-IMPORT-002").length).toBe(120);
    expect(ms).toBeLessThan(2500);   // was ≈3000ms+ (importCycles per read); ≈150ms now
  });
  test("control: an acyclic diamond of imports is clean", () => {
    const BASE = mod("base.scrml", `    export const V = "v";`);
    const L = mod("l.scrml", `    import { V } from "./base.scrml";\n    export fn l() -> string {\n        return V;\n    }`);
    const R = mod("r.scrml", `    import { V } from "./base.scrml";\n    export fn r() -> string {\n        return V;\n    }`);
    clean(prog([BASE, L, R, app(`import { l } from "./l.scrml"; import { r } from "./r.scrml";`, `<p>\${l() + r()}</p>`)]));
  });
});

describe("the forms' edges (parse)", () => {
  const parse = (src) => mods.parse.parseFile("m.scrml", src, 0);
  test("`export * as ns from` is not a §21.4 form: refused by name", () => {
    const r = parse(`\${\n    export * as ns from "./lib.scrml";\n}\n`);
    expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("export * as name");
  });
  test("`export *` with no `from`: E-PARSE-EXPORT", () => {
    expect(parse(`\${\n    export *;\n}\n`).diags.map((d) => d.code)).toEqual(["E-PARSE-EXPORT"]);
  });
  test("a re-export is a statement: it takes its `;` (dpa-073)", () => {
    expect(parse(`\${\n    export { a } from "./x.scrml"\n}\n`).diags.map((d) => d.code)).toEqual(["E-STMT-MISSING-SEMICOLON"]);
    expect(parse(`\${\n    export * from "./x.scrml"\n}\n`).diags.map((d) => d.code)).toEqual(["E-STMT-MISSING-SEMICOLON"]);
  });
  test("specifiers are comma-separated; a keyword is no exported name", () => {
    expect(parse(`\${\n    export { a b } from "./x.scrml";\n}\n`).diags.map((d) => d.code)).toEqual(["E-PARSE-EXPORT"]);
    expect(parse(`\${\n    export { a as default } from "./x.scrml";\n}\n`).diags.map((d) => d.code)).toEqual(["E-PARSE-EXPORT"]);
  });
});

describe("a local export list (`export { a };`)", () => {
  test("naming a `<program>` cell: E-EXPORT-001 (§21.2)", () => {
    const r = prog([{ path: ENTRY, src: `<program>\n    <count:number=0/>\n    export { count };\n    <p>\${@count}</p>\n</program>\n` }]);
    expect(at(r)).toEqual([["E-EXPORT-001", ENTRY]]);
  });
  test("naming anything else: refused by name (INTERIM — write `export` before the declaration)", () => {
    const r = prog([mod("m.scrml", `    fn f() -> string {\n        return "f";\n    }\n    export { f };`), app(`import { f } from "./m.scrml";`, `<p>\${f()}</p>`)]);
    expect(at(r)).toContainEqual(["E-BOOTSTRAP-UNSUPPORTED", "m.scrml"]);
    expect(errs(r).find((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED").message).toContain("local export list");
  });
});
