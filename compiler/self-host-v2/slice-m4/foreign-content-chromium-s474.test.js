// foreign-content-chromium-s474.test.js — s474 lane boot-gate-await-mathml (backfill H3): what an
// `if=` / `<each>` / Tier-0 row / component / slot inside `<svg>` or `<math>` RENDERS, in a REAL
// browser (Chromium, via puppeteer). happy-dom cannot see this class: it does not build template
// content in the SVG / MathML namespaces, so a gated `<text>` / `<mi>` built as an HTML element and
// one built correctly look alike there. Measured on the base (origin/main e4f6ae6e4): every arm / row /
// component template inside foreign content was built as HTML (`TEXT@xhtml`, `MI@xhtml`) and rendered
// NOTHING (0×0) with its gate TRUE — fail closed (the wrong password never showed the gated text), but
// the right one never showed it either.
//
// OPT-IN, as css-chromium-s469.test.js: SCRML_BROWSER_TESTS=1 (binary: $SCRML_CHROMIUM, else
// /usr/bin/chromium).
//
//   SCRML_BROWSER_TESTS=1 bun test slice-m4/foreign-content-chromium-s474.test.js   (from compiler/self-host-v2)
//
// Each shape: after #wrong, no "LOGGED IN" is visible (the gate holds); after #right, every node
// holding "LOGGED IN" is in the namespace its parent's children parse in, and has a box (it renders).

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadM2, frontEnd } from "./harness.js";
import { FOREIGN, COMPONENTS, gateProgram } from "./foreign-content-fixtures.js";

const ON = process.env.SCRML_BROWSER_TESTS === "1";
const BIN = process.env.SCRML_CHROMIUM || "/usr/bin/chromium";
const RUNTIME = join(import.meta.dir, "..", "slice-m1", "runtime", "runtime.js");

const suite = ON ? describe : describe.skip;

let mods, browser, server, dir;
beforeAll(async () => {
  if (!ON) return;
  if (!existsSync(BIN)) throw new Error(`SCRML_BROWSER_TESTS=1 but no Chromium at ${BIN} (set SCRML_CHROMIUM)`);
  ({ mods } = loadM2());
  dir = mkdtempSync(join(tmpdir(), "s474-foreign-chromium-"));
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
async function open(src) {
  const r = frontEnd(mods, [{ path: "app.scrml", src }]);
  expect(r.diags.filter((d) => d.code.startsWith("E-")).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  const name = `p${seq++}`;
  const out = mods.print.printProgram(r.core, `${name}.client.js`, "scrml-runtime.js");
  writeFileSync(join(dir, `${name}.html`), out.html);
  writeFileSync(join(dir, `${name}.client.js`), out.js);
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(`http://localhost:${server.port}/${name}.html`);
  await page.waitForFunction(() => document.querySelector("#out") !== null, { timeout: 10000 });
  return { page, errors };
}

const SVG = "http://www.w3.org/2000/svg";
const MATHML = "http://www.w3.org/1998/Math/MathML";
const XHTML = "http://www.w3.org/1999/xhtml";

/** Every leaf element under #out whose text matches `re`: its namespace, its parent's, and its box. */
const leaves = (page, re) => page.evaluate((src) => {
  const rx = new RegExp(src);
  return [...document.querySelector("#out").querySelectorAll("*")]
    .filter((e) => e.children.length === 0 && rx.test(e.textContent))
    .map((e) => {
      const r = e.getBoundingClientRect();
      return { tag: e.localName, ns: e.namespaceURI, parent: e.parentElement.localName, parentNs: e.parentElement.namespaceURI, w: r.width, h: r.height };
    });
}, re.source);

/** The namespace a child of `parent` (in `parentNs`) parses in — the expectation, per the HTML parser. */
function expectedNs(tag, parent, parentNs) {
  if (parentNs === SVG) return ["foreignObject", "desc", "title"].includes(parent) ? XHTML : SVG;
  if (parentNs === MATHML) {
    if (["mi", "mo", "mn", "ms", "mtext"].includes(parent)) return ["mglyph", "malignmark"].includes(tag) ? MATHML : XHTML;
    return MATHML;
  }
  return tag === "svg" ? SVG : tag === "math" ? MATHML : XHTML;
}

async function gate(src) {
  const { page, errors } = await open(src);
  await page.click("#wrong");
  await new Promise((r) => setTimeout(r, 100));
  const wrong = (await leaves(page, /LOGGED IN/)).filter((l) => l.w > 0 && l.h > 0);
  await page.click("#right");
  await new Promise((r) => setTimeout(r, 100));
  const right = await leaves(page, /LOGGED IN/);
  await page.close();
  return { wrong, right, errors };
}

const ALWAYS = new Set(["s_each", "m_each", "s_gather"]);   // ungated rows: visible either way

suite("H3 in Chromium — foreign-content templates render in their namespace; the gate holds", () => {
  for (const [name, markup] of Object.entries(FOREIGN)) {
    test(name, async () => {
      const { wrong, right, errors } = await gate(gateProgram(markup));
      expect(errors).toEqual([]);
      if (!ALWAYS.has(name)) expect(wrong).toEqual([]);
      expect(right.length).toBeGreaterThan(0);
      for (const l of right) {
        expect({ name, tag: l.tag, ns: l.ns }).toEqual({ name, tag: l.tag, ns: expectedNs(l.tag, l.parent, l.parentNs) });
        expect(l.w).toBeGreaterThan(0);
        expect(l.h).toBeGreaterThan(0);
      }
    }, 30000);
  }
  for (const [name, [top, markup]] of Object.entries(COMPONENTS)) {
    test(name, async () => {
      const { wrong, right, errors } = await gate(gateProgram(markup, top));
      expect(errors).toEqual([]);
      // c_svgUseMixed's `<p><icon/></p>` is ungated (an HTML-context `<text>`, inline): only the svg one is gated
      const gated = (ls) => ls.filter((l) => l.parentNs !== XHTML || l.ns !== XHTML || name !== "c_svgUseMixed");
      expect(gated(wrong)).toEqual([]);
      expect(gated(right).length).toBeGreaterThan(0);
      for (const l of right) {
        expect({ name, tag: l.tag, ns: l.ns }).toEqual({ name, tag: l.tag, ns: expectedNs(l.tag, l.parent, l.parentNs) });
        expect(l.w).toBeGreaterThan(0);
      }
    }, 30000);
  }
  test("an `else` arm in foreign content renders in its namespace too (`<mi else>`, `<text else>`)", async () => {
    for (const markup of [FOREIGN.m_ifElse, FOREIGN.s_ifElse]) {
      const { page, errors } = await open(gateProgram(markup));
      await page.click("#wrong");
      await new Promise((r) => setTimeout(r, 100));
      const nope = await leaves(page, /NOPE/);
      await page.close();
      expect(errors).toEqual([]);
      expect(nope.length).toBe(1);
      expect([SVG, MATHML]).toContain(nope[0].ns);
      expect(nope[0].w).toBeGreaterThan(0);
    }
  }, 30000);
});
