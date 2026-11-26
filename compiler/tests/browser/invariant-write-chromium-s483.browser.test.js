/**
 * s483-invariant-2 — declaration invariants checked on every write, in a REAL browser (Playwright Chromium).
 * change-id: s483-invariant-2. SPEC §66.13.5 "When it is checked", "Evaluation order", "Failure".
 *
 * RULED: ruling:user-voice-scrml.md-S483-struct-invariant-syntax item 2 — "check every write, as ruled. The
 * grouped write is the existing spread `@r = { ...@r, start: a, end: b }`: one snapshot, all or nothing, checked
 * once." — "otherwise the E-WRITE-INVARIANT-RT trap before any write (S477)"; ruling:user-voice-scrml.md-S483-
 * invariant-const-read ("Allow compile-time consts (Recommended)").
 * Each run-time trap: the page error names E-WRITE-INVARIANT-RT, the value on screen is unchanged, and the rest
 * of the handler does not run. The happy-dom pins: compiler/self-host-v2/slice-m4/invariant-write-s483.test.js.
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
  dir = mkdtempSync(join(tmpdir(), "s483-invariant-write-chromium-"));
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

// load `out`, read each `#id` after the load and after each click; the page errors raised
async function load(out, ids, clicks = []) {
  const srv = Bun.serve({ port: 0, fetch(req) {
    const p = new URL(req.url).pathname;
    return new Response(Bun.file(join(out, p === "/" ? "index.html" : p)), { headers: { "content-type": p.endsWith(".js") ? "text/javascript" : "text/html" } });
  } });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
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

const RANGE = `    <dateRange:struct>
        let <start:int=0/>
        let <end:int=10/>
    </>
    invariant (start <= end) [ordered]`;
const prog = (body) => `<program>\n${body}\n</program>\n`;

describe("Chromium: a write that breaks a declaration invariant traps before it writes", () => {
  test("a direct field write: kept, then refused (value unchanged, the handler stops)", async () => {
    if (skip()) return;
    const out = build(prog(`${RANGE}
    let <after:string="-"/>
    function setStart(n: int) { @dateRange.start = n; @after = "ran"; }
    <main><p id="s">\${@dateRange.start}</p><p id="a">\${@after}</p>
    <button id="ok" onclick=setStart(4)>ok</button><button id="bad" onclick=setStart(20)>bad</button></main>`));
    const r = await load(out, ["s", "a"], ["#ok", "#bad"]);
    expect(r.texts).toEqual([["0", "-"], ["4", "ran"], ["4", "ran"]]);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toContain("E-WRITE-INVARIANT-RT");
    expect(r.errors[0]).toContain("start = 20, end = 10");
  }, 120000);

  test("a spread: both fields move together; a refused spread writes neither (all or nothing)", async () => {
    if (skip()) return;
    const out = build(prog(`${RANGE}
    function shift(n: int) { @dateRange = { ...@dateRange, start: @dateRange.start + n, end: @dateRange.end + n }; }
    function squeeze(a: int, b: int) { @dateRange = { ...@dateRange, start: a, end: b }; }
    <main><p id="s">\${@dateRange.start}</p><p id="e">\${@dateRange.end}</p>
    <button id="sh" onclick=shift(15)>sh</button><button id="bad" onclick=squeeze(30, 3)>bad</button></main>`));
    const r = await load(out, ["s", "e"], ["#sh", "#bad"]);
    expect(r.texts).toEqual([["0", "10"], ["15", "25"], ["15", "25"]]);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toContain("start = 30, end = 3");
  }, 120000);

  test("a deep write into a value of a `type X:struct` with an invariant, and a local part write", async () => {
    if (skip()) return;
    const out = build("type Range:struct = { lo: int, hi: int } invariant (lo <= hi) [rng]\n" + prog(`    let <r:Range=({ lo: 1, hi: 2 })/>
    function deep(n: int) { @r.lo = n; }
    function loc(n: int) { let x: Range = { lo: 1, hi: 2 }; x.lo = n; @r = x; }
    <main><p id="lo">\${@r.lo}</p>
    <button id="d" onclick=deep(9)>d</button><button id="l" onclick=loc(7)>l</button></main>`));
    const r = await load(out, ["lo"], ["#d", "#l"]);
    expect(r.texts).toEqual([["1"], ["1"], ["1"]]);
    expect(r.errors.length).toBe(2);
    expect(r.errors[0]).toContain("[rng] of type Range");
  }, 120000);

  test("a declaration's construction is checked once its fields are seeded", async () => {
    if (skip()) return;
    const out = build(prog(`    \${ fn twelve() -> int { return 12; } }
    <dateRange:struct>
        let <start:int=(twelve())/>
        let <end:int=10/>
    </>
    invariant (start <= end) [ordered]
    <main><p id="x">x</p><p id="s">\${@dateRange.start}</p></main>`));
    const r = await load(out, ["x"], []);
    expect(r.errors.join(" ")).toContain("E-WRITE-INVARIANT-RT");
    expect(r.errors.join(" ")).toContain("start = 12, end = 10");
  }, 120000);

  test("evaluation order: a lone graph write refused by its edge traps on the edge, not the invariant", async () => {
    if (skip()) return;
    const out = build(prog(`    type Status:enum = { Placed, Packed, Shipped }
    <order:struct>
        let <tracking:string | not=not/>
        <status:Status=.Placed>
            <Placed rule=.Packed/>
            <Packed rule=.Shipped/>
            <Shipped/>
        </>
    </>
    invariant (status != .Shipped || tracking is given) [shippedHasTracking]
    function go(s: Status) { @order.status = s; }
    <main><p id="s">\${@order.status}</p><button id="x" onclick=go(.Shipped)>x</button><button id="p" onclick=go(.Packed)>p</button></main>`));
    const r = await load(out, ["s"], ["#x", "#p", "#x"]);
    expect(r.texts).toEqual([["Placed"], ["Placed"], ["Packed"], ["Packed"]]);
    expect(r.errors.length).toBe(2);
    expect(r.errors[0]).toContain("E-ENGINE-INVALID-TRANSITION");
    expect(r.errors[1]).toContain("E-WRITE-INVARIANT-RT");
    expect(r.errors[1]).toContain("[shippedHasTracking]");
  }, 120000);

  test("a compile-time constant in the invariant is checked at run time", async () => {
    if (skip()) return;
    const out = build(prog(`    \${ const MAX_NIGHTS = 14; }
${RANGE}
    invariant (end - start <= MAX_NIGHTS) [maxNights]
    function setEnd(n: int) { @dateRange.end = n; }
    <main><p id="e">\${@dateRange.end}</p><button id="ok" onclick=setEnd(14)>ok</button><button id="bad" onclick=setEnd(30)>bad</button></main>`));
    const r = await load(out, ["e"], ["#ok", "#bad"]);
    expect(r.texts).toEqual([["10"], ["14"], ["14"]]);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toContain("[maxNights]");
  }, 120000);
});
