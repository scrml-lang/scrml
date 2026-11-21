// file-scope-init-s479.test.js — s479-file-scope-init (gap g-boot-file-scope-init-eval-s478):
// §7.6 "Where a file-scope initializer runs (S478)" in the bootstrap.
//
//   §7.6 rule (a): "An initializer that reaches a server-only resource — a `?{}` query (§8), a
//   binding imported from a server-only module (§12.2 Trigger 3), or a call of a server-placed
//   function (§12.2) — SHALL be a compile error, `E-FILE-SCOPE-SERVER-ONLY-REACH`".
//   §7.6 rule (b): "Any other non-constant initializer is evaluated at module initialization,
//   once (§7.4.2's one-shot evaluation), in EVERY artifact that reads the binding — the client
//   bundle and the server bundle each hold their own copy, evaluated in that artifact."
//   §7.6 rule (c): "A server function SHALL NOT write a file-scope `let`,
//   `E-FILE-SCOPE-LET-SERVER-WRITE`".
//   §48.3.3: "A `fn` body SHALL NOT write to any variable declared outside the `fn`'s own scope
//   boundary. This includes: Assignment (`x = value`) where `x` is declared in an enclosing
//   `${}` logic context or file scope." (E-FN-003)
//
// Ruling: user-voice-scrml.md "⭐ RULED — open owner questions, PA recs adopted wholesale (S478,
// 2026-11-17)" item 59; the code names confirmed S479.
//
// RED ON MAIN: every initializer here that is not a compile-time constant was refused by name
// (E-BOOTSTRAP-UNSUPPORTED, "the bootstrap builds a file-scope `const` whose value is fixed at
// compile time"), and every file-scope `let` was refused by name in the parser
// (refusedLetItem) — so (c) had no write to judge.

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
const codes = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info").map((d) => d.code);
const textOf = (sel) => document.querySelector(sel).textContent;
const count = (s, sub) => s.split(sub).length - 1;

// A program with a database, a server function `label` (its `?{}` places it on the server,
// §12.2) that reads `both()`, and a client handler that writes the file-scope `let`s.
const PROG = (logic, serverExtra = "", markup = "") => `<program db="./app.db">
    type Row:struct = { name: string }
    type Pt:struct = { x: int, y: int }
    \${
${logic}
    }
    let <out:string=""/>
    let <shown:string=""/>
    function label(id: int) -> string {
        const r: Row = ${SQ}\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
${serverExtra}
        return r.name + "/" + both();
    }
    <main>
        <button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
        <p id="out">\${@out}</p>
        ${markup}
    </main>
</program>
`;

// tick() increments a file-scope `let` — a side-effect-observable initializer: A and B are
// 1 and 2 in EACH artifact (each evaluates its own copy, once).
const LOGIC = `        let count = 0;
        function tick() -> int {
            count = count + 1;
            return count;
        }
        fn sq(k: int) -> int { return k * k; }
        const A = tick();
        const B = tick();
        const S = sq(3);
        const XS: int[] = [10, 20, 30];
        const SECOND: int = XS[1];
        const P: Pt = { x: 1, y: 2 };
        let log: string[append free] = [];
        function note(s: string) {
            log = [...log, s];
            log.append("!");
            count = count + 10;
        }
        function both() -> string {
            return \`\${A}-\${B}-\${S}-\${SECOND}-\${P.y}-\${count}\`;
        }
        function logLen() -> int { return log.length; }`;

const SRC = PROG(LOGIC, "", `<button id="n" onclick={ note("x"); @shown = \`\${both()}/\${logLen()}\`; }>n</button>
        <p id="sh">\${@shown}</p>
        <p id="a">\${both()}</p>`);

describe("§7.6 rule (b) — a non-constant initializer runs once, at module initialization, in each artifact that reads it", () => {
  test("a call, a tape / struct literal and an index compile clean; each artifact prints the bindings it reads, once", () => {
    const { core } = compile(SRC);
    const { client, server } = artifacts(core);
    expect(client.refused).toEqual([]);
    expect(server.refused).toEqual([]);
    expect(count(server.js, "const A = tick();")).toBe(1);
    expect(count(server.js, "const B = tick();")).toBe(1);
    expect(server.js).toMatch(/let count = 0;/);
    // S481 (§7.6, ruling:user-voice-scrml.md-S481-body-run-order): in the client the program body
    // runs in source order — a binding whose initializer does something is declared at module
    // level and its initializer runs once, in its place in the body (nothing reads one before that
    // place here); `count = 0` does nothing, so it runs at module initialization (as-if)
    for (const name of ["A", "B"]) {
      expect(count(client.js, ` ${name} = tick();`)).toBe(1);
      expect(client.js).toMatch(new RegExp(`^let ${name};$`, "m"));
    }
    expect(client.js).toMatch(/^let count = 0;$/m);
    // `log` is read and written only by client code: only the client artifact holds it
    expect(client.js).toMatch(/log = \[\];/);
    expect(server.js).not.toMatch(/let log/);
    // the server prints the functions an initializer calls at MODULE level (they run before createServer)
    expect(server.js.indexOf("function tick()")).toBeLessThan(server.js.indexOf("export function createServer"));
    expect(count(server.js, "function tick()")).toBe(1);
  });

  test("the client: A and B are 1 and 2 (one evaluation each, in order); a handler writes the `let`s", async () => {
    const { core } = compile(SRC);
    await loadProgram(core, "fsi-client");
    expect(textOf("#a")).toBe("1-2-9-20-2-2");
    click(document.querySelector("#n"));
    expect(textOf("#sh")).toBe("1-2-9-20-2-12/2");
  });

  test("the server holds ITS OWN copy: evaluated once at its module initialization, not per request, and not the client's", async () => {
    const { core } = compile(SRC);
    const db = await realDb(["CREATE TABLE users (id INTEGER, name TEXT)"], { users: [{ id: 1, name: "bob" }] });
    const { srv, routes } = await serve(core, db);
    const r1 = await post(srv, pathOf(routes, "label"), [1]);
    const r2 = await post(srv, pathOf(routes, "label"), [1]);
    expect(r1.status).toBe(200);
    expect(JSON.stringify(r1.json)).toContain("bob/1-2-9-20-2-2");
    expect(JSON.stringify(r2.json)).toContain("bob/1-2-9-20-2-2");
    // the page: the client's handler moves the client's `count`, never the server's
    globalThis.fetch = bridge(srv);
    await loadProgram(core, "fsi-both");
    click(document.querySelector("#n"));
    click(document.querySelector("#go"));
    for (let i = 0; i < 50 && textOf("#out") === ""; i++) await new Promise((r) => setTimeout(r, 10));
    expect(textOf("#sh")).toBe("1-2-9-20-2-12/2");
    expect(textOf("#out")).toBe("bob/1-2-9-20-2-2");
  });

  test("a binding read only by server code is absent from the client artifact, and its initializer's callee too", () => {
    const src = PROG(`        function mk() -> string { return "srv-only-" + "q7"; }
        const TAG = mk();
        function both() -> string { return TAG; }`);
    const { core } = compile(src);
    const { client, server } = artifacts(core);
    expect(server.js).toContain("const TAG = mk();");
    expect(client.js).not.toContain("TAG");
    expect(server.js.indexOf("function mk()")).toBeLessThan(server.js.indexOf("export function createServer"));
  });

  test("a file-scope `let` with no initializer reader prints `let`; a `const` prints `const`", () => {
    const { core } = compile(PROG(`        let n = 0;
        const C = n + 1;
        function both() -> string { return "x"; }`, "", `<p id="c">\${C}</p>`));
    const { client } = artifacts(core);
    // S481: `n = 0` does nothing — module initialization (as-if); `C` reads a `let` an earlier
    // body-top statement could write, so it runs in its place in the body (declared `let`)
    expect(client.js).toMatch(/^let n = 0;$/m);
    expect(client.js).toMatch(/^let C;$/m);
    expect(client.js).toMatch(/ C = n \+ 1;/);
    // s482 (§7.6 rule (b) S482 — "each seed is computed at its place in the sequence"): a cell
    // whose seed reads `C`, declared after it, no longer makes `C` run at module initialization:
    // `C` runs in its place, the seed is held by the factory and run at the cell's place. (Before
    // S482 construction read `C`, so `C` was printed `const C = n + 1;` at module level.)
    const { core: core2 } = compile(PROG(`        let n = 0;
        const C = n + 1;
        function both() -> string { return "x"; }`, "", `<p id="c">\${@seed}</p>`).replace(`let <shown:string=""/>`, `let <shown:string=""/>\n    let <seed:int=(C)/>`));
    const { client: c2 } = artifacts(core2);
    expect(c2.js).toMatch(/let n = 0;/);
    expect(c2.js).toMatch(/^let C;$/m);
    expect(c2.js).toMatch(/rt\.hold\(inst\$\.fields\[\d+ \/\* seed \*\/\]\);/);
    expect(c2.js.indexOf("C = n + 1;")).toBeLessThan(c2.js.indexOf("rt.seed(inst$.fields["));
  });
});

describe("§7.6 rule (c) — a server function SHALL NOT write a file-scope `let` (E-FILE-SCOPE-LET-SERVER-WRITE)", () => {
  const BASE = `        let hits = 0;
        let seen: int[append free] = [];
        let pt: Pt = { x: 0, y: 0 };
        function bump() { hits = hits + 1; }
        function deeper() { bump(); }
        function both() -> string { return "b"; }`;
  const cases = {
    "a rebinding `hits = …` in the server function's body": "        hits = hits + 1;",
    "a write through a helper it calls in place (`bump()`)": "        bump();",
    "a write two calls down (`deeper()` → `bump()`)": "        deeper();",
    "a tape edit `seen.append(id)`": "        seen.append(id);",
    "a grow shape `seen = [...seen, id]`": "        seen = [...seen, id];",
    "a part write `pt.x = id`": "        pt.x = id;",
  };
  for (const [what, stmt] of Object.entries(cases)) {
    test(`${what}: refused, and nothing else`, () => {
      const r = one(PROG(BASE, stmt));
      expect(codes(r)).toEqual(["E-FILE-SCOPE-LET-SERVER-WRITE"]);
      expect(r.diags.find((d) => d.code === "E-FILE-SCOPE-LET-SERVER-WRITE").message).toContain("§7.6 rule (c)");
    });
  }

  test("the message names the server function and the helper the write is in", () => {
    const r = one(PROG(BASE, "        deeper();"));
    const m = r.diags.find((d) => d.code === "E-FILE-SCOPE-LET-SERVER-WRITE").message;
    expect(m).toContain("label()");
    expect(m).toContain("bump()");
    expect(m).toContain("`hits`");
  });

  test("a client function writing the same `let` is admitted (per-artifact state, client side)", () => {
    const r = one(PROG(BASE, "", `<button onclick={ bump(); }>b</button>`));
    expect(codes(r)).toEqual([]);
  });

  test("a server function READING a file-scope `let` is admitted (its own copy)", () => {
    const r = one(PROG(`        let hits = 0;
        function both() -> string { return \`\${hits}\`; }`));
    expect(codes(r)).toEqual([]);
  });

  test("§48.3.3 — a `fn` body writing a file-scope `let` is E-FN-003", () => {
    const r = one(PROG(`        let hits = 0;
        fn pureBump() -> int { hits = hits + 1; return hits; }
        function both() -> string { return "b"; }`, "", `<p>\${pureBump()}</p>`));
    expect(codes(r)).toContain("E-FN-003");
    expect(codes(r)).not.toContain("E-FILE-SCOPE-LET-SERVER-WRITE");
  });
});

describe("§7.6 rule (a) — an initializer reaching a server-placed function is E-FILE-SCOPE-SERVER-ONLY-REACH", () => {
  test("a call of a server-placed function", () => {
    const r = one(PROG(`        const L: string = label(1);
        function both() -> string { return "b"; }`));
    expect(codes(r)).toContain("E-FILE-SCOPE-SERVER-ONLY-REACH");
    expect(codes(r).filter((c) => c === "E-BOOTSTRAP-UNSUPPORTED")).toEqual([]);
  });

  test("a call of a function that reaches one (`viaHelper()` → `label()`)", () => {
    const r = one(PROG(`        function viaHelper() -> string { return label(1) !{ _ :> "x" }; }
        const L: string = viaHelper();
        function both() -> string { return "b"; }`));
    expect(codes(r)).toContain("E-FILE-SCOPE-SERVER-ONLY-REACH");
  });

  test("a query written in the initializer stays E-FILE-SCOPE-SERVER-ONLY-REACH (s478)", () => {
    const r = one(PROG(`        const Q = ${SQ}\`SELECT 1\`}.get();
        function both() -> string { return "b"; }`));
    expect(codes(r)).toEqual(["E-FILE-SCOPE-SERVER-ONLY-REACH"]);
  });
});

describe("§7.6 rule (b) — what the bootstrap still refuses BY NAME (INTERIM, g-boot-file-scope-init-residue-s479)", () => {
  test("an initializer calling a function that reads a cell (module init runs before the program instance; the server has no cells)", () => {
    const r = one(`\${\n    function readN() -> int { return @n; }\n    const A: int = readN();\n}\n<program>\n    let <n:int=4/>\n    <main>\n        <p>\${A}</p>\n    </main>\n</program>\n`);
    expect(codes(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("client-only state");
  });

  // s479-file-scope-follow (ruling #1962 item 2): no longer by name — E-SCOPE-001, as the direct
  // read (file-scope-follow-s479.test.js covers the call chains)
  test("an initializer calling a function that uses a binding initialized AFTER it is E-SCOPE-001", () => {
    const r = one(`\${\n    function late() -> int { return Z + 1; }\n    const A: int = late();\n    const Z = 5;\n}\n<program>\n    <main>\n        <p>\${A}</p>\n    </main>\n</program>\n`);
    expect(codes(r)).toEqual(["E-SCOPE-001"]);
    expect(r.diags[0].message).toContain("`Z`");
  });

  test("…and one declared before it is fine", async () => {
    const r = one(`\${\n    const Z = 5;\n    function early() -> int { return Z + 1; }\n    const A: int = early();\n}\n<program>\n    <main>\n        <p id="v">\${A}</p>\n    </main>\n</program>\n`);
    expect(codes(r)).toEqual([]);
    await loadProgram(r.core, "fsi-early");
    expect(textOf("#v")).toBe("6");
  });

  test("a cell read in the initializer", () => {
    const r = one(`\${\n    const A = @n;\n}\n<program>\n    let <n:int=4/>\n    <main>\n        <p>\${A}</p>\n    </main>\n</program>\n`);
    expect(codes(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("a function value written in the initializer", () => {
    const r = one(`\${\n    const F = (x: int) => x + 1;\n}\n<program>\n    <main>\n        <p>x</p>\n    </main>\n</program>\n`);
    expect(codes(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  // s479-file-scope-follow (ruling #1962 item 3): no longer by name — PERMANENT,
  // E-FILE-SCOPE-LET-FOREIGN-WRITE (file-scope-follow-s479.test.js covers every write shape)
  test("a write of a file-scope `let` imported from another file is E-FILE-SCOPE-LET-FOREIGN-WRITE", () => {
    const lib = `\${\n    export let shared = 0;\n    export fn readShared() -> int { return 1; }\n}\n`;
    const app = `<program>\n    \${ import { shared } from "./lib.scrml"; }\n    <main>\n        <button onclick={ shared = 3; }>b</button>\n        <p>\${shared}</p>\n    </main>\n</program>\n`;
    const r = run([{ path: "lib.scrml", src: lib }, { path: "app.scrml", src: app }]);
    expect(codes(r)).toEqual(["E-FILE-SCOPE-LET-FOREIGN-WRITE"]);
    expect(r.diags[0].message).toContain("lib.scrml");
  });

  test("a cell declaration `let <x/>` in a logic block keeps its by-name refusal", () => {
    const r = one(`\${\n    let <z:int=1/>\n}\n<program>\n    <main>\n        <p>x</p>\n    </main>\n</program>\n`);
    expect(codes(r)).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
});

describe("a file-scope `let`'s type is fixed by its declaration", () => {
  test("a write of another type is E-TYPE-031", () => {
    const r = one(`\${\n    let n = 0;\n    function set() { n = "a"; }\n}\n<program>\n    <main>\n        <button onclick={ set(); }>b</button>\n        <p>\${n}</p>\n    </main>\n</program>\n`);
    expect(codes(r)).toContain("E-TYPE-031");
  });
});
