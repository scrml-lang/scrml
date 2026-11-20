// schema-s478.test.js — s478-boot-schema: the `<schema>` block (SPEC §39) on the bootstrap.
//
// Before this lane every `<schema>` was refused by name ("`<schema>` is a scrml structural
// element (§39.2) … not in the bootstrap") — the first refusal of 97 conformance cases. Now the
// parser reads its body as §39.2 declarations (schema.scrml) and analyze judges where it stands.
//
// Governing SPEC sentences (quoted in schema.scrml / parse.scrml finishSchema / analyze.scrml
// resolveSchema):
//   §39.2  schema-block ::= '<schema>' table-declaration* closer …
//   §39.3  "A `<schema>` block in a `<program>` with neither SHALL be a compile error (E-SCHEMA-001)";
//          "A second `<schema>` block in the same file SHALL be a compile error (E-SCHEMA-002)";
//          "A `<schema>` block nested inside any other block … SHALL be a compile error (E-SCHEMA-003)";
//          "The `<schema>` block takes no attributes."
//   §39.4  "An unrecognized column type name SHALL be a compile error (E-SCHEMA-004)."
//   §38.5.1 "A `<schema>` table declaration with no `primary key` column SHALL generate a compile
//          warning (W-SCHEMA-001)."
//   §39.5.5 references targets (E-SCHEMA-006) and the only FK production (E-SCHEMA-011).
//   §39.7  "validate the `<schema>` block against itself … no duplicate column names within a
//          table, no duplicate table names" — S478 open-Qs ruling item 18: a table declared twice is
//          E-SCHEMA-016, a column declared twice in one table E-SCHEMA-017.
//   §39.2  (S478 open-Qs ruling item 17) "An optional `,` between column declarations".
//   §4.15  (S478 open-Qs ruling item 19) `schema` is a reserved structural-element name.
//   §8.1.1 Ownership: a `<schema>` block makes its file the database's owner.
// Everything whose meaning lives in a consumer the bootstrap does not build is refused by name.

import { describe, test, expect, beforeAll } from "bun:test";
import { mods, compile, codes, artifacts } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

beforeAll(() => { mods(); }, { timeout: 120000 });

const run = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const errsOf = (src) => run(src).diags.filter((d) => d.severity === "Error").map((d) => d.code);
const msgOf = (src, code) => (run(src).diags.find((d) => d.code === code) || { message: "" }).message;
const P = (body, attrs = ' db="./app.db"', rest = "    <p>hi</p>") => `<program${attrs}>\n    <schema>\n${body}\n    </>\n${rest}\n</program>\n`;
const USERS = "        users {\n            id: integer primary key\n            email: text not null unique\n            name: text not null\n        }";

describe("a §39.2 `<schema>` compiles: declares structure, renders nothing, owns its database", () => {
  test("the clean worked shape compiles with no diagnostic", () => {
    const r = run(P(USERS));
    expect(r.diags.map((d) => d.code)).toEqual([]);
  });

  test("its body is not page text (it renders nothing)", () => {
    const r = compile(P(USERS));
    const { client } = artifacts(r.core);
    expect(client.js || client).not.toContain("primary key");
  });

  test("every §39.2 constraint reads; `//` comments are comments; `</schema>` closes it", () => {
    const body = [
      "        // the users",
      "        users {",
      "            id: integer primary key   // the key",
      "            email: text not null unique",
      "            created_at: timestamp default(CURRENT_TIMESTAMP)",
      "            note: text default('http://x // not a comment')",
      "            score: real default(0)",
      "            avatar: blob",
      "        }",
      "        posts { id: integer primary key",
      "                user_id: integer not null references users(id) }",
    ].join("\n");
    const src = `<program db="./app.db">\n    <schema>\n${body}\n    </schema>\n    <p>hi</p>\n</program>\n`;
    expect(run(src).diags.map((d) => d.code)).toEqual([]);
  });

  test("§8.1.1 Ownership: the program's database is OWNED (a `<schema>` declares for it)", () => {
    const r = compile(`<program db="./app.db">\n    <schema>\n${USERS}\n    </>\n    \${ function n() -> int { const c: C = ?{\`SELECT COUNT(*) AS n FROM users\`}.get() !{ _ :> { return 0; } }; return c.n; } }\n    \${ type C:struct = { n: int } }\n    <p>hi</p>\n</program>\n`);
    expect(r.core.dbs.length).toBe(1);
    expect(r.core.dbs[0].owner).toBe(true);
  });

  test("a direct-child `<db src=>` supplies the program's database (§39.3, §8.1.1 S451)", () => {
    const src = `<program>\n    <schema>\n${USERS}\n    </>\n    <db src="./app.db">\n        <p>x</p>\n    </db>\n</program>\n`;
    expect(errsOf(src)).toEqual([]);
  });
});

describe("§39.3 placement, database and count", () => {
  test("E-SCHEMA-001: a `<program>` with no database", () => {
    expect(errsOf(P(USERS, ""))).toEqual(["E-SCHEMA-001"]);
  });

  test("E-SCHEMA-002: a second `<schema>` in the file", () => {
    const src = `<program db="./app.db">\n    <schema>\n${USERS}\n    </>\n    <schema>\n        posts { id: integer primary key }\n    </>\n</program>\n`;
    expect(errsOf(src)).toEqual(["E-SCHEMA-002"]);
  });

  test("E-SCHEMA-003: inside an element, a `<db>`, a `<page>`", () => {
    expect(errsOf(`<program db="./app.db">\n    <div>\n        <schema>\n${USERS}\n        </>\n    </div>\n</program>\n`)).toEqual(["E-SCHEMA-003"]);
    expect(errsOf(`<program>\n    <db src="./app.db">\n        <schema>\n${USERS}\n        </>\n    </db>\n</program>\n`)).toEqual(["E-SCHEMA-003"]);
    expect(errsOf(`<program db="./app.db">\n    <page route="/">\n        <schema>\n${USERS}\n        </>\n    </page>\n</program>\n`)).toContain("E-SCHEMA-003");
  });

  test("an attribute on `<schema>` is refused by name (§39.3 \"takes no attributes\")", () => {
    const src = `<program db="./app.db">\n    <schema db="./b.db">\n${USERS}\n    </>\n</program>\n`;
    expect(errsOf(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(msgOf(src, "E-BOOTSTRAP-UNSUPPORTED")).toContain("takes no attributes");
  });
});

describe("§39.4 / §39.5 / §39.7 declaration checks", () => {
  test("E-SCHEMA-004: an unrecognized column type (no other names are valid)", () => {
    expect(errsOf(P("        users {\n            id: integer primary key\n            name: string\n        }"))).toEqual(["E-SCHEMA-004"]);
    // S479 ruling item 3: type names are case-insensitive — `id: INTEGER` is accepted (schema-s479.test.js)
    expect(errsOf(P("        users {\n            id: INTEGER primary key\n        }"))).toEqual([]);
  });

  test("W-SCHEMA-001: a table with no primary key is a WARNING (compiles)", () => {
    const r = run(P("        logs {\n            message: text not null\n        }"));
    expect(r.diags.map((d) => [d.code, d.severity])).toEqual([["W-SCHEMA-001", "Warning"]]);
  });

  test("E-SCHEMA-006: references a declared table's missing column", () => {
    expect(errsOf(P(USERS + "\n        posts {\n            id: integer primary key\n            uid: integer references users(uid)\n        }"))).toEqual(["E-SCHEMA-006"]);
  });

  test("E-SCHEMA-011: every other `references` shape", () => {
    for (const bad of ["references(users.id)", "references users (id)", "references users.id", "references users"]) {
      expect(errsOf(P(USERS + `\n        posts {\n            id: integer primary key\n            uid: integer ${bad}\n        }`))).toEqual(["E-SCHEMA-011"]);
    }
  });

  test("E-SCHEMA-012 / E-SCHEMA-013: a declarative head read whole", () => {
    expect(errsOf(P("        main.assets {\n            id: integer primary key\n        }"))).toEqual(["E-SCHEMA-012"]);
    expect(errsOf(P("        my-assets {\n            id: integer primary key\n        }"))).toEqual(["E-SCHEMA-013"]);
    expect(errsOf(P("        1assets {\n            id: integer primary key\n        }"))).toEqual(["E-SCHEMA-013"]);
    expect(errsOf(P("        données {\n            id: integer primary key\n        }"))).toEqual(["E-SCHEMA-013"]);
  });

  test("S478 ruling 18 — a table declared twice is E-SCHEMA-016, a column declared twice E-SCHEMA-017 (§39.7)", () => {
    const dupT = P(USERS + "\n        Users {\n            id: integer primary key\n        }");
    expect(errsOf(dupT)).toEqual(["E-SCHEMA-016"]);
    expect(msgOf(dupT, "E-SCHEMA-016")).toContain("twice");
    const dupC = P("        users {\n            id: integer primary key\n            ID: text\n        }");
    expect(errsOf(dupC)).toEqual(["E-SCHEMA-017"]);
    expect(errsOf(P("        CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT, A TEXT)"))).toEqual(["E-SCHEMA-017"]);
  });

  test("S479 ruling item 4 — a second `primary key` in one table is E-SCHEMA-018 (was refused by name while S478 left it OPEN)", () => {
    expect(errsOf(P("        t {\n            id: integer primary key\n            k: integer primary key\n        }"))).toEqual(["E-SCHEMA-018"]);
  });

  test("S478 ruling 17 — one `,` between column declarations (§39.2 `column-declaration (','? column-declaration)*`)", () => {
    expect(run(P("        t { id: integer primary key, done: integer not null }")).diags.map((d) => d.code)).toEqual([]);
    expect(run(P("        t {\n            id: integer primary key,\n            done: integer not null,\n            x: text default('a,b')\n        }")).diags.map((d) => d.code)).toEqual([]);
    // the same table with and without the `,`: one more column is never dropped
    expect(errsOf(P("        t { id: integer primary key, id: integer }"))).toEqual(["E-SCHEMA-017"]);
  });

  test("S478 ruling 17 — a `,` before `}` or a doubled `,` is outside the grammar (refused by name)", () => {
    const trail = P("        t { id: integer primary key, done: integer, }");
    expect(errsOf(trail)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(msgOf(trail, "E-BOOTSTRAP-UNSUPPORTED")).toContain("BETWEEN two column declarations");
    expect(errsOf(P("        t { id: integer primary key,, done: integer }"))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("W-SCHEMA-NO-TABLES-DECLARED: content that declares no table (alongside its refusal)", () => {
    const c = run(P("        users: { id: integer, name: text }")).diags.map((d) => d.code);
    expect(c).toContain("W-SCHEMA-NO-TABLES-DECLARED");
    expect(c).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });

  test("an empty `<schema>` (no content) is legal and silent", () => {
    expect(run(`<program db="./app.db">\n    <schema>\n        // nothing yet\n    </>\n</program>\n`).diags.map((d) => d.code)).toEqual([]);
  });
});

describe("refused by name — never read past silently", () => {
  const refused = (body, needle) => {
    const src = P(body);
    expect(errsOf(src)).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(msgOf(src, "E-BOOTSTRAP-UNSUPPORTED")).toContain(needle);
  };
  test("a `tenant_id` column (§14.8.10 floor not built)", () => refused("        assets {\n            id: integer primary key\n            tenant_id: text\n        }", "tenant"));
  test("a `boolean` column (§39.4 coercion not built)", () => refused("        flags {\n            id: integer primary key\n            on: boolean\n        }", "coercion"));
  test("raw DDL beyond `CREATE TABLE` (s478-boot-schema-ddl reads a plain CREATE TABLE — schema-ddl-s478.test.js)", () => {
    refused("        CREATE VIEW v AS SELECT 1", "not a `CREATE TABLE`");
    refused("        ?{`ALTER TABLE users ADD COLUMN x TEXT`}", "not a `CREATE TABLE`");
    // §39.2: the floors read a commented-out `CREATE TABLE` as a declaration
    refused(USERS + "\n        // CREATE TABLE assets (id INTEGER, tenant_id TEXT)", "commented-out one included");
  });
  test("shared-core vocabulary, `rename from`, `immutable`", () => {
    refused("        users {\n            id: integer primary key\n            name: text req\n        }", "shared-core");
    refused("        users {\n            id: integer primary key\n            name: text rename from nm\n        }", "rename from");
    refused("        users {\n            id: integer primary key\n            name: text immutable\n        }", "db-authoritative");
  });
  test("a `references` target the schema does not declare (the database is not read)", () => refused("        posts {\n            id: integer primary key\n            uid: integer references users(id)\n        }", "does not read"));
  test("`db-authoritative`, a SECURITY-DEFINER `fn`, a `${}` body", () => {
    refused(USERS + " db-authoritative", "db-authoritative");
    refused("        fn f() { }", "SECURITY-DEFINER");
    refused("        ${ schemaFor(User) }", "schemaFor");
  });
  test("an unknown constraint word", () => refused("        users {\n            id: integer primary key\n            name: text indexed\n        }", "not a §39.2 column constraint"));
});

// s478 fix round 1 (review of #1908).
describe("S478 ruling 19 — `schema` is a reserved structural-element name (§4.15, E-NAME-COLLIDES-RESERVED)", () => {
  // Base (before s478-boot-schema) rendered "COMP x"; the lane's first head read the use as an empty
  // §39 block and rendered NOTHING, clean (#1908 F1); fix-1 refused both by name. S478 open-Qs ruling
  // item 19: "add `schema` to §4.15's reserved list (`E-NAME-COLLIDES-RESERVED`, compared lowercase
  // per §24.4)" — the declaration is the error, and a use names the structural element.
  const DECL = `<schema label:string="x"/>\nrenders <p id="z">COMP \${label}</p>\n`;
  const cases = {
    "user-comp-schema-top": `${DECL}<program db="./app.db">\n<schema/>\n<p>x</p>\n</program>\n`,
    "user-comp-schema-top-db-noattr": `${DECL}<program db="./app.db">\n<schema/>\n</program>\n`,
    "user-comp-schema-db": `${DECL}<program db="./app.db">\n<main><schema label="y"/></main>\n</program>\n`,
    "user-comp-schema-nodb": `${DECL}<program>\n<main><schema label="y"/></main>\n</program>\n`,
  };
  for (const [name, src] of Object.entries(cases)) {
    test(name, () => {
      const r = run(src);
      expect(errsOf(src)).toContain("E-NAME-COLLIDES-RESERVED");
      expect(r.diags.find((d) => d.code === "E-NAME-COLLIDES-RESERVED").span.start).toBe(0);
    });
  }
  test("compared lowercase (§24.4): `<Schema …>` is reserved too", () => {
    expect(errsOf(`<Schema label:string="x"/>\nrenders <p>\${label}</p>\n<program>\n<p>x</p>\n</program>\n`)).toEqual(["E-NAME-COLLIDES-RESERVED"]);
  });
  test("a CELL named `schema` (`@schema`) is reserved too since S480 (reserved-cells-s480.test.js)", () => {
    // was "unchanged": compiled clean until ruling:user-voice-scrml.md-S480-census-recs item 9.
    expect(errsOf(`<program db="./app.db">\n let <schema:int=3/>\n<p id="z">\${@schema}</p>\n</program>\n`)).toEqual(["E-NAME-COLLIDES-RESERVED"]);
  });
});

describe("fix-1: `default(…)` holds a literal, never code (F2, §38.5.4)", () => {
  const col = (d) => P(`        users {\n            id: integer primary key\n            n: text default(${d})\n        }`);
  test("a `${…}` or `?{…}` inside `default(…)` is refused by name", () => {
    for (const d of ["${@k = 5}", "?{`DROP TABLE users`}", "'${x}'"]) {
      const src = col(d);
      expect(errsOf(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(msgOf(src, "E-BOOTSTRAP-UNSUPPORTED")).toContain("scrml code");
    }
  });
  test("an identifier, a call, a bare expression or a double-quoted string is refused by name", () => {
    for (const d of ["foo", "datetime('now')", "1+2", "\"x\"", "'a' 'b'", "-'a'", "X'zz'"]) {
      const src = col(d);
      expect(errsOf(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(msgOf(src, "E-BOOTSTRAP-UNSUPPORTED")).toContain("not a literal the bootstrap admits");
    }
  });
  test("the literal shapes compile on a column whose type holds them", () => {
    const colT = (ty, d) => P(`        users {\n            id: integer primary key\n            n: ${ty} not null default(${d})\n        }`);
    const ok = { text: ["CURRENT_TIMESTAMP", "current_date", "CURRENT_TIME", "''", "'it''s (a) ) test'", "NULL"], timestamp: ["CURRENT_TIMESTAMP", "'2026-01-01'"], integer: ["0", "+2", "-3", "NULL"], real: ["0", "-1.5", "1e3", "NULL"] };
    for (const [ty, ds] of Object.entries(ok)) {
      for (const d of ds) expect([ty, d, errsOf(colT(ty, d))]).toEqual([ty, d, []]);
    }
  });
});

describe("S478 #1925 review F1: a `default(…)` literal's kind must fit its column's type", () => {
  const colT = (ty, d) => P(`        users {\n            id: integer primary key\n            n: ${ty} not null default(${d})\n        }`);
  test("a string / CURRENT_* on a number column, a number on a text column, a real on an integer column — refused by name", () => {
    const bad = { integer: ["CURRENT_TIMESTAMP", "'abc'", "1.5", "1e3", "current_date"], real: ["'1.5'", "CURRENT_TIME"], text: ["0", "-1.5"], timestamp: ["0"], blob: ["0", "''"] };
    for (const [ty, ds] of Object.entries(bad)) {
      for (const d of ds) {
        const src = colT(ty, d);
        expect([ty, d, errsOf(src)]).toEqual([ty, d, ["E-BOOTSTRAP-UNSUPPORTED"]]);
        expect(msgOf(src, "E-BOOTSTRAP-UNSUPPORTED")).toContain("which the column's row type does not hold");
      }
    }
  });
  test("a boolean, a blob or a parenthesized expression is refused as a default", () => {
    for (const [ty, d] of [["integer", "TRUE"], ["integer", "false"], ["blob", "X'00ff'"], ["integer", "(1+2)"], ["integer", "((0))"], ["text", "('a)')"], ["integer", "(-(1) * 2 || 'x')"]]) {
      const src = colT(ty, d);
      expect([ty, d, errsOf(src)]).toEqual([ty, d, ["E-BOOTSTRAP-UNSUPPORTED"]]);
      expect(msgOf(src, "E-BOOTSTRAP-UNSUPPORTED")).toContain("which the column's row type does not hold");
    }
  });
});

describe("fix-1: the closer is found outside comments and literals (F3)", () => {
  test("`</>` in a `//` comment or a `default('…')` literal is text", () => {
    expect(run(P("        // end </>\n" + USERS)).diags.map((d) => d.code)).toEqual([]);
    expect(run(P("        users {\n            id: integer primary key\n            n: text default('</>')\n        }")).diags.map((d) => d.code)).toEqual([]);
    expect(run(P("        users {\n            id: integer primary key // </schema>\n            name: text\n        }")).diags.map((d) => d.code)).toEqual([]);
  });
  test("a `tenant_id` after a commented `</>` is still read (refused), not left as page text", () => {
    const src = P("        users {\n            id: integer primary key // </>\n            tenant_id: text\n        }");
    expect(errsOf(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(msgOf(src, "E-BOOTSTRAP-UNSUPPORTED")).toContain("tenant");
  });
  test("an unterminated `<schema>` is not rescued by a commented `</>` (E-PARSE-UNCLOSED)", () => {
    const src = `<program db="./app.db">\n<schema>\n        users {\n            id: integer primary key\n        }\n  // </>\n<p>x</p>\n</program>\n`;
    expect(errsOf(src)).toContain("E-PARSE-UNCLOSED");
  });
});

describe("fix-1: a refusal does not cascade into W-SCHEMA-001 / E-SCHEMA-006 (F5)", () => {
  test("a trailing `, ` after a `primary key` column keeps the key (no W-SCHEMA-001 cascade)", () => {
    expect(run(P("        t { id: integer primary key, }")).diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  // S479 ruling item 3: `PRIMARY KEY` is now read (constraint words are case-insensitive) — the
  // pin moved to a key the reader never reaches (an unread word before it)
  test("an unread `primary key` (after a refused word) does not also warn W-SCHEMA-001", () => {
    expect(run(P("        users {\n            id: integer indexed primary key\n        }")).diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(run(P("        users {\n            id: integer PRIMARY KEY\n        }")).diags.map((d) => d.code)).toEqual([]);
  });
  test("a column kept after its give-up is still a `references` target", () => {
    const src = P("        users {\n            id: integer primary key indexed\n        }\n        posts {\n            id: integer primary key\n            uid: integer references users(id)\n        }");
    expect(errsOf(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

describe("fix-1: a qualified head with whitespace or comments around the `.` is E-SCHEMA-012 (F6, §39.2)", () => {
  test("`db . users {`, `db .users {`, `db. users {`, `a /* c */ . b {`", () => {
    for (const h of ["db . users", "db .users", "db. users", "a /* c */ . b", "x . y . z"]) {
      expect([h, errsOf(P(`        ${h} {\n            id: integer primary key\n        }`))]).toEqual([h, ["E-SCHEMA-012"]]);
    }
  });
});
