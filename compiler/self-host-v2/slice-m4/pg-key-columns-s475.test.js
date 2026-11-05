// pg-key-columns-s475.test.js — s475-boot-small-fixes item 5 part (a)
// (g-boot-pg-constraint-field-fallbacks-s475): server-runtime.js `pgKeyColumns` reads Postgres's
// `detail` key list quote-aware.
//
// §19.8 (S474): "`ConstraintViolation`'s `field` is the COLUMN name only, in both builds … `email`,
// not `users.email`; a composite UNIQUE gives `a, b`."
// Before: the list was split on ", ", so a quoted column holding ", " (`Key ("Weird, col")=(x)`)
// failed the identifier test and fell back to the constraint name (`column: false`).
//
// The unit half uses error objects shaped as Bun 1.4.3's PostgresError (sql-error-pg-s475.test.js).
// The live half raises the errors from a real Postgres; SKIPPED unless SCRML_TEST_PG_URL is set, e.g.
//   SCRML_TEST_PG_URL=postgres://postgres:postgres@127.0.0.1:54473/postgres bun test <this file>
// (measured on PGlite through pglite-socket; `prepare: false` — PGlite shares one backend session).
// "red on base" = failed on origin/main be56b6dad.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { SQL } from "bun";
import * as srt from "../slice-m1/runtime/server-runtime.js";

const pg = (errno, extra) => Object.assign(new Error(extra.message), { name: "PostgresError", code: "ERR_POSTGRES_SERVER_ERROR", errno, severity: "ERROR", schema: "public", column: 27, ...extra });
const cv = (detail) => srt.sqlErrorOf(pg("23505", { message: "duplicate key", detail, constraint: "t_key" }));

describe("pgKeyColumns reads the key list quote-aware (§19.8)", () => {
  test("a quoted column holding `, ` is ONE column (red on base)", () => {
    expect(cv('Key ("Weird, col")=(x) already exists.')).toEqual({ variant: "ConstraintViolation", data: ["Weird, col"] });
  });
  test("a quoted column holding `)=(` is one column (red on base)", () => {
    expect(cv('Key ("a)=(b")=(x) already exists.')).toEqual({ variant: "ConstraintViolation", data: ["a)=(b"] });
  });
  test("a quoted column with a doubled quote, beside a plain one (green on both)", () => {
    expect(cv('Key ("say ""hi""", b)=(x, 1) already exists.')).toEqual({ variant: "ConstraintViolation", data: ['say "hi", b'] });
  });
  test("a quoted `, ` column beside a plain one: two columns (red on base)", () => {
    expect(cv('Key (a, "Weird, col")=(1, x) already exists.')).toEqual({ variant: "ConstraintViolation", data: ["a, Weird, col"] });
  });
  test("still the constraint name for an expression index, an unterminated quote, a translated detail (green on both)", () => {
    expect(cv("Key (lower(email::text))=(a) already exists.")).toEqual({ variant: "ConstraintViolation", data: ["t_key"] });
    expect(cv('Key ("open)=(x) already exists.')).toEqual({ variant: "ConstraintViolation", data: ["t_key"] });
    expect(cv('Key ("")=(x) already exists.')).toEqual({ variant: "ConstraintViolation", data: ["t_key"] });
    expect(cv("Schlüssel »(c)=(a)« existiert bereits.")).toEqual({ variant: "ConstraintViolation", data: ["t_key"] });
    expect(cv("Key (a b)=(1) already exists.")).toEqual({ variant: "ConstraintViolation", data: ["t_key"] });
  });
  test("plain and composite lists unchanged (green on both)", () => {
    expect(cv("Key (c)=(a) already exists.")).toEqual({ variant: "ConstraintViolation", data: ["c"] });
    expect(cv("Key (a, b)=(1, 2) already exists.")).toEqual({ variant: "ConstraintViolation", data: ["a, b"] });
  });
});

const URL = process.env.SCRML_TEST_PG_URL ?? "";
const PG_OK = URL !== "" && process.env.SCRML_PGTEST !== "0";
if (!PG_OK) {
  // eslint-disable-next-line no-console
  console.log("[pg-key-columns-s475] SCRML_TEST_PG_URL not set — skipping the live Postgres half.");
}
const d = PG_OK ? describe : describe.skip;
const LIVE_TIMEOUT_MS = 60_000;
const T = `s475k_${process.pid}`;

d("live Postgres: the column of a real unique violation", () => {
  let admin;
  beforeAll(async () => {
    admin = new SQL({ url: URL, max: 1, prepare: false });
    await admin.unsafe(`DROP TABLE IF EXISTS ${T}`);
    await admin.unsafe(`CREATE TABLE ${T} ("Weird, col" TEXT UNIQUE, a INTEGER, "x)=(y" INTEGER, UNIQUE (a, "x)=(y"))`);
    await admin.unsafe(`INSERT INTO ${T} ("Weird, col", a, "x)=(y") VALUES ('dup', 1, 2)`);
  }, LIVE_TIMEOUT_MS);
  afterAll(async () => {
    if (admin) {
      await admin.unsafe(`DROP TABLE IF EXISTS ${T}`).catch(() => {});
      await admin.close().catch(() => {});
    }
  });
  const raised = async (text) => {
    try { await admin.unsafe(text); } catch (e) { return e; }
    throw new Error("expected a constraint violation");
  };
  test("`\"Weird, col\"` UNIQUE: field `Weird, col`, a column (red on base)", async () => {
    const e = await raised(`INSERT INTO ${T} ("Weird, col", a, "x)=(y") VALUES ('dup', 9, 9)`);
    expect(String(e.detail)).toContain('"Weird, col"');
    expect(srt.sqlErrorOf(e)).toEqual({ variant: "ConstraintViolation", data: ["Weird, col"] });
  }, LIVE_TIMEOUT_MS);
  test("composite UNIQUE (a, \"x)=(y\"): field `a, x)=(y` (red on base)", async () => {
    const e = await raised(`INSERT INTO ${T} ("Weird, col", a, "x)=(y") VALUES ('other', 1, 2)`);
    expect(srt.sqlErrorOf(e)).toEqual({ variant: "ConstraintViolation", data: ["a, x)=(y"] });
  }, LIVE_TIMEOUT_MS);
});
