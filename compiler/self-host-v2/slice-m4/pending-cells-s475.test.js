// pending-cells-s475.test.js — s475-boot-pending-cells (slice S4 of the bootstrap §13.9 pending-cells
// plan): a `(not to T)` program cell with a waiting initializer is a PENDING CELL, built as §13.9.2
// writes it — a plain cell initialized to `not` plus a compiler-written `<request>` whose body is the
// initializer assigned to the cell, lowered onto Core View.Request with `state: not` (no signals).
//
// Governing text (compiler/SPEC.md):
//   §13.9.1 "A Shape-1 cell declaration (§6.2) whose declared type is the presence lifecycle `(not to
//     T)` … MAY take a waiting value (§13.8) as its initializer. Such a cell is a pending cell. …
//     a cell declared with any other type, or with no type, keeps E-VALUE-SERVER-CALL" · "A derived
//     cell cannot be a pending cell".
//   §13.9.2 "A pending cell declaration SHALL mean exactly a plain cell initialized to `not`, plus a
//     `<request>` (§6.7.7) whose body is the declared initializer assigned to the cell" · "deps are
//     inferred from the initializer's `@` reads … An initializer that reads no cell loads once, on
//     mount" · "Mount, supersede (EC-2: the newest load wins), teardown (EC-3), §6.7.7.1 READ / WRITE
//     classification and abort-reads / discard-writes … apply to a pending cell by construction" ·
//     "A pending cell exposes no `.refetch()`, `.loading` or `.stale` (and, per §13.9.5, no `.error`)".
//   §13.9.3 "Any other read SHALL be E-TYPE-001 … The message SHALL say that the value may still be in
//     flight and name the declaration's load." · render positions keep E-VALUE-SERVER-CALL.
//   §13.9.4 "the cell SHALL keep its last `T` while the new load is in flight … It SHALL NOT revert
//     to `not`."
//   §13.9.5 "An unhandled failable initializer SHALL be E-ERROR-002. … Each arm SHALL yield a value of
//     the declared type or leave (E-ERROR-012). `not` is a value of `(not to T)`: it returns the cell
//     to its pre-state."
//   §13.7 "the second fix: "or declare the cell `(not to T)` (§13.9)". It is offered only for a cell
//     initializer".
// Rulings (../scrml-support/user-voice-scrml.md "⭐ RULED — S475 owner questions"): item 1 "`let` +
//   reads re-runs on a dependency change; locked + no reads loads once; locked + reads is derived and
//   stays refused (E-VALUE-SERVER-CALL); `let` is allowed on a `(not to S[…])` pending tape; the
//   compiler-written load writes are exempt from grant checks" · item 2 "A value that admits `not` may
//   be written into a `(not to T)` cell only as a pending cell's own handled load (§13.9.4); elsewhere
//   refused (INTERIM)" · item 3 "Locked `(not to T)` cell: no `T → T′` write for a plain lifecycle
//   cell; allowed for a pending cell (it reloads)" · item 7 "A derived cell with a lifecycle type is
//   refused, PERMANENT".
//
// Red on base (origin/main 19fc95a24 + #1783): every program below that compiles here was
// E-BOOTSTRAP-UNSUPPORTED "pending cells are not in the bootstrap yet" (the S0 / S1 pin).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mods, compile, check, realDb, serve, bridge } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram, instancesOf, printCore } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 300000 });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; expectNoPageErrors(); });

const SQ = "?" + "{";
const D = "$" + "{";
const U = "E-BOOTSTRAP-UNSUPPORTED";
const fe = (src) => frontEnd(mods(), Array.isArray(src) ? src : [{ path: "app.scrml", src }]);
const errsOf = (src) => fe(src).diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (src) => errsOf(src).map((d) => d.code);
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(n = 60) { for (let i = 0; i < n; i++) await tick(); }
let k = 0;

function requestsOf(core) {
  const prog = core.decls.find((d) => d.sym.id === core.program.id);
  return prog.renders.filter((v) => v.variant === "Request").map((v) => v.data);
}
function cells(rt) {
  const prog = instancesOf(rt, "program")[0];
  const out = {};
  prog.decl.fields.forEach((h, i) => { out[h] = prog.fields[i].peek(); });
  return out;
}

// A READ load (one SELECT) of a user's name, the pending cell `@who` on `@userId`.
const DDL = ["CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"];
const ROWS = { users: [{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }] };
const LOAD = `    function loadName(id: int) -> string {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
`;
// r1 F1: a CLIENT function that reads `@userId` and reaches the server; a cell-free client helper.
const CUR = `    function cur() -> string { const n = loadName(@userId) !{ _ :> "?" }; return n; }
    function one() -> int { return 1; }
`;
const APP = (decl, opts = {}) => `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <userId:int=1/>
    let <show:boolean=true/>
${LOAD}${opts.inIf ? "" : `    ${decl}\n`}    <main>
        <button id="u2" onclick={ @userId = 2; }>2</button>
        <button id="u3" onclick={ @userId = 3; }>3</button>
        <button id="hide" onclick={ @show = false; }>hide</button>
        <p id="who" if=@who>${D}@who}</p>
        <p id="wait" else>loading</p>
    </main>
</program>
`;
const PEND = `let <who:(not to string)=(loadName(@userId) !{ _ :> not })/>`;

// A transport that HOLDS every client call until the test releases it (and honours `init.signal`).
function heldTransport(srv) {
  const b = bridge(srv);
  // the CSRF double-submit cookie a page already holds (the first call would otherwise be refused, 403)
  document.cookie = "scrml_csrf=pending-test; Path=/";
  const held = [];
  globalThis.fetch = (p, init) => new Promise((resolve, reject) => {
    const h = { signal: init.signal ?? null, aborted: false, body: init.body };
    h.go = () => b(p, init).then(resolve, reject);
    h.fail = () => reject(new TypeError("network down"));
    if (h.signal) {
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
const shown = () => (document.querySelector("#who") ? document.querySelector("#who").textContent : null);
const waiting = () => document.querySelector("#wait") !== null;

describe("§13.9.1 / §13.9.2 — a pending cell compiles to a plain cell + a stateless View.Request", () => {
  test("the S473 probe pend1 (`let` + no reads) compiles clean (red on base: E-BOOTSTRAP-UNSUPPORTED)", () => {
    const src = readFileSync(join(import.meta.dir, "../../../docs/changes/s473-spec-coverage/probes/part-2/s13/pend1.scrml"), "utf8");
    const r = fe(src);
    expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    expect(check(r.core)).toEqual([]);
    const [rq] = requestsOf(r.core);
    expect(rq.state).toBe(null);                 // no `<#id>` signals (§13.9.2 / §13.9.5)
    expect(rq.handle).toBe(null);                // no reachable controls
    expect(rq.deps).toEqual([]);                 // reads no cell: loads once, on mount
    expect(rq.mount).toBe(true);
  });

  test("the cell is `not` until its load settles: its own initializer is `not` (no new runtime representation)", () => {
    const r = compile(APP(PEND));
    const prog = r.core.decls.find((d) => d.sym.id === r.core.program.id);
    const who = prog.fields.find((f) => f.sym.hint === "who");
    expect(who.init).toEqual({ variant: "Lit", data: { lit: "Absent" } });
    expect(prog.fields.map((f) => f.sym.hint)).toEqual(["userId", "show", "who"]);   // no signal cells
  });

  test("`let` + reads: the deps are the initializer's `@` reads (ruling S475 item 1)", () => {
    const r = compile(APP(PEND));
    const [rq] = requestsOf(r.core);
    expect(rq.deps.length).toBe(1);
    const prog = r.core.decls.find((d) => d.sym.id === r.core.program.id);
    expect(prog.fields[rq.deps[0].idx].sym.hint).toBe("userId");
    expect(prog.fields[rq.target.idx].sym.hint).toBe("who");
    expect(check(r.core)).toEqual([]);
  });

  test("locked + no reads loads once on mount (ruling S475 item 1) — compiles, no deps", () => {
    const r = compile(APP(`<who:(not to string)=(loadName(1) !{ _ :> not })/>`));
    const [rq] = requestsOf(r.core);
    expect(rq.deps).toEqual([]);
    expect(rq.state).toBe(null);
    expect(check(r.core)).toEqual([]);
  });

  test("the printed request carries no `state` and no handle; its load is a READ (§6.7.7.1, by construction)", () => {
    const r = compile(APP(PEND));
    const js = mods().print.printProgram(r.core, "app.client.js", "scrml-runtime.js").js;
    expect(js).toContain("}, { mount: true, read: true });");
    expect(js).not.toContain("state: {");
    expect(js).not.toMatch(/const \S+ = rt\.requestOn/);
  });

  test("§13.9.1 worked example (§66 port): `<members>: (not to int)` legal; `<total>: int` E-VALUE-SERVER-CALL with the §13.9 fix", () => {
    const src = `<program db="./app.db">
    type Cnt:struct = { n: int }
    function teamCount(team: string) -> int {
        const r: Cnt = ${SQ}\`SELECT count(*) AS n FROM members WHERE team = \${team}\`}.get() !{ _ :> { return 0; } };
        return r.n;
    }
    let <team:string="core"/>
    let <members:(not to int)=(teamCount(@team) !{ _ :> not })/>
    let <total:int=(teamCount(@team) !{ _ :> 0 })/>
    <main><p if=@members>${D}@members}</p></main>
</program>
`;
    const e = errsOf(src);
    expect(e.map((d) => d.code)).toEqual(["E-VALUE-SERVER-CALL"]);
    expect(e[0].message).toContain("the initializer of `@total`");
    // §13.7 S467: "the second fix: "or declare the cell `(not to T)` (§13.9)"" (red on base: unoffered)
    expect(e[0].message).toContain("or declare the cell `(not to T)` (§13.9)");
    expect(codes(src.replace(/    let <total[^\n]*\n/, ""))).toEqual([]);
  });

  test("the second fix is offered only for a cell initializer — not a derived formula (§13.7)", () => {
    const src = APP(`<who:string=(loadName(@userId) !{ _ :> "?" })/>`).replace("if=@who", "").replace(/ *<p id="wait" else>loading<\/p>\n/, "");
    const e = errsOf(src);
    expect(e.map((d) => d.code)).toEqual(["E-VALUE-SERVER-CALL"]);
    expect(e[0].message).toContain("the formula of derived `@who`");
    expect(e[0].message).not.toContain("(§13.9)");
  });

  test("§13.9.4 worked example (§66 port): a `<select bind:value>` drives the dependency", () => {
    const src = `<program db="./app.db">
    type Cnt:struct = { n: int }
    function teamCount(team: string) -> int {
        const r: Cnt = ${SQ}\`SELECT count(*) AS n FROM members WHERE team = \${team}\`}.get() !{ _ :> { return 0; } };
        return r.n;
    }
    let <team:string="core"/>
    let <members:(not to int)=(teamCount(@team) !{ _ :> not })/>
    <main>
        <select bind:value=@team><option>core</option><option>infra</option></select>
        <p if=@members>Members: ${D}@members}</p>
        <p else>Loading…</p>
    </main>
</program>
`;
    const r = compile(src);
    expect(check(r.core)).toEqual([]);
  });

  test("`let` on a `(not to S[…])` pending tape is allowed (ruling S475 item 1; was E-GRANT-LET-ON-SEQUENCE)", () => {
    const src = `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <q:int=1/>
    function load(n: int) -> User[] {
        const rs: User[] = ${SQ}\`SELECT id, name FROM users WHERE id >= \${n}\`}.all() !{ _ :> { return []; } };
        return rs;
    }
    let <users:(not to User[])=(load(@q) !{ _ :> not })/>
    <main><div if=@users><each in=@users><p>${D}@.name}</p></each></div></main>
</program>
`;
    expect(codes(src)).toEqual([]);
    // a plain `let` `(not to S[…])` cell (no waiting initializer) keeps the rule
    expect(codes(src.replace("(load(@q) !{ _ :> not })", "not"))).toContain("E-GRANT-LET-ON-SEQUENCE");
  });
});

// §66 port of the §13.9.3 worked example. `isTaken` stands in the program's file: a `?{}` in an
// imported module (a module-with-db-context, §44.7.1) is refused by the bootstrap.
describe("§13.9.3 — reads before discrimination; render positions keep E-VALUE-SERVER-CALL", () => {
  const app = (body) => [
    { path: "app.scrml", src: `<program db="./app.db">
    type Hit:struct = { one: int }
    function isTaken(name: string) -> bool {
        const r: Hit = ${SQ}\`SELECT 1 AS one FROM users WHERE name = \${name}\`}.get() !{ _ :> { return false; } };
        return r is given;
    }
    let <name:string=""/>
    let <taken:(not to bool)=(isTaken(@name) !{ _ :> not })/>
    <main>
${body}    </main>
</program>
` },
  ];

  test("discriminated reads are legal (`if=(@taken is given && !@taken)` / `else`)", () => {
    const src = app(`        <p if=(@taken is given && !@taken)>available</p>\n        <p else>checking…</p>\n`);
    expect(codes(src)).toEqual([]);
  });

  test("a read before discrimination is E-TYPE-001, and says the value may still be in flight, naming the load", () => {
    const e = errsOf(app(`        <p>${D}@taken ? "taken" : "free"}</p>\n`));
    expect(e.map((d) => d.code)).toEqual(["E-TYPE-001"]);
    expect(e[0].message).toContain("may still be in flight");
    expect(e[0].message).toContain("`isTaken(…)` in its declaration");
  });

  test("a waiting value directly in a render position stays E-VALUE-SERVER-CALL (F3)", () => {
    expect(codes(app(`        <p if=(isTaken(@name))>taken</p>\n`))).toContain("E-VALUE-SERVER-CALL");   // §66 spells `if=${…}` `if=(…)`
  });
});

describe("§13.9.5 — failure is handled at the declaration", () => {
  test("an unhandled failable initializer is E-ERROR-002 (§13.9.5 worked example `<members2>`)", () => {
    const e = errsOf(APP(`let <who:(not to string)=(loadName(@userId))/>`));
    expect(e.map((d) => d.code)).toEqual(["E-ERROR-002"]);
    expect(e[0].message).toContain("the initializer of the pending cell `@who` is failable and not handled");
  });

  test("an arm that yields the declared type is legal; one that yields another type is refused", () => {
    expect(codes(APP(`let <who:(not to string)=(loadName(@userId) !{ _ :> "?" })/>`))).toEqual([]);
    expect(codes(APP(`let <who:(not to string)=(loadName(@userId) !{ _ :> 7 })/>`))).toEqual(["E-TYPE-031"]);
  });

});

describe("refusals kept (each named)", () => {
  // r1 F1 (red on ac5fe6d1b: compiled clean, deps 0 — the load never re-ran): a call of a CLIENT
  // function may read cells the initializer does not show (`cur()` reads `@userId`), so a locked
  // initializer calling one is derived (ruling S475 item 1 "locked + reads is derived and stays refused").
  test("locked + a client-function call is DERIVED: E-VALUE-SERVER-CALL (r1 F1 — the call may read cells)", () => {
    const src = APP(`<who:(not to string)=(cur())/>`).replace(LOAD, LOAD + CUR);
    const c = codes(src);
    expect(c).toContain("E-VALUE-SERVER-CALL");
    expect(errsOf(src).find((d) => d.code === "E-VALUE-SERVER-CALL").message).toContain("the formula of derived `@who`");
  });

  // s477-boot-pending-rest (g-boot-pending-cell-opaque-call-s475) — §13.9.1 S475: the initializer
  // "reads cells" when it reads a cell directly or through a called function (§13.9.2's deps). Red on
  // base 709f53429: every `let` case below was E-BOOTSTRAP-UNSUPPORTED ("cannot infer the load's
  // dependencies"), and the locked cell-free helper was counted derived (E-VALUE-SERVER-CALL).
  test("`let` + a client function that reads a cell: its reads are the load's dependencies (s477)", () => {
    const r = compile(APP(`let <who:(not to string)=(cur())/>`).replace(LOAD, LOAD + CUR));
    expect(check(r.core)).toEqual([]);
    const [rq] = requestsOf(r.core);
    expect(rq.deps.length).toBe(1);                 // @userId, read inside cur()
  });

  test("a cell-free client helper in the initializer: `let` and locked both load once (s477)", () => {
    for (const decl of [`let <who:(not to string)=(loadName(one()) !{ _ :> not })/>`, `<who:(not to string)=(loadName(one()) !{ _ :> not })/>`]) {
      const r = compile(APP(decl).replace(LOAD, LOAD + CUR));
      expect(check(r.core)).toEqual([]);
      const [rq] = requestsOf(r.core);
      expect(rq.deps).toEqual([]);
    }
  });

  test("a called function whose read cannot be a dependency (a derived cell) is refused by name (INTERIM)", () => {
    const CURD = `    function curD() -> string { const n = loadName(@dbl) !{ _ :> "?" }; return n; }
`;
    const src = (decl) => APP(decl).replace(LOAD, LOAD + CURD).replace("    let <show", "    <dbl:int=(@userId * 2)/>\n    let <show");
    const e = errsOf(src(`let <who:(not to string)=(curD())/>`));
    expect(e.map((d) => d.code)).toEqual([U]);
    expect(e[0].message).toContain("cannot infer the load's dependencies");
    expect(e[0].message).toContain("reads the derived cell `@dbl`");
    expect(e[0].message).toContain("g-boot-pending-cell-opaque-call-s475");
    // locked: it reads a cell through the call, so it is derived (ruling S475 item 1, PERMANENT)
    expect(codes(src(`<who:(not to string)=(curD())/>`))).toContain("E-VALUE-SERVER-CALL");
  });

  test("a file-scope (imported module) `(not to T)` cell with a waiting initializer is refused by name (r1 L1, INTERIM)", () => {
    const mod = `type User:struct = { id: int, name: string }
${LOAD}export let <who:(not to string)=(loadName(1) !{ _ :> not })/>
`;
    const e = errsOf([{ path: "m.scrml", src: mod }, { path: "app.scrml", src: `${D} import { who } from "./m.scrml"; }
<program db="./app.db">
    <main><p if=@who>${D}@who}</p></main>
</program>
` }]);
    expect(e.some((d) => d.code === "E-VALUE-SERVER-CALL")).toBe(false);
    expect(e.some((d) => d.code === U && d.message.includes("g-boot-pending-cell-outside-program-s475"))).toBe(true);
  });

  test("locked + reads is DERIVED: E-VALUE-SERVER-CALL (ruling S475 items 1 and 7, PERMANENT)", () => {
    const c = codes(APP(`<who:(not to string)=(loadName(@userId) !{ _ :> not })/>`));
    expect(c).toContain("E-VALUE-SERVER-CALL");
    const m = errsOf(APP(`<who:(not to string)=(loadName(@userId) !{ _ :> not })/>`)).find((d) => d.code === U);
    expect(m.message).toContain("a derived cell cannot carry a lifecycle type");
  });

  // r2 N1 (red on b093477e8: both compiled clean as pending cells, deps 1 — exprReads walked a
  // handling form's subject and EXPRESSION arms only, never its BLOCK arms): a cell read inside a
  // block arm is a read (ruling S475 item 1 "locked + reads is derived and stays refused").
  test("locked + a cell read in a BLOCK arm is DERIVED: E-VALUE-SERVER-CALL (r2 N1, both spellings)", () => {
    const nm = (decl) => APP(decl).replace("    let <show", "    let <nm:string=\"n\"/>\n    let <show");
    for (const decl of [
      `<who:(not to string)=(loadName(1) !{ _ :> { const q: string = @nm; lift q; } })/>`,
      `<who:(not to string)=(loadName(1) !{ .Transport(t) :> { lift @nm; } })/>`,
    ]) {
      const e = errsOf(nm(decl));
      expect(e.map((d) => d.code)).toContain("E-VALUE-SERVER-CALL");
      expect(e.find((d) => d.code === "E-VALUE-SERVER-CALL").message).toContain("the formula of derived `@who`");
      expect(e.find((d) => d.code === U).message).toContain("reads the cell `@nm`");
    }
  });

  test("`let` + a cell read in a BLOCK arm: the read is a dependency, so the load re-runs on it (r2 N1)", () => {
    const src = APP(`let <who:(not to string)=(loadName(@userId) !{ _ :> { const q: string = @nm; lift q; } })/>`)
      .replace("    let <show", "    let <nm:string=\"n\"/>\n    let <show");
    const r = fe(src);
    expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    const [rq] = requestsOf(r.core);
    expect(rq.deps.map((d) => d.hint ?? d.sym?.hint ?? JSON.stringify(d)).length).toBe(2);
  });

  // r3 F3 (red on ec2850635, probe p12 for_counted_init: locked compiled mount-once, `let` had deps 1 —
  // stmtKidBlocks gave a `for` its body only, so blocksReads / calledSymsBlock never saw a counted
  // head's `init`): `for (let i = @cnt; …)` in a block arm reads `@cnt`.
  const FORINIT = `{ let t: int = 0; for (let i = @cnt; i < 3; i = i + 1) { t = t + i; } lift "x"; }`;
  const withCnt = (decl) => APP(decl).replace("    let <show", "    let <cnt:int=0/>\n    let <show");
  test("locked + a cell read in a counted `for`'s init (in a block arm) is DERIVED (r3 F3)", () => {
    const e = errsOf(withCnt(`<who:(not to string)=(loadName(1) !{ _ :> ${FORINIT} })/>`));
    expect(e.map((d) => d.code)).toContain("E-VALUE-SERVER-CALL");
    expect(e.find((d) => d.code === U).message).toContain("reads the cell `@cnt`");
  });

  test("`let` + a cell read in a counted `for`'s init: the read is a dependency (r3 F3)", () => {
    const r = fe(withCnt(`let <who:(not to string)=(loadName(@userId) !{ _ :> ${FORINIT} })/>`));
    expect(r.diags.filter((d) => d.severity === "Error")).toEqual([]);
    const [rq] = requestsOf(r.core);
    expect(rq.deps.length).toBe(2);
  });

  test("E-DERIVED-WRITE names the reads and the calls — never \"reads (), ()\" (r2 cosmetic)", () => {
    // the reviewer's case: a `(not to T)` cell made derived by its call, then written. s477: the
    // call must READ a cell to make it derived (`cur()` reads `@userId`); the reviewer's cell-free
    // `loadName(one())` is now a load-once pending cell (g-boot-pending-cell-opaque-call-s475)
    const src = APP(`<who:(not to string)=(cur())/>`).replace(LOAD, LOAD + CUR)
      .replace(`onclick={ @userId = 2; }`, `onclick={ @who = "z"; }`);
    const m = errsOf(src).find((d) => d.code === "E-DERIVED-WRITE");
    expect(m.message).not.toContain("reads ()");
    expect(m.message).toContain("calls `cur()`");
    const src2 = `<program>
    let <a:int=1/>
    function f(x: int) -> int { return x; }
    <b:int=(f(@a) + f(2))/>
    <main><button onclick={ @b = 3; }>x</button><p>${D}@b}</p></main>
</program>
`;
    const m2 = errsOf(src2).find((d) => d.code === "E-DERIVED-WRITE");
    expect(m2.message).toContain("initializer reads `@a` and calls `f()`");
    expect(m2.message).toContain("no longer follows `@a`");
    expect(m2.message).not.toContain("(), ()");
  });

  test("a `?{}` written in the initializer is refused by name (INTERIM)", () => {
    const e = errsOf(APP(`let <who:(not to User)=(${SQ}\`SELECT id, name FROM users WHERE id = \${@userId}\`}.get() !{ _ :> not })/>`));
    expect(e.some((d) => d.code === U && d.message.includes("whose load is a `" + SQ + "}` written in its declaration"))).toBe(true);
  });

  test("an author `<request>` that also loads the pending cell is refused (one request per target)", () => {
    const src = APP(PEND).replace("    <main>", `    <request id="again">${D} @who = loadName(@userId); }</request>\n    <main>`);
    expect(codes(src)).toContain(U);
  });
});

describe("writes — the settle is the compiler's; author writes stay governed (rulings S475 items 2 and 3)", () => {
  // r1 F2 (flipped; red on ac5fe6d1b: E-WRITE-NOT-GRANTED) — §13.9.4 ¶2 "An action-position write of a
  // waiting value into a pending cell … is awaited at its suspension point (§13.8 (i)) and lands when the
  // value arrives" — the cell's own handled load (ruling S475 item 2; §66.11.6 rule 3, #1793).
  test("an author's handled waiting write into a pending cell is admitted (§13.9.4 ¶2), its value still typed", () => {
    const w = (h) => APP(PEND).replace(`onclick={ @userId = 2; }`, `onclick={ ${h} }`);
    expect(codes(w(`@who = loadName(2) !{ _ :> not };`))).toEqual([]);
    expect(codes(w(`@who = loadName(2) !{ _ :> "?" };`))).toEqual([]);
    expect(codes(w(`@who = loadName(2) !{ _ :> 7 };`))).toEqual(["E-TYPE-031"]);
  });

  test("a bare `not`, or another value that may be `not`, is still refused (item 2: only the own handled load)", () => {
    const w = (h) => APP(PEND).replace(`onclick={ @userId = 2; }`, `onclick={ ${h} }`).replace("    let <show", "    let <alt:string | not=not/>\n    let <show");
    expect(codes(w(`@who = not;`))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(w(`@who = @alt;`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("a LOCKED pending cell may be rewritten `T → T′` (item 3: it reloads); a plain locked lifecycle may not", () => {
    const w = (decl) => APP(decl).replace(`onclick={ @userId = 2; }`, `onclick={ if (@who is given) { @who = "z"; } }`);
    expect(codes(w(`<who:(not to string)=(loadName(1) !{ _ :> not })/>`))).toEqual([]);
    expect(codes(w(`<who:(not to string)=not/>`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });
});

describe("run time — the request machine, through the server artifact (slice-m4 server-artifact-harness)", () => {
  test("loads on mount: `not` (the else arm) until the load settles, then the value", async () => {
    const r = compile(APP(PEND));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, "pend-mount-" + k++);
    await settle(5);
    expect(held.length).toBe(1);                     // the mount load
    expect(cells(rt).who).toBe(null);
    expect(waiting()).toBe(true);
    await held[0].go();
    await settle();
    expect(cells(rt).who).toBe("a");
    expect(shown()).toBe("a");
  });

  test("re-runs on a dependency change, and keeps the stale value while reloading (§13.9.4)", async () => {
    const r = compile(APP(PEND));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, "pend-rerun-" + k++);
    await settle(5);
    await held[0].go();
    await settle();
    expect(shown()).toBe("a");
    click(document.querySelector("#u2"));
    await settle(5);
    expect(held.length).toBe(2);                     // the re-run
    expect(cells(rt).who).toBe("a");                 // stale while reloading — never back to `not`
    expect(shown()).toBe("a");
    await held[1].go();
    await settle();
    expect(shown()).toBe("b");
  });

  test("a locked pending cell with no reads loads once on mount and never again", async () => {
    const r = compile(APP(`<who:(not to string)=(loadName(3) !{ _ :> not })/>`));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = heldTransport(srv);
    await loadProgram(r.core, "pend-once-" + k++);
    await settle(5);
    await held[0].go();
    await settle();
    expect(shown()).toBe("c");
    click(document.querySelector("#u2"));
    await settle(5);
    expect(held.length).toBe(1);
  });

  test("a failed load runs the declaration's arm: `not` returns the cell to its pre-state (§13.9.5)", async () => {
    const r = compile(APP(PEND));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, "pend-fail-" + k++);
    const reported = [];
    const prev = rt.setHostErrorReporter((e) => reported.push(e));
    try {
      await settle(5);
      await held[0].go();
      await settle();
      expect(shown()).toBe("a");
      click(document.querySelector("#u2"));
      await settle(5);
      held[1].fail();                                 // the wire fails: `.Transport` → the `_ :> not` arm
      await settle();
      expect(cells(rt).who).toBe(null);
      expect(waiting()).toBe(true);
      expect(reported).toEqual([]);
    } finally {
      rt.setHostErrorReporter(prev);
    }
  });

  test("an author's handled waiting write is awaited and lands; the cell keeps its value meanwhile (§13.9.4 ¶2, r1 F2)", async () => {
    const r = compile(APP(PEND).replace(`onclick={ @userId = 2; }`, `onclick={ @who = loadName(3) !{ _ :> not }; }`));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, "pend-write-" + k++);
    await settle(5);
    await held[0].go();
    await settle();
    expect(shown()).toBe("a");
    click(document.querySelector("#u2"));
    await settle(5);
    expect(held.length).toBe(2);                     // the handler's call
    expect(cells(rt).who).toBe("a");                 // keeps its current value — never back to `not`
    await held[1].go();
    await settle();
    expect(cells(rt).who).toBe("c");
    expect(shown()).toBe("c");
  });

  test("a failed author waiting write runs its arm: `not` returns the cell to its pre-state (§13.9.5)", async () => {
    const r = compile(APP(PEND).replace(`onclick={ @userId = 2; }`, `onclick={ @who = loadName(3) !{ _ :> not }; }`));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, "pend-write-fail-" + k++);
    await settle(5);
    await held[0].go();
    await settle();
    click(document.querySelector("#u2"));
    await settle(5);
    held[1].fail();
    await settle();
    expect(cells(rt).who).toBe(null);
    expect(waiting()).toBe(true);
  });

  test("a failed load with a value arm settles that value", async () => {
    const r = compile(APP(`let <who:(not to string)=(loadName(@userId) !{ _ :> "offline" })/>`));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, "pend-fail-val-" + k++);
    await settle(5);
    held[0].fail();
    await settle();
    expect(cells(rt).who).toBe("offline");
    expect(shown()).toBe("offline");
  });

  test("a superseded load's result is dropped, and — a READ — its transport aborted (§6.7.7.1, #1787)", async () => {
    const r = compile(APP(PEND));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, "pend-supersede-" + k++);
    await settle(5);
    await held[0].go();
    await settle();
    click(document.querySelector("#u2"));            // run 2
    await settle(5);
    click(document.querySelector("#u3"));            // run 3 supersedes run 2
    await settle(5);
    expect(held.length).toBe(3);
    expect(held[1].aborted).toBe(true);
    expect(held[2].aborted).toBe(false);
    expect(cells(rt).who).toBe("a");
    await held[2].go();
    await settle();
    expect(shown()).toBe("c");
  });

  // N2 (r3 — start stamps compared when a write LANDS): the most recently STARTED write or load of a
  // pending cell wins (PA reading ⚑, recorded in the §13.9.4 coverage row). A load's run and every
  // wait take a start stamp; a continuation's writes carry its wait's stamp (ambient, so a write from a
  // Join body, a helper function or a loop carries it too); a write with no wait starts as it lands.
  // A landing write older than the cell's last load start or last landed write is discarded (that
  // write only); a winning write supersedes the load in flight — result discarded, a READ's transport
  // aborted. Nothing is aborted before a write lands. Red on b093477e8 (probe p9): R1 "b", R2 "c",
  // R3 "a", no transport aborted. Red on ec2850635 (r2's claim at call start, probe p11): A "a" (the
  // reload aborted though no write followed), A' `not` forever, B / F "c" (an unclaimed write aborted a
  // reload that started after it).
  const RACE = (decl = PEND, extra = "", btn = `@who = loadName(3) !{ _ :> not };`) => APP(decl).replace(LOAD, LOAD + extra)
    .replace(`<button id="hide" onclick={ @show = false; }>hide</button>`,
      `<button id="w" onclick={ ${btn} }>w</button>\n        <button id="w1" onclick={ @who = loadName(1) !{ _ :> not }; }>w1</button>\n        <button id="z" onclick={ if (@who is given) { @who = "z"; } }>z</button>\n        <button id="za" onclick={ if (@who is given) { @who = "a"; } }>za</button>`);
  async function race(name, extra, btn) {
    const r = compile(RACE(PEND, extra, btn));
    expect(errsOf(RACE(PEND, extra, btn))).toEqual([]);
    expect(check(r.core)).toEqual([]);
    const js = printCore(r.core, "race").js;
    expect(js).not.toContain("suspendClaim");         // r3: no claim at a call's start
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, name + k++);
    await settle(5);
    return { rt, held };
  }

  test("R1: the own reload in flight, then an author write — the write lands and aborts the reload; its value stays", async () => {
    const { rt, held } = await race("pend-r1-");
    await held[0].go();
    await settle();
    click(document.querySelector("#u2"));            // the own reload (READ) starts
    await settle(5);
    click(document.querySelector("#w"));             // the author write starts (after the reload)
    await settle(5);
    expect(held.length).toBe(3);
    expect(held[1].aborted).toBe(false);             // r3: nothing is aborted before a write lands
    expect(cells(rt).who).toBe("a");                 // keeps its value meanwhile (§13.9.4)
    await held[2].go();                              // the author write lands: newer than the reload
    await settle();
    expect(held[1].aborted).toBe(true);
    expect(cells(rt).who).toBe("c");
    expect(shown()).toBe("c");
  });

  test("R2: an author write in flight, then a dependency change — the reload wins, the older write is discarded", async () => {
    const { rt, held } = await race("pend-r2-");
    await held[0].go();
    await settle();
    click(document.querySelector("#w"));             // the author write starts
    await settle(5);
    click(document.querySelector("#u2"));            // the reload starts after it: the newest
    await settle(5);
    expect(held.length).toBe(3);
    await held[2].go();                              // the reload lands
    await settle();
    expect(cells(rt).who).toBe("b");
    await held[1].go();                              // the older author write lands: discarded
    await settle();
    expect(cells(rt).who).toBe("b");                 // agrees with its dependency (`@userId` = 2)
    expect(shown()).toBe("b");
  });

  test("R3: an author write during the FIRST load — the write lands and aborts the first load", async () => {
    const { rt, held } = await race("pend-r3-");
    click(document.querySelector("#w"));
    await settle(5);
    expect(held.length).toBe(2);
    expect(held[0].aborted).toBe(false);
    await held[1].go();
    await settle();
    expect(held[0].aborted).toBe(true);
    expect(cells(rt).who).toBe("c");
    expect(shown()).toBe("c");
  });

  test("a plain write supersedes the in-flight load the same way (it starts and lands at once)", async () => {
    const { rt, held } = await race("pend-r4-");
    await held[0].go();
    await settle();
    click(document.querySelector("#u2"));            // the reload starts
    await settle(5);
    click(document.querySelector("#z"));             // `@who = "z"`: newer than the reload
    await settle(5);
    expect(held[1].aborted).toBe(true);
    expect(cells(rt).who).toBe("z");
    click(document.querySelector("#u3"));            // a later dependency change reloads as before
    await settle(5);
    await held[2].go();
    await settle();
    expect(cells(rt).who).toBe("c");
  });

  // r4 F-A (probe p20 N2, red on a154c6c57: "b"): a no-op write is still the newest START — it only
  // skips the notify. It supersedes the older reload, which must not land over it (as test C: a no-op
  // write already beat older WRITES).
  test("a no-op write (the value the cell holds) is still the newest start: it supersedes the in-flight load (r4 F-A)", async () => {
    const { rt, held } = await race("pend-noop-");
    await held[0].go();
    await settle();
    click(document.querySelector("#u2"));            // the reload starts
    await settle(5);
    click(document.querySelector("#za"));            // `@who = "a"` — what it already holds, newer than the reload
    await settle(5);
    expect(held[1].aborted).toBe(true);
    expect(held.length).toBe(2);
    expect(cells(rt)).toEqual({ userId: 2, show: true, who: "a" });
    expect(shown()).toBe("a");
  });

  // p11 A / A′ (red on ec2850635): a wait whose continuation writes NOTHING leaves the load alone.
  const NOWRITE = `const n: string = loadName(3) !{ _ :> "?" }; if (n == "nope") { @who = n; }`;
  test("A: a waiting handler whose write is not taken leaves the in-flight reload alone (red r2: stale \"a\")", async () => {
    const { rt, held } = await race("pend-a-", "", NOWRITE);
    await held[0].go();
    await settle();
    click(document.querySelector("#u2"));            // the reload starts
    await settle(5);
    click(document.querySelector("#w"));             // the handler's call starts — no write follows
    await settle(5);
    expect(held.length).toBe(3);
    await held[2].go();
    await settle();
    expect(held[1].aborted).toBe(false);
    await held[1].go();
    await settle();
    expect(cells(rt)).toEqual({ userId: 2, show: true, who: "b" });
    expect(shown()).toBe("b");
  });

  test("A′: the same during the FIRST load — the load lands (red r2: `not`, loading forever)", async () => {
    const { rt, held } = await race("pend-a1-", "", NOWRITE);
    click(document.querySelector("#w"));
    await settle(5);
    expect(held.length).toBe(2);
    await held[1].go();
    await settle();
    expect(held[0].aborted).toBe(false);
    await held[0].go();
    await settle();
    expect(cells(rt).who).toBe("a");
    expect(shown()).toBe("a");
  });

  // p11 B / F (red on ec2850635): a write the r2 claim analysis could not see — after a Join, through
  // a helper function — carries its continuation's start stamp, so a reload that started after the
  // call still wins.
  test("B: a write after a Join, older than a reload, is discarded; the reload is not aborted (red r2: \"c\")", async () => {
    const { rt, held } = await race("pend-b-", "",
      `let n: string = "x"; if (@userId > 0) { n = loadName(3) !{ _ :> "?" }; } @who = n;`);
    await held[0].go();
    await settle();
    click(document.querySelector("#w"));             // the author call starts
    await settle(5);
    click(document.querySelector("#u2"));            // the reload starts after it
    await settle(5);
    expect(held.length).toBe(3);
    await held[1].go();                              // the older author write lands first: discarded
    await settle();
    expect(cells(rt).who).toBe("a");
    expect(held[2].aborted).toBe(false);
    await held[2].go();
    await settle();
    expect(cells(rt).who).toBe("b");
    expect(shown()).toBe("b");
  });

  test("F: a write through a synchronous helper function carries the call's stamp the same way (red r2: \"c\")", async () => {
    const { rt, held } = await race("pend-f-", `    function setWho(v: string) { @who = v; }\n`,
      `const n: string = loadName(3) !{ _ :> "?" }; setWho(n);`);
    await held[0].go();
    await settle();
    click(document.querySelector("#w"));
    await settle(5);
    click(document.querySelector("#u2"));
    await settle(5);
    await held[1].go();
    await settle();
    expect(cells(rt).who).toBe("a");
    expect(held[2].aborted).toBe(false);
    await held[2].go();
    await settle();
    expect(cells(rt).who).toBe("b");
  });

  test("F′: the helper's write, newer than the reload, wins and aborts it", async () => {
    const { rt, held } = await race("pend-f1-", `    function setWho(v: string) { @who = v; }\n`,
      `const n: string = loadName(3) !{ _ :> "?" }; setWho(n);`);
    await held[0].go();
    await settle();
    click(document.querySelector("#u2"));            // the reload starts
    await settle(5);
    click(document.querySelector("#w"));             // the author call starts after it
    await settle(5);
    await held[2].go();
    await settle();
    expect(held[1].aborted).toBe(true);
    expect(cells(rt).who).toBe("c");
  });

  test("C: two author writes landing in reverse order — the later-started one stays", async () => {
    const { rt, held } = await race("pend-c-");
    await held[0].go();
    await settle();
    click(document.querySelector("#w"));             // loadName(3) starts
    await settle(5);
    click(document.querySelector("#w1"));            // loadName(1) starts after it
    await settle(5);
    await held[2].go();                              // the newer lands — "a" (a no-op, still the newest)
    await settle();
    await held[1].go();                              // the older lands: discarded
    await settle();
    expect(cells(rt).who).toBe("a");
    expect(shown()).toBe("a");
  });

  // r4 D (PA reading ⚑, recorded in the §13.9.4 coverage row): a WINNING author write that lands `not`
  // re-runs the cell's load. §13.9.2: "A reset of a pending cell (§6.8) is the request's re-run — never
  // … back to `not`"; §13.9.5: "`not` … returns the cell to its pre-state" — and a pending cell's
  // pre-state is `not` with its load running. The older load is superseded; a fresh load starts with its
  // own newer stamp. Red on a154c6c57: `not` with nothing in flight (loading forever) — and, through the
  // no-op check, whether the older load survived depended on what the cell held (p20 N1 vs N1b).
  test("D: a newer author write that fails to `not` wins over the reload — and re-runs the load (r4)", async () => {
    const { rt, held } = await race("pend-d-");
    await held[0].go();
    await settle();
    click(document.querySelector("#u2"));            // the reload starts
    await settle(5);
    click(document.querySelector("#w"));             // the author write starts after it
    await settle(5);
    held[2].fail();                                  // the author call fails: its arm yields `not`
    await settle();
    expect(held[1].aborted).toBe(true);              // the older reload is superseded
    expect(cells(rt).who).toBe(null);
    expect(waiting()).toBe(true);
    expect(held.length).toBe(4);                     // ... and the load re-runs (its pre-state)
    expect(held[3].aborted).toBe(false);
    await held[3].go();
    await settle();
    expect(cells(rt).who).toBe("b");                 // the fresh load lands (`@userId` is 2)
    expect(shown()).toBe("b");
    expect(held.length).toBe(4);
  });

  // p20 N1 (red on a154c6c57: the first load survived the `not` — the no-op check returned first).
  test("N1: during the FIRST load, a newer author write failing to `not` re-runs the load the same way (r4)", async () => {
    const { rt, held } = await race("pend-n1-");
    click(document.querySelector("#w"));             // the author write starts after the first load
    await settle(5);
    held[1].fail();                                  // `not` — what the cell already holds
    await settle();
    expect(held[0].aborted).toBe(true);
    expect(held.length).toBe(3);                     // a fresh load runs
    expect(waiting()).toBe(true);
    await held[2].go();
    await settle();
    expect(cells(rt).who).toBe("a");
    expect(shown()).toBe("a");
  });

  // p20 N1b (red on a154c6c57: `not`, nothing in flight, loading forever).
  test("N1b: during a reload, the same — the cell loads again and lands the load's value (r4)", async () => {
    const { rt, held } = await race("pend-n1b-");
    await held[0].go();
    await settle();
    click(document.querySelector("#u2"));
    await settle(5);
    click(document.querySelector("#w"));
    await settle(5);
    held[2].fail();
    await settle();
    expect(held[1].aborted).toBe(true);
    expect(held.length).toBe(4);
    expect(waiting()).toBe(true);
    await held[3].go();
    await settle();
    expect(cells(rt)).toEqual({ userId: 2, show: true, who: "b" });
  });

  // r4 D no-loop: the load's OWN settle takes the `settling` bypass, so a load that fails to `not`
  // lands `not` and never re-triggers itself (first load and reload alike).
  test("no loop: the load's own failure to `not` does not re-run the load (r4 D)", async () => {
    const { rt, held } = await race("pend-noloop-");
    held[0].fail();                                  // the first load fails: its arm yields `not`
    await settle();
    expect(held.length).toBe(1);
    expect(waiting()).toBe(true);
    click(document.querySelector("#u2"));            // a dependency change still reloads
    await settle(5);
    expect(held.length).toBe(2);
    held[1].fail();
    await settle();
    expect(held.length).toBe(2);                     // no self-triggered reload
    expect(cells(rt).who).toBe(null);
    click(document.querySelector("#u3"));
    await settle(5);
    expect(held.length).toBe(3);
    await held[2].go();
    await settle();
    expect(cells(rt).who).toBe("c");
  });

  test("a pending `(not to S[…])` tape loads and re-renders its rows", async () => {
    const src = `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <q:int=2/>
    function load(n: int) -> User[] {
        const rs: User[] = ${SQ}\`SELECT id, name FROM users WHERE id >= \${n} ORDER BY id\`}.all() !{ _ :> { return []; } };
        return rs;
    }
    let <users:(not to User[])=(load(@q) !{ _ :> not })/>
    <main>
        <button id="all" onclick={ @q = 1; }>all</button>
        <div if=@users><each in=@users><p class="u">${D}@.name}</p></each></div>
    </main>
</program>
`;
    const r = compile(src);
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    globalThis.fetch = bridge(srv);
    await loadProgram(r.core, "pend-tape-" + k++);
    await settle();
    const names = () => [...document.querySelectorAll("p.u")].map((p) => p.textContent);
    expect(names()).toEqual(["b", "c"]);
    click(document.querySelector("#all"));
    await settle();
    expect(names()).toEqual(["a", "b", "c"]);
  });
});

// Merge of origin/main (#1794 s475-boot-request-followups, #1797 s475-boot-transport-every-client-bang)
// into this lane. The pending cell's load IS a `<request>` (§13.9.2 "§6.7.7.1 READ / WRITE
// classification and abort-reads / discard-writes … apply to a pending cell by construction"), so:
//   #1794 — a server call that reaches NO SQL is READ (S475 ruling: "the #1787 '≥1 SELECT' clause …
//     is dropped — SPEC §6.7.7.1 rule 1 makes it READ"), so a no-SQL pending load is now abortable —
//     superseded by a dependency change or by a newer author write landing (r3 start stamps), its
//     transport is aborted (before the merge it was WRITE: run to completion, discarded). C-R2 re-checks it clean.
//   #1797 — every client `!` function that `?`-propagates a server call is a transport carrier
//     (ruling S475 item 4): an author's waiting write of one into a pending cell (§13.9.4 ¶2) must
//     cover `E + Transport` (or `_`), and a wire failure reaches that arm.
// C-R2's per-call counting (#1794) walks a client function's calls; a pending load is a direct server
// call (a client call in the initializer is refused, g-boot-pending-cell-opaque-call-s475), so it is
// checked by C-R2's direct branch (readServerWalk) — pinned by the forced-READ case below.
const NOSQL = `    server function loadName(id: int) -> string {
        if (id == 1) return "a";
        if (id == 2) return "b";
        return "c";
    }
`;
const BANG = `    type E:enum = { Bad }
    server function s(id: int)! E {
        if (id < 0) fail E.Bad;
        if (id == 1) return "a";
        return "c";
    }
    function pick(id: int)! E {
        const v: string = s(id)?;
        return v;
    }
`;
describe("merge with #1794 / #1797 — a pending cell's load under the new READ class and transport carriers", () => {
  test("a no-SQL pending load is READ (#1794), prints `read: true`, and C-R2 re-checks it clean", () => {
    const r = compile(APP(PEND).replace(LOAD, NOSQL));
    const [rq] = requestsOf(r.core);
    expect(rq.cls.variant ?? rq.cls).toBe("ReqRead");
    expect(check(r.core)).toEqual([]);
    const js = mods().print.printProgram(r.core, "app.client.js", "scrml-runtime.js").js;
    expect(js).toContain("}, { mount: true, read: true });");
  });

  test("C-R2 still refuses a pending load forced READ when its server call writes (a locked, mount-once load)", () => {
    const ins = `    function loadName(id: int) -> string {
        ${SQ}\`INSERT INTO users (id, name) VALUES (\${id + 10}, 'x')\`}.run() !{ _ :> { return "?"; } };
        return "w";
    }
`;
    // a writing load with dependencies is refused by name (§6.7.7.3 write-request machine); one that
    // reads no cell loads once on mount — WRITE, so never re-checked until forced READ
    const r = compile(APP(`<who:(not to string)=(loadName(1) !{ _ :> not })/>`).replace(LOAD, ins));
    const [rq] = requestsOf(r.core);
    expect(rq.cls.variant ?? rq.cls).toBe("ReqWrite");
    expect(check(r.core)).toEqual([]);
    rq.cls = "ReqRead";
    expect(check(r.core).join("\n")).toMatch(/C-R2: a READ Request's server call reaches a query that is not provably a SELECT, in `loadName`/);
  });

  test("a superseded no-SQL load's transport is aborted, by a dependency change and by a newer author write landing", async () => {
    const src = APP(PEND).replace(LOAD, NOSQL).replace(`<button id="hide" onclick={ @show = false; }>hide</button>`,
      `<button id="w" onclick={ @who = loadName(3) !{ _ :> not }; }>w</button>`);
    const r = compile(src);
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, "pend-nosql-" + k++);
    await settle(5);
    await held[0].go();
    await settle();
    expect(shown()).toBe("a");
    click(document.querySelector("#u2"));            // reload 1
    await settle(5);
    click(document.querySelector("#u3"));            // reload 2 supersedes reload 1
    await settle(5);
    expect(held.length).toBe(3);
    expect(held[1].aborted).toBe(true);              // RED before the merge: a no-SQL load was WRITE
    click(document.querySelector("#w"));             // the author write starts (after reload 2)
    await settle(5);
    expect(held.length).toBe(4);
    expect(held[2].aborted).toBe(false);             // r3: nothing aborted before the write lands
    expect(cells(rt).who).toBe("a");                 // keeps its value meanwhile (§13.9.4)
    await held[3].go();
    await settle();
    expect(held[2].aborted).toBe(true);
    expect(cells(rt).who).toBe("c");
  });

  // r3 cosmetic (red on ec2850635: two diagnostics — the Ue2 "handled failable … only as a statement's
  // whole value" plus "calls `pick()` … but its initializer also calls `pick()`"): ONE clear refusal.
  // s477: the carrier `pick()` reads no cell (its server call reaches no client state), so a pending
  // initializer through it is no longer refused: its deps are the initializer's own `@userId`.
  test("a pending initializer through a client `!` carrier compiles; its deps are the initializer's reads (s477)", () => {
    const src = APP(`let <who:(not to string)=(pick(@userId) !{ _ :> not })/>`).replace(LOAD, LOAD + BANG);
    expect(errsOf(src)).toEqual([]);
    const r = compile(src);
    expect(check(r.core)).toEqual([]);
    expect(requestsOf(r.core)[0].deps.length).toBe(1);
  });

  test("an author waiting write through a client `!` carrier (#1797) must cover `E + Transport`", () => {
    const w = (h) => APP(`let <who:(not to string)=(s(@userId) !{ _ :> not })/>`).replace(LOAD, LOAD + BANG)
      .replace(`onclick={ @userId = 2; }`, `onclick={ ${h} }`);
    expect(codes(w(`@who = pick(3) !{ _ :> not };`))).toEqual([]);
    expect(codes(w(`@who = pick(3) !{ .Bad :> not, .Transport(t) :> "offline" };`))).toEqual([]);
    const e = errsOf(w(`@who = pick(3) !{ .Bad :> not };`));
    expect(e.map((d) => d.code)).toEqual(["E-TYPE-080"]);
    expect(e[0].message).toContain("E + Transport");
  });

  test("a wire failure of that carrier write reaches its `.Transport` arm and lands in the pending cell", async () => {
    const src = APP(`let <who:(not to string)=(s(@userId) !{ _ :> not })/>`).replace(LOAD, LOAD + BANG)
      .replace(`onclick={ @userId = 2; }`, `onclick={ @who = pick(3) !{ .Bad :> not, .Transport(t) :> "offline" }; }`);
    const r = compile(src);
    expect(check(r.core)).toEqual([]);
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, "pend-carrier-" + k++);
    await settle(5);
    await held[0].go();
    await settle();
    expect(shown()).toBe("a");
    click(document.querySelector("#u2"));
    await settle(5);
    expect(held.length).toBe(2);
    held[1].fail();
    await settle();
    expect(cells(rt).who).toBe("offline");
    expect(shown()).toBe("offline");
  });
});

// Merge with #1788 (s475-boot-request-refs, slice S3b): `<#id>` reads and `.refetch()`. A pending cell's
// request has no signals and no id, so `<#id>.loading` / `.data` of an AUTHOR request must index the
// signal cells among the requests WITH signals (lower signalIndex — red before: `4 · k` counted the
// pending cell's request, reading the wrong cell / past the program's fields). A pending cell has no
// `<#id>` (§13.9.2 "The hidden request's controls are not reachable"), so it cannot be refetched.
describe("merge with #1788 — `<#id>` refs beside a pending cell", () => {
  const RH = "<" + "#userReq>";
  const REFS = (pendFirst) => {
    const pend = `    let <who:(not to string)=(loadName(3) !{ _ :> not })/>\n`;
    const req = `    <request id="userReq">${D} @userName = loadName(@userId); }</request>\n`;
    return `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <userId:int=1/>
    let <userName:string=""/>
${LOAD}${pendFirst ? pend + req : req + pend}    <main>
        <button id="u2" onclick={ @userId = 2; }>2</button>
        <button id="again" onclick={ ${RH}.refetch(); }>again</button>
        <p id="loading">${D}${RH}.loading}</p>
        <p id="data" if=(${RH}.data is given)>${D}@userName}</p>
        <p id="who" if=@who>${D}@who}</p>
    </main>
</program>
`;
  };
  for (const pendFirst of [true, false]) {
    test(`an author request's signals read right with a pending cell declared ${pendFirst ? "before" : "after"} it`, async () => {
      const r = compile(REFS(pendFirst));
      expect(errsOf(REFS(pendFirst))).toEqual([]);
      expect(check(r.core)).toEqual([]);
      const { srv } = await serve(r.core, await realDb(DDL, ROWS));
      const held = heldTransport(srv);
      const { rt } = await loadProgram(r.core, "pend-refs-" + k++);
      await settle(5);
      expect(held.length).toBe(2);
      const txt = (s) => (document.querySelector(s) ? document.querySelector(s).textContent : null);
      expect(txt("#loading")).toBe("true");
      for (const h of held) await h.go();
      await settle();
      expect(txt("#loading")).toBe("false");
      expect(txt("#data")).toBe("a");
      expect(txt("#who")).toBe("c");
      expect(cells(rt)["#userReq_data"]).toBe("a");
      click(document.querySelector("#again"));        // refetch the author request only
      await settle(5);
      expect(held.length).toBe(3);
      expect(txt("#loading")).toBe("true");
      await held[2].go();
      await settle();
      expect(txt("#loading")).toBe("false");
    });
  }

  test("a pending cell has no `<#id>`: its declaration name is not a request ref", () => {
    const src = APP(PEND).replace(`<p id="wait" else>loading</p>`, `<p id="wait" else>loading</p>\n        <button onclick={ ${"<" + "#who>"}.refetch(); }>r</button>`);
    const e = errsOf(src);
    expect(e.length).toBeGreaterThan(0);
  });
});

// s477-boot-pending-rest (gap g-boot-pending-cell-reset-unbuilt-s475): §13.9.2 "A reset of a pending
// cell (§6.8) is the request's re-run" · "The compiler SHALL NOT reset the cell by re-running the
// initializer outside the request" · §13.9.4 "the request writes the cell only when a load settles" ·
// §6.8.4 rule 1 "the runtime SHALL perform `reset(@self)`" · §13.9.1 S475 rule 5 "The compiler-written
// load writes are exempt from grant checks". Red on base 709f53429: every program below was
// E-BOOTSTRAP-UNSUPPORTED ("Re-running the hidden request from here is not in the bootstrap yet").
describe("s477 — `reset(@x)` / `reset-on=` on a pending cell re-run its load (§13.9.2)", () => {
  const RESET = (decl = PEND) => APP(decl).replace(`<button id="hide" onclick={ @show = false; }>hide</button>`,
    `<button id="hide" onclick={ @show = false; }>hide</button>\n        <button id="rs" onclick={ reset(@who); }>rs</button>`);

  test("`reset(@who)` compiles clean; the request gets a slot and the reset is a Core Refetch of it", () => {
    const r = compile(RESET());
    expect(check(r.core)).toEqual([]);
    const [rq] = requestsOf(r.core);
    expect(rq.state).toBe(null);                    // still no `<#id>` signals
    expect(rq.handle).not.toBe(null);              // the compiler's own slot
    const js = printCore(r.core, "pend-reset-js").js;
    expect(js).toContain("requestSlot()");
    expect(js).toMatch(/refetch\(/);
    // never the desugared initializer written back (§13.9.2 "SHALL NOT reset the cell by re-running the initializer")
    expect(js).not.toMatch(/who[^\n]*\.set\(null\)/);
  });

  test("a pending cell that is never reset keeps no slot (minimal output)", () => {
    const [rq] = requestsOf(compile(APP(PEND)).core);
    expect(rq.handle).toBe(null);
  });

  test("a LOCKED pending cell may be reset: the load's write is the compiler's (§13.9.1 S475 rule 5)", () => {
    expect(codes(RESET(`<who:(not to string)=(loadName(3) !{ _ :> not })/>`))).toEqual([]);
    // a plain locked lifecycle cell still may not (§66.11.6 — unchanged)
    expect(codes(RESET(`<who:(not to string)=not/>`))).toEqual(["E-WRITE-NOT-GRANTED"]);
  });

  test("`reset-on=` on a pending cell: its entries become the load's dependencies", () => {
    const r = compile(APP(`<who:(not to string)=(loadName(3) !{ _ :> not }) reset-on=[@show]/>`));
    expect(check(r.core)).toEqual([]);
    const [rq] = requestsOf(r.core);
    expect(rq.deps.length).toBe(1);                 // @show (the locked load reads no cell itself)
    const prog = r.core.decls.find((d) => d.sym.id === r.core.program.id);
    expect(prog.renders.filter((v) => v.variant === "ResetOn")).toEqual([]);   // no plain reset write of `not`
    // a cycle through a pending cell is still E-RESET-ON-CYCLE
    const cyc = codes(APP(`let <who:(not to string)=(loadName(3) !{ _ :> not }) reset-on=[@who]/>`));
    expect(cyc).toContain("E-RESET-ON-CYCLE");
  });

  test("run time: `reset(@who)` re-runs the load; the cell keeps its value until it settles (§13.9.4)", async () => {
    const r = compile(RESET());
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, "pend-reset-" + k++);
    await settle(5);
    await held[0].go();
    await settle();
    expect(shown()).toBe("a");
    click(document.querySelector("#rs"));
    await settle(5);
    expect(held.length).toBe(2);                    // the re-run
    expect(cells(rt).who).toBe("a");                // never back to `not`, never the initializer
    expect(shown()).toBe("a");
    await held[1].go();
    await settle();
    expect(shown()).toBe("a");
    // a second reset while one is in flight: the newest run wins, the older READ is aborted
    click(document.querySelector("#rs"));
    await settle(5);
    click(document.querySelector("#rs"));
    await settle(5);
    expect(held.length).toBe(4);
    expect(held[2].aborted).toBe(true);
    await held[3].go();
    await settle();
    expect(shown()).toBe("a");
  });

  test("run time: a LOCKED mount-once pending cell reloads on `reset`, and only then", async () => {
    const r = compile(RESET(`<who:(not to string)=(loadName(3) !{ _ :> not })/>`));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = heldTransport(srv);
    await loadProgram(r.core, "pend-reset-locked-" + k++);
    await settle(5);
    await held[0].go();
    await settle();
    expect(shown()).toBe("c");
    click(document.querySelector("#u2"));           // not a dependency
    await settle(5);
    expect(held.length).toBe(1);
    click(document.querySelector("#rs"));
    await settle(5);
    expect(held.length).toBe(2);
    await held[1].go();
    await settle();
    expect(shown()).toBe("c");
  });

  test("run time: `reset-on=[@userId]` re-runs a locked load when the entry changes", async () => {
    const r = compile(APP(`<who:(not to string)=(loadName(3) !{ _ :> not }) reset-on=[@userId]/>`));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, "pend-reset-on-" + k++);
    await settle(5);
    await held[0].go();
    await settle();
    click(document.querySelector("#u2"));
    await settle(5);
    expect(held.length).toBe(2);
    expect(cells(rt).who).toBe("c");                // stale while reloading
    await held[1].go();
    await settle();
    expect(shown()).toBe("c");
  });
});

describe("s477 — a pending load through a client function re-runs on the cells that function reads", () => {
  test("run time: `let <who=(cur())>` reloads when `@userId` (read inside `cur()`) changes", async () => {
    const r = compile(APP(`let <who:(not to string)=(cur())/>`).replace(LOAD, LOAD + CUR));
    const { srv } = await serve(r.core, await realDb(DDL, ROWS));
    const held = heldTransport(srv);
    const { rt } = await loadProgram(r.core, "pend-through-call-" + k++);
    await settle(5);
    expect(held.length).toBe(1);
    await held[0].go();
    await settle();
    expect(shown()).toBe("a");
    click(document.querySelector("#u2"));
    await settle(5);
    expect(held.length).toBe(2);                    // the re-run (red on base: refused at compile time)
    expect(cells(rt).who).toBe("a");                // stale while reloading
    await held[1].go();
    await settle();
    expect(shown()).toBe("b");
  });
});
