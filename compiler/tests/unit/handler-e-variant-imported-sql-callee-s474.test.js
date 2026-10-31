/**
 * handler-e-variant-imported-sql-callee-s474.test.js — S474 regression guard (flogence report,
 * `viewapp/view.scrml`: `listArcs()` imported from `../graph-read.scrml`, and a local `?{}` fn).
 *
 * flogence: "the probe's other two arms were also failing on impl#1 with E-TYPE-031: they read
 * `e.message`, and `e.variant` failed too ('the handled call's error enum cannot be resolved
 * here')". Measured S474: NOT REPRODUCED on main `34ebef81d` — fixed at S473 by #1658
 * (`4f4314dab`, typing `_ e :>` by the §19.9.10 failure set) and #1664 (transport routing, the
 * run-time half). It reproduces on `dbc037e18^1` (the base #1658 landed on). The compile half is
 * pinned in `whole-error-binder-server-call-s473.test.js`; this file adds what that one does not:
 * the RUN TIME of the flogence shape against a REAL failing `?{}` (the table is gone when the
 * compiled server runs), answered by the REAL compiled route handlers — no mocked failure.
 *
 * SPEC:
 *  - §18.6.1 "The binder's type is the type of the failure being handled — … a client call to a
 *    server function (§19.9.10): the call's failure set".
 *  - §19.9.10 "For an `f` not declared `!`, the failure set is `Transport(t: ServerCallError)`
 *    alone." / "`ServerFault(status: int)` // kind 2: a 5xx that is not the `fail` envelope (an
 *    exception, a rolled-back transaction)".
 *  - §18.17.1 "Every enum value has the member `.variant`"; "Reading any member other than
 *    `.variant` off a value of a known enum type SHALL be a compile error (E-TYPE-004)".
 *  - §19.4.3 (S451 ruling 3) "A `!{}` handler SHALL be attached only to an expression that can
 *    fail … On anything else — a call to an ordinary function … — **E-ERROR-013**" (Nominal on
 *    impl#1: `g-impl1-handler-on-non-failable-s451`).
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

// flogence graph-read.scrml's shape: a `<db src>` library exporting a `?{}`-using function, not `!`.
const GRAPH_READ = `<db src="./g.db" tables="gnode">
\${
  export function listArcs() {
    return ?{\`SELECT id, title FROM gnode WHERE kind = 'arc'\`}.all()
  }
}
</db>
`;

// flogence viewapp/view.scrml's shape, with the arms reading `e` the way the report wanted to.
const VIEW = (extra = "", body = "") => `<program db="../g.db">
  \${
    import { listArcs } from '../graph-read.scrml'
    <fromImport> = []
    <fromLocal> = []
    <fromNamed> = []
    <importSeen> = "none"
    <localSeen> = "none"
    <namedSeen> = "none"
    function fetchLocal() {
      return ?{\`SELECT id, title FROM gnode WHERE kind = 'arc'\`}.all()
    }
    ${extra}
    function loadImport() {
      @fromImport = listArcs() !{ _ e :> { @importSeen = "import:" + e.variant; return } }
    }
    function loadLocal() {
      @fromLocal = fetchLocal() !{ _ e :> { @localSeen = e is .Transport ? "local:transport" : "local:other"; return } }
    }
    function loadNamed() {
      @fromNamed = listArcs() !{ .Transport :> { @namedSeen = "named:transport"; return } }
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
  </main>
</program>
`;

function compileProject(view) {
  const dir = resolve(process.env.TMPDIR || tmpdir(), `scrml-s474-ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  DIRS.push(dir);
  mkdirSync(resolve(dir, "viewapp"), { recursive: true });
  const dbPath = resolve(dir, "g.db");
  const db = new Database(dbPath);
  db.run("CREATE TABLE gnode (id TEXT, title TEXT, kind TEXT)");
  db.run("INSERT INTO gnode VALUES ('a1', 'Arc one', 'arc'), ('a2', 'Arc two', 'arc')");
  db.close();
  writeFileSync(resolve(dir, "graph-read.scrml"), GRAPH_READ);
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
    libClientJs: read("graph-read.client.js"),
    serverFiles: ["graph-read.server.js", "viewapp/view.server.js"].filter((f) => existsSync(resolve(outDir, f))),
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

describe("S474 — the flogence shape compiles: `e.variant` / `e is .Transport` / `.Transport :>` on an imported and a local `?{}` callee", () => {
  test("clean compile (was E-TYPE-031 ×2 before #1658)", () => {
    expect(built().codes).toEqual([]);
  });

  test("`e.message` stays E-TYPE-004 on both — the whole error is an enum value, it has no `message` (§18.17.1)", () => {
    const out = compileProject(VIEW("", `function loadMsg() {
      @fromImport = listArcs() !{ _ e :> { @importSeen = e.message; return } }
      @fromLocal = fetchLocal() !{ _ e :> { @localSeen = e.message; return } }
    }`));
    expect(out.codes).toEqual(["E-TYPE-004", "E-TYPE-004"]);
  });

  // The residual the flogence probe's THIRD arm hit: `fetchShim()` is a CLIENT function that only
  // forwards the imported call. It is not server-placed and not `!`, so the call cannot fail
  // (§19.9.10 scope item 1; §19.4.3 S451 ruling 3: the `!{}` is E-ERROR-013). impl#1 does not emit
  // E-ERROR-013 (`g-impl1-handler-on-non-failable-s451`); reading `e` there is refused fail-closed
  // with E-TYPE-031 because the call has no failure type. Pinned so a change to it is a decision.
  test("a `!{}` on a client forwarding shim of the import: `e.variant` is refused (E-TYPE-031; SPEC: E-ERROR-013, Nominal)", () => {
    const out = compileProject(VIEW("function fetchShim() { return listArcs() }", `function loadShim() {
      @fromImport = fetchShim() !{ _ e :> { @importSeen = "shim:" + e.variant; return } }
    }`));
    expect(out.codes).toEqual(["E-TYPE-031"]);
  });
});

describe("S474 — run time: a REAL failing query on the server reaches the arm as `Transport`", () => {
  test("success first: the rows land in the cells, no arm runs", async () => {
    const page = await boot(built());
    try {
      await page.click("#b-import");
      await page.click("#b-local");
      await page.click("#b-named");
      expect(page.text("#import-n")).toBe("2");
      expect(page.text("#local-n")).toBe("2");
      expect(page.text("#named-n")).toBe("2");
      expect(page.text("#import-seen")).toBe("none");
      expect(page.text("#local-seen")).toBe("none");
      expect(page.text("#named-seen")).toBe("none");
    } finally {
      page.restore();
    }
  });

  test("the table is dropped under the running server: every arm runs and sees the `Transport` variant", async () => {
    const out = built();
    const db = new Database(out.dbPath);
    db.run("DROP TABLE gnode");
    db.close();
    const page = await boot(out);
    try {
      await page.click("#b-import");
      await page.click("#b-local");
      await page.click("#b-named");
      expect(page.text("#import-seen")).toBe("import:Transport");
      expect(page.text("#local-seen")).toBe("local:transport");
      expect(page.text("#named-seen")).toBe("named:transport");
      // The arms `return`: the cells keep their initial value, the error never lands in them.
      expect(page.text("#import-n")).toBe("0");
      expect(page.text("#local-n")).toBe("0");
      expect(page.text("#named-n")).toBe("0");
    } finally {
      page.restore();
    }
  });

  test("the failed query is a 5xx from the real route — `t` is `ServerFault(500)`, and no server text is in it", async () => {
    const out = built();
    const db = new Database(out.dbPath);
    db.run("DROP TABLE IF EXISTS gnode");
    db.close();
    const routes = await routesOf(out);
    const route = routes.find((r) => /listArcs/.test(r.path));
    expect(route).toBeTruthy();
    const fetchFn = await realFetch(out);
    const resp = await fetchFn(route.path, { method: "POST", body: "{}" });
    expect(resp.status).toBe(500);
    const body = await resp.text();
    expect(body).not.toMatch(/no such table/);
    // The value the arm receives: the lib's REAL client stub, against the real failing route, through
    // the runtime's `_scrml_server_attempt` (the wrapper the routed `!{}` emits).
    const page = await boot(out);
    try {
      const stub = globalThis._scrml_modules["graph-read.client.js"].listArcs;
      const v = await globalThis._scrml_server_attempt(stub());
      expect(v.__scrml_error).toBe(true);
      expect(v.type).toBe("ServerCallError");
      expect(v.variant).toBe("Transport");
      expect(v.data.t).toEqual({ variant: "ServerFault", data: { status: 500 } });
    } finally {
      page.restore();
    }
  });
});
