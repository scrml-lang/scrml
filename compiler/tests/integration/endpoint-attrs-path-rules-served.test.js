// ---------------------------------------------------------------------------
// <endpoint> opener attributes and `path=` rules — #1998 review r1.
// ---------------------------------------------------------------------------
//
// F1 (HIGH, regression + pre-existing class): the opener was read by regexes over the
// header text. `cors=` was COUNTED on the header with every quoted string emptied but
// READ from the raw header, so a `cors='…'` written inside another attribute's string
// (`note="see cors='https://evil.example, https://x.example'"`) counted 0 (no check)
// and its unchecked inner value was emitted as the endpoint's
// Access-Control-Allow-Origin; a newline in it made every response 500. A VALID value
// smuggled the same way (`note="todo: cors='*' once auth lands"`) opened CORS, and
// `\bpath\s*=` read `data-path=` as `path=`. The opener is now read by the markup
// attribute tokenizer (ast-builder.js `readEndpointOpenerAttrs`), the reader of every
// markup opener: an attribute is a name followed by `=` and a value token.
//
// The `path=` rules (ruling:user-voice-scrml.md-S480-1998-recs item 1, building
// g-impl1-endpoint-path-rules-s479). SPEC §61.7: "A `path=` that is `/_scrml`,
// `/_scrml_ws` or `/_scrml_local`, or begins with `/_scrml/`, `/_scrml_ws/` or
// `/_scrml_local/`, is `E-ENDPOINT-ROUTE-DUPLICATE` (§61.9)." and "A `path=` outside
// this grammar is `E-ENDPOINT-PATH-INVALID` (§61.9), reported at the `<endpoint>`
// opener." — the same refusals and messages as the bootstrap
// (compiler/self-host-v2/analyze.scrml `endpointReservedWhy` / `endpointPathRefusal`).
//
// The origin rule's NITs: a `cors=` origin is one a browser sends in `Origin`.
//
// Every served case runs the REAL `_server.js` that `scrml build` emits, over HTTP.

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
const EPO = (opener, value = "pong") =>
  `<endpoint ${opener}>
  <Ping : { pong: "${value}" }>
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

function compileOne(name, text) {
  const src = writeApp(name, { "app.scrml": text });
  const r = compileScrml({ inputFiles: [join(src, "app.scrml")], write: false, log: () => {} });
  return r.errors ?? [];
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
function preflight(base, path, origin = A) {
  return fetch(base + path, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" } });
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "endpoint-attrs-path-rules-"));
});

afterAll(async () => {
  for (const p of procs) { try { p.kill(); } catch { /* gone */ } }
  for (const p of procs) { try { await p.exited; } catch { /* ignore */ } }
  if (root) rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// F1 — text inside another attribute's string is not an attribute
// ---------------------------------------------------------------------------

describe("F1 — a cors= written inside another attribute's string is not the endpoint's cors=", () => {
  let base;
  beforeAll(async () => {
    const r = build("smuggle", {
      "app.scrml": program([
        TY(),
        // review corsbyp2 — an unchecked list value, and one with a newline in it
        EPO(`path="/op" method="POST" accepts=Op note="see cors='https://evil.example, https://x.example'"`, "op"),
        EPO(`path="/q" method="POST" accepts=Op note=" cors='${A}\nX-Injected: 1'"`, "q"),
        // review corsbyp3 — a VALID value smuggled the same way (pre-existing on base)
        EPO(`path="/star" method="POST" accepts=Op note="todo: cors='*' once auth lands"`, "star"),
        // path= smuggled in another attribute: the endpoint's path is the real one
        EPO(`path="/real" method="POST" accepts=Op note="moved from path='/old'"`, "real"),
      ].join("\n")),
    });
    if (r.exitCode !== 0) throw new Error(`scrml build failed:\n${r.out}`);
    base = await startProd(r.dist);
  }, TIMEOUT_MS);

  for (const p of ["/op", "/q", "/star"]) {
    test(`OPTIONS ${p} → 405, no Access-Control-Allow-Origin (the endpoint has no cors=)`, async () => {
      const res = await preflight(base, p, "https://evil.example");
      expect(res.status).toBe(405);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }, TIMEOUT_MS);

    test(`POST ${p} → 200 with no Access-Control-Allow-Origin (it was 500 for /q)`, async () => {
      const res = await fetch(base + p, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
        body: '{"tag":"Ping"}',
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(res.headers.get("X-Injected")).toBeNull();
    }, TIMEOUT_MS);
  }

  test("path= inside another attribute's string is not the path: /real is served, /old is not", async () => {
    const ok = await post(base, "/real");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ pong: "real" });
    const old = await post(base, "/old");
    expect(old.status).not.toBe(200);
  }, TIMEOUT_MS);
});

describe("F1 — attribute names are matched whole", () => {
  test("data-path= is not path= → E-ENDPOINT-PATH-MISSING", () => {
    const codes = compileOne("data-path", program(`${TY()}\n${EPO(`data-path="/x" method="POST" accepts=Op`)}`)).map((e) => e.code);
    expect(codes).toContain("E-ENDPOINT-PATH-MISSING");
  });

  test("a cors= repeated as real attributes is still E-ENDPOINT-CORS-INVALID (\"written 2 times\")", () => {
    const errs = compileOne("cors-twice", program(`${TY()}\n${EPO(`path="/x" method="POST" accepts=Op cors="*" note="a" cors="${A}"`)}`));
    const e = errs.find((x) => x.code === "E-ENDPOINT-CORS-INVALID");
    expect(e).toBeDefined();
    expect(e.message).toContain("written 2 times");
  });

  test("a cors= inside a string next to a real cors= counts once — the real one is judged", () => {
    const errs = compileOne("cors-real", program(`${TY()}\n${EPO(`path="/x" method="POST" accepts=Op note="cors='*'" cors="${A}"`)}`));
    expect(errs.map((x) => x.code)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §61.7 path rules (ruling:user-voice-scrml.md-S480-1998-recs item 1)
// ---------------------------------------------------------------------------

describe("§61.7 reserved prefixes → E-ENDPOINT-ROUTE-DUPLICATE", () => {
  const reserved = ["/_scrml", "/_scrml/x", "/_scrml_ws", "/_scrml_ws/chat", "/_scrml_local", "/_scrml_local/h.js"];
  for (const p of reserved) {
    test(`path="${p}" → refused, naming the compiler's routes`, () => {
      const errs = compileOne(`rsv-${p.replace(/\W+/g, "-")}`, program(`${TY()}\n${EPO(`path="${p}" method="POST" accepts=Op`)}`));
      const e = errs.filter((x) => x.code === "E-ENDPOINT-ROUTE-DUPLICATE");
      expect(e.length).toBe(1);
      expect(e[0].message).toContain("may not mount there (§61.7)");
      // one report per fault: the reserved path is not also E-ENDPOINT-PATH-INVALID
      expect(errs.map((x) => x.code)).not.toContain("E-ENDPOINT-PATH-INVALID");
    });
  }

  test("a path that only starts with the same letters is not reserved (/_scrmlx, /_scrml_wsx)", () => {
    for (const p of ["/_scrmlx", "/_scrml_wsx", "/_scrml_localx"]) {
      const errs = compileOne(`rsv-not-${p.replace(/\W+/g, "-")}`, program(`${TY()}\n${EPO(`path="${p}" method="POST" accepts=Op`)}`));
      expect(errs.map((x) => x.code)).toEqual([]);
    }
  });

  test("the build is refused: no _server.js (it would have shadowed /_scrml/health)", () => {
    const r = build("rsv-build", { "app.scrml": program(`${TY()}\n${EPO(`path="/_scrml/health" method="GET" accepts=Op`)}`) });
    expect(r.exitCode).not.toBe(0);
    expect(r.out).toContain("E-ENDPOINT-ROUTE-DUPLICATE");
    expect(existsSync(join(r.dist, "_server.js"))).toBe(false);
  }, TIMEOUT_MS);
});

describe("§61.7 path= grammar → E-ENDPOINT-PATH-INVALID", () => {
  const bad = [
    ["", "does not begin with `/`"],
    ["op", "does not begin with `/`"],
    ["/a?b=1", "`?` is not a path character"],
    ["/a#f", "`#` is not a path character"],
    ["/a%20b", "`%` is not a path character"],
    ["/users/:id", "`:` is not a path character"],
    ["/a b", "` ` is not a path character"],
    ["/a//b", "an empty segment (`//`)"],
    ["//", "an empty segment (`//`)"],
    ["/a/./b", "a `.` segment"],
    ["/a/..", "a `..` segment"],
    ["/x!", "`!` is not a path character"],
  ];
  for (const [p, why] of bad) {
    test(`path=${JSON.stringify(p)} → refused (${why})`, () => {
      const errs = compileOne(`bad-${Math.random().toString(36).slice(2)}`, program(`${TY()}\n${EPO(`path="${p}" method="POST" accepts=Op`)}`));
      const e = errs.filter((x) => x.code === "E-ENDPOINT-PATH-INVALID");
      expect(e.length).toBe(1);
      expect(e[0].message).toContain(why);
    });
  }

  const good = ["/", "/op", "/a/b", "/a/", "/A-z_0.9~", "/v1/fsp.json", "/a/.well-known"];
  for (const p of good) {
    test(`path=${JSON.stringify(p)} → accepted`, () => {
      const errs = compileOne(`good-${Math.random().toString(36).slice(2)}`, program(`${TY()}\n${EPO(`path="${p}" method="POST" accepts=Op`)}`));
      expect(errs.map((x) => x.code)).toEqual([]);
    });
  }

  test("matching is exact on the pathname: /op/ and /op are two routes, the query is ignored", async () => {
    const r = build("exact", {
      "app.scrml": program(`${TY()}\n${EPO(`path="/op" method="POST" accepts=Op`, "no-slash")}\n${EPO(`path="/op/" method="POST" accepts=Op`, "slash")}`),
    });
    expect(r.exitCode).toBe(0);
    const base = await startProd(r.dist);
    const a = await post(base, "/op");
    expect(await a.json()).toEqual({ pong: "no-slash" });
    const b = await post(base, "/op/");
    expect(await b.json()).toEqual({ pong: "slash" });
    const q = await post(base, "/op?x=1");
    expect(await q.json()).toEqual({ pong: "no-slash" });
    const c = await post(base, "/OP");
    expect(c.status).not.toBe(200);
  }, TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// The origin rule: a cors= origin is one a browser sends in `Origin`
// ---------------------------------------------------------------------------

describe("§61.7 cors= origin — refused values", () => {
  const refused = [
    ["file:///x", "opaque"],
    ["file://host", "opaque"],
    ["https://a.example:0", "port 0"],
    ["http://a.example:0", "port 0"],
    ["ws://a.example", "`ws:`"],
    ["wss://a.example", "`wss:`"],
    ["ftp://a.example", "`ftp:`"],
    ["foo://[::::]", "IPv6 literal"],
    ["foo://a.example:0", "not `scheme://host[:port]`"],
    ["https://A.example", "sends it as `https://a.example`"],
    ["https://a.example:443", "sends it as `https://a.example`"],
    ["https://a.example/", "not `scheme://host[:port]`"],
    ["https://user@a.example", "not `scheme://host[:port]`"],
    ["https://0x7f.0.0.1", "sends it as `https://127.0.0.1`"],
    ["https://a.example:65536", "URL parser refuses it"],
    ["https://a..b", "empty label"],
    ["https://.a.example", "empty label"],
    ["https://a.example..", "empty label"],
    // the attribute string is `"`-only (§4.18.3): a single-quoted value is not a string literal
    ["SQ", "is not a string literal"],
  ];
  for (const [v, why] of refused) {
    test(`cors=${JSON.stringify(v)} → E-ENDPOINT-CORS-INVALID (${why})`, () => {
      const attr = v === "SQ" ? `cors='${A}'` : `cors="${v}"`;
      const errs = compileOne(`co-${Math.random().toString(36).slice(2)}`, program(`${TY()}\n${EPO(`path="/x" method="POST" accepts=Op ${attr}`)}`));
      const e = errs.filter((x) => x.code === "E-ENDPOINT-CORS-INVALID");
      expect(e.length).toBe(1);
      expect(e[0].message).toContain(why);
    });
  }
});

describe("§61.7 cors= origin — values a browser sends, accepted", () => {
  // A host the URL host serializer keeps as written is an origin a page there sends
  // (UTS #46 with CheckHyphens / UseSTD3ASCIIRules off; a trailing dot is a distinct
  // origin), so `new URL(v).origin === v` decides.
  const accepted = [
    "https://a.example", "http://localhost:3000", "https://a_b.example", "https://-a.example",
    "https://a.example.", "http://[::1]:8080", "https://127.0.0.1", "https://xn--bcher-kva.example",
    "chrome-extension://abcdefghijklmnop", "moz-extension://[::1]",
  ];
  for (const v of accepted) {
    test(`cors=${JSON.stringify(v)} → accepted`, () => {
      const errs = compileOne(`ok-${Math.random().toString(36).slice(2)}`, program(`${TY()}\n${EPO(`path="/x" method="POST" accepts=Op cors="${v}"`)}`));
      expect(errs.map((x) => x.code)).toEqual([]);
    });
  }

  test("a trailing-dot origin is the endpoint's Access-Control-Allow-Origin, as written", async () => {
    const r = build("dot", { "app.scrml": program(`${TY()}\n${EPO(`path="/op" method="POST" accepts=Op cors="https://a.example."`)}`) });
    expect(r.exitCode).toBe(0);
    const base = await startProd(r.dist);
    const yes = await preflight(base, "/op", "https://a.example.");
    expect(yes.status).toBe(204);
    expect(yes.headers.get("Access-Control-Allow-Origin")).toBe("https://a.example.");
  }, TIMEOUT_MS);
});
