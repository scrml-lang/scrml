/**
 * s482-hold-body — effect and request runs triggered during the program body are held until it ends, then
 * run in trigger order, in a REAL browser (Playwright Chromium). change-id: s482-hold-body.
 *
 * RULED S482, ruling:user-voice-scrml.md-S482-hold-until-body-ends — Q6 (b): "the runtime holds effect and
 * request runs triggered during the body, running them after the body in trigger order" (owner: "yes, the
 * runtime holds them"). SPEC §7.6 R5. Gaps g-boot-effect-fires-in-body-before-place-s482 (base `1 1`),
 * g-boot-request-runs-in-body-s482 (base `2 1`), g-boot-construct-request-write-s482 (base: refused).
 * The happy-dom pins: compiler/self-host-v2/slice-m4/hold-body-s482.test.js.
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
  dir = mkdtempSync(join(tmpdir(), "s482-hold-body-chromium-"));
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
function build(src) {
  const case_ = join(dir, `c${n++}`);
  const file = case_ + ".scrml";
  writeFileSync(file, src);
  const p = Bun.spawnSync(["bun", join(ROOT, "scripts/scrml-boot.ts"), "compile", file, "--output-dir", case_], { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  if (p.exitCode !== 0) throw new Error("did not compile: " + p.stderr.toString() + p.stdout.toString());
  return case_;
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

const N = `\${ let n: int = 1; }
\${ n = 5; }`;
const LOG = `\${ let log: string = ""; }
\${ function lg(s: string) -> int { log = log + s; return 1; } }
let <o:string=""/>`;

describe("the Q6 body hold (Chromium)", () => {
  test("gap probe r1-effect-fire: the effect runs after the body and reads `k` = 5 (base `1 1`)", async () => {
    if (skip()) return;
    const out = build(`<program>
${N}
\${ let out: int = 0; }
\${ function note() -> int { out = k; return 1; } }
let <a:int=0/>
let <o:int=0/>
<effect deps=[@a]>\${ note(); }</>
\${ @a = 2; }
\${ const k: int = n + 0; }
<p id="s">\${out} \${k}</p>
<button id="b" onclick=\${ @o = out; }>go</button>
<p id="o">\${@o}</p>
</program>
`);
    expect(await load(out, ["s", "o"], ["#b"])).toEqual({ errors: [], texts: [["0 5", "0"], ["0 5", "5"]] });
  }, 120000);

  test("gap probe r1-request: the request's mount run is held — `6 5`, the source order (base `2 1`)", async () => {
    if (skip()) return;
    const out = build(`<program>
${N}
let <m:int=0/>
\${ function cnt(x: int) -> int { return x + k; } }
<request id="load">\${ @m = cnt(1); }</request>
\${ const k: int = n + 0; }
<p id="s">\${@m} \${k}</p>
</program>
`);
    expect(await load(out, ["s"])).toEqual({ errors: [], texts: [["6 5"]] });
  }, 120000);

  test("trigger order: three effects, writes `@c, @a, @b, @c` — c a b, once each (base `cabc`)", async () => {
    if (skip()) return;
    const out = build(`<program>
${LOG}
let <a:int=0/>
let <b2:int=0/>
let <c:int=0/>
<effect deps=[@a]>\${ lg("a"); }</>
<effect deps=[@b2]>\${ lg("b"); }</>
<effect deps=[@c]>\${ lg("c"); }</>
\${ @c = 1; }
\${ @a = 1; }
\${ @b2 = 1; }
\${ @c = 2; }
<p id="s">[\${log}]</p>
<button id="b" onclick=\${ @o = log; }>go</button>
<p id="o">\${@o}</p>
</program>
`);
    expect(await load(out, ["s", "o"], ["#b"])).toEqual({ errors: [], texts: [["[]", ""], ["[]", "cab"]] });
  }, 120000);

  test("a request and an effect in one `if=` construct: R then E, each reading `k` = 5 (base `[RE] 2 1`)", async () => {
    if (skip()) return;
    const out = build(`<program>
${N}
\${ let out: int = 0; }
${LOG}
\${ function lgk(s: string) -> int { log = log + s; out = out + k; return 1; } }
let <a:int=0/>
let <m:int=0/>
let <o2:int=0/>
<div if=(true)><section><effect deps=[@a]>\${ lgk("E"); }</><request id="rq" deps=[]>\${ @m = lgk("R"); }</request><b>\${@m}</b></section></div>
\${ @a = 2; }
\${ const k: int = n + 0; }
<p id="s">[\${log}] \${out} \${k}</p>
<button id="b" onclick=\${ @o = log; @o2 = out; }>go</button>
<p id="o">\${@o} \${@o2}</p>
</program>
`);
    expect(await load(out, ["s", "o"], ["#b"])).toEqual({ errors: [], texts: [["[] 0 5", "0"], ["[] 0 5", "RE 10"]] });
  }, 120000);

  test("an `<each>` row's effect, two rows: out 10 after the body (base `2 1` / 2)", async () => {
    if (skip()) return;
    const out = build(`<program>
${N}
\${ let out: int = 0; }
\${ function note() -> int { out = out + k; return 1; } }
let <a:int=0/>
let <o:int=0/>
<xs:int[replace]=([1, 2])/>
<ul><each in=@xs as x><li>\${x}<effect deps=[@a]>\${ note(); }</></li></each></ul>
\${ @a = 2; }
\${ const k: int = n + 0; }
<p id="s">\${out} \${k}</p>
<button id="b" onclick=\${ @o = out; }>go</button>
<p id="o">\${@o}</p>
</program>
`);
    expect(await load(out, ["s", "o"], ["#b"])).toEqual({ errors: [], texts: [["0 5", "0"], ["0 5", "10"]] });
  }, 120000);

  test("g-boot-construct-request-write-s482 lifted: q01 compiles, k = 1, as its twin with the request after (base: refused)", async () => {
    if (skip()) return;
    const pre = `\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
\${ function rd() -> int { return n; } }
let <r:int=0/>`;
    const a = build(`<program>\n${pre}\n<div if=(true)><request id="rq">\${ @r = bump(); }</request>\${ const k: int = rd() + 0; }<p id="o">\${k}</p></div>\n</program>\n`);
    const b = build(`<program>\n${pre}\n<div if=(true)>\${ const k: int = rd() + 0; }<p id="o">\${k}</p><request id="rq">\${ @r = bump(); }</request></div>\n</program>\n`);
    expect(await load(a, ["o"])).toEqual({ errors: [], texts: [["1"]] });
    expect(await load(b, ["o"])).toEqual({ errors: [], texts: [["1"]] });
  }, 120000);

  // RULED S482, ruling:user-voice-scrml.md-S482-drop-held-runs-on-trap — a body that traps drops its held runs:
  // the held request makes no server call (before this round it ran after the trap and called the server). The held
  // effect's drop is pinned in slice-m1/hold-body.runtime.test.js (no DOM is inserted after a trap to show it here).
  test("a body that traps: the held request is dropped — no server call, only the trap reported, nothing inserted", async () => {
    if (skip()) return;
    const out = build(`<program>
\${ let n: int = 1; }
\${ server function ping() -> int { return 1; } }
let <a:int=0/>
let <m:int=0/>
<effect deps=[@a]>\${ n = 9; }</>
<request id="rq" deps=[]>\${ @m = ping(); }</request>
\${ @a = 1; }
\${ let neg: int = 0 - 1; }
\${ const s: string = "a".repeat(neg); }
<p id="o">\${s} \${n}</p>
</program>
`);
    const srv = Bun.serve({ port: 0, fetch(req) {
      const p = new URL(req.url).pathname;
      return new Response(Bun.file(join(out, p === "/" ? "index.html" : p)), { headers: { "content-type": p.endsWith(".js") ? "text/javascript" : "text/html" } });
    } });
    const page = await browser.newPage();
    const errors = [], calls = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => { if (new URL(r.url()).pathname.startsWith("/_scrml/")) calls.push(r.url()); });
    try {
      await page.goto(`http://localhost:${srv.port}/`);
      await page.waitForTimeout(300);
      expect(calls).toEqual([]);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain("E-INDEX-OUT-OF-RANGE-RT");
      expect(await page.evaluate(() => document.getElementById("o"))).toBe(null);
    } finally {
      await page.close();
      srv.stop();
    }
  }, 120000);
});
