/**
 * mcp-descriptors-degenerate-spa.test.js — MCP-V0.A degenerate-SPA test
 *
 * Sub-unit A test follow-on (test 6). SCOPING §5 Risk 6 / mcp-descriptors.ts
 * header "Empty-app graceful degradation": a zero-engine / zero-form /
 * zero-channel / zero-server-fn SPA must still emit all four sidecars as valid
 * empty `[]`, and the `scrml:mcp` runtime helpers must degrade gracefully
 * (loadSidecars over the empty files, helpers return undefined for any lookup).
 *
 * Drives the REAL emit path, reads the sidecars from disk, then loads them into
 * the B runtime shim and exercises the three read helpers.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import {
  makeSidecarTmpRoot,
  cleanupSidecarTmpRoot,
  compileAndReadSidecars,
} from "../helpers/mcp-sidecar-compile.js";
import {
  install,
  loadSidecars,
  getCurrentVariant,
  getFormStatus,
  getChannelState,
  _stateForTests,
  _resetForTests,
} from "../../runtime/stdlib/mcp/internal.js";

let TMP;
beforeAll(() => { TMP = makeSidecarTmpRoot("degenerate"); });
afterAll(() => { cleanupSidecarTmpRoot(TMP); _resetForTests(); });
beforeEach(() => { _resetForTests(); });

const compile = (src) => compileAndReadSidecars(src, TMP);

// ---------------------------------------------------------------------------
// Fixture — a degenerate SPA: markup only, no engines/forms/channels/server fns.
// ---------------------------------------------------------------------------

const SPA_FIXTURE = `<program title="DegenerateSPA">

<div class="app">
  <h1>Hello</h1>
  <p>Static markup. No engines, forms, channels, or server functions.</p>
</div>

</program>
`;

describe("MCP-V0.A degenerate-SPA sidecars", () => {
  test("all four sidecars emit as valid empty JSON arrays", () => {
    const { fatal, engines, forms, channels, serverFns } = compile(SPA_FIXTURE);
    expect(fatal).toEqual([]);
    expect(engines).toEqual([]);
    expect(forms).toEqual([]);
    expect(channels).toEqual([]);
    expect(serverFns).toEqual([]);
  });

  test("runtime helpers degrade gracefully over the empty sidecars", () => {
    const { outDir } = compile(SPA_FIXTURE);
    // Connect a no-op runtime + load the (empty) on-disk sidecars.
    install({ reactive_get: () => undefined, derived_get: () => undefined });
    loadSidecars(outDir);

    const snap = _stateForTests();
    expect(snap.sidecars.engines).toEqual([]);
    expect(snap.sidecars.forms).toEqual([]);
    expect(snap.sidecars.channels).toEqual([]);

    // Every lookup against an empty surface returns undefined — no throw.
    expect(getCurrentVariant("anything")).toBeUndefined();
    expect(getFormStatus("anything")).toBeUndefined();
    expect(getChannelState("anything")).toBeUndefined();
  });

  test("loadSidecars does not throw on the all-empty output dir", () => {
    const { outDir } = compile(SPA_FIXTURE);
    install({ reactive_get: () => undefined, derived_get: () => undefined });
    expect(() => loadSidecars(outDir)).not.toThrow();
  });
});
