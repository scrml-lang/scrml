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
    // the cell fix-it alone is refused by this compiler (INTERIM, Core C-R1) — not a §6.7.7 rule
    expect(w[0].message).toContain("This compiler refuses a `<request>` body that writes a cell other than its own (E-BOOTSTRAP-UNSUPPORTED — Core C-R1, INTERIM: a side-effecting request body is not ruled)");
    expect(w[0].message).not.toContain("§6.7.7");
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

  // r2 of #2107 (F-B): §22.5 exempts only "a `meta.get` in a timer or cleanup callback"; a function value the
  // body calls, or hands to a function that calls it, runs while the run is in progress (the reviewer's
  // seen-lam / seen-arg: Chromium shows the block re-run and the display stale)
  test("a re-running `^{ }` whose `meta.get` is in a function value the body calls (r2 F-B)", async () => {
    const CALLIT = "${ function callIt(g: () => int) -> int { return g(); } }\n";
    for (const body of ['const f = () => meta.get("a"); n = f() + 10;', 'n = callIt(() => meta.get("a")) + 10;']) {
      const w = await warns(`<program>\n${L}let <a:int=0/>\n${CALLIT}<div>^{ ${body} }</div>\n<p>\${n}</p>\n<button onclick=\${ @a = 1; }>+</button>\n</program>\n`);
      expect(w.map((x) => x.code)).toEqual([W]);
      expect(w[0].message).toContain("it re-runs when a cell it reads through `meta.get`");
    }
  }, 120000);

  test("a runtime `^{ }` block that re-runs", async () => {
    const w = await warns(`<program>\n${L}let <a:int=0/>\n<div>^{ n = meta.get("a"); }</div>\n<p>\${n}</p>\n</program>\n`);
    expect(w.map((x) => x.code)).toEqual([W]);
    expect(w[0].message).toContain("the runtime `^{ }` block at line 4 (it re-runs when a cell it reads through `meta.get` / `meta.bindings` changes, §22.5) writes `n`");
  }, 120000);

  // r1 of #2107 (F1): a cell write in the same writer re-renders nothing when it is conditional, in the
  // other branch, or writes the same value — so it never suppresses the warning (the reviewer's
  // fn27 / fn30 / fn29, each stale in Chromium)
  test("a writer that also writes a cell the display reads still warns (conditional, other branch, same value)", async () => {
    const T = "let <tick:int=0/>\n<p>${@tick + n}</p>\n";
    for (const h of [
      "n = n + 10; if (n > 1000) { @tick = @tick + 1; }",
      "if (n > 100) { @tick = 1; } else { n = n + 10; }",
      "n = n + 10; @tick = 0;",
      "n = n + 1; @tick = @tick + 1;",
    ]) {
      const w = await warns(`<program>\n${L}${T}<button onclick=\${ ${h} }>+</button>\n</program>\n`);
      expect(w.map((x) => x.code)).toEqual([W]);
    }
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

  // r2 of #2107 (F-A): a string is always parenthesized — the opener's quoted value has only the §4.18.3 escapes (`\n` is E-PARSE-001, §5.2 RULED S482; it was dropped to `n` before #2110) and
  // reads `${…}` as a reactive template (g-boot-opener-string-escapes-s482), so only `=("…")` keeps the value
  // (the reviewer's q1 → q3, x2p; Chromium: display-untracked-chromium-s482.browser.test.js)
  test("the fix-it quotes a string literal re-escaped, parenthesized (r1 F4, r2 F-A)", async () => {
    const w = await warns(`<program>\n\${ let s: string = "a\\"b\\\\c"; }\n<p>\${s}</p>\n<button onclick=\${ s = "z"; }>+</button>\n</program>\n`);
    expect(w[0].message).toContain('replace `let s: string = "a\\"b\\\\c";` with `let <s:string=("a\\"b\\\\c")/>`');
  }, 120000);

  test("a string with a newline, a tab / CR, `${`, or another control character keeps its value (r2 F-A)", async () => {
    const fix = async (lit) => (await warns(`<program>\n\${ let s: string = ${lit}; }\n<p>\${s}</p>\n<button onclick=\${ s = "z"; }>+</button>\n</program>\n`))[0].message;
    expect(await fix('"a\\nb"')).toContain('with `let <s:string=("a\\nb")/>`');
    expect(await fix('"a\\tb\\r"')).toContain('with `let <s:string=("a\\tb\\r")/>`');
    expect(await fix('"x${1}y"')).toContain('with `let <s:string=("x${1}y")/>`');
    expect(await fix('"a\\x01b"')).toContain('with `let <s:string=("a\\x01b")/>`');
    // the fix-it never prints the quoted opener form for a string
    expect(await fix('"a\\nb"')).not.toContain('<s:string="');
  }, 120000);

  test("the parenthesized string fix-it, applied, compiles (the reviewer's q3 / x2p)", async () => {
    for (const lit of ['"a\\nb"', '"a\\tb\\r"', '"x${1}y"', '"a\\x01b"']) {
      expect(await warns(`<program>\nlet <s:string=(${lit})/>\n<p>\${@s}</p>\n<button onclick=\${ @s = "z"; }>+</button>\n</program>\n`)).toEqual([]);
    }
  }, 120000);

  test("a tape fix-it keeps the written grants and adds what the writes need (r1 F4)", async () => {
    // a position write needs `write` (granted already); only the edit grants the writes add are added
    const w = await warns(`<program>\n\${ let o: int[free, write] = [1]; }\n<p>\${o[0]}</p>\n<button onclick=\${ o[0] = 5; }>+</button>\n</program>\n`);
    expect(w[0].message).toContain("replace `let o: int[free, write] = …;` with `<o:int[free, write]=(…)/>`");
    expect(w[0].message).not.toContain("replace]");
  }, 120000);

  // r2 of #2107 (F-E): an edit that grows or shrinks a tape needs `free` as well (E-WRITE-INVARIANT
  // otherwise — the reviewer's y6), so a grant-less tape's fix-it adds it
  test("a tape fix-it adds `free` for an edit that grows or shrinks the tape (r2 F-E)", async () => {
    const r = await result(`<program>\n\${ let xs: int[] = [1, 2]; }\n<p>\${xs.length}</p>\n<button onclick=\${ xs.append(3); }>+</button>\n</program>\n`);
    const w = r.diagnostics.filter((d) => d.code === W);
    expect(w.length).toBeGreaterThan(0);
    expect(w[0].message).toContain("replace `let xs: int[] = …;` with `<xs:int[free, append]=(…)/>`");
    expect(w[0].message).toContain("`free`: an edit that grows or shrinks a tape needs it");
    // the fix-it applied compiles
    expect(await warns(`<program>\n<xs:int[free, append]=([1, 2])/>\n<p>\${@xs.length}</p>\n<button onclick=\${ @xs.append(3); }>+</button>\n</program>\n`)).toEqual([]);
    // a written `free` is not added twice
    const w2 = await warns(`<program>\n\${ let ys: int[free, append] = [1]; }\n<p>\${ys.length}</p>\n<button onclick=\${ ys.append(3); }>+</button>\n</program>\n`);
    expect(w2[0].message).toContain("with `<ys:int[free, append]=(…)/>`");
  }, 120000);

  // #2107 r2 review F1 (lane s482-opener-escapes): a whole-value write of a §66.11.2 recognized shape is that
  // edit — `xs = [...xs, e]` an end-append, `xs = xs.filter(…)` a shrink — so it needs the edit's grant and,
  // as it resizes the tape, `free` (the fix-it used to print `[replace]`, which applied is E-WRITE-INVARIANT)
  test("a whole-value write of a recognized shape needs that edit's grant, and `free` when it resizes (r2 F1)", async () => {
    const fixOf = async (decl, write) => {
      const r = await result(`<program>\n\${ ${decl} }\n<p>\${xs.length}</p>\n<button onclick=\${ ${write} }>+</button>\n</program>\n`);
      const w = r.diagnostics.filter((d) => d.code === W);
      expect(w.length).toBeGreaterThan(0);
      return w[0].message;
    };
    const cases = [
      ["let xs: int[] = [1, 2];", "xs = [...xs, 4];", "<xs:int[free, append]=(…)/>", "@xs = [...@xs, 4];", "<xs:int[free, append]=([1, 2])/>"],
      ["let xs: int[] = [1, 2];", "xs = [0, ...xs];", "<xs:int[free, prepend]=(…)/>", "@xs = [0, ...@xs];", "<xs:int[free, prepend]=([1, 2])/>"],
      ["let xs: int[replace] = [1, 2];", "xs = [...xs, 4];", "<xs:int[replace, free, append]=(…)/>", "@xs = [...@xs, 4];", "<xs:int[replace, free, append]=([1, 2])/>"],
      ["let xs: int[] = [1, 2];", "xs = xs.filter((x) => x > 1);", "<xs:int[free, remove]=(…)/>", "@xs = @xs.filter((x) => x > 1);", "<xs:int[free, remove]=([1, 2])/>"],
      ["let xs: int[] = [1, 2];", "xs = xs.map((x) => x + 1);", "<xs:int[write]=(…)/>", "@xs = @xs.map((x) => x + 1);", "<xs:int[write]=([1, 2])/>"],
      ["let xs: int[] = [1, 2];", "xs = [9];", "<xs:int[replace]=(…)/>", "@xs = [9];", "<xs:int[replace]=([1, 2])/>"],
    ];
    for (const [decl, write, fix, cellWrite, cell] of cases) {
      const m = await fixOf(decl, write);
      expect(m).toContain("with `" + fix + "`");
      // the fix-it applied compiles, with no warning
      expect(await warns(`<program>\n${cell}\n<p>\${@xs.length}</p>\n<button onclick=\${ ${cellWrite} }>+</button>\n</program>\n`)).toEqual([]);
    }
  }, 240000);

  // #2110 review L1 (lane s482-escapes-ruled): a position write the `let`'s type does not grant is refused
  // (E-WRITE-NOT-GRANTED) — its write is still recorded, so the fix-it adds `write` for it (it used to be
  // missing: `[free, append]` applied was the next E-WRITE-NOT-GRANTED, naming `write`)
  test("a refused position write adds `write` to the tape fix-it (#2110 L1)", async () => {
    const cases = [
      ["let xs: int[] = [1, 2];", "xs = [...xs, 4]; xs[0] = 7;", "int[free, append, write]", "@xs = [...@xs, 4]; @xs[0] = 7;"],
      ["let xs: int[] = [1, 2];", "xs.append(4); xs[0] = 7;", "int[free, append, write]", "@xs.append(4); @xs[0] = 7;"],
      ["let xs: int[] = [1, 2];", "xs = xs.filter((x) => x > 1); xs[1] = 7;", "int[free, remove, write]", "@xs = @xs.filter((x) => x > 1); @xs[1] = 7;"],
      ["let xs: int[free, append] = [1, 2];", "xs.append(4); xs[0] = 7;", "int[free, append, write]", "@xs.append(4); @xs[0] = 7;"],
      // a refused position write alone: the warning (and its fix-it) is now given too
      ["let xs: int[] = [1, 2];", "xs[0] = 7;", "int[write]", "@xs[0] = 7;"],
    ];
    for (const [decl, write, ty, cellWrite] of cases) {
      const r = await result(`<program>\n\${ ${decl} }\n<p>\${xs.length}</p>\n<button onclick=\${ ${write} }>+</button>\n</program>\n`);
      // the original is refused for the ungranted write — and only for that (no new diagnostic)
      expect(r.diagnostics.filter((d) => d.severity === "error").every((d) => d.code === "E-WRITE-NOT-GRANTED")).toBe(true);
      const w = r.diagnostics.filter((d) => d.code === W);
      expect(w.length).toBe(1);
      expect(w[0].message).toContain("with `<xs:" + ty + "=(…)/>`");
      // the fix-it applied compiles, with no warning
      expect(await warns(`<program>\n<xs:${ty}=([1, 2])/>\n<p>\${@xs.length}</p>\n<button onclick=\${ ${cellWrite} }>+</button>\n</program>\n`)).toEqual([]);
    }
  }, 240000);

  // #2107 r2 review INFO-1 (lane s482-opener-escapes): a lone surrogate and U+2028 / U+2029 are spelled
  // `\uXXXX` in the string fix-it (raw, the terminal shows U+FFFD and a line separator splits the line);
  // a surrogate PAIR (an emoji) stays as written
  test("a string fix-it spells a lone surrogate and U+2028 / U+2029 as `\\uXXXX` (r2 INFO-1)", async () => {
    const fix = async (lit) => (await warns(`<program>\n\${ let s: string = ${lit}; }\n<p>\${s}</p>\n<button onclick=\${ s = "z"; }>+</button>\n</program>\n`))[0].message;
    expect(await fix('"a\\uD800b"')).toContain('with `let <s:string=("a\\uD800b")/>`');
    expect(await fix('"a\\uDC00"')).toContain('with `let <s:string=("a\\uDC00")/>`');
    expect(await fix('"a\\u2028b\\u2029"')).toContain('with `let <s:string=("a\\u2028b\\u2029")/>`');
    expect(await fix('"a\\uD83D\\uDE00b"')).toContain('with `let <s:string=("a\u{1F600}b")/>`');
  }, 120000);

  // r2 of #2107 (F-E): where this compiler refuses the cell form of the edit (E-BOOTSTRAP-UNSUPPORTED,
  // INTERIM — the reviewer's y8, y10, y11), the message says so and prints no cell fix-it that does not compile
  test("no cell fix-it for an edit the cell form does not build yet (r2 F-E)", async () => {
    const cases = [
      ["${ let xs: int[free, remove, write] = [1, 2]; }", "${xs[0]}", "xs.remove(0);", "`xs.remove(…)`"],
      ["${ let m: int[write][write] = [[1, 2]]; }", "${m[0][1]}", "m[0][1] = 9;", "a write through a tape position of `m`"],
      ["${ type P:struct = { xs: int[write] } }\n${ let q: P = { xs: [1] }; }", "${q.xs[0]}", "q.xs[0] = 9;", "a position write of a sub-field tape of `q`"],
    ];
    for (const [decl, disp, write, what] of cases) {
      const w = await warns(`<program>\n${decl}\n<p>${disp}</p>\n<button onclick=\${ ${write} }>+</button>\n</program>\n`);
      expect(w.length).toBeGreaterThan(0);
      expect(w[0].message).toContain("is not yet supported for this edit: this compiler does not yet build " + what);
      expect(w[0].message).toContain("on a cell (E-BOOTSTRAP-UNSUPPORTED, INTERIM), so no cell fix-it is given");
      expect(w[0].message).not.toContain("Make `");
    }
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

  // r1 of #2107 (item 1): spine code after the display's place is not a writer — S481, ruling:user-voice-
  // scrml.md-S481-body-run-order: "A display of a `free` value reads it where it stands" (conformance
  // body-top/free-display-reads-in-place pins the in-place value as the intended one)
  test("a body-top statement after the display's place (the display reads the value where it stands, S481)", async () => {
    expect(await warns(`<program>\n${L}<p>\${n}</p>\n\${ n = 5; }\n</program>\n`)).toEqual([]);
  }, 120000);

  test("a component display, a body-top write after the component's use (fn25)", async () => {
    expect(await warns(`${L}<cp t:int=0>\n</> renders <b>\${n}</b>\n<program>\n<cp/>\n\${ n = 5; }\n</program>\n`)).toEqual([]);
  }, 120000);

  test("a `^{ }` that runs once (no `meta.get`), before or after the display", async () => {
    expect(await warns(`<program>\n${L}<div>^{ n = 4; }</div>\n<p>\${n}</p>\n</program>\n`)).toEqual([]);
    expect(await warns(`<program>\n${L}<p>\${n}</p>\n<div>^{ n = 4; }</div>\n</program>\n`)).toEqual([]);
  }, 120000);

  // r1 of #2107 (F2): §22.5 — "A direct `@x` read in the body, or one in a function the body calls, is not
  // a dependency": such a block runs once, at its place (the reviewer's rr01)
  // r2 of #2107 (F-B): "A `meta.get` in a timer or cleanup callback reads the cell and subscribes nothing" (§22.5)
  test("a `^{ }` whose only `meta.get` is in a function passed directly to `^.cleanup` / `^.timeout` does not re-run", async () => {
    for (const cb of ['meta.cleanup(() => { const v: int = meta.get("a"); });', 'meta.timeout(10, () => { const v: int = meta.get("a"); });']) {
      expect(await warns(`<program>\n${L}let <a:int=0/>\n<div>^{ ${cb} n = 11; }</div>\n<p>\${n}</p>\n<button onclick=\${ @a = 1; }>+</button>\n</program>\n`)).toEqual([]);
    }
  }, 120000);

  test("a `^{ }` that reads a cell directly (not a §22.5 dependency) does not re-run", async () => {
    expect(await warns(`<program>\n${L}let <a:int=0/>\n<div>^{ n = @a + 10; }</div>\n<p>\${n}</p>\n<button onclick=\${ @a = 1; }>+</button>\n</program>\n`)).toEqual([]);
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
