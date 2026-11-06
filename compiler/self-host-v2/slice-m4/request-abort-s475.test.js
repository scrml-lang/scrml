// request-abort-s475.test.js — s475-boot-request-abort (slice S5a of the bootstrap §13.9 pending-cells
// plan): the §6.7.7.1 READ / WRITE class of a `<request>`, and the ABORT of a READ request's
// superseded or torn-down transport (gap g-boot-request-read-abort-owed-s475).
//
// Governing text (compiler/SPEC.md §6.7.7.1):
//   1. "Body form (`${ @x = call }`): READ iff (a) no non-`SELECT` SQL (`?{}`) is reachable anywhere
//      in the call graph of the body's call expression — transitively, through every server function
//      the call reaches — and (b) the call lowers to a single server batch … Every other request is
//      WRITE — including any request the compiler cannot classify. Unclassifiable = write."
//   2. "When an in-flight fetch is superseded, a READ request's superseded transport SHALL be
//      aborted. A WRITE request's superseded fetch SHALL be discarded: its result SHALL NOT be
//      applied, and its transport SHALL NOT be aborted — it runs to completion."
//   3. "Teardown … The same rule applies."
//   4. "Abort is transport-only. … It is not a rollback … the server may have committed. … An
//      aborted fetch SHALL NOT set `<#id>.error`, and SHALL NOT be treated as a failure settle."
// O-059-3 (a non-SQL side effect) is not ruled: the bootstrap classifies a call graph that reaches a
// host-backed function, a `_{}` block or an unresolvable call WRITE (fail closed to discard; INTERIM,
// analyze.scrml requestReads). A call graph that reaches NO SQL holds rule 1(a) vacuously and is READ
// (ruling:user-voice-scrml.md S475 "PA self-correction adopted: the #1787 '≥1 SELECT' clause (a no-SQL
// server call classed WRITE) is dropped — SPEC §6.7.7.1 rule 1 makes it READ").

import { describe, test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import { createServer as httpServer, request as httpRequest } from "node:http";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { SQL } from "bun";
import { Database } from "bun:sqlite";
import { mods, compile, check, realDb, serve, bridge, pathOf, plainRequest } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { frontEndStdlib } from "../slice-m2/lowered.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram, instancesOf } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 300000 });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; expectNoPageErrors(); });

const SQ = "?" + "{";
const D = "$" + "{";
const fe = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const DDL = ["CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"];
const ROWS = { users: [{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }] };
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(n = 60) { for (let i = 0; i < n; i++) await tick(); }
let k = 0;

// A READ load (a SELECT, nothing else) and a WRITE-classified one (a client function making TWO server
// calls: two server batches, rule 1(b) → WRITE), each a request on `@userId` with buttons to change it
// and an optional `if=` region (teardown). The WRITE load's runs each fetch `pre` first, then `nm`.
const READ_FN = `    function loadName(id: int) -> string {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
`;
const WRITE_FN = `    server function pre(id: int) -> int { return id; }
    server function nm(id: int) -> string {
        if (id == 1) return "a";
        if (id == 2) return "b";
        return "c";
    }
    function loadName(id: int) -> string {
        const n: int = pre(id) !{ _ :> 0 };
        return nm(n) !{ _ :> "?" };
    }
`;
// A server function that reaches no SQL at all.
const NOSQL_FN = `    server function loadName(id: int) -> string {
        if (id == 1) return "a";
        if (id == 2) return "b";
        return "c";
    }
`;
const APP = (fn, opts = {}) => `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <userId:int=1/>
    let <show:boolean=true/>
    let <userName:string="${opts.init ?? ""}"/>
${fn}${opts.inIf ? `    <div id="box" if=(@show)>\n        <request id="userReq">${D} @userName = loadName(@userId); }</request>\n    </div>\n` : `    <request id="userReq">${D} @userName = loadName(@userId); }</request>\n`}    <main>
        <button id="u2" onclick={ @userId = 2; }>2</button>
        <button id="u3" onclick={ @userId = 3; }>3</button>
        <button id="hide" onclick={ @show = false; }>hide</button>
        <p id="who">${D}@userName}</p>
    </main>
</program>
`;

function cells(rt) {
  const prog = instancesOf(rt, "program")[0];
  const out = {};
  prog.decl.fields.forEach((h, i) => { out[h] = prog.fields[i].peek(); });
  return out;
}
const sig = (c) => ({ loading: c["#userReq_loading"], data: c["#userReq_data"], error: c["#userReq_error"], stale: c["#userReq_stale"] });
const who = () => document.querySelector("#who").textContent;

// A transport that HOLDS every client call until the test releases it — and, as a browser's fetch
// does, honours `init.signal`: an abort rejects the pending fetch with an AbortError. (The
// conformance stub and heldTransport in request-surface-s475.test.js ignore the signal.)
function abortableTransport(srv) {
  const b = bridge(srv);
  const held = [];
  globalThis.fetch = (p, init) => new Promise((resolve, reject) => {
    const h = { signal: init.signal ?? null, aborted: false, released: false };
    h.go = () => { h.released = true; return b(p, init).then(resolve, reject); };
    if (h.signal) {
      if (h.signal.aborted) h.aborted = true;
      h.signal.addEventListener("abort", () => {
        h.aborted = true;
        const e = new Error("The operation was aborted."); e.name = "AbortError";
        reject(e);
      });
    }
    held.push(h);
  });
  return held;
}

function requestOf(core) {
  const prog = core.decls.find((d) => d.sym.id === core.program.id);
  return prog.renders.find((v) => v.variant === "Request").data;
}
const clsOf = (src) => {
  const r = fe(src);
  const errs = r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
  if (errs.length > 0 || !r.core) throw new Error(errs.map((d) => d.code + ": " + d.message).join("\n"));
  expect(check(r.core)).toEqual([]);
  return { cls: requestOf(r.core).cls.variant ?? requestOf(r.core).cls, js: mods().print.printProgram(r.core, "app.client.js", "scrml-runtime.js").js };
};
const READ = "ReqRead", WRITE = "ReqWrite";
const name = (c) => (typeof c === "string" ? c : c.variant);

describe("§6.7.7.1 rule 1 — the class (analyze requestReads → Core View.Request.cls → `read: true`)", () => {
  test("a load whose server call reaches only a SELECT is READ, and prints `read: true`", () => {
    const { cls, js } = clsOf(APP(READ_FN));
    expect(name(cls)).toBe(READ);
    expect(js).toMatch(/rt\.requestOn\(scope\$, /);
    expect(js).toContain("}, { mount: true, read: true, state: {");
  });

  test("a SELECT reached transitively (a helper the server function calls in place) is READ", () => {
    const src = APP(`    function q(id: int) -> string {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
    server function loadName(id: int) -> string { return q(id); }
`);
    expect(name(clsOf(src).cls)).toBe(READ);
  });

  const Q = `    function q(id: int) -> string {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
`;
  test("a load through a CLIENT function that makes exactly ONE read request is READ (one server batch)", () => {
    expect(name(clsOf(APP(Q + `    function loadName(id: int) -> string { return q(id) !{ _ :> "?" }; }\n`)).cls)).toBe(READ);
  });

  test("a client function that makes TWO requests (two server batches, rule 1(b)) is WRITE", () => {
    const two = `    function loadName(id: int) -> string {
        const a: string = q(id) !{ _ :> "?" };
        const b: string = q(id + 1) !{ _ :> "?" };
        return a + b;
    }
`;
    expect(name(clsOf(APP(Q + two)).cls)).toBe(WRITE);
  });

  test("a write reachable from the load is WRITE (rule 1(a)) — prints no `read`", () => {
    const src = `<program db="./app.db">
    type Cnt:struct = { n: int }
    let <s:int=0/>
    function logIt(a: int) -> int {
        ${SQ}\`INSERT INTO users (id, name) VALUES (\${a}, 'x')\`}.run() !{ _ :> { return 0; } };
        return 1;
    }
    function ins(id: int) -> int {
        const c: Cnt = ${SQ}\`SELECT count(*) AS n FROM users\`}.get() !{ _ :> { return 0; } };
        return logIt(id + c.n);
    }
    <request id="r" deps=[]>${D} @s = ins(1); }</request>
    <main><p>${D}@s}</p></main>
</program>
`;
    const t = clsOf(src);                       // a SELECT, then a write through a helper
    expect(name(t.cls)).toBe(WRITE);
    expect(t.js).not.toContain("read: true");
    const direct = `<program db="./app.db">
    let <s:int=0/>
    function ins(id: int) -> int {
        ${SQ}\`INSERT INTO users (id, name) VALUES (\${id}, 'x')\`}.run() !{ _ :> { return 0; } };
        return 1;
    }
    <request id="r" deps=[]>${D} @s = ins(1); }</request>
    <main><p>${D}@s}</p></main>
</program>
`;
    const d = clsOf(direct);
    expect(name(d.cls)).toBe(WRITE);
    expect(d.js).not.toContain("read: true");
  });

  test("a server function that reaches NO SQL is READ (rule 1(a) holds vacuously — S475 ruling), and prints `read: true`", () => {
    // RED before s475-boot-request-followups: the '≥1 SELECT' clause classed it WRITE
    const t = clsOf(APP(NOSQL_FN));
    expect(name(t.cls)).toBe(READ);
    expect(t.js).toContain("}, { mount: true, read: true, state: {");
    // … also when the no-SQL function is reached through a client wrapper making one request
    expect(name(clsOf(APP(NOSQL_FN.replace("server function loadName", "server function nm")
      + `    function loadName(id: int) -> string { return nm(id) !{ _ :> "?" }; }\n`)).cls)).toBe(READ);
  });

  test("a client function making two server calls of no-SQL functions is WRITE (rule 1(b): two batches)", () => {
    expect(name(clsOf(APP(WRITE_FN)).cls)).toBe(WRITE);
  });

  test("a server function reaching a host-backed function (`scrml:math`'s abs) is still WRITE (O-059-3 — INTERIM)", () => {
    const src = APP(`    import { abs } from "scrml:math";
    server function loadName(id: int) -> string {
        if (abs(id) == 1) return "a";
        return "c";
    }
`);
    const r = frontEndStdlib(mods(), [{ path: "app.scrml", src }], "app.scrml", {});
    expect(r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info")).toEqual([]);
    expect(check(r.core)).toEqual([]);
    expect(name(requestOf(r.core).cls)).toBe(WRITE);
  });

  test("a client-only load (no server call: not a single server batch) is WRITE", () => {
    const src = `<program>\n    let <u:int=1/>\n    let <m:int=0/>\n    fn cnt(x: int) -> int { return x + 1; }\n    <request id="load">${D} @m = cnt(@u); }</request>\n    <main><p>${D}@m}</p></main>\n</program>\n`;
    expect(name(clsOf(src).cls)).toBe(WRITE);
  });
});

// s475-boot-request-followups (#1787 review) — analyze's `clientOneRead` walk visits each client
// function ONCE, so a function reached along two calls counts its one server call once; only
// txQuerySets' `remote` (the requests counted along EVERY call) catches it. Measured: drop
// `tq.remote[i0] != 1` and both loads below go red — C-R2 refuses the READ class analyze then gives
// them; with C-R2 also at its origin/main form, analyze classes both ReqRead (Expected "ReqWrite",
// Received "ReqRead"). Before this lane C-R2 had the same per-function hole (a forced READ of either
// re-checked clean).
const Q1 = `    server function q(id: int) -> string {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
`;
const DIAMOND = APP(Q1 + `    function d(id: int) -> string { return q(id) !{ _ :> "?" }; }
    function b(id: int) -> string { return d(id); }
    function c(id: int) -> string { return d(id); }
    function loadName(id: int) -> string { return b(id) + c(id); }
`);
const H_TWICE = APP(Q1 + `    function h(id: int) -> string { return q(id) !{ _ :> "?" }; }
    function loadName(id: int) -> string { return h(id) + h(id + 1); }
`);
const LOOP = APP(Q1 + `    function loadName(id: int) -> string {
        let s: string = "";
        for (let i = 0; i < 2; i = i + 1) { s = s + (q(id) !{ _ :> "?" }); }
        return s;
    }
`);
const INS = `<program db="./app.db">
    let <s:int=0/>
    function ins(id: int) -> int {
        ${SQ}\`INSERT INTO users (id, name) VALUES (\${id}, 'x')\`}.run() !{ _ :> { return 0; } };
        return 1;
    }
    <request id="r" deps=[]>${D} @s = ins(1); }</request>
    <main><p>${D}@s}</p></main>
</program>
`;

describe("§6.7.7.1 rule 1(b) — a client function reached along two calls makes two requests (analyze `remote`)", () => {
  test("a client diamond (b and c both call d, which calls the server) is WRITE", () => {
    const t = clsOf(DIAMOND);
    expect(name(t.cls)).toBe(WRITE);
    expect(t.js).not.toContain("read: true");
  });
  test("`h(id) + h(id + 1)` (one function, two calls, one server call each) is WRITE", () => {
    const t = clsOf(H_TWICE);
    expect(name(t.cls)).toBe(WRITE);
    expect(t.js).not.toContain("read: true");
  });
});

// C-R2 (check.scrml checkReadRequest) — defence in depth: a Core whose Request is marked READ when its
// load is not one SELECT-only server batch is refused. Each Core below is a real compile of a WRITE
// load with its class forced to ReqRead.
describe("C-R2 — the READ re-check refuses a READ class the load does not earn", () => {
  const forcedRead = (src) => {
    const r = compile(src);
    expect(name(requestOf(r.core).cls)).toBe(WRITE);
    expect(check(r.core)).toEqual([]);          // WRITE is never re-checked
    requestOf(r.core).cls = READ;
    return check(r.core).join("\n");
  };
  test("a non-SELECT query reached on the server", () => {
    expect(forcedRead(INS)).toMatch(/C-R2: a READ Request's server call reaches a query that is not provably a SELECT, in `ins`/);
  });
  test("two server calls (a client wrapper calling `pre` then `nm`)", () => {
    expect(forcedRead(APP(WRITE_FN))).toMatch(/C-R2: a READ Request's load makes 2 (or more )?server calls/);
  });
  test("a loop around the server call", () => {
    expect(forcedRead(LOOP)).toMatch(/C-R2: a READ Request's load runs a loop in `loadName`/);
  });
  test("a function reached along two calls — the diamond and `h(id) + h(id + 1)` (RED before this lane: C-R2 counted once per function)", () => {
    expect(forcedRead(DIAMOND)).toMatch(/C-R2: a READ Request's load makes 2 or more server calls \(counted along every call\)/);
    expect(forcedRead(H_TWICE)).toMatch(/C-R2: a READ Request's load makes 2 or more server calls \(counted along every call\)/);
  });
  test("a READ that earns it re-checks clean — a SELECT, and a server call that reaches no SQL (RED before: 'reaches no query')", () => {
    const r = compile(APP(NOSQL_FN));
    expect(name(requestOf(r.core).cls)).toBe(READ);
    expect(check(r.core)).toEqual([]);
    const rs = compile(APP(READ_FN));
    expect(check(rs.core)).toEqual([]);
  });
});

describe("rules 2 / 4 — supersede: a READ is aborted, a WRITE is discarded", () => {
  test("READ superseded (EC-2): the older fetch's signal fires; no error; the newer answer lands", async () => {
    const r = compile(APP(READ_FN));
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(r.core, sql);
    globalThis.fetch = bridge(srv);
    const { rt } = await loadProgram(r.core, "abort-read-" + k++);
    const reported = [];
    const prev = rt.setHostErrorReporter((e) => reported.push(e));
    try {
      await settle();
      expect(who()).toBe("a");
      const held = abortableTransport(srv);
      click(document.querySelector("#u2"));   // run 1: user 2
      await settle(5);
      expect(held.length).toBe(1);
      expect(held[0].aborted).toBe(false);
      click(document.querySelector("#u3"));   // run 2 supersedes run 1
      await settle(5);
      expect(held.length).toBe(2);
      // RED before S5a: the superseded transport was never aborted (discard-only)
      expect(held[0].aborted).toBe(true);
      expect(held[0].signal.aborted).toBe(true);
      expect(held[1].aborted).toBe(false);
      // the abort set no error and was not a failure settle; the newer run is still loading
      expect(sig(cells(rt))).toEqual({ loading: true, data: "a", error: null, stale: true });
      await held[1].go();
      await settle();
      expect(who()).toBe("c");
      expect(sig(cells(rt))).toEqual({ loading: false, data: "c", error: null, stale: false });
      expect(reported).toEqual([]);
    } finally {
      rt.setHostErrorReporter(prev);
    }
  });

  test("READ through a client wrapper (its `!{ .Transport … }` handler): the superseded call is aborted, the handler does NOT run", async () => {
    const wrap = `    function q(id: int) -> string {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
    function loadName(id: int) -> string { return q(id) !{ _ :> "aborted-as-failure" }; }
`;
    const r = compile(APP(wrap));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    globalThis.fetch = bridge(srv);
    const { rt } = await loadProgram(r.core, "abort-wrap-" + k++);
    const reported = [];
    const prev = rt.setHostErrorReporter((e) => reported.push(e));
    try {
      await settle();
      expect(who()).toBe("a");
      const held = abortableTransport(srv);
      click(document.querySelector("#u2"));
      await settle(5);
      click(document.querySelector("#u3"));
      await settle(5);
      expect(held.map((h) => h.aborted)).toEqual([true, false]);
      await settle();
      // the aborted call is not a Transport failure the wrapper's handler sees (rule 4)
      expect(who()).toBe("a");
      await held[1].go();
      await settle();
      expect(who()).toBe("c");
      expect(sig(cells(rt))).toEqual({ loading: false, data: "c", error: null, stale: false });
      expect(reported).toEqual([]);
    } finally {
      rt.setHostErrorReporter(prev);
    }
  });

  test("WRITE superseded: the older fetch is NOT aborted; it runs to completion and its result is dropped", async () => {
    const r = compile(APP(WRITE_FN));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    globalThis.fetch = bridge(srv);
    const { rt } = await loadProgram(r.core, "abort-write-" + k++);
    const reported = [];
    const prev = rt.setHostErrorReporter((e) => reported.push(e));
    try {
      await settle();
      expect(who()).toBe("a");
      const held = abortableTransport(srv);
      click(document.querySelector("#u2"));     // run 1: pre(2) held
      await settle(5);
      click(document.querySelector("#u3"));     // run 2 supersedes run 1: pre(3) held
      await settle(5);
      expect(held.length).toBe(2);
      expect(held[0].aborted).toBe(false);
      expect(held[0].signal.aborted).toBe(false);
      await held[1].go();                       // run 2 goes on to nm(3)
      await settle(5);
      expect(held.length).toBe(3);
      await held[2].go();
      await settle();
      expect(who()).toBe("c");
      await held[0].go();                       // the superseded transport completes
      await settle();
      expect(held.length).toBe(3);              // … run 1 never continues to its second call
      expect(who()).toBe("c");                  // … and is discarded
      expect(sig(cells(rt))).toEqual({ loading: false, data: "c", error: null, stale: false });
      expect(reported).toEqual([]);
    } finally {
      rt.setHostErrorReporter(prev);
    }
  });
});

describe("rule 3 — teardown: a READ is aborted, a WRITE is discarded", () => {
  test("READ torn down (EC-3, an `if=` region closed mid-load): its fetch is aborted; no error, target kept", async () => {
    const r = compile(APP(READ_FN, { inIf: true, init: "-" }));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = abortableTransport(srv);
    const { rt } = await loadProgram(r.core, "abort-teardown-read-" + k++);
    const reported = [];
    const prev = rt.setHostErrorReporter((e) => reported.push(e));
    try {
      await settle(5);
      expect(held.length).toBe(1);
      expect(held[0].aborted).toBe(false);
      click(document.querySelector("#hide"));
      await settle(5);
      expect(rt.stats.requests).toBe(0);
      expect(held[0].aborted).toBe(true);       // RED before S5a
      await settle();
      expect(who()).toBe("-");
      expect(sig(cells(rt))).toEqual({ loading: false, data: null, error: null, stale: false });
      expect(reported).toEqual([]);
    } finally {
      rt.setHostErrorReporter(prev);
    }
  });

  test("WRITE torn down: its fetch is NOT aborted; it completes and is discarded", async () => {
    const r = compile(APP(WRITE_FN, { inIf: true, init: "-" }));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = abortableTransport(srv);
    const { rt } = await loadProgram(r.core, "abort-teardown-write-" + k++);
    await settle(5);
    expect(held.length).toBe(1);
    click(document.querySelector("#hide"));
    await settle(5);
    expect(rt.stats.requests).toBe(0);
    expect(held[0].aborted).toBe(false);
    for (const h of held) await h.go();
    await settle();
    expect(held.length).toBe(1);                // the torn-down run never continues to its second call
    expect(who()).toBe("-");
    expect(sig(cells(rt))).toEqual({ loading: false, data: null, error: null, stale: false });
  });
});

// Rule 4 on the SERVER: "Abort is transport-only … the server may have committed." The bootstrap
// server never observes the client's abort (O-059-4 unruled): the §8.9.2 envelope runs to its own
// COMMIT or ROLLBACK, the answer goes to a closed socket, and nothing rejects unhandled. Measured over
// a REAL socket (node:http — no global fetch / Response, which happy-dom may replace in this process)
// and a real SQLite FILE, with the driver HELD at a chosen statement while the client disconnects.
describe("server: a client disconnect mid-envelope leaves the database consistent", () => {
  const E = "    type E:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }\n";
  const ins = (v) => `${SQ}\`INSERT INTO log (a) VALUES (${v})\`}.run();`;
  const PROGRAM = `<program db="./app.db">
${E}
    function two(a: int)! E {
        ${ins("${a}")}
        ${ins("${a + 1}")}
        if (a > 5) fail .Bad;
        return 1;
    }
    let <r:int=0/>
    <main>
        <button onclick={ @r = two(1) !{ _ :> 0, }; }>a</button>
    </main>
</program>
`;
  let dir, file, sql, srv, routes, logs, http, port, hold = null;
  let served = 0;   // the server's answers, written or not (an aborted client's goes to a closed socket)
  const unhandled = [];
  const onUnhandled = (e) => unhandled.push(e);
  const persisted = () => {
    const db = new Database(file, { readonly: true });
    try { return db.query("SELECT a FROM log ORDER BY a").all().map((x) => x.a); } finally { db.close(); }
  };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "s475-abort-"));
    file = join(dir, "app.db");
    sql = new SQL("sqlite://" + file);
    await sql.unsafe("CREATE TABLE log (a INTEGER)");
    // the driver: every statement goes to the real file, except that a statement matching the armed
    // `hold.match` waits for `hold.release` first (the server is then mid-envelope)
    const driver = (strings, ...values) => {
      const text = strings.join("?");
      if (hold !== null && !hold.hit && hold.match(text)) {
        hold.hit = true;
        hold.reached();
        return hold.gate.then(() => sql(strings, ...values));
      }
      return sql(strings, ...values);
    };
    const r = compile(PROGRAM);
    logs = [];
    ({ srv, routes } = await serve(r.core, driver, logs));
    http = httpServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        const headers = {};
        for (const [h, v] of Object.entries(req.headers)) headers[h] = Array.isArray(v) ? v.join(", ") : String(v);
        const out = await srv.fetch(plainRequest(req.url, req.method, headers, Buffer.concat(chunks).toString("utf8")));
        served++;
        const body = await out.text();
        const hs = {};
        for (const [h, v] of out.headers.entries()) hs[h] = v;
        try { res.writeHead(out.status, hs); res.end(body); } catch (e) { unhandled.push(e); }
      });
    });
    await new Promise((res) => http.listen(0, "127.0.0.1", res));
    port = http.address().port;
    process.on("unhandledRejection", onUnhandled);
  }, 300000);

  afterAll(async () => {
    process.off("unhandledRejection", onUnhandled);
    await new Promise((res) => http.close(res));
    await sql.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function arm(match) {
    let release, reached;
    const gate = new Promise((r) => { release = r; });
    const at = new Promise((r) => { reached = r; });
    hold = { match, hit: false, gate, reached, at };
    return { release: () => { release(); }, at };
  }

  // POST a route, then DISCONNECT once the server reaches the held statement; resolves when the
  // client side has closed (never with an answer)
  function postThenAbort(path, args, at) {
    return new Promise((resolve) => {
      const body = JSON.stringify(args);
      const req = httpRequest({ host: "127.0.0.1", port, path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Cookie: "scrml_csrf=tok-1", "X-CSRF-Token": "tok-1" } });
      let answered = false;
      req.on("response", () => { answered = true; });
      req.on("error", () => {});
      req.on("close", () => resolve({ answered }));
      req.end(body);
      at.then(() => req.destroy());
    });
  }
  function post(path, args) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(args);
      const req = httpRequest({ host: "127.0.0.1", port, path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Cookie: "scrml_csrf=tok-1", "X-CSRF-Token": "tok-1" } }, (res) => {
        let t = ""; res.on("data", (c) => { t += c; }); res.on("end", () => resolve({ status: res.statusCode, text: t }));
      });
      req.on("error", reject);
      req.end(body);
    });
  }
  const until = async (pred, n = 400) => { for (let i = 0; i < n && !pred(); i++) await new Promise((r) => setTimeout(r, 5)); };

  test("aborted while held at the envelope's COMMIT: the server still commits (both rows — 'the server may have committed'); the next call runs", async () => {
    await sql.unsafe("DELETE FROM log");
    const h = arm((t) => /^\s*COMMIT\b/.test(t));
    const path = pathOf(routes, "two");
    const before = served;
    const c = await postThenAbort(path, [1], h.at);
    expect(c.answered).toBe(false);
    expect(persisted()).toEqual([]);            // held: nothing committed yet
    h.release();
    await until(() => served === before + 1);
    expect(served).toBe(before + 1);            // the handler ran to its end after the disconnect
    expect(persisted()).toEqual([1, 2]);        // all of the body, never half
    hold = null;
    const next = await post(path, [3]);         // the §19.10.6 gate was released
    expect(next.status).toBe(200);
    expect(persisted()).toEqual([1, 2, 3, 4]);
    expect(unhandled).toEqual([]);
    expect(logs.filter((l) => /threw|failed/.test(l))).toEqual([]);
  });

  test("aborted while held before the second write of a body that then fails: the server rolls back (no row); the next call runs", async () => {
    await sql.unsafe("DELETE FROM log");
    const h = arm((t) => /INSERT INTO log/.test(t) && hold && (hold.n = (hold.n ?? 0) + 1) === 2);
    const path = pathOf(routes, "two");
    const before = served;
    const c = await postThenAbort(path, [7], h.at);
    expect(c.answered).toBe(false);
    h.release();
    await until(() => served === before + 1);
    expect(served).toBe(before + 1);
    expect(persisted()).toEqual([]);           // `fail .Bad` → ROLLBACK of both writes
    hold = null;
    expect((await post(path, [1])).status).toBe(200);
    expect(persisted()).toEqual([1, 2]);
    expect(unhandled).toEqual([]);
  });
});

// s475 (merge of S3b refs × S5a abort) — `<#id>.refetch()` (EC-4: "Starts a new fetch immediately,
// superseding the in-flight one") is a supersede, so rule 2 governs it: a READ request's
// superseded transport is aborted, a WRITE request's discarded. The printed options carry both the
// class (`read: true`) and the program-level slot (`slot: <h>`).
describe("rule 2 via `<#id>.refetch()` — a refetch supersedes: READ aborted, WRITE discarded", () => {
  const HREF = "<" + "#userReq>";
  const withRefetch = (src) => src.replace('<p id="who">', `<button id="rf" onclick={ ${HREF}.refetch(); }>again</button>\n        <p id="who">`);

  test("a READ request with a handle prints `read: true` and `slot: <h>`; a WRITE one only the slot", () => {
    const rd = clsOf(withRefetch(APP(READ_FN)));
    expect(name(rd.cls)).toBe(READ);
    const slots = [...rd.js.matchAll(/^const (\w+) = rt\.requestSlot\(\);$/gm)].map((m) => m[1]);
    expect(slots.length).toBe(1);
    expect(rd.js).toContain("}, { mount: true, read: true, state: {");
    expect(rd.js).toContain("slot: " + slots[0] + " });");
    expect(rd.js).toContain("rt.refetch(" + slots[0] + ")");
    const wr = clsOf(withRefetch(APP(WRITE_FN)));
    expect(name(wr.cls)).toBe(WRITE);
    expect(wr.js).not.toContain("read: true");
    expect(wr.js).toMatch(/slot: \w+ \}\);/);
  });

  async function refetchRun(fn, tag) {
    const r = compile(withRefetch(APP(fn)));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    globalThis.fetch = bridge(srv);
    const { rt } = await loadProgram(r.core, tag + k++);
    return { rt, srv };
  }

  test("READ refetched while in flight: the superseded fetch's signal fires, no error; the refetch's answer lands", async () => {
    // mutation RED: rt.refetch / Request.run making a non-abortable task for a READ request
    const { rt, srv } = await refetchRun(READ_FN, "refetch-read-");
    const reported = [];
    const prev = rt.setHostErrorReporter((e) => reported.push(e));
    try {
      await settle();
      expect(who()).toBe("a");
      const held = abortableTransport(srv);
      click(document.querySelector("#u2"));   // run 1: user 2
      await settle(5);
      expect(held.length).toBe(1);
      click(document.querySelector("#rf"));   // the refetch supersedes run 1
      await settle(5);
      expect(held.length).toBe(2);
      expect([held[0].aborted, held[0].signal.aborted, held[1].aborted]).toEqual([true, true, false]);
      expect(sig(cells(rt))).toEqual({ loading: true, data: "a", error: null, stale: true });
      await held[1].go();
      await settle();
      expect(who()).toBe("b");
      expect(sig(cells(rt))).toEqual({ loading: false, data: "b", error: null, stale: false });
      expect(reported).toEqual([]);
    } finally {
      rt.setHostErrorReporter(prev);
    }
  });

  test("WRITE refetched while in flight: the superseded fetch is NOT aborted; it completes and is dropped", async () => {
    // mutation RED: every request's task abortable regardless of class
    const { rt, srv } = await refetchRun(WRITE_FN, "refetch-write-");
    const reported = [];
    const prev = rt.setHostErrorReporter((e) => reported.push(e));
    try {
      await settle();
      expect(who()).toBe("a");
      const held = abortableTransport(srv);
      click(document.querySelector("#u2"));   // run 1: pre(2) held
      await settle(5);
      click(document.querySelector("#rf"));   // the refetch (run 2) supersedes run 1: pre(2) held
      await settle(5);
      expect(held.length).toBe(2);
      expect(held.map((h) => h.aborted)).toEqual([false, false]);
      await held[1].go();                      // run 2 goes on to nm(2) (WRITE_FN: two server calls a run)
      await settle(5);
      expect(held.length).toBe(3);
      await held[2].go();
      await settle();
      expect(who()).toBe("b");
      await held[0].go();                      // the superseded transport completes …
      await settle();
      expect(held.length).toBe(3);             // … run 1 never continues to its second call
      expect(who()).toBe("b");                 // … and is discarded
      expect(sig(cells(rt))).toEqual({ loading: false, data: "b", error: null, stale: false });
      expect(reported).toEqual([]);
    } finally {
      rt.setHostErrorReporter(prev);
    }
  });
});
