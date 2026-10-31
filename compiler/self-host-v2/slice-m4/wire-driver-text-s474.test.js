// wire-driver-text-s474.test.js — s474-boot-immediate-and-wire-blank, item 2.
//
// Rulings (scrml-support/user-voice-scrml.md):
//   "RULED — S474 review-surfaced decisions 1–7" item 2: "A failed query's error text does not cross
//     the wire. The client receives the error variant with its message blanked; the server logs the
//     full driver text. (Driver text exposes the schema.) A `?{}` handled where it is written still
//     sees the driver text in server code."
//   "RULED — capability over limitation" item 3 (amends item 2): "a dev build keeps the full driver
//     text in the value delivered to the client; a production build blanks it (the server logs it
//     either way)."
//
// The bootstrap's one path that serializes a server-side failure to a client is server-runtime.js
// `handle` (a route's `fail` answer, §19.9.1 / §57.8); a throw answers the fixed 500 body. Production
// is every host that does not pass `dev: true` (a deployed `scrml-boot compile` output); `scrml-boot
// dev` passes it. Against a real SQLite FILE, a UNIQUE violation naming `users.email` and a query
// naming a missing column `secret_col` are driven through the route, and the RESPONSE BODY (the
// bytes the client receives) and the SERVER LOG are read.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { SQL } from "bun";
import { Database } from "bun:sqlite";
import { compile, serve, post, pathOf } from "./server-artifact-harness.js";

const SQ = "?" + "{";
const PROGRAM = `<program db="./app.db">
    type E:enum = { Bad(why: string), QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }
    function signup(email: string)! E {
        ${SQ}\`INSERT INTO users (email) VALUES (\${email})\`}.run();
        return 1;
    }
    function badColumn(a: int)! E {
        const row = ${SQ}\`SELECT secret_col FROM users WHERE id = \${a}\`}.get();
        return 1;
    }
    function rewrap(email: string)! E {
        ${SQ}\`INSERT INTO users (email) VALUES (\${email})\`}.run() !{
            .ConstraintViolation(f) :> { fail .Bad("taken: " + f); },
            _ :> { fail .Bad("other"); },
        };
        return 1;
    }
    function authored(a: int)! E {
        // a query FAILS in this request (its driver text is recorded) — the author's own text is not it
        ${SQ}\`SELECT secret_col FROM users WHERE id = \${a}\`}.run() !{ _ :> { fail .QueryFailed("no such user"); }, };
        return 1;
    }
    function handledHere(email: string)! E {
        let seenF: string = "";
        ${SQ}\`INSERT INTO users (email) VALUES (\${email})\`}.run() !{
            .ConstraintViolation(f) :> { seenF = f; },
            _ :> { fail .Bad("other"); },
        };
        ${SQ}\`INSERT INTO seen (t) VALUES (\${seenF})\`}.run();
        return 1;
    }
    let <r:int=0/>
    <main>
        <button onclick={ @r = signup("a") !{ _ :> 0, }; }>a</button>
        <button onclick={ @r = badColumn(1) !{ _ :> 0, }; }>b</button>
        <button onclick={ @r = rewrap("a") !{ _ :> 0, }; }>c</button>
        <button onclick={ @r = authored(1) !{ _ :> 0, }; }>d</button>
        <button onclick={ @r = handledHere("a") !{ _ :> 0, }; }>e</button>
    </main>
</program>
`;

let dir, file, sql, core;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "s474-wire-"));
  file = join(dir, "app.db");
  const setup = new Database(file);
  setup.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE)");
  setup.exec("CREATE TABLE seen (t TEXT)");
  setup.exec("INSERT INTO users (email) VALUES ('taken@example.com')");
  setup.close();
  sql = new SQL("sqlite://" + file);
  core = compile(PROGRAM).core;
}, 300000);
afterAll(async () => {
  await sql.close();
  rmSync(dir, { recursive: true, force: true });
});

for (const build of ["production", "dev"]) {
  describe(`${build} build`, () => {
    let srv, routes, logs;
    beforeAll(async () => {
      logs = [];
      ({ srv, routes } = await serve(core, sql, logs, { dev: build === "dev" }));
    }, 300000);
    const call = (fn, args) => post(srv, pathOf(routes, fn), args);
    const logged = (s) => logs.some((l) => l.includes(s));

    test("a UNIQUE violation naming users.email: the variant arrives; the schema name only in dev; the server log always", async () => {
      logs.length = 0;
      const res = await call("signup", ["taken@example.com"]);
      expect(res.json.__scrml_error).toBe(true);
      expect(res.json.variant).toBe("ConstraintViolation");
      expect(Object.keys(res.json.data)).toEqual(["field"]);
      expect(typeof res.json.data.field).toBe("string");
      if (build === "production") {
        expect(res.text).not.toContain("users.email");
        expect(res.text).not.toContain("users");
        expect(res.text).not.toContain("UNIQUE");
        expect(res.json.data.field).toBe("");
        expect(logged("blanked in the response")).toBe(true);
      } else {
        expect(res.json.data.field).toBe("users.email");
      }
      expect(logged("UNIQUE constraint failed: users.email")).toBe(true);
    });
    test("a missing column: QueryFailed arrives with its message blanked in production, full in dev", async () => {
      logs.length = 0;
      const res = await call("badColumn", [1]);
      expect(res.json.variant).toBe("QueryFailed");
      expect(Object.keys(res.json.data)).toEqual(["message"]);
      if (build === "production") {
        expect(res.text).not.toContain("secret_col");
        expect(res.json.data.message).toBe("");
      } else {
        expect(res.json.data.message).toContain("secret_col");
      }
      expect(logged("secret_col")).toBe(true);
    });
    test("driver text re-wrapped by the author into another variant is blanked too (origin, not variant name)", async () => {
      logs.length = 0;
      const res = await call("rewrap", ["taken@example.com"]);
      expect(res.json.variant).toBe("Bad");
      if (build === "production") {
        expect(res.text).not.toContain("users.email");
        expect(res.json.data.why).toBe("");
      } else {
        expect(res.json.data.why).toBe("taken: users.email");
      }
    });
    test("a failure the author spells is not driver text (even after a failed query in the same request): delivered unchanged in both builds", async () => {
      const res = await call("authored", [3]);
      expect(res.json).toMatchObject({ variant: "QueryFailed", data: { message: "no such user" } });
    });
    test("a `?{}` handled where it is written sees the full driver text in server code", async () => {
      await sql.unsafe("DELETE FROM seen");
      const res = await call("handledHere", ["taken@example.com"]);
      expect(res.status).toBe(200);
      const db = new Database(file, { readonly: true });
      try {
        expect(db.query("SELECT t FROM seen").all().map((r) => r.t)).toEqual(["users.email"]);
      } finally {
        db.close();
      }
    });
  });
}
