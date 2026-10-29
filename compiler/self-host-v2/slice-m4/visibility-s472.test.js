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

  // s473 r2 #5 (narrowed to exported names): two user files EXPORTING one name are E-SCOPE-010 at
  // the later file; the §41.7 W-IMPORT-001 still reports the second import beside it.
  test("two imports of one name from two user files that both export it: E-SCOPE-010 (§7.6, S473), with W-IMPORT-001 (§41.7)", () => {
    const L2 = { path: "lib2.scrml", src: `\${\n    export fn twice(n: int) -> int {\n        return n * 20;\n    }\n}\n` };
    const src = `<program>
    \${ import { twice } from "./lib.scrml"; import { twice } from "./lib2.scrml"; }
    <p id="t">\${twice(1)}</p>
</program>
`;
    const r = run(src, [LIB, L2]);
    expect(r.diags.map((d) => [d.code, d.file]).sort()).toEqual([["E-SCOPE-010", "lib2.scrml"], ["W-IMPORT-001", ENTRY]].sort());
  });

  // s473 r2 LOW-C: later-import-wins can still happen between a USER import and a STDLIB import of one
  // name (stdlib names are not user declarations, so the pair is legal). The runtime proves which won.
  test("a user import and a stdlib import of one name: the later wins, with W-IMPORT-001 (§41.7) — either order, and it runs", async () => {
    const U = { path: "u.scrml", src: `\${\n    export fn pub(s: string) -> string {\n        return "user:" + s;\n    }\n}\n` };
    const stdU = (src) => frontEndStdlib(mods(), [U, { path: ENTRY, src }], ENTRY, { stdlibRoot: FIXTURE });
    const r1 = stdU(`<program>\n    \${ import { pub } from "./u.scrml"; import { pub } from "scrml:vis"; }\n    <p id="w">\${pub("x")}</p>\n</program>\n`);
    expect(r1.diags.map((d) => [d.code, d.severity])).toEqual([["W-IMPORT-001", "Warning"]]);
    clean(r1);
    await loadProgram(r1.core, "s473-later-std-" + k++);
    expect(text("#w")).toBe("lib-helper:X");
    const r2 = stdU(`<program>\n    \${ import { pub } from "scrml:vis"; import { pub } from "./u.scrml"; }\n    <p id="w">\${pub("x")}</p>\n</program>\n`);
    expect(r2.diags.map((d) => [d.code, d.severity])).toEqual([["W-IMPORT-001", "Warning"]]);
    clean(r2);
    await loadProgram(r2.core, "s473-later-user-" + k++);
    expect(text("#w")).toBe("user:x");
  });

  test("the same name imported twice from ONE file: one declaration — W-IMPORT-001 only, and it runs", async () => {
    const src = `<program>
    \${ import { twice } from "./lib.scrml"; import { twice } from "./lib.scrml"; }
    <p id="t">\${twice(1)}</p>
</program>
`;
    const r = run(src, [LIB]);
    expect(r.diags.map((d) => [d.code, d.severity])).toEqual([["W-IMPORT-001", "Warning"]]);
    clean(r);
    await loadProgram(r.core, "s472-later-" + k++);
    expect(text("#t")).toBe("2");
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

// ---------------------------------------------------------------------------
// s472 review round 1 (S239 review of 67bd70862, ~/.cache/scrml/review/s472-l1/).
// ---------------------------------------------------------------------------
const PICK = {
  path: "pick.scrml",
  src: `\${
    export type Color:enum = { Red, Blue }
    export fn pick() -> Color {
        return Color.Blue;
    }
    export fn pickRed() -> Color {
        return Color.Red;
    }
    export fn name(c: Color) -> string {
        return match c {
            .Red :> "red",
            .Blue :> "blue"
        };
    }
}
`,
};

describe("r1 F1 — §18.13 shorthand arms over a call whose enum type is not imported", () => {
  test("match-nonimported-enum: `match pick() { .Red, .Blue }` with only `pick` imported — clean, and it runs (the call's declared enum, by identity)", async () => {
    const src = `<program>
    \${ import { pick } from "./pick.scrml"; }
    function g() -> string {
        return match pick() {
            .Red :> "R",
            .Blue :> "B"
        };
    }
    <p id="o">\${g()}</p>
</program>
`;
    const r = clean(run(src, [PICK]));
    await loadProgram(r.core, "s472-r1-m-" + k++);
    expect(text("#o")).toBe("B");
  });

  test("an unannotated local holding the call's result: the search widens past the file's scope — clean, and it runs", async () => {
    const src = `<program>
    \${ import { pickRed } from "./pick.scrml"; }
    function g() -> string {
        const c = pickRed();
        return match c {
            .Red :> "R",
            .Blue :> "B"
        };
    }
    <p id="o">\${g()}</p>
</program>
`;
    const r = clean(run(src, [PICK]));
    await loadProgram(r.core, "s472-r1-l-" + k++);
    expect(text("#o")).toBe("R");
  });

  test("match-mislink-private-enum: arms naming the page's OWN enum over the call's enum are refused (the subject is `Color`), call and local alike", () => {
    for (const subj of ["pickRed()", "c"]) {
      const src = `<program>
    \${ import { pick, pickRed } from "./pick.scrml"; }
    type Light:enum = { Blue, Green }
    function g() -> string {
        const c = pickRed();
        return match ${subj} {
            .Blue :> "B",
            .Green :> "G"
        };
    }
    <p id="o">\${g()}</p>
</program>
`;
      const r = run(src, [PICK]);
      expect(errs(r).map((d) => d.code)).toContain("E-TYPE-VARIANT");
    }
  });

  test("a bare variant with NO context is still refused when its enum is not in scope", () => {
    const src = `<program>
    \${ import { name } from "./pick.scrml"; }
    function g() -> string {
        const c = .Blue;
        return name(c);
    }
    <p>\${g()}</p>
</program>
`;
    expect(codes(run(src, [PICK]))).toContain("E-TYPE-VARIANT");
  });
});

// s473: one file binding a type (or a declaration) AND a function of one name is now itself
// E-SCOPE-010 (§7.6, ruled S473 "`<card>` beside `fn card`: REFUSED"), reported in the library
// file. The import still brings only the exported kind — the E-SCOPE-001 below stands beside it.
const s473 = (r) => r.diags.filter((d) => d.code === "E-SCOPE-010").map((d) => d.file);
describe("r1 F2 — an import brings only the EXPORTED declaration(s) of a name (scope by kind)", () => {
  test("kind-collapse-fn2: exported `type Tag` + private `fn Tag` — importing `Tag` does not bring the function", () => {
    const K = { path: "k.scrml", src: `\${\n    export type Tag:struct = { v: string }\n    fn Tag() -> string {\n        return "private-fn";\n    }\n    export fn mk() -> string {\n        return "m";\n    }\n}\n` };
    const r = run(`<program>\n    \${ import { Tag, mk } from "./k.scrml"; }\n    <p id="o">\${Tag()} \${mk()}</p>\n</program>\n`, [K]);
    expect(codes(r).sort()).toEqual(["E-SCOPE-001", "E-SCOPE-010"]);
    expect(s473(r)).toEqual(["k.scrml"]);
    expect(r.diags.find((d) => d.code === "E-SCOPE-001").message).toContain("does not export");
  });

  test("kind-collapse-type: exported `fn box` + private `type box` — importing `box` does not bring the type", () => {
    const K = { path: "k2.scrml", src: `\${\n    type box:struct = { v: string }\n    export fn box() -> string {\n        return "fn";\n    }\n}\n` };
    const r = run(`<program>\n    \${ import { box } from "./k2.scrml"; }\n    function g() -> string {\n        const b: box = { v: "leak" };\n        return b.v;\n    }\n    <p id="o">\${g()} \${box()}</p>\n</program>\n`, [K]);
    expect(codes(r)).toContain("E-TYPE-UNKNOWN");
    expect(s473(r)).toEqual(["k2.scrml"]);
  });

  test("kind-collapse-decl: exported `<card>` + private `fn card` — importing `card` does not bring the function", () => {
    const C = { path: "c.scrml", src: `export <card:struct>\n    let <label:string="x"/>\n</>\nrenders <b class="card">\${label}</b>\n\n\${\n    fn card() -> string {\n        return "private-card-fn";\n    }\n}\n` };
    const r = run(`<program>\n    \${ import { card } from "./c.scrml"; }\n    <main><card label="hi"/><p id="o">\${card()}</p></main>\n</program>\n`, [C]);
    expect(codes(r).sort()).toEqual(["E-SCOPE-001", "E-SCOPE-010"]);
    expect(s473(r)).toEqual(["c.scrml"]);
  });

  // s473: the twin is no longer a legal library — a type and a function of one name in one file
  // are E-SCOPE-010 (§7.6). The pin is kept as the refusal.
  test("twin: both kinds exported — the library itself is E-SCOPE-010 (S473)", () => {
    const K = { path: "k.scrml", src: `\${\n    export type Tag:struct = { v: string }\n    export fn Tag() -> string {\n        return "fn";\n    }\n}\n` };
    expect(s473(run(`<program>\n    \${ import { Tag } from "./k.scrml"; }\n    function g() -> string {\n        const t: Tag = { v: "x" };\n        return t.v + Tag();\n    }\n    <p>\${g()}</p>\n</program>\n`, [K]))).toEqual(["k.scrml"]);
  });
});

describe("r1 F3 — a call's write set is THE callee's in the calling file's scope", () => {
  const W = { path: "w.scrml", src: `\${\n    server function bump() -> int {\n        return 1;\n    }\n    export function wv() -> int {\n        const v: int = bump() !{ .Transport(t) :> { return 0; } };\n        return v;\n    }\n}\n` };
  test("writeset-overrefuse: another file's private server `bump` does not end the page's narrowing across its own pure `bump()` — clean, and it runs", async () => {
    const src = `<program>
    \${ import { wv } from "./w.scrml"; }
    let <n:int | not=(3)/>
    function bump() -> int {
        return 2;
    }
    function f() -> int {
        if (@n is given) {
            bump();
            return @n;
        }
        return 0;
    }
    <p id="o">\${f()}</p>
</program>
`;
    const r = clean(run(src, [W]));
    await loadProgram(r.core, "s472-r1-w-" + k++);
    expect(text("#o")).toBe("3");
  });

  test("writeset-converse: the page's own `bump` that writes `@n` still ends the narrowing (another file's pure `bump` does not hide it)", () => {
    const W2 = { path: "w.scrml", src: `\${\n    fn bump() -> int {\n        return 1;\n    }\n    export fn wv() -> int {\n        return bump();\n    }\n}\n` };
    const src = `<program>
    \${ import { wv } from "./w.scrml"; }
    let <n:int | not=(3)/>
    function bump() {
        @n = not;
    }
    function f() -> int {
        if (@n is given) {
            bump();
            return @n;
        }
        return 0;
    }
    <p id="o">\${f()}</p>
</program>
`;
    expect(codes(run(src, [W2]))).toContain("E-TYPE-031");
  });
});

describe("r1 F4 — two types of one name are told apart by declaring file", () => {
  test("reimport-type-mismatch: the message names both declaring files", () => {
    const C2 = { path: "colors2.scrml", src: `\${\n    export type Color:enum = { Green, Red }\n    export fn name2(c: Color) -> string {\n        return "x";\n    }\n}\n` };
    const r = run(`<program>\n    \${ import { Color, name } from "./pick.scrml"; import { Color, name2 } from "./colors2.scrml"; }\n    <p id="o">\${name(Color.Red)}</p>\n</program>\n`, [PICK, C2]);
    const m = r.diags.find((d) => d.code === "E-TYPE-031");
    expect(m.message).toContain("two different types named `Color`");
    expect(m.message).toContain("`pick.scrml`");
    expect(m.message).toContain("`colors2.scrml`");
  });
});
