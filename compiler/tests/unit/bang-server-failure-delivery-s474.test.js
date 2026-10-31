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
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { compileScrml } from "../../src/api.js";

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

  test("emission: only a SqlError-typed `!` body ends in the propagation catch", () => {
    const js = built().serverJs;
    expect(js).toContain(`_scrml_sql_propagate(_scrml_e, "addUser")`);
    expect(js).toContain(`_scrml_sql_propagate(_scrml_e, "listGone")`);
    expect(js).not.toContain(`_scrml_sql_propagate(_scrml_e, "find")`);
    expect(js).not.toContain(`_scrml_sql_propagate(_scrml_e, "plainAdd")`);
    // The client bundle carries none of it.
    expect(built().clientJs).not.toContain("_scrml_sql_propagate");
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
    expect(dev().serverJs).toContain("This is a DEV build");
  });

  test("under `protect=` a dev build still blanks (a driver message can quote a protected value, §14.8.9)", () => {
    const out = compileApp(`<program>
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
    expect(out.serverJs).toContain(`_scrml_sql_propagate(_scrml_e, "listGone")`);
    expect(out.serverJs).toContain(`if (failure.variant === "QueryFailed") failure.data = { message: "" };`);
  });
});
