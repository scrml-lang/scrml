// statement-savepoint-pg-s475.test.js — s475-boot-pg-site-handled-savepoint, the POSTGRES half.
// LIVE against a real Postgres; SKIPPED (not failed) unless SCRML_TEST_PG_URL names one, e.g.
//   SCRML_TEST_PG_URL=postgres://postgres:postgres@127.0.0.1:54371/postgres bun test <this file>
// (`SCRML_PGTEST=0` skips it too.) The URL's role needs CREATE TABLE on its database; the tables
// carry the process id and are dropped at the end.
//
// SPEC §8.9.2 "Amendment S474" item 4: "Inside an envelope, a `?{}` whose failure is handled where
// it is written (a `!{}` on the query, or a `match` on its result, §19.8.3) SHALL run under a
// statement savepoint of its own. When the query fails, the handler runs after a rollback to that
// savepoint, and the envelope survives with every earlier write intact. On Postgres a failed
// statement aborts the whole transaction, so without this savepoint every later query would fail
// and the envelope's `COMMIT` would silently end as a `ROLLBACK`, reporting success with every write
// gone."
//
// Why at the RUNTIME level: the bootstrap's compiler still builds no envelope on a pooled database
// (analyze.scrml envelopeOf: E-BOOTSTRAP-UNSUPPORTED — §19.10.6 needs a pool connection reserved
// for the transaction, which is not built; statement-savepoint-s475.test.js pins that refusal). So
// no compiled program reaches this path on Postgres today; the runtime it will run on is driven here
// exactly as the printed server drives it (`rt.envelope(db, body$, standalone, begin)` around a body
// of `rt.query(db, mode, sql$, params, slots[, true /* handled at its site */])` calls), over a
// `connect` that hands back ONE connection (`max: 1` — Bun refuses BEGIN on a pooled handle).
// The "without the savepoint" cases pass `handled = false` — the five-argument call the printer
// emitted for every query before s475 — and show the abort on the same server.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { SQL } from "bun";
import * as rt from "../slice-m1/runtime/server-runtime.js";

const URL = process.env.SCRML_TEST_PG_URL ?? "";
const PG_OK = URL !== "" && process.env.SCRML_PGTEST !== "0";
if (!PG_OK) {
  // eslint-disable-next-line no-console
  console.log("[statement-savepoint-pg-s475] SCRML_TEST_PG_URL not set — skipping the live Postgres statement-savepoint test.");
}
const d = PG_OK ? describe : describe.skip;
const LIVE_TIMEOUT_MS = 30_000;

const LOG = `s475_log_${process.pid}`;
const UNIQ = `s475_uniq_${process.pid}`;

let admin, driver, conn, logs;
const persisted = async () => (await admin.unsafe(`SELECT a FROM ${LOG} ORDER BY a`)).map((r) => r.a);
const reset = async () => {
  await admin.unsafe(`DELETE FROM ${LOG}`);
  await admin.unsafe(`DELETE FROM ${UNIQ}`);
  await admin.unsafe(`INSERT INTO ${UNIQ} (k) VALUES (1)`);   // so inserting 1 fails: 23505
};
// one query, as the printed server issues it (the text frozen by rt.sqlText, the values bound)
const logA = (a) => rt.query(conn, "run", rt.sqlText([`INSERT INTO ${LOG} (a) VALUES (`, ")"]), [a], [0]);
const dupK = (handled) => rt.query(conn, "run", rt.sqlText([`INSERT INTO ${UNIQ} (k) VALUES (`, ")"]), [1], [0], handled);

d("Postgres: a handled failing statement inside an envelope", () => {
  beforeAll(async () => {
    admin = new SQL({ url: URL, max: 1 });
    await admin.unsafe(`DROP TABLE IF EXISTS ${LOG}`);
    await admin.unsafe(`DROP TABLE IF EXISTS ${UNIQ}`);
    await admin.unsafe(`CREATE TABLE ${LOG} (a INTEGER)`);
    await admin.unsafe(`CREATE TABLE ${UNIQ} (k INTEGER PRIMARY KEY)`);
    driver = new SQL({ url: URL, max: 1 });
    logs = [];
    conn = rt.connection({ connect: () => driver, log: (l) => logs.push(l) }, { driver: "postgres", target: URL, file: "app.scrml" });
  }, LIVE_TIMEOUT_MS);

  afterAll(async () => {
    if (driver) await driver.close().catch(() => {});
    if (admin) {
      await admin.unsafe(`DROP TABLE IF EXISTS ${LOG}`).catch(() => {});
      await admin.unsafe(`DROP TABLE IF EXISTS ${UNIQ}`).catch(() => {});
      await admin.close().catch(() => {});
    }
  });

  test("the driver itself: a failed statement aborts the transaction and COMMIT answers ROLLBACK", async () => {
    // the premise, measured on this server (no scrml runtime): why the savepoint is needed
    await reset();
    await driver.unsafe("BEGIN");
    await driver.unsafe(`INSERT INTO ${LOG} (a) VALUES (1)`);
    const dup = await driver.unsafe(`INSERT INTO ${UNIQ} (k) VALUES (1)`).then(() => null, (e) => e);
    expect(String(dup && dup.errno)).toBe("23505");
    const next = await driver.unsafe(`INSERT INTO ${LOG} (a) VALUES (2)`).then(() => null, (e) => e);
    expect(String(next && next.errno)).toBe("25P02");   // current transaction is aborted
    const done = await driver.unsafe("COMMIT");
    expect(done.command).toBe("ROLLBACK");
    expect(await persisted()).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  test("`!{ _ :> … }` on it: rolled back to its savepoint, the handler runs, every write commits", async () => {
    await reset();
    const out = await rt.envelope(conn, async () => {
      await logA(1);
      const r = await dupK(true);
      expect(rt.failed(r)).toBe(true);           // the handler sees the failure …
      const n = await logA(2);                     // … and the envelope survives it
      if (rt.failed(n)) return n;
      return 7;
    }, true, "IMMEDIATE");
    expect(out).toBe(7);
    expect(await persisted()).toEqual([1, 2]);
  }, LIVE_TIMEOUT_MS);

  test("the handler is the body's last statement: COMMIT commits (no silent ROLLBACK)", async () => {
    await reset();
    const out = await rt.envelope(conn, async () => {
      await logA(1);
      await dupK(true);
      return 1;
    }, true, "IMMEDIATE");
    expect(out).toBe(1);
    expect(await persisted()).toEqual([1]);
  }, LIVE_TIMEOUT_MS);

  test("once per executed statement: three handled failures in a loop, then a write", async () => {
    await reset();
    const out = await rt.envelope(conn, async () => {
      for (let i = 0; i < 3; i++) await dupK(true);
      const n = await logA(5);
      if (rt.failed(n)) return n;
      return 1;
    }, true, "IMMEDIATE");
    expect(out).toBe(1);
    expect(await persisted()).toEqual([5]);
  }, LIVE_TIMEOUT_MS);

  test("inside a nested `!` call's savepoint (§19.10.6): both savepoints nest; a later outer `fail` still undoes all", async () => {
    await reset();
    const inner = async () => {
      await dupK(true);
      const n = await logA(2);
      if (rt.failed(n)) return n;
      return 1;
    };
    const ok = await rt.envelope(conn, async () => {
      await logA(1);
      const x = await rt.envelope(conn, inner, false, "IMMEDIATE");
      if (rt.failed(x)) return x;
      await dupK(true);
      await logA(3);
      return x;
    }, true, "IMMEDIATE");
    expect(ok).toBe(1);
    expect(await persisted()).toEqual([1, 2, 3]);
    await reset();
    const bad = await rt.envelope(conn, async () => {
      await logA(1);
      await rt.envelope(conn, inner, false, "IMMEDIATE");
      return rt.failure("Bad");                    // the outer `fail`s after all of it
    }, true, "IMMEDIATE");
    expect(rt.failed(bad)).toBe(true);
    expect(await persisted()).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  test("WITHOUT the savepoint (the five-argument call printed before s475): the next statement fails `aborted`", async () => {
    await reset();
    const out = await rt.envelope(conn, async () => {
      await logA(1);
      await dupK(false);
      const n = await logA(2);
      if (rt.failed(n)) return n;                  // the implicit §19.8.2 propagation
      return 1;
    }, true, "IMMEDIATE");
    expect(rt.failed(out)).toBe(true);
    expect(JSON.stringify(out.error)).toContain("current transaction is aborted");
    expect(await persisted()).toEqual([]);         // the write before the handled failure is lost
  }, LIVE_TIMEOUT_MS);

  test("WITHOUT the savepoint and nothing after it: the COMMIT answered ROLLBACK is a server error, never a success", async () => {
    await reset();
    logs.length = 0;
    const run = rt.envelope(conn, async () => {
      await logA(1);
      await dupK(false);
      return 1;                                    // before s475's COMMIT check: reported success
    }, true, "IMMEDIATE");
    await expect(run).rejects.toThrow(/COMMIT with ROLLBACK/);
    expect(logs.some((l) => l.includes("COMMIT on postgres") && l.includes("failed"))).toBe(true);
    expect(await persisted()).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  test("outside a transaction a handled statement takes no savepoint and changes nothing", async () => {
    await reset();
    const r = await dupK(true);
    expect(rt.failed(r)).toBe(true);
    await logA(9);
    expect(await persisted()).toEqual([9]);
  }, LIVE_TIMEOUT_MS);
});
