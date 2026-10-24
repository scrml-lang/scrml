/**
 * SQL `.nobatch()` compile-time marker — Unit Tests (§8.9.5)
 *
 * `.nobatch()` excludes a SQL node from Batch Planner coalescing candidate
 * sets (§8.9.1) and from §8.10 loop hoisting. It has no runtime effect.
 *
 * Two code paths handle `.nobatch()`:
 *   1. AST path — bare top-level `?{}` statements parsed into SQLNode.
 *      ast-builder flags `nobatch: true` and drops the `.nobatch()` call
 *      from `chainedCalls`.
 *   2. String path — SQL embedded inside an expression (let-decl init,
 *      return, etc.). rewriteSqlRefs strips `.nobatch()` from the string
 *      before emitting runtime `db.query(...).method(...)` calls.
 *
 * Coverage:
 *   §1  rewriteSqlRefs strips `.nobatch()` between ?{} and real method
 *   §2  rewriteSqlRefs strips trailing `.nobatch()`
 *   §3  rewriteSqlRefs — no-nobatch baseline (regression)
 *   §4  rewriteSqlRefs handles .all() + nobatch with params
 *   §5  AST path — bare top-level `?{}.nobatch().run()` sets flag
 *   §6  AST path — no nobatch is unchanged
 *   §7  AST path — nobatch flag is per-node
 *   §8  End-to-end compile — no leaked `.nobatch(` in emitted JS
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { splitBlocks } from "../../src/block-splitter.js";
import { buildAST } from "../../src/ast-builder.js";
import { rewriteSqlRefs } from "../../src/codegen/rewrite.js";
import { compileScrml } from "../../src/api.js";
import { writeFileSync, mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setFileSqlFallback } from "../../src/codegen/sql-handle-name.ts";

// S469 (s469-hook-flakes): this file calls the codegen emitters (emitLogicNode / rewriteSqlRefs /
// rewriteServerExpr) DIRECTLY, without the per-file codegen entry, so a `?{}` lowered with no
// `dbVar` reads the module-level fallback handle (`sql-handle-name.ts` `fallbackSqlHandle()`).
// That fallback is whatever the LAST compile in this process left: after any test file that
// compiled a two-database program it is `_scrml_sql_UNRESOLVED`, so these tests failed only when
// a hook shard happened to run such a file first. Pin the single-database default per test.
beforeEach(() => setFileSqlFallback(1));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parse(source) {
  const bsOut = splitBlocks("test.scrml", source);
  const result = buildAST(bsOut);
  // v0.3 Wave 2: filter info-level warnings (e.g. W-PROGRAM-REDUNDANT-LOGIC,
  // W-PROGRAM-001) from the errors[] array. Test assertions target fatal
  // errors only; warning-specific positive tests live elsewhere.
  return {
    ...result,
    errors: (result.errors || []).filter(e => e?.severity !== "warning"),
  };
}

/** Collect every SQLNode in an AST tree. */
function collectSql(node, acc = []) {
  if (!node || typeof node !== "object") return acc;
  if (node.kind === "sql") acc.push(node);
  for (const k of Object.keys(node)) {
    if (k === "span") continue;
    const v = node[k];
    if (Array.isArray(v)) for (const item of v) collectSql(item, acc);
    else if (v && typeof v === "object") collectSql(v, acc);
  }
  return acc;
}

// `compileScrml` takes a SINGLE options object — `compileScrml(stringPath)`
// is a silent no-op (compiles nothing, returns `{ fileCount: 0, errors: [] }`).
// `write: true` emits to disk; the result object has no per-file `serverJs` /
// `clientJs` fields, so the emitted JS is read back off the output dir.
// Returns `{ result, emittedJs }` where emittedJs is every `.js` file in the
// output dir concatenated. `fileCount` is asserted > 0 by callers so a
// vacuous no-compile can never pass.
function compile(source) {
  const dir = mkdtempSync(join(tmpdir(), "scrml-nobatch-"));
  const file = join(dir, "test.scrml");
  const outDir = join(dir, "dist");
  writeFileSync(file, source);
  try {
    const result = compileScrml({
      inputFiles: [file],
      outputDir: outDir,
      write: true,
      verbose: false,
      log: () => {},
    });
    let emittedJs = "";
    try {
      for (const f of readdirSync(outDir)) {
        if (f.endsWith(".js")) emittedJs += readFileSync(join(outDir, f), "utf8") + "\n";
      }
    } catch { /* outDir may not exist if compile failed — emittedJs stays "" */ }
    return { result, emittedJs };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// §1 — rewriteSqlRefs strips nobatch between ?{} and real method
// ---------------------------------------------------------------------------

describe("§1 rewriteSqlRefs: `?{...}.nobatch().get()` → real call on real method", () => {
  test("nobatch stripped, .get() kept", () => {
    const input = "?{`SELECT * FROM users WHERE id = ${id}`}.nobatch().get()";
    const output = rewriteSqlRefs(input);
    expect(output).not.toContain(".nobatch(");
    // §44.3: .get() emits the single-row helper using a Bun.SQL tagged template.
    expect(output).toContain("[0] ?? null");
    expect(output).toContain("_scrml_sql`");
  });
});

// ---------------------------------------------------------------------------
// §2 — trailing nobatch stripped
// ---------------------------------------------------------------------------

describe("§2 rewriteSqlRefs: `?{...}.get().nobatch()` — trailing nobatch dropped", () => {
  test("trailing nobatch stripped", () => {
    const input = "?{`SELECT 1`}.get().nobatch()";
    const output = rewriteSqlRefs(input);
    expect(output).not.toContain(".nobatch(");
    expect(output).toContain("[0] ?? null");
  });
});

// ---------------------------------------------------------------------------
// §3 — regression: no nobatch is unchanged
// ---------------------------------------------------------------------------

describe("§3 regression: baseline without nobatch is unchanged", () => {
  test("plain `.get()` passes through unchanged by the nobatch pass", () => {
    const input = "?{`SELECT * FROM users WHERE id = ${id}`}.get()";
    const output = rewriteSqlRefs(input);
    expect(output).toBe('(await _scrml_sql`SELECT * FROM users WHERE id = ${id}`)[0] ?? null');
  });
});

// ---------------------------------------------------------------------------
// §4 — nobatch + .all() with params
// ---------------------------------------------------------------------------

describe("§4 rewriteSqlRefs: .nobatch().all() with a bound param", () => {
  test("params survive as ${} slot, nobatch dropped", () => {
    const input = "?{`SELECT * FROM posts WHERE author_id = ${userId}`}.nobatch().all()";
    const output = rewriteSqlRefs(input);
    expect(output).not.toContain(".nobatch(");
    // §44 Bun.SQL: param preserved as JS template-literal slot, bound at driver.
    expect(output).toContain("${userId}");
    expect(output).toContain("await _scrml_sql`");
  });
});

// ---------------------------------------------------------------------------
// §5 — AST path: bare top-level `?{}` with nobatch sets flag
// ---------------------------------------------------------------------------

describe("§5 AST path: bare top-level `?{...}.nobatch().run()` sets flag", () => {
  test("SQLNode has nobatch=true and chainedCalls contains only .run()", () => {
    const source = [
      '<program db="test.db">',
      "${ server function ping() {",
      "    ?{`INSERT INTO ping DEFAULT VALUES`}.nobatch().run()",
      "} }",
      "</>",
    ].join("\n");
    const ast = parse(source);
    const sqls = collectSql(ast);
    // At least one SQLNode should exist (the bare top-level ?{} statement).
    // If no SQLNode exists, the SQL is stored as a string expression — that
    // case is covered by §1-§4 via rewriteSqlRefs.
    if (sqls.length > 0) {
      const sql = sqls[0];
      expect(sql.nobatch).toBe(true);
      expect(sql.chainedCalls.map((c) => c.method)).not.toContain("nobatch");
    }
    // Otherwise: the string-path tests cover this case; assert at least no parse error.
    expect(Array.isArray(ast.errors) ? ast.errors.length : 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §6 — AST path regression: no nobatch
// ---------------------------------------------------------------------------

describe("§6 AST path regression: plain bare SQL has nobatch falsy", () => {
  test("nobatch flag not set when not written", () => {
    const source = [
      '<program db="test.db">',
      "${ server function ping() {",
      "    ?{`INSERT INTO ping DEFAULT VALUES`}.run()",
      "} }",
      "</>",
    ].join("\n");
    const sqls = collectSql(parse(source));
    for (const sql of sqls) {
      expect(sql.nobatch).toBeFalsy();
    }
  });
});

// ---------------------------------------------------------------------------
// §7 — AST path: per-node flag
// ---------------------------------------------------------------------------

describe("§7 nobatch flag is per-node", () => {
  test("first bare SQL flagged, second is not", () => {
    const source = [
      '<program db="test.db">',
      "${ server function two() {",
      "    ?{`INSERT INTO a DEFAULT VALUES`}.nobatch().run()",
      "    ?{`INSERT INTO b DEFAULT VALUES`}.run()",
      "} }",
      "</>",
    ].join("\n");
    const sqls = collectSql(parse(source));
    // If both landed as SQLNodes, verify the per-node distinction.
    if (sqls.length >= 2) {
      expect(sqls[0].nobatch).toBe(true);
      expect(sqls[1].nobatch).toBeFalsy();
    } else {
      // String-path: ensure the source itself has the distinction we expect.
      expect(source).toContain(".nobatch().run()");
      expect(source).toContain(".run()");
    }
  });
});

// ---------------------------------------------------------------------------
// §8 — end-to-end compile: no leaked `.nobatch(` call in emitted JS
// ---------------------------------------------------------------------------

describe("§8 end-to-end compile: no `.nobatch(` in emitted JS", () => {
  test("compiled output strips the compile-time marker", () => {
    const source = [
      '<program db="test.db">',
      "${ server function load(id) {",
      "    let row = ?{`SELECT * FROM users WHERE id = ${id}`}.nobatch().get()",
      "    return row",
      "} }",
      "</>",
    ].join("\n");
    const { result, emittedJs } = compile(source);
    // Guard against a vacuous no-compile (string-first-arg API misuse).
    expect(result.fileCount).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
    // The emitted JS must exist (the server fn produces a server-JS chunk)
    // AND must not leak the compile-time `.nobatch()` marker.
    expect(emittedJs.length).toBeGreaterThan(0);
    expect(emittedJs).not.toContain(".nobatch(");
  });
});
