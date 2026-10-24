/**
 * server-client-boundary.test.js — Server/client boundary separation
 *
 * Regressions: giti inbound 2026-04-20 GITI-003 and GITI-004.
 *
 * GITI-003: imports used only inside server-function bodies leaked into
 * `.client.js`. The emit-client path unconditionally wrote every import
 * from the source file, so a `.js` helper referenced only by a server fn
 * ended up imported in the browser bundle — pointing at a server-only
 * module that 500s the page load.
 *
 * GITI-004: `lift <expr>` inside a `server function` body lowered to
 * `_scrml_lift(() => document.createTextNode(String(expr ?? "")))` using
 * `document` and a client-only helper. Neither exists in a Bun server
 * handler. The handler returned undefined instead of the value.
 *
 * Fixes:
 *   - emit-client.ts: post-emit prune pass drops imports with no client
 *     body usage (scoped to non-scrml paths to preserve scrml:/vendor:/
 *     .client.js imports).
 *   - emit-logic.ts: case "lift-expr" respects opts.boundary === "server"
 *     and emits `return <expr>;`.
 *   - emit-server.ts: passes `{ boundary: "server" }` to emitLogicNode
 *     for all server-fn body statements.
 *
 * Coverage:
 *   §1  GITI-003 — server-only `.js` import is absent from .client.js
 *   §2  GITI-003 — same import IS present in .server.js (server needs it)
 *   §3  GITI-003 — a `.js` import that IS used client-side is preserved
 *   §4  GITI-004 — `lift <expr>` in server fn emits `return <expr>;`
 *   §5  GITI-004 — server handler does NOT contain `_scrml_lift(` or
 *        `document.createTextNode(`
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { compileScrml } from "../../src/api.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_DIR = join(import.meta.dir, "__fixtures__/server-client-boundary");
const FIXTURE_OUTPUT = join(FIXTURE_DIR, "dist");

function fix(name, src) {
  const path = join(FIXTURE_DIR, name);
  writeFileSync(path, src);
  return path;
}

let serverOnlyFx, clientUseFx;

beforeAll(() => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  mkdirSync(join(FIXTURE_DIR, "engine"), { recursive: true });

  // Stub helper file so the import path resolves at runtime.
  writeFileSync(join(FIXTURE_DIR, "engine", "probe.js"), `
export function getGreeting(name) { return "Hello, " + name + "!"; }
`);

  // GITI-003 + GITI-004: server-only usage of the imported helper.
  // (S470: the client calls the server function from a handler. A render-position
  // `<p>${loadGreeting()}</p>` is E-VALUE-SERVER-CALL, §13.7.)
  serverOnlyFx = fix("server-only.scrml", `<program>

\${
  import { getGreeting } from './engine/probe.js'

  server function loadGreeting() {
    lift getGreeting("world")
  }
}

<div>
  <button onclick=loadGreeting()>Load</button>
</div>

</program>
`);

  // Negative control — same helper, used directly in markup (client path).
  clientUseFx = fix("client-use.scrml", `<program>

\${
  import { getGreeting } from './engine/probe.js'

  @label = ""
  function build() { @label = getGreeting("browser") }
}

<button onclick=build()>Greet</button>
<p>\${@label}</p>

</program>
`);
});

afterAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

function compile(path) {
  return compileScrml({ inputFiles: [path], outputDir: FIXTURE_OUTPUT, write: false });
}

// ---------------------------------------------------------------------------
// §1: GITI-003 — server-only import absent from client.js
// ---------------------------------------------------------------------------

describe("§1: GITI-003 — server-only import does NOT leak into client.js", () => {
  test("compile succeeds", () => {
    const result = compile(serverOnlyFx);
    expect(result.errors).toEqual([]);
  });

  test("client.js does not import getGreeting", () => {
    const result = compile(serverOnlyFx);
    const clientJs = result.outputs.get(serverOnlyFx).clientJs;
    expect(clientJs).not.toMatch(/import\s+\{\s*getGreeting\s*\}\s+from/);
    expect(clientJs).not.toContain("probe.js");
  });
});

// ---------------------------------------------------------------------------
// §2: GITI-003 — same import IS still in server.js
// ---------------------------------------------------------------------------

describe("§2: server-only import IS present in server.js", () => {
  test("server.js retains the import", () => {
    const result = compile(serverOnlyFx);
    const serverJs = result.outputs.get(serverOnlyFx).serverJs;
    expect(serverJs).toMatch(/import\s+\{\s*getGreeting\s*\}\s+from\s+["']\.\/engine\/probe\.js["']/);
  });
});

// ---------------------------------------------------------------------------
// §3: GITI-003 — client-used import is preserved
// ---------------------------------------------------------------------------

describe("§3: client-side import is preserved in client.js", () => {
  test("imported helper used by a client fn stays in client.js", () => {
    const result = compile(clientUseFx);
    expect(result.errors).toEqual([]);
    const clientJs = result.outputs.get(clientUseFx).clientJs;
    // Client uses getGreeting in `function build()` — import must remain
    expect(clientJs).toMatch(/import\s+\{\s*getGreeting\s*\}\s+from\s+["']\.\/engine\/probe\.js["']/);
  });
});

// ---------------------------------------------------------------------------
// §4: GITI-004 — `lift <expr>` in server-fn body emits `return <expr>;`
// ---------------------------------------------------------------------------

describe("§4: GITI-004 — `lift` in server fn body emits `return <expr>;`", () => {
  test("server handler body contains `return getGreeting(...)`", () => {
    const result = compile(serverOnlyFx);
    const serverJs = result.outputs.get(serverOnlyFx).serverJs;
    // The lift lowering must be a plain return of the expression
    expect(serverJs).toMatch(/return\s+getGreeting\s*\(\s*["']world["']\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// §5: GITI-004 — no DOM-only code in server handler
// ---------------------------------------------------------------------------

describe("§5: server handler contains no client-only helpers", () => {
  test("server.js does not reference _scrml_lift or document.createTextNode", () => {
    const result = compile(serverOnlyFx);
    const serverJs = result.outputs.get(serverOnlyFx).serverJs;
    expect(serverJs).not.toContain("_scrml_lift(");
    expect(serverJs).not.toContain("document.createTextNode(");
    // And `document` is not referenced at all in the handler (it may appear
    // in the URL host fallback "http://localhost" which is fine — we check
    // for `document.` which is the DOM API form).
    expect(serverJs).not.toMatch(/\bdocument\.[a-z]/);
  });
});

// ---------------------------------------------------------------------------
// §6: S35 insight 22 — aggregate `routes` array + WinterCG fetch handler
// ---------------------------------------------------------------------------

describe("§6: per-file aggregate routes + fetch(request) handler", () => {
  test("server.js exports `routes` array listing every route", () => {
    const result = compile(serverOnlyFx);
    const serverJs = result.outputs.get(serverOnlyFx).serverJs;
    expect(serverJs).toMatch(/export const routes = \[[^\]]*__ri_route_loadGreeting_1[^\]]*\];/);
  });

  test("server.js exports an async fetch(request) function", () => {
    const result = compile(serverOnlyFx);
    const serverJs = result.outputs.get(serverOnlyFx).serverJs;
    expect(serverJs).toMatch(/export async function fetch\(request\) \{/);
  });

  test("fetch handler iterates `routes` and matches path + method", () => {
    const result = compile(serverOnlyFx);
    const serverJs = result.outputs.get(serverOnlyFx).serverJs;
    expect(serverJs).toContain("for (const r of routes)");
    expect(serverJs).toContain("r.path === url.pathname");
    expect(serverJs).toContain("r.method === request.method");
  });

  test("fetch returns null on no match (composition seam)", () => {
    const result = compile(serverOnlyFx);
    const serverJs = result.outputs.get(serverOnlyFx).serverJs;
    expect(serverJs).toMatch(/return null;\s*\}/);
  });

  test("client-only sources emit no routes + no fetch", () => {
    const result = compile(clientUseFx);
    const serverJs = result.outputs.get(clientUseFx).serverJs ?? "";
    // No server functions → no manifest → no aggregate block
    expect(serverJs).not.toContain("export const routes = [");
    expect(serverJs).not.toContain("export async function fetch(request)");
  });
});
