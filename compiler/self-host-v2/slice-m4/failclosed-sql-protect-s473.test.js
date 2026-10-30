// failclosed-sql-protect-s473.test.js — s473-boot-failclosed-sql-protect: the bootstrap refuses what
// it has not built. Each block is a SILENT-ACCEPT the S473 SPEC coverage audit found (part 2 §8 /
// §14.8, part 3 §19.10) — every probe compiled clean on base and ran wrong — turned into a refusal.
// The audit's probe sources are reproduced verbatim (PROBE_*); each is red on base, green here.
//
//   1. §14.8.10 item (2): a SQLite file the compile can open holding an undeclared `tenant_id`
//      relation — E-TENANT-UNDECLARED (scripts/scrml-boot.ts tenantScan; the tenant set is empty).
//   2. §14.8.9 / §52.3: a type-level `<User authority= table= protect=>` was emitted as HTML and its
//      `protect=` dropped — refused (a capitalized undeclared tag; `protect=` / `authority=` anywhere).
//   3. §8.1.2: E-SQL-MULTIPLE-STATEMENTS.
//   4. §8.9.2 / §19.10.5: a `!` function with two or more `?{}` needs the implicit envelope, unbuilt.
//   5. §19.10.4 / §19.10.6: manual transaction control in a `!` function, ungated — refused.
//   6. §14.8.10 item (1): the program-body allow-list — E-SQL-PROGRAM-STATEMENT-NOT-ADMITTED /
//      E-TENANT-UNDECLARED.
//   (7. §12.2 T3 is server-only-stdlib-s473.test.js.)

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => frontEnd(mods, [{ path: "t.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (src) => errs(src).map((d) => d.code);
const SQ = "?" + "{";
const DBP = (body) => `<program db="./app.db">\n${body}\n    <main><p>x</p></main>\n</program>\n`;
const fnWith = (sql) => DBP(`    function f() -> int {\n        ${SQ}\`${sql}\`}.run() !{ _ :> { return 0; } };\n        return 1;\n    }`);

// ---- the audit's probes, verbatim ---------------------------------------------------------------
const PROBE_MULTI = `<program db="./app.db">
    type Note:struct = { id: int, body: string }
    function addNote(body: string) -> int {
        ?{\`INSERT INTO notes (body) VALUES (\${body}); DELETE FROM notes\`}.run() !{ _ :> { return 0; } };
        return 1;
    }
    function onAdd() { const r: int = addNote("x") !{ .Transport(t) :> return }; }
    <main><button onclick=onAdd()>a</button></main>
</program>
`;
const PROBE_ENVELOPE = `<program db="./app.db">
    type E:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }
    function move(a: int)! E {
        ?{\`INSERT INTO log (a) VALUES (\${a})\`}.run();
        ?{\`UPDATE acct SET n = n - \${a}\`}.run();
        if (a > 5) fail .Bad;
        return 1;
    }
    function go() { const r: int = move(3) !{ _ :> return }; }
    <main><button onclick=go()>a</button></main>
</program>
`;
const PROBE_MANUAL = `<program db="./app.db">
    type E:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }
    function move(a: int)! E {
        ?{\`BEGIN\`}.run();
        ?{\`UPDATE acct SET n = n - \${a}\`}.run();
        if (a > 2) fail .Bad;
        ?{\`COMMIT\`}.run();
        return 1;
    }
    function go() { const r: int = move(3) !{ _ :> return }; }
    <main><button onclick=go()>a</button></main>
</program>
`;
// audit part 3 (§19.10): probes-3/p19-tx.scrml, p19-manualtx.scrml
const PROBE_P19_TX = `<program db="./app.db">
    function move(a: int, b: int)! SqlError {
        ?{\`UPDATE acct SET bal = bal - 1 WHERE id = \${a}\`}.run();
        ?{\`UPDATE acct SET bal = bal + 1 WHERE id = \${b}\`}.run();
        return 1;
    }
    let <r:int=0/>
    <main><button onclick={ @r = move(1, 2) !{ _ :> 0, }; }>go</button></main>
</program>
`;
const PROBE_P19_MANUALTX = `<program db="./app.db">
    function move(a: int)! SqlError {
        ?{\`BEGIN\`}.run();
        ?{\`UPDATE acct SET bal = bal - 1 WHERE id = \${a}\`}.run();
        ?{\`COMMIT\`}.run();
        return 1;
    }
    let <r:int=0/>
    <main><button onclick={ @r = move(1) !{ _ :> 0, }; }>go</button></main>
</program>
`;
const PROBE_T3_DDL = `<program db="./app.db">
    let <msg:string=""/>
    function mk() {
        ?{\`CREATE TABLE inv (id INTEGER, tenant_id INTEGER)\`}.run() !{ _ :> not };
    }
    function v() {
        ?{\`CREATE VIEW vv AS SELECT * FROM orders\`}.run() !{ _ :> not };
    }
    function dr() {
        ?{\`DROP TABLE orders\`}.run() !{ _ :> not };
    }
    function a() { mk() !{ _ :> @msg = "e" }; }
    function b() { v() !{ _ :> @msg = "e" }; }
    function c() { dr() !{ _ :> @msg = "e" }; }
    <main><button onclick=a()>a</button><button onclick=b()>b</button><button onclick=c()>c</button></main>
</program>
`;
const PROBE_T10_PROTECT = `<program>
    <User authority="server" table="users" protect="passwordHash">
        id: number
        email: string
        passwordHash: string
    </>
    <db src="./app.db">
        type Row:struct = { id: int, email: string, passwordHash: string }
        <rows:Row[]=(?{\`SELECT * FROM users\`}.all() !{ _ :> [] })/>
    </db>
    <main><p>\${@rows.length}</p></main>
</program>
`;
const PROBE_T1_TENANT = `<program>
    <db src="./app.db">
        type Order:struct = { id: int, item: string }
        <orders:Order[]=(?{\`SELECT id, item FROM orders\`}.all() !{ _ :> [] })/>
    </db>
    <main><p>\${@orders.length}</p></main>
</program>
`;

// ---------------------------------------------------------------------------
describe("3 — §8.1.2: one statement per `?{}` (E-SQL-MULTIPLE-STATEMENTS)", () => {
  test("probe s8/multi: `INSERT …; DELETE FROM notes` is refused, naming the fix", () => {
    const e = errs(PROBE_MULTI);
    expect(e.map((d) => d.code)).toEqual(["E-SQL-MULTIPLE-STATEMENTS"]);
    expect(e[0].message).toContain("one `?{}` per statement");
    expect(e[0].message).toContain("transaction { }");
  });

  test("a `;` followed by any further token begins a second statement", () => {
    for (const sql of ["SELECT 1; SELECT 2", "UPDATE t SET a = 1;;", "SELECT 1 -- x\n; DELETE FROM t", "SELECT 1;\n/* c */ DELETE FROM t", "SELECT (1; 2)"]) {
      expect([sql, codes(fnWith(sql))]).toEqual([sql, ["E-SQL-MULTIPLE-STATEMENTS"]]);
    }
  });

  test("robust: a `;` in a string literal, a quoted identifier or a comment is not a boundary; one trailing `;` is allowed", () => {
    for (const sql of ["INSERT INTO log (msg) VALUES ('a;b')", "SELECT \"a;b\" FROM t", "SELECT 1 /* ; DELETE FROM t */", "SELECT 1 -- ; DELETE FROM t\n",
      "INSERT INTO log (msg) VALUES ('a;b'); -- one statement", "INSERT INTO log (msg) VALUES ('c');", "SELECT 1;   "]) {
      expect([sql, codes(fnWith(sql))]).toEqual([sql, []]);
    }
  });

  test("fail closed: text no reader here reads exactly is split on EVERY `;`, and the message says so", () => {
    for (const sql of ["SELECT 'a\\\\'; DELETE FROM t --'", "SELECT $$;$$", "SELECT 1 /*! ; */", "SELECT 1 AS [a;b]"]) {
      expect([sql, codes(fnWith(sql))]).toEqual([sql, ["E-SQL-MULTIPLE-STATEMENTS"]]);
    }
    expect(errs(fnWith("SELECT $$;$$"))[0].message).toContain("every `;`");
  });
});

describe("6 — §14.8.10 item (1): the program-body allow-list", () => {
  test("probe s148/t3-ddl: a `tenant_id` CREATE is E-TENANT-UNDECLARED; CREATE VIEW and DROP are not admitted", () => {
    const e = errs(PROBE_T3_DDL);
    expect(e.map((d) => d.code)).toEqual(["E-TENANT-UNDECLARED", "E-SQL-PROGRAM-STATEMENT-NOT-ADMITTED", "E-SQL-PROGRAM-STATEMENT-NOT-ADMITTED"]);
    expect(e[0].message).toContain("`inv`");
    expect(e[0].message).toContain("<schema>");
    expect(e[1].message).toContain("CREATE VIEW");
  });

  test("the admitted forms compile", () => {
    for (const sql of ["SELECT a FROM t", "WITH x AS (SELECT 1) SELECT * FROM x", "INSERT INTO t (a) VALUES (1)", "INSERT OR REPLACE INTO t (a) VALUES (1)", "UPDATE t SET a = 1", "DELETE FROM t", "REPLACE INTO t (a) VALUES (1)",
      "CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, body TEXT NOT NULL)", "CREATE TEMP TABLE t (id INTEGER) STRICT", "CREATE TABLE t (id INTEGER) WITHOUT ROWID, STRICT",
      "ALTER TABLE t ADD COLUMN x INTEGER", "ALTER TABLE t ADD y TEXT",
      "CREATE VIRTUAL TABLE IF NOT EXISTS f USING fts5(title, body UNINDEXED, tokenize = 'porter', prefix = 2)",
      "CREATE UNIQUE INDEX IF NOT EXISTS i ON t (a COLLATE nocase, b DESC) WHERE a > 0", "CREATE INDEX i ON t (a)",
      "PRAGMA table_info(t)", "PRAGMA journal_mode = WAL", "PRAGMA busy_timeout",
      "CREATE TABLE t ( -- the key\n id INTEGER /* pk */ )"]) {
      expect([sql, codes(fnWith(sql))]).toEqual([sql, []]);
    }
  });

  test("a `tenant_id` column (any case or quoting, a string literal, an ALTER, an fts5 column) is E-TENANT-UNDECLARED", () => {
    for (const sql of ["CREATE TABLE t (id INTEGER, \"Tenant_Id\" INTEGER)", "CREATE TEMP TABLE t (id INTEGER, TENANT_ID INTEGER)", "ALTER TABLE t ADD COLUMN tenant_id INTEGER",
      "CREATE VIRTUAL TABLE f USING fts5(title, tenant_id)", "CREATE TABLE t (a INT, b INT GENERATED ALWAYS AS (tenant_id))"]) {
      expect([sql, codes(fnWith(sql))]).toEqual([sql, ["E-TENANT-UNDECLARED"]]);
    }
  });

  test("review r1 F1: a `LIKE` copy is not admitted — on postgres:// and mysql:// (the reviewer's probes)", () => {
    const on = (db, sql) => `<program db="${db}">\n    function mk() -> int {\n        ${SQ}\`${sql}\`}.run() !{ _ :> { return 0; } };\n        return 1;\n    }\n    function go() { const r: int = mk() !{ .Transport(t) :> return }; }\n    <main><button onclick=go()>a</button></main>\n</program>\n`;
    for (const db of ["postgres://u:p@localhost/app", "mysql://u:p@localhost/app", "./app.db"]) {
      for (const sql of ["CREATE TABLE IF NOT EXISTS copy (LIKE tmpl INCLUDING ALL)", "CREATE TABLE copy (LIKE orders INCLUDING ALL)", "CREATE TABLE IF NOT EXISTS copy (id INTEGER, LIKE orders)",
        "CREATE TABLE copy (LIKE orders EXCLUDING DEFAULTS, x INTEGER)", "CREATE TABLE copy (LIKE orders)", "CREATE TABLE copy LIKE orders"]) {
        const e = errs(on(db, sql));
        expect([db, sql, e.map((d) => d.code)]).toEqual([db, sql, ["E-SQL-PROGRAM-STATEMENT-NOT-ADMITTED"]]);
      }
    }
    expect(errs(on("postgres://u:p@localhost/app", "CREATE TABLE copy (LIKE orders)"))[0].message).toContain("`LIKE` copy");
    // near-miss: a quoted column named like, and `LIKE` as an operator in a CHECK, are not a copy
    expect(codes(fnWith("CREATE TABLE t (\"like\" TEXT, b TEXT CHECK (b LIKE 'a%'))"))).toEqual([]);
  });

  test("every other statement is not admitted", () => {
    for (const sql of ["CREATE VIEW v AS SELECT 1", "CREATE TABLE t AS SELECT * FROM u", "CREATE TABLE main.t (a INT)", "DROP TABLE t", "ALTER TABLE t RENAME TO u", "ALTER TABLE t ADD a INT, ADD b INT",
      "CREATE VIRTUAL TABLE f USING fts4(title)", "CREATE VIRTUAL TABLE f USING fts5(title, evil = 1)", "PRAGMA writable_schema = 1", "ATTACH 'x.db' AS y", "VACUUM", "SET ROLE none", "EXPLAIN SELECT 1",
      "SELECT a INTO b FROM t", "WITH x AS (SELECT 1) SELECT * INTO y FROM x", "SELECT a FROM t WHERE b = ?", "END"]) {
      const c = codes(fnWith(sql)).filter((x) => x !== "E-ERROR-015");
      expect([sql, c]).toEqual([sql, ["E-SQL-PROGRAM-STATEMENT-NOT-ADMITTED"]]);
    }
  });

  test("a database-less compilation is not governed (E-SQL-004 is its diagnostic)", () => {
    expect(codes(`<program>\n    function f() -> int {\n        ${SQ}\`DROP TABLE t\`}.run() !{ _ :> { return 0; } };\n        return 1;\n    }\n    <main><p>x</p></main>\n</program>\n`)).toEqual(["E-SQL-004"]);
  });
});

describe("4 — §8.9.2 / §19.10.5: the implicit per-handler transaction is not built — refused", () => {
  test("probe s8/envelope: a `!` function with two writes and a `fail` exit", () => {
    const e = errs(PROBE_ENVELOPE);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("implicit per-handler transaction (§8.9.2");
    expect(e[0].message).toContain(".nobatch()");
  });

  test("probe p19-tx (audit part 3): two UPDATEs in a `!` function", () => {
    expect(codes(PROBE_P19_TX)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("near-misses: one query; `.nobatch()` leaves fewer than two; a function not declared `!`", () => {
    const bang = (q1, q2) => DBP(`    type E:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }\n    function move(a: int)! E {\n${q1}${q2}        return 1;\n    }`);
    const q = (sql, nb = "") => `        ${SQ}\`${sql}\`}${nb}.run();\n`;
    expect(codes(bang(q("UPDATE t SET n = 1"), ""))).toEqual([]);
    expect(codes(bang(q("UPDATE t SET n = 1"), q("UPDATE u SET n = 2", ".nobatch()")))).toEqual([]);
    expect(codes(bang(q("UPDATE t SET n = 1"), q("UPDATE u SET n = 2")))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    const plain = DBP(`    function f() -> int {\n        ${SQ}\`UPDATE t SET n = 1\`}.run() !{ _ :> { return 0; } };\n        ${SQ}\`UPDATE u SET n = 1\`}.run() !{ _ :> { return 0; } };\n        return 1;\n    }`);
    expect(codes(plain)).toEqual([]);
  });
});

describe("5 — §19.10.4 / §19.10.6: manual transaction control is refused in every server function", () => {
  test("probe s8/manual: `?{BEGIN}` … `fail` … `?{COMMIT}` in a `!` function", () => {
    const e = errs(PROBE_MANUAL);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("Manual transaction control 'BEGIN'");
    expect(e[0].message).toContain("§19.10.6");
  });

  test("probe p19-manualtx (audit part 3)", () => {
    expect(codes(PROBE_P19_MANUALTX)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("outside a `!` function it stays E-ERROR-015 (§19.10.4) — so no server function admits it", () => {
    expect(codes(fnWith("BEGIN"))).toEqual(["E-ERROR-015"]);
  });
});

describe("2 — §14.8.9 / §52.3: a type-level `protect=` is refused, never rendered as HTML", () => {
  test("probe s148/t10: `<User authority= table= protect=>` + a field list", () => {
    const e = errs(PROBE_T10_PROTECT);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("§52.3 state type declaration");
    expect(e[0].message).toContain("protect=");
  });

  test("each §52.3 attribute alone names the declaration", () => {
    for (const a of [`protect="x"`, `authority="server"`, `table="users"`]) {
      const e = errs(`<program>\n    <Acct ${a}>\n        id: number\n    </>\n    <main><p>x</p></main>\n</program>\n`);
      expect([a, e.map((d) => d.code)]).toEqual([a, ["E-BOOTSTRAP-UNSUPPORTED"]]);
    }
  });

  test("an undeclared capitalized tag is E-COMPONENT-035 (§15.14.2), never an HTML element", () => {
    expect(codes(`<program>\n    <main><Unknown/></main>\n</program>\n`)).toEqual(["E-COMPONENT-035"]);
  });

  test("`protect=` / `authority=` on a plain element are refused, never written out", () => {
    expect(codes(`<program>\n    <main><p protect="x">a</p><div authority="server">b</div></main>\n</program>\n`)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("near-misses: a case variant of an HTML element is HTML; a declared component renders", () => {
    expect(codes(`<program>\n    <main><DIV>a</DIV><Section>b</Section></main>\n</program>\n`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe("1 — §14.8.10 item (3): the built server checks each database before it serves (tenantGate)", () => {
  const srt = () => import(join(import.meta.dir, "..", "slice-m1", "runtime", "server-runtime.js"));
  const INT = { defs: [], root: { k: "int" } };
  const ROUTE = { path: "/_scrml/call/1", params: [], result: INT, error: null };
  const bag = (h) => { const m = new Map(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v])); return { get: (n) => m.get(n.toLowerCase()) ?? null }; };
  const req = (path) => ({ url: "http://localhost" + path, method: "POST", headers: bag({ "Content-Type": "application/json", "X-CSRF-Token": "t", Cookie: "scrml_csrf=t" }), text: async () => "[]" });
  const respond = (status, headers, body) => ({ status, text: async () => body ?? "" });
  const make = async (ddl) => {
    const s = await srt();
    const { SQL } = await import("bun");
    const sql = new SQL(":memory:");
    for (const d of ddl) await sql.unsafe(d);
    const logs = [];
    const host = { connect: () => sql, log: (l) => logs.push(l), respond };
    const conn = s.connection(host, { driver: "sqlite", target: "./app.db", file: "app.scrml" });
    let ran = 0;
    const server = s.server(host, [s.route(ROUTE, async () => { ran++; return 7; })], [conn]);
    return { sql, logs, server, ran: () => ran };
  };

  test("an undeclared `tenant_id` table: every request 503, the body never runs, one E-DEPLOY-DB-TENANT-UNDECLARED log line", async () => {
    const t = await make(["CREATE TABLE orders (id INTEGER, tenant_id INTEGER)", "INSERT INTO orders VALUES (1, 1), (2, 2)"]);
    const a = await t.server.fetch(req(ROUTE.path));
    expect(a.status).toBe(503);
    expect(t.ran()).toBe(0);
    expect((await t.server.fetch(req(ROUTE.path))).status).toBe(503);
    const lines = t.logs.filter((l) => l.includes("E-DEPLOY-DB-TENANT-UNDECLARED"));
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("`orders`");
    expect(lines[0]).toContain("<schema>");
    // the public health route names only a count, and re-runs the check: fixed in place, served without a restart
    const h = await t.server.fetch(req("/_scrml/health"));
    expect([h.status, JSON.parse(await h.text())]).toEqual([503, { error: "Service Unavailable", undeclared: 1 }]);
    await t.sql.unsafe("ALTER TABLE orders RENAME COLUMN tenant_id TO org");
    expect((await t.server.fetch(req("/_scrml/health"))).status).toBe(200);
    const ok = await t.server.fetch(req(ROUTE.path));
    expect([ok.status, await ok.text(), t.ran()]).toEqual([200, "7", 1]);
  });

  test("a view and a generated column count; a catalogue that cannot be read is refused (could not be checked)", async () => {
    const v = await make(["CREATE TABLE o (id INTEGER)", "CREATE VIEW w AS SELECT id, 1 AS TENANT_ID FROM o"]);
    expect((await v.server.fetch(req(ROUTE.path))).status).toBe(503);
    const g = await make(["CREATE TABLE o (id INTEGER, t INTEGER, tenant_id INTEGER GENERATED ALWAYS AS (t) VIRTUAL)"]);
    expect((await g.server.fetch(req(ROUTE.path))).status).toBe(503);
    const s = await srt();
    const logs = [];
    const host = { connect: () => () => Promise.reject(new Error("no catalogue")), log: (l) => logs.push(l), respond };
    const conn = s.connection(host, { driver: "sqlite", target: "./x.db", file: "app.scrml" });
    const server = s.server(host, [s.route(ROUTE, async () => 7)], [conn]);
    expect((await server.fetch(req(ROUTE.path))).status).toBe(503);
    expect(logs.join("\n")).toContain("could not be checked");
  });

  test("review r1 F2: MySQL — every non-system schema is asked; no default database is 'could not be checked'", async () => {
    const s = await srt();
    const seen = [];
    const mk = (answer) => {
      const logs = [];
      const host = { connect: () => (strings) => { seen.push(strings.join("?")); return Promise.resolve(answer(strings.join("?"))); }, log: (l) => logs.push(l), respond };
      const conn = s.connection(host, { driver: "mysql", target: "mysql://h/app", file: "app.scrml" });
      return { logs, server: s.server(host, [s.route(ROUTE, async () => 7)], [conn]) };
    };
    const nodb = mk((q) => (q.includes("DATABASE()") ? [{ db: null }] : []));
    expect((await nodb.server.fetch(req(ROUTE.path))).status).toBe(503);
    expect(nodb.logs.join("\n")).toContain("could not be checked");
    const other = mk((q) => (q.includes("SELECT DATABASE()") ? [{ db: "app" }] : [{ name: "otherdb.orders" }]));
    expect((await other.server.fetch(req(ROUTE.path))).status).toBe(503);
    expect(other.logs.join("\n")).toContain("`otherdb.orders`");
    expect(seen.some((q) => q.includes("NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')") && !q.includes("= DATABASE()"))).toBe(true);
    const clean = mk((q) => (q.includes("SELECT DATABASE()") ? [{ db: "app" }] : []));
    expect((await clean.server.fetch(req(ROUTE.path))).status).toBe(200);
  });

  test("review r1 F7: a check that throws internally backs off (no re-check on every request) and stays 503", async () => {
    const s = await srt();
    let asked = 0;
    const host = { respond, log: () => {}, tenantRelations: () => { asked++; throw new Error("internal"); } };
    const conn = s.connection(host, { driver: "sqlite", target: "./x.db", file: "app.scrml" });
    const server = s.server(host, [s.route(ROUTE, async () => 7)], [conn]);
    expect((await server.fetch(req(ROUTE.path))).status).toBe(503);
    expect((await server.fetch(req(ROUTE.path))).status).toBe(503);
    expect((await server.fetch(req(ROUTE.path))).status).toBe(503);
    expect(asked).toBe(1);
  });

  test("near-misses: no tenant relation serves; a program with no database is not gated", async () => {
    const t = await make(["CREATE TABLE orders (id INTEGER, item TEXT)"]);
    expect((await t.server.fetch(req(ROUTE.path))).status).toBe(200);
    const s = await srt();
    const bare = s.server({ respond }, [s.route(ROUTE, async () => 7)]);
    expect((await bare.fetch(req(ROUTE.path))).status).toBe(200);
    expect((await bare.fetch(req("/_scrml/health"))).status).toBe(404);
  });

  test("the printed server hands its databases to the gate", async () => {
    const { artifacts } = await import("./server-artifact-harness.js");
    const r = run(PROBE_MULTI.replace("; DELETE FROM notes", ""));
    expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    expect(artifacts(r.core).server.js).toMatch(/return rt\.server\(host\$, \[.*\], \[db\$\d+\]\);\n\}/);
  });
});

// ---------------------------------------------------------------------------
describe("1 — §14.8.10 item (2): a SQLite file the compile opens is scanned for undeclared tenant relations", () => {
  let dir;
  let compileSource;
  beforeAll(async () => {
    ({ compileSource } = await import("../../../scripts/scrml-boot.ts"));
    dir = mkdtempSync(join(tmpdir(), "s473-tenant-"));
  }, { timeout: 120000 });
  afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

  const project = (name, ddl, src) => {
    const d = mkdtempSync(join(dir, name + "-"));
    if (ddl !== null) {
      const db = new Database(join(d, "app.db"));
      for (const s of ddl) db.run(s);
      db.close();
    }
    writeFileSync(join(d, "app.scrml"), src);
    return join(d, "app.scrml");
  };
  const errCodes = (r) => r.diagnostics.filter((x) => x.severity === "error").map((x) => x.code);

  test("probe s148/t1: `orders` carries `tenant_id` and is in no tenant set — E-TENANT-UNDECLARED, nothing built", async () => {
    const f = project("t1", ["CREATE TABLE orders (id INTEGER, item TEXT, tenant_id INTEGER)", "INSERT INTO orders VALUES (1, 'a', 1), (2, 'b', 2)"], PROBE_T1_TENANT);
    const r = await compileSource(f);
    expect(r.ok).toBe(false);
    expect(errCodes(r)).toEqual(["E-TENANT-UNDECLARED"]);
    const m = r.diagnostics[0].message;
    expect(m).toContain("table `orders`");
    expect(m).toContain("<schema>");
    expect(r.diagnostics[0].file).toBe(f);
  }, 120000);

  test("a view, a generated column and the `<program db=>` form are scanned too (any case)", async () => {
    const view = project("view", ["CREATE TABLE o (id INTEGER)", "CREATE VIEW v AS SELECT id, 7 AS Tenant_ID FROM o"], PROBE_T1_TENANT);
    expect(errCodes(await compileSource(view))).toEqual(["E-TENANT-UNDECLARED"]);
    const gen = project("gen", ["CREATE TABLE orders (id INTEGER, item TEXT, t INTEGER, tenant_id INTEGER GENERATED ALWAYS AS (t) VIRTUAL)"], PROBE_T1_TENANT);
    expect(errCodes(await compileSource(gen))).toEqual(["E-TENANT-UNDECLARED"]);
    const pdb = project("pdb", ["CREATE TABLE orders (id INTEGER, item TEXT, tenant_id INTEGER)"], `<program db="./app.db">\n    function n() -> int {\n        ${SQ}\`SELECT id FROM orders\`}.all() !{ _ :> { return 0; } };\n        return 1;\n    }\n    <main><p>x</p></main>\n</program>\n`);
    expect(errCodes(await compileSource(pdb))).toEqual(["E-TENANT-UNDECLARED"]);
  }, 120000);

  test("review r1 F3: a FIFO (or a directory) at the db path is not opened — 'could not check', no hang", async () => {
    const f = project("fifo", null, PROBE_T1_TENANT);
    const fifo = join(f, "..", "app.db");
    const mk = Bun.spawnSync(["mkfifo", fifo]);
    expect(mk.exitCode).toBe(0);
    const r = await compileSource(f);
    expect(errCodes(r)).toEqual(["E-TENANT-UNDECLARED"]);
    expect(r.diagnostics[0].message).toContain("not a regular file");
    const d = project("dir", null, PROBE_T1_TENANT);
    mkdirSync(join(d, "..", "app.db"));
    expect(errCodes(await compileSource(d))).toEqual(["E-TENANT-UNDECLARED"]);
  }, 120000);

  test("a file that is not a SQLite database is unknown, and unknown is not clean", async () => {
    const f = project("junk", null, PROBE_T1_TENANT);
    writeFileSync(join(f, "..", "app.db"), "this is not a database file, it is text and more text to fill a page");
    expect(errCodes(await compileSource(f))).toEqual(["E-TENANT-UNDECLARED"]);
  }, 120000);

  test("near-misses: no `tenant_id` relation, or no file yet (the startup check's), compiles", async () => {
    const clean = project("clean", ["CREATE TABLE orders (id INTEGER, item TEXT)"], PROBE_T1_TENANT);
    expect(errCodes(await compileSource(clean))).toEqual([]);
    const none = project("none", null, PROBE_T1_TENANT);
    expect(errCodes(await compileSource(none))).toEqual([]);
  }, 120000);
});
