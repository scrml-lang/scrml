// sql-row-types-s478.test.js — s478-boot-sql-row-types: a `?{}` SELECT's value is typed from the
// `<schema>` (gap g-boot-sql-row-types-s478). Before this lane a query was VType.Unknown on the
// bootstrap, so `row.body` on an unannotated `.get()` / `.all()` result was refused by name
// ("member access `.body` on a value that is not a struct or an instance is not in bootstrap slice
// M2"). Every positive test below is RED on base for that reason.
//
// Governing SPEC sentences (quoted at analyze.scrml rowTypes / sql.scrml rowProjection):
//   §39.11  "The compiler generates struct types for each table in `<schema>` before running the
//           `<db>` type inference pass (§14.8)."
//   §14.8.7 "A `?{ SELECT id, email FROM users }` context produces a value whose type is a struct
//           containing only the selected columns … `.get()` produces `Row | not`, `.all()` (or a
//           bare `?{}`) produces `Row[]` (§8.3)"; "`SELECT *` over a single table expands to that
//           table's generated type".
//   §14.8.3 INTEGER / REAL → `number`, TEXT → `string`; "A `ColumnDef` with `nullable: true` SHALL
//           produce a field type of `T | not`" (a column without `not null`, §38.5.2; an
//           `integer primary key` is the rowid, §38.5.1).
//   §14.8.1 "The generated types are **nominal**".
//   §14.8.8 a projection row is width-subtype-assignable to a declared `:struct` contract (built for
//           the exact case only: no extra column — the §57 codec refuses an undeclared key).
//   §42.3.5 / §34 E-TYPE-046 — a member read on a receiver whose type admits `not` without
//           narrowing.
// Fails closed (a query stays untyped, its member reads refused by name): an alias, an expression,
// a JOIN, an unknown table, an undeclared column, a file with no `<schema>`.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { SQL } from "bun";
import { mods, compile, serve, post, pathOf } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

beforeAll(() => { mods(); }, { timeout: 120000 });

const SQ = "?" + "{";
const SCHEMA = `    <schema>
        notes {
            id: integer primary key
            body: text not null
            note: text
            score: real not null
        }
    </>`;
const P = (fns, schema = SCHEMA) => `<program db="./app.db">\n${schema}\n    \${\n${fns}\n    }\n    <p>x</p>\n</program>\n`;
const run = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const errs = (src) => run(src).diags.filter((d) => d.severity === "Error");
const codesOf = (src) => errs(src).map((d) => d.code);
const fn = (sig, body) => `        function ${sig} {\n${body.map((l) => "            " + l).join("\n")}\n        }`;
const getRow = (cols) => `const r = ${SQ}\`SELECT ${cols} FROM notes\`}.get() !{ _ :> not };`;
const UNTYPED = "member access `.";

describe("a `.get()` row is `Row | not` of the projected columns", () => {
  test("narrowed by an early return, its field reads clean", () => {
    expect(codesOf(P(fn("f() -> string", [getRow("id, body"), `if (r is not) return "none";`, "return r.body;"])))).toEqual([]);
  });
  test("narrowed by a ternary, its field reads clean", () => {
    expect(codesOf(P(fn("f() -> string", [getRow("id, body"), `return r is not ? "none" : r.body;`])))).toEqual([]);
  });
  test("an un-narrowed field read is E-TYPE-046 (§42.3.5)", () => {
    const es = errs(P(fn("f() -> string", [getRow("id, body"), "return r.body;"])));
    expect(es.map((d) => d.code)).toEqual(["E-TYPE-046"]);
    expect(es[0].message).toContain("§42.3.5");
  });
  test("a column not projected is not a field (the row is the projection, not the table)", () => {
    const es = errs(P(fn("f() -> string", [getRow("id, body"), `if (r is not) return "none";`, "return r.note;"])));
    expect(es.map((d) => d.code)).toEqual(["E-SCOPE-001"]);
    expect(es[0].message).toContain("has no field `note`");
  });
  test("`SELECT *` is the whole table: every column is a field", () => {
    expect(codesOf(P(fn("f() -> number", [getRow("*"), "if (r is not) return 0;", "return r.score;"])))).toEqual([]);
  });
});

describe("§14.8.3 field types", () => {
  test("a `text not null` column is `string`; used as `int` it is E-TYPE-031", () => {
    expect(codesOf(P(fn("f() -> int", [getRow("id, body"), "if (r is not) return 0;", "const n: int = r.body;", "return n;"])))).toEqual(["E-TYPE-031"]);
  });
  test("an `integer` column is `number`, not `int` (INTEGER → number)", () => {
    expect(codesOf(P(fn("f() -> int", [getRow("id"), "if (r is not) return 0;", "const n: int = r.id;", "return n;"])))).toEqual(["E-TYPE-031"]);
    expect(codesOf(P(fn("f() -> number", [getRow("id"), "if (r is not) return 0;", "const n: number = r.id;", "return n;"])))).toEqual([]);
  });
  test("a column without `not null` is `T | not`", () => {
    const es = errs(P(fn("f() -> string", [getRow("note"), `if (r is not) return "none";`, "const s: string = r.note;", "return s;"])));
    expect(es.map((d) => d.code)).toEqual(["E-TYPE-031"]);
    expect(es[0].message).toContain("string | not");
    expect(codesOf(P(fn("f() -> string", [getRow("note"), `if (r is not) return "none";`, `return r.note is not ? "-" : r.note;`])))).toEqual([]);
  });
});

describe("an `.all()` result is `Row[]`", () => {
  test("its length and its iterated rows read clean", () => {
    expect(codesOf(P(fn("f() -> int", [`const rs = ${SQ}\`SELECT id FROM notes\`}.all() !{ _ :> [] };`, "return rs.length;"])))).toEqual([]);
    expect(codesOf(P(fn("f() -> number", [`const rs = ${SQ}\`SELECT * FROM notes\`}.all() !{ _ :> [] };`, "let n: number = 0;", "for (const r of rs) { n = n + r.score; }", "return n;"])))).toEqual([]);
  });
});

describe("fails closed — the query stays untyped and a member read of it is refused by name", () => {
  const refused = (cols, from = "notes") => errs(P(fn("f() -> string", [`const r = ${SQ}\`SELECT ${cols} FROM ${from}\`}.get() !{ _ :> not };`, `if (r is not) return "none";`, "return r.body;"])));
  test("`*` on a table the `<schema>` does not declare", () => {
    const es = refused("*", "nope");
    expect(es.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(es[0].message).toContain(UNTYPED);
  });
  test("a column the table does not declare", () => {
    expect(refused("id, bogus").map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("an alias projection (`body AS b`) — not typed (INTERIM)", () => {
    const es = errs(P(fn("f() -> string", [getRow("body AS b"), `if (r is not) return "none";`, "return r.b;"])));
    expect(es.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(es[0].message).toContain(UNTYPED);
  });
  test("an expression, an aliased table, a JOIN", () => {
    expect(refused("upper(body) AS body").map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(refused("n.body", "notes n").map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(refused("body", "notes JOIN notes AS m ON m.id = notes.id").map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("a program with no `<schema>`", () => {
    expect(codesOf(P(fn("f() -> string", [getRow("id, body"), `if (r is not) return "none";`, "return r.body;"]), "")))
      .toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

describe("§14.8.8 — a row into a declared `:struct` (exact projection only)", () => {
  const T = "        type Note:struct = { id: number, body: string }\n";
  test("a row projecting exactly the struct's fields fits it", () => {
    expect(codesOf(P(T + fn("f() -> Note | not", [`return ${SQ}\`SELECT id, body FROM notes\`}.get() !{ _ :> not };`])))).toEqual([]);
    expect(codesOf(P(T + fn("f() -> Note[]", [`return ${SQ}\`SELECT body, id FROM notes\`}.all() !{ _ :> [] };`])))).toEqual([]);
  });
  test("a row with an extra column does not (the codec refuses an undeclared key) — named", () => {
    const es = errs(P(T + fn("f() -> Note[]", [`return ${SQ}\`SELECT id, body, score FROM notes\`}.all() !{ _ :> [] };`])));
    expect(es.map((d) => d.code)).toEqual(["E-TYPE-031"]);
    expect(es[0].message).toContain("g-boot-sql-row-width-extra-s478");
  });
  test("a nullable column does not fit a `string` field", () => {
    expect(codesOf(P("        type N:struct = { id: number, note: string }\n" + fn("f() -> N[]", [`return ${SQ}\`SELECT id, note FROM notes\`}.all() !{ _ :> [] };`]))))
      .toEqual(["E-TYPE-031"]);
  });
});

// ---- RUNTIME: the typed rows cross the server boundary (the §57 codec encodes against the row type)
const RT = `<program db="./app.db">
${SCHEMA}
    type Note:struct = { id: number, body: string }
    function firstBody() -> string {
        const r = ${SQ}\`SELECT id, body FROM notes ORDER BY id\`}.get() !{ _ :> not };
        if (r is not) return "none";
        return r.body;
    }
    function missing() -> string {
        const r = ${SQ}\`SELECT id, body FROM notes WHERE id = 99\`}.get() !{ _ :> not };
        return r is not ? "none" : r.body;
    }
    function count() -> int {
        const rs = ${SQ}\`SELECT id FROM notes\`}.all() !{ _ :> [] };
        return rs.length;
    }
    function scoreSum() -> number {
        const rs = ${SQ}\`SELECT * FROM notes\`}.all() !{ _ :> [] };
        let n: number = 0;
        for (const r of rs) { n = n + r.score; }
        return n;
    }
    function notes() -> Note[] {
        return ${SQ}\`SELECT id, body FROM notes ORDER BY id\`}.all() !{ _ :> [] };
    }
    function nullNote(id: int) -> string {
        const r = ${SQ}\`SELECT note FROM notes WHERE id = \${id}\`}.get() !{ _ :> not };
        if (r is not) return "none";
        return r.note is not ? "null" : r.note;
    }
    let <out:string=""/>
    let <cnt:int=0/>
    let <x:number=0/>
    <ns:Note[replace]=[]/>
    <button onclick={ @out = firstBody() !{ _ :> "err" }; }>a</button>
    <button onclick={ @out = missing() !{ _ :> "err" }; }>b</button>
    <button onclick={ @cnt = count() !{ _ :> 0 }; }>c</button>
    <button onclick={ @x = scoreSum() !{ _ :> 0 }; }>d</button>
    <button onclick={ @ns = notes() !{ _ :> [] }; }>e</button>
    <button onclick={ @out = nullNote(2) !{ _ :> "err" }; }>f</button>
    <p>\${@out} \${@cnt} \${@x} \${@ns.length}</p>
</program>
`;

describe("runtime (SQLite): the rows the compiler typed are the rows the server answers", () => {
  let dir, sql, srv, routes;
  const logs = [];
  const call = (f, args = []) => post(srv, pathOf(routes, f), args);
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "s478-sql-rows-"));
    sql = new SQL("sqlite://" + join(dir, "app.db"));
    await sql.unsafe("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL, note TEXT, score REAL NOT NULL)");
    await sql.unsafe("INSERT INTO notes (id, body, note, score) VALUES (1, 'a', 'n1', 1.5), (2, 'b', NULL, 2)");
    const r = compile(RT);
    ({ srv, routes } = await serve(r.core, sql, logs));
  }, 300000);
  afterAll(async () => {
    await sql.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("`.get()` → the first row's field; no row → `not`", async () => {
    expect((await call("firstBody")).json).toBe("a");
    expect((await call("missing")).json).toBe("none");
  });
  test("`.all()` → its length; iterated rows' fields", async () => {
    expect((await call("count")).json).toBe(2);
    expect((await call("scoreSum")).json).toBe(3.5);
  });
  test("rows returned as a declared struct tape cross the wire", async () => {
    expect((await call("notes")).json).toEqual([{ id: 1, body: "a" }, { id: 2, body: "b" }]);
  });
  test("a NULL in a nullable column is `not`; a present one reads its value", async () => {
    expect((await call("nullNote", [2])).json).toBe("null");
    expect((await call("nullNote", [1])).json).toBe("n1");
  });
});
