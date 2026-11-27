/**
 * g-boot-trapping-construct-init-s482 — a file-scope initializer that can trap, written inside an `if=` element /
 * a `<match>` arm / a component's slot content, in a REAL browser (Playwright Chromium). change-id:
 * s483-trapping-construct-init (#2079 review PRE-1; owner Q8).
 *
 * RULED S482 (ruling:user-voice-scrml.md-S482-trapping-construct-init — "yes, interim refusal now and the feature
 * later"): such an initializer runs once, just before the construct, whether or not the construct shows (§7.6 R3),
 * so the construct's test does not guard it. Before this lane `${ const first: int = items[0]; }` under
 * `if=(items.length > 0)` compiled and, with `items` empty, the E-INDEX-OUT-OF-RANGE-RT trap stopped the mount:
 * Chromium showed a blank page (no `#z` after the construct). Now the bootstrap CLI refuses it
 * (E-FILE-SCOPE-INIT-IN-CONSTRUCT, exit 1) and the capable forms the message names run in Chromium.
 * compiler/self-host-v2/slice-m4/trapping-construct-init-s483.test.js pins the refusals in detail.
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
  dir = mkdtempSync(join(tmpdir(), "s483-trap-init-chromium-"));
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

const HEAD = `\${ const items: int[] = []; }
\${ function firstOf(xs: int[]) -> int { return xs[0]; } }
\${ type Phase:enum = { Idle, Ready } }
<phase:Phase=.Idle/>
`;
const CARD = `<card t:string="x">
</> renders <div>\${t}<slot/></div>
`;

describe("a trapping initializer inside a construct is refused (the bootstrap CLI)", () => {
  test("items[0] under if=(items.length > 0) — refused, exit 1 (base: compiled, and the page was blank)", () => {
    const r = compile(`<program>\n${HEAD}<p id="a" if=(items.length > 0)>\${ const first: int = items[0]; }\${first}</p>\n<p id="z">end</p>\n</program>\n`);
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("E-FILE-SCOPE-INIT-IN-CONSTRUCT");
    expect(r.text).toContain("g-boot-trapping-construct-init-s482");
  }, 120000);

  test("in a <match> arm, and in slot content — refused, exit 1", () => {
    const m = compile(`<program>\n${HEAD}<match for=Phase on=@phase>\n  <Idle><div>\${ const first: int = items[0]; }idle</div></>\n  <Ready><p>ready</p></>\n</match>\n<p id="z">end</p>\n</program>\n`);
    expect(m.exitCode).toBe(1);
    expect(m.text).toContain("E-FILE-SCOPE-INIT-IN-CONSTRUCT");
    const s = compile(`${CARD}<program>\n${HEAD}<card><b>\${ const first: int = firstOf(items); }in</b></card>\n<p id="z">end</p>\n</program>\n`);
    expect(s.exitCode).toBe(1);
    expect(s.text).toContain("E-FILE-SCOPE-INIT-IN-CONSTRUCT");
  }, 120000);
});

describe("the capable forms run (Chromium)", () => {
  test("the content calls the function itself — the branch does not show, the page mounts", async () => {
    if (skip()) return;
    const out = build(`<program>\n${HEAD}<p id="a" if=(items.length > 0)>\${firstOf(items)}</p>\n<p id="z">end</p>\n</program>\n`);
    expect(await load(out, ["a", "z"])).toEqual({ errors: [], texts: ["<none>", "end"] });
  }, 120000);

  test("declared before the construct with a form that cannot trap (items.at(0))", async () => {
    if (skip()) return;
    const out = build(`<program>\n${HEAD}\${ const first: int | not = items.at(0); }\n<p id="a" if=(first is given)>\${first}</p>\n<p id="z">end</p>\n</program>\n`);
    expect(await load(out, ["a", "z"])).toEqual({ errors: [], texts: ["<none>", "end"] });
  }, 120000);

  test("a non-trapping initializer inside the construct still compiles and runs", async () => {
    if (skip()) return;
    const out = build(`<program>\n${HEAD}<p id="a" if=(items.length == 0)>\${ const k: int = items.length + 1; }\${k}</p>\n<p id="z">end</p>\n</program>\n`);
    expect(await load(out, ["a", "z"])).toEqual({ errors: [], texts: ["1", "end"] });
  }, 120000);
});
