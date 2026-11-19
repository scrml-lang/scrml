// ---------------------------------------------------------------------------
// <endpoint> placement (§61.2) and one handler per route (§61.7), built in impl#1 —
// ruling:user-voice-scrml.md-S480-four-recs item 1: "impl#1 builds the §61.2
// placement and §61.7 duplicate-route refusals under carve-out 1 (endpoint 415 /
// strict keys). An `<endpoint>` that is not a direct child of the entry file's
// top-level `<program>` is E-STRUCTURAL-ELEMENT-MISPLACED; a duplicate path+method
// is E-ENDPOINT-ROUTE-DUPLICATE (the bootstrap already builds both)."
// ---------------------------------------------------------------------------
//
// SPEC §61.2: "An `<endpoint>` declaration SHALL be a direct child of the top-level
// `<program>` (the entry file's `<program>`, §40.8). An `<endpoint>` anywhere else —
// inside a `<page>`, a `<channel>`, a nested `<program>`, an element, a `${ … }`
// logic block, outside any `<program>`, or in a file that is not the program's
// entry — is `E-STRUCTURAL-ELEMENT-MISPLACED` (§4.15)."
// SPEC §61.7: "Two `<endpoint>` declarations of one program with the same `path=`
// and the same `method=` are `E-ENDPOINT-ROUTE-DUPLICATE` (§61.9), reported at the
// second. One `path=` with two different `method=`s is two routes."
//
// Also: the route record's export name was the endpoint's per-FILE AST node id, so
// two files' endpoints exported one name and `_server.js` (first importer wins by
// name) silently dropped one (g-impl1-endpoint-route-name-collides-across-files-s480);
// and the endpoint preflight's Access-Control-Max-Age came from the first file in
// compilation order that declared `cors-max-age=` (#1981 review r1 LOW).
//
// Every multi-file app is built with the real `scrml build` CLI; the served cases
// run the REAL `_server.js` it emits, over HTTP.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, existsSync } from "fs";
import { join, resolve, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { compileScrml } from "../../src/api.js";

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

function build(name, files) {
  const src = writeApp(name, files);
  const dist = join(root, name, "dist");
  const r = Bun.spawnSync(["bun", CLI, "build", src, "-o", dist], { stdout: "pipe", stderr: "pipe" });
  return { exitCode: r.exitCode, out: r.stdout.toString() + r.stderr.toString(), dist };
}

async function freePort() {
  const s = Bun.serve({ port: 0, fetch: () => undefined });
  const port = s.port;
  s.stop(true);
  return port;
}

/** The production server: the shipped `_server.js`, run the way an adopter runs it. */
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
  root = mkdtempSync(join(tmpdir(), "endpoint-program-rules-"));
});

afterAll(async () => {
  for (const p of procs) { try { p.kill(); } catch { /* gone */ } }
  for (const p of procs) { try { await p.exited; } catch { /* ignore */ } }
  if (root) rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// §61.7 — one handler per path and method
// ---------------------------------------------------------------------------

describe("§61.7 E-ENDPOINT-ROUTE-DUPLICATE", () => {
  test("two files of one build at one path and method → refused at compile time, no _server.js", () => {
    const r = build("dup-across", {
      "app.scrml": program(`${TY()}\n${EP("/op")}`),
      "b.scrml": program(`${TY()}\n${EP("/op")}`),
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.out).toContain("E-ENDPOINT-ROUTE-DUPLICATE");
    expect(r.out).toContain('a second `<endpoint path="/op" method="POST">`');
    // Reported at the second (file order), naming the first.
    expect(r.out).toMatch(/b\.scrml:\d+:\d+ E-ENDPOINT-ROUTE-DUPLICATE/);
    expect(r.out).toMatch(/the first is at app\.scrml:\d+:\d+/);
    expect(existsSync(join(r.dist, "_server.js"))).toBe(false);
  }, TIMEOUT_MS);

  test("two endpoints in one file at one path and method → refused once, at the second", () => {
    const r = build("dup-within", { "app.scrml": program(`${TY()}\n${EP("/op")}\n${EP("/op")}`) });
    expect(r.exitCode).not.toBe(0);
    expect(r.out.match(/E-ENDPOINT-ROUTE-DUPLICATE:/g)?.length).toBe(1);
  }, TIMEOUT_MS);

  test("one path with two methods is two routes — accepted, both served", async () => {
    const r = build("two-methods", { "app.scrml": program(`${TY()}\n${EP("/op")}\n${EP("/op", "PUT")}`) });
    expect(r.out).not.toContain("E-ENDPOINT-ROUTE-DUPLICATE");
    expect(r.exitCode).toBe(0);
    const base = await startProd(r.dist);
    const a = await post(base, "/op");
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual({ pong: "POST /op" });
    const b = await fetch(base + "/op", { method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"tag":"Ping"}' });
    expect(b.status).toBe(200);
    expect(await b.json()).toEqual({ pong: "PUT /op" });
  }, TIMEOUT_MS);

  test("a program without <endpoint> is untouched by the rule", () => {
    const r = compileScrml({ inputFiles: [join(writeApp("no-ep", { "app.scrml": program("<p>x</p>") }), "app.scrml")], write: false });
    expect((r.errors ?? []).map((e) => e.code)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §61.2 — placement
// ---------------------------------------------------------------------------

describe("§61.2 E-STRUCTURAL-ELEMENT-MISPLACED", () => {
  const cases = [
    ["inside a <page>", { "app.scrml": `<program>\n${TY()}\n<page>\n${EP("/op")}\n</page>\n</program>\n` }, "inside a `<page>`"],
    ["inside a <channel>", { "app.scrml": program(`${TY()}\n<channel name="c">\n${EP("/op")}\n</channel>`) }, "inside a `<channel>`"],
    ["inside a nested <program>", { "app.scrml": program(`${TY()}\n<program name="w">\n${EP("/op")}\n</program>`) }, "inside a nested `<program>`"],
    ["inside an element", { "app.scrml": program(`${TY()}\n<div>\n${EP("/op")}\n</div>`) }, "inside `<div>`"],
    ["inside a ${ } logic block", { "app.scrml": program(`\${\n  type Op:enum = {\n    Ping\n  }\n  ${EP("/op")}\n}`) }, "logic body"],
    ["outside any <program>", { "app.scrml": `${TY()}\n${EP("/op")}\n<program>\n<p>x</p>\n</program>\n` }, "outside a `<program>`"],
    ["in a module file with no <program>", { "app.scrml": program("<p>x</p>"), "api.scrml": `${TY()}\n${EP("/op")}\n` }, "outside a `<program>`"],
    ["in a route file's <program> (pages/)", { "app.scrml": program("<p>x</p>"), "pages/x.scrml": program(`${TY()}\n${EP("/op")}`) }, "which is not the program's entry file"],
  ];
  for (const [label, files, why] of cases) {
    test(`an <endpoint> ${label} → refused at compile time`, () => {
      const r = build(`misplaced-${label.replace(/\W+/g, "-")}`, files);
      expect(r.exitCode).not.toBe(0);
      expect(r.out).toContain("E-STRUCTURAL-ELEMENT-MISPLACED");
      expect(r.out).toContain(why);
      expect(existsSync(join(r.dist, "_server.js"))).toBe(false);
    }, TIMEOUT_MS);
  }

  test("a direct child of a <div>-wrapped top-level <program> is placed (§4.12: wrappers do not change a program's role)", () => {
    const r = build("wrapped", { "app.scrml": `<div>\n${program(`${TY()}\n${EP("/op")}`)}</div>\n` });
    expect(r.out).not.toContain("E-STRUCTURAL-ELEMENT-MISPLACED");
    expect(r.exitCode).toBe(0);
  }, TIMEOUT_MS);

  test("the entry file with a pages/ route file beside it is placed, and served", async () => {
    const r = build("entry-with-pages", {
      "app.scrml": program(`${TY()}\n${EP("/op")}`),
      "pages/about.scrml": "<page>\n<p>about</p>\n</page>\n",
    });
    expect(r.out).not.toContain("E-STRUCTURAL-ELEMENT-MISPLACED");
    expect(r.exitCode).toBe(0);
    const base = await startProd(r.dist);
    const res = await post(base, "/op");
    expect(res.status).toBe(200);
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// g-impl1-endpoint-route-name-collides-across-files-s480 — the route record is
// named by method and path, so two files' endpoints both mount.
// ---------------------------------------------------------------------------

describe("route-record names are app-unique (g-impl1-endpoint-route-name-collides-across-files-s480)", () => {
  let base;
  beforeAll(async () => {
    // Same source shape → the same per-file node id for each endpoint (the collision).
    const r = build("idcoll", {
      "a.scrml": program(`${TY()}\n${EP("/a")}`),
      "b.scrml": program(`${TY()}\n${EP("/b")}`),
    });
    if (r.exitCode !== 0) throw new Error(`scrml build failed:\n${r.out}`);
    base = await startProd(r.dist);
  }, TIMEOUT_MS);

  test("/a is served", async () => {
    const res = await post(base, "/a");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pong: "POST /a" });
  }, TIMEOUT_MS);

  test("/b is served (it was dropped: both modules exported one per-file node-id route name)", async () => {
    const res = await post(base, "/b");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pong: "POST /b" });
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// #1981 review r1 LOW — Access-Control-Max-Age from the entry <program>
// ---------------------------------------------------------------------------

describe("endpoint preflight Access-Control-Max-Age comes from the program that declares the endpoint", () => {
  let base;
  beforeAll(async () => {
    // `aaa.scrml` sorts first and declares its own cors-max-age; the endpoint's
    // program (app.scrml) declares 600. The answer was the first file's 5.
    const r = build("maxage", {
      "aaa.scrml": program("<p>a</p>", ' cors-max-age="5"'),
      "app.scrml": program(`${TY()}\n${EP("/op", "POST", ` cors="${A}"`)}`, ' cors-max-age="600"'),
    });
    if (r.exitCode !== 0) throw new Error(`scrml build failed:\n${r.out}`);
    base = await startProd(r.dist);
  }, TIMEOUT_MS);

  test("the preflight answers Max-Age 600, not the first file's 5", async () => {
    const res = await fetch(base + "/op", {
      method: "OPTIONS",
      headers: { Origin: A, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(A);
    expect(res.headers.get("Access-Control-Max-Age")).toBe("600");
  }, TIMEOUT_MS);
});

describe("Access-Control-Max-Age in a single-entry app", () => {
  test("the entry <program>'s cors-max-age is the preflight's Max-Age", async () => {
    const r = build("maxage-entry", {
      "app.scrml": program(`${TY()}\n${EP("/op", "POST", ` cors="${A}"`)}`, ' cors-max-age="321"'),
      "pages/about.scrml": "<page>\n<p>about</p>\n</page>\n",
    });
    expect(r.exitCode).toBe(0);
    const base = await startProd(r.dist);
    const res = await fetch(base + "/op", { method: "OPTIONS", headers: { Origin: A, "Access-Control-Request-Method": "POST" } });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Max-Age")).toBe("321");
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// #1981 review r1 NIT — a repeated cors= is refused (it was read first-wins)
// ---------------------------------------------------------------------------

describe("a repeated cors= on one <endpoint>", () => {
  test("→ E-ENDPOINT-CORS-INVALID at compile time, no _server.js", () => {
    const r = build("cors-twice", { "app.scrml": program(`${TY()}\n${EP("/op", "POST", ` cors="*" cors="${A}"`)}`) });
    expect(r.exitCode).not.toBe(0);
    expect(r.out).toContain("E-ENDPOINT-CORS-INVALID");
    expect(r.out).toContain("written 2 times");
    expect(existsSync(join(r.dist, "_server.js"))).toBe(false);
  }, TIMEOUT_MS);

  test("an origin a browser can never send → E-ENDPOINT-CORS-INVALID at compile time", () => {
    const r = build("cors-default-port", { "app.scrml": program(`${TY()}\n${EP("/op", "POST", ' cors="https://a.example:443"')}`) });
    expect(r.exitCode).not.toBe(0);
    expect(r.out).toContain("E-ENDPOINT-CORS-INVALID");
  }, TIMEOUT_MS);
});
