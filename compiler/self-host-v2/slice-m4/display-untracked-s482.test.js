// display-untracked-s482.test.js — lane s482-display-untracked: W-DISPLAY-UNTRACKED (§6.15 A5).
//
// RULED S482, ruling:user-voice-scrml.md-S482-display-untracked-warning — rec as presented: *"build it — a
// warning when a plain `let` that is displayed is written by a later effect, request or handler, with a fix-it
// to make it a cell."* RULED yes (owner: "yes, your recommendations on all four").
//
// A display of a plain file-scope `let` shows the value the `let` had when the display rendered; a write of a
// plain `let` marks nothing (§6.6), so code that runs after the display renders and writes the `let` leaves the
// display stale. The warning names the display, the `let`, one writer (with its call chain) and the fix-it (the
// cell declaration, `@n` for `n`). It is a warning: the compile still succeeds. The Chromium demonstration (the
// stale display, and the fix-it curing it): compiler/tests/browser/display-untracked-chromium-s482.browser.test.js.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";
import { runBootstrapArtifact } from "../../../scripts/bootstrap-conformance.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-display-untracked-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

const W = "W-DISPLAY-UNTRACKED";
let k = 0;
async function result(src) {
  const d = join(dir, `p${k++}`);
  mkdirSync(d);
  const file = join(d, "main.scrml");
  writeFileSync(file, src);
  return await compileSource(file);
}
// the W-DISPLAY-UNTRACKED diagnostics of a program that must compile (a warning never fails it)
async function warns(src) {
  const r = await result(src);
  const errs = r.diagnostics.filter((d) => d.severity === "error");
  if (!r.ok || errs.length > 0) throw new Error("did not compile: " + errs.map((d) => d.code + " " + d.message).join("; "));
  const ws = r.diagnostics.filter((d) => d.code === W);
  for (const w of ws) expect(w.severity).toBe("warning");
  return ws;
}

const L = "${ let n: int = 1; }\n";
const BUMP = "${ function bump() -> int { n = 5; return 0; } }\n";
const FIX = "Make `n` a cell: replace `let n: int = 1;` with `let <n:int=1/>`, and write `@n` for `n` at every read and write";

describe("W-DISPLAY-UNTRACKED — a display of a `let` that a later writer writes (positives, one per writer kind)", () => {
  test("an event handler — names the display, the `let`, the writer and the fix-it", async () => {
    const w = await warns(`<program>\n${L}<p>\${n}</p>\n<button onclick=\${ n = n + 1; }>+</button>\n</program>\n`);
    expect(w.length).toBe(1);
    expect(w[0].message).toContain("the interpolation at line 3 reads `n`, a file-scope `let`, and the `onclick=` handler on `<button>` at line 4 writes `n` after this display renders");
    expect(w[0].message).toContain("(§6.15 A5)");
    expect(w[0].message).toContain(FIX);
    expect(w[0].message).not.toContain("may not write a cell");
  }, 120000);

  test("an `<effect>` body", async () => {
    const w = await warns(`<program>\n${L}let <a:int=0/>\n<effect deps=[@a]>\${ n = 2; }</>\n<p>\${n}</p>\n<button onclick=\${ @a = 1; }>+</button>\n</program>\n`);
    expect(w.map((x) => x.code)).toEqual([W]);
    expect(w[0].message).toContain("the `<effect>` body at line 4 writes `n` after this display renders");
    // the cell fix-it alone would be E-EFFECT-WRITES-STATE: the write moves out of the effect too
    expect(w[0].message).toContain("An `<effect>` may not write a cell, directly or through a call (§6.7.4, E-EFFECT-WRITES-STATE): with `n` a cell, move this write out of the effect");
  }, 120000);

  test("a `when … changes` body", async () => {
    const w = await warns(`<program>\n${L}let <a:int=0/>\nwhen @a changes { n = 2; }\n<p>\${n}</p>\n<button onclick=\${ @a = 1; }>+</button>\n</program>\n`);
    expect(w.map((x) => x.code)).toEqual([W]);
    expect(w[0].message).toContain("the `when … changes` body at line 4 writes `n`");
  }, 120000);

  test("a `<request>` body, through a call", async () => {
    const w = await warns(`<program>\n${L}${BUMP}let <r:int=0/>\n<request id="rq" deps=[]>\${ @r = bump(); }</request>\n<p>\${n}</p>\n</program>\n`);
    expect(w.map((x) => x.code)).toEqual([W]);
    expect(w[0].message).toContain("the `<request>` body at line 5 writes `n` (through `bump() → n`) after this display renders");
    expect(w[0].message).toContain("A `<request>` body writes only its own cell (§6.7.7)");
  }, 120000);

  test("a held run: an effect the body triggers before the display runs after the body (Q6)", async () => {
    const w = await warns(`<program>\n${L}let <a:int=0/>\n<effect deps=[@a]>\${ n = 2; }</>\n\${ @a = 1; }\n<p>\${n}</p>\n</program>\n`);
    expect(w.map((x) => x.code)).toEqual([W]);
    expect(w[0].message).toContain("the `<effect>` body at line 4 writes `n`");
  }, 120000);

  test("a transitive call chain from a handler", async () => {
    const w = await warns(`<program>\n${L}${BUMP}\${ function inc() -> int { return bump() + 1; } }\n<p>\${n}</p>\n<button onclick=\${ inc(); }>+</button>\n</program>\n`);
    expect(w.map((x) => x.code)).toEqual([W]);
    expect(w[0].message).toContain("writes `n` (through `inc() → bump() → n`)");
  }, 120000);

  test("a handler that is a function reference", async () => {
    const w = await warns(`<program>\n${L}\${ function inc() { n = n + 1; } }\n<p>\${n}</p>\n<button onclick=inc>+</button>\n</program>\n`);
    expect(w.map((x) => x.code)).toEqual([W]);
    expect(w[0].message).toContain("(through `inc() → n`)");
  }, 120000);

  test("a body-top statement after the display's place", async () => {
    const w = await warns(`<program>\n${L}<p>\${n}</p>\n\${ n = 5; }\n</program>\n`);
    expect(w.map((x) => x.code)).toEqual([W]);
    expect(w[0].message).toContain("the body-top statement at line 4 writes `n` later in the body, after this display renders");
  }, 120000);

  test("a runtime `^{ }` block that re-runs", async () => {
    const w = await warns(`<program>\n${L}let <a:int=0/>\n<div>^{ n = meta.get("a"); }</div>\n<p>\${n}</p>\n</program>\n`);
    expect(w.map((x) => x.code)).toEqual([W]);
    expect(w[0].message).toContain("the runtime `^{ }` block at line 4 (it re-runs when a cell it reads changes, §22.5) writes `n`");
  }, 120000);

  test("every display form: an attribute value, an `if=` condition, a read through a call", async () => {
    const H = "<button onclick=${ n = n + 1; }>+</button>\n";
    const a = await warns(`<program>\n${L}<p class=(n > 1 ? "big" : "small")>x</p>\n${H}</program>\n`);
    expect(a[0].message).toContain("the `class=` value on `<p>` at line 3 reads `n`");
    const b = await warns(`<program>\n${L}<p if=(n > 1)>x</p>\n${H}</program>\n`);
    expect(b[0].message).toContain("the `if=` condition on `<p>` at line 3 reads `n`");
    const c = await warns(`<program>\n${L}\${ function shown() -> int { return n * 2; } }\n<p>\${shown()}</p>\n${H}</program>\n`);
    expect(c[0].message).toContain("reads `n`, a file-scope `let` (it calls `shown()`, which reads it: `shown() → n`)");
  }, 120000);

  test("a display inside an `if=` construct, and one in a component's renders", async () => {
    expect((await warns(`<program>\n${L}let <open:bool=true/>\n<div if=(@open)><p>\${n}</p></div>\n<button onclick=\${ n = n + 1; }>+</button>\n</program>\n`)).length).toBe(1);
    const w = await warns(`${L}<cp t:int=0>\n</> renders <span><b>\${n}</b></span>\n<program>\n<cp/>\n<button onclick=\${ n = n + 1; }>+</button>\n</program>\n`);
    expect(w.length).toBe(1);
    expect(w[0].message).toContain("the `onclick=` handler on `<button>` at line 6 writes `n`");
  }, 120000);

  test("the fix-it of a non-literal initializer keeps it, parenthesized", async () => {
    const w = await warns(`<program>\n\${ let m: int = 2 + 3; }\n<p>\${m}</p>\n<button onclick=\${ m = m + 1; }>+</button>\n</program>\n`);
    expect(w[0].message).toContain("replace `let m: int = …;` with `let <m:int=(…)/>` (the same initializer, in the parentheses)");
  }, 120000);
});

describe("W-DISPLAY-UNTRACKED — no warning (negatives)", () => {
  test("a body-top write before the display's place (setup: the display shows the final setup value)", async () => {
    expect(await warns(`<program>\n${L}\${ n = 5; }\n<p>\${n}</p>\n</program>\n`)).toEqual([]);
  }, 120000);

  test("a `let` written only before render, by a spine initializer's call", async () => {
    expect(await warns(`<program>\n${L}${BUMP}\${ const k: int = bump(); }\n<p>\${n} \${k}</p>\n</program>\n`)).toEqual([]);
  }, 120000);

  test("a cell — the fix-it applied", async () => {
    expect(await warns(`<program>\nlet <n:int=1/>\n<p>\${@n}</p>\n<button onclick=\${ @n = @n + 1; }>+</button>\n</program>\n`)).toEqual([]);
  }, 120000);

  test("a `const`", async () => {
    expect(await warns(`<program>\n\${ const c: int = 1; }\n<p>\${c}</p>\n</program>\n`)).toEqual([]);
  }, 120000);

  test("a `let` a handler writes but no display reads", async () => {
    expect(await warns(`<program>\n${L}let <o:int=0/>\n<p>\${@o}</p>\n<button onclick=\${ n = n + 1; @o = n; }>+</button>\n</program>\n`)).toEqual([]);
  }, 120000);

  test("a `let` a handler only reads", async () => {
    expect(await warns(`<program>\n${L}let <o:int=0/>\n<p>\${n}</p>\n<button onclick=\${ @o = n; }>+</button>\n</program>\n`)).toEqual([]);
  }, 120000);

  test("a writer that also writes a cell the display reads (the display re-renders in the same turn)", async () => {
    expect(await warns(`<program>\n${L}let <tick:int=0/>\n<p>\${@tick + n}</p>\n<button onclick=\${ n = n + 1; @tick = @tick + 1; }>+</button>\n</program>\n`)).toEqual([]);
  }, 120000);

  test("a `^{ }` that uses no cell (it runs once, at its place) before the display", async () => {
    expect(await warns(`<program>\n${L}<div>^{ n = 4; }</div>\n<p>\${n}</p>\n</program>\n`)).toEqual([]);
  }, 120000);
});

describe("the stale display the warning predicts (happy-dom)", () => {
  async function texts(src, clicks) {
    const r = await result(src);
    if (!r.ok) throw new Error("did not compile");
    const run = await runBootstrapArtifact(r.client.html, r.client.js, clicks, {}, [], undefined);
    return String(run.body.querySelector("#o")?.textContent ?? "<none>");
  }
  test("the `let` display stays 1 after a click; the cell display is 2", async () => {
    expect(await texts(`<program>\n${L}<p id="o">\${n}</p>\n<button id="b" onclick=\${ n = n + 1; }>+</button>\n</program>\n`, [{ click: "#b" }])).toBe("1");
    expect(await texts(`<program>\nlet <n:int=1/>\n<p id="o">\${@n}</p>\n<button id="b" onclick=\${ @n = @n + 1; }>+</button>\n</program>\n`, [{ click: "#b" }])).toBe("2");
  }, 120000);
});
