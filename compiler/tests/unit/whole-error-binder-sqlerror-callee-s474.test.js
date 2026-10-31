/**
 * whole-error-binder-sqlerror-callee-s474.test.js — S474 (flogence forward path): the `_ e :>`
 * whole-error binder on a call to a function declared `! -> SqlError` (§19.8.3 item 3), imported
 * and local, is typed by §18.6.1, so `e.variant`, `e is .V` and `match e { … }` compile.
 *
 * Before: E-TYPE-031 "the handled call's error enum cannot be resolved here" — `SqlError` is
 * compiler-provided (§19.8.1), so no type registry holds it, and `wholeBinderCalleeEnum` resolved
 * the declared error type by registry name only.
 *
 * SPEC:
 *  - §18.6.1 "The binder's type is the type of the failure being handled — the same type the arm's
 *    variant patterns name: a call to a function declared `!` (§19.4.1): the declared error enum
 *    … a client call to a server function (§19.9.10): the call's failure set — `Transport(t:
 *    ServerCallError)`, and for a server function declared `! E` the variants of `E` as well".
 *  - §19.8.1 `type SqlError:enum = { QueryFailed(message: string) … ConstraintViolation(field:
 *    string) … ConnectionLost … }`; "`SqlError` SHALL have at least the three variants specified
 *    above"; §8.9.4 adds `SqlError::BatchPrepareFailed { sites }`.
 *  - §18.17.1 "Every enum value has the member `.variant`" / "Reading any member other than
 *    `.variant` off a value of a known enum type SHALL be a compile error (E-TYPE-004)".
 */
import { describe, test, expect, afterAll } from "bun:test";
import { resolve, join } from "path";
import { tmpdir } from "os";
import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync, readdirSync } from "fs";
import { Database } from "bun:sqlite";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { compileScrml } from "../../src/api.js";

const DIRS = [];
const RESPONSE_BODIES = [];
const GLOBALS_BEFORE = new Set(Object.getOwnPropertyNames(globalThis));
afterAll(async () => {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
  // Best effort (helpers/per-run-tmp.js, S438): the imported `.server.js` route modules hold their
  // bun:sqlite handle for the life of the process, so on Windows removing the dir that holds the
  // `.db` throws EBUSY — a hook error reported as a failing "(unnamed)" test. Every dir here is
  // unique per compile (time + random), so a leftover is never reused; the temp root reaps it.
  for (const d of DIRS) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* EBUSY: a live sqlite handle (Windows) */ }
  }
  for (const k of Object.getOwnPropertyNames(globalThis)) {
    if (/^_scrml/.test(k) && !GLOBALS_BEFORE.has(k)) { try { delete globalThis[k]; } catch { /* non-configurable */ } }
  }
});

// flogence's forward shape: the library function declared `! -> SqlError`.
const LIB = `<db src="./g.db" tables="gnode">
\${
  export function listArcs()! -> SqlError {
    return ?{\`SELECT id, title FROM gnode WHERE kind = 'arc'\`}.all()
  }
}
</db>
`;

const VIEW = (extra = "", body = "") => `<program db="../g.db">
  \${
    import { listArcs } from '../lib.scrml'
    <fromImport> = []
    <fromLocal> = []
    <fromNamed> = []
    <fromQf> = []
    <qfSeen> = "none"
    <directSeen> = "none"
    <importSeen> = "none"
    <localSeen> = "none"
    <namedSeen> = "none"
    function fetchLocal()! -> SqlError {
      return ?{\`SELECT id, title FROM gnode WHERE kind = 'arc'\`}.all()
    }
    ${extra}
    function loadImport() {
      @fromImport = listArcs() !{ _ e :> { @importSeen = "import:" + e.variant; return } }
    }
    function loadLocal() {
      @fromLocal = fetchLocal() !{ _ e :> { @localSeen = "local:" + e.variant; return } }
    }
    function loadNamed() {
      @fromNamed = listArcs() !{
        .Transport :> { @namedSeen = "named:transport"; return }
        _ :> { @namedSeen = "named:other"; return }
      }
    }
    server function qDirect() {
      const rows = ?{\`SELECT id, title FROM gnode WHERE kind = 'arc'\`}.all() !{ _ e :> { return "sql:" + e.variant } }
      return "rows:" + rows.length
    }
    function loadDirect() {
      @directSeen = qDirect() !{ _ :> "transport" }
    }
    function loadQf() {
      @fromQf = fetchLocal() !{
        .QueryFailed(m) :> { @qfSeen = "qf:" + (m.length > 0 ? "message" : "empty"); return }
        _ :> { @qfSeen = "qf:other"; return }
      }
    }
    ${body}
  }
  <main>
    <p id="import-seen">\${@importSeen}</p>
    <p id="local-seen">\${@localSeen}</p>
    <p id="named-seen">\${@namedSeen}</p>
    <p id="import-n">\${@fromImport.length}</p>
    <p id="local-n">\${@fromLocal.length}</p>
    <p id="named-n">\${@fromNamed.length}</p>
    <button id="b-import" onclick=loadImport()>i</button>
    <button id="b-local" onclick=loadLocal()>l</button>
    <button id="b-named" onclick=loadNamed()>n</button>
    <p id="qf-seen">\${@qfSeen}</p>
    <p id="qf-n">\${@fromQf.length}</p>
    <button id="b-qf" onclick=loadQf()>q</button>
    <p id="direct-seen">\${@directSeen}</p>
    <button id="b-direct" onclick=loadDirect()>d</button>
  </main>
</program>
`;
function compileProject(view) {
  const dir = resolve(process.env.TMPDIR || tmpdir(), `scrml-s474-sqlb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  DIRS.push(dir);
  mkdirSync(resolve(dir, "viewapp"), { recursive: true });
  const dbPath = resolve(dir, "g.db");
  const db = new Database(dbPath);
  db.run("CREATE TABLE gnode (id TEXT, title TEXT, kind TEXT)");
  db.run("INSERT INTO gnode VALUES ('a1', 'Arc one', 'arc'), ('a2', 'Arc two', 'arc')");
  db.close();
  writeFileSync(resolve(dir, "lib.scrml"), LIB);
  writeFileSync(resolve(dir, "viewapp/view.scrml"), view);
  const outDir = resolve(dir, "out");
  const result = compileScrml({ inputFiles: [resolve(dir, "viewapp/view.scrml")], write: true, outputDir: outDir, log: () => {} });
  const errors = (result.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
  const read = (rel) => { const p = resolve(outDir, rel); return existsSync(p) ? readFileSync(p, "utf8") : ""; };
  const top = existsSync(outDir) ? readdirSync(outDir) : [];
  const runtimeName = top.find((f) => /^scrml-runtime.*\.js$/.test(f));
  return {
    dir, dbPath, outDir,
    codes: errors.map((e) => e.code),
    messages: errors.map((e) => e.message),
    html: read("viewapp/view.html"),
    clientJs: read("viewapp/view.client.js"),
    libClientJs: read("lib.client.js"),
    serverFiles: ["lib.server.js", "viewapp/view.server.js"].filter((f) => existsSync(resolve(outDir, f))),
    runtime: runtimeName ? read(runtimeName) : "",
  };
}

const routesCache = new Map();
async function routesOf(out) {
  if (routesCache.has(out.outDir)) return routesCache.get(out.outDir);
  const routes = [];
  for (const f of out.serverFiles) {
    const mod = await import(join(out.outDir, f));
    for (const r of mod.routes ?? []) routes.push(r);
  }
  routesCache.set(out.outDir, routes);
  return routes;
}

// Every request is answered by the compiled route handler — the failure is the server's own.
async function realFetch(out) {
  const routes = await routesOf(out);
  return async (url, init = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const route = routes.find((r) => r.path === path);
    if (!route) return new Response("not found", { status: 404 });
    const hdr = { "content-type": "application/json", cookie: "scrml_csrf=t", "x-csrf-token": "t" };
    try {
      const resp = await route.handler({
        url: "http://localhost" + route.path,
        method: init.method ?? "POST",
        headers: { get: (k) => hdr[String(k).toLowerCase()] ?? null },
        json: async () => (init.body ? JSON.parse(init.body) : {}),
      });
      // Every response body the client receives, for the "no driver text on the wire" checks.
      const text = await resp.text();
      RESPONSE_BODIES.push(text);
      return new Response(text, { status: resp.status, headers: resp.headers });
    } catch {
      // What the built server answers an exception a route handler does not catch with
      // (commands/build.js, the emitted `Bun.serve({ error(err) { … } })`, §14.8.9): a fixed 500.
      return new Response("Internal Server Error", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  };
}

async function boot(out) {
  if (out.codes.length > 0) throw new Error(`compile errors: ${out.codes.join(", ")} — ${out.messages.join(" | ")}`);
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
  GlobalRegistrator.register();
  const f = await realFetch(out);
  globalThis.fetch = f;
  window.fetch = f;
  document.cookie = "scrml_csrf=t; Path=/";
  const logged = [];
  const origError = console.error;
  console.error = (...a) => { logged.push(a.map((x) => (x && x.message) || String(x)).join(" ")); };
  const bodyMatch = out.html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  document.body.innerHTML = (bodyMatch ? bodyMatch[1] : out.html).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "").trim();
  // eslint-disable-next-line no-eval
  (0, eval)(out.runtime);
  // eslint-disable-next-line no-eval
  if (out.libClientJs) (0, eval)(out.libClientJs);
  // eslint-disable-next-line no-eval
  (0, eval)(out.clientJs);
  document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };
  await settle();
  return {
    click: async (sel) => { document.querySelector(sel).click(); await settle(); },
    text: (sel) => document.querySelector(sel).textContent,
    logged,
    restore: () => { console.error = origError; },
  };
}

let BUILT = null;
const built = () => (BUILT ??= compileProject(VIEW()));

describe("S474 — `_ e :>` on a `! -> SqlError` callee is typed (§18.6.1): imported and local", () => {
  test("clean compile: `e.variant` on both, a `.Transport :>` arm, a `.QueryFailed(m) :>` arm (was E-TYPE-031 ×2)", () => {
    expect(built().codes).toEqual([]);
  });

  test("`e.message` stays E-TYPE-004 on both — the whole error is an enum value (§18.6.1 S469, §18.17.1)", () => {
    const out = compileProject(VIEW("", `function loadMsg() {
      @fromImport = listArcs() !{ _ e :> { @importSeen = e.message; return } }
      @fromLocal = fetchLocal() !{ _ e :> { @localSeen = e.message; return } }
    }`));
    expect(out.codes).toEqual(["E-TYPE-004", "E-TYPE-004"]);
  });

  test("the E-TYPE-004 hint does not offer a parameter typed with a compiler-provided set (r1 F5: unwritable on impl#1)", () => {
    const out = compileProject(VIEW("", `function loadMsg() {
      @fromLocal = fetchLocal() !{ _ e :> { @localSeen = e.message; return } }
    }`));
    expect(out.codes).toEqual(["E-TYPE-004"]);
    expect(out.messages[0]).not.toMatch(/parameter is typed/);
    expect(out.messages[0]).toMatch(/compiler-provided/);
    // A program-declared enum keeps the offer.
    const user = compileProject(VIEW(`type AuthErr:enum = { Denied(reason: string), Gone }
    server function check(p)! -> AuthErr { fail AuthErr.Gone }`, `server function q(p) { const r = check(p) !{ _ e :> { log(e.reason); return "x" } }
      return r }`));
    expect(user.codes).toEqual(["E-TYPE-004"]);
    expect(user.messages[0]).toMatch(/parameter is typed `AuthErr`/);
  });

  test("comparing the whole error with a primitive stays E-EQ-001", () => {
    const out = compileProject(VIEW("", `function loadEq() {
      @fromLocal = fetchLocal() !{ _ e :> { @localSeen = e == "QueryFailed" ? "y" : "n"; return } }
    }`));
    expect(out.codes).toEqual(["E-EQ-001"]);
  });

  test("`e is .V` over every SqlError variant and `.Transport` compiles (client call: SqlError + Transport)", () => {
    const out = compileProject(VIEW("", `function loadIs() {
      @fromLocal = fetchLocal() !{ _ e :> {
        @localSeen = e is .QueryFailed ? "qf" : e is .ConstraintViolation ? "cv" : e is .ConnectionLost ? "cl" : e is .BatchPrepareFailed ? "bp" : e is .Transport ? "t" : "?"
        return
      } }
      @fromImport = listArcs() !{ _ e :> { @importSeen = e is .Transport ? "t" : "o"; return } }
    }`));
    expect(out.codes).toEqual([]);
  });

  test("`e is .Nope` (not a SqlError variant, not Transport) is refused (E-TYPE-031)", () => {
    const out = compileProject(VIEW("", `function loadNope() {
      @fromLocal = fetchLocal() !{ _ e :> { @localSeen = e is .Nope ? "y" : "n"; return } }
    }`));
    expect(out.codes).toEqual(["E-TYPE-031"]);
  });

  test("a SERVER-side call of a `! -> SqlError` function: SqlError alone — `.Transport` is not in its failure set", () => {
    const ok = compileProject(VIEW("", `server function srv() {
      const r = fetchLocal() !{ _ e :> { log(e.variant); return [] } }
      return r
    }`));
    expect(ok.codes).toEqual([]);
    const bad = compileProject(VIEW("", `server function srv() {
      const r = fetchLocal() !{ _ e :> { log(e is .Transport); return [] } }
      return r
    }`));
    expect(bad.codes).toEqual(["E-TYPE-031"]);
  });

  test("`match e` over the SqlError variants compiles, and a named payload binder reads the declared field (§19.8.1 `message`)", () => {
    const out = compileProject(VIEW("", `server function srvMatch() {
      const v = fetchLocal() !{ _ e :> match e { .QueryFailed(message: m) :> m, else :> "o" } }
      const w = listArcs() !{ _ e :> match e { .ConstraintViolation(field: f) :> f, else :> "o" } }
      return "" + v.length + w.length
    }`));
    expect(out.codes).toEqual([]);
    const server = readFileSync(resolve(out.outDir, "viewapp/view.server.js"), "utf8");
    expect(server).toMatch(/=== "QueryFailed"\) \{ const m = _scrml_match_\d+\.data\.message;/);
    expect(server).toMatch(/=== "ConstraintViolation"\) \{ const f = _scrml_match_\d+\.data\.field;/);
    // A variant SqlError does not declare is refused.
    const bad = compileProject(VIEW("", `server function srvBad() {
      const v = fetchLocal() !{ _ e :> match e { .Nope(x: y) :> y, else :> "o" } }
      return v.length
    }`));
    expect(bad.codes).toEqual(["E-TYPE-031"]);
  });

  test("a program that declares its own `SqlError` enum keeps it (the built-in set is not substituted)", () => {
    const out = compileProject(VIEW(`type SqlError:enum = { Mine }`, `function loadMine() {
      @fromLocal = fetchLocal() !{ _ e :> { @localSeen = e is .QueryFailed ? "y" : "n"; return } }
    }`));
    expect(out.codes).toContain("E-TYPE-031");
  });
});

describe("S474 — the whole binder on a `?{}` handled at the site is `SqlError` (§18.6.1 \"a `?{}` query (§19.8.3): `SqlError`\")", () => {
  test("`?{…}.all() !{ _ e :> … e.variant … }` compiles; `e.message` is E-TYPE-004; `e is .Transport` is refused", () => {
    const at = (arm) => compileProject(VIEW("", `server function q() {
      const rows = ?{\`SELECT id FROM gnode\`}.all() !{ _ e :> { ${arm}; return [] } }
      return rows
    }`));
    expect(at("log(e.variant)").codes).toEqual([]);
    expect(at("log(e is .ConnectionLost)").codes).toEqual([]);
    expect(at("log(e.message)").codes).toEqual(["E-TYPE-004"]);
    expect(at("log(e is .Transport)").codes).toEqual(["E-TYPE-031"]);
  });
});

// S474 fix round 1 (review of #1698, F1): §18.7 on a `match e` arm over a COMPILER-PROVIDED binder
// enum. Codegen's `planPayloadBinders` holds no field list for SqlError / the §19.9.10 set, so
// before this a misnamed binder compiled and read `undefined` (the route answered 200
// "msg=undefined" with the table dropped) and `.ConnectionLost(x: y)` threw at run time.
describe("S474 r1 — payload binders of `match e` arms are checked against the compiler-provided set (§18.7)", () => {
  const codesOf = (fnText) => compileProject(VIEW("", fnText)).codes;
  const onSql = (arms) => `server function q() { const r = ?{\`SELECT id FROM gnode\`}.all() !{ _ e :> match e { ${arms} } }
      return r }`;
  const onCallee = (arms) => `server function q() { const r = fetchLocal() !{ _ e :> match e { ${arms} } }
      return r }`;
  const onImported = (arms) => `server function q() { const r = listArcs() !{ _ e :> match e { ${arms} } }
      return r }`;
  const onTransport = (arms) => `function q() { @directSeen = qDirect() !{ _ e :> match e { ${arms} } } }`;

  test.each([
    ["?{} — a field QueryFailed does not declare", onSql(`.QueryFailed(msg: m) :> "msg=" + m, else :> "other"`), ["E-TYPE-022"]],
    ["?{} — a named binder on a unit variant", onSql(`.ConnectionLost(x: y) :> "c" + y, else :> "other"`), ["E-TYPE-022"]],
    ["?{} — a declared field plus an undeclared one", onSql(`.QueryFailed(message: a, extra: b) :> a + b, else :> "other"`), ["E-TYPE-022"]],
    ["?{} — a positional binder on a unit variant", onSql(`.ConnectionLost(y) :> "c" + y, else :> "other"`), ["E-TYPE-021", "E-TYPE-027"]],
    ["?{} — two positional binders on a one-field variant", onSql(`.QueryFailed(a, b) :> a + b, else :> "other"`), ["E-TYPE-021", "E-TYPE-027"]],
    ["?{} — positional and named mixed (codegen's refusal, reported once)", onSql(`.QueryFailed(a, message: b) :> a + b, else :> "other"`), ["E-TYPE-021"]],
    ["local `! -> SqlError` — a field QueryFailed does not declare", onCallee(`.QueryFailed(msg: m) :> "msg=" + m, else :> "other"`), ["E-TYPE-022"]],
    ["local `! -> SqlError` — a named binder on a unit variant", onCallee(`.ConnectionLost(x: y) :> "c" + y, else :> "other"`), ["E-TYPE-022"]],
    ["local `! -> SqlError` — an extra named field", onCallee(`.QueryFailed(message: a, extra: b) :> a + b, else :> "other"`), ["E-TYPE-022"]],
    ["imported `! -> SqlError` — a field ConstraintViolation does not declare", onImported(`.ConstraintViolation(column: c) :> c, else :> "other"`), ["E-TYPE-022"]],
    ["the §19.9.10 set — a field Transport does not declare", onTransport(`.Transport(zzz: m) :> "t", else :> "other"`), ["E-TYPE-022"]],
  ])("%s", (_label, fnText, want) => {
    expect(codesOf(fnText)).toEqual(want);
  });

  // r2 (re-review R6): the CLIENT call to a server-placed `! -> SqlError` callee is typed by the
  // UNION set (SqlError + Transport) — a set of its own, so it needs its own pin.
  test("client call to a server-placed `! -> SqlError` callee (the SqlError + Transport union): undeclared fields are E-TYPE-022", () => {
    const onClient = (arms) => `function q() { @localSeen = fetchLocal() !{ _ e :> match e { ${arms} } } }`;
    expect(codesOf(onClient(`.QueryFailed(msg: m) :> m, else :> "o"`))).toEqual(["E-TYPE-022"]);
    expect(codesOf(onClient(`.Transport(zzz: m) :> "t", else :> "o"`))).toEqual(["E-TYPE-022"]);
    expect(codesOf(onClient(`.QueryFailed(message: m) :> m, else :> "o"`))).toEqual([]);
  });

  // r2 (re-review R3): a STATEMENT `match e { … }` with block arms inside a block arm is read by the
  // structured (`match-arm-block`) reader, not the arm-text reader.
  test("a statement `match e` with block arms inside a block arm (the structured reader): undeclared field is E-TYPE-022", () => {
    const blockMatch = (bind) => `server function q() {
      const r = fetchLocal() !{
        _ e :> {
          match e {
            .QueryFailed(${bind}) :> { log(m) }
            else :> { log("o") }
          }
          return []
        }
      }
      return r
    }`;
    expect(codesOf(blockMatch("msg: m"))).toEqual(["E-TYPE-022"]);
    expect(codesOf(blockMatch("message: m"))).toEqual([]);
    const stmt = `server function q() {
      fetchLocal() !{
        _ e :> {
          match e {
            .ConnectionLost(x: m) :> { log(m) }
            else :> { log("o") }
          }
        }
      }
      return 1
    }`;
    expect(codesOf(stmt)).toEqual(["E-TYPE-022"]);
  });

  test("the declared field still binds: `.QueryFailed(message: m)` / `.ConstraintViolation(field: f)` compile", () => {
    expect(codesOf(onSql(`.QueryFailed(message: m) :> "msg=" + m, else :> "other"`))).toEqual([]);
    expect(codesOf(onCallee(`.QueryFailed(message: m) :> m, else :> "other"`))).toEqual([]);
    expect(codesOf(onImported(`.ConstraintViolation(field: f) :> f, else :> "other"`))).toEqual([]);
  });

  test("a program-declared enum is unchanged: the same misuses are refused ONCE, by codegen (E-TYPE-022 / E-TYPE-021)", () => {
    const ue = (arms) => `type AuthErr:enum = { Denied(reason: string), Gone }
    server function check(p)! -> AuthErr { fail AuthErr.Gone }
    server function q(p) { const r = check(p) !{ _ e :> match e { ${arms} } }
      return r }`;
    expect(compileProject(VIEW(ue(`.Denied(msg: m) :> m, else :> "other"`))).codes).toEqual(["E-TYPE-022"]);
    expect(compileProject(VIEW(ue(`.Gone(x: y) :> y, else :> "other"`))).codes).toEqual(["E-TYPE-022"]);
    expect(compileProject(VIEW(ue(`.Denied(a, b) :> a + b, else :> "other"`))).codes).toEqual(["E-TYPE-021"]);
    expect(compileProject(VIEW(ue(`.Denied(reason: m) :> m, else :> "other"`))).codes).toEqual([]);
  });
});

// S474 fix round 1 (review of #1698, F4): each guard that keeps the compiler-provided SqlError set
// from being substituted where it is not the callee's type has a test that FAILS when the guard is
// removed (measured by mutation; table in docs/changes/s474-impl1-sqlerror-binder/progress.md).
describe("S474 r1 — the guards around the SqlError binder set (each bitten by mutation)", () => {
  const MINI = (decls, body) => `<program db="../g.db">
  \${
    import { listArcs } from '../lib.scrml'
    <msg> = "init"
    <s> = "s"
    ${decls}
    function fetchLocal()! -> SqlError {
      return ?{\`SELECT id, title FROM gnode\`}.all()
    }
    ${body}
  }
  <main><p>\${@msg} \${@s}</p></main>
</program>
`;
  const codes = (decls, body) => compileProject(MINI(decls, body)).codes;

  test("M1 — a program `SqlError` that is not an enum (a struct): a local `! -> SqlError` callee's binder stays untyped", () => {
    expect(codes("type SqlError:struct = { a: string }", `function go() { @msg = fetchLocal() !{ _ e :> { @s = e.variant; return } } }`)).toEqual(["E-TYPE-031"]);
  });

  test("M1 — a view-declared `SqlError` enum: the IMPORTED callee's binder is not given the built-in set", () => {
    expect(codes("type SqlError:enum = { Mine }", `function go() { @msg = listArcs() !{ _ e :> { @s = e is .QueryFailed ? "q" : "o"; return } } }`)).toEqual(["E-TYPE-031"]);
  });

  test("M2 — a program `SqlError` enum: a `?{}` handled at the site is not given the built-in set", () => {
    expect(codes("type SqlError:enum = { Mine }", `server function q() { const r = ?{\`SELECT id FROM gnode\`}.all() !{ _ e :> { log(e is .QueryFailed); return [] } }
      return r }`)).toEqual(["E-TYPE-031"]);
  });

  test("M3 — a CPS body-split `! -> SqlError` callee stays untyped (it also sends impl#1's CpsError variants)", () => {
    expect(codes("", `function mixed()! -> SqlError {
      const rows = ?{\`SELECT id FROM gnode\`}.all()
      @s = "loaded"
      return rows
    }
    function go() { @msg = mixed() !{ _ e :> { @s = e.variant; return } } }`)).toEqual(["E-TYPE-031"]);
  });

  // An argument / array / object position reaches the audit as the guard-marker call
  // (`<operand>.__scrml_guard__("!{…}")`). A BLOCK arm that `return`s there is refused by codegen
  // (E-CG-003, a separate limitation), so the first assertions read only the audit's codes (typed:
  // `e.variant` is not E-TYPE-031, `e.message` is E-TYPE-004); a VALUE arm compiles clean.
  test("M7 — an expression-position `!{}` on a `?{}` (the guard-marker path) is typed SqlError", () => {
    const at = (arm) => codes("", `server function q() { log(?{\`SELECT id FROM gnode\`}.all() !{ _ e :> { ${arm}; return [] } })
      return 1 }`);
    expect(at("log(e.variant)")).not.toContain("E-TYPE-031");
    const msg = at("log(e.message)");
    expect(msg).toContain("E-TYPE-004");
    expect(msg).not.toContain("E-TYPE-031");
    // r2 (re-review): a VALUE arm on the same path compiles clean (no E-CG-003) — the stronger pin.
    expect(codes("", `server function q() { log(?{\`SELECT id FROM gnode\`}.all() !{ _ e :> [e.variant] })
      return 1 }`)).toEqual([]);
    expect(codes("", `server function q() { const n = (?{\`SELECT id FROM gnode\`}.all() !{ _ e :> [e.variant] }).length
      return n }`)).toEqual([]);
  });
});

describe("S474 — run time: a REAL failing query on the server (the table is dropped under the running server)", () => {
  test("success first: the rows land in the cells, no arm runs", async () => {
    const page = await boot(built());
    try {
      for (const b of ["#b-import", "#b-local", "#b-named", "#b-qf", "#b-direct"]) await page.click(b);
      expect([page.text("#import-n"), page.text("#local-n"), page.text("#named-n"), page.text("#qf-n")]).toEqual(["2", "2", "2", "2"]);
      expect([page.text("#import-seen"), page.text("#local-seen"), page.text("#named-seen"), page.text("#qf-seen")]).toEqual(["none", "none", "none", "none"]);
      expect(page.text("#direct-seen")).toBe("rows:2");
      expect(page.logged).toEqual([]);
    } finally {
      page.restore();
    }
  });

  test("a `?{}` handled at the site: the `_ e :>` arm receives the SqlError value and `e.variant` reads its tag", async () => {
    const out = built();
    const db = new Database(out.dbPath);
    db.run("DROP TABLE IF EXISTS gnode");
    db.close();
    const page = await boot(out);
    try {
      await page.click("#b-direct");
      expect(page.text("#direct-seen")).toBe("sql:QueryFailed");
    } finally {
      page.restore();
    }
  });

  // S474 rulings 2 + 3 (`s474-impl1-bang-failure-delivery`; was the pinned known gap
  // `g-impl1-bang-sqlerror-callee-failure-not-delivered-s474`): a `! -> SqlError` SERVER function
  // whose query fails produces the SqlError value (§19.8.2), sent as the `fail` envelope, so the
  // client's arms run. The driver's text stays on the server in this (non-dev) build: the
  // `.QueryFailed(m)` arm sees an empty `m`, and the server log holds `no such table`.
  test("a `! -> SqlError` callee (imported and local): the arm IS entered with the SqlError variant", async () => {
    const out = built();
    const db = new Database(out.dbPath);
    db.run("DROP TABLE IF EXISTS gnode");
    db.close();
    const page = await boot(out);
    try {
      RESPONSE_BODIES.length = 0;
      for (const b of ["#b-import", "#b-local", "#b-named", "#b-qf"]) await page.click(b);
      expect([page.text("#import-seen"), page.text("#local-seen"), page.text("#named-seen"), page.text("#qf-seen")]).toEqual(["import:QueryFailed", "local:QueryFailed", "named:other", "qf:empty"]);
      expect([page.text("#import-n"), page.text("#local-n"), page.text("#named-n"), page.text("#qf-n")]).toEqual(["0", "0", "0", "0"]);
      // No server text reaches the client in the failure (S474 ruling 2: production build).
      expect(RESPONSE_BODIES.length).toBeGreaterThan(0);
      for (const b of RESPONSE_BODIES) expect(b).not.toContain("no such table");
      // No host backstop; one server log line per failed call, carrying the driver's text.
      for (const l of page.logged) expect(l).not.toMatch(/host backstop/);
      expect(page.logged.length).toBe(4);
      for (const l of page.logged) expect(l).toMatch(/^\[scrml\] server function `(listArcs|fetchLocal)` failed: .*no such table: gnode/);
    } finally {
      page.restore();
    }
  });
});
