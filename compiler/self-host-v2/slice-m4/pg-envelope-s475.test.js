// pg-envelope-s475.test.js — s475-boot-pg-envelopes, part 3: the implicit `!` envelope on POSTGRES.
// LIVE against a real Postgres; SKIPPED (not failed) unless SCRML_TEST_PG_URL names one, e.g.
//   SCRML_TEST_PG_URL=postgres://postgres:postgres@127.0.0.1:54417/postgres bun test <this file>
// (`SCRML_PGTEST=0` skips it too.) The URL's role needs CREATE TABLE; the tables carry the process
// id and are dropped at the end. Measured on PGlite (PostgreSQL 18) through pglite-socket.
//
// Governing text:
//   §19.10.6 "Pooled drivers (Postgres, MySQL — §44.2). A transaction SHALL run on one connection
//   taken from the pool for it alone, and every statement of the owning request SHALL run on that
//   connection until the transaction ends. A statement from another request runs on another pool
//   connection and SHALL NOT wait. Under the default, a database's transactions still run one at a
//   time."
//   §19.10.6 "Concurrent requests SHALL NOT observe or join another request's open transaction: a
//   statement issued for another request SHALL NOT run inside it, SHALL NOT read its uncommitted
//   writes, and SHALL NOT be committed or rolled back with it."
//   §8.9.2 "Amendment S474" item 1: "On Postgres / MySQL it opens with plain `BEGIN`".
//
// The runtime half drives server-runtime.js exactly as the printed server does. RED before s475
// (review finding F2): with a `max: 1` connection a concurrent request's autocommit INSERT ran INSIDE
// another request's open transaction and was rolled back with it, while reporting success; with a
// larger pool Bun refuses the raw BEGIN (ERR_POSTGRES_UNSAFE_TRANSACTION). The compiled half
// compiles a `.scrml` program on `postgres://` with the bootstrap — RED before s475: refused at
// compile time (E-BOOTSTRAP-UNSUPPORTED, analyze.scrml envelopeOf).
//
// `prepare: false` on every handle: PGlite serves all sockets from ONE backend session, so Bun's
// named prepared statements from two connections (or from an earlier run) collide there (42P05).
// On a real Postgres server it changes nothing these tests observe.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { SQL } from "bun";
import * as rt from "../slice-m1/runtime/server-runtime.js";
import { compile, serve, post, pathOf } from "./server-artifact-harness.js";

const URL = process.env.SCRML_TEST_PG_URL ?? "";
const PG_OK = URL !== "" && process.env.SCRML_PGTEST !== "0";
if (!PG_OK) {
  // eslint-disable-next-line no-console
  console.log("[pg-envelope-s475] SCRML_TEST_PG_URL not set — skipping the live Postgres envelope test.");
}
const d = PG_OK ? describe : describe.skip;
const LIVE_TIMEOUT_MS = 60_000;

const LOG = `s475e_log_${process.pid}`;
const UNIQ = `s475e_uniq_${process.pid}`;
const SQ = "?" + "{";

let admin;
const persisted = async () => (await admin.unsafe(`SELECT a FROM ${LOG} ORDER BY a`)).map((r) => r.a);
const reset = async () => {
  await admin.unsafe(`DELETE FROM ${LOG}`);
  await admin.unsafe(`DELETE FROM ${UNIQ}`);
  await admin.unsafe(`INSERT INTO ${UNIQ} (k) VALUES (1)`);   // so inserting k = 1 fails: 23505
};
const tick = () => new Promise((res) => setTimeout(res, 20));

d("Postgres: the runtime — an envelope runs on a connection reserved for it", () => {
  let logs;
  const pgConn = (max) => {
    const driver = new SQL({ url: URL, max, prepare: false });
    const conn = rt.connection({ connect: () => driver, log: (l) => logs.push(l) }, { driver: "postgres", target: URL, file: `pool${max}.scrml` });
    return { driver, conn };
  };
  const logA = (conn, a) => rt.query(conn, "run", rt.sqlText([`INSERT INTO ${LOG} (a) VALUES (`, ")"]), [a], [0]);

  beforeAll(async () => {
    admin = new SQL({ url: URL, max: 1, prepare: false });
    await admin.unsafe(`DROP TABLE IF EXISTS ${LOG}`);
    await admin.unsafe(`DROP TABLE IF EXISTS ${UNIQ}`);
    await admin.unsafe(`CREATE TABLE ${LOG} (a INTEGER)`);
    await admin.unsafe(`CREATE TABLE ${UNIQ} (k INTEGER PRIMARY KEY)`);
    logs = [];
  }, LIVE_TIMEOUT_MS);

  afterAll(async () => {
    if (admin) {
      await admin.unsafe(`DROP TABLE IF EXISTS ${LOG}`).catch(() => {});
      await admin.unsafe(`DROP TABLE IF EXISTS ${UNIQ}`).catch(() => {});
      await admin.close().catch(() => {});
    }
  });

  for (const max of [1, 4]) {
    test(`review F2 (max: ${max}): another request's autocommit write issued mid-transaction is not rolled back with it`, async () => {
      await reset();
      const { driver, conn } = pgConn(max);
      try {
        let release;
        const inTx = new Promise((res) => { release = res; });
        let started;
        const begun = new Promise((res) => { started = res; });
        // request A: writes, waits (other requests run meanwhile), then fails → ROLLBACK
        const a = rt.envelope(conn, async () => {
          await logA(conn, 1);
          started();
          await inTx;
          return rt.failure("Bad");
        }, true, "IMMEDIATE");
        await begun;
        // request B: an autocommit write from OUTSIDE A's scope, issued while A's transaction is open
        const b = logA(conn, 99);
        await tick();
        release();
        const [ra, rb] = await Promise.all([a, b]);
        expect(rt.failed(ra)).toBe(true);
        expect(rt.failed(rb)).toBe(false);
        // before s475, max 1: [] — B's acknowledged write ran inside A's transaction and was rolled back
        expect(await persisted()).toEqual([99]);
      } finally {
        await driver.close().catch(() => {});
      }
    }, LIVE_TIMEOUT_MS);
  }

  test("two concurrent envelopes run one at a time (§19.10.6 default) and do not interleave", async () => {
    await reset();
    const { driver, conn } = pgConn(4);
    try {
      const order = [];
      const body = (tag, a, fail) => async () => {
        order.push(tag + ":begin");
        await logA(conn, a);
        await tick();
        await logA(conn, a + 1);
        order.push(tag + ":end");
        return fail ? rt.failure("Bad") : a;
      };
      const [x, y] = await Promise.all([
        rt.envelope(conn, body("A", 10, true), true, "IMMEDIATE"),
        rt.envelope(conn, body("B", 20, false), true, "IMMEDIATE"),
      ]);
      expect(rt.failed(x)).toBe(true);
      expect(y).toBe(20);
      expect(order).toEqual(["A:begin", "A:end", "B:begin", "B:end"]);
      expect(await persisted()).toEqual([20, 21]);
    } finally {
      await driver.close().catch(() => {});
    }
  }, LIVE_TIMEOUT_MS);

  test("a nested `!` call and a statement savepoint run on the same reserved connection", async () => {
    await reset();
    const { driver, conn } = pgConn(4);
    try {
      const dup = () => rt.query(conn, "run", rt.sqlText([`INSERT INTO ${UNIQ} (k) VALUES (`, ")"]), [1], [0], true);
      const inner = async () => {
        await logA(conn, 2);
        return rt.failure("Bad");                  // the inner `!` fails; the caller handles it
      };
      const out = await rt.envelope(conn, async () => {
        await logA(conn, 1);
        const r = await rt.envelope(conn, inner, true, "IMMEDIATE");
        expect(rt.failed(r)).toBe(true);
        const h = await dup();                     // handled at its site: a statement savepoint
        expect(h.error).toEqual({ variant: "ConstraintViolation", data: ["k"] });
        await logA(conn, 3);
        return 7;
      }, true, "IMMEDIATE");
      expect(out).toBe(7);
      expect(await persisted()).toEqual([1, 3]);
    } finally {
      await driver.close().catch(() => {});
    }
  }, LIVE_TIMEOUT_MS);

  test("after a failed COMMIT the reserved connection is closed, never handed back inside a transaction", async () => {
    await reset();
    const { driver, conn } = pgConn(1);
    try {
      const unhandledDup = () => rt.query(conn, "run", rt.sqlText([`INSERT INTO ${UNIQ} (k) VALUES (`, ")"]), [1], [0]);
      const run = rt.envelope(conn, async () => {
        await logA(conn, 1);
        await unhandledDup();                      // aborts the transaction; nothing rolls back to a savepoint
        return 1;                                  // COMMIT is answered ROLLBACK → a server error
      }, true, "IMMEDIATE");
      await expect(run).rejects.toThrow(/COMMIT with ROLLBACK/);
      // the pool still answers, outside any transaction
      expect(rt.failed(await logA(conn, 5))).toBe(false);
      expect(await persisted()).toEqual([5]);
    } finally {
      await driver.close().catch(() => {});
    }
  }, LIVE_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// The compiled half: a `.scrml` program on `postgres://`, compiled by the bootstrap, served by the
// printed server over a Bun.SQL pool of four connections.
// ---------------------------------------------------------------------------
const E = "    type E:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }\n";
const program = (url) => `<program db="${url}">
${E}
    function twoWrites(a: int)! E {
        ${SQ}\`INSERT INTO ${LOG} (a) VALUES (\${a})\`}.run();
        ${SQ}\`INSERT INTO ${LOG} (a) VALUES (\${a + 1})\`}.run();
        return a;
    }
    function secondFails(a: int)! E {
        ${SQ}\`INSERT INTO ${LOG} (a) VALUES (\${a})\`}.run();
        ${SQ}\`INSERT INTO ${UNIQ} (k) VALUES (1)\`}.run();
        return a;
    }
    function insertOrIgnore(a: int)! E {
        ${SQ}\`INSERT INTO ${LOG} (a) VALUES (\${a})\`}.run();
        const dup: int = match ${SQ}\`INSERT INTO ${UNIQ} (k) VALUES (1)\`}.run() { .Ok :> 0, .ConstraintViolation(f) :> 1, _ e :> 2 };
        ${SQ}\`INSERT INTO ${LOG} (a) VALUES (\${a + 10 * dup})\`}.run();
        return dup;
    }
    function slowThenFail(a: int)! E {
        ${SQ}\`INSERT INTO ${LOG} (a) VALUES (\${a})\`}.run();
        ${SQ}\`SELECT count(*) FROM ${LOG}\`}.run();
        ${SQ}\`SELECT count(*) FROM ${LOG}\`}.run();
        ${SQ}\`INSERT INTO ${LOG} (a) VALUES (\${a + 1})\`}.run();
        if (a > 0) fail .Bad;
        return a;
    }
    let <r:int=0/>
    <main>
        <button onclick={ @r = twoWrites(1) !{ _ :> 0, }; }>a</button>
        <button onclick={ @r = secondFails(1) !{ _ :> 0, }; }>b</button>
        <button onclick={ @r = insertOrIgnore(1) !{ _ :> 0, }; }>c</button>
        <button onclick={ @r = slowThenFail(1) !{ _ :> 0, }; }>d</button>
    </main>
</program>
`;

d("Postgres: a COMPILED program's `!` server functions (bootstrap front end + printed server)", () => {
  let driver, srv, routes, core, logs;
  const call = (fn, args) => post(srv, pathOf(routes, fn), args);

  beforeAll(async () => {
    admin = new SQL({ url: URL, max: 1, prepare: false });
    await admin.unsafe(`DROP TABLE IF EXISTS ${LOG}`);
    await admin.unsafe(`DROP TABLE IF EXISTS ${UNIQ}`);
    await admin.unsafe(`CREATE TABLE ${LOG} (a INTEGER)`);
    await admin.unsafe(`CREATE TABLE ${UNIQ} (k INTEGER PRIMARY KEY)`);
    core = compile(program(URL)).core;            // before s475: E-BOOTSTRAP-UNSUPPORTED (pooled envelope)
    driver = new SQL({ url: URL, max: 4, prepare: false });
    logs = [];
    ({ srv, routes } = await serve(core, driver, logs));
  }, 300_000);

  afterAll(async () => {
    if (driver) await driver.close().catch(() => {});
    if (admin) {
      await admin.unsafe(`DROP TABLE IF EXISTS ${LOG}`).catch(() => {});
      await admin.unsafe(`DROP TABLE IF EXISTS ${UNIQ}`).catch(() => {});
      await admin.close().catch(() => {});
    }
  });

  test("every `!` function has a standalone envelope on the Postgres database", () => {
    for (const name of ["twoWrites", "secondFails", "insertOrIgnore", "slowThenFail"]) {
      const env = core.envelopes.find((e) => e.fn.hint === name);
      expect([name, env && env.standalone]).toEqual([name, true]);
    }
  });

  test("(a) two writes commit", async () => {
    await reset();
    const res = await call("twoWrites", [1]);
    expect([res.status, res.json]).toEqual([200, 1]);
    expect(await persisted()).toEqual([1, 2]);
  }, LIVE_TIMEOUT_MS);

  test("(b) a failing second write rolls back the first — and is a ConstraintViolation", async () => {
    await reset();
    const res = await call("secondFails", [1]);
    expect(res.json).toMatchObject({ variant: "ConstraintViolation" });
    expect(await persisted()).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  test("(c) a handled duplicate insert keeps the earlier write and commits (the statement savepoint)", async () => {
    await reset();
    const res = await call("insertOrIgnore", [1]);
    expect([res.status, res.json]).toEqual([200, 1]);   // the `.ConstraintViolation(f)` arm ran
    expect(await persisted()).toEqual([1, 11]);
  }, LIVE_TIMEOUT_MS);

  test("(d) concurrent requests do not interleave: a failing one's writes go, the others' stay", async () => {
    await reset();
    const reqs = [call("slowThenFail", [100]), call("twoWrites", [1]), call("slowThenFail", [200]), call("twoWrites", [5])];
    const out = await Promise.all(reqs);
    expect(out.map((r) => r.status)).toEqual([500, 200, 500, 200]);
    expect(out[0].json).toMatchObject({ variant: "Bad" });
    expect(await persisted()).toEqual([1, 2, 5, 6]);
  }, LIVE_TIMEOUT_MS);
});
