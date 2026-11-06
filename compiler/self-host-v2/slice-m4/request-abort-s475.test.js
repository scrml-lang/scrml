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
// O-059-3 (a non-SQL side effect) is not ruled: the bootstrap classifies such a call graph — and one
// that reaches no SQL at all — WRITE (fail closed to discard; INTERIM, analyze.scrml requestReads).

import { describe, test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import { createServer as httpServer, request as httpRequest } from "node:http";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { SQL } from "bun";
import { Database } from "bun:sqlite";
import { mods, compile, check, realDb, serve, bridge, pathOf, plainRequest } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
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

// A READ load (a SELECT, nothing else) and a WRITE-classified one (a server function with no SQL:
// O-059-3 unruled → WRITE), each a request on `@userId` with buttons to change it and an optional
// `if=` region (teardown).
const READ_FN = `    function loadName(id: int) -> string {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
`;
const WRITE_FN = `    server function loadName(id: int) -> string {
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

  test("a load through a CLIENT function that waits on the server (SWaits — not one server call) is WRITE", () => {
    const src = APP(`    function q(id: int) -> string {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
    function loadName(id: int) -> string { return q(id) !{ _ :> "?" }; }
`);
    expect(name(clsOf(src).cls)).toBe(WRITE);
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

  test("a server function that reaches no SQL is WRITE (O-059-3 unruled — fail closed)", () => {
    expect(name(clsOf(APP(WRITE_FN)).cls)).toBe(WRITE);
  });

  test("a client-only load (no server call: not a single server batch) is WRITE", () => {
    const src = `<program>\n    let <u:int=1/>\n    let <m:int=0/>\n    fn cnt(x: int) -> int { return x + 1; }\n    <request id="load">${D} @m = cnt(@u); }</request>\n    <main><p>${D}@m}</p></main>\n</program>\n`;
    expect(name(clsOf(src).cls)).toBe(WRITE);
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
      click(document.querySelector("#u2"));
      await settle(5);
      click(document.querySelector("#u3"));
      await settle(5);
      expect(held.length).toBe(2);
      expect(held[0].aborted).toBe(false);
      expect(held[0].signal.aborted).toBe(false);
      await held[1].go();
      await settle();
      expect(who()).toBe("c");
      await held[0].go();                       // the superseded transport completes
      await settle();
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
