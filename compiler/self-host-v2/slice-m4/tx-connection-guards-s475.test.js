// tx-connection-guards-s475.test.js — s475-boot-small-fixes items 3 and 4: server-runtime.js
// `txConnection`, driven through `envelope` with a mock driver (no database needed).
//
// Item 3 (g-boot-runtime-envelope-mysql-unguarded-s475): MySQL envelopes were refused at compile
// time only; at run time `txConnection` would `reserve()` + `BEGIN` on a MySQL pool. Now a driver
// other than SQLite / Postgres is refused in `txConnection` before the driver is opened.
// INTERIM — capable form: a MySQL reserved-connection path proven against a live MySQL server.
// Governing: §19.10.6 "Pooled drivers (Postgres, MySQL — §44.2). A transaction SHALL run on one
// connection taken from the pool for it alone, and every statement of the owning request SHALL run on
// that connection until the transaction ends."
//
// Item 4 (g-boot-reserved-close-unawaited-s475): `reserved.close()` on a transaction not known ended
// was neither awaited nor caught — a rejection was an unhandled rejection. Now `done` awaits it,
// logs its failure, and the envelope releases its gate only after it.
// "red on base" = failed on origin/main be56b6dad.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as rt from "../slice-m1/runtime/server-runtime.js";

let file = 0;
// a Bun.SQL-shaped mock: a tagged-template pool with reserve(); every statement is recorded
function mockDriver({ closeImpl, rollbackFails = false } = {}) {
  const ev = { statements: [], reserved: 0, released: 0, closed: 0, opened: 0 };
  const tag = (strings) => {
    const text = strings.join("?");
    ev.statements.push(text);
    if (rollbackFails && text === "ROLLBACK") return Promise.reject(new Error("connection reset"));
    return Promise.resolve(Object.assign([], { command: text.split(" ")[0] }));
  };
  const reservedHandle = Object.assign((s, ...v) => tag(s, ...v), {
    release: () => { ev.released += 1; },
    close: () => { ev.closed += 1; return closeImpl ? closeImpl() : Promise.resolve(); },
  });
  const pool = Object.assign((s, ...v) => tag(s, ...v), {
    reserve: async () => { ev.reserved += 1; return reservedHandle; },
  });
  return { pool, ev };
}
function connOf(driver, pool, ev, logs) {
  file += 1;
  return rt.connection(
    { connect: () => { ev.opened += 1; return pool; }, log: (l) => logs.push(l) },
    { driver, target: `${driver}://u@127.0.0.1:1/db${file}`, file: `guards${file}.scrml` },
  );
}

const unhandled = [];
const onUnhandled = (e) => { unhandled.push(e); };
beforeAll(() => { process.on("unhandledRejection", onUnhandled); });
afterAll(() => { process.off("unhandledRejection", onUnhandled); });
const settle = () => new Promise((res) => setTimeout(res, 30));

describe("item 3 — txConnection refuses a driver other than SQLite / Postgres (INTERIM)", () => {
  test("a MySQL envelope is refused before the driver is opened: no reserve(), no BEGIN, the body never runs (red on base)", async () => {
    const logs = [];
    const { pool, ev } = mockDriver();
    const conn = connOf("mysql", pool, ev, logs);
    let ran = false;
    await expect(rt.envelope(conn, async () => { ran = true; return 1; }, true, "IMMEDIATE")).rejects.toThrow("is refused");
    expect(ran).toBe(false);
    expect(ev.opened).toBe(0);
    expect(ev.reserved).toBe(0);
    expect(ev.statements).toEqual([]);
    expect(logs.some((l) => l.includes("no connection for a transaction on mysql:"))).toBe(true);
  });
  test("the refusal releases the gate: a second MySQL envelope is refused too, it does not hang (red on base)", async () => {
    const logs = [];
    const { pool, ev } = mockDriver();
    const conn = connOf("mysql", pool, ev, logs);
    await expect(rt.envelope(conn, async () => 1, true, "IMMEDIATE")).rejects.toThrow("is refused");
    await expect(rt.envelope(conn, async () => 2, true, "IMMEDIATE")).rejects.toThrow("is refused");
    expect(ev.reserved).toBe(0);
  });
  test("an unknown driver name is refused the same way (red on base)", async () => {
    const logs = [];
    const { pool, ev } = mockDriver();
    const conn = connOf("oracle", pool, ev, logs);
    await expect(rt.envelope(conn, async () => 1, true, "DEFERRED")).rejects.toThrow("is refused");
    expect(ev.reserved).toBe(0);
  });
  test("Postgres still runs: reserve(), BEGIN, body, COMMIT, release (green on both)", async () => {
    const logs = [];
    const { pool, ev } = mockDriver();
    const conn = connOf("postgres", pool, ev, logs);
    expect(await rt.envelope(conn, async () => 7, true, "IMMEDIATE")).toBe(7);
    expect(ev.reserved).toBe(1);
    expect(ev.statements).toEqual(["BEGIN", "COMMIT"]);
    expect(ev.released).toBe(1);
    expect(ev.closed).toBe(0);
  });
});

describe("item 4 — reserved.close() is awaited and caught", () => {
  test("a close() that rejects is logged, never an unhandled rejection (red on base)", async () => {
    unhandled.length = 0;
    const logs = [];
    const { pool, ev } = mockDriver({ rollbackFails: true, closeImpl: () => Promise.reject(new Error("close blew up")) });
    const conn = connOf("postgres", pool, ev, logs);
    await expect(rt.envelope(conn, async () => { throw new Error("body failed"); }, true, "IMMEDIATE")).rejects.toThrow("body failed");
    await settle();
    expect(ev.closed).toBe(1);                    // ROLLBACK failed: the transaction is not known ended → closed, never released
    expect(ev.released).toBe(0);
    expect(unhandled.map((e) => String(e && e.message))).toEqual([]);
    expect(logs.some((l) => l.includes("giving back the reserved connection") && l.includes("close blew up"))).toBe(true);
  });
  test("the envelope settles only after close() finished (red on base)", async () => {
    const logs = [];
    let closeDone = false;
    const { pool, ev } = mockDriver({ rollbackFails: true, closeImpl: () => new Promise((res) => setTimeout(() => { closeDone = true; res(); }, 20)) });
    const conn = connOf("postgres", pool, ev, logs);
    let closedAtSettle = null;
    await rt.envelope(conn, async () => { throw new Error("body failed"); }, true, "IMMEDIATE").catch(() => { closedAtSettle = closeDone; });
    expect(closedAtSettle).toBe(true);
  });
  test("the gate is released after close(): the next envelope on the same database runs (red on base: bun test fails it on the unhandled close() rejection)", async () => {
    const logs = [];
    const { pool, ev } = mockDriver({ rollbackFails: true, closeImpl: () => Promise.reject(new Error("close blew up")) });
    const conn = connOf("postgres", pool, ev, logs);
    await rt.envelope(conn, async () => { throw new Error("body failed"); }, true, "IMMEDIATE").catch(() => {});
    expect(await rt.envelope(conn, async () => 3, true, "IMMEDIATE")).toBe(3);
    await settle();
  });
});
