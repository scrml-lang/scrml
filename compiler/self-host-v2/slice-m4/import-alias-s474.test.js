// import-alias-s474.test.js — s474-boot-import-alias: the bootstrap reads `import { X as Y }`
// (g-boot-import-codes-and-alias-s471, raised to MED by the #1706 review, F5).
//
// Why it is owed: since #1706 (S474 door 3, user-voice-scrml.md "⭐ RULED — permanent-restrictions
// re-review: the four one-way doors", item 3) two USER files may each export one name, and importing
// both into one file is E-SCOPE-010 at the later import. The way out is an alias; under
// "⭐ RULED — FORK RULE row C: capability first" (S474) it has to exist.
//
// SPEC: §21.3 "Imports use ES module `import` syntax"; §21.4 names the renamed re-export
// `export { a as b } from`; §21.3.1 `named-binding ::= identifier ('as' identifier)?` (host imports,
// which already had it). The local name refers to the ORIGINAL declaration: a lookup takes the
// declaration of (declaring file, exported name), so a component used as `<card2/>` renders the
// original `<card>`, with its declaring file's scope key `card~<tag>`.
//
// What the bootstrap does now:
//   - `import { a as b }` binds `b` to the export `a` (a component, function, type, enum, const);
//     `a` itself is not bound by it;
//   - E-SCOPE-010 is judged on LOCAL names: `import { Card } from "./a"; import { Card as Card2 }
//     from "./b"` is legal; two imports binding one local name to different declarations stay
//     E-SCOPE-010; the same declaration twice under one name stays the §41.7 W-IMPORT-001;
//   - an alias of a name the file does not export is E-IMPORT-004 (naming the exported name); an
//     alias colliding with a declaration of the file is E-SCOPE-010; `as` with no name after it is
//     E-PARSE-IMPORT;
//   - a namespace import (`import * as m`) and a default import (`import X from`) are refused BY NAME
//     (one E-BOOTSTRAP-UNSUPPORTED; was a wall of E-PARSE-IMPORT and a spurious E-IMPORT-005).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const ENTRY = "app.scrml";
const prog = (files) => frontEnd(mods, files, ENTRY);
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const at = (r) => errs(r).map((d) => [d.code, d.file]);
const clean = (r) => {
  expect(r.diags.map((d) => `${d.code} ${d.file}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r;
};
const printed = (r) => mods.print.printProgram(r.core, "x.client.js", "scrml-runtime.js");
const tag = (path) => mods.core.fileTag(path);
const key = (path, name) => mods.core.scopeKey(path, name);
const $ = (sel) => document.querySelector(sel);
const color = (sel) => window.getComputedStyle($(sel)).color;
let k = 0;

// Two files each exporting a `<card>`, each with its own style.
const CA = { path: "ui/a.scrml", src: `export <card t:string/>\nrenders <div class="c" id="ca">#{ .c { color: red; } }<span class="c" id="ca-t">\${t}</span></div>\n` };
const CB = { path: "ui/b.scrml", src: `export <card t:string/>\nrenders <div class="c" id="cb">#{ .c { color: green; } }<span class="c" id="cb-t">\${t}</span></div>\n` };
const BOTH = {
  path: ENTRY,
  src: `import { card } from "./ui/a.scrml";\nimport { card as card2 } from "./ui/b.scrml";\n<program>\n    <main><card t="1"/><card2 t="2"/></main>\n</program>\n`,
};

// Two libraries exporting a function `Card`.
const LIB = (path, word) => ({ path, src: `\${\n    export fn Card() -> string {\n        return "${word}";\n    }\n}\n` });
const useFns = (imports, body) => ({ path: ENTRY, src: `<program>\n    \${ ${imports} }\n    <main>${body}</main>\n</program>\n` });

describe("two `<card>`s from two files, one aliased: both render, each with its own style", () => {
  test("no diagnostic (was E-SCOPE-010 at the later import, and before #1706 `as` / `card2` read as imported names)", () => {
    clean(prog([CA, CB, BOTH]));
  });
  test("the alias renders the ORIGINAL declaration: its declaring file's key, never `card2`", () => {
    const out = printed(clean(prog([CA, CB, BOTH])));
    const a = key("ui/a.scrml", "card");
    const b = key("ui/b.scrml", "card");
    expect(a).not.toBe(b);
    expect(out.html).toContain(`@scope ([data-scrml="${a}"]) to ([data-scrml]) {\n  :where(.c), :where(:scope.c) { color: red; }\n}`);
    expect(out.html).toContain(`@scope ([data-scrml="${b}"]) to ([data-scrml]) {\n  :where(.c), :where(:scope.c) { color: green; }\n}`);
    expect(out.html).toContain(`<template id="scrml:${a}"><div class="c" id="ca" data-scrml="${a}">`);
    expect(out.html).toContain(`<template id="scrml:${b}"><div class="c" id="cb" data-scrml="${b}">`);
    // the local name is no output name
    expect(out.html).not.toContain("card2");
    expect(out.js).not.toContain("card2");
    expect(out.js).toContain(`mk_card_${tag("ui/a.scrml")}`);
    expect(out.js).toContain(`mk_card_${tag("ui/b.scrml")}`);
  });
  test("in the browser (happy-dom): each instance gets only its own CSS and its own props", async () => {
    const r = clean(prog([CA, CB, BOTH]));
    await loadProgram(r.core, "s474-alias-cards-" + k++);
    expect(color("#ca-t")).toBe("red");
    expect(color("#cb-t")).toBe("green");
    expect($("#ca").getAttribute("data-scrml")).toBe(key("ui/a.scrml", "card"));
    expect($("#cb").getAttribute("data-scrml")).toBe(key("ui/b.scrml", "card"));
    expect($("#ca-t").textContent).toBe("1");
    expect($("#cb-t").textContent).toBe("2");
  });
  test("both aliased (neither keeps its own name), inside another declaration's renders", async () => {
    const M = {
      path: ENTRY,
      src: `import { card as red } from "./ui/a.scrml";\nimport { card as green } from "./ui/b.scrml";\n<pair x:string/>\nrenders <section><red t=x/><green t=x/></section>\n<program>\n    <main><pair x="p"/></main>\n</program>\n`,
    };
    const r = clean(prog([CA, CB, M]));
    await loadProgram(r.core, "s474-alias-both-" + k++);
    expect(color("#ca-t")).toBe("red");
    expect(color("#cb-t")).toBe("green");
    expect($("#ca-t").textContent).toBe("p");
    expect($("#cb-t").textContent).toBe("p");
  });
});

describe("aliasing a function, a type, an enum and a constant", () => {
  test("a function: `Card` from a.scrml and `Card as Card2` from b.scrml each call their own", async () => {
    const r = clean(prog([LIB("a.scrml", "from-a"), LIB("b.scrml", "from-b"),
      useFns(`import { Card } from "./a.scrml"; import { Card as Card2 } from "./b.scrml";`, `<p id="a">\${Card()}</p><p id="b">\${Card2()}</p>`)]));
    await loadProgram(r.core, "s474-alias-fn-" + k++);
    expect($("#a").textContent).toBe("from-a");
    expect($("#b").textContent).toBe("from-b");
  });
  test("one function under two names (`{ Card, Card as Again }`): both call it", async () => {
    const r = clean(prog([LIB("a.scrml", "same"), useFns(`import { Card, Card as Again } from "./a.scrml";`, `<p id="a">\${Card()}</p><p id="b">\${Again()}</p>`)]));
    await loadProgram(r.core, "s474-alias-twice-" + k++);
    expect($("#a").textContent).toBe("same");
    expect($("#b").textContent).toBe("same");
  });
  test("a struct type and an enum, each aliased, as parameter types and in a `match`", async () => {
    const T = {
      path: "t.scrml",
      src: `\${\n    export type Box:struct = { v: string }\n    export type Color:enum = { Red, Blue }\n}\n`,
    };
    const M = useFns(
      `import { Box as Crate, Color as Hue } from "./t.scrml";\n    fn open(c: Crate) -> string {\n        return c.v;\n    }\n    fn hue(h: Hue) -> string {\n        return match h {\n            .Red :> "r",\n            .Blue :> "b",\n        };\n    }\n    fn mk() -> string {\n        const b: Crate = { v: "boxed" };\n        return open(b);\n    }`,
      `<p id="o">\${mk()}</p><p id="h">\${hue(.Blue)}</p>`,
    );
    const r = clean(prog([T, M]));
    await loadProgram(r.core, "s474-alias-types-" + k++);
    expect($("#o").textContent).toBe("boxed");
    expect($("#h").textContent).toBe("b");
  });
  test("a type alias resolves to the declaring file's type: a field it lacks is a type error", () => {
    const T = { path: "t.scrml", src: `\${\n    export type Box:struct = { v: string }\n}\n` };
    const M = useFns(`import { Box as Crate } from "./t.scrml";\n    fn open(c: Crate) -> string {\n        return c.nope;\n    }`, `<p>x</p>`);
    const r = prog([T, M]);
    expect(errs(r).length).toBeGreaterThan(0);
    expect(r.diags.map((d) => d.code)).not.toContain("E-TYPE-UNKNOWN");
  });
  test("a constant", async () => {
    const C = { path: "c.scrml", src: `\${\n    export const GREETING = "hello";\n}\n` };
    const r = clean(prog([C, useFns(`import { GREETING as HI } from "./c.scrml";`, `<p id="g">\${HI}</p>`)]));
    await loadProgram(r.core, "s474-alias-const-" + k++);
    expect($("#g").textContent).toBe("hello");
  });
  test("the aliased export's own name is NOT bound by the import (E-SCOPE-001 at its use)", () => {
    const r = prog([LIB("a.scrml", "a"), useFns(`import { Card as Card2 } from "./a.scrml";`, `<p>\${Card()}</p>`)]);
    expect(at(r)).toEqual([["E-SCOPE-001", ENTRY]]);
    // the message says it IS imported, under the alias (not "this file does not import it")
    expect(errs(r)[0].message).toContain("as `Card2`");
    expect(errs(r)[0].message).not.toContain("does not import it");
  });
});

describe("E-SCOPE-010 applies to LOCAL names", () => {
  test("`import { Card } from a; import { Card as Card2 } from b` is legal (the #1706 E-SCOPE-010 hint's way out)", () => {
    clean(prog([LIB("a.scrml", "a"), LIB("b.scrml", "b"), useFns(`import { Card } from "./a.scrml"; import { Card as Card2 } from "./b.scrml";`, `<p>\${Card()}\${Card2()}</p>`)]));
  });
  test("two imports binding ONE local name to two files' exports stay E-SCOPE-010, at the later import", () => {
    const src = `import { Card as C } from "./a.scrml"; import { Card as C } from "./b.scrml";`;
    const r = prog([LIB("a.scrml", "a"), LIB("b.scrml", "b"), useFns(src, `<p>\${C()}</p>`)]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
    const d = errs(r)[0];
    expect(d.message).toContain("a.scrml");
    expect(d.message).toContain("b.scrml");
    expect(d.message).toContain(" as ");          // the hint names the alias
  });
  test("an alias equal to another import's name: E-SCOPE-010 (`{ Card }` from a, `{ Card as Card }`… from b)", () => {
    const r = prog([LIB("a.scrml", "a"), LIB("b.scrml", "b"), useFns(`import { Card } from "./a.scrml"; import { Card as Card } from "./b.scrml";`, `<p>\${Card()}</p>`)]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("two DIFFERENT exports of one file bound to one local name: E-SCOPE-010", () => {
    const L = { path: "a.scrml", src: `\${\n    export fn one() -> string {\n        return "1";\n    }\n    export fn two() -> string {\n        return "2";\n    }\n}\n` };
    const r = prog([L, useFns(`import { one as x, two as x } from "./a.scrml";`, `<p>\${x()}</p>`)]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("the SAME export twice under one alias stays the §41.7 W-IMPORT-001 warning", () => {
    const r = prog([LIB("a.scrml", "a"), useFns(`import { Card as C } from "./a.scrml"; import { Card as C } from "./a.scrml";`, `<p>\${C()}</p>`)]);
    expect(r.diags.map((d) => [d.code, d.severity])).toEqual([["W-IMPORT-001", "Warning"]]);
  });
  test("an alias that collides with a declaration of the file: E-SCOPE-010, at the import", () => {
    const M = { path: ENTRY, src: `import { card as mine } from "./ui/a.scrml";\n<program>\n    <mine x:string/>\n    renders <p>\${x}</p>\n    <main><p>x</p></main>\n</program>\n` };
    const r = prog([CA, M]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
    const d = errs(r)[0];
    expect(M.src.slice(d.span.start, d.span.end)).toBe("card as mine");
  });
  test("an alias that collides with a function of the file: E-SCOPE-010", () => {
    const r = prog([LIB("a.scrml", "a"), useFns(`import { Card as local } from "./a.scrml";\n    fn local() -> string {\n        return "l";\n    }`, `<p>\${local()}</p>`)]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("aliasing AWAY from a local declaration's name is the fix: legal", () => {
    const M = { path: ENTRY, src: `import { card as theirs } from "./ui/a.scrml";\n<program>\n    <card x:string/>\n    renders <p id="mine">\${x}</p>\n    <main><card x="m"/><theirs t="t"/></main>\n</program>\n` };
    clean(prog([CA, M]));
  });
});

describe("errors", () => {
  test("aliasing a name the file does not export: E-IMPORT-004, naming the exported name", () => {
    const r = prog([LIB("a.scrml", "a"), useFns(`import { Nope as Card2 } from "./a.scrml";`, `<p>x</p>`)]);
    expect(at(r)).toEqual([["E-IMPORT-004", ENTRY]]);
    expect(errs(r)[0].message).toContain("`Nope` is not exported by `./a.scrml`");
  });
  test("`as` with no name after it: E-PARSE-IMPORT, and nothing else", () => {
    const r = prog([LIB("a.scrml", "a"), useFns(`import { Card as } from "./a.scrml";`, `<p>\${Card()}</p>`)]);
    expect(r.diags.map((d) => d.code)).toEqual(["E-PARSE-IMPORT"]);
    expect(r.diags[0].message).toContain("after `as`");
  });
  test("`as` followed by a non-name (`as ,`): E-PARSE-IMPORT", () => {
    const r = prog([LIB("a.scrml", "a"), useFns(`import { Card as , Card } from "./a.scrml";`, `<p>x</p>`)]);
    expect(r.diags.map((d) => d.code)).toContain("E-PARSE-IMPORT");
    expect(r.diags.map((d) => d.code)).not.toContain("E-IMPORT-004");
  });
  test("a namespace import is refused BY NAME — one E-BOOTSTRAP-UNSUPPORTED (§21.3 defines no namespace import)", () => {
    const r = prog([LIB("a.scrml", "a"), useFns(`import * as m from "./a.scrml";`, `<p>x</p>`)]);
    expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("namespace import");
  });
  test("a default import is refused BY NAME — one E-BOOTSTRAP-UNSUPPORTED (was 3 E-PARSE-IMPORT + E-IMPORT-005)", () => {
    const r = prog([LIB("a.scrml", "a"), useFns(`import Card from "./a.scrml";`, `<p>x</p>`)]);
    expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("default import");
  });
  // §21.4 defines the renamed re-export; the bootstrap reads no re-export at all yet
  // (g-boot-reexport-from-s473, whose capable form now names the rename too). Fails closed.
  test("a renamed re-export `export { Box as Crate } from` is still refused where it is written (INTERIM)", () => {
    const T = { path: "t.scrml", src: `\${\n    export type Box:struct = { v: string }\n}\n` };
    const R = { path: "r.scrml", src: `\${\n    export { Box as Crate } from "./t.scrml";\n}\n` };
    const r = prog([T, R, useFns(`import { Crate } from "./r.scrml";`, `<p>x</p>`)]);
    expect(at(r)).toContainEqual(["E-PARSE-ITEM", "r.scrml"]);
  });
  test("`import stuff` (no `from`) is no import form — not reported as a default import", () => {
    const r = prog([useFns(`import stuff;`, `<p>x</p>`)]);
    expect(r.diags.length).toBeGreaterThan(0);
    expect(r.diags.map((d) => d.message).join("\n")).not.toContain("default import");
  });
  test("a namespace import of a missing module still reports the module (E-IMPORT-006 beside the refusal)", () => {
    const r = prog([useFns(`import * as m from "./gone.scrml";`, `<p>x</p>`)]);
    expect(r.diags.map((d) => d.code).sort()).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-IMPORT-006"]);
  });
});
