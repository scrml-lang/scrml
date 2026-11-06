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
import { loadProgram, click, expectNoPageErrors, warmLoadProgram, instancesOf } from "../slice-m1/load-program.js";

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

  test("`let` + a client-function call is refused by name: its deps cannot be inferred (r1 F1, INTERIM)", () => {
    const e = errsOf(APP(`let <who:(not to string)=(cur())/>`).replace(LOAD, LOAD + CUR));
    expect(e.map((d) => d.code)).toEqual([U]);
    expect(e[0].message).toContain("cannot infer the load's dependencies");
    expect(e[0].message).toContain("g-boot-pending-cell-opaque-call-s475");
    // INTERIM over-refusal, recorded in the gap: a cell-free client helper in the initializer
    const o = errsOf(APP(`let <who:(not to string)=(loadName(one()) !{ _ :> not })/>`).replace(LOAD, LOAD + CUR));
    expect(o.map((d) => d.code)).toEqual([U]);
    expect(o[0].message).toContain("`one()`");
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

  test("a `?{}` written in the initializer is refused by name (INTERIM)", () => {
    const e = errsOf(APP(`let <who:(not to User)=(${SQ}\`SELECT id, name FROM users WHERE id = \${@userId}\`}.get() !{ _ :> not })/>`));
    expect(e.some((d) => d.code === U && d.message.includes("whose load is a `" + SQ + "}` written in its declaration"))).toBe(true);
  });

  test("`reset(@x)` / `reset-on=` on a pending cell are refused by name (§13.9.2: a reset is the request's re-run — INTERIM)", () => {
    const r1 = errsOf(APP(PEND).replace(`<button id="u2" onclick={ @userId = 2; }>2</button>`, `<button id="u2" onclick={ reset(@who); }>2</button>`));
    expect(r1.map((d) => d.code)).toEqual([U]);
    expect(r1[0].message).toContain("the request's re-run");
    const r2 = errsOf(APP(`let <who:(not to string)=(loadName(@userId) !{ _ :> not }) reset-on=[@show]/>`));
    expect(r2.map((d) => d.code)).toEqual([U]);
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
