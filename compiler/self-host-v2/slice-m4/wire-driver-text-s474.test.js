// wire-driver-text-s474.test.js — s474-boot-immediate-and-wire-blank, item 2 (+ #1703 fix round r1).
//
// Rulings (scrml-support/user-voice-scrml.md):
//   "RULED — S474 review-surfaced decisions 1–7" item 2: "A failed query's error text does not cross
//     the wire. The client receives the error variant with its message blanked; the server logs the
//     full driver text. (Driver text exposes the schema.) A `?{}` handled where it is written still
//     sees the driver text in server code."
//   "RULED — capability over limitation" item 3 (amends item 2): "a dev build keeps the full driver
//     text in the value delivered to the client; a production build blanks it (the server logs it
//     either way)."
//   PA ruling on #1703 r1: ConstraintViolation's field is the COLUMN name only (`email`, never
//     `users.email`), in both builds (impl#1 #1704); the table name and the rest of the driver text
//     stay blanked in production.
//
// THE CONTRACT pinned here (server-runtime.js "THE CONTRACT"): unchanged driver text is withheld
// from a production failure answer — `?` propagation and a verbatim re-wrap (`fail .Bad(m)`, a
// message embedding the WHOLE driver message); text the author handled is the author's — their own
// words (even ones that share a CHECK constraint's name), a column name, and (not tracked, a LOW gap:
// g-boot-wire-driver-text-transformed-not-tracked-s474) a transformed driver text.
//
// The bootstrap's one path that serializes a server-side failure to a client is server-runtime.js
// `handle` (a route's `fail` answer, §19.9.1 / §57.8); a throw answers the fixed 500 body. Production
// is every host that does not pass `dev: true` (a deployed `scrml-boot compile` output); `scrml-boot
// dev` passes it. Against a real SQLite FILE, the RESPONSE BODY (the bytes the client receives) and
// the SERVER LOG are read.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { SQL } from "bun";
import { Database } from "bun:sqlite";
import { compile, serve, post, pathOf } from "./server-artifact-harness.js";

const SQ = "?" + "{";
const INS = `${SQ}\`INSERT INTO users (email) VALUES (\${email})\`}`;
const BADCOL = `${SQ}\`SELECT secret_col FROM users WHERE id = \${a}\`}`;
const CHK = `${SQ}\`INSERT INTO amounts (n) VALUES (\${n})\`}`;
const PROGRAM = `<program db="./app.db">
    type E:enum = { Bad(why: string), QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }
    function signup(email: string)! E {
        ${INS}.run();
        return 1;
    }
    function badColumn(a: int)! E {
        const row = ${BADCOL}.get();
        return 1;
    }
    function checkFails(n: int)! E {
        ${CHK}.run();
        return 1;
    }
    function verbatimMessage(a: int)! E {
        ${BADCOL}.run() !{ .QueryFailed(m) :> { fail .Bad("db: " + m); }, _ :> { fail .Bad("other"); }, };
        return 1;
    }
    function verbatimToken(n: int)! E {
        ${CHK}.run() !{ .ConstraintViolation(f) :> { fail .Bad(f); }, _ :> { fail .Bad("other"); }, };
        return 1;
    }
    function rewrap(email: string)! E {
        ${INS}.run() !{
            .ConstraintViolation(f) :> { fail .Bad("taken: " + f); },
            _ :> { fail .Bad("other"); },
        };
        return 1;
    }
    function positive(n: int)! E {
        ${CHK}.run() !{ _ :> { fail .Bad("the amount must be positive"); }, };
        return 1;
    }
    function namesTheColumn(email: string)! E {
        ${INS}.run() !{ _ :> { fail .Bad("the address you typed (users.email) is taken"); }, };
        return 1;
    }
    function transformed(a: int)! E {
        ${BADCOL}.run() !{ .QueryFailed(m) :> { fail .Bad(m.slice(16)); }, _ :> { fail .Bad("other"); }, };
        return 1;
    }
    function authored(a: int)! E {
        // a query FAILS in this request (its driver text is recorded) — the author's own text is not it
        ${BADCOL}.run() !{ _ :> { fail .QueryFailed("no such user"); }, };
        return 1;
    }
    function handledHere(email: string)! E {
        let seenF: string = "";
        let seenM: string = "";
        ${INS}.run() !{
            .ConstraintViolation(f) :> { seenF = f; },
            _ :> { fail .Bad("other"); },
        };
        const a: int = 1;
        ${BADCOL}.run() !{
            .QueryFailed(m) :> { seenM = m; },
            _ :> { fail .Bad("other"); },
        };
        ${SQ}\`INSERT INTO seen (t) VALUES (\${seenF})\`}.run();
        ${SQ}\`INSERT INTO seen (t) VALUES (\${seenM})\`}.run();
        return 1;
    }
    let <r:int=0/>
    <main>
        <button onclick={ @r = signup("a") !{ _ :> 0, }; }>a</button>
        <button onclick={ @r = badColumn(1) !{ _ :> 0, }; }>b</button>
        <button onclick={ @r = checkFails(1) !{ _ :> 0, }; }>c</button>
        <button onclick={ @r = verbatimMessage(1) !{ _ :> 0, }; }>d</button>
        <button onclick={ @r = verbatimToken(1) !{ _ :> 0, }; }>e</button>
        <button onclick={ @r = rewrap("a") !{ _ :> 0, }; }>f</button>
        <button onclick={ @r = positive(1) !{ _ :> 0, }; }>g</button>
        <button onclick={ @r = namesTheColumn("a") !{ _ :> 0, }; }>h</button>
        <button onclick={ @r = transformed(1) !{ _ :> 0, }; }>i</button>
        <button onclick={ @r = authored(1) !{ _ :> 0, }; }>j</button>
        <button onclick={ @r = handledHere("a") !{ _ :> 0, }; }>k</button>
    </main>
</program>
`;

let dir, file, sql, core;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "s474-wire-"));
  file = join(dir, "app.db");
  const setup = new Database(file);
  setup.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE)");
  setup.exec("CREATE TABLE amounts (n INTEGER, CONSTRAINT positive CHECK (n > 0))");
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
  const prod = build === "production";
  describe(`${build} build`, () => {
    let srv, routes, logs;
    beforeAll(async () => {
      logs = [];
      ({ srv, routes } = await serve(core, sql, logs, { dev: !prod }));
    }, 300000);
    const call = (fn, args) => post(srv, pathOf(routes, fn), args);
    const logged = (s) => logs.some((l) => l.includes(s));
    const blankedLogged = () => logs.some((l) => l.includes("blanked in the response"));

    test("a UNIQUE violation: ConstraintViolation arrives with the COLUMN name only; the table name never; the full text in the server log", async () => {
      logs.length = 0;
      const res = await call("signup", ["taken@example.com"]);
      expect(res.json.__scrml_error).toBe(true);
      expect(res.json.variant).toBe("ConstraintViolation");
      expect(res.json.data).toEqual({ field: "email" });
      expect(res.text).not.toContain("users.email");
      expect(res.text).not.toContain("users");
      expect(res.text).not.toContain("UNIQUE");
      expect(blankedLogged()).toBe(false);   // nothing was withheld: the column is delivered
      expect(logged("UNIQUE constraint failed: users.email")).toBe(true);
    });
    test("a missing column (? propagation): QueryFailed's message blanked in production, full in dev", async () => {
      logs.length = 0;
      const res = await call("badColumn", [1]);
      expect(res.json.variant).toBe("QueryFailed");
      expect(Object.keys(res.json.data)).toEqual(["message"]);
      if (prod) {
        expect(res.text).not.toContain("secret_col");
        expect(res.json.data.message).toBe("");
        expect(blankedLogged()).toBe(true);
      } else {
        expect(res.json.data.message).toContain("secret_col");
      }
      expect(logged("no such column: secret_col")).toBe(true);
    });
    test("a CHECK failure (? propagation): the constraint name is not a column — blanked in production, kept in dev", async () => {
      const res = await call("checkFails", [-1]);
      expect(res.json.variant).toBe("ConstraintViolation");
      expect(res.json.data).toEqual({ field: prod ? "" : "positive" });
    });
    test("a verbatim re-wrap embedding the WHOLE driver message is withheld in production", async () => {
      const res = await call("verbatimMessage", [1]);
      expect(res.json.variant).toBe("Bad");
      expect(res.json.data.why).toBe(prod ? "" : "db: no such column: secret_col");
    });
    test("a verbatim re-wrap of a non-column token (the CHECK's name) is withheld in production", async () => {
      const res = await call("verbatimToken", [-1]);
      expect(res.json.data.why).toBe(prod ? "" : "positive");
    });
    test("the author's handled text around a column name is theirs: delivered in both builds", async () => {
      const res = await call("rewrap", ["taken@example.com"]);
      expect(res.json).toMatchObject({ variant: "Bad", data: { why: "taken: email" } });
    });
    test("#1703 review F2 repro: an author message sharing a CHECK constraint's name is NOT blanked, and no false log line", async () => {
      logs.length = 0;
      const res = await call("positive", [-5]);
      expect(res.json).toMatchObject({ variant: "Bad", data: { why: "the amount must be positive" } });
      expect(blankedLogged()).toBe(false);
      expect(logged("CHECK constraint failed: positive")).toBe(true);
    });
    test("#1703 review F2: an author message that spells `users.email` itself is the author's", async () => {
      const res = await call("namesTheColumn", ["taken@example.com"]);
      expect(res.json.data.why).toBe("the address you typed (users.email) is taken");
    });
    test("NOT tracked (g-boot-wire-driver-text-transformed-not-tracked-s474): driver text the author transforms is the author's", async () => {
      const res = await call("transformed", [1]);
      expect(res.json.data.why).toBe("secret_col");
    });
    test("a failure the author spells (after a failed query in the same request): delivered unchanged in both builds", async () => {
      const res = await call("authored", [3]);
      expect(res.json).toMatchObject({ variant: "QueryFailed", data: { message: "no such user" } });
    });
    test("a `?{}` handled where it is written sees the driver text in server code (the column; the full message)", async () => {
      await sql.unsafe("DELETE FROM seen");
      const res = await call("handledHere", ["taken@example.com"]);
      expect(res.status).toBe(200);
      const db = new Database(file, { readonly: true });
      try {
        expect(db.query("SELECT t FROM seen").all().map((r) => r.t)).toEqual(["email", "no such column: secret_col"]);
      } finally {
        db.close();
      }
    });
  });
}
