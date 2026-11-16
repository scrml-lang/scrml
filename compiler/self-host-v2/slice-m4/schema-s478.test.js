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
//          table, no duplicate table names" (no §34 code — refused by name, owner question).
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
    expect(errsOf(P("        users {\n            id: INTEGER primary key\n        }"))).toEqual(["E-SCHEMA-004"]);
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

  test("duplicate tables / columns (§39.7) are refused by name — no §34 code exists", () => {
    const dupT = P(USERS + "\n        Users {\n            id: integer primary key\n        }");
    expect(errsOf(dupT)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(msgOf(dupT, "E-BOOTSTRAP-UNSUPPORTED")).toContain("twice");
    const dupC = P("        users {\n            id: integer primary key\n            ID: text\n        }");
    expect(errsOf(dupC)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
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
  test("raw `CREATE TABLE` DDL, bare or `?{}`-wrapped", () => {
    refused("        CREATE TABLE users (id INTEGER PRIMARY KEY)", "raw SQL DDL");
    refused("        ?{`CREATE TABLE users (id INTEGER PRIMARY KEY)`}", "raw SQL DDL");
    // §39.2: the floors read a commented-out `CREATE TABLE` as a declaration
    refused(USERS + "\n        // CREATE TABLE assets (id INTEGER, tenant_id TEXT)", "commented-out one included");
  });
  test("a `,` between columns (owner question)", () => refused("        tasks { id: integer primary key, done: integer }", "g-boot-schema-column-comma-s478"));
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
