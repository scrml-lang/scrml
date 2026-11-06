// boot-file-scope-own-value-s475.test.js — s475-boot-file-scope-own-value (g-boot-file-scope-own-value-read-unbuilt-s475).
//
// A declaration with an OWN VALUE written outside `<program>` (`export let <count:int=7/>` in a library, or
// `let <c2:int=9/>` above the entry's `<program>`) is built with its own value as its instance's value, so
// `@count` reads 7 — wherever it is named. Governing text:
//   SPEC §66.7.1 "In logic, `@x` (and `@x.field`) reads — and, where the field's contract grants it (§66.11),
//     writes — the **SHARED** instance of `x` (§66.6.4)".
//   SPEC §66.6.4 "Every USER declaration has **its own unnamed shared instance**" — one per declaration, so
//     the library, a second library that imports it, and the app read and write ONE value.
//   SPEC §21.3 rule 2 "In logic, `m.name` reads the export `name`: the same declaration a named import
//     `import { name } from './x.scrml'` would bind."
//   SPEC §66.14 rule 2 "A write lexically inside the file that defines the declaration is governed only by the
//     field's contract (§66.13.1)" — same-file writes are built; ⚑ O2 / O39 — a write from ANOTHER file of an
//     own value "is not ruled", so it stays refused by name (INTERIM).
// Before (origin/main 16ffdaee8): every read compiled clean and rendered "[object Object]"; #1772 refused them
// by name. Also the #1772 review's LOW items N2 (cross-file write messages), N3 (`@m.nope = …` is E-IMPORT-004),
// N4 (an unreachable `fail` is not reported) and N5 (no stray member-access report on `@pt.v`).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { mods as srvMods } from "./server-artifact-harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

const ENTRY = "app.scrml";
const errs = (r) => r.diags.filter((d) => d.severity === "Error");
const LIB = {
  path: "lib.scrml",
  src: [
    "export type P:struct = { v: int }",
    "export let <count:int=7/>",
    "export let <flag:bool=true/>",
    'export let <name:string="hi"/>',
    "export <lk:int=9/>",
    "export let <pt:P=({ v: 7 })/>",
    "export <items:int[]=([1, 2, 3])/>",
    "export <dbl:int=(@count * 2)/>",
    "export <box:struct>",
    "    export let <n:int=1/>",
    "</>",
    "renders <i>${n}</i>",
    "export function getCount() -> int { return @count; }",
    "export function bump() { @count = @count + 1; }",
    "export function setPt() { @pt.v = @pt.v + 1; }",
    "",
  ].join("\n"),
};
const named = (n, body) => ({ path: ENTRY, src: `import { ${n} } from "./lib.scrml";\n<program>\n${body}\n</program>\n` });
const ns = (body) => ({ path: ENTRY, src: `import * as m from "./lib.scrml";\n<program>\n${body}\n</program>\n` });
const one = (pre, body) => ({ path: ENTRY, src: `${pre}\n<program>\n${body}\n</program>\n` });
const fe = (files) => frontEnd(mods, files, ENTRY);
const $ = (sel) => document.querySelector(sel);
let k = 0;

// Compile clean, mount in happy-dom, return #c's text (and after a click on #b, when given).
async function run(files, { clicks = 0 } = {}) {
  const r = fe(files);
  expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  await loadProgram(r.core, "s475-fsov-" + k++);
  const before = $("#c").textContent;
  for (let i = 0; i < clicks; i++) click($("#b"));
  return { before, after: $("#c").textContent, html: $("#c").outerHTML };
}

describe("reads: a file-scope own value renders its value (was: \"[object Object]\", then refused by name)", () => {
  const READS = [
    ["named import `@count`", [LIB, named("count", '<p id="c">${@count}</p>')], "7"],
    ["aliased import `@c`", [LIB, named("count as c", '<p id="c">${@c}</p>')], "7"],
    ["namespace import `@m.count`", [LIB, ns('<p id="c">${@m.count}</p>')], "7"],
    ["a string export", [LIB, named("name", '<p id="c">${@name}</p>')], "hi"],
    ["a locked export", [LIB, named("lk", '<p id="c">${@lk}</p>')], "9"],
    ["a locked export through the namespace", [LIB, ns('<p id="c">${@m.lk}</p>')], "9"],
    ["a bool export in a ternary through the namespace", [LIB, ns('<p id="c">${@m.flag ? "y" : "n"}</p>')], "y"],
    ["a struct own value's field `@pt.v` (N5: no stray member-access report)", [LIB, named("pt", '<p id="c">${@pt.v}</p>')], "7"],
    ["`@m.pt.v`", [LIB, ns('<p id="c">${@m.pt.v}</p>')], "7"],
    ["a tape's `@items.length` (N5)", [LIB, named("items", '<p id="c">${@items.length}</p>')], "3"],
    ["`@m.items.length`", [LIB, ns('<p id="c">${@m.items.length}</p>')], "3"],
    ["a tape in `<each>`", [LIB, named("items", '<ul id="c"><each in=@items as it><li>${it}</li></each></ul>')], "123"],
    ["a program cell derived from it", [LIB, named("count", '<d:int=(@count + 1)/>\n<p id="c">${@d}</p>')], "8"],
    ["a program cell derived from `@m.count`", [LIB, ns('<d:int=(@m.count + 1)/>\n<p id="c">${@d}</p>')], "8"],
    ["a library function reading its own `@count`", [LIB, named("getCount", '<p id="c">${getCount()}</p>')], "7"],
    ["an app function reading it", [LIB, named("count", 'function g() -> int { return @count; }\n<p id="c">${g()}</p>')], "7"],
    ["same file, `let`", [one("let <c2:int=9/>", '<p id="c">${@c2}</p>')], "9"],
    ["same file, locked", [one("<lk2:int=9/>", '<p id="c">${@lk2}</p>')], "9"],
    ["two libraries' own values of one name, each through its import", [
      { path: "lib.scrml", src: "export let <count:int=7/>\n" }, { path: "lib2.scrml", src: "export let <count:int=8/>\n" },
      { path: ENTRY, src: 'import { count } from "./lib.scrml";\nimport { count as c2 } from "./lib2.scrml";\n<program>\n<p id="c">${@count} ${@c2}</p>\n</program>\n' }], "7 8"],
  ];
  for (const [label, files, want] of READS) {
    test(label, async () => {
      expect((await run(files)).before).toBe(want);
    });
  }
  test("an attribute value `title=@count`", async () => {
    const r = await run([LIB, named("count", '<p id="c" title=@count>x</p>')]);
    expect($("#c").getAttribute("title")).toBe("7");
  });
  test("`if=@flag`", async () => {
    expect((await run([LIB, named("flag", '<p id="c" if=@flag>shown</p>')])).before).toBe("shown");
  });
  test("a handler copies it into a program cell", async () => {
    const r = await run([LIB, named("count", 'let <x:int=0/>\n<button id="b" onclick={ @x = @count; }>b</button><p id="c">${@x}</p>')], { clicks: 1 });
    expect([r.before, r.after]).toEqual(["0", "7"]);
  });
});

describe("one shared instance per declaration (§66.6.4): the library's writes are what every importer reads", () => {
  test("a library function's write (`bump()`), read through a named import", async () => {
    const r = await run([LIB, named("count, bump", '<button id="b" onclick=bump()>b</button><p id="c">${@count}</p>')], { clicks: 1 });
    expect([r.before, r.after]).toEqual(["7", "8"]);
  });
  test("… through the namespace (`m.bump()`, `@m.count`)", async () => {
    const r = await run([LIB, ns('<button id="b" onclick=m.bump()>b</button><p id="c">${@m.count}</p>')], { clicks: 1 });
    expect([r.before, r.after]).toEqual(["7", "8"]);
  });
  test("a library's derived own value follows it (`<dbl:int=(@count * 2)/>`)", async () => {
    const r = await run([LIB, named("dbl, bump", '<button id="b" onclick=bump()>b</button><p id="c">${@dbl}</p>')], { clicks: 1 });
    expect([r.before, r.after]).toEqual(["14", "16"]);
  });
  test("a field write of a struct own value in its file (`setPt()`), read as `@pt.v`", async () => {
    const r = await run([LIB, named("pt, setPt", '<button id="b" onclick=setPt()>b</button><p id="c">${@pt.v}</p>')], { clicks: 1 });
    expect([r.before, r.after]).toEqual(["7", "8"]);
  });
  test("a second library importing it reads the same value the app reads", async () => {
    const r = await run([LIB, { path: "lib2.scrml", src: 'import { count } from "./lib.scrml";\nexport function twice() -> int { return @count * 2; }\n' },
      { path: ENTRY, src: 'import { count, bump } from "./lib.scrml";\nimport { twice } from "./lib2.scrml";\n<program>\n<button id="b" onclick=bump()>b</button><p id="c">${@count} ${twice()}</p>\n</program>\n' }], { clicks: 1 });
    expect([r.before, r.after]).toEqual(["7 14", "8 16"]);
  });
});

describe("writes in the defining file (§66.14 rule 2: governed by the own value's contract)", () => {
  test("a `let` own value: a handler write (was: \"writing a whole instance is not in bootstrap slice M2\")", async () => {
    const r = await run([one("let <c2:int=9/>", '<button id="b" onclick={ @c2 = @c2 + 1; }>b</button><p id="c">${@c2}</p>')], { clicks: 1 });
    expect([r.before, r.after]).toEqual(["9", "10"]);
  });
  test("a function write", async () => {
    const r = await run([one("let <c2:int=9/>\nfunction inc() { @c2 = @c2 + 1; }", '<button id="b" onclick=inc()>b</button><p id="c">${@c2}</p>')], { clicks: 1 });
    expect([r.before, r.after]).toEqual(["9", "10"]);
  });
  test("`reset(@c2)` writes the initializer back", async () => {
    const r = await run([one("let <c2:int=9/>", '<button id="b" onclick={ @c2 = 1; reset(@c2); }>b</button><p id="c">${@c2}</p>')], { clicks: 1 });
    expect([r.before, r.after]).toEqual(["9", "9"]);
  });
  test("a struct field and a tape append", async () => {
    const r = await run([one("type Q:struct = { v: int }\nlet <q:Q=({ v: 1 })/>", '<button id="b" onclick={ @q.v = 5; }>b</button><p id="c">${@q.v}</p>')], { clicks: 1 });
    expect([r.before, r.after]).toEqual(["1", "5"]);
    const t = await run([one("<xs:int[free, append]=([1])/>", '<button id="b" onclick={ @xs.append(2); }>b</button><p id="c">${@xs.length}</p>')], { clicks: 1 });
    expect([t.before, t.after]).toEqual(["1", "2"]);
  });
  test("a derived own value (written type or inferred) recomputes", async () => {
    for (const d of ["<d2:int=(@c2 * 10)/>", "<d2=(@c2 * 10)/>"]) {
      const r = await run([one("let <c2:int=2/>\n" + d, '<button id="b" onclick={ @c2 = 3; }>b</button><p id="c">${@d2}</p>')], { clicks: 1 });
      expect([r.before, r.after]).toEqual(["20", "30"]);
    }
  });
  test("a `single` enum own value moves along its graph", async () => {
    const r = await run([one("type Ph:enum = { A, B }\nlet <ph:Ph=.A single>\n    <A rule=.B/>\n    <B rule=.A/>\n</>", '<button id="b" onclick={ @ph = .B; }>b</button><p id="c">${@ph == .B ? "B" : "A"}</p>')], { clicks: 1 });
    expect([r.before, r.after]).toEqual(["A", "B"]);
  });
  test("bind:value two-way", async () => {
    const r = fe([one('let <nm:string="a"/>', '<input id="i" bind:value=@nm/><p id="c">${@nm}</p>')]);
    expect(errs(r)).toEqual([]);
    await loadProgram(r.core, "s475-fsov-" + k++);
    $("#i").value = "zz";
    $("#i").dispatchEvent(new window.Event("input"));
    expect($("#c").textContent).toBe("zz");
  });
  test("a locked own value is not writable — E-WRITE-NOT-GRANTED (its contract)", () => {
    expect(errs(fe([one("<lk2:int=9/>", '<button id="b" onclick={ @lk2 = 1; }>b</button>')])).map((d) => d.code)).toEqual(["E-WRITE-NOT-GRANTED"]);
  });
});

describe("writes from another file stay refused by name (§66.14 ⚑ O2 / O39, INTERIM)", () => {
  const XW = [
    ["`@count = 1` after a named import", [LIB, named("count", '<button onclick={ @count = 1; }>b</button>')], "@count"],
    ["`@m.count = 1`", [LIB, ns('<button onclick={ @m.count = 1; }>b</button>')], "@m.count"],
    ["`bind:value=@name`", [LIB, named("name", "<input bind:value=@name/>")], "@name"],
    ["(N2) `@pt.v = 3` — a part of the own value, not described as `@pt = …`", [LIB, named("pt", '<button onclick={ @pt.v = 3; }>b</button>')], "@pt"],
  ];
  for (const [label, files, at] of XW) {
    test(label, () => {
      const e = errs(fe(files));
      expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(files[1].src.slice(e[0].span.start, e[0].span.end)).toBe(at);
      expect(e[0].message).toContain("own value of `<");
      expect(e[0].message).toContain("O2 / O39");
      expect(e[0].message).toContain("declared in `lib.scrml`");
      expect(e[0].message).not.toContain(" = …` writes");
    });
  }
  test("(N2) `@box = 5` — a declaration with NO own value: the whole-instance message, not \"writes the own value\"", () => {
    const e = errs(fe([LIB, named("box", '<button onclick={ @box = 5; }>b</button>')]));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("writing a whole instance");
    expect(e[0].message).not.toContain("own value");
  });
  test("near-miss: an exported field of a field-only declaration is writable from another file (§66.14 rule 3)", async () => {
    const r = await run([LIB, named("box", '<button id="b" onclick={ @box.n = 5; }>b</button><p id="c">${@box.n}</p>')], { clicks: 1 });
    expect([r.before, r.after]).toEqual(["1", "5"]);
  });
});

describe("(N3) a namespace member the module does not export, WRITTEN: E-IMPORT-004 as the read is (§21.3 rule 5)", () => {
  for (const w of ["@m.nope = 9", "@m.nope.x = 9"]) {
    test(`\`${w}\` (was: E-STATE-UNDECLARED "declare it, e.g. \`let <m.nope:T=(…)/>\`")`, () => {
      const e = errs(fe([LIB, ns(`<button onclick={ ${w}; }>b</button>`)]));
      expect(e.map((d) => d.code)).toEqual(["E-IMPORT-004"]);
      expect(e[0].message).toContain("`nope` is not exported by `./lib.scrml`");
    });
  }
});

describe("own values the bootstrap does not build as the instance's value are refused by name, never read as an object", () => {
  test("a typed own value with no `=` (`<n:int/>`, ⚑ O31 canonical empty) — refused at the read (was: no diagnostic)", () => {
    const e = errs(fe([one("<n:int/>", '<p id="c">${@n}</p>')]));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("reads the own value of `<n>`");
  });
  test("an own value beside a child field — refused at the read", () => {
    const e = errs(fe([one("<c4:int=1>\n    let <k:int=2/>\n</>", '<p id="c">${@c4}</p>')]));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("reads the own value of `<c4>`");
  });
  test("(N1) no refusal names a form that is itself refused", () => {
    for (const files of [[one("<n:int/>", '<p id="c">${@n}</p>')], [one("<c4:int=1>\n    let <k:int=2/>\n</>", '<p id="c">${@c4}</p>')]]) {
      for (const d of errs(fe(files))) expect(d.message).not.toContain("read it through a function");
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// (N4) E-TX-FAIL-AFTER-COMMIT reported a `fail` that cannot run: one after another `fail` in the same block.
const SQ = "?" + "{";
const E = "    type E:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost, Transport(t: ServerCallError) }\n";
const HOST = `<host>\n  title() -> string = document.title\n</host>\n`;
const TX = (body) => `<program db="./app.db">
${HOST}${E}    function hold(a: int)! E {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run();
        return 1;
    }
    function bad() -> boolean {
        return title() == "";
    }
    let <r:int=0/>
    function book(a: int, f: int)! E {
${body}
    }
    <main><button onclick={ @r = book(1, 1) !{ .Bad :> 7, _ :> 9, }; }>go</button></main>
</program>
`;
const txAt = (src) => frontEnd(srvMods(), [{ path: ENTRY, src }]).diags.filter((d) => d.code === "E-TX-FAIL-AFTER-COMMIT").map((d) => src.slice(d.span.start, d.span.end));

describe("(N4) an unreachable exit is not reported", () => {
  test("`if (bad()) { fail .Bad; fail .ConnectionLost; }` — one report, at the `fail` that can run (was: two)", () => {
    expect(txAt(TX(`        hold(a)?;\n        if (bad()) {\n            fail .Bad;\n            fail .ConnectionLost;\n        }\n        return 3;`))).toEqual(["fail .Bad"]);
  });
  test("near-miss: two branches each with a reachable `fail` — both reported", () => {
    expect(txAt(TX(`        hold(a)?;\n        if (bad()) {\n            fail .Bad;\n        } else {\n            fail .ConnectionLost;\n        }`))).toEqual(["fail .Bad", "fail .ConnectionLost"]);
  });
});
