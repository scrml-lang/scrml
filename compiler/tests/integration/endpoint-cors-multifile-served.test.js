// ---------------------------------------------------------------------------
// <endpoint> CORS scoping across FILES — the app-scope endpoint table
// (#1981 review HIGH-1 / MED-1 / LOW-1 / LOW-2).
// ---------------------------------------------------------------------------
//
// Ruling: user-voice-scrml.md "⭐ RULED — program `cors=` does not cover
// `<endpoint>` routes; per-endpoint `cors=` (S479, 2026-11-18)". §39.2.1: "`cors=`
// covers every route except `<endpoint>` routes: a preflight (`OPTIONS`) to a path
// an `<endpoint>` is mounted at, and the responses of an `<endpoint>`, are governed
// by that endpoint's own `cors=` (§61.7), never by the program's."
//
// HIGH-1: the exclusion was per MODULE. `scrml build` / `scrml dev` mount ONE
// request onion for the app (from the `<program cors=>` module) in front of every
// module's routes, so `<program cors="*">` in app.scrml + `<endpoint>` in api.scrml
// answered a cross-origin preflight 204 `ACAO *` and stamped `*` over a
// per-endpoint `cors=` in another file. MED-1: two files serving one path each
// emitted their own preflight record (the first one won, answering 405 for the
// second file's method).
//
// Every app here is built with the real `scrml build` CLI and served by the REAL
// `_server.js` it emits (and by the real `scrml dev` app child), over HTTP, with a
// foreign `Origin`.
//
// S480 (§61.2, ruling:user-voice-scrml.md-S480-four-recs item 1): "An `<endpoint>`
// declaration SHALL be a direct child of the top-level `<program>` (the entry file's
// `<program>`, §40.8)." The original HIGH-1 / MED-1 shape — an `<endpoint>` in a
// module file with no `<program>` — is now refused at compile time (asserted
// below). The app-scope table still matters where a build holds two top-level
// `<program>`s in different files (impl#1 accepts each as an entry and serves both
// from one `_server.js`), so the cases below keep their coverage in that shape: the
// endpoint file is its own `<program>`.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import { join, resolve, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { compileScrml } from "../../src/api.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(testDir, "../../src/cli.js");
const TIMEOUT_MS = 60_000;
const EVIL = "https://evil.example";
const A = "https://a.example";

const PROGRAM_STAR = `<program cors="*">
\${
  server function hello() {
    return "hi"
  }
}
<button onclick=hello()>hi</button>
</program>
`;

const apiBody = (endpointAttrs) => `\${
  type Op:enum = {
    Ping
    Echo(say: string)
  }
}
<endpoint path="/op" method="POST" accepts=Op${endpointAttrs}>
  <Ping : { pong: true }>
  <Echo(say) : { said: say }>
</endpoint>
`;
const apiFile = (endpointAttrs) => `<program>\n${apiBody(endpointAttrs)}</program>\n`;

// MED-1: POST /op in app.scrml (no cors=), PUT /op in zapi.scrml with cors=.
const TWOFILE_APP = `<program>
\${
  type Op:enum = {
    Ping
  }
}
<endpoint path="/op" method="POST" accepts=Op>
  <Ping : { pong: true }>
</endpoint>
<p>hi</p>
</program>
`;
const TWOFILE_ZAPI = `<program>
\${
  type Op2:enum = {
    Ping
  }
}
<endpoint path="/op" method="PUT" accepts=Op2 cors="${A}">
  <Ping : { pong: true }>
</endpoint>
</program>
`;

let root;
const procs = [];

/** Build and return the CLI's exit code and output (no throw). */
function tryBuild(name, files) {
  const src = join(root, name, "src");
  const dist = join(root, name, "dist");
  mkdirSync(src, { recursive: true });
  for (const [f, text] of Object.entries(files)) writeFileSync(join(src, f), text);
  const r = Bun.spawnSync(["bun", CLI, "build", src, "-o", dist], { stdout: "pipe", stderr: "pipe" });
  return { exitCode: r.exitCode, out: r.stdout.toString() + r.stderr.toString(), dist };
}

function build(name, files) {
  const src = join(root, name, "src");
  const dist = join(root, name, "dist");
  mkdirSync(src, { recursive: true });
  for (const [f, text] of Object.entries(files)) writeFileSync(join(src, f), text);
  const r = Bun.spawnSync(["bun", CLI, "build", src, "-o", dist], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`scrml build failed:\n${r.stdout}\n${r.stderr}`);
  return dist;
}

async function freePort() {
  const s = Bun.serve({ port: 0, fetch: () => undefined });
  const port = s.port;
  s.stop(true);
  return port;
}

async function waitForOutput(proc, re, label) {
  let out = "";
  const pump = async (stream) => { for await (const c of stream) out += new TextDecoder().decode(c); };
  pump(proc.stdout);
  pump(proc.stderr);
  const t0 = Date.now();
  while (Date.now() - t0 < 25_000) {
    const m = re.exec(out);
    if (m) return m;
    await Bun.sleep(25);
  }
  throw new Error(`${label} did not come up:\n${out}`);
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
  await waitForOutput(proc, /scrml server listening/, "_server.js");
  return `http://127.0.0.1:${port}`;
}

/** The `scrml dev` APP child — `loadServerRoutes` + `devDispatch`, the process that answers under `scrml dev`. */
async function startDev(dist) {
  const cfgPath = join(dist, "..", `dev-child-${Date.now()}.json`);
  writeFileSync(cfgPath, JSON.stringify({ serveDir: dist, opts: { inputFiles: [], port: 0 } }));
  const proc = Bun.spawn(["bun", CLI, "dev", "--__dev-child", cfgPath], { stdout: "pipe", stderr: "pipe" });
  procs.push(proc);
  const m = await waitForOutput(proc, /__SCRML_DEV_CHILD_READY__ (\d+)/, "scrml dev child");
  return `http://127.0.0.1:${m[1]}`;
}

function preflight(base, method, origin) {
  return fetch(base + "/op", {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": "content-type" },
  });
}

function call(base, method, origin, body = '{"tag":"Ping"}') {
  return fetch(base + "/op", { method, headers: { Origin: origin, "Content-Type": "application/json" }, body });
}

const hosts = {};

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "endpoint-cors-multifile-"));
  const starDist = build("star", { "app.scrml": PROGRAM_STAR, "api.scrml": apiFile("") });
  const starADist = build("star-a", { "app.scrml": PROGRAM_STAR, "api.scrml": apiFile(` cors="${A}"`) });
  const twoDist = build("twofile", { "app.scrml": TWOFILE_APP, "zapi.scrml": TWOFILE_ZAPI });
  hosts.star = { build: await startProd(starDist), dev: await startDev(starDist) };
  hosts.starA = { build: await startProd(starADist), dev: await startDev(starADist) };
  hosts.two = { build: await startProd(twoDist), dev: await startDev(twoDist) };
}, 120_000);

afterAll(async () => {
  for (const p of procs) { try { p.kill(); } catch { /* gone */ } }
  for (const p of procs) { try { await p.exited; } catch { /* ignore */ } }
  if (root) rmSync(root, { recursive: true, force: true });
});

for (const host of ["build", "dev"]) {
  describe(`HIGH-1 [${host}] — <program cors="*"> in app.scrml, <endpoint> in api.scrml's <program>`, () => {
    test("a cross-origin preflight to the endpoint is 405 + Allow, no Access-Control-* header", async () => {
      const res = await preflight(hosts.star[host], "POST", EVIL);
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }, TIMEOUT_MS);

    test("the endpoint's response carries no program CORS header", async () => {
      const res = await call(hosts.star[host], "POST", EVIL);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ pong: true });
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }, TIMEOUT_MS);

    test("a non-endpoint path keeps the program's preflight answer (204, ACAO *)", async () => {
      const res = await fetch(hosts.star[host] + "/elsewhere", {
        method: "OPTIONS",
        headers: { Origin: EVIL, "Access-Control-Request-Method": "POST" },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }, TIMEOUT_MS);
  });

  describe(`HIGH-1 [${host}] — per-endpoint cors="${A}" in api.scrml beside <program cors="*">`, () => {
    test("the preflight answers with the endpoint's origin, never *", async () => {
      const res = await preflight(hosts.starA[host], "POST", A);
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(A);
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
    }, TIMEOUT_MS);

    test("the endpoint's responses carry its origin, never *", async () => {
      const ok = await call(hosts.starA[host], "POST", A);
      expect(ok.status).toBe(200);
      expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(A);
      const bad = await call(hosts.starA[host], "POST", A, '{"tag":"Ping","extra":1}');
      expect(bad.status).toBe(400);
      expect(bad.headers.get("Access-Control-Allow-Origin")).toBe(A);
    }, TIMEOUT_MS);
  });

  describe(`MED-1 [${host}] — /op POST in app.scrml, /op PUT cors="${A}" in zapi.scrml`, () => {
    test("a preflight for PUT from the endpoint's origin is 204 with that origin", async () => {
      const res = await preflight(hosts.two[host], "PUT", A);
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(A);
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe("PUT");
    }, TIMEOUT_MS);

    test("a preflight for POST (no cors= on that endpoint) is 405, Allow lists every method at the path", async () => {
      const res = await preflight(hosts.two[host], "POST", A);
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST, PUT");
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }, TIMEOUT_MS);

    test("both endpoints serve their method; only the PUT one sends CORS headers", async () => {
      const put = await call(hosts.two[host], "PUT", A);
      expect(put.status).toBe(200);
      expect(put.headers.get("Access-Control-Allow-Origin")).toBe(A);
      const post = await call(hosts.two[host], "POST", A);
      expect(post.status).toBe(200);
      expect(post.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }, TIMEOUT_MS);
  });
}

describe("§61.2 (S480) — the pre-S480 HIGH-1 shape is refused at compile time", () => {
  test("an <endpoint> in a module file with no <program> beside <program cors=\"*\"> → E-STRUCTURAL-ELEMENT-MISPLACED", () => {
    const r = tryBuild("star-module", { "app.scrml": PROGRAM_STAR, "api.scrml": apiBody("") });
    expect(r.exitCode).not.toBe(0);
    expect(r.out).toContain("E-STRUCTURAL-ELEMENT-MISPLACED");
    expect(r.out).toContain("api.scrml");
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// LOW-1 — the endpoint CORS helpers emit no literal `undefined`, so a program with
// an `<endpoint>` reports no W-CG-UNDEFINED-INTERPOLATION (it reported 3, with
// bogus line numbers).
// LOW-2 — §61.7: "An `<endpoint>` MAY carry `cors=`, a string literal with the
// values of the §39.2.1 program attribute (`"*"`, or one origin such as
// `"https://example.com"`)." Anything else is E-ENDPOINT-CORS-INVALID.
// ---------------------------------------------------------------------------

function compileOne(name, src) {
  const dir = join(root, "compile", name);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "app.scrml");
  writeFileSync(file, src);
  return compileScrml({ inputFiles: [file], write: false, outputDir: join(dir, "out") });
}

const endpointProgram = (attrs) => `<program>
\${
  type Op:enum = {
    Ping
  }
}
<endpoint path="/op" method="POST" accepts=Op${attrs}>
  <Ping : { pong: true }>
</endpoint>
</program>
`;

const codesOf = (r) => [...(r.errors ?? []), ...(r.warnings ?? [])].map((d) => d.code);

describe("LOW-1 — no W-CG-UNDEFINED-INTERPOLATION from the endpoint CORS helpers", () => {
  for (const [label, attrs] of [["no cors=", ""], ["cors=", ` cors="${A}"`]]) {
    test(`an <endpoint> with ${label} reports none`, () => {
      const r = compileOne(`low1-${label.replace(/\W/g, "")}`, endpointProgram(attrs));
      expect(codesOf(r).filter((c) => c === "W-CG-UNDEFINED-INTERPOLATION")).toEqual([]);
    });
  }
});

describe("LOW-2 — E-ENDPOINT-CORS-INVALID", () => {
  const bad = [
    ["unquoted *", " cors=*"],
    ["empty string", ' cors=""'],
    ["a newline in the value", ' cors="https://a.example\nb"'],
    ["a path after the origin", ' cors="https://a.example/x"'],
    ["no scheme", ' cors="a.example"'],
    ["a trailing slash", ' cors="https://a.example/"'],
    ["the null origin", ' cors="null"'],
    ["a list of origins", ' cors="https://a.example https://b.example"'],
    // S480 (#1981 review r1 NIT) — values no browser sends in `Origin` (RFC 6454 §6.2 /
    // the WHATWG origin serialization: lowercase, no default port, a port <= 65535).
    ["an uppercase scheme", ' cors="HTTPS://a.example"'],
    ["an uppercase host", ' cors="https://A.Example"'],
    ["the https default port", ' cors="https://a.example:443"'],
    ["the http default port", ' cors="http://a.example:80"'],
    ["a port above 65535", ' cors="https://a.example:65536"'],
    ["a port with a leading zero", ' cors="https://a.example:0443"'],
    ["an empty host label", ' cors="https://a..b"'],
    ["a leading dot in the host", ' cors="https://.a.example"'],
    ["an uppercase IPv6 literal", ' cors="http://[::ABCD]:8080"'],
    ["a non-canonical IPv6 literal", ' cors="http://[0:0:0:0:0:0:0:1]"'],
    ["a non-canonical IPv4 host", ' cors="http://127.1"'],
    // S480 (#1981 review r1 NIT) — §61.2 `cors-attr?`: at most one `cors=`. The second
    // was read first-wins, silently.
    ["two cors= attributes", ` cors="*" cors="${A}"`],
    ["two equal cors= attributes", ` cors="${A}" cors="${A}"`],
  ];
  for (const [label, attrs] of bad) {
    test(`${label} → E-ENDPOINT-CORS-INVALID`, () => {
      const r = compileOne(`low2-bad-${label.replace(/\W/g, "")}`, endpointProgram(attrs));
      expect((r.errors ?? []).map((e) => e.code)).toContain("E-ENDPOINT-CORS-INVALID");
    });
  }
  const good = [
    ["*", ' cors="*"'],
    ["an https origin", ` cors="${A}"`],
    ["an origin with a port", ' cors="http://localhost:3000"'],
    ["a bracketed IPv6 origin", ' cors="http://[::1]:8080"'],
    ["a non-default https port", ' cors="https://a.example:8443"'],
    ["an IPv4 origin", ' cors="http://127.0.0.1:3000"'],
    ["a hyphenated host", ' cors="https://my-app.example"'],
    ["a non-special scheme (an extension origin)", ' cors="chrome-extension://abcdefghijklmnop"'],
    ["no cors=", ""],
  ];
  for (const [label, attrs] of good) {
    test(`${label} → no E-ENDPOINT-CORS-INVALID`, () => {
      const r = compileOne(`low2-good-${label.replace(/\W/g, "")}`, endpointProgram(attrs));
      expect(codesOf(r)).not.toContain("E-ENDPOINT-CORS-INVALID");
      expect((r.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && e.severity !== "lint").map((e) => e.code)).toEqual([]);
    });
  }
  test("two cors= → the diagnostic names the repetition, and the endpoint takes no cors=", () => {
    const r = compileOne("low2-twice", endpointProgram(` cors="*" cors="${A}"`));
    const e = (r.errors ?? []).find((d) => d.code === "E-ENDPOINT-CORS-INVALID");
    expect(e?.message).toContain("written 2 times");
  });
  test("a cors= written inside another attribute's string is not counted", () => {
    const r = compileOne("low2-instring", `<program>
\${
  type Op:enum = {
    Ping
  }
}
<endpoint path="/op" method="POST" accepts=Op title="x cors=y" cors="${A}">
  <Ping : { pong: true }>
</endpoint>
</program>
`);
    expect(codesOf(r)).not.toContain("E-ENDPOINT-CORS-INVALID");
  });
  test("cors-max-age= on the <endpoint> opener is not read as cors=", () => {
    const r = compileOne("low2-maxage", endpointProgram(' cors-max-age="60"'));
    expect(codesOf(r)).not.toContain("E-ENDPOINT-CORS-INVALID");
  });
});
