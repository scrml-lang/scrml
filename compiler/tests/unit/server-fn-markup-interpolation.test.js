/**
 * server-fn-markup-interpolation.test.js — `${serverFn()}` in markup wires to DOM
 *
 * Regression: giti inbound 2026-04-20 GITI-005.
 *
 * `<p>${loadGreeting()}</p>` where `loadGreeting` is a `server function`
 * previously compiled to:
 *   - `_scrml_fetch_loadGreeting_N();` at module top (result dropped)
 *   - empty Reactive-display-wiring block (no @ refs → wiring skipped)
 * so the DOM never received the awaited value. Sender's ask: any
 * working idiom for "call server fn and render its result." This
 * fix gives them `${serverFn()}` directly.
 *
 * Fix (emit-event-wiring.ts):
 *   - Detect server-fn names via fnNameMap prefix `_scrml_fetch_` / `_scrml_cps_`.
 *   - When a logic binding's expression uses a server fn (with or without
 *     @-refs), emit an async IIFE wrapper that awaits the Promise and
 *     assigns the resolved value to el.textContent.
 *   - Non-server interpolations are unchanged.
 *
 * S470 (s470-render-position-server-call-refused) — SUPERSEDED for the server-fn cases. SPEC §13.7
 * names `<p>${userCount()}</p>` as E-VALUE-SERVER-CALL ("a value position cannot wait for the
 * server; load the value with a `<request>`"), and ruling:user-voice-scrml.md S469 item 1 refuses a
 * server/async call in every render position in impl#1. The async-IIFE wiring above awaited the
 * WHOLE expression, so `${isOk(@pw) ? "IN" : "no"}` tested the pending Promise (always truthy) —
 * the reason the class is refused as one rule. §1 and §4 now pin the refusal; the idiom is a
 * `<request>` (or a handler / function) that writes a cell, rendered by `${@cell}`.
 *
 * Coverage:
 *   §1  `${loadGreeting()}` is E-VALUE-SERVER-CALL (was: awaited DOM wiring)
 *   §3  Regression guard — `${@var}` still uses synchronous reactive effect
 *   §4  Mixed expression `${@count + suffix()}` (reactive + server fn) is E-VALUE-SERVER-CALL
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { compileScrml } from "../../src/api.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_DIR = join(import.meta.dir, "__fixtures__/server-fn-markup");
const FIXTURE_OUTPUT = join(FIXTURE_DIR, "dist");

function fix(name, src) {
  const path = join(FIXTURE_DIR, name);
  writeFileSync(path, src);
  return path;
}

let gitiFx, atVarFx, mixedFx;

beforeAll(() => {
  mkdirSync(FIXTURE_DIR, { recursive: true });

  gitiFx = fix("giti-005.scrml", `<program>
\${
  server function loadGreeting() {
    lift "hello"
  }
}
<div>
  <p>\${loadGreeting()}</p>
</div>
</program>
`);

  atVarFx = fix("at-var.scrml", `<program>
\${
  @count = 0
  function bump() { @count = @count + 1 }
}
<button onclick=bump()>inc</button>
<p>\${@count}</p>
</program>
`);

  mixedFx = fix("mixed.scrml", `<program>
\${
  @count = 0
  server function loadSuffix() {
    lift "items"
  }
  function bump() { @count = @count + 1 }
}
<button onclick=bump()>inc</button>
<p>\${@count + " " + loadSuffix()}</p>
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
// §1: Bug GITI-005 — `${serverFn()}` in markup produces awaited wiring
// ---------------------------------------------------------------------------

describe("§1: GITI-005 — `${serverFn()}` in markup is E-VALUE-SERVER-CALL (S470)", () => {
  test("the interpolation is refused, naming the server function", () => {
    const result = compile(gitiFx);
    const codes = (result.errors ?? []).map((e) => e.code);
    expect(codes).toEqual(["E-VALUE-SERVER-CALL"]);
    expect(result.errors[0].message).toContain("server function `loadGreeting`");
  });
});

// ---------------------------------------------------------------------------
// §3: Regression — `${@var}` still uses synchronous _scrml_effect
// ---------------------------------------------------------------------------

describe("§3: `${@var}` interpolation uses synchronous effect (no async wrapping)", () => {
  test("pure reactive interpolation does NOT wrap in async IIFE", () => {
    const result = compile(atVarFx);
    expect(result.errors).toEqual([]);
    const js = result.outputs.get(atVarFx).clientJs;
    // Synchronous form: `_scrml_render_value(_scrml_el, _scrml_reactive_get("count"));`
    // markup-value-in-expression-2026-06-17: the display now routes through the
    // node-aware `_scrml_render_value(_scrml_el, expr)` helper (was `el.textContent =`).
    // Still synchronous — no async IIFE for a reactive-only interpolation.
    expect(js).toMatch(/_scrml_render_value\(_scrml_el,\s*_scrml_cs_reactive_get\(/);
    // No async IIFE around the assignment in this reactive-only case
    expect(js).not.toMatch(/\(async\s*\(\s*\)\s*=>\s*\{[^}]*_scrml_reactive_get\("count"\)/);
  });
});

// ---------------------------------------------------------------------------
// §4: Mixed reactive + server-fn expression uses async form
// ---------------------------------------------------------------------------

describe("§4: mixed `${@var + serverFn()}` is E-VALUE-SERVER-CALL (S470)", () => {
  test("the reactive interpolation over a server call is refused", () => {
    const result = compile(mixedFx);
    const codes = (result.errors ?? []).map((e) => e.code);
    expect(codes).toEqual(["E-VALUE-SERVER-CALL"]);
    expect(result.errors[0].message).toContain("server function `loadSuffix`");
  });
});
