/**
 * s482-mount-reach-fu r1 (S483 review s482-2116 F1) — a shared instance's construction, in a REAL
 * browser (Playwright Chromium).
 *
 * §7.6 R4: "A lazy shared instance is constructed at its first reference. Each is judged by R2 at the
 * demand point." The construction runs the instance's SEEDS; a derived field is lazy, its formula runs
 * where it is read. So a body binding that only an UNREAD derived field reads runs at its own place,
 * after the body's earlier writes. Red on 9fdaa7925: x01 / x12 showed `1 | 1`, x01c `1 | 1 1` — `k`
 * was hoisted to module initialization, before `n = 5`.
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
  dir = mkdtempSync(join(tmpdir(), "s482-shared-instance-reach-chromium-"));
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
// compile `main.scrml` with the bootstrap CLI into a fresh dir
function build(src) {
  const case_ = join(dir, `c${n++}`);
  mkdirSync(case_ + "-src", { recursive: true });
  const file = join(case_ + "-src", "main.scrml");
  writeFileSync(file, src);
  const p = Bun.spawnSync(["bun", join(ROOT, "scripts/scrml-boot.ts"), "compile", file, "--output-dir", case_], { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  if (p.exitCode !== 0) throw new Error("did not compile: " + p.stderr.toString() + p.stdout.toString());
  return case_;
}

// serve `out` over http, load it, read the text of each `#id`
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
    await page.waitForTimeout(300);
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

const HEAD = `<program>
let <m:int=0/>
\${ let n: int = 1; }
<card t:string="x">
    let <v:int=(1)/>
    <d:int=(@m + k)/>
</>`;

describe("F1 — a shared reference constructs the seeds, not an unread derived field (Chromium)", () => {
  test("x01: a seed read before `k`, the derived field never read — 1 | 5 (head 1 | 1)", async () => {
    if (skip()) return;
    const out = build(`${HEAD}
\${ n = 5; }
<p id="o">\${@card.v}</p>
\${ const k: int = n + 0; }
<p id="o2">\${k}</p>
</program>
`);
    expect(await load(out, ["o", "o2"])).toEqual({ errors: [], texts: ["1", "5"] });
  }, 120000);

  test("x01c: the derived field read after `k` — 1 | 5 5 (head 1 | 1 1)", async () => {
    if (skip()) return;
    const out = build(`${HEAD}
\${ n = 5; }
<p id="o">\${@card.v}</p>
\${ const k: int = n + 0; }
<p id="o2">\${k} \${@card.d}</p>
</program>
`);
    expect(await load(out, ["o", "o2"])).toEqual({ errors: [], texts: ["1", "5 5"] });
  }, 120000);

  test("x12: the shared read in another component's render, mounted before `k` — 1 | 5 (head 1 | 1)", async () => {
    if (skip()) return;
    const out = build(`${HEAD}
<show1 t:string="y">
</> renders <b id="o">\${@card.v}</b>
\${ n = 5; }
<show1/>
\${ const k: int = n + 0; }
<p id="o2">\${k}</p>
</program>
`);
    expect(await load(out, ["o", "o2"])).toEqual({ errors: [], texts: ["1", "5"] });
  }, 120000);
});
