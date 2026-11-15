// pending-followup-s478.test.js — s478-boot-pending-followup: the follow-up to #1852 on pending
// cells (§13.9.4), built in the bootstrap runtime (slice-m1/runtime/runtime.js).
//
// Rulings (../scrml-support/user-voice-scrml.md §S478 "⭐ RULED — bounded branch literals; rule 4
// reload start; `reset-on=` timing"):
//   2. "§13.9.4 rule 4: the reload a winning write of `not` triggers starts AT THE WRITE, the same as
//      a reset's reload (S478 ruling 2), not at the end of the batch. A later write in the same
//      continuation still wins."
//   3. "`reset-on=` timing kept: a `reset-on=` entry's change is a write that triggers the load, so
//      its run starts when that write's batch ends" — no behaviour change (covered by
//      slice-m4/reset-on.test.js and the r2 probe RO).
// PA decision (conformance to S478 "⭐ RULED — S477 owner questions 1 and 2" item 2, "the later
// write WINS"): a reset inside a WAITING helper must not beat the caller's later write. The caller's
// continuation that resumes after awaiting the call is dated no earlier than any restart issued
// inside it, for that cell only; an unrelated concurrent continuation is not lifted.
//
// Red on base (origin/main 5a0fd0eb5): rule 4 "not then a write" settled the reload's "a" over "z"
// (the reload was queued to the batch's end); the helper-reset cases settled the reset's "a" over the
// caller's "z" (the caller's write was dated at its wait on the helper, before the reset).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mods, compile, check, realDb, serve, bridge } from "./server-artifact-harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram, instancesOf } from "../slice-m1/load-program.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 300000 });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; expectNoPageErrors(); });

const SQ = "?" + "{";
const D = "$" + "{";
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(n = 60) { for (let i = 0; i < n; i++) await tick(); }
let k = 0;

const DDL = ["CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)"];
const ROWS = { users: [{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }, { id: 4, name: "d" }] };

const APP = (btns) => `<program db="./app.db">
    type User:struct = { id: int, name: string }
    let <userId:int=1/>
    let <otherId:int=1/>
    function loadName(id: int) -> string {
        const u: User = ${SQ}\`SELECT id, name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "?"; } };
        return u.name;
    }
    function inner() -> int {
        const n = loadName(3) !{ _ :> "?" };
        reset(@who);
        return 1;
    }
    function outer() -> int {
        const r = inner();
        return r;
    }
    function notInner() -> int {
        @who = loadName(3) !{ _ :> not };
        return 1;
    }
    function other() -> int {
        const n = loadName(4) !{ _ :> "?" };
        return 1;
    }
    let <who:(not to string)=(loadName(@userId) !{ _ :> not })/>
    let <who2:(not to string)=(loadName(@otherId) !{ _ :> not })/>
    <main>
${Object.entries(btns).map(([id, h]) => `        <button id="${id}" onclick={ ${h} }>${id}</button>`).join("\n")}
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
    h.fail = () => reject(new TypeError("network down"));   // a transport failure (the call's `fail`)
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
function field(rt, name) {
  const prog = instancesOf(rt, "program")[0];
  return prog.fields[prog.decl.fields.indexOf(name)];
}

async function mounted(btns) {
  const r = compile(APP(btns));
  expect(check(r.core)).toEqual([]);
  const { srv } = await serve(r.core, await realDb(DDL, ROWS));
  const held = heldTransport(srv);
  const { rt } = await loadProgram(r.core, "s478-fu-" + k++);
  await settle(5);
  expect(held.length).toBe(2);                       // the two pending cells' first loads
  await held[0].go();
  await held[1].go();
  await settle();
  expect(shown()).toBe("a");
  const who = field(rt, "who");
  const stamps = [];
  const sample = () => { stamps.push([who.pend.load, who.pend.wrote]); };
  sample();
  const tap = async (id) => { click(document.querySelector("#" + id)); await settle(5); sample(); };
  const release = async (i) => { await held[i].go(); await settle(); sample(); };
  const fail = async (i) => { held[i].fail(); await settle(); sample(); };
  return { rt, held, who, stamps, tap, release, fail, val: (n = "who") => field(rt, n).peek() };
}
function expectMonotonic(stamps) {
  for (let i = 1; i < stamps.length; i++) {
    expect(stamps[i][0]).toBeGreaterThanOrEqual(stamps[i - 1][0]);   // p.load never lowers
    expect(stamps[i][1]).toBeGreaterThanOrEqual(stamps[i - 1][1]);   // p.wrote never lowers
  }
}

// ---------------------------------------------------------------------------------------------
// Item 1 — §13.9.4 rule 4 (RULED S478): the reload a winning write of `not` triggers starts AT THE
// WRITE. A later write in the same continuation still wins.
// ---------------------------------------------------------------------------------------------
describe("item 1 — a winning `not` restarts the load at the write (§13.9.4 rule 4, RULED S478)", () => {
  test("`@who = f() !{ _ :> not }; @who = \"z\";` with f failing — the later write wins; the restart is aborted (red on base: \"a\")", async () => {
    const { held, tap, fail, val, stamps } = await mounted({ g: `@who = loadName(3) !{ _ :> not }; @who = "z";` });
    await tap("g");                                  // held[2]: the handled call
    expect(held.length).toBe(3);
    await fail(2);                                   // `not` lands: the reload starts at the write (held[3]) …
    expect(held.length).toBe(4);
    expect(held[3].aborted).toBe(true);              // … and the later write in the same continuation supersedes it
    expect(val()).toBe("z");
    expect(shown()).toBe("z");
    expectMonotonic(stamps);
  });

  test("a `not` alone restarts the load inside the write's continuation, dated after the write; its load lands", async () => {
    const { held, who, tap, fail, release, val, stamps } = await mounted({ g: `@who = loadName(3) !{ _ :> not };` });
    await tap("g");
    await fail(2);
    expect(held.length).toBe(4);
    expect(held[3].aborted).toBe(false);
    expect(val()).toBe(null);                        // the pre-state: `not` with its load running
    expect(document.querySelector("#wait")).not.toBeNull();
    expect(who.pend.load).toBeGreaterThan(who.pend.wrote);   // the restart is the later start
    await release(3);
    expect(val()).toBe("a");
    expectMonotonic(stamps);
  });

  test("a dependency change in the same batch after the `not` still re-runs at the batch's end and wins (rule 3)", async () => {
    const { held, tap, fail, release, val, stamps } = await mounted({ g: `@who = loadName(3) !{ _ :> not }; @userId = 2;` });
    await tap("g");
    await fail(2);
    expect(held.length).toBe(5);                     // the restart at the write, then the dependency's run
    expect(held[3].aborted).toBe(true);
    expect(held[4].aborted).toBe(false);
    await release(4);
    expect(val()).toBe("b");
    expectMonotonic(stamps);
  });

  test("an older waiting write from another continuation landing after the restart is discarded", async () => {
    const { held, tap, fail, release, val, stamps } = await mounted({
      b: `@who = loadName(4) !{ _ :> not };`,
      a: `@who = loadName(3) !{ _ :> not };`,
    });
    await tap("b");                                  // held[2]: b's wait (older)
    await tap("a");                                  // held[3]: a's wait
    await fail(3);                                   // a's `not` lands; the restart starts now (held[4])
    expect(held.length).toBe(5);
    await release(2);                                // b's write started before the restart: discarded
    expect(val()).toBe(null);
    expect(held[4].aborted).toBe(false);
    await release(4);
    expect(val()).toBe("a");
    expectMonotonic(stamps);
  });

  test("a `not` restart inside an awaited helper: the caller's later write wins (red on base: \"a\")", async () => {
    const { held, tap, fail, val, stamps } = await mounted({ g: `const r = notInner(); @who = "z";` });
    await tap("g");                                  // held[2]: the helper's handled call
    await fail(2);                                   // `not` lands in the helper; its restart (held[3])
    expect(held.length).toBe(4);
    expect(held[3].aborted).toBe(true);              // the caller's write after the call supersedes it
    expect(val()).toBe("z");
    expectMonotonic(stamps);
  });
});

// ---------------------------------------------------------------------------------------------
// Item 3 — a reset inside a WAITING helper, then the caller's write: the write (later in program
// order) wins (ruling S478 item 2). The caller's resume after the await adopts the restarts the call
// issued, for that cell only; an unrelated concurrent continuation is not lifted.
// ---------------------------------------------------------------------------------------------
describe("item 3 — a reset inside an awaited waiting helper loses to the caller's later write", () => {
  test("Q1: `const r = inner(); @who = \"z\";` where inner resets after a wait — \"z\" (red on base: \"a\")", async () => {
    const { held, tap, release, val, stamps } = await mounted({ g: `const r = inner(); @who = "z";` });
    await tap("g");                                  // held[2]: inner's wait
    expect(held.length).toBe(3);
    await release(2);                                // inner resets (held[3]) and returns; the caller writes
    expect(held.length).toBe(4);
    expect(held[3].aborted).toBe(true);
    expect(val()).toBe("z");
    expect(shown()).toBe("z");
    expectMonotonic(stamps);
  });

  test("two levels: `const r = outer(); @who = \"z\";` where outer awaits inner, which resets — \"z\"", async () => {
    const { held, tap, release, val, stamps } = await mounted({ g: `const r = outer(); @who = "z";` });
    await tap("g");
    await release(2);
    expect(held.length).toBe(4);
    expect(held[3].aborted).toBe(true);
    expect(val()).toBe("z");
    expectMonotonic(stamps);
  });

  test("without a later write the helper's reset still reloads (inline equivalent: the reset's load lands)", async () => {
    const { held, tap, release, val, stamps } = await mounted({ g: `const r = inner();` });
    await tap("g");
    await release(2);
    expect(held.length).toBe(4);
    expect(held[3].aborted).toBe(false);
    await release(3);
    expect(val()).toBe("a");
    expectMonotonic(stamps);
  });

  test("an UNRELATED continuation resuming after its own call is not lifted: its older write is discarded", async () => {
    const { held, tap, release, val, stamps } = await mounted({
      g: `const r = inner();`,
      b: `const m = other(); @who = "y";`,
    });
    await tap("g");                                  // held[2]: inner's wait
    await tap("b");                                  // held[3]: other's wait (started before the reset)
    await release(2);                                // inner resets: held[4]
    expect(held.length).toBe(5);
    await release(3);                                // b resumes after `other`, which reset nothing: "y" is older
    expect(val()).toBe("a");
    expect(held[4].aborted).toBe(false);
    await release(4);
    expect(val()).toBe("a");
    expectMonotonic(stamps);
  });

  test("the lift is per cell: the caller's write of ANOTHER pending cell keeps its wait's date", async () => {
    const { held, tap, release, val } = await mounted({
      g: `const r = inner(); @who2 = "y";`,
      dep2: `@otherId = 2;`,
    });
    await tap("g");                                  // held[2]: inner's wait (the caller's wait after it)
    await tap("dep2");                               // held[3]: who2's reload, newer than the caller's wait
    await release(2);                                // inner resets @who (held[4]); the caller writes @who2
    expect(val("who2")).toBe("a");                   // "y" started before who2's reload: discarded
    await release(3);
    expect(val("who2")).toBe("b");
    await release(4);
    expect(val()).toBe("a");
  });

  test("a newer reset from another continuation, after the helper's reset, still beats the caller's write", async () => {
    const { held, tap, release, val, stamps } = await mounted({
      g: `const r = inner(); const m = other(); @who = "z";`,
      rs: `reset(@who);`,
    });
    await tap("g");                                  // held[2]: inner's wait
    await release(2);                                // inner resets (held[3]); the caller then waits on other (held[4])
    expect(held.length).toBe(5);
    await tap("rs");                                 // a newer sync reset (held[5])
    await release(4);                                // the caller's write: dated at its wait on other, older than rs
    expect(val()).toBe("a");
    await release(5);
    expect(val()).toBe("a");
    expectMonotonic(stamps);
  });
});
