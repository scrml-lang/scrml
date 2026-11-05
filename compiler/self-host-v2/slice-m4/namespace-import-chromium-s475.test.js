// namespace-import-chromium-s475.test.js — s475-boot-namespace-import-and-tx-fail-error, Part B, in a REAL
// browser (Chromium, via puppeteer): two files each EXPORT a `<card>` with its own `#{}`; one file imports
// both as namespaces (`import * as a`, `import * as b`) and renders `<a.card/>` and `<b.card>…</b.card>`.
// Each namespaced member renders its DECLARING file's declaration, so each instance carries that file's
// scope key and gets only its own CSS (the twin of the s474 alias case in css-chromium-s469.test.js;
// happy-dom's answer is in namespace-import-s475.test.js).
//
// Ruling: user-voice-scrml.md "## S475" item 3 — "`import * as m from './x.scrml'` is defined; a namespaced
// component is written `<m.card/>`".
//
// OPT-IN, as css-chromium-s469.test.js: it needs a Chromium binary, which CI and the pre-commit hook do not
// provide, so it runs only with SCRML_BROWSER_TESTS=1 (binary: $SCRML_CHROMIUM, else /usr/bin/chromium).
//
//   SCRML_BROWSER_TESTS=1 bun test slice-m4/namespace-import-chromium-s475.test.js   (from compiler/self-host-v2)

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadM2, frontEnd } from "./harness.js";

const ON = process.env.SCRML_BROWSER_TESTS === "1";
const BIN = process.env.SCRML_CHROMIUM || "/usr/bin/chromium";
const RUNTIME = join(import.meta.dir, "..", "slice-m1", "runtime", "runtime.js");

const suite = ON ? describe : describe.skip;

let mods, browser, server, dir;
beforeAll(async () => {
  if (!ON) return;
  if (!existsSync(BIN)) throw new Error(`SCRML_BROWSER_TESTS=1 but no Chromium at ${BIN} (set SCRML_CHROMIUM)`);
  ({ mods } = loadM2());
  dir = mkdtempSync(join(tmpdir(), "s475-ns-chromium-"));
  copyFileSync(RUNTIME, join(dir, "scrml-runtime.js"));
  server = Bun.serve({ port: 0, fetch: (req) => {
    const p = new URL(req.url).pathname;
    if (p === "/favicon.ico") return new Response("", { status: 204 });
    const f = Bun.file(join(dir, p.slice(1)));
    return new Response(f, { headers: { "content-type": p.endsWith(".js") ? "text/javascript" : "text/html" } });
  } });
  const { default: puppeteer } = await import("puppeteer");
  browser = await puppeteer.launch({ executablePath: BIN, headless: true, args: ["--no-sandbox"] });
}, { timeout: 180000 });
afterAll(async () => {
  if (browser) await browser.close();
  if (server) server.stop(true);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

let seq = 0;
/** Compile `files` (clean; entry `app.scrml`), serve it, open it; returns the page. */
async function open(files) {
  const r = frontEnd(mods, files, "app.scrml");
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  const name = `p${seq++}`;
  const out = mods.print.printProgram(r.core, `${name}.client.js`, "scrml-runtime.js");
  writeFileSync(join(dir, `${name}.html`), out.html);
  writeFileSync(join(dir, `${name}.client.js`), out.js);
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("requestfailed", (q) => errors.push("request failed: " + q.url()));
  await page.goto(`http://localhost:${server.port}/${name}.html`);
  try {
    await page.waitForFunction(() => document.body.children.length > 0, { timeout: 10000 });
  } catch (e) {
    throw new Error("the page never rendered: " + JSON.stringify(errors) + " " + (await page.content()).slice(-600));
  }
  expect(errors).toEqual([]);
  return page;
}
const style = (page, sel, prop) => page.evaluate((s, p) => getComputedStyle(document.querySelector(s))[p], sel, prop);

suite("Chromium — two namespaced `<card>`s (`<a.card/>`, `<b.card>…</b.card>`) in one file (s475)", () => {
  test("each card's scoped rule reaches only its own instance; each keys by its declaring file", async () => {
    const page = await open([
      { path: "ui/a.scrml", src: `export <card t:string/>
renders <div class="c" id="ca">#{ .c { color: rgb(255, 0, 0); } }<span class="c" id="ca-t">\${t}</span></div>
` },
      { path: "ui/b.scrml", src: `export <card t:string/>
renders <div class="c" id="cb">#{ .c { color: rgb(0, 128, 0); } }<span class="c" id="cb-t">\${t}</span></div>
` },
      { path: "app.scrml", src: `import * as a from "./ui/a.scrml";
import * as b from "./ui/b.scrml";
<program>
    <main><a.card t="1"/><b.card t="2"></b.card></main>
</program>
` },
    ]);
    expect(await style(page, "#ca-t", "color")).toBe("rgb(255, 0, 0)");
    expect(await style(page, "#cb-t", "color")).toBe("rgb(0, 128, 0)");
    expect(await style(page, "#ca", "color")).toBe("rgb(255, 0, 0)");
    expect(await style(page, "#cb", "color")).toBe("rgb(0, 128, 0)");
    const got = await page.evaluate(() => [document.querySelector("#ca").getAttribute("data-scrml"), document.querySelector("#cb").getAttribute("data-scrml"), document.querySelector("#ca-t").textContent, document.querySelector("#cb-t").textContent]);
    expect(got).toEqual([mods.core.scopeKey("ui/a.scrml", "card"), mods.core.scopeKey("ui/b.scrml", "card"), "1", "2"]);
    await page.close();
  });
});
