// db-body-s472.test.js — s472-boot-db-body-mode: a `<db>` body is a code-default ITEM body.
//
// RULED S472 (scrml-support/user-voice-scrml.md "⭐ RULED — `<db>` body + client reads, Q1–Q6 =
// PA recs", item 3): "The `<db>` body is code-default and ITEM-ONLY (declarations,
// `function`/`fn`, `type`, markup, `"…"` literals); a bare statement is refused
// (`E-DB-BODY-STATEMENT`), loose prose is `E-UNQUOTED-DISPLAY-TEXT`." Item 6: Lane A (this body
// mode) lands before Lane B (db cells as server cells) — so a DECLARATION in a `<db>` body stays
// refused by name here (fail closed).
//
// SPEC §4.18.1 (S472 amendment): "Nothing written directly in a `<db>` body SHALL ship as page
// text. A `?{}` inside a function declared in a `<db>` body resolves its database to that `<db>`
// (§8.1.1 — it is the nearest database scope)."
//
// The leak this closes (g-bootstrap-fn-in-db-body-ships-as-page-text-s472, PA-verified): a
// `function` written in a `<db>` body compiled clean and shipped as literal page text — its SQL
// included — into index.html.

import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mods, compile, codes, check, artifacts, realDb, serve, bridge } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 120000 });

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  if (globalThis.document) globalThis.document.cookie = "scrml_csrf=; Max-Age=0; Path=/";
  expectNoPageErrors();
});

const SQ = "?" + "{";
const IV = "$" + "{";
const run = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const msgOf = (src, code) => (run(src).diags.find((d) => d.code === code) || { message: "" }).message;
// a `<program>` whose ONLY direct child `<db src>` holds `body`
const DB = (body, rest = "    <main><p id=\"m\">x</p></main>") => `<program>\n    let <n:int=0/>\n    <db src="./app.db">\n${body}\n    </db>\n${rest}\n</program>\n`;
const COUNT = `        function count() -> int {\n            const r: Cnt = ${SQ}\`SELECT COUNT(*) AS n FROM secret_rows\`}.get() !{ _ :> { return -1; } };\n            return r.n;\n        }`;
const CNT = "        type Cnt:struct = { n: int }";
const queryOf = (fn) => fn.body.stmts.find((x) => x.variant === "Suspend" && x.data.on.variant === "Query").data.on.data.q;
const dbOf = (core, fname) => {
  const fn = core.server.find((x) => x.sym.hint === fname);
  if (!fn) return "(not a server function)";
  const db = core.dbs.find((d) => d.sym.id === queryOf(fn).db.id);
  return db && db.target;
};

// =============================================================================
// 1. Items: a function / type in a `<db>` body is a real function — placed, run, never text
// =============================================================================
describe("a `function` in a `<db>` body is the program's function, its `?{}` on THAT `<db>` (§8.1.1)", () => {
  const SRC = DB(`${CNT}\n${COUNT}\n        <button id="go" onclick={ @n = count() !{ .Transport(t) :> return }; }>"go"</button>\n        <p id="out">${IV}@n}</p>`);

  test("compiles clean; the function is SERVER-placed (§12: its body runs a `?{}`) and queries ./app.db", () => {
    const r = compile(SRC);
    expect(check(r.core)).toEqual([]);
    expect(dbOf(r.core, "count")).toBe("./app.db");
  });

  test("no db-body source text in the client artifact; the query is in the server artifact", () => {
    const r = compile(SRC);
    const { client, server } = artifacts(r.core);
    expect(client.refused).toEqual([]);
    for (const needle of ["secret_rows", "SELECT", "app.db", "function count", "COUNT(*)"]) expect(client.js).not.toContain(needle);
    expect(server.js).toContain("secret_rows");
  });

  test("RUNS: the button in the db body calls the db-body function, which queries a real SQLite (runtime)", async () => {
    const r = compile(SRC);
    const sql = await realDb(["CREATE TABLE secret_rows (id INTEGER)"], { secret_rows: [{ id: 1 }, { id: 2 }] });
    const { srv } = await serve(r.core, sql);
    const loaded = await loadProgram(r.core, "dbbody-" + Math.random().toString(36).slice(2));
    expect(loaded.out.html).not.toContain("secret_rows");
    expect(loaded.out.html).not.toContain("function");
    globalThis.fetch = bridge(srv);
    click(document.querySelector("#go"));
    for (let i = 0; i < 12; i++) await new Promise((res) => setTimeout(res, 0));
    expect(document.querySelector("#out").textContent).toBe("2");
  });

  test("a client function in a `<db>` body runs in the page; markup and a display literal render in place (runtime)", async () => {
    const src = DB(`        function bump() {\n            @n = @n + 1;\n        }\n        <p id="lit">"in the db block"</p>\n        "count: ${IV}@n}"\n        <button id="b" onclick=bump()>"bump"</button>`);
    const r = compile(src);
    expect(check(r.core)).toEqual([]);
    const loaded = await loadProgram(r.core, "dbbody-c-" + Math.random().toString(36).slice(2));
    expect(loaded.out.html).not.toContain("function");
    expect(loaded.out.html).not.toContain("@n = @n");
    click(document.querySelector("#b"));
    expect(document.body.textContent).toContain("count: 1");
    expect(document.querySelector("db")).toBe(null);
  });

  test("a `type` declared in a `<db>` body is the program's type (used outside the block)", () => {
    const src = DB(`        type Pair:struct = { a: int, b: int }`, "    function sum(p: Pair) -> int {\n        return p.a + p.b;\n    }\n    <main><p>x</p></main>");
    expect(run(src).diags.map((d) => d.code)).toEqual([]);
  });

  test("the NEAREST scope: a `<db src>` nested in `<main>` under `<program db=>` — its function queries the nested db; a program-body function queries the program's", () => {
    const fn = (name, t) => `function ${name}() -> int {\n        ${SQ}\`DELETE FROM ${t}\`}.run() !{ _ :> { return 0; } };\n        return 1;\n    }`;
    const src = `<program db="./a.db">\n    ${fn("fa", "ta")}\n    <main>\n        <db src="./b.db">\n            ${fn("fb", "tb")}\n        </db>\n    </main>\n</program>\n`;
    const r = compile(src);
    expect(dbOf(r.core, "fa")).toBe("./a.db");
    expect(dbOf(r.core, "fb")).toBe("./b.db");
  });

  test("two sibling `<db src>`: each body's function queries its own db (a program-body function still has no scope, E-SQL-004)", () => {
    const fn = (name, t) => `function ${name}() -> int {\n        ${SQ}\`DELETE FROM ${t}\`}.run() !{ _ :> { return 0; } };\n        return 1;\n    }`;
    const src = `<program>\n    <db src="./a.db">\n        ${fn("fa", "ta")}\n    </db>\n    <db src="./b.db">\n        ${fn("fb", "tb")}\n    </db>\n    <main><p>x</p></main>\n</program>\n`;
    const r = compile(src);
    expect(dbOf(r.core, "fa")).toBe("./a.db");
    expect(dbOf(r.core, "fb")).toBe("./b.db");
    const outside = `<program>\n    <db src="./a.db"><p>a</p></db>\n    <db src="./b.db"><p>b</p></db>\n    ${fn("fc", "tc")}\n    <main><p>x</p></main>\n</program>\n`;
    expect(codes(outside)).toEqual(["E-SQL-004"]);
  });

  test("a `<db>` with no `src=`: its function's query resolves to NO database — never an outer one; only the `<db>`'s own refusal", () => {
    const src = `<program db="./outer.db">\n    <main>\n        <db>\n${COUNT}\n        </db>\n    </main>\n${CNT}\n</program>\n`;
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.core == null).toBe(true);
  });

  test("an `fn` (§48 pure function) is an item too, callable outside the block", () => {
    const src = DB(`        fn twice(x: int) -> int {\n            return x * 2;\n        }`, "    <main><p>" + IV + "twice(2)}</p></main>");
    expect(run(src).diags.map((d) => d.code)).toEqual([]);
  });
});

// =============================================================================
// 2. Refusals: a bare statement, prose; a declaration stays refused (Lane B owed)
// =============================================================================
describe("a `<db>` body declares; it does not run — E-DB-BODY-STATEMENT", () => {
  const STMTS = [
    "purge();",
    "@n = 1;",
    "let x = 1;",
    "if (@n > 0) { log(1); }",
    "for (const i of [1, 2]) { log(i); }",
    "when @n changes { log(1); }",
    "on mount { log(1); }",
    `${IV} @n }`,
    `<effect deps=[@n]>${IV} log(1); }</effect>`,
    '"a" + "b"',
    "Hello",
  ];
  for (const s of STMTS) {
    test(`\`${s}\` → exactly one E-DB-BODY-STATEMENT, nothing written`, () => {
      const r = run(DB(`        function log(x: int) {\n            @n = x;\n        }\n        ${s}`));
      expect(r.diags.map((d) => d.code)).toEqual(["E-DB-BODY-STATEMENT"]);
      expect(r.core == null).toBe(true);
    });
  }
  test("the message says why and names the fix (§4.18.1 S472)", () => {
    const m = msgOf(DB("        purge();"), "E-DB-BODY-STATEMENT");
    expect(m).toContain("declares; it does not run");
    expect(m).toContain("Move this into a function, or into the `<program>` body");
  });
  test("the report spans the statement, `;` included", () => {
    const src = DB("        purge();\n        <p>ok</p>");
    const d = run(src).diags[0];
    expect(src.substring(d.span.start, d.span.end)).toBe("purge();");
  });
});

describe("loose prose in a `<db>` body is E-UNQUOTED-DISPLAY-TEXT — one report per run (§4.18.7)", () => {
  test("one line of prose", () => {
    expect(codes(DB("        Some prose here"))).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
  });
  test("two consecutive prose lines are ONE report spanning both; the message names the markup and the literal forms", () => {
    const src = DB("        Some prose here\n        and more prose\n        <p>ok</p>");
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
    expect(src.substring(r.diags[0].span.start, r.diags[0].span.end)).toBe("Some prose here\n        and more prose");
    expect(r.diags[0].message).toContain("<p>");
    expect(r.diags[0].message).toContain("\"Some prose here");
  });
  test("prose that starts with `on` / `type`-free words is prose, not a statement", () => {
    expect(codes(DB("        on the other hand, this"))).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
  });
  test("reports come in source order (prose before a later statement)", () => {
    expect(codes(DB("        Some prose here\n        purge();"))).toEqual(["E-UNQUOTED-DISPLAY-TEXT", "E-DB-BODY-STATEMENT"]);
  });
  test("prose INSIDE a markup element in the db body is still that element's free text", () => {
    expect(codes(DB("        <p>Please let <b>me</b> know</p>"))).toEqual([]);
  });
});

describe("a declaration in a `<db>` body stays REFUSED by name (Lane B owed — ruling item 6)", () => {
  for (const decl of ["let <hits:int=0/>", "<hits:int=0/>", "export let <hits:int=0/>"]) {
    test(`\`${decl}\` → one E-BOOTSTRAP-UNSUPPORTED naming the server-authoritative cell`, () => {
      const r = run(DB(`        ${decl}`));
      expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(r.diags[0].message).toContain("a declaration in a `<db>` body");
      expect(r.diags[0].message).toContain("server-authoritative cell");
      expect(r.core == null).toBe(true);
    });
  }
  test("`let` before a tag that declares nothing: E-PARSE-LET, as in a program body", () => {
    expect(codes(DB("        let <b>x</b>"))).toEqual(["E-PARSE-LET"]);
  });
});

// =============================================================================
// r1 (S239 review MED-1): a db-body function is the PROGRAM's function (hoisted — the
// program-wide reading, pending bryan's ruling). Inside a scope that binds names it would
// lose them (or bind the program's of the same spelling) — refused there, fail closed.
// =============================================================================
describe("r1 MED-1 — a function in a `<db>` nested inside a name-binding scope is refused by name", () => {
  const F = "function f() -> int {\n                return 1;\n            }";
  const REFUSAL = (src) => {
    const r = run(src);
    const ds = r.diags.filter((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED" && d.message.includes("a function in a `<db>` body that stands inside"));
    return { ds, all: r.diags.map((d) => d.code), core: r.core };
  };
  test("inside an `<each>` row: refused, naming the row binder (also when the function uses the binder)", () => {
    const plain = REFUSAL(`<program>\n    <xs:int[]=([1, 2])/>\n    <main>\n        <each in=@xs as x>\n        <db src="./app.db">\n            ${F}\n        </db>\n        </each>\n    </main>\n</program>\n`);
    expect(plain.all).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(plain.ds[0].message).toContain("`<each>` row");
    expect(plain.core == null).toBe(true);
    const uses = REFUSAL(`<program>\n    <xs:int[]=([1, 2])/>\n    <main>\n        <each in=@xs as x>\n        <db src="./app.db">\n            function g() -> int {\n                return x;\n            }\n        </db>\n        </each>\n    </main>\n</program>\n`);
    expect(uses.ds.length).toBe(1);
  });
  test("inside a component's `renders`: refused", () => {
    const r = REFUSAL(`<program>\n    <card title:string="x">\n        let <n:int=0/>\n    </>\n    renders <b>\n        <db src="./app.db">\n            ${F}\n        </db>\n    </b>\n    <main><card title="t"/></main>\n</program>\n`);
    expect(r.ds.length).toBe(1);
    expect(r.ds[0].message).toContain("`renders`");
    expect(r.core == null).toBe(true);
  });
  test("inside an engine state child: refused", () => {
    const r = REFUSAL(`<program>\n    let <n:int=0/>\n    type Phase:enum = { Idle, Done }\n    <phase:Phase=.Idle single>\n        <Idle rule=.Done>\n            <db src="./app.db">\n                ${F}\n            </db>\n        </>\n        <Done rule=.Idle : "Done">\n    </>\n    <main><p><*phase/></p></main>\n</program>\n`);
    expect(r.ds.length).toBe(1);
    expect(r.core == null).toBe(true);
  });
  test("inside an engine state child's `:`-shorthand body: refused", () => {
    const r = REFUSAL(`<program>\n    let <n:int=0/>\n    type Phase:enum = { Idle, Done }\n    <phase:Phase=.Idle single>\n        <Idle rule=.Done : <db src="./app.db">\n                ${F}\n            </db>>\n        <Done rule=.Idle : "Done">\n    </>\n    <main><p><*phase/></p></main>\n</program>\n`);
    expect(r.ds.length).toBe(1);
    expect(r.core == null).toBe(true);
  });
  test("inside a Tier-0 `${IV} for … lift <li>…}` row: refused (the loop binder)", () => {
    const r = REFUSAL(`<program>\n    <xs:int[]=([1, 2])/>\n    <main><ul>${IV} for (const x of @xs) { lift <li><db src="./app.db">\n            ${F}\n        </db></li>; } }</ul></main>\n</program>\n`);
    expect(r.ds.length).toBe(1);
    expect(r.core == null).toBe(true);
  });
  test("control: a `<db>` under `<main>` / nested markup / another `<db>` keeps its functions (no refusal)", () => {
    const src = `<program>\n    <main>\n        <div>\n            <db src="./a.db">\n                <section>\n                    <db src="./b.db">\n                        ${F}\n                    </db>\n                </section>\n            </db>\n        </div>\n    </main>\n</program>\n`;
    expect(codes(src)).toEqual([]);
  });
});

// =============================================================================
// r1 (S239 review LOW-3): recovery and diagnostic quality
// =============================================================================
describe("r1 LOW-3 — prose that looks like an item head, `lift`, apostrophes, the suggested literal", () => {
  test("prose starting with `function` / `type` / `export` is prose (one report), never read to end of file", () => {
    for (const p of ["function of this block is to hold rows", "type in your name", "export the rows as CSV"]) {
      const r = run(DB(`        ${p}\n        <p>ok</p>`));
      expect([p, r.diags.map((d) => d.code)]).toEqual([p, ["E-UNQUOTED-DISPLAY-TEXT"]]);
    }
  });
  test("`lift <p>x</p>;` is E-DB-BODY-STATEMENT, spanning the statement", () => {
    const src = DB("        lift <p>x</p>;\n        <p>ok</p>");
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["E-DB-BODY-STATEMENT"]);
    expect(src.substring(r.diags[0].span.start, r.diags[0].span.end)).toBe("lift <p>x</p>;");
  });
  test("`Don't do this` — the apostrophe does not swallow the rest of the file: one report on its line", () => {
    const src = DB("        Don't do this\n        <p id=\"after\">ok</p>");
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toEqual(["E-UNQUOTED-DISPLAY-TEXT"]);
    expect(src.substring(r.diags[0].span.start, r.diags[0].span.end)).toBe("Don't do this");
  });
  test("a run holding a `\"` suggests a literal with the `\"` escaped (§4.18.3)", () => {
    const m = msgOf(DB("        \"ok\" foo"), "E-UNQUOTED-DISPLAY-TEXT");
    expect(m).toContain("`\"\\\"ok\\\" foo\"`");
    expect(m).not.toContain("\"\"ok\" foo\"");
  });
  test("a real `function` / `export function` / `type` head is still an item", () => {
    expect(codes(DB("        export function g() -> int {\n            return 1;\n        }\n        type T:struct = { a: int }"))).toEqual([]);
  });
});

// =============================================================================
// 3. The leak, end to end through the CLI: no db-body source text in ANY client file
// =============================================================================
describe("scrml-boot compile — no `<db>`-body source text reaches any client artifact", () => {
  const ROOT = resolve(import.meta.dir, "..", "..", "..");
  const CLI = join(ROOT, "scripts", "scrml-boot.ts");
  let tmp;
  beforeAll(() => { tmp = mkdtempSync(join(tmpdir(), "s472-dbbody-")); });
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const boot = (file, out) => {
    const p = Bun.spawnSync(["bun", CLI, "compile", file, "--output-dir", out], { cwd: ROOT, env: { ...process.env, NO_COLOR: "1" }, stdout: "pipe", stderr: "pipe" });
    return { code: p.exitCode, err: p.stderr.toString(), out: p.stdout.toString() };
  };
  const SERVER_FILES = ["program.server.js", "scrml-server-runtime.js", "runtime.js"];

  test("the PA probe's program, fixed to compile: every client file is free of the SQL, the function text and the connection string", () => {
    const file = join(tmp, "d.scrml");
    writeFileSync(file, DB(`${CNT}\n${COUNT}\n        <button onclick={ @n = count() !{ .Transport(t) :> return }; }>"go"</button>`));
    const out = join(tmp, "outd");
    const r = boot(file, out);
    expect(r.err).not.toContain("error");
    expect(r.code).toBe(0);
    const files = readdirSync(out).sort();
    const client = files.filter((f) => !SERVER_FILES.includes(f));
    expect(client).toEqual(["index.html", "program.client.js", "scrml-runtime.js"]);
    for (const f of client) {
      const text = readFileSync(join(out, f), "utf8");
      for (const needle of ["secret_rows", "SELECT COUNT", "function count", "app.db"]) {
        expect({ file: f, has: text.includes(needle) }).toEqual({ file: f, has: false });
      }
    }
    expect(readFileSync(join(out, "program.server.js"), "utf8")).toContain("secret_rows");
  }, 180000);

  test("the PA probe verbatim (d.scrml): it no longer compiles to page text — errors, and nothing written", () => {
    const file = join(tmp, "probe.scrml");
    writeFileSync(file, "<program>\n    <db src=\"./app.db\">\n        function count() -> int { return " + SQ + "`SELECT count(*) AS n FROM t`}.get().n }\n    </db>\n    <main><p>x</p></main>\n</program>\n");
    const out = join(tmp, "outprobe");
    const r = boot(file, out);
    expect(r.code).toBe(1);
    expect(r.err).toContain("nothing written");
    let written = [];
    try { written = readdirSync(out); } catch { written = []; }
    expect(written).toEqual([]);
  }, 180000);
});
