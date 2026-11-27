/**
 * s483-component-attr-server-only (SECURITY) — a component ATTRIBUTE, and a cell a use site gives a value, are
 * judged by §7.6 rule (b) like a component cell (ruling:user-voice-scrml.md-S483-component-attr-server-only,
 * "Same rule as cells": "an attribute no client code reads gets an empty client stand-in; its default never runs
 * and its use-site value is never evaluated in the client … An attribute the client reads stays as today"); and a
 * `<*x/>` reads only what x's renders read (#2125 review MED-1 (i)). This file pins, in a REAL browser (Playwright
 * Chromium), that pages with such fields (a default, a use-site value, a pass-down, `<each>` instances, a
 * `single` declaration shown by `<*card/>`, a use-site-given cell with a second instance) load and run without
 * error with the secret in no client file, and that a field the page reads shows the same value as before.
 * Leak checks, server artifact and happy-dom values: compiler/self-host-v2/slice-m4/component-attr-server-only-s483.test.js.
 *
 * Skipped (with a note) when Chromium cannot be launched on this machine.
 */


import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
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
  dir = mkdtempSync(join(tmpdir(), "s483-component-attr-chromium-"));
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
  mkdirSync(case_ + "-src", { recursive: true });
  const file = join(case_ + "-src", "main.scrml");
  writeFileSync(file, src);
  const p = Bun.spawnSync(["bun", join(ROOT, "scripts/scrml-boot.ts"), "compile", file, "--output-dir", case_], { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  if (p.exitCode !== 0) throw new Error("did not compile: " + p.stderr.toString() + p.stdout.toString());
  return case_;
}

// every client file of `out` that holds `needle`
function clientHolds(out, needle) {
  const server = ["program.server.js", "scrml-server-runtime.js", "runtime.js", ".scrml-boot-manifest.json"];
  return readdirSync(out).filter((f) => !server.includes(f) && /\.(js|html)$/.test(f) && readFileSync(join(out, f), "utf8").includes(needle));
}

// serve `out` over http, load it, click each of `click` (ids) in order, read the text of each `#id`
async function load(out, ids, click) {
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
    await page.waitForTimeout(300);
    for (const c of [].concat(click ?? [])) { await page.click("#" + c); await page.waitForTimeout(200); }
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

const LIB = `\${
    const API_KEY: string = "zz-sk-live-123";
    function tag(s: string) -> string { return "[" + s + "]"; }
}`;
// `label` is server-placed (it reaches a `?{}`), so API_KEY is otherwise read only by server code
const PROG = (extra) => `${LIB}
<program db="./app.db">
\${
    type Row:struct = { name: string }
    function label(id: int) -> string {
        const r: Row = ?{\`SELECT name FROM users WHERE id = \${id}\`}.get() !{ _ :> { return "none"; } };
        return r.name + API_KEY;
    }
}
let <out:string=""/>
let <n:int=0/>
<button id="go" onclick={ @out = label(1) !{ .Transport(t) :> return }; }>go</button>
<p id="c">\${tag(@out)}</p>
<p id="n">\${@n}</p>
${extra}
</program>
`;
const KCELL = `let <k:string=(tag(API_KEY))/>`;

describe("a server-only component attribute is an empty stand-in in every instance (Chromium)", () => {
  test("c16 a default, c17 a use-site value, a pass-down nobody reads, `<each>` instances, two use sites — not in the client; the page loads and runs", async () => {
    if (skip()) return;
    for (const extra of [
      `<card t:string=(API_KEY)>\n  let <k:string=(tag(t))/>\n</> renders <b id="k">x</b>\n<card/>`,
      `<card t:string="x">\n  let <k:string=(tag(t))/>\n</> renders <b id="k">x</b>\n<card t=(API_KEY)/>`,
      `<inner u:string="u"/> renders <i id="k">u</i>\n<card t:string="x"/> renders <b><inner u=(t)/></b>\n<card t=(API_KEY)/>`,
      `<card t:string="x"/> renders <b class="k">x</b>\n<each in=(["a", "b"]) as=i><card t=(i == "a" ? API_KEY : "n")/></each>\n<p id="k">x</p>`,
      `<card t:string="x"/> renders <b class="k">x</b>\n<card t=(API_KEY)/>\n<card t="safe"/>\n<p id="k">x</p>`,
    ]) {
      const out = build(PROG(extra));
      expect(clientHolds(out, "zz-sk-live-123")).toEqual([]);
      expect(await load(out, ["n", "c", "k"])).toEqual({ errors: [], texts: ["0", "[]", extra.includes("<inner") ? "u" : "x"] });
    }
  }, 240000);

  test("#2125 MED-1: a use-site-given cell with a second instance (i05); a `single` declaration shown by `<*card/>` (d22) — not in the client", async () => {
    if (skip()) return;
    for (const extra of [
      `<card t:string="x">\n  ${KCELL}\n</> renders <b class="k">x</b>\n<card k="given"/>\n<card/>\n<p id="k">x</p>`,
      `<card t:string="x" single>\n  ${KCELL}\n</> renders <b id="k">x</b>\n<*card/>`,
    ]) {
      const out = build(PROG(extra));
      expect(clientHolds(out, "zz-sk-live-123")).toEqual([]);
      expect(await load(out, ["n", "k"])).toEqual({ errors: [], texts: ["0", "x"] });
    }
  }, 120000);

  test("control: an attribute the page reads shows its use-site value and its default; a handle read; a `<*x/>` whose renders read the cell", async () => {
    if (skip()) return;
    const a = build(PROG(`<card t:string="x"/> renders <b id="t">\${tag(t)}</b>\n<card t=(API_KEY)/>`));
    expect(await load(a, ["t"])).toEqual({ errors: [], texts: ["[zz-sk-live-123]"] });
    const d = build(PROG(`<card t:string=(API_KEY)/> renders <b id="t">\${tag(t)}</b>\n<card/>`));
    expect(await load(d, ["t"])).toEqual({ errors: [], texts: ["[zz-sk-live-123]"] });
    const h = build(PROG(`<card t:string="x"/> renders <b>x</b>\n<card t=(API_KEY)/>\n<card as=h t="safe"/>\n<p id="t">\${@h.t}</p>`));
    expect(await load(h, ["t"])).toEqual({ errors: [], texts: ["safe"] });
    const s = build(PROG(`<card t:string="x" single>\n  ${KCELL}\n</> renders <b id="k">\${k}</b>\n<*card/>`));
    expect(await load(s, ["k"])).toEqual({ errors: [], texts: ["[zz-sk-live-123]"] });
  }, 120000);
});
