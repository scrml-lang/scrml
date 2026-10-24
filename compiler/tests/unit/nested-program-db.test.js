/**
 * Nested <program db="..."> — Scoped DB Context (§4.12.6)
 *
 * Tests:
 *   §A  rewriteSqlRefs accepts dbVar parameter (Bun.SQL form per §44)
 *   §B  emitLogicNode SQL uses scoped dbVar from opts
 *   §C  emitLogicNode transaction-block uses scoped dbVar
 *   §D  Default dbVar is _scrml_sql (Bun.SQL — §44 / Phase 1)
 *
 * Phase 1 §44 update: dbVar default is `_scrml_sql` (was `_scrml_db`).
 * Scoped variants are `_scrml_sql_<n>` (was `_scrml_db_<n>`).
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { rewriteSqlRefs } from "../../src/codegen/rewrite.ts";
import { emitLogicNode } from "../../src/codegen/emit-logic.ts";
import { setFileSqlFallback } from "../../src/codegen/sql-handle-name.ts";

// S469 (s469-hook-flakes): this file calls the codegen emitters (emitLogicNode / rewriteSqlRefs /
// rewriteServerExpr) DIRECTLY, without the per-file codegen entry, so a `?{}` lowered with no
// `dbVar` reads the module-level fallback handle (`sql-handle-name.ts` `fallbackSqlHandle()`).
// That fallback is whatever the LAST compile in this process left: after any test file that
// compiled a two-database program it is `_scrml_sql_UNRESOLVED`, so these tests failed only when
// a hook shard happened to run such a file first. Pin the single-database default per test.
beforeEach(() => setFileSqlFallback(1));

describe("§A rewriteSqlRefs with dbVar parameter (§4.12.6)", () => {
  test("default dbVar produces _scrml_sql tagged template", () => {
    const result = rewriteSqlRefs("?{`SELECT * FROM users`}.all()");
    expect(result).toContain("_scrml_sql`");
    expect(result.startsWith("await ")).toBe(true);
  });

  test("custom dbVar produces scoped variable", () => {
    const result = rewriteSqlRefs("?{`SELECT * FROM metrics`}.all()", "_scrml_sql_1");
    expect(result).toContain("_scrml_sql_1`");
    // Default `_scrml_sql` (without suffix) must NOT appear when scoped is used.
    expect(result).not.toMatch(/\b_scrml_sql`/);
  });

  test("custom dbVar with .prepare() still emits E-SQL-006 (§44.3)", () => {
    const result = rewriteSqlRefs("?{`INSERT INTO logs (msg) VALUES (?1)`}.prepare()", "_scrml_sql_2");
    // §44.3: .prepare() is removed regardless of which scoped sql var.
    expect(result).toContain("E-SQL-006");
  });
});

describe("§B emitLogicNode SQL with scoped dbVar (§4.12.6)", () => {
  test("sql node uses default _scrml_sql", () => {
    const node = {
      kind: "sql",
      query: "SELECT * FROM users",
      chainedCalls: [{ method: "all" }],
      span: { file: "test.scrml", start: 0, end: 20, line: 1, col: 1 },
    };
    const result = emitLogicNode(node);
    expect(result).toContain("_scrml_sql`");
  });

  test("sql node uses scoped dbVar from opts", () => {
    const node = {
      kind: "sql",
      query: "SELECT * FROM metrics",
      chainedCalls: [{ method: "all" }],
      span: { file: "test.scrml", start: 0, end: 20, line: 1, col: 1 },
    };
    const result = emitLogicNode(node, { dbVar: "_scrml_sql_1" });
    expect(result).toContain("_scrml_sql_1`");
    expect(result).not.toMatch(/\b_scrml_sql`/);
  });

  test("sql node inherits _dbVar annotation from node", () => {
    const node = {
      kind: "sql",
      query: "SELECT * FROM events",
      chainedCalls: [{ method: "first" }],
      span: { file: "test.scrml", start: 0, end: 20, line: 1, col: 1 },
      _dbVar: "_scrml_sql_3",
    };
    const result = emitLogicNode(node);
    expect(result).toContain("_scrml_sql_3`");
  });
});

describe("§C transaction-block with scoped dbVar (§4.12.6)", () => {
  test("transaction uses scoped dbVar for BEGIN/COMMIT/ROLLBACK via sql.unsafe()", () => {
    const node = {
      kind: "transaction-block",
      body: [],
      span: { file: "test.scrml", start: 0, end: 20, line: 1, col: 1 },
    };
    const result = emitLogicNode(node, { dbVar: "_scrml_sql_2" });
    // §44.6: BEGIN/COMMIT/ROLLBACK go through sql.unsafe() on the same connection.
    expect(result).toContain('await _scrml_sql_2.unsafe("BEGIN")');
    expect(result).toContain('await _scrml_sql_2.unsafe("COMMIT")');
    expect(result).toContain('await _scrml_sql_2.unsafe("ROLLBACK")');
    // Default `_scrml_sql` (no suffix) must NOT appear when scoped is used.
    expect(result).not.toMatch(/\b_scrml_sql\.unsafe/);
  });
});

describe("§D backward compatibility (Phase 1 — Bun.SQL default)", () => {
  test("no dbVar parameter defaults to _scrml_sql everywhere", () => {
    const sqlResult = rewriteSqlRefs("?{`SELECT 1`}.all()");
    expect(sqlResult).toContain("_scrml_sql");

    const node = {
      kind: "sql",
      query: "SELECT 1",
      chainedCalls: [{ method: "all" }],
      span: { file: "test.scrml", start: 0, end: 10, line: 1, col: 1 },
    };
    const emitResult = emitLogicNode(node);
    expect(emitResult).toContain("_scrml_sql");
  });
});
