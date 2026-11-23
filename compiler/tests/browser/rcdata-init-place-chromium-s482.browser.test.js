/**
 * #2079 review PRE-2 — a file-scope initializer written inside `<textarea>` / `<title>` (content the HTML
 * parser reads as text, so it holds no place), in a REAL browser (Playwright Chromium).
 * change-id: s482-place-fu.
 *
 * SPEC §7.6 rule (b) S482 (s482-place-fu): "An initializer written in one runs just before the element".
 * Base put it just AFTER the element; the element's own content read the binding before that place, so the
 * printer ran it at module initialization with every binding its initializer reads:
 * `${ n = 5; } ${ const m = n; } <p>${m}</p> <textarea>${ const k = m + 0; }${k}</textarea>` showed m = 1
 * and the textarea 1 (source order: 5 and 5); `<title>` the same. The slice test
 * (compiler/self-host-v2/slice-m4/rcdata-init-place-s482.test.js) pins the refusals and the happy-dom values;
 * this file pins the values in Chromium.
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
  dir = mkdtempSync(join(tmpdir(), "s482-rcdata-place-chromium-"));
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

// serve `out` over http (the page loads ES modules), load it, read each `#id` — a textarea's value, any
// other element's text — and `title`, the document title
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
    const texts = await page.evaluate((xs) => xs.map((id) => {
      if (id === "title") return document.title;
      const el = document.getElementById(id);
      if (!el) return "<none>";
      return el.tagName === "TEXTAREA" ? el.value : el.textContent;
    }), ids);
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

describe("an initializer in `<textarea>` / `<title>` runs just before the element (Chromium)", () => {
  test("textarea: read through a file-scope const — m and the textarea both 5 (base: 1 and 1)", async () => {
    if (skip()) return;
    const out = build(`<program>
\${ let n: int = 1; }
\${ n = 5; }
\${ const m: int = n; }
<p id="o">\${m}</p>
<textarea id="o2">\${ const k: int = m + 0; }\${k}</textarea>
</program>
`);
    expect(await load(out, ["o", "o2"])).toEqual({ errors: [], texts: ["5", "5"] });
  }, 120000);

  test("title: read through a file-scope const — m and the title both 5 (base: 1 and 1)", async () => {
    if (skip()) return;
    const out = build(`<program>
\${ let n: int = 1; }
\${ n = 5; }
\${ const m: int = n; }
<p id="o">\${m}</p>
<title>\${ const k: int = m + 0; }\${k}</title>
</program>
`);
    expect(await load(out, ["o", "title"])).toEqual({ errors: [], texts: ["5", "5"] });
  }, 120000);

  test("title: an acting initializer first in the element runs in its place", async () => {
    if (skip()) return;
    const out = build(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = n + 1; return n; } }
\${ n = 5; }
\${ const m: int = n; }
<p id="o">\${m}</p>
<title>\${ const k: int = bump(); }\${k}</title>
<p id="o2">\${n}</p>
</program>
`);
    expect(await load(out, ["o", "title", "o2"])).toEqual({ errors: [], texts: ["5", "6", "6"] });
  }, 120000);

  test("textarea: an acting initializer first, then a display of what it wrote", async () => {
    if (skip()) return;
    const out = build(`<program>
\${ let n: int = 1; }
\${ function bump() -> int { n = n + 1; return 7; } }
\${ n = 5; }
<textarea id="o2">\${ const k: int = bump(); }\${k} \${n}</textarea>
<p id="o">\${n}</p>
</program>
`);
    expect(await load(out, ["o", "o2"])).toEqual({ errors: [], texts: ["6", "7 6"] });
  }, 120000);
});
