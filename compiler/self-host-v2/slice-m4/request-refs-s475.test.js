// request-refs-s475.test.js — s475-boot-request-refs (slice S3b of the bootstrap §13.9
// pending-cells plan): `<#id>.loading` / `.data` / `.error` / `.stale` reads and `<#id>.refetch()`
// on top of the `<request>` body form (#1781, slice S3a).
//
// Governing text (SPEC §6.7.7 Properties):
//   | `<#id>.loading` | `boolean` | `true` while fetch is in flight |
//   | `<#id>.data` | `T \| not` | Most recent successful fetch result, or `not` before first success |
//   | `<#id>.error` | `Error \| not` | Error from most recent failed fetch, or `not` |
//   | `<#id>.stale` | `boolean` | `true` when data exists AND a new fetch is in flight |
//   | `<#id>.refetch()` | `() -> void` | Imperatively re-execute the fetch body |
//   Normative: "its failure — the callee's declared error, or the transport failure of a call to a
//    server function (§19.9.10) — SHALL set `<#id>.error`" (so `.error` is the call's failure enum).
//   EC-4: "`refetch()` while loading. Starts a new fetch immediately, superseding the in-flight one".
//   §6.7.4 "What counts as a write": "`<#id>.refetch()`, which writes the `<request>`'s assigned cell".
//
// The six acceptance cases that read `<#userReq>` (acceptance/request/) are graded in
// acceptance.test.js. This file grades each property in markup and in logic, refetch from a handler,
// a program function and a sibling scope, refetch while loading and after teardown, and every refusal.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mods, compile, check, realDb, serve, bridge } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram, instancesOf } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 300000 });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; expectNoPageErrors(); });

const SQ = "?" + "{";
const D = "$" + "{";
const H = (id) => "<" + "#" + id + ">";
const R = H("userReq");
const fe = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const diags = (src) => fe(src).diags.map((d) => `${d.code}: ${d.message}`);
const codes = (src) => fe(src).diags.map((d) => d.code);
const errCodes = (src) => codes(src).filter((c) => !c.startsWith("W-"));
const DDL = ["CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"];
const ROWS = { users: [{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }] };
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(ms = 60) { for (let i = 0; i < ms; i++) await tick(); }
let k = 0;

const LOAD = `    function loadName(id: int) -> string {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
`;
const text = (sel) => document.querySelector(sel)?.textContent ?? null;
const count = (sel) => document.querySelectorAll(sel).length;

function cells(rt) {
  const prog = instancesOf(rt, "program")[0];
  const out = {};
  prog.decl.fields.forEach((h, i) => { out[h] = prog.fields[i].peek(); });
  return out;
}

function heldTransport(srv) {
  const b = bridge(srv);
  const held = [];
  globalThis.fetch = (p, init) => new Promise((resolve, reject) => {
    held.push({ go: () => b(p, init).then(resolve, reject), fail: () => reject(new TypeError("Failed to fetch")), body: String(init.body ?? "") });
  });
  return held;
}
async function releaseAll(held, from = 0) {
  for (let round = 0; round < 3; round++) {
    for (let i = from; i < held.length; i++) { if (!held[i].done) { held[i].done = true; await held[i].go(); } }
    await settle();
  }
}

// Every property in markup: interpolations and `if=` regions, a request on a server function.
const MARKUP = (opts = {}) => `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <userId:int=1/>
    let <userName:string=""/>
${LOAD}    <request id="userReq">${D} @userName = loadName(@userId); }</request>
    <main>
        <button id="u2" onclick={ @userId = 2; }>2</button>
        <button id="again" onclick={ ${R}.refetch(); }>again</button>
        <p id="loading">${D}${R}.loading}</p>
        <p id="stale">${D}${R}.stale}</p>
        <p id="who" if=(${R}.data is given)>${D}@userName}</p>
        <p id="err" if=(${R}.error is given)>failed</p>
    </main>
</program>
`;

describe("each property read in markup is reactive (§6.7.7 Properties)", () => {
  test("mount: loading true, no data / error; settle: loading false, data shows; a re-run: stale true while in flight", async () => {
    const r = compile(MARKUP());
    expect(check(r.core)).toEqual([]);
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(r.core, sql);
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, "refs-markup-" + k++);
    await settle(5);
    expect([text("#loading"), text("#stale"), count("#who"), count("#err")]).toEqual(["true", "false", 0, 0]);
    await releaseAll(held);
    expect([text("#loading"), text("#stale"), text("#who"), count("#err")]).toEqual(["false", "false", "a", 0]);
    const n = held.length;
    click(document.querySelector("#u2"));
    await settle(5);
    // keep-stale: data kept (#who still shows), stale and loading true while the re-run is in flight
    expect([text("#loading"), text("#stale"), text("#who")]).toEqual(["true", "true", "a"]);
    await releaseAll(held, n);
    expect([text("#loading"), text("#stale"), text("#who")]).toEqual(["false", "false", "b"]);
    expect(cells(rt)["#userReq_data"]).toBe("b");
  });

  test("a failed settle: `.error is given` mounts #err, `.data` keeps the last success", async () => {
    const r = compile(MARKUP());
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(r.core, sql);
    globalThis.fetch = bridge(srv);
    await loadProgram(r.core, "refs-fail-" + k++);
    await settle();
    expect([text("#who"), count("#err")]).toEqual(["a", 0]);
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    click(document.querySelector("#again"));
    await settle();
    expect([text("#who"), count("#err"), text("#loading")]).toEqual(["a", 1, "false"]);
    // EC-1: the next run clears `error`
    globalThis.fetch = bridge(srv);
    click(document.querySelector("#again"));
    await settle();
    expect([text("#who"), count("#err")]).toEqual(["a", 0]);
  });
});

// Every property read in logic (a program function), `.error` matched on its failure enum.
const LOGIC = `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <userId:int=1/>
    let <userName:string=""/>
    let <busy:boolean=false/>
    let <has:boolean=false/>
    let <msg:string="-"/>
${LOAD}    <request id="userReq">${D} @userName = loadName(@userId); }</request>
    function snap() {
        @busy = ${R}.loading || ${R}.stale;
        @has = ${R}.data is given;
        @msg = match ${R}.error {
            .Transport(t) :> "wire",
            not :> "none"
        };
    }
    <main>
        <button id="snap" onclick=snap()>snap</button>
        <button id="u2" onclick={ @userId = 2; }>2</button>
        <p id="who">${D}@userName}</p>
        <p id="out">${D}@busy}/${D}@has}/${D}@msg}</p>
    </main>
</program>
`;

describe("each property read in logic (a program function)", () => {
  test("types: `.loading` / `.stale` boolean, `.data is given`, `match` over `.error` (the call's `Transport` failure, §19.9.10)", () => {
    expect(diags(LOGIC)).toEqual([]);
    expect(check(compile(LOGIC).core)).toEqual([]);
  });

  test("runtime: the function reads the signals of the moment", async () => {
    const r = compile(LOGIC);
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(r.core, sql);
    const held = heldTransport(srv);
    await loadProgram(r.core, "refs-logic-" + k++);
    await settle(5);
    click(document.querySelector("#snap"));
    await settle(5);
    expect(text("#out")).toBe("true/false/none");
    await releaseAll(held);
    click(document.querySelector("#snap"));
    await settle(5);
    expect(text("#out")).toBe("false/true/none");
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    click(document.querySelector("#u2"));          // a re-run whose call fails on the wire
    await settle();
    click(document.querySelector("#snap"));
    await settle(5);
    expect(text("#out")).toBe("false/true/wire");   // data kept (the last success), error = .Transport
    expect(text("#who")).toBe("a");
  });
});

// refetch from a handler, a program function, and a sibling scope (the request in an `if=` region,
// the button outside it); a mount-only request (`deps=[]`), so only refetch re-runs it.
const REFETCH = `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <userId:int=1/>
    let <show:boolean=true/>
    let <userName:string="-"/>
${LOAD}    <div id="box" if=(@show)>
        <request id="userReq" deps=[]>${D} @userName = loadName(@userId); }</request>
        <button id="inner" onclick={ @userId = 3; ${R}.refetch(); }>3</button>
    </div>
    function again(n: int) {
        @userId = n;
        ${R}.refetch();
    }
    <main>
        <button id="fn2" onclick=again(2)>2</button>
        <button id="sib" onclick={ ${R}.refetch(); }>again</button>
        <button id="hide" onclick={ @show = false; }>hide</button>
        <button id="showb" onclick={ @show = true; }>show</button>
        <p id="who">${D}@userName}</p>
        <p id="loading">${D}${R}.loading}</p>
    </main>
</program>
`;

describe("`<#id>.refetch()` — routed through the request's program-level slot", () => {
  test("it compiles clean; the handle is one module-level slot the request fills (`slot:`)", () => {
    expect(diags(REFETCH)).toEqual([]);
    const r = compile(REFETCH);
    expect(check(r.core)).toEqual([]);
    const js = mods().print.printProgram(r.core, "app.client.js", "scrml-runtime.js").js;
    const slots = [...js.matchAll(/^const (\w+) = rt\.requestSlot\(\);$/gm)].map((m) => m[1]);
    expect(slots.length).toBe(1);
    expect(js).toContain("slot: " + slots[0] + " });");
    expect(js.match(/rt\.refetch\(/g).length).toBe(3);
  });

  test("from a program function, a handler in the request's own scope, and a sibling scope's handler", async () => {
    const r = compile(REFETCH);
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(r.core, sql);
    globalThis.fetch = bridge(srv);
    await loadProgram(r.core, "refs-refetch-" + k++);
    await settle();
    expect(text("#who")).toBe("a");
    click(document.querySelector("#fn2"));        // a program function: @userId = 2; refetch
    await settle();
    expect(text("#who")).toBe("b");
    click(document.querySelector("#inner"));      // the request's own `if=` scope
    await settle();
    expect(text("#who")).toBe("c");
    await sql`UPDATE users SET name = 'cc' WHERE id = 3`;
    click(document.querySelector("#sib"));        // a sibling scope: re-runs with the same @userId
    await settle();
    expect(text("#who")).toBe("cc");
  });

  test("EC-4 refetch while loading: a new run supersedes the in-flight one — the older answer is dropped", async () => {
    const r = compile(REFETCH);
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(r.core, sql);
    globalThis.fetch = bridge(srv);
    const { rt } = await loadProgram(r.core, "refs-ec4-" + k++);
    await settle();
    const held = heldTransport(srv);
    click(document.querySelector("#fn2"));        // run 1: user 2
    await settle(5);
    expect(text("#loading")).toBe("true");
    click(document.querySelector("#inner"));      // run 2 while run 1 is in flight: user 3
    await settle(5);
    expect(held.length).toBe(2);
    await held[1].go();                           // the newer answer first
    await settle();
    expect(text("#who")).toBe("c");
    await held[0].go();                           // the superseded answer: discarded
    await settle();
    expect(text("#who")).toBe("c");
    expect([cells(rt)["#userReq_loading"], cells(rt)["#userReq_data"]]).toEqual([false, "c"]);
  });

  test("refetch after teardown does nothing (no run, no error); after remount it runs again", async () => {
    const r = compile(REFETCH);
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(r.core, sql);
    globalThis.fetch = bridge(srv);
    const { rt } = await loadProgram(r.core, "refs-teardown-" + k++);
    await settle();
    expect(text("#who")).toBe("a");
    click(document.querySelector("#hide"));
    await settle(5);
    expect(rt.stats.requests).toBe(0);
    const held = heldTransport(srv);
    click(document.querySelector("#fn2"));        // @userId = 2, then refetch of an unmounted request
    click(document.querySelector("#sib"));
    await settle();
    expect(held.length).toBe(0);
    expect(text("#who")).toBe("a");
    expect(text("#loading")).toBe("false");
    globalThis.fetch = bridge(srv);
    click(document.querySelector("#showb"));      // remount: a mount run (with @userId = 2)
    await settle();
    expect(rt.stats.requests).toBe(1);
    expect(text("#who")).toBe("b");
    click(document.querySelector("#inner"));
    await settle();
    expect(text("#who")).toBe("c");
  });
});

describe("refusals and edges — each by its code", () => {
  const P = (body, markup = "", extra = "") => `<program>
    let <a:int=1/>
    let <x:int=0/>
    let <b:boolean=false/>
    fn f(n: int) -> int { return n + 1; }
${extra}    <request id="r">${D} @x = f(@a); }</request>
${body}    <main><p>${D}@x}${D}@b}</p>${markup}</main>
</program>
`;
  test("a clean baseline", () => {
    expect(errCodes(P(""))).toEqual([]);
  });
  test("an unknown id: E-SCOPE-001, for a read and for refetch", () => {
    const d = diags(P("", `<p>${D}${H("nope")}.loading}</p>`));
    expect(d.filter((m) => m.startsWith("E-")).length).toBe(1);
    expect(d.find((m) => m.startsWith("E-SCOPE-001"))).toContain(H("nope") + "` names no `<request>`");
    expect(errCodes(P("", `<button onclick={ ${H("nope")}.refetch(); }>x</button>`))).toEqual(["E-SCOPE-001"]);
  });
  test("an id another element carries: not a request — E-BOOTSTRAP-UNSUPPORTED", () => {
    const d = diags(P("", `<div id="t">${D}${H("t")}.loading}</div>`));
    expect(d.find((m) => m.startsWith("E-BOOTSTRAP-UNSUPPORTED"))).toContain("names the `<div id=\"t\">`");
  });
  test("an unknown property / method: E-SCOPE-001; `.refetch` uncalled, a bare `<#r>`: refused by name", () => {
    expect(errCodes(P("", `<p>${D}${H("r")}.value}</p>`))).toEqual(["E-SCOPE-001"]);
    expect(errCodes(P("", `<button onclick={ ${H("r")}.loading(); }>x</button>`))).toEqual(["E-SCOPE-001"]);
    expect(errCodes(P("", `<button onclick={ @b = ${H("r")}.refetch is given; }>x</button>`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(errCodes(P("", `<p>${D}${H("r")}}</p>`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("refetch takes no arguments (E-CALL-ARITY) and is void (E-TYPE-001 as a value)", () => {
    expect(errCodes(P("", `<button onclick={ ${H("r")}.refetch(1); }>x</button>`))).toEqual(["E-CALL-ARITY"]);
    expect(errCodes(P("", `<button onclick={ @b = ${H("r")}.refetch(); }>x</button>`))).toContain("E-TYPE-001");
  });
  test("a property is read-only: a write is E-WRITE-NOT-GRANTED, by name", () => {
    const d = diags(P("", `<button onclick={ ${H("r")}.loading = true; }>x</button>`));
    expect(d.map((m) => m.split(":")[0])).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(d[0]).toContain(H("r") + ".loading` is read-only");
  });
  test("a value position that refetches writes state (§6.15): E-VALUE-WRITES-STATE, plus E-TYPE-001 (void)", () => {
    expect(errCodes(P("", `<p>${D}${H("r")}.refetch()}</p>`)).sort()).toEqual(["E-TYPE-001", "E-VALUE-WRITES-STATE"]);
  });
  test("a property as an `<effect>` / `<request>` dependency is no cell: E-LIFECYCLE-007 / E-LIFECYCLE-022", () => {
    expect(errCodes(P(`    <effect deps=[${H("r")}.data]>${D} f(1); }</effect>\n`))).toContain("E-LIFECYCLE-007");
    expect(errCodes(P(`    <request id="q" deps=[${H("r")}.loading]>${D} @b = (f(1) > 0); }</request>\n`))).toContain("E-LIFECYCLE-022");
  });
  test("refetch is a WRITE of the request's target (§6.7.4): an `<effect>` body that refetches is E-EFFECT-WRITES-STATE", () => {
    const d = diags(P(`    <effect deps=[@a]>${D} ${H("r")}.refetch(); }</effect>\n`));
    expect(d.find((m) => m.startsWith("E-EFFECT-WRITES-STATE"))).toContain("@x");
    // through a function too
    const d2 = diags(P(`    function re() { ${H("r")}.refetch(); }\n    <effect deps=[@a]>${D} re(); }</effect>\n`));
    expect(d2.find((m) => m.startsWith("E-EFFECT-WRITES-STATE"))).toContain("@x");
  });
  test("`.data` / `.error` read ABOVE the request are refused by name (INTERIM); `.loading` there is fine", () => {
    const above = (expr) => `<program>
    let <a:int=1/>
    let <x:int=0/>
    fn f(n: int) -> int { return n + 1; }
    <p id="q">${D}${expr}}</p>
    <request id="r">${D} @x = f(@a); }</request>
    <main><p>${D}@x}</p></main>
</program>
`;
    expect(diags(above(`${H("r")}.data is given`)).find((m) => m.startsWith("E-BOOTSTRAP-UNSUPPORTED"))).toContain("above its `<request id=\"r\">`");
    expect(errCodes(above(`${H("r")}.loading`))).toEqual([]);
  });
  test("W-LIFECYCLE-012 (refetch in a `<timer>` / `<poll>` body) is unreachable: `<timer>` / `<poll>` are refused, fail closed", () => {
    for (const tag of ["timer", "poll"]) {
      const d = diags(P("", `<${tag} id="t" interval=(100)>${D} ${H("r")}.refetch(); }</${tag}>`));
      expect(d.find((m) => m.startsWith("E-BOOTSTRAP-UNSUPPORTED"))).toContain("`<" + tag + ">`");
    }
  });
  test("a `<#id>` in a string literal stays text", async () => {
    const src = P("", `<p id="t">${D}"${H("r")}.data"}</p>`);
    expect(errCodes(src)).toEqual([]);
    const r = compile(src);
    await loadProgram(r.core, "refs-str-" + k++);
    await settle();
    expect(text("#t")).toBe(H("r") + ".data");
  });
  test("server code: a read or a refetch in a server function is refused (the request is client state)", () => {
    const S = (stmt) => `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <userName:string=""/>
${LOAD}    <request id="userReq" deps=[]>${D} @userName = loadName(1); }</request>
    function srv() -> string {
        ${stmt}
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = 1\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
    <main><p>${D}@userName}</p></main>
</program>
`;
    expect(errCodes(S(`${R}.refetch();`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(errCodes(S(`const l: boolean = ${R}.loading;`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
});
