// =============================================================================
// scrml bootstrap SERVER runtime — unit U1c (the server half of the server
// boundary). TARGET code: the JavaScript a server artifact printed by
// compiler/self-host-v2/print-server.scrml runs against. It is not compiler code.
//
// Design authority: scrml-support/docs/deep-dives/bootstrap-u1-server-boundary-
// design-2026-10-03.md §4 ("Server artifact = a factory, not a module with
// globals"), §5 ("Lower (U1c)"), and the S467 §13 amendment; the wire contract
// is the U1b design's Item 3 (bootstrap-u1b-client-server-call-design-
// 2026-10-04.md), whose CLIENT half is runtime.js `call` / `classify`.
//
// What lives here, each in ONE place:
//   - `connection(host, desc)` — one per database a program declares, built by
//     `createServer(host)`: the host INJECTS the driver (`host.connect(desc)`,
//     a Bun.SQL-shaped tagged-template function), so nothing is a module-level
//     global shared by every request (design §4, "Injected connection").
//   - `query(conn, mode, text, params, slots)` — a `?{}` (SPEC §8): the SQL text is a
//     frozen template (`sqlText`) and the values travel ONLY as the driver's
//     bound parameters — there is no path on which a value becomes SQL text
//     (§8.1, E-SQL-001 unrepresentable). A driver failure is a VALUE: a Failure
//     whose error is a `SqlError` variant (§19.8.1), plus a server log line.
//   - `route(desc, run)` + `server(host, routes)` — every compiler-internal
//     route through one handler: method, the §39.2.3 baseline double-submit CSRF
//     check, a STRICT decode of the arguments (§57.4 R10: malformed → 400, the
//     body never runs), the body, the encode of its answer (200 + the value, 204
//     for a function that yields no value, or the §19.9.1 / §57.8 `fail`
//     envelope with the §19.9.2 status) — and a COMPLETE response on every path
//     (§12.5.3), including an exception (500, a fixed text; the reason goes to
//     the server log, never to the client).
//
// The server bodies themselves are plain async JavaScript: Core's
// `Stmt.Suspend` prints as `await` (and nothing else does), so this module
// never decides what to await (S467 §13 gate item 1).
// =============================================================================

import { encode, decode, failure, failed, runDefers, eq, indexRead, atRead, writePath, CodecDefect, CSRF_COOKIE, CSRF_HEADER,
  strSlice, strCharAt, strSplit, strLength, strIncludes, strStartsWith, strEndsWith,
  strIndexOf, strLastIndexOf, strReplace, strReplaceAll, strPadStart, strPadEnd, strRepeat,
  parseIntText, parseNumText, parseBoolText, textOf,
  sortNum, sortStr, sortBy, reversed, joinStr, hostResult } from "./runtime.js";

// What printed server bodies call through `rt.` (print.scrml prints them for
// both artifacts): a failure value, the test for one, the `defer` stack,
// structural equality (§45), (s469) the tape index reads (§49.13), and (s469)
// the typed string / tape built-ins.
export { failure, failed, runDefers, eq, indexRead, atRead, writePath };   // s472: writePath — a local part write (print.scrml assignedJs)
export { strSlice, strCharAt, strSplit, strLength, strIncludes, strStartsWith, strEndsWith, sortNum, sortStr, sortBy, reversed, joinStr };
// s469 — the admitted string additions (Appendix D.1) and the strict parses (§14.13.4): the SAME
// function objects the client runtime exports (one definition, never a server copy)
export { strIndexOf, strLastIndexOf, strReplace, strReplaceAll, strPadStart, strPadEnd, strRepeat };
export { parseIntText, parseNumText, parseBoolText };
// s469 — a logic template slot's text (§14.13.3, §20.7.2)
export { textOf };
// s472 (boot-math-port) — a host-backed function's return-point decode (§21.3.1; print.scrml hostFnJs)
export { hostResult };

// ---------------------------------------------------------------------------
// SQL text. A query site's literal runs, frozen once at module load, in the
// shape a tagged-template driver takes (an array with `raw`): Bun.SQL refuses a
// plain array as a template (it reads it as a value list).
// ---------------------------------------------------------------------------
export function sqlText(chunks) {
  const strings = [...chunks];
  Object.defineProperty(strings, "raw", { value: Object.freeze([...chunks]), enumerable: false });
  return Object.freeze(strings);
}

// ---------------------------------------------------------------------------
// Connections (§8.1.1 / §44.2). `desc` = { driver: "sqlite" | "postgres" |
// "mysql", target, file }: `target` is the connection value with any `sqlite:`
// prefix removed, `file` the project-relative path of the declaring file (a
// relative SQLite path resolves against ITS directory, §8.1.1 "Resolution
// base"). The driver is opened lazily, once, on the first query.
// ---------------------------------------------------------------------------
//
// s474 r1 (review F3) — ONE connection, with ONE gate, per DATABASE: two `<db>` scopes naming the
// same file (`./app.db` and `app.db`, or a nested `<db src=>` repeating the program's `db=`) are
// one database (SPEC §8.9.2: "compares databases, not spellings: scopes naming the same database
// are the same database"), so `connection()` hands both the same record, keyed by `connKey` — the
// same identity analyze.scrml `dbKeyOf` compares at compile time. Before this a second scope opened
// a second SQLite connection to the file, outside the first one's gate and transaction: a write
// through it during an envelope failed "database is locked" and was lost. `:memory:` is never
// shared (every connection to it is a fresh database, as at compile time).
const sharedConns = new WeakMap();
const defaultHostConns = new Map();
function connRegistry(host) {
  if (host === null || typeof host !== "object") return defaultHostConns;
  let m = sharedConns.get(host);
  if (m === undefined) {
    m = new Map();
    sharedConns.set(host, m);
  }
  return m;
}

export function connKey(desc) {
  if (desc.driver !== "sqlite") return desc.driver + ":" + desc.target;
  if (desc.target === ":memory:") return null;
  let path = desc.target;
  if (!path.startsWith("/")) {
    const slash = desc.file.lastIndexOf("/");
    if (slash >= 0) path = desc.file.slice(0, slash) + "/" + path;
  }
  const abs = path.startsWith("/");
  const out = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === ".." && out.length > 0 && out[out.length - 1] !== "..") out.pop();
    else out.push(seg);
  }
  return "sqlite:" + (abs ? "/" : "") + out.join("/");
}

// s474 r2 (review of #1699, item 1) — the RUNTIME identity of a SQLite file is its REAL path:
// `connKey` compares spellings (as analyze.scrml `dbKeyOf` does at compile time), and a spelling
// can hide a symlink (`./a/../app.db` with `a` a link to another directory names a different
// file than `./app.db`). Connections are shared by real path, so two scopes on two files never
// merge; and when two scopes the COMPILER treated as one database (spelling-equal) turn out to be
// two files, the server refuses to start — the compiler checked an envelope against one database
// that is really two, so serving would run some of its statements outside the transaction.
const fsMod = globalThis.process && typeof globalThis.process.getBuiltinModule === "function"
  ? globalThis.process.getBuiltinModule("node:fs") : null;
// The path the OS opens, with KERNEL semantics: each component is resolved in turn and a symlink
// replaced by its target BEFORE the next `..` applies — `./a/../app.db` with `a` a link to
// `other/sub` is `other/app.db`. (Bun's `fs.realpathSync`, `.native` included, normalizes `..`
// lexically first and would answer `./app.db` — measured, Bun 1.4.3.) A component that does not
// exist yet ends the walk: the rest is appended as written (normalized).
function osPath(p, depth = 0) {
  if (depth > 40) throw new Error("too many levels of symbolic links: " + p);
  let cur = "";
  const segs = p.split("/");
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      cur = cur.slice(0, Math.max(0, cur.lastIndexOf("/")));
      continue;
    }
    const next = cur + "/" + seg;
    let st = null;
    try { st = fsMod.lstatSync(next); } catch { st = null; }
    if (st === null) {
      const rest = segs.slice(i + 1).filter((x) => x !== "" && x !== ".");
      return lexical([next, ...rest].join("/"));
    }
    if (st.isSymbolicLink()) {
      const target = fsMod.readlinkSync(next);
      cur = osPath(target.startsWith("/") ? target : cur + "/" + target, depth + 1);
    } else {
      cur = next;
    }
  }
  return cur === "" ? "/" : cur;
}
function lexical(p) {
  const out = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === ".." && out.length > 0) out.pop();
    else if (seg !== "..") out.push(seg);
  }
  return "/" + out.join("/");
}
function realKeyOf(host, desc, spellKey) {
  if (desc.driver !== "sqlite" || spellKey === null) return spellKey;
  let abs = resolveSqlitePath(host, desc);
  if (!abs.startsWith("/") && globalThis.process) abs = globalThis.process.cwd() + "/" + abs;
  if (fsMod === null) return "sqlite-real:" + abs;
  try {
    return "sqlite-real:" + osPath(abs);
  } catch {
    return "sqlite-real:" + abs;
  }
}
const spellToReal = new WeakMap();
const defaultSpellToReal = new Map();

export function connection(host, desc) {
  const spellKey = connKey(desc);
  const key = realKeyOf(host, desc, spellKey);
  if (spellKey !== null) {
    let s2r = defaultSpellToReal;
    if (host !== null && typeof host === "object") {
      s2r = spellToReal.get(host);
      if (s2r === undefined) {
        s2r = new Map();
        spellToReal.set(host, s2r);
      }
    }
    const seen = s2r.get(spellKey);
    if (seen !== undefined && seen !== key) {
      throw new Error(`scrml server: two database scopes the compiler read as ONE database (${spellKey}, declared in ${desc.file}) are two different files on this host (${seen.slice(12)} and ${key.slice(12)} — a symbolic link in the path). A \`!\` function's transaction was checked against one database, so the server does not start; write the same path in both scopes, or remove the link`);
    }
    s2r.set(spellKey, key);
  }
  const reg = connRegistry(host);
  if (key !== null && reg.has(key)) return reg.get(key);
  let sql = null;
  const conn = {
    desc,
    open() {
      if (sql === null) sql = connectWith(host, desc);
      return sql;
    },
    log(line) { logLine(host, line); },
    // s474 (U1e): the §19.10.6 gate — one owner on the connection at a time
    gate: fifoGate(host, desc),
  };
  if (key !== null) reg.set(key, conn);
  return conn;
}

// ---------------------------------------------------------------------------
// s474 (U1e) — SPEC §19.10.6 "Concurrent Requests — One Transaction per
// Connection": "Concurrent requests SHALL NOT observe or join another request's
// open transaction"; "A transaction SHALL hold its connection from its `BEGIN`
// until its `COMMIT` or `ROLLBACK`, across every suspension point in between. On
// a single-connection database (SQLite), a statement from another request SHALL
// wait until the transaction ends. Waiting requests SHALL be served in arrival
// order"; (S451 R5) "The gate covers every statement on the connection".
//
// THE GATE: a FIFO async mutex per connection. A SQLite connection is ONE
// connection, so EVERY statement on it passes the gate — a statement inside an
// envelope (the envelope holds the gate from BEGIN to COMMIT / ROLLBACK) and an
// autocommit `?{}` outside any (it holds the gate for that one statement).
// Measured on Bun.SQL before this (sqlite :memory:): request B's autocommit
// INSERT, issued while request A sat between BEGIN and ROLLBACK, ran inside A's
// transaction and was rolled back with it.
//
// THE OWNER: an envelope runs its body inside an AsyncLocalStorage scope that
// names its open transaction (per connection). A statement issued from that
// scope — the `!` function's own `?{}`, and those of every function it calls in
// place, `!` or not — runs on the transaction WITHOUT waiting (§19.10.6 "A
// statement issued by the request that owns the transaction — including from a
// server function that request calls in-process — SHALL run inside the
// transaction without waiting"). Any other statement waits at the gate.
//
// Pooled drivers (Postgres / MySQL) are not gated here: the bootstrap builds no
// envelope on them (analyze.scrml refuses one — a pooled transaction needs a
// connection reserved from the pool, which is not built), so a statement there
// never meets an open transaction of another request.
// ---------------------------------------------------------------------------
// s474 r1 (review F5): there is no timeout (g-boot-envelope-gate-no-timeout-s474) — a holder that
// never finishes holds the connection; a server log line names it after GATE_SLOW_MS.
const GATE_SLOW_MS = 30000;
function fifoGate(host, desc) {
  let held = false;
  let slow = null;
  const waiting = [];
  const watch = () => {
    if (slow !== null) clearTimeout(slow);
    slow = setTimeout(() => {
      logLine(host, `scrml server: the connection to ${desc.driver}:${desc.file} has been held for over ${GATE_SLOW_MS / 1000} s by one owner; ${waiting.length} statement(s) / transaction(s) wait behind it (§19.10.6 — no gate timeout)`);
    }, GATE_SLOW_MS);
    if (slow && typeof slow.unref === "function") slow.unref();
  };
  // s474 r2 (review item 4): the timer is armed only when the gate is CONTENDED (a waiter exists) —
  // an uncontended acquisition costs no timer (measured ~15% on concurrent reads when it did)
  const unwatch = () => {
    if (slow !== null) clearTimeout(slow);
    slow = null;
  };
  return {
    acquire() {
      if (!held) {
        held = true;
        return Promise.resolve();
      }
      if (slow === null) watch();
      return new Promise((resolve) => waiting.push(resolve));
    },
    release() {
      const next = waiting.shift();
      if (next === undefined) {
        held = false;
        unwatch();
      } else {
        if (waiting.length > 0) watch(); else unwatch();
        next();   // handed straight to the next in arrival order (still held)
      }
    },
  };
}

// The scope store: a Map from a connection to the transaction this scope owns on it.
let txScope = null;
function scopeStore() {
  if (txScope === null) {
    const hooks = globalThis.process && typeof globalThis.process.getBuiltinModule === "function"
      ? globalThis.process.getBuiltinModule("node:async_hooks") : null;
    if (!hooks || typeof hooks.AsyncLocalStorage !== "function") {
      throw new Error("scrml server: no AsyncLocalStorage — a `!` function's transaction cannot be held across its waits");
    }
    txScope = new hooks.AsyncLocalStorage();
  }
  return txScope;
}

// The open transaction this scope owns on `conn`, or null. s474 r1 (review F6): a scope whose
// transaction on `conn` has ENDED (a statement left running past its envelope — unreachable from
// scrml, which awaits every query) throws instead of autocommitting outside the rollback.
function ownTx(conn) {
  if (txScope === null) return null;
  const m = txScope.getStore();
  if (m === undefined) return null;
  const tx = m.get(conn);
  if (tx === undefined) return null;
  if (!tx.open) throw new Error(`scrml server: a statement on ${conn.desc.driver}:${conn.desc.file} was issued after the transaction of its envelope ended — refused, never autocommitted`);
  return tx;
}

const GATED = new Set(["sqlite"]);
function gated(conn) {
  return GATED.has(conn.desc.driver);
}

// A compiler-issued control statement (BEGIN / SAVEPOINT / …): fixed text, no values.
function control(conn, text) {
  return conn.open()(sqlText([text]));
}

// After a statement failed INSIDE a transaction: is the transaction still open?
// SQLite rolls a transaction back BY ITSELF on some errors (an `ON CONFLICT
// ROLLBACK` / `OR ROLLBACK` conflict, SQLITE_FULL, SQLITE_IOERR, SQLITE_NOMEM,
// SQLITE_BUSY, SQLITE_INTERRUPT); every later statement would then autocommit,
// outside any rollback. The probe is a `BEGIN`: inside an open transaction
// SQLite refuses it ("cannot start a transaction within a transaction") and
// nothing changes; if it SUCCEEDS the transaction was gone — the probe's own
// transaction is rolled back at once and the envelope is BROKEN: every later
// statement in it throws, and so does the envelope (a host error: the route
// answers 500, never success — its writes are gone).
async function probeTx(tx) {
  try {
    await control(tx.conn, "BEGIN DEFERRED");
  } catch (e) {
    if (/within a transaction/i.test(messageOf(e))) return;
    tx.broken = true;
    return;
  }
  tx.broken = true;
  try { await control(tx.conn, "ROLLBACK"); } catch { /* the probe's own; nothing in it */ }
}

function brokenError(conn) {
  return new Error(`scrml server: the database ${conn.desc.driver}:${conn.desc.file} rolled the transaction back by itself (an ON CONFLICT ROLLBACK or a database fault) — the \`!\` function's writes are gone, and nothing after it may commit`);
}

// ---------------------------------------------------------------------------
// s474 (U1e) — THE IMPLICIT PER-HANDLER TRANSACTION (SPEC §8.9.2 / §19.10.5) and
// its nesting (§19.10.6). Printed by print-server.scrml around the body of every
// `!` function the compiler gave an envelope (CoreProgram.envelopes):
//
//   async function move(a) {
//     async function body$() { … the function's own body … }
//     return await rt.envelope(db$1, body$, true, "IMMEDIATE");
//   }
//
// `begin` (S474 ruling 5, user-voice-scrml.md "RULED — S474 review-surfaced
// decisions" item 5: "The implicit envelope opens with `BEGIN IMMEDIATE` when its
// transitive query set contains a write, `BEGIN DEFERRED` otherwise"):
// "IMMEDIATE" or "DEFERRED", decided by the COMPILER from the envelope's query
// set (analyze.scrml envelopeOf → core.scrml Envelope.writes) and printed as a
// literal. IMMEDIATE takes SQLite's RESERVED lock at BEGIN, so a second process
// holding a write lock surfaces as SQLITE_BUSY from the BEGIN itself — the
// envelope fails before any statement of the body runs — instead of at the
// envelope's first write, after its reads (the late conflict a DEFERRED
// read-then-write transaction meets: SQLITE_BUSY_SNAPSHOT under WAL, BUSY under
// a rollback journal; g-boot-envelope-begin-deferred-late-conflict-s474). A
// read-only set stays DEFERRED (no write lock is taken; readers do not block a
// writer). A savepoint inside an enclosing envelope issues no BEGIN; the
// enclosing envelope's set already contains the inner one's queries (F10).
//
// §8.9.2: "the compiler SHALL wrap the handler body in `?{BEGIN DEFERRED}` /
// `?{COMMIT}` (`?{ROLLBACK}` on an exception or a `fail` exit)"; "The implicit
// handler transaction SHALL COMMIT only when the handler completes
// successfully. It SHALL ROLL BACK when the handler throws AND when it exits
// through `fail` — at any depth of the body — including a `?` that propagates a
// callee's failure … The failure value is returned to the caller unchanged; only
// its writes are undone." A `fail` / `?` is a RETURNED failure value (§19.1 —
// runtime.js `failure`), so the envelope reads the body's result: a failure →
// ROLLBACK and the failure returned; a throw (a host error, a trap) → ROLLBACK
// and the throw continues (the route answers 500); anything else → COMMIT.
//
// §19.10.6 Nesting (S473 #1690 review F10: "An inner `!` call inside an outer
// envelope runs as a nested savepoint … so the outer can roll back the inner's
// writes"): when this scope already owns a transaction on `conn`, the body runs
// under `SAVEPOINT` — `RELEASE` on success, `ROLLBACK TO` (then `RELEASE`) on a
// failure or a throw — and neither commits nor ends the enclosing transaction,
// so a later `fail` in the outer function still rolls everything back.
//
// `standalone`: whether this function needs its own transaction when no
// enclosing one is open (its transitive query set has two or more queries, or
// one reached more than once — §8.9.2 amendment). A `!` function with one query
// in its set is printed with `standalone = false`: outside a transaction it runs
// as written (one statement autocommits atomically by itself), inside one it is
// a savepoint like any inner `!` call.
//
// "A failed `COMMIT` SHALL NOT release the connection … the `ROLLBACK` that
// follows releases it" — so a failed COMMIT is followed by ROLLBACK, then the
// release, then a throw (the call does not report success: its writes are gone).
// ---------------------------------------------------------------------------
const BEGINS = { IMMEDIATE: "BEGIN IMMEDIATE", DEFERRED: "BEGIN DEFERRED" };
export async function envelope(conn, run, standalone, begin) {
  if (!Object.hasOwn(BEGINS, begin)) {
    throw new Error(`scrml server: an envelope's BEGIN must be "IMMEDIATE" or "DEFERRED" (the compiler decides it from the query set), got ${String(begin)}`);
  }
  const outer = ownTx(conn);
  if (outer !== null) return savepoint(outer, run);
  if (!standalone) return run();
  const als = scopeStore();
  await conn.gate.acquire();
  const tx = { conn, open: true, broken: false, seq: 0, stack: [] };
  try {
    try {
      await control(conn, BEGINS[begin]);
    } catch (e) {
      // "after a `BEGIN` that fails" the connection is released (the finally below)
      conn.log(`scrml server: BEGIN on ${conn.desc.driver}:${conn.desc.file} failed — ${messageOf(e)}`);
      throw e;
    }
    const store = new Map(als.getStore() ?? []);
    store.set(conn, tx);
    let result;
    try {
      result = await als.run(store, run);
    } catch (e) {
      await rollbackQuiet(tx, "ROLLBACK");
      throw e;
    }
    if (tx.broken) {
      await rollbackQuiet(tx, "ROLLBACK");
      throw brokenError(conn);
    }
    if (failed(result)) {
      await rollbackQuiet(tx, "ROLLBACK");
      return result;
    }
    try {
      await control(conn, "COMMIT");
    } catch (e) {
      conn.log(`scrml server: COMMIT on ${conn.desc.driver}:${conn.desc.file} failed — ${messageOf(e)}; rolled back`);
      await rollbackQuiet(tx, "ROLLBACK");
      throw e;
    }
    return result;
  } finally {
    tx.open = false;
    conn.gate.release();
  }
}

// s474 r1 (review F6): savepoints are strictly nested — SQLite's RELEASE / ROLLBACK TO of an
// outer savepoint also ends every newer one, so two inner envelopes interleaved on one transaction
// (concurrent calls inside one body — unreachable from scrml, which awaits each call) would end each
// other's. The one being ended must be the innermost open one; anything else throws (the enclosing
// envelope then rolls everything back).
async function savepoint(tx, run) {
  if (tx.broken) throw brokenError(tx.conn);
  tx.seq = tx.seq + 1;
  const name = "scrml_sp_" + tx.seq;
  await control(tx.conn, "SAVEPOINT " + name);
  tx.stack.push(name);
  let result;
  try {
    result = await run();
  } catch (e) {
    await undoSavepoint(tx, name);
    throw e;
  }
  if (tx.broken) throw brokenError(tx.conn);
  if (failed(result)) {
    await undoSavepoint(tx, name);
    return result;
  }
  innermost(tx, name);
  await control(tx.conn, "RELEASE " + name);
  tx.stack.pop();
  return result;
}

function innermost(tx, name) {
  if (tx.stack[tx.stack.length - 1] !== name) {
    tx.broken = true;
    throw new Error(`scrml server: savepoint ${name} is not the innermost open one (${tx.stack.join(", ")}) — two nested envelopes overlapped on one transaction; the enclosing transaction is rolled back`);
  }
}

async function undoSavepoint(tx, name) {
  if (tx.broken) return;   // nothing left to roll back to — the outer envelope throws
  innermost(tx, name);
  await control(tx.conn, "ROLLBACK TO " + name);
  await control(tx.conn, "RELEASE " + name);
  tx.stack.pop();
}

async function rollbackQuiet(tx, text) {
  try {
    await control(tx.conn, text);
  } catch (e) {
    // a transaction the database already ended answers "no transaction is active"
    if (!tx.broken) tx.conn.log(`scrml server: ROLLBACK on ${tx.conn.desc.driver}:${tx.conn.desc.file} failed — ${messageOf(e)}`);
  }
}

function connectWith(host, desc) {
  if (host && typeof host.connect === "function") return host.connect(desc);
  // The default host: Bun's SQL client — the engine a deployed server runs.
  const SQL = globalThis.Bun && globalThis.Bun.SQL;
  if (typeof SQL !== "function") throw new Error("scrml server: no database driver — pass `host.connect(desc)` to createServer");
  if (desc.driver === "sqlite") {
    if (desc.target === ":memory:") return new SQL(":memory:");
    return new SQL("sqlite://" + resolveSqlitePath(host, desc));
  }
  return new SQL(desc.target);
}

function resolveSqlitePath(host, desc) {
  const t = desc.target;
  if (t.startsWith("/")) return t;
  const root = host && typeof host.root === "string" ? host.root : (globalThis.process ? globalThis.process.cwd() : ".");
  const dir = desc.file.includes("/") ? desc.file.slice(0, desc.file.lastIndexOf("/")) : "";
  const parts = [root, dir, t].filter((s) => s !== "");
  return parts.join("/").replace(/\/\.\//g, "/");
}

function logLine(host, line) {
  if (host && typeof host.log === "function") {
    try { host.log(line); } catch { /* a logger must not take the request down */ }
    return;
  }
  globalThis.console.error(line);
}

// ---------------------------------------------------------------------------
// A query (§8.3): `mode` "all" → the rows (an array of plain objects), "get"
// → the first row or `not` (null), "run" → nothing (null). "No row" is not a
// failure (§19.8.3). A driver error is the Failure the query's Attempt
// inspects — its error a `SqlError` value (§19.8.1: QueryFailed(message),
// ConstraintViolation(field), ConnectionLost), in the runtime's enum shape
// (a unit variant is its name; a payload variant `{ variant, data: [...] }`).
// The message stays on the server: it reaches a client only if the author's
// own code returns it.
// ---------------------------------------------------------------------------
// `params`: each DISTINCT value, evaluated once (§8.2); `slots[i]`: the param the
// template's i-th `${}` binds (core.scrml SqlQuery — C-SQL1 lines them up).
// s474 (U1e): inside an envelope this scope owns, the statement runs on the
// transaction at once; any other statement on a gated (SQLite) connection waits
// at the §19.10.6 gate for its turn and holds it for this one statement.
export async function query(conn, mode, text, params, slots) {
  const tx = ownTx(conn);
  if (tx !== null) {
    if (tx.broken) throw brokenError(conn);
    return runQuery(conn, mode, text, params, slots, tx);
  }
  if (!gated(conn)) return runQuery(conn, mode, text, params, slots, null);
  await conn.gate.acquire();
  try {
    return await runQuery(conn, mode, text, params, slots, null);
  } finally {
    conn.gate.release();
  }
}

async function runQuery(conn, mode, text, params, slots, tx) {
  let rows;
  try {
    const values = slots.map((i) => params[i]);
    const sql = conn.open();
    rows = await sql(text, ...values);
  } catch (e) {
    const err = sqlErrorOf(e);
    conn.log(`scrml server: a query on ${conn.desc.driver}:${conn.desc.file} failed — ${messageOf(e)}`);
    if (tx !== null) {
      await probeTx(tx);
      if (tx.broken) throw brokenError(conn);
    }
    return failure(err);
  }
  if (mode === "run") return null;
  const list = [];
  for (const r of rows ?? []) list.push(plainRow(r));
  if (mode === "get") return list.length > 0 ? list[0] : null;
  return list;
}

// A row as a value: a fresh plain object of the row's own columns.
function plainRow(r) {
  const out = {};
  if (r === null || typeof r !== "object") return out;
  for (const k of Object.keys(r)) {
    Object.defineProperty(out, k, { value: r[k], enumerable: true, writable: true, configurable: true });
  }
  return out;
}

function messageOf(e) {
  try { return String(e && e.message !== undefined ? e.message : e); } catch { return "an error"; }
}

const CONNECTION_CODES = new Set([
  "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE",
  "ERR_POSTGRES_CONNECTION_CLOSED", "ERR_POSTGRES_CONNECTION_TIMEOUT", "ERR_POSTGRES_IDLE_TIMEOUT",
  "ERR_MYSQL_CONNECTION_CLOSED", "ERR_MYSQL_CONNECTION_TIMEOUT",
  "SQLITE_CANTOPEN", "SQLITE_NOTADB", "SQLITE_IOERR",
]);

// §19.8.1's variants, by the driver's error code (SQLite's `SQLITE_CONSTRAINT*`,
// Postgres class 23 — integrity constraint violation).
export function sqlErrorOf(e) {
  const code = e && typeof e.code === "string" ? e.code : "";
  const msg = messageOf(e);
  if (code.startsWith("SQLITE_CONSTRAINT") || /^23\d\d\d$/.test(code)) {
    const m = /constraint failed: (.*)$/.exec(msg);
    let field = m ? m[1] : "";
    if (field === "" && e && typeof e.column === "string") field = e.column;
    if (field === "" && e && typeof e.constraint === "string") field = e.constraint;
    return { variant: "ConstraintViolation", data: [field] };
  }
  if (CONNECTION_CODES.has(code) || [...CONNECTION_CODES].some((c) => code.startsWith(c))) return "ConnectionLost";
  return { variant: "QueryFailed", data: [msg] };
}

// ---------------------------------------------------------------------------
// The §19.9.1 / §57.8 `fail` envelope: the error value encoded as the same
// variant would be as a value (`"V"` or `{ variant, data: {field: v} }`), plus
// `__scrml_error: true` and `type` (the enum's name). The client decodes it
// strictly against the callee's declared enum (runtime.js `decodeError`).
// ---------------------------------------------------------------------------
export function encodeError(table, value) {
  const root = table && table.root;
  if (root === null || typeof root !== "object" || root.k !== "ref") throw new CodecDefect("codec: encodeError needs a table whose root is an enum ref");
  const d = table.defs[root.def];
  if (d === undefined || d.k !== "enum") throw new CodecDefect("codec: encodeError against a def that is not an enum");
  const r = encode(table, value);
  if (!r.ok) return r;
  const w = r.wire;
  if (typeof w === "string") return { ok: true, wire: { __scrml_error: true, type: d.name, variant: w, data: {} } };
  return { ok: true, wire: { __scrml_error: true, type: d.name, variant: w.variant, data: w.data } };
}

// §19.9.2: the status of a `fail` response. The bootstrap has no `httpStatus`
// attribute on a variant, so the heuristic decides, on the variant's NAME
// (case-insensitive): NotFound → 404; Auth / Forbidden / Unauthorized → 403;
// Validation / Invalid → 400; otherwise 500. (Every declared variant is >= 400
// — the U1b wire contract: a 2xx envelope is Malformed on the client.)
export function failStatus(variant) {
  const v = String(variant).toLowerCase();
  if (v.includes("notfound")) return 404;
  if (v.includes("auth") || v.includes("forbidden") || v.includes("unauthorized")) return 403;
  if (v.includes("validation") || v.includes("invalid")) return 400;
  return 500;
}

// ---------------------------------------------------------------------------
// §39.2.3 baseline double-submit CSRF ("without `auth=`, baseline
// double-submit cookie helpers are auto-emitted on routes that mutate state").
// Every compiler-internal route is a POST, so every one is checked: the
// `scrml_csrf` cookie and the `X-CSRF-Token` header must both be present and
// equal. A request that fails gets 403 (not an envelope — the client reads it
// as Transport(Refused(403))) and a cookie to retry with; the client runtime
// retries ONCE with it (runtime.js `call`).
// ---------------------------------------------------------------------------
// (The pair's names are ONE definition, runtime.js — the client sends what this checks.)
export { CSRF_COOKIE, CSRF_HEADER };

function cookieValue(header, name) {
  if (typeof header !== "string") return "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return ""; }
    }
  }
  return "";
}

// Equal strings in time that does not depend on where they first differ.
function sameToken(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length === 0 || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function freshToken() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Responses — every path ends in one of these (§12.5.3: "a COMPLETE HTTP
// RESPONSE, not a bare value"). The host builds the response object
// (`host.respond(status, headers, body)`), as it supplies the driver: a WinterCG
// host — Bun.serve, the default — is answered with its own `Response`; a test
// host can stand in a plain one. (§12.5.3 binds the artifact's observable
// behaviour, not a JS shape — S278.)
// ---------------------------------------------------------------------------
function respond(host, status, headers, body) {
  if (host && typeof host.respond === "function") return host.respond(status, headers, body);
  return new globalThis.Response(body, { status, headers });
}

function jsonResponse(host, status, body, extra) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (extra) Object.assign(headers, extra);
  return respond(host, status, headers, JSON.stringify(body));
}

function noContent(host) {
  return respond(host, 204, { "Cache-Control": "no-store" }, null);
}

const FIXED = {
  400: { error: "Bad Request" },
  403: { error: "Forbidden" },
  404: { error: "Not Found" },
  405: { error: "Method Not Allowed" },
  500: { error: "Internal Server Error" },
  503: { error: "Service Unavailable" },
};

// A route: its wire descriptor (the SAME table the client artifact's
// `route$<fn>` constant holds — print.scrml `routeJs`, one function for both
// ends) and the function that runs its body with the decoded arguments.
export function route(desc, run) {
  return { path: desc.path, desc, run };
}

// ---------------------------------------------------------------------------
// s473 (boot-failclosed-sql-protect) — SPEC §14.8.10 "An undeclared `tenant_id`
// table is refused (S456)", item (3): "A database not readable at compile time
// … is checked when the BUILT SERVER starts … asks each database which relations
// (tables, views, materialized and foreign tables; not a partition …) carry a
// `tenant_id` column — generated and hidden columns included … While any is
// outside the set, or a database cannot be inspected, the server SHALL NOT
// serve: every request answers `503`, each finding is printed once to the server
// log as E-DEPLOY-DB-TENANT-UNDECLARED naming the database, the relation and the
// fix, and `/_scrml/health` answers `503` naming only a count (the route is
// public) and re-runs the check … on ordinary requests at most one check at a
// time under a bounded backoff (1 s doubling to 30 s) … a database that does not
// answer, or whose catalogue cannot be read, stays refused and is logged as
// *could not be checked*, distinct from *undeclared table found*."
//
// The bootstrap's tenant set is ALWAYS EMPTY (`<schema>` / `<db tables=>` are
// refused at compile), so every `tenant_id` relation is undeclared. Before s473
// the built server served every tenant's rows to every request. The check runs
// lazily, before the first request is answered (the factory is synchronous), and
// once it passes it is not repeated (the SPEC's Limit: a relation created later
// is seen at the next startup). A host that injects its own driver may answer the
// catalogue question itself (`host.tenantRelations(desc)` → the relation names);
// otherwise the question is put to the database through its own connection.
// ---------------------------------------------------------------------------
const TENANT_CATALOGUE = {
  sqlite: "SELECT m.name AS name FROM sqlite_master m JOIN pragma_table_xinfo(m.name) p WHERE m.type IN ('table', 'view') AND lower(p.name) = 'tenant_id'",
  postgres: "SELECT c.relname AS name FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE a.attnum > 0 AND NOT a.attisdropped AND lower(a.attname) = 'tenant_id' AND c.relkind IN ('r', 'v', 'm', 'f', 'p') AND NOT c.relispartition AND n.nspname NOT IN ('pg_catalog', 'information_schema')",
  // s473 r1 (F2): EVERY non-system schema (a `LIKE otherdb.t`, a second database on the server), not only DATABASE()
  mysql: "SELECT CONCAT(table_schema, '.', table_name) AS name FROM information_schema.columns WHERE lower(column_name) = 'tenant_id' AND table_schema NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')",
};

// s474 r1 (review F7): the catalogue questions pass the §19.10.6 gate like every other statement.
async function gatedRun(conn, text) {
  if (!gated(conn)) return conn.open()(sqlText([text]));
  await conn.gate.acquire();
  try {
    return await conn.open()(sqlText([text]));
  } finally {
    conn.gate.release();
  }
}

async function tenantRelations(host, conn) {
  if (host && typeof host.tenantRelations === "function") return [...(await host.tenantRelations(conn.desc))].map(String);
  const text = TENANT_CATALOGUE[conn.desc.driver];
  if (text === undefined) throw new Error(`no catalogue query for the ${conn.desc.driver} driver`);
  if (conn.desc.driver === "mysql") {
    // s473 r1 (F2): a connection with no default database cannot say which schema it serves — not checked, not clean
    const cur = await gatedRun(conn, "SELECT DATABASE() AS db");
    const db = cur && cur[0] ? cur[0].db ?? cur[0].DB : null;
    if (db === null || db === undefined) throw new Error("the connection has no default database (DATABASE() is NULL)");
  }
  const rows = await gatedRun(conn, text);
  const out = [];
  for (const r of rows ?? []) {
    const name = r && typeof r === "object" ? (r.name ?? r.NAME ?? r.relname ?? r.table_name ?? r.TABLE_NAME) : undefined;
    // a row the catalogue query did not shape is unknown — and unknown is not clean
    out.push(name === undefined || name === null ? "(unreadable catalogue row)" : String(name));
  }
  return out;
}

export function tenantGate(host, conns) {
  let ok = conns.length === 0;
  let pending = null;
  let delay = 0;
  let nextAt = 0;
  let count = 0;
  const logged = new Set();
  const once = (key, line) => { if (!logged.has(key)) { logged.add(key); logLine(host, line); } };
  async function check() {
    let found = 0;
    for (const c of conns) {
      const where = `${c.desc.driver}:${c.desc.target} (declared in ${c.desc.file})`;
      let names;
      try {
        names = await tenantRelations(host, c);
      } catch (e) {
        found++;
        once(`x:${where}`, `scrml server: E-DEPLOY-DB-TENANT-UNDECLARED — the database ${where} could not be checked for an undeclared tenant relation (${messageOf(e)}); the server answers 503 until it can be (§14.8.10 item (3))`);
        continue;
      }
      for (const n of names) {
        found++;
        once(`t:${where}:${n}`, `scrml server: E-DEPLOY-DB-TENANT-UNDECLARED — the database ${where} has the relation \`${n}\` carrying a \`tenant_id\` column outside the compilation's tenant set (empty on the bootstrap: <schema> / <db tables=> are not in it), so its rows would reach every request. The server answers 503 until it is fixed: declare it in <schema> so the tenant floor scopes it, or rename the column (§14.8.10 item (3))`);
      }
    }
    count = found;
    if (found === 0) {
      ok = true;
    } else {
      delay = delay === 0 ? 1000 : Math.min(delay * 2, 30000);
      nextAt = Date.now() + delay;
    }
    return ok;
  }
  return {
    get count() { return count; },
    async admit(force) {
      if (ok) return true;
      if (pending !== null) return pending;
      if (!force && Date.now() < nextAt) return false;
      // s473 r1 (F7): a check that itself throws backs off too (it fails closed either way)
      pending = check().catch((e) => {
        logLine(host, `scrml server: the tenant check failed — ${messageOf(e)}`);
        delay = delay === 0 ? 1000 : Math.min(delay * 2, 30000);
        nextAt = Date.now() + delay;
        return false;
      }).finally(() => { pending = null; });
      return pending;
    },
  };
}

// The server a `createServer(host)` returns: its routes, and `fetch(request)`
// — a WinterCG handler (Bun.serve's `fetch`, or a test calling it directly).
// The request is read through `url`, `method`, `headers.get(name)` and `text()`
// only. `conns` (s473): the program's database connections — the tenant gate's.
export function server(host, routes, conns = []) {
  const byPath = new Map();
  for (const r of routes) byPath.set(r.path, r);
  const gate = tenantGate(host, [...new Set(conns)]);   // s474 r1: two scopes on one database are one connection
  return {
    routes: routes.map((r) => ({ path: r.path, method: "POST" })),
    async fetch(request) {
      let path;
      try { path = new URL(request.url, "http://localhost").pathname; } catch { return jsonResponse(host, 400, FIXED[400]); }
      if (conns.length > 0) {
        let admitted;
        try { admitted = await gate.admit(path === "/_scrml/health"); } catch (e) {
          logLine(host, `scrml server: the tenant check failed — ${messageOf(e)}`);
          admitted = false;
        }
        if (path === "/_scrml/health") {
          return admitted ? jsonResponse(host, 200, { status: "ok" }) : jsonResponse(host, 503, { error: "Service Unavailable", undeclared: gate.count });
        }
        if (!admitted) return jsonResponse(host, 503, FIXED[503]);
      }
      const r = byPath.get(path);
      if (r === undefined) return jsonResponse(host, 404, FIXED[404]);
      try {
        return await handle(host, r, request);
      } catch (e) {
        // a defect in this module or the host (never a scrml failure — those are values)
        logLine(host, `scrml server: ${path} — ${messageOf(e)}`);
        return jsonResponse(host, 500, FIXED[500]);
      }
    },
  };
}

async function handle(host, r, request) {
  if (request.method !== "POST") return jsonResponse(host, 405, FIXED[405], { Allow: "POST" });
  // CSRF first: an unproven request runs nothing, decodes nothing.
  const cookie = cookieValue(request.headers.get("Cookie"), CSRF_COOKIE);
  const header = request.headers.get(CSRF_HEADER) ?? "";
  if (!sameToken(cookie, header)) {
    const tok = cookie !== "" ? cookie : freshToken();
    return jsonResponse(host, 403, FIXED[403], { "Set-Cookie": `${CSRF_COOKIE}=${encodeURIComponent(tok)}; Path=/; SameSite=Strict` });
  }
  // The arguments: a JSON ARRAY, one per parameter, each STRICTLY decoded
  // against its parameter's table (§57.4 R10). Anything else is 400 and the
  // body never runs.
  let text;
  try { text = await request.text(); } catch { return jsonResponse(host, 400, FIXED[400]); }
  let wire;
  try { wire = JSON.parse(text); } catch { return jsonResponse(host, 400, FIXED[400]); }
  const params = r.desc.params;
  if (!Array.isArray(wire) || wire.length !== params.length) return jsonResponse(host, 400, FIXED[400]);
  const args = [];
  for (let i = 0; i < params.length; i++) {
    const d = decode(params[i], wire[i], { canonicalOnly: true });
    if (!d.ok) return jsonResponse(host, 400, FIXED[400]);
    args.push(d.value);
  }
  let result;
  try {
    result = await r.run(args);
  } catch (e) {
    logLine(host, `scrml server: ${r.path} threw — ${messageOf(e)}`);
    return jsonResponse(host, 500, FIXED[500]);
  }
  if (failed(result)) {
    if (r.desc.error === null) {
      logLine(host, `scrml server: ${r.path} returned a failure but declares no error type`);
      return jsonResponse(host, 500, FIXED[500]);
    }
    const env = encodeError(r.desc.error, result.error);
    if (!env.ok) {
      logLine(host, `scrml server: ${r.path} — its error does not encode (${env.error.reason})`);
      return jsonResponse(host, 500, FIXED[500]);
    }
    return jsonResponse(host, failStatus(env.wire.variant), env.wire);
  }
  if (r.desc.result === null) return noContent(host);
  const out = encode(r.desc.result, result);
  if (!out.ok) {
    logLine(host, `scrml server: ${r.path} — its answer does not encode (${out.error.reason})`);
    return jsonResponse(host, 500, FIXED[500]);
  }
  return jsonResponse(host, 200, out.wire);
}
