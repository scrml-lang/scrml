/**
 * g-boot-nested-init-reads-body-write-s482 follow-up — a file-scope initializer that does not act, written
 * inside an `if=` element / an if-chain member / a component's slot content / a `<match>` arm, in a REAL
 * browser (Playwright Chromium). change-id: s482-construct-init-fu (#2076 review MED-1 / LOW-1).
 *
 * SPEC §7.6 rule (b) S482: "One that does not act runs once, just before the construct … it sees every
 * write the body makes before the construct, and none it makes after, as source order does." Base put the
 * place just after the construct; the construct's content read the binding before that place, so the
 * printer ran it at module initialization with every binding its initializer reads:
 * `${ n = 5; } ${ const m = n; } <p>${m}</p> <div if=(m > 0)>${ const k = m + 0; }…` showed m = 1 and
 * k = 1 (source order: 5 and 5). The slice test (compiler/self-host-v2/slice-m4/construct-init-read-s482.test.js)
 * pins the refusals and the happy-dom values; this file pins the values in Chromium.
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
  dir = mkdtempSync(join(tmpdir(), "s482-ctor-place-chromium-"));
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
    await page.waitForFunction((id) => document.getElementById(id) !== null, ids[0], { timeout: 5000 }).catch(() => {});
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

describe("a non-acting initializer in a construct runs just before it (Chromium)", () => {
  test("MED-1: read through a file-scope const — m and k both 5 (base: 1 and 1)", async () => {
    if (skip()) return;
    const out = build(`<program>
\${ let n: int = 1; }
\${ n = 5; }
\${ const m: int = n; }
<p id="o">\${m}</p>
<div if=(m > 0)>\${ const k: int = m + 0; }<p id="o2">\${k}</p></div>
</program>
`);
    expect(await load(out, ["o", "o2"])).toEqual({ errors: [], texts: ["5", "5"] });
  }, 120000);

  test("a body-top write before the construct is seen (#2076 refused it)", async () => {
    if (skip()) return;
    const out = build(`<program>
\${ let n: int = 1; }
\${ n = 5; }
<div if=(n > 0)>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
</program>
`);
    expect(await load(out, ["o"])).toEqual({ errors: [], texts: ["5"] });
  }, 120000);

  test("LOW-1: a write after the construct is not seen (#2076 refused it)", async () => {
    if (skip()) return;
    const out = build(`<program>
\${ let n: int = 5; }
<div if=(n > 0)>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
\${ n = 9; }
</program>
`);
    expect(await load(out, ["o"])).toEqual({ errors: [], texts: ["5"] });
  }, 120000);

  test("in an `else` member, read through a const (the place is before the chain)", async () => {
    if (skip()) return;
    const out = build(`<program>
\${ let n: int = 1; }
\${ n = 5; }
\${ const m: int = n; }
<p id="o">\${m}</p>
<div if=(m < 0)>x</div>
<div else>\${ const k: int = m + 0; }<p id="o2">\${k}</p></div>
</program>
`);
    expect(await load(out, ["o", "o2"])).toEqual({ errors: [], texts: ["5", "5"] });
  }, 120000);

  test("in a component's slot content", async () => {
    if (skip()) return;
    const out = build(`<card t:string="x">
</> renders <div>\${t}<slot/></div>
<program>
\${ let n: int = 1; }
\${ n = 5; }
<card><b>\${ const k: int = n * 2; }</b><p id="o">\${k}</p></card>
</program>
`);
    expect(await load(out, ["o"])).toEqual({ errors: [], texts: ["10"] });
  }, 120000);
});
