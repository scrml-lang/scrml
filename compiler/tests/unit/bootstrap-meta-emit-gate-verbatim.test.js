// bootstrap-meta-emit-gate-verbatim.test.js — s482-meta-runtime.
//
// SPEC §22.12 "Runtime `meta.emit` output is gated" is security code (a fail-open is HIGH). The
// bootstrap does not re-implement it: its runtime (compiler/self-host-v2/slice-m1/runtime/runtime.js)
// carries impl#1's gate VERBATIM between two marker lines — exactly the text impl#1's client runtime
// inlines (compiler/src/runtime-template.js CSS_ATTR_GUARD_RUNTIME_SOURCE + META_EMIT_GATE_RUNTIME_SOURCE:
// runtime-css-attr-guard.js, the element tables from html-elements.js, the form-member table,
// markup-attr-allow-list.js and runtime-meta-emit-gate.js). This test fails the moment the two drift:
// edit impl#1's sources, then run `bun scripts/sync-bootstrap-meta-emit-gate.ts --write`.

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BOOT_RUNTIME_PATH,
  readText,
  currentBlock,
  expectedBlock,
  isInSync,
} from "../../../scripts/sync-bootstrap-meta-emit-gate.ts";

const SRC = join(import.meta.dir, "..", "..", "src");
const strip = (f) => readFileSync(join(SRC, f), "utf8").replace(/\r\n/g, "\n").replace(/^export /gm, "");

describe("bootstrap runtime carries impl#1's runtime meta.emit gate verbatim (§22.12)", () => {
  test("the block between the markers equals impl#1's inlined gate text", () => {
    const runtime = readText(BOOT_RUNTIME_PATH);
    expect(currentBlock(runtime).block).toBe(expectedBlock());
    expect(isInSync()).toBe(true);
  });

  test("the block holds each impl#1 source byte for byte (`export ` stripped)", () => {
    const block = currentBlock(readText(BOOT_RUNTIME_PATH)).block;
    for (const f of ["runtime-meta-emit-gate.js", "markup-attr-allow-list.js", "runtime-css-attr-guard.js"]) {
      expect(block.includes(strip(f))).toBe(true);
    }
    // the element tables and the form-member table impl#1 builds from its one element list
    expect(block).toContain("const _SCRML_META_EMIT_KNOWN_ELEMENTS = new Set(");
    expect(block).toContain("const _SCRML_CUSTOM_ELEMENT_NAME = ");
    expect(block).toContain("const _SCRML_EMIT_FORM_MEMBERS = new Set([");
  });

  test("outside the block, the runtime writes emitted markup ONLY through the gate", () => {
    const { before, after } = currentBlock(readText(BOOT_RUNTIME_PATH));
    const outside = before + after;
    // no second HTML reader / writer: the one insertion path is the gate's `_scrml_meta_emit_insert`
    expect(outside).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|createContextualFragment|DOMParser/);
    expect((outside.match(/_scrml_meta_emit_insert\(/g) ?? []).length).toBe(2);   // metaEffect.emit: connected, then held
    // the URL reader the gate calls is the verbatim URL-guard block's — no second definition
    expect((outside.match(/function _scrml_url_value_admitted\(/g) ?? []).length).toBe(1);
    expect(after).not.toMatch(/function _scrml_meta_emit_/);
  });
});
