// transport-every-client-bang-s475.test.js — s475-boot-transport-every-client-bang: EVERY client `!` function
// that `?`-propagates a client call of a server function — composed or not, directly or through a client
// `!` callee that does — is a TRANSPORT CARRIER: its own enum need not name `Transport`, its callers'
// `!{}` / `match` cover `E + Transport` (or `_`), and `?` from a client caller makes that caller one too.
//
// Governing text:
//   Owner ruling, user-voice-scrml.md "⭐ RULED — S475 owner questions, PA recs adopted wholesale (S475,
//   2026-11-06)" item 4: "§19.9.5 extends to every client `!` function making a server call (callers see
//   `E + Transport`); retires §19.5.3 bullet 3 for client functions. Newly-accepting."
//   SPEC §19.9.5 "Implicit `!`-typing": "Its client call fails with the §19.9.10 failure set: the
//   function's declared error variants, if it is declared `!`, plus `Transport(t: ServerCallError)`".
//   SPEC §19.5.3 bullet 3 (retired for client functions by the ruling): "For a client call to a server
//   function, the variants the call produces include `Transport(t: ServerCallError)` (§19.9.10), so the
//   enclosing enum SHALL declare it".
//
// Before this lane (origin/main 19fc95a24) only a function whose calls COMPOSE (and its `?`-propagating
// client callers) was a carrier; an uncomposed one — a single `s(x)?` with nothing after it that can fail —
// was refused with E-ERROR-010 at the `?` ("Add `Transport(t: ServerCallError)` to `E`"), and its caller's
// `.Transport` arm with E-TYPE-VARIANT.
//
// Graded END TO END: the bootstrap's own client and server artifacts against a REAL SQLite (Bun.SQL), the
// client's `fetch` bridged to the server's — or REJECTED (a wire failure, `Transport(Unreachable)`).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mods, compile, check, realDb, serve, bridge } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 300000 });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const SQ = "?" + "{";
const DDL = ["CREATE TABLE log (a INTEGER)"];
const fe = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const errs = (src) => fe(src).diags.filter((d) => d.severity === "Error").map((d) => d.code + ": " + d.message);
const batchOf = (r, name) => r.core.server.find((s) => s.sym.hint === name + "#batch");

let k = 0;
async function clickRun(core, sql, id, wire = true) {
  const { srv } = await serve(core, sql);
  const loaded = await loadProgram(core, "transport-every-client-bang-" + k++);
  const inst = () => [...loaded.rt.devtools.instances.values()].find((i) => i.id === 0 && i.decl.name === "program");
  const b = bridge(srv);
  let calls = 0;
  globalThis.fetch = async (p, init) => {
    if (!wire) throw new TypeError("Failed to fetch");
    const res = await b(p, init);
    if (res.status !== 403) calls += 1;
    return res;
  };
  click(document.querySelector(id));
  for (let i = 0; i < 400 && loaded.rt.snapshot(inst()).r === 0; i++) await new Promise((r) => setTimeout(r, 0));
  expectNoPageErrors();
  return { state: loaded.rt.snapshot(inst()), calls };
}
const rows = async (sql) => (await sql.unsafe("SELECT a AS v FROM log ORDER BY a")).map((x) => x.v);

// A `! E` server function (a declared failure for x < 0), and a client `! E` function whose ONE server call
// is `s(x)?` with nothing after it that can fail: not composed (composeSingle finds no later exit).
const S = `    server function s(x: int)! E {
        if (x < 0) fail E.Bad;
        ${SQ}\`INSERT INTO log (a) VALUES (\${x})\`}.run() !{ _ :> { return 0; } };
        return x;
    }
`;
const F = `    function f(x: int)! E {
        const v: int = s(x)?;
        return v + 1;
    }
`;
const G = `    function g(x: int)! E {
        const v: int = f(x)?;
        return v + 10;
    }
`;
const P = (fns, handler, enumDecl = "type E:enum = { Bad }") => `<program db="./app.db">
    let <r:int=0/>
    ${enumDecl}
${fns}    <main>
        <button id="go" onclick={ ${handler} }>go</button>
    </main>
</program>
`;

describe("an UNcomposed client `! E` function that `?`-propagates a server call is a transport carrier (ruling S475 item 4)", () => {
  const SRC = (x) => P(S + F, `@r = f(${x}) !{ .Transport(t) :> 7, .Bad :> 8 };`);

  test("compiles: no E-ERROR-010 at the `?`, the caller's `.Transport` arm is valid (RED on base: E-ERROR-010 + E-TYPE-VARIANT)", () => {
    expect(errs(SRC(5))).toEqual([]);
    const r = compile(SRC(5));
    expect(check(r.core)).toEqual([]);
    expect(batchOf(r, "f")).toBeUndefined(); // not composed: the carrier rule no longer needs composition
  });

  test("the request succeeds: the caller gets the result", async () => {
    const sql = await realDb(DDL);
    const { state, calls } = await clickRun(compile(SRC(5)).core, sql, "#go");
    expect(calls).toBe(1);
    expect(state.r).toBe(6);
    expect(await rows(sql)).toEqual([5]);
  });

  test("a wire failure reaches the CALLER's `.Transport` arm", async () => {
    const sql = await realDb(DDL);
    const { state } = await clickRun(compile(SRC(5)).core, sql, "#go", false);
    expect(state.r).toBe(7);
    expect(await rows(sql)).toEqual([]);
  });

  test("a server-declared failure reaches the caller's `.Bad` arm", async () => {
    const sql = await realDb(DDL);
    const { state } = await clickRun(compile(SRC(-1)).core, sql, "#go");
    expect(state.r).toBe(8);
    expect(await rows(sql)).toEqual([]);
  });

  test("the caller's handler must cover `Transport` (or `_`): E-TYPE-080 names `E + Transport`", () => {
    const e = errs(P(S + F, `@r = f(5) !{ .Bad :> 8 };`));
    expect(e.length).toBe(1);
    expect(e[0]).toContain("E-TYPE-080");
    expect(e[0]).toContain("E + Transport");
    expect(errs(P(S + F, `@r = f(5) !{ _ :> 8 };`))).toEqual([]);
  });

  // the `fail` stands BEFORE the call, so the function does not compose (a later one would join a batch)
  test("its own `fail` still names E: `fail E.Transport(…)` is E-ERROR-009", () => {
    const own = `    function f(x: int)! E {
        if (x == 0) fail E.Transport(ServerCallError.Unreachable);
        const v: int = s(x)?;
        return v + 1;
    }
`;
    const e = errs(P(S + own, `@r = f(5) !{ _ :> 8 };`));
    expect(e.map((x) => x.split(":")[0])).toEqual(["E-ERROR-009"]);
  });

  test("an enum declaring `Transport` with another payload stays refused (E-ERROR-016)", () => {
    const e = errs(P(S + F, `@r = f(5) !{ _ :> 8 };`, "type E:enum = { Bad, Transport(n: int) }"));
    expect(e.map((x) => x.split(":")[0])).toEqual(["E-ERROR-016"]);
  });

  test("an enum already declaring `Transport(t: ServerCallError)` is unchanged (that IS the set)", () => {
    expect(errs(P(S + F, `@r = f(5) !{ .Transport(t) :> 7, .Bad :> 8 };`, "type E:enum = { Bad, Transport(t: ServerCallError) }"))).toEqual([]);
  });
});

describe("through a client callee: `?` on a carrier's call makes the caller a carrier too", () => {
  const SRC = (x) => P(S + F + G, `@r = g(${x}) !{ .Transport(t) :> 7, .Bad :> 8 };`);

  test("compiles (RED on base: E-ERROR-010 in f + E-TYPE-VARIANT at g's caller)", () => {
    expect(errs(SRC(5))).toEqual([]);
  });

  test("success, wire failure and server failure each reach g's caller", async () => {
    const sql = await realDb(DDL);
    expect((await clickRun(compile(SRC(5)).core, sql, "#go")).state.r).toBe(16);
    const sql2 = await realDb(DDL);
    expect((await clickRun(compile(SRC(5)).core, sql2, "#go", false)).state.r).toBe(7);
    const sql3 = await realDb(DDL);
    expect((await clickRun(compile(SRC(-1)).core, sql3, "#go")).state.r).toBe(8);
  });

  test("a client caller that HANDLES the carrier's call is not a carrier: its callers owe no `Transport`", () => {
    const H = `    function g(x: int)! E {
        const v: int = f(x) !{ _ :> 0 };
        return v + 10;
    }
`;
    expect(errs(P(S + F + H, `@r = g(5) !{ .Bad :> 8 };`))).toEqual([]);
  });
});

describe("a built-in enum: a client `! SqlError` function `?`-propagating a `! SqlError` server call", () => {
  const SRC = `<program db="./app.db">
    let <r:int=0/>
    server function s2(x: int)! SqlError {
        ${SQ}\`INSERT INTO log (a) VALUES (\${x})\`}.run();
        return x;
    }
    function f(x: int)! SqlError {
        const v: int = s2(x)?;
        return v + 1;
    }
    <main>
        <button id="go" onclick={ @r = f(5) !{ .Transport(t) :> 7, _ :> 9 }; }>go</button>
    </main>
</program>
`;
  test("compiles (RED on base: E-ERROR-010, `SqlError` takes no variant), and a wire failure reaches `.Transport`", async () => {
    expect(errs(SRC)).toEqual([]);
    const sql = await realDb(DDL);
    expect((await clickRun(compile(SRC).core, sql, "#go")).state.r).toBe(6);
    const sql2 = await realDb(DDL);
    expect((await clickRun(compile(SRC).core, sql2, "#go", false)).state.r).toBe(7);
  });
});
