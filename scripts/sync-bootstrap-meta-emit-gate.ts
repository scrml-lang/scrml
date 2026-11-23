#!/usr/bin/env bun
/**
 * sync-bootstrap-meta-emit-gate.ts — keep the bootstrap runtime's copy of impl#1's runtime
 * `meta.emit` gate verbatim. change-id: s482-meta-runtime.
 *
 * SPEC §22.12 "Runtime `meta.emit` output is gated" is security code: the bootstrap does NOT
 * re-implement it (a second judge is a fail-open waiting to drift). impl#1's client runtime inlines
 * the gate as two chunks (compiler/src/runtime-template.js):
 *   - CSS_ATTR_GUARD_RUNTIME_SOURCE  — compiler/src/runtime-css-attr-guard.js (`export ` stripped);
 *     the gate reads its `_SCRML_CSS_URL_ATTRS` / `_scrml_css_attr_value_admitted` (S480 r1 F3);
 *   - META_EMIT_GATE_RUNTIME_SOURCE  — the element tables built from html-elements.js, the
 *     `_SCRML_EMIT_FORM_MEMBERS` table of dom-named-property-members.js, markup-attr-allow-list.js
 *     and runtime-meta-emit-gate.js (`export ` stripped).
 * The bootstrap runtime (compiler/self-host-v2/slice-m1/runtime/runtime.js) ships as ONE file, so it
 * carries exactly that text between two marker lines. Its URL reader is the verbatim URL-guard block
 * already in the runtime (sync-bootstrap-url-guard.ts) — never a second one.
 *
 *   bun scripts/sync-bootstrap-meta-emit-gate.ts --write   rewrite the block from impl#1's sources
 *   bun scripts/sync-bootstrap-meta-emit-gate.ts --check   exit 1 when the block has drifted
 *
 * The unit test compiler/tests/unit/bootstrap-meta-emit-gate-verbatim.test.js runs the same check.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CSS_ATTR_GUARD_RUNTIME_SOURCE, META_EMIT_GATE_RUNTIME_SOURCE } from "../compiler/src/runtime-template.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const BOOT_RUNTIME_PATH = join(ROOT, "compiler", "self-host-v2", "slice-m1", "runtime", "runtime.js");
export const BEGIN_MARKER = "// >>> BEGIN verbatim impl#1 runtime meta.emit gate (runtime-template.js CSS_ATTR_GUARD_RUNTIME_SOURCE + META_EMIT_GATE_RUNTIME_SOURCE)\n";
export const END_MARKER = "// <<< END verbatim impl#1 runtime meta.emit gate\n";

/** A file's text with CRLF read as LF (a Windows checkout compares the same text). */
export function readText(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

/** The block the bootstrap runtime must carry: impl#1's two chunks, in impl#1's order of need. */
export function expectedBlock(): string {
  const norm = (s: string) => {
    const t = s.replace(/\r\n/g, "\n");
    return t.endsWith("\n") ? t : t + "\n";
  };
  return norm(CSS_ATTR_GUARD_RUNTIME_SOURCE) + norm(META_EMIT_GATE_RUNTIME_SOURCE);
}

/** The block the bootstrap runtime carries now (between the markers). Throws when a marker is missing. */
export function currentBlock(runtime: string): { before: string; block: string; after: string } {
  const b = runtime.indexOf(BEGIN_MARKER);
  const e = runtime.indexOf(END_MARKER);
  if (b < 0 || e < 0 || e < b) throw new Error(`${BOOT_RUNTIME_PATH}: the verbatim meta.emit gate markers are missing or out of order`);
  if (runtime.indexOf(BEGIN_MARKER, b + 1) >= 0 || runtime.indexOf(END_MARKER, e + 1) >= 0) {
    throw new Error(`${BOOT_RUNTIME_PATH}: a verbatim meta.emit gate marker appears twice`);
  }
  return { before: runtime.slice(0, b + BEGIN_MARKER.length), block: runtime.slice(b + BEGIN_MARKER.length, e), after: runtime.slice(e) };
}

export function isInSync(): boolean {
  return currentBlock(readText(BOOT_RUNTIME_PATH)).block === expectedBlock();
}

if (import.meta.main) {
  const write = process.argv.includes("--write");
  const check = process.argv.includes("--check");
  if (write === check) {
    console.error("usage: bun scripts/sync-bootstrap-meta-emit-gate.ts --write | --check");
    process.exit(2);
  }
  const runtime = readText(BOOT_RUNTIME_PATH);
  const cur = currentBlock(runtime);
  const want = expectedBlock();
  if (check) {
    if (cur.block === want) {
      console.log("bootstrap meta.emit gate: in sync with impl#1 (runtime-template.js)");
      process.exit(0);
    }
    console.error("bootstrap meta.emit gate: STALE — run `bun scripts/sync-bootstrap-meta-emit-gate.ts --write`");
    process.exit(1);
  }
  if (cur.block !== want) writeFileSync(BOOT_RUNTIME_PATH, cur.before + want + cur.after);
  console.log(cur.block === want ? "bootstrap meta.emit gate: already in sync" : "bootstrap meta.emit gate: rewritten from impl#1");
}
