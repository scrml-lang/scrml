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
import { mkdtempSync, rmSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { SQL } from "bun";
import { Database } from "bun:sqlite";
import { mods, compile, serve, post, pathOf, artifacts, loadServer, plainRespond } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import * as rt from "../slice-m1/runtime/server-runtime.js";

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
    function trap(a: int)! E {
        ${q("INSERT INTO log (a) VALUES (${a})")}
        ${q("INSERT INTO log (a) VALUES (${a + 1})")}
        const xs: int[] = [1, 2];
        return xs[a];
    }
    let <r:int=0/>
    <main>
        <button onclick={ @r = trap(1) !{ _ :> 0, }; }>t</button>
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
    for (const fn of ["two", "viaHelper", "viaBang", "handled", "loopy", "inner", "dup", "trap"]) {
      // (a source name the printer must rename — `handled` — keeps its name as the prefix)
      expect([fn, new RegExp(`async function ${fn}\\w*\\(`).test(js)]).toEqual([fn, true]);
    }
    expect(js).toContain("return await rt.envelope(db$");
    expect(js.match(/rt\.envelope\(db\$\d+, body\$, true, "IMMEDIATE"\)/g).length).toBe(8);
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

describe("a trap (a thrown host error) after the writes", () => {
  test("an out-of-range index read traps → 500, nothing persisted; in range → committed", async () => {
    await reset();
    const res = await call("trap", [5]);
    expect(res.status).toBe(500);
    expect(logs.some((l) => l.includes("E-INDEX-OUT-OF-RANGE-RT"))).toBe(true);
    expect(persisted()).toEqual([]);
    expect((await call("trap", [1])).status).toBe(200);
    expect(persisted()).toEqual([1, 2]);
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
  // s474-boot-client-bang-composition (S474 ruling, capability over limitation item 2): this was
  // E-BOOTSTRAP-UNSUPPORTED ("Declare `both()` with '!'"); the call now runs inside the composed batch's
  // envelope (client-bang-compose-s474.test.js runs it). The composed request can fail on the wire, so
  // the client `!`'s error type needs `Transport` — without it, E-ERROR-010 naming the line to add.
  test("a CLIENT `!` whose one server call runs 2 queries in a NON-`!` function — composed (s474); E-ERROR-010 without `Transport`", () => {
    const both = `    function both(a: int) -> int {\n        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run() !{ _ :> { return 0; } };\n        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run() !{ _ :> { return 0; } };\n        return 1;\n    }\n`;
    const mk = (en) => `<program db="./app.db">\n${en}${both}    function move(a: int)! E {\n        const y: int = both(a) !{ _ :> { return 0; } };\n        if (y == 0) fail .Bad;\n        return y;\n    }\n${page(["move(1)"])}</program>\n`;
    expect(errsOf(mk(E))).toEqual(["E-ERROR-010"]);
    expect(msgOf(mk(E), "E-ERROR-010")).toContain("add `Transport(t: ServerCallError)` to `E`");
    const ok = mk(E.replace("ConnectionLost }", "ConnectionLost, Transport(t: ServerCallError) }"));
    expect(errsOf(ok)).toEqual([]);
    const core = compile(ok).core;
    const batch = core.server.find((x) => x.sym.hint === "move#batch");
    expect(core.envelopes.find((e) => e.fn.id === batch.sym.id)).toMatchObject({ standalone: true, writes: true });
  });
  test("near-miss: the same client `!` calling a `!` server function compiles — that function's own envelope holds both", () => {
    const both = `    function both(a: int)! E {\n        ${q("INSERT INTO log (a) VALUES (${a})")}\n        ${q("INSERT INTO log (a) VALUES (${a})")}\n        return 1;\n    }\n`;
    const src = `<program db="./app.db">\n${E}${both}    function move(a: int)! E {\n        const y: int = both(a) !{ _ :> { return 0; } };\n        if (y == 0) fail .Bad;\n        return y;\n    }\n${page(["move(1)"])}</program>\n`;
    expect(errsOf(src)).toEqual([]);
    expect(compile(src).core.envelopes.find((e) => e.fn.hint === "both").standalone).toBe(true);
  });
  // s474-boot-client-bang-composition (S474 ruling door 2): this was the permanent E-TX-CLIENT-MULTI-CALL;
  // the two calls now compose into one request with one envelope. Without `Transport` in `E` the composed
  // request's wire failure has nowhere to go: E-ERROR-010. (The browser-split residue that stays
  // E-TX-CLIENT-MULTI-CALL: acceptance/envelope/neg-client-multi-call, client-bang-compose-s474.test.js.)
  test("a client-placed `!` making two server calls — composed (s474), one standalone envelope; E-ERROR-010 without `Transport`", () => {
    const mk = (en) => `<program db="./app.db">\n${en}${one("s1")}${one("s2")}    function move(a: int)! E {\n        const x: int = s1(a) !{ _ :> { return 0; } };\n        const y: int = s2(a) !{ _ :> { return 0; } };\n        return x + y;\n    }\n${page(["move(1)"])}</program>\n`;
    expect(errsOf(mk(E))).toEqual(["E-ERROR-010"]);
    const ok = mk(E.replace("ConnectionLost }", "ConnectionLost, Transport(t: ServerCallError) }"));
    expect(errsOf(ok)).toEqual([]);
    const core = compile(ok).core;
    const batch = core.server.find((x) => x.sym.hint === "move#batch");
    expect(core.envelopes.find((e) => e.fn.id === batch.sym.id)).toMatchObject({ standalone: true, writes: true });
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

// ---------------------------------------------------------------------------
// The runtime's own exits (server-runtime.js `envelope`), over a real SQLite with a driver that fails
// on cue: §19.10.6 "The connection SHALL be released on every exit path: after `COMMIT` or `ROLLBACK`,
// after a `BEGIN` that fails"; "A failed `COMMIT` SHALL NOT release the connection … the `ROLLBACK`
// that follows releases it"; and a transaction SQLite ends by itself is never followed by an autocommit.
describe("server-runtime.js envelope — the exits a scrml program cannot reach on cue", () => {
  let mem, seen, failOn;
  const conn = () => {
    const drv = (strings, ...values) => {
      const text = strings.join("?");
      seen.push(text);
      if (failOn !== null && text.startsWith(failOn)) {
        failOn = null;
        return Promise.reject(Object.assign(new Error("injected failure of " + text), { code: "SQLITE_IOERR" }));
      }
      return mem(strings, ...values);
    };
    return rt.connection({ connect: () => drv, log: () => {} }, { driver: "sqlite", target: ":memory:", file: "app.scrml" });
  };
  const ins = rt.sqlText(["INSERT INTO t (n) VALUES (", ")"]);
  const rowsOf = async () => (await mem.unsafe("SELECT n FROM t ORDER BY n")).map((r) => r.n);
  beforeAll(async () => {
    mem = new SQL(":memory:");
    await mem.unsafe("CREATE TABLE t (n INTEGER)");
    await mem.unsafe("CREATE TABLE k (a INTEGER PRIMARY KEY ON CONFLICT ROLLBACK)");
  });
  const fresh = async () => { seen = []; failOn = null; await mem.unsafe("DELETE FROM t"); await mem.unsafe("DELETE FROM k"); };

  test("a failed COMMIT: ROLLBACK follows, the call throws, the gate is released", async () => {
    await fresh();
    const db = conn();
    failOn = "COMMIT";
    let threw = null;
    try {
      await rt.envelope(db, async () => { await rt.query(db, "run", ins, [1], [0]); await rt.query(db, "run", ins, [2], [0]); return 1; }, true, "IMMEDIATE");
    } catch (e) { threw = e; }
    expect(threw).not.toBeNull();
    expect(seen.slice(-2)).toEqual(["COMMIT", "ROLLBACK"]);
    expect(await rowsOf()).toEqual([]);
    // released: the next statement on the connection runs
    expect(await rt.query(db, "run", ins, [9], [0])).toBeNull();
    expect(await rowsOf()).toEqual([9]);
  });
  test("a failed BEGIN: the call throws, nothing runs, the gate is released", async () => {
    await fresh();
    const db = conn();
    failOn = "BEGIN";
    let ran = false;
    let threw = null;
    try { await rt.envelope(db, async () => { ran = true; return 1; }, true, "IMMEDIATE"); } catch (e) { threw = e; }
    expect(threw).not.toBeNull();
    expect(ran).toBe(false);
    expect(await rt.query(db, "run", ins, [3], [0])).toBeNull();
    expect(await rowsOf()).toEqual([3]);
  });
  test("SQLite ends the transaction by itself (ON CONFLICT ROLLBACK): nothing after it autocommits, the envelope throws", async () => {
    await fresh();
    const db = conn();
    const k = rt.sqlText(["INSERT INTO k (a) VALUES (1)"]);
    let threw = null;
    let after = false;
    try {
      await rt.envelope(db, async () => {
        await rt.query(db, "run", ins, [1], [0]);
        await rt.query(db, "run", k, [], []);
        await rt.query(db, "run", k, [], []);   // the conflict: SQLite rolls the whole transaction back
        after = true;
        await rt.query(db, "run", ins, [2], [0]);
        return 1;
      }, true, "IMMEDIATE");
    } catch (e) { threw = e; }
    expect(threw).not.toBeNull();
    expect(String(threw.message)).toContain("rolled the transaction back by itself");
    expect(after).toBe(false);
    expect(await rowsOf()).toEqual([]);
    expect((await mem.unsafe("SELECT a FROM k")).length).toBe(0);
  });
  test("a constraint violation SQLite does NOT roll back is a failure value; the envelope stays usable", async () => {
    await fresh();
    await mem.unsafe("CREATE TABLE IF NOT EXISTS u (a INTEGER PRIMARY KEY)");
    await mem.unsafe("DELETE FROM u");
    const db = conn();
    const u = rt.sqlText(["INSERT INTO u (a) VALUES (1)"]);
    const r = await rt.envelope(db, async () => {
      await rt.query(db, "run", u, [], []);
      const dup = await rt.query(db, "run", u, [], []);
      await rt.query(db, "run", ins, [rt.failed(dup) ? 7 : 8], [0]);
      return 1;
    }, true, "IMMEDIATE");
    expect(r).toBe(1);
    expect(await rowsOf()).toEqual([7]);
  });
});

// ---------------------------------------------------------------------------
// s474 r1 (review of #1699) — F1 / F2: `.nobatch()` opts a query out of the envelope's COUNT
// (§8.9.5), not out of what the open envelope REACHES. Before r1 the one-database checks read the
// counted set only, so a `.nobatch()` write to another database compiled and SURVIVED the rollback
// (reviewer probe: move(6) → 500, a.acct unchanged, b.blog = [{"a":6}]), and `.nobatch()` reads in
// opposite orders deadlocked two requests forever.
const xdb = (bFn, body, extraTop = "") => `<program db="./a.db">\n${E}${extraTop}    <db src="./b.db">\n${bFn}    </db>\n    function move(a: int)! E {\n${body}    }\n${page(["move(1)"])}</program>\n`;
describe("r1 F1/F2 — a `.nobatch()` query is still inside the envelope's reach", () => {
  test("F1: a `.nobatch()` write to another database — E-SQL-011, the hint naming every query", () => {
    const logB = `        function logB(a: int) -> int {\n            ${SQ}\`INSERT INTO blog (a) VALUES (\${a})\`}.nobatch().run() !{ _ :> { return 0; } };\n            return 1;\n        }\n`;
    const src = xdb(logB, `        ${q("UPDATE acct SET n = n - ${a}")}\n        ${q("UPDATE acct SET n = n - ${a}")}\n        const x: int = logB(a);\n        if (a > 5) fail .Bad;\n        return x;\n`);
    expect(errsOf(src)).toEqual(["E-SQL-011"]);
    expect(msgOf(src, "E-SQL-011")).toContain("'.nobatch()' on every query of the envelope");
    expect(fe(src).core).toBeFalsy();
  });
  test("F1: the `!` function's OWN `.nobatch()` write to another database — E-SQL-011", () => {
    const src = `<program db="./a.db">\n${E}    <db src="./b.db">\n        function onB(a: int)! E {\n            ${q("INSERT INTO blog (a) VALUES (${a})")}\n            ${q("INSERT INTO blog (a) VALUES (${a})")}\n            const x: int = alsoA(a);\n            return x;\n        }\n    </db>\n    function alsoA(a: int) -> int {\n        ${SQ}\`INSERT INTO acct (n) VALUES (\${a})\`}.nobatch().run() !{ _ :> { return 0; } };\n        return 1;\n    }\n${page(["onB(1)"])}</program>\n`;
    expect(errsOf(src)).toEqual(["E-SQL-011"]);
  });
  test("F2: `.nobatch()` reads of the other database (the opposite-order deadlock pair) — refused, both", () => {
    const src = `<program db="./a.db">\n${E}    type C:struct = { c: int }\n    function readA(a: int) -> int {\n        const n: C | not = ${SQ}\`SELECT count(*) AS c FROM ta\`}.nobatch().get() !{ _ :> { return 0; } };\n        return 1;\n    }\n    <db src="./b.db">\n        function readB(a: int) -> int {\n            const n: C | not = ${SQ}\`SELECT count(*) AS c FROM tb\`}.nobatch().get() !{ _ :> { return 0; } };\n            return 1;\n        }\n        function onB(a: int)! E {\n            ${q("INSERT INTO tb VALUES (${a})")}\n            const x: int = readA(a);\n            ${q("INSERT INTO tb VALUES (${a})")}\n            return x;\n        }\n    </db>\n    function onA(a: int)! E {\n        ${q("INSERT INTO ta VALUES (${a})")}\n        const x: int = readB(a);\n        ${q("INSERT INTO ta VALUES (${a})")}\n        return x;\n    }\n${page(["onA(1)", "onB(1)"])}</program>\n`;
    expect(errsOf(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
    expect(msgOf(src, "E-BOOTSTRAP-UNSUPPORTED")).toContain("a `.nobatch()` query included");
  });
  test("near-miss: a `.nobatch()` query on the SAME database runs inside the transaction — a `fail` rolls it back too", async () => {
    const src = `<program db="./app.db">\n${E}    function nbHelper(a: int) -> int {\n        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.nobatch().run() !{ _ :> { return 0; } };\n        return 1;\n    }\n    function move(a: int)! E {\n        ${q("INSERT INTO log (a) VALUES (${a})")}\n        ${q("INSERT INTO log (a) VALUES (${a + 1})")}\n        const x: int = nbHelper(a + 2);\n        if (a > 5) fail .Bad;\n        return x;\n    }\n${page(["move(1)"])}</program>\n`;
    const d2 = mkdtempSync(join(tmpdir(), "s474-r1-nb-"));
    const f2 = join(d2, "app.db");
    const s2 = new SQL("sqlite://" + f2);
    try {
      await s2.unsafe("CREATE TABLE log (a INTEGER)");
      const { srv: srv2, routes: rt2 } = await serve(compile(src).core, s2, []);
      const rows2 = () => { const db = new Database(f2, { readonly: true }); try { return db.query("SELECT a FROM log ORDER BY a").all().map((r) => r.a); } finally { db.close(); } };
      expect((await post(srv2, pathOf(rt2, "move"), [6])).status).toBe(500);
      expect(rows2()).toEqual([]);
      expect((await post(srv2, pathOf(rt2, "move"), [1])).status).toBe(200);
      expect(rows2()).toEqual([1, 2, 3]);
    } finally {
      await s2.close();
      rmSync(d2, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// s474 r1 — F3: two `<db>` scopes naming the same file are ONE database (§8.9.2 "compares databases,
// not spellings") — at compile time (no false E-SQL-011) and at run time (one connection, one gate).
const sameFile = (spelling, logBody) => `<program db="./app.db">\n${E}    <db src="${spelling}">\n        function logB(a: int) -> int {\n            ${logBody}\n            return 1;\n        }\n    </db>\n    function move(a: int)! E {\n        for (let i = 0; i < 3; i = i + 1) {\n            ${q("INSERT INTO log (a) VALUES (${a + i})")}\n        }\n        const x: int = logB(a + 100);\n        if (a > 5) fail .Bad;\n        return x;\n    }\n${page(["move(1)", "logB(1)"])}</program>\n`;
const LOGB = `${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run() !{ _ :> { return 0; } };`;
describe("r1 F3 — a second `<db>` scope on the same file is the same database", () => {
  test("compile: `./app.db` and `app.db` beside `db=\"./app.db\"` — no E-SQL-011, one envelope", () => {
    for (const sp of ["./app.db", "app.db", "./x/../app.db"]) {
      expect([sp, errsOf(sameFile(sp, LOGB))]).toEqual([sp, []]);
      expect([sp, compile(sameFile(sp, LOGB)).core.envelopes.find((e) => e.fn.hint === "move").standalone]).toEqual([sp, true]);
    }
    // a different file is still another database
    expect(errsOf(sameFile("./other.db", LOGB))).toEqual(["E-SQL-011"]);
  });
  test("run: the second scope's write is inside the envelope (rolled back with it), and one connection is opened", async () => {
    const d3 = mkdtempSync(join(tmpdir(), "s474-r1-same-"));
    const f3 = join(d3, "app.db");
    const boot = new SQL("sqlite://" + f3);
    await boot.unsafe("CREATE TABLE log (a INTEGER)");
    await boot.close();
    const opened = [];
    const r = compile(sameFile("app.db", LOGB));
    const { server } = artifacts(r.core);
    const mod = await loadServer(server.js, r.core);
    const conns = [];
    const slow3 = (s) => (st, ...v) => new Promise((x) => setTimeout(x, 2)).then(() => s(st, ...v));
    const srv3 = mod.createServer({ connect: (d) => { opened.push(d.target); const s = new SQL("sqlite://" + f3); conns.push(s); return slow3(s); }, log: () => {}, respond: plainRespond, tenantRelations: async () => [] });
    const rows3 = () => { const db = new Database(f3, { readonly: true }); try { return db.query("SELECT a FROM log ORDER BY a").all().map((x) => x.a); } finally { db.close(); } };
    try {
      expect((await post(srv3, pathOf(server.routes, "move"), [6])).status).toBe(500);
      expect(rows3()).toEqual([]);
      expect((await post(srv3, pathOf(server.routes, "move"), [1])).status).toBe(200);
      expect(rows3()).toEqual([1, 2, 3, 101]);
      // a plain write through the second scope, arriving while an envelope is open, waits at the
      // (shared) gate and persists — before r1 it failed "database is locked" and was lost
      const p1 = post(srv3, pathOf(server.routes, "move"), [6]);
      await new Promise((x) => setTimeout(x, 5));
      const p2 = await post(srv3, pathOf(server.routes, "logB"), [777]);
      expect((await p1).status).toBe(500);
      expect(p2.status).toBe(200);
      expect(rows3()).toEqual([1, 2, 3, 101, 777]);
      expect(opened.length).toBe(1);
    } finally {
      for (const c of conns) await c.close();
      rmSync(d3, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// s474 r1 — F6: hardening the runtime against shapes scrml cannot produce today (it awaits every
// call): overlapping inner envelopes on one transaction, and a statement issued after its envelope ended.
describe("r1 F6 — strictly nested savepoints; no statement after its envelope", () => {
  let mem6;
  const ins6 = rt.sqlText(["INSERT INTO t6 (n) VALUES (", ")"]);
  const conn6 = () => rt.connection({ connect: () => mem6, log: () => {} }, { driver: "sqlite", target: ":memory:", file: "app.scrml" });
  beforeAll(async () => { mem6 = new SQL(":memory:"); await mem6.unsafe("CREATE TABLE t6 (n INTEGER)"); });
  const rows6 = async () => (await mem6.unsafe("SELECT n FROM t6 ORDER BY n")).map((r) => r.n);
  test("two inner envelopes run concurrently inside one: refused, the whole transaction rolled back", async () => {
    await mem6.unsafe("DELETE FROM t6");
    const db = conn6();
    const inner = (n, ms) => rt.envelope(db, async () => { await rt.query(db, "run", ins6, [n], [0]); await new Promise((x) => setTimeout(x, ms)); await rt.query(db, "run", ins6, [n + 1], [0]); return 1; }, true, "IMMEDIATE");
    let threw = null;
    try {
      await rt.envelope(db, async () => { await rt.query(db, "run", ins6, [1], [0]); await Promise.all([inner(10, 1), inner(20, 15)]); return 1; }, true, "IMMEDIATE");
    } catch (e) { threw = e; }
    expect(threw).not.toBeNull();
    expect(String(threw.message)).toContain("not the innermost open one");
    expect(await rows6()).toEqual([]);
  });
  test("a statement left running past its envelope throws instead of autocommitting", async () => {
    await mem6.unsafe("DELETE FROM t6");
    const db = conn6();
    let late = null;
    const r = await rt.envelope(db, async () => {
      await rt.query(db, "run", ins6, [1], [0]);
      // fire-and-forget: not awaited by the body
      late = new Promise((x) => setTimeout(x, 10)).then(() => rt.query(db, "run", ins6, [99], [0]));
      return rt.failure("Bad");
    }, true, "IMMEDIATE");
    expect(rt.failed(r)).toBe(true);
    let threw = null;
    try { await late; } catch (e) { threw = e; }
    expect(threw).not.toBeNull();
    expect(String(threw.message)).toContain("after the transaction of its envelope ended");
    expect(await rows6()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// s474 r2 (re-review of #1699).
describe("r2 item 1 — the runtime keys a SQLite connection by the file's REAL path", () => {
  const twoScopes = (inner) => `<program db="./app.db">\n${E}    <db src="${inner}">\n        function logB(a: int) -> int {\n            ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run() !{ _ :> { return 0; } };\n            return 1;\n        }\n    </db>\n    function move(a: int)! E {\n        ${q("INSERT INTO log (a) VALUES (${a})")}\n        const x: int = logB(a + 100);\n        if (a > 5) fail .Bad;\n        return x;\n    }\n${page(["move(1)", "logB(1)"])}</program>\n`;
  test("spelling-equal scopes that are two files (a symlink in the path) — the server refuses to start", async () => {
    const root = mkdtempSync(join(tmpdir(), "s474-r2-link-"));
    try {
      mkdirSync(join(root, "other", "sub"), { recursive: true });
      symlinkSync(join(root, "other", "sub"), join(root, "a"));
      // the compiler reads `./a/../app.db` as `./app.db` (one database: one envelope, no E-SQL-011) …
      const src = twoScopes("./a/../app.db");
      expect(errsOf(src)).toEqual([]);
      const r = compile(src);
      const { server } = artifacts(r.core);
      const mod = await loadServer(server.js, r.core);
      // … but on this host it is `<root>/other/app.db`, not `<root>/app.db`
      let threw = null;
      try {
        mod.createServer({ root, connect: () => { throw new Error("no connection should be opened"); }, log: () => {}, respond: plainRespond, tenantRelations: async () => [] });
      } catch (e) { threw = e; }
      expect(threw).not.toBeNull();
      expect(String(threw.message)).toContain("are two different files on this host");
      expect(String(threw.message)).toContain(join(root, "other", "app.db"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  test("spelling-different scopes that are ONE file (a symlink) share one connection; spelling-equal ones too", async () => {
    const root = mkdtempSync(join(tmpdir(), "s474-r2-same-"));
    try {
      symlinkSync(root, join(root, "b"));
      const opened = [];
      const host = { root, connect: (d) => { opened.push(d.target); return () => Promise.resolve([]); }, log: () => {}, respond: plainRespond };
      const c1 = rt.connection(host, { driver: "sqlite", target: "./app.db", file: "app.scrml" });
      const c2 = rt.connection(host, { driver: "sqlite", target: "./b/app.db", file: "app.scrml" });
      const c3 = rt.connection(host, { driver: "sqlite", target: "app.db", file: "app.scrml" });
      const c4 = rt.connection(host, { driver: "sqlite", target: "./other.db", file: "app.scrml" });
      expect(c1).toBe(c2);
      expect(c1).toBe(c3);
      expect(c1).not.toBe(c4);
      expect(c1.gate).toBe(c2.gate);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("r2 item 2 — a CLIENT `!` holds no transaction: no one-database check on it", () => {
  test("a client `!` making one call to a `!` function of `<db src=b>` compiles; the callee carries the envelope", () => {
    const src = `<program db="./a.db">\n${E}    <db src="./b.db">\n        function onB(a: int)! E {\n            ${q("INSERT INTO blog (a) VALUES (${a})")}\n            ${q("INSERT INTO blog (a) VALUES (${a + 1})")}\n            return 1;\n        }\n    </db>\n    function move(a: int)! E {\n        const y: int = onB(a) !{ _ :> { return 0; } };\n        if (y == 0) fail .Bad;\n        return y;\n    }\n${page(["move(1)"])}</program>\n`;
    expect(errsOf(src)).toEqual([]);
    const env = compile(src).core.envelopes;
    expect(env.find((e) => e.fn.hint === "onB").standalone).toBe(true);
    expect(env.find((e) => e.fn.hint === "move")).toBeUndefined();
  });
  test("near-miss: a SERVER `!` doing the same is E-SQL-011 (it holds the transaction)", () => {
    const src = `<program db="./a.db">\n${E}    <db src="./b.db">\n        function onB(a: int)! E {\n            ${q("INSERT INTO blog (a) VALUES (${a})")}\n            return 1;\n        }\n    </db>\n    function move(a: int)! E {\n        ${q("INSERT INTO acct (n) VALUES (${a})")}\n        const y: int = onB(a)?;\n        return y;\n    }\n${page(["move(1)"])}</program>\n`;
    expect(errsOf(src)).toEqual(["E-SQL-011"]);
  });
});

describe("r2 item 3 — `sqlite://` reads as impl#1 reads it", () => {
  test("`sqlite://app.db` names `app.db` (beside the declaring file), `sqlite:///abs/x.db` the absolute path", () => {
    const one = (db) => `<program db="${db}">\n${E}    function move(a: int)! E {\n        ${q("INSERT INTO log (a) VALUES (${a})")}\n        return 1;\n    }\n${page(["move(1)"])}</program>\n`;
    expect(compile(one("sqlite://app.db")).core.dbs.map((d) => d.target)).toEqual(["app.db"]);
    expect(compile(one("sqlite:///abs/x.db")).core.dbs.map((d) => d.target)).toEqual(["/abs/x.db"]);
    expect(compile(one("sqlite:./app.db")).core.dbs.map((d) => d.target)).toEqual(["./app.db"]);
    expect(errsOf(one("sqlite://"))).toEqual(["E-SQL-005"]);
  });
});

describe("r2 item 5 — the tenant catalogue question passes the §19.10.6 gate", () => {
  test("while an envelope holds the connection, the startup catalogue query waits for it to end", async () => {
    const mem = new SQL(":memory:");
    const order = [];
    const drv = (strings, ...values) => { order.push(strings.join("?").slice(0, 30)); return mem(strings, ...values); };
    const host = { connect: () => drv, log: () => {}, respond: plainRespond };   // no tenantRelations: the catalogue is asked of the database
    const db = rt.connection(host, { driver: "sqlite", target: ":memory:", file: "app.scrml" });
    const srv = rt.server(host, [], [db]);
    let release;
    const hold = new Promise((x) => { release = x; });
    const env = rt.envelope(db, async () => { await hold; return 1; }, true, "DEFERRED");
    await new Promise((x) => setTimeout(x, 5));
    const health = srv.fetch({ url: "http://localhost/_scrml/health", method: "GET", headers: { get: () => null }, text: async () => "" });
    await new Promise((x) => setTimeout(x, 20));
    // the catalogue question has not run inside the open transaction
    expect(order).toEqual(["BEGIN DEFERRED"]);
    release();
    await env;
    const res = await health;
    expect(res.status).toBe(200);
    expect(order[0]).toBe("BEGIN DEFERRED");
    expect(order[1]).toBe("COMMIT");
    expect(order[2]).toContain("SELECT m.name AS name");
    await mem.close();
  });
});
