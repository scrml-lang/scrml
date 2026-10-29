// db-cells-s473.test.js — s473-boot-db-cells (Lane B of the `<db>` design): a declaration in a
// `<db>` body is a per-request SERVER cell; the client receives only its projection.
//
// RULED S472 (scrml-support/user-voice-scrml.md "⭐ RULED — `<db>` body + client reads, Q1–Q6 =
// PA recs"):
//   1. "A `<db>`-body declaration IS a server-authoritative cell evaluated per request (under that
//      request's identity; no cross-request server memory); the client receives only a projection."
//   2. "While the load is in flight the page WAITS, so the cell's type stays `T`."
//   4. "Server code reading `@x` of a db cell is REFUSED for now (`E-DB-CELL-SERVER-READ`)."
//   5. "Only code inside the block writes; locked cells are read-only on the client; `let` stays local."
// and "⭐ RULED — functions in a `<db>` body: visibility" (a db-body function is a program-level
// function whose `?{}` binds to its declaring `<db>`; one in a `<db>` inside an `<each>` row, a
// component's renders/body, an engine state child or a `<match>` arm is REFUSED for now) — the same
// refusal holds for a db cell there (it is hoisted to the program the same way).
//
// The projection is an ALLOW-LIST: the cell's DECLARED TYPE. The server encodes the loaded value
// against it (§57 — an undeclared key is refused, never dropped), so a column the type does not
// name never leaves the server; a column it names ships (the author selected and declared it).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mods, compile, codes, check, artifacts, realDb, serve, bridge, post, pathOf } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, click, warmLoadProgram } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 120000 });

const realFetch = globalThis.fetch;
const realConsoleError = console.error;
afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realConsoleError;
  if (globalThis.document) globalThis.document.cookie = "scrml_csrf=; Max-Age=0; Path=/";
  expectNoPageErrors();
});

const SQ = "?" + "{";
const IV = "$" + "{";
const run = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const errCodes = (src) => errs(src).map((d) => d.code);
const msgOf = (src, code) => (run(src).diags.find((d) => d.code === code) || { message: "" }).message;
const settle = async (n = 16) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const uniq = (p) => p + "-" + Math.random().toString(36).slice(2);

const ROW = "        type Row:struct = { id: int, name: string }";
const ROWS = `        <rows:Row[]=(${SQ}\`SELECT id, name FROM people ORDER BY id\`}.all() !{ _ :> [] })/>`;
// a program whose `<db src>` holds `body`; `main` is the page
const P = (body, main = `    <main><ul id="list"><each in=@rows as r><li>${IV}r.name}</li></each></ul><p id="count">${IV}@rows.length}</p></main>`, head = "") =>
  `<program>\n${head}    <db src="./app.db">\n${body}\n    </db>\n${main}\n</program>\n`;
const BASIC = P(`${ROW}\n${ROWS}`);
const PEOPLE = ["CREATE TABLE people (id INTEGER, name TEXT, secret TEXT)"];
const SEED = { people: [{ id: 1, name: "Ada", secret: "s3cr3t-1" }, { id: 2, name: "Bob", secret: "s3cr3t-2" }] };

async function boot(src, ddl = PEOPLE, seed = SEED) {
  const r = compile(src);
  expect(check(r.core)).toEqual([]);
  const sql = await realDb(ddl, seed);
  const { srv, routes, js } = await serve(r.core, sql);
  globalThis.fetch = bridge(srv);
  const loaded = await loadProgram(r.core, uniq("dbcell"));
  await settle();
  const inst = [...loaded.rt.devtools.instances.values()].find((i) => i.id === 0 && i.decl.name === "program");
  return { r, sql, srv, routes, serverJs: js, loaded, state: inst ? loaded.rt.snapshot(inst) : null };
}

// =============================================================================
// 1. A db cell compiles to a server load + a client cell
// =============================================================================
describe("a declaration in a `<db>` body is a per-request server cell (S472 ruling item 1)", () => {
  test("compiles clean; Core holds ONE load: a parameterless ServerFn returning the cell's declared type, its `?{}` on THIS `<db>`", () => {
    const r = compile(BASIC);
    expect(check(r.core)).toEqual([]);
    expect(r.core.loads.length).toBe(1);
    const ld = r.core.loads[0];
    const sf = r.core.server.find((s) => s.sym.id === ld.fn.id);
    expect(sf).toBeTruthy();
    expect(sf.params).toEqual([]);
    expect(sf.ret).toBeTruthy();
    const prog = r.core.decls.find((d) => d.sym.id === r.core.program.id);
    const f = prog.fields.find((x) => x.sym.id === ld.cell.id);
    expect(f.sym.hint).toBe("rows");
    expect(f.init).toEqual({ variant: "Local", data: { sym: ld.val } });
    const q = sf.body.stmts.find((x) => x.variant === "Suspend" && x.data.on.variant === "Query").data.on.data.q;
    expect(r.core.dbs.find((d) => d.sym.id === q.db.id).target).toBe("./app.db");
  });

  test("the client artifact holds NO SQL, no table name, no database path and no load body; the server artifact holds the query", () => {
    const r = compile(BASIC);
    const { client, server } = artifacts(r.core);
    expect(client.refused).toEqual([]);
    expect(server.refused).toEqual([]);
    for (const needle of ["SELECT", "people", "app.db", "rt.query", "ORDER BY"]) expect(client.js).not.toContain(needle);
    for (const needle of ["SELECT", "people"]) expect(client.html).not.toContain(needle);
    expect(server.js).toContain("people");
    // the two artifacts agree on the route (one per db cell)
    expect(server.routes).toEqual(client.routes);
    expect(client.routes.length).toBe(1);
  });

  test("the page WAITS: the client artifact awaits the cell's load before it mounts (S472 ruling item 2)", () => {
    const { client } = artifacts(compile(BASIC).core);
    const awaitAt = client.js.indexOf("await ");
    const mountAt = client.js.indexOf(".mount(");
    expect(awaitAt).toBeGreaterThan(-1);
    expect(mountAt).toBeGreaterThan(awaitAt);
  });

  test("the load function is not nameable by the program: calling the cell as a function is E-SCOPE-001", () => {
    const src = P(`${ROW}\n${ROWS}`, `    function f() -> int {\n        const xs: Row[] = rows() !{ _ :> [] };\n        return xs.length;\n    }\n    <main><p>x</p></main>`);
    expect(errCodes(src)).toContain("E-SCOPE-001");
  });

  test("a `let` db cell with a literal value is a server cell too (one route), and the client reads it", () => {
    const src = P("        let <draft:string=\"hello\"/>", `    <main><p id="d">${IV}@draft}</p></main>`);
    const r = compile(src);
    expect(r.core.loads.length).toBe(1);
    expect(artifacts(r.core).client.routes.length).toBe(1);
  });
});

// =============================================================================
// 2. Runtime: the client reads the projection; per request; allow-list
// =============================================================================
describe("RUNS on a real SQLite: the client reads the loaded projection", () => {
  test("the page renders the rows the server loaded; the cell's value is the rows (type `T`, never `not`)", async () => {
    const b = await boot(BASIC);
    expect(document.querySelector("#count").textContent).toBe("2");
    expect([...document.querySelectorAll("#list li")].map((li) => li.textContent)).toEqual(["Ada", "Bob"]);
    expect(b.state.rows).toEqual([{ id: 1, name: "Ada" }, { id: 2, name: "Bob" }]);
  });

  test("PER REQUEST: a row inserted between two page loads is seen by the second (no cross-request server memory)", async () => {
    const r = compile(BASIC);
    const sql = await realDb(PEOPLE, SEED);
    const { srv } = await serve(r.core, sql);
    globalThis.fetch = bridge(srv);
    await loadProgram(r.core, uniq("dbcell-a"));
    await settle();
    expect(document.querySelector("#count").textContent).toBe("2");
    await sql.unsafe("INSERT INTO people (id, name, secret) VALUES (3, 'Cy', 'x')");
    await loadProgram(r.core, uniq("dbcell-b"));
    await settle();
    expect(document.querySelector("#count").textContent).toBe("3");
  });

  test("the load route answers the projection only — the encoded rows, no SQL, no other column", async () => {
    const r = compile(BASIC);
    const sql = await realDb(PEOPLE, SEED);
    const { srv, routes } = await serve(r.core, sql);
    const res = await post(srv, routes[0].path, []);
    expect(res.status).toBe(200);
    expect(res.json).toEqual([{ id: 1, name: "Ada" }, { id: 2, name: "Bob" }]);
    expect(res.text).not.toContain("s3cr3t");
    expect(res.text).not.toContain("SELECT");
  });

  test("ALLOW-LIST: a SELECTed column the declared type does not name never leaves the server (500, page not mounted, no secret anywhere)", async () => {
    const src = P(`${ROW}\n        <rows:Row[]=(${SQ}\`SELECT id, name, secret FROM people\`}.all() !{ _ :> [] })/>`);
    const r = compile(src);
    const sql = await realDb(PEOPLE, SEED);
    const logs = [];
    const { srv, routes } = await serve(r.core, sql, logs);
    const res = await post(srv, routes[0].path, []);
    expect(res.status).toBe(500);
    expect(res.text).not.toContain("s3cr3t");
    const bodies = [];
    const b = bridge(srv);
    globalThis.fetch = async (path, init) => { const x = await b(path, init); const t = await x.text(); bodies.push(t); return { status: x.status, text: async () => t, headers: x.headers }; };
    const reported = [];
    console.error = (...a) => reported.push(a.map(String).join(" "));
    await loadProgram(r.core, uniq("dbcell-secret"));
    await settle();
    for (const t of bodies) expect(t).not.toContain("s3cr3t");
    expect(document.querySelector("#count")).toBe(null);   // not mounted
    expect(reported.join("\n")).not.toContain("s3cr3t");
    expect(reported.join("\n")).not.toContain("SELECT");
    expect(reported.length).toBeGreaterThan(0);
  });

  test("a column the declared type names DOES ship (documented: select and declare only what the page shows)", async () => {
    const src = P(`        type Row:struct = { id: int, name: string, secret: string }\n        <rows:Row[]=(${SQ}\`SELECT id, name, secret FROM people ORDER BY id\`}.all() !{ _ :> [] })/>`);
    const b = await boot(src);
    expect(b.state.rows[0].secret).toBe("s3cr3t-1");
  });

  test("a failed load (the server answers 500): the page is NOT mounted, and the report carries no server text", async () => {
    const r = compile(BASIC);
    globalThis.fetch = async () => ({ status: 500, text: async () => "SELECT boom FROM people -- driver said: no such table", headers: { get: () => null } });
    const reported = [];
    console.error = (...a) => reported.push(a.map(String).join(" "));
    await loadProgram(r.core, uniq("dbcell-fail"));
    await settle();
    expect(document.querySelector("#count")).toBe(null);
    expect(document.body.textContent).toBe("");
    expect(reported.length).toBeGreaterThan(0);
    expect(reported.join("\n")).not.toContain("boom");
    expect(reported.join("\n")).not.toContain("SELECT");
  });

  test("a cell's value may call a server function declared in its `<db>` (called in place, on the server); a program cell derived from it re-derives on the client", async () => {
    const src = P(`${ROW}\n        function listPeople() -> Row[] {\n            return ${SQ}\`SELECT id, name FROM people ORDER BY id\`}.all() !{ _ :> [] };\n        }\n        <rows:Row[]=(listPeople())/>`, `    <total:int=(@rows.length)/>\n    <main><p id="total">${IV}@total}</p></main>`);
    const b = await boot(src);
    expect(document.querySelector("#total").textContent).toBe("2");
    expect(b.r.core.loads.length).toBe(1);
    // the client artifact calls the load route only — not listPeople (it is called in place on the server)
    const { client } = artifacts(b.r.core);
    expect(client.routes.map((x) => x.fn)).toEqual(["load$rows"]);
  });

  test("a cell's value that reaches CLIENT-only code is refused (the value is server code — E-ROUTE-002)", () => {
    const src = `<program>\n    let <k:int=1/>\n    function readK() -> int {\n        return @k;\n    }\n    <db src="./app.db">\n        <n:int=(readK())/>\n    </db>\n    <main><p>x</p></main>\n</program>\n`;
    expect(errCodes(src)).toContain("E-ROUTE-002");
  });

  test("two sibling `<db src>`s: each cell's load runs on its own database", () => {
    const src = `<program>\n    type N:struct = { n: int }\n    <db src="./a.db">\n        <na:N[]=(${SQ}\`SELECT n FROM ta\`}.all() !{ _ :> [] })/>\n    </db>\n    <db src="./b.db">\n        <nb:N[]=(${SQ}\`SELECT n FROM tb\`}.all() !{ _ :> [] })/>\n    </db>\n    <main><p>${IV}@na.length} ${IV}@nb.length}</p></main>\n</program>\n`;
    const r = run(src);
    if (!r.core) throw new Error(r.diags.map((d) => d.code + " " + d.message).join("\n"));
    const target = (cell) => {
      const ld = r.core.loads.find((l) => { const prog = r.core.decls.find((d) => d.sym.id === r.core.program.id); return prog.fields.find((f) => f.sym.id === l.cell.id).sym.hint === cell; });
      const sf = r.core.server.find((s) => s.sym.id === ld.fn.id);
      const q = sf.body.stmts.find((x) => x.variant === "Suspend" && x.data.on.variant === "Query").data.on.data.q;
      return r.core.dbs.find((d) => d.sym.id === q.db.id).target;
    };
    expect(target("na")).toBe("./a.db");
    expect(target("nb")).toBe("./b.db");
  });
});

// =============================================================================
// 3. Writes (ruling item 5): only code inside the block writes; locked = read-only; `let` local
// =============================================================================
describe("writes: only code inside the `<db>` writes a db cell; a locked one is read-only on the client", () => {
  const DRAFT = "        let <draft:string=\"\"/>";
  test("a `let` db cell written by a function declared IN the block (called from the page) lands locally — no server request for the write", async () => {
    const src = P(`${DRAFT}\n        function setDraft(s: string) {\n            @draft = s;\n        }`, `    <main><p id="d">${IV}@draft}</p><button id="go" onclick=setDraft("typed")>"go"</button></main>`);
    const b = await boot(src, [], {});
    let after = 0;
    const inner = globalThis.fetch;
    globalThis.fetch = (p, i) => { after++; return inner(p, i); };
    click(document.querySelector("#go"));
    await settle();
    expect(document.querySelector("#d").textContent).toBe("typed");
    expect(after).toBe(0);
  });

  test("a handler in markup INSIDE the `<db>` body writes a `let` db cell (inside the block)", () => {
    const src = P(`${DRAFT}\n        <button onclick={ @draft = "x"; }>"set"</button>`, "    <main><p>x</p></main>");
    expect(errCodes(src)).toEqual([]);
  });

  test("a write from OUTSIDE the block — a program-body function, a page handler, a `bind:` — is E-DB-CELL-WRITE-OUTSIDE-BLOCK", () => {
    const fnOut = P(DRAFT, "    function clear() {\n        @draft = \"\";\n    }\n    <main><button onclick=clear()>\"c\"</button></main>");
    expect(errCodes(fnOut)).toEqual(["E-DB-CELL-WRITE-OUTSIDE-BLOCK"]);
    const handlerOut = P(DRAFT, "    <main><button onclick={ @draft = \"y\"; }>\"c\"</button></main>");
    expect(errCodes(handlerOut)).toEqual(["E-DB-CELL-WRITE-OUTSIDE-BLOCK"]);
    const bindOut = P(DRAFT, "    <main><input bind:value=@draft/></main>");
    expect(errCodes(bindOut)).toEqual(["E-DB-CELL-WRITE-OUTSIDE-BLOCK"]);
    expect(msgOf(fnOut, "E-DB-CELL-WRITE-OUTSIDE-BLOCK")).toContain("@draft");
  });

  test("a LOCKED db cell (no `replace` grant, §66.9 rule 1) is read-only on the client — even inside the block, even when its type grants an edit", () => {
    const scalar = P("        <n:int=(1)/>\n        function bump() {\n            @n = 2;\n        }", "    <main><button onclick=bump()>\"c\"</button></main>");
    expect(errCodes(scalar)).toEqual(["E-WRITE-NOT-GRANTED"]);
    const edits = P(`${ROW}\n        <rows:Row[free, append]=(${SQ}\`SELECT id, name FROM people\`}.all() !{ _ :> [] })/>\n        function more() {\n            @rows = [...@rows, { id: 9, name: "Zed" }];\n        }`, "    <main><button onclick=more()>\"c\"</button></main>");
    expect(errCodes(edits)).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(msgOf(edits, "E-WRITE-NOT-GRANTED")).toContain("locked `<db>` cell");
  });

  test("a tape db cell whose type grants `replace` (the sequence spelling of `let`, O3) is written by in-block code, and from nowhere else", () => {
    const inside = P(`${ROW}\n        <rows:Row[replace]=(${SQ}\`SELECT id, name FROM people\`}.all() !{ _ :> [] })/>\n        function clear() {\n            @rows = [];\n        }`, "    <main><button onclick=clear()>\"c\"</button></main>");
    expect(errCodes(inside)).toEqual([]);
    const outside = P(`${ROW}\n        <rows:Row[replace]=(${SQ}\`SELECT id, name FROM people\`}.all() !{ _ :> [] })/>`, "    <main><button onclick={ @rows = []; }>\"c\"</button></main>");
    expect(errCodes(outside)).toEqual(["E-DB-CELL-WRITE-OUTSIDE-BLOCK"]);
  });

  test("RUNS — the refresh shape: an in-block function writes a server function's answer into a `replace`-granted db tape (S472 design §3 'Refresh' (a))", async () => {
    const src = P(`${ROW}\n        <rows:Row[replace]=(${SQ}\`SELECT id, name FROM people ORDER BY id\`}.all() !{ _ :> [] })/>\n        function addAndList(name: string) -> Row[] {\n            ${SQ}\`INSERT INTO people (id, name, secret) VALUES (3, ${IV}name}, 'z')\`}.run() !{ _ :> { return []; } };\n            return ${SQ}\`SELECT id, name FROM people ORDER BY id\`}.all() !{ _ :> [] };\n        }\n        function add() {\n            @rows = addAndList("Cy") !{ .Transport(t) :> return };\n        }`,
      `    <main><p id="count">${IV}@rows.length}</p><button id="add" onclick=add()>"add"</button></main>`);
    const b = await boot(src);
    expect(document.querySelector("#count").textContent).toBe("2");
    click(document.querySelector("#add"));
    await settle();
    expect(document.querySelector("#count").textContent).toBe("3");
    const rows = await b.sql.unsafe("SELECT name FROM people ORDER BY id");
    expect(rows.map((r) => r.name)).toEqual(["Ada", "Bob", "Cy"]);
  });

  test("`reset(@x)` of a db cell is refused (what its initializer means on the client is not built — fail closed)", () => {
    const src = P(`${DRAFT}\n        function again() {\n            reset(@draft);\n        }`, "    <main><button onclick=again()>\"r\"</button></main>");
    expect(errCodes(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

// =============================================================================
// 4. Server reads (ruling item 4): E-DB-CELL-SERVER-READ
// =============================================================================
describe("server code reading `@x` of a db cell is E-DB-CELL-SERVER-READ (ruling item 4)", () => {
  test("a server function declared in the block that reads the cell", () => {
    const src = P(`${ROW}\n${ROWS}\n        function count() -> int {\n            const r: Row = ${SQ}\`SELECT id, name FROM people WHERE id = ${IV}@rows.length}\`}.get() !{ _ :> { return 0; } };\n            return r.id;\n        }`, "    <main><p>x</p></main>");
    const cs = errCodes(src);
    expect(cs).toContain("E-DB-CELL-SERVER-READ");
    expect(cs).not.toContain("E-REACTIVE-003");
    expect(msgOf(src, "E-DB-CELL-SERVER-READ")).toContain("@rows");
  });

  test("a program-body server function (program `db=`) that reads the cell", () => {
    const src = `<program db="./main.db">\n    <db src="./app.db">\n${ROW}\n${ROWS}\n    </db>\n    function peek() -> int {\n        const r: Row = ${SQ}\`SELECT id, name FROM people WHERE id = ${IV}@rows[0].id}\`}.get() !{ _ :> { return 0; } };\n        return r.id;\n    }\n    <main><p>x</p></main>\n</program>\n`;
    expect(errCodes(src)).toContain("E-DB-CELL-SERVER-READ");
  });

  test("a db cell's own value reading ANOTHER db cell (the value is server code)", () => {
    const src = P(`${ROW}\n${ROWS}\n        <n:int=(@rows.length)/>`, "    <main><p>x</p></main>");
    expect(errCodes(src)).toContain("E-DB-CELL-SERVER-READ");
  });

  test("a db cell's value reading a CLIENT cell: the existing E-REACTIVE-003 (a client cell is not on the server)", () => {
    const src = `<program>\n    let <k:int=1/>\n    <db src="./app.db">\n        <n:int=(@k + 1)/>\n    </db>\n    <main><p>x</p></main>\n</program>\n`;
    expect(errCodes(src)).toContain("E-REACTIVE-003");
  });
});

// =============================================================================
// 5. Where a db cell may stand (the Lane A refusal pattern) and name collisions
// =============================================================================
describe("a db cell in a `<db>` nested in a name-binding scope is refused; collisions are errors", () => {
  const CELL = "<c:int=(1)/>";
  const one = (src) => {
    const ds = errs(src);
    expect(ds.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(ds[0].message).toContain("`<db>` cell");
    expect(run(src).core == null).toBe(true);
  };
  test("inside an `<each>` row", () => {
    one(`<program>\n    <xs:int[]=([1, 2])/>\n    <main>\n        <each in=@xs as x>\n        <db src="./app.db">\n            ${CELL}\n        </db>\n        </each>\n    </main>\n</program>\n`);
  });
  test("inside a component's `renders`", () => {
    one(`<program>\n    <card title:string="x">\n        let <n:int=0/>\n    </>\n    renders <b>\n        <db src="./app.db">\n            ${CELL}\n        </db>\n    </b>\n    <main><card title="t"/></main>\n</program>\n`);
  });
  test("inside an engine state child", () => {
    one(`<program>\n    type Phase:enum = { Idle, Done }\n    <phase:Phase=.Idle single>\n        <Idle rule=.Done>\n            <db src="./app.db">\n                ${CELL}\n            </db>\n        </>\n        <Done rule=.Idle : "Done">\n    </>\n    <main><p><*phase/></p></main>\n</program>\n`);
  });
  test("control: a `<db>` under `<main>` / plain markup keeps its cells", () => {
    const src = `<program>\n    <main>\n        <div>\n            <db src="./app.db">\n                ${CELL}\n            </db>\n        </div>\n        <p>${IV}@c}</p>\n    </main>\n</program>\n`;
    expect(errCodes(src)).toEqual([]);
  });
  test("two `<db>`s declaring the same cell name: one E-SCOPE-010, nothing compiled", () => {
    const src = `<program>\n    <db src="./a.db">\n        <c:int=(1)/>\n    </db>\n    <db src="./b.db">\n        <c:int=(2)/>\n    </db>\n    <main><p>${IV}@c}</p></main>\n</program>\n`;
    const cs = errCodes(src);
    expect(cs.filter((c) => c === "E-SCOPE-010").length).toBe(1);
    expect(run(src).core == null).toBe(true);
  });
  test("a db cell named like a program cell: E-SCOPE-010", () => {
    const src = `<program>\n    let <c:int=0/>\n    <db src="./a.db">\n        <c:int=(1)/>\n    </db>\n    <main><p>${IV}@c}</p></main>\n</program>\n`;
    expect(errCodes(src)).toContain("E-SCOPE-010");
  });
});

// =============================================================================
// 6. Shapes outside the built set are refused by name (fail closed)
// =============================================================================
describe("a db cell is `[let] <name:Type=value/>` — any other shape is refused by name", () => {
  const refused = (body) => {
    const ds = errs(P(body, "    <main><p>x</p></main>"));
    expect(ds.length).toBeGreaterThan(0);
    expect(run(P(body, "    <main><p>x</p></main>")).core == null).toBe(true);
    return ds.map((d) => d.code);
  };
  test("no written type: the declared type IS the projection (the allow-list), so it is required", () => {
    expect(refused("        <c=(1)/>")).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("no value: a db cell's value is its load", () => {
    expect(refused("        <c:int/>")).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("`export`", () => {
    expect(refused("        export <c:int=(1)/>")).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("`persist=` / another attribute", () => {
    expect(refused("        let <c:int=0 persist=\"local\" key=\"k\"/>")).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a body / `renders`", () => {
    expect(refused("        <c:int=(1)>\n            <p>x</p>\n        </c>")).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a query whose failure is not handled: an error (the value is a server function's return)", () => {
    const ds = refused(`${ROW}\n        <rows:Row[]=(${SQ}\`SELECT id, name FROM people\`}.all())/>`);
    expect(ds.length).toBeGreaterThan(0);
  });
  test("identity in a cell's value (`@currentUser`) — the bootstrap has no auth model: refused", () => {
    expect(refused(`${ROW}\n        <rows:Row[]=(${SQ}\`SELECT id, name FROM people WHERE id = ${IV}@currentUser.id}\`}.all() !{ _ :> [] })/>`).length).toBeGreaterThan(0);
  });
});
