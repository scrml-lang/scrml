// envelope-immediate-s474.test.js — s474-boot-immediate-and-wire-blank, item 1.
//
// Ruling (scrml-support/user-voice-scrml.md, "RULED — S474 review-surfaced decisions 1–7", item 5):
//   "The implicit envelope opens with `BEGIN IMMEDIATE` when its transitive query set contains a
//    write, `BEGIN DEFERRED` otherwise. Changes the §8.9.2 spelling; surfaces a second-process write
//    conflict before any work."
// Closes g-boot-envelope-begin-deferred-late-conflict-s474.
//
// What is pinned:
//   1. COMPILE TIME — analyze decides write-ness from the envelope's query set (every query it
//      reaches: own, through a non-`!` helper, through an inner `!` callee, `.nobatch()` included)
//      and the server artifact spells it: rt.envelope(db$N, body$, true, "IMMEDIATE" | "DEFERRED").
//   2. RUN TIME, against a real SQLite FILE in rollback-journal AND WAL mode, with a SECOND
//      connection holding the write lock: a writing envelope fails AT ITS BEGIN (SQLITE_BUSY) — no
//      statement of its body runs — and the route answers the envelope's failure (a host error, 500);
//      a read-only envelope still opens DEFERRED and completes beside the other writer.
//      On the base (BEGIN DEFERRED for every envelope) the writing envelope ran its SELECT first and
//      met the conflict only at its INSERT — the late conflict the ruling removes.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { SQL } from "bun";
import { Database } from "bun:sqlite";
import { compile, serve, post, pathOf, artifacts, loadServer, plainRespond } from "./server-artifact-harness.js";

const SQ = "?" + "{";
const run = (sql, nb = "") => `${SQ}\`${sql}\`}${nb}.run();`;
const get = (sql) => `${SQ}\`${sql}\`}.get()`;
const E = "    type E:enum = { Bad, QueryFailed(message: string), ConstraintViolation(field: string), ConnectionLost }\n";

const PROGRAM = `<program db="./app.db">
${E}
    function readTwo(a: int)! E {
        const x = ${get("SELECT a FROM log WHERE a = ${a}")};
        const y = ${get("SELECT a FROM log WHERE a = ${a + 1}")};
        return 1;
    }
    function readThenWrite(a: int)! E {
        const x = ${get("SELECT a FROM log WHERE a = ${a}")};
        ${run("INSERT INTO log (a) VALUES (${a})")}
        return 1;
    }
    function readsNobatchWrite(a: int)! E {
        const x = ${get("SELECT a FROM log WHERE a = ${a}")};
        const y = ${get("SELECT a FROM log WHERE a = ${a + 1}")};
        ${run("INSERT INTO log (a) VALUES (${a})", ".nobatch()")}
        return 1;
    }
    function helperWrite(a: int) -> int {
        ${SQ}\`INSERT INTO log (a) VALUES (\${a})\`}.run() !{ _ :> { return 0; } };
        return 1;
    }
    function readsViaWritingHelper(a: int)! E {
        const x = ${get("SELECT a FROM log WHERE a = ${a}")};
        const n: int = helperWrite(a);
        return n;
    }
    function innerWrite(a: int)! E {
        ${run("INSERT INTO log (a) VALUES (${a})")}
        return 1;
    }
    function readsViaWritingBang(a: int)! E {
        const x = ${get("SELECT a FROM log WHERE a = ${a}")};
        const n: int = innerWrite(a)?;
        return n;
    }
    function ddl(a: int)! E {
        const x = ${get("SELECT a FROM log WHERE a = ${a}")};
        ${run("CREATE INDEX IF NOT EXISTS log_a ON log (a)")}
        return 1;
    }
    let <r:int=0/>
    <main>
        <button onclick={ @r = readTwo(1) !{ _ :> 0, }; }>a</button>
        <button onclick={ @r = readThenWrite(1) !{ _ :> 0, }; }>b</button>
        <button onclick={ @r = readsNobatchWrite(1) !{ _ :> 0, }; }>c</button>
        <button onclick={ @r = readsViaWritingHelper(1) !{ _ :> 0, }; }>d</button>
        <button onclick={ @r = readsViaWritingBang(1) !{ _ :> 0, }; }>e</button>
        <button onclick={ @r = innerWrite(1) !{ _ :> 0, }; }>f</button>
        <button onclick={ @r = ddl(1) !{ _ :> 0, }; }>g</button>
    </main>
</program>
`;

let core, js;
beforeAll(() => {
  core = compile(PROGRAM).core;
}, 300000);

// The envelope call printed for function `fn` (the first `return await rt.envelope(` after its header).
function envelopeOf(src, fn) {
  const at = src.search(new RegExp(`async function ${fn}\\w*\\(`));
  if (at < 0) return null;
  const m = /return await rt\.envelope\([^\n]*\);/.exec(src.slice(at));
  return m ? m[0] : null;
}

describe("compile time: the envelope's BEGIN is decided from its query set (S474 ruling 5)", () => {
  test("the server artifact spells IMMEDIATE for a writing set, DEFERRED for a read-only one", async () => {
    ({ js } = await serve(core, () => Promise.resolve([]), []));
    const want = {
      readTwo: "DEFERRED",              // two SELECTs: read-only
      readThenWrite: "IMMEDIATE",       // its own INSERT
      readsNobatchWrite: "IMMEDIATE",   // a `.nobatch()` write is out of the COUNT, not out of the envelope
      readsViaWritingHelper: null,      // one counted query + a helper's: see the next assertion
      readsViaWritingBang: "IMMEDIATE", // an inner `!` writer runs as a savepoint inside it (F10)
      ddl: "IMMEDIATE",                 // DDL is not a pure SELECT
    };
    for (const [fn, begin] of Object.entries(want)) {
      if (begin === null) continue;
      expect([fn, envelopeOf(js, fn)]).toEqual([fn, `return await rt.envelope(db$${envelopeOf(js, fn).match(/db\$(\d+)/)[1]}, body$, true, "${begin}");`]);
    }
    // the helper's write is reached through a non-`!` call: the set has two queries and one writes
    expect(envelopeOf(js, "readsViaWritingHelper")).toContain(`true, "IMMEDIATE")`);
    // a one-query `!` function is not standalone; its spelling is still decided (it writes)
    expect(envelopeOf(js, "innerWrite")).toContain(`false, "IMMEDIATE")`);
  });
  test("the Core carries the decision (Envelope.writes), set by analyze, never by a printer", () => {
    const byName = new Map(core.envelopes.map((e) => [e.fn.hint, e]));
    expect(byName.get("readTwo").writes).toBe(false);
    expect(byName.get("readThenWrite").writes).toBe(true);
    expect(byName.get("readsNobatchWrite").writes).toBe(true);
    expect(byName.get("readsViaWritingHelper").writes).toBe(true);
    expect(byName.get("readsViaWritingBang").writes).toBe(true);
    expect(byName.get("ddl").writes).toBe(true);
  });
});

describe("run time: a second connection holding the write lock (rollback journal and WAL)", () => {
  for (const mode of ["delete", "wal"]) {
    describe(`journal_mode=${mode}`, () => {
      let dir, file, sql, other, srv, routes, logs, seen;
      beforeAll(async () => {
        dir = mkdtempSync(join(tmpdir(), `s474-immediate-${mode}-`));
        file = join(dir, "app.db");
        const setup = new Database(file);
        setup.exec(`PRAGMA journal_mode=${mode.toUpperCase()}`);
        setup.exec("CREATE TABLE log (a INTEGER)");
        setup.close();
        sql = new SQL("sqlite://" + file);
        seen = [];
        // the server's driver, recording the text of every statement it is handed
        const driver = (strings, ...values) => { seen.push(strings.join("?").trim()); return sql(strings, ...values); };
        logs = [];
        ({ srv, routes } = await serve(core, driver, logs));
        other = new Database(file);   // the SECOND writer (another process, as far as SQLite's locks go)
      }, 300000);
      afterAll(async () => {
        try { other.exec("ROLLBACK"); } catch { /* none open */ }
        other.close();
        await sql.close();
        rmSync(dir, { recursive: true, force: true });
      });
      const call = (fn) => post(srv, pathOf(routes, fn), [1]);
      const rows = () => {
        const db = new Database(file, { readonly: true });
        try { return db.query("SELECT a FROM log ORDER BY a").all().map((r) => r.a); } finally { db.close(); }
      };

      test("the journal mode is the one under test", () => {
        expect(String(other.query("PRAGMA journal_mode").get().journal_mode).toLowerCase()).toBe(mode);
      });
      test("a writing envelope fails AT BEGIN IMMEDIATE (SQLITE_BUSY): no statement of its body runs", async () => {
        other.exec("BEGIN IMMEDIATE");
        other.exec("INSERT INTO log (a) VALUES (999)");
        seen.length = 0;
        logs.length = 0;
        const res = await call("readThenWrite");
        other.exec("ROLLBACK");
        // the envelope's failure: the BEGIN threw, so the route answers a host error
        expect(res.status).toBe(500);
        expect(seen).toEqual(["BEGIN IMMEDIATE"]);
        expect(seen.some((s) => /^SELECT|^INSERT/i.test(s))).toBe(false);
        expect(logs.some((l) => /BEGIN on sqlite:.* failed — .*locked/i.test(l))).toBe(true);
        expect(rows()).toEqual([]);
      });
      test("a read-only envelope still opens DEFERRED and completes beside the other writer", async () => {
        other.exec("BEGIN IMMEDIATE");
        other.exec("INSERT INTO log (a) VALUES (999)");
        seen.length = 0;
        const res = await call("readTwo");
        other.exec("ROLLBACK");
        expect(res.status).toBe(200);
        expect(seen[0]).toBe("BEGIN DEFERRED");
        expect(seen.filter((s) => /^SELECT/i.test(s)).length).toBe(2);
        expect(seen[seen.length - 1]).toBe("COMMIT");
      });
      test("with the other writer gone, the writing envelope commits", async () => {
        seen.length = 0;
        const res = await call("readThenWrite");
        expect(res.status).toBe(200);
        expect(seen[0]).toBe("BEGIN IMMEDIATE");
        expect(rows()).toEqual([1]);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// #1703 fix round r1 (review F3): the DEFAULT host's file-backed SQLite handle runs
// `PRAGMA busy_timeout = 5000` then `PRAGMA journal_mode = WAL` before its first statement —
// impl#1's S385 default (compiler/src/codegen/sqlite-defaults.ts). Without it, a writing
// envelope's BEGIN IMMEDIATE answered 500 at once while another PROCESS held the write lock.
// (The blocks above inject their own driver — a host that injects `connect` configures its own,
// so they still see the immediate BUSY.) The other writer here is a real second PROCESS.
// ---------------------------------------------------------------------------
describe("the default host's SQLite handle waits a held lock out (busy_timeout 5000 + WAL)", () => {
  let dir, file, srv, routes, logs;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "s474-busy-"));
    file = join(dir, "app.db");
    const setup = new Database(file);
    setup.exec("CREATE TABLE log (a INTEGER)");
    setup.close();
    const { server } = artifacts(core);
    routes = server.routes;
    const mod = await loadServer(server.js, core);
    logs = [];
    // no `connect`: the server opens the database itself (Bun.SQL), resolved against `root`
    srv = mod.createServer({ root: dir, log: (l) => logs.push(l), respond: plainRespond });
  }, 300000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const rows = () => {
    const db = new Database(file, { readonly: true });
    try { return db.query("SELECT a FROM log ORDER BY a").all().map((r) => r.a); } finally { db.close(); }
  };

  test("the first (uncontended) request configures the handle: the file is WAL afterwards", async () => {
    const res = await post(srv, pathOf(routes, "readTwo"), [1]);
    expect(res.status).toBe(200);
    const db = new Database(file, { readonly: true });
    try { expect(String(db.query("PRAGMA journal_mode").get().journal_mode).toLowerCase()).toBe("wal"); } finally { db.close(); }
  });
  test("a second process holding the write lock ~200 ms: the envelope waits at BEGIN IMMEDIATE, then commits", async () => {
    const script = [
      `const { Database } = require("bun:sqlite");`,
      `const db = new Database(${JSON.stringify(file)});`,
      `db.exec("BEGIN IMMEDIATE");`,
      `db.exec("INSERT INTO log (a) VALUES (999)");`,
      `console.log("locked");`,
      `setTimeout(() => { db.exec("ROLLBACK"); db.close(); }, 200);`,
    ].join("\n");
    const holder = Bun.spawn([process.execPath, "-e", script], { stdout: "pipe" });
    const reader = holder.stdout.getReader();
    let seen = "";
    while (!seen.includes("locked")) {
      const { value, done } = await reader.read();
      if (done) break;
      seen += new TextDecoder().decode(value);
    }
    expect(seen).toContain("locked");
    const t0 = Date.now();
    const res = await post(srv, pathOf(routes, "readThenWrite"), [1]);
    const waited = Date.now() - t0;
    await holder.exited;
    expect(res.status).toBe(200);
    expect(waited).toBeGreaterThanOrEqual(100);
    expect(rows()).toEqual([1]);
    expect(logs.some((l) => /BEGIN on sqlite:.* failed/.test(l))).toBe(false);
  }, 30000);
});
