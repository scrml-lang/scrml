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
  test("another file's `<#id>` names nothing (the program's requests, like its cells, are its own file's — §7.6.1)", () => {
    const lib = { path: "lib.scrml", src: `export function poke() {\n    ${H("r")}.refetch();\n}\n` };
    const app = { path: "app.scrml", src: `import { poke } from "./lib.scrml";\n` + P("", `<button onclick=poke()>p</button>`) };
    const r = frontEnd(mods(), [lib, app], "app.scrml");
    const d = r.diags.filter((x) => x.severity === "Error");
    expect(d.map((x) => [x.code, x.file])).toEqual([["E-SCOPE-001", "lib.scrml"]]);
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

// s475 r1 (#1788 review F1, PA ruling "build the capable form") — `<#id>.data` / `.error` are
// `T | not` (§6.7.7 Properties) and narrow EXACTLY like a `T | not` cell: the same tests
// (`is given`, `is not`, a bare presence condition), the same places (`if` / else chains, the
// rest of a block after an early return, `&&` / ternary, a markup `if=` / `else-if=` region and
// its handlers), and the same ends (a suspension point, a deferred body, an ungated handler) —
// plus `<#id>.refetch()`, directly or through a called function. RED on 536f284e0: every
// "narrows" row was E-TYPE-031 / E-OPERAND-NOT-NARROWED.
describe("r1 F1 — `.data` / `.error` narrow like a cell", () => {
  const P = (body, markup = "", extra = "") => `<program>
    let <a:int=1/>
    let <m:int | not=not/>
    let <x:int=0/>
    let <b:boolean=false/>
    fn f(n: int) -> int { return n + 1; }
${extra}    <request id="r">${D} @x = f(@a); }</request>
${body}    <main><p>${D}@x}${D}@b}</p>${markup}</main>
</program>
`;
  const r = H("r");
  // each shape twice: over the cell `@m` (the reference) and over `<#r>.data`
  const both = (shape) => [errCodes(shape("@m")), errCodes(shape(r + ".data"))];
  const fn = (body) => (v) => P(`    function g() { ${body(v)} }\n`);
  const SV = (body) => (v) => `<program db="./app.db">
    let <a:int=1/>
    let <m:int | not=not/>
    let <x:int=0/>
    fn f(n: int) -> int { return n + 1; }
    function sv() -> int { const u: int = ${SQ}\`SELECT 1 AS v\`}.get() !{ _ :> { return 0; } }; return 1; }
    <request id="r">${D} @x = f(@a); }</request>
    function g() { ${body(v)} }
    <main><p>${D}@x}</p></main>
</program>
`;
  const narrows = {
    "if (… is given) { @a = … }": fn((v) => `if (${v} is given) { @a = ${v}; }`),
    "early return on `is not`": fn((v) => `if (${v} is not) { return; } @a = ${v};`),
    "else branch of `is not`": fn((v) => `if (${v} is not) { @a = 0; } else { @a = ${v}; }`),
    "a bare presence condition": fn((v) => `if (${v}) { @a = ${v}; }`),
    "`&&`": (v) => P(`    function g() -> boolean { return ${v} is given && ${v} > 1; }\n`),
    "ternary": (v) => P(`    function g() -> int { return ${v} is given ? ${v} : 0; }\n`),
    "a write of another cell keeps it": fn((v) => `if (${v} is given) { @b = true; @a = ${v}; }`),
    "markup `if=`": (v) => P("", `<p if=(${v} is given)>${D}${v} + 1}</p>`),
    "markup `else-if=` / `else`": (v) => P("", `<p if=(@b)>b</p><p else-if=(${v} is not)>none</p><p else>${D}${v} + 1}</p>`),
    "a handler under an `if=` gate": (v) => P("", `<div if=(${v} is given)><button onclick={ @a = ${v}; }>x</button></div>`),
  };
  for (const [name, shape] of Object.entries(narrows)) {
    test("narrows: " + name, () => { expect(both(shape)).toEqual([[], []]); });
  }
  const ends = {
    "no test at all": fn((v) => `@a = ${v};`),
    "an ungated handler": (v) => P("", `<button onclick={ @a = ${v}; }>y</button>`),
    "a deferred body": fn((v) => `if (${v} is given) { defer { @a = ${v}; } }`),
    "a suspension point (a server call)": SV((v) => `if (${v} is given) { const q: int = sv() !{ _ :> { return; } }; @a = ${v}; }`),
  };
  for (const [name, shape] of Object.entries(ends)) {
    test("does not narrow: " + name + " (E-TYPE-031)", () => { expect(both(shape)).toEqual([["E-TYPE-031"], ["E-TYPE-031"]]); });
  }
  test("`<#r>.refetch()` ends it — directly, in a nested block, through a called function; another request's does not", () => {
    expect(errCodes(P(`    function g() { if (${r}.data is given) { ${r}.refetch(); @a = ${r}.data; } }\n`))).toEqual(["E-TYPE-031"]);
    expect(errCodes(P(`    function g() { if (${r}.data is given) { if (@b) { ${r}.refetch(); } @a = ${r}.data; } }\n`))).toEqual(["E-TYPE-031"]);
    expect(errCodes(P(`    function re() { ${r}.refetch(); }\n    function g() { if (${r}.data is given) { re(); @a = ${r}.data; } }\n`))).toEqual(["E-TYPE-031"]);
    expect(errCodes(P(`    function g() { if (${r}.data is given) { ${H("q")}.refetch(); @a = ${r}.data; } }\n`, `<p>${D}@y}</p>`, `    let <y:int=0/>\n    <request id="q">${D} @y = f(@a); }</request>\n`))).toEqual([]);
  });
  test("`.error`: a bare presence condition and `is given` narrow it (its value is the call's failure)", () => {
    expect(errCodes(P(`    function g() { if (${r}.error) { @b = true; } }\n`))).toEqual([]);
    expect(errCodes(P("", `<p if=(${r}.error is given)>${D}match ${r}.error { _ :> "failed" }}</p>`))).toEqual([]);
  });

  // SPEC §6.7.7 Example 1 ("User profile with loading and error states"), in the bootstrap's
  // ruled form: the `if` / `else if` / `else` chain is a markup `if=` / `else-if=` / `else`
  // chain (a `lift` of markup in a logic `if` is not in the bootstrap), `@user.name` a string
  // cell. Retry is the unparenthesised `onclick=<#profile>.refetch()` (r1 F5).
  const EX1 = `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <userId:int=1/>
    let <userName:string=""/>
${LOAD}    <request id="profile">${D} @userName = loadName(@userId); }</request>
    <div>
        <p id="loading" if=(${H("profile")}.loading && !${H("profile")}.stale)>Loading...</p>
        <div id="error" else-if=(${H("profile")}.error)><p>Error</p><button id="retry" onclick=${H("profile")}.refetch()>Retry</button></div>
        <h1 id="name" else>${D}@userName}</h1>
        <p id="shout" if=(${H("profile")}.data is given)>${D}${H("profile")}.data + "!"}</p>
        <button id="reload" onclick=${H("profile")}.refetch()>reload</button>
    </div>
</program>
`;
  test("SPEC Example 1 compiles clean (no W-LIFECYCLE-011 either) and runs: loading, then data; a failed refetch shows Error; Retry recovers", async () => {
    expect(diags(EX1)).toEqual([]);
    const c = compile(EX1);
    expect(check(c.core)).toEqual([]);
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(c.core, sql);
    const held = heldTransport(srv);
    await loadProgram(c.core, "refs-ex1-" + k++);
    await settle(5);
    expect([count("#loading"), count("#error"), count("#name"), count("#shout")]).toEqual([1, 0, 0, 0]);
    await releaseAll(held);
    expect([count("#loading"), count("#error"), text("#name"), text("#shout")]).toEqual([0, 0, "a", "a!"]);
    // a failed run: in flight it is stale (data kept: the `else` branch still shows), then `.error`
    // mounts the Error branch — `.data` keeps the last success (#shout)
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    click(document.querySelector("#reload"));
    expect([count("#loading"), count("#error"), text("#name")]).toEqual([0, 0, "a"]);
    await settle();
    expect([count("#loading"), count("#error"), count("#name"), text("#shout")]).toEqual([0, 1, 0, "a!"]);
    // Retry (inside the Error branch) recovers: `.error` is cleared, the new data shows
    globalThis.fetch = bridge(srv);
    await sql`UPDATE users SET name = 'z' WHERE id = 1`;
    click(document.querySelector("#retry"));
    await settle();
    expect([count("#loading"), count("#error"), text("#name"), text("#shout")]).toEqual([0, 0, "z", "z!"]);
  });
});

// s475 r1 (#1788 review F2) — W-LIFECYCLE-011 ("the assigned `@variable` is never read in
// enclosing markup"): `<#id>.data` IS the target's last loaded value, so a markup read of it is
// a read of the target. RED on 536f284e0: W-LIFECYCLE-011 fired for a `.data`-only read.
describe("r1 F2 — a markup `<#id>.data` read counts as a read of the target", () => {
  const W = (markup) => `<program>
    let <a:int=1/>
    let <x:int=0/>
    fn f(n: int) -> int { return n + 1; }
    <request id="r">${D} @x = f(@a); }</request>
    <main>${markup}</main>
</program>
`;
  test("`${<#r>.data}` / `if=(<#r>.data is given)`: no warning; `.loading` only (or nothing): the warning", () => {
    expect(codes(W(`<p>${D}${H("r")}.data}</p>`))).toEqual([]);
    expect(codes(W(`<p if=(${H("r")}.data is given)>has</p>`))).toEqual([]);
    expect(codes(W(`<p>${D}${H("r")}.loading}</p>`))).toEqual(["W-LIFECYCLE-011"]);
    expect(codes(W(`<p>-</p>`))).toEqual(["W-LIFECYCLE-011"]);
  });
});

// s475 r1 (#1788 review F4) — ⚑ PA reading next to EC-4 "Starts a new fetch immediately":
// refetches in ONE handler coalesce (the handler is one batch()) into ONE run that starts when
// the handler ends, so `.loading` read inside the handler right after `refetch()` is still false.
describe("r1 F4 — refetches in one handler coalesce (PA reading of EC-4 \"immediately\")", () => {
  test("two refetches and a read of `.loading` in one handler: one transport; the read sees false", async () => {
    const src = `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <userName:string=""/>
    let <seen:boolean=true/>
${LOAD}    <request id="userReq" deps=[]>${D} @userName = loadName(1); }</request>
    <main>
        <button id="go" onclick={ ${R}.refetch(); ${R}.refetch(); @seen = ${R}.loading; }>go</button>
        <p id="who">${D}@userName}</p>
        <p id="seen">${D}@seen}</p>
        <p id="busy">${D}${R}.loading}</p>
    </main>
</program>
`;
    expect(diags(src)).toEqual([]);
    const c = compile(src);
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(c.core, sql);
    const held = heldTransport(srv);
    await loadProgram(c.core, "refs-f4-" + k++);
    await settle(5);
    await releaseAll(held);
    const n = held.length;
    click(document.querySelector("#go"));
    await settle(5);
    expect([held.length - n, text("#seen"), text("#busy")]).toEqual([1, "false", "true"]);
    await releaseAll(held, n);
    expect(text("#busy")).toBe("false");
  });
});

// s475 r1 (#1788 review F5) — an unparenthesised attribute value reads a `<#id>` reference whole
// (SPEC state-ref ::= '<#' identifier '>'): its `>` closes the reference, not the tag, so
// `onclick=<#r>.refetch()` parses the way `onclick=f()` does. RED on 536f284e0: E-PARSE-EXPR.
describe("r1 F5 — `onclick=<#r>.refetch()` unparenthesised", () => {
  test("it compiles clean and refetches on click", async () => {
    const src = `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <userName:string=""/>
${LOAD}    <request id="userReq" deps=[]>${D} @userName = loadName(1); }</request>
    <main>
        <button id="go" onclick=${R}.refetch()>go</button>
        <p id="who">${D}@userName}</p>
        <button id="busy" disabled=${R}.loading>${D}${R}.loading}</button>
    </main>
</program>
`;
    expect(diags(src)).toEqual([]);
    const c = compile(src);
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(c.core, sql);
    const held = heldTransport(srv);
    await loadProgram(c.core, "refs-f5-" + k++);
    await settle(5);
    await releaseAll(held);
    expect(text("#who")).toBe("a");
    const n = held.length;
    await sql`UPDATE users SET name = 'z' WHERE id = 1`;
    click(document.querySelector("#go"));
    await settle(5);
    expect(held.length).toBe(n + 1);
    await releaseAll(held, n);
    expect(text("#who")).toBe("z");
  });
});
