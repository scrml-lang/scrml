// envelope-s474.test.js — s474-boot-u1e-envelope: THE TRANSITIVE `!` TRANSACTION ENVELOPE (unit U1e),
// end to end. The bootstrap compiles each program, prints its server artifact, and the artifact runs
// against a REAL SQLite FILE (Bun.SQL, the engine a deployed server runs); every assertion about what
// persisted is a SELECT through a SECOND connection to that file after the request has been answered.
//
// Governing text (compiler/SPEC.md):
//   §8.9.2 (S473 amendments): "when a `!` server function's transitive query set contains two or more
//     `?{}` queries that do not carry `.nobatch()` (through non-`!` and `!` callees, a query counted once
//     per time it is reached …), the compiler SHALL wrap the handler body in `?{BEGIN DEFERRED}` /
//     `?{COMMIT}` (`?{ROLLBACK}` on an exception or a `fail` exit)"; "It SHALL ROLL BACK when the handler
//     throws AND when it exits through `fail` — at any depth of the body — including a `?` that
//     propagates a callee's failure … The failure value is returned to the caller unchanged"; F10 "An
//     inner `!` function called inside an outer envelope runs as a nested savepoint (§19.10.6), so the
//     outer envelope can roll back the inner's writes."
//   §19.10.6: "Concurrent requests SHALL NOT observe or join another request's open transaction"; the
//     gate covers every statement on the connection (S451 R5); Nesting: "its `COMMIT` releases the
//     savepoint and its `ROLLBACK` rolls back to it, and neither commits, ends, or releases the
//     enclosing transaction".
//   §8.9.2 (S451 ruling 4a): a write to another database inside the envelope is E-SQL-011.
// Rulings: user-voice-scrml.md S473 ("the transitive `!` envelope counts QUERIES", "#1690 review: `!`
// callees count …; client multi-call `!` is a permanent refusal", D1 "refuse … never compile it without
// the guarantee", D28 named refusals).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { SQL } from "bun";
import { Database } from "bun:sqlite";
import { mods, compile, serve, post, pathOf } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

const SQ = "?" + "{";
const q = (sql, nb = "") => `${SQ}\`${sql}\`}${nb}.run();`;
const E = "    type E:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }\n";

// Every `!` function below is called from the page, so each is a routed server function.
const PROGRAM = `<program db="./app.db">
${E}
    function logIt(a: int) -> int {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run() !{ _ :> { return 0; } };
        return 1;
    }
    function inner(a: int)! E {
        ${q("INSERT INTO log (a) VALUES (${a})")}
        ${q("INSERT INTO log (a) VALUES (${a + 100})")}
        if (a == 7) fail .Bad;
        return 1;
    }
    function two(a: int)! E {
        ${q("INSERT INTO log (a) VALUES (${a})")}
        ${q("INSERT INTO log (a) VALUES (${a + 1})")}
        if (a > 5) fail .Bad;
        return 1;
    }
    function viaHelper(a: int)! E {
        ${q("INSERT INTO log (a) VALUES (${a})")}
        const x: int = logIt(a + 1);
        if (a > 5) fail .Bad;
        return x;
    }
    function viaBang(a: int, f: int)! E {
        ${q("INSERT INTO log (a) VALUES (${a})")}
        const y: int = inner(a)?;
        if (f > 0) fail .Bad;
        return y;
    }
    function handled(a: int)! E {
        ${q("INSERT INTO log (a) VALUES (${a})")}
        const y: int = inner(7) !{ _ :> 0 };
        ${q("INSERT INTO log (a) VALUES (${a + 1})")}
        return y;
    }
    function loopy(a: int)! E {
        for (let i = 0; i < 3; i = i + 1) {
            ${q("INSERT INTO log (a) VALUES (${a + i})")}
        }
        if (a > 5) fail .Bad;
        return 1;
    }
    function dup(a: int)! E {
        ${q("INSERT INTO log (a) VALUES (${a})")}
        ${q("INSERT INTO uniq (k) VALUES (${a})")}
        return 1;
    }
    let <r:int=0/>
    <main>
        <button onclick={ @r = two(1) !{ _ :> 0, }; }>a</button>
        <button onclick={ @r = viaHelper(1) !{ _ :> 0, }; }>b</button>
        <button onclick={ @r = viaBang(1, 0) !{ _ :> 0, }; }>c</button>
        <button onclick={ @r = handled(1) !{ _ :> 0, }; }>d</button>
        <button onclick={ @r = loopy(1) !{ _ :> 0, }; }>e</button>
        <button onclick={ @r = inner(1) !{ _ :> 0, }; }>f</button>
        <button onclick={ @r = dup(1) !{ _ :> 0, }; }>g</button>
        <button onclick={ @r = logIt(1) !{ _ :> 0, }; }>h</button>
    </main>
</program>
`;

let dir, file, sql, srv, slowSrv, routes, logs, js;
const persisted = () => {
  // a SECOND connection to the file — what any later reader of the database sees
  const db = new Database(file, { readonly: true });
  try {
    return db.query("SELECT a FROM log ORDER BY a").all().map((r) => r.a);
  } finally {
    db.close();
  }
};
const call = async (fn, args) => post(srv, pathOf(routes, fn), args);
// the same server over a driver whose every statement completes on a LATER macrotask (as a
// network or a busy disk does), so concurrent requests really interleave between statements
const slowCall = async (fn, args) => post(slowSrv, pathOf(routes, fn), args);
const reset = async () => { await sql.unsafe("DELETE FROM log"); await sql.unsafe("DELETE FROM uniq"); };

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "s474-envelope-"));
  file = join(dir, "app.db");
  sql = new SQL("sqlite://" + file);
  await sql.unsafe("CREATE TABLE log (a INTEGER)");
  await sql.unsafe("CREATE TABLE uniq (k INTEGER PRIMARY KEY)");
  const r = compile(PROGRAM);
  logs = [];
  ({ srv, routes, js } = await serve(r.core, sql, logs));
  const slow = (strings, ...values) => new Promise((res) => setTimeout(res, 1)).then(() => sql(strings, ...values));
  ({ srv: slowSrv } = await serve(r.core, slow, []));
}, 300000);

afterAll(async () => {
  await sql.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("the emitted server: the body inside rt.envelope", () => {
  test("each `!` function with a set of 2+ queries is wrapped standalone; the inner `!` too", () => {
    for (const fn of ["two", "viaHelper", "viaBang", "handled", "loopy", "inner", "dup"]) {
      // (a source name the printer must rename — `handled` — keeps its name as the prefix)
      expect([fn, new RegExp(`async function ${fn}\\w*\\(`).test(js)]).toEqual([fn, true]);
    }
    expect(js).toContain("return await rt.envelope(db$");
    expect(js.match(/rt\.envelope\(db\$\d+, body\$, true\)/g).length).toBe(7);
    // the non-`!` helper is not wrapped (§8.9.2: only a `!` function)
    expect(/async function logIt\(a\) \{\n\s+async function body\$/.test(js)).toBe(false);
  });
});

describe("two queries in the body (§8.9.2)", () => {
  test("success → both persisted", async () => {
    await reset();
    const res = await call("two", [1]);
    expect(res.status).toBe(200);
    expect(persisted()).toEqual([1, 2]);
  });
  test("`fail` after both writes → nothing persisted, the failure answered unchanged", async () => {
    await reset();
    const res = await call("two", [6]);
    expect(res.status).toBe(500);
    expect(res.json).toMatchObject({ __scrml_error: true, type: "E", variant: "Bad" });
    expect(persisted()).toEqual([]);
  });
});

describe("one query direct + one through a non-`!` callee", () => {
  test("success → both", async () => {
    await reset();
    expect((await call("viaHelper", [1])).status).toBe(200);
    expect(persisted()).toEqual([1, 2]);
  });
  test("`fail` → the callee's write is rolled back too", async () => {
    await reset();
    expect((await call("viaHelper", [6])).status).toBe(500);
    expect(persisted()).toEqual([]);
  });
});

describe("through a `!` callee — a nested savepoint (F10, §19.10.6)", () => {
  test("success → the outer's and the inner's writes", async () => {
    await reset();
    expect((await call("viaBang", [1, 0])).status).toBe(200);
    expect(persisted()).toEqual([1, 1, 101]);
  });
  test("the OUTER fails after the inner succeeded → the outer rolls back the inner's writes", async () => {
    await reset();
    expect((await call("viaBang", [1, 1])).status).toBe(500);
    expect(persisted()).toEqual([]);
  });
  test("the inner fails and `?` propagates it → everything rolled back", async () => {
    await reset();
    const res = await call("viaBang", [7, 0]);
    expect(res.json).toMatchObject({ variant: "Bad" });
    expect(persisted()).toEqual([]);
  });
  test("the inner fails and the outer HANDLES it → the inner's savepoint is undone, the outer commits", async () => {
    await reset();
    const res = await call("handled", [1]);
    expect(res.status).toBe(200);
    expect(res.json).toBe(0);
    expect(persisted()).toEqual([1, 2]);
  });
  test("the inner called on its own route is its own transaction", async () => {
    await reset();
    expect((await call("inner", [7])).status).toBe(500);
    expect(persisted()).toEqual([]);
    expect((await call("inner", [1])).status).toBe(200);
    expect(persisted()).toEqual([1, 101]);
  });
});

describe("a query inside a loop", () => {
  test("success → every iteration's write; `fail` after the loop → none", async () => {
    await reset();
    expect((await call("loopy", [1])).status).toBe(200);
    expect(persisted()).toEqual([1, 2, 3]);
    await reset();
    expect((await call("loopy", [6])).status).toBe(500);
    expect(persisted()).toEqual([]);
  });
});

describe("a failed query propagated by the body (`?{}` in a `!` function is `?`-propagated, §19.8.2)", () => {
  test("a UNIQUE violation after a write → the earlier write rolled back", async () => {
    await reset();
    expect((await call("dup", [1])).status).toBe(200);
    expect(persisted()).toEqual([1]);
    const res = await call("dup", [1]);
    expect(res.json).toMatchObject({ variant: "ConstraintViolation" });
    expect(persisted()).toEqual([1]);   // the second call's log row is gone with its transaction
  });
});

describe("§19.10.6: concurrent requests do not share a transaction", () => {
  test("ten interleaved requests, half failing: exactly the successful ones persist, each whole", async () => {
    await reset();
    const reqs = [];
    for (let i = 0; i < 10; i++) reqs.push(slowCall("loopy", [i % 2 === 0 ? 1 : 6]));
    const out = await Promise.all(reqs);
    expect(out.filter((r) => r.status === 200).length).toBe(5);
    expect(out.filter((r) => r.status === 500).length).toBe(5);
    expect(persisted()).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3]);
  });
  test("an autocommit write from another request, issued while an envelope is open, waits at the gate and persists (S451 R5)", async () => {
    // without the gate it would run INSIDE the failing envelope's transaction and be rolled back with it
    await reset();
    const reqs = [];
    for (let i = 0; i < 6; i++) reqs.push(slowCall("loopy", [6]));
    // each plain write arrives while one of the (serialized, failing) envelopes is open
    const later = (ms, f) => new Promise((res) => setTimeout(res, ms)).then(f);
    for (let i = 0; i < 6; i++) reqs.push(later(3 + 4 * i, () => slowCall("logIt", [50 + i])));
    const out = await Promise.all(reqs);
    expect(out.filter((r) => r.status === 200).length).toBe(6);
    expect(persisted()).toEqual([50, 51, 52, 53, 54, 55]);
  });
});

// ---------------------------------------------------------------------------
// What the bootstrap does NOT build stays a NAMED refusal (S473 D1 / D28) — never compiled unguarded.
const fe = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const errsOf = (src) => fe(src).diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info").map((d) => d.code);
const msgOf = (src, code) => fe(src).diags.find((d) => d.code === code).message;
const page = (calls) => `    let <r:int=0/>\n    <main>${calls.map((c, i) => `<button onclick={ @r = ${c} !{ _ :> 0, }; }>b${i}</button>`).join("")}</main>\n`;
const one = (n) => `    function ${n}(a: int)! E {\n        ${q("INSERT INTO log (a) VALUES (${a})")}\n        return 1;\n    }\n`;

describe("still refused, each with its named code", () => {
  test("a write to ANOTHER database inside the envelope — E-SQL-011 (§8.9.2, S451 4a)", () => {
    const src = `<program db="./a.db">\n${E}    <db src="./b.db">\n        function logB(a: int) -> int {\n            ${SQ}\`INSERT INTO blog (a) VALUES (\${a})\`}.run() !{ _ :> { return 0; } };\n            return 1;\n        }\n    </db>\n    function move(a: int)! E {\n        ${q("UPDATE acct SET n = n - ${a}")}\n        ${q("UPDATE acct SET n = n + ${a}")}\n        const x: int = logB(a);\n        return x;\n    }\n${page(["move(1)"])}</program>\n`;
    expect(errsOf(src)).toEqual(["E-SQL-011"]);
    expect(msgOf(src, "E-SQL-011")).toContain("holds a transaction on `./a.db`");
    expect(msgOf(src, "E-SQL-011")).toContain("writes `./b.db`");
  });
  test("a READ of another database inside the envelope — E-BOOTSTRAP-UNSUPPORTED (cross-database gates not built)", () => {
    const src = `<program db="./a.db">\n${E}    type C:struct = { c: int }\n    <db src="./b.db">\n        function readB(a: int) -> int {\n            const n: C | not = ${SQ}\`SELECT count(*) AS c FROM blog\`}.get() !{ _ :> { return 0; } };\n            return 1;\n        }\n    </db>\n    function move(a: int)! E {\n        ${q("UPDATE acct SET n = n - ${a}")}\n        ${q("UPDATE acct SET n = n + ${a}")}\n        const x: int = readB(a);\n        return x;\n    }\n${page(["move(1)"])}</program>\n`;
    expect(errsOf(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(msgOf(src, "E-BOOTSTRAP-UNSUPPORTED")).toContain("reads `./b.db`");
  });
  test("an envelope on a pooled (Postgres) database — E-BOOTSTRAP-UNSUPPORTED (no reserved pool connection)", () => {
    const src = `<program db="postgres://localhost/app">\n${E}    function move(a: int)! E {\n        ${q("UPDATE acct SET n = n - ${a}")}\n        ${q("UPDATE acct SET n = n + ${a}")}\n        return 1;\n    }\n${page(["move(1)"])}</program>\n`;
    expect(errsOf(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(msgOf(src, "E-BOOTSTRAP-UNSUPPORTED")).toContain("pooled");
  });
  test("a CLIENT `!` whose one server call runs 2 queries in a NON-`!` function — E-BOOTSTRAP-UNSUPPORTED naming the fix", () => {
    const both = `    function both(a: int) -> int {\n        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run() !{ _ :> { return 0; } };\n        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run() !{ _ :> { return 0; } };\n        return 1;\n    }\n`;
    const src = `<program db="./app.db">\n${E}${both}    function move(a: int)! E {\n        const y: int = both(a) !{ _ :> { return 0; } };\n        if (y == 0) fail .Bad;\n        return y;\n    }\n${page(["move(1)"])}</program>\n`;
    expect(errsOf(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(msgOf(src, "E-BOOTSTRAP-UNSUPPORTED")).toContain("Declare `both()` with '!'");
  });
  test("near-miss: the same client `!` calling a `!` server function compiles — that function's own envelope holds both", () => {
    const both = `    function both(a: int)! E {\n        ${q("INSERT INTO log (a) VALUES (${a})")}\n        ${q("INSERT INTO log (a) VALUES (${a})")}\n        return 1;\n    }\n`;
    const src = `<program db="./app.db">\n${E}${both}    function move(a: int)! E {\n        const y: int = both(a) !{ _ :> { return 0; } };\n        if (y == 0) fail .Bad;\n        return y;\n    }\n${page(["move(1)"])}</program>\n`;
    expect(errsOf(src)).toEqual([]);
    expect(compile(src).core.envelopes.find((e) => e.fn.hint === "both").standalone).toBe(true);
  });
  test("a client-placed `!` making two server calls — the permanent E-TX-CLIENT-MULTI-CALL (§19.10.5)", () => {
    const src = `<program db="./app.db">\n${E}${one("s1")}${one("s2")}    function move(a: int)! E {\n        const x: int = s1(a) !{ _ :> { return 0; } };\n        const y: int = s2(a) !{ _ :> { return 0; } };\n        return x + y;\n    }\n${page(["move(1)"])}</program>\n`;
    expect(errsOf(src)).toEqual(["E-TX-CLIENT-MULTI-CALL"]);
  });
  test("`PRAGMA journal_mode = OFF` on a `!` function's connection — E-SQL-JOURNAL-OFF", () => {
    const src = `<program db="./app.db">\n${E}    function move(a: int)! E {\n        ${q("PRAGMA journal_mode = OFF")}\n        ${q("UPDATE acct SET n = n + ${a}")}\n        return 1;\n    }\n${page(["move(1)"])}</program>\n`;
    expect(errsOf(src)).toEqual(["E-SQL-JOURNAL-OFF"]);
  });
  test("manual `?{BEGIN}` in a `!` function — E-BOOTSTRAP-UNSUPPORTED (the invocation-held manual transaction is not built)", () => {
    const src = `<program db="./app.db">\n${E}    function move(a: int)! E {\n        ${q("BEGIN")}\n        ${q("UPDATE acct SET n = n + ${a}")}\n        ${q("COMMIT")}\n        return 1;\n    }\n${page(["move(1)"])}</program>\n`;
    expect(errsOf(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
    expect(fe(src).core).toBeFalsy();
  });
  test("`transaction { … }` (and so a `navigate()` inside one) — refused", () => {
    const src = `<program db="./app.db">\n${E}    function move(a: int)! E {\n        transaction {\n            ${q("UPDATE acct SET n = n + ${a}")}\n            navigate("/done");\n        }\n        return 1;\n    }\n${page(["move(1)"])}</program>\n`;
    expect(errsOf(src)).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(fe(src).core).toBeFalsy();
  });
});

describe("F11 counts CLIENT requests only: a server-only (inherited) `!` helper calls in place", () => {
  test("routed `!` top → `!` helper only it calls → two `!` server functions: envelopes, no E-TX-CLIENT-MULTI-CALL", () => {
    const src = `<program db="./app.db">\n${E}${one("s1")}${one("s2")}    function mid(a: int)! E {\n        const x: int = s1(a)?;\n        const y: int = s2(a)?;\n        return x + y;\n    }\n    function top(a: int)! E {\n        ${q("INSERT INTO log (a) VALUES (${a})", ".nobatch()")}\n        const z: int = mid(a)?;\n        return z;\n    }\n${page(["top(1)"])}</program>\n`;
    expect(errsOf(src)).toEqual([]);
    const env = compile(src).core.envelopes;
    expect(env.find((e) => e.fn.hint === "top").standalone).toBe(true);
    expect(env.find((e) => e.fn.hint === "mid").standalone).toBe(true);
    expect(env.find((e) => e.fn.hint === "s1").standalone).toBe(false);
  });
});
