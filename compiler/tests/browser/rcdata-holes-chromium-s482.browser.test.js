/**
 * g-boot-rcdata-hole-anchor-s482 — the content of a raw-text / RCDATA element holding a `${}`, in a REAL
 * browser (Playwright Chromium). change-id: s482-rcdata-holes.
 *
 * happy-dom parses a `<!---->` inside `<textarea>` / `<title>` as a comment, which hid the defect: in a
 * real HTML parser that content is ONE text node, so base's per-hole anchor path named no node and
 * `<textarea>a ${@x} b</textarea>` threw at mount — nothing rendered. The slice test
 * (compiler/self-host-v2/slice-m4/rcdata-holes-s482.test.js) pins the artifact and the happy-dom values;
 * this file pins, in Chromium, that the page mounts with no error, shows the value, and follows a cell
 * change — including after the user typed into the textarea (SPEC §34 W-RCDATA row: the content
 * "compiles to a reactive `.value` bind").
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
  dir = mkdtempSync(join(tmpdir(), "s482-rcdata-chromium-"));
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
// compile with the bootstrap CLI (the shipping path) into a fresh dir
function build(src) {
  const case_ = join(dir, `c${n++}`);
  const file = case_ + ".scrml";
  writeFileSync(file, src);
  const p = Bun.spawnSync(["bun", join(ROOT, "scripts/scrml-boot.ts"), "compile", file, "--output-dir", case_], { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  if (p.exitCode !== 0) throw new Error("did not compile: " + p.stderr.toString() + p.stdout.toString());
  return case_;
}

// serve `out` over http (the page loads ES modules), load it, run `steps`, snapshot after load and each step
async function load(out, steps = []) {
  const srv = Bun.serve({ port: 0, fetch(req) {
    const p = new URL(req.url).pathname;
    return new Response(Bun.file(join(out, p === "/" ? "index.html" : p)), { headers: { "content-type": p.endsWith(".js") ? "text/javascript" : "text/html" } });
  } });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`http://localhost:${srv.port}/`);
    await page.waitForFunction(() => document.querySelector("button") !== null || document.querySelector("textarea") !== null, null, { timeout: 5000 }).catch(() => {});
    const snap = () => page.evaluate(() => ({
      ta: Array.from(document.querySelectorAll("body textarea")).map((t) => t.value),
      title: document.title,
    }));
    const out = [{ errors: [...errors], ...(await snap()) }];
    for (const s of steps) {
      if (s.click) await page.click(s.click);
      if (s.fill) await page.fill(s.fill[0], s.fill[1]);
      await page.waitForTimeout(50);
      out.push({ errors: [...errors], ...(await snap()) });
    }
    return out;
  } finally {
    await page.close();
    srv.stop();
  }
}

function skip() {
  if (!browser) { console.log(`[skip] Chromium unavailable: ${launchError}`); return true; }
  return false;
}

describe("RCDATA content with a `${}` in Chromium (g-boot-rcdata-hole-anchor-s482)", () => {
  test("`<textarea>a ${@x} b</textarea>` mounts, shows `a hi b`, and follows the cell even after typing", async () => {
    if (skip()) return;
    const out = build(`<program>
let <x:string="hi"/>
<textarea id="t">a \${@x} b</textarea>
<button id="b" onclick=@x = "yo">b</button>
</program>
`);
    const s = await load(out, [{ fill: ["#t", "typed"] }, { click: "#b" }]);
    expect(s.map((x) => x.errors)).toEqual([[], [], []]);
    expect(s.map((x) => x.ta)).toEqual([["a hi b"], ["typed"], ["a yo b"]]);
  }, 120000);

  test("two holes, hole first / last", async () => {
    if (skip()) return;
    const out = build(`<program>
let <x:string="hi"/>
let <n:int=1/>
<textarea id="t">\${@x}-\${@n} tail</textarea>
<textarea id="u">head \${@x}</textarea>
<button id="b" onclick=@n = @n + 1>b</button>
</program>
`);
    const s = await load(out, [{ click: "#b" }]);
    expect(s.map((x) => x.errors)).toEqual([[], []]);
    expect(s.map((x) => x.ta)).toEqual([["hi-1 tail", "head hi"], ["hi-2 tail", "head hi"]]);
  }, 120000);

  test("`<title>Page ${@n} of 3</title>` sets the document title and follows the cell", async () => {
    if (skip()) return;
    const out = build(`<program>
let <n:int=1/>
<title>Page \${@n} of 3</title>
<button id="b" onclick=@n = @n + 1>b</button>
</program>
`);
    const s = await load(out, [{ click: "#b" }]);
    expect(s.map((x) => x.errors)).toEqual([[], []]);
    expect(s.map((x) => x.title)).toEqual(["Page 1 of 3", "Page 2 of 3"]);
  }, 120000);

  test("in a component's renders and in an `<each>` row", async () => {
    if (skip()) return;
    const out = build(`<program>
<xs:string[]=(["a", "b"])/>
let <n:int=1/>
<box label:string/>
renders <div class="box"><textarea>\${label} n=\${@n}!</textarea></div>
<main>
<box label="L"/>
<each in=@xs as x><textarea>\${x} \${@n} row</textarea></each>
<button id="b" onclick=@n = @n + 1>b</button>
</main>
</program>
`);
    const s = await load(out, [{ click: "#b" }]);
    expect(s.map((x) => x.errors)).toEqual([[], []]);
    expect(s.map((x) => x.ta)).toEqual([["L n=1!", "a 1 row", "b 1 row"], ["L n=2!", "a 2 row", "b 2 row"]]);
  }, 120000);

  // s482 (#2069 review LOW-3; SPEC §19.17 — a throw blanks the hole that threw): each `${}` part is its own
  // hole. A part that traps shows "" — as a `<p>`'s text hole does — the trap is reported, and the static
  // text and the other parts stay. Base blanked the whole element (textarea value "", title "").
  test("one throwing part blanks only itself: the static text and the other parts stay", async () => {
    if (skip()) return;
    const out = build(`<program>
let <x:string="hi"/>
fn boom(s: string) -> string { if (s == "yo") { return s.repeat(0 - s.length); } return s; }
<title>T \${boom(@x)} \${@x} end</title>
<textarea id="t">static-a \${boom(@x)} static-b \${@x}</textarea>
<button id="b" onclick=@x = "yo">b</button>
</program>
`);
    const s = await load(out, [{ fill: ["#t", "typed"] }, { click: "#b" }]);
    expect(s[0].errors).toEqual([]);
    expect(s.map((x) => x.ta)).toEqual([["static-a hi static-b hi"], ["typed"], ["static-a  static-b yo"]]);
    // document.title collapses white space ("T  yo end" is read as "T yo end")
    expect(s.map((x) => x.title)).toEqual(["T hi hi end", "T hi hi end", "T yo end"]);
    expect(s[2].errors.length).toBe(2);
    expect(s[2].errors.every((e) => e.includes("E-INDEX-OUT-OF-RANGE-RT"))).toBe(true);
  }, 120000);
});
