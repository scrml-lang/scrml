// nonbang-callee-envelope-s475.test.js — s475-boot-nonbang-callee-envelope: a CLIENT-placed `!`
// function whose ONE server call reaches a non-`!` server function holding a query — one query, or
// only `.nobatch()` ones — runs that query inside one envelope.
//
// Governing text:
//   SPEC §8.9.2 "Amendment S474" item 1: "The body of every `!` function placed on the server … whose
//   transitive query set … is **non-empty** SHALL run inside the implicit per-handler transaction. This
//   holds whatever its error type … and however many queries it reaches (one is enough)."
//   SPEC §19.10.5: "The §19.9.9 planner places a client-placed (§12) `!` function's server calls in one
//   server batch (§19.9.9.8 rule 1: *"the callee runs in the same request"*), which runs inside one
//   implicit envelope over its transitive query set".
//   SPEC §19.9.9.8 rule 1: "The only value a server batch hands the client is the set of final values of
//   the cells it wrote (`{ __scrml_cells: { … } }`), never the rows, hashes or locals the logic consumed."
//   Ruling (user-voice-scrml.md S474, "permanent-restrictions re-review: the four one-way doors", door 2):
//   "F11 becomes INTERIM: a client `!`'s server calls compose into one request with one envelope".
//   Ruling (S475 item 1): "A `!` function must not report failure while its writes stand."
//
// Before this lane (origin/main be56b6dad), analyze.scrml `composeTrigger` kept the pre-S474 count
// (`tq.qs`, two counted queries): the one call was a plain client call and its query ran in autocommit.
// Graded END TO END against a REAL SQLite (Bun.SQL): the bootstrap's own client and server artifacts,
// the client's `fetch` bridged to the server's.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mods, compile, check, realDb, serve, bridge } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 300000 });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const SQ = "?" + "{";
const E = "    type E:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost, Transport(t: ServerCallError) }\n";
const DDL = ["CREATE TABLE log (a INTEGER)", "CREATE TABLE uniq (k INTEGER PRIMARY KEY)", "CREATE TABLE src (k INTEGER)", "INSERT INTO src (k) VALUES (1), (2), (1)"];
const fe = (src) => frontEnd(mods(), [{ path: "app.scrml", src }]);
const errs = (src) => fe(src).diags.filter((d) => d.severity === "Error");

let k = 0;
// Click `id`, wait until the handler settled (`r` changed); count the requests the server answered.
async function clickRun(core, sql, id) {
  const { srv } = await serve(core, sql);
  const loaded = await loadProgram(core, "nonbang-" + k++);
  const inst = () => [...loaded.rt.devtools.instances.values()].find((i) => i.id === 0 && i.decl.name === "program");
  const b = bridge(srv);
  let calls = 0;
  globalThis.fetch = async (p, init) => {
    const res = await b(p, init);
    if (res.status !== 403) calls += 1; // a first call's CSRF-token retry is not a request of the program's
    return res;
  };
  click(document.querySelector(id));
  for (let i = 0; i < 400 && loaded.rt.snapshot(inst()).r === 0; i++) await new Promise((r) => setTimeout(r, 0));
  expectNoPageErrors();
  return { state: loaded.rt.snapshot(inst()), calls };
}
const rows = async (sql, t = "log", c = "a") => (await sql.unsafe(`SELECT ${c} AS v FROM ${t} ORDER BY ${c}`)).map((x) => x.v);
const batchOf = (r, name) => r.core.server.find((s) => s.sym.hint === name + "#batch");
const envOf = (r, name) => r.core.envelopes.find((e) => e.fn.id === batchOf(r, name).sym.id);

// ONE query in a non-`!` callee, handled at its site: `INSERT OR FAIL … SELECT` keeps the rows it
// inserted before the conflicting one unless a rollback removes them (src = 1, 2, 1).
const PARTIAL = `<program db="./app.db">
${E}    let <r:int=0/>
    function addAll() -> int {
        ${SQ}\`INSERT OR FAIL INTO uniq (k) SELECT k FROM src ORDER BY rowid\`}.run() !{ _ :> { return 0; } };
        return 1;
    }
    function load()! E {
        const v: int = addAll()?;
        return v + 1;
    }
    <main>
        <button id="go" onclick={ @r = load() !{ .Transport(t) :> 7, _ :> 9, }; }>go</button>
    </main>
</program>
`;

describe("one query in a non-`!` callee of a client `!` runs inside an envelope", () => {
  test("load() composes: its one call is a server batch with an IMMEDIATE envelope (was: a plain client call, no envelope)", () => {
    const r = compile(PARTIAL);
    expect(check(r.core)).toEqual([]);
    expect(batchOf(r, "load")).toBeTruthy();
    expect(envOf(r, "load")).toMatchObject({ standalone: true, writes: true });
  });

  test("the one statement's partial rows do not stand: a failure handled at the site rolls back to its statement savepoint (RED on base: uniq = [1, 2])", async () => {
    const r = compile(PARTIAL);
    const sql = await realDb(DDL);
    const { state, calls } = await clickRun(r.core, sql, "#go");
    expect(calls).toBe(1);
    expect(state.r).toBe(1); // addAll answered 0 (its handler ran), load returned 0 + 1
    expect(await rows(sql, "uniq", "k")).toEqual([]);
  });
});


// the same callee with its one query `.nobatch()` (§8.9.5: "SHALL NOT affect the implicit per-handler
// transaction"), and the sync2 shape: the call's result written to a cell
const PARTIAL2 = (nobatch, load) => PARTIAL.replace(".run() !{ _ :> { return 0; } };", (nobatch ? ".nobatch()" : "") + ".run() !{ _ :> { return 0; } };")
  .replace("        const v: int = addAll()?;\n        return v + 1;", load);

describe("only `.nobatch()` queries, and a cell written from the call's result", () => {
  test("a `.nobatch()` query: composed, enveloped, its partial rows do not stand (RED on base: uniq = [1, 2])", async () => {
    const r = compile(PARTIAL2(true, "        const v: int = addAll()?;\n        return v + 1;"));
    const sql = await realDb(DDL);
    const { state } = await clickRun(r.core, sql, "#go");
    expect(state.r).toBe(1);
    expect(await rows(sql, "uniq", "k")).toEqual([]);
    expect(envOf(r, "load")).toMatchObject({ standalone: true, writes: true });
  });

  test("`@r = addAll()? + 1;` (server-call-core's sync2 shape): composed — the cell's value comes back as the batch's answer; partial rows do not stand (RED on base: uniq = [1, 2])", async () => {
    const src = PARTIAL2(false, "        @r = addAll()? + 1;").replace("@r = load() !{ .Transport(t) :> 7, _ :> 9, };", "load() !{ _ :> { @r = 9; } };");
    const r = compile(src);
    const sql = await realDb(DDL);
    const { state, calls } = await clickRun(r.core, sql, "#go");
    expect(calls).toBe(1);
    expect(state.r).toBe(1);
    expect(await rows(sql, "uniq", "k")).toEqual([]);
    expect(check(r.core)).toEqual([]);
    expect(batchOf(r, "load")).toBeTruthy();
  });
});

// THE CELL ENVELOPE (§19.9.9.8 rule 1): cells written from values the batch computes come back with its
// answer; a write of a value the client holds is applied after the batch; source order is kept.
const CELLS = (body, after = "") => `<program db="./app.db">
${E}    let <r:int=0/>
    let <a:int=0/>
    let <b:int=0/>
    let <s:string=""/>
    function put(x: int) -> int {
        ${SQ}\`INSERT INTO log (a) VALUES (\${x})\`}.run() !{ _ :> { return 0; } };
        return 1;
    }
    function both(x: int)! E {
${body}
    }
    <main>
        <button id="go" onclick={ ${after || "@r = both(5) !{ _ :> 9, };"} }>go</button>
    </main>
</program>
`;

describe("the cell envelope: the batch answers the final values of the cells it wrote", () => {
  test("a cell from the batch AND a result: `{ c0, r }` comes back; the spinner write before, the client-held write after", async () => {
    const src = CELLS(`        @s = "busy";\n        const v: int = put(x)?;\n        @a = v + 10;\n        @s = "done";\n        return v;`);
    const r = compile(src);
    expect(check(r.core)).toEqual([]);
    expect(envOf(r, "both")).toMatchObject({ standalone: true, writes: true });
    const sql = await realDb(DDL);
    const { state, calls } = await clickRun(r.core, sql, "#go");
    expect(calls).toBe(1);
    expect(state).toMatchObject({ r: 1, a: 11, s: "done" });
    expect(await rows(sql)).toEqual([5]);
  });

  test("two cells from the batch, no result; a later write of the same cell from a client value wins (source order)", async () => {
    const src = CELLS(`        const v: int = put(x)?;\n        @a = v + 10;\n        @b = v + 20;\n        @a = 3;`, "both(5) !{ _ :> { @r = 9; } }; @r = 1;");
    const r = compile(src);
    const sql = await realDb(DDL);
    const { state } = await clickRun(r.core, sql, "#go");
    expect(state).toMatchObject({ a: 3, b: 21 });
    expect(await rows(sql)).toEqual([5]);
  });

  test("a cell written twice in the batch: its LAST value comes back", async () => {
    const src = CELLS(`        const v: int = put(x)?;\n        @a = v + 10;\n        const w: int = v + 1;\n        @a = w + 40;\n        return w;`);
    const r = compile(src);
    const sql = await realDb(DDL);
    const { state } = await clickRun(r.core, sql, "#go");
    expect(state).toMatchObject({ r: 2, a: 42 });
  });
});

describe("what the cell envelope does not carry yet — refused by name (INTERIM)", () => {
  test("a cell written in a nested statement of the batch (only on some paths)", () => {
    const e = errs(CELLS(`        const v: int = put(x)?;\n        if (v > 0) { @a = v; }`, "both(5) !{ _ :> { @r = 9; } }; @r = 1;"));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("writes `@a` with a value the batch computes inside a nested statement");
    expect(e[0].message).toContain("write the cell in a top-level statement");
  });

  test("a cell written in a handler arm of the server call", () => {
    const e = errs(CELLS(`        const v: int = put(x) !{ _ :> { @a = 1; return 0; } };\n        return v;`));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("makes a server call and writes `@a` inside it");
  });

  test("a `return` before the end of a batch that writes cells (the exit flag)", () => {
    const e = errs(CELLS(`        const v: int = put(x)?;\n        @a = v;\n        if (v > 5) { return 2; }\n        return v;`));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("the batch holds a `return` before its end");
  });
});

// THE MARSHAL (§6.6.9 / §19.9.9.7): a program cell the batch reads is the client's value at the batch's
// start, handed to the batch as an argument; after a carried write of the cell, the batch reads its own value.
describe("the marshal: a cell read inside the batch", () => {
  test("one non-`!` call reading a cell (`put(@a)?`): composed, the cell's value rides the request (on base: not composed, its query unenveloped)", async () => {
    const src = CELLS(`        @a = 6;\n        const v: int = put(@a)?;\n        return v;`);
    const r = compile(src);
    expect(batchOf(r, "both")).toBeTruthy();
    const sql = await realDb(DDL);
    const { state, calls } = await clickRun(r.core, sql, "#go");
    expect(calls).toBe(1);
    expect(state).toMatchObject({ r: 1, a: 6 });
    expect(await rows(sql)).toEqual([6]);
  });

  test("a read after a carried write of the same cell sees the batch's value", async () => {
    const src = CELLS(`        const v: int = put(x)?;\n        @a = v + 10;\n        const y: int = put(@a)?;\n        return y;`);
    const r = compile(src);
    const sql = await realDb(DDL);
    const { state, calls } = await clickRun(r.core, sql, "#go");
    expect(calls).toBe(1);
    expect(state).toMatchObject({ r: 1, a: 11 });
    expect(await rows(sql)).toEqual([5, 11]);
  });

  test("INTERIM: a read in the batch after a write of the cell that the client applies after it — refused by name", () => {
    const e = errs(CELLS(`        const v: int = put(x)?;\n        @b = 7;\n        const y: int = put(@b)?;\n        return y;`));
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("reads `@b` after a write of it that the client applies only after the batch commits");
  });

  test("INTERIM: a tape cell read in the batch (its grants cannot be spelled) — refused by name", () => {
    const src = CELLS(`        const v: int = put(x)?;\n        const n: int = @xs.length;\n        return n + v;`).replace("    let <s:string=\"\"/>", "    let <s:string=\"\"/>\n    <xs:int[]=([1, 2])/>");
    const e = errs(src);
    expect(e.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(e[0].message).toContain("the batch reads `@xs`, whose type the bootstrap cannot write");
  });
});
