// sql-error-pg-s475.test.js — s475-boot-pg-envelopes, part 2: a Postgres / MySQL driver error is
// classified by the codes Bun.SQL actually sets (g-boot-pg-constraint-violation-misclassified-s475).
//
// §19.8.1: `SqlError` is `QueryFailed(message) | ConstraintViolation(field) | ConnectionLost`.
// §19.8 (S474): "`ConstraintViolation`'s `field` is the COLUMN name only, in both builds … `email`,
// not `users.email`; a composite UNIQUE gives `a, b`. … A field that is not exactly a `table.col` list —
// a CHECK constraint's name or expression, an expression index, a Postgres constraint name — is not a
// column: server code still sees it, and a production build blanks it in the delivered value."
//
// The error objects below are the fields Bun 1.4.3's PostgresError carried against a real Postgres
// (PGlite / PostgreSQL 18 through pglite-socket), copied from a probe — `code` is
// "ERR_POSTGRES_SERVER_ERROR" and the SQLSTATE is in `errno`; `column` is Bun's JS stack column (a
// number) unless the server sent a column. RED before s475: the runtime read only `e.code`, so every
// one of these was QueryFailed. The live half (the same errors raised by a real server, through a
// compiled program) is pg-envelope-s475.test.js, skipped without SCRML_TEST_PG_URL.

import { describe, test, expect } from "bun:test";
import * as srt from "../slice-m1/runtime/server-runtime.js";

const pg = (errno, extra) => Object.assign(new Error(extra.message), { name: "PostgresError", code: "ERR_POSTGRES_SERVER_ERROR", errno, severity: "ERROR", schema: "public", line: "673", column: 27, ...extra });

describe("Postgres (Bun.SQL): the SQLSTATE is in `errno`", () => {
  test("a unique violation is ConstraintViolation, its field the column from `detail`", () => {
    const e = pg("23505", { message: 'duplicate key value violates unique constraint "t1_c_key"', detail: "Key (c)=(a) already exists.", table: "t1", constraint: "t1_c_key" });
    expect(srt.sqlErrorOf(e)).toEqual({ variant: "ConstraintViolation", data: ["c"] });
  });
  test("a primary-key violation: the key column", () => {
    const e = pg("23505", { message: 'duplicate key value violates unique constraint "t1_pkey"', detail: "Key (k)=(1) already exists.", table: "t1", constraint: "t1_pkey" });
    expect(srt.sqlErrorOf(e)).toEqual({ variant: "ConstraintViolation", data: ["k"] });
  });
  test("a composite unique: `a, b` (as SQLite gives it); a quoted column is unquoted", () => {
    const e = pg("23505", { message: "duplicate key", detail: "Key (a, b)=(1, 2) already exists.", constraint: "t_a_b_key" });
    expect(srt.sqlErrorOf(e)).toEqual({ variant: "ConstraintViolation", data: ["a, b"] });
    const q = pg("23505", { message: "duplicate key", detail: 'Key ("Email Addr")=(x) already exists.', constraint: "t_key" });
    expect(srt.sqlErrorOf(q)).toEqual({ variant: "ConstraintViolation", data: ["Email Addr"] });
  });
  test("a foreign-key violation: the referencing column", () => {
    const e = pg("23503", { message: 'insert or update on table "post" violates foreign key constraint "post_author_fkey"', detail: 'Key (author)=(5) is not present in table "users".', constraint: "post_author_fkey" });
    expect(srt.sqlErrorOf(e)).toEqual({ variant: "ConstraintViolation", data: ["author"] });
  });
  test("a NOT NULL violation: the server's `column` (a string)", () => {
    const e = pg("23502", { message: 'null value in column "n" of relation "t1" violates not-null constraint', detail: "Failing row contains (3, c, null).", column: "n" });
    expect(srt.sqlErrorOf(e)).toEqual({ variant: "ConstraintViolation", data: ["n"] });
  });
  test("not a column: a CHECK's constraint name; an expression index; a translated `detail` — the constraint name", () => {
    const chk = pg("23514", { message: 'new row for relation "t1" violates check constraint "pos"', detail: "Failing row contains (4, d, -1).", constraint: "pos" });
    expect(srt.sqlErrorOf(chk)).toEqual({ variant: "ConstraintViolation", data: ["pos"] });
    const expr = pg("23505", { message: "duplicate key", detail: "Key (lower(email::text))=(a) already exists.", constraint: "users_lower_idx" });
    expect(srt.sqlErrorOf(expr)).toEqual({ variant: "ConstraintViolation", data: ["users_lower_idx"] });
    const de = pg("23505", { message: "doppelter Schlüsselwert", detail: "Schlüssel »(c)=(a)« existiert bereits.", constraint: "t1_c_key" });
    expect(srt.sqlErrorOf(de)).toEqual({ variant: "ConstraintViolation", data: ["t1_c_key"] });
  });
  test("a syntax error is QueryFailed with the driver's message; `current transaction is aborted` too", () => {
    const e = Object.assign(new Error('syntax error at or near "SELEC"'), { code: "ERR_POSTGRES_SYNTAX_ERROR", errno: "42601" });
    expect(srt.sqlErrorOf(e)).toEqual({ variant: "QueryFailed", data: ['syntax error at or near "SELEC"'] });
    const ab = pg("25P02", { message: "current transaction is aborted, commands ignored until end of transaction block" });
    expect(srt.sqlErrorOf(ab)).toMatchObject({ variant: "QueryFailed" });
  });
  test("connection ends: class 08, admin shutdown, Bun's connection codes", () => {
    expect(srt.sqlErrorOf(pg("57P01", { message: "terminating connection due to administrator command" }))).toBe("ConnectionLost");
    expect(srt.sqlErrorOf(pg("08006", { message: "connection failure" }))).toBe("ConnectionLost");
    expect(srt.sqlErrorOf(Object.assign(new Error("Connection closed"), { code: "ERR_POSTGRES_CONNECTION_CLOSED" }))).toBe("ConnectionLost");
    expect(srt.sqlErrorOf(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))).toBe("ConnectionLost");
  });
});

describe("MySQL (Bun.SQL): the number in `errno`, the SQLSTATE in `sqlState`", () => {
  test("a duplicate key by name, by number, by SQLSTATE", () => {
    expect(srt.sqlErrorOf({ code: "ER_DUP_ENTRY", errno: 1062, sqlState: "23000", message: "Duplicate entry 'a' for key 't.c'" })).toMatchObject({ variant: "ConstraintViolation" });
    expect(srt.sqlErrorOf({ code: "ERR_MYSQL_SERVER_ERROR", errno: 1062, message: "Duplicate entry" })).toMatchObject({ variant: "ConstraintViolation" });
    expect(srt.sqlErrorOf({ code: "ERR_MYSQL_SERVER_ERROR", sqlState: "23000", message: "Duplicate entry" })).toMatchObject({ variant: "ConstraintViolation" });
  });
});

describe("SQLite: unchanged", () => {
  test("SQLITE_CONSTRAINT_* → ConstraintViolation(the column); SQLITE_CANTOPEN → ConnectionLost; else QueryFailed", () => {
    expect(srt.sqlErrorOf({ code: "SQLITE_CONSTRAINT_UNIQUE", message: "UNIQUE constraint failed: users.email" })).toEqual({ variant: "ConstraintViolation", data: ["email"] });
    expect(srt.sqlErrorOf({ code: "SQLITE_CANTOPEN", message: "unable to open database file" })).toBe("ConnectionLost");
    expect(srt.sqlErrorOf({ code: "SQLITE_IOERR_WRITE", message: "disk I/O error" })).toBe("ConnectionLost");
    expect(srt.sqlErrorOf({ code: "SQLITE_ERROR", message: "no such table: x" })).toEqual({ variant: "QueryFailed", data: ["no such table: x"] });
  });
});
