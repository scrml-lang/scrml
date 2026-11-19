// schema-ddl-s478.test.js — s478-boot-schema-ddl: raw SQL `CREATE TABLE` DDL in `<schema>` (SPEC
// §39.2) on the bootstrap. Before this lane every raw statement — and every SQL `--` / `/* */`
// comment — in a `<schema>` body was refused by name ("raw SQL DDL … in `<schema>` is not in the
// bootstrap (INTERIM)"), the largest UNSUPPORTED bucket (59 conformance cases). Every positive test
// below is RED on base for that reason; the negative probes pin that what the reader does not fully
// understand is refused (fails CLOSED), never read as something it is not.
//
// Governing SPEC sentences (quoted at schema.scrml readDdl / readSchemaBody):
//   §39.2  "A `<schema>` body MAY also declare a table with raw SQL `CREATE TABLE <name> ( … )` DDL";
//          a raw head "SHALL name an **unqualified** table" (E-SCHEMA-012); an unreadable known-kind
//          head is E-SCHEMA-013; a readable head "SHALL have the shape `CREATE TABLE [IF NOT EXISTS]
//          <name> ( <column list> ) [<trailing clauses>]`" (E-SCHEMA-014 — a modifier, a clause in
//          place of the column list, an unclosed list, INHERITS, a `LIKE` template item);
//          "Comments and literals" — a SQL `--` line comment, a closed `/* … */` block comment;
//          "every `CREATE TABLE` head in the body text is read as a declaration wherever it appears
//          — including inside comments".
//   §14.8.3 the SQLite type mapping (INTEGER / INT → int (S478 ruling 20; was number), TEXT / CHAR / VARCHAR / CLOB → string,
//          REAL → number) and "A `ColumnDef` with `nullable: true` SHALL produce a field type of
//          `T | not`".
//   §39.11 "The compiler generates struct types for each table in `<schema>`" — DDL tables type rows
//          exactly as §39.2 declarations do (#1915).

import { describe, test, expect, beforeAll } from "bun:test";
import { mods } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

beforeAll(() => { mods(); }, { timeout: 120000 });

const SQ = "?" + "{";
const run = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const all = (src) => run(src).diags;
const codesOf = (src) => all(src).map((d) => d.code);
const errsOf = (src) => all(src).filter((d) => d.severity === "Error").map((d) => d.code);
const msgOf = (src, code) => (all(src).find((d) => d.code === code) || { message: "" }).message;
const P = (body, rest = "    <p>hi</p>") => `<program db="./app.db">\n    <schema>\n${body}\n    </>\n${rest}\n</program>\n`;
const W = (stmt) => `        ${SQ}\`${stmt}\`}`;
const NOTES = "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL, note TEXT, score REAL NOT NULL)";
const UNSUP = "E-BOOTSTRAP-UNSUPPORTED";
const fnP = (schemaBody, sig, lines) => P(schemaBody, `    \${\n        function ${sig} {\n${lines.map((l) => "            " + l).join("\n")}\n        }\n    }\n    <p>x</p>`);
const getRow = (cols, table = "notes") => `const r = ${SQ}\`SELECT ${cols} FROM ${table}\`}.get() !{ _ :> not };`;

describe("raw `CREATE TABLE` in `<schema>` compiles (§39.2)", () => {
  test("bare statement", () => {
    expect(codesOf(P("        " + NOTES))).toEqual([]);
  });
  test("`?{` + backtick wrapper", () => {
    expect(codesOf(P(W(NOTES)))).toEqual([]);
  });
  test("several statements, `;`-terminated or not, lowercase, IF NOT EXISTS", () => {
    const body = [
      "        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE);",
      "        create table posts (id integer primary key, user_id integer not null references users(id) on delete cascade, title varchar(80))",
      W("CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT DEFAULT 'x', n INT DEFAULT -1, at TEXT DEFAULT CURRENT_TIMESTAMP, CHECK (n >= -1))"),
    ].join("\n");
    expect(codesOf(P(body))).toEqual([]);
  });
  test("SQL comments between statements are comments (§39.2 \"Comments and literals\")", () => {
    const body = ["        -- the notes", "        /* block */", "        " + NOTES, "        -- trailing"].join("\n");
    expect(codesOf(P(body))).toEqual([]);
  });
  test("table constraints: PRIMARY KEY (…), UNIQUE (…), FOREIGN KEY … REFERENCES, CONSTRAINT name", () => {
    const body = [
      "        CREATE TABLE a (id INTEGER PRIMARY KEY, k TEXT)",
      "        CREATE TABLE b (x INTEGER NOT NULL, y TEXT, CONSTRAINT pk_b PRIMARY KEY (x), UNIQUE (y), FOREIGN KEY (x) REFERENCES a(id) ON UPDATE NO ACTION)",
    ].join("\n");
    expect(codesOf(P(body))).toEqual([]);
  });
  test("a §39.2 declaration and a raw statement in one body", () => {
    expect(codesOf(P("        users {\n            id: integer primary key\n        }\n        " + NOTES))).toEqual([]);
  });
  test("E-SCHEMA-006 over a raw REFERENCES to a declared table without that column", () => {
    const body = "        CREATE TABLE a (id INTEGER PRIMARY KEY)\n        CREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES a(nope))";
    expect(errsOf(P(body))).toEqual(["E-SCHEMA-006"]);
  });
});

describe("DDL tables type rows (§39.11, §14.8.3)", () => {
  test("a narrowed `.get()` field reads clean", () => {
    expect(errsOf(fnP("        " + NOTES, "f() -> string", [getRow("id, body"), `if (r is not) return "none";`, "return r.body;"]))).toEqual([]);
  });
  test("TEXT NOT NULL is `string` (used as `int`: E-TYPE-031)", () => {
    expect(errsOf(fnP(W(NOTES), "f() -> int", [getRow("body"), "if (r is not) return 0;", "const n: int = r.body;", "return n;"]))).toEqual(["E-TYPE-031"]);
  });
  test("INTEGER PRIMARY KEY (the rowid) is `int` (S478 ruling 20) and REAL NOT NULL is `number`", () => {
    expect(errsOf(fnP("        " + NOTES, "f() -> number", [getRow("id, score"), "if (r is not) return 0;", "const n: number = r.id + r.score;", "return n;"]))).toEqual([]);
    expect(errsOf(fnP("        " + NOTES, "f() -> int", [getRow("id"), "if (r is not) return 0;", "const n: int = r.id;", "return n;"]))).toEqual([]);
    expect(errsOf(fnP("        " + NOTES, "f() -> int", [getRow("score"), "if (r is not) return 0;", "const n: int = r.score;", "return n;"]))).toEqual(["E-TYPE-031"]);
  });
  test("a nullable column is `T | not` — read as `string` it is a type error", () => {
    const es = errsOf(fnP("        " + NOTES, "f() -> string", [getRow("note"), `if (r is not) return "";`, "const s: string = r.note;", "return s;"]));
    expect(es.length).toBeGreaterThan(0);
  });
  test("`INT PRIMARY KEY` is NOT the rowid alias (SQLite admits NULL there): nullable", () => {
    const es = errsOf(fnP("        CREATE TABLE t (id INT PRIMARY KEY, v TEXT NOT NULL)", "f() -> number", [getRow("id", "t"), "if (r is not) return 0;", "const n: number = r.id;", "return n;"]));
    expect(es.length).toBeGreaterThan(0);
  });
  test("a refused body types no row (the member read stays refused)", () => {
    const es = errsOf(fnP("        " + NOTES + "\n        CREATE VIEW v AS SELECT id FROM notes", "f() -> string", [getRow("id, body"), `if (r is not) return "none";`, "return r.body;"]));
    expect(es).toContain(UNSUP);
  });
});

describe("§39.2 head checks on raw heads", () => {
  test("E-SCHEMA-012: a qualified head", () => {
    expect(errsOf(P("        CREATE TABLE public.assets (id INTEGER PRIMARY KEY)"))).toEqual(["E-SCHEMA-012"]);
    expect(errsOf(P(W(`CREATE TABLE "db"."assets" (id INTEGER PRIMARY KEY)`)))).toEqual(["E-SCHEMA-012"]);
  });
  test("E-SCHEMA-013: an unreadable known-kind head", () => {
    expect(errsOf(P("        CREATE TABLE ass#ets (id INTEGER PRIMARY KEY)"))).toEqual(["E-SCHEMA-013"]);
    expect(errsOf(P(W(`CREATE TABLE "" (id INTEGER PRIMARY KEY)`)))).toEqual(["E-SCHEMA-013"]);
  });
  test("E-SCHEMA-014: modifier / clause / INHERITS / LIKE template", () => {
    expect(errsOf(P("        CREATE TEMP TABLE a (id INTEGER PRIMARY KEY)"))).toEqual(["E-SCHEMA-014"]);
    expect(errsOf(P("        CREATE TABLE a AS SELECT 1"))).toEqual(["E-SCHEMA-014"]);
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY) INHERITS (b)"))).toEqual(["E-SCHEMA-014"]);
    expect(errsOf(P("        CREATE TABLE t (id INTEGER PRIMARY KEY)\n        CREATE TABLE a (LIKE t INCLUDING ALL)"))).toEqual(["E-SCHEMA-014"]);
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY, like TEXT)"))).toEqual(["E-SCHEMA-014"]);
  });
  test("a column NAMED like: quoted, or with a constraint after its type", () => {
    expect(errsOf(P(`        CREATE TABLE a (id INTEGER PRIMARY KEY, "like" TEXT, b TEXT)\n        CREATE TABLE c (id INTEGER PRIMARY KEY, like TEXT NOT NULL)`))).toEqual([]);
  });
  test("E-SCHEMA-014: an unclosed column list", () => {
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY, b TEXT"))).toEqual(["E-SCHEMA-014"]);
  });
});

describe("negative probes — fails CLOSED (refused by name)", () => {
  test("a parameterized INTEGER, a quoted type", () => {
    expect(errsOf(P("        CREATE TABLE a (id INTEGER(4) PRIMARY KEY)"))).toEqual([UNSUP]);
    expect(errsOf(P(`        CREATE TABLE a (id INTEGER PRIMARY KEY, v "TEXT")`))).toEqual([UNSUP]);
  });
  test("malformed CREATE: an empty column list, a stray comma, an unknown constraint", () => {
    expect(errsOf(P("        CREATE TABLE a ()"))).toEqual([UNSUP]);
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY,)"))).toEqual([UNSUP]);
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY GENERATED ALWAYS AS (1))"))).toEqual([UNSUP]);
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY DESC)"))).toEqual([UNSUP]);
  });
  test("a statement other than CREATE TABLE (bare and wrapped)", () => {
    for (const st of ["CREATE VIEW v AS SELECT 1", "CREATE INDEX ix ON a (b)", "CREATE TRIGGER t AFTER INSERT ON a BEGIN SELECT 1; END"]) {
      expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY, b TEXT)\n        " + st))).toContain(UNSUP);
    }
    expect(errsOf(P(W("ALTER TABLE a ADD COLUMN c TEXT")))).toEqual([UNSUP]);
    expect(errsOf(P(W("DROP TABLE a")))).toEqual([UNSUP]);
  });
  test("injection-shaped input: a second statement after `;` in one wrapper, a `${}` value, a trailing clause", () => {
    expect(errsOf(P(W("CREATE TABLE a (id INTEGER PRIMARY KEY); DROP TABLE b")))).toEqual([UNSUP]);
    expect(errsOf(P(W("CREATE TABLE a (id INTEGER PRIMARY KEY, n TEXT DEFAULT ${x})")))).toEqual([UNSUP]);
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY) PARTITION BY RANGE (id)"))).toEqual([UNSUP]);
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY, n TEXT DEFAULT 'a\\'; DROP TABLE b; --')"))).toEqual([UNSUP]);
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY, n TEXT DEFAULT (lower('X')))"))).toEqual([UNSUP]);
  });
  test("comment tricks hiding a second statement", () => {
    // a comment INSIDE a statement
    expect(errsOf(P("        CREATE TABLE a (id INTEGER /* ) ; DROP TABLE b; -- */ PRIMARY KEY)"))).toEqual([UNSUP]);
    expect(errsOf(P(W("CREATE TABLE a (id INTEGER PRIMARY KEY) -- ; DROP TABLE b")))).toEqual([UNSUP]);
    // a CR inside a `--` comment (ends it on Postgres, not on SQLite)
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY)\n        -- x\rCREATE TABLE b (id INTEGER PRIMARY KEY)"))).toEqual([UNSUP]);
    // a nested / unclosed block comment
    expect(errsOf(P("        /* a /* b */ CREATE TABLE b (id INTEGER PRIMARY KEY) */\n        CREATE TABLE a (id INTEGER PRIMARY KEY)"))).toContain(UNSUP);
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY)\n        /* never closed"))).toEqual([UNSUP]);
    // a commented-out declaration is still a declaration (§39.2) — refused, not skipped
    expect(errsOf(P("        -- old: CREATE TABLE a (id INTEGER PRIMARY KEY, x TEXT)\n        CREATE TABLE a (id INTEGER PRIMARY KEY)"))).toEqual([UNSUP]);
  });
  test("a `tenant_id` column, or `tenant_id` anywhere in the body (§14.8.10 — the floor is not built)", () => {
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY, tenant_id TEXT)"))).toEqual([UNSUP]);
    expect(errsOf(P("        /* tenant_id */\n        CREATE TABLE a (id INTEGER PRIMARY KEY)"))).toEqual([UNSUP]);
  });
  test("a quoted name that is not a plain identifier, a backtick name", () => {
    expect(errsOf(P(`        CREATE TABLE "a.b" (id INTEGER PRIMARY KEY)`))).toEqual([UNSUP]);
    expect(errsOf(P(`        CREATE TABLE a (id INTEGER PRIMARY KEY, "x y" TEXT)`))).toEqual([UNSUP]);
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY, `b` TEXT)"))).toEqual([UNSUP]);
  });
  test("two primary keys E-SCHEMA-018 (S479 ruling item 4); a duplicate column E-SCHEMA-017 and table E-SCHEMA-016 (S478 ruling 18)", () => {
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY, b TEXT, PRIMARY KEY (b))"))).toEqual(["E-SCHEMA-018"]);
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY, b TEXT, B TEXT)"))).toEqual(["E-SCHEMA-017"]);
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY)\n        CREATE TABLE A (id INTEGER PRIMARY KEY)"))).toEqual(["E-SCHEMA-016"]);
  });
  test("a REFERENCES target this `<schema>` does not declare", () => {
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY, z INTEGER REFERENCES zz(id))"))).toEqual([UNSUP]);
  });
});

// ---- S478 owner rulings (user-voice, eeafd4d) and #1925 review fixes ------------------------------
describe("S478 ruling 1: a raw column type outside §14.8.3's primary list is E-SCHEMA-004 (§39.4)", () => {
  test("BOOLEAN, DATETIME, NUMERIC, BIGINT, DECIMAL(10,2), TIMESTAMP, no type, a multi-word type", () => {
    for (const ty of ["BOOLEAN", "DATETIME", "NUMERIC", "BIGINT", "DECIMAL(10,2)", "timestamp", "", "DOUBLE PRECISION", "UNSIGNED BIG INT"]) {
      const src = P(`        CREATE TABLE a (id INTEGER PRIMARY KEY, v ${ty})`);
      expect([ty, errsOf(src)]).toEqual([ty, ["E-SCHEMA-004"]]);
      expect(msgOf(src, "E-SCHEMA-004")).toContain("No other column type names SHALL be valid");
    }
    expect(errsOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY, v NOT NULL)"))).toEqual(["E-SCHEMA-004"]);
  });
  test("the primary types stay clean", () => {
    expect(codesOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY, b INT, c TEXT, d CHAR, e VARCHAR(9), f CLOB, g REAL, h FLOAT, i DOUBLE, j BLOB)"))).toEqual([]);
  });
});

describe("S478 ruling 2: `WITHOUT ROWID` and `STRICT` are admitted", () => {
  test("each, both in either order, lowercase, `;`-terminated, wrapped", () => {
    for (const t of ["WITHOUT ROWID", "STRICT", "STRICT, WITHOUT ROWID", "WITHOUT ROWID, STRICT", "without rowid", "strict;"]) {
      expect([t, codesOf(P(`        CREATE TABLE a (k TEXT PRIMARY KEY, v INTEGER) ${t}`))]).toEqual([t, []]);
    }
    expect(codesOf(P(W("CREATE TABLE a (k TEXT PRIMARY KEY, v INTEGER) STRICT, WITHOUT ROWID")))).toEqual([]);
  });
  test("what SQLite refuses at CREATE is refused by name", () => {
    // STRICT WITHOUT ROWID with no `,` — SQLite: syntax error
    expect(errsOf(P("        CREATE TABLE a (k TEXT PRIMARY KEY) STRICT WITHOUT ROWID"))).toEqual([UNSUP]);
    expect(errsOf(P("        CREATE TABLE a (k TEXT PRIMARY KEY) STRICT,"))).toEqual([UNSUP]);
    // SQLite: "PRIMARY KEY missing on table", "AUTOINCREMENT not allowed on WITHOUT ROWID tables"
    expect(msgOf(P("        CREATE TABLE a (k TEXT) WITHOUT ROWID"), UNSUP)).toContain("PRIMARY KEY missing");
    expect(msgOf(P("        CREATE TABLE a (id INTEGER PRIMARY KEY AUTOINCREMENT) WITHOUT ROWID"), UNSUP)).toContain("AUTOINCREMENT not allowed");
    // SQLite: unknown datatype in a STRICT table
    for (const ty of ["VARCHAR(10)", "CHAR", "CLOB", "FLOAT", "DOUBLE"]) {
      expect([ty, errsOf(P(`        CREATE TABLE a (id INTEGER PRIMARY KEY, v ${ty}) STRICT`))]).toEqual([ty, [UNSUP]]);
    }
  });
  test("a WITHOUT ROWID table's PRIMARY KEY columns are non-null (single and composite)", () => {
    const one = "        CREATE TABLE t (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID";
    expect(errsOf(fnP(one, "f() -> string", [getRow("k", "t"), `if (r is not) return "";`, "const s: string = r.k;", "return s;"]))).toEqual([]);
    const two = "        CREATE TABLE t (a INTEGER, b TEXT, v TEXT, PRIMARY KEY (a, b)) WITHOUT ROWID";
    expect(errsOf(fnP(two, "f() -> string", [getRow("a, b", "t"), `if (r is not) return "";`, "const n: number = r.a;", "const s: string = r.b;", "return s;"]))).toEqual([]);
    // the non-key column stays nullable
    expect(errsOf(fnP(two, "f() -> string", [getRow("v", "t"), `if (r is not) return "";`, "const s: string = r.v;", "return s;"])).length).toBeGreaterThan(0);
  });
  test("without WITHOUT ROWID the same TEXT PRIMARY KEY stays nullable (SQLite admits NULL there)", () => {
    const es = errsOf(fnP("        CREATE TABLE t (k TEXT PRIMARY KEY, v TEXT NOT NULL)", "f() -> string", [getRow("k", "t"), `if (r is not) return "";`, "const s: string = r.k;", "return s;"]));
    expect(es.length).toBeGreaterThan(0);
  });
});

describe("#1925 review F1: a raw DEFAULT's kind must fit its column's type", () => {
  test("def_ts_on_int, def_str_on_int, def_str_on_real, a real on INTEGER, a number on TEXT — refused by name", () => {
    for (const c of ["x INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP", "x INTEGER NOT NULL DEFAULT 'abc'", "x REAL NOT NULL DEFAULT 'n/a'", "x INTEGER DEFAULT 1.5", "x TEXT DEFAULT 0", "x BLOB DEFAULT 'a'", "x INTEGER DEFAULT TRUE", "x INTEGER DEFAULT (1)"]) {
      const src = P(`        CREATE TABLE t (id INTEGER PRIMARY KEY, ${c})`);
      expect([c, errsOf(src)]).toEqual([c, [UNSUP]]);
      expect(msgOf(src, UNSUP)).toContain("which the column's row type does not hold");
    }
  });
  test("the same in the §39.2 declarative form", () => {
    for (const c of ["x: integer not null default(CURRENT_TIMESTAMP)", "x: integer not null default('abc')"]) {
      const src = P(`        t {\n            id: integer primary key\n            ${c}\n        }`);
      expect([c, errsOf(src)]).toEqual([c, [UNSUP]]);
    }
  });
  test("valid defaults stay clean (NOT NULL DEFAULT NULL included, as SQLite admits it)", () => {
    expect(codesOf(P("        CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT DEFAULT 'x', b TEXT NOT NULL DEFAULT CURRENT_DATE, c INTEGER DEFAULT -1, d REAL DEFAULT 2, e REAL DEFAULT 2.5, f INTEGER NOT NULL DEFAULT NULL, g BLOB DEFAULT NULL)"))).toEqual([]);
  });
});

describe("#1925 review F3 / F4", () => {
  test("F3: `CREATE TABLE` text inside a string DEFAULT is refused (it is text in a string)", () => {
    const src = P("        CREATE TABLE t (id INTEGER PRIMARY KEY, x TEXT NOT NULL DEFAULT 'CREATE TABLE u (x INTEGER)')");
    expect(errsOf(src)).toEqual([UNSUP]);
    expect(msgOf(src, UNSUP)).toContain("outside a live declaration");
    // a `"create"` / `"table"` column NAME is not a string
    expect(codesOf(P(`        CREATE TABLE t (id INTEGER PRIMARY KEY, "create" TEXT, "table" TEXT)`))).toEqual([]);
  });
  test("F4: W-SCHEMA-001 for a raw table with no PRIMARY KEY (§38.5.1)", () => {
    expect(codesOf(P("        CREATE TABLE t (x TEXT)"))).toEqual(["W-SCHEMA-001"]);
    expect(codesOf(P("        CREATE TABLE t (x TEXT, PRIMARY KEY (x))"))).toEqual([]);
    expect(codesOf(P("        CREATE TABLE t (x TEXT PRIMARY KEY)"))).toEqual([]);
  });
});
