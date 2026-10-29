// logic-block-const-s472.test.js — s472-boot-logic-block-const (gap
// g-boot-logic-block-const-s472): a `const` at the top level of a `${ }` logic
// block — a FILE-SCOPE constant — in the bootstrap.
//
//   §7.6 "A variable declared with `let` or `const` at the top level of a
//   file-level `${}` block SHALL be in scope for all subsequent `${}` blocks and
//   markup interpolations in the same file." · "Variables declared inside a
//   function body within a `${}` block are scoped to that function." ·
//   "Re-declaring a name … SHALL be a compile error (E-SCOPE-010: duplicate
//   binding in file scope)."
//   §21.2 `export const Name = ...` exports it; §21.3 imports resolve against
//   the exporting file's export list.
//   §7.4.2 a value "`const`-bound to a literal, simple arithmetic on constants"
//   — "the compiler MAY inline the string value directly … observationally
//   equivalent."
//   §50.9 "An assignment to a `const` variable SHALL be a compile error (E-ASSIGN-004)".
//   §1.6 "attempting to declare a local variable with the same name as a
//   registered state cell is `E-NAME-COLLIDES-STATE`".
//
// The bootstrap builds the compile-time-constant class (literals, unit enum
// variants, other constants, a member read, the operators over them). Core
// carries each constant once (CoreProgram.consts, a read is `Local(sym)`); each
// printer emits ONE module-level `const` per constant its artifact's code reads,
// transitively (print.scrml constsReadIn) — so a value reaches only the artifact
// whose code reads it. (Review #1617 MED-1: the first cut inlined each read,
// re-lowering initializers recursively — exponential in constant depth.) Every other initializer (a call, a cell read, a
// query, a tape / struct literal, …) runs at module initialization, where a
// file-scope binding's home (client / server / both) is not settled by the
// SPEC (§12 places functions): refused BY NAME. A file-scope `let` (§7.6
// admits it — module-level mutable state, same silence) is refused by name.
//
// RED ON MAIN: before this change every positive here was E-PARSE-ITEM
// ("expected `import`, `type`, `function` or `fn` in a logic block") and every
// use cascaded as E-SCOPE-001.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mods, compile, artifacts, realDb, serve, post, pathOf, bridge } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, click, warmLoadProgram } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 120000 });

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const SQ = "?" + "{";
const run = (files) => frontEnd(mods(), files);
const one = (src) => run([{ path: "app.scrml", src }]);
const codes = (r) => r.diags.map((d) => d.code);

// a file-level `${ }` of constants (+ helpers), then a small program
const P = (consts, extra = "", markup = "<p>x</p>") =>
  `\${\n${consts}\n${extra}\n}\n<program>\n    let <n:int=4/>\n    <main>\n        ${markup}\n    </main>\n</program>\n`;

const textOf = (sel) => document.querySelector(sel).textContent;

describe("§7.6 — a file-scope constant is in scope for the file's functions and markup (client)", () => {
  const SRC = `\${
    const GREETING = "hello";
    const N: int = 2 + 3;
    const LABEL: string = \`\${GREETING}-\${N}\`;
    const BIG = N > 4;
    const WORD = "abcd";
    const LEN = WORD.length;
    const D: Dir = .South;
    type Dir:enum = { North, South }
    fn twiceN(k: int) -> int {
        return k * N;
    }
    fn dirName(d: Dir) -> string {
        return match d { .North :> "N", .South :> "S" };
    }
}
<program>
    let <n:int=4/>
    <main>
        <p id="a">\${GREETING}</p>
        <p id="b">\${LABEL}</p>
        <p id="c">\${twiceN(@n)}</p>
        <p id="d">\${BIG ? "big" : "small"}</p>
        <p id="e">\${LEN}</p>
        <p id="f">\${dirName(D)}</p>
        <button id="inc" onclick={ @n = @n + N; }>+</button>
    </main>
</program>
`;

  test("typed and inferred constants, a constant over constants, a template, a member read, an enum constant — compile clean", () => {
    const r = compile(SRC);
    expect(r.core).toBeTruthy();
  });

  test("…and run in the page: markup, a function body, a handler all read them", async () => {
    const { core } = compile(SRC);
    await loadProgram(core, "lc-client");
    expect(textOf("#a")).toBe("hello");
    expect(textOf("#b")).toBe("hello-5");
    expect(textOf("#c")).toBe("20");
    expect(textOf("#d")).toBe("big");
    expect(textOf("#e")).toBe("4");
    expect(textOf("#f")).toBe("S");
    click(document.querySelector("#inc"));
    expect(textOf("#c")).toBe("45");
  });

  test("a constant inside a `<program>`'s own `${ }` is a file-scope constant too", async () => {
    const { core } = compile(`<program>\n    \${ const K = 7; }\n    <main>\n        <p id="k">\${K * 6}</p>\n    </main>\n</program>\n`);
    await loadProgram(core, "lc-inprog");
    expect(textOf("#k")).toBe("42");
  });

  test("a function's own local, or a parameter, of the name SHADOWS the constant (§7.6 'scoped to that function'; §7.3.3)", async () => {
    const { core } = compile(P("    const A = 1;",
      "    fn g(A: int) -> int { return A + 1; }\n    fn h() -> int { const A = 5; return A; }",
      `<p id="s">\${g(2)}-\${h()}-\${A}</p>`));
    await loadProgram(core, "lc-shadow");
    expect(textOf("#s")).toBe("3-5-1");
  });
});

describe("§12 — placement: a constant reaches only the artifact whose code reads it (one module-level `const` per artifact, constsReadIn)", () => {
  const SRC = `<program db="./app.db">
    type Row:struct = { name: string }
    \${
        const SERVER_TAG = "srv-tag-7c1";
        const PREFIX = "user:";
        const CLIENT_MARK = "client-mark-3f9";
    }
    let <out:string=""/>
    function label(id: int) -> string {
        const r: Row = ${SQ}\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return PREFIX + r.name + "/" + SERVER_TAG;
    }
    <main>
        <button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
        <p id="out">\${@out}</p>
        <p id="mark">\${PREFIX}\${CLIENT_MARK}</p>
    </main>
</program>
`;

  test("a value read only by a server function is in the server artifact and NOT in the client artifact", () => {
    const { core } = compile(SRC);
    const { client, server } = artifacts(core);
    expect(server.refused).toEqual([]);
    expect(server.js).toContain("srv-tag-7c1");
    expect(client.js).not.toContain("srv-tag-7c1");
    // read on both sides: in both; read only by the client: only there
    expect(server.js).toContain("user:");
    expect(client.js).toContain("user:");
    expect(client.js).toContain("client-mark-3f9");
    expect(server.js).not.toContain("client-mark-3f9");
    // each constant is ONE module-level binding in its artifact, read by name
    expect(server.js.split("srv-tag-7c1").length - 1).toBe(1);
    expect(server.js).toMatch(/const SERVER_TAG = "srv-tag-7c1";/);
    expect(client.js).not.toMatch(/const SERVER_TAG/);
    expect(client.js).toMatch(/const PREFIX = "user:";/);
  });

  test("a constant read only THROUGH another constant is carried with it (transitive), before it", () => {
    const { core } = compile(`\${\n    const BASE = "b-77";\n    const FULL = BASE + "-x";\n    const UNUSED = "u-55";\n}\n<program>\n    <main>\n        <p>\${FULL}</p>\n    </main>\n</program>\n`);
    const { client } = artifacts(core);
    expect(client.js.indexOf("const BASE")).toBeGreaterThan(-1);
    expect(client.js.indexOf("const BASE")).toBeLessThan(client.js.indexOf("const FULL"));
    expect(client.js).not.toContain("u-55");
  });

  test("the server function reads the constants at run time (a real SQLite), and the client shows the result", async () => {
    const { core } = compile(SRC);
    const db = await realDb(["CREATE TABLE users (id INTEGER, name TEXT)"], { users: [{ id: 1, name: "bob" }] });
    const { srv, routes } = await serve(core, db);
    const res = await post(srv, pathOf(routes, "label"), [1]);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.json)).toContain("user:bob/srv-tag-7c1");
    // and through the page
    globalThis.fetch = bridge(srv);
    await loadProgram(core, "lc-server");
    expect(textOf("#mark")).toBe("user:client-mark-3f9");
    click(document.querySelector("#go"));
    for (let i = 0; i < 50 && textOf("#out") === ""; i++) await new Promise((r) => setTimeout(r, 10));
    expect(textOf("#out")).toBe("user:bob/srv-tag-7c1");
  });
});

describe("review #1617 MED-1 — a chain of constants is linear in output and compile time", () => {
  test("`A0 = 1; Ak = A(k-1) + A(k-1)` to depth 20: each constant printed once, the value right, fast", async () => {
    let consts = "    const A0 = 1;";
    for (let k = 1; k <= 20; k++) consts += `\n    const A${k} = A${k - 1} + A${k - 1};`;
    const t0 = performance.now();
    const { core } = compile(P(consts, "", `<p id="v">\${A20}</p>`));
    const { client } = artifacts(core);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(20000);
    expect(client.js.length).toBeLessThan(4000);
    for (let k = 0; k <= 20; k++) expect(client.js.split(`const A${k} =`).length - 1).toBe(1);
    await loadProgram(core, "lc-chain");
    expect(textOf("#v")).toBe(String(2 ** 20));
  });

  test("two files' private constants of one name are two bindings, each file reading its own", async () => {
    const lib = `\${\n    const K = "lib-k";\n    export fn libK() -> string { return K; }\n}\n`;
    const app = `\${ const K = "app-k"; }\n<program>\n    \${ import { libK } from "./lib.scrml"; }\n    <main>\n        <p id="k">\${K}/\${libK()}</p>\n    </main>\n</program>\n`;
    const r = run([{ path: "lib.scrml", src: lib }, { path: "app.scrml", src: app }]);
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "lc-twok");
    expect(textOf("#k")).toBe("app-k/lib-k");
  });
});

describe("§21.2 / §21.3 — `export const` across files", () => {
  const LIB = `\${
    const BASE = 10;
    export const MAX: int = 3;
    export const SUM = BASE + MAX;
    export const TITLE = "lib-title";
    export fn capped(k: int) -> int {
        if (k > MAX) return MAX;
        return k;
    }
}
`;
  const APP = (imp, markup) => `<program>\n    \${ import { ${imp} } from "./lib.scrml"; }\n    <main>\n        ${markup}\n    </main>\n</program>\n`;

  test("an imported constant (itself over a PRIVATE constant of its file) is read in markup and through an imported function", async () => {
    const r = run([{ path: "lib.scrml", src: LIB }, { path: "app.scrml", src: APP("MAX, SUM, TITLE, capped", `<p id="m">\${MAX}</p><p id="s">\${SUM}</p><p id="t">\${TITLE}</p><p id="c">\${capped(9)}</p>`) }]);
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "lc-import");
    expect(textOf("#m")).toBe("3");
    expect(textOf("#s")).toBe("13");
    expect(textOf("#t")).toBe("lib-title");
    expect(textOf("#c")).toBe("3");
  });

  test("a constant its file does not export is private: importing it is E-IMPORT-004", () => {
    const r = run([{ path: "lib.scrml", src: LIB }, { path: "app.scrml", src: APP("BASE", `<p>\${BASE}</p>`) }]);
    expect(codes(r)).toEqual(["E-IMPORT-004"]);
  });

  test("an exported constant used WITHOUT importing it is E-SCOPE-001, naming the file that exports it", () => {
    const r = run([{ path: "lib.scrml", src: LIB }, { path: "app.scrml", src: APP("capped", `<p>\${SUM}</p>`) }]);
    expect(codes(r)).toEqual(["E-SCOPE-001"]);
    expect(r.diags[0].message).toContain("`lib.scrml` exports it, but this file does not import it");
  });

  test("a private constant of another file used by name is E-SCOPE-001 ('declares it but does not export it')", () => {
    const r = run([{ path: "lib.scrml", src: LIB }, { path: "app.scrml", src: APP("capped", `<p>\${BASE}</p>`) }]);
    expect(codes(r)).toEqual(["E-SCOPE-001"]);
    expect(r.diags[0].message).toContain("declares it but does not export it");
  });

  test("an imported constant and a constant of the same name declared in the importing file: E-SCOPE-010", () => {
    const app = `\${ const MAX = 1; }\n` + APP("MAX", `<p>\${MAX}</p>`);
    const r = run([{ path: "lib.scrml", src: LIB }, { path: "app.scrml", src: app }]);
    expect(codes(r)).toContain("E-SCOPE-010");
  });
});

describe("collisions and writes", () => {
  test("two constants of one name in a file: E-SCOPE-010 (§7.6)", () => {
    expect(codes(one(P("    const A = 1;\n    const A = 2;", "", "<p>${A}</p>")))).toEqual(["E-SCOPE-010"]);
  });
  test("a constant and a function of one name: E-SCOPE-010", () => {
    expect(codes(one(P("    const A = 1;", "    fn A() -> int { return 1; }")))).toEqual(["E-SCOPE-010"]);
  });
  test("a constant named like a program cell: E-NAME-COLLIDES-STATE (§1.6)", () => {
    expect(codes(one(P("    const n = 1;", "", "<p>${@n}</p>")))).toEqual(["E-NAME-COLLIDES-STATE"]);
  });
  test("a constant named like a type of its file: E-SCOPE-010 (§7.6, ruled S473; was bootstrap-local)", () => {
    expect(codes(one(P("    const T = 1;", "    type T:enum = { A, B }")))).toEqual(["E-SCOPE-010"]);
  });
  test("an assignment to a constant: E-ASSIGN-004 (§50.9)", () => {
    expect(codes(one(P("    const A = 1;", "    function f() -> int { A = 2; return A; }", "<p>${f()}</p>")))).toEqual(["E-ASSIGN-004"]);
  });
});

describe("initializers: the compile-time-constant class only — everything else refused BY NAME", () => {
  const refused = {
    "a call": P("    const A = f();", "    fn f() -> int { return 1; }", "<p>${A}</p>"),
    "a cell read": P("    const A = @n;", "", "<p>${A}</p>"),
    "a query": P(`    const A = ${SQ}\`SELECT 1\`}.get();`),
    "a tape literal": P("    const A = [1, 2];"),
    "a struct literal": P("    const A: Pt = { x: 1 };", "    type Pt:struct = { x: int }"),
    "an index read": P("    const S = \"ab\";\n    const A = S[0];"),
    "a function value": P("    const A = f;", "    fn f() -> int { return 1; }"),
    "a value loop": P("    const xs = for (const i of 0..3) { lift i; };"),
    "an untyped `not`": P("    const A = not;"),
    "a payload-variant value": P("    const S: Shape = Shape.Circle(1);", "    type Shape:enum = { Circle(r: int), Dot }"),
    // not file-scope constants at all — named, not read as a malformed `const`
    "a derived cell `const <d> = …` (§6.6)": P("    const <d> = @n * 2;"),
    "a component `const Card = <…>` (§21.2 Form 2)": P("    export const Card = <div>hi</div>;"),
  };
  for (const [what, src] of Object.entries(refused)) {
    test(`${what}: E-BOOTSTRAP-UNSUPPORTED, and nothing else`, () => {
      const r = one(src);
      expect(codes(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(r.core).toBeFalsy();
    });
  }

  test("a cell read is refused citing §6.6.2's snapshot meaning (and the derived-cell spelling), not the placement silence", () => {
    const r = one(P("    const A = @n;", "", "<p>${A}</p>"));
    expect(r.diags[0].message).toContain("§6.6.2");
    const q = one(P("    const A = f();", "    fn f() -> int { return 1; }", "<p>${A}</p>"));
    expect(q.diags[0].message).toContain("the SPEC does not say where such an initializer runs");
  });

  test("a read of a constant initialized LATER (or of itself) is E-SCOPE-001 — no cycle, no uninitialized read", () => {
    expect(codes(one(P("    const A = B + 1;\n    const B = 1;", "", "<p>${A}</p>")))).toEqual(["E-SCOPE-001"]);
    expect(codes(one(P("    const A = A + 1;", "", "<p>${A}</p>")))).toEqual(["E-SCOPE-001"]);
  });

  test("the written type is checked against the initializer (§7.5.1): E-TYPE-031; operators by §45: E-OPERATOR-OPERAND-TYPE", () => {
    expect(codes(one(P("    const A: int = \"a\";", "", "<p>${A}</p>")))).toEqual(["E-TYPE-031"]);
    expect(codes(one(P("    const A: int = 1.5;", "", "<p>${A}</p>")))).toEqual(["E-TYPE-031"]);
    expect(codes(one(P("    const A = \"a\" - 1;", "", "<p>${A}</p>")))).toEqual(["E-OPERATOR-OPERAND-TYPE"]);
  });

  test("`const A: int | not = not;` is admitted (its type is written)", () => {
    expect(codes(one(P("    const A: int | not = not;", "", "<p>${A is given ? \"y\" : \"n\"}</p>")))).toEqual([]);
  });
});

describe("the statement form (§7.2.2) and `let` (§7.6)", () => {
  test("a constant is a statement: no `;` is E-STMT-MISSING-SEMICOLON", () => {
    expect(codes(one(P("    const A = 1", "", "<p>${A}</p>")))).toEqual(["E-STMT-MISSING-SEMICOLON"]);
  });
  test("a file-scope `let` is refused BY NAME (E-BOOTSTRAP-UNSUPPORTED) — never read as a constant, never E-PARSE-ITEM", () => {
    const r = one(P("    let A = 1;", "", "<p>x</p>"));
    expect(codes(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("§7.6");
    expect(codes(one(P("    export let A = 1;", "", "<p>x</p>")))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("what follows a refused `let` still parses (the statement is read, not skipped to the line end)", () => {
    const r = one(P("    let A = 1; const B = 2;", "", "<p>${B}</p>"));
    expect(codes(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});
