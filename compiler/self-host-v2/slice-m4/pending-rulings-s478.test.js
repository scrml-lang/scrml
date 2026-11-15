// pending-rulings-s478.test.js — s478-boot-pending-rulings: the two S478 owner rulings on pending
// cells (§13.9), built in the bootstrap.
//
// Rulings (../scrml-support/user-voice-scrml.md §S478 "⭐ RULED — S477 owner questions 1 and 2"):
//   1. "#1796 L3 — whole-cell write on a `let` or locked pending tape without `[replace]`: REFUSED.
//      … A whole-cell author write into a pending `(not to S[…])` tape needs the `[replace]` grant
//      like any other tape; the compiler-written settle write stays exempt (S475 item 1)."
//   2. "g-spec-pending-reset-then-write-order-s477 — in `reset(@who); @who = "z";` the later write
//      WINS. … The run a reset triggers starts at the reset (§13.9.4 rule 1, most-recently-started
//      wins); the author write after it starts later and wins."
// Governing text (compiler/SPEC.md §13.9.4 "Which write or load wins", rules 1–3, amended S478):
//   rule 3 "A load triggered by a reset starts at the reset … dated as a write is (rule 2)".
//
// Red on base (origin/main 314bad402): item 1 — every whole write below compiled clean (`let` and the
// lifecycle gave the tape a `replace` channel); item 2 — `reset(@who); @who = "z"` settled the
// reload's "a" over "z" (the reset's run was queued to the batch's end, rule 3's dependency timing).

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
const errsOf = (src) => fe(src).diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (src) => errsOf(src).map((d) => d.code);
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(n = 60) { for (let i = 0; i < n; i++) await tick(); }
let k = 0;

function cells(rt) {
  const prog = instancesOf(rt, "program")[0];
  const out = {};
  prog.decl.fields.forEach((h, i) => { out[h] = prog.fields[i].peek(); });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Item 1 — a whole-cell author write into a pending tape needs `[replace]`
// ---------------------------------------------------------------------------------------------
const TAPE = (decl, h) => `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <q:int=1/>
    function load(n: int) -> User[] {
        const rs: User[] = ${SQ}\`SELECT id, name FROM users WHERE id >= \${n} ORDER BY id\`}.all() !{ _ :> { return []; } };
        return rs;
    }
    ${decl}
    <main>
        <button id="go" onclick={ ${h} }>go</button>
        <button id="all" onclick={ @q = 2; }>all</button>
        <div if=@users><each in=@users><p class="u">${D}@.name}</p></each></div>
    </main>
</program>
`;
const LET_TAPE = `let <users:(not to User[])=(load(@q) !{ _ :> not })/>`;
const LOCKED_TAPE = `<users:(not to User[])=(load(1) !{ _ :> not })/>`;

describe("item 1 — a whole-cell author write into a pending tape without `[replace]` is E-WRITE-NOT-GRANTED", () => {
  for (const [name, decl] of [["`let`", LET_TAPE], ["locked", LOCKED_TAPE]]) {
    test(`${name} pending tape: a plain whole write is refused (red on base: clean)`, () => {
      const es = errsOf(TAPE(decl, "@users = [];"));
      expect(es.map((d) => d.code)).toEqual(["E-WRITE-NOT-GRANTED"]);
      const msg = String(es[0].message ?? es[0].msg);
      expect(msg).toContain("needs `replace`");
      expect(msg).toContain("(not to User[replace])");
    });
    test(`${name} pending tape: the author's handled waiting write is refused the same way`, () => {
      expect(codes(TAPE(decl, "@users = load(2) !{ _ :> not };"))).toEqual(["E-WRITE-NOT-GRANTED"]);
    });
    test(`${name} pending tape: a whole write where the cell is narrowed present is refused`, () => {
      expect(codes(TAPE(decl, "if (@users is given) { @users = []; }"))).toEqual(["E-WRITE-NOT-GRANTED"]);
    });
    test(`${name} pending tape: its declaration (the compiler's settle write) and \`reset\` stay clean`, () => {
      expect(codes(TAPE(decl, "@q = 3;"))).toEqual([]);
      expect(codes(TAPE(decl, "reset(@users);"))).toEqual([]);
    });
  }

  test("a pending SCALAR cell keeps its writes (the ruling is about tapes)", () => {
    const src = (h) => TAPE(LET_TAPE, "@q = 3;").replace("    <main>", `    let <who:(not to string)=(nameOf(@q) !{ _ :> not })/>\n    <main>`)
      .replace("    let <q:int=1/>", `    let <q:int=1/>\n    function nameOf(id: int) -> string {\n        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };\n        return u.name;\n    }`)
      .replace("<button id=\"go\" onclick={ @q = 3; }>", `<button id="go" onclick={ ${h} }>`);
    expect(codes(src(`@who = "z";`))).toEqual([]);
    expect(codes(src(`@who = nameOf(2) !{ _ :> not };`))).toEqual([]);
  });

  test("a plain (non-pending) tape without `replace` keeps its refusal; with `replace` a whole write is clean", () => {
    const plain = (ty) => `<program>
    <xs:${ty}=[]/>
    <main><button onclick={ @xs = [1]; }>x</button></main>
</program>
`;
    expect(codes(plain("int[]"))).toEqual(["E-WRITE-NOT-GRANTED"]);
    expect(codes(plain("int[replace]"))).toEqual([]);
  });

  test("run time: the pending tape still loads (the settle write is exempt) and re-runs on reset", async () => {
    const r = compile(TAPE(LET_TAPE, "reset(@users);"));
    expect(check(r.core)).toEqual([]);
    const { srv } = await serve(r.core, await realDb(["CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"], { users: [{ id: 1, name: "a" }, { id: 2, name: "b" }] }));
    globalThis.fetch = bridge(srv);
    await loadProgram(r.core, "s478-tape-" + k++);
    await settle();
    const names = () => [...document.querySelectorAll("p.u")].map((p) => p.textContent);
    expect(names()).toEqual(["a", "b"]);
    click(document.querySelector("#all"));
    await settle();
    expect(names()).toEqual(["b"]);
    click(document.querySelector("#go"));
    await settle();
    expect(names()).toEqual(["b"]);
  });
});

// ---------------------------------------------------------------------------------------------
// Item 2 — the run a reset triggers starts at the reset
// ---------------------------------------------------------------------------------------------
const DDL = ["CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"];
const ROWS = { users: [{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }] };
const APP = (h, decl = `let <who:(not to string)=(loadName(@userId) !{ _ :> not })/>`) => `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <userId:int=1/>
    function loadName(id: int) -> string {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
    ${decl}
    <main>
        <button id="go" onclick={ ${h} }>go</button>
        <button id="rs" onclick={ reset(@who); }>rs</button>
        <p id="who" if=@who>${D}@who}</p>
        <p id="wait" else>loading</p>
    </main>
</program>
`;

// A transport that HOLDS every client call until the test releases it (and honours `init.signal`).
function heldTransport(srv) {
  const b = bridge(srv);
  document.cookie = "scrml_csrf=pending-test; Path=/";
  const held = [];
  globalThis.fetch = (p, init) => new Promise((resolve, reject) => {
    const h = { signal: init.signal ?? null, aborted: false, body: init.body };
    h.go = () => b(p, init).then(resolve, reject);
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

async function mounted(h, decl) {
  const r = compile(APP(h, decl));
  expect(check(r.core)).toEqual([]);
  const { srv } = await serve(r.core, await realDb(DDL, ROWS));
  const held = heldTransport(srv);
  const { rt } = await loadProgram(r.core, "s478-order-" + k++);
  await settle(5);
  await held[0].go();
  await settle();
  expect(shown()).toBe("a");
  return { rt, held };
}

describe("item 2 — `reset(@x)` then a write: the later write wins (§13.9.4 rule 3, RULED S478)", () => {
  test("`reset(@who); @who = \"z\";` — the write lands and stays; the reset's READ run is aborted (red on base: \"a\")", async () => {
    const { rt, held } = await mounted(`reset(@who); @who = "z";`);
    click(document.querySelector("#go"));
    await settle(5);
    expect(held.length).toBe(2);                     // the reset's run started (at the reset) …
    expect(held[1].aborted).toBe(true);              // … and the later write superseded it
    expect(cells(rt).who).toBe("z");
    await settle();
    expect(shown()).toBe("z");
  });

  test("the reverse, `@who = \"z\"; reset(@who);` — the reset is the later start: its load wins", async () => {
    const { rt, held } = await mounted(`@who = "z"; reset(@who);`);
    click(document.querySelector("#go"));
    await settle(5);
    expect(held.length).toBe(2);
    expect(held[1].aborted).toBe(false);
    expect(cells(rt).who).toBe("z");                 // stale while reloading
    await held[1].go();
    await settle();
    expect(shown()).toBe("a");                       // the reload's value (row 1 is still "a")
  });

  test("a dependency change in the same batch still re-runs at the batch's end and wins (rule 3)", async () => {
    const { held } = await mounted(`reset(@who); @userId = 2; @who = "z";`);
    click(document.querySelector("#go"));
    await settle(5);
    expect(held.length).toBe(3);                     // the reset's run, then the dependency's run
    expect(held[1].aborted).toBe(true);
    expect(held[2].aborted).toBe(false);
    expect(shown()).toBe("z");                       // until the newest load settles
    await held[2].go();
    await settle();
    expect(shown()).toBe("b");
  });

  test("after a wait, in one continuation: `reset(@who); @who = n;` — the write still wins", async () => {
    const { rt, held } = await mounted(`const n = loadName(3) !{ _ :> "?" }; reset(@who); @who = n;`);
    click(document.querySelector("#go"));
    await settle(5);
    expect(held.length).toBe(2);                     // the handler's own call
    await held[1].go();
    await settle(5);
    expect(held.length).toBe(3);                     // the reset's run, started in the continuation
    expect(held[2].aborted).toBe(true);
    expect(cells(rt).who).toBe("c");
    await settle();
    expect(shown()).toBe("c");
  });

  test("after a wait, in one continuation: `@who = n; reset(@who);` — the reset's load wins", async () => {
    const { held } = await mounted(`const n = loadName(3) !{ _ :> "?" }; @who = n; reset(@who);`);
    click(document.querySelector("#go"));
    await settle(5);
    await held[1].go();
    await settle(5);
    expect(held.length).toBe(3);
    expect(held[2].aborted).toBe(false);
    expect(shown()).toBe("c");
    await held[2].go();
    await settle();
    expect(shown()).toBe("a");
  });

  test("a LOCKED mount-once pending cell: `reset(@who); @who = \"z\";` keeps \"z\" (when narrowed, item 3)", async () => {
    const { rt, held } = await mounted(`if (@who is given) { reset(@who); @who = "z"; }`, `<who:(not to string)=(loadName(1) !{ _ :> not })/>`);
    click(document.querySelector("#go"));
    await settle(5);
    expect(held.length).toBe(2);
    expect(held[1].aborted).toBe(true);
    await settle();
    expect(cells(rt).who).toBe("z");
  });

  test("an older waiting write landing after a reset is discarded: the reset is the newer start", async () => {
    // rule 2 dates the write at its wait, which started before the reset's run
    const { held } = await mounted(`@who = loadName(3) !{ _ :> not };`);
    click(document.querySelector("#go"));            // the write's wait starts (held[1])
    await settle(5);
    click(document.querySelector("#rs"));            // the reset's run starts (held[2])
    await settle(5);
    expect(held.length).toBe(3);
    await held[1].go();                              // the older write lands: discarded
    await settle();
    expect(shown()).toBe("a");
    expect(held[2].aborted).toBe(false);
    await held[2].go();
    await settle();
    expect(shown()).toBe("a");
  });
});

// ---------------------------------------------------------------------------------------------
// Item 2, fix round 1 (S239 review of c277009c9, F1 / F2) — a reset dated OLDER than the newest
// start is the older start under rule 1 (§13.9.4 rule 3, ⚑ PA reading's companion): it neither
// cancels the newer run nor lands over it, and start stamps never decrease.
// Scenarios are the reviewer's probes P1 / P2 (~/.cache/scrml/review/s478-1852/p/item2.test.js).
// Red on c277009c9: P2 settled "d" (b's older write over the dependency's newer run, nothing in
// flight); P1 settled "a" (the reset's load landed over b's newer write via the settle bypass).
// ---------------------------------------------------------------------------------------------
const ROWS4 = { users: [{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }, { id: 4, name: "d" }] };
const APPN = (btns) => `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <userId:int=1/>
    function loadName(id: int) -> string {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
    let <who:(not to string)=(loadName(@userId) !{ _ :> not })/>
    <main>
${Object.entries(btns).map(([id, h]) => `        <button id="${id}" onclick={ ${h} }>${id}</button>`).join("\n")}
        <p id="who" if=@who>${D}@who}</p>
        <p id="wait" else>loading</p>
    </main>
</program>
`;
async function mountedN(btns) {
  const r = compile(APPN(btns));
  expect(check(r.core)).toEqual([]);
  const { srv } = await serve(r.core, await realDb(DDL, ROWS4));
  const held = heldTransport(srv);
  const { rt } = await loadProgram(r.core, "s478-r1-" + k++);
  await settle(5);
  await held[0].go();
  await settle();
  expect(shown()).toBe("a");
  // the pending cell's supersede record (runtime Cell.pend: its { load, wrote } start stamps)
  const prog = instancesOf(rt, "program")[0];
  const cell = prog.fields[prog.decl.fields.indexOf("who")];
  const stamps = [];
  const sample = () => { expect(cell.pend).not.toBeNull(); stamps.push([cell.pend.load, cell.pend.wrote]); };
  sample();
  const tap = async (id) => { click(document.querySelector("#" + id)); await settle(5); sample(); };
  const release = async (i) => { await held[i].go(); await settle(); sample(); };
  return { rt, held, tap, release, stamps };
}
function expectMonotonic(stamps) {
  for (let i = 1; i < stamps.length; i++) {
    expect(stamps[i][0]).toBeGreaterThanOrEqual(stamps[i - 1][0]);   // p.load never lowers
    expect(stamps[i][1]).toBeGreaterThanOrEqual(stamps[i - 1][1]);   // p.wrote never lowers
  }
}

describe("item 2 r1 — a reset dated older than the newest start is superseded (F1 / F2)", () => {
  test("P2 (F1): a's continuation resets after a newer dependency run started — that run wins, not b's older write (red on c277009c9: \"d\")", async () => {
    const { rt, held, tap, release, stamps } = await mountedN({
      a: `const n = loadName(3) !{ _ :> "?" }; reset(@who);`,
      b: `@who = loadName(4) !{ _ :> not };`,
      dep: `@userId = 2;`,
    });
    await tap("a");                                  // held[1]: a's wait
    await tap("b");                                  // held[2]: b's wait (newer)
    await tap("dep");                                // held[3]: the dependency's run (newest)
    expect(held.length).toBe(4);
    await release(1);                                // a's continuation: its reset is dated at a's wait — older
    expect(held.length).toBe(4);                     // not issued: no second load
    expect(held[3].aborted).toBe(false);             // the newer dependency run is not cancelled
    await release(2);                                // b's older write lands: discarded
    expect(cells(rt).who).toBe("a");
    await release(3);                                // the dependency run lands
    expect(cells(rt).who).toBe("b");                 // current against @userId = 2
    expect(shown()).toBe("b");
    expect(held.every((h) => !h.aborted)).toBe(true);
    expectMonotonic(stamps);
  });

  test("P1 (F2): b's newer write lands, then a's continuation resets and writes — b's write stands (red on c277009c9: \"a\")", async () => {
    const { rt, held, tap, release, stamps } = await mountedN({
      a: `const n = loadName(3) !{ _ :> "?" }; reset(@who); @who = n;`,
      b: `@who = loadName(2) !{ _ :> not };`,
    });
    await tap("a");                                  // held[1]: a's wait
    await tap("b");                                  // held[2]: b's wait (newer)
    await release(2);                                // b's write lands
    expect(cells(rt).who).toBe("b");
    await release(1);                                // a's continuation: its reset and its write are older
    expect(held.length).toBe(3);                     // the reset is not issued
    expect(cells(rt).who).toBe("b");
    await settle();
    expect(shown()).toBe("b");
    expectMonotonic(stamps);
  });

  test("stamps never decrease across resets: sync resets, a continuation reset, a dependency run, writes", async () => {
    const { rt, held, tap, release, stamps } = await mountedN({
      a: `const n = loadName(3) !{ _ :> "?" }; reset(@who); @who = n;`,
      rs: `reset(@who);`,
      w: `@who = "z";`,
      dep: `@userId = 2;`,
    });
    await tap("a");                                  // held[1]: a's wait
    await tap("rs");                                 // held[2]: a sync reset — the newest start
    await tap("dep");                                // held[3]: the dependency run supersedes it
    await tap("w");                                  // a sync write supersedes the dependency run
    expect(held.length).toBe(4);
    expect(cells(rt).who).toBe("z");
    await release(1);                                // a's older reset + write: superseded, not issued
    expect(held.length).toBe(4);
    expect(cells(rt).who).toBe("z");
    await tap("rs");                                 // held[4]: a newer reset re-runs the load
    expect(held.length).toBe(5);
    await release(4);
    expect(cells(rt).who).toBe("b");
    expectMonotonic(stamps);
  });
});
