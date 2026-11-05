// namespace-import-s475.test.js — s475-boot-namespace-import-and-tx-fail-error, Part B: the bootstrap
// reads `import * as m from "./x.scrml"` (gap g-boot-namespace-import-unbuilt-s474; was refused BY NAME,
// INTERIM, E-BOOTSTRAP-UNSUPPORTED).
//
// Ruling (user-voice-scrml.md "## S475", "⭐ RULED — S474 veto-window readings; namespace-import markup;
// impl#1 stays off", item 3): "`import * as m from './x.scrml'` is defined; a namespaced component is
// written `<m.card/>` (and `<*m.card/>` for the shared instance). Resolved by what `m` is bound to: a
// namespace import → module member; a cell → field navigation (E-SCOPE-010 already forbids one name
// being both). INTERIM until built."
// SPEC: §21.3 "Imports use ES module `import` syntax"; "Named imports … from `.scrml` files SHALL be
// resolved by the compiler against the exporting file's export list" (a member the module does not
// export is E-IMPORT-004); §7.6 E-SCOPE-010 (one file-scope binding per name).
//
// What the bootstrap does now:
//   - `m` binds in file scope; each EXPORTED declaration `x` of the module is the member `m.x` — a
//     function, a type, an enum (`m.Color.Red`, a qualified `match` arm, `fail m.E.Bad`), a constant, a
//     component — through the #1715 (declaring file, orig) lookup: the declaration and its per-file
//     scope key stay the declaring file's (a namespaced `<m.card/>` renders with its own file's CSS);
//   - `<m.card …/>`, `<m.card>…</m.card>`, `<*m.card/>` (a `single` declaration's shared instance);
//   - a member the module does not export is E-IMPORT-004 naming it; `m` colliding with another
//     file-scope name (a declaration, a function, a cell, another import) is E-SCOPE-010;
//   - a dotted tag whose head is NOT a namespace import keeps its old reading (E-PARSE-TAG: the bootstrap
//     reads no dotted tag), and `@cell.field` navigation is untouched;
//   - a namespace import of a `.js` module keeps the `.js` refusal every `.js` import has;
//   - s475 r1: a NEARER binding of the namespace's name (a local, a parameter, a prop or field) wins —
//     `m.x` is then member access on it, as without the import (lexical scoping, §7.6); the namespace
//     names come from the parsed imports, never the source text.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { join } from "node:path";
import { loadM2, frontEnd } from "./harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

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
const NS2 = {
  path: ENTRY,
  src: `import * as a from "./ui/a.scrml";\nimport * as b from "./ui/b.scrml";\n<program>\n    <main><a.card t="1"/><b.card t="2"></b.card></main>\n</program>\n`,
};
// A library: a function, a struct, an enum, a constant.
const LIB = { path: "lib.scrml", src: `\${\n    export fn Card() -> string {\n        return "from-lib";\n    }\n    export type Box:struct = { v: string }\n    export type Color:enum = { Red, Blue }\n    export const GREETING = "hello";\n    fn hidden() -> string {\n        return "private";\n    }\n}\n` };
const useLib = (logic, body) => ({ path: ENTRY, src: `import * as m from "./lib.scrml";\n<program>\n    \${ ${logic} }\n    <main>${body}</main>\n</program>\n` });

describe("two namespaced `<card>`s: `<a.card/>` and `<b.card>…</b.card>` render, each with its own style", () => {
  test("no diagnostic", () => {
    clean(prog([CA, CB, NS2]));
  });
  test("each member renders its DECLARING file's declaration: its key, never the namespaced spelling", () => {
    const out = printed(clean(prog([CA, CB, NS2])));
    const ka = key("ui/a.scrml", "card");
    const kb = key("ui/b.scrml", "card");
    expect(ka).not.toBe(kb);
    expect(out.html).toContain(`@scope ([data-scrml="${ka}"]) to ([data-scrml]) {\n  :where(.c), :where(:scope.c) { color: red; }\n}`);
    expect(out.html).toContain(`@scope ([data-scrml="${kb}"]) to ([data-scrml]) {\n  :where(.c), :where(:scope.c) { color: green; }\n}`);
    expect(out.js).toContain(`mk_card_${tag("ui/a.scrml")}`);
    expect(out.js).toContain(`mk_card_${tag("ui/b.scrml")}`);
    // the namespaced spelling is no output name
    expect(out.html).not.toContain("a.card");
    expect(out.html).not.toContain("b.card");
    expect(out.js).not.toContain("a.card");
    expect(out.js).not.toContain("b.card");
  });
  test("in the browser (happy-dom): each instance gets only its own CSS and its own props", async () => {
    const r = clean(prog([CA, CB, NS2]));
    await loadProgram(r.core, "s475-ns-cards-" + k++);
    expect(color("#ca-t")).toBe("red");
    expect(color("#cb-t")).toBe("green");
    expect($("#ca").getAttribute("data-scrml")).toBe(key("ui/a.scrml", "card"));
    expect($("#cb").getAttribute("data-scrml")).toBe(key("ui/b.scrml", "card"));
    expect($("#ca-t").textContent).toBe("1");
    expect($("#cb-t").textContent).toBe("2");
  });
  test("a namespaced component inside another declaration's renders, its prop a field", async () => {
    const M = { path: ENTRY, src: `import * as a from "./ui/a.scrml";\n<pair x:string/>\nrenders <section><a.card t=x/></section>\n<program>\n    <main><pair x="p"/></main>\n</program>\n` };
    const r = clean(prog([CA, M]));
    await loadProgram(r.core, "s475-ns-nested-" + k++);
    expect($("#ca-t").textContent).toBe("p");
    expect(color("#ca-t")).toBe("red");
  });
  test("namespaced and aliased spellings of one declaration render the same declaration", () => {
    const M = { path: ENTRY, src: `import * as a from "./ui/a.scrml";\nimport { card as c2 } from "./ui/a.scrml";\n<program>\n    <main><a.card t="1"/><c2 t="2"/></main>\n</program>\n` };
    const out = printed(clean(prog([CA, M])));
    expect(out.js).toContain(`mk_card_${tag("ui/a.scrml")}`);
  });
  test("a mismatched closer `</a.cardx>` is E-PARSE-CLOSER, naming both", () => {
    const M = { path: ENTRY, src: `import * as a from "./ui/a.scrml";\n<program>\n    <main><a.card t="1"></a.cardx></main>\n</program>\n` };
    const r = prog([CA, M]);
    expect(at(r)).toContainEqual(["E-PARSE-CLOSER", ENTRY]);
    expect(errs(r).find((d) => d.code === "E-PARSE-CLOSER").message).toContain("`</a.cardx>` closes `<a.card>`");
  });
});

describe("`m.x` in logic: a function, a type, an enum, a constant", () => {
  test("each member resolves to the module's export and runs", async () => {
    const r = clean(prog([LIB, useLib(
      `fn open(c: m.Box) -> string {\n        return c.v;\n    }\n    fn hue(h: m.Color) -> string {\n        return match h {\n            .Red :> "r",\n            .Blue :> "b",\n        };\n    }\n    fn mk() -> string {\n        const b: m.Box = { v: "boxed" };\n        return open(b);\n    }\n    fn q() -> string {\n        return hue(m.Color.Blue);\n    }`,
      `<p id="a">\${m.Card()}</p><p id="o">\${mk()}</p><p id="h">\${q()}</p><p id="g">\${m.GREETING}</p>`,
    )]));
    await loadProgram(r.core, "s475-ns-logic-" + k++);
    expect($("#a").textContent).toBe("from-lib");
    expect($("#o").textContent).toBe("boxed");
    expect($("#h").textContent).toBe("b");
    expect($("#g").textContent).toBe("hello");
  });
  test("a namespaced enum in a failable signature, `fail m.E.V` and qualified `match` arms", async () => {
    const E = { path: "lib.scrml", src: `\${\n    export type E:enum = { Bad, Worse }\n}\n` };
    const M = { path: ENTRY, src: `import * as m from "./lib.scrml";\n<program>\n    \${ fn f(x: int)! m.E {\n        if (x > 0) fail m.E.Bad;\n        return 1;\n    }\n    fn g(e: m.E) -> string {\n        return match e {\n            m.E.Bad :> "b",\n            m.E.Worse :> "w",\n        };\n    }\n    fn h(x: int) -> string {\n        const n: int = f(x) !{ _ :> 0 };\n        if (n == 1) return "one";\n        return "zero";\n    } }\n    <main><p id="w">\${g(m.E.Worse)}</p><p id="h">\${h(1)}|\${h(0)}</p></main>\n</program>\n` };
    const r = clean(prog([E, M]));
    await loadProgram(r.core, "s475-ns-enum-" + k++);
    expect($("#w").textContent).toBe("w");
    expect($("#h").textContent).toBe("zero|one");
  });
  test("a namespaced member reached through a stdlib module (`scrml:`)", () => {
    const FIXTURE = join(import.meta.dir, "src", "stdlib-s472");
    const r = frontEndStdlib(mods, [{ path: ENTRY, src: `import * as v from "scrml:vis";\n<program>\n    <main><p>\${v.pub("x")}</p><p>\${v.toneName(v.Tone.Cool)}</p><p>\${v.inner("y")}</p></main>\n</program>\n` }], ENTRY, { stdlibRoot: FIXTURE });
    // `inner` is imported by the module, never exported by it: no member (E-IMPORT-004), as a named import of it is
    expect(r.diags.filter((d) => d.severity === "Error").map((d) => d.code)).toEqual(["E-IMPORT-004"]);
    expect(r.diags[0].message).toContain("`inner` is not exported by `scrml:vis`");
  });
  test("a member used in an event handler, beside a cell", async () => {
    const M = { path: ENTRY, src: `import * as m from "./lib.scrml";\n<program>\n    let <s:string=""/>\n    <main><button id="b" onclick={ @s = m.Card(); }>go</button><p id="s">\${@s}</p></main>\n</program>\n` };
    const r = clean(prog([LIB, M]));
    await loadProgram(r.core, "s475-ns-handler-" + k++);
    click($("#b"));
    expect($("#s").textContent).toBe("from-lib");
  });
});

describe("`<*m.x/>` — a `single` declaration's shared instance through a namespace", () => {
  const C = { path: "ui/c.scrml", src: `export <ctr single n:int=0/>\nrenders <p class="cv">\${n}</p>\n` };
  test("`<*c.ctr/>` compiles, as `<*ctr/>` through a named import does", () => {
    clean(prog([C, { path: ENTRY, src: `import * as c from "./ui/c.scrml";\n<program>\n    <main><*c.ctr/><*c.ctr/></main>\n</program>\n` }]));
    clean(prog([C, { path: ENTRY, src: `import { ctr } from "./ui/c.scrml";\n<program>\n    <main><*ctr/><*ctr/></main>\n</program>\n` }]));
  });
  test("a plain `<c.ctr/>` of a `single` declaration is E-DECL-SINGLE-INSTANTIATED, as unnamespaced", () => {
    const r = prog([C, { path: ENTRY, src: `import * as c from "./ui/c.scrml";\n<program>\n    <main><c.ctr/></main>\n</program>\n` }]);
    expect(at(r)).toEqual([["E-DECL-SINGLE-INSTANTIATED", ENTRY]]);
    expect(errs(r)[0].message).toContain("<*c.ctr/>");
  });
});

describe("errors", () => {
  test("a member the module does not export — E-IMPORT-004 naming the member, in logic, in markup and in a type", () => {
    const M = { path: ENTRY, src: `import * as m from "./lib.scrml";\n<program>\n    \${ fn f(x: m.Nope) -> int {\n        return 1;\n    } }\n    <main><p>\${m.Gone()}</p><m.nada/><*m.absent/></main>\n</program>\n` };
    const r = prog([LIB, M]);
    expect(at(r)).toEqual([["E-IMPORT-004", ENTRY], ["E-IMPORT-004", ENTRY], ["E-IMPORT-004", ENTRY], ["E-IMPORT-004", ENTRY]]);
    const ms = errs(r).map((d) => d.message).join("\n");
    for (const n of ["Nope", "Gone", "nada", "absent"]) expect(ms).toContain("`" + n + "` is not exported by `./lib.scrml`");
  });
  test("a PRIVATE declaration of the module is no member — E-IMPORT-004", () => {
    const r = prog([LIB, useLib("", `<p>\${m.hidden()}</p>`)]);
    expect(at(r)).toEqual([["E-IMPORT-004", ENTRY]]);
    expect(errs(r)[0].message).toContain("`hidden` is not exported by `./lib.scrml`");
  });
  test("an export of the wrong kind for its position — E-SCOPE-001 (as an aliased import's)", () => {
    const r = prog([LIB, useLib("", `<p>\${m.Box}</p>`)]);
    expect(at(r)).toEqual([["E-SCOPE-001", ENTRY]]);
  });
  test("the namespace itself used as a value — E-SCOPE-001 naming it a namespace", () => {
    const r = prog([LIB, useLib("", `<p>\${m}</p>`)]);
    expect(at(r)).toEqual([["E-SCOPE-001", ENTRY]]);
    expect(errs(r)[0].message).toContain("is a namespace import");
  });
  test("`m` colliding with a function of the file — E-SCOPE-010 at the import, no cascade at `m.Card()`", () => {
    const r = prog([LIB, useLib(`fn m() -> string {\n        return "l";\n    }`, `<p>\${m.Card()}</p>`)]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
    expect(errs(r)[0].message).toContain("import * as m");
  });
  test("`m` colliding with a cell of the file — E-SCOPE-010 (one name is never both a namespace and a cell)", () => {
    const M = { path: ENTRY, src: `import * as m from "./lib.scrml";\n<program>\n    let <m:int=0/>\n    <main><p>\${m.Card()}\${@m}</p></main>\n</program>\n` };
    const r = prog([LIB, M]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("`m` colliding with a named import, either order — E-SCOPE-010; the same namespace twice — W-IMPORT-001", () => {
    for (const imps of [`import * as Card from "./lib.scrml";\nimport { Card } from "./lib.scrml";`, `import { Card } from "./lib.scrml";\nimport * as Card from "./lib.scrml";`]) {
      const r = prog([LIB, { path: ENTRY, src: `${imps}\n<program>\n    <main><p>\${Card()}</p></main>\n</program>\n` }]);
      expect([imps, at(r)]).toEqual([imps, [["E-SCOPE-010", ENTRY]]]);
    }
    const r2 = prog([LIB, { path: ENTRY, src: `import * as m from "./lib.scrml";\nimport * as m from "./lib.scrml";\n<program>\n    <main><p>\${m.Card()}</p></main>\n</program>\n` }]);
    expect(r2.diags.map((d) => [d.code, d.severity])).toEqual([["W-IMPORT-001", "Warning"]]);
    const r3 = prog([LIB, CA, { path: ENTRY, src: `import * as m from "./lib.scrml";\nimport * as m from "./ui/a.scrml";\n<program>\n    <main><p>\${m.Card()}</p></main>\n</program>\n` }]);
    expect(at(r3)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("a malformed namespace import — E-PARSE-IMPORT (no `as`, a keyword name, no name)", () => {
    for (const imp of [`import * from "./lib.scrml";`, `import * as if from "./lib.scrml";`, `import * as from "./lib.scrml";`]) {
      const r = prog([LIB, useLib(imp, `<p>x</p>`)]);
      expect([imp, r.diags.map((d) => d.code)]).toEqual([imp, ["E-PARSE-IMPORT"]]);
    }
  });
  test("a `_scrml_` namespace name — E-NAME-COLLIDES-RESERVED-PREFIX at the import", () => {
    const r = prog([LIB, { path: ENTRY, src: `import * as _scrml_m from "./lib.scrml";\n<program>\n    <main><p>x</p></main>\n</program>\n` }]);
    expect(at(r)).toEqual([["E-NAME-COLLIDES-RESERVED-PREFIX", ENTRY]]);
  });
  test("a namespace import of a missing module — E-IMPORT-006 only; its members' uses do not cascade", () => {
    const r = prog([{ path: ENTRY, src: `import * as m from "./gone.scrml";\n<program>\n    <main><p>\${m.f()}</p><m.card/></main>\n</program>\n` }]);
    expect(r.diags.map((d) => d.code)).toEqual(["E-IMPORT-006"]);
  });
  test("a namespace import of a `.js` module keeps the `.js` import's refusal (unchanged), and nothing else", () => {
    const ns = prog([{ path: ENTRY, src: `import * as m from "./x.js";\n<program>\n    <main><p>\${m.f()}</p></main>\n</program>\n` }]);
    const named = prog([{ path: ENTRY, src: `import { f } from "./x.js";\n<program>\n    <main><p>\${f()}</p></main>\n</program>\n` }]);
    expect(ns.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(ns.diags[0].message).toBe(named.diags[0].message);
  });
  // re-exports are not built (g-boot-reexport-from-s473): the re-exporting module is refused where it
  // is written, and a namespace over it does not bring the re-exported name — its use names it
  test("a namespace over a module that RE-exports: the re-exported member is refused by name (E-IMPORT-004), the module at its `export … from`", () => {
    const T = { path: "t.scrml", src: `\${\n    export fn inner() -> string {\n        return "t";\n    }\n}\n` };
    const R = { path: "r.scrml", src: `\${\n    export { inner as outer } from "./t.scrml";\n    export fn own() -> string {\n        return "r";\n    }\n}\n` };
    const r = prog([T, R, { path: ENTRY, src: `import * as r from "./r.scrml";\n<program>\n    <main><p>\${r.outer()}</p></main>\n</program>\n` }]);
    expect(at(r)).toContainEqual(["E-PARSE-ITEM", "r.scrml"]);
    expect(at(r)).toContainEqual(["E-IMPORT-004", ENTRY]);
    expect(errs(r).find((d) => d.file === ENTRY).message).toContain("`outer` is not exported by `./r.scrml`");
  });
});

// s475 r1 (review of #1746, item 1 — HIGH, was a silent miscompile): a NEARER binding of the namespace's
// name — a local, a parameter, a declaration's prop or field — wins, as it does without the import (§7.6
// lexical scoping); `m.x` is then member access on that binding, exactly as base emits. (Was: `m.x` was
// read as the module's member behind the binding — `${m.trim()}` on a field `m` emitted `trim()`, the
// library's function.)
describe("s475 r1: a nearer binding of the namespace's name wins (lexical scoping)", () => {
  const TRIM = { path: "lib.scrml", src: `\${\n    export fn trim() -> string {\n        return "LIBTRIM";\n    }\n    export const length = 99;\n    export fn Card() -> string {\n        return "from-lib";\n    }\n}\n` };
  const NS = `import * as m from "./lib.scrml";\n`;
  // each program twice: with the namespace import, and without it (base) — same output, same page
  const both = (body) => [prog([TRIM, { path: ENTRY, src: NS + body }]), prog([TRIM, { path: ENTRY, src: body }])];
  const sameJs = (a, b) => {
    const strip = (js) => js.replace(/\/\/ functions\n[\s\S]*?\n\n/, "");
    expect(strip(printed(a).js)).toBe(strip(printed(b).js));
  };
  test("the review's repro: a declaration's FIELD `m` — `${m.trim()}` trims the field", async () => {
    const body = `<program>\n    <outer:struct>\n        let <m:string=" q "/>\n    </>\n    renders <p id="p">\${m.trim()}</p>\n    <main><*outer/></main>\n</program>\n`;
    const [withNs, base] = both(body);
    clean(withNs);
    clean(base);
    sameJs(withNs, base);
    expect(printed(withNs).js).not.toContain("trim()\n");
    await loadProgram(withNs.core, "s475r1-field-" + k++);
    expect($("#p").textContent).toBe("q");
  });
  test("a PROP `m` — `${m.trim()}` trims the prop", async () => {
    const body = `<show m:string/>\nrenders <p id="p">\${m.trim()}</p>\n<program>\n    <main><show m=" z "/></main>\n</program>\n`;
    const [withNs, base] = both(body);
    clean(withNs);
    clean(base);
    sameJs(withNs, base);
    await loadProgram(withNs.core, "s475r1-prop-" + k++);
    expect($("#p").textContent).toBe("z");
  });
  test("`${m.length}` on a field `m` is the string's length, not the module's exported `length`", async () => {
    const body = `<program>\n    <outer:struct>\n        let <m:string="abc"/>\n    </>\n    renders <p id="p">\${m.length}</p>\n    <main><*outer/></main>\n</program>\n`;
    const [withNs, base] = both(body);
    clean(withNs);
    clean(base);
    sameJs(withNs, base);
    await loadProgram(withNs.core, "s475r1-length-" + k++);
    expect($("#p").textContent).toBe("3");
  });
  test("an event handler inside the declaration — `@s = m.trim()` trims the field", async () => {
    const body = `<program>\n    let <s:string=""/>\n    <outer:struct>\n        let <m:string=" h "/>\n    </>\n    renders <button id="b" onclick={ @s = m.trim(); }>go</button>\n    <main><*outer/><p id="s">\${@s}</p></main>\n</program>\n`;
    const [withNs, base] = both(body);
    clean(withNs);
    clean(base);
    sameJs(withNs, base);
    await loadProgram(withNs.core, "s475r1-handler-" + k++);
    click($("#b"));
    expect($("#s").textContent).toBe("h");
  });
  test("a PARAMETER `m` — `m.Card` is the struct field (was INTERIM-refused)", async () => {
    const logic = `type T:struct = { Card: string }\n    fn f(m: T) -> string {\n        return m.Card;\n    }\n    fn g() -> string {\n        const t: T = { Card: "field" };\n        return f(t);\n    }`;
    const body = `<program>\n    \${ ${logic} }\n    <main><p id="p">\${g()}</p><p id="q">\${m.Card()}</p></main>\n</program>\n`;
    const r = clean(prog([TRIM, { path: ENTRY, src: NS + body }]));
    await loadProgram(r.core, "s475r1-param-" + k++);
    expect($("#p").textContent).toBe("field");
    expect($("#q").textContent).toBe("from-lib");
  });
  test("a LOCAL `m` in a nested block shadows only inside it — outside, `m.Card()` is the module's", async () => {
    const logic = `fn f() -> string {\n        const a: string = m.Card();\n        if (a == "from-lib") {\n            const m: string = " in ";\n            return a + "|" + m.trim();\n        }\n        return a;\n    }`;
    const r = clean(prog([TRIM, { path: ENTRY, src: NS + `<program>\n    \${ ${logic} }\n    <main><p id="p">\${f()}</p></main>\n</program>\n` }]));
    await loadProgram(r.core, "s475r1-block-" + k++);
    expect($("#p").textContent).toBe("from-lib|in");
  });
});

// s475 r1 (review item 3): the namespace names are the file's PARSED imports — never a scan of the
// source text. `import * as C` in a comment or a string binds nothing, so `C.Red`, `o.v`, `console.log`
// keep their reading (was: merged into one name — E-SCOPE-001 / E-MATCH-BARE-BINDER on valid programs).
describe("s475 r1: `import * as` in a comment or a string is no namespace import", () => {
  const BODY = `<program>
    \${
        type C:enum = { Red, Blue }
        type O:struct = { v: string }
        fn hue(c: C) -> string {
            return match c {
                C.Red :> "r",
                C.Blue :> "b",
            };
        }
        fn val(o: O) -> string {
            return o.v;
        }
        fn go() -> string {
            const o: O = { v: "ok" };
            return hue(C.Red) + val(o);
        }
    }
    <main><p id="p">\${go()}</p></main>
</program>
`;
  for (const [name, text] of [
    ["a comment", `// import * as C from "./lib.scrml"\n// import * as o from "./lib.scrml"\n`],
    ["a string", `\${ const NOTE: string = "import * as C from './lib.scrml'; import * as o from 'x'"; }\n`],
  ]) {
    test(`${name}: compiles identically to the file without it`, async () => {
      const r = clean(prog([{ path: ENTRY, src: text + BODY }]));
      const base = clean(prog([{ path: ENTRY, src: BODY }]));
      expect(r.diags).toEqual(base.diags);
      await loadProgram(r.core, "s475r1-text-" + k++);
      expect($("#p").textContent).toBe("rok");
    });
  }
});

describe("resolution by binding kind: only a namespace-import head is a member", () => {
  test("a dotted tag whose head is no namespace import keeps its old reading — E-PARSE-TAG, also in a file that has one", () => {
    for (const imp of ["", `import * as m from "./lib.scrml";\n`]) {
      const r = prog([LIB, { path: ENTRY, src: `${imp}<program>\n    <main><x.card/></main>\n</program>\n` }]);
      expect([imp, r.diags.map((d) => d.code)]).toEqual([imp, ["E-PARSE-TAG"]]);
      expect(r.diags[0].message).toContain("unexpected `.` in the tag `<x`");
    }
  });
  test("compound-field navigation `@signup.email.…` is untouched by a namespace import in the file", async () => {
    const SIGNUP = (imp) => ({ path: ENTRY, src: `${imp}<program>
    <signup note:string="n">
        let <email:string="" req/>
        renders <input class="e" bind:value=@email/>
    </>
    renders <form><*email/></form>
    <main>
        <*signup/>
        <p class="c">\${@signup.isValid}|\${@signup.email.isValid}|\${@signup.email.touched}</p>
    </main>
</program>
` });
    const plain = clean(prog([SIGNUP("")]));
    const withNs = clean(prog([LIB, SIGNUP(`import * as m from "./lib.scrml";\n`)]));
    // the program's own output is the same: the namespace only adds the module's functions
    const strip = (js) => js.replace(/\/\/ functions\n[\s\S]*?\n\n/, "");
    expect(strip(printed(withNs).js)).toBe(strip(printed(plain).js));
    expect(printed(withNs).html).toBe(printed(plain).html);
    await loadProgram(withNs.core, "s475-ns-compound-" + k++);
    expect($("p.c").textContent).toBe("false|false|false");
  });
  test("`m.x` after a `.` (`o.m.x`) or an `@` (`@m.x`) is not a member — `@` stays a cell read", () => {
    const M = { path: ENTRY, src: `import * as m from "./lib.scrml";\n<program>\n    \${ type O:struct = { m: string }\n    fn f(o: O) -> string {\n        return o.m;\n    } }\n    <main><p>\${m.Card()}</p></main>\n</program>\n` };
    clean(prog([LIB, M]));
  });
});
