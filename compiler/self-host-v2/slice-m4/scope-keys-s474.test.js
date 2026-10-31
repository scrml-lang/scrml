// scope-keys-s474.test.js — s474-boot-per-file-scope-keys: door 3 of the S474 re-review
// (user-voice-scrml.md "⭐ RULED — permanent-restrictions re-review: the four one-way doors",
// item 3):
//
//   "Same-name components across files, and two files exporting one name: INTERIM. The CSS
//    scope key and output names are always per-file qualified, not only on a collision."
//
// What the bootstrap does now:
//   - a user declaration's OUTPUT name is `<name>~<file tag>` (core.scrml scopeKey), always: its
//     root's `data-scrml`, its sheet's `@scope ([data-scrml="…"])`, its `<template>` ids, and its
//     module-level JS bindings (`mk_card_<tag>`, …). The file tag is 8 hex digits of a 32-bit hash
//     of the declaring file's project-relative path, normalised (`\` → `/`, a leading `./`
//     dropped), so it is the same on every machine and OS;
//   - two files may each declare a `<card>` (a component or not, exported or not) — each keeps
//     its own style scope (was E-COMPONENT-NAME-DUPLICATE, S473 #1636);
//   - two user files may each export one name (was E-SCOPE-010 at the second exporter, S473
//     #1640) — each import names its file, so it resolves to one of them;
//   - importing both into ONE file binds the name twice in that file's scope: E-SCOPE-010, at
//     the later import.
// Kept: `<card>` beside `fn card` in one file (E-SCOPE-010, PERMANENT), and two declarations of
// one name in one file (E-SCOPE-010).

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

// ui/red.scrml: a red `<card>`, and an exported `<redPanel>` that renders ITS `<card>`.
const RED = {
  path: "ui/red.scrml",
  src: `<card t:string/>
renders <div class="c" id="red-card">#{ .c { color: red; } }<span class="c" id="red-t">\${t}</span></div>
export <redPanel t:string/>
renders <section><card t=t/></section>
`,
};
// app.scrml: its OWN blue `<card>`, used beside the imported panel.
const APP = {
  path: ENTRY,
  src: `import { redPanel } from "./ui/red.scrml";
<program>
    <card t:string/>
    renders <div class="c" id="blue-card">#{ .c { color: blue; } }<span class="c" id="blue-t">\${t}</span></div>
    <main>
        <redPanel t="r"/>
        <card t="b"/>
    </main>
</program>
`,
};

describe("the file tag and the key (core.scrml)", () => {
  test("8 lowercase hex digits; deterministic; one path, one tag", () => {
    expect(tag("ui/red.scrml")).toMatch(/^[0-9a-f]{8}$/);
    expect(tag("ui/red.scrml")).toBe(tag("ui/red.scrml"));
    expect(tag("ui/red.scrml")).not.toBe(tag("app.scrml"));
    expect(key("ui/red.scrml", "card")).toBe("card~" + tag("ui/red.scrml"));
  });
  test("normalised: OS separators, a leading `./` and doubled `/` do not change it", () => {
    expect(tag("ui\\red.scrml")).toBe(tag("ui/red.scrml"));
    expect(tag("./ui/red.scrml")).toBe(tag("ui/red.scrml"));
    expect(tag("ui//red.scrml")).toBe(tag("ui/red.scrml"));
    expect(mods.core.normalPath(".\\ui\\red.scrml")).toBe("ui/red.scrml");
  });
  test("a stable value (pinned: a change here changes every emitted key)", () => {
    // 32-bit h = h * 33 + code (mod 2^32) from 5381, over the normalised path
    let h = 5381;
    for (const c of "ui/red.scrml") h = (h * 33 + c.charCodeAt(0)) % 4294967296;
    expect(tag("ui/red.scrml")).toBe(h.toString(16).padStart(8, "0"));
  });
});

describe("two files each declaring `<card>`, different styles: both compile, each keeps its own CSS", () => {
  test("no diagnostic (was E-COMPONENT-NAME-DUPLICATE, S473)", () => {
    clean(prog([RED, APP]));
  });
  test("two scopes, two keys, two templates — each root stamped with ITS key", () => {
    const out = printed(clean(prog([RED, APP])));
    const red = key("ui/red.scrml", "card");
    const blue = key(ENTRY, "card");
    expect(red).not.toBe(blue);
    expect(out.html).toContain(`@scope ([data-scrml="${red}"]) to ([data-scrml]) {\n  :where(.c), :where(:scope.c) { color: red; }\n}`);
    expect(out.html).toContain(`@scope ([data-scrml="${blue}"]) to ([data-scrml]) {\n  :where(.c), :where(:scope.c) { color: blue; }\n}`);
    expect(out.html).toContain(`<div class="c" id="red-card" data-scrml="${red}">`);
    expect(out.html).toContain(`<div class="c" id="blue-card" data-scrml="${blue}">`);
    expect(out.html).toContain(`<template id="scrml:${red}">`);
    expect(out.html).toContain(`<template id="scrml:${blue}">`);
    // no bare key is emitted for a user declaration
    expect(out.html).not.toContain('data-scrml="card"');
    expect(out.html).not.toContain('id="scrml:card"');
    // the JS output names carry the key too (one binding per declaration)
    expect(out.js).toContain(`mk_card_${tag("ui/red.scrml")}`);
    expect(out.js).toContain(`mk_card_${tag(ENTRY)}`);
  });
  test("in the browser (happy-dom): each instance gets only its own CSS", async () => {
    const r = clean(prog([RED, APP]));
    await loadProgram(r.core, "s474-two-cards-" + k++);
    expect($("#red-card")).not.toBeNull();
    expect($("#blue-card")).not.toBeNull();
    expect(color("#red-t")).toBe("red");
    expect(color("#blue-t")).toBe("blue");
    expect($("#red-card").getAttribute("data-scrml")).toBe(key("ui/red.scrml", "card"));
    expect($("#blue-card").getAttribute("data-scrml")).toBe(key(ENTRY, "card"));
    expect($("#red-t").textContent).toBe("r");
    expect($("#blue-t").textContent).toBe("b");
  });
  test("two same-named declarations that are NOT both components compile too (was the bootstrap limit)", () => {
    const A = { path: "a.scrml", src: `export <card t:string/>\n` };
    const B = { path: ENTRY, src: `<program>\n    <card x:string/>\n    renders <p>\${x}</p>\n    <main><card x="hi"/></main>\n</program>\n` };
    clean(prog([A, B]));
  });
});

// Two libraries that both EXPORT `Card` (a function here: the JS side of the output names).
const LIB = (path, word) => ({ path, src: `\${\n    export fn Card() -> string {\n        return "${word}";\n    }\n}\n` });
const USER = (path, from, fn) => ({
  path,
  src: `\${\n    import { Card } from "${from}";\n    export fn ${fn}() -> string {\n        return Card();\n    }\n}\n`,
});

describe("two files exporting `Card`, imported by different files: works", () => {
  test("no diagnostic (was E-SCOPE-010 at the second exporter, S473 #1640), and each import resolves to ITS file", async () => {
    const files = [
      LIB("a.scrml", "from-a"), LIB("b.scrml", "from-b"),
      USER("ua.scrml", "./a.scrml", "useA"), USER("ub.scrml", "./b.scrml", "useB"),
      { path: ENTRY, src: `<program>\n    \${ import { useA } from "./ua.scrml"; import { useB } from "./ub.scrml"; }\n    <main><p id="a">\${useA()}</p><p id="b">\${useB()}</p></main>\n</program>\n` },
    ];
    const r = clean(prog(files));
    await loadProgram(r.core, "s474-two-exports-" + k++);
    expect($("#a").textContent).toBe("from-a");
    expect($("#b").textContent).toBe("from-b");
  });
  test("two files exporting the component `<card>`, each imported by a different file: works, each its own style", async () => {
    const CA = { path: "a.scrml", src: `export <card t:string/>\nrenders <div class="c" id="ca">#{ .c { color: red; } }<span class="c" id="ca-t">\${t}</span></div>\n` };
    const CB = { path: "b.scrml", src: `export <card t:string/>\nrenders <div class="c" id="cb">#{ .c { color: green; } }<span class="c" id="cb-t">\${t}</span></div>\n` };
    const PA = { path: "pa.scrml", src: `import { card } from "./a.scrml";\nexport <pa t:string/>\nrenders <section><card t=t/></section>\n` };
    const PB = { path: "pb.scrml", src: `import { card } from "./b.scrml";\nexport <pb t:string/>\nrenders <section><card t=t/></section>\n` };
    const M = { path: ENTRY, src: `import { pa } from "./pa.scrml";\nimport { pb } from "./pb.scrml";\n<program>\n    <main><pa t="1"/><pb t="2"/></main>\n</program>\n` };
    const r = clean(prog([CA, CB, PA, PB, M]));
    await loadProgram(r.core, "s474-two-exported-cards-" + k++);
    expect(color("#ca-t")).toBe("red");
    expect(color("#cb-t")).toBe("green");
    expect($("#ca-t").textContent).toBe("1");
    expect($("#cb-t").textContent).toBe("2");
  });
});

describe("importing both into ONE file: refused, with a clear message", () => {
  test("two functions: E-SCOPE-010 at the later import, naming both files", () => {
    const src = `<program>\n    \${ import { Card } from "./a.scrml"; import { Card } from "./b.scrml"; }\n    <main><p>\${Card()}</p></main>\n</program>\n`;
    const r = prog([LIB("a.scrml", "a"), LIB("b.scrml", "b"), { path: ENTRY, src }]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
    const d = errs(r)[0];
    expect(src.slice(d.span.start, d.span.end)).toBe("Card");
    expect(d.span.start).toBeGreaterThan(src.indexOf("./a.scrml"));
    expect(d.message).toContain("a.scrml");
    expect(d.message).toContain("b.scrml");
    expect(d.message).toContain("§7.6");
    // not ALSO the later-import-wins warning: the pair is refused, not resolved
    expect(r.diags.map((x) => x.code)).not.toContain("W-IMPORT-001");
  });
  test("two components: E-SCOPE-010 at the later import", () => {
    const CA = { path: "a.scrml", src: `export <card t:string/>\nrenders <div>\${t}</div>\n` };
    const CB = { path: "b.scrml", src: `export <card t:string/>\nrenders <p>\${t}</p>\n` };
    const M = { path: ENTRY, src: `import { card } from "./a.scrml";\nimport { card } from "./b.scrml";\n<program>\n    <main><card t="x"/></main>\n</program>\n` };
    expect(at(prog([CA, CB, M]))).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("control: the same name imported twice from ONE file stays the §41.7 W-IMPORT-001 warning", () => {
    const src = `<program>\n    \${ import { Card } from "./a.scrml"; import { Card } from "./a.scrml"; }\n    <main><p>\${Card()}</p></main>\n</program>\n`;
    const r = prog([LIB("a.scrml", "a"), { path: ENTRY, src }]);
    expect(r.diags.map((d) => [d.code, d.severity])).toEqual([["W-IMPORT-001", "Warning"]]);
  });
});

describe("kept: one file binds a name once", () => {
  test("`<card>` beside `fn card` in one file stays E-SCOPE-010 (PERMANENT)", () => {
    const r = prog([{ path: ENTRY, src: `<program>\n    <card t:string/>\n    renders <div>\${t}</div>\n    function card() -> int { return 1; }\n    <main><p>x</p></main>\n</program>\n` }]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("two `<card>`s in one file stay E-SCOPE-010", () => {
    const r = prog([{ path: ENTRY, src: `<program>\n    <card t:string/>\n    renders <div>\${t}</div>\n    <card u:string/>\n    renders <p>\${u}</p>\n    <main><p>x</p></main>\n</program>\n` }]);
    expect(at(r)).toEqual([["E-SCOPE-010", ENTRY]]);
  });
  test("an imported `<card>` beside a local `<card>` stays E-SCOPE-010 (at the import)", () => {
    const A = { path: "a.scrml", src: `export <card t:string/>\nrenders <div>\${t}</div>\n` };
    const M = { path: ENTRY, src: `import { card } from "./a.scrml";\n<program>\n    <card x:string/>\n    renders <p>\${x}</p>\n    <main><p>x</p></main>\n</program>\n` };
    expect(at(prog([A, M]))).toEqual([["E-SCOPE-010", ENTRY]]);
  });
});
