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

import { writeSync } from "node:fs";
import { encode, decode, channelJudge, CHANNEL_TAPE, failure, failed, unmatchedFailure, runDefers, eq, indexRead, atRead, writePath, CodecDefect, CSRF_COOKIE, CSRF_HEADER,
  strSlice, strCharAt, strSplit, strLength, strIncludes, strStartsWith, strEndsWith,
  strIndexOf, strLastIndexOf, strReplace, strReplaceAll, strPadStart, strPadEnd, strRepeat,
  parseIntText, parseNumText, parseBoolText, textOf,
  sortNum, sortStr, sortBy, reversed, joinStr, hostResult,
  tapeAppend, tapePrepend, tapeDropEnd, tapeDropFront, tapeRemoveAt, tapeConcat, tapeIncludes,
  tapeAppendOwned, tapePrependOwned, tapeDropEndOwned, tapeDropFrontOwned, tapeRemoveAtOwned, writePathOwned } from "./runtime.js";

// What printed server bodies call through `rt.` (print.scrml prints them for
// both artifacts): a failure value, the test for one, the `defer` stack,
// structural equality (§45), (s469) the tape index reads (§49.13), and (s469)
// the typed string / tape built-ins.
export { failure, failed, unmatchedFailure, runDefers, eq, indexRead, atRead, writePath };   // s472: writePath — a local part write (print.scrml assignedJs)
export { strSlice, strCharAt, strSplit, strLength, strIncludes, strStartsWith, strEndsWith, sortNum, sortStr, sortBy, reversed, joinStr };
// s475 — the tape edits as values (a granted edit of a local, an array value with a spread): the SAME functions
export { tapeAppend, tapePrepend, tapeDropEnd, tapeDropFront, tapeRemoveAt, tapeConcat, tapeIncludes };
// s476 — the same edits of a local in place when the printer proved the local owns its value (print.scrml ownedLocals)
export { tapeAppendOwned, tapePrependOwned, tapeDropEndOwned, tapeDropFrontOwned, tapeRemoveAtOwned, writePathOwned };
// s469 — the admitted string additions (Appendix D.1) and the strict parses (§14.13.4): the SAME
// function objects the client runtime exports (one definition, never a server copy)
export { strIndexOf, strLastIndexOf, strReplace, strReplaceAll, strPadStart, strPadEnd, strRepeat };
export { parseIntText, parseNumText, parseBoolText };
// s469 — a logic template slot's text (§14.13.3, §20.7.2)
export { textOf };
// s478 (s478-boot-print-builtins) — `print(…)` / `println(…)` (SPEC §20.7). The printer passes ONE
// string, already space-joined, with println's "\n" appended (lower.scrml printExpr), so this writes it
// verbatim: "raw text with NO origin tag / `file:line` / side classification" (§20.7.6). Program output,
// never stripped (§20.7.4). Its value is `not` (§20.7.1: "the emitted call evaluates to `not`").
//
// The write is SYNCHRONOUS (fs.writeSync on fd 1), not `process.stdout.write`: the §64.3 exit-harness
// is "`const code = await main(process.argv.slice(2)); process.exit(code);`", and `process.exit` drops
// whatever an async stdout write still holds buffered when stdout is a pipe — a tool piped into a slow
// reader lost most of its output (S478 #1900 review, HIGH-1). A synchronous write has left the process
// before `printOut` returns, so the SPEC harness (and its exit code) stays exactly as written. EAGAIN (a
// non-blocking fd 1) retries; EPIPE (the reader closed — `tool | head`) drops the rest of the program's
// output silently, as `process.stdout.write` did, and the program runs on to its own exit code.
let printPipeClosed = false;
export function printOut(s) {
  if (printPipeClosed) return null;
  const b = Buffer.from(s, "utf8");
  let off = 0;
  while (off < b.length) {
    try {
      off += writeSync(1, b, off, b.length - off);
    } catch (e) {
      if (e && e.code === "EAGAIN") continue;
      if (e && e.code === "EPIPE") { printPipeClosed = true; return null; }
      throw e;
    }
  }
  return null;
}
// s472 (boot-math-port) — a host-backed function's return-point decode (§21.3.1; print.scrml hostFnJs)
export { hostResult };
// s477 (s477-boot-tape-bounds) — a bounded tape's runtime length check and a local `insert` (O36 RULED S477): the SAME functions
export { lengthCheck, tapeInsert } from "./runtime.js";
// s478 (s478-boot-refinement-runtime) — a boundary-zone refinement's runtime check (§53.4.5, §53.9.4): the SAME function
export { refineCheck } from "./runtime.js";
// s478 (s478-ruled-stdlib-data): the §41.13 `parseVariant` intrinsic — "callable in both server-side and client-side contexts"
export { parseVariant } from "./runtime.js";
// S479 (#1962 ruling item 5): the §61.3 repeated-key detector moved to runtime.js, shared
// with the standalone §41.13 `parseVariant`; the endpoint decode (handleEndpoint) uses it.
export { jsonRepeatedKey } from "./runtime.js";
import { jsonRepeatedKey as jsonRepeatedKeyRt } from "./runtime.js";
import { refineCheck as refineCheckRt, ScrmlTrap as ScrmlTrapRt } from "./runtime.js";

// Review #1911 MED-1 — a ROUTED server function's parameter refinements, judged in its
// route's entry before the function is called (print.scrml routeEntryChecks). A trap
// raised HERE is the route's own parameter check — a value the client sent — and is
// "the §53.9.4 `E-CONTRACT-001-RT` 400" (§52.13: "a body-carrying compiler response is
// refused when it must pass — the latter turning the compiler's own `400` into a
// `500`"); nothing of the body ran (§53.9.4: "server-side validation code that runs
// before any database write or business logic"). The mark is a module-private
// WeakSet, so no value a program builds can claim it; a trap from anywhere else in
// the body stays a 500.
const ENTRY_TRAPS = new WeakSet();
export function refineEntry(v, base, spec, shown, what, at) {
  try {
    return refineCheckRt(v, base, spec, shown, what, at);
  } catch (e) {
    if (e instanceof ScrmlTrapRt) ENTRY_TRAPS.add(e);
    throw e;
  }
}

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
// s477 — a FOREIGN SLICE (SPEC §23.2.4a), sealed. A `kind="tool"` module (§64)
// builds each of its `_={ … }=` blocks once, at load:
//   const slice$9 = rt.foreignSeal("app.scrml:7:9", `async function (g) {…}`, import.meta);
// and a block is an awaited call of it with its crossings' values, `await slice$9(g)`.
// "A slice is evaluated in a SEALED scope. The names it can resolve are exactly: its
// `in:{}` crossings …; host globals …; the host module context the emitted module would
// itself have — `require`, `__dirname`, `__filename`, and dynamic `import()`." So the
// source TEXT is compiled by the Function constructor, whose only lexical scope is the
// global one (impl#1 compiler/src/codegen/foreign-seal.ts does the same; its comment
// records why real code re-read from `toString()` is unsound under Bun). The module's
// own host context comes in through `meta` — the TOOL module's `import.meta`, read here
// (syntax, never a bare name a binding could own); a name the host does not provide is
// left unbound, as host code sees it.
// "A settled `null`/`undefined` OUT arrives as scrml `not` (§42.9)": `undefined` → null.
// `source` is an `async function (crossings…) { … }` the driver built and syntax-checked
// at compile time (slice-m1/tool-slices.js — E-FOREIGN-006 / E-FOREIGN-007).
// ---------------------------------------------------------------------------
export function foreignSeal(site, source, meta) {
  const hostNames = [];
  const hostValues = [];
  const m = meta !== null && typeof meta === "object" ? meta : {};
  let req = m.require;
  if (typeof req !== "function" && typeof m.url === "string") {
    const proc = globalThis.process;
    const mod = proc && typeof proc.getBuiltinModule === "function" ? proc.getBuiltinModule("module") : null;
    if (mod && typeof mod.createRequire === "function") req = mod.createRequire(m.url);
  }
  const dirname = m.dir ?? m.dirname;
  const filename = m.path ?? m.filename;
  if (typeof req === "function") { hostNames.push("require"); hostValues.push(req); }
  if (typeof dirname === "string") { hostNames.push("__dirname"); hostValues.push(dirname); }
  if (typeof filename === "string") { hostNames.push("__filename"); hostValues.push(filename); }
  const label = String(site).replace(/[\r\n\u2028\u2029]/g, " ");
  // s477 r1 (review F1): built on the slice's FIRST CALL, once — as impl#1's helper does — so
  // loading the module evaluates no slice text. The compile-time check (tool-slices.js) is what
  // proves `source` is exactly one async function; building late only keeps a slice that is never
  // reached from being compiled at all.
  let slice = null;
  return async (...args) => {
    if (slice === null) {
      const build = new globalThis.Function(...hostNames, "\"use strict\";\nreturn (" + source + ");\n//# sourceURL=" + label);
      slice = build(...hostValues);
    }
    try {
      const v = await slice(...args);
      return v === undefined ? null : v;
    } catch (e) {
      // a name the slice reads that is not crossed is not in scope: say so, at the slice
      if (e instanceof globalThis.ReferenceError && typeof e.message === "string" && !e.message.includes("§23.2.4a")) {
        e.message += " (raised in the foreign-code slice at " + label + ": only the names in its in:{} header cross into a slice, plus host globals — SPEC §23.2.4a)";
      }
      throw e;
    }
  };
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
    // s475 r1: how long an envelope waits for a reserved connection's close() (`closeReserved`);
    // a host may shorten it (`reservedCloseWaitMs`, used by the tests)
    closeWaitMs: host !== null && typeof host === "object" && Number.isFinite(host.reservedCloseWaitMs) && host.reservedCloseWaitMs >= 0 ? host.reservedCloseWaitMs : RESERVED_CLOSE_WAIT_MS,
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
// Pooled drivers (Postgres / MySQL): only TRANSACTIONS pass the gate ("Under the
// default, a database's transactions still run one at a time"), and each runs on a
// connection reserved from the pool for it alone (s475 — `txConnection`). Any other
// statement goes straight to the pool and never waits ("A statement from another
// request runs on another pool connection and SHALL NOT wait"): it cannot meet an
// open transaction of another request, which holds its own connection.
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

// A compiler-issued control statement (BEGIN / SAVEPOINT / …): fixed text, no values, on the
// transaction's own connection (`tx.sql` — see `txConnection`).
function control(tx, text) {
  return tx.sql(sqlText([text]));
}

// s475 (lane s475-boot-pg-envelopes) — THE CONNECTION A TRANSACTION RUNS ON. SPEC §19.10.6 "Pooled
// drivers (Postgres, MySQL — §44.2). A transaction SHALL run on one connection taken from the pool
// for it alone, and every statement of the owning request SHALL run on that connection until the
// transaction ends. A statement from another request runs on another pool connection and SHALL NOT
// wait. Under the default, a database's transactions still run one at a time."
//  - SQLite: the database's one connection (`conn.open()`); the §19.10.6 gate keeps every other
//    statement off it while the transaction holds it.
//  - Postgres: a connection RESERVED from the pool (Bun.SQL `reserve()`, Bun 1.3+; measured: a pool
//    query waits for a reserved connection of a `max: 1` pool and runs on another one otherwise).
//    Every statement of the owning scope — the body's, an in-place callee's, a nested `!` call's
//    savepoint, a statement savepoint — runs on it (`ownTx` → `tx.sql`); a statement from any other
//    request goes to the pool and never into this transaction. Before s475 the transaction ran on the
//    pool handle itself: on a `max: 1` pool another request's autocommit statement ran INSIDE it and
//    was rolled back with it while reporting success (review F2), and a larger pool refused the raw
//    `BEGIN` (Bun: ERR_POSTGRES_UNSAFE_TRANSACTION).
//    At the end the connection goes back to the pool (`release`) only when the transaction is known
//    ended (its COMMIT or ROLLBACK succeeded); otherwise it is CLOSED, so a connection still inside a
//    transaction is never handed to another request (measured: Bun's `close()` on a reserved handle
//    closes that connection only; the server rolls back what was open on it).
//    A driver handle with no `reserve()` (a host's own `connect`) is refused: fail closed, never a
//    transaction on a shared connection.
// MySQL envelopes are refused at compile time (analyze.scrml envelopeOf): this path is not proven
// against a MySQL server.
// s475 (g-boot-runtime-envelope-mysql-unguarded-s475) — and refused HERE too, before the driver is
// opened or a connection reserved: a transaction runs only on a driver whose path is proven
// (`TX_DRIVERS`), so a compiler hole, a hand-written server, or a new driver never reaches
// `reserve()` + `BEGIN` on an unproven one. INTERIM: the capable form is a MySQL
// reserved-connection path proven against a live MySQL server (then "mysql" joins TX_DRIVERS, with
// the compile-time refusal lifted in the same change).
const TX_DRIVERS = new Set(["sqlite", "postgres"]);
async function txConnection(conn) {
  if (!TX_DRIVERS.has(conn.desc.driver)) {
    throw new Error(`scrml server: a transaction on ${conn.desc.driver}:${conn.desc.file} is refused — the bootstrap runs a \`!\` envelope only on SQLite or Postgres (§19.10.6: a pooled driver's transaction needs a connection of its own, and the ${conn.desc.driver} path is not proven); nothing was run`);
  }
  const pool = conn.open();
  if (gated(conn)) return { sql: pool, done: async () => {} };
  if (typeof pool.reserve !== "function") {
    throw new Error(`scrml server: ${conn.desc.driver}:${conn.desc.file} is a pooled database and its driver handle has no reserve() — a transaction needs a connection of its own (§19.10.6), so it is refused, never run on a shared connection`);
  }
  const reserved = await pool.reserve();
  return {
    sql: reserved,
    // s475 (g-boot-reserved-close-unawaited-s475): awaited, and its failure caught — a rejected
    // `close()` (or `release()`) is logged, never an unhandled rejection; and the envelope releases
    // its gate only after the connection is given back or closed (or the close wait ran out —
    // `closeReserved`), so the next transaction does not start beside a connection still closing.
    done: async (ended) => {
      try {
        if (ended) await reserved.release(); else await closeReserved(conn, reserved);
      } catch (e) {
        conn.log(`scrml server: giving back the reserved connection to ${conn.desc.driver}:${conn.desc.file} failed — ${messageOf(e)}`);
      }
    },
  };
}

// s475 r1 (review F1): the wait for a reserved connection's close() is BOUNDED. A close() that never
// settles (a dead socket after a failed ROLLBACK) would otherwise hang the failing request — it never
// gets its 500 — and, since the envelope releases the gate after `done`, every later transaction on
// the database. After RESERVED_CLOSE_WAIT_MS the wait is abandoned with one log line, the gate is
// released and the envelope's own error propagates.
// Why releasing the gate then is safe: this path is Postgres only (SQLite is gated and never
// reserves). The next transaction runs on its own reserved connection; whatever locks the stuck
// connection still holds make that transaction WAIT inside Postgres (or fail on a lock timeout), they
// cannot corrupt it — the server rolls back what was open on the stuck connection when it finally
// drops. On a pooled driver correctness does not depend on the gate; the gate there only serializes.
// Bun's ReservedSQL `close({ timeout })` (seconds; measured on Bun 1.4.3) also bounds the close
// itself — passed too, but the race below is the guarantee (a host's driver may ignore it).
// The timer is cleared as soon as close() settles and unref'd, so it never keeps the process alive
// and never fires after a normal close.
const RESERVED_CLOSE_WAIT_MS = 5000;
async function closeReserved(conn, reserved) {
  const ms = conn.closeWaitMs;
  let timer = null;
  const ranOut = new Promise((res) => {
    timer = setTimeout(() => res(true), ms);
    if (timer && typeof timer.unref === "function") timer.unref();
  });
  let abandoned = false;
  try {
    // never rejects: a failure settles as { error } — rethrown below for `done` to log while the
    // wait is live; after the wait ran out it is logged here (never an unhandled rejection)
    const closing = Promise.resolve(reserved.close({ timeout: Math.max(1, Math.ceil(ms / 1000)) })).then(
      () => ({ error: null }),
      (error) => {
        if (abandoned) conn.log(`scrml server: closing the reserved connection to ${conn.desc.driver}:${conn.desc.file} failed after the wait ran out — ${messageOf(error)}`);
        return { error };
      },
    );
    const settled = await Promise.race([closing, ranOut]);
    if (settled === true) {
      abandoned = true;
      conn.log(`scrml server: closing the reserved connection to ${conn.desc.driver}:${conn.desc.file} did not finish in ${ms} ms; gate released (the database rolls back what was open on it when the connection drops)`);
      return;
    }
    if (settled.error !== null) throw settled.error;
  } finally {
    clearTimeout(timer);
  }
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
  // s475: SQLite only. Postgres never ends a transaction by itself on a statement error: it ABORTS
  // it (every later statement fails "current transaction is aborted" until a ROLLBACK [TO]), and the
  // probe would itself fail that way. A handled statement there runs under a statement savepoint
  // (`statement`), whose ROLLBACK TO clears the abort; an unhandled one fails the body, which rolls
  // the envelope back.
  if (!gated(tx.conn)) return;
  try {
    await control(tx, "BEGIN DEFERRED");
  } catch (e) {
    if (/within a transaction/i.test(messageOf(e))) return;
    tx.broken = true;
    return;
  }
  tx.broken = true;
  try { await control(tx, "ROLLBACK"); } catch { /* the probe's own; nothing in it */ }
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
// `standalone`: whether this function opens its own transaction when no
// enclosing one is open. s475: the compiler prints `true` for every envelope —
// SPEC §8.9.2 "Amendment S474" item 1: every `!` server body whose transitive
// query set is non-empty runs in the envelope, "however many queries it reaches
// (one is enough)". (Before s475 a one-query set was printed `false` and ran
// with no transaction: a one-statement `INSERT … SELECT` that failed part way
// kept its earlier rows, and a `fail` after its one write kept the write.)
// `false` — run as written outside a transaction, a savepoint inside one — is
// no longer printed; a hand-written caller may still pass it.
//
// "A failed `COMMIT` SHALL NOT release the connection … the `ROLLBACK` that
// follows releases it" — so a failed COMMIT is followed by ROLLBACK, then the
// release, then a throw (the call does not report success: its writes are gone).
// ---------------------------------------------------------------------------
const BEGINS = { IMMEDIATE: "BEGIN IMMEDIATE", DEFERRED: "BEGIN DEFERRED" };
// s475: `BEGIN IMMEDIATE` / `BEGIN DEFERRED` are SQLite's. "On Postgres / MySQL it opens with plain
// `BEGIN`, as ruling 5 states" (SPEC §8.9.2 "Amendment S474" item 1) — Postgres refuses `BEGIN
// DEFERRED` ("syntax error at or near DEFERRED"). It runs on the transaction's reserved connection
// (txConnection).
function beginText(conn, begin) {
  return conn.desc.driver === "sqlite" ? BEGINS[begin] : "BEGIN";
}
export async function envelope(conn, run, standalone, begin) {
  if (!Object.hasOwn(BEGINS, begin)) {
    throw new Error(`scrml server: an envelope's BEGIN must be "IMMEDIATE" or "DEFERRED" (the compiler decides it from the query set), got ${String(begin)}`);
  }
  const outer = ownTx(conn);
  if (outer !== null) return savepoint(outer, run);
  if (!standalone) return run();
  const als = scopeStore();
  // the gate first, then the connection: a transaction waiting its turn holds no pool connection
  await conn.gate.acquire();
  let handle = null;
  // `ended`: the transaction is known closed (COMMIT or ROLLBACK succeeded, or BEGIN never opened it)
  const tx = { conn, sql: null, open: true, broken: false, seq: 0, stack: [], ended: false };
  try {
    try {
      handle = await txConnection(conn);
    } catch (e) {
      conn.log(`scrml server: no connection for a transaction on ${conn.desc.driver}:${conn.desc.file} — ${messageOf(e)}`);
      throw e;
    }
    tx.sql = handle.sql;
    try {
      await control(tx, beginText(conn, begin));
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
      const done = await control(tx, "COMMIT");
      // s475: Postgres answers the COMMIT of an ABORTED transaction (a statement in it failed and
      // nothing rolled back to a savepoint before it) with `ROLLBACK` and no error: every write of
      // the body is gone. That is a failed COMMIT — never a reported success (SPEC §8.9.2
      // "Amendment S474" item 1: "or its `COMMIT` fails … the call SHALL NOT report success").
      if (done && done.command === "ROLLBACK") throw new Error("the database answered COMMIT with ROLLBACK (the transaction was aborted by a failed statement)");
      tx.ended = true;
    } catch (e) {
      conn.log(`scrml server: COMMIT on ${conn.desc.driver}:${conn.desc.file} failed — ${messageOf(e)}; rolled back`);
      await rollbackQuiet(tx, "ROLLBACK");
      throw e;
    }
    return result;
  } finally {
    tx.open = false;
    try {
      if (handle !== null) await handle.done(tx.ended);
    } finally {
      conn.gate.release();
    }
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
  await control(tx, "SAVEPOINT " + name);
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
  await control(tx, "RELEASE SAVEPOINT " + name);
  tx.stack.pop();
  return result;
}

// ---------------------------------------------------------------------------
// s478 (s478-boot-syntax-batch) — THE `transaction { … }` BLOCK (SPEC §19.10.2 / §19.10.3), printed
// by print.scrml txBlockJs inside the body of the `!` function's envelope:
//
//   {
//     const tx$ = await rt.txBlock(db$1);
//     let txOk$ = false;
//     try { … the block's statements …; txOk$ = true; }
//     finally { await rt.txEnd(tx$, txOk$); }
//   }
//
// §19.10.3: "`transaction { }` is syntactic sugar. The compiler SHALL emit `?{BEGIN}` at the start of
// the block, `?{COMMIT}` at the end of normal completion, and `?{ROLLBACK}` before any `fail`
// statement within the block. (S474: inside an open envelope, those three are the savepoint, its
// release and its rollback-to …)" and "Only normal completion COMMITs (S453). A `return`, or a
// `break` / `continue` whose target is outside the `transaction` block, SHALL roll the transaction
// back before the exit proceeds … the return expression SHALL be evaluated before the rollback".
// `txOk$` is set by the block's last statement only, so every other ending — a `fail` (a returned
// failure), a `return`, a `break` / `continue` out, a host error or a query's propagated error —
// reaches the `finally` with it false: ROLLBACK TO (then RELEASE) the block's savepoint, and the exit
// proceeds (a `return`'s value is computed before the `finally` runs). Normal completion: RELEASE.
// The block's savepoint shares the transaction's counter and nesting stack with nested `!` calls and
// statement savepoints (`innermost`), so an overlap is a broken transaction, never a wrong release.
// The block runs only inside its function's envelope (check.scrml C-TX4; analyze refuses a block in a
// function without one): with no open transaction on `conn` in this scope, it THROWS before any
// statement of the block runs — never runs them without their rollback.
export async function txBlock(conn) {
  const tx = ownTx(conn);
  if (tx === null) throw new Error(`scrml server: a \`transaction { … }\` block on ${conn.desc.driver}:${conn.desc.file} ran outside its function's transaction — refused, nothing in it was run`);
  if (tx.broken) throw brokenError(conn);
  tx.seq = tx.seq + 1;
  const name = "scrml_sp_" + tx.seq;
  await control(tx, "SAVEPOINT " + name);
  tx.stack.push(name);
  return { tx, name };
}

export async function txEnd(h, ok) {
  const { tx, name } = h;
  if (!ok) {
    await undoSavepoint(tx, name);
    return;
  }
  if (tx.broken) throw brokenError(tx.conn);
  innermost(tx, name);
  await control(tx, "RELEASE SAVEPOINT " + name);
  tx.stack.pop();
}

// s475 — THE STATEMENT SAVEPOINT. SPEC §8.9.2 "Amendment S474" item 4: "Inside an envelope, a `?{}`
// whose failure is handled where it is written (a `!{}` on the query, or a `match` on its result,
// §19.8.3) SHALL run under a statement savepoint of its own. When the query fails, the handler runs
// after a rollback to that savepoint, and the envelope survives with every earlier write intact. On
// Postgres a failed statement aborts the whole transaction, so without this savepoint every later
// query would fail and the envelope's `COMMIT` would silently end as a `ROLLBACK`, reporting success
// with every write gone." — and "The statement savepoint is taken once per **executed** handled
// statement" (so a handled query in a loop takes one per iteration: this runs per execution).
//
// Every driver takes it (uniform; two extra round trips per executed handled statement inside a
// transaction — g-envelope-lock-hold-cost-s474). On SQLite it is observable too: a statement whose
// conflict resolution is `OR FAIL` keeps the rows it changed before the failing one (measured: an
// `INSERT OR FAIL … SELECT` over 1, 2, 1 into a primary key left 1 and 2 behind after its error);
// the rollback to the savepoint removes them before the handler runs, as the SPEC says.
//
// The name shares the envelope's counter (`scrml_sp_<n>`, one sequence per transaction), so it never
// collides with a nested `!` call's savepoint, and it is pushed on the same stack: the strict
// nesting `innermost` enforces covers both. Author SQL cannot name it (§8.9.2 item 3).
// A SQLite error that ended the whole transaction (ON CONFLICT ROLLBACK, SQLITE_FULL, …) is found by
// runQuery's probe, which throws: the savepoint went with the transaction, and the envelope rolls
// back and answers a server error. A ROLLBACK TO / RELEASE that fails throws the same way.
async function statement(tx, mode, text, params, slots, row = null) {
  tx.seq = tx.seq + 1;
  const name = "scrml_sp_" + tx.seq;
  await control(tx, "SAVEPOINT " + name);
  tx.stack.push(name);
  const result = await runQuery(tx.conn, mode, text, params, slots, tx, row);
  if (failed(result)) {
    await undoSavepoint(tx, name);
    return result;
  }
  innermost(tx, name);
  await control(tx, "RELEASE SAVEPOINT " + name);
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
  await control(tx, "ROLLBACK TO SAVEPOINT " + name);
  await control(tx, "RELEASE SAVEPOINT " + name);
  tx.stack.pop();
}

async function rollbackQuiet(tx, text) {
  try {
    await control(tx, text);
    tx.ended = true;
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
    return configured(new SQL("sqlite://" + resolveSqlitePath(host, desc)));
  }
  return new SQL(desc.target);
}

// S474 #1703 r1 (review F3) — the SQLite defaults impl#1 applies to the handle its
// server opens (operator ruling S385 A1: "WAL + 5s busy-timeout as the safe default";
// impl#1 compiler/src/codegen/sqlite-defaults.ts). Without a busy timeout, a writing
// envelope's BEGIN IMMEDIATE (S474 ruling 5) fails at once while another process
// holds the write lock; with it, the BEGIN waits up to 5 s and then runs.
// As impl#1: `busy_timeout` FIRST, each pragma in its OWN try (a WAL change needs a
// momentary exclusive lock and throws under contention — it must not take
// busy_timeout with it; it persists in the file once an uncontended open lands it);
// silent catches (a handle that does not answer PRAGMA runs with sqlite's own
// settings — never worse than without). Only the DEFAULT host's file-backed handle:
// a host that injects `host.connect` configures its own driver.
const SQLITE_BUSY_TIMEOUT_MS = 5000;
function configured(sql) {
  let ready = null;
  const setup = async () => {
    try { await sql.unsafe(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`); } catch { /* not answered */ }
    try { await sql.unsafe("PRAGMA journal_mode = WAL"); } catch { /* contended or read-only */ }
  };
  // every statement waits for the pragmas, issued once before the first one
  const run = (strings, ...values) => {
    if (ready === null) ready = setup();
    return ready.then(() => sql(strings, ...values));
  };
  run.close = (...a) => sql.close(...a);
  return run;
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
// The value keeps the full driver text, so a `?{}` handled in server code
// where it is written sees it (S474 ruling 2); what crosses the wire in a
// route's failure answer is decided at the boundary (`deliverable` — a failure and, S480, a returned value).
// ---------------------------------------------------------------------------
// `params`: each DISTINCT value, evaluated once (§8.2); `slots[i]`: the param the
// template's i-th `${}` binds (core.scrml SqlQuery — C-SQL1 lines them up).
// s474 (U1e): inside an envelope this scope owns, the statement runs on the
// transaction at once; any other statement on a gated (SQLite) connection waits
// at the §19.10.6 gate for its turn and holds it for this one statement.
// s475: `handled` — the compiler printed `true` (print.scrml queryJs): the query's failure is
// handled where it is written (a `!{}` on it, a `match` on its result). Inside a transaction this
// scope owns it runs under a statement savepoint of its own (`statement`); outside one it runs as
// any other query (one statement undoes only itself).
// S478 (§14.8.3 "A typed row is checked as it is read", INTERIM): `row` — the §57 wire table of the
// query's result type when its rows are typed from a `<schema>` table (print.scrml queryJs), else null.
export async function query(conn, mode, text, params, slots, handled = false, row = null) {
  const tx = ownTx(conn);
  if (tx !== null) {
    if (tx.broken) throw brokenError(conn);
    if (handled === true) return statement(tx, mode, text, params, slots, row);
    return runQuery(conn, mode, text, params, slots, tx, row);
  }
  if (!gated(conn)) return runQuery(conn, mode, text, params, slots, null, row);
  await conn.gate.acquire();
  try {
    return await runQuery(conn, mode, text, params, slots, null, row);
  } finally {
    conn.gate.release();
  }
}

async function runQuery(conn, mode, text, params, slots, tx, row = null) {
  let rows;
  try {
    const values = slots.map((i) => params[i]);
    // s475: inside a transaction, on its connection (a pooled database's reserved one — txConnection)
    const sql = tx !== null ? tx.sql : conn.open();
    rows = await sql(text, ...values);
  } catch (e) {
    const err = sqlErrorOf(e);
    conn.log(`scrml server: a query on ${conn.desc.driver}:${conn.desc.file} failed — ${messageOf(e)}`);
    noteDriverText(e, err);
    if (tx !== null) {
      await probeTx(tx);
      if (tx.broken) throw brokenError(conn);
    }
    return failure(err);
  }
  if (mode === "run") return null;
  const list = [];
  for (const r of rows ?? []) list.push(plainRow(r));
  const value = mode === "get" ? (list.length > 0 ? list[0] : null) : list;
  if (row === null) return value;
  return checkRows(conn, row, value);
}

// S478 (§14.8.3 "A typed row is checked as it is read", INTERIM — ruling:user-voice-scrml.md S478
// open-Qs item 20, option (b): "validate each typed row value at the query boundary, server-side, as
// the row is read"). A non-STRICT SQLite table stores any storage class in any column (an INTEGER
// column holding 'abc' or 1.5, a TEXT column holding a blob), so a row typed off the `<schema>`
// declaration is checked against its §57 descriptor — the decoder's own check (an `int` an integer,
// a `number` finite, a `string` a string, `T | not` null or a T; a declared field the row lacks
// refused) — before the program sees it. Two row-only rules run first (fitRow):
//   * an `int` field holds an integer within ±(2^53−1) (§21.3.1.1, "integral, within ±(2^53−1)"):
//     a stored 64-bit INTEGER outside that range reaches us already rounded by the driver
//     (9007199254740993 reads as …992), and a rounded id selects the WRONG row (#1944 review MED-1);
//   * a column the declared type does not declare (a live table with a column `<schema>` does not
//     list, read by `SELECT *`) is DROPPED, not refused: the row is still a row of the declared
//     type, and the program sees only the declared fields (#1944 review MED-2).
// A value that fails fails the QUERY as SqlError::QueryFailed, as a driver error does (handled where
// the query is, propagated where it propagates), with a server log line naming the field path and
// the stored value's storage class, never the value (#1944 review LOW-3); the program never sees it.
// The decoded value (the codec's runtime layout) is what the query returns. STRICT DDL from
// `<schema>` (the ruling's option (a)) would make the storage-class part redundant; the int range,
// a missing / renamed column and the dropped extras are row rules a STRICT table still needs.
function checkRows(conn, row, value) {
  const fit = fitRow(row, row.root, value, "$");
  const r = fit.ok ? decode(row, fit.value) : fit;
  if (r.ok) return r.value;
  const path = r.error.path;
  const stored = fit.ok ? storageClass(valueAt(fit.value, path)) : r.error.stored;
  conn.log(`scrml server: a query on ${conn.desc.driver}:${conn.desc.file} read a row value that does not fit its declared type — ${path}: the stored value is ${stored} (§14.8.3: a typed row is checked as it is read; a table that is not STRICT stores any value in any column)`);
  const err = { variant: "QueryFailed", data: [`a row value does not fit its declared type at ${path} (§14.8.3)`] };
  noteDriverText({ message: err.data[0] }, err);
  return failure(err);
}

// The row-only rules (checkRows above), over the row's §57 descriptor: drops the undeclared keys of
// each struct row and refuses an `int` outside the safe range. Everything else is left to `decode`.
function fitRow(table, ty, v, path) {
  switch (ty.k) {
    case "maybe":
      return v === null ? { ok: true, value: v } : fitRow(table, ty.inner, v, path);
    case "int":
      if (typeof v === "number" && Number.isInteger(v) && !Number.isSafeInteger(v)) {
        return { ok: false, error: { path, stored: "an integer outside ±(2^53−1), which the driver reads lossily" } };
      }
      return { ok: true, value: v };
    case "seq": {
      if (!Array.isArray(v)) return { ok: true, value: v };
      const out = [];
      for (let i = 0; i < v.length; i++) {
        const r = fitRow(table, ty.elem, v[i], `${path}[${i}]`);
        if (!r.ok) return r;
        out.push(r.value);
      }
      return { ok: true, value: out };
    }
    case "ref": {
      const d = table.defs[ty.def];
      if (d === undefined || d.k !== "struct" || v === null || typeof v !== "object" || Array.isArray(v)) return { ok: true, value: v };
      const out = {};
      for (const f of d.fields) {
        if (!Object.hasOwn(v, f.name)) continue; // decode reports the missing field
        const r = fitRow(table, f.ty, v[f.name], `${path}.${f.name}`);
        if (!r.ok) return r;
        Object.defineProperty(out, f.name, { value: r.value, enumerable: true, writable: true, configurable: true });
      }
      return { ok: true, value: out };
    }
    default:
      return { ok: true, value: v };
  }
}

// The value a decode failure path (`$`, `.name`, `[i]`) names, or undefined where there is none.
function valueAt(v, path) {
  let cur = v;
  const re = /\.([A-Za-z_$][A-Za-z0-9_$]*)|\[(\d+)\]/g;
  let m;
  while ((m = re.exec(path)) !== null) {
    if (cur === null || typeof cur !== "object") return undefined;
    const k = m[1] !== undefined ? m[1] : Number(m[2]);
    if (!Object.hasOwn(cur, k)) return undefined;
    cur = cur[k];
  }
  return cur;
}

// A stored value's SQLite storage class, for the log line — never the value itself.
function storageClass(v) {
  if (v === undefined) return "absent (the row has no such column)";
  if (v === null) return "NULL";
  if (typeof v === "number") return Number.isInteger(v) ? "an integer" : "a real";
  if (typeof v === "bigint") return "an integer";
  if (typeof v === "string") return "text";
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return "a blob";
  return `a ${typeof v}`;
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

// §19.8.1's variants, by the driver's error codes.
// s475 (lane s475-boot-pg-envelopes): read EVERY field a driver puts a code in, as impl#1's
// classifier does (compiler/src/codegen/sql-attempt.ts `_scrml_sql_error`, S474 N1). Bun.SQL's
// PostgresError carries `code: "ERR_POSTGRES_SERVER_ERROR"` with the SQLSTATE in `errno` (measured,
// Bun 1.4.3 against PostgreSQL 18 / PGlite: a unique violation is `errno: "23505"`, a NOT NULL one
// "23502", a CHECK one "23514"); its MySQLError carries `code: "ER_DUP_ENTRY"`, the number in `errno`
// and the SQLSTATE in `sqlState`; SQLite's code names the constraint (`SQLITE_CONSTRAINT_UNIQUE`).
// Before s475 only `e.code` was read, so a Postgres unique violation was QueryFailed, never
// ConstraintViolation (g-boot-pg-constraint-violation-misclassified-s475) — an
// `!{ .ConstraintViolation :> … }` arm never ran on Postgres.
const CONSTRAINT_NAMES = /^ER_(?:DUP_ENTRY|DUP_UNIQUE|NO_REFERENCED_ROW(?:_2)?|ROW_IS_REFERENCED(?:_2)?|BAD_NULL_ERROR|CHECK_CONSTRAINT_VIOLATED)$/;
const CONSTRAINT_NUMBERS = /^(?:1062|1169|1216|1217|1451|1452|1048|3819)$/;
const CONNECTION_NAMES = /^ERR_(?:POSTGRES|MYSQL)_(?:CONNECTION_\w+|IDLE_TIMEOUT|LIFETIME_TIMEOUT|AUTHENTICATION_FAILED\w*|SASL_SIGNATURE_\w+|INVALID_SERVER_SIGNATURE|INVALID_SERVER_KEY|(?:UNKNOWN|UNSUPPORTED)_AUTHENTICATION_METHOD|TLS_NOT_AVAILABLE|TLS_UPGRADE_FAILED|PASSWORD_REQUIRED|MISSING_AUTH_DATA|UNSUPPORTED_AUTH_PLUGIN|FAILED_TO_ENCRYPT_PASSWORD)$/;
function codesOf(e) {
  if (e === null || typeof e !== "object") return [];
  return [e.code, e.errno, e.sqlState].filter((c) => c !== undefined && c !== null).map((c) => String(c));
}
export function sqlErrorOf(e) {
  const codes = codesOf(e);
  const any = (re) => codes.some((c) => re.test(c));
  const msg = messageOf(e);
  // SQLite's SQLITE_CONSTRAINT*; SQLSTATE class 23 (integrity constraint violation — Postgres `errno`,
  // MySQL `sqlState`); MySQL's duplicate-key, foreign-key, NOT NULL and CHECK errors by name and number
  if (any(/^SQLITE_CONSTRAINT/) || any(/^23[0-9A-Z]{3}$/) || any(CONSTRAINT_NAMES) || any(CONSTRAINT_NUMBERS)) {
    return { variant: "ConstraintViolation", data: [constraintField(e, msg).field] };
  }
  // SQLSTATE class 08 (connection exception) and Postgres's server-side ends of a connection outside it
  // (57P01-03 shutdown / cannot connect now, 53300 too many connections, 28000 / 28P01 authorization);
  // the socket errors; Bun.SQL's connection / timeout / authentication codes; MySQL's client connection
  // errors (2002, 2003, 2006, 2013); SQLite's cannot-open / not-a-database / I/O errors
  if (any(/^08[0-9A-Z]{3}$/) || any(/^(?:57P0[1-3]|53300|28000|28P01)$/) ||
      any(/^(?:ECONNREFUSED|ECONNRESET|ECONNABORTED|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EPIPE|ETIMEDOUT)$/) ||
      any(CONNECTION_NAMES) || any(/^(?:2002|2003|2006|2013)$/) || any(/^SQLITE_(?:CANTOPEN|NOTADB|IOERR)/)) {
    return "ConnectionLost";
  }
  return { variant: "QueryFailed", data: [msg] };
}

// ConstraintViolation's `field` (S474 #1703 r1, PA ruling): the COLUMN name only —
// `email`, never `users.email` — in every build, as impl#1 (#1704) delivers it: a
// client needs the field to say "that email is taken", and the table name is schema.
// SPEC §19.8 (S474 — "a failed query's driver text does not cross the wire"):
// "`ConstraintViolation`'s `field` is the COLUMN name only, in both builds … `email`,
// not `users.email`; a composite UNIQUE gives `a, b`. … A field that is not exactly a
// `table.col` list — a CHECK constraint's name or expression, an expression index, a
// Postgres constraint name — is not a column: server code still sees it, and a
// production build blanks it in the delivered value."
// SQLite names the columns `table.col[, table.col…]` after "constraint failed: "
// (UNIQUE / NOT NULL / PRIMARY KEY); each is cut to its column. Anything else after
// it (a CHECK's constraint name or expression) is NOT a column: it stays the field's
// value in server code and is withheld from a production answer (`column: false`).
// Postgres: a unique / foreign-key / exclusion violation names its columns only in
// `detail` — `Key (email)=(a@b) already exists.`, `Key (a, b)=(1, 2) …` (measured; the
// driver's `constraint` is the index name `users_email_key`, and Bun.SQL's own `column`
// is then the JS stack column, a number). s475: those columns are the field when every
// one is a plain or double-quoted identifier (an expression index — `Key (lower(email))=`
// — is not a column, and a server whose messages are translated does not say `Key`:
// both fall back to the constraint name, `column: false`). A NOT NULL violation carries
// the column in the driver's `column` (a string). MySQL: its `column` when it gives
// one, else the `constraint` name (not a column).
// s475 (g-boot-pg-constraint-field-fallbacks-s475 part a): the key list is READ, not split on
// ", " — a double-quoted column may itself hold `, ` or `)=(` (`Key ("Weird, col")=(x)`), which a
// split read as two parts and fell back to the constraint name. Postgres prints each column with
// quote_identifier: a plain lower-case identifier, or `"…"` with `"` doubled. Anything else in the
// list (an expression index's `lower(email)`) is not a column: null, the constraint-name fallback.
const PG_PLAIN_IDENT = /^[A-Za-z_][A-Za-z0-9_$]*/;
function pgKeyColumns(e) {
  if (e === null || typeof e !== "object" || typeof e.detail !== "string") return null;
  if (!codesOf(e).some((c) => /^23[0-9A-Z]{3}$/.test(c))) return null;
  const d = e.detail;
  if (!d.startsWith("Key (")) return null;
  let i = 5;
  const cols = [];
  for (;;) {
    if (d[i] === '"') {
      let name = "";
      let j = i + 1;
      for (;;) {
        if (j >= d.length) return null;              // an unterminated quoted name
        if (d[j] === '"') {
          if (d[j + 1] === '"') { name += '"'; j += 2; continue; }
          break;
        }
        name += d[j];
        j += 1;
      }
      if (name === "") return null;
      cols.push(name);
      i = j + 1;
    } else {
      const m = PG_PLAIN_IDENT.exec(d.slice(i));
      if (m === null) return null;
      cols.push(m[0]);
      i += m[0].length;
    }
    if (d.startsWith(", ", i)) { i += 2; continue; }
    if (d.startsWith(")=(", i)) return cols.join(", ");
    return null;                                     // anything else after a name: not a plain column list
  }
}
function constraintField(e, msg) {
  const m = /constraint failed: (.*)$/.exec(msg);
  if (m) {
    const cols = m[1].split(", ").map((part) => /^[^\s.,]+\.([^\s.,]+)$/.exec(part));
    if (cols.every((c) => c !== null)) return { field: cols.map((c) => c[1]).join(", "), column: true };
    return { field: m[1], column: false };
  }
  const keyCols = pgKeyColumns(e);
  if (keyCols !== null) return { field: keyCols, column: true };
  if (e && typeof e.column === "string" && e.column !== "") return { field: e.column, column: true };
  if (e && typeof e.constraint === "string" && e.constraint !== "") return { field: e.constraint, column: false };
  return { field: "", column: false };
}

// ---------------------------------------------------------------------------
// S474 ruling 2, as amended (user-voice-scrml.md "RULED — S474 review-surfaced
// decisions 1–7" item 2: "A failed query's error text does not cross the wire.
// The client receives the error variant with its message blanked; the server
// logs the full driver text. (Driver text exposes the schema.) A `?{}` handled
// where it is written still sees the driver text in server code." — amended by
// "RULED — capability over limitation" item 3: "a dev build keeps the full
// driver text in the value delivered to the client; a production build blanks
// it (the server logs it either way)").
//
// THE CONTRACT (S474 #1703 r1): the compiler and runtime never send UNCHANGED
// driver text by themselves; text the author HANDLED is the author's.
//  - A failed query's value keeps its driver text, so server code that handles
//    the `?{}` sees it (QueryFailed's message is the driver's message;
//    ConstraintViolation's field is the column name — constraintField).
//  - Its driver texts are recorded in the REQUEST it ran in (an AsyncLocalStorage
//    scope `handle` opens around the route's body): the driver's MESSAGES (its
//    message, Postgres's `detail`) and its non-column TOKENS (a CHECK's
//    constraint name, Postgres's `constraint`). A column name is not recorded: it
//    is delivered (PA ruling, above).
//  - When the route answers a failure in a PRODUCTION build, a payload string is
//    replaced by "" when it CONTAINS a whole recorded message, or EQUALS a recorded
//    token — the variant and the payload's shape stay, so the client's match arms
//    still decode it. So `?` propagation (the implicit re-fail) and a verbatim
//    re-wrap (`fail .Bad(m)`, `fail .Bad("db: " + m)`) are withheld.
//  - A token is NEVER matched as a substring: "the amount must be positive" is the
//    author's text even when a CHECK named `positive` failed (#1703 review F2).
//  - NOT tracked (best effort, not a guarantee — g-boot-wire-driver-text-transformed-
//    not-tracked-s474): driver text the author TRANSFORMS (`m.slice(16)`,
//    `f.toUpperCase()`) — JS strings carry no taint, so the author owns what a
//    handler builds.
//  - S480 (s480-build-mode; ruling:user-voice-scrml.md-S479-3B-rest-item-16, PERMANENT — "the
//    production-build withhold applies to every value a route delivers, returned as well as
//    failed"): the same rule is applied to a RETURNED value (`_ e :> { return e }`, a struct or
//    string carrying `m`), and to an `<endpoint>` arm's answer (§61.5), not only to a failure.
//    The walk is TYPE-DIRECTED (`withheldValue`, by the route's §57 table): only a `string`
//    position is ever blanked — never a variant name, a field name, a number — so a blanked
//    value still decodes against its type on the client.
//  - DEV build: the ARTIFACT is a dev build (print-server.scrml printServerBuild with `dev` —
//    `scrml-boot dev`, `scrml-boot compile --dev` — wraps its host in `devBuild`): delivered
//    unchanged. Every other artifact is production, whatever its host passes (a host's own
//    `dev: true` decides nothing — ruling item 10: "the deployed artifact fails safe").
// Fail closed: with no AsyncLocalStorage one request's driver texts cannot be told
// apart from another's, so the server REFUSES TO START (`server` → `requestStore`
// throws) rather than serve — the same way an envelope requires its scope store.
// s480 r1 (review #2011 F2/F3): there is no process-wide fallback record — one could
// be flooded until a text was evicted (then delivered), and blanked request B's own
// string that equalled request A's token. A text noted outside every request scope
// (a module-level query) is recorded nowhere: no route delivers from it.
// The full text was already logged where the query failed (runQuery).
// ---------------------------------------------------------------------------
const DEV_BUILD = Symbol("scrml.devBuild");
// The host of a DEVELOPMENT build's server (printed only by a dev compile). A new object whose
// prototype is the host, so every host member (`connect`, `log`, `respond`, …) reads through.
export function devBuild(host) {
  const h = Object.create(host !== null && typeof host === "object" ? host : null);
  Object.defineProperty(h, DEV_BUILD, { value: true });
  return h;
}
function isDevBuild(host) {
  return host !== null && typeof host === "object" && host[DEV_BUILD] === true;
}
let reqScope = null;
function requestStore() {
  if (reqScope === null) {
    const hooks = globalThis.process && typeof globalThis.process.getBuiltinModule === "function"
      ? globalThis.process.getBuiltinModule("node:async_hooks") : null;
    if (!hooks || typeof hooks.AsyncLocalStorage !== "function") {
      throw new Error("scrml server: no AsyncLocalStorage — one request's database driver text cannot be told apart from another's, so it cannot be withheld from what a route delivers (§19.8.4); refusing to serve");
    }
    reqScope = new hooks.AsyncLocalStorage();
  }
  return reqScope;
}

function noteDriverText(e, err) {
  const rec = reqScope === null ? undefined : reqScope.getStore();
  if (rec === undefined) return;   // outside every request: no route delivers from it
  const addTo = (list, t) => {
    if (typeof t !== "string" || t === "" || list.includes(t)) return;
    list.push(t);
    rec.texts.push(t);
  };
  const msg = messageOf(e);
  addTo(rec.messages, msg);
  if (e && typeof e === "object") {
    addTo(rec.messages, e.detail);
    addTo(rec.tokens, e.constraint);
  }
  if (err && typeof err === "object" && err.variant === "ConstraintViolation") {
    const cf = constraintField(e, msg);
    if (!cf.column) addTo(rec.tokens, cf.field);
  }
}

// The runtime VALUE `v` of §57 table `table` with every driver-derived `string` blanked (see
// above), walked by its type: a `str` position is blanked when `tainted`; a variant name, a field
// name, a number, a boolean never is. A value whose shape is not its type's is returned as it is
// (the encoder refuses it next: a 500, which carries nothing).
function withheldValue(table, v, tainted) {
  let changed = false;
  const defs = table && table.defs ? table.defs : [];
  const walk = (ty, x) => {
    if (ty === null || typeof ty !== "object") return x;
    if (ty.k === "maybe") return x === null || x === undefined ? x : walk(ty.inner, x);
    if (ty.k === "str") {
      if (typeof x === "string" && x !== "" && tainted(x)) { changed = true; return ""; }
      return x;
    }
    if (ty.k === "seq") return Array.isArray(x) ? x.map((e) => walk(ty.elem, e)) : x;
    if (ty.k !== "ref") return x;
    const d = defs[ty.def];
    if (d === undefined || x === null || typeof x !== "object") return x;
    if (d.k === "enum") {
      if (!Array.isArray(x.data) || !Array.isArray(d.variants)) return x;
      const p = d.variants.find((q) => q.name === x.variant);
      if (p === undefined || !Array.isArray(p.fields)) return x;
      return { variant: x.variant, data: x.data.map((e, i) => (i < p.fields.length ? walk(p.fields[i].ty, e) : e)) };
    }
    if (Array.isArray(x) || !Array.isArray(d.fields)) return x;
    const out = {};
    for (const k of Object.keys(x)) {
      const f = d.fields.find((q) => q.name === k);
      out[k] = f === undefined ? x[k] : walk(f.ty, x[k]);
    }
    return out;
  };
  const value = walk(table ? table.root : null, v);
  return { value: changed ? value : v, changed };
}

// The tainted-string test of a request's record: a string CONTAINING a whole recorded driver
// message, or EQUAL to a recorded non-column token (never a token as a substring — #1703 F2).
function taintedBy(rec) {
  return (str) => rec.messages.some((t) => str.includes(t)) || rec.tokens.includes(str);
}

// What a route of a PRODUCTION build delivers in place of `v` (its §57 table `table`): `v` with the
// request's driver text withheld (S474 ruling 2; S480 ruling item 16 — "every value a route
// delivers, returned as well as failed"). `what` names the delivery in the log line. A dev build
// delivers `v` unchanged.
function deliverable(host, rec, table, v, where, what) {
  if (isDevBuild(host)) return v;
  if (rec.texts.length === 0) return v;
  const w = withheldValue(table, v, taintedBy(rec));
  if (w.changed) {
    logLine(host, `scrml server: ${where} — ${what} carried database driver text; blanked in the response (production build, S474 ruling 2 / S480 ruling item 16) — the full text is logged above`);
  }
  return w.value;
}

// A fresh request record, and the scope it is noted in (`server` has already required the store).
function requestRecord() {
  const rec = { texts: [], messages: [], tokens: [] };
  const rs = requestStore();
  return { rec, run: (fn) => rs.run(rec, fn) };
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
  429: { error: "Too Many Requests" },
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
// The bootstrap's tenant set is ALWAYS EMPTY (a `<schema>` `tenant_id` column and `<db tables=>` are
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
        once(`t:${where}:${n}`, `scrml server: E-DEPLOY-DB-TENANT-UNDECLARED — the database ${where} has the relation \`${n}\` carrying a \`tenant_id\` column outside the compilation's tenant set (empty on the bootstrap: a <schema> tenant_id column and <db tables=> are refused there), so its rows would reach every request. The server answers 503 until it is fixed: declare it in <schema> so the tenant floor scopes it, or rename the column (§14.8.10 item (3))`);
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
// s478 (s478-boot-channel): `channels` — the §38 channels (rt.channel); their WebSocket
// upgrade route `/_scrml_ws/<name>` is answered HERE, by this one `fetch` (no second
// router), which then needs the host's upgrader: Bun.serve passes its server as `fetch`'s
// second argument (`server.upgrade(request, { data })`), and the host passes this server's
// `websocket` handlers as Bun.serve's `websocket:` option (§38.8: "a `_scrml_ws_handlers`
// export for `Bun.serve()`'s `websocket:` option").
export function server(host, routes, conns = [], endpoints = [], channels = []) {
  // s480 r1 (review #2011 F2/F3): fail closed — no per-request scope, no server (see deliverable)
  requestStore();
  // s480 r1 (review #2011 F1): a DEVELOPMENT build says so, loudly, once, when it starts — a
  // production build logs nothing new
  if (isDevBuild(host)) logLine(host, "scrml server: DEVELOPMENT build — do not deploy (database driver text reaches the client, §19.8.4)");
  const byPath = new Map();
  for (const r of routes) byPath.set(r.path, r);
  // s478 (s478-boot-endpoint): the §61 endpoints, by path, then method (§61.7 — "mounted for
  // method="). The compiler refuses two at one path and method, and any under `/_scrml/`.
  const byEndpoint = new Map();
  for (const ep of endpoints) {
    if (!byEndpoint.has(ep.path)) byEndpoint.set(ep.path, new Map());
    byEndpoint.get(ep.path).set(ep.method, ep);
  }
  const gate = tenantGate(host, [...new Set(conns)]);   // s474 r1: two scopes on one database are one connection
  const byChannel = new Map();
  for (const ch of channels) byChannel.set(CHANNEL_PREFIX + ch.name, ch);
  const websocket = channelSockets(host, channels, host[CHANNEL_LOG_TEST_HOOK] ?? {});
  return {
    routes: routes.map((r) => ({ path: r.path, method: "POST" })).concat(endpoints.map((ep) => ({ path: ep.path, method: ep.method }))).concat(channels.map((ch) => ({ path: CHANNEL_PREFIX + ch.name, method: "GET" }))),
    websocket,
    async fetch(request, upgrader) {
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
      // s478 #1928 fix r1 (MED-1): the prefix is intercepted only in a program that HAS channels
      // (a program without one answers `/_scrml_ws/…` as any other path, unchanged from before
      // channels); the compiler refuses an `<endpoint>` under `/_scrml_ws` (E-ENDPOINT-ROUTE-DUPLICATE, endpointReservedWhy),
      // so no endpoint is ever shadowed here. Refusal order (LOW-1): 403 (Origin, §40.2 — first,
      // before anything about the request is answered), then 404 (no such channel), 405
      // (non-GET), 426 (no `Upgrade: websocket`); only then the upgrade.
      if (channels.length > 0 && path.startsWith(CHANNEL_PREFIX)) {
        // §40.2: `trusted-proxies=` is one program value, printed on every channel's desc
        if (!originOk(request, channels[0].trusted)) return jsonResponse(host, 403, FIXED[403]);
        const ch = byChannel.get(path);
        if (ch === undefined) return jsonResponse(host, 404, FIXED[404]);
        return upgradeChannel(host, ch, request, upgrader, websocket);
      }
      const em = byEndpoint.get(path);
      if (em !== undefined) {
        // §61.7: the handler is mounted at `path=` FOR `method=` — any other method at that
        // path is not served (405, naming the methods that are — RFC 9110 §15.5.6)
        const ep = em.get(request.method);
        if (ep === undefined) return jsonResponse(host, 405, FIXED[405], { Allow: [...em.keys()].join(", ") });
        try {
          return await handleEndpoint(host, ep, request);
        } catch (e) {
          logLine(host, `scrml server: ${ep.method} ${path} — ${messageOf(e)}`);
          return jsonResponse(host, 500, FIXED[500]);
        }
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

// ---------------------------------------------------------------------------
// s478 (s478-boot-channel) — SPEC §38 `<channel>`: the SERVER half.
// `desc` (print-server.scrml channelConsts): the channel's `name`, its `topic` and
// per synced cell (§38.4) its key and §57 wire table.
//   §38.1: "a server-side upgrade route at `/_scrml_ws/<name>`".
//   §40.2 (S441; amended S479 for `trusted-proxies=`): "Every compiler-emitted WebSocket upgrade
//   route of a web-application program … SHALL accept the upgrade only when the request's `Origin`
//   names the server's own origin: the same host — taken from `X-Forwarded-Host` when
//   `trusted-proxies=` is 1 or more and that header holds the entry a trusted proxy wrote (next
//   statement), else the request's own host — and the same scheme — `X-Forwarded-Proto` under the
//   same rule, else the request's — except that an `https` origin SHALL be accepted on a request
//   that arrived as plain `http` … Default ports compare equal to their omitted form. A
//   mismatched origin, and the opaque `Origin: null`, SHALL be refused with `403` before
//   the upgrade and before any channel handler runs. A handshake with NO `Origin` header
//   is a non-browser client … it SHALL be accepted".
//   §38.4 / §38.4.2 (RULED S478 "op-based channel sync"): the server relays a client's op
//   frame `{ __type: "__sync", __key, __op, __val }` to the channel's other subscribers.
//   "The relay … SHALL check a client's frame against the frame shape, that `__key` names a
//   cell of the channel, that `__op` is an op the cell's declared grants admit, and that each
//   payload part decodes canonically against its type (§57.5); it relays the frame
//   RE-ENCODED from the decoded payload … The server holds no cell value (§38.4), so it SHALL
//   NOT be relied on for a check that needs one" — the length bound after an edit and a
//   `rule=` edge are each receiver's checks (runtime.js `channel`).
// Strict decode + close (§38.4.3, S478 open-Qs ruling item 41 — formerly owner question 1 of g-boot-channel-s478): a frame
// is decoded STRICTLY — text only, at most the channel's frame bound in UTF-8 bytes (§38.4.3), a JSON object
// of exactly `__type` / `__key` / `__op` / `__val`, `__type` "__sync", `__key` a cell the
// channel declares, `__op` one of the ops that cell syncs (`desc.cells[i].ops`), `__val`
// decoding canonically against that cell's table (`replace` / `transition`), its element
// table (`append` / `prepend`) or an int ≥ 1 (`pop` / `shift`) — and the relayed frame is
// RE-ENCODED from the decoded payload, never the raw text. Any
// other frame closes the connection (1003 / 1007 / 1008 / 1009) and is relayed to no
// one. Each channel publishes on its own topic key (`[name, topic]`), so two channels
// naming one `topic=` never exchange frames.
//   §38.4.3 (S478 open-Qs ruling (user-voice), items 41–44 and 49): "The relay SHALL decode a
//   client's frame strictly … and close the sender's connection" (1003 / 1007 / 1008 / 1009);
//   "A channel's topic is scoped to its channel"; and the three bounds, each a §38 default with
//   an override the compiler resolves (`desc.limits`): a frame is at most `maxFrame` bytes of
//   UTF-8 (default 65 536; 1009), a connection's frames pass a token bucket of `burst` tokens
//   refilled at `rate` per second (defaults 100 / 50; "a frame that finds less than one token
//   … closes the connection (1008)" — amended S479: refused unread, and closed only past the close
//   bucket, `takeToken`), and a channel admits at most `maxSubs` subscribers per
//   server process ("a further upgrade SHALL be answered `503`"; default 1000).
//   S478 open-Qs ruling (user-voice), items 50–51 (s478-ruled-channel-sync2), §38.4.2:
//   "A frame that passes is given the channel's next SEQUENCE NUMBER (1 for the channel's first
//   relayed frame, then 2, 3, … with no gap …) and is relayed RE-ENCODED from the decoded payload
//   to EVERY subscriber of the channel, its sender included" — `__own: true` on the sender's copy.
//   "The relay SHALL keep, per channel, a log of the frames it has relayed … When a client
//   subscribes … the relay SHALL send it, before any other frame, ONE replay message" — `__replay`,
//   sent in `open` before the socket subscribes, so every live frame it gets follows the log.
//   "A channel's log SHALL hold at most 10,000 frames and at most 8,388,608 bytes … A frame
//   that would take the log past either bound is still relayed live, but the log is TRUNCATED: the
//   relay drops the whole log and logs no frame from then on, and every replay message for the
//   channel says `__complete: false` with no frames."
//   The log is a FRAME log (§38.4, amended): the relay never applies a frame to a value. Its
//   state lives per `server()` call (channelSockets), never at module scope.
//   Integration (#1941 × #1942, S478): ONE subscriber count per channel — #1942's `ch.subs`,
//   reserved at the upgrade and released once on a failed upgrade or the socket's close. The
//   §38.4.2 epoch reset reads it: a truncated channel starts again when that count reaches 0 (the
//   last reserved subscriber has left), or when a socket opens holding the ONLY reservation (every
//   earlier subscriber has left — this covers a reservation released by a failed upgrade). A socket
//   still mid-upgrade holds a reservation, so the reset never fires while one is reserved and not
//   yet opened: conservative — such a socket that then opens beside no one is reset at its open,
//   and one that opens beside another subscriber is told the log is incomplete (fail closed).
// ---------------------------------------------------------------------------
const CHANNEL_PREFIX = "/_scrml_ws/";
export const CHANNEL_MAX_FRAME = 65536;
export const CHANNEL_FRAME_RATE = 50;
export const CHANNEL_FRAME_BURST = 100;
export const CHANNEL_MAX_SUBSCRIBERS = 1000;
export const CHANNEL_MAX_LOG_FRAMES = 10000;
export const CHANNEL_MAX_LOG_BYTES = 8388608;
// #1941 fix r1 (LOW-2): the TEST seam that lowers the log bounds is a registered symbol key on the
// host, never a string key — a deployment's JSON / env-built `createServer` options cannot carry
// it, so a config value like `{ frames: 0 }` can never truncate (and lock) every channel.
export const CHANNEL_LOG_TEST_HOOK = Symbol.for("scrml.test.channelLog");
// S479 (s479-channel-relay-fold) — §38.4.3 "Per-address bounds" (INTERIM): one address holds at most
// a tenth of a channel's subscriber places. The TEST seam that names a request's address (so one
// process can stand in for many clients) is a registered symbol on the host, like the log seam:
// `host[CHANNEL_ADDRESS_TEST_HOOK](request) → string`. A deployment's config cannot carry it.
export const CHANNEL_ADDRESS_SHARE = 10;
// §38.4.3 "Per-address bounds": an address's frame bucket, shared by all its connections, is this many
// connections' buckets — `burst` × 4 tokens refilled at `rate` × 4 per second (a browser's few tabs).
export const CHANNEL_ADDRESS_BUCKETS = 4;
export const CHANNEL_ADDRESS_TEST_HOOK = Symbol.for("scrml.test.channelAddress");
// S480 r1 (#1987 review MED-1) — §38.4.3 "Over a rate bound": a connection's CLOSE bucket holds `burst`
// plus this many seconds of `rate`. A conforming client is closed only when the network delays its
// frames by more than about this long and then delivers them together.
export const CHANNEL_CLOSE_WINDOW_S = 30;

// §40.2 `trusted-proxies=` as the compiler resolved it (an int 0..=32), else 0 — fail closed: a value
// this runtime cannot read trusts no forwarded header.
export const TRUSTED_PROXIES_MAX = 32;
function channelTrusted(v) {
  return Number.isSafeInteger(v) && v >= 0 && v <= TRUSTED_PROXIES_MAX ? v : 0;
}

// S479 (s479-channel-follow) — ruling:user-voice-scrml.md S479 "⭐ RULED — the rest of S478 hand-off
// §3.B", item 6: "`<program trusted-proxies=N>` (N = the number of proxies in front of the server; the
// client IP is the Nth-from-last X-Forwarded-For entry; 0 ignores the headers). PA amendment … default
// 0". §40.2: the entry of the forwarded header `name` that the outermost of `n` trusted proxies wrote —
// the Nth from the last of its comma-separated entries (each proxy APPENDS one; the entries before the
// Nth-from-last were written by the client or by an untrusted hop, and are never read). "" when `n` is
// 0, when the header is absent, when it holds fewer than `n` entries (a hop that should have appended
// one did not — fail closed: the caller uses the request's own value), or when that entry is empty.
export function forwardedEntry(request, name, n) {
  if (!Number.isSafeInteger(n) || n < 1) return "";
  const raw = request.headers.get(name);
  if (raw === null || raw === undefined) return "";
  const parts = String(raw).split(",");
  if (parts.length < n) return "";
  return parts[parts.length - n].trim();
}

// A bound the compiler resolved (a safe integer ≥ 1), else the §38.4.3 default — never "no bound".
function channelBound(v, dflt) {
  return Number.isSafeInteger(v) && v >= 1 ? v : dflt;
}

export function channel(desc) {
  const cells = new Map();
  for (const c of desc.cells) cells.set(c.key, { key: c.key, table: c.table, ops: Array.isArray(c.ops) ? c.ops : [], edges: c.edges ?? null });
  const lim = desc.limits !== null && typeof desc.limits === "object" ? desc.limits : {};
  const maxSubs = channelBound(lim.maxSubscribers, CHANNEL_MAX_SUBSCRIBERS);
  const perAddr = Math.max(1, Math.floor(maxSubs / CHANNEL_ADDRESS_SHARE));
  const fold = foldOf(desc, cells);
  return {
    name: desc.name, topic: desc.topic, key: JSON.stringify([desc.name, desc.topic]), cells,
    maxFrame: channelBound(lim.maxFrame, CHANNEL_MAX_FRAME),
    rate: channelBound(lim.rate, CHANNEL_FRAME_RATE),
    burst: channelBound(lim.burst, CHANNEL_FRAME_BURST),
    // §38.4.3 "Over a rate bound" (S480 r1): the close bucket's size — `burst` + `rate` × 30 s
    closeAt: channelBound(lim.burst, CHANNEL_FRAME_BURST) + channelBound(lim.rate, CHANNEL_FRAME_RATE) * CHANNEL_CLOSE_WINDOW_S,
    maxSubs,
    subs: 0,
    // S479 (s479-channel-follow) — ruled §3.B item 6: `<program trusted-proxies=N>`, the number of
    // proxies in front of the server (§40.2; 0, the default, ignores every X-Forwarded-* header). The
    // compiler prints the one program value on every channel's desc.
    trusted: channelTrusted(desc.trustedProxies),
    // S479 (s479-channel-relay-fold) — §38.4.3 "Per-address bounds" (INTERIM): the subscriber places
    // one address may hold, its upgrade bucket (`perAddr` upgrades, refilled at a tenth of that per
    // second, at least 1), and per address its live count, upgrade bucket and shared frame bucket
    perAddr,
    upRate: Math.max(1, perAddr / 10),
    addrs: new Map(),
    sweepAt: 64,
    // §38.4.2 "The relay's fold": `{ cells: [{ key, init }], resets }` — or null, and `noFold` says why
    fold: fold.fold,
    noFold: fold.why,
  };
}

// S479 (s479-channel-relay-fold) — §38.4.2 "The relay's fold". The compiler prints a fold for a
// channel whose every cell starts from a value fixed by the source (`init`, its initializer) and whose
// every write that applying a frame causes is one the relay can make itself (`resets`: a `reset-on=`
// of a channel cell whose triggers are all cells of this channel, writing a value fixed by the source);
// `desc.noFold` names why a channel has none (print.scrml chFoldWhy). Each value is checked here
// against its cell's type — sent through the wire as a receiver would get it (`onWire`) — and a value
// that does not encode, or that reads back as a DIFFERENT value (a `-0`, which JSON writes as `0`:
// a compaction base would then differ from the clients that started from the literal), is a
// compiler defect (chFoldWhy gives no fold to a `-0` initializer — not a literal value), and the
// channel gets no fold (fail closed: the receivers still check every frame).
function foldOf(desc, cells) {
  if (typeof desc.noFold !== "string") return { fold: null, why: "the compiler printed no fold for this channel" };
  if (desc.noFold !== "") return { fold: null, why: desc.noFold };
  const canon = (key, v) => {
    const c = cells.get(key);
    if (c === undefined) return { ok: false };
    const d = onWire(c.table, v);
    return d.ok && sameValue(d.value, v) ? d : { ok: false };
  };
  const out = [];
  for (const c of desc.cells) {
    if (!own(c, "init")) return { fold: null, why: `@${c.key} has no initial value in the channel's desc (a compiler defect)` };
    const d = canon(c.key, c.init);
    if (!d.ok) return { fold: null, why: `@${c.key}'s initial value does not encode against its type (a compiler defect)` };
    out.push({ key: c.key, init: d.value });
  }
  const resets = [];
  for (const r of Array.isArray(desc.resets) ? desc.resets : []) {
    const d = canon(r.cell, r.value);
    if (!d.ok || !Array.isArray(r.on) || r.on.length === 0 || !r.on.every((k) => cells.has(k)) || !Number.isSafeInteger(r.rank)) {
      return { fold: null, why: `the reset-on= rule of @${r.cell} is not one the relay can make (a compiler defect)` };
    }
    resets.push({ cell: r.cell, on: r.on, rank: r.rank, value: d.value });
  }
  return { fold: { cells: out, resets }, why: "" };
}

// s479 fix r1 (HIGH-1) — a value as a RECEIVER gets it: encoded against `table` (§57), written as the
// JSON text the relay sends, read back and decoded by the client's own decoder (canonicalOnly, as
// runtime.js `channel` `edit` decodes a relayed `__val`). `{ ok, text, value }`: `text` is the exact
// `__val` text the relay sends, `value` the value every receiver decodes from it — what the fold
// applies. One encode → one decode, so the fold and the receivers cannot disagree on a value whose
// JSON text loses something (a `-0` is written `0`; JSON has no `-0`).
function onWire(table, v) {
  const e = encode(table, v);
  if (!e.ok) return { ok: false };
  const text = JSON.stringify(e.wire);
  if (typeof text !== "string") return { ok: false };
  const d = decode(table, JSON.parse(text), { canonicalOnly: true });
  return d.ok ? { ok: true, text, value: d.value } : { ok: false };
}

// Two decoded values are the same value, `Object.is` at every leaf (a decoded value is built of
// primitives, tapes and plain objects, §57) — so `0` and `-0` differ.
function sameValue(a, b) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!own(b, k) || !sameValue(a[k], b[k])) return false;
  return true;
}

// s479 fix r1 (MED-1) — a TAPE the relay's fold holds: a ring buffer, so the relay applies an edit it
// has judged IN PLACE in time independent of the tape's length (amortized O(1) per element added or
// removed), where a copy per frame (runtime.js `channelStep`, the clients' way) cost the whole tape.
// The relay owns its fold — no one else reads it — so it needs no copy-on-write. `channelJudge`
// reads only `[CHANNEL_TAPE]` and `length`; `toArray` is the value for an encode (a compaction base).
class FoldTape {
  constructor(items) {
    let cap = 8;
    while (cap < items.length) cap *= 2;
    this.buf = new Array(cap);
    for (let i = 0; i < items.length; i++) this.buf[i] = items[i];
    this.head = 0;
    this.length = items.length;
  }
  slot(i) { return (this.head + i) & (this.buf.length - 1); }
  resize(cap) {
    const buf = new Array(cap);
    for (let i = 0; i < this.length; i++) buf[i] = this.buf[this.slot(i)];
    this.buf = buf;
    this.head = 0;
  }
  push(x) {
    if (this.length === this.buf.length) this.resize(this.buf.length * 2);
    this.buf[this.slot(this.length)] = x;
    this.length += 1;
  }
  unshift(x) {
    if (this.length === this.buf.length) this.resize(this.buf.length * 2);
    this.head = (this.head - 1) & (this.buf.length - 1);
    this.buf[this.head] = x;
    this.length += 1;
  }
  // remove `k` elements (at most all) from the end (`pop`) or the start (`shift`); a buffer left a
  // quarter full is halved, so a tape that shrinks gives its memory back
  pop(k) {
    const n = Math.min(k, this.length);
    for (let i = 0; i < n; i++) { this.length -= 1; this.buf[this.slot(this.length)] = undefined; }
    this.shrink();
  }
  shift(k) {
    const n = Math.min(k, this.length);
    for (let i = 0; i < n; i++) { this.buf[this.head] = undefined; this.head = this.slot(1); this.length -= 1; }
    this.shrink();
  }
  shrink() {
    let cap = this.buf.length;
    while (cap > 8 && this.length * 4 < cap) cap /= 2;
    if (cap !== this.buf.length) this.resize(cap);
  }
  toArray() {
    const out = new Array(this.length);
    for (let i = 0; i < this.length; i++) out[i] = this.buf[this.slot(i)];
    return out;
  }
}
FoldTape.prototype[CHANNEL_TAPE] = true;

// A fold value as the encoder reads it (a FoldTape is a tape).
function plainOf(v) {
  return v instanceof FoldTape ? v.toArray() : v;
}

// A fold's starting state: each cell's initial value (§38.4.2 "The relay's fold").
function foldStart(ch) {
  if (ch.fold === null) return null;
  const m = new Map();
  for (const c of ch.fold.cells) m.set(c.key, held(ch, c.key, fresh(c.init)));
  return m;
}

// A value as a source literal evaluates to: an object or a tape is a NEW one each time (the client's
// reset evaluates its value again — runtime.js `drainResets` — so its write is never `Object.is` the
// old value), a primitive is itself.
function fresh(v) {
  return v !== null && typeof v === "object" ? structuredClone(v) : v;
}

// A value the fold holds for cell `key`: a tape cell's array becomes a FoldTape (a copy of it — the
// fold owns what it holds); anything else is held as it is.
function held(ch, key, v) {
  const c = ch.cells.get(key);
  return Array.isArray(v) && c !== undefined && c.table !== null && c.table.root.k === "seq" ? new FoldTape(v) : v;
}

// §38.4.2: a frame applied to the fold as a receiver applies it to its cells — `Cell.set` with
// `Object.is` change detection (runtime.js `Cell.land`), then the `reset-on=` resets the write
// triggers, lowest rank first, each reset's own write queueing the resets it triggers (runtime.js
// `drainResets`). Only channel cells are modelled: a channel with any other derived write has no fold.
//   s479 fix r1 (MED-1): the edit — one `channelJudge` has already accepted against `vals.get(key)` —
// is applied IN PLACE. A tape op is always a change, as for the receiver: its `channelStep` builds a
// NEW array, never `Object.is` the old one. `val` is the value decoded from the relay's own outbound
// text (`onWire`), owned by the fold from here.
function foldApply(ch, vals, key, op, val) {
  if (op === "replace" || op === "transition") {
    if (Object.is(val, vals.get(key))) return;
    vals.set(key, held(ch, key, val));
  } else {
    const t = vals.get(key);
    if (!(t instanceof FoldTape)) throw new Error(`scrml server: the relay's fold holds no tape for @${key} (a defect)`);
    if (op === "append") t.push(val);
    else if (op === "prepend") t.unshift(val);
    else if (op === "pop") t.pop(val);
    else if (op === "shift") t.shift(val);
    else throw new Error(`scrml server: the relay's fold has no in-place \`${op}\` (a defect)`);
  }
  const due = new Set();
  const trigger = (k) => { for (const r of ch.fold.resets) if (r.on.includes(k)) due.add(r); };
  trigger(key);
  while (due.size > 0) {
    let r = null;
    for (const x of due) if (r === null || x.rank < r.rank) r = x;
    due.delete(r);
    const v = fresh(r.value);
    if (Object.is(v, vals.get(r.cell))) continue;
    vals.set(r.cell, held(ch, r.cell, v));
    trigger(r.cell);
  }
}

// The relay's fold step as `channelSockets` makes it — a fold's start (`start(ch)`, `ch` from
// `channel(desc)`), the judgement (`channelJudge`) and the in-place apply — for the slice tests
// (channel-fold-s479.test.js: the ring buffer against the clients' copy, and the per-frame cost).
export const CHANNEL_FOLD_TEST = Object.freeze({ start: foldStart, judge: channelJudge, apply: foldApply, plain: plainOf, FoldTape });

// The UTF-8 byte length of `s`, counted only as far as `max + 1` (a frame's size bound).
function utf8Over(s, max) {
  if (s.length > max) return true;            // every UTF-16 unit is at least one byte
  if (s.length * 3 <= max) return false;      // and at most three
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3;
    if (n > max) return true;
  }
  return false;
}

// §38.4.3: "each connection holds a bucket of `burst` tokens, refilled at `rate` tokens per
// second up to `burst`; each frame it sends spends one token, before it is decoded". `now` ms.
// S479 (s479-channel-follow), §38.4.3 "Over a rate bound": "ok" (a token spent); "refuse" — the bucket
// held less than one token, and the refused frame spends none of it (no debt, so the frames an honest
// client sends after a network-bunched burst find the bucket refilling at `rate`, faster than the
// client's 95% pacing); "close" — a refused frame that ALSO found the connection's CLOSE bucket empty.
// S480 r1 (#1987 review MED-1): every frame spends a token of the close bucket — `burst` + `rate` ×
// CHANNEL_CLOSE_WINDOW_S tokens, refilled at `rate` — so a conforming client (at most `burst` less 5%
// plus 95% of `rate` per second, in SEND time) empties it only when the network holds its frames back
// for more than about that window and delivers them at once; a sender over `rate` empties it.
function takeToken(data, ch, now) {
  let b = data.scrmlBucket;
  if (b === undefined) { b = { tokens: ch.burst, at: now }; data.scrmlBucket = b; }
  let d = data.scrmlCloseBucket;
  if (d === undefined) { d = { tokens: ch.closeAt, at: now }; data.scrmlCloseBucket = d; }
  const within = spend(d, ch.closeAt, ch.rate, now);
  // S480 r2 (#1987 review NEW-1): "ok-dry" — a token spent, but the close bucket is empty, so the
  // frame closes the sender if a LATER bound (its address's bucket) refuses it
  if (spend(b, ch.burst, ch.rate, now)) return within ? "ok" : "ok-dry";
  return within ? "refuse" : "close";
}

// §38.4.3 "Over a rate bound": a frame refused UNREAD — `{ __type: "__refused", __why }`. It counts as
// a refusal of this connection for the `__seen` close rule (§38.4.2 "The relay's fold"): until the
// sender has read it, its cells still show that edit.
function refuseUnread(ws, r, why) {
  ws.data.scrmlRefusedAt = r.seq;
  try { ws.send(`{"__type":"__refused","__why":${JSON.stringify(why)}}`); } catch { /* the socket is gone */ }
}

// One token of bucket `b` (`size` tokens, refilled at `rate` per second), or false when it has less than one.
function spend(b, size, rate, now) {
  const dt = now - b.at;
  if (dt > 0) b.tokens = Math.min(size, b.tokens + (dt * rate) / 1000);
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

function clockOf(host) {
  return host !== null && typeof host === "object" && typeof host.now === "function" ? () => host.now() : () => performance.now();
}

function originOk(request, trusted = 0) {
  const origin = request.headers.get("Origin");
  if (origin === null) return true;
  try {
    const o = new URL(origin);
    if (o.origin === "null") return false;
    const u = new URL(request.url, "http://localhost");
    // S479 (s479-channel-follow), §40.2 `trusted-proxies=`: the forwarded host and scheme are the
    // entries the outermost trusted proxy wrote (`forwardedEntry`); with no trusted proxy (0, the
    // default) both headers are ignored — they are text the client may have written
    const fwdHost = forwardedEntry(request, "X-Forwarded-Host", trusted);
    const fwdProto = forwardedEntry(request, "X-Forwarded-Proto", trusted).toLowerCase();
    let proto = fwdProto !== "" ? fwdProto : u.protocol.replace(":", "").toLowerCase();
    if (proto === "ws") proto = "http";
    if (proto === "wss") proto = "https";
    if (proto !== "http" && proto !== "https") return false;
    const self = new URL(proto + "://" + (fwdHost !== "" ? fwdHost : u.host));
    if (o.host !== self.host) return false;
    return o.protocol === self.protocol || (o.protocol === "https:" && self.protocol === "http:");
  } catch {
    return false;
  }
}

// Called after `fetch` has applied the §40.2 Origin check (403) and found the channel (404):
// "refused with `403` before the upgrade and before any channel handler runs".
function upgradeChannel(host, ch, request, upgrader, websocket) {
  if (request.method !== "GET") return jsonResponse(host, 405, FIXED[405], { Allow: "GET" });
  const up = (request.headers.get("Upgrade") ?? "").toLowerCase();
  if (up !== "websocket") return jsonResponse(host, 426, { error: "Upgrade Required" }, { Upgrade: "websocket" });
  // §38.4.3: "A channel admits at most `max-subscribers` open connections per server process; a
  // further upgrade SHALL be answered `503`" — after the 403 / 404 / 405 / 426 refusals.
  if (ch.subs >= ch.maxSubs) return jsonResponse(host, 503, FIXED[503]);
  if (upgrader === null || upgrader === undefined || typeof upgrader.upgrade !== "function") {
    logLine(host, `scrml server: ${CHANNEL_PREFIX}${ch.name} — the host passed no WebSocket upgrader (Bun.serve's server, as fetch's second argument)`);
    return jsonResponse(host, 500, FIXED[500]);
  }
  // S479 (s479-channel-relay-fold) — §38.4.3 "Per-address bounds" (INTERIM, keyed by the request's
  // address, `server.requestIP`): "An address SHALL hold at most `max(1, ⌊max-subscribers / 10⌋)`
  // of a channel's places … a further upgrade from it SHALL be answered `429`", and "each address
  // has an upgrade bucket … an upgrade that finds less than one token SHALL be answered `429`" —
  // after the channel-wide cap (`503`). Checked and reserved in this one synchronous step.
  const now = clockOf(host)();
  const a = addressOf(host, ch, request, upgrader, now);
  if (a.live >= ch.perAddr) return jsonResponse(host, 429, FIXED[429]);
  const ub = a.up;
  ub.tokens = Math.min(ch.perAddr, ub.tokens + (Math.max(0, now - ub.at) * ch.upRate) / 1000);
  ub.at = now;
  if (ub.tokens < 1) return jsonResponse(host, 429, FIXED[429]);
  ub.tokens -= 1;
  // §38.4.3 (S478 fix r1, LOW-4): the subscriber's place is RESERVED before the upgrade (the
  // check above and this count are one synchronous step), so "answered `503` before the
  // upgrade" holds for every racing upgrade; a failed upgrade, and the socket's `close`,
  // release it.
  ch.subs += 1;
  a.live += 1;
  const data = { scrmlChannel: ch, scrmlSockets: websocket, scrmlCounted: true, scrmlAddr: a };
  let ok = false;
  try { ok = upgrader.upgrade(request, { data }) === true; } finally { if (!ok) releaseSub(data, now); }
  if (ok) return undefined;
  return jsonResponse(host, 400, FIXED[400]);
}

// The per-address record of `ch` for this request's address — S479 (s479-channel-follow), §40.2
// `trusted-proxies=` N >= 1: the Nth-from-last `X-Forwarded-For` entry (`forwardedEntry`), else (N = 0,
// or no such entry) `server.requestIP(request).address`; "" when the host names none — every such
// request is one address. Swept of idle, refilled records
// whenever the table has doubled since the last sweep, so it is bounded by the addresses in use.
function addressOf(host, ch, request, upgrader, now) {
  let addr = "";
  try {
    const seam = host !== null && typeof host === "object" ? host[CHANNEL_ADDRESS_TEST_HOOK] : undefined;
    const fwd = forwardedEntry(request, "X-Forwarded-For", ch.trusted);
    if (typeof seam === "function") addr = String(seam(request));
    else if (fwd !== "") addr = fwd.slice(0, 128);
    else if (typeof upgrader.requestIP === "function") { const ip = upgrader.requestIP(request); if (ip !== null && ip !== undefined && typeof ip.address === "string") addr = ip.address; }
  } catch { addr = ""; }
  let a = ch.addrs.get(addr);
  if (a === undefined) {
    if (ch.addrs.size >= ch.sweepAt) {
      const fullMs = Math.max(ch.burst / ch.rate, ch.perAddr / ch.upRate) * 1000;   // both buckets refilled
      for (const [k, x] of ch.addrs) if (x.live === 0 && now - x.idle >= fullMs) ch.addrs.delete(k);
      ch.sweepAt = Math.max(64, ch.addrs.size * 2);
    }
    a = { live: 0, up: { tokens: ch.perAddr, at: now }, frames: { tokens: ch.burst * CHANNEL_ADDRESS_BUCKETS, at: now }, idle: now };
    ch.addrs.set(addr, a);
  }
  return a;
}

// Frees a subscriber's place (§38.4.3 "A closed connection frees its place") — once — and its
// address's (the address record stays, with its buckets, until it is idle and refilled).
function releaseSub(data, now) {
  if (data.scrmlCounted !== true) return;
  data.scrmlCounted = false;
  data.scrmlChannel.subs -= 1;
  const a = data.scrmlAddr;
  if (a === undefined) return;
  a.live -= 1;
  a.idle = now;
}

function closeSocket(host, ws, code, why) {
  logLine(host, `scrml server: ${CHANNEL_PREFIX}${ws.data.scrmlChannel.name} — closed a connection: ${why}`);
  try { ws.close(code, why.slice(0, 120)); } catch { /* already closed */ }
}

// The frame a client sent, or why it is refused ({ code, why }).
function channelFrame(ch, raw) {
  if (typeof raw !== "string") return { code: 1003, why: "a non-text frame" };
  if (utf8Over(raw, ch.maxFrame)) return { code: 1009, why: "a frame over " + ch.maxFrame + " bytes" };
  let v;
  try { v = JSON.parse(raw); } catch { return { code: 1007, why: "a frame that is not JSON" }; }
  if (v === null || typeof v !== "object" || Array.isArray(v)) return { code: 1008, why: "a frame that is not a JSON object" };
  const keys = Object.keys(v);
  // S479 (s479-channel-follow), §38.4.2 "The frame": a client frame carries `__seen`, the last sequence
  // number its sender had applied (an int ≥ 0); its range is checked against the connection in `message`
  if (keys.length !== 5 || !own(v, "__type") || !own(v, "__key") || !own(v, "__op") || !own(v, "__val") || !own(v, "__seen")) return { code: 1008, why: "a frame that is not exactly {__type, __key, __op, __val, __seen}" };
  if (!Number.isSafeInteger(v.__seen) || v.__seen < 0) return { code: 1008, why: "a frame whose __seen is not an int ≥ 0" };
  if (v.__type !== "__sync") return { code: 1008, why: "a frame whose __type is not __sync" };
  if (typeof v.__key !== "string" || !ch.cells.has(v.__key)) return { code: 1008, why: "a __sync for a cell the channel does not declare" };
  const cell = ch.cells.get(v.__key);
  const op = v.__op;
  if (typeof op !== "string" || !cell.ops.includes(op)) return { code: 1008, why: `a __sync whose __op is not an op @${v.__key} syncs` };
  // #1937 fix r1 (HIGH-1): a length-changing op of a FIXED-length tape (no `free` / bound grant,
  // §66.12.1–§66.12.2 — no local write may change its length) is refused from the table the relay
  // holds; it needs no cell value. (The compiler syncs no such op — analyze chSyncOps — so only a
  // forged frame names one.)
  if (op === "append" || op === "prepend" || op === "pop" || op === "shift") {
    const b = cell.table !== null && cell.table.root.k === "seq" ? cell.table.root.bound : null;
    if (b === null || typeof b !== "object" || b.k === "fixed") return { code: 1008, why: `a __sync whose __op changes the length of @${v.__key}, a fixed-length tape` };
  }
  //   s479 fix r1 (HIGH-1) — §38.4.2: a frame is "relayed RE-ENCODED from the decoded payload", and
  //   the fold applies it "as a receiver applies it". A receiver applies what it RECEIVES — the
  //   relay's re-encoded text, decoded — not the sender's text: the two differ where JSON loses
  //   something (the sender's `-0` is relayed as `0`). So the payload is re-encoded once, to the
  //   exact `__val` text sent (`text`), and the fold's value is decoded from THAT text (`onWire`).
  let r;
  if (op === "replace" || op === "transition") {
    const d = decode(cell.table, v.__val, { canonicalOnly: true });
    if (!d.ok) return { code: 1007, why: `a __sync whose value does not decode against @${v.__key}'s type` };
    r = onWire(cell.table, d.value);
  } else if (op === "append" || op === "prepend") {
    if (cell.table === null || cell.table.root.k !== "seq") return { code: 1011, why: `an element op for @${v.__key}, which is not a tape` };
    const et = { defs: cell.table.defs, root: cell.table.root.elem };
    const d = decode(et, v.__val, { canonicalOnly: true });
    if (!d.ok) return { code: 1007, why: `a __sync whose element does not decode against @${v.__key}'s element type` };
    r = onWire(et, d.value);
  } else if (op === "pop" || op === "shift") {
    if (!Number.isSafeInteger(v.__val) || v.__val < 1) return { code: 1007, why: `a __sync whose count for @${v.__key} is not an int ≥ 1` };
    r = { ok: true, text: JSON.stringify(v.__val), value: v.__val };
  } else {
    return { code: 1008, why: `a __sync whose __op the server does not relay` };
  }
  if (!r.ok) return { code: 1011, why: `a __sync for @${v.__key} that does not re-encode to a value its receivers decode` };
  return { key: v.__key, op, text: r.text, val: r.value, seen: v.__seen };
}

// `maxPayloadLength` (Bun's own cap, bytes) is the largest channel frame bound + 1 (S478 fix r1,
// LOW-5), so no more than the bound (+1) is ever buffered for one frame. A frame one byte over a
// channel's bound reaches `channelFrame` and is closed 1009; a larger one is dropped by Bun
// before it is read in full — the TCP connection is closed with no close frame (the client sees
// 1006). §38.4.3 admits both ("the host MAY drop it unread"); a conforming client sends neither.
function channelSockets(host, channels = [], limits = {}) {
  let most = CHANNEL_MAX_FRAME;
  for (const ch of channels) if (ch.maxFrame > most) most = ch.maxFrame;
  const now = clockOf(host);
  // CHANNEL_LOG_TEST_HOOK (a test seam) may only LOWER the §38.4.2 bounds, never raise them
  const lower = (v, max) => (Number.isSafeInteger(v) && v >= 0 && v < max ? v : max);
  const maxFrames = lower(limits.frames, CHANNEL_MAX_LOG_FRAMES);
  const maxBytes = lower(limits.bytes, CHANNEL_MAX_LOG_BYTES);
  // per channel (its topic key): the last sequence number, the frame log (null once truncated),
  // its size in UTF-8 bytes, the replay text built from it (null: not built since the last
  // change). The subscriber count is `ch.subs` (#1942, reserved at the upgrade) — not kept here.
  //   #1941 fix r1 (LOW-1): §38.4.2 "at most 8,388,608 bytes of relayed frame text (8 MiB; the
  //   frames' `JSON` text as relayed, UTF-8 encoded, summed)" — counted in UTF-8 bytes, so the bound
  //   is the replay's size on the wire, not UTF-16 code units (a CJK frame is 3 bytes a unit).
  //   #1941 fix r1 (MED-3): the replay text is built once per log change and reused by every
  //   open, not re-joined per open (the per-address and rate limits of item 49 are PR #1942's).
  //   #1941 fix r1 (HIGH-1): §38.4.2 "When the last subscriber of a channel whose log was
  //   truncated leaves, the relay SHALL start the channel again: a new, empty, complete log at
  //   sequence `0`" — no client holds the channel's state then, so nothing can diverge.
  //   S479 (s479-channel-relay-fold), §38.4.2 "The relay's fold": a channel the compiler gave a fold
  //   (`ch.fold`) keeps, beside its log, the value of each of its cells after every frame it has
  //   relayed (`r.fold`), computed from its initial values by the relay's own judgement of each
  //   frame — runtime.js `channelJudge`, the receiver's check (3) — and the `reset-on=` writes that
  //   applying it causes (`foldApply`, in place). It is used twice: a frame the fold refuses is relayed to no
  //   one, logged nowhere and takes no sequence number (its sender is told, `__refused`, or closed
  //   `1008` when no concurrent edit can explain it); and past the log bound the relay COMPACTS — the
  //   fold becomes the replay's `__base` and the log starts again after it — instead of truncating.
  //   It is never sent except as that base, and never read from a client.
  const relays = new Map();
  const relayOf = (ch) => {
    let r = relays.get(ch.key);
    if (r === undefined) {
      r = { seq: 0, log: [], bytes: 0, base: null, fold: foldStart(ch), text: null, last: { seq: 0, who: null }, other: 0 };
      relays.set(ch.key, r);
    }
    return r;
  };
  const replayText = (r) => {
    if (r.text === null) {
      const base = r.log === null || r.base === null ? "null" : r.base.text;
      r.text = `{"__type":"__replay","__complete":${r.log !== null},"__seq":${r.seq},"__base":${base},"__frames":[${r.log === null ? "" : r.log.join(",")}]}`;
    }
    return r.text;
  };
  // The compaction base of the fold now: `{ seq, text, bytes }` (`text` the `__base` JSON), or null
  // when a value does not encode (a defect — the relay then truncates, fail closed).
  const baseOf = (ch, r) => {
    const parts = [];
    for (const c of ch.fold.cells) {
      // every fold value reads back as itself (s479 fix r1, HIGH-1: each came from `onWire`, or is an
      // initial / reset value `foldOf` checked the same way), so a joiner decodes exactly the fold
      const e = encode(ch.cells.get(c.key).table, plainOf(r.fold.get(c.key)));
      if (!e.ok) return null;
      parts.push(`${JSON.stringify(c.key)}:${JSON.stringify(e.wire)}`);
    }
    const text = `{"__seq":${r.seq},"__cells":{${parts.join(",")}}}`;
    return { seq: r.seq, text, bytes: Buffer.byteLength(text, "utf8") };
  };
  const truncate = (ch, r, why) => {
    r.log = null;
    r.bytes = 0;
    r.base = null;
    r.fold = null;
    logLine(host, `scrml server: ${CHANNEL_PREFIX}${ch.name} — the frame log passed its bound (${maxFrames} frames / ${maxBytes} bytes) and was truncated (${why}); the relay logs no more frames, and a client that connects while any subscriber remains is told the log is incomplete (§38.4.2); the channel starts again, empty, when its last subscriber leaves`);
  };
  // §38.4.2 "When the last subscriber of a channel whose log was truncated leaves, the relay SHALL
  // start the channel again" — read from `ch.subs` (the one count, reserved at the upgrade).
  const restart = (ch, why) => {
    const r = relays.get(ch.key);
    if (r === undefined || r.log !== null) return;
    relays.delete(ch.key);
    logLine(host, `scrml server: ${CHANNEL_PREFIX}${ch.name} — ${why}; the channel starts again with an empty log at sequence 0 (§38.4.2)`);
  };
  return {
    maxPayloadLength: most + 1,
    open(ws) {
      const ch = ws.data.scrmlChannel;
      // the place was reserved at the upgrade (upgradeChannel) — the cap needs no check here. A
      // truncated channel whose ONLY reservation is this socket's has no other subscriber holding
      // its state (an earlier one left, or its upgrade failed): it starts again before the replay.
      if (ch.subs === 1 && ws.data.scrmlCounted === true) restart(ch, "a subscriber opened a channel whose frame log was truncated and that no other subscriber holds");
      const r = relayOf(ch);
      // §38.4.2: the replay is ONE message, the first this socket is sent. It is a relay-to-client
      // message: no client bucket counts it and the frame-size bound (client-to-relay frames,
      // §38.4.3) does not apply to it; the log bound (8 MiB) bounds it. Fail closed: a replay the
      // host drops (`send` → 0) closes the socket unsubscribed, so it never gets a live frame
      // without the log before it.
      let st;
      try { st = ws.send(replayText(r)); } catch { st = 0; }
      if (st === 0) return closeSocket(host, ws, 1011, "the replay message could not be sent");
      // S479: the last sequence number this connection's replay holds — a frame of ANOTHER connection
      // numbered past it is an edit this connection may not have seen when it made its own
      ws.data.scrmlOpenSeq = r.seq;
      ws.subscribe(ch.key);
    },
    message(ws, raw) {
      const ch = ws.data.scrmlChannel;
      const t = now();
      const r = relayOf(ch);
      // S479 (s479-channel-follow) — §38.4.3 "Over a rate bound": a frame that finds less than one
      // token in its connection's bucket, or in its address's shared bucket, is REFUSED UNREAD — not
      // decoded, relayed to no one, numbered never, spending no token — and its sender is sent
      // `{"__type":"__refused","__why"}`, which a client takes as its oldest unanswered frame refused: it
      // slows down and re-sends that edit, paced (S480 r2). Only SUSTAINED abuse closes: a refused frame —
      // by either bucket — that finds the connection's CLOSE bucket (`burst` + 30 s of `rate`, spent by
      // every frame) empty closes the sender `1008`. An address's bucket alone never closes a connection
      // (its clients may be many honest users behind one NAT, each pacing only its own connection, so
      // none of them sends past `rate` and empties its own close bucket): they are refused, and slow down.
      const rate = takeToken(ws.data, ch, t);
      if (rate === "close") return closeSocket(host, ws, 1008, `frames faster than the channel's rate limit (${ch.rate}/s, burst ${ch.burst}), past its close bound (${ch.closeAt} frames over ${CHANNEL_CLOSE_WINDOW_S} s of the rate)`);
      if (rate === "refuse") return refuseUnread(ws, r, `over this connection's rate limit (${ch.rate}/s, burst ${ch.burst})`);
      // S479 — §38.4.3 "Per-address bounds" (INTERIM): every frame also spends one token of its
      // ADDRESS's bucket, shared by all that address's connections and kept across them — so neither
      // reconnecting nor parallel sockets multiply one address's frame rate past CHANNEL_ADDRESS_BUCKETS
      // connections' worth
      const a = ws.data.scrmlAddr;
      const k = CHANNEL_ADDRESS_BUCKETS;
      if (a !== undefined && !spend(a.frames, ch.burst * k, ch.rate * k, t)) {
        // S480 r2 (#1987 review NEW-1), §38.4.3: "a frame that is refused unread and also finds less than
        // one token in its close bucket SHALL instead close the sender" — an address refusal too, so a
        // socket whose address bucket is kept dry is bounded by its own close bucket
        if (rate === "ok-dry") return closeSocket(host, ws, 1008, `frames refused over the rate limit of this connection's address (${ch.rate * k}/s, burst ${ch.burst * k}), past this connection's close bound (${ch.closeAt} frames over ${CHANNEL_CLOSE_WINDOW_S} s of the rate)`);
        // a refused frame spends no token of its connection's bucket (S480 r1): give back the one spent above
        ws.data.scrmlBucket.tokens += 1;
        return refuseUnread(ws, r, `over the rate limit of this connection's address (${ch.rate * k}/s, burst ${ch.burst * k}, shared by its connections)`);
      }
      const f = channelFrame(ch, raw);
      if (f.code !== undefined) return closeSocket(host, ws, f.code, f.why);
      // S479 (s479-channel-follow), §38.4.2 "The frame": `__seen` names a sequence number this
      // connection can have applied — at least its replay's and its own previous frame's (a client's
      // applied sequence number only grows on one connection), at most the channel's last
      const floor = Math.max(ws.data.scrmlOpenSeq, ws.data.scrmlSeen ?? 0);
      if (f.seen < floor || f.seen > r.seq) {
        return closeSocket(host, ws, 1008, `a frame whose __seen ${f.seen} is outside ${floor}..=${r.seq} (its last __seen or replay, to the last frame relayed)`);
      }
      ws.data.scrmlSeen = f.seen;
      // §38.4.2 "The relay's fold": the frame applied to the fold's value of its cell, by the
      // receiver's own check (3). Refused: relayed to no one, not logged, no sequence number. Its
      // sender is told `__refused` when a concurrent edit can explain it, and is otherwise closed
      // `1008`. S479 (s479-channel-follow) — `__seen` (the capable form of the S479 relay-fold close
      // rule): a concurrent edit explains it when a frame of ANOTHER connection was relayed after
      // `__seen` (the sender had not applied it when it made the edit), or an earlier frame of this
      // connection was refused at or after `__seen` (the sender may not have read that refusal yet, so
      // it still showed that edit). Otherwise the sender's cells showed exactly the fold's value —
      // the frames up to `__seen`, and its own frames relayed since, which it applied first as pending
      // edits by the same check — so no honest client could have made the edit.
      if (r.fold !== null) {
        // s479 fix r1 (MED-1): judged by the receivers' own rule (runtime.js `channelJudge`), then
        // applied to the fold in place (`foldApply`) — no copy of the cell's value per frame
        const s = channelJudge(ch.cells.get(f.key), r.fold.get(f.key), f.op, f.val);
        if (s !== null) {
          const other = r.last.who !== ws.data ? r.last.seq : r.other;
          const refusedAt = ws.data.scrmlRefusedAt ?? -1;
          if (other <= f.seen && refusedAt < f.seen) {
            return closeSocket(host, ws, 1008, `the relay's fold refuses it, unexplained since __seen: ${s}`);
          }
          ws.data.scrmlRefusedAt = r.seq;
          ws.send(`{"__type":"__refused","__key":${JSON.stringify(f.key)},"__op":${JSON.stringify(f.op)},"__val":${f.text},"__why":${JSON.stringify(s)}}`);
          return;
        }
        foldApply(ch, r.fold, f.key, f.op, f.val);
      }
      r.seq += 1;
      r.text = null;
      if (r.last.who !== ws.data) { r.other = r.last.seq; r.last = { seq: r.seq, who: ws.data }; } else r.last.seq = r.seq;
      // s479 fix r1 (HIGH-1): `__val` is spliced from `f.text` — the very text the fold's value was
      // decoded from (`onWire`) — so what every receiver decodes is what the fold applied
      const head = `{"__type":"__sync","__seq":${r.seq},"__key":${JSON.stringify(f.key)},"__op":${JSON.stringify(f.op)},"__val":${f.text},"__own":`;
      const peer = head + "false}";
      const own = head + "true}";
      if (r.log !== null) {
        const size = Buffer.byteLength(peer, "utf8");
        const baseBytes = r.base === null ? 0 : r.base.bytes;
        if (r.log.length + 1 > maxFrames || baseBytes + r.bytes + size > maxBytes) {
          if (r.fold === null) {
            truncate(ch, r, `this channel has no relay fold: ${ch.noFold}`);
          } else {
            // §38.4.2 "The log bound": COMPACT — the fold after this frame is the new base, and the
            // log starts again after it. A base over half the byte bound is not kept (each later
            // compaction would re-encode it for a few frames): the log is truncated and the fold dropped.
            const b = baseOf(ch, r);
            if (b === null) truncate(ch, r, "a fold value did not encode (a defect)");
            else if (b.bytes * 2 > maxBytes) truncate(ch, r, `the relay's fold is ${b.bytes} bytes, over half the log's byte bound`);
            else { r.base = b; r.log = []; r.bytes = 0; }
          }
        } else {
          r.log.push(peer);
          r.bytes += size;
        }
      }
      ws.publish(ch.key, peer);
      ws.send(own);
    },
    close(ws) {
      const ch = ws.data.scrmlChannel;
      try { ws.unsubscribe(ch.key); } catch { /* the socket is gone */ }
      if (ws.data.scrmlCounted !== true) return;
      releaseSub(ws.data, now());
      if (ch.subs <= 0) restart(ch, "the last subscriber left a channel whose frame log was truncated");
    },
  };
}

// ---------------------------------------------------------------------------
// s478 (s478-boot-endpoint) — SPEC §61 `<endpoint>`: a typed INBOUND route a
// foreign client calls. `desc` (print-server.scrml endpointConsts): its path,
// method, `accepts=` enum name and that enum's variants — each with its payload
// field names and their §57 tables; `arms` (endpointEntry): per variant name (or
// `_`, the wildcard) the arm's `run` (null: a self-closing no-op arm), the §57
// table of its value and its binders' names.
//   §61.7: NO CSRF gate ("`<endpoint>` … SHALL NOT be routed through the §12 CSRF
//   gate (JSON+bearer is CSRF-exempt by construction, dpa-002)").
//   §61.3: the body decodes against the enum (the §41.13 tagged shape: a JSON
//   object whose `tag` names the variant, its payload fields beside it); a failure
//   is "the compiler-owned structured error envelope `{ error: { kind, message } }`
//   — HTTP 400 … `kind` ∈ … `MissingDiscriminator` / `UnknownVariant` /
//   `InvalidPayload` / `Malformed`" (§61.5), and no arm runs.
//   §61.5: "The compiler SHALL serialize an arm's typed value-return directly as
//   the JSON response body — HTTP 200, `Content-Type: application/json`"; "A
//   self-closing `<Variant/>` arm SHALL return default-success with no body — HTTP
//   204 No Content".
// S478 open-Qs ruling (user-voice), items 33 / 35 / 39 — §61.3: "The request body's
// keys SHALL be exactly `tag` and payload fields of the variant `tag` names. A key
// that is neither is a decode failure — `::InvalidPayload`"; §61.5: a non-JSON
// media type is 415 `UnsupportedMediaType`; §61.7: another method at the path is
// 405 + `Allow`. A JSON array is Malformed (§41.13: MissingDiscriminator is "an
// OBJECT that lacks a `tag` field").
// ---------------------------------------------------------------------------
export function endpoint(desc, arms) {
  return { path: desc.path, method: desc.method, desc, arms };
}

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function decodeFailure(host, kind, message) {
  return jsonResponse(host, 400, { error: { kind, message } });
}

// review #1916 M1: §61.7 exempts an endpoint from CSRF because it is "JSON-body +
// bearer-token" ("A JSON-body + bearer-token endpoint is **CSRF-exempt by
// construction** (dpa-002)"). The JSON half is enforced here: a request whose media
// type is not `application/json` is refused 415 before its body is read, so no arm
// runs. A browser cannot send that media type cross-origin without a CORS preflight,
// and the preflight (OPTIONS) is answered 405, so a page the operator visits cannot
// drive an endpoint as a CORS simple request (`text/plain`, a form, multipart).
// The media type is the header up to its first `;` (RFC 9110 §8.3.1: parameters such
// as `charset` follow), compared case-insensitively (type and subtype are
// case-insensitive, §8.3.1).
function isJsonMediaType(ct) {
  if (typeof ct !== "string") return false;
  const semi = ct.indexOf(";");
  return (semi < 0 ? ct : ct.slice(0, semi)).trim().toLowerCase() === "application/json";
}

// review #1916 L6: a request-supplied name echoed in an error message is clipped
const clip = (s) => (s.length > 64 ? s.slice(0, 64) + "…" : s);

// §61.3 "A repeated key" — the detector lives in runtime.js (S479: the standalone §41.13
// `parseVariant` refuses a repeated key too, and runs on the client), imported above as
// `jsonRepeatedKeyRt` and re-exported here under its own name.

async function handleEndpoint(host, ep, request) {
  if (!isJsonMediaType(request.headers.get("Content-Type"))) {
    return jsonResponse(host, 415, { error: { kind: "UnsupportedMediaType", message: "the request Content-Type must be application/json" } });
  }
  let text;
  try { text = await request.text(); } catch { return decodeFailure(host, "Malformed", "the request body could not be read"); }
  let v;
  // S480: the JS host's parser message only in a dev build (a production answer carries no host error text)
  try { v = JSON.parse(text); } catch (e) { return decodeFailure(host, "Malformed", isDevBuild(host) ? `request body is not JSON: ${messageOf(e)}` : "request body is not JSON"); }
  if (v === null || typeof v !== "object" || Array.isArray(v)) return decodeFailure(host, "Malformed", "request body is not a JSON object");
  const rep = jsonRepeatedKeyRt(text);
  if (rep !== undefined) return decodeFailure(host, "Malformed", `request body repeats the key '${clip(rep)}' in one object`);
  if (!own(v, "tag") || typeof v.tag !== "string") return decodeFailure(host, "MissingDiscriminator", "request body is missing the variant discriminator field 'tag'");
  let variant;
  for (const x of ep.desc.variants) if (x.name === v.tag) variant = x;
  if (variant === undefined) return decodeFailure(host, "UnknownVariant", `request body names an unknown variant '${clip(v.tag)}' of ${ep.desc.type}`);
  for (const k of Object.keys(v)) {
    if (k !== "tag" && !variant.fields.includes(k)) return decodeFailure(host, "InvalidPayload", `request payload field '${clip(k)}' is not a field of variant '${variant.name}'`);
  }
  const args = [];
  for (let i = 0; i < variant.fields.length; i++) {
    const f = variant.fields[i];
    if (!own(v, f)) return decodeFailure(host, "InvalidPayload", `request payload field '${f}' of variant '${variant.name}' is missing`);
    const d = decode(variant.params[i], v[f], { canonicalOnly: true });
    if (!d.ok) return decodeFailure(host, "InvalidPayload", `request payload field '${f}' of variant '${variant.name}' is invalid: ${d.error && d.error.reason ? d.error.reason : "it does not decode"}`);
    args.push(d.value);
  }
  // §61.4: the arm of that variant, else the wildcard (the compiler proved one of them exists)
  const arm = own(ep.arms, variant.name) ? ep.arms[variant.name] : own(ep.arms, "_") ? ep.arms._ : undefined;
  if (arm === undefined) {
    logLine(host, `scrml server: ${ep.method} ${ep.path} — no arm for '${variant.name}' (the compiler's exhaustiveness check should have refused this program)`);
    return jsonResponse(host, 500, FIXED[500]);
  }
  if (arm.run === null) return noContent(host);
  let result;
  // S480 (ruling item 16): the arm's queries note their driver text in this request's record, as a route's do
  const { rec, run } = requestRecord();
  try {
    result = await run(() => arm.run(args));
  } catch (e) {
    // the arm's parameter check (refineEntry) — the request's payload, not the server, is at fault (§61.3: "decoded with §53 refinement enforcement")
    if (e !== null && typeof e === "object" && ENTRY_TRAPS.has(e)) {
      const dt = e.detail || {};
      const at = arm.binds.indexOf(String(dt.what));
      const field = at >= 0 && at < variant.fields.length ? variant.fields[at] : String(dt.what);
      return decodeFailure(host, "InvalidPayload", `request payload field '${field}' of variant '${variant.name}' violates its refinement ${String(dt.type)}`);
    }
    logLine(host, `scrml server: ${ep.method} ${ep.path} <${variant.name}> threw — ${messageOf(e)}`);
    return jsonResponse(host, 500, FIXED[500]);
  }
  if (arm.result === null) {
    logLine(host, `scrml server: ${ep.method} ${ep.path} <${variant.name}> has no result table`);
    return jsonResponse(host, 500, FIXED[500]);
  }
  const out = encode(arm.result, deliverable(host, rec, arm.result, result, `${ep.method} ${ep.path} <${variant.name}>`, "its answer"));
  if (!out.ok) {
    logLine(host, `scrml server: ${ep.method} ${ep.path} <${variant.name}> — its answer does not encode (${out.error.reason})`);
    return jsonResponse(host, 500, FIXED[500]);
  }
  return jsonResponse(host, 200, out.wire);
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
  const { rec, run } = requestRecord();
  try {
    result = await run(() => r.run(args));
  } catch (e) {
    logLine(host, `scrml server: ${r.path} threw — ${messageOf(e)}`);
    // Review #1911 MED-1: the route's own parameter check (refineEntry) — 400, naming
    // the constraint and the parameter; never the value or the server source location
    if (e !== null && typeof e === "object" && ENTRY_TRAPS.has(e)) {
      const d = e.detail || {};
      return jsonResponse(host, 400, { error: "E-CONTRACT-001-RT: Value constraint violated at runtime.", constraint: String(d.type), parameter: String(d.what) });
    }
    return jsonResponse(host, 500, FIXED[500]);
  }
  if (failed(result)) {
    if (r.desc.error === null) {
      logLine(host, `scrml server: ${r.path} returned a failure but declares no error type`);
      return jsonResponse(host, 500, FIXED[500]);
    }
    const ev = result.error;
    const errv = deliverable(host, rec, r.desc.error, ev, r.path, `its failure (${String(ev !== null && typeof ev === "object" ? ev.variant : ev)})`);
    const env = encodeError(r.desc.error, errv);
    if (!env.ok) {
      logLine(host, `scrml server: ${r.path} — its error does not encode (${env.error.reason})`);
      return jsonResponse(host, 500, FIXED[500]);
    }
    const out = env.wire;
    return jsonResponse(host, failStatus(out.variant), out);
  }
  if (r.desc.result === null) return noContent(host);
  const out = encode(r.desc.result, deliverable(host, rec, r.desc.result, result, r.path, "its returned value"));
  if (!out.ok) {
    logLine(host, `scrml server: ${r.path} — its answer does not encode (${out.error.reason})`);
    return jsonResponse(host, 500, FIXED[500]);
  }
  return jsonResponse(host, 200, out.wire);
}
