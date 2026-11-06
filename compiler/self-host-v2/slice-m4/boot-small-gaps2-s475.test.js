// boot-small-gaps2-s475.test.js — s475-boot-small-gaps2: three LOW bootstrap gaps in analyze.scrml.
//
// 1. g-boot-namespace-cell-read-s475 — `@m.count` through `import * as m from "./lib.scrml"`.
//    SPEC §21.3 (S475): rule 2 "In logic, `m.name` reads the export `name`: the same declaration a named
//    import `import { name } from './x.scrml'` would bind."; rule 4 "A dotted head resolves by what its
//    first name is bound to … When `a` is a namespace-import binding, `a.x` is the module member `x`";
//    rule 5 "A member the module does not export (`m.nope`, `<m.nope/>`) is E-IMPORT-004".
//    A WRITE of the module's own value from another file: §66.14 ⚑ O2 / O39 "Whether module-level `export`
//    of the declaration makes its own value writable from other files … is not ruled … §66.19 routes every
//    cross-file write of an own value through a function exported from the defining file." — refused by
//    name, INTERIM. A field of an exported declaration's EXPORTED field stays writable (§66.14 rule 3).
// 2. g-boot-namespace-host-import-clash-s475 — §21.3.1.1 "A binding's local name SHALL NOT also be declared
//    in its file (`E-SCOPE-010`)": a namespace import's name is a file-scope binding (§21.3 rule 1).
// 3. g-boot-tx-fail-after-commit-precision-s475 — E-TX-FAIL-AFTER-COMMIT (§19.10.5, S475 ruling item 1):
//    (b) an exit in a LATER statement is reported at the `fail` / `?`, not the whole statement;
//    (c) the message no longer reads "…, which uses the browser, which needs the browser".
//    (a) and (d) are pinned as they stand (no change; see the gap entry).

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
  src: "export let <count:int=7/>\nexport <box:struct>\n    export let <n:int=1/>\n</>\nrenders <i>${n}</i>\nexport function f() -> int { return 1; }\n",
};
const app = (src) => ({ path: ENTRY, src: `import * as m from "./lib.scrml";\n<program>\n${src}\n</program>\n` });
const named = (names, src) => ({ path: ENTRY, src: `import { ${names} } from "./lib.scrml";\n<program>\n${src}\n</program>\n` });
const fe = (files) => frontEnd(mods, files, ENTRY);
const printed = (r) => mods.print.printProgram(r.core, "x.client.js", "scrml-runtime.js");
const $ = (sel) => document.querySelector(sel);
let k = 0;

describe("g-boot-namespace-cell-read-s475: `@m.x` is the module's exported declaration", () => {
  // `@m.count` resolves to the declaration `import { count }` binds (§21.3 rule 2). That declaration's OWN
  // value is not built in the bootstrap (a file-scope declaration outside `<program>`): every spelling read
  // the instance and rendered "[object Object]" with no diagnostic (measured on origin/main for `@count`
  // after `import { count }` and in the declaring file). Now refused by name, fail closed, INTERIM
  // (g-boot-file-scope-own-value-read-unbuilt-s475).
  test("`@m.count` resolves to the exported declaration — one refusal naming its own value and its file (was: E-STATE-UNDECLARED on `@m` + E-BOOTSTRAP-UNSUPPORTED on `.count`)", () => {
    const src = app(`<p id="c">\${@m.count}</p>`);
    const e = errs(fe([LIB, src]));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(src.src.slice(e[0].span.start, e[0].span.end)).toBe("@m.count");
    expect(e[0].message).toContain("the own value of `<count>`, declared outside `<program>` in `lib.scrml`");
  });
  test("the same refusal for `@count` after `import { count }`, and in the declaring file (was: no diagnostic, rendered \"[object Object]\")", () => {
    const e1 = errs(fe([LIB, named("count", `<p id="c">\${@count}</p>`)]));
    expect(e1.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e1[0].message).toContain("the own value of `<count>`");
    const e2 = errs(fe([{ path: ENTRY, src: `let <count:int=7/>\n<program>\n<p id="c">\${@count}</p>\n</program>\n` }]));
    expect(e2.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("near-miss: a cell inside `<program>` reads its value (unchanged)", async () => {
    const r = fe([{ path: ENTRY, src: `<program>\nlet <count:int=7/>\n<p id="c">\${@count}</p>\n</program>\n` }]);
    expect(errs(r)).toEqual([]);
    await loadProgram(r.core, "s475-g2-progcell-" + k++);
    expect($("#c").textContent).toBe("7");
  });
  test("`<m.box/>`-style declarations: `@m.box` prints exactly what `@box` after `import { box }` prints (§21.3 rule 2: the same declaration)", () => {
    const ns = printed(fe([LIB, app(`<p id="c">\${@m.box.n}</p>`)]));
    const nm = printed(fe([LIB, named("box", `<p id="c">\${@box.n}</p>`)]));
    expect(ns.js).toBe(nm.js);
    expect(ns.html).toBe(nm.html);
  });
  test("an exported field through the namespace: read and written (§66.14 rule 3), and it runs", async () => {
    const r = fe([LIB, app(`<button id="b" onclick={ @m.box.n = @m.box.n + 41; }>x</button><p id="n">\${@m.box.n}</p>`)]);
    expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
    await loadProgram(r.core, "s475-g2-nsfield-" + k++);
    expect($("#n").textContent).toBe("1");
    click($("#b"));
    expect($("#n").textContent).toBe("42");
  });
  test("a write of the own value from another file is refused by name (INTERIM, §66.14 ⚑ O2 / O39) — through the namespace and a named import alike", () => {
    for (const [files, written] of [
      [[LIB, app(`<button onclick={ @m.count = 2; }>x</button>`)], "@m.count"],
      [[LIB, named("count", `<button onclick={ @count = 2; }>x</button>`)], "@count"],
    ]) {
      const r = fe(files);
      const e = errs(r);
      expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(files[1].src.slice(e[0].span.start, e[0].span.end)).toBe(written);
      expect(e[0].message).toContain("O2 / O39");
      expect(e[0].message).toContain("declared in `lib.scrml`");
      expect(e[0].message).toContain("§66.19");
      expect(e[0].message).not.toContain("write a field");
    }
  });
  test("`@m.nope` (not exported) is E-IMPORT-004 naming the member and the file (§21.3 rule 5)", () => {
    const r = fe([LIB, app(`<p>\${@m.nope}</p>`)]);
    expect(errs(r).map((d) => d.code)).toEqual(["E-IMPORT-004"]);
    expect(errs(r)[0].message).toContain("`nope` is not exported by `./lib.scrml`");
  });
  test("`@m.f` (an exported function) is no cell — E-SCOPE-001", () => {
    const r = fe([LIB, app(`<p>\${@m.f}</p>`)]);
    expect(errs(r).map((d) => d.code)).toEqual(["E-SCOPE-001"]);
    expect(errs(r)[0].message).toContain("not a cell or a declaration");
  });
  test("`@m` alone names the namespace, not a cell — E-SCOPE-001 (was: E-STATE-UNDECLARED)", () => {
    const r = fe([LIB, app(`<p>\${@m}</p>`)]);
    expect(errs(r).map((d) => d.code)).toEqual(["E-SCOPE-001"]);
    expect(errs(r)[0].message).toContain("`m` is a namespace import, not a cell");
  });
  test("near-miss: `@cell.field` with a cell named like no namespace is untouched", () => {
    const r = fe([LIB, app(`    type P:struct = { v: int }\n    let <pt:P=({ v: 3 })/>\n    <p id="v">\${@pt.v}</p>`)]);
    expect(errs(r)).toEqual([]);
  });
});

describe("g-boot-namespace-host-import-clash-s475: a host binding and a namespace import of one name", () => {
  const STD = "scrml:hm/index.scrml";
  const OTHER = { path: "scrml:hm/other.scrml", src: "${\n    export fn one() -> int {\n        return 1;\n    }\n}\n" };
  const BODY = "${\n    export fn fl(x: int) -> int {\n        return x;\n    }\n}\n";
  const run = (lib) => frontEnd(mods, [OTHER, { path: STD, src: lib }, { path: ENTRY, src: '<program>\n${ import { fl } from "scrml:hm"; }\n<p>${fl(2)}</p>\n</program>\n' }], ENTRY, { stdlibPaths: [OTHER.path, STD] });
  test("`import * as h` + `import:host { h }` — E-SCOPE-010 at the host binding, naming the namespace import (was: no diagnostic)", () => {
    const lib = 'import * as h from "./other.scrml";\nimport:host { h } from "./h.js";\n' + BODY;
    const r = run(lib);
    const e = errs(r).filter((d) => d.code === "E-SCOPE-010");
    expect(e.length).toBe(1);
    expect(e[0].file).toBe(STD);
    expect(e[0].message).toContain('`import * as h from "./other.scrml"`');
    expect(lib.slice(e[0].span.start, e[0].span.end)).toBe("h");
  });
  test("near-miss: different names — no E-SCOPE-010", () => {
    const r = run('import * as o from "./other.scrml";\nimport:host { h } from "./h.js";\n' + BODY);
    expect(errs(r).filter((d) => d.code === "E-SCOPE-010")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------
const SQ = "?" + "{";
const E = "    type E:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost, Transport(t: ServerCallError) }\n";
const HOST = `<host>\n  title() -> string = document.title\n</host>\n`;
const TX = (body) => `<program db="./app.db">
${HOST}${E}    function hold(a: int)! E {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run();
        return 1;
    }
    function chkB()! E {
        if (title() == "x") fail .Bad;
        return 1;
    }
    function bad() -> boolean {
        return title() == "";
    }
    function viaH(a: int) -> int {
        return hold(a) !{ _ :> 0, };
    }
    fn id(x: int) -> int {
        return x;
    }
    let <r:int=0/>
    function book(a: int, f: int)! E {
${body}
    }
    <main><button onclick={ @r = book(1, 1) !{ .Bad :> 7, _ :> 9, }; }>go</button></main>
</program>
`;
const txErrs = (src) => frontEnd(srvMods(), [{ path: ENTRY, src }]).diags.filter((d) => d.severity === "Error");
const tx = (e) => e.filter((d) => d.code === "E-TX-FAIL-AFTER-COMMIT");

describe("g-boot-tx-fail-after-commit-precision-s475", () => {
  test("(b) a `fail` in a later statement: the report is at the `fail`, not the whole `if` (was: `if (bad()) fail .Bad;`)", () => {
    const src = TX(`        hold(a)?;\n        if (bad()) fail .Bad;\n        return 3;`);
    const e = txErrs(src);
    expect(e.map((d) => d.code)).toEqual(["E-TX-FAIL-AFTER-COMMIT"]);
    expect(src.slice(e[0].span.start, e[0].span.end)).toBe("fail .Bad");
  });
  test("(b) a `?` in a later statement: the report is at the `?` expression (was: the whole `const`)", () => {
    const src = TX(`        hold(a)?;\n        const y: int = chkB()?;\n        return y;`);
    const e = txErrs(src);
    expect(e.map((d) => d.code)).toEqual(["E-TX-FAIL-AFTER-COMMIT"]);
    expect(src.slice(e[0].span.start, e[0].span.end)).toBe("chkB()?");
  });
  test("(b) two exits in one later statement: one report at each", () => {
    const src = TX(`        hold(a)?;\n        if (bad()) {\n            fail .Bad;\n        } else {\n            fail .ConnectionLost;\n        }`);
    const e = tx(txErrs(src));
    expect(e.map((d) => src.slice(d.span.start, d.span.end))).toEqual(["fail .Bad", "fail .ConnectionLost"]);
  });
  test("(c) the browser call is named once: \"a call of `bad()`, which needs the browser\" (was: \"…, which uses the browser, which needs the browser\")", () => {
    const src = TX(`        hold(a)?;\n        if (bad()) fail .Bad;\n        return 3;`);
    const m = tx(txErrs(src))[0].message;
    expect(m).toContain("it uses a call of `bad()`, which needs the browser");
    expect(m).not.toContain("which uses the browser, which needs the browser");
  });
  test("(c) the same in the call's own statement (lateHits)", () => {
    const src = TX(`        const y: int = id(hold(a) !{ _ :> 0, }) + (bad() ? 1 : 0);\n        if (f > 0) fail .Bad;\n        return y;`);
    for (const d of txErrs(src)) expect(d.message).not.toContain("which uses the browser, which needs the browser");
  });
  // (a) PINNED (no change): a server call inside a lambda is refused by the §13.2 awaited-combinator refusal
  // before the E-TX check could count it; and in the bootstrap a lambda is only a sequence method's argument,
  // which runs where it is written.
  test("(a) pinned: a server call in a lambda — refused by name (§13.2 awaited combinator), and no E-TX-FAIL-AFTER-COMMIT", () => {
    const e = txErrs(TX(`        const xs: int[] = [1, 2].map((x) => viaH(x));\n        if (bad()) fail .Bad;\n        return 3;`));
    expect(e.some((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED" && d.message.includes("awaited combinator"))).toBe(true);
    expect(tx(e)).toEqual([]);
  });
  // (d) PINNED (no change): a handled failable inside a larger expression is slice Ue2 (ordered hoisting).
  test("(d) pinned: `fail .QueryFailed(id(hold(a) !{…}) == 1 ? …)` inside an `if` — E-BOOTSTRAP-UNSUPPORTED (slice Ue2)", () => {
    const e = txErrs(TX(`        if (f > 0) {\n            fail .QueryFailed(id(hold(a) !{ _ :> 0, }) == 1 ? "a" : "b");\n        }\n        return 3;`));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("slice Ue2");
  });
});
