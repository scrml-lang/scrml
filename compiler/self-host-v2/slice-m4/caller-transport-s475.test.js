// caller-transport-s475.test.js — s475-boot-caller-transport: a client `!` function whose server calls
// compose into one request (one envelope) fails, for its CALLERS, with its declared variants plus
// `Transport(t: ServerCallError)`; its own error enum does not need a `Transport` variant.
//
// Governing text:
//   SPEC §19.9.5 "Implicit `!`-typing": "Its client call fails with the §19.9.10 failure set: the
//   function's declared error variants, if it is declared `!`, plus `Transport(t: ServerCallError)` —
//   for an undeclared split function, `Transport(t: ServerCallError)` alone."
//   SPEC §19.9.10 "The failure set of a client call": "A `!{}` handler or a `match` on the call SHALL
//   cover the whole set — by naming each variant, or with `_ :>` / `_ err :>` (§18.6.1)."
//   SPEC §19.5.3: "Every error variant that the called function can produce MUST exist as a variant in
//   the enclosing function's error type." / "the compiler SHALL emit a compile error (E-ERROR-010)".
//   PA ruling for this lane (S475, INTERIM→built): a composed/split client `!` function's callers see its
//   declared failure set plus `Transport(t: ServerCallError)`; the function's own enum no longer needs
//   `Transport`. `?` from such a caller needs the caller's own set to carry Transport by the same rule
//   (recursively for client callers).
//
// Before this lane (origin/main after #1756) the bootstrap refused every such function whose enum lacks
// `Transport` with E-ERROR-010 at the function — for a `! SqlError` function (a built-in enum, which can
// take no variant) with no way to comply — plus a second E-ERROR-010 at the call site for the same cause.
//
// Graded END TO END: the bootstrap's own client and server artifacts against a REAL SQLite (Bun.SQL), the
// client's `fetch` bridged to the server's — or REJECTED, the wire failure server-call-runtime.test.js
// pins as `Transport(Unreachable)`.

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
const errs = (src) => fe(src).diags.filter((d) => d.severity === "Error");
const batchOf = (r, name) => r.core.server.find((s) => s.sym.hint === name + "#batch");

let k = 0;
// Click `id` with `fetch` bridged to a real server (`wire` true) or rejected (a wire failure); wait until
// the handler settled (`r` changed); count the requests the server answered.
async function clickRun(core, sql, id, wire = true) {
  const { srv } = await serve(core, sql);
  const loaded = await loadProgram(core, "caller-transport-" + k++);
  const inst = () => [...loaded.rt.devtools.instances.values()].find((i) => i.id === 0 && i.decl.name === "program");
  const b = bridge(srv);
  let calls = 0;
  globalThis.fetch = async (p, init) => {
    if (!wire) throw new TypeError("Failed to fetch");
    const res = await b(p, init);
    if (res.status !== 403) calls += 1; // a first call's CSRF-token retry is not a request of the program's
    return res;
  };
  click(document.querySelector(id));
  for (let i = 0; i < 400 && loaded.rt.snapshot(inst()).r === 0; i++) await new Promise((r) => setTimeout(r, 0));
  expectNoPageErrors();
  return { state: loaded.rt.snapshot(inst()), calls };
}
const rows = async (sql) => (await sql.unsafe("SELECT a AS v FROM log ORDER BY a")).map((x) => x.v);

// A `! SqlError` client function whose ONE server call is a non-`!` helper reaching a query: it composes
// (#1756), and the built-in SqlError cannot take a `Transport` variant.
const PUT = `    function put(x: int) -> int {
        ${SQ}\`INSERT INTO log (a) VALUES (\${x})\`}.run() !{ _ :> { return 0; } };
        return 1;
    }
`;
const ONE = (handler, extra = "") => `<program db="./app.db">
    let <r:int=0/>
${PUT}    function save(x: int)! SqlError {
        const v: int = put(x)?;
        return v + 1;
    }
${extra}    <main>
        <button id="go" onclick={ ${handler} }>go</button>
    </main>
</program>
`;
const SQLARMS = ".QueryFailed(m) :> 3, .ConstraintViolation(c) :> 4, .ConnectionLost :> 5,";

describe("a composed client `! SqlError` function: its callers get `Transport` (§19.9.5)", () => {
  test("compiles: no E-ERROR-010 at the function or at the call site (RED on base: two E-ERROR-010 for one cause)", () => {
    const src = ONE(`@r = save(5) !{ .Transport(t) :> 7, ${SQLARMS} };`);
    expect(errs(src)).toEqual([]);
    const r = compile(src);
    expect(check(r.core)).toEqual([]);
    expect(batchOf(r, "save")).toBeTruthy();
  });

  test("the request succeeds: the batch commits, the caller gets the result", async () => {
    const r = compile(ONE(`@r = save(5) !{ .Transport(t) :> 7, ${SQLARMS} };`));
    const sql = await realDb(DDL);
    const { state, calls } = await clickRun(r.core, sql, "#go");
    expect(calls).toBe(1);
    expect(state.r).toBe(2);
    expect(await rows(sql)).toEqual([5]);
  });

  test("a wire failure of the composed request reaches the CALLER's `.Transport` arm", async () => {
    const r = compile(ONE(`@r = save(5) !{ .Transport(t) :> 7, ${SQLARMS} };`));
    const sql = await realDb(DDL);
    const { state } = await clickRun(r.core, sql, "#go", false);
    expect(state.r).toBe(7);
    expect(await rows(sql)).toEqual([]);
  });

  test("the `.Transport` arm binds the ServerCallError: an inner `match t` sees `.Unreachable`", async () => {
    const extra = `    fn cause(t: ServerCallError) -> int {
        return match t {
            .Unreachable :> 11,
            .Refused(s) :> 12,
            .ServerFault(s) :> 13,
            .Malformed(m) :> 14
        };
    }
`;
    const r = compile(ONE(`@r = save(5) !{ .Transport(t) :> cause(t), ${SQLARMS} };`, extra));
    const sql = await realDb(DDL);
    const { state } = await clickRun(r.core, sql, "#go", false);
    expect(state.r).toBe(11);
  });

  test("totality: a handler naming every SqlError variant but not `Transport` is refused (§19.9.10: \"SHALL cover the whole set\")", () => {
    const e = errs(ONE(`@r = save(5) !{ ${SQLARMS} };`));
    expect(e.length).toBe(1);
    expect(e[0].message).toContain("Transport");
  });

  test("totality: a `match` on the call that omits `Transport` is refused; `_ err` covers it", () => {
    const m = (arms) => ONE(`@r = match save(5) { .Ok(v) :> v, ${arms} };`);
    const e = errs(m(SQLARMS));
    expect(e.length).toBe(1);
    expect(e[0].message).toContain("Transport");
    expect(errs(m(`${SQLARMS} .Transport(t) :> 7,`))).toEqual([]);
    expect(errs(m("_ err :> 9,"))).toEqual([]);
  });

  test("a `_ :>` handler covers `Transport` (§19.9.10: \"or with `_ :>`\")", async () => {
    const r = compile(ONE("@r = save(5) !{ _ :> 9, };"));
    const sql = await realDb(DDL);
    const { state } = await clickRun(r.core, sql, "#go", false);
    expect(state.r).toBe(9);
  });
});

// A declared enum without `Transport`, two `!` server calls composed (the former E-ERROR-010 pin in
// client-bang-compose-s474.test.js).
const TWO = (handler) => `<program db="./app.db">
    type F:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }
    let <r:int=0/>
    function s1(a: int)! F {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run();
        return 1;
    }
    function move(a: int)! F {
        const x: int = s1(a)?;
        const y: int = s1(a + 1)?;
        return x + y;
    }
    <main><button id="go" onclick={ ${handler} }>go</button></main>
</program>
`;

describe("a declared enum without `Transport`: two composed calls", () => {
  test("compiles (RED on base: E-ERROR-010 \"add `Transport(t: ServerCallError)` to `F`\"); success and a wire failure each reach the caller", async () => {
    const src = TWO("@r = move(1) !{ .Bad :> 6, .Transport(t) :> 7, _ :> 9, };");
    expect(errs(src)).toEqual([]);
    const r = compile(src);
    expect(check(r.core)).toEqual([]);
    const sql = await realDb(DDL);
    const ok = await clickRun(r.core, sql, "#go");
    expect(ok.calls).toBe(1);
    expect(ok.state.r).toBe(2);
    expect(await rows(sql)).toEqual([1, 2]);
    const sql2 = await realDb(DDL);
    expect((await clickRun(r.core, sql2, "#go", false)).state.r).toBe(7);
    expect(await rows(sql2)).toEqual([]);
  });

  test("a `.Transport` arm where `F` declares the wrapper stays valid (it IS the declared variant, §19.9.10)", () => {
    const src = TWO("@r = move(1) !{ .Bad :> 6, .Transport(t) :> 7, _ :> 9, };").replace("ConnectionLost }", "ConnectionLost, Transport(t: ServerCallError) }");
    expect(errs(src)).toEqual([]);
  });

  test("the function's own `fail` still names its DECLARED enum: `fail .Transport(…)` in `move` is E-ERROR-009", () => {
    const src = TWO("@r = move(1) !{ _ :> 9, };").replace("        return x + y;", "        if (x > 5) { fail .Transport(.Unreachable); }\n        return x + y;");
    expect(errs(src).map((d) => d.code)).toContain("E-ERROR-009");
  });
});

// Nested client callers of the one-call `save`: each `?` hands `Transport` to ITS callers.
const NEST = (mid, handler) => ONE(handler, `    function mid(x: int)! SqlError {
${mid}
    }
    function top(x: int)! SqlError {
        const v: int = mid(x)?;
        return v * 10;
    }
`);

describe("nested client callers: `?` carries `Transport` up (recursively for client callers)", () => {
  test("top → mid → save, each `! SqlError` with `?`: compiles; the outermost handler's `.Transport` arm runs on a wire failure", async () => {
    const src = NEST("        const v: int = save(x)?;\n        return v + 1;", `@r = top(5) !{ .Transport(t) :> 7, ${SQLARMS} };`);
    expect(errs(src)).toEqual([]);
    const r = compile(src);
    expect(check(r.core)).toEqual([]);
    const sql = await realDb(DDL);
    const ok = await clickRun(r.core, sql, "#go");
    expect(ok.calls).toBe(1);
    expect(ok.state.r).toBe(30);
    expect(await rows(sql)).toEqual([5]);
    const sql2 = await realDb(DDL);
    expect((await clickRun(r.core, sql2, "#go", false)).state.r).toBe(7);
    expect(await rows(sql2)).toEqual([]);
  });

  test("the outermost handler omitting `Transport` is refused (totality, two levels up)", () => {
    const e = errs(NEST("        const v: int = save(x)?;\n        return v + 1;", `@r = top(5) !{ ${SQLARMS} };`));
    expect(e.length).toBe(1);
    expect(e[0].message).toContain("Transport");
  });

  test("a client caller handling the call itself must cover `Transport`; covering it, its own callers do not see `Transport`", () => {
    const arms = ".QueryFailed(m) :> 0, .ConstraintViolation(c) :> 0, .ConnectionLost :> 0,";
    const e = errs(NEST(`        const v: int = save(x) !{ ${arms} };\n        return v + 1;`, `@r = top(5) !{ ${SQLARMS} };`));
    expect(e.length).toBe(1);
    expect(e[0].message).toContain("Transport");
    // and since `mid` hands nothing on, a `.Transport` arm on `top` names no variant of its set
    const e2 = errs(NEST(`        const v: int = save(x) !{ .Transport(t) :> 0, ${arms} };\n        return v + 1;`, `@r = top(5) !{ .Transport(t) :> 7, ${SQLARMS} };`));
    expect(e2.length).toBe(1);
    expect(e2[0].message).toContain("Transport");
    // `mid` handles every failure and propagates none: `top`'s `?` on it carries SqlError only, so a
    // handler on `top` with no `.Transport` arm is total
    const ok = NEST(`        const v: int = save(x) !{ .Transport(t) :> 0, ${arms} };\n        return v + 1;`, `@r = top(5) !{ ${SQLARMS} };`);
    expect(errs(ok)).toEqual([]);
  });
});

describe("what stays refused — one diagnostic, naming a fix that can work (review of #1756, F3)", () => {
  test("a caller whose enum declares `Transport` with another payload cannot carry the wire failure: one E-ERROR-010", () => {
    const src = ONE(`@r = top(5) !{ _ :> 9, };`, `    type G2:enum = { QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost, Transport(code: int) }
    function top(x: int)! G2 {
        const v: int = save(x)?;
        return v;
    }
`);
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-ERROR-010"]);
    expect(e[0].message).toContain("§19.9.5");
  });

  // s475-boot-transport-every-client-bang: owner ruling S475 item 4 — "§19.9.5 extends to every client `!`
  // function making a server call (callers see `E + Transport`); retires §19.5.3 bullet 3 for client functions.
  // Newly-accepting." Was: one E-ERROR-010 here ("`SqlError` is built in and takes no variant").
  test("an UNcomposed client `! SqlError` function `?`-propagating a `!` server call is a carrier: it compiles, its caller's `_` covers `Transport` (ruling S475 item 4; was E-ERROR-010)", () => {
    const src = `<program db="./app.db">
    let <r:int=0/>
    function get(x: int)! SqlError {
        ${SQ}\`INSERT INTO log (a) VALUES (\${x})\`}.run();
        return 1;
    }
    function load(x: int)! SqlError {
        const v: int = get(x)?;
        return v;
    }
    <main><button id="go" onclick={ @r = load(5) !{ _ :> 9, }; }>go</button></main>
</program>
`;
    expect(errs(src)).toEqual([]);
    // the caller's handler owes `Transport`: without `_`, naming only SqlError's variants is E-TYPE-080
    const e = errs(src.replace("!{ _ :> 9, }", "!{ .QueryFailed(m) :> 3, .ConstraintViolation(c) :> 4, .ConnectionLost :> 5, }"));
    expect(e.map((d) => d.code)).toEqual(["E-TYPE-080"]);
    expect(e[0].message).toContain("Transport");
  });
});

// r1 (review of #1760, F1): a client `!` function in a CALL CYCLE that reaches the server makes as many
// requests as the recursion runs — it is never "one request through one composed callee". On 15393ed9e
// `viaOneComposed` (and `tq.remote`, filled in SCC order: the first member of a cycle saw its partner's
// count as 0) admitted it, and `g(1)` ran two requests: the first committed, the second failed, the caller
// got the failure (§19.10.5: "no transaction spans two requests"; violated). Base refused it.
// Each shape must be REFUSED or run as ONE atomic request; the bootstrap refuses (E-BOOTSTRAP-UNSUPPORTED).
const CYC = (fns) => `<program db="./app.db">
    type F:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }
    let <r:int=0/>
    function s1(a: int)! F {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run();
        return 1;
    }
    function move(a: int)! F {
        const x: int = s1(a)?;
        const y: int = s1(a + 1)?;
        return x + y;
    }
${fns}    <main><button id="go" onclick={ @r = g(1) !{ .ConstraintViolation(c) :> 22, .Transport(t) :> 7, _ :> 9, }; }>go</button></main>
</program>
`;
const CYCLES = {
  "mutual recursion g → h → g (the review's repro)": `    function g(a: int)! F {
        const v: int = h(a)?;
        return v;
    }
    function h(a: int)! F {
        let w: int = 0;
        if (a > 0) { w = g(a - 1)?; }
        const v: int = move(a)?;
        return v + w;
    }
`,
  "direct recursion g → g": `    function g(a: int)! F {
        let w: int = 0;
        if (a > 0) { w = g(a - 1)?; }
        const v: int = move(a)?;
        return v + w;
    }
`,
  "a three-cycle g → h → k → g": `    function g(a: int)! F {
        const v: int = h(a)?;
        return v;
    }
    function h(a: int)! F {
        const v: int = k(a)?;
        return v;
    }
    function k(a: int)! F {
        let w: int = 0;
        if (a > 0) { w = g(a - 1)?; }
        const v: int = move(a)?;
        return v + w;
    }
`,
};

describe("a client `!` function in a call cycle reaching the server is not one composed request (review of #1760, F1)", () => {
  for (const [name, fns] of Object.entries(CYCLES)) {
    test(name + ": refused, or one atomic request (RED on 15393ed9e: two requests, the first's rows committed)", async () => {
      const src = CYC(fns);
      const e = errs(src);
      if (e.length === 0) {
        // compiled: it must be ONE request, and a failure must leave nothing committed
        const r = compile(src);
        expect(check(r.core)).toEqual([]);
        const sql = await realDb(["CREATE TABLE log (a INTEGER UNIQUE)"]);
        const o = await clickRun(r.core, sql, "#go");
        expect({ calls: o.calls, rows: await rows(sql) }).toEqual({ calls: 1, rows: [] });
      }
      // the bootstrap refuses it, naming the recursion
      expect(e.map((d) => d.code)).toContain("E-BOOTSTRAP-UNSUPPORTED");
      expect(e.some((d) => d.message.includes("recursive"))).toBe(true);
    }, 60000);
  }
});
