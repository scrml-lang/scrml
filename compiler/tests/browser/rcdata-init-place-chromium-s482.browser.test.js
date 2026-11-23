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

// the CLI's refusal: its exit code and the error codes it printed
function refused(src) {
  const file = join(dir, `c${n++}.scrml`);
  writeFileSync(file, src);
  const p = Bun.spawnSync(["bun", join(ROOT, "scripts/scrml-boot.ts"), "compile", file, "--output-dir", file + ".out"], { cwd: ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  const text = p.stderr.toString() + p.stdout.toString();
  return { exit: p.exitCode, codes: [...new Set(text.match(/E-[A-Z0-9-]+/g) ?? [])] };
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

// #2082 review HIGH-1 — a `bind:` of a later cell, before the initializer, reads the cell at the mount
// and runs its seed there (`n = 5`); head r0 compiled both shapes and Chromium showed k = 1. Each is
// refused now; its control (the initializer outside the construct / after the textarea) shows 5.
describe("a `bind:` before the initializer runs the bound cell's seed (Chromium, #2082 HIGH-1)", () => {
  const PRE = `\${ let n: int = 1; }
\${ function bumps() -> string { n = 5; return "s"; } }
<program>
`;
  test("construct: refused (head r0: Chromium k = 1)", () => {
    const r = refused(PRE + `<div if=(true)><input bind:value=@s/>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
let <s:string=(bumps())/>
</program>
`);
    expect(r.exit).not.toBe(0);
    expect(r.codes).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("construct control (no construct): k = 5, source order", async () => {
    if (skip()) return;
    const out = build(PRE + `<input bind:value=@s/>\${ const k: int = n + 0; }<p id="o">\${k}</p>
let <s:string=(bumps())/>
</program>
`);
    expect(await load(out, ["o"])).toEqual({ errors: [], texts: ["5"] });
  }, 120000);

  test("textarea: refused (head r0: Chromium k = 1; base 5)", () => {
    const r = refused(PRE + `<textarea id="o2" bind:value=@s>\${ const k: int = n + 0; }</textarea><p id="o">\${k}</p>
let <s:string=(bumps())/>
</program>
`);
    expect(r.exit).not.toBe(0);
    expect(r.codes).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("textarea control (initializer after it): k = 5, source order", async () => {
    if (skip()) return;
    const out = build(PRE + `<textarea id="o2" bind:value=@s></textarea>\${ const k: int = n + 0; }<p id="o">\${k}</p>
let <s:string=(bumps())/>
</program>
`);
    expect(await load(out, ["o", "o2"])).toEqual({ errors: [], texts: ["5", "s"] });
  }, 120000);
});

// #2082 review LOW-1 — a literal attribute value (`rows=3`) is no code: the acting initializer after it
// compiles (head r0 refused it) and runs in source order
describe("an acting initializer after a literal attribute (Chromium, #2082 LOW-1)", () => {
  test("rows=3: bump() runs first, the textarea then shows n = 5", async () => {
    if (skip()) return;
    const out = build(`\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
<program>
<textarea id="o2" rows=3>\${ const k: int = bump(); }\${n}</textarea>
<p id="o">\${k}</p>
</program>
`);
    expect(await load(out, ["o", "o2"])).toEqual({ errors: [], texts: ["0", "5"] });
  }, 120000);
});

// #2082 r1 review HIGH-2 / MED-1 — a `<*phase/>` view of a `rule=` graph field renders its state-child
// bodies at the mount; a body that reads a later cell (`${@s}`, `bind:value=@s`) runs that cell's seed
// there, and one that calls a writer writes there. Head r1 compiled each in a construct and Chromium
// showed k = 1; each is refused now. The controls (no construct) show the source-order value, 5.
describe("a `<*x/>` view's state bodies before the initializer (Chromium, #2082 r1 HIGH-2, MED-1)", () => {
  const PRE = `\${ let n: int = 1; }
\${ function bump() -> int { n = 5; return 0; } }
\${ function bumps() -> string { n = 5; return "s"; } }
<program>
    type Phase:enum = { Idle, Loading }
`;
  const PHASE = (body) => `    <phase:Phase=.Idle>
        <Idle rule=.Loading>
            ${body}
        </>
        <Loading rule=.Idle : "Loading">
    </>
`;
  const S = `    let <s:string=(bumps())/>
</program>
`;
  test("h03 construct, body reads `@s`: refused (head r1: Chromium k = 1)", () => {
    const r = refused(PRE + `    <div if=(true)><span><*phase/></span>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
` + PHASE("<b>${@s}</b>") + S);
    expect(r.exit).not.toBe(0);
    expect(r.codes).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("h07 construct, body binds `@s`: refused (head r1: Chromium k = 1)", () => {
    const r = refused(PRE + `    <div if=(true)><span><*phase/></span>\${ const k: int = n + 0; }<p id="o">\${k}</p></div>
` + PHASE("<input bind:value=@s/>") + S);
    expect(r.exit).not.toBe(0);
    expect(r.codes).toEqual(["E-FILE-SCOPE-INIT-IN-CONSTRUCT"]);
  }, 120000);

  test("h04 control (no construct), body reads `@s`: k = 5, source order", async () => {
    if (skip()) return;
    const out = build(PRE + `    <span><*phase/></span>\${ const k: int = n + 0; }<p id="o">\${k}</p>
` + PHASE("<b>${@s}</b>") + S);
    expect(await load(out, ["o"])).toEqual({ errors: [], texts: ["5"] });
  }, 120000);

  test("h08 control (no construct), body binds `@s`: k = 5, source order", async () => {
    if (skip()) return;
    const out = build(PRE + `    <span><*phase/></span>\${ const k: int = n + 0; }<p id="o">\${k}</p>
` + PHASE("<input bind:value=@s/>") + S);
    expect(await load(out, ["o"])).toEqual({ errors: [], texts: ["5"] });
  }, 120000);
});
