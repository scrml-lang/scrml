// schema-s479.test.js — s479-schema-rulings: three S479 rulings on the bootstrap.
//
// Ruling: scrml-support/user-voice-scrml.md "⭐ RULED — the rest of S478 hand-off §3.B, PA recs
// adopted (S479, 2026-11-18)":
//   item 3  — "§39.4 type names and §39.2 constraint words case-insensitive, lowercase canonical
//             (`id: INTEGER` accepted)". SPEC §39.2 "Type names and constraint words are
//             case-insensitive (S479)"; §39.4 "The type names are matched case-insensitively,
//             lowercase canonical". Newly-accepting (was E-SCHEMA-004 / refused by name).
//   item 4  — "mint E-SCHEMA-018, Error. §39.5 "Exactly one column per table MAY be designated
//             `primary key`." Capable alternative: table-level `PRIMARY KEY (a, b)` in raw DDL."
//             SPEC §38.5.1 "A table with more than one `primary key` SHALL be a compile error
//             (E-SCHEMA-018)". Inert on the bootstrap (refused by name before).
//   item 15 — "add `db` to §4.15's reserved names (E-NAME-COLLIDES-RESERVED), following S478's
//             `schema`". Newly-rejecting for a user declaration named `db`.
// Every test in this file is red on base (origin/main 0a06d99d2) unless marked "(unchanged)".

import { describe, test, expect, beforeAll } from "bun:test";
import { mods, compile } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

beforeAll(() => { mods(); }, { timeout: 120000 });

const run = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const codesOf = (src) => run(src).diags.map((d) => d.code);
const errsOf = (src) => run(src).diags.filter((d) => d.severity === "Error").map((d) => d.code);
const msgOf = (src, code) => (run(src).diags.find((d) => d.code === code) || { message: "" }).message;
const P = (body, rest = "    <p>hi</p>") => `<program db="./app.db">\n    <schema>\n${body}\n    </>\n${rest}\n</program>\n`;
const SQ = "?" + "{";

describe("S479 item 3 — §39.4 type names and §39.2 constraint words are case-insensitive", () => {
  test("`id: INTEGER` (the gap's repro) compiles clean", () => {
    expect(codesOf(P("        users {\n            id: INTEGER primary key\n        }"))).toEqual([]);
  });
  test("uppercase and mixed-case types and constraint words compile clean, as the lowercase form does", () => {
    const upper = "        users {\n            id: INTEGER PRIMARY KEY\n            email: TEXT NOT NULL UNIQUE\n            score: Real Default(0)\n            at: TIMESTAMP DEFAULT(CURRENT_TIMESTAMP)\n            pic: Blob\n        }\n        posts {\n            id: Integer Primary Key\n            uid: integer REFERENCES users(id)\n        }";
    expect(codesOf(P(upper))).toEqual([]);
    const lower = upper.toLowerCase().replace("current_timestamp", "CURRENT_TIMESTAMP");
    expect(codesOf(P(lower))).toEqual([]);
  });
  test("the uppercase key is still the table's key (no W-SCHEMA-001), and an uppercase NOT NULL is read", () => {
    expect(codesOf(P("        t {\n            id: INTEGER PRIMARY KEY\n            v: TEXT NOT NULL\n        }"))).not.toContain("W-SCHEMA-001");
  });
  test("an uppercase column type still types its rows (the canonical lowercase type is kept)", () => {
    const src = P("        notes {\n            id: INTEGER PRIMARY KEY\n            body: TEXT NOT NULL\n        }",
      `    \${\n        function f() -> string {\n            const r = ${SQ}\`SELECT body FROM notes\`}.get() !{ _ :> not };\n            if (r is not) return "";\n            return r.body;\n        }\n    }\n    <p>x</p>`);
    expect(errsOf(src)).toEqual([]);
  });
  test("an uppercase `BOOLEAN` is the `boolean` column — refused by name as before (coercion not built)", () => {
    const src = P("        t {\n            id: integer primary key\n            on: BOOLEAN\n        }");
    expect(errsOf(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(msgOf(src, "E-BOOTSTRAP-UNSUPPORTED")).toContain("coercion");
  });
  test("an unknown type is still E-SCHEMA-004 in any case, naming the type as written (unchanged)", () => {
    const src = P("        t {\n            id: integer primary key\n            n: STRING\n        }");
    expect(errsOf(src)).toEqual(["E-SCHEMA-004"]);
    expect(msgOf(src, "E-SCHEMA-004")).toContain("`STRING`");
    expect(errsOf(P("        t {\n            id: integer primary key\n            n: string\n        }"))).toEqual(["E-SCHEMA-004"]);
  });
  test("an uppercase `RENAME FROM` is the §38.5.6 form — refused by name as the lowercase one is", () => {
    const src = P("        t {\n            id: integer primary key\n            n: text RENAME FROM m\n        }");
    expect(msgOf(src, "E-BOOTSTRAP-UNSUPPORTED")).toContain("rename from");
  });
});

describe("S479 item 4 — a table with more than one `primary key` is E-SCHEMA-018 (§38.5.1)", () => {
  test("two declarative columns marked `primary key` (was refused by name)", () => {
    const src = P("        t {\n            id: integer primary key\n            k: integer primary key\n        }");
    expect(errsOf(src)).toEqual(["E-SCHEMA-018"]);
    expect(msgOf(src, "E-SCHEMA-018")).toContain("PRIMARY KEY (a, b)");
  });
  test("one declarative column marked twice — one report", () => {
    expect(errsOf(P("        t {\n            id: integer primary key primary key\n        }"))).toEqual(["E-SCHEMA-018"]);
  });
  test("raw DDL: two column-level keys; a column-level key beside a table-level one; two table-level ones; one column marked twice", () => {
    expect(errsOf(P("        CREATE TABLE t (id INTEGER PRIMARY KEY, k TEXT PRIMARY KEY)"))).toEqual(["E-SCHEMA-018"]);
    expect(errsOf(P("        CREATE TABLE t (id INTEGER PRIMARY KEY, k TEXT, PRIMARY KEY (k))"))).toEqual(["E-SCHEMA-018"]);
    expect(errsOf(P("        CREATE TABLE t (id INTEGER, k TEXT, PRIMARY KEY (id), PRIMARY KEY (k))"))).toEqual(["E-SCHEMA-018"]);
    expect(errsOf(P("        CREATE TABLE t (id INTEGER PRIMARY KEY PRIMARY KEY)"))).toEqual(["E-SCHEMA-018"]);
  });
  test("the capable alternative: a composite table-level `PRIMARY KEY (a, b)` in raw DDL compiles clean (unchanged — the raw-DDL reader already reads it)", () => {
    expect(codesOf(P("        CREATE TABLE memberships (user_id INTEGER NOT NULL, team_id INTEGER NOT NULL, role TEXT, PRIMARY KEY (user_id, team_id))"))).toEqual([]);
    expect(codesOf(P("        CREATE TABLE m (a INTEGER, b TEXT, PRIMARY KEY (a, b)) WITHOUT ROWID"))).toEqual([]);
  });
  test("E-SCHEMA-018 is an Error (the program does not compile)", () => {
    const d = run(P("        t {\n            id: integer primary key\n            k: integer primary key\n        }")).diags.find((x) => x.code === "E-SCHEMA-018");
    expect(d.severity).toBe("Error");
  });
});

describe("S479 item 15 — `db` is a reserved name (§4.15, E-NAME-COLLIDES-RESERVED)", () => {
  // The gap's repro (g-bootstrap-user-db-decl-takes-db-body-mode-s472): `<db label:string/> renders …`
  // took the `<db>` ITEM body by name; free text in its use was E-UNQUOTED-DISPLAY-TEXT.
  const DECL = `<db label:string="x"/>\nrenders <p id="z">COMP \${label}</p>\n`;
  test("a user declaration named `db` is E-NAME-COLLIDES-RESERVED, at the declaration", () => {
    const src = `${DECL}<program>\n<main><p>x</p></main>\n</program>\n`;
    expect(errsOf(src)).toEqual(["E-NAME-COLLIDES-RESERVED"]);
    expect(run(src).diags.find((d) => d.code === "E-NAME-COLLIDES-RESERVED").span.start).toBe(0);
    expect(msgOf(src, "E-NAME-COLLIDES-RESERVED")).toContain("`db`");
  });
  test("compared lowercase (§24.4): `<Db …>` and `<DB …>` are reserved too", () => {
    expect(errsOf(`<Db label:string="x"/>\nrenders <p>\${label}</p>\n<program>\n<p>x</p>\n</program>\n`)).toEqual(["E-NAME-COLLIDES-RESERVED"]);
    expect(errsOf(`<DB label:string="x"/>\nrenders <p>\${label}</p>\n<program>\n<p>x</p>\n</program>\n`)).toEqual(["E-NAME-COLLIDES-RESERVED"]);
  });
  test("a `<db src=>` beside such a declaration is still the §4 state block: its function is the program's server function", () => {
    const src = `${DECL}<program>\n    <db src="./app.db">\n        function count() -> int {\n            const r = ${SQ}\`SELECT 1 AS n\`}.get() !{ _ :> { return -1; } };\n            if (r is not) return 0;\n            return 1;\n        }\n    </db>\n    <main><p>x</p></main>\n</program>\n`;
    const es = errsOf(src);
    expect(es).toContain("E-NAME-COLLIDES-RESERVED");
    expect(es).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a CELL named `db` (`@db`) is not a declaration a tag names (unchanged)", () => {
    expect(errsOf(`<program>\n let <db:int=3/>\n<p id="z">\${@db}</p>\n</program>\n`)).toEqual([]);
  });
  test("a `<db src=>` with no user declaration compiles as before (unchanged)", () => {
    expect(errsOf(`<program>\n    <db src="./app.db">\n    </db>\n    <main><p>x</p></main>\n</program>\n`)).toEqual([]);
  });
});
