/**
 * A render that holds itself (§66.6.2 S483), in a REAL browser (Playwright Chromium). change-id: s483-self-render.
 *
 * Rulings: ruling:user-voice-scrml.md-S483-star-self-render-error (a `<*f/>` inside the markup it renders is
 * E-DECL-RENDER-CYCLE-STAR, guarded or not) and ruling:user-voice-scrml.md-S483-component-self-mount-error (a use
 * of a declaration inside its own render, unconditional on every path, is E-DECL-RENDER-CYCLE-USE at the use;
 * guarded recursion stays legal). Before this lane (base d58e768e8) the self-mounting component compiled and
 * Chromium threw "Maximum call stack size exceeded" at load, with nothing on the page; the `<*f/>` shapes were
 * refused as E-BOOTSTRAP-UNSUPPORTED. Now the bootstrap CLI refuses both by their codes (exit 1), and the guarded
 * forms the messages name render finite trees in Chromium.
 * compiler/self-host-v2/slice-m4/render-cycle-s483.test.js pins the messages in detail.
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
  dir = mkdtempSync(join(tmpdir(), "s483-render-cycle-chromium-"));
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
function compile(src) {
  const case_ = join(dir, `c${n++}`);
  const file = case_ + ".scrml";
  writeFileSync(file, src);
  const p = Bun.spawnSync(["bun", join(ROOT, "scripts/scrml-boot.ts"), "compile", file, "--output-dir", case_], { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  return { out: case_, exitCode: p.exitCode, text: p.stderr.toString() + p.stdout.toString() };
}
function build(src) {
  const r = compile(src);
  if (r.exitCode !== 0) throw new Error("did not compile: " + r.text);
  return r.out;
}

// serve `out` over http (the page loads ES modules), load it, read the text of each `#id`
async function load(out, ids) {
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
    await page.waitForFunction((id) => document.getElementById(id) !== null, ids[ids.length - 1], { timeout: 5000 }).catch(() => {});
    const texts = await page.evaluate((xs) => xs.map((id) => document.getElementById(id)?.textContent ?? "<none>"), ids);
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

const PH = `\${ type Ph:enum = { A, B } }\n`;

describe("a render that holds itself is refused (the bootstrap CLI)", () => {
  test("c05: a component whose render mounts itself — E-DECL-RENDER-CYCLE-USE, exit 1 (base: compiled, stack overflow at load)", () => {
    const r = compile(`<program>\n<card t:string="x">\n</> renders <div id="o"><card/></div>\n<main><card/></main>\n<p id="z">end</p>\n</program>\n`);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("E-DECL-RENDER-CYCLE-USE");
    expect(r.text).toContain("without end");
  }, 120000);

  test("a mutual pair and a use as slot content of an unconditional `<slot/>` — refused, exit 1", () => {
    const m = compile(`<program>\n<pa t:string="x">\n</> renders <div><pb/></div>\n<pb t:string="y">\n</> renders <span><pa/></span>\n<main><pa/></main>\n</program>\n`);
    expect(m.exitCode).toBe(1);
    expect(m.text).toContain("E-DECL-RENDER-CYCLE-USE");
    const s = compile(`<program>\n<wrap t:string="w">\n</> renders <div><slot/></div>\n<card t:string="x">\n</> renders <wrap><card/></wrap>\n<main><card/></main>\n</program>\n`);
    expect(s.exitCode).toBe(1);
    expect(s.text).toContain("E-DECL-RENDER-CYCLE-USE");
  }, 120000);

  test("s08 / c03: `<*ph/>` in its own state arm, guarded by `if=` or not — E-DECL-RENDER-CYCLE-STAR, exit 1", () => {
    for (const arm of [`<div><*ph/></div>`, `<div if=(@show)><*ph/></div>`]) {
      const r = compile(`<program>\n${PH}let <show:bool=false/>\n<ph:Ph=.A single>\n  <A rule=.B><b id="o">x</b></>\n  <B rule=.A>${arm}</>\n</>\n<main><*ph/></main>\n</program>\n`);
      expect([arm, r.exitCode]).toEqual([arm, 1]);
      expect(r.text).toContain("E-DECL-RENDER-CYCLE-STAR");
    }
  }, 120000);
});

describe("guarded recursion renders a finite tree (Chromium)", () => {
  test("a depth attribute: `if=` on the nested use, `if=` on an ancestor, `else`", async () => {
    if (skip()) return;
    const shapes = [
      [`<tree depth=(depth - 1) if=(depth > 0)/>`, "3210"],
      [`<span if=(depth > 0)><tree depth=(depth - 1)/></span>`, "3210"],
      [`<b if=(depth == 0)>leaf</b><tree depth=(depth - 1) else/>`, "3210leaf"],
    ];
    for (const [nested, want] of shapes) {
      const out = build(`<program>\n<tree depth:int=3>\n</> renders <div>\${depth}${nested}</div>\n<main id="o"><tree/></main>\n<p id="z">end</p>\n</program>\n`);
      expect([nested, await load(out, ["o", "z"])]).toEqual([nested, { errors: [], texts: [want, "end"] }]);
    }
  }, 240000);

  test("a `<match>` arm, an `<each>` row, a field arm that mounts a new instance (#2116 y04)", async () => {
    if (skip()) return;
    const m = build(`<program>\n${PH}<tree depth:int=2>\n</> renders <div>\${depth}<match for=Ph on=(depth > 0 ? Ph.B : Ph.A)><A><b>leaf</b></A><B><tree depth=(depth - 1)/></B></match></div>\n<main id="o"><tree/></main>\n<p id="z">end</p>\n</program>\n`);
    expect(await load(m, ["o", "z"])).toEqual({ errors: [], texts: ["210leaf", "end"] });
    const e = build(`<program>\n<tree depth:int=2>\n</> renders <div>\${depth}<each in=(depth > 0 ? [depth - 1] : []) as d><tree depth=(d)/></each></div>\n<main id="o"><tree/></main>\n<p id="z">end</p>\n</program>\n`);
    expect(await load(e, ["o", "z"])).toEqual({ errors: [], texts: ["210", "end"] });
    const y = build(`<program>\n${PH}<card t:string="x">\n    <ph:Ph=.A>\n      <A rule=.B><b>leaf</b></>\n      <B rule=.A><div><card/></div></>\n    </>\n</> renders <div id="o"><*ph/></div>\n<card/>\n<p id="z">end</p>\n</program>\n`);
    expect(await load(y, ["o", "z"])).toEqual({ errors: [], texts: ["leaf", "end"] });
  }, 240000);

  test("c02: a nested `<*qh/>` that does not lead back still renders", async () => {
    if (skip()) return;
    const out = build(`<program>\n${PH}<qh:Ph=.A single>\n  <A rule=.B><b>y</b></>\n  <B rule=.A><i>q</i></>\n</>\n<ph:Ph=.A single>\n  <A rule=.B><div id="o"><*qh/></div></>\n  <B rule=.A><b>x</b></>\n</>\n<main><*ph/></main>\n<p id="z">end</p>\n</program>\n`);
    expect(await load(out, ["o", "z"])).toEqual({ errors: [], texts: ["y", "end"] });
  }, 120000);
});

// s483 r2 (#2139 r1 re-review HIGH-1 / MED-1). A rule-1 cycle through a use, guarded by that new
// instance's OWN state (PA reading pa-ruled:S483-star-cycle-same-instance), compiles and renders as on
// base (merge-base e25c84674): each click on the last `button.open` opens exactly one level, whose new
// `<card>` starts closed again — no error. Every branch mounting the declaration through other
// declarations' renders is refused (base and r1: compiled, then "Maximum call stack size exceeded").
const CARD_PROGRAM = (cardBody, renders) => `<program>\n${PH}<ph:Ph=.B single>\n  <A rule=.B><b>x</b></>\n  <B rule=.A><div><card/></div></>\n</>\n<card t:string="c">\n${cardBody}\n</> renders ${renders}\n<main id="o"><*ph/></main>\n<p id="z">end</p>\n</program>\n`;

// load `out`, then click the last `button.open` `clicks` times: the text of `#o` after each step
async function clicks(out, clicks) {
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
    await page.waitForFunction(() => document.getElementById("z") !== null, null, { timeout: 5000 }).catch(() => {});
    const text = () => page.evaluate(() => (document.getElementById("o")?.textContent ?? "<none>").replace(/\s+/g, "").trim());
    const seen = [await text()];
    for (let i = 0; i < clicks; i++) {
      const b = page.locator("button.open");
      await b.nth((await b.count()) - 1).click();
      await page.waitForTimeout(300);
      seen.push(await text());
    }
    return { errors, seen };
  } finally {
    await page.close();
    srv.stop();
  }
}

describe("r2: a guard on the new instance's own state ends a `<*f/>` cycle through a use (Chromium)", () => {
  test("q02d / q02e / q23: `if=` on a `let` cell, a graph field's arm, a `<match>` — one level per click, no error", async () => {
    if (skip()) return;
    const shapes = [
      ["q02d", `  let <open:boolean=false/>`, `<span><button class="open" onclick=(@card.open = true)>open</button><i if=(open)>[<*ph/>]</i></span>`],
      ["q02e", `    <cs:Ph=.A>\n      <A rule=.B><button class="open" onclick=(@card.cs = .B)>open</button></>\n      <B rule=.A><i>[<*ph/>]</i></>\n    </>`, `<span><*cs/></span>`],
      ["q23", `  let <open:boolean=false/>`, `<span><match for=Ph on=(open ? Ph.B : Ph.A)><A><button class="open" onclick=(@card.open = true)>open</button></A><B><i>[<*ph/>]</i></B></match></span>`],
    ];
    const want = {
      q02d: ["open", "open[open]", "open[open[open]]"],
      q02e: ["open", "[open]", "[[open]]"],
      q23: ["open", "[open]", "[[open]]"],
    };
    for (const [id, body, renders] of shapes) {
      const out = build(CARD_PROGRAM(body, renders));
      expect([id, await clicks(out, 2)]).toEqual([id, { errors: [], seen: want[id] }]);
    }
  }, 240000);

  test("q01: card's own graph field starts in an arm without `<*ph/>` — renders \"closed\"", async () => {
    if (skip()) return;
    const out = build(CARD_PROGRAM(`    <cs:Ph=.A>\n      <A rule=.B><b>closed</b></>\n      <B rule=.A><i><*ph/></i></>\n    </>`, `<span><*cs/></span>`));
    expect(await load(out, ["o", "z"])).toEqual({ errors: [], texts: ["closed", "end"] });
  }, 120000);

  test("q04 / q21 / q24: every branch mounts `<card>` through `<pa>` / `<pb>`'s renders — E-DECL-RENDER-CYCLE-USE, exit 1", () => {
    const pa = `<pa t:string="a">\n</> renders <b><card/></b>\n`;
    const pb = `<pb t:string="b">\n</> renders <i><card/></i>\n`;
    const shapes = [
      ["q04", pa + pb, `<pa if=(d > 0)/><pb else/>`],
      ["q21", pa, `<pa if=(d > 0)/><card else/>`],
      ["q24", pa + pb, `<match for=Ph on=(d > 0 ? Ph.A : Ph.B)><A><pa/></A><B><pb/></B></match>`],
    ];
    for (const [id, decls, body] of shapes) {
      const r = compile(`<program>\n${PH}${decls}<card d:int=3>\n</> renders <span>${body}</span>\n<main><card/></main>\n<p id="z">end</p>\n</program>\n`);
      expect([id, r.exitCode, r.text.includes("E-DECL-RENDER-CYCLE-USE")]).toEqual([id, 1, true]);
    }
  }, 120000);
});
