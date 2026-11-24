/**
 * #2082 r3 review HIGH-5 — an `<effect>`'s `deps=` are read at the mount, in a REAL browser (Playwright
 * Chromium). change-id: s482-place-fu2.
 *
 * SPEC §7.6 rule (b) S482: an `<effect>`'s body does not run at the mount (E-EFFECT-NO-DEPS), but its
 * `deps=` are read there. An imported cell's seed runs at its first read, so `<effect deps=[@z]>` before
 * `${ const k = n + 0; }` inside an `if=` element — `z` imported, its seed writing `n` — compiled and showed
 * k = 1, where the source order (the `<div>` control) shows 5. It is now E-FILE-SCOPE-INIT-IN-CONSTRUCT.
 * The slice test (compiler/self-host-v2/slice-m4/effect-deps-mount-s482.test.js) pins the same shapes in
 * happy-dom.
 *
 * Skipped (with a note) when Chromium cannot be launched on this machine.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
  dir = mkdtempSync(join(tmpdir(), "s482-effect-deps-chromium-"));
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

// x15 / x16 of the #2082 r3 review
const LIB = `\${ export let n: int = 1; }
\${ export function bumps() -> string { n = 5; return "s"; } }
\${ export function bumpb() -> boolean { n = 5; return true; } }
export let <z:string=(bumps())/>
export let <zb:boolean=(bumpb())/>
`;

let n = 0;
// write lib.scrml + main.scrml into a fresh case dir; compile main with the bootstrap CLI
function compile(main) {
  const case_ = join(dir, `c${n++}`);
  mkdirSync(case_);
  writeFileSync(join(case_, "lib.scrml"), LIB);
  writeFileSync(join(case_, "main.scrml"), main);
  const out = join(case_, "out");
  const p = Bun.spawnSync(["bun", join(ROOT, "scripts/scrml-boot.ts"), "compile", join(case_, "main.scrml"), "--output-dir", out], { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  const text = p.stderr.toString() + p.stdout.toString();
  return { exit: p.exitCode, text, out, codes: [...new Set(text.match(/E-[A-Z0-9-]+/g) ?? [])] };
}

function build(main) {
  const r = compile(main);
  if (r.exit !== 0) throw new Error("did not compile: " + r.text);
  return r.out;
}

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
    await page.waitForFunction(() => document.getElementById("o") !== null, undefined, { timeout: 5000 }).catch(() => {});
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

const X = (imp, wrap) => `\${ import { n, ${imp} } from "./lib.scrml"; }
<program>
${wrap}
</program>
`;

describe("an <effect>'s deps= are read at the mount (Chromium)", () => {
  test("x15 construct, deps=[@z]: refused (base: Chromium k = 1)", () => {
    const r = compile(X("z", `<div if=(true)><effect deps=[@z]>\${ let q: int = 0; }</>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>`));
    expect(r.exit).not.toBe(0);
    expect(r.codes).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("x15 control (<div>): the deps read runs z's seed first, k = 5, source order", async () => {
    if (skip()) return;
    const out = build(X("z", `<div><effect deps=[@z]>\${ let q: int = 0; }</>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>`));
    expect(await load(out, ["o"])).toEqual({ errors: [], texts: ["5"] });
  }, 120000);

  test("x16 construct, deps=[@zb]: refused (base: Chromium k = 1)", () => {
    const r = compile(X("zb", `<div if=(true)><effect deps=[@zb]>\${ let q: int = 0; }</>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>`));
    expect(r.exit).not.toBe(0);
    expect(r.codes).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("x16 control (<div>): k = 5, source order", async () => {
    if (skip()) return;
    const out = build(X("zb", `<div><effect deps=[@zb]>\${ let q: int = 0; }</>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>`));
    expect(await load(out, ["o"])).toEqual({ errors: [], texts: ["5"] });
  }, 120000);

  test("legal: the effect after the initializer, in the construct — k = 1, as its control", async () => {
    if (skip()) return;
    const a = build(X("z", `<div if=(true)>\${ const k: int = n + 0; }<p id="o">\${k}</p><effect deps=[@z]>\${ let q: int = 0; }</></div>`));
    const c = build(X("z", `<div>\${ const k: int = n + 0; }<p id="o">\${k}</p><effect deps=[@z]>\${ let q: int = 0; }</></div>`));
    expect(await load(a, ["o"])).toEqual({ errors: [], texts: ["1"] });
    expect(await load(c, ["o"])).toEqual({ errors: [], texts: ["1"] });
  }, 120000);
});
