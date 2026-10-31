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
const GLOBALS_BEFORE = new Set(Object.getOwnPropertyNames(globalThis));
afterAll(async () => {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
  for (const d of DIRS) rmSync(d, { recursive: true, force: true });
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
      return await route.handler({
        url: "http://localhost" + route.path,
        method: init.method ?? "POST",
        headers: { get: (k) => hdr[String(k).toLowerCase()] ?? null },
        json: async () => (init.body ? JSON.parse(init.body) : {}),
      });
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

  // KNOWN GAP (pinned so a change is a decision, not drift): a `! -> SqlError` SERVER function
  // whose query fails does not produce a SqlError value (§19.8.2) — the route answers a plain 500
  // — and the client stub of a DECLARED-`!` server function does not route a 5xx into the `!{}`
  // (S473 ruling "impl#1 transport routing" item 3 put declared-`!` callees out of scope). So the
  // arms this change types are not entered at run time: the failure reaches the §19.6.8 host
  // backstop, and no cell is written (fails closed). `g-impl1-bang-sqlerror-callee-failure-not-delivered-s474`.
  test("a `! -> SqlError` callee (imported and local): the arm is NOT entered — host backstop, cells untouched (known gap)", async () => {
    const out = built();
    const db = new Database(out.dbPath);
    db.run("DROP TABLE IF EXISTS gnode");
    db.close();
    const page = await boot(out);
    try {
      for (const b of ["#b-import", "#b-local", "#b-named", "#b-qf"]) await page.click(b);
      expect([page.text("#import-seen"), page.text("#local-seen"), page.text("#named-seen"), page.text("#qf-seen")]).toEqual(["none", "none", "none", "none"]);
      expect([page.text("#import-n"), page.text("#local-n"), page.text("#named-n"), page.text("#qf-n")]).toEqual(["0", "0", "0", "0"]);
      expect(page.logged.length).toBe(4);
      for (const l of page.logged) expect(l).toMatch(/host backstop, §19\.6\.8/);
      // No server text reaches the client in the failure.
      for (const l of page.logged) expect(l).not.toMatch(/no such table/);
    } finally {
      page.restore();
    }
  });
});
