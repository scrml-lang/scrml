// visibility-s472.test.js — s472-boot-link-visibility: the export / import
// boundary holds at every USE (closes g-boot-flat-link-namespace-s471).
//
// Before s472 the bootstrap linked every file into ONE namespace: a function,
// type or declaration of any linked file — exported-but-not-imported, or not
// exported at all — was usable without importing it (a `scrml:` module's
// internals included), and two files could not each keep a private name (the
// second was refused as "the bootstrap links one namespace", which withdrew a
// stdlib module whose private name a user file happened to share).
//
// SPEC: §21.3 "Named imports … SHALL be resolved by the compiler against the
// exporting file's export list"; "Importing a name that is not exported by the
// target file SHALL be a compile error (E-IMPORT-004)"; §5.2 (§34 E-SCOPE-001: "Unquoted identifier not resolvable in scope") "An unquoted
// identifier that cannot be resolved SHALL be a compile error (E-SCOPE-001)";
// §14.1.2 every type name SHALL resolve to "a built-in …, a type declared in the
// same file …, or an imported type"; §41.7 "When an `import` statement imports a
// name that is already in scope from another `import` statement in the same
// file, the later import WINS and a W-IMPORT-001 warning is emitted."

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { join } from "node:path";
import { mods, check, serve, post, bridge, spyDriver } from "./server-artifact-harness.js";
import { frontEnd, frontEndStdlib } from "../slice-m2/lowered.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

const FIXTURE = join(import.meta.dir, "src", "stdlib-s472");
const ENTRY = "app.scrml";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 120000 });
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  if (globalThis.document) globalThis.document.cookie = "scrml_csrf=; Max-Age=0; Path=/";
  expectNoPageErrors();
});
const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

const run = (entrySrc, aux = []) => frontEnd(mods(), [...aux, { path: ENTRY, src: entrySrc }], ENTRY);
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (r) => r.diags.map((d) => d.code).sort();
const clean = (r) => {
  expect(errs(r).map((d) => `${d.code} ${d.file}: ${d.message}`)).toEqual([]);
  expect(check(r.core)).toEqual([]);
  return r;
};
const std = (src) => frontEndStdlib(mods(), [{ path: ENTRY, src }], ENTRY, { stdlibRoot: FIXTURE });
const text = (sel) => document.querySelector(sel).textContent;
let k = 0;

// The review probes (~/.cache/scrml/review/s471-stdlib/probes p2, p3, t2).
const LIB = {
  path: "lib.scrml",
  src: `\${
    export fn shout(s: string) -> string {
        return \`\${s.toUpperCase()}!\`;
    }

    fn hidden(s: string) -> string {
        return s;
    }

    export fn twice(n: int) -> int {
        return n * 2;
    }
}
`,
};

const COLORS = {
  path: "colors.scrml",
  src: `\${
    export type Color:enum = { Red, Blue }
    export fn name(c: Color) -> string {
        return match c {
            .Red :> "red",
            .Blue :> "blue"
        };
    }
}
`,
};

describe("a function is usable only where it is declared or imported (§21.3, E-SCOPE-001)", () => {
  test("p2 — an EXPORTED function that is not imported: E-SCOPE-001 at the use, naming where it is declared", () => {
    const src = `<program>
    \${ import { shout } from "./lib.scrml"; }
    let <n:int=4/>
    <main>
        <p id="s">\${twice(@n)}</p>
    </main>
</program>
`;
    const r = run(src, [LIB]);
    expect(codes(r)).toEqual(["E-SCOPE-001"]);
    const d = r.diags[0];
    expect(d.file).toBe(ENTRY);
    expect(src.slice(d.span.start, d.span.end)).toBe("twice");
    expect(d.message).toContain("`lib.scrml`");
    expect(d.message).toContain("import");
  });

  test("p3 — a function its file does not export, not imported: E-SCOPE-001", () => {
    const src = `<program>
    \${ import { shout } from "./lib.scrml"; }
    let <name:string="world"/>
    <main>
        <p id="s">\${hidden(@name)}</p>
    </main>
</program>
`;
    const r = run(src, [LIB]);
    expect(codes(r)).toEqual(["E-SCOPE-001"]);
    expect(r.diags[0].message).toContain("does not export");
  });

  test("a function its file does not export, IMPORTED: E-IMPORT-004 at the import, and the use is not also E-SCOPE-001", () => {
    const src = `<program>
    \${ import { hidden } from "./lib.scrml"; }
    <p>\${hidden("x")}</p>
</program>
`;
    expect(codes(run(src, [LIB]))).toEqual(["E-IMPORT-004"]);
  });

  test("imported AND exported: clean, and it runs", async () => {
    const src = `<program>
    \${ import { shout, twice } from "./lib.scrml"; }
    let <n:int=4/>
    <main>
        <p id="s">\${shout("hi")} \${twice(@n)}</p>
    </main>
</program>
`;
    const r = clean(run(src, [LIB]));
    await loadProgram(r.core, "s472-ok-" + k++);
    expect(text("#s")).toBe("HI! 8");
  });

  test("a call inside a function body is judged by the function's own file, too", () => {
    const other = { path: "other.scrml", src: `\${\n    export fn relay(n: int) -> int {\n        return twice(n);\n    }\n}\n` };
    const src = `<program>\n    \${ import { relay } from "./other.scrml"; }\n    <p>\${relay(2)}</p>\n</program>\n`;
    const r = run(src, [LIB, other]);
    expect(r.diags.map((d) => [d.code, d.file])).toEqual([["E-SCOPE-001", "other.scrml"]]);
  });
});

describe("private names in two files do not collide; each use resolves to its own (§21.3)", () => {
  const A = { path: "a.scrml", src: `\${\n    fn helper() -> string {\n        return "A";\n    }\n    export fn fromA() -> string {\n        return helper();\n    }\n}\n` };
  const B = { path: "b.scrml", src: `\${\n    fn helper() -> string {\n        return "B";\n    }\n    export fn fromB() -> string {\n        return helper();\n    }\n}\n` };

  test("three private `helper`s (two libraries and the page): clean, and each call reaches its own", async () => {
    const src = `<program>
    \${ import { fromA } from "./a.scrml"; import { fromB } from "./b.scrml"; }
    function helper() -> string {
        return "APP";
    }
    <main>
        <p id="h">\${fromA()} \${fromB()} \${helper()}</p>
    </main>
</program>
`;
    const r = clean(run(src, [A, B]));
    await loadProgram(r.core, "s472-priv-" + k++);
    expect(text("#h")).toBe("A B APP");
  });

  test("two private types of one name: each file's annotations name its own", async () => {
    const TA = { path: "ta.scrml", src: `\${\n    type Box:struct = { v: string }\n    export fn boxA() -> string {\n        const b: Box = { v: "a" };\n        return b.v;\n    }\n}\n` };
    const TB = { path: "tb.scrml", src: `\${\n    type Box:struct = { n: int }\n    export fn boxB() -> int {\n        const b: Box = { n: 7 };\n        return b.n;\n    }\n}\n` };
    const src = `<program>\n    \${ import { boxA } from "./ta.scrml"; import { boxB } from "./tb.scrml"; }\n    <p id="b">\${boxA()} \${boxB()}</p>\n</program>\n`;
    const r = clean(run(src, [TA, TB]));
    await loadProgram(r.core, "s472-box-" + k++);
    expect(text("#b")).toBe("a 7");
  });

  test("a bare variant with no expected type sees only the enums in scope in its file", () => {
    const L = { path: "l.scrml", src: `\${\n    type Light:enum = { Red, Green }\n    export fn lit() -> string {\n        return "l";\n    }\n}\n` };
    const src = `<program>
    \${ import { lit } from "./l.scrml"; }
    type Ink:enum = { Red, Black }
    function inkName(i: Ink) -> string {
        return match i {
            .Red :> "red",
            .Black :> "black"
        };
    }
    <p>\${inkName(.Red)} \${lit()}</p>
</program>
`;
    clean(run(src, [L]));
  });

  test("two server functions of one name in two files: two routes, each answering with its own function — server and client", async () => {
    const SQ = "?" + "{";
    // sa.scrml: a private server function `load` (the deprecated modifier — a `?{}` in an
    // imported file is not in the bootstrap), called from the client by the exported `viaA`
    const SA = { path: "sa.scrml", src: `\${
    server function load(id: string) -> string {
        return "a:" + id;
    }
    export function viaA(id: string) -> string {
        const v: string = load(id) !{ .Transport(t) :> { return "down"; } };
        return v;
    }
}
` };
    const src = `<program db="./app.db">
    \${ import { viaA } from "./sa.scrml"; }
    type Row:struct = { name: string }
    let <out:string=""/>
    function load(id: int) -> string {
        const r: Row = ${SQ}\`SELECT name FROM b WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return "b:" + r.name;
    }
    <main>
        <button id="a" onclick={ @out = viaA("1"); }>a</button>
        <button id="b" onclick={ @out = load(1) !{ .Transport(t) :> return }; }>b</button>
        <p id="out">\${@out}</p>
    </main>
</program>
`;
    const r = clean(run(src, [SA]));
    const { srv, routes, js } = await serve(r.core, spyDriver(() => [{ name: "bo" }]).fn);
    const loads = routes.filter((x) => x.fn === "load");
    expect(loads.length).toBe(2);
    expect(new Set(loads.map((x) => x.path)).size).toBe(2);
    // one route constant per route (print.scrml routeName): `route$load` and `route$load$1`
    expect(js).toContain("route$load$1");
    const answers = [];
    // each route decodes its own parameter type strictly (§57): sa.scrml's takes a string, the page's an int
    for (const x of loads) {
      const s = await post(srv, x.path, ["1"]);
      answers.push(s.status === 200 ? s.json : (await post(srv, x.path, [1])).json);
    }
    expect(answers.sort()).toEqual(["a:1", "b:bo"].sort());
    await loadProgram(r.core, "s472-srv-" + k++);
    globalThis.fetch = bridge(srv);
    click(document.querySelector("#a"));
    await settle();
    expect(text("#out")).toBe("a:1");
    click(document.querySelector("#b"));
    await settle();
    expect(text("#out")).toBe("b:bo");
  });
});

describe("a type is usable only where it is declared or imported (§14.1.2)", () => {
  test("t2 — an exported type that is not imported: refused in the annotation (E-TYPE-UNKNOWN) and in the expression (E-SCOPE-001)", () => {
    const src = `<program>
    \${ import { name } from "./colors.scrml"; }
    let <c:Color=(Color.Red)/>
    <main>
        <p id="s">\${name(@c)}</p>
    </main>
</program>
`;
    const r = run(src, [COLORS]);
    expect(errs(r).length).toBeGreaterThan(0);
    expect(codes(r)).toContain("E-TYPE-UNKNOWN");
    const unk = r.diags.find((d) => d.code === "E-TYPE-UNKNOWN");
    expect(unk.message).toContain("`colors.scrml`");
  });

  test("the same, with the type imported alias-free: clean, and it runs", async () => {
    const src = `<program>
    \${ import { Color, name } from "./colors.scrml"; }
    let <c:Color=(Color.Blue)/>
    <main>
        <p id="s">\${name(@c)}</p>
    </main>
</program>
`;
    const r = clean(run(src, [COLORS]));
    await loadProgram(r.core, "s472-type-" + k++);
    expect(text("#s")).toBe("blue");
  });
});

describe("a user declaration is usable only where it is declared or imported", () => {
  const CARD = { path: "card.scrml", src: `export <card:struct>\n    let <label:string="x"/>\n</>\nrenders <b class="card">\${label}</b>\n\n\${\n    export fn noop() -> int {\n        return 0;\n    }\n}\n` };

  test("`<card>` declared in another file and not imported: refused by name (never rendered as an unknown HTML element)", () => {
    const src = `<program>\n    \${ import { noop } from "./card.scrml"; }\n    <main><card label="hi"/></main>\n</program>\n`;
    const r = run(src, [CARD]);
    expect(codes(r)).toEqual(["E-SCOPE-001"]);
    expect(r.diags[0].message).toContain("`card.scrml`");
  });

  test("imported: clean", () => {
    const src = `<program>\n    \${ import { card } from "./card.scrml"; }\n    <main><card label="hi"/></main>\n</program>\n`;
    clean(run(src, [CARD]));
  });
});

describe("an import binds a name in file scope", () => {
  test("a file that declares a name AND imports it: E-SCOPE-010 at the imported name (a name is bound once in file scope, §7.6)", () => {
    const src = `<program>
    \${ import { twice } from "./lib.scrml"; }
    function twice(n: int) -> int {
        return n + n;
    }
    <p>\${twice(1)}</p>
</program>
`;
    const r = run(src, [LIB]);
    expect(codes(r)).toEqual(["E-SCOPE-010"]);
    expect(src.slice(r.diags[0].span.start, r.diags[0].span.end)).toBe("twice");
  });

  test("two imports of one name: the later wins, with W-IMPORT-001 (§41.7)", async () => {
    const L2 = { path: "lib2.scrml", src: `\${\n    export fn twice(n: int) -> int {\n        return n * 20;\n    }\n}\n` };
    const src = `<program>
    \${ import { twice } from "./lib.scrml"; import { twice } from "./lib2.scrml"; }
    <p id="t">\${twice(1)}</p>
</program>
`;
    const r = run(src, [LIB, L2]);
    expect(r.diags.map((d) => [d.code, d.severity])).toEqual([["W-IMPORT-001", "Warning"]]);
    clean(r);
    await loadProgram(r.core, "s472-later-" + k++);
    expect(text("#t")).toBe("20");
  });
});

describe("a `scrml:` module's internals are not reachable (fixture stdlib, src/stdlib-s472)", () => {
  test("an imported function runs; the page keeps its OWN private `helper` beside the module's (no withdrawal)", async () => {
    const src = `<program>
    \${ import { pub } from "scrml:vis"; }
    function helper() -> string {
        return "app-helper";
    }
    <main>
        <p id="v">\${pub("x")} \${helper()}</p>
    </main>
</program>
`;
    const r = std(src);
    expect(r.stdlib.refused).toEqual([]);
    clean(r);
    await loadProgram(r.core, "s472-std-" + k++);
    expect(text("#v")).toBe("lib-helper:X app-helper");
  });

  test("the module's private `helper`, not imported: E-SCOPE-001 in the page", () => {
    const r = std(`<program>\n    \${ import { pub } from "scrml:vis"; }\n    <p>\${helper()}</p>\n</program>\n`);
    expect(r.diags.map((d) => [d.code, d.file])).toEqual([["E-SCOPE-001", ENTRY]]);
  });

  test("a function a module FILE exports to the module (not to the page): E-SCOPE-001", () => {
    const r = std(`<program>\n    \${ import { pub } from "scrml:vis"; }\n    <p>\${inner("x")}</p>\n</program>\n`);
    expect(r.diags.map((d) => [d.code, d.file])).toEqual([["E-SCOPE-001", ENTRY]]);
  });

  test("importing the private name: E-IMPORT-004", () => {
    const r = std(`<program>\n    \${ import { helper } from "scrml:vis"; }\n    <p>\${helper()}</p>\n</program>\n`);
    expect(r.diags.map((d) => [d.code, d.file])).toEqual([["E-IMPORT-004", ENTRY]]);
  });

  test("an exported type, imported alias-free, annotates a page cell", async () => {
    const r = std(`<program>\n    \${ import { Tone, toneName } from "scrml:vis"; }\n    let <t:Tone=(Tone.Cool)/>\n    <p id="t">\${toneName(@t)}</p>\n</program>\n`);
    clean(r);
    await loadProgram(r.core, "s472-tone-" + k++);
    expect(text("#t")).toBe("cool");
  });

  test("the same type, not imported: refused", () => {
    const r = std(`<program>\n    \${ import { toneName } from "scrml:vis"; }\n    let <t:Tone=(Tone.Cool)/>\n    <p>\${toneName(@t)}</p>\n</program>\n`);
    expect(codes(r)).toContain("E-TYPE-UNKNOWN");
  });
});
