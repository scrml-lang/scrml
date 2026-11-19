// ---------------------------------------------------------------------------
// <endpoint> CORS scoping, SERVED — §39.2.1 program `cors=` does not cover
// `<endpoint>` routes; §61.7 per-endpoint `cors=` (S479 impl#1 carve-out).
// ---------------------------------------------------------------------------
//
// Ruling: user-voice-scrml.md "⭐ RULED — program `cors=` does not cover
// `<endpoint>` routes; per-endpoint `cors=` (S479, 2026-11-18)": "a program-level
// `cors=` stops applying to `<endpoint>` routes, and an endpoint that wants
// cross-origin browser callers opts in with its own `cors=`" … "without it, a
// preflight to an endpoint path is answered 405 (as §61.5's rationale already
// claims)". impl#1: "the exclusion is built under the S479 415 carve-out".
//
// Before the fix (#1957 review LOW-1) `<program cors="*">` answered a cross-origin
// preflight to an endpoint path 204 with `Access-Control-Allow-Origin: *`, so a
// page the operator visited could POST application/json to the endpoint — the
// CSRF hole §61.5's 415 rule is meant to close.
//
// Each app is compiled, its `.server.js` imported, and its WinterCG `fetch`
// served over real HTTP (Bun.serve); requests carry a foreign `Origin`.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { compileScrml } from "../../src/api.js";

const TIMEOUT_MS = 30_000;
const ORIGIN = "https://evil.example";

const app = (programAttrs, endpointAttrs) => `<program${programAttrs}>
\${
  type Op:enum = {
    Ping
    Echo(say: string)
  }
  server function hello() {
    return "hi"
  }
}
<endpoint path="/op" method="POST" accepts=Op${endpointAttrs}>
  <Ping : { pong: true }>
  <Echo(say) : { said: say }>
</endpoint>
<button onclick=hello()>hi</button>
</program>
`;

const servers = [];
let root;

async function serve(name, src) {
  const dir = join(root, name);
  rmSync(dir, { recursive: true, force: true });
  require("fs").mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), '{"type":"module"}\n');
  const file = join(dir, "app.scrml");
  writeFileSync(file, src);
  const r = compileScrml({ inputFiles: [file], write: false, outputDir: join(dir, "out") });
  const errors = (r.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && e.severity !== "lint");
  expect(errors.map((e) => e.code)).toEqual([]);
  let serverJs = "";
  for (const [, entry] of (r.outputs ?? new Map())) {
    if (entry && typeof entry.serverJs === "string") serverJs += entry.serverJs + "\n";
  }
  const f = join(dir, "server.mjs");
  writeFileSync(f, serverJs);
  const mod = await import(f);
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      return (await mod.fetch(req)) ?? new Response("not found", { status: 404 });
    },
  });
  servers.push(server);
  return { base: `http://127.0.0.1:${server.port}`, mod, serverJs };
}

function preflight(base, path, method = "POST") {
  return fetch(base + path, {
    method: "OPTIONS",
    headers: { Origin: ORIGIN, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": "content-type" },
  });
}

function post(base, body, contentType = "application/json") {
  return fetch(base + "/op", { method: "POST", headers: { Origin: ORIGIN, "Content-Type": contentType }, body });
}

let programStar, programStarEndpointA, endpointAOnly, plain;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "endpoint-cors-"));
  programStar = await serve("program-star", app(` cors="*"`, ""));
  programStarEndpointA = await serve("program-star-endpoint-a", app(` cors="*"`, ` cors="https://a.example"`));
  endpointAOnly = await serve("endpoint-a-only", app("", ` cors="https://a.example"`));
  plain = await serve("plain", app("", ""));
}, TIMEOUT_MS);

afterAll(() => {
  for (const s of servers) s.stop(true);
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("§39.2.1 — program `cors=\"*\"` does not cover an `<endpoint>` route", () => {
  test("a cross-origin preflight to the endpoint path is 405 + Allow, with no Access-Control-* header", async () => {
    const res = await preflight(programStar.base, "/op");
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Methods")).toBeNull();
  }, TIMEOUT_MS);

  test("a preflight naming another method at the endpoint path is 405 too (no program 204 for the path)", async () => {
    const res = await preflight(programStar.base, "/op", "PUT");
    expect(res.status).toBe(405);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  }, TIMEOUT_MS);

  test("the endpoint's own responses carry no program CORS header", async () => {
    const ok = await post(programStar.base, JSON.stringify({ tag: "Echo", say: "x" }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ said: "x" });
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const refused = await post(programStar.base, "x", "text/plain");
    expect(refused.status).toBe(415);
    expect(refused.headers.get("Access-Control-Allow-Origin")).toBeNull();
  }, TIMEOUT_MS);

  test("a non-endpoint path still gets the program's preflight answer (204, ACAO *)", async () => {
    const res = await preflight(programStar.base, "/anything-else");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  }, TIMEOUT_MS);

  test("a non-endpoint route's response still gets the program CORS headers", async () => {
    const route = programStar.mod.routes.find((r) => r.method !== "OPTIONS" && r.path !== "/op" && !r.isWebSocket);
    expect(route).toBeDefined();
    const res = await fetch(programStar.base + route.path, {
      method: route.method,
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: route.method === "GET" ? undefined : "{}",
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  }, TIMEOUT_MS);
});

describe("§61.7 — per-endpoint `cors=\"https://a.example\"`", () => {
  for (const [label, get] of [["under program cors=\"*\"", () => programStarEndpointA], ["with no program cors=", () => endpointAOnly]]) {
    test(`${label}: a preflight for the endpoint's method is 204 with that origin only`, async () => {
      const res = await preflight(get().base, "/op", "POST");
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://a.example");
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe("POST");
      expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Authorization");
      expect(res.headers.get("Access-Control-Max-Age")).toBe("86400");
    }, TIMEOUT_MS);

    test(`${label}: a preflight for a method no endpoint serves there is 405`, async () => {
      const res = await preflight(get().base, "/op", "DELETE");
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }, TIMEOUT_MS);

    test(`${label}: the endpoint's responses (success and refusal) carry its origin, never "*"`, async () => {
      const ok = await post(get().base, JSON.stringify({ tag: "Ping" }));
      expect(ok.status).toBe(200);
      expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("https://a.example");
      const bad = await post(get().base, JSON.stringify({ tag: "Ping", extra: 1 }));
      expect(bad.status).toBe(400);
      expect(bad.headers.get("Access-Control-Allow-Origin")).toBe("https://a.example");
    }, TIMEOUT_MS);
  }

  test("under program cors=\"*\", a non-endpoint path keeps the program's \"*\"", async () => {
    const res = await preflight(programStarEndpointA.base, "/elsewhere");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  }, TIMEOUT_MS);
});

describe("§61.7 — no `cors=` anywhere: an endpoint preflight is 405", () => {
  test("OPTIONS to the endpoint path → 405 + Allow, no Access-Control-* header", async () => {
    const res = await preflight(plain.base, "/op");
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  }, TIMEOUT_MS);

  test("the endpoint still serves a same-origin JSON request (no CORS header)", async () => {
    const ok = await post(plain.base, JSON.stringify({ tag: "Echo", say: "y" }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBeNull();
  }, TIMEOUT_MS);
});

describe("the §64 tool serve-harness `/*` preflight route defers to the endpoint", () => {
  test("the program's `/*` OPTIONS route consults the endpoint table first", () => {
    const h = programStar.mod._scrml_cors_options_route.handler;
    const res = h(new Request("http://localhost/op", { method: "OPTIONS", headers: { "Access-Control-Request-Method": "POST" } }));
    expect(res.status).toBe(405);
    const other = h(new Request("http://localhost/x", { method: "OPTIONS" }));
    expect(other.status).toBe(204);
    expect(other.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
