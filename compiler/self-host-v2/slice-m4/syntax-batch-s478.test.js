// syntax-batch-s478.test.js — s478-boot-syntax-batch: three constructs the bootstrap refused by name,
// BUILT. Every program is compiled from source by the bootstrap; the server ones run against a REAL
// SQLite file, and every claim about what persisted is a SELECT through a second connection.
//
// 1. A bare `{ … }` block statement (§7.2.2 "Terms": a statement list is the content of "any `{ … }`
//    block of a statement (`if` / `else` / loop / bare block)"; §7.2: "All JavaScript that is valid in
//    a Bun execution context is valid inside `${ }`, except the constructs §7.2.1 excludes"). It runs
//    its statements once, in order; a name it declares is in scope to its `}` and not after it.
//    §19.16.2: a `defer` in one stays E-DEFER-UNSUPPORTED-SITE.
// 2. `transaction { … }` (§19.10.2) inside a `!` server body — §8.9.2 "Amendment S474" item 3: "A
//    `transaction { }` block … inside a `!` server body … SHALL run as a savepoint within the
//    envelope … Its commit releases the savepoint. Its rollback (a `fail`, an error, or an early exit
//    out of the block, §19.10.3) rolls back to the savepoint. Neither commits, ends or releases the
//    envelope." §19.10.3: "Only normal completion COMMITs … the return expression SHALL be evaluated
//    before the rollback". §19.10.4: E-ERROR-001 outside a `!` function, E-ERROR-007 nested, the
//    E-TRANSACTION-CONTROL-FLOW limbs.

import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { SQL } from "bun";
import { Database } from "bun:sqlite";
import { mods, compile, serve, post, pathOf } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, click, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

const fe = (src) => frontEnd(mods(), [{ path: "app.scrml", src }], "app.scrml");
const errs = (r) => r.diags.filter((d) => d.severity === "Error");
const codes = (src) => errs(fe(src)).map((d) => d.code).sort();
const $ = (sel) => document.querySelector(sel);
let k = 0;

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 300000 });
afterEach(() => expectNoPageErrors());

// ---------------------------------------------------------------------------------------------
// 1. THE BARE BLOCK (§7.2.2)
// ---------------------------------------------------------------------------------------------
const prog = (body) => `<program>
    let <out:int=0/>
    function go() {
${body}
    }
    <button id="b" onclick=go()>b</button>
    <p id="o">\${@out}</p>
</program>
`;

async function outAfterClick(body) {
  const r = fe(prog(body));
  expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods().check.checkCore(r.core)).toEqual([]);
  await loadProgram(r.core, "s478-sb-" + k++);
  click($("#b"));
  return $("#o").textContent;
}

describe("§7.2.2 — a bare `{ … }` block statement", () => {
  test("its statements run once, in order, and see the enclosing locals", async () => {
    expect(await outAfterClick(`        let n: int = 1;
        {
            n = n * 10;
            const m: int = n + 2;
            n = m;
        }
        @out = n;`)).toBe("12");
  });

  test("a name declared in it shadows an outer one only to its `}`", async () => {
    expect(await outAfterClick(`        const x: int = 5;
        let acc: int = 0;
        {
            const x: int = 100;
            acc = acc + x;
        }
        acc = acc + x;
        @out = acc;`)).toBe("105");
  });

  test("a `return` in it leaves the function", async () => {
    expect(await outAfterClick(`        @out = 1;
        {
            @out = 2;
            return;
        }
        @out = 3;`)).toBe("2");
  });

  test("NEGATIVE — a name declared in the block is not in scope after it", () => {
    expect(codes(prog(`        {
            const inner: int = 4;
        }
        @out = inner;`))).toContain("E-SCOPE-001");
  });

  test("NEGATIVE — a `defer` in a bare block stays E-DEFER-UNSUPPORTED-SITE (§19.16.2)", () => {
    const c = codes(prog(`        {
            defer { @out = 9; }
            @out = 1;
        }`));
    expect(c).toContain("E-DEFER-UNSUPPORTED-SITE");
    expect(c).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
  });

  test("it is block-like: no `;` after its `}`, and no refusal", () => {
    const c = codes(prog(`        { @out = 1; }
        { @out = @out + 1; }`));
    expect(c).toEqual([]);
  });

  test("a declared-return function whose last statement is a block that returns is complete", () => {
    expect(codes(`<program>
    function f(a: int) -> int {
        {
            return a + 1;
        }
    }
    let <o:int=0/>
    <button onclick={ @o = f(1); }>x</button>
</program>
`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. `transaction { … }` (§19.10)
// ---------------------------------------------------------------------------------------------
const SQ = "?" + "{";
const ins = (v) => `${SQ}\`INSERT INTO log (a) VALUES (${v})\`}.run();`;
const E = "    type E:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }\n";

const TX = `<program db="./app.db">
${E}
    function commits(a: int)! E {
        ${ins("${a}")}
        transaction {
            ${ins("${a + 1}")}
            ${ins("${a + 2}")}
        }
        ${ins("${a + 3}")}
        return 1;
    }
    function failsIn(a: int)! E {
        transaction {
            ${ins("${a}")}
            if (a > 0) { fail .Bad; }
            ${ins("${a + 1}")}
        }
        return 1;
    }
    function returnsOut(a: int)! E {
        ${ins("${a}")}
        transaction {
            ${ins("${a + 1}")}
            if (a > 0) { return 7; }
            ${ins("${a + 2}")}
        }
        ${ins("${a + 3}")}
        return 1;
    }
    function breaksOut(a: int)! E {
        for (let i = 0; i < 3; i = i + 1) {
            transaction {
                ${ins("${a + i}")}
                if (i == 1) { break; }
            }
        }
        return 1;
    }
    function continuesOut(a: int)! E {
        for (let i = 0; i < 3; i = i + 1) {
            transaction {
                ${ins("${a + i}")}
                if (i == 1) { continue; }
                ${ins("${a + i + 10}")}
            }
        }
        return 1;
    }
    function errorIn(a: int)! E {
        ${ins("${a}")}
        transaction {
            ${ins("${a + 1}")}
            ${SQ}\`INSERT INTO uniq (k) VALUES (1)\`}.run();
            ${SQ}\`INSERT INTO uniq (k) VALUES (1)\`}.run();
        }
        return 1;
    }
    function failAfter(a: int)! E {
        transaction {
            ${ins("${a}")}
        }
        if (a > 0) { fail .Bad; }
        return 1;
    }
    function lastIsTx(a: int)! E {
        ${ins("${a}")}
        transaction {
            ${ins("${a + 1}")}
        }
    }
    function callsLast(a: int)! E {
        ${ins("${a + 100}")}
        lastIsTx(a)?;
        return 1;
    }
    function txEndsLoopBody(a: int)! E {
        for (let i = 0; i < 3; i = i + 1) {
            transaction {
                ${ins("${a + i}")}
            }
        }
        return 1;
    }
    function loopInside(a: int)! E {
        transaction {
            for (let i = 0; i < 3; i = i + 1) {
                if (i == 1) { continue; }
                ${ins("${a + i}")}
            }
        }
        return 1;
    }
    let <r:int=0/>
    <main>
        <button onclick={ @r = commits(1) !{ _ :> 0, }; }>a</button>
        <button onclick={ @r = failsIn(1) !{ _ :> 0, }; }>b</button>
        <button onclick={ @r = returnsOut(1) !{ _ :> 0, }; }>c</button>
        <button onclick={ @r = breaksOut(1) !{ _ :> 0, }; }>e</button>
        <button onclick={ @r = continuesOut(1) !{ _ :> 0, }; }>f</button>
        <button onclick={ @r = errorIn(1) !{ _ :> 0, }; }>g</button>
        <button onclick={ @r = failAfter(1) !{ _ :> 0, }; }>h</button>
        <button onclick={ @r = loopInside(1) !{ _ :> 0, }; }>i</button>
        <button onclick={ @r = callsLast(1) !{ _ :> 0, }; }>j</button>
        <button onclick={ @r = txEndsLoopBody(1) !{ _ :> 0, }; }>k</button>
    </main>
</program>
`;

describe("§19.10 — `transaction { … }` in a `!` server body runs as a savepoint (run against SQLite)", () => {
  let dir, file, sql, srv, routes, js;
  const persisted = () => {
    const db = new Database(file, { readonly: true });
    try {
      return db.query("SELECT a FROM log ORDER BY a").all().map((r) => r.a);
    } finally {
      db.close();
    }
  };
  const call = (fn, args) => post(srv, pathOf(routes, fn), args);
  const reset = async () => { await sql.unsafe("DELETE FROM log"); await sql.unsafe("DELETE FROM uniq"); };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "s478-tx-"));
    file = join(dir, "app.db");
    sql = new SQL("sqlite://" + file);
    await sql.unsafe("CREATE TABLE log (a INTEGER)");
    await sql.unsafe("CREATE TABLE uniq (k INTEGER PRIMARY KEY)");
    const r = compile(TX);
    expect(mods().check.checkCore(r.core)).toEqual([]);
    ({ srv, routes, js } = await serve(r.core, sql, []));
  }, 300000);

  afterAll(async () => {
    await sql.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("the printed block opens a savepoint, releases it on normal completion, rolls it back otherwise", () => {
    expect(js).toContain("txBlock(");
    expect(js).toContain("txEnd(tx$, txOk$)");
    expect(js).toContain("txOk$ = true");
  });

  test("normal completion commits the block's writes with the body's", async () => {
    await reset();
    const res = await call("commits", [1]);
    expect(res.status).toBe(200);
    expect(persisted()).toEqual([1, 2, 3, 4]);
  });

  test("a `fail` inside the block rolls it back and the failure is returned (§19.10.3)", async () => {
    await reset();
    const res = await call("failsIn", [1]);
    expect(res.status).not.toBe(200);
    expect(persisted()).toEqual([]);
  });

  test("a `return` out of the block rolls the BLOCK back; the body's other writes commit (§19.10.3, S474 item 3)", async () => {
    await reset();
    const res = await call("returnsOut", [1]);
    expect(res.status).toBe(200);
    expect(res.json).toBe(7);
    expect(persisted()).toEqual([1]);
  });

  test("a `break` out of the block rolls that iteration's block back", async () => {
    await reset();
    const res = await call("breaksOut", [1]);
    expect(res.status).toBe(200);
    expect(persisted()).toEqual([1]);
  });

  test("a `continue` out of the block rolls that iteration's block back", async () => {
    await reset();
    const res = await call("continuesOut", [1]);
    expect(res.status).toBe(200);
    expect(persisted()).toEqual([1, 3, 11, 13]);
  });

  test("a SQL error inside the block leaves no write of the block, nor of the body (§19.10.3)", async () => {
    await reset();
    const res = await call("errorIn", [1]);
    expect(res.status).not.toBe(200);
    expect(persisted()).toEqual([]);
    const db = new Database(file, { readonly: true });
    try { expect(db.query("SELECT COUNT(*) AS c FROM uniq").get().c).toBe(0); } finally { db.close(); }
  });

  test("a `fail` after the block rolls back the committed block too — the envelope owns it (S474 item 3)", async () => {
    await reset();
    const res = await call("failAfter", [1]);
    expect(res.status).not.toBe(200);
    expect(persisted()).toEqual([]);
  });

  test("a block that is the function's LAST statement completes normally and commits (the function's end is not an exit of it)", async () => {
    await reset();
    const res = await call("callsLast", [1]);
    expect(res.status).toBe(200);
    expect(persisted()).toEqual([1, 2, 101]);
  });

  test("a block that ends a loop body commits every iteration (the next iteration is not an exit of it)", async () => {
    await reset();
    const res = await call("txEndsLoopBody", [1]);
    expect(res.status).toBe(200);
    expect(persisted()).toEqual([1, 2, 3]);
  });

  test("a `continue` whose loop is inside the block is not an exit of the block", async () => {
    await reset();
    const res = await call("loopInside", [1]);
    expect(res.status).toBe(200);
    expect(persisted()).toEqual([1, 3]);
  });
});

describe("§19.10.4 — where a `transaction` block may stand", () => {
  const fn = (head, body) => `<program db="./app.db">
${E}
    function ${head} {
${body}
    }
    let <r:int=0/>
    <button onclick={ @r = 1; }>x</button>
</program>
`;

  test("NEGATIVE — in a function not declared `!`: E-ERROR-001", () => {
    expect(codes(fn("plain(a: int) -> int", `        transaction {
            ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run() !{ _ :> { return 0; } };
        }
        return 1;`))).toContain("E-ERROR-001");
  });

  test("NEGATIVE — at the top level of a logic block: E-ERROR-001, once", () => {
    const c = codes(`<program db="./app.db">
    \${
        transaction {
            ${SQ}\`INSERT INTO log (a) VALUES (1)\`}.run();
        }
    }
    <p>x</p>
</program>
`);
    expect(c.filter((x) => x === "E-ERROR-001").length).toBe(1);
    expect(c).not.toContain("E-ERROR-002");
  });

  test("NEGATIVE — nested blocks: E-ERROR-007", () => {
    expect(codes(fn("nested(a: int)! E", `        transaction {
            if (a > 0) {
                transaction {
                    ${ins("${a}")}
                }
            }
        }
        return 1;`))).toContain("E-ERROR-007");
  });

  test("NEGATIVE — `fail` / `?` in a statement-`match` arm inside the block, a block in such an arm, a `return` in an arm: E-TRANSACTION-CONTROL-FLOW each", () => {
    const src = `<program db="./app.db">
${E}
    type M:enum = { A, B }
    function h(x: int)! E {
        if (x > 1) { fail .Bad; }
        return x;
    }
    function failInArm(m: M)! E {
        transaction {
            match m {
                .A :> { fail .Bad; },
                .B :> { ${ins("1")} }
            }
            ${ins("2")}
        }
        return 1;
    }
    function propInArm(m: M)! E {
        transaction {
            match m {
                .A :> { const x: int = h(5)?; ${ins("${x}")} },
                .B :> { ${ins("1")} }
            }
        }
        return 1;
    }
    function txInArm(m: M)! E {
        match m {
            .A :> {
                transaction {
                    ${ins("1")}
                }
            },
            .B :> { ${ins("2")} }
        }
        return 1;
    }
    function returnInArm(m: M)! E {
        transaction {
            const v: int = match m {
                .A :> { return 5; },
                .B :> 2
            };
            ${ins("${v}")}
        }
        return 1;
    }
    function okExprMatch(m: M)! E {
        transaction {
            const v: int = match m {
                .A :> 1,
                .B :> 2
            };
            ${ins("${v}")}
        }
        return 1;
    }
    let <r:int=0/>
    <button onclick={ @r = failInArm(M.A) !{ _ :> 0, }; @r = propInArm(M.A) !{ _ :> 0, }; @r = txInArm(M.A) !{ _ :> 0, }; @r = returnInArm(M.A) !{ _ :> 0, }; @r = okExprMatch(M.A) !{ _ :> 0, }; }>x</button>
</program>
`;
    const all = errs(fe(src));
    const flows = all.filter((d) => d.code === "E-TRANSACTION-CONTROL-FLOW");
    expect(flows.length).toBe(4);
  });

  // S478 open-Qs ruling item 21 (a) — §19.10.4 "A `!` function that reaches no query (S478)": the
  // block "SHALL compile as a plain block: its statements run once, in order, and its exits keep
  // their ordinary meaning" (before: refused by name, E-BOOTSTRAP-UNSUPPORTED).
  test("S478 ruling 21 (a) — a block in a `!` function that reaches no query compiles as a plain block", async () => {
    const src = `<program>
${E}
    function noDb(a: int)! E {
        let n: int = a;
        transaction {
            n = n * 10;
            if (a > 5) { fail .Bad; }
            n = n + 2;
        }
        return n;
    }
    let <r:int=0/>
    <button id="b" onclick={ @r = noDb(3) !{ _ :> -1, }; }>x</button>
    <button id="c" onclick={ @r = noDb(9) !{ _ :> -1, }; }>y</button>
    <p id="o">\${@r}</p>
</program>
`;
    const r = fe(src);
    expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
    expect(mods().check.checkCore(r.core)).toEqual([]);
    await loadProgram(r.core, "s478-sb-" + k++);
    click($("#b"));
    expect($("#o").textContent).toBe("32");
    click($("#c"));
    expect($("#o").textContent).toBe("-1");
  });

  // S478 open-Qs ruling item 21 (b) — §19.10.4 "A client-placed `!` function SHALL NOT hold a
  // `transaction` block — PERMANENT (S478)": E-TX-CLIENT-PLACED.
  test("S478 ruling 21 (b) — a block in a client-placed `!` function that reaches a query: E-TX-CLIENT-PLACED", () => {
    const src = `<program db="./app.db">
${E}
    function save(a: int)! E {
        ${ins("${a}")}
        return 1;
    }
    function onClient(a: int)! E {
        transaction {
            const x: int = save(a)?;
            @r = x;
        }
        return 1;
    }
    let <r:int=0/>
    <button onclick={ @r = onClient(1) !{ _ :> 0, }; }>x</button>
</program>
`;
    const all = errs(fe(src));
    const c = all.filter((d) => d.code === "E-TX-CLIENT-PLACED");
    expect(c.length).toBe(1);
    expect(c[0].message).toContain("Move the block into a `!` server function");
    expect(all.map((d) => d.code)).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
  });

  // S478 (#1920 review MED-1, g-boot-transaction-in-handler-no-diagnostic-s478) — §19.10.4: "An
  // event-handler attribute body (`onclick={ … }`) … is not a `!` function, so a `transaction`
  // block there is E-ERROR-001". Before: no front-end diagnostic, then C-TX4 "a compiler defect".
  test("S478 — a block in an event-handler body: E-ERROR-001 (not a Core defect)", () => {
    for (const h of ["{ transaction { @r = 1; } }", "{ if (@r > 0) { transaction { @r = 1; } } }"]) {
      const c = codes(`<program>
    let <r:int=0/>
    <button onclick=${h}>x</button>
</program>
`);
      expect(c).toEqual(["E-ERROR-001"]);
    }
  });

  test("a block in a `!` server body compiles clean (no refusal)", () => {
    expect(codes(fn("fine(a: int)! E", `        transaction {
            ${ins("${a}")}
        }
        return 1;`))).toEqual([]);
  });
});

// S478 open-Qs ruling item 22 — §19.10.3 "An exit after a write warns (S478)": W-TX-EXIT-ROLLS-BACK
// when a `return` / `break` / `continue` leaves a `transaction { … }` block after the block wrote.
describe("§19.10.3 — W-TX-EXIT-ROLLS-BACK (S478 ruling 22)", () => {
  const warns = (src) => fe(src).diags.filter((d) => d.code === "W-TX-EXIT-ROLLS-BACK");
  test("the three exits of the runtime program each warn once, as a Warning", () => {
    const w = warns(TX);
    expect(w.map((d) => d.severity)).toEqual(["Warning", "Warning", "Warning"]);
    expect(w.map((d) => d.message.match(/in '(\w+)'/)[1]).sort()).toEqual(["breaksOut", "continuesOut", "returnsOut"]);
    expect(w[0].message).toContain("ROLLS BACK");
    expect(w[0].message).toContain("after it");
  });
  const one = (body, extra = "") => `<program db="./app.db">
${E}${extra}
    function f(a: int)! E {
${body}
    }
    let <r:int=0/>
    <button onclick={ @r = f(1) !{ _ :> 0, }; }>x</button>
</program>
`;
  test("an exit BEFORE every write (an early-return guard) is not reported", () => {
    expect(warns(one(`        transaction {
            if (a > 5) { return 0; }
            ${ins("${a}")}
        }
        return 1;`))).toEqual([]);
  });
  test("a `return` after the block, and a `continue` whose loop is inside the block, are not reported", () => {
    expect(warns(one(`        transaction {
            ${ins("${a}")}
            for (let i = 0; i < 3; i = i + 1) {
                if (i == 1) { continue; }
            }
        }
        return 1;`))).toEqual([]);
  });
  test("a write through a call (the callee's transitive query set holds a write) counts", () => {
    // (f reads first, so it is server-placed: a client `!` function may not hold a block at all)
    const w = warns(one(`        const n = ${SQ}\`SELECT a FROM log\`}.all();
        transaction {
            const x: int = g(a)?;
            if (x > 0) { return x; }
        }
        return 1;`, `
    function g(a: int)! E {
        ${ins("${a}")}
        return a;
    }`));
    expect(w.length).toBe(1);
  });
  test("a read before the exit is not a write", () => {
    expect(warns(one(`        transaction {
            const n = ${SQ}\`SELECT a FROM log\`}.all();
            if (a > 0) { return 2; }
            ${ins("${a}")}
        }
        return 1;`))).toEqual([]);
  });
});
