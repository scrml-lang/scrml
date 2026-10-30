/**
 * S473 — `navigate()` in a SERVER function, END TO END in a page (SPEC §20.1).
 *
 * Gap g-impl1-server-navigate-referenceerror-after-commit-s473. The emitted client bundle runs
 * in happy-dom; a click calls the server function through the bundle's OWN generated fetch stub,
 * and every request is answered by the EMITTED server module (real bun:sqlite database). The
 * page's fetch behaves like a browser's: a 3xx response is FOLLOWED (fetch does that by itself,
 * which is why a bare 302 cannot reach the stub), and a handler that throws becomes the host's
 * 500.
 *
 * Before the fix the server threw `ReferenceError: _scrml_navigate is not defined` after the
 * INSERT committed: the click logged an error, the page stayed put, the row existed. After it:
 * the page hard-navigates to /posts (location.assign), nothing is logged, there is one row, and
 * the caller's statement after the call does not run.
 *
 * The handler-level twin is compiler/tests/integration/server-navigate-s473.test.js.
 */

import { describe, test, expect, afterAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { resolve, join } from "path";
import { writeFileSync, readFileSync, mkdirSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { Database } from "bun:sqlite";
import { compileScrml } from "../../src/api.js";
import { captureInsideChunkScope } from "../helpers/chunk-scope.js";

if (!globalThis.document) GlobalRegistrator.register({ url: "http://localhost/" });

const dirs = [];
afterAll(() => {
  for (const d of dirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

const SRC = `<program db="./app.db">
<after> = ""

<db src="./app.db" tables="posts">
\${
    function createPost(title: string) {
        ?{\`INSERT INTO posts (title) VALUES (\${title})\`}.run() !{
            .ConstraintViolation(_) :> { return }
            _ :> { return }
        }
        navigate("/posts", .Hard)
    }

    function submit() {
        createPost("hello")
        @after = "ran"
    }
}
</>

<button id="create" onclick=createPost("hello")>Create post</button>
<button id="submit" onclick=submit()>Submit</button>
<p id="after">\${@after}</p>

</program>
`;

async function buildAndMount(tag) {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
  GlobalRegistrator.register({ url: "http://localhost/new-post" });
  const uniq = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const dir = resolve(tmpdir(), "scrml-server-navigate-s473", `${tag}-${uniq}`);
  dirs.push(dir);
  const out = resolve(dir, "out");
  mkdirSync(out, { recursive: true });
  const dbPath = resolve(dir, "app.db");
  const db = new Database(dbPath, { create: true });
  db.exec("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT UNIQUE)");
  db.close();
  writeFileSync(resolve(dir, "app.scrml"), SRC);
  const result = compileScrml({ inputFiles: [resolve(dir, "app.scrml")], write: true, outputDir: out });
  const errors = (result.errors ?? []).filter((e) => (e.severity ?? "error") === "error").map((e) => e.code);
  if (errors.length > 0) return { errors };

  const html = readFileSync(join(out, "app.html"), "utf8");
  const clientJs = readFileSync(join(out, "app.client.js"), "utf8");
  const runtimeJs = readdirSync(out).filter((f) => /^scrml-runtime.*\.js$/.test(f)).map((f) => readFileSync(join(out, f), "utf8")).join("\n");
  const mod = await import(`file://${join(out, "app.server.js")}?v=${uniq}`);

  // The host: a route answers through the server module; any other path is a page. A handler
  // that throws is the host's 500 (Bun.serve's default answer to an uncaught handler error).
  const serve = async (url, init) => {
    const hmap = {};
    const src = init.headers ?? {};
    if (typeof src.forEach === "function") src.forEach((v, k) => { hmap[k.toLowerCase()] = v; });
    else for (const k of Object.keys(src)) hmap[k.toLowerCase()] = String(src[k]);
    if (document.cookie) hmap["cookie"] = document.cookie;
    const bodyStr = init.body != null ? String(init.body) : "";
    let resp;
    try {
      resp = await mod.fetch({
        url: "http://localhost" + url,
        method: init.method ?? "GET",
        headers: { get: (k) => hmap[String(k).toLowerCase()] ?? null },
        json: async () => JSON.parse(bodyStr || "null"),
        text: async () => bodyStr,
      });
    } catch (e) {
      serverErrors.push(e);
      return { status: 500, headers: new Headers({ "Content-Type": "text/plain" }), body: "Internal Server Error" };
    }
    if (resp === null) return { status: 200, headers: new Headers({ "Content-Type": "text/html" }), body: `<html><body>page ${url}</body></html>` };
    return { status: resp.status, headers: resp.headers, body: await resp.text() };
  };
  const serverErrors = [];
  const followedRedirects = [];
  // A browser's fetch: follows a redirect by itself (a POST becomes a GET of Location).
  globalThis.fetch = async (url, init = {}) => {
    let r = await serve(url, init);
    for (let hops = 0; r.status >= 300 && r.status < 400 && hops < 5; hops++) {
      const loc = r.headers.get("location");
      followedRedirects.push(loc);
      r = await serve(loc, { method: "GET" });
    }
    return new Response(r.status === 204 ? null : r.body, { status: r.status, headers: r.headers });
  };

  const assigned = [];
  window.location.assign = (u) => { assigned.push(String(u)); };
  const logged = [];
  const origError = console.error;
  console.error = (...args) => { logged.push(args.map(String).join(" ")); };

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  document.body.innerHTML = (bodyMatch ? bodyMatch[1] : html).replace(/<script[^>]*>[\s\S]*?<\/script>/g, "").trim();
  new Function("window", "document",
    `${runtimeJs}\n` + captureInsideChunkScope(clientJs, `globalThis.__s473nav_get = _scrml_reactive_get;\n`),
  )(window, document);
  document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
  const restore = () => { console.error = origError; };
  const rows = () => {
    const d = new Database(dbPath);
    const r = d.query("SELECT title FROM posts ORDER BY id").all().map((x) => x.title);
    d.close();
    return r;
  };
  return { errors, assigned, logged, serverErrors, followedRedirects, rows, restore, clientJs };
}

async function settle() {
  for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 5));
}

describe("S473 — click → server function → hard navigation", () => {
  test("the page goes to /posts, nothing is logged, and exactly one row exists", async () => {
    const b = await buildAndMount("click");
    expect(b.errors).toEqual([]);
    try {
      document.querySelector("#create").click();
      await settle();
    } finally {
      b.restore();
    }
    expect(b.serverErrors.map((e) => String(e && e.message))).toEqual([]);
    expect(b.logged).toEqual([]);
    expect(b.assigned).toEqual(["/posts"]);
    // The stub got the navigation as a header: fetch never followed a redirect.
    expect(b.followedRedirects).toEqual([]);
    expect(b.rows()).toEqual(["hello"]);
  }, 30_000);

  test("the caller's statement after the server call does not run", async () => {
    const b = await buildAndMount("caller");
    expect(b.errors).toEqual([]);
    try {
      document.querySelector("#submit").click();
      await settle();
    } finally {
      b.restore();
    }
    expect(b.serverErrors.map((e) => String(e && e.message))).toEqual([]);
    expect(b.logged).toEqual([]);
    expect(b.assigned).toEqual(["/posts"]);
    expect(globalThis.__s473nav_get("after")).toBe("");
    expect(document.querySelector("#after").textContent).toBe("");
    expect(b.rows()).toEqual(["hello"]);
  }, 30_000);
});
