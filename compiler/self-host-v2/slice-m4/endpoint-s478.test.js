// endpoint-s478.test.js — s478-boot-endpoint: SPEC §61 `<endpoint>`, the typed INBOUND route a
// foreign client calls, built by the bootstrap.
//
//   A. the declaration's compile-time diagnostics (§61.2 / §61.3 / §61.4 / §61.7 / §61.9 / §61.10 and
//      the reused §18.0.1 arm-validity codes);
//   B. what the bootstrap refuses by name (fail closed where the SPEC is silent — g-boot-endpoint-s478);
//   C. the route, SERVED: the program is compiled from source, its server artifact printed
//      (print-server.scrml) and loaded, and requests are sent the way a foreign client sends them —
//      no CSRF pair (§61.7: "SHALL NOT be routed through the §12 CSRF gate").
//      §61.3 decode failures → 400 `{ error: { kind, message } }`; §61.5 success → 200 + the arm's
//      value, a self-closing arm → 204; method / path matching (§61.7).
//   D. §61.6: the client artifact holds nothing of an endpoint.

import { describe, test, expect, beforeAll } from "bun:test";
import { mods, compile, artifacts, serve, plainRequest, spyDriver } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

beforeAll(() => { mods(); }, { timeout: 300000 });

const fe = (src) => frontEnd(mods(), [{ path: "app.scrml", src }], "app.scrml");
const errs = (src) => fe(src).diags.filter((d) => d.severity === "Error");
const codes = (src) => [...new Set(errs(src).map((d) => d.code))].sort();
const refusals = (src) => errs(src).filter((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED").map((d) => d.message);

const FSP_TYPE = `type FspMethod:enum = {
  FleetStatus
  Dispatch(prompt: string, project: string)
  DeltaSince(seq: int)
}`;
const prog = (body, types = FSP_TYPE) => `<program>\n${types}\n${body}\n</program>\n`;
const ARMS3 = `  <FleetStatus : { active: 3 }>
  <Dispatch(prompt, project) : { accepted: true, project: project }>
  <DeltaSince(seq) : { since: seq }>`;
const ep = (attrs, arms = ARMS3) => prog(`<endpoint ${attrs}>\n${arms}\n</endpoint>`);

async function served(src, opts = {}) {
  const r = compile(src);
  const { server, client } = artifacts(r.core);
  expect(server.refused).toEqual([]);
  const logs = [];
  const { srv } = await serve(r.core, spyDriver(), logs, opts);
  const send = async (path, method, body, headers = { "Content-Type": "application/json" }) => {
    const res = await srv.fetch(plainRequest(path, method, headers, body));
    const text = await res.text();
    let json;
    try { json = text === "" ? undefined : JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, text, json, headers: res.headers };
  };
  return { send, server, client, logs, srv };
}

describe("A — §61 compile-time diagnostics", () => {
  test("a canonical endpoint compiles clean", () => {
    expect(codes(ep(`path="/fsp" method="POST" accepts=FspMethod`))).toEqual([]);
  });

  test("§61.7 / §34: a missing path= is E-ENDPOINT-PATH-MISSING", () => {
    expect(codes(ep(`method="POST" accepts=FspMethod`))).toEqual(["E-ENDPOINT-PATH-MISSING"]);
  });

  test("§61.7 / §34: a method= outside GET/POST/PUT/PATCH/DELETE, or none, is E-ENDPOINT-METHOD-INVALID", () => {
    expect(codes(ep(`path="/fsp" method="HEAD" accepts=FspMethod`))).toEqual(["E-ENDPOINT-METHOD-INVALID"]);
    expect(codes(ep(`path="/fsp" method="post" accepts=FspMethod`))).toEqual(["E-ENDPOINT-METHOD-INVALID"]);
    expect(codes(ep(`path="/fsp" accepts=FspMethod`))).toEqual(["E-ENDPOINT-METHOD-INVALID"]);
    // the bareword form is accepted (§34: "The value may be a quoted string-literal or a bareword")
    for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) expect(codes(ep(`path="/fsp" method=${m} accepts=FspMethod`))).toEqual([]);
  });

  test("§61.3 / §34: a missing accepts= is E-ENDPOINT-ACCEPTS-MISSING", () => {
    expect(codes(ep(`path="/fsp" method="POST"`))).toEqual(["E-ENDPOINT-ACCEPTS-MISSING"]);
  });

  test("§61.3: accepts= naming a struct or a primitive is E-ENDPOINT-ACCEPTS-NOT-ENUM; an undeclared name is E-TYPE-UNKNOWN-NAME (no double report)", () => {
    const s = prog(`<endpoint path="/x" method="POST" accepts=Req>\n  <Whatever : { ok: true }>\n</endpoint>`, `type Req:struct = { id: number }`);
    expect(codes(s)).toEqual(["E-ENDPOINT-ACCEPTS-NOT-ENUM"]);
    expect(codes(prog(`<endpoint path="/x" method="POST" accepts=number>\n  <Whatever : { ok: true }>\n</endpoint>`, ""))).toEqual(["E-ENDPOINT-ACCEPTS-NOT-ENUM"]);
    expect(codes(prog(`<endpoint path="/x" method="POST" accepts=Nope>\n  <Whatever : { ok: true }>\n</endpoint>`, ""))).toEqual(["E-TYPE-UNKNOWN-NAME"]);
  });

  test("§61.4: a variant with no arm is E-ENDPOINT-NOT-EXHAUSTIVE; a wildcard <_> covers the rest", () => {
    const missing = ep(`path="/fsp" method="POST" accepts=FspMethod`, `  <FleetStatus : { active: 3 }>`);
    expect(codes(missing)).toEqual(["E-ENDPOINT-NOT-EXHAUSTIVE"]);
    expect(errs(missing)[0].message).toContain("Dispatch, DeltaSince");
    expect(codes(ep(`path="/fsp" method="POST" accepts=FspMethod`, `  <FleetStatus : { active: 3 }>\n  <_ : { fallback: true }>`))).toEqual([]);
  });

  test("§61.4 / §34: a dead arm is E-MATCH-SUBSET-DEAD-ARM, a duplicate E-TYPE-023, an arm after <_> E-SYNTAX-010 — no E-ENDPOINT-* code", () => {
    expect(codes(ep(`path="/fsp" method="POST" accepts=FspMethod`, ARMS3 + `\n  <Bogus : { x: 1 }>`))).toEqual(["E-MATCH-SUBSET-DEAD-ARM"]);
    expect(codes(ep(`path="/fsp" method="POST" accepts=FspMethod`, `  <FleetStatus : { active: 3 }>\n` + ARMS3))).toEqual(["E-TYPE-023"]);
    expect(codes(ep(`path="/fsp" method="POST" accepts=FspMethod`, `  <_ : { all: true }>\n  <FleetStatus : { active: 3 }>`))).toEqual(["E-SYNTAX-010"]);
  });

  test("§18.7: binders that do not match the payload are E-TYPE-021", () => {
    expect(codes(ep(`path="/fsp" method="POST" accepts=FspMethod`, `  <FleetStatus : { active: 3 }>\n  <Dispatch(prompt) : { p: prompt }>\n  <DeltaSince(seq) : { since: seq }>`))).toEqual(["E-TYPE-021"]);
  });

  test("§61.10: a multi-statement bare body is E-ENDPOINT-MULTI-STATEMENT-ARM; a single-expression bare body compiles", () => {
    const multi = ep(`path="/fsp" method="POST" accepts=FspMethod`, `  <FleetStatus : { active: 3 }>\n  <Dispatch(prompt, project) : { ok: true }>\n  <DeltaSince(seq)>\n    seq\n    { since: seq }\n  </>`);
    expect(codes(multi)).toEqual(["E-ENDPOINT-MULTI-STATEMENT-ARM"]);
    const one = ep(`path="/fsp" method="POST" accepts=FspMethod`, `  <FleetStatus : { active: 3 }>\n  <Dispatch(prompt, project) : { ok: true }>\n  <DeltaSince(seq)>\n    { since: seq }\n  </>`);
    expect(codes(one)).toEqual([]);
  });

  test("§61.1: an arm body is compiler-owned code — an undeclared name is E-SCOPE-001; its binders and module functions are in scope", () => {
    expect(codes(ep(`path="/fsp" method="POST" accepts=FspMethod`, `  <FleetStatus : { v: nope }>\n  <Dispatch(prompt, project) : { ok: true }>\n  <DeltaSince(seq) : { since: seq }>`))).toContain("E-SCOPE-001");
    const withFn = prog(`function label(p: string, q: string) -> string { return p + "@" + q; }\n<endpoint path="/fsp" method="POST" accepts=FspMethod>\n  <FleetStatus : { active: 3 }>\n  <Dispatch(prompt, project) : { echo: label(prompt, project) }>\n  <DeltaSince(seq) : { since: seq }>\n</endpoint>`);
    expect(codes(withFn)).toEqual([]);
  });

  // §61.2 / ruling:user-voice-scrml.md-S480-four-recs-2 item 1 — an attribute whose name is
  // outside `endpoint-attrs` is E-ENDPOINT-ATTR-INVALID whatever its value (was E-BOOTSTRAP-UNSUPPORTED).
  test("§61.7: a csrf= attribute is refused (\"SHALL NOT carry a `csrf=` attribute\"), as is any other attribute — E-ENDPOINT-ATTR-INVALID", () => {
    const c = errs(ep(`path="/fsp" method="POST" accepts=FspMethod csrf="off"`));
    expect(c.map((d) => d.code)).toEqual(["E-ENDPOINT-ATTR-INVALID"]);
    expect(c[0].message).toContain("SHALL NOT carry a `csrf=`");
    expect(codes(ep(`path="/fsp" method="POST" accepts=FspMethod auth="x"`))).toEqual(["E-ENDPOINT-ATTR-INVALID"]);
  });

  test("§61.2: a name outside endpoint-attrs is E-ENDPOINT-ATTR-INVALID whatever its value — matched exactly, at the attribute", () => {
    for (const a of [`note="x"`, `note`, `cor="*"`, `CORS="*"`, `data-cors="*"`, `bind:value=@x`, `onclick=f()`]) {
      const src = ep(`path="/fsp" method="POST" accepts=FspMethod ${a}`);
      const ds = errs(src);
      expect(ds.map((d) => d.code)).toEqual(["E-ENDPOINT-ATTR-INVALID"]);
      expect(ds[0].span.start).toBe(src.indexOf(a));
    }
    // two unknown attributes: one report each
    expect(errs(ep(`path="/fsp" method="POST" accepts=FspMethod note="a" memo="b"`)).map((d) => d.code)).toEqual(["E-ENDPOINT-ATTR-INVALID", "E-ENDPOINT-ATTR-INVALID"]);
  });

  // S479 ruling (user-voice) "program `cors=` does not cover `<endpoint>` routes; per-endpoint
  // `cors=`" — §61.7: "An `<endpoint>` MAY carry `cors=`". The bootstrap builds no CORS, so the
  // attribute is refused BY NAME (INTERIM, g-boot-endpoint-cors-unbuilt-s479), never ignored.
  test("§61.7: a per-endpoint cors= is refused by name (INTERIM) — not the generic 'path/method/accepts only' refusal", () => {
    const r = refusals(ep(`path="/fsp" method="POST" accepts=FspMethod cors="https://a.example"`));
    expect(r.length).toBe(1);
    expect(r[0]).toContain("`cors=` on `<endpoint>` (§61.7");
    expect(r[0]).toContain("g-boot-endpoint-cors-unbuilt-s479");
    expect(codes(ep(`path="/fsp" method="POST" accepts=FspMethod cors="*"`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

describe("B — the S478 open-Qs rulings (user-voice items 33–40), and refusals by name where the SPEC is silent", () => {
  // item 34 — §61.7: "Two `<endpoint>` declarations of one program with the same `path=` and the
  // same `method=` are `E-ENDPOINT-ROUTE-DUPLICATE` (§61.9), reported at the second"
  test("two endpoints at one path and method are E-ENDPOINT-ROUTE-DUPLICATE (once, at the second); two methods are two routes", () => {
    const two = prog(`<endpoint path="/fsp" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint>\n<endpoint path="/fsp" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint>`);
    expect(codes(two)).toEqual(["E-ENDPOINT-ROUTE-DUPLICATE"]);
    const ds = errs(two);
    expect(ds.length).toBe(1);
    expect(ds[0].span.start).toBe(two.lastIndexOf("<endpoint"));
    // one path, two methods: each is its own route
    const both = prog(`<endpoint path="/fsp" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint>\n<endpoint path="/fsp" method="PUT" accepts=FspMethod>\n${ARMS3}\n</endpoint>`);
    expect(codes(both)).toEqual([]);
    // a trailing `/` is significant (§61.7 "`/fsp` and `/fsp/` are two routes"); the bareword method is the same method
    expect(codes(prog(`<endpoint path="/fsp" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint>\n<endpoint path="/fsp/" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint>`))).toEqual([]);
    expect(codes(prog(`<endpoint path="/fsp" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint>\n<endpoint path="/fsp" method=POST accepts=FspMethod>\n${ARMS3}\n</endpoint>`))).toEqual(["E-ENDPOINT-ROUTE-DUPLICATE"]);
  });

  // item 34 — §61.7: "A `path=` that is `/_scrml` or `/_scrml_ws`, or begins with `/_scrml/` or
  // `/_scrml_ws/`, is `E-ENDPOINT-ROUTE-DUPLICATE`"
  test("a path= under the reserved /_scrml/ or /_scrml_ws/ prefixes is E-ENDPOINT-ROUTE-DUPLICATE", () => {
    for (const p of ["/_scrml", "/_scrml/", "/_scrml/call/1", "/_scrml/health", "/_scrml_ws", "/_scrml_ws/", "/_scrml_ws/chat"]) {
      expect(codes(ep(`path="${p}" method="POST" accepts=FspMethod`))).toEqual(["E-ENDPOINT-ROUTE-DUPLICATE"]);
    }
    // a prefix that only LOOKS like one is an ordinary path
    for (const p of ["/_scrmlx", "/_scrml_wsx/a", "/x/_scrml/y", "/_SCRML/a", "/_scrml_localx", "/_scrml_local_/a", "/x/_scrml_local/y", "/_SCRML_LOCAL/a"]) expect(codes(ep(`path="${p}" method="POST" accepts=FspMethod`))).toEqual([]);
  });

  // S479 ruling (user-voice) §3.A item 5 — §61.7: the compiler "serves the client helpers it copies
  // into the build output under `/_scrml_local/` (§21.3). A `path=` that is … `/_scrml_local`, or
  // begins with … `/_scrml_local/`, is `E-ENDPOINT-ROUTE-DUPLICATE`"
  test("S479: a path= under the reserved /_scrml_local/ prefix is E-ENDPOINT-ROUTE-DUPLICATE (once — not also E-ENDPOINT-PATH-INVALID)", () => {
    for (const p of ["/_scrml_local", "/_scrml_local/", "/_scrml_local/helper.js", "/_scrml_local/lib/a.mjs"]) {
      const ds = errs(ep(`path="${p}" method="POST" accepts=FspMethod`));
      expect(ds.map((d) => d.code)).toEqual(["E-ENDPOINT-ROUTE-DUPLICATE"]);
      expect(ds[0].message).toContain("/_scrml_local/");
    }
    // a reserved path that is ALSO outside the grammar is reported once, as the reservation
    expect(codes(ep(`path="/_scrml_local/a?b" method="POST" accepts=FspMethod`))).toEqual(["E-ENDPOINT-ROUTE-DUPLICATE"]);
  });

  // item 37 — §61.7 path grammar; S479 ruling (user-voice) §3.A item 5 names its code: "A `path=`
  // outside this grammar is `E-ENDPOINT-PATH-INVALID` (§61.9), reported at the `<endpoint>` opener."
  test("S479: a path= outside the §61.7 grammar is E-ENDPOINT-PATH-INVALID (one report, never E-BOOTSTRAP-UNSUPPORTED)", () => {
    for (const p of ["fsp", " /fsp", "/a?b=1", "/a?", "/a#x", "/a/../b", "/a/./b", "/..", "/.", "/a/..", "/a//b", "//", "//a", "/users/:id", "/a%20b", "/a%2Fb", "/ünï", "/a b", "/a\\\\b" /* two backslashes in the scrml source: the attribute literal unescapes them to one */, "/a;b", "/a@b", "/a+b", "/a*b", "/a!b", "/a$b", "/a'b", "/a(b)", "/a,b", "/a=b", "/a[b]"]) {
      const ds = errs(ep(`path="${p}" method="POST" accepts=FspMethod`));
      expect([p, ds.map((d) => d.code)]).toEqual([p, ["E-ENDPOINT-PATH-INVALID"]]);
      expect(ds[0].severity).toBe("Error");
    }
    // inside the grammar: a trailing `/` (an empty LAST segment), a segment of dots other than `.` / `..`
    for (const p of ["/", "/fsp/", "/api/v1/fleet-status", "/a.b_c~d", "/A-Z/0-9", "/...", "/.well-known/x", "/a/b/", "/a./.b", "/~"]) expect([p, codes(ep(`path="${p}" method="POST" accepts=FspMethod`))]).toEqual([p, []]);
  });

  // item 36 — §61.2: "An `<endpoint>` declaration SHALL be a direct child of the top-level
  // `<program>` … anywhere else … is `E-STRUCTURAL-ELEMENT-MISPLACED`"
  test("an endpoint outside the top-level <program> body is E-STRUCTURAL-ELEMENT-MISPLACED — and is never served", () => {
    const places = [
      `${FSP_TYPE}\n<endpoint path="/fsp" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint>\n<program></program>\n`,
      prog(`<div><endpoint path="/fsp" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint></div>`),
      prog(`<page route="/">\n<endpoint path="/fsp" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint>\n</page>`),
      prog(`<program name="inner">\n<endpoint path="/fsp" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint>\n</program>`),
    ];
    // one report per fault: no not-built refusal follows about the endpoint itself (a nested
    // `<program>` keeps its own, unrelated refusal)
    const aboutEndpoint = (m) => m.includes("<endpoint") || m.includes("accepts=");
    for (const src of places) {
      expect(codes(src)).toContain("E-STRUCTURAL-ELEMENT-MISPLACED");
      expect(refusals(src).filter(aboutEndpoint)).toEqual([]);
    }
    // a logic block is not the place either
    expect(codes(prog(`\${\n  <endpoint path="/fsp" method="POST" accepts=FspMethod>\n  </endpoint>\n}`))).toContain("E-STRUCTURAL-ELEMENT-MISPLACED");
    // the top-level `<program>` body is the place
    expect(codes(ep(`path="/fsp" method="POST" accepts=FspMethod`))).toEqual([]);
  });

  test("an endpoint in an imported file's <program> is E-STRUCTURAL-ELEMENT-MISPLACED", () => {
    const files = [
      { path: "lib.scrml", src: `<program>\n${FSP_TYPE}\n<endpoint path="/fsp" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint>\nexport function one() -> int { return 1; }\n</program>\n` },
      { path: "app.scrml", src: `<program>\n\${ import { one } from "./lib.scrml"; }\n<p>${"$"}{one()}</p>\n</program>\n` },
    ];
    const r = frontEnd(mods(), files, "app.scrml");
    const es = r.diags.filter((d) => d.severity === "Error");
    expect(es.filter((d) => d.code === "E-STRUCTURAL-ELEMENT-MISPLACED").map((d) => d.file)).toEqual(["lib.scrml"]);
    // (a `<program>` outside the entry file is its own not-built refusal; none is about the endpoint)
    expect(es.filter((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED" && d.message.includes("endpoint"))).toEqual([]);
  });

  // item 38 — §61.2: "An arm whose body has no value … is `E-ENDPOINT-ARM-NO-VALUE` … NOT read as a
  // silent 204; the arm that answers 204 is the self-closing `<Variant/>`"
  test("an arm with no value (a call of a function that returns nothing) is E-ENDPOINT-ARM-NO-VALUE, at the arm's body, naming <V/>", () => {
    const shorthand = prog(`function note(t: string) { const u: string = t; }\n<endpoint path="/x" method="POST" accepts=M>\n  <Go(t) : note(t)>\n</endpoint>`, `type M:enum = {\n  Go(t: string)\n}`);
    expect(codes(shorthand)).toEqual(["E-ENDPOINT-ARM-NO-VALUE"]);
    const d = errs(shorthand)[0];
    expect(d.message).toContain("`<Go/>`");
    expect(shorthand.slice(d.span.start, d.span.end)).toBe("note(t)");
    // the bare-body form, and a declared `-> void` function
    const bare = prog(`function done() -> void { const u: int = 1; }\n<endpoint path="/x" method="POST" accepts=M>\n  <Go>\n    done()\n  </>\n</endpoint>`, `type M:enum = { Go }`);
    expect(codes(bare)).toEqual(["E-ENDPOINT-ARM-NO-VALUE"]);
    // the self-closing arm is the 204 one, and a call of a function that returns a value is fine
    expect(codes(prog(`<endpoint path="/x" method="POST" accepts=M>\n  <Go/>\n</endpoint>`, `type M:enum = { Go }`))).toEqual([]);
    expect(codes(prog(`function v() -> int { return 1; }\n<endpoint path="/x" method="POST" accepts=M>\n  <Go : v()>\n</endpoint>`, `type M:enum = { Go }`))).toEqual([]);
  });

  // item 40 — §61.3: "An `accepts=` enum … with a variant payload field named `tag` is
  // `E-PARSEVARIANT-TAG-FIELD`"
  test("a payload field named `tag` is E-PARSEVARIANT-TAG-FIELD — the wire `tag` key carries the variant", () => {
    const t = `type M:enum = {\n  Go(tag: string)\n}`;
    expect(codes(prog(`<endpoint path="/x" method="POST" accepts=M>\n  <Go(t) : { t: t }>\n</endpoint>`, t))).toEqual(["E-PARSEVARIANT-TAG-FIELD"]);
    expect(codes(prog(`<endpoint path="/x" method="POST" accepts=M>\n  <_ : { ok: true }>\n</endpoint>`, t))).toEqual(["E-PARSEVARIANT-TAG-FIELD"]);
    // `tag` in a second variant too; a field whose name only contains `tag` is fine
    expect(codes(prog(`<endpoint path="/x" method="POST" accepts=M>\n  <_ : { ok: true }>\n</endpoint>`, `type M:enum = {\n  A(label: string)\n  B(n: int, tag: int)\n}`))).toEqual(["E-PARSEVARIANT-TAG-FIELD"]);
    expect(codes(prog(`<endpoint path="/x" method="POST" accepts=M>\n  <Go(t) : { t: t }>\n</endpoint>`, `type M:enum = {\n  Go(tags: string)\n}`))).toEqual([]);
  });

  test("a payload field the request decode does not read (an enum-typed field, §41.13 no auto-recursion)", () => {
    const t = `type Kind:enum = { A, B }\ntype M:enum = {\n  Go(k: Kind)\n}`;
    expect(refusals(prog(`<endpoint path="/x" method="POST" accepts=M>\n  <Go(k) : { ok: true }>\n</endpoint>`, t)).join()).toContain("does not read");
  });

  test("a refined payload field (a variant field's refinement is not checked by the bootstrap — g-boot-refinement-runtime-checks-s478)", () => {
    const t = `type M:enum = {\n  Since(seq: int(>0))\n}`;
    const unbound = refusals(prog(`<endpoint path="/x" method="POST" accepts=M>\n  <Since : { ok: true }>\n</endpoint>`, t)).join();
    expect(unbound).toContain("checks only on a parameter");
    expect(codes(prog(`<endpoint path="/x" method="POST" accepts=M>\n  <Since(seq) : { since: seq }>\n</endpoint>`, t))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });

  test("review #1916 L2: a `__proto__` / `constructor` / `prototype` key in an arm's object literal (it would answer 500 on every request)", () => {
    for (const k of ["__proto__", "constructor", "prototype"]) {
      for (const lit of [`{ ${k}: 1 }`, `{ ok: true, inner: { ${k}: "x" } }`]) {
        const src = prog(`<endpoint path="/x" method="POST" accepts=M>\n  <Go : ${lit}>\n</endpoint>`, `type M:enum = { Go }`);
        expect(refusals(src).join()).toContain("prototype machinery");
      }
    }
    expect(codes(prog(`<endpoint path="/x" method="POST" accepts=M>\n  <Go : { proto: 1, ctor: 2 }>\n</endpoint>`, `type M:enum = { Go }`))).toEqual([]);
  });

  test("an accepts= enum declared in another file", () => {
    const files = [
      { path: "types.scrml", src: `\${ export type FspMethod:enum = { Ping, Pong } }\n` },
      { path: "app.scrml", src: `<program>\n\${ import { FspMethod } from "./types.scrml" }\n<endpoint path="/x" method="POST" accepts=FspMethod>\n  <Ping : { a: 1 }>\n  <Pong : { b: 2 }>\n</endpoint>\n</program>\n` },
    ];
    const r = frontEnd(mods(), files, "app.scrml");
    expect(r.diags.filter((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED").map((d) => d.message).join()).toContain("declared outside this file");
  });
});

describe("C — the route, served (§61.3 / §61.5 / §61.7)", () => {
  const SRC = prog(`<endpoint path="/fsp" method="POST" accepts=FspMethod>
  <FleetStatus : { jsonrpc: "2.0", result: { active: 3, idle: 1 } }>
  <Dispatch(prompt, project) : { jsonrpc: "2.0", result: { accepted: true, project: project, prompt: prompt } }>
  <DeltaSince(seq) : { jsonrpc: "2.0", result: { since: seq, count: 0 } }>
  <Halt : { jsonrpc: "2.0", error: { code: -32000, message: "service halted" } }>
  <Ping/>
</endpoint>`, `type FspMethod:enum = {
  FleetStatus
  Dispatch(prompt: string, project: string)
  DeltaSince(seq: int)
  Halt
  Ping
}`);
  const body = (o) => JSON.stringify(o);

  test("§61.5: each variant dispatches to its arm; the value is the JSON body, 200 application/json — no CSRF pair needed", async () => {
    const { send } = await served(SRC);
    let r = await send("/fsp", "POST", body({ tag: "FleetStatus" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/json");
    expect(r.json).toEqual({ jsonrpc: "2.0", result: { active: 3, idle: 1 } });
    r = await send("/fsp", "POST", body({ tag: "Dispatch", prompt: "scale", project: "atlas" }));
    expect([r.status, r.json]).toEqual([200, { jsonrpc: "2.0", result: { accepted: true, project: "atlas", prompt: "scale" } }]);
    r = await send("/fsp", "POST", body({ tag: "DeltaSince", seq: 42 }));
    expect([r.status, r.json]).toEqual([200, { jsonrpc: "2.0", result: { since: 42, count: 0 } }]);
    // an author-modelled error result is a value: 200, verbatim (§61.5)
    r = await send("/fsp", "POST", body({ tag: "Halt" }));
    expect([r.status, r.json]).toEqual([200, { jsonrpc: "2.0", error: { code: -32000, message: "service halted" } }]);
  });

  test("§61.5: a self-closing <Variant/> arm answers 204 with no body", async () => {
    const { send } = await served(SRC);
    const r = await send("/fsp", "POST", body({ tag: "Ping" }));
    expect([r.status, r.text]).toEqual([204, ""]);
  });

  test("§61.3: a decode failure is 400 { error: { kind, message } } and no arm runs", async () => {
    const { send } = await served(SRC);
    const kind = async (raw) => {
      const r = await send("/fsp", "POST", raw);
      expect(r.status).toBe(400);
      expect(r.headers.get("Content-Type")).toBe("application/json");
      expect(typeof r.json.error.message).toBe("string");
      return r.json.error.kind;
    };
    expect(await kind("not json")).toBe("Malformed");
    expect(await kind("")).toBe("Malformed");
    expect(await kind("null")).toBe("Malformed");
    expect(await kind("[1]")).toBe("Malformed");
    expect(await kind('"FleetStatus"')).toBe("Malformed");
    expect(await kind(body({ not_a_tag: 1 }))).toBe("MissingDiscriminator");
    expect(await kind(body({ tag: 7 }))).toBe("MissingDiscriminator");
    expect(await kind(body({ tag: "Teleport" }))).toBe("UnknownVariant");
    expect(await kind(body({ tag: "toString" }))).toBe("UnknownVariant");
    expect(await kind(body({ tag: "DeltaSince", seq: "soon" }))).toBe("InvalidPayload");
    expect(await kind(body({ tag: "DeltaSince", seq: 1.5 }))).toBe("InvalidPayload");
    expect(await kind(body({ tag: "DeltaSince" }))).toBe("InvalidPayload");
    expect(await kind(body({ tag: "Dispatch", prompt: "p", project: null }))).toBe("InvalidPayload");
    // a key that is neither `tag` nor a payload field — §61.3 strict keys (S478 open-Qs ruling item 35)
    expect(await kind(body({ tag: "DeltaSince", seq: 1, extra: true }))).toBe("InvalidPayload");
    expect(await kind('{"tag":"FleetStatus","__proto__":{"x":1}}')).toBe("InvalidPayload");
  });

  // S479 ruling (user-voice) §3.A item 5 — §61.3 "A repeated key": "A request body in which one JSON
  // object — the body itself or any object nested in it — names the same key twice is a decode
  // failure — `::Malformed` … Keys are compared after JSON string unescaping". review #1940 (4):
  // `{"tag":"Unit","tag":"I","n":3}` ran `I` (last wins) while a first-wins proxy sees `Unit`.
  test("S479 §61.3: a body with a repeated key — any spelling, any depth — is 400 Malformed and no arm runs", async () => {
    const { send } = await served(prog(`function record(p: string) -> string { return p; }\n<endpoint path="/fsp" method="POST" accepts=FspMethod>\n  <FleetStatus : { active: 3 }>\n  <Dispatch(prompt, project) : { ran: record(prompt) }>\n  <DeltaSince(seq) : { since: seq }>\n</endpoint>`));
    const malformed = async (raw) => {
      const r = await send("/fsp", "POST", raw);
      expect([raw, r.status, r.json && r.json.error && r.json.error.kind]).toEqual([raw, 400, "Malformed"]);
      return r.json.error.message;
    };
    // the review's smuggle: two `tag`s naming two variants
    expect(await malformed('{"tag":"FleetStatus","tag":"DeltaSince","seq":3}')).toContain("'tag'");
    await malformed('{"tag":"DeltaSince","tag":"FleetStatus","seq":3}');
    // the same variant twice, and a repeated payload field (same and different values)
    await malformed('{"tag":"FleetStatus","tag":"FleetStatus"}');
    await malformed('{"tag":"DeltaSince","seq":1,"seq":1}');
    await malformed('{"tag":"DeltaSince","seq":1,"seq":2}');
    await malformed('{"tag":"Dispatch","prompt":"a","project":"b","prompt":"rm -rf"}');
    // keys that differ only by escape are the same key after unescaping
    await malformed('{"tag":"FleetStatus","t\\u0061g":"DeltaSince","seq":3}');
    await malformed('{"t\\u0061g":"FleetStatus","tag":"DeltaSince","seq":3}');
    await malformed('{"\\u0074\\u0061\\u0067":"FleetStatus","tag":"FleetStatus"}');
    await malformed('{"tag":"DeltaSince","seq":1,"s\\u0065q":2}');
    await malformed('{"tag":"DeltaSince","seq":1,"\\u0073eq":2}');
    await malformed('{"tag":"DeltaSince","seq":1,"\\u0073\\u0065\\u0071":2}');
    await malformed('{"tag":"Dispatch","prompt":"a","project":"b","pro\\u006dpt":"c"}');
    // an escaped solidus and an escaped non-BMP character (a surrogate pair) compare by value
    await malformed('{"tag":"FleetStatus","a/b":1,"a\\/b":2}');
    await malformed('{"tag":"FleetStatus","\\ud83d\\ude00":1,"\u{1F600}":2}');
    // whitespace between tokens does not hide a repeat
    await malformed('{ "tag" : "FleetStatus" ,\n\t"tag" : "FleetStatus" }');
    // a repeat inside a nested object or an object inside an array — the body is still refused
    await malformed('{"tag":"FleetStatus","x":{"a":1,"a":2}}');
    await malformed('{"tag":"FleetStatus","x":[{"a":1},{"b":1,"b":2}]}');
    await malformed('{"tag":"FleetStatus","x":{"y":{"z":{"k":1,"k\\u0000":0,"k":2}}}}');
    await malformed('{"tag":"DeltaSince","seq":1,"__proto__":{},"__proto__":{}}');
  });

  test("S479 §61.3: no false repeat — the same key in sibling or nested objects, escaped look-alikes that differ, and key text inside string values", async () => {
    const { send } = await served(prog(`<endpoint path="/fsp" method="POST" accepts=FspMethod>\n  <FleetStatus : { active: 3 }>\n  <Dispatch(prompt, project) : { prompt: prompt, project: project }>\n  <DeltaSince(seq) : { since: seq }>\n</endpoint>`));
    // a value that LOOKS like a repeated key, escaped quotes in values, a backslash before the closing quote
    let r = await send("/fsp", "POST", '{"tag":"Dispatch","prompt":"\\",\\"prompt\\":\\"x","project":"p\\\\"}');
    expect([r.status, r.json]).toEqual([200, { prompt: '","prompt":"x', project: "p\\" }]);
    r = await send("/fsp", "POST", '{"tag":"Dispatch","prompt":"{\\"tag\\":1,\\"tag\\":2}","project":"[{,:}]"}');
    expect([r.status, r.json]).toEqual([200, { prompt: '{"tag":1,"tag":2}', project: "[{,:}]" }]);
    // keys that differ in case, or by an escape of a different character, are different keys:
    // the body is refused for its extra key (strict keys, InvalidPayload) — not as a repeat
    for (const raw of ['{"tag":"DeltaSince","seq":1,"Seq":2}', '{"tag":"DeltaSince","seq":1,"seq\\u0000":2}', '{"tag":"DeltaSince","seq":1,"s\\u0065q2":2}']) {
      r = await send("/fsp", "POST", raw);
      expect([raw, r.status, r.json.error.kind]).toEqual([raw, 400, "InvalidPayload"]);
    }
    // the same key in two sibling objects, or at two depths, is no repeat (judged per object):
    // these bodies fail only for their extra key `x`
    for (const raw of ['{"tag":"FleetStatus","x":[{"a":1},{"a":2}]}', '{"tag":"FleetStatus","x":{"tag":{"tag":1}}}', '{"tag":"FleetStatus","x":[[{"a":1}],{"a":[{"a":2}]}]}']) {
      r = await send("/fsp", "POST", raw);
      expect([raw, r.status, r.json.error.kind]).toEqual([raw, 400, "InvalidPayload"]);
      expect(r.json.error.message).toContain("'x'");
    }
    // and an ordinary body still dispatches
    r = await send("/fsp", "POST", '{ "seq" : 4 , "tag" : "DeltaSince" }');
    expect([r.status, r.json]).toEqual([200, { since: 4 }]);
  });

  // S478 open-Qs ruling item 35 — §61.3: "A foreign contract whose requests carry envelope keys
  // (JSON-RPC's `jsonrpc`, `id`) declares them as payload fields of the variant"
  test("§61.3 strict keys: JSON-RPC envelope keys are refused unless the variant declares them, and served when it does", async () => {
    const strict = await served(prog(`<endpoint path="/rpc" method="POST" accepts=R>\n  <Ping : { ok: true }>\n</endpoint>`, `type R:enum = { Ping }`));
    for (const extra of [{ jsonrpc: "2.0" }, { id: 1 }, { jsonrpc: "2.0", id: 1 }, { params: {} }]) {
      const r = await strict.send("/rpc", "POST", body({ tag: "Ping", ...extra }));
      expect([r.status, r.json.error.kind]).toEqual([400, "InvalidPayload"]);
    }
    const declared = await served(prog(`<endpoint path="/rpc" method="POST" accepts=R>\n  <Ping(v, id) : { jsonrpc: v, id: id, result: "pong" }>\n</endpoint>`, `type R:enum = {\n  Ping(jsonrpc: string, id: int)\n}`));
    const ok = await declared.send("/rpc", "POST", body({ tag: "Ping", jsonrpc: "2.0", id: 7 }));
    expect([ok.status, ok.json]).toEqual([200, { jsonrpc: "2.0", id: 7, result: "pong" }]);
    const more = await declared.send("/rpc", "POST", body({ tag: "Ping", jsonrpc: "2.0", id: 7, method: "x" }));
    expect([more.status, more.json.error.kind]).toEqual([400, "InvalidPayload"]);
  });

  test("review #1916 M1 / §61.7 (\"A JSON-body + bearer-token endpoint is CSRF-exempt by construction\"): a request whose media type is not application/json is 415 and no arm runs", async () => {
    const { send } = await served(prog(`function record(p: string) -> string { return p; }\n<endpoint path="/fsp" method="POST" accepts=FspMethod>\n  <FleetStatus : { active: 3 }>\n  <Dispatch(prompt, project) : { ran: record(prompt) }>\n  <DeltaSince(seq) : { since: seq }>\n</endpoint>`));
    const payload = body({ tag: "Dispatch", prompt: "rm", project: "atlas" });
    for (const headers of [{}, { "Content-Type": "text/plain" }, { "Content-Type": "text/plain;charset=UTF-8" }, { "Content-Type": "application/x-www-form-urlencoded" }, { "Content-Type": "multipart/form-data; boundary=x" }, { "Content-Type": "application/jsonx" }, { "Content-Type": "application/json-patch+json" }, { "Content-Type": "application/json, text/plain" }, { "Content-Type": "" }]) {
      const r = await send("/fsp", "POST", payload, headers);
      expect([r.status, r.headers.get("Content-Type")]).toEqual([415, "application/json"]);
      expect(r.json.error.kind).toBe("UnsupportedMediaType");
      expect(typeof r.json.error.message).toBe("string");
    }
    for (const ct of ["application/json", "application/json;charset=utf-8", "application/json; charset=UTF-8", "APPLICATION/JSON", "Application/Json ; charset=utf-8"]) {
      const r = await send("/fsp", "POST", payload, { "Content-Type": ct });
      expect([r.status, r.json]).toEqual([200, { ran: "rm" }]);
    }
    // the method check still comes first: a browser's CORS preflight (OPTIONS) is 405, so it fails
    expect((await send("/fsp", "OPTIONS", "", {})).status).toBe(405);
  });

  test("review #1916 L6: a request-supplied tag or key echoed in a 400 message is clipped to 64 characters", async () => {
    const { send } = await served(SRC);
    const long = "Q".repeat(100000);
    let r = await send("/fsp", "POST", body({ tag: long }));
    expect(r.json.error.kind).toBe("UnknownVariant");
    expect(r.json.error.message).toContain("Q".repeat(64) + "…");
    expect(r.json.error.message).not.toContain("Q".repeat(65));
    r = await send("/fsp", "POST", body({ tag: "FleetStatus", [long]: 1 }));
    expect(r.json.error.kind).toBe("InvalidPayload");
    expect(r.json.error.message).not.toContain("Q".repeat(65));
  });

  test("§61.7: the handler is mounted at path= FOR method= — another method is 405 naming the served ones; another path 404", async () => {
    const { send } = await served(SRC);
    for (const m of ["GET", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "post"]) {
      const r = await send("/fsp", m, m === "GET" || m === "HEAD" ? "" : body({ tag: "FleetStatus" }));
      expect(r.status).toBe(405);
      expect(r.headers.get("Allow")).toBe("POST");
    }
    expect((await send("/fsp/", "POST", body({ tag: "FleetStatus" }))).status).toBe(404);
    expect((await send("/FSP", "POST", body({ tag: "FleetStatus" }))).status).toBe(404);
    expect((await send("/fsp/x", "POST", body({ tag: "FleetStatus" }))).status).toBe(404);
    // the query string is not part of the path
    expect((await send("/fsp?x=1", "POST", body({ tag: "FleetStatus" }))).status).toBe(200);
  });

  test("§61.7: two endpoints at one path, two methods — each its own handler; Allow names both", async () => {
    const { send } = await served(prog(`<endpoint path="/q" method="POST" accepts=Q>\n  <Ping : { via: "post" }>\n</endpoint>\n<endpoint path="/q" method="DELETE" accepts=Q>\n  <Ping : { via: "delete" }>\n</endpoint>`, `type Q:enum = { Ping }`));
    expect((await send("/q", "POST", body({ tag: "Ping" }))).json).toEqual({ via: "post" });
    expect((await send("/q", "DELETE", body({ tag: "Ping" }))).json).toEqual({ via: "delete" });
    const r = await send("/q", "PUT", body({ tag: "Ping" }));
    expect([r.status, r.headers.get("Allow")]).toEqual([405, "POST, DELETE"]);
  });

  test("§61.3: a GET endpoint decodes the request body like any other — none is Malformed (400)", async () => {
    const { send } = await served(prog(`<endpoint path="/q" method=GET accepts=Q>\n  <Ping : { pong: true }>\n</endpoint>`, `type Q:enum = { Ping }`));
    expect((await send("/q", "GET", "")).json.error.kind).toBe("Malformed");
    expect((await send("/q", "GET", body({ tag: "Ping" }))).json).toEqual({ pong: true });
  });

  test("§61.4: the wildcard arm takes every variant without an arm — after its payload decodes", async () => {
    const { send } = await served(prog(`<endpoint path="/fsp" method="POST" accepts=FspMethod>\n  <FleetStatus : { active: 3 }>\n  <_ : { fallback: true }>\n</endpoint>`));
    expect((await send("/fsp", "POST", body({ tag: "DeltaSince", seq: 4 }))).json).toEqual({ fallback: true });
    expect((await send("/fsp", "POST", body({ tag: "DeltaSince", seq: "x" }))).json.error.kind).toBe("InvalidPayload");
    expect((await send("/fsp", "POST", body({ tag: "FleetStatus" }))).json).toEqual({ active: 3 });
  });

  test("an arm returning a declared struct through a function, and a string", async () => {
    const { send } = await served(prog(`type Out:struct = { n: int, s: string }\nfunction mk(t: string) -> Out { return { n: 2, s: t }; }\n<endpoint path="/x" method="POST" accepts=M>\n  <Go(t) : mk(t)>\n  <Name(t) : t>\n</endpoint>`, `type M:enum = {\n  Go(t: string)\n  Name(t: string)\n}`));
    expect((await send("/x", "POST", body({ tag: "Go", t: "a" }))).json).toEqual({ n: 2, s: "a" });
    expect((await send("/x", "POST", body({ tag: "Name", t: "b" }))).json).toBe("b");
  });

  test("an arm calling a server-side function, beside a client-called server function's own route", async () => {
    const src = `<program>
type M:enum = {
  Echo(text: string)
}
function shout(t: string) -> string { return t + "!"; }
server function ping() -> string { return "pong"; }
let <reply:string=""/>
<button onclick=\${ @reply = ping() !{ .Transport(t) :> "down" } }>go</button>
<endpoint path="/echo" method="POST" accepts=M>
  <Echo(text) : { said: shout(text) }>
</endpoint>
</program>
`;
    const { send, server } = await served(src);
    expect(server.routes.length).toBe(1);
    expect((await send("/echo", "POST", body({ tag: "Echo", text: "hi" }))).json).toEqual({ said: "hi!" });
    // the compiler-internal route still demands its CSRF pair (§12) — the endpoint did not open it
    expect((await send(server.routes[0].path, "POST", "[]")).status).toBe(403);
  });
});

// S479 ruling (user-voice) §3.A item 5 — the repeated-key scan (server-runtime.js
// `jsonRepeatedKey`) against an independent reference: a recursive-descent JSON reader that
// decodes every key with its own escape table and reports the first key a single object names
// twice. Random documents are drawn from a tiny key alphabet (so repeats are common) and each key
// is spelled with random escapes (`\uXXXX` upper/lower hex, `\/`), random whitespace, nesting
// through arrays and objects, and string VALUES that contain quotes, backslashes and key-like text.
describe("E — §61.3 repeated-key scan vs a reference reader (seeded fuzz)", () => {
  function refRepeated(text) {
    let i = 0;
    let found;
    const ws = () => { while (" \t\n\r".includes(text[i])) i++; };
    const str = () => {
      i++; // the opening quote
      let out = "";
      for (;;) {
        const c = text[i++];
        if (c === '"') return out;
        if (c !== "\\") { out += c; continue; }
        const e = text[i++];
        if (e === "u") { out += String.fromCharCode(parseInt(text.slice(i, i + 4), 16)); i += 4; }
        else out += { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" }[e];
      }
    };
    const val = () => {
      ws();
      const c = text[i];
      if (c === "{") {
        i++;
        const keys = new Set();
        ws();
        if (text[i] === "}") { i++; return; }
        for (;;) {
          ws();
          const k = str();
          if (keys.has(k) && found === undefined) found = k;
          keys.add(k);
          ws(); i++; // ':'
          val();
          ws();
          if (text[i++] === "}") return;
        }
      }
      if (c === "[") {
        i++;
        ws();
        if (text[i] === "]") { i++; return; }
        for (;;) { val(); ws(); if (text[i++] === "]") return; }
      }
      if (c === '"') { str(); return; }
      while (i < text.length && !",]} \t\n\r".includes(text[i])) i++;
    };
    val();
    return found;
  }

  // a small deterministic PRNG (mulberry32)
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  function spell(r, s) {
    let out = "";
    for (let j = 0; j < s.length; j++) {
      const ch = s[j]; // a UTF-16 code unit: a non-BMP character is escaped as its surrogate pair
      const x = r();
      const code = ch.charCodeAt(0);
      if (ch === '"' || ch === "\\") out += "\\" + ch;
      else if (ch === "/" && x < 0.5) out += "\\/";
      else if (x < 0.3 || code < 0x20 || (code >= 0xd800 && code <= 0xdfff && x < 0.9)) { const h = code.toString(16).padStart(4, "0"); out += "\\u" + (r() < 0.5 ? h : h.toUpperCase()); }
      else out += ch;
    }
    return '"' + out + '"';
  }
  const sp = (r) => [" ", "", "\n", "\t", "  ", "\r\n"][Math.floor(r() * 6)];
  const KEYS = ["tag", "t", "a", "a/b", "\"", "\\", "k\u0000", "Tag", "é", "\u{1F600}"];
  const VALS = ["\"tag\"", "\",\\\"tag\\\":\"", "\"\\\\\"", "\"{\\\"a\\\":1,\\\"a\\\":2}\""];
  function gen(r, depth) {
    const x = r();
    if (depth > 4 || x < 0.3) {
      const y = r();
      if (y < 0.4) return VALS[Math.floor(r() * VALS.length)];
      if (y < 0.7) return String(Math.floor(r() * 100));
      return ["true", "false", "null", "-1.5e3"][Math.floor(r() * 4)];
    }
    const n = Math.floor(r() * 4);
    const parts = [];
    if (x < 0.55) {
      for (let k = 0; k < n; k++) parts.push(sp(r) + gen(r, depth + 1) + sp(r));
      return "[" + parts.join(",") + "]";
    }
    for (let k = 0; k < n; k++) parts.push(sp(r) + spell(r, KEYS[Math.floor(r() * KEYS.length)]) + sp(r) + ":" + sp(r) + gen(r, depth + 1) + sp(r));
    return "{" + parts.join(",") + "}";
  }

  test("agrees with the reference on 20,000 random documents (repeats and non-repeats both hit)", async () => {
    const { jsonRepeatedKey } = await import("../slice-m1/runtime/server-runtime.js");
    const r = rng(479);
    let repeats = 0;
    let clean = 0;
    for (let n = 0; n < 20000; n++) {
      const doc = gen(r, 0);
      JSON.parse(doc); // the generator writes valid JSON only
      const want = refRepeated(doc);
      const got = jsonRepeatedKey(doc);
      if (got !== want) expect({ doc, got, want }).toEqual({ doc, got: want, want });
      if (want === undefined) clean++; else repeats++;
    }
    expect(repeats).toBeGreaterThan(2000);
    expect(clean).toBeGreaterThan(2000);
  });

  test("a deeply nested body is scanned without exhausting the stack", async () => {
    const { jsonRepeatedKey } = await import("../slice-m1/runtime/server-runtime.js");
    const deep = (n, inner) => '{"a":'.repeat(n) + inner + "}".repeat(n);
    expect(jsonRepeatedKey(deep(100000, '{"k":1,"k":2}'))).toBe("k");
    expect(jsonRepeatedKey(deep(100000, '{"k":1,"j":2}'))).toBe(undefined);
    expect(jsonRepeatedKey("[".repeat(100000) + '{"x":0,"x":0}' + "]".repeat(100000))).toBe("x");
  });
});

describe("D — §61.6: no client half", () => {
  test("the client artifact holds no endpoint function, route or decode; the server manifest lists the endpoint", () => {
    const r = compile(ep(`path="/fsp" method="POST" accepts=FspMethod`));
    const { client, server } = artifacts(r.core);
    expect(client.js).not.toContain("endpoint");
    expect(client.js).not.toContain("/fsp");
    expect(server.js).toContain(`endpoints: [{ path: "/fsp", method: "POST" }]`);
  });
});
