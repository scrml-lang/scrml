// loop-wait-s471.test.js — s471 (g-bootstrap-loop-wait-and-defer-s469, the
// wait half): a loop BODY that waits for the server.
//
//   §49.12.7: "A server call in a loop body of a function is awaited once per
//   iteration (§13). … Per-iteration binding (§49.3.7) holds across every
//   suspension."
//   §49.3.7: "A closure created in an iteration, and a suspension point in the
//   body (a server call awaited per iteration, §13), see that iteration's
//   binding — never a later one. A compiler that splits the body across a
//   suspension (§13.2) SHALL preserve this."
//   §13.8 (i): a waiting value stands "At a suspension point of an action
//   position, where the compiler awaits it" — a function body, a handler.
//
// The client prints a waiting loop in explicit continuations (print.scrml
// cycleJs, runtime `cycle`): one call per iteration, its bindings the call's
// parameters. The server prints the same Core as a native loop with `await`s.
// Graded END TO END: the bootstrap's own client and server artifacts, a real
// in-memory SQLite, the client's `fetch` bridged to the server's.

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mods, compile, codes, check, artifacts, realDb, serve, bridge } from "./server-artifact-harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";
import * as rtDirect from "../slice-m1/runtime/runtime.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 120000 });
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const SQ = "?" + "{";
const P = (decls, main) => `<program db="./app.db">\n${decls}\n    <main>\n${main}\n    </main>\n</program>\n`;
// a server function `price(i)` — the database answers `i * 10` — and its error type
const PRICE = `    type LoadError:enum = { Db, Transport(t: ServerCallError) }
    type Cnt:struct = { n: int }
    function price(i: int)! LoadError {
        const r: Cnt = ${SQ}\`SELECT \${i} * 10 AS n\`}.get() !{ _ :> { fail .Db; } };
        return r.n;
    }`;

let k = 0;
async function runClicks(src, clicks, until) {
  const r0 = compile(src);
  expect(check(r0.core)).toEqual([]);
  const sql = await realDb([]);
  const { srv } = await serve(r0.core, sql);
  const loaded = await loadProgram(r0.core, "loopwait-" + k++);
  let calls = 0;
  const b = bridge(srv);
  // the calls the server ANSWERED (a first call's CSRF-token retry is not one)
  globalThis.fetch = async (p, i) => {
    const res = await b(p, i);
    if (res.status === 200 || res.status === 204) calls += 1;
    return res;
  };
  const inst = () => [...loaded.rt.devtools.instances.values()].find((i) => i.id === 0 && i.decl.name === "program");
  for (const id of clicks) {
    click(document.querySelector(id));
    for (let i = 0; i < 400 && !until(loaded.rt.snapshot(inst())); i++) await new Promise((r) => setTimeout(r, 0));
  }
  expectNoPageErrors();
  return { state: loaded.rt.snapshot(inst()), calls };
}

describe("a loop body that waits — client, every head, run end to end", () => {
  test("a range head: one server call per iteration, each awaited before the next (§49.12.7)", async () => {
    const src = P(`${PRICE}
    let <total:int=-1/>
    let <log:string=""/>
    function sumPrices() -> int {
        let t = 0;
        for (i of 0..4) {
            const p: int = price(i) !{ _ :> 0 };
            @log = \`\${@log}\${p};\`;
            t = t + p;
        }
        return t;
    }`, `        <button id="go" onclick={ @total = sumPrices(); }>go</button>`);
    const { state, calls } = await runClicks(src, ["#go"], (s) => s.total >= 0);
    expect(state.total).toBe(60);
    expect(state.log).toBe("0;10;20;30;");
    expect(calls).toBe(4);
  });

  test("an iterate head over a tape: each element's iteration keeps ITS binding across the wait (§49.3.7)", async () => {
    const src = P(`${PRICE}
    let <log:string=""/>
    let <done:boolean=false/>
    function go() {
        for (x of [3, 1, 2]) {
            const p: int = price(x) !{ _ :> 0 };
            @log = \`\${@log}\${x}:\${p};\`;
        }
        @done = true;
    }`, `        <button id="go" onclick=go()>go</button>`);
    const { state } = await runClicks(src, ["#go"], (s) => s.done);
    expect(state.log).toBe("3:30;1:10;2:20;");
  });

  test("a counted head: `continue` runs the step after the wait; `break` leaves through the exit", async () => {
    const src = P(`${PRICE}
    let <log:string=""/>
    let <done:boolean=false/>
    function go() {
        for (let i = 0; i < 10; i = i + 1) {
            if (i == 1) { continue; }
            const p: int = price(i) !{ _ :> 0 };
            if (p > 30) { break; }
            @log = \`\${@log}\${i}=\${p};\`;
        }
        @done = true;
    }`, `        <button id="go" onclick=go()>go</button>`);
    const { state } = await runClicks(src, ["#go"], (s) => s.done);
    expect(state.log).toBe("0=0;2=20;3=30;");
  });

  test("a condition head and an infinite head with `break`; a `let` counter rebound after the wait", async () => {
    const src = P(`${PRICE}
    let <a:int=-1/>
    let <b:int=-1/>
    function viaCond() -> int {
        let n = 0;
        let s = 0;
        for (n < 3) {
            const p: int = price(n) !{ _ :> 0 };
            s = s + p;
            n = n + 1;
        }
        return s;
    }
    function viaForever() -> int {
        let n = 0;
        for {
            const p: int = price(n) !{ _ :> 0 };
            if (p >= 20) { break; }
            n = n + 1;
        }
        return n;
    }`, `        <button id="go" onclick={ @a = viaCond(); @b = viaForever(); }>go</button>`);
    const { state } = await runClicks(src, ["#go"], (s) => s.b >= 0);
    expect(state.a).toBe(30);
    expect(state.b).toBe(2);
  });

  test("a `return` from inside a waiting loop settles the function with that value", async () => {
    const src = P(`${PRICE}
    let <found:int=-1/>
    function firstOver(limit: int) -> int {
        for (i of 0..10) {
            const p: int = price(i) !{ _ :> 0 };
            if (p > limit) { return i; }
        }
        return -2;
    }`, `        <button id="go" onclick={ @found = firstOver(25); }>go</button>`);
    const { state, calls } = await runClicks(src, ["#go"], (s) => s.found !== -1);
    expect(state.found).toBe(3);
    expect(calls).toBe(4);
  });

  test("nested loops that wait, with a labelled `continue` of the outer loop from the inner", async () => {
    const src = P(`${PRICE}
    let <log:string=""/>
    let <done:boolean=false/>
    function go() {
        outer: for (i of 0..3) {
            for (j of 0..3) {
                const p: int = price(i * 10 + j) !{ _ :> 0 };
                if (j == 1) { continue outer; }
                @log = \`\${@log}\${p};\`;
            }
        }
        @done = true;
    }`, `        <button id="go" onclick=go()>go</button>`);
    const { state } = await runClicks(src, ["#go"], (s) => s.done);
    expect(state.log).toBe("0;100;200;");
  });

  test("a loop in a HANDLER block that waits; iterations that do not wait run in constant stack", async () => {
    const src = P(`${PRICE}
    let <sum:int=0/>
    let <done:boolean=false/>`, `        <button id="go" onclick={ for (i of 0..20000) { if (i == 19999) { const p: int = price(1) !{ _ :> 0 }; @sum = @sum + p; } else { @sum = @sum + 1; } } @done = true; }>go</button>`);
    const { state, calls } = await runClicks(src, ["#go"], (s) => s.done);
    expect(state.sum).toBe(19999 + 10);
    expect(calls).toBe(1);
  });

  test("the printed client loop: one `rt.cycle` iteration per call, the exit a Join (readable, no native loop)", () => {
    const src = P(`${PRICE}
    function go() {
        for (i of 0..2) {
            const p: int = price(i) !{ _ :> 0 };
        }
    }`, `        <button id="go" onclick=go()>go</button>`);
    const { client } = artifacts(compile(src).core);
    expect(client.js).toMatch(/rt\.cycle\(i => \{/);
    expect(client.js).toMatch(/return loop_exit\(\);/);
    expect(client.js).toMatch(/return loop\(i \+ 1\);/);
  });
});

describe("a server function whose loop waits — the server's native loop with `await`", () => {
  test("a query per iteration, inside a server function, awaited in order", async () => {
    const src = P(`    type LoadError:enum = { Db, Transport(t: ServerCallError) }
    type Cnt:struct = { n: int }
    let <total:int=-1/>
    function total(n: int)! LoadError {
        let t = 0;
        for (i of 0..n) {
            const r: Cnt = ${SQ}\`SELECT \${i} * 10 AS n\`}.get() !{ _ :> { fail .Db; } };
            t = t + r.n;
        }
        return t;
    }`, `        <button id="go" onclick={ @total = total(4) !{ _ :> -2 }; }>go</button>`);
    const { server } = artifacts(compile(src).core);
    expect(server.js).toMatch(/for \(let i = 0, end = n; i < end; i = i \+ 1\) \{/);
    expect(server.js).toMatch(/await rt\.query/);
    const { state, calls } = await runClicks(src, ["#go"], (s) => s.total !== -1);
    expect(state.total).toBe(60);
    expect(calls).toBe(1);
  });
});

describe("still refused, by name (fail closed)", () => {
  test("a wait in a loop HEAD (the iterable, a bound, a condition): E-BOOTSTRAP-UNSUPPORTED", () => {
    const fnWith = (body) => P(`${PRICE}\n    function go() {\n${body}\n    }`, `        <button id="go" onclick=go()>go</button>`);
    expect(codes(fnWith(`        for (i of 0..(price(1) !{ _ :> 0 })) { }`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(codes(fnWith(`        let n = 0;\n        for (n < (price(1) !{ _ :> 0 })) { n = n + 1; }`))).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a wait in a loop bound as a value (§49.6): E-BOOTSTRAP-UNSUPPORTED", () => {
    const src = P(`${PRICE}\n    function go() {\n        const xs = for (i of 0..2) { lift price(i) !{ _ :> 0 }; };\n    }`, `        <button id="go" onclick=go()>go</button>`);
    expect(codes(src)).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("a `defer` in a loop of a function that waits: refused with the async-`defer` refusal", () => {
    const src = P(`${PRICE}\n    let <n:int=0/>\n    function go() {\n        for (i of 0..2) {\n            defer @n = @n + 1;\n            const p: int = price(i) !{ _ :> 0 };\n        }\n    }`, `        <button id="go" onclick=go()>go</button>`);
    const ds = mods() && codes(src);
    expect(ds).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
});

describe("runtime `cycle`", () => {
  test("never recurses: a million synchronous iterations, then the exit", () => {
    let n = 0;
    let exited = false;
    const loop = rtDirect.cycle((i) => {
      if (i >= 1000000) { exited = true; return; }
      n += 1;
      return loop(i + 1);
    });
    loop(0);
    expect(n).toBe(1000000);
    expect(exited).toBe(true);
  });
  test("an iteration resumed later (after a wait) drives the rest from there", async () => {
    const seen = [];
    let resume;
    const loop = rtDirect.cycle((i) => {
      if (i >= 4) return;
      seen.push(i);
      if (i == 1) { resume = () => loop(i + 1); return; }
      return loop(i + 1);
    });
    loop(0);
    expect(seen).toEqual([0, 1]);
    resume();
    expect(seen).toEqual([0, 1, 2, 3]);
  });
});
