// ---------------------------------------------------------------------------
// <endpoint> request refusals, SERVED — §61.5 415 `UnsupportedMediaType` and
// §61.3 strict keys (S479 impl#1 carve-out).
// ---------------------------------------------------------------------------
//
// Ruling: user-voice-scrml.md "⭐ RULED — narrow impl#1 carve-out: endpoint 415 /
// strict-keys parity (S479, 2026-11-18)", which lifts the S471 impl#1 freeze for
// S478 open-Qs items 35 (strict allow-list) and 39 (415 + UnsupportedMediaType).
//
// SPEC §61.5: "A request whose `Content-Type` media type is not `application/json`
// (compared case-insensitively, RFC 9110 §8.3.1; parameters such as `charset`
// allowed) SHALL be refused with HTTP **415** and the compiler-owned envelope
// `{ error: { kind: "UnsupportedMediaType", message } }`, `Content-Type:
// application/json`, before the body is read; no arm runs."
//
// SPEC §61.3: "The request body's keys SHALL be exactly `tag` and payload fields of
// the variant `tag` names. A key that is neither is a decode failure —
// `::InvalidPayload`, the 400 envelope of §61.5 — and no arm runs."
//
// Before the fix impl#1's compiled server ran the arm for a CORS-simple request
// (a cross-origin `text/plain` / form POST a browser sends with no preflight) —
// a CSRF-class hole — and ignored a foreign key. These tests compile a program
// whose arm WRITES A ROW to a real SQLite file, serve the compiled `.server.js`
// over real HTTP (Bun.serve), and read the table afterwards: a refused request
// must leave no row (the arm did not run).
//
// The messages match the bootstrap's (compiler/self-host-v2/slice-m1/runtime/
// server-runtime.js `handleEndpoint`) so the two implementations answer a refused
// request with the same bytes.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Database } from "bun:sqlite";
import { compileScrml } from "../../src/api.js";

// Executed-DB tests declare their own budget (g-windows-executed-db-tests-5s-timeout-s460).
const EXECUTED_DB_TIMEOUT_MS = 30_000;

let dir, dbPath, server, base, serverJs;

const APP = (db) => `<program db="${db}">
\${
  type Op:enum = {
    Ping
    Hit(who: string)
  }
  server function hit(who) {
    ?{\`INSERT INTO hits (who) VALUES (\${who})\`}.run()
    return { recorded: who }
  }
}
<endpoint path="/op" method="POST" accepts=Op>
  <Ping : { pong: true }>
  <Hit(who) : hit(who)>
</endpoint>
<p>x</>
</program>
`;

function rows() {
  const db = new Database(dbPath, { readonly: true });
  try { return db.query("SELECT who FROM hits ORDER BY rowid").all().map((r) => r.who); }
  finally { db.close(); }
}

function clear() {
  const db = new Database(dbPath);
  try { db.run("DELETE FROM hits"); } finally { db.close(); }
}

async function send(contentType, body) {
  const headers = contentType === null ? {} : { "Content-Type": contentType };
  const res = await fetch(base, { method: "POST", headers, body });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, contentType: res.headers.get("Content-Type"), json, text };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "endpoint-415-"));
  // the emitted .server.js is an ES module
  writeFileSync(join(dir, "package.json"), '{"type":"module"}\n');
  dbPath = join(dir, "hits.db");
  const db = new Database(dbPath);
  db.run("CREATE TABLE hits (who TEXT NOT NULL)");
  db.close();
  const src = join(dir, "app.scrml");
  writeFileSync(src, APP(dbPath));
  const r = compileScrml({ inputFiles: [src], write: false, outputDir: join(dir, "out") });
  const errors = (r.errors ?? []).filter((e) => e.severity !== "warning" && e.severity !== "info" && e.severity !== "lint");
  expect(errors.map((e) => e.code)).toEqual([]);
  serverJs = "";
  for (const [, entry] of (r.outputs ?? new Map())) {
    if (entry && typeof entry.serverJs === "string") serverJs += entry.serverJs + "\n";
  }
  const f = join(dir, "server.mjs");
  writeFileSync(f, serverJs);
  const mod = await import(f);
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      return (await mod.fetch(req)) ?? new Response("not found", { status: 404 });
    },
  });
  base = `http://127.0.0.1:${server.port}/op`;
}, EXECUTED_DB_TIMEOUT_MS);

afterAll(() => {
  server?.stop(true);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const UNSUPPORTED = { error: { kind: "UnsupportedMediaType", message: "the request Content-Type must be application/json" } };

describe("§61.5 — a non-JSON request is 415 UnsupportedMediaType and no arm runs", () => {
  for (const ct of ["text/plain", "text/plain;charset=UTF-8", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
    test(`a CORS-simple POST with Content-Type ${ct} is refused 415; the arm's write never happens`, async () => {
      clear();
      const r = await send(ct, JSON.stringify({ tag: "Hit", who: "csrf" }));
      expect(r.status).toBe(415);
      expect(r.contentType).toBe("application/json");
      expect(r.json).toEqual(UNSUPPORTED);
      expect(rows()).toEqual([]);
    }, EXECUTED_DB_TIMEOUT_MS);
  }

  test("a request with no Content-Type is refused 415", async () => {
    clear();
    const res = await fetch(base, { method: "POST", body: new Uint8Array(Buffer.from(JSON.stringify({ tag: "Hit", who: "none" }))) });
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual(UNSUPPORTED);
    expect(rows()).toEqual([]);
  }, EXECUTED_DB_TIMEOUT_MS);

  test("a JSON look-alike media type (application/jsonx, text/json) is refused 415", async () => {
    clear();
    for (const ct of ["application/jsonx", "text/json", "application/json-patch+json"]) {
      const r = await send(ct, JSON.stringify({ tag: "Hit", who: "lookalike" }));
      expect(r.status).toBe(415);
    }
    expect(rows()).toEqual([]);
  }, EXECUTED_DB_TIMEOUT_MS);

  test("the media type compares case-insensitively and admits parameters (RFC 9110 §8.3.1): the arm runs", async () => {
    clear();
    const r = await send("Application/JSON ; charset=utf-8", JSON.stringify({ tag: "Hit", who: "cased" }));
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ recorded: "cased" });
    expect(rows()).toEqual(["cased"]);
  }, EXECUTED_DB_TIMEOUT_MS);
});

describe("§61.3 — strict keys: a key that is neither `tag` nor a payload field is 400 InvalidPayload, no arm runs", () => {
  test("an application/json POST with an extra key on a payload variant is refused; no row is written", async () => {
    clear();
    const r = await send("application/json", JSON.stringify({ tag: "Hit", who: "extra", admin: true }));
    expect(r.status).toBe(400);
    expect(r.contentType).toBe("application/json");
    expect(r.json).toEqual({ error: { kind: "InvalidPayload", message: "request payload field 'admin' is not a field of variant 'Hit'" } });
    expect(rows()).toEqual([]);
  }, EXECUTED_DB_TIMEOUT_MS);

  test("an extra key on a unit variant is refused", async () => {
    const r = await send("application/json", JSON.stringify({ tag: "Ping", jsonrpc: "2.0" }));
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ error: { kind: "InvalidPayload", message: "request payload field 'jsonrpc' is not a field of variant 'Ping'" } });
  }, EXECUTED_DB_TIMEOUT_MS);

  test("a long foreign key is clipped to 64 characters in the message (the bootstrap's clip)", async () => {
    const k = "k".repeat(80);
    const r = await send("application/json", JSON.stringify({ tag: "Hit", who: "a", [k]: 1 }));
    expect(r.status).toBe(400);
    expect(r.json.error.message).toBe(`request payload field '${"k".repeat(64)}…' is not a field of variant 'Hit'`);
  }, EXECUTED_DB_TIMEOUT_MS);

  test("a body that names no known variant still reports the decoder's kind (strict keys do not mask it)", async () => {
    expect((await send("application/json", JSON.stringify({ tag: "Teleport", x: 1 }))).json.error.kind).toBe("UnknownVariant");
    expect((await send("application/json", JSON.stringify({ x: 1 }))).json.error.kind).toBe("MissingDiscriminator");
    expect((await send("application/json", "{not json")).json.error.kind).toBe("Malformed");
  }, EXECUTED_DB_TIMEOUT_MS);
});

describe("a valid request runs the arm and returns its answer", () => {
  test("Hit(who) with exactly its declared keys → 200, the arm's value, and the row", async () => {
    clear();
    const r = await send("application/json", JSON.stringify({ tag: "Hit", who: "valid" }));
    expect(r.status).toBe(200);
    expect(r.contentType).toBe("application/json");
    expect(r.json).toEqual({ recorded: "valid" });
    expect(rows()).toEqual(["valid"]);
  }, EXECUTED_DB_TIMEOUT_MS);

  test("Ping (unit variant, tag only) → 200", async () => {
    const r = await send("application/json", JSON.stringify({ tag: "Ping" }));
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ pong: true });
  }, EXECUTED_DB_TIMEOUT_MS);
});

describe("§61.5 — \"before the body is read\"", () => {
  test("the server module carries the media-type check before the body read", () => {
    const at = serverJs.indexOf(`_scrml_endpoint_is_json(_scrml_req.headers.get("Content-Type"))`);
    const read = serverJs.indexOf("await _scrml_req.text()");
    expect(at).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(at);
  });
});
