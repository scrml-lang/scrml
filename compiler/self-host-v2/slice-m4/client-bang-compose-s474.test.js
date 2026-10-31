// client-bang-compose-s474.test.js — s474-boot-client-bang-composition: a CLIENT-placed `!`
// function's server calls compose into ONE request with ONE envelope.
//
// Ruling (user-voice-scrml.md S474, "permanent-restrictions re-review: the four one-way doors",
// door 2): "F11 becomes INTERIM: a client `!`'s server calls compose into one request with one
// envelope (planner composition, per §19.9.9.8 rule 1) … Only calls separated by browser work that
// cannot move stay refused." And "capability over limitation" item 2: "a client `!` whose one server
// call is a non-`!` server function running two queries … the compiler wraps that server call in the
// transaction envelope when the caller is `!`."
//
// SPEC §19.9.9.8: rule 1 "A statement that calls a function placed on the server SHALL be
// server-tier at the call site: the callee runs in the same request"; rule 3 "A statement that needs
// the browser … SHALL NOT be relocated"; rule 4 "Statements before the function's first server
// statement are never moved: `@busy = true` ahead of the query renders before the request leaves."
//
// Graded END TO END against a REAL SQLite (Bun.SQL): the bootstrap's own client and server artifacts,
// the client's `fetch` bridged to the server's (every request counted), and the table contents read
// back after each click / request.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mods, compile, codes, check, realDb, serve, post, pathOf, bridge } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 300000 });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const SQ = "?" + "{";
const q = (sql) => `${SQ}\`${sql}\`}.run();`;
const E = "    type E:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost, Transport(t: ServerCallError) }\n";
const DDL = ["CREATE TABLE log (a INTEGER)", "CREATE TABLE uniq (k INTEGER PRIMARY KEY)"];
const fe = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const errs = (src) => fe(src).diags.filter((d) => d.severity === "Error");

// hold → log(a); charge → log(a + 100), then fails when f > 0 — two `!` server functions
const HOLD_CHARGE = `${E}    function hold(a: int)! E {
        ${q("INSERT INTO log (a) VALUES (${a})")}
        return 1;
    }
    function charge(a: int, f: int)! E {
        ${q("INSERT INTO log (a) VALUES (${a + 100})")}
        if (f > 0) fail .Bad;
        return 2;
    }
`;
// the canonical shape: a spinner write, two server calls, a write between them, a write after
const BOOK = `<program db="./app.db">
${HOLD_CHARGE}    let <r:int=0/>
    let <status:string=""/>
    function book(a: int, f: int)! E {
        @status = "booking";
        hold(a)?;
        @status = "charging";
        charge(a, f)?;
        @status = "booked";
        return 3;
    }
    <main>
        <button id="ok" onclick={ @r = book(1, 0) !{ .Bad :> 7, _ :> 9, }; }>ok</button>
        <button id="bad" onclick={ @r = book(1, 1) !{ .Bad :> 7, _ :> 9, }; }>bad</button>
    </main>
</program>
`;

let k = 0;
// Click `id`, wait until the handler settled (`r` changed); count the requests the server answered and
// record the program's state at the moment each request left the client.
async function clickRun(core, sql, id) {
  const { srv } = await serve(core, sql);
  const loaded = await loadProgram(core, "compose-" + k++);
  const inst = () => [...loaded.rt.devtools.instances.values()].find((i) => i.id === 0 && i.decl.name === "program");
  const b = bridge(srv);
  let calls = 0;
  const atSend = [];
  globalThis.fetch = async (p, init) => {
    atSend.push({ path: new URL(String(p), "http://localhost/").pathname, state: loaded.rt.snapshot(inst()) });
    const res = await b(p, init);
    if (res.status !== 403) calls += 1; // a first call's CSRF-token retry is not a request of the program's
    return res;
  };
  click(document.querySelector(id));
  for (let i = 0; i < 400 && loaded.rt.snapshot(inst()).r === 0; i++) await new Promise((r) => setTimeout(r, 0));
  expectNoPageErrors();
  return { state: loaded.rt.snapshot(inst()), calls, atSend };
}
const rows = async (sql, t = "log", c = "a") => (await sql.unsafe(`SELECT ${c} AS v FROM ${t} ORDER BY ${c}`)).map((x) => x.v);

describe("the composed program: one server `!` batch, one envelope", () => {
  test("book() compiles; its two server calls run in ONE routed server function, enveloped (IMMEDIATE — it writes)", () => {
    const r = compile(BOOK);
    expect(check(r.core)).toEqual([]);
    const batch = r.core.server.find((s) => s.sym.hint === "book$batch");
    expect(batch).toBeTruthy();
    const env = r.core.envelopes.find((e) => e.fn.id === batch.sym.id);
    expect(env).toMatchObject({ standalone: true, writes: true });
    // the client function `book` calls the batch, never hold / charge directly
    const fn = r.core.fns.find((f) => f.sym.hint === "book");
    expect(JSON.stringify(fn.body)).toContain(`"id":${batch.sym.id}`);
    expect(JSON.stringify(fn.body)).not.toContain(`"hint":"hold"`);
    expect(JSON.stringify(fn.body)).not.toContain(`"hint":"charge"`);
  });
});

describe("end to end — two server `!` calls compose (real SQLite, the client's fetch counted)", () => {
  test("success: ONE request; both writes persisted; the spinner write rendered before the request left; the later writes after", async () => {
    const r = compile(BOOK);
    const sql = await realDb(DDL);
    const { state, calls, atSend } = await clickRun(r.core, sql, "#ok");
    expect(calls).toBe(1);
    expect(atSend.length).toBeGreaterThanOrEqual(1);
    // rule 4: `@status = "booking"` stood before the first server statement — it was rendered when the request left
    expect(atSend[0].state.status).toBe("booking");
    expect(state.r).toBe(3);
    expect(state.status).toBe("booked");
    expect(await rows(sql)).toEqual([1, 101]);
  });

  test("a failure in the SECOND call rolls back the FIRST; the failure reaches the caller's arm as `.Bad`; no later write applies", async () => {
    const r = compile(BOOK);
    const sql = await realDb(DDL);
    const { state, calls } = await clickRun(r.core, sql, "#bad");
    expect(calls).toBe(1);
    expect(state.r).toBe(7);
    // the spinner write stands (it ran before the request); the write between the calls and the one after never applied
    expect(state.status).toBe("booking");
    expect(await rows(sql)).toEqual([]);
  });

  test("the batch route alone (no client): success commits both; `.Bad` answers the routed failure wire shape and persists nothing", async () => {
    const r = compile(BOOK);
    const sql = await realDb(DDL);
    const { srv, routes } = await serve(r.core, sql);
    const ok = await post(srv, pathOf(routes, "book$batch"), [4, 0]);
    expect(ok.status).toBe(200);
    expect(await rows(sql)).toEqual([4, 104]);
    const bad = await post(srv, pathOf(routes, "book$batch"), [5, 1]);
    expect(bad.status).toBe(500);
    expect(bad.json).toMatchObject({ __scrml_error: true, type: "E", variant: "Bad" });
    expect(await rows(sql)).toEqual([4, 104]);
  });
});

// a non-`!` server function running two queries, called once from a client `!`
const BOTH = `<program db="./app.db">
${E}    let <r:int=0/>
    function both(a: int) -> int {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run() !{ _ :> { return 0; } };
        ${SQ}\`INSERT INTO uniq (k) VALUES (\${a})\`}.run() !{ _ :> { return 0; } };
        return 1;
    }
    function move(a: int)! E {
        const y: int = both(a) !{ _ :> { return 0; } };
        if (y == 0) fail .Bad;
        return y;
    }
    <main>
        <button id="go" onclick={ @r = move(5) !{ .Bad :> 7, _ :> 9, }; }>go</button>
    </main>
</program>
`;

describe("a client `!` calling ONE non-`!` server function that runs two queries — wrapped (capability over limitation, item 2)", () => {
  test("it compiles (was E-BOOTSTRAP-UNSUPPORTED); the batch holds the call in an IMMEDIATE envelope", () => {
    const r = compile(BOTH);
    expect(check(r.core)).toEqual([]);
    const batch = r.core.server.find((s) => s.sym.hint === "move$batch");
    expect(batch).toBeTruthy();
    expect(r.core.envelopes.find((e) => e.fn.id === batch.sym.id)).toMatchObject({ standalone: true, writes: true });
  });

  test("the batch rolls back as a unit: the second query fails → `fail .Bad` → the first query's row is rolled back", async () => {
    const r = compile(BOTH);
    const sql = await realDb(DDL);
    const first = await clickRun(r.core, sql, "#go");
    expect(first.calls).toBe(1);
    expect(first.state.r).toBe(1);
    expect(await rows(sql)).toEqual([5]);
    expect(await rows(sql, "uniq", "k")).toEqual([5]);
    // again: uniq(5) conflicts → both() answers 0 → move fails .Bad → its log(5) insert is rolled back
    const again = await clickRun(r.core, sql, "#go");
    expect(again.calls).toBe(1);
    expect(again.state.r).toBe(7);
    expect(await rows(sql)).toEqual([5]);
    expect(await rows(sql, "uniq", "k")).toEqual([5]);
  });
});

describe("what stays refused", () => {
  test("PERMANENT: a browser statement between the calls — E-TX-CLIENT-MULTI-CALL at that statement, naming it", () => {
    const src = `<program db="./app.db">
<host>
  title() -> string = document.title
</host>
${HOLD_CHARGE}    let <r:int=0/>
    function book(a: int)! E {
        hold(a)?;
        const t: string = title();
        charge(a, 0)?;
        return 1;
    }
    <main><button onclick={ @r = book(1) !{ _ :> 0, }; }>go</button></main>
</program>
`;
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-TX-CLIENT-MULTI-CALL"]);
    expect(e[0].message).toContain("the `<host>` binding `title`");
    expect(e[0].message).toContain("`hold`, `charge`");
    expect(e[0].message).toContain("Move the browser work before the first server call or after the last one, or split the function");
    expect(src.slice(e[0].span.start, e[0].span.end)).toContain("title()");
  });

  test("near-miss: the same browser statement AFTER the last call composes", () => {
    const src = `<program db="./app.db">
<host>
  title() -> string = document.title
</host>
${HOLD_CHARGE}    let <s:string=""/>
    function book(a: int)! E {
        hold(a)?;
        charge(a, 0)?;
        @s = title();
    }
    <main><button onclick={ book(1) !{ _ :> { @s = "f"; }, }; }>go</button></main>
</program>
`;
    expect(errs(src)).toEqual([]);
  });

  test("INTERIM: a cell READ inside the batch (the §6.6.9 marshal is not built) — E-BOOTSTRAP-UNSUPPORTED naming the fix", () => {
    const src = `<program db="./app.db">
${HOLD_CHARGE}    let <n:int=1/>
    function book()! E {
        hold(@n)?;
        charge(@n, 0)?;
    }
    <main><button onclick={ book() !{ _ :> { @n = 0; }, }; }>go</button></main>
</program>
`;
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("reads `@n` inside the batch");
    expect(e[0].message).toContain("Read it into a local before the first server call");
  });

  test("near-miss: the cell read into a local before the first call composes — the local rides the request", () => {
    const src = `<program db="./app.db">
${HOLD_CHARGE}    let <n:int=1/>
    function book()! E {
        const v = @n;
        hold(v)?;
        charge(v, 0)?;
    }
    <main><button onclick={ book() !{ _ :> { @n = 0; }, }; }>go</button></main>
</program>
`;
    expect(errs(src)).toEqual([]);
  });

  test("INTERIM: a cell write whose value the batch computes — E-BOOTSTRAP-UNSUPPORTED (the cell envelope is owed)", () => {
    const src = `<program db="./app.db">
${HOLD_CHARGE}    let <n:int=0/>
    function book(a: int)! E {
        const x: int = hold(a)?;
        const y: int = charge(a, 0)?;
        @n = x + y;
    }
    <main><button onclick={ book(1) !{ _ :> { @n = -1; }, }; }>go</button></main>
</program>
`;
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("writes `@n` with a value the batch computes");
  });

  test("E-ERROR-010: the error type has no `Transport` — the composed request can fail on the wire", () => {
    const src = `<program db="./app.db">
    type F:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }
    let <r:int=0/>
    function s1(a: int)! F {
        ${q("INSERT INTO log (a) VALUES (${a})")}
        return 1;
    }
    function move(a: int)! F {
        const x: int = s1(a) !{ _ :> { return 0; } };
        const y: int = s1(a + 1) !{ _ :> { return 0; } };
        return x + y;
    }
    <main><button onclick={ @r = move(1) !{ _ :> 0, }; }>go</button></main>
</program>
`;
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-ERROR-010"]);
    expect(e[0].message).toContain("add `Transport(t: ServerCallError)` to `F`");
  });
});
