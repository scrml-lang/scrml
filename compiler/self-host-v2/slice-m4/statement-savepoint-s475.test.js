// statement-savepoint-s475.test.js — s475-boot-pg-site-handled-savepoint: a `?{}` whose failure is
// handled WHERE IT IS WRITTEN runs, inside an envelope, under a statement savepoint of its own.
//
// Governing text (compiler/SPEC.md §8.9.2 "Amendment S474" item 4):
//   "**A query handled at its site runs under its own statement savepoint.** Inside an envelope, a
//   `?{}` whose failure is handled where it is written (a `!{}` on the query, or a `match` on its
//   result, §19.8.3) SHALL run under a statement savepoint of its own. When the query fails, the
//   handler runs after a rollback to that savepoint, and the envelope survives with every earlier
//   write intact. … A query that is not handled at its site needs no savepoint: its failure fails the
//   body, which rolls back the envelope."
//   "The statement savepoint is taken once per **executed** handled statement. A handled query in a
//   loop takes one savepoint and one release per iteration."
//   item 3: "Every savepoint the compiler opens has a compiler-owned name: … for a nested `!` call, and
//   for a statement handled at its site (item 4)."
//
// The Postgres half (a failed statement ABORTS the transaction) is
// statement-savepoint-pg-s475.test.js, skipped unless a Postgres URL is given. This file runs on
// SQLite, where the savepoint is observable too: a statement whose conflict resolution is `OR FAIL`
// keeps the rows it changed before the failing row, and only the rollback to the savepoint removes
// them before the handler runs (RED before s475: the handled statement's partial rows were committed).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { SQL } from "bun";
import { Database } from "bun:sqlite";
import { compile, codes, serve, post, pathOf, spyDriver } from "./server-artifact-harness.js";

const SQ = "?" + "{";
const E = "    type E:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }\n";

const PROGRAM = `<program db="./app.db">
${E}
    function guarded(a: int)! E {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run();
        ${SQ}\`INSERT OR FAIL INTO uniq (k) SELECT k FROM src ORDER BY rowid\`}.run() !{ _ :> { } };
        ${SQ}\`INSERT INTO log (a) VALUES (\${a + 1})\`}.run();
        return 1;
    }
    function matched(a: int)! E {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run();
        const n: int = match ${SQ}\`INSERT OR FAIL INTO uniq (k) SELECT k FROM src ORDER BY rowid\`}.run() { .Ok :> 1, _ e :> 0 };
        ${SQ}\`INSERT INTO log (a) VALUES (\${a + n + 1})\`}.run();
        return n;
    }
    function propagated(a: int)! E {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run();
        ${SQ}\`INSERT INTO uniq (k) VALUES (\${a})\`}.run();
        return 1;
    }
    function looped(a: int)! E {
        for (let i = 0; i < 3; i = i + 1) {
            ${SQ}\`INSERT INTO uniq (k) VALUES (\${a})\`}.run() !{ _ :> { } };
        }
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run();
        return 1;
    }
    function innerBang(a: int)! E {
        ${SQ}\`INSERT INTO uniq (k) VALUES (\${a})\`}.run() !{ _ :> { } };
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run();
        return 1;
    }
    function nested(a: int)! E {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a + 100})\`}.run();
        const x: int = innerBang(a)?;
        ${SQ}\`INSERT INTO uniq (k) VALUES (\${a})\`}.run() !{ _ :> { } };
        return x;
    }
    function rollbackConflict(a: int)! E {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run();
        ${SQ}\`INSERT OR ROLLBACK INTO uniq (k) VALUES (\${a})\`}.run() !{ _ :> { } };
        ${SQ}\`INSERT INTO log (a) VALUES (\${a + 1})\`}.run();
        return 1;
    }
    function alone(a: int)! E {
        ${SQ}\`INSERT INTO uniq (k) VALUES (\${a})\`}.run() !{ _ :> { } };
        return 1;
    }
    function oneQuery(a: int)! E {
        ${SQ}\`INSERT OR FAIL INTO uniq (k) SELECT k FROM src ORDER BY rowid\`}.run();
        return a;
    }
    function oneWriteThenFail(a: int)! E {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run();
        if (a > 5) fail .Bad;
        return a;
    }
    function twoNobatch(a: int)! E {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.nobatch().run();
        ${SQ}\`INSERT INTO log (a) VALUES (\${a + 1})\`}.nobatch().run();
        if (a > 5) fail .Bad;
        return a;
    }
    let <r:int=0/>
    <main>
        <button onclick={ @r = guarded(1) !{ _ :> 0, }; }>a</button>
        <button onclick={ @r = matched(1) !{ _ :> 0, }; }>b</button>
        <button onclick={ @r = propagated(1) !{ _ :> 0, }; }>c</button>
        <button onclick={ @r = looped(1) !{ _ :> 0, }; }>d</button>
        <button onclick={ @r = nested(1) !{ _ :> 0, }; }>e</button>
        <button onclick={ @r = rollbackConflict(1) !{ _ :> 0, }; }>f</button>
        <button onclick={ @r = alone(1) !{ _ :> 0, }; }>g</button>
        <button onclick={ @r = oneQuery(1) !{ _ :> 0, }; }>h</button>
        <button onclick={ @r = oneWriteThenFail(1) !{ _ :> 0, }; }>i</button>
        <button onclick={ @r = twoNobatch(1) !{ _ :> 0, }; }>j</button>
    </main>
</program>
`;

let dir, file, sql, srv, routes, js, logs, core;
const rows = (table, col) => {
  // a SECOND connection to the file — what any later reader of the database sees
  const db = new Database(file, { readonly: true });
  try {
    return db.query(`SELECT ${col} FROM ${table} ORDER BY ${col}`).all().map((r) => r[col]);
  } finally {
    db.close();
  }
};
const call = (fn, args) => post(srv, pathOf(routes, fn), args);
const reset = async () => {
  await sql.unsafe("DELETE FROM log");
  await sql.unsafe("DELETE FROM uniq");
  await sql.unsafe("DELETE FROM src");
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "s475-stmt-sp-"));
  file = join(dir, "app.db");
  sql = new SQL("sqlite://" + file);
  await sql.unsafe("CREATE TABLE log (a INTEGER)");
  await sql.unsafe("CREATE TABLE uniq (k INTEGER PRIMARY KEY)");
  await sql.unsafe("CREATE TABLE src (k INTEGER)");
  core = compile(PROGRAM).core;
  logs = [];
  ({ srv, routes, js } = await serve(core, sql, logs));
}, 300000);

afterAll(async () => {
  await sql.close();
  rmSync(dir, { recursive: true, force: true });
});

// The `async function <name>(…) { … }` text of one printed server function.
const fnText = (name) => {
  // (the printer may rename a parameter — `a_1` — so any one parameter name)
  const m = new RegExp(`async function ${name}\\(\\w+\\) \\{[\\s\\S]*?\\n  \\}\\n`).exec(js);
  return m === null ? "" : m[0];
};
const HANDLED = "true /* handled at its site */";

describe("the printed server: which queries carry `handled`", () => {
  test("a `!{}` on the query and a `match` on its result → `true /* handled at its site */`", () => {
    expect(fnText("guarded").split(HANDLED).length - 1).toBe(1);
    expect(fnText("matched").split(HANDLED).length - 1).toBe(1);
  });
  test("an implicitly propagated `?{}` (§19.8.2) is not handled at its site → five arguments", () => {
    const f = fnText("propagated");
    expect(f).toContain("rt.query(");
    expect(f).not.toContain(HANDLED);
    // the unhandled queries of `guarded` are printed with five arguments too
    expect((fnText("guarded").match(/rt\.query\(/g) ?? []).length).toBe(3);
  });
  test("a `?` on a query is not a handling at its site", async () => {
    const P = `<program db="./app.db">
${E}
    function q(a: int)! E {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run()?;
        ${SQ}\`INSERT INTO log (a) VALUES (\${a + 1})\`}.run()?;
        return 1;
    }
    let <r:int=0/>
    <main><button onclick={ @r = q(1) !{ _ :> 0, }; }>a</button></main>
</program>
`;
    const { js: j } = await serve(compile(P).core, spyDriver().fn, []);
    expect((j.match(/rt\.query\(/g) ?? []).length).toBe(2);
    expect(j).not.toContain(HANDLED);
  });
});

describe("SQLite: a failed handled statement is rolled back to its savepoint before its handler runs", () => {
  test("`!{}`: the `OR FAIL` statement's partial rows are gone; the writes around it commit", async () => {
    await reset();
    await sql.unsafe("INSERT INTO src (k) VALUES (1), (2), (1)");
    const res = await call("guarded", [1]);
    expect(res.status).toBe(200);
    expect(res.json).toBe(1);
    expect(rows("log", "a")).toEqual([1, 2]);
    // before s475: [1, 2] — the rows `OR FAIL` changed before its failing row were committed
    expect(rows("uniq", "k")).toEqual([]);
  });
  test("`match` on the result: the same", async () => {
    await reset();
    await sql.unsafe("INSERT INTO src (k) VALUES (1), (2), (1)");
    const res = await call("matched", [1]);
    expect(res.status).toBe(200);
    expect(res.json).toBe(0);
    expect(rows("log", "a")).toEqual([1, 2]);
    expect(rows("uniq", "k")).toEqual([]);
  });
  test("a handled statement that SUCCEEDS is released and its rows commit", async () => {
    await reset();
    await sql.unsafe("INSERT INTO src (k) VALUES (1), (2), (3)");
    expect((await call("guarded", [1])).status).toBe(200);
    expect(rows("uniq", "k")).toEqual([1, 2, 3]);
    expect(rows("log", "a")).toEqual([1, 2]);
    await reset();
    await sql.unsafe("INSERT INTO src (k) VALUES (5)");
    expect((await call("matched", [1])).json).toBe(1);
    expect(rows("log", "a")).toEqual([1, 3]);
  });
  test("an unhandled failure still rolls back the whole envelope (no savepoint needed)", async () => {
    await reset();
    await sql.unsafe("INSERT INTO uniq (k) VALUES (1)");
    const res = await call("propagated", [1]);
    expect(res.json).toMatchObject({ variant: "ConstraintViolation" });
    expect(rows("log", "a")).toEqual([]);
  });
  test("`OR ROLLBACK` ends the whole transaction (and the savepoint with it) → a server error, nothing persisted", async () => {
    await reset();
    await sql.unsafe("INSERT INTO uniq (k) VALUES (1)");
    const res = await call("rollbackConflict", [1]);
    expect(res.status).toBe(500);
    expect(rows("log", "a")).toEqual([]);
  });
});

// s475-boot-pg-envelopes, part 1 — SPEC §8.9.2 "Amendment S474" item 1: "The body of every `!`
// function placed on the server … whose transitive query set … is **non-empty** SHALL run inside the
// implicit per-handler transaction. This holds whatever its error type (not only `! -> SqlError`) and
// however many queries it reaches (one is enough)." Item 2: `.nobatch()` "SHALL NOT remove the query
// from the transitive query set, and it SHALL NOT suppress, narrow or end the envelope."
// RED before: the bootstrap gave a body reaching one query once (or only `.nobatch()` queries) no
// envelope of its own (g-boot-envelope-nobatch-count-and-remedy-s474).
describe("every `!` server body with a query runs in the envelope — one query is enough", () => {
  test("every `!` function of the program has a standalone envelope", () => {
    for (const name of ["alone", "oneQuery", "oneWriteThenFail", "twoNobatch", "innerBang"]) {
      const env = core.envelopes.find((e) => e.fn.hint === name);
      expect([name, env && env.standalone]).toEqual([name, true]);
    }
  });
  test("one statement that fails part way (`INSERT OR FAIL … SELECT`, not handled): its earlier rows roll back", async () => {
    await reset();
    await sql.unsafe("INSERT INTO src (k) VALUES (1), (2), (1)");
    const res = await call("oneQuery", [1]);
    expect(res.json).toMatchObject({ variant: "ConstraintViolation" });
    // before: [1, 2] — the rows the statement inserted before its failing row were committed
    expect(rows("uniq", "k")).toEqual([]);
  });
  test("one write, then `fail`: the write is rolled back", async () => {
    await reset();
    expect((await call("oneWriteThenFail", [7])).json).toMatchObject({ variant: "Bad" });
    expect(rows("log", "a")).toEqual([]);   // before: [7]
    expect((await call("oneWriteThenFail", [2])).json).toBe(2);
    expect(rows("log", "a")).toEqual([2]);
  });
  test("two `.nobatch()` writes, then `fail`: both are rolled back", async () => {
    await reset();
    expect((await call("twoNobatch", [7])).json).toMatchObject({ variant: "Bad" });
    expect(rows("log", "a")).toEqual([]);   // before: [7, 8]
    expect((await call("twoNobatch", [2])).json).toBe(2);
    expect(rows("log", "a")).toEqual([2, 3]);
  });
});

describe("the statement sequence (a driver spy)", () => {
  // the control statements the runtime issues, and the `INSERT INTO uniq` sites (which fail)
  const run = async (fn, args) => {
    const spy = spyDriver((strings) => {
      const t = strings.join("?");
      if (t.startsWith("INSERT INTO uniq") || t.startsWith("INSERT OR")) throw Object.assign(new Error("UNIQUE constraint failed: uniq.k"), { code: "SQLITE_CONSTRAINT_PRIMARYKEY" });
      if (t === "BEGIN DEFERRED") throw new Error("cannot start a transaction within a transaction");   // the probe, inside an open transaction
      return [];
    });
    const s = await serve(core, spy.fn, []);
    const res = await post(s.srv, pathOf(s.routes, fn), args);
    const seq = spy.calls.map((c) => c.strings.join("?")).filter((t) => t !== "BEGIN DEFERRED");
    return { res, seq };
  };
  test("SAVEPOINT before the handled statement, ROLLBACK TO + RELEASE after its failure, then COMMIT", async () => {
    const { res, seq } = await run("guarded", [1]);
    expect(res.status).toBe(200);
    expect(seq).toEqual([
      "BEGIN IMMEDIATE",
      "INSERT INTO log (a) VALUES (?)",
      "SAVEPOINT scrml_sp_1",
      "INSERT OR FAIL INTO uniq (k) SELECT k FROM src ORDER BY rowid",
      "ROLLBACK TO SAVEPOINT scrml_sp_1",
      "RELEASE SAVEPOINT scrml_sp_1",
      "INSERT INTO log (a) VALUES (?)",
      "COMMIT",
    ]);
  });
  test("a handled statement in a loop: one savepoint per executed statement", async () => {
    const { seq } = await run("looped", [1]);
    expect(seq.filter((t) => t.startsWith("SAVEPOINT"))).toEqual(["SAVEPOINT scrml_sp_1", "SAVEPOINT scrml_sp_2", "SAVEPOINT scrml_sp_3"]);
    expect(seq.filter((t) => t.startsWith("ROLLBACK TO"))).toHaveLength(3);
    expect(seq.filter((t) => t.startsWith("RELEASE"))).toHaveLength(3);
    expect(seq[seq.length - 1]).toBe("COMMIT");
  });
  test("inside a nested `!` call's savepoint: distinct names, properly nested", async () => {
    const { res, seq } = await run("nested", [1]);
    expect(res.status).toBe(200);
    expect(seq).toEqual([
      "BEGIN IMMEDIATE",
      "INSERT INTO log (a) VALUES (?)",
      "SAVEPOINT scrml_sp_1",                 // the nested `!` call (§19.10.6)
      "SAVEPOINT scrml_sp_2",                 // its handled statement
      "INSERT INTO uniq (k) VALUES (?)",
      "ROLLBACK TO SAVEPOINT scrml_sp_2",
      "RELEASE SAVEPOINT scrml_sp_2",
      "INSERT INTO log (a) VALUES (?)",
      "RELEASE SAVEPOINT scrml_sp_1",
      "SAVEPOINT scrml_sp_3",                 // the outer body's handled statement
      "INSERT INTO uniq (k) VALUES (?)",
      "ROLLBACK TO SAVEPOINT scrml_sp_3",
      "RELEASE SAVEPOINT scrml_sp_3",
      "COMMIT",
    ]);
  });
  // s475-boot-pg-envelopes: §8.9.2 "Amendment S474" item 1 — a `!` server body runs in the envelope
  // "however many queries it reaches (one is enough)". Before: `["INSERT INTO uniq (k) VALUES (?)"]`
  // (a one-query `!` function had no envelope of its own, so its handled statement took no savepoint).
  test("a one-query `!` function has its own envelope, and its handled statement its savepoint", async () => {
    const { res, seq } = await run("alone", [1]);
    expect(res.status).toBe(200);
    expect(seq).toEqual([
      "BEGIN IMMEDIATE",
      "SAVEPOINT scrml_sp_1",
      "INSERT INTO uniq (k) VALUES (?)",
      "ROLLBACK TO SAVEPOINT scrml_sp_1",
      "RELEASE SAVEPOINT scrml_sp_1",
      "COMMIT",
    ]);
  });
});

describe("Postgres: the bootstrap still builds no envelope on a pooled database", () => {
  test("a `!` function that needs one is E-BOOTSTRAP-UNSUPPORTED (refused, never compiled non-atomic)", () => {
    const P = `<program db="postgres://u:p@localhost:5432/d">
${E}
    function g(a: int)! E {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run();
        ${SQ}\`INSERT INTO uniq (k) VALUES (\${a})\`}.run() !{ _ :> { } };
        ${SQ}\`INSERT INTO log (a) VALUES (\${a + 1})\`}.run();
        return 1;
    }
    let <r:int=0/>
    <main><button onclick={ @r = g(1) !{ _ :> 0, }; }>a</button></main>
</program>
`;
    expect(codes(P)).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
});
