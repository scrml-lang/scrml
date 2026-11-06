// request-surface-s475.test.js — s475-boot-request-surface (slice S3a of the bootstrap §13.9
// pending-cells plan): the author-facing `<request id="…">${ lin* @x = load(…); }</request>`
// (SPEC §6.7.7), lowered onto the Core View.Request + rt.requestOn that #1771 (slice S2) built.
//
// Governing text (SPEC §6.7.7):
//   grammar  request-attrs ::= id-attr (deps-attr)? (cache-attr)? ;
//            request-body  ::= '$' '{' lin-declaration* assignment-expression '}'
//   "The `id` attribute is required (E-LIFECYCLE-018)."
//   "When absent, the compiler infers reactive dependencies from `@variable` reads within the fetch
//    expression. When present, `deps` overrides inference."
//   Mount: "`<#id>.loading` is set to `true` … The fetch body executes asynchronously."
//   Settled (success): "`<#id>.data` → resolved value"; (failure): "`<#id>.data` retains previous
//    value (does NOT become `not` on error)", "`<#id>.error` → caught error value".
//   EC-2: "only the most recently initiated fetch's result is applied"; EC-3: "Scope destroyed during
//    in-flight fetch. The resolution is discarded."
//   "The call that is the right-hand side of the body's assignment SHALL be handled by the request,
//    and SHALL NOT be E-ERROR-002".
//   "`<request>` is not a loop … the body executes once on mount, then only on dependency change or
//    `refetch()`" — so the assigned cell is never a dependency (Core C-R1 refuses one).
//
// The acceptance twins of the 12 conformance/cases/lifecycle/request-* cases live in
// compiler/self-host-v2/acceptance/request/ (graded in acceptance.test.js). This file grades what
// they cannot reach: the four `<#id>` signal cells (their S3b reads do not parse yet), the newest-wins
// and teardown edges (a controlled transport), the Core shape, and every S3a refusal by its message.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mods, compile, check, realDb, serve, bridge } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram, instancesOf } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 300000 });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; expectNoPageErrors(); });

const SQ = "?" + "{";
const D = "$" + "{";
const fe = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const diags = (src) => fe(src).diags.map((d) => `${d.code}: ${d.message}`);
const codes = (src) => fe(src).diags.map((d) => d.code);
const DDL = ["CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"];
const ROWS = { users: [{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }] };
const tick = () => new Promise((r) => setTimeout(r, 0));
let k = 0;

const LOAD = `    function loadName(id: int) -> string {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
`;
// The program under test: a request on a server function, its target read in markup, a button that
// changes its inferred dependency, and (opt) an `if=` region holding the request (teardown).
const APP = (opts = {}) => `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <userId:int=1/>
    let <show:boolean=true/>
    let <userName:string="${opts.init ?? ""}"/>
${LOAD}${opts.inIf ? `    <div id="box" if=(@show)>\n        <request id="userReq">${D} @userName = loadName(@userId); }</request>\n    </div>\n` : `    <request id="userReq">${D} @userName = loadName(@userId); }</request>\n`}    <main>
        <button id="u2" onclick={ @userId = 2; }>2</button>
        <button id="u3" onclick={ @userId = 3; }>3</button>
        <button id="hide" onclick={ @show = false; }>hide</button>
        <button id="showb" onclick={ @show = true; }>show</button>
        <p id="who">${D}@userName}</p>
    </main>
</program>
`;

// The program instance's cells by field hint (the four signals are `#<id>_<signal>`).
function cells(rt) {
  const prog = instancesOf(rt, "program")[0];
  const out = {};
  prog.decl.fields.forEach((h, i) => { out[h] = prog.fields[i].peek(); });
  return out;
}
const sig = (c) => ({ loading: c["#userReq_loading"], data: c["#userReq_data"], error: c["#userReq_error"], stale: c["#userReq_stale"] });

// A transport the test drives: every client call is queued (the real server answers it when the
// test RELEASES it, in the order the test picks) — or fails on the wire.
function heldTransport(srv) {
  const b = bridge(srv);
  const held = [];
  globalThis.fetch = (p, init) => new Promise((resolve, reject) => {
    held.push({ go: () => b(p, init).then(resolve, reject), fail: () => reject(new TypeError("Failed to fetch")), body: String(init.body ?? "") });
  });
  return held;
}
async function settle(ms = 60) { for (let i = 0; i < ms; i++) await tick(); }

describe("Core: a `<request>` lowers onto View.Request (C-R1 accepts it)", () => {
  test("target, inferred deps without the target, all four signals, a handle, mount: true; checks clean", () => {
    const r = compile(APP());
    expect(check(r.core)).toEqual([]);
    const prog = r.core.decls.find((d) => d.sym.id === r.core.program.id);
    const hints = prog.fields.map((f) => f.sym.hint);
    expect(hints.slice(-4)).toEqual(["#userReq_loading", "#userReq_data", "#userReq_error", "#userReq_stale"]);
    const req = prog.renders.find((v) => v.variant === "Request").data;
    expect(req).toBeTruthy();
    expect(hints[req.target.idx]).toBe("userName");
    expect(req.deps.map((d) => hints[d.idx])).toEqual(["userId"]);
    expect([req.state.loading, req.state.data, req.state.error, req.state.stale].map((d) => hints[d.idx]))
      .toEqual(["#userReq_loading", "#userReq_data", "#userReq_error", "#userReq_stale"]);
    expect(req.mount).toBe(true);
    expect(req.handle.hint).toBe("#userReq");
    const out = mods().print.printProgram(r.core, "app.client.js", "scrml-runtime.js");
    expect(out.js).toMatch(/const _userReq\w* = rt\.requestOn\(scope\$, /);
  });

  test("the right-hand side's server call is handled by the request: no E-ERROR-002 (RED on base: E-BOOTSTRAP-UNSUPPORTED + E-VALUE-WRITES-STATE)", () => {
    expect(diags(APP())).toEqual([]);
  });

  test("the measured base shape compiles: `<request id=\"load\">${ @m = cnt(@u); }</request>`", () => {
    const src = `<program>\n    let <u:int=1/>\n    let <m:int=0/>\n    fn cnt(x: int) -> int { return x + 1; }\n    <request id="load">${D} @m = cnt(@u); }</request>\n    <main><p>${D}@m}</p></main>\n</program>\n`;
    expect(diags(src)).toEqual([]);
    expect(check(compile(src).core)).toEqual([]);
  });

  test("a Warning in the body does not drop the request from the Core (W-LIN-001: a `lin` passed to a server function)", () => {
    const src = `<program db="./app.db">\n    type User:struct = { id: int, name: string }\n    let <s:string=""/>\n${LOAD}    <request id="r" deps=[]>${D} lin n = 1; @s = loadName(n); }</request>\n    <main><p>${D}@s}</p></main>\n</program>\n`;
    expect(codes(src)).toEqual(["W-LIN-001"]);
    const r = compile(src);
    expect(check(r.core)).toEqual([]);
    const prog = r.core.decls.find((d) => d.sym.id === r.core.program.id);
    expect(prog.renders.filter((v) => v.variant === "Request").length).toBe(1);
  });

  test("two requests: unique handles and their own signal cells", () => {
    const src = `<program>\n    let <u:int=1/>\n    let <m:int=0/>\n    let <n:int=0/>\n    fn cnt(x: int) -> int { return x + 1; }\n    <request id="a">${D} @m = cnt(@u); }</request>\n    <request id="b">${D} @n = cnt(@u); }</request>\n    <main><p>${D}@m}${D}@n}</p></main>\n</program>\n`;
    const r = compile(src);
    expect(check(r.core)).toEqual([]);
    const js = mods().print.printProgram(r.core, "app.client.js", "scrml-runtime.js").js;
    const names = [...js.matchAll(/const (\w+) = rt\.requestOn\(/g)].map((m) => m[1]);
    expect(names.length).toBe(2);
    expect(new Set(names).size).toBe(2);
    expect(js).toContain("#a_loading");
    expect(js).toContain("#b_loading");
  });
});

describe("runtime — the request machine on a real server (Bun.SQL) through the bootstrap's artifacts", () => {
  test("mount load: loading true while in flight, then the target and `data` land, error stays `not`", async () => {
    const r = compile(APP());
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(r.core, sql);
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, "req-mount-" + k++);
    await settle(5);
    expect(sig(cells(rt))).toEqual({ loading: true, data: null, error: null, stale: false });
    expect(held.length).toBe(1);
    await held[0].go();
    // a CSRF first call may be retried: release any follow-up
    for (let i = 1; i < held.length; i++) await held[i].go();
    await settle();
    for (let i = 1; i < held.length; i++) await held[i].go();
    await settle();
    expect(document.querySelector("#who").textContent).toBe("a");
    expect(sig(cells(rt))).toEqual({ loading: false, data: "a", error: null, stale: false });
  });

  test("a change of the inferred dependency re-runs the load (keep-stale: data kept, stale true while in flight)", async () => {
    const r = compile(APP());
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(r.core, sql);
    globalThis.fetch = bridge(srv);
    const { rt } = await loadProgram(r.core, "req-dep-" + k++);
    await settle();
    expect(document.querySelector("#who").textContent).toBe("a");
    const held = heldTransport(srv);
    click(document.querySelector("#u2"));
    await settle(5);
    expect(sig(cells(rt))).toEqual({ loading: true, data: "a", error: null, stale: true });
    expect(document.querySelector("#who").textContent).toBe("a");
    for (let i = 0; i < 4 && i < held.length; i++) { await held[i].go(); await settle(); }
    expect(document.querySelector("#who").textContent).toBe("b");
    expect(sig(cells(rt))).toEqual({ loading: false, data: "b", error: null, stale: false });
  });

  test("EC-2 newest wins: two re-runs settled OUT OF ORDER — the older answer is discarded", async () => {
    const r = compile(APP());
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(r.core, sql);
    globalThis.fetch = bridge(srv);
    const { rt } = await loadProgram(r.core, "req-newest-" + k++);
    await settle();
    const held = heldTransport(srv);
    click(document.querySelector("#u2"));   // run 1: user 2
    await settle(5);
    click(document.querySelector("#u3"));   // run 2: user 3 — supersedes run 1
    await settle(5);
    expect(held.length).toBe(2);
    await held[1].go();                     // the NEWER answer first
    await settle();
    expect(document.querySelector("#who").textContent).toBe("c");
    await held[0].go();                     // the superseded answer arrives late: dropped
    await settle();
    expect(document.querySelector("#who").textContent).toBe("c");
    expect(sig(cells(rt))).toEqual({ loading: false, data: "c", error: null, stale: false });
  });

  test("a failed settle (a wire failure) keeps the target and `data`, and sets `error` — the request handles its call", async () => {
    const r = compile(APP());
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(r.core, sql);
    globalThis.fetch = bridge(srv);
    const { rt } = await loadProgram(r.core, "req-fail-" + k++);
    await settle();
    expect(document.querySelector("#who").textContent).toBe("a");
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    click(document.querySelector("#u2"));
    await settle();
    expect(document.querySelector("#who").textContent).toBe("a");
    const s = sig(cells(rt));
    expect([s.loading, s.data, s.stale]).toEqual([false, "a", false]);
    expect(s.error).not.toBe(null);
    // EC-1: the next run clears `error`
    globalThis.fetch = bridge(srv);
    click(document.querySelector("#u3"));
    await settle();
    expect(document.querySelector("#who").textContent).toBe("c");
    expect(sig(cells(rt)).error).toBe(null);
  });

  test("EC-3 teardown: a request in an `if=` region torn down while its load is in flight — the answer is discarded; remount loads again", async () => {
    const r = compile(APP({ inIf: true, init: "-" }));
    expect(check(r.core)).toEqual([]);
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(r.core, sql);
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, "req-teardown-" + k++);
    await settle(5);
    expect(rt.stats.requests).toBe(1);
    click(document.querySelector("#hide"));         // the region (and its request) goes away
    await settle(5);
    expect(rt.stats.requests).toBe(0);
    for (const h of held) await h.go();               // its load answers after teardown
    await settle();
    expect(document.querySelector("#who").textContent).toBe("-");
    globalThis.fetch = bridge(srv);
    click(document.querySelector("#showb"));          // remount: §6.7.7 mount behavior, a new run
    await settle();
    expect(rt.stats.requests).toBe(1);
    expect(document.querySelector("#who").textContent).toBe("a");
  });

  test("a CLIENT `!` function's failure is handled by the request too: `error` set, the target kept (no E-ERROR-002)", async () => {
    const src = `<program>\n    type E:enum = { Bad }\n    let <a:int=1/>\n    let <x:int=0/>\n    function g(n: int)! E {\n        if (n > 5) fail .Bad;\n        return n * 10;\n    }\n    <request id="r">${D} @x = g(@a); }</request>\n    <main>\n        <button id="big" onclick={ @a = 9; }>9</button>\n        <button id="ok" onclick={ @a = 2; }>2</button>\n        <p id="x">${D}@x}</p>\n    </main>\n</program>\n`;
    expect(diags(src)).toEqual([]);
    const r = compile(src);
    expect(check(r.core)).toEqual([]);
    const { rt } = await loadProgram(r.core, "req-bang-" + k++);
    await settle();
    expect(document.querySelector("#x").textContent).toBe("10");
    click(document.querySelector("#big"));
    await settle();
    expect(document.querySelector("#x").textContent).toBe("10");
    const c = cells(rt);
    expect([c["#r_loading"], c["#r_data"], c["#r_stale"]]).toEqual([false, 10, false]);
    expect(c["#r_error"]).not.toBe(null);
    click(document.querySelector("#ok"));
    await settle();
    expect(document.querySelector("#x").textContent).toBe("20");
    expect(cells(rt)["#r_error"]).toBe(null);
  });

  test("the target is never a dependency: `@items = load(@page, @items)` runs once per @page change (no self-trigger)", async () => {
    const src = `<program>\n    let <page:int=1/>\n    let <items:int=0/>\n    let <runs:int=0/>\n    fn load(p: int, prev: int) -> int { return prev + p; }\n    <request id="items">${D} @items = load(@page, @items); }</request>\n    <main>\n        <button id="next" onclick={ @page = @page + 1; }>next</button>\n        <p id="items">${D}@items}</p>\n    </main>\n</program>\n`;
    const r = compile(src);
    const prog = r.core.decls.find((d) => d.sym.id === r.core.program.id);
    const req = prog.renders.find((v) => v.variant === "Request").data;
    expect(req.deps.map((d) => prog.fields[d.idx].sym.hint)).toEqual(["page"]);
    const { rt } = await loadProgram(r.core, "req-self-" + k++);
    await settle();
    expect(document.querySelector("#items").textContent).toBe("1");
    click(document.querySelector("#next"));
    await settle();
    click(document.querySelector("#next"));
    await settle();
    expect(document.querySelector("#items").textContent).toBe("6");   // 0+1, +2, +3 — each change exactly once
    expect(rt.stats.requests).toBe(1);
  });
});

describe("refusals — each by its code or by name (fail closed)", () => {
  const P = (decls, markup) => `<program>\n    let <a:int=1/>\n    let <x:int=0/>\n    let <y:int=0/>\n    fn f(n: int) -> int { return n + 1; }\n${decls}${markup}    <main><p>${D}@x}${D}@y}</p></main>\n</program>\n`;
  const REQ = (attrs, body) => `    <request${attrs}>${D} ${body} }</request>\n`;

  test("E-LIFECYCLE-018: no `id`; and a non-literal `id=`", () => {
    expect(codes(P("", REQ("", "@x = f(@a);")))).toEqual(["E-LIFECYCLE-018"]);
    expect(codes(P("", REQ(" id=(1)", "@x = f(@a);")))).toEqual(["E-LIFECYCLE-018"]);
  });
  test("E-LIFECYCLE-019: self-closing (no body) — and an empty element", () => {
    expect(codes(P("", `    <request id="r"/>\n`))).toEqual(["E-LIFECYCLE-019"]);
    expect(codes(P("", `    <request id="r"></request>\n`))).toEqual(["E-LIFECYCLE-019"]);
  });
  test("E-LIFECYCLE-020: two assignments; and a statement that is neither `lin` nor the assignment", () => {
    expect(codes(P("", REQ(` id="r"`, "@x = f(@a); @y = f(@a);")))).toEqual(["E-LIFECYCLE-020"]);
    expect(codes(P("", REQ(` id="r"`, "f(@a); @x = f(@a);")))).toEqual(["E-LIFECYCLE-020"]);
    expect(codes(P("", REQ(` id="r"`, "@x = f(@a); lin t = f(1);")))).toEqual(["E-LIFECYCLE-020"]);
  });
  test("E-LIFECYCLE-021: only `lin`s; an empty body; logic with no assignment", () => {
    expect(codes(P("", REQ(` id="r"`, "lin t = f(@a);")))).toEqual(["E-LIFECYCLE-021"]);
    expect(codes(P("", REQ(` id="r"`, "")))).toEqual(["E-LIFECYCLE-021"]);
    expect(codes(P("", REQ(` id="r"`, "f(@a);")))).toEqual(["E-LIFECYCLE-021"]);
  });
  test("E-LIFECYCLE-022: a member access, a non-`@` name, an undeclared cell, a non-list `deps=`", () => {
    expect(codes(P("", REQ(` id="r" deps=[@a.b]`, "@x = f(@a);")))).toContain("E-LIFECYCLE-022");
    expect(codes(P("", REQ(` id="r" deps=[a]`, "@x = f(@a);")))).toEqual(["E-LIFECYCLE-022"]);
    expect(codes(P("", REQ(` id="r" deps=[@nope]`, "@x = f(@a);")))).toEqual(["E-LIFECYCLE-022"]);
    expect(codes(P("", REQ(` id="r" deps=@a`, "@x = f(@a);")))).toEqual(["E-LIFECYCLE-022"]);
  });
  test("W-LIFECYCLE-013 (no reactive read, no `deps=`) — suppressed by an explicit `deps=[]`", () => {
    expect(codes(P("", REQ(` id="r"`, "@x = f(1);")))).toEqual(["W-LIFECYCLE-013"]);
    expect(codes(P("", REQ(` id="r" deps=[]`, "@x = f(1);")))).toEqual([]);
  });
  test("W-LIFECYCLE-011: the assigned cell is never read in markup", () => {
    const src = `<program>\n    let <a:int=1/>\n    let <x:int=0/>\n    fn f(n: int) -> int { return n + 1; }\n${REQ(` id="r"`, "@x = f(@a);")}    <main><p>${D}@a}</p></main>\n</program>\n`;
    expect(codes(src)).toEqual(["W-LIFECYCLE-011"]);
  });
  test("a `lin` in the body consumed by the assignment is valid; one it does not consume is E-LIN-001", () => {
    expect(codes(P("", REQ(` id="r"`, "lin t = f(@a); @x = f(t);")))).toEqual([]);
    expect(codes(P("", REQ(` id="r"`, "lin t = f(@a); @x = f(@a);")))).toEqual(["E-LIN-001"]);
  });

  const refused = (src, frag) => {
    const d = fe(src).diags.filter((x) => x.severity === "Error");
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(d[0].message).toContain(frag);
  };
  test("INTERIM: `url=` / `api=` (§60), `cache` (§6.7.7.2, O-060), an unknown attribute — each by name", () => {
    refused(P("", `    <request id="r" url="/x"/>\n`), "`url=` on a `<request>` (§60)");
    refused(P("", `    <request id="r" api="/x"/>\n`), "`api=` on a `<request>` (§60)");
    refused(P("", REQ(` id="r" url="/x"`, "@x = f(@a);")), "`url=` on a `<request>` (§60)");
    refused(P("", REQ(` id="r" cache`, "@x = f(@a);")), "`cache` on a `<request>` (§6.7.7.2)");
    refused(P("", REQ(` id="r" every="5s"`, "@x = f(@a);")), "`every=` is not an attribute of `<request>`");
  });
  test("INTERIM: the target among the explicit `deps=` (it would re-run on every settle)", () => {
    refused(P("", REQ(` id="r" deps=[@x]`, "@x = f(@a);")), "own target and one of its `deps=`");
  });
  test("INTERIM (Core C-R1, PA ruling): a body that writes another cell through a called function", () => {
    refused(P(`    function g(n: int) -> int {\n        @y = n;\n        return n;\n    }\n`, REQ(` id="r"`, "@x = g(@a);")), "writes `@y` through a call");
  });
  test("INTERIM: a second wait in the body — a waiting `lin` initializer, a waiting argument of the load", () => {
    const S = `    type User:struct = { id: int, name: string }\n    let <s:string=""/>\n${LOAD}`;
    const src1 = `<program db="./app.db">\n    let <a:int=1/>\n    fn len(t: string) -> int { return t.length; }\n${S}    <request id="r">${D} lin n = loadName(@a) !{ .Transport(t) :> "x" }; @s = loadName(len(n)); }</request>\n    <main><p>${D}@s}</p></main>\n</program>\n`;
    refused(src1, "a `lin` initializer of a `<request>` body");
    const src2 = `<program db="./app.db">\n    let <a:int=1/>\n    fn len(t: string) -> int { return t.length; }\n${S}    function pick(i: int) -> string {\n        return loadName(i) !{ .Transport(t) :> "x" };\n    }\n    <request id="r">${D} @s = loadName(len(pick(@a))); }</request>\n    <main><p>${D}@s}</p></main>\n</program>\n`;
    refused(src2, "an argument of a `<request>`'s load");
  });
  test("INTERIM: a handling form on the right-hand side (the request handles its call)", () => {
    const src = `<program db="./app.db">\n    type User:struct = { id: int, name: string }\n    let <a:int=1/>\n    let <s:string=""/>\n${LOAD}    <request id="r">${D} @s = loadName(@a) !{ .Transport(t) :> "x" }; }</request>\n    <main><p>${D}@s}</p></main>\n</program>\n`;
    refused(src, "a handling form (`!{ … }` / `match`) on a `<request>`'s right-hand side");
  });
  test("INTERIM (§6.7.7.3, slice S5): a request whose call writes SQL and has dependencies — but `deps=[]` is built (rule 2)", () => {
    const W = (deps) => `<program db="./app.db">\n    let <a:int=1/>\n    let <r:int=0/>\n    function save(n: int) -> int {\n        ${SQ}\`INSERT INTO log (a) VALUES (\${n})\`}.run() !{ _ :> { return 0; } };\n        return 1;\n    }\n    <request id="s"${deps}>${D} @r = save(@a); }</request>\n    <main><p>${D}@r}</p></main>\n</program>\n`;
    refused(W(""), "not provably a SELECT");
    refused(W(" deps=[@a]"), "not provably a SELECT");
    expect(codes(W(" deps=[]"))).toEqual([]);
  });
  test("INTERIM: a request in a declaration's `renders`, or in an `<each>` row (per-instance / per-row `<#id>` cells unbuilt)", () => {
    const inRenders = `<program>\n    <card label:string="x">\n        let <v:int=0/>\n    </>\n    renders <div><request id="r">${D} @v = 1; }</request></div>\n    <main><card label="y"/></main>\n</program>\n`;
    refused(inRenders, "inside a declaration's `renders`");
    const inRow = `<program>\n    <xs:int[]=([1, 2])/>\n    let <x:int=0/>\n    fn f(n: int) -> int { return n + 1; }\n    <main><each in=@xs as n><request id="r">${D} @x = f(n); }</request></each><p>${D}@x}</p></main>\n</program>\n`;
    refused(inRow, "inside an `<each>` / `for` row");
  });
  test("INTERIM: two requests with one `id`; a derived cell as a dependency", () => {
    refused(P("", REQ(` id="r"`, "@x = f(@a);") + REQ(` id="r"`, "@y = f(@a);")), "two `<request>`s are named `r`");
    const drv = `<program>\n    let <a:int=1/>\n    <b:int=(@a + 1)/>\n    let <x:int=0/>\n    fn f(n: int) -> int { return n + 1; }\n${REQ(` id="r"`, "@x = f(@b);")}    <main><p>${D}@x}</p></main>\n</program>\n`;
    refused(drv, "is a derived cell");
  });
  test("a file-level `<request>` (outside `<program>`) is refused, not dropped", () => {
    const src = `<request id="r">${D} @x = 1; }</request>\n<program>\n    let <x:int=0/>\n    <main><p>${D}@x}</p></main>\n</program>\n`;
    expect(codes(src)).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
});

// ---------------------------------------------------------------------------------------------
// r1 (review of #1781). Each RED on b430e97a1.
describe("r1 — review findings", () => {
  const P = (decls, markup) => `<program db="./app.db">\n    let <a:int=1/>\n    let <x:int=0/>\n    let <y:int=0/>\n    let <z:int=0/>\n    fn f(n: int) -> int { return n + 1; }\n${decls}${markup}    <main><p>${D}@x}${D}@y}${D}@z}</p></main>\n</program>\n`;
  const REQ = (attrs, body) => `    <request${attrs}>${D} ${body} }</request>\n`;
  const errs = (src) => fe(src).diags.filter((x) => x.severity === "Error");
  const SPLIT = "client code that does server work";

  // F1 (HIGH) — a `?{}` directly in a request body compiled clean and the query was DROPPED
  // (`on: null`, no route). Refused as a handler's is (INTERIM; gap g-boot-request-direct-sql-owed-s475).
  test("F1: a `?{}` as the right-hand side is refused (and is not E-ERROR-002 — the request handles it)", () => {
    const d = errs(P("", REQ(` id="r" deps=[]`, `@x = ${SQ}\`SELECT count(*) AS n FROM t\`}.get();`)));
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(d[0].message).toContain(SPLIT);
    expect(d[0].message).toContain("`<request id=\"r\">` body");
  });
  test("F1: an INSERT as the right-hand side with deps — refused, and the §6.7.7.3 gate sees the direct write", () => {
    const d = errs(P("", REQ(` id="r" deps=[@a]`, `@x = ${SQ}\`INSERT INTO t (a) VALUES (\${@a})\`}.run();`)));
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
    expect(d.some((x) => x.message.includes(SPLIT))).toBe(true);
    expect(d.some((x) => x.message.includes("not provably a SELECT (a query in the `<request>` body)"))).toBe(true);
  });
  test("F1: a `?{}` in a `lin` initializer is refused (and, unhandled there, E-ERROR-002)", () => {
    const d = errs(P("", REQ(` id="r"`, `lin n = ${SQ}\`SELECT a FROM t WHERE a = \${@a}\`}.get(); @x = f(n);`)));
    expect(d.map((x) => x.code).sort()).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-ERROR-002"]);
    expect(d.find((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED").message).toContain(SPLIT);
  });
  test("F1: a `?{}` in an argument of the load is refused (and, not the load itself, E-ERROR-002)", () => {
    const d = errs(P("    type T:struct = { a: int }\n", REQ(` id="r"`, `@x = f(${SQ}\`SELECT a FROM t WHERE a = \${@a}\`}.get().a);`)));
    // (the query there is also a second wait — requestPlan's "an argument of a `<request>`'s load")
    expect(d.map((x) => x.code).sort()).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED", "E-ERROR-002"]);
    expect(d.some((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED" && x.message.includes(SPLIT))).toBe(true);
  });
  test("F1: the reviewer's shapes — a direct SELECT with a tail, a DELETE in a `lin` — are refused", () => {
    const sel = errs(P("    type T:struct = { a: int }\n", REQ(` id="r"`, `@x = ${SQ}\`SELECT a FROM t WHERE a = \${@a}\`}.get().a;`)));
    expect(sel.some((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED" && x.message.includes(SPLIT))).toBe(true);
    const del = errs(P("", REQ(` id="r"`, `lin q = ${SQ}\`DELETE FROM t WHERE a = \${@a}\`}.run(); @x = f(1);`)));
    expect(del.some((x) => x.code === "E-BOOTSTRAP-UNSUPPORTED" && x.message.includes(SPLIT))).toBe(true);
  });
  test("F1 control: a request whose load is a server function holding the query still compiles", () => {
    expect(codes(APP())).toEqual([]);
  });

  // F2 (MED) — requests whose targets are each other's dependencies re-ran forever.
  test("F2: a two-request ring is refused, naming the ring, on each request", () => {
    const d = errs(P("", REQ(` id="r1"`, "@x = f(@y);") + REQ(` id="r2"`, "@y = f(@x);")));
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
    expect(d[0].message).toContain("ring of requests that re-run each other");
    expect(d[0].message).toContain("<request id=\"r1\"> writes @x → <request id=\"r2\"> writes @y → which re-runs <request id=\"r1\">");
    expect(d[1].message).toContain("<request id=\"r2\"> writes @y → <request id=\"r1\"> writes @x → which re-runs <request id=\"r2\">");
  });
  test("F2: a three-request ring (explicit deps) is refused; a chain is not", () => {
    const ring = P("", REQ(` id="r1" deps=[@z]`, "@x = f(@z);") + REQ(` id="r2" deps=[@x]`, "@y = f(@x);") + REQ(` id="r3" deps=[@y]`, "@z = f(@y);"));
    const rd = errs(ring);
    expect(rd.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
    expect(rd[0].message).toContain("<request id=\"r1\"> writes @x → <request id=\"r2\"> writes @y → <request id=\"r3\"> writes @z → which re-runs <request id=\"r1\">");
    const chain = P("", REQ(` id="r1"`, "@x = f(@a);") + REQ(` id="r2"`, "@y = f(@x);") + REQ(` id="r3"`, "@z = f(@y);"));
    expect(codes(chain)).toEqual([]);
    // the ring broken by an explicit `deps=` that leaves the other's target out
    expect(codes(P("", REQ(` id="r1" deps=[@a]`, "@x = f(@y);") + REQ(` id="r2"`, "@y = f(@x);")))).toEqual([]);
  });

  // F4 (LOW) — `id="a-b"` and `id="a_b"` both hinted `a_b`: duplicate signal-cell names.
  test("F4: request hints are injective — `a-b` / `a_b`, and `a` / `a_loading`, get distinct cells", () => {
    for (const [i1, i2] of [["a-b", "a_b"], ["a", "a_loading"]]) {
      const src = P("", REQ(` id="${i1}"`, "@x = f(@a);") + REQ(` id="${i2}"`, "@y = f(@a);"));
      expect(codes(src)).toEqual([]);
      const r = compile(src);
      expect(check(r.core)).toEqual([]);
      const prog = r.core.decls.find((d) => d.sym.id === r.core.program.id);
      const hints = prog.fields.map((f) => f.sym.hint);
      expect(new Set(hints).size).toBe(hints.length);
      const handles = prog.renders.filter((v) => v.variant === "Request").map((v) => v.data.handle.hint);
      expect(new Set([...handles, ...hints]).size).toBe(handles.length + hints.length);
    }
    // the encoding: letters / digits themselves, `_` → `__`, anything else → `_` + four hex digits
    const r2 = compile(P("", REQ(` id="a-b"`, "@x = f(@a);") + REQ(` id="a_b"`, "@y = f(@a);")));
    const hs = r2.core.decls.find((d) => d.sym.id === r2.core.program.id).fields.map((f) => f.sym.hint);
    expect(hs).toContain("#a_002db_loading");
    expect(hs).toContain("#a__b_loading");
  });

  // F5 (LOW) — two requests assigning one cell: `data` and the target disagreed.
  test("F5: a cell that two requests assign is refused, naming the first request", () => {
    const d = errs(P("", REQ(` id="r1"`, "@x = f(@a);") + REQ(` id="r2"`, "@x = f(@a);")));
    expect(d.map((x) => x.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(d[0].message).toContain("`@x` is already the target of `<request id=\"r1\">`");
  });

  // found in r1: a `<#id>` written inside a message literal of analyze.scrml was compiled by impl#1
  // as an input-state reference — the author read `_scrml_input_id_` in place of `<#id>`.
  test("messages spell `<#id>`, not `_scrml_input_id_`", () => {
    const ms = [
      ...fe(P("", REQ("", "@x = f(@a);"))).diags,
      ...fe(P("", REQ(` id="r1"`, "@x = f(@a);") + REQ(` id="r2"`, "@x = f(@a);"))).diags,
    ].map((x) => x.message);
    expect(ms.length).toBe(2);
    for (const m of ms) {
      expect(m).toContain("<#id>");
      expect(m).not.toContain("_scrml_input");
    }
  });

  // F3 (MED) — a request torn down mid-load left loading / stale true for good.
  test("F3: teardown mid-load sets `loading` and `stale` false (§6.7.7 stale iff a fetch is in flight)", async () => {
    const r = compile(APP({ inIf: true, init: "-" }));
    const sql = await realDb(DDL, ROWS);
    const { srv } = await serve(r.core, sql);
    globalThis.fetch = bridge(srv);
    const { rt } = await loadProgram(r.core, "req-r1-teardown-" + k++);
    await settle();
    expect(sig(cells(rt))).toEqual({ loading: false, data: "a", error: null, stale: false });
    const held = heldTransport(srv);
    click(document.querySelector("#u2"));            // a re-run: keep-stale, in flight
    await settle(5);
    expect(sig(cells(rt))).toEqual({ loading: true, data: "a", error: null, stale: true });
    click(document.querySelector("#hide"));          // torn down while in flight
    await settle(5);
    expect(rt.stats.requests).toBe(0);
    expect(sig(cells(rt))).toEqual({ loading: false, data: "a", error: null, stale: false });
    for (const h of held) await h.go();              // its answer is discarded
    await settle();
    expect(sig(cells(rt))).toEqual({ loading: false, data: "a", error: null, stale: false });
    expect(document.querySelector("#who").textContent).toBe("a");
  });
});
