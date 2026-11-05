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
import { mods, compile, codes, check, realDb, serve, post, pathOf, bridge, spyDriver } from "./server-artifact-harness.js";
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
    const batch = r.core.server.find((s) => s.sym.hint === "book#batch");
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
    const ok = await post(srv, pathOf(routes, "book#batch"), [4, 0]);
    expect(ok.status).toBe(200);
    expect(await rows(sql)).toEqual([4, 104]);
    const bad = await post(srv, pathOf(routes, "book#batch"), [5, 1]);
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
    const batch = r.core.server.find((s) => s.sym.hint === "move#batch");
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

  test("INTERIM (not the permanent split): a browser statement AFTER the last call that reads a value the batch computes", () => {
    const src = `<program db="./app.db">
<host>
  title() -> string = document.title
</host>
${HOLD_CHARGE}    let <s:string=""/>
    function book(a: int)! E {
        hold(a)?;
        const y: int = charge(a, 0)?;
        if (y > 0) { @s = title(); }
    }
    <main><button onclick={ book(1) !{ _ :> { @s = "f"; }, }; }>go</button></main>
</program>
`;
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("after the last server call, uses the `<host>` binding `title`");
  });

  test("BUILT (s475-boot-nonbang-callee-envelope; was INTERIM): a cell READ inside the batch — the §6.6.9 marshal hands the client's value to the batch", async () => {
    const src = `<program db="./app.db">
${HOLD_CHARGE}    let <n:int=4/>
    let <r:int=0/>
    function book()! E {
        hold(@n)?;
        charge(@n, 0)?;
    }
    <main><button id="go" onclick={ book() !{ _ :> { @n = 0; }, }; @r = 1; }>go</button></main>
</program>
`;
    expect(errs(src)).toEqual([]);
    const r = compile(src);
    const sql = await realDb(DDL);
    const { calls } = await clickRun(r.core, sql, "#go");
    expect(calls).toBe(1);
    expect(await rows(sql)).toEqual([4, 104]);
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

  test("BUILT (s475-boot-nonbang-callee-envelope; was INTERIM): a cell write whose value the batch computes — the cell envelope carries it back", async () => {
    const src = `<program db="./app.db">
${HOLD_CHARGE}    let <n:int=0/>
    let <r:int=0/>
    function book(a: int)! E {
        const x: int = hold(a)?;
        const y: int = charge(a, 0)?;
        @n = x + y;
    }
    <main><button id="go" onclick={ book(1) !{ _ :> { @n = -1; }, }; @r = 1; }>go</button></main>
</program>
`;
    expect(errs(src)).toEqual([]);
    const r = compile(src);
    const sql = await realDb(DDL);
    const { state, calls } = await clickRun(r.core, sql, "#go");
    expect(calls).toBe(1);
    expect(state.n).toBe(3);
    expect(await rows(sql)).toEqual([1, 101]);
  });

  test("INTERIM: a cell write whose value the batch computes, in a nested statement — E-BOOTSTRAP-UNSUPPORTED (the cell envelope carries a top-level write)", () => {
    const src = `<program db="./app.db">
${HOLD_CHARGE}    let <n:int=0/>
    function book(a: int)! E {
        const x: int = hold(a)?;
        const y: int = charge(a, 0)?;
        if (x > 0) { @n = x + y; }
    }
    <main><button onclick={ book(1) !{ _ :> { @n = -1; }, }; }>go</button></main>
</program>
`;
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("writes `@n` with a value the batch computes inside a nested statement");
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

// ---------------------------------------------------------------------------
// s474 r1 — the review of #1713 (~/.cache/scrml/review/s474-1713/review.md) and the PA's rulings on it.
const warns = (src) => fe(src).diags.filter((d) => d.severity === "Warning");
const HOST = `<host>\n  title() -> string = document.title\n</host>\n`;
const withHost = (src) => src.replace(`<program db="./app.db">\n`, `<program db="./app.db">\n${HOST}`);

describe("r1 M2 (PA ruling): a `fail` / `?` after the batch must not report failure over committed writes", () => {
  // the reviewer's repro: a movable guard after the last call
  const POST = (guard) => `<program db="./app.db">
${HOLD_CHARGE}    let <r:int=0/>
    function book(a: int, f: int)! E {
        hold(a)?;
        charge(a, 0)?;
        ${guard}
        return 3;
    }
    <main>
        <button id="bad" onclick={ @r = book(1, 1) !{ .Bad :> 7, _ :> 9, }; }>bad</button>
        <button id="ok" onclick={ @r = book(1, 0) !{ .Bad :> 7, _ :> 9, }; }>ok</button>
    </main>
</program>
`;
  test("(a) a movable trailing `fail` JOINS the batch: the caller gets `.Bad` and the table stays EMPTY", async () => {
    const src = POST("if (f > 0) fail .Bad;");
    expect(errs(src)).toEqual([]);
    expect(warns(src)).toEqual([]);
    const r = compile(src);
    const sql = await realDb(DDL);
    const bad = await clickRun(r.core, sql, "#bad");
    expect(bad.calls).toBe(1);
    expect(bad.state.r).toBe(7);
    expect(await rows(sql)).toEqual([]);
    const ok = await clickRun(r.core, sql, "#ok");
    expect(ok.state.r).toBe(3);
    expect(await rows(sql)).toEqual([1, 101]);
  });

  // S475 ruling item 1 (user-voice-scrml.md "## S475", "veto window readings" 1): "a trailing
  // `fail`/`?` after a client `!` function's composed server batch that cannot join the batch becomes
  // a compile ERROR (INTERIM; was `W-TX-FAIL-AFTER-COMMIT`). A `!` function must not report failure
  // while its writes stand. Fix named in the message: move the check before the first server call."
  test("(b) a trailing `fail` that needs the browser — E-TX-FAIL-AFTER-COMMIT (an Error) names it, says the writes stand, and names the fix", () => {
    const src = withHost(POST(`if (title() == "x") fail .Bad;`));
    expect(warns(src)).toEqual([]);
    const w = errs(src);
    expect(w.map((d) => d.code)).toEqual(["E-TX-FAIL-AFTER-COMMIT"]);
    expect(w[0].message).toContain("COMMITTED");
    expect(w[0].message).toContain("not rolled back");
    expect(w[0].message).toContain("move the check before the first server call");
    expect(() => compile(src)).toThrow("E-TX-FAIL-AFTER-COMMIT");
    expect(w[0].message).toContain("the `<host>` binding `title`");
    expect(src.slice(w[0].span.start, w[0].span.end)).toContain("title()");
  });

  // the same treatment for ONE server call
  const ONE = (guard) => `<program db="./app.db">
${HOLD_CHARGE}    let <r:int=0/>
    function book(a: int, f: int)! E {
        hold(a)?;
        ${guard}
        return 3;
    }
    <main>
        <button id="bad" onclick={ @r = book(1, 1) !{ .Bad :> 7, _ :> 9, }; }>bad</button>
    </main>
</program>
`;
  test("(a) one server call + a movable trailing `fail`: composed, so the failure rolls the call's write back", async () => {
    const src = ONE("if (f > 0) fail .Bad;");
    expect(errs(src)).toEqual([]);
    const r = compile(src);
    expect(r.core.server.map((x) => x.sym.hint)).toContain("book#batch");
    const sql = await realDb(DDL);
    const bad = await clickRun(r.core, sql, "#bad");
    expect(bad.calls).toBe(1);
    expect(bad.state.r).toBe(7);
    expect(await rows(sql)).toEqual([]);
  });

  test("(b) one server call + a browser trailing `fail`: E-TX-FAIL-AFTER-COMMIT, the compile fails", () => {
    const src = withHost(ONE(`if (title() == "x") fail .Bad;`));
    expect(warns(src)).toEqual([]);
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-TX-FAIL-AFTER-COMMIT"]);
    expect(e[0].message).toContain("move the check before the first server call");
    expect(() => compile(src)).toThrow("E-TX-FAIL-AFTER-COMMIT");
  });

  test("near-miss: one server call and no later `fail` is unchanged (not composed, no warning)", () => {
    const src = ONE("@r = 5;");
    expect(errs(src)).toEqual([]);
    expect(warns(src)).toEqual([]);
    expect(compile(src).core.server.map((x) => x.sym.hint)).not.toContain("book#batch");
  });
});

describe("r1 L1: a per-call wire-failure handler that can no longer run is a warning, not a silent drop", () => {
  test("a `.Transport` arm on a `!` call inside the batch — W-TX-ARM-UNREACHABLE at the arm", () => {
    const src = `<program db="./app.db">
${HOLD_CHARGE}    let <r:int=0/>
    function book(a: int, f: int)! E {
        const v: int = hold(a) !{ .Transport(t) :> 50, _ :> 60 };
        charge(v, f)?;
        return v;
    }
    <main><button onclick={ @r = book(1, 0) !{ _ :> 9, }; }>go</button></main>
</program>
`;
    expect(errs(src)).toEqual([]);
    const w = warns(src);
    expect(w.map((d) => d.code)).toEqual(["W-TX-ARM-UNREACHABLE"]);
    expect(src.slice(w[0].span.start, w[0].span.end)).toContain(".Transport");
  });
  test("near-miss: the handler a non-`!` server call MUST carry on the client (§19.9.10) is dropped in the batch without a warning the author could not act on", () => {
    expect(warns(BOTH)).toEqual([]);
  });
});

describe("r1 L2 / L3 / L5: the synthesized batch's names", () => {
  test("L2: no diagnostic names `#book` or `book#batch` — it is `book (its composed server batch)`", () => {
    const btn = `        <button onclick={ book(1, 0) !{ _ :> { @s = "f"; }, }; }>go</button>`;
    const src = `<program db="./a.db">\n${E}    function hold(a: int)! E {\n        ${q("INSERT INTO log (a) VALUES (${a})")}\n        return 1;\n    }\n    <db src="./b.db">\n        function onB(a: int)! E {\n            ${q("INSERT INTO blog (a) VALUES (${a})")}\n            return 1;\n        }\n    </db>\n    let <s:string=""/>\n    function book(a: int, f: int)! E {\n        hold(a)?;\n        onB(a)?;\n    }\n    <main>\n${btn}\n    </main>\n</program>\n`;
    const ds = fe(src).diags;
    expect(ds.map((d) => d.code)).toContain("E-SQL-011");
    for (const d of ds) {
      expect(d.message).not.toContain("#book");
      expect(d.message).not.toContain("book#batch");
    }
    expect(ds.find((d) => d.code === "E-SQL-011").message).toContain("book (its composed server batch)");
  });

  test("L3: an author's `book$batch` and the composed `book`'s batch are two routes with two names", () => {
    const src = BOOK.replace("    let <r:int=0/>\n", `    let <r:int=0/>\n    function book$batch(a: int) -> int {\n        ${SQ}\`INSERT INTO log (a) VALUES (\${a + 1000})\`}.run() !{ _ :> { return 0; } };\n        return 1;\n    }\n`)
      .replace(`<button id="ok"`, `<button id="mine" onclick={ @r = book$batch(5) !{ _ :> 9, }; }>mine</button>\n        <button id="ok"`);
    const r = compile(src);
    const names = r.core.server.map((x) => x.sym.hint);
    expect(names).toContain("book$batch");
    expect(names).toContain("book#batch");
  });

  test("L5: frontEnd returns the COMPOSED files and a node count above every id in them", () => {
    const r = fe(BOOK);
    const fns = JSON.stringify(r.asts);
    expect(fns).toContain('"name":"#book"');
    let top = -1;
    const walk = (v) => { if (v && typeof v === "object") { if (typeof v.nid === "number" && v.nid > top) top = v.nid; for (const k in v) walk(v[k]); } };
    walk(r.asts);
    expect(r.nodes).toBeGreaterThan(top);
  });
});

describe("r1 L4 / L7", () => {
  test("L4: `Date.now()` between the calls is browser work — E-TX-CLIENT-MULTI-CALL naming the browser's clock", () => {
    const src = `<program db="./app.db">
${HOLD_CHARGE}    let <r:int=0/>
    function book(a: int, f: int)! E {
        hold(a)?;
        const t = Date.now();
        if (t > 0) { charge(a, f)?; }
        return 1;
    }
    <main><button onclick={ @r = book(1, 0) !{ _ :> 9, }; }>go</button></main>
</program>
`;
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-TX-CLIENT-MULTI-CALL"]);
    expect(e[0].message).toContain("the browser's clock");
  });

  test("L7: a cell written in a handler arm of a server call — refused with its own message (not 'a value the batch computes')", () => {
    const src = `<program db="./app.db">
${HOLD_CHARGE}    let <s:string=""/>
    function book(a: int, f: int)! E {
        hold(a) !{ .Transport(t) :> { @s = "t"; }, _ :> { @s = "o"; } };
        charge(a, f)?;
    }
    <main><button onclick={ book(1, 0) !{ _ :> { @s = "f"; }, }; }>go</button></main>
</program>
`;
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("makes a server call and writes `@s`");
    expect(e[0].message).not.toContain("with a value the batch computes");
  });
});

// ---------------------------------------------------------------------------
// s474 r2 — the re-review of #1713 (~/.cache/scrml/review/s474-1713-r1/review.md) and the PA's readings.
describe("r2 N5 (PA reading S474, M2: a `!` that fails leaves no writes): the batch's own transaction only when it writes", () => {
  const RO = `<program db="./app.db">
${E}    type C:struct = { c: int }
    let <r:int=0/>
    function getN(a: int)! E {
        const row: C = ${SQ}\`SELECT count(*) AS c FROM log WHERE a = \${a}\`}.get();
        return row.c;
    }
    function book(a: int, f: int)! E {
        const n: int = getN(a)?;
        if (f > 0) fail .Bad;
        return n;
    }
    <main><button onclick={ @r = book(1, 1) !{ _ :> 9, }; }>go</button></main>
</program>
`;
  // s475-boot-pg-envelopes: superseded by SPEC §19.10.5 "A composed batch's envelope" (#1732): "that
  // batch SHALL open its own implicit envelope when its transitive query set is non-empty … (S474 —
  // superseded; a batch that reaches one read opens `BEGIN DEFERRED`, ruling 5)". Before s475: no
  // envelope, no BEGIN reached the driver.
  test("a read-only single-call batch: composed, in its own DEFERRED transaction (one read is enough)", async () => {
    const r = compile(RO);
    const batch = r.core.server.find((x) => x.sym.hint === "book#batch");
    expect(batch).toBeTruthy();
    expect(r.core.envelopes.find((e) => e.fn.id === batch.sym.id)).toMatchObject({ standalone: true, writes: false });
    const spy = spyDriver(() => [{ c: 1 }]);
    const { srv, routes } = await serve(r.core, spy.fn);
    const res = await post(srv, pathOf(routes, "book#batch"), [1, 1]);
    expect(res.status).toBe(500);
    const sent = spy.calls.map((c) => c.strings.join("?")).join(" | ");
    expect(sent).toContain("SELECT");
    expect(sent.startsWith("BEGIN DEFERRED")).toBe(true);
    expect(sent).not.toContain("BEGIN IMMEDIATE");
    expect(sent.endsWith("ROLLBACK")).toBe(true);   // the `fail` after the read
  });
  test("a WRITING single-call batch: its own IMMEDIATE transaction", () => {
    const src = `<program db="./app.db">
${HOLD_CHARGE}    let <r:int=0/>
    function book(a: int, f: int)! E {
        hold(a)?;
        if (f > 0) fail .Bad;
        return 3;
    }
    <main><button onclick={ @r = book(1, 1) !{ _ :> 9, }; }>go</button></main>
</program>
`;
    const r = compile(src);
    const batch = r.core.server.find((x) => x.sym.hint === "book#batch");
    expect(r.core.envelopes.find((e) => e.fn.id === batch.sym.id)).toMatchObject({ standalone: true, writes: true });
  });
});

describe("r2 N1 / N2 / N3 / N4", () => {
  test("N1: a `return` between the batch and a later `fail` — the `fail` is E-TX-FAIL-AFTER-COMMIT naming the `return`", () => {
    const src = `<program db="./app.db">
${HOLD_CHARGE}    let <r:int=0/>
    function book(a: int, f: int)! E {
        hold(a)?;
        charge(a, 0)?;
        if (a > 5) { return 1; }
        if (f > 0) fail .Bad;
        return 2;
    }
    <main><button onclick={ @r = book(1, 1) !{ _ :> 9, }; }>go</button></main>
</program>
`;
    expect(warns(src)).toEqual([]);
    const w = errs(src);
    expect(w.map((d) => d.code)).toEqual(["E-TX-FAIL-AFTER-COMMIT"]);
    expect(w[0].message).toContain("a `return` before it");
  });

  test("N2: one request made inside a client `!` callee, then a `fail` — E-TX-FAIL-AFTER-COMMIT", () => {
    const src = `<program db="./app.db">
${HOLD_CHARGE}    let <r:int=0/>
    function one(a: int)! E {
        hold(a)?;
        return 1;
    }
    function outer(a: int, f: int)! E {
        one(a)?;
        if (f > 0) fail .Bad;
        return 1;
    }
    <main><button onclick={ @r = outer(1, 1) !{ _ :> 9, }; }>go</button></main>
</program>
`;
    expect(warns(src)).toEqual([]);
    const w = errs(src);
    expect(w.map((d) => d.code)).toEqual(["E-TX-FAIL-AFTER-COMMIT"]);
    expect(w[0].message).toContain("`one()`, a client function");
  });

  test("N3: the batch assigning a client local — the named refusal, not a false E-ASSIGN-CONST", () => {
    const src = `<program db="./app.db">
${HOLD_CHARGE}    let <r:int=0/>
    function book(a: int, f: int)! E {
        let m: int = a;
        hold(a)?;
        m = m + 1;
        charge(m, 0)?;
        return 3;
    }
    <main><button onclick={ @r = book(1, 0) !{ _ :> 9, }; }>go</button></main>
</program>
`;
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("Declare a new local inside the batch");
  });

  test("N4: a single call whose composition needs `Transport` — the error says so", () => {
    const src = `<program db="./app.db">
    type F2:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }
    let <r:int=0/>
    function holdF(a: int)! F2 {
        ${q("INSERT INTO log (a) VALUES (${a})")}
        return 1;
    }
    function book(a: int, f: int)! F2 {
        const v: int = holdF(a) !{ _ :> 0 };
        if (f > 0) fail .Bad;
        return v;
    }
    <main><button onclick={ @r = book(1, 1) !{ _ :> 9, }; }>go</button></main>
</program>
`;
    expect(warns(src)).toEqual([]);
    const w = errs(src);
    expect(w.map((d) => d.code)).toEqual(["E-TX-FAIL-AFTER-COMMIT"]);
    expect(w[0].message).toContain("Transport(t: ServerCallError)");
    expect(w[0].message).not.toContain("a statement before it cannot join");
  });

  test("N6: the mapped name replaces whole tokens and drops its `()`", () => {
    const btn = `        <button onclick={ book(1, 0) !{ _ :> { @s = "f"; }, }; }>go</button>`;
    const src = `<program db="./a.db">\n${E}    function hold(a: int)! E {\n        ${q("INSERT INTO log (a) VALUES (${a})")}\n        return 1;\n    }\n    <db src="./b.db">\n        function onB(a: int)! E {\n            ${q("INSERT INTO blog (a) VALUES (${a})")}\n            return 1;\n        }\n    </db>\n    let <s:string=""/>\n    function book(a: int, f: int)! E {\n        hold(a)?;\n        onB(a)?;\n    }\n    <main>\n${btn}\n    </main>\n</program>\n`;
    const m = fe(src).diags.find((d) => d.code === "E-SQL-011").message;
    expect(m).toContain("book (its composed server batch)");
    expect(m).not.toContain("batch)()");
  });
});

// ---------------------------------------------------------------------------
// s475 r1 (review of #1746, item 4) — S475 ruling item 1 (user-voice-scrml.md "## S475"): "A `!` function
// must not report failure while its writes stand." The check sees a `fail` / `?` after the ONE server call
// in a nested statement on a path from it (it saw only top-level statements after the call's statement);
// an exit inside the call's own statement / expression is r2 F1's (the describe block at the end).
describe("s475 r1 item 4: a `fail` after the one server call, nested beside it", () => {
  const BODY = (body) => `<program db="./app.db">
${HOLD_CHARGE}    let <r:int=0/>
    function book(a: int, f: int)! E {
${body}
    }
    <main>
        <button id="bad" onclick={ @r = book(1, 1) !{ .Bad :> 7, _ :> 9, }; }>bad</button>
        <button id="ok" onclick={ @r = book(1, 0) !{ .Bad :> 7, _ :> 9, }; }>ok</button>
    </main>
</program>
`;
  test("the review's repro: a browser `fail` nested after the call — E-TX-FAIL-AFTER-COMMIT at the `fail` (was: no diagnostic, the write stood)", () => {
    const src = withHost(BODY(`        if (f >= 0) {\n            hold(a)?;\n            if (title() == "x") fail .Bad;\n        }\n        return 3;`));
    expect(warns(src)).toEqual([]);
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-TX-FAIL-AFTER-COMMIT"]);
    expect(src.slice(e[0].span.start, e[0].span.end)).toBe("fail .Bad");
    expect(e[0].message).toContain("uses the `<host>` binding `title`");
    expect(e[0].message).toContain("move the check before the first server call");
    expect(() => compile(src)).toThrow("E-TX-FAIL-AFTER-COMMIT");
  });
  test("a movable `fail` nested after the call composes: the failure rolls the call's write back (was: the write stood)", async () => {
    const src = BODY(`        if (f >= 0) {\n            hold(a)?;\n            if (f > 0) fail .Bad;\n        }\n        return 3;`);
    expect(errs(src)).toEqual([]);
    const r = compile(src);
    expect(r.core.server.map((x) => x.sym.hint)).toContain("book#batch");
    const sql = await realDb(DDL);
    const bad = await clickRun(r.core, sql, "#bad");
    expect(bad.calls).toBe(1);
    expect(bad.state.r).toBe(7);
    expect(await rows(sql)).toEqual([]);
    const ok = await clickRun(r.core, sql, "#ok");
    expect(ok.state.r).toBe(3);
    expect(await rows(sql)).toEqual([1]);
  });
  test("a `fail` nested in a loop after the call (every exit in the loop can follow it) — E-TX-FAIL-AFTER-COMMIT", () => {
    const src = withHost(BODY(`        for (const i of [1, 2]) {\n            if (title() == "x") fail .Bad;\n        }\n        if (f >= 0) {\n            hold(a)?;\n            for (const j of [1, 2]) {\n                if (title() == "y") fail .Bad;\n            }\n        }\n        return 3;`));
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-TX-FAIL-AFTER-COMMIT"]);
    expect(src.slice(e[0].span.start, e[0].span.end)).toBe("fail .Bad");
    expect(e[0].span.start).toBeGreaterThan(src.indexOf("hold(a)?"));
  });
  test("near-miss: a `fail` in the OTHER branch never follows the call — no diagnostic, not composed", () => {
    const src = withHost(BODY(`        if (f > 5) {\n            hold(a)?;\n        } else {\n            if (title() == "x") fail .Bad;\n        }\n        return 3;`));
    expect(errs(src)).toEqual([]);
    expect(compile(src).core.server.map((x) => x.sym.hint)).not.toContain("book#batch");
  });
  test("near-miss: the call's branch returns, so a later `fail` never follows it — no diagnostic (was a false E-TX-FAIL-AFTER-COMMIT)", () => {
    const src = withHost(BODY(`        if (f > 5) {\n            hold(a)?;\n            return 1;\n        }\n        if (title() == "x") fail .Bad;\n        return 3;`));
    expect(errs(src)).toEqual([]);
  });
  test("a read-only batch: the message is true without writes (\"any writes the batch made\")", () => {
    const src = withHost(`<program db="./app.db">
${E}    type C:struct = { c: int }
    function peek(a: int)! E {
        const row: C = ${SQ}\`SELECT count(*) AS c FROM log WHERE a = \${a}\`}.get();
        return row.c;
    }
    let <r:int=0/>
    function look(a: int)! E {
        const v: int = peek(a)?;
        if (title() == "x") fail .Bad;
        return v;
    }
    <main><button onclick={ @r = look(1) !{ _ :> 9, }; }>go</button></main>
</program>
`);
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-TX-FAIL-AFTER-COMMIT"]);
    expect(e[0].message).toContain("while any writes the batch made stand");
    expect(e[0].message).not.toContain("the batch's writes stand");
  });
});

// ---------------------------------------------------------------------------
// s475 r2 (review of #1746 r1, F1): an exit in the SAME statement / expression as the one server call
// was not seen — the client `!` reported failure while its write stood, with no diagnostic (executed
// by the reviewer on real SQLite: r = .Bad, rows [5] committed, diags []). PA ruling (INTERIM,
// capability-first): an exit inside an arm that runs ONLY when the call failed (an error-variant arm of
// a `match` / `!{}` handler on the call itself) is allowed — the call's own envelope rolled back. An
// exit in a success arm, in a `_` arm that could see success, or anywhere in the statement after the
// call outside the call's error-only arms, is E-TX-FAIL-AFTER-COMMIT. `_` sees success unless an
// earlier arm of the same `match` took `.Ok`.
describe("s475 r2 F1: an exit in the same expression as the one server call", () => {
  const ONE = (body) => withHost(`<program db="./app.db">
${E}    function hold(a: int)! E {
        ${q("INSERT INTO log (a) VALUES (${a})")}
        return 1;
    }
    function chkArg(x: int)! E {
        if (title() == "x") fail .Bad;
        return x;
    }
    function bad() -> boolean {
        return title() == "x";
    }
    let <r:int=0/>
    function book(a: int)! E {
${body}
    }
    <main><button id="go" onclick={ @r = book(5) !{ .Bad :> 7, _ :> 9, }; }>go</button></main>
</program>
`);
  const ARMS = "            .QueryFailed(m) :> 0,\n            .ConstraintViolation(c) :> 0,\n            .ConnectionLost :> 0,\n            .Transport(t) :> 0,\n";
  test("review shape 1: `chkArg(hold(a) !{ _ :> 0, })?` — the `?` runs after the call succeeded: E-TX-FAIL-AFTER-COMMIT at it (was: no diagnostic, the write stood)", () => {
    const src = ONE(`        const y: int = chkArg(hold(a) !{ _ :> 0, })?;\n        return y;`);
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-TX-FAIL-AFTER-COMMIT"]);
    expect(src.slice(e[0].span.start, e[0].span.end)).toBe("chkArg(hold(a) !{ _ :> 0, })?");
    expect(e[0].message).toContain("move the check before the first server call");
    expect(() => compile(src)).toThrow("E-TX-FAIL-AFTER-COMMIT");
  });
  test("review shape 2: a `fail` in the `.Ok` arm of a `match` on the call — E-TX-FAIL-AFTER-COMMIT at the `fail` (was: no diagnostic)", () => {
    const src = ONE(`        const y: int = match hold(a) {\n            .Ok(v) :> { if (bad()) { fail .Bad; } lift v; },\n            .Bad :> 0,\n${ARMS}        };\n        return y;`);
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-TX-FAIL-AFTER-COMMIT"]);
    expect(src.slice(e[0].span.start, e[0].span.end)).toBe("fail .Bad");
    expect(() => compile(src)).toThrow("E-TX-FAIL-AFTER-COMMIT");
  });
  // §18.6 / §19.7.1: in a `match` over a failable, a plain `_` covers `.Ok` only (it may not take an error
  // variant: E-MATCH-ELSE-ABSORBS-ERROR), so with no `.Ok` arm before it, it IS the success arm.
  test("`_` with no `.Ok` arm before it takes the success value — a `fail` in it is E-TX-FAIL-AFTER-COMMIT", () => {
    const src = ONE(`        const y: int = match hold(a) {\n            .Bad :> 0,\n${ARMS}            _ :> { if (bad()) { fail .Bad; } lift 1; },\n        };\n        return y;`);
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-TX-FAIL-AFTER-COMMIT"]);
    expect(src.slice(e[0].span.start, e[0].span.end)).toBe("fail .Bad");
  });
  test("near-miss: `_ err` after an explicit `.Ok` arm takes only failures — a `fail` in it is clean", () => {
    const src = ONE(`        const y: int = match hold(a) {\n            .Ok(v) :> v,\n            _ err :> { if (bad()) { fail .Bad; } lift 0; },\n        };\n        return y;`);
    expect(errs(src)).toEqual([]);
  });
  test("near-miss: a plain `_` after `.Ok` and every variant takes nothing (W-MATCH-001) — a `fail` in it is not E-TX-FAIL-AFTER-COMMIT", () => {
    const src = ONE(`        const y: int = match hold(a) {\n            .Ok(v) :> v,\n            .Bad :> 0,\n${ARMS}            _ :> { if (bad()) { fail .Bad; } lift 0; },\n        };\n        return y;`);
    expect(errs(src)).toEqual([]);
  });
  test("near-miss: a re-fail in an error arm of a `!{}` handler on the call is clean (the call's own envelope rolled back)", () => {
    const src = ONE(`        const y: int = hold(a) !{ .Bad :> { if (bad()) { fail .Bad; } lift 0; }, _ :> 0, };\n        return y;`);
    expect(errs(src)).toEqual([]);
  });
  test("near-miss: a re-fail in an error arm of a `match` on the call is clean", () => {
    const src = ONE(`        const y: int = match hold(a) {\n            .Ok(v) :> v,\n            .Bad :> { if (bad()) { fail .Bad; } lift 0; },\n${ARMS}        };\n        return y;`);
    expect(errs(src)).toEqual([]);
  });
  test("near-miss: `hold(a)?` — the call's own `?` runs only when the call failed — clean", () => {
    const src = ONE(`        const y: int = hold(a)?;\n        return y;`);
    expect(errs(src)).toEqual([]);
  });
  // a `?` / `match` inside a larger expression is E-BOOTSTRAP-UNSUPPORTED (slice Ue2), a `!{}` there is not:
  // a handler on an expression that HOLDS the call (not the call itself) runs when that expression
  // fails, which can be after the call succeeded
  test("an error arm of a handler on an expression holding the call (not the call itself) — E-TX-FAIL-AFTER-COMMIT", () => {
    const src = ONE(`        const y: int = chkArg(hold(a) !{ _ :> 0, }) !{ .Bad :> { fail .Bad; }, _ :> 0, };\n        return y;`);
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-TX-FAIL-AFTER-COMMIT"]);
    expect(src.slice(e[0].span.start, e[0].span.end)).toBe("fail .Bad");
  });
});
