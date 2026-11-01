/**
 * bang-server-failure-delivery-s474.test.js — S474 rulings 2 and 3 (impl#1), measured by
 * execution: the compiled server routes answer real requests over a real SQLite file, and the
 * compiled client calls them.
 *
 * Ruling 3 — "impl#1: failures of declared-`!` server functions reach the client's handler arms"
 * (g-impl1-bang-sqlerror-callee-failure-not-delivered-s474). Before: a failing `?{}` inside a
 * `! -> SqlError` server function threw past the route, the host answered a plain 500, and the
 * client's `!{}` arms never ran (the failure reached the §19.6.8 host backstop).
 *
 * Ruling 2 — "A failed query's error text does not cross the wire. The client receives the error
 * variant with its message blanked; the server logs the full driver text. (Driver text exposes the
 * schema.) A `?{}` handled where it is written still sees the driver text in server code."
 *
 * Ruling 2 as amended ("capability over limitation", item 3): "a dev build keeps the full driver
 * text in the value delivered to the client; a production build blanks it (the server logs it
 * either way)". The dev build is `compileScrml({ devBuild: true })`, which `scrml dev` passes; every
 * other build (the default here, `scrml build`, `scrml compile`) blanks.
 *
 * SPEC:
 *  - §19.8.4 "Inside a `!` function, a `?{}` query that fails at runtime SHALL produce a `SqlError`
 *    variant. This variant SHALL be propagated if the enclosing function's error type is compatible".
 *  - §19.9.1 the failure crosses as `{ __scrml_error: true, type, variant, data }` — the envelope a
 *    `fail` already returns (reused here; no new wire shape).
 */
import { describe, test, expect, afterAll } from "bun:test";
import { resolve, join } from "path";
import { tmpdir } from "os";
import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync, readdirSync } from "fs";
import { Database } from "bun:sqlite";
import { SQL } from "bun";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { compileScrml } from "../../src/api.js";
import { SERVER_SQL_ERROR_HELPER, serverSqlPropagateHelper } from "../../src/codegen/sql-attempt.ts";

const DIRS = [];
const GLOBALS_BEFORE = new Set(Object.getOwnPropertyNames(globalThis));
afterAll(async () => {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
  // Best effort: the imported `.server.js` route modules hold their bun:sqlite handle for the life
  // of the process, so on Windows removing the dir that holds the `.db` throws EBUSY. Every dir is
  // unique per compile, so a leftover is never reused; the temp root reaps it.
  for (const d of DIRS) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* EBUSY: a live sqlite handle (Windows) */ }
  }
  for (const k of Object.getOwnPropertyNames(globalThis)) {
    if (/^_scrml/.test(k) && !GLOBALS_BEFORE.has(k)) { try { delete globalThis[k]; } catch { /* non-configurable */ } }
  }
});

const APP = `<program db="./g.db">
  \${
    type MyErr:enum = { NotFound, Bad(reason: string) }
    <seen> = "none"
    server function addUser(email)! -> SqlError {
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      return "added"
    }
    server function listGone()! -> SqlError {
      return ?{\`SELECT id FROM gone\`}.all()
    }
    server function find(id)! -> MyErr {
      if (id == 0) { fail MyErr.NotFound }
      return id
    }
    server function hostErr(o)! -> SqlError {
      return ?{\`SELECT \${o.a.b} AS v\`}.get()
    }
    server function plainAdd(email) {
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      return "added"
    }
    server function viaPeer(email) {
      const r = addUser(email) !{ _ e :> { return "peer:" + e.variant } }
      return "peer:" + r
    }
    server function handledHere(email) {
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run() !{
        .ConstraintViolation(f) :> { return "here:cv:" + f }
        _ :> { return "here:other" }
      }
      return "here:added"
    }
    server function handledHereQf() {
      const rows = ?{\`SELECT id FROM gone\`}.all() !{
        .QueryFailed(m) :> { return "here:qf:" + m }
        _ :> { return "here:other" }
      }
      return "here:rows"
    }
    function goUnique() {
      const r = addUser("taken@x.io") !{
        .ConstraintViolation(f) :> { @seen = "cv:" + f; return }
        .QueryFailed(m) :> { @seen = "qf:[" + m + "]"; return }
        _ :> { @seen = "other"; return }
      }
      @seen = "ok:" + r
    }
    function goFresh() {
      const r = addUser("fresh@x.io") !{
        _ e :> { @seen = "failed:" + e.variant; return }
      }
      @seen = "ok:" + r
    }
    function goGone() {
      const rows = listGone() !{
        .QueryFailed(m) :> { @seen = "qf:[" + m + "]"; return }
        _ :> { @seen = "other"; return }
      }
      @seen = "rows"
    }
    function goFind() {
      const v = find(0) !{
        .NotFound :> { @seen = "nf"; return }
        _ :> { @seen = "other"; return }
      }
      @seen = "found"
    }
    function goHost() {
      const v = hostErr({}) !{
        .QueryFailed(m) :> { @seen = "qf"; return }
        _ :> { @seen = "arm"; return }
      }
      @seen = "value"
    }
    function goPlain() {
      const r = plainAdd("taken@x.io") !{
        .Transport :> { @seen = "transport"; return }
        _ :> { @seen = "other"; return }
      }
      @seen = "ok"
    }
    function goPeer() {
      @seen = viaPeer("taken@x.io") !{ _ :> "transport" }
    }
    function goHere() {
      @seen = handledHere("taken@x.io") !{ _ :> "transport" }
    }
    function goHereQf() {
      @seen = handledHereQf() !{ _ :> "transport" }
    }
  }
  <main>
    <p id="seen">\${@seen}</p>
    <button id="b-unique" onclick=goUnique()>u</button>
    <button id="b-fresh" onclick=goFresh()>f</button>
    <button id="b-gone" onclick=goGone()>g</button>
    <button id="b-find" onclick=goFind()>n</button>
    <button id="b-host" onclick=goHost()>h</button>
    <button id="b-plain" onclick=goPlain()>p</button>
    <button id="b-peer" onclick=goPeer()>r</button>
    <button id="b-here" onclick=goHere()>e</button>
    <button id="b-hereqf" onclick=goHereQf()>q</button>
  </main>
</program>
`;

function compileApp(src, { devBuild = false } = {}) {
  const dir = resolve(process.env.TMPDIR || tmpdir(), `scrml-s474-bang-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  DIRS.push(dir);
  mkdirSync(dir, { recursive: true });
  const dbPath = resolve(dir, "g.db");
  const db = new Database(dbPath);
  db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, secret TEXT)");
  db.run("INSERT INTO users (email) VALUES ('taken@x.io')");
  db.close();
  writeFileSync(resolve(dir, "app.scrml"), src);
  const outDir = resolve(dir, "out");
  const result = compileScrml({ inputFiles: [resolve(dir, "app.scrml")], write: true, outputDir: outDir, devBuild, log: () => {} });
  const errors = (result.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && !/^[WI]-/.test(e.code ?? ""));
  const read = (rel) => { const p = resolve(outDir, rel); return existsSync(p) ? readFileSync(p, "utf8") : ""; };
  const runtimeName = (existsSync(outDir) ? readdirSync(outDir) : []).find((f) => /^scrml-runtime.*\.js$/.test(f));
  return {
    dir, dbPath, outDir,
    codes: errors.map((e) => e.code),
    messages: errors.map((e) => e.message),
    html: read("app.html"),
    clientJs: read("app.client.js"),
    serverJs: read("app.server.js"),
    runtime: runtimeName ? read(runtimeName) : "",
  };
}

const modCache = new Map();
async function routesOf(out) {
  if (!modCache.has(out.outDir)) modCache.set(out.outDir, (await import(join(out.outDir, "app.server.js"))).routes ?? []);
  return modCache.get(out.outDir);
}

// Every request is answered by the compiled route handler; each response body is recorded.
async function realFetch(out, bodies) {
  const routes = await routesOf(out);
  return async (url, init = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const route = routes.find((r) => r.path === path);
    if (!route) return new Response("not found", { status: 404 });
    const hdr = { "content-type": "application/json", cookie: "scrml_csrf=t", "x-csrf-token": "t" };
    let resp;
    try {
      resp = await route.handler({
        url: "http://localhost" + route.path,
        method: init.method ?? "POST",
        headers: { get: (k) => hdr[String(k).toLowerCase()] ?? null },
        json: async () => (init.body ? JSON.parse(init.body) : {}),
      });
    } catch {
      // What the built server answers an exception a route handler does not catch with
      // (commands/build.js, the emitted `Bun.serve({ error(err) { … } })`): a fixed 500.
      resp = new Response("Internal Server Error", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    const text = await resp.text();
    bodies.push({ path, status: resp.status, text });
    return new Response(text, { status: resp.status, headers: resp.headers });
  };
}

async function boot(out) {
  if (out.codes.length > 0) throw new Error(`compile errors: ${out.codes.join(", ")} — ${out.messages.join(" | ")}`);
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
  GlobalRegistrator.register();
  const bodies = [];
  const f = await realFetch(out, bodies);
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
  (0, eval)(out.clientJs);
  document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); };
  await settle();
  return {
    click: async (sel) => { logged.length = 0; bodies.length = 0; document.querySelector(sel).click(); await settle(); },
    seen: () => document.querySelector("#seen").textContent,
    logged,
    bodies,
    restore: () => { console.error = origError; },
  };
}

// Calls one compiled route handler directly (no client), recording the server log.
async function callRoute(out, fn, args) {
  if (out.codes.length > 0) throw new Error(`compile errors: ${out.codes.join(", ")} — ${out.messages.join(" | ")}`);
  const routes = await routesOf(out);
  const route = routes.find((r) => r.path.includes("_route_" + fn + "_"));
  if (!route) throw new Error(`no route for ${fn}: ${routes.map((r) => r.path).join(", ")}`);
  const hdr = { "content-type": "application/json", cookie: "scrml_csrf=t", "x-csrf-token": "t" };
  const logged = [];
  const origError = console.error;
  console.error = (...a) => { logged.push(a.map((x) => (x && x.message) || String(x)).join(" ")); };
  try {
    const resp = await route.handler({
      url: "http://localhost" + route.path,
      method: "POST",
      headers: { get: (k) => hdr[String(k).toLowerCase()] ?? null },
      json: async () => args,
    });
    return { status: resp.status, text: await resp.text(), logged };
  } catch (e) {
    return { status: "THROW", text: String((e && e.message) || e), logged };
  } finally {
    console.error = origError;
  }
}

// The `users` emails, read through a SEPARATE connection after the response.
function emails(out) {
  const db = new Database(out.dbPath);
  try {
    return db.query("SELECT email FROM users ORDER BY email").all().map((r) => r.email);
  } finally {
    db.close();
  }
}

let BUILT = null;
const built = () => (BUILT ??= compileApp(APP));

describe("S474 ruling 3 — a declared-`!` server function's failure reaches the client caller's arms", () => {
  test("the app compiles clean", () => {
    expect(built().codes).toEqual([]);
  });

  test("UNIQUE violation inside `! -> SqlError`: the client's `.ConstraintViolation(f)` arm runs with the column", async () => {
    const page = await boot(built());
    try {
      await page.click("#b-unique");
      // The driver says `UNIQUE constraint failed: users.email`; `_scrml_sql_error` (the S455
      // classifier a site-handled query uses) reads it as ConstraintViolation(field: "email").
      expect(page.seen()).toBe("cv:email");
      expect(page.bodies).toHaveLength(1);
      expect(page.bodies[0].status).toBe(200);
      expect(JSON.parse(page.bodies[0].text)).toEqual({ __scrml_error: true, type: "SqlError", variant: "ConstraintViolation", data: { field: "email" } });
    } finally {
      page.restore();
    }
  });

  test("success still returns the value (no arm runs)", async () => {
    const page = await boot(built());
    try {
      await page.click("#b-fresh");
      expect(page.seen()).toBe("ok:added");
      expect(page.logged).toEqual([]);
    } finally {
      page.restore();
    }
  });

  test("a query that fails to run (no such table): the client's `.QueryFailed(m)` arm runs, `m` is empty", async () => {
    const page = await boot(built());
    try {
      await page.click("#b-gone");
      expect(page.seen()).toBe("qf:[]");
      expect(JSON.parse(page.bodies[0].text)).toEqual({ __scrml_error: true, type: "SqlError", variant: "QueryFailed", data: { message: "" } });
    } finally {
      page.restore();
    }
  });

  test("`fail MyErr.NotFound` in a `! -> MyErr` server function reaches the client's `.NotFound` arm", async () => {
    const page = await boot(built());
    try {
      await page.click("#b-find");
      expect(page.seen()).toBe("nf");
      expect(page.logged).toEqual([]);
    } finally {
      page.restore();
    }
  });

  test("a HOST error in a `! -> SqlError` body (a query parameter that throws) is NOT a SqlError: no arm runs", async () => {
    const page = await boot(built());
    try {
      await page.click("#b-host");
      expect(page.seen()).toBe("none");
      expect(page.bodies[0].status).toBe(500);
      expect(page.logged.length).toBe(1);
      expect(page.logged[0]).toMatch(/host backstop, §19\.6\.8/);
    } finally {
      page.restore();
    }
  });

  test("a NON-failable server function whose query throws is not turned into a variant (unchanged: a 500 the client reads as Transport)", async () => {
    const page = await boot(built());
    try {
      await page.click("#b-plain");
      expect(page.seen()).toBe("transport");
      expect(page.bodies[0].status).toBe(500);
      expect(page.bodies[0].text).toBe("Internal Server Error");
    } finally {
      page.restore();
    }
  });

  test("the in-process callable fails the same way: a server caller's `_ e :>` arm sees the variant", async () => {
    const page = await boot(built());
    try {
      await page.click("#b-peer");
      expect(page.seen()).toBe("peer:ConstraintViolation");
    } finally {
      page.restore();
    }
  });

  test("emission: every `!` body runs in the envelope helper; only a SqlError-typed one turns a failed query into the value", () => {
    const js = built().serverJs;
    expect(js).toContain(`_scrml_sql_bang_envelope(_scrml_sql, "BEGIN DEFERRED", "addUser", true, `);
    expect(js).toContain(`_scrml_sql_bang_envelope(_scrml_sql, "BEGIN DEFERRED", "listGone", true, `);
    // S474 ruling "envelope every `!` server body": a `! -> MyErr` body is enveloped too, unless
    // its transitive query set is empty (#1718 r1 F3): `find` queries nothing, so it holds nothing.
    expect(js).not.toContain(`"find", false, () =>`);
    expect(js).not.toContain(`"plainAdd", true, () =>`);
    expect(js).not.toContain(`"plainAdd", false, () =>`);
    // The client bundle carries none of it.
    expect(built().clientJs).not.toContain("_scrml_sql_propagate");
    expect(built().clientJs).not.toContain("_scrml_sql_bang_envelope");
  });
});

describe("S474 ruling 2 — a failed query's driver text does not cross the wire; the server logs it", () => {
  test("UNIQUE violation naming `users.email`: absent from the response body, present in the server log", async () => {
    const page = await boot(built());
    try {
      await page.click("#b-unique");
      expect(page.bodies[0].text).not.toContain("users.email");
      expect(page.bodies[0].text).not.toMatch(/UNIQUE|constraint failed/i);
      const serverLines = page.logged.filter((l) => l.startsWith("[scrml] server function `addUser` failed:"));
      expect(serverLines).toHaveLength(1);
      expect(serverLines[0]).toContain("UNIQUE constraint failed: users.email");
    } finally {
      page.restore();
    }
  });

  test("QueryFailed: the message is blanked on the wire and logged in full on the server", async () => {
    const page = await boot(built());
    try {
      await page.click("#b-gone");
      expect(page.bodies[0].text).not.toContain("gone");
      expect(page.logged.some((l) => l.startsWith("[scrml] server function `listGone` failed:") && l.includes("no such table: gone"))).toBe(true);
    } finally {
      page.restore();
    }
  });

  test("a `?{}` handled where it is written still sees the driver text in server code", async () => {
    const page = await boot(built());
    try {
      await page.click("#b-here");
      expect(page.seen()).toBe("here:cv:email");
      await page.click("#b-hereqf");
      expect(page.seen()).toBe("here:qf:no such table: gone");
      // Nothing was propagated, so nothing was logged.
      expect(page.logged).toEqual([]);
    } finally {
      page.restore();
    }
  });

  test("the CPS `ServerError` envelope of a failed query carries an empty message; the server logs the text", async () => {
    const out = compileApp(`<program db="./g.db">
  \${
    <s> = "none"
    <rows> = []
    function mixed() {
      const found = ?{\`SELECT id FROM gone\`}.all()
      @s = "loaded"
      return found
    }
    function go() { @rows = mixed() !{ _ :> [] } }
  }
  <main><p id="seen">\${@s}</p><button id="b" onclick=go()>g</button></main>
</program>
`);
    expect(out.codes).toEqual([]);
    expect(out.serverJs).toContain(`variant: "ServerError"`);
    const page = await boot(out);
    try {
      await page.click("#b");
      const failed = page.bodies.find((b) => b.status === 500);
      expect(failed).toBeDefined();
      const env = JSON.parse(failed.text);
      expect(env.variant).toBe("ServerError");
      expect(env.data.message).toBe("");
      expect(failed.text).not.toContain("gone");
      expect(page.logged.some((l) => l.startsWith("[scrml] server function `mixed` failed:") && l.includes("no such table: gone"))).toBe(true);
    } finally {
      page.restore();
    }
  });
});

const CPS_APP = (extra = "") => `<program db="./g.db">
  \${
    <s> = "none"
    <rows> = []
    function mixed() {
      const found = ?{\`SELECT id FROM gone\`}.all()
      @s = "loaded"
      return found
    }
    function go() { @rows = mixed() !{ _ :> [] } }
  }
  ${extra}
  <main><p id="seen">\${@s}</p><button id="b" onclick=go()>g</button></main>
</program>
`;

describe("S474 ruling 2 as amended — a DEV build keeps the driver text on the wire; the server still logs it", () => {
  let DEV = null;
  const dev = () => (DEV ??= compileApp(APP, { devBuild: true }));

  test("QueryFailed: the dev client's `.QueryFailed(m)` arm receives the driver's text", async () => {
    expect(dev().codes).toEqual([]);
    const page = await boot(dev());
    try {
      await page.click("#b-gone");
      expect(page.seen()).toBe("qf:[no such table: gone]");
      expect(JSON.parse(page.bodies[0].text).data).toEqual({ message: "no such table: gone" });
      expect(page.logged.some((l) => l.startsWith("[scrml] server function `listGone` failed:") && l.includes("no such table: gone"))).toBe(true);
    } finally {
      page.restore();
    }
  });

  test("UNIQUE violation: same ConstraintViolation(field) in both builds, logged in both", async () => {
    const page = await boot(dev());
    try {
      await page.click("#b-unique");
      expect(page.seen()).toBe("cv:email");
      expect(page.logged.some((l) => l.includes("UNIQUE constraint failed: users.email"))).toBe(true);
    } finally {
      page.restore();
    }
  });

  test("the CPS `ServerError` message keeps the driver text in a dev build, is blank in a production build", async () => {
    for (const [devBuild, want] of [[true, "no such table: gone"], [false, ""]]) {
      const out = compileApp(CPS_APP(), { devBuild });
      expect(out.codes).toEqual([]);
      const page = await boot(out);
      try {
        await page.click("#b");
        const failed = page.bodies.find((b) => b.status === 500);
        expect(JSON.parse(failed.text).data.message).toBe(want);
        expect(page.logged.some((l) => l.startsWith("[scrml] server function `mixed` failed:") && l.includes("no such table: gone"))).toBe(true);
      } finally {
        page.restore();
      }
    }
  });

  test("the emitted helper differs only in the blanking: a production build blanks, a dev build does not", () => {
    const prod = built().serverJs;
    expect(prod).toContain(`if (failure.variant === "QueryFailed") failure.data = { message: "" };`);
    expect(dev().serverJs).not.toContain(`failure.data = { message: "" }`);
    expect(dev().serverJs).toContain("This module: message kept; non-column field kept.");
  });

  test("under `protect=` a dev build still blanks (a driver message can quote a protected value, §14.8.9)", async () => {
    const out = compileApp(`<program auth="none">
<db src="./g.db" protect="secret" tables="users">
  \${
    <seen> = "none"
    server function listGone()! -> SqlError {
      return ?{\`SELECT id FROM gone\`}.all()
    }
    function goGone() {
      const rows = listGone() !{ _ e :> { @seen = e.variant; return } }
      @seen = "rows"
    }
  }
  <p id="seen">\${@seen}</p><button id="b" onclick=goGone()>g</button>
</db>
</program>
`, { devBuild: true });
    expect(out.codes).toEqual([]);
    // r1 (review F4) — executed, not only read: the route's response carries no driver text.
    const r = await callRoute(out, "listGone", {});
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ __scrml_error: true, type: "SqlError", variant: "QueryFailed", data: { message: "" } });
    expect(r.logged.some((l) => l.includes("no such table: gone"))).toBe(true);
  });
});

// r1 (review F1 of #1704, HIGH) — a delivered SqlError means NOTHING was written. Before r1 the
// variant was delivered over committed partial writes wherever the §8.9.2 Batch-Planner envelope
// (a LEXICAL query count) was absent. Every case reads the table through a separate connection
// after the response.
describe("S474 r1 — a delivered SqlError means nothing was written (the `! -> SqlError` body has its own transaction)", () => {
  test("p13: INSERT, then a querying (non-`!`) helper fails — the variant is delivered and NOTHING is written", async () => {
    const out = compileApp(`<program db="./g.db">
  \${
    server function helper() {
      ?{\`INSERT INTO users (email) VALUES (\${"taken@x.io"})\`}.run()
      return 1
    }
    server function f(email)! -> SqlError {
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      helper()
      return "ok"
    }
  }
  <main><p>x</p></main>
</program>
`);
    const r = await callRoute(out, "f", { email: "p13@x.io" });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ __scrml_error: true, type: "SqlError", variant: "ConstraintViolation", data: { field: "email" } });
    expect(emails(out)).toEqual(["taken@x.io"]);
  });

  test("p3: a body-escalated `!` (no `server` modifier) with two INSERTs, the second failing — nothing written", async () => {
    const out = compileApp(`<program db="./g.db">
  \${
    <seen> = "none"
    function two(email)! -> SqlError {
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      ?{\`INSERT INTO users (email) VALUES (\${"taken@x.io"})\`}.run()
      return "added"
    }
    function goTwo() {
      const r = two("p3@x.io") !{ _ e :> { @seen = "f:" + e.variant; return } }
      @seen = "ok:" + r
    }
  }
  <main><p id="seen">\${@seen}</p><button id="b" onclick=goTwo()>o</button></main>
</program>
`);
    const page = await boot(out);
    try {
      await page.click("#b");
      expect(page.seen()).toBe("f:ConstraintViolation");
    } finally {
      page.restore();
    }
    expect(emails(out)).toEqual(["taken@x.io"]);
  });

  const P2 = `<program db="./g.db">
  \${
    server function two(email)! -> SqlError {
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      ?{\`INSERT INTO users (email) VALUES (\${"taken@x.io"})\`}.run()
      return "added"
    }
    server function outer(email)! -> SqlError {
      const r = two(email) !{ _ e :> "inner-failed:" + e.variant }
      ?{\`INSERT INTO users (email) VALUES (\${email + ".outer"})\`}.run()
      return r
    }
    server function outerFails(email)! -> SqlError {
      const r = two(email) !{ _ e :> "inner-failed:" + e.variant }
      ?{\`INSERT INTO users (email) VALUES (\${email + ".outer"})\`}.run()
      ?{\`INSERT INTO users (email) VALUES (\${"taken@x.io"})\`}.run()
      return r
    }
    server function plainOuter(email) {
      const r = two(email) !{ _ e :> "inner-failed:" + e.variant }
      ?{\`INSERT INTO users (email) VALUES (\${email + ".plain"})\`}.run()
      return r
    }
  }
  <main><p>x</p></main>
</program>
`;

  test("p2: an inner `!` callee handled by a `!` server caller — the inner savepoint rolls back, the caller's own write is kept", async () => {
    const out = compileApp(P2);
    const r = await callRoute(out, "outer", { email: "p2@x.io" });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toBe("inner-failed:ConstraintViolation");
    expect(emails(out)).toEqual(["p2@x.io.outer", "taken@x.io"]);
  });

  test("p2: the same, and then the caller fails itself — everything rolls back, the inner savepoint included", async () => {
    const out = compileApp(P2);
    const r = await callRoute(out, "outerFails", { email: "p2b@x.io" });
    expect(JSON.parse(r.text)).toEqual({ __scrml_error: true, type: "SqlError", variant: "ConstraintViolation", data: { field: "email" } });
    expect(emails(out)).toEqual(["taken@x.io"]);
  });

  test("p2: a NON-`!` caller that handles the inner failure — the inner transaction rolls back, the caller's write autocommits", async () => {
    const out = compileApp(P2);
    const r = await callRoute(out, "plainOuter", { email: "p2c@x.io" });
    expect(JSON.parse(r.text)).toBe("inner-failed:ConstraintViolation");
    expect(emails(out)).toEqual(["p2c@x.io.plain", "taken@x.io"]);
  });

  test("the direct route: two INSERTs, the second failing — the variant is delivered and the first is rolled back", async () => {
    const out = compileApp(P2);
    const r = await callRoute(out, "two", { email: "direct@x.io" });
    expect(JSON.parse(r.text).variant).toBe("ConstraintViolation");
    expect(emails(out)).toEqual(["taken@x.io"]);
    // And success commits.
    const ok = compileApp(`<program db="./g.db">
  \${
    server function both(email)! -> SqlError {
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      ?{\`INSERT INTO users (email) VALUES (\${email + ".2"})\`}.run()
      return "added"
    }
  }
  <main><p>x</p></main>
</program>
`);
    const r2 = await callRoute(ok, "both", { email: "ok@x.io" });
    expect(JSON.parse(r2.text)).toBe("added");
    expect(emails(ok)).toEqual(["ok@x.io", "ok@x.io.2", "taken@x.io"]);
  });

  test("a `fail` exit after a write rolls the write back too", async () => {
    const out = compileApp(`<program db="./g.db">
  \${
    type MyErr:enum = { Nope }
    server function writeThenFail(email)! -> SqlError {
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      fail SqlError.ConnectionLost
    }
  }
  <main><p>x</p></main>
</program>
`);
    const r = await callRoute(out, "writeThenFail", { email: "wf@x.io" });
    expect(JSON.parse(r.text).variant).toBe("ConnectionLost");
    expect(emails(out)).toEqual(["taken@x.io"]);
  });
});

// r1 (review F2 + F3) — the db-authoritative tier runs every request-scoped query inside
// `_scrml_sql.begin(cb)` (the guard's callback transaction), which r0 did not mark. Against an
// unreachable Postgres server: the variant is delivered, classified ConnectionLost, and no driver
// text crosses in a production build.
describe("S474 r1 — db-authoritative (Postgres callback transaction): an unreachable server is delivered as ConnectionLost", () => {
  const PG = `<program db="postgres://127.0.0.1:1/app">
  <schema>
    invoices {
      id: text primary key
      tenant_id: text not null
      amount: real not null
    } db-authoritative
  </schema>
  \${
    <s> = "none"
    <rows> = []
    server function listInv()! -> SqlError {
      return ?{\`select id, tenant_id, amount from invoices\`}.all()
    }
    function mixed() {
      const found = ?{\`select id from invoices\`}.all()
      @s = "loaded"
      return found
    }
    function go() { @rows = mixed() !{ _ :> [] } }
  }
  <main><p id="seen">\${@s}</p><button id="b" onclick=go()>g</button></main>
</program>
`;

  test("listInv: 200, SqlError.ConnectionLost, no driver text in the body; the server log has it", async () => {
    const out = compileApp(PG);
    expect(out.serverJs).toContain(".begin(");
    const r = await callRoute(out, "listInv", {});
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ __scrml_error: true, type: "SqlError", variant: "ConnectionLost", data: null });
    expect(r.text).not.toMatch(/failed to connect|ECONNREFUSED|127\.0\.0\.1/i);
    expect(r.logged.some((l) => l.startsWith("[scrml] server function `listInv` failed:"))).toBe(true);
  }, 30000);

  test("the CPS ServerError of the same failure carries an empty message in production", async () => {
    const out = compileApp(PG);
    const r = await callRoute(out, "mixed", {});
    expect(r.status).toBe(500);
    const env = JSON.parse(r.text);
    expect(env.variant).toBe("ServerError");
    expect(env.data.message).toBe("");
  }, 30000);
});

// S474 (bootstrap re-review R1 of #1703) — ONE ConstraintViolation `field` rule with the bootstrap's
// `constraintField`: a field is a column only when each part is exactly `table.col`; that delivers
// `col` (composite UNIQUE: `a, b`). Anything else is not a column: server code sees it, a production
// answer blanks it, a dev build keeps it (even under `protect=`: a constraint name is schema, not a
// value). The QueryFailed MESSAGE under `protect=` stays blank in a dev build too: it can quote a
// protected value (§14.8.9, "bad JSON path: '<the hash>'").
describe("S474 — ConstraintViolation field: the bootstrap's column-only rule (driver-shaped errors)", () => {
  const DB_FAILURE = Symbol.for("scrml.db.failure");
  const runtime = (keepMessage, keepName) =>
    new Function("_scrml_g", `${SERVER_SQL_ERROR_HELPER}\n${serverSqlPropagateHelper(keepMessage, keepName)}\nreturn { _scrml_sql_error, _scrml_sql_propagate };`)(globalThis);
  const marked = (msg, extra = {}) => {
    const e = Object.assign(new Error(msg), extra);
    Object.defineProperty(e, DB_FAILURE, { value: true });
    return e;
  };
  // S474 N1 — a Postgres error as Bun.SQL builds it (its own constructor): a server error has
  // `code: "ERR_POSTGRES_SERVER_ERROR"` and the SQLSTATE in `errno`.
  const pgMarked = (msg, fields) => {
    const e = new SQL.PostgresError(msg, { code: "ERR_POSTGRES_SERVER_ERROR", ...fields });
    Object.defineProperty(e, DB_FAILURE, { value: true });
    return e;
  };
  // [case, error, field server code sees, column?]
  const CASES = [
    ["UNIQUE users.email", () => marked("UNIQUE constraint failed: users.email", { code: "SQLITE_CONSTRAINT_UNIQUE" }), "email", true],
    ["composite UNIQUE", () => marked("UNIQUE constraint failed: comp.a, comp.b", { code: "SQLITE_CONSTRAINT_UNIQUE" }), "a, b", true],
    ["NOT NULL", () => marked("NOT NULL constraint failed: users.email", { code: "SQLITE_CONSTRAINT_NOTNULL" }), "email", true],
    ["spaced names", () => marked("UNIQUE constraint failed: my table.e mail", { code: "SQLITE_CONSTRAINT_UNIQUE" }), "my table.e mail", false],
    ["a.b.c.d", () => marked("UNIQUE constraint failed: a.b.c.d", { code: "SQLITE_CONSTRAINT_UNIQUE" }), "a.b.c.d", false],
    ["expression index", () => marked("UNIQUE constraint failed: index 'x_lower'", { code: "SQLITE_CONSTRAINT_UNIQUE" }), "index 'x_lower'", false],
    ["unnamed CHECK", () => marked("CHECK constraint failed: n > 0", { code: "SQLITE_CONSTRAINT_CHECK" }), "n > 0", false],
    ["named CHECK", () => marked("CHECK constraint failed: positive", { code: "SQLITE_CONSTRAINT_CHECK" }), "positive", false],
    ["PG 23505 constraint name", () => pgMarked('duplicate key value violates unique constraint "users_email_key"', { errno: "23505", constraint: "users_email_key", detail: "Key (email)=(t@x) already exists.", table: "users" }), "users_email_key", false],
    ["PG 23502 column", () => pgMarked('null value in column "email" of relation "users" violates not-null constraint', { errno: "23502", column: "email", detail: "Failing row contains (1, null).", table: "users" }), "email", true],
  ];
  const quiet = (f) => { const o = console.error; console.error = () => {}; try { return f(); } finally { console.error = o; } };

  for (const [name, mk, field, column] of CASES) {
    test(`${name}: server code sees \`${field}\`; production ${column ? "delivers it" : "blanks it"}; dev keeps it`, () => {
      const prod = runtime(false, false);
      expect(prod._scrml_sql_error(mk())).toEqual({ __scrml_error: true, type: "SqlError", variant: "ConstraintViolation", data: { field } });
      const sent = quiet(() => prod._scrml_sql_propagate(mk(), "f"));
      expect(sent).toEqual({ __scrml_error: true, type: "SqlError", variant: "ConstraintViolation", data: { field: column ? field : "" } });
      // No driver value reaches the client in any build (PG's `detail` quotes the row; it is never read).
      expect(JSON.stringify(sent)).not.toContain("t@x");
      const dev = runtime(true, true);
      expect(quiet(() => dev._scrml_sql_propagate(mk(), "f")).data).toEqual({ field });
      // dev + protect=: the constraint name is kept (schema, not a value).
      const devProtect = runtime(false, true);
      expect(quiet(() => devProtect._scrml_sql_propagate(mk(), "f")).data).toEqual({ field });
    });
  }

  test("QueryFailed: production blanks; dev keeps; dev + protect= blanks (the message can quote a protected value)", () => {
    const mk = () => marked("bad JSON path: 'SECRET-HASH-123'", { code: "SQLITE_ERROR" });
    expect(quiet(() => runtime(false, false)._scrml_sql_propagate(mk(), "f")).data).toEqual({ message: "" });
    expect(quiet(() => runtime(true, true)._scrml_sql_propagate(mk(), "f")).data).toEqual({ message: "bad JSON path: 'SECRET-HASH-123'" });
    expect(quiet(() => runtime(false, true)._scrml_sql_propagate(mk(), "f")).data).toEqual({ message: "" });
  });

  // The same shapes from a REAL SQLite file, through the compiled routes.
  const SHAPES = `<program db="./g.db">
  \${
    server function comp(a, b)! -> SqlError {
      ?{\`INSERT INTO comp (a, b) VALUES (\${a}, \${b})\`}.run()
      return "ok"
    }
    server function named(n)! -> SqlError {
      ?{\`INSERT INTO named (n) VALUES (\${n})\`}.run()
      return "ok"
    }
    server function unnamed(n)! -> SqlError {
      ?{\`INSERT INTO unnamed (n) VALUES (\${n})\`}.run()
      return "ok"
    }
    server function expr(e)! -> SqlError {
      ?{\`INSERT INTO expr (e) VALUES (\${e})\`}.run()
      return "ok"
    }
    server function spaced(e)! -> SqlError {
      ?{\`INSERT INTO "my table" ("e mail") VALUES (\${e})\`}.run()
      return "ok"
    }
  }
  <main><p>x</p></main>
</program>
`;
  const seed = (out) => {
    const db = new Database(out.dbPath);
    db.run("CREATE TABLE comp (a TEXT, b TEXT, UNIQUE (a, b))");
    db.run("INSERT INTO comp VALUES ('x', 'y')");
    db.run("CREATE TABLE named (n INTEGER CONSTRAINT positive CHECK (n > 0))");
    db.run("CREATE TABLE unnamed (n INTEGER CHECK (n > 0))");
    db.run("CREATE TABLE expr (e TEXT)");
    db.run("CREATE UNIQUE INDEX x_lower ON expr (lower(e))");
    db.run("INSERT INTO expr VALUES ('Dup')");
    db.run('CREATE TABLE "my table" ("e mail" TEXT UNIQUE)');
    db.run(`INSERT INTO "my table" VALUES ('dup')`);
    db.close();
  };
  const REAL = [
    ["comp", { a: "x", b: "y" }, "a, b"],
    ["named", { n: -1 }, ""],
    ["unnamed", { n: -1 }, ""],
    ["expr", { e: "dup" }, ""],
    ["spaced", { e: "dup" }, ""],
  ];

  test("real SQLite, production: a composite UNIQUE delivers `a, b`; CHECK / expression index / spaced names are blanked", async () => {
    const out = compileApp(SHAPES);
    seed(out);
    for (const [fn, args, want] of REAL) {
      const r = await callRoute(out, fn, args);
      expect([fn, r.status, JSON.parse(r.text)]).toEqual([fn, 200, { __scrml_error: true, type: "SqlError", variant: "ConstraintViolation", data: { field: want } }]);
      expect(r.logged.some((l) => l.startsWith("[scrml] server function `" + fn + "` failed:") && l.includes("constraint failed"))).toBe(true);
    }
  });

  test("real SQLite, dev build: the non-column names are delivered as the driver wrote them", async () => {
    const out = compileApp(SHAPES, { devBuild: true });
    seed(out);
    const got = {};
    for (const [fn, args] of REAL) got[fn] = JSON.parse((await callRoute(out, fn, args)).text).data.field;
    expect(got).toEqual({ comp: "a, b", named: "positive", unnamed: "n > 0", expr: "index 'x_lower'", spaced: "my table.e mail" });
  });
});

// S474 N1 (re-review of #1704) — the classifier reads EVERY field a driver puts its code in.
// Bun.SQL's PostgresError: `code: "ERR_POSTGRES_SERVER_ERROR"`, SQLSTATE in `errno`; its
// MySQLError: `code` (ER_…), number in `errno`, SQLSTATE in `sqlState`. Before, `code ?? errno`
// read only `code`, so a real Postgres 23505 / 08006 and a MySQL duplicate key were QueryFailed.
// Every error here is built by Bun's own constructors (the shape Bun produces), except the SQLite
// ones, which come from a real bun:sqlite failure.
describe("S474 N1 — the SqlError classifier reads Postgres / MySQL codes where Bun.SQL puts them", () => {
  const DB_FAILURE = Symbol.for("scrml.db.failure");
  const mark = (e) => { Object.defineProperty(e, DB_FAILURE, { value: true }); return e; };
  const prod = () => new Function("_scrml_g", `${SERVER_SQL_ERROR_HELPER}\n${serverSqlPropagateHelper(false, false)}\nreturn { _scrml_sql_error, _scrml_sql_propagate };`)(globalThis);
  const pg = (msg, f) => mark(new SQL.PostgresError(msg, { code: "ERR_POSTGRES_SERVER_ERROR", ...f }));
  const my = (msg, f) => mark(new SQL.MySQLError(msg, f));
  const sqliteErr = (sql) => {
    const db = new Database(":memory:");
    db.run("CREATE TABLE t (n INTEGER)");
    try { db.run(sql); } catch (e) { return mark(e); } finally { db.close(); }
    throw new Error("expected a failure: " + sql);
  };
  const quiet = (f) => { const o = console.error; console.error = () => {}; try { return f(); } finally { console.error = o; } };
  // [case, error, variant the client receives, its data in production]
  const CASES = [
    ["PG 23505 unique (server error, SQLSTATE in errno)", () => pg('duplicate key value violates unique constraint "users_email_key"', { errno: "23505", constraint: "users_email_key", detail: "Key (email)=(taken@x.io) already exists.", table: "users" }), "ConstraintViolation", { field: "" }],
    ["PG 23502 not null with a column", () => pg('null value in column "email" of relation "users" violates not-null constraint', { errno: "23502", column: "email", table: "users" }), "ConstraintViolation", { field: "email" }],
    ["PG 23503 foreign key", () => pg('insert or update on table "posts" violates foreign key constraint "posts_user_fk"', { errno: "23503", constraint: "posts_user_fk" }), "ConstraintViolation", { field: "" }],
    ["PG 23P01 exclusion (class 23, letter code)", () => pg('conflicting key value violates exclusion constraint "no_overlap"', { errno: "23P01", constraint: "no_overlap" }), "ConstraintViolation", { field: "" }],
    ["PG 42P01 undefined table", () => pg('relation "gone" does not exist', { errno: "42P01" }), "QueryFailed", { message: "" }],
    ["PG 08006 connection failure (server SQLSTATE)", () => pg("terminating connection due to administrator command", { errno: "08006" }), "ConnectionLost", null],
    ["PG unreachable (Bun's client code)", () => mark(new SQL.PostgresError("Failed to connect", { code: "ERR_POSTGRES_CONNECTION_REFUSED" })), "ConnectionLost", null],
    ["PG connection closed (Bun's client code)", () => mark(new SQL.PostgresError("Connection closed", { code: "ERR_POSTGRES_CONNECTION_CLOSED" })), "ConnectionLost", null],
    ["MySQL ER_DUP_ENTRY 1062", () => my("Duplicate entry 'taken@x.io' for key 'users.email'", { code: "ER_DUP_ENTRY", errno: 1062, sqlState: "23000" }), "ConstraintViolation", { field: "" }],
    ["MySQL FK ER_NO_REFERENCED_ROW_2 1452", () => my("Cannot add or update a child row: a foreign key constraint fails", { code: "ER_NO_REFERENCED_ROW_2", errno: 1452, sqlState: "23000" }), "ConstraintViolation", { field: "" }],
    ["MySQL FK ER_ROW_IS_REFERENCED_2 1451", () => my("Cannot delete or update a parent row: a foreign key constraint fails", { code: "ER_ROW_IS_REFERENCED_2", errno: 1451, sqlState: "23000" }), "ConstraintViolation", { field: "" }],
    ["MySQL dup by number only", () => my("Duplicate entry 'x' for key 'k'", { errno: 1062 }), "ConstraintViolation", { field: "" }],
    ["MySQL connection closed", () => my("Connection closed", { code: "ERR_MYSQL_CONNECTION_CLOSED" }), "ConnectionLost", null],
    ["MySQL syntax error", () => my("You have an error in your SQL syntax", { code: "ER_PARSE_ERROR", errno: 1064, sqlState: "42000" }), "QueryFailed", { message: "" }],
    ["SQLite no such table (real)", () => sqliteErr("SELECT * FROM gone"), "QueryFailed", { message: "" }],
    ["SQLite CHECK (real)", () => sqliteErr("CREATE TABLE c (n INTEGER CHECK (n > 0)); INSERT INTO c VALUES (-1)"), "ConstraintViolation", { field: "" }],
    ["a query text that mentions a connection is NOT a lost connection", () => sqliteErr('SELECT * FROM "connection failed"'), "QueryFailed", { message: "" }],
  ];
  for (const [name, mk, variant, data] of CASES) {
    test(name, () => {
      const sent = quiet(() => prod()._scrml_sql_propagate(mk(), "f"));
      expect(sent).toEqual({ __scrml_error: true, type: "SqlError", variant, data });
      // No driver value (the duplicate email, a detail row) ever reaches the client.
      expect(JSON.stringify(sent)).not.toContain("taken@x.io");
    });
  }

  test("server code (a site-handled `?{}`) still sees the whole value: the constraint name, the message", () => {
    const rt = prod();
    expect(rt._scrml_sql_error(pg('duplicate key value violates unique constraint "users_email_key"', { errno: "23505", constraint: "users_email_key" })).data).toEqual({ field: "users_email_key" });
    expect(rt._scrml_sql_error(pg('relation "gone" does not exist', { errno: "42P01" })).data).toEqual({ message: 'relation "gone" does not exist' });
  });
});

// S474 ruling "envelope every `!` server body" (user-voice-scrml.md, 2026-11-01): "Every `!` server
// body runs in the §8.9.2 envelope … not only `! -> SqlError`. Closes the `fail` half of
// g-implicit-envelope-only-on-baseline-csrf-arm (S449)." §8.9.2 (S449 ruling D): a `fail` exit rolls
// the implicit transaction back. Each case runs the route and reads the table afterwards.
describe("S474 ruling — every `!` server body runs in the envelope (a `fail` exit writes nothing)", () => {
  const APP_E = (programAttrs) => `<program db="./g.db"${programAttrs}>
  \${
    type E:enum = { Bad, Gone }
    server function failAfterWrite(email)! -> E {
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      fail E.Bad
    }
    server function writeOk(email)! -> E {
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      return "ok"
    }
    server function outerHandles(email)! -> E {
      ?{\`INSERT INTO users (email) VALUES (\${email + ".outer"})\`}.run()
      const r = failAfterWrite(email) !{ _ e :> "inner:" + e.variant }
      ?{\`INSERT INTO users (email) VALUES (\${email + ".after"})\`}.run()
      return r
    }
    server function plainHandles(email) {
      ?{\`INSERT INTO users (email) VALUES (\${email + ".plain"})\`}.run()
      const r = failAfterWrite(email) !{ _ e :> "inner:" + e.variant }
      return r
    }
  }
  <main><p>x</p></main>
</program>
`;

  test("CSRF arm: INSERT then `fail E.Bad` — the failure is delivered and no row is left", async () => {
    const out = compileApp(APP_E(""));
    expect(out.serverJs).toContain(`"failAfterWrite", false, () =>`);
    const r = await callRoute(out, "failAfterWrite", { email: "e1@x.io" });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ __scrml_error: true, type: "E", variant: "Bad", data: null });
    expect(emails(out)).toEqual(["taken@x.io"]);
  });

  test("non-CSRF arm (a GET route — the arm the auth / headless routes take): INSERT then `fail E.Bad` — no row is left", async () => {
    const out = compileApp(`<program db="./g.db">
  \${
    type E:enum = { Bad }
    server function failGet(email)! -> E route="/api/fail-get" method="GET" {
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      fail E.Bad
    }
  }
  <main><p>x</p></main>
</program>
`);
    expect(out.codes).toEqual([]);
    // The handler carries no baseline double-submit check: it is the non-CSRF arm.
    const h = out.serverJs.slice(out.serverJs.indexOf("_handler_failGet"));
    expect(h.slice(0, h.indexOf("\n}\n"))).not.toContain("_scrml_validate_csrf");
    expect(h.slice(0, h.indexOf("\n}\n"))).toContain(`"failGet", false, () =>`);
    const routes = await routesOf(out);
    const route = routes.find((r) => r.path === "/api/fail-get");
    const resp = await route.handler({
      url: "http://localhost/api/fail-get",
      method: "GET",
      headers: { get: () => null },
      json: async () => ({ email: "g@x.io" }),
    });
    expect(JSON.parse(await resp.text())).toEqual({ __scrml_error: true, type: "E", variant: "Bad", data: null });
    expect(emails(out)).toEqual(["taken@x.io"]);
  });

  test("a successful `! -> E` body commits", async () => {
    const out = compileApp(APP_E(""));
    const r = await callRoute(out, "writeOk", { email: "ok@x.io" });
    expect(JSON.parse(r.text)).toBe("ok");
    expect(emails(out)).toEqual(["ok@x.io", "taken@x.io"]);
  });

  test("a `!` callee whose failure the `!` caller handles: the callee's write is undone, the caller's writes are kept", async () => {
    const out = compileApp(APP_E(""));
    const r = await callRoute(out, "outerHandles", { email: "o@x.io" });
    expect(JSON.parse(r.text)).toBe("inner:Bad");
    expect(emails(out)).toEqual(["o@x.io.after", "o@x.io.outer", "taken@x.io"]);
  });

  test("the same with a NON-`!` caller: the callee's write is undone, the caller's write autocommits", async () => {
    const out = compileApp(APP_E(""));
    const r = await callRoute(out, "plainHandles", { email: "p@x.io" });
    expect(JSON.parse(r.text)).toBe("inner:Bad");
    expect(emails(out)).toEqual(["p@x.io.plain", "taken@x.io"]);
  });

  // #1718 r1 (review F1/F2; PA ruling "every `!` body"): an author `transaction { }` / `?{BEGIN}`
  // no longer exempts the body. The author's transaction nests as a SAVEPOINT inside the envelope;
  // a later `fail` undoes every write. These four committed rows on e48913ff8.
  const TXAPP = `<program db="./g.db">
  \${
    type E:enum = { Bad }
    server function condTx(email, useTx)! -> E {
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      if (useTx) {
        transaction {
          ?{\`INSERT INTO users (email) VALUES (\${email + ".tx"})\`}.run()
        }
      }
      fail E.Bad
    }
    server function deadClosureTx(email)! -> E {
      function later()! -> E {
        transaction {
          ?{\`INSERT INTO users (email) VALUES (\${"never"})\`}.run()
        }
      }
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      fail E.Bad
    }
    server function writeThenBegin(email)! -> E {
      ?{\`INSERT INTO users (email) VALUES (\${email + ".pre"})\`}.run()
      ?{\`BEGIN\`}.run()
      ?{\`INSERT INTO users (email) VALUES (\${email + ".in"})\`}.run()
      ?{\`COMMIT\`}.run()
      fail E.Bad
    }
    server function plainBegin(email)! -> E {
      ?{\`BEGIN\`}.run()
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      ?{\`COMMIT\`}.run()
      fail E.Bad
    }
    server function commentBegin(email)! -> E {
      ?{\`/* mine */ BEGIN\`}.run()
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      ?{\`COMMIT\`}.run()
      fail E.Bad
    }
    server function txOk(email)! -> E {
      transaction {
        ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      }
      return "ok"
    }
  }
  <main><p>x</p></main>
</program>
`;
  const failed = { __scrml_error: true, type: "E", variant: "Bad", data: null };

  test("F1(a): a `transaction { }` in a branch NOT taken — the body's own write is undone on `fail`", async () => {
    const out = compileApp(TXAPP);
    expect(JSON.parse((await callRoute(out, "condTx", { email: "ct0@x", useTx: false })).text)).toEqual(failed);
    expect(emails(out)).toEqual(["taken@x.io"]);
  });

  test("F1(a'): the branch taken — the nested transaction's write is undone with the rest", async () => {
    const out = compileApp(TXAPP);
    expect(JSON.parse((await callRoute(out, "condTx", { email: "ct1@x", useTx: true })).text)).toEqual(failed);
    expect(emails(out)).toEqual(["taken@x.io"]);
  });

  test("F1(b): a `transaction { }` in a nested function never called — the body's write is undone", async () => {
    const out = compileApp(TXAPP);
    expect(JSON.parse((await callRoute(out, "deadClosureTx", { email: "dc@x" })).text)).toEqual(failed);
    expect(emails(out)).toEqual(["taken@x.io"]);
  });

  test("F1(c): a write BEFORE an author BEGIN … COMMIT, then `fail` — nothing is written (the author COMMIT is a RELEASE)", async () => {
    const out = compileApp(TXAPP);
    expect(JSON.parse((await callRoute(out, "writeThenBegin", { email: "wb@x" })).text)).toEqual(failed);
    expect(emails(out)).toEqual(["taken@x.io"]);
  });

  test("F2: `?{BEGIN}` and `?{/* mine */ BEGIN}` behave the same (both undone by the `fail`)", async () => {
    const out = compileApp(TXAPP);
    await callRoute(out, "plainBegin", { email: "pb@x" });
    await callRoute(out, "commentBegin", { email: "cb@x" });
    expect(emails(out)).toEqual(["taken@x.io"]);
  });

  test("a `!` body with its own `transaction { }` that succeeds commits", async () => {
    const out = compileApp(TXAPP);
    expect(out.codes).toEqual([]);
    expect(out.serverJs).toContain(`"txOk", false, () =>`);
    expect(JSON.parse((await callRoute(out, "txOk", { email: "tx@x.io" })).text)).toBe("ok");
    expect(emails(out)).toEqual(["taken@x.io", "tx@x.io"]);
  });

  test("a failed QUERY in a `! -> E` body is still not an E variant: rolled back, then the route's error path (500)", async () => {
    const out = compileApp(`<program db="./g.db">
  \${
    type E:enum = { Bad }
    server function dupAfterWrite(email)! -> E {
      ?{\`INSERT INTO users (email) VALUES (\${email})\`}.run()
      ?{\`INSERT INTO users (email) VALUES (\${"taken@x.io"})\`}.run()
      return "ok"
    }
  }
  <main><p>x</p></main>
</program>
`);
    const r = await callRoute(out, "dupAfterWrite", { email: "d@x.io" });
    expect(r.status).toBe("THROW");
    expect(emails(out)).toEqual(["taken@x.io"]);
  });
});

// #1718 r1 (review F3; PA ruling): a `!` body whose TRANSITIVE query set is empty opens no envelope,
// so a slow await in it does not hold the database mutex. Measured on e48913ff8: an unrelated SELECT
// waited 411 ms behind a query-free `! -> E` body that slept 400 ms.
describe("S474 r1 F3 — a query-free `!` body does not hold the database lock", () => {
  const APP_F3 = `<program db="./g.db">
  \${
    import { sleep } from "scrml:time"
    type E:enum = { Bad }
    function pure(n) { return n + 1 }
    function viaHelper() { return ?{\`SELECT count(*) AS n FROM users\`}.get() }
    server function slowNoSql(ms)! -> E {
      sleep(ms)
      const k = pure(ms)
      if (ms == 0) { fail E.Bad }
      return "slept:" + k
    }
    server function slowViaHelper(ms)! -> E {
      sleep(ms)
      const r = viaHelper()
      return "h:" + r.n
    }
    server function readOnly() {
      return ?{\`SELECT count(*) AS n FROM users\`}.get()
    }
  }
  <main><p>x</p></main>
</program>
`;

  test("emission: no envelope for the query-free body; the body that reaches a `?{}` through a helper keeps it", () => {
    const out = compileApp(APP_F3);
    expect(out.codes).toEqual([]);
    expect(out.serverJs).not.toContain(`"slowNoSql", false, () =>`);
    expect(out.serverJs).toContain(`"slowViaHelper", false, () =>`);
  });

  test("run time: an unrelated SELECT is not stalled behind a slow query-free `!` body", async () => {
    const out = compileApp(APP_F3);
    const routes = await routesOf(out);
    const hdr = { "content-type": "application/json", cookie: "scrml_csrf=t", "x-csrf-token": "t" };
    const call = (fn, args) => {
      const route = routes.find((r) => r.path.includes("_route_" + fn + "_"));
      return route.handler({ url: "http://localhost" + route.path, method: "POST", headers: { get: (k) => hdr[String(k).toLowerCase()] ?? null }, json: async () => args });
    };
    const slow = call("slowNoSql", { ms: 400 });
    await new Promise((r) => setTimeout(r, 20));
    const t0 = Date.now();
    const read = await call("readOnly", {});
    const readMs = Date.now() - t0;
    expect(JSON.parse(await read.text())).toEqual({ n: 1 });
    expect(readMs).toBeLessThan(200);
    expect(JSON.parse(await (await slow).text())).toBe("slept:401");
  });
});
