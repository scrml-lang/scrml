// ---------------------------------------------------------------------------
// <endpoint> route names, the entry rule and Max-Age across entries — #1998 review r1.
// ---------------------------------------------------------------------------
//
// F2: an endpoint's route record was `__ri_route_endpoint_<M>_<P>`, in the namespace of
// the server-function routes (`__ri_route_<fnName>_<n>`), and `_server.js` keeps the
// first module that exports a name — a server function named `endpoint_POST__2fx` as
// the 21st route exported the name of `<endpoint path="/x!" method="POST">`, and the
// endpoint was never served. The records are now `_scrml_route_endpoint_…`, in the
// compiler's `_scrml_` namespace (§47.1.1 — no author name begins with `_scrml_`), and
// `scrml build` refuses (E-CG-006) two modules exporting one route name for different
// routes instead of keeping the first.
//
// F3: §61.2 "a route belongs to the served program, not to an imported module" — a file
// another file of the build imports is not an entry, whatever it declares.
//
// Max-Age (PA decision S480): an entry that mounts endpoints and declares no
// `cors-max-age=` counts as the default, so `600` against silence answers the default.
//
// Every served case runs the REAL `_server.js` that `scrml build` emits, over HTTP.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, existsSync, readFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { generateServerEntry, describeServerUnit } from "../../src/commands/build.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(testDir, "../../src/cli.js");
const TIMEOUT_MS = 60_000;
const A = "https://a.example";

const TY = (name = "Op") => `\${
  type ${name}:enum = {
    Ping
  }
}`;
const EP = (path, method = "POST", attrs = "", type = "Op") =>
  `<endpoint path="${path}" method="${method}" accepts=${type}${attrs}>
  <Ping : { pong: "${method} ${path}" }>
</endpoint>`;
const program = (body, attrs = "") => `<program${attrs}>
${body}
<p>hi</p>
</program>
`;

let root;
const procs = [];

function writeApp(name, files) {
  const src = join(root, name, "src");
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(src, f)), { recursive: true });
    writeFileSync(join(src, f), text);
  }
  return src;
}

function build(name, files, distName = "dist") {
  const src = writeApp(name, files);
  const dist = join(root, name, distName);
  const r = Bun.spawnSync(["bun", CLI, "build", src, "-o", dist], { stdout: "pipe", stderr: "pipe" });
  return { exitCode: r.exitCode, out: r.stdout.toString() + r.stderr.toString(), dist };
}

async function freePort() {
  const s = Bun.serve({ port: 0, fetch: () => undefined });
  const port = s.port;
  s.stop(true);
  return port;
}

async function startProd(dist) {
  const port = await freePort();
  const proc = Bun.spawn(["bun", "_server.js"], {
    cwd: dist,
    env: { ...process.env, PORT: String(port) },
    stdout: "pipe",
    stderr: "pipe",
  });
  procs.push(proc);
  let out = "";
  const pump = async (stream) => { for await (const c of stream) out += new TextDecoder().decode(c); };
  pump(proc.stdout);
  pump(proc.stderr);
  const t0 = Date.now();
  while (Date.now() - t0 < 25_000) {
    if (/scrml server listening/.test(out)) return `http://127.0.0.1:${port}`;
    await Bun.sleep(25);
  }
  throw new Error(`_server.js did not come up:\n${out}`);
}

function post(base, path) {
  return fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"tag":"Ping"}' });
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "endpoint-route-names-entry-"));
});

afterAll(async () => {
  for (const p of procs) { try { p.kill(); } catch { /* gone */ } }
  for (const p of procs) { try { await p.exited; } catch { /* ignore */ } }
  if (root) rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// F2 — the endpoint's route names are outside every author-reachable namespace
// ---------------------------------------------------------------------------

const MANY_FNS = Array.from({ length: 20 }, (_, i) => `  export server function f${i + 1}() { return ${i + 1} }`).join("\n");

describe("F2 — a server function named like an endpoint record does not displace it (review coll2)", () => {
  let base;
  let dist;
  beforeAll(async () => {
    // coll2's shape at a path the §61.7 grammar admits: twenty server functions, then
    // one named `endpoint_POST__2fx` (the 21st route), imported and called by the entry.
    const r = build("coll2", {
      "aaa.scrml": `\${\n${MANY_FNS}\n  export server function endpoint_POST__2fx() { return 99 }\n  export server function endpoint_POST__2fx_21() { return 98 }\n}\n`,
      "app.scrml": program(`\${\n  import { endpoint_POST__2fx, endpoint_POST__2fx_21, f1 } from "./aaa.scrml"\n  type Op:enum = {\n    Ping\n  }\n  @n = 0\n}\n${EP("/x")}\n<button onclick=\${ @n = endpoint_POST__2fx() + endpoint_POST__2fx_21() + f1() }>go</button>\n<p>\${@n}</p>`),
    });
    if (r.exitCode !== 0) throw new Error(`scrml build failed:\n${r.out}`);
    dist = r.dist;
    base = await startProd(r.dist);
  }, TIMEOUT_MS);

  test("the endpoint records are `_scrml_route_endpoint_…`, and `_server.js` imports them", () => {
    const entry = readFileSync(join(dist, "_server.js"), "utf8");
    expect(entry).toContain("_scrml_route_endpoint_POST__2fx");
    expect(entry).toContain("_scrml_route_endpoint_preflight__2fx");
    expect(entry).not.toContain("__ri_route_endpoint_POST__2fx,");
  });

  test("POST /x is served by the endpoint", async () => {
    const res = await post(base, "/x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pong: "POST /x" });
  }, TIMEOUT_MS);

  test("the server functions are still served (their routes keep `__ri_route_…`)", () => {
    const entry = readFileSync(join(dist, "_server.js"), "utf8");
    expect(entry).toMatch(/__ri_route_endpoint_POST__2fx_\d+/);
    expect(entry).toMatch(/__ri_route_endpoint_POST__2fx_21_\d+/);
  });
});

describe("F2 — two modules exporting one route name for different routes → E-CG-006, not first-wins", () => {
  const unit = (name, path, method) =>
    `export const ${name} = {\n  path: ${JSON.stringify(path)},\n  method: ${JSON.stringify(method)},\n  handler: async () => new Response("x"),\n};\n`;

  test("generateServerEntry refuses, naming both modules and both routes", () => {
    const a = describeServerUnit(unit("__ri_route_f_1", "/_scrml/__ri_route_f_1", "POST"), "a.server.js");
    const b = describeServerUnit(unit("__ri_route_f_1", "/elsewhere", "GET"), "b.server.js");
    let err = null;
    try { generateServerEntry([a, b]); } catch (e) { err = e; }
    expect(err).not.toBeNull();
    expect(err.scrmlCode).toBe("E-CG-006");
    expect(err.message).toContain("`__ri_route_f_1`");
    expect(err.message).toContain('`a.server.js` (POST "/_scrml/__ri_route_f_1")');
    expect(err.message).toContain('`b.server.js` (GET "/elsewhere")');
  });

  test("one name for the SAME route in two modules is still imported once (F-BUILD-002: _scrml_session_destroy)", () => {
    const a = describeServerUnit(unit("_scrml_session_destroy", "/_scrml/session/destroy", "POST"), "a.server.js");
    const b = describeServerUnit(unit("_scrml_session_destroy", "/_scrml/session/destroy", "POST"), "b.server.js");
    const entry = generateServerEntry([a, b]);
    expect(entry.match(/_scrml_session_destroy/g).length).toBeGreaterThan(0);
    expect(entry).toMatch(/import \{ _scrml_session_destroy \} from "\.\/a\.server\.js";/);
    expect(entry).not.toMatch(/from "\.\/b\.server\.js"/);
  });

  test("INTERIM: the per-page SSR compose route `_scrml_route___ssr` keeps first-importer (g-compose-route-export-name-collision-mounts-one-page)", () => {
    const a = describeServerUnit(unit("_scrml_route___ssr", "/about", "GET"), "about.server.js");
    const b = describeServerUnit(unit("_scrml_route___ssr", "/app", "GET"), "app.server.js");
    expect(() => generateServerEntry([a, b])).not.toThrow();
  });

  test("scrml build refuses before writing when a .server.js already in the output dir conflicts", () => {
    // A module in dist/ that this build does not write is imported by `_server.js` too
    // (an earlier build's, or one placed there): its route name `__ri_route_ping_1`
    // names another route than this build's `ping` function.
    const src = writeApp("stale", {
      "app.scrml": program(`\${\n  server function ping() { return 1 }\n  @n = 0\n}\n<button onclick=\${ @n = ping() }>go</button>\n<p>\${@n}</p>`),
    });
    const dist = join(root, "stale", "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, "aaa-old.server.js"), unit("__ri_route_ping_1", "/hijack", "GET"));
    const r = Bun.spawnSync(["bun", CLI, "build", src, "-o", dist], { stdout: "pipe", stderr: "pipe" });
    const out = r.stdout.toString() + r.stderr.toString();
    expect(r.exitCode).not.toBe(0);
    expect(out).toContain("E-CG-006");
    expect(out).toContain("`__ri_route_ping_1`");
    expect(existsSync(join(dist, "_server.js"))).toBe(false);
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// F3 — a file another file of the build imports is not an entry
// ---------------------------------------------------------------------------

describe("F3 — an imported module's own top-level <program> does not mount endpoints (§61.2)", () => {
  test("review importedProg: lib.scrml (imported by app.scrml) declares <program> + <endpoint> → refused", () => {
    const r = build("importedProg", {
      "app.scrml": `<program>\n\${\n  import { helper } from "./lib.scrml"\n  type Op:enum = {\n    Ping\n  }\n}\n${EP("/a")}\n<p>\${helper()}</p>\n</program>\n`,
      "lib.scrml": `<program>\n\${\n  type Op2:enum = {\n    Ping\n  }\n  export function helper() { return 1 }\n}\n${EP("/m", "POST", "", "Op2")}\n</program>\n`,
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.out).toContain("E-STRUCTURAL-ELEMENT-MISPLACED");
    expect(r.out).toContain("`lib.scrml`, which is not the program's entry file (another file of the build imports it)");
    expect(r.out).not.toMatch(/app\.scrml:\d+:\d+ E-STRUCTURAL-ELEMENT-MISPLACED/);
    expect(existsSync(join(r.dist, "_server.js"))).toBe(false);
  }, TIMEOUT_MS);

  test("a module re-exported from (export … from) is not an entry either", () => {
    const r = build("reexported", {
      "app.scrml": `<program>\n\${\n  import { helper } from "./mid.scrml"\n  type Op:enum = {\n    Ping\n  }\n}\n${EP("/a")}\n<p>\${helper()}</p>\n</program>\n`,
      "mid.scrml": `\${\n  export { helper } from "./lib.scrml"\n}\n`,
      "lib.scrml": `<program>\n\${\n  type Op2:enum = {\n    Ping\n  }\n  export function helper() { return 1 }\n}\n${EP("/m", "POST", "", "Op2")}\n</program>\n`,
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.out).toContain("`lib.scrml`, which is not the program's entry file (another file of the build imports it)");
  }, TIMEOUT_MS);

  test("the importing entry itself is placed, and served", async () => {
    const r = build("importer-ok", {
      "app.scrml": `<program>\n\${\n  import { helper } from "./lib.scrml"\n  type Op:enum = {\n    Ping\n  }\n}\n${EP("/a")}\n<p>\${helper()}</p>\n</program>\n`,
      "lib.scrml": `\${\n  export function helper() { return 1 }\n}\n`,
    });
    expect(r.exitCode).toBe(0);
    const base = await startProd(r.dist);
    const res = await post(base, "/a");
    expect(res.status).toBe(200);
  }, TIMEOUT_MS);

  test("two top-level <program> files that do not import each other stay accepted (INTERIM, g-impl1-endpoint-entry-ambiguous-app-s480)", () => {
    const r = build("subdirProg", {
      "app.scrml": program(`${TY()}\n${EP("/a")}`),
      "sub/x.scrml": program(`${TY()}\n${EP("/m")}`),
    });
    expect(r.out).not.toContain("E-STRUCTURAL-ELEMENT-MISPLACED");
    expect(r.exitCode).toBe(0);
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// PA decision S480 — a silent entry counts as the default Max-Age
// ---------------------------------------------------------------------------

describe("Access-Control-Max-Age across entries that mount endpoints", () => {
  async function maxAgeOf(name, aAttrs, bAttrs) {
    const r = build(name, {
      "a.scrml": program(`${TY()}\n${EP("/a", "POST", ` cors="${A}"`)}`, aAttrs),
      "b.scrml": program(`${TY()}\n${EP("/b", "POST", ` cors="${A}"`)}`, bAttrs),
    });
    if (r.exitCode !== 0) throw new Error(`scrml build failed:\n${r.out}`);
    const base = await startProd(r.dist);
    const res = await fetch(base + "/a", { method: "OPTIONS", headers: { Origin: A, "Access-Control-Request-Method": "POST" } });
    expect(res.status).toBe(204);
    return res.headers.get("Access-Control-Max-Age");
  }

  test("600 in one entry, none in the other → the default (86400), not 600", async () => {
    expect(await maxAgeOf("ma-600-silent", ' cors-max-age="600"', "")).toBe("86400");
  }, TIMEOUT_MS);

  test("none in the first entry, 600 in the second → the default too (order-independent)", async () => {
    expect(await maxAgeOf("ma-silent-600", "", ' cors-max-age="600"')).toBe("86400");
  }, TIMEOUT_MS);

  test("600 in both → 600; 600 and 0600 agree (compared as seconds)", async () => {
    expect(await maxAgeOf("ma-600-600", ' cors-max-age="600"', ' cors-max-age="0600"')).toBe("600");
  }, TIMEOUT_MS);
});
