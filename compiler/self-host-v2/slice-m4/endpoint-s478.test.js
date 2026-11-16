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

  test("§61.7: a csrf= attribute is refused (\"SHALL NOT carry a `csrf=` attribute\"), as is any other attribute", () => {
    expect(refusals(ep(`path="/fsp" method="POST" accepts=FspMethod csrf="off"`)).join()).toContain("SHALL NOT carry a `csrf=`");
    expect(codes(ep(`path="/fsp" method="POST" accepts=FspMethod auth="x"`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

describe("B — refused by name where the SPEC is silent (fail closed)", () => {
  test("two endpoints at one path and method", () => {
    const two = prog(`<endpoint path="/fsp" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint>\n<endpoint path="/fsp" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint>`);
    expect(refusals(two).join()).toContain("two endpoints mounted at one path and method");
    // one path, two methods: each is its own route
    const both = prog(`<endpoint path="/fsp" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint>\n<endpoint path="/fsp" method="PUT" accepts=FspMethod>\n${ARMS3}\n</endpoint>`);
    expect(codes(both)).toEqual([]);
  });

  test("a path= that is not a plain absolute path, or under /_scrml/", () => {
    for (const p of ["fsp", "/_scrml/call/1", "/_scrml", "/a?b=1", "/a#x", "/a/../b", "/a//b", "/users/:id", "/a%20b", "/ünï"]) {
      expect(codes(ep(`path="${p}" method="POST" accepts=FspMethod`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    }
    for (const p of ["/", "/fsp/", "/api/v1/fleet-status", "/a.b_c~d"]) expect(codes(ep(`path="${p}" method="POST" accepts=FspMethod`))).toEqual([]);
  });

  test("an endpoint outside the top-level <program> body, or inside markup", () => {
    expect(codes(`${FSP_TYPE}\n<endpoint path="/fsp" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint>\n<program></program>\n`)).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(codes(prog(`<div><endpoint path="/fsp" method="POST" accepts=FspMethod>\n${ARMS3}\n</endpoint></div>`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
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

  test("an arm with no value (a call of a function that returns nothing) is refused (§61.5 names no response for it)", () => {
    const src = prog(`function note(t: string) { const u: string = t; }\n<endpoint path="/x" method="POST" accepts=M>\n  <Go(t) : note(t)>\n</endpoint>`, `type M:enum = {\n  Go(t: string)\n}`);
    expect(refusals(src).join()).toContain("has no proven type");
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

