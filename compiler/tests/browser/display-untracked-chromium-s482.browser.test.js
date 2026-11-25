/**
 * s482-display-untracked — W-DISPLAY-UNTRACKED (§6.15 A5) in a REAL browser (Playwright Chromium): the stale
 * display the warning predicts, and its fix-it curing it. change-id: s482-display-untracked.
 *
 * RULED S482, ruling:user-voice-scrml.md-S482-display-untracked-warning — *"build it — a warning when a plain
 * `let` that is displayed is written by a later effect, request or handler, with a fix-it to make it a cell."*
 * (owner: "yes, your recommendations on all four"). The compile-side pins:
 * compiler/self-host-v2/slice-m4/display-untracked-s482.test.js.
 *
 * Skipped (with a note) when Chromium cannot be launched on this machine.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../../..");

let chromium = null;
try {
  ({ chromium } = await import("playwright"));
} catch {
  chromium = null;
}

let browser = null;
let launchError = null;
let dir = null;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "s482-display-untracked-chromium-"));
  if (!chromium) { launchError = "playwright not installed"; return; }
  try {
    browser = await chromium.launch();
  } catch (e) {
    launchError = String(e?.message ?? e).split("\n")[0];
  }
});

afterAll(async () => {
  if (browser) await browser.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

let n = 0;
// compile with the bootstrap; return the output directory and the compiler's printed output (its warnings)
function build(src) {
  const case_ = join(dir, `c${n++}`);
  const file = case_ + ".scrml";
  writeFileSync(file, src);
  const p = Bun.spawnSync(["bun", join(ROOT, "scripts/scrml-boot.ts"), "compile", file, "--output-dir", case_], { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  const said = p.stderr.toString() + p.stdout.toString();
  if (p.exitCode !== 0) throw new Error("did not compile: " + said);
  return { out: case_, said };
}

// load `out`, read each `#id` after the load and after each click
async function load(out, ids, clicks = []) {
  const srv = Bun.serve({ port: 0, fetch(req) {
    const p = new URL(req.url).pathname;
    return new Response(Bun.file(join(out, p === "/" ? "index.html" : p)), { headers: { "content-type": p.endsWith(".js") ? "text/javascript" : "text/html" } });
  } });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const read = () => page.evaluate((xs) => xs.map((id) => (document.getElementById(id)?.textContent ?? "<none>").replace(/\s+/g, " ").trim()), ids);
  try {
    await page.goto(`http://localhost:${srv.port}/`);
    await page.waitForFunction((id) => document.getElementById(id) !== null, ids[0], { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(100);
    const texts = [await read()];
    for (const c of clicks) {
      await page.click(c);
      await page.waitForTimeout(100);
      texts.push(await read());
    }
    return { errors, texts };
  } finally {
    await page.close();
    srv.stop();
  }
}

function skip() {
  if (!browser) { console.log(`[skip] Chromium unavailable: ${launchError}`); return true; }
  return false;
}

describe("W-DISPLAY-UNTRACKED (Chromium)", () => {
  test("a handler writes a displayed `let`: warned, and the display stays stale; the fix-it cures it", async () => {
    if (skip()) return;
    const stale = build(`<program>
\${ let n: int = 1; }
let <seen:int=0/>
<p id="d">\${n}</p>
<button id="b" onclick=\${ n = n + 1; @seen = n; }>+</button>
<p id="s">\${@seen}</p>
</program>
`);
    expect(stale.said).toContain("W-DISPLAY-UNTRACKED");
    expect(stale.said).toContain("Make `n` a cell: replace `let n: int = 1;` with `let <n:int=1/>`");
    // `#s` proves the handler ran and `n` is 3 after two clicks; `#d` still shows 1
    expect(await load(stale.out, ["d", "s"], ["#b", "#b"])).toEqual({ errors: [], texts: [["1", "0"], ["1", "2"], ["1", "3"]] });

    // the fix-it applied: `let <n:int=1/>`, `@n` for `n`
    const cured = build(`<program>
let <n:int=1/>
let <seen:int=0/>
<p id="d">\${@n}</p>
<button id="b" onclick=\${ @n = @n + 1; @seen = @n; }>+</button>
<p id="s">\${@seen}</p>
</program>
`);
    expect(cured.said).not.toContain("W-DISPLAY-UNTRACKED");
    expect(await load(cured.out, ["d", "s"], ["#b", "#b"])).toEqual({ errors: [], texts: [["1", "0"], ["2", "2"], ["3", "3"]] });
  }, 120000);

  test("an `<effect>` held to after the body (Q6) writes a displayed `let`: warned, stale; the fix-it cures it", async () => {
    if (skip()) return;
    // `#s` is written by a handler that reads `n`: it proves the effect ran (n = 7) while `#d` shows 1
    const stale = build(`<program>
\${ let n: int = 1; }
let <a:int=0/>
let <seen:int=0/>
<effect deps=[@a]>\${ n = 7; }</>
\${ @a = 1; }
<p id="d">\${n}</p>
<button id="b" onclick=\${ @seen = n; }>see</button>
<p id="s">\${@seen}</p>
</program>
`);
    expect(stale.said).toContain("W-DISPLAY-UNTRACKED");
    expect(stale.said).toContain("An `<effect>` may not write a cell");
    expect(await load(stale.out, ["d", "s"], ["#b"])).toEqual({ errors: [], texts: [["1", "0"], ["1", "7"]] });
    // the fix-it applied: `n` a cell, the write moved out of the effect into the code that writes its trigger
    const cured = build(`<program>
let <n:int=1/>
let <a:int=0/>
let <seen:int=0/>
\${ @a = 1; @n = 7; }
<p id="d">\${@n}</p>
<button id="b" onclick=\${ @seen = @n; }>see</button>
<p id="s">\${@seen}</p>
</program>
`);
    expect(cured.said).not.toContain("W-DISPLAY-UNTRACKED");
    expect(await load(cured.out, ["d", "s"], ["#b"])).toEqual({ errors: [], texts: [["7", "0"], ["7", "7"]] });
  }, 120000);

  // r2 of #2107 (F-A): the string fix-it is parenthesized, so applying it keeps the value — a newline, a tab /
  // CR and `${` (the quoted opener form turns `\n` into `n`, g-boot-opener-string-escapes-s482; the reviewer's
  // probes11 q1 → q2 LETTER-N, q3 NEWLINE)
  test("a string fix-it, applied as printed, keeps the value (newline, tab / CR, `${`)", async () => {
    if (skip()) return;
    const cases = [
      ['"a\\nb"', '"a" + "\\n" + "b"'],
      ['"a\\tb\\r"', '"a" + "\\t" + "b" + "\\r"'],
      ['"x${1}y"', '"x$" + "{1}y"'],
    ];
    for (const [lit, same] of cases) {
      const orig = build(`<program>
\${ let s: string = ${lit}; }
<p id="d">\${s == ${same} ? "SAME" : "OTHER"}</p>
<button id="b" onclick=\${ s = "z"; }>+</button>
</program>
`);
      const m = orig.said.match(/with `(let <s:string=[^`]*\/>)`/);
      expect(m).not.toBe(null);
      expect(m[1]).toBe(`let <s:string=(${lit})/>`);
      expect(await load(orig.out, ["d"])).toEqual({ errors: [], texts: [["SAME"]] });
      // the fix-it exactly as printed
      const cured = build(`<program>
${m[1]}
<p id="d">\${@s == ${same} ? "SAME" : "OTHER"}</p>
<button id="b" onclick=\${ @s = "z"; }>+</button>
</program>
`);
      expect(cured.said).not.toContain("W-DISPLAY-UNTRACKED");
      expect(await load(cured.out, ["d"], ["#b"])).toEqual({ errors: [], texts: [["SAME"], ["OTHER"]] });
    }
  }, 120000);
});
