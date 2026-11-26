/**
 * s482-opener-escapes — gap g-boot-opener-string-escapes-s482 in a REAL browser (Playwright Chromium).
 * change-id: s482-opener-escapes.
 *
 * INTERIM (fail closed — NOT RULED; SPEC §5.2 / §66.2.4): in a quoted attribute or declaration value, `\"` and
 * `\\` are read as `"` and `\` (the meaning every candidate reading gives them); any other `\` + character is
 * E-PARSE-001 (compile-side pins: compiler/self-host-v2/slice-m4/opener-escapes-s482.test.js). This pins the
 * values the admitted escapes produce in the page, and that the parenthesized form the E-PARSE-001 message names
 * (`=("a\nb")`) gives a real newline.
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
  dir = mkdtempSync(join(tmpdir(), "s482-opener-escapes-chromium-"));
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
  const said = p.stderr.toString() + p.stdout.toString();
  if (p.exitCode !== 0) throw new Error("did not compile: " + said);
  return case_;
}

// load `out`; return, per `#id`, the code points of its text and of its title attribute
async function codes(out, ids) {
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
    await page.waitForFunction((id) => (document.getElementById(id)?.textContent ?? "") !== "", ids[0], { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(100);
    const got = await page.evaluate((xs) => xs.map((id) => {
      const el = document.getElementById(id);
      const cp = (s) => (s == null ? null : [...s].map((c) => c.codePointAt(0)));
      return { text: cp(el?.textContent ?? null), title: cp(el?.getAttribute("title") ?? null) };
    }), ids);
    return { errors, got };
  } finally {
    await page.close();
    srv.stop();
  }
}

const cps = (s) => [...s].map((c) => c.codePointAt(0));

describe("quoted-value escapes in Chromium (INTERIM, g-boot-opener-string-escapes-s482)", () => {
  test("`\\\"` and `\\\\` in a declaration's own value and an attribute value; `=(\"a\\nb\")` is a newline", async () => {
    if (!browser) { console.log(`[skip] Chromium unavailable: ${launchError}`); return; }
    const out = build([
      "<program>",
      'let <s:string="a\\"b\\\\c"/>',
      'let <t:string=("a\\nb")/>',
      '<p id="o" title="x\\"y\\\\z">${@s}</p>',
      '<p id="n">${@t}</p>',
      "</program>",
      "",
    ].join("\n"));
    const r = await codes(out, ["o", "n"]);
    expect(r.errors).toEqual([]);
    expect(r.got[0].text).toEqual(cps('a"b\\c'));
    expect(r.got[0].title).toEqual(cps('x"y\\z'));
    expect(r.got[1].text).toEqual(cps("a\nb"));
  }, 60000);
});
