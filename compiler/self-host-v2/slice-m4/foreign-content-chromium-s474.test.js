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

// ---------------------------------------------------------------------------
// s474 r1 (review of #1727, F1–F4): the parser-restructure class in a REAL browser.
// ---------------------------------------------------------------------------

/** Compile `src` (clean), print it, open it; `edit` / the async `post` rewrite the page first. */
async function openPrinted(src, edit = (h) => h, post = async (h) => h) {
  const r = frontEnd(mods, [{ path: "app.scrml", src }]);
  expect(r.diags.filter((d) => d.code.startsWith("E-")).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  const name = `p${seq++}`;
  const out = mods.print.printProgram(r.core, `${name}.client.js`, "scrml-runtime.js");
  expect(out.refused).toEqual([]);
  writeFileSync(join(dir, `${name}.html`), await post(edit(out.html)));
  writeFileSync(join(dir, `${name}.client.js`), out.js);
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${server.port}/${name}.html`);
  await new Promise((r2) => setTimeout(r2, 150));
  return { page, errors };
}

/** Every element holding SECRET text that the user can SEE (a box, and checkVisibility). */
const secretShown = (page) => page.evaluate(() => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const out = [];
  let n;
  while ((n = w.nextNode())) {
    if (!/SECRET/.test(n.data)) continue;
    const e = n.parentElement;
    const r = e.getBoundingClientRect();
    const rg = document.createRange();
    rg.selectNodeContents(n);
    const tw = rg.getBoundingClientRect().width;
    const vis = e.checkVisibility ? e.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }) : true;
    if (vis && ((r.width > 0 && r.height > 0) || tw > 0)) out.push(e.localName);
  }
  return out;
});

const click = async (page, sel) => {
  if (await page.$(sel)) await page.click(sel);
  await new Promise((r) => setTimeout(r, 100));
};

/** Set one template's recorded shape to a wrong value — a stand-in for a restructuring the analyzer does not model. */
const breakShape = (pick) => (html) => html.replace(/<template id="([^"]+)"([^>]*) data-scrml-shape="\d+"/g, (m, id, rest) => (pick(id) ? `<template id="${id}"${rest} data-scrml-shape="0"` : m));

/**
 * Make one FOREIGN template's wrapper hold two nodes (an extra `<i>` after the `<svg>` wrapper), so its arm
 * throws when it opens — the very throw a breakout tag produced before §24.5 refused it (review F1). The
 * runtime's wrapper check is the same on the merge base, so this pins the flush containment itself: on the
 * base the throw stranded the gate closing in the same write and the secret stayed visible after logout.
 */
const breakWrapper = (id) => (html) => html.replace(new RegExp(`(<template id="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>[\\s\\S]*?)</template>`), "$1<i></i></template>");

/** The id of the template whose content holds `text`. */
const templateHolding = (html, text) => [...html.matchAll(/<template id="([^"]+)"[^>]*>([\s\S]*?)<\/template>/g)].find((x) => x[2].includes(text))[1];

suite("r1 in Chromium — a template that throws never strands a gate closing in the same write (F1, F4)", () => {
  const SHAPES = {
    ifAfter: `<svg><g if=(@pw == "wrong")><text y="20">bye</text></g></svg><p if=(@pw == "secret")>SECRET</p>`,
    showAfter: `<svg><g if=(@pw == "wrong")><text y="20">bye</text></g></svg><p show=(@pw == "secret")>SECRET</p>`,
    ifBefore: `<p if=(@pw == "secret")>SECRET</p><svg><g if=(@pw == "wrong")><text y="20">bye</text></g></svg>`,
    svgSecret: `<svg><g if=(@pw == "wrong")><text y="20">bye</text></g><text if=(@pw == "secret") y="40">SECRET</text></svg>`,
    elseArm: `<svg><g if=(@pw != "wrong")><text y="20">hi</text></g><g else><text y="20">bye</text></g></svg><p if=(@pw == "secret")>SECRET</p>`,
  };
  for (const [name, markup] of Object.entries(SHAPES)) {
    test(`${name}: login, then logout next to an arm that throws when it opens — the secret is hidden after logout`, async () => {
      const { page, errors } = await openPrinted(gateProgram(markup), (html) => breakWrapper(templateHolding(html, "bye"))(html));
      expect(await secretShown(page)).toEqual([]);                       // first paint
      await click(page, "#right");
      expect((await secretShown(page)).length).toBeGreaterThan(0);       // logged in
      for (let i = 0; i < 3; i++) {
        await click(page, "#wrong");
        expect(await secretShown(page)).toEqual([]);                     // logged out: the gate closed
      }
      expect(errors.some((e) => /wrapper does not hold exactly one node/.test(e))).toBe(true);   // the arm threw, and the throw was contained
      await page.close();
    }, 30000);
  }
  test("an ungated restructured template at mount: it is not mounted; no secret at first paint or after the wrong password", async () => {
    const { page, errors } = await openPrinted(gateProgram(`<span show=(@pw == "secret")>SECRET</span>`), breakShape((id) => id === "scrml:program"));
    expect(await secretShown(page)).toEqual([]);
    await click(page, "#wrong");
    expect(await secretShown(page)).toEqual([]);
    expect(errors.some((e) => /restructured/.test(e))).toBe(true);
    await page.close();
  }, 30000);
});

// The F3 repros no longer compile (that is the fix). To show the runtime backstop holds even where the
// analyzer would not refuse, each repro is ALSO printed as the printer would print it: a clean twin (the
// offending tags spelled as custom elements, `x-p`, which neither the analyzer nor the parser treats
// specially) is compiled, renamed back to the repro's tags in the page, and each template's
// `data-scrml-shape` is recomputed for the tree AS WRITTEN — by the runtime's own `shapeHash`, over an XML
// parse of the template text (an XML parser restructures nothing). That is exactly the page the printer
// writes for the repro; Chromium's HTML parser then restructures it.
async function asWrittenShapes(html) {
  writeFileSync(join(dir, "blank.html"), "<!doctype html><title>x</title>");
  const page = await browser.newPage();
  await page.goto(`http://localhost:${server.port}/blank.html`);
  const shapes = await page.evaluate(async (src) => {
    const rt = await import("/scrml-runtime.js");
    const depthOf = { svg: 1, math: 1, "math-text": 2, annot: 2 };
    const out = {};
    for (const m of src.matchAll(/<template id="([^"]+)"([^>]*)>([\s\S]*?)<\/template>/g)) {
      const doc = new DOMParser().parseFromString("<r>" + m[3] + "</r>", "application/xml");
      if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("not well-formed: " + m[1]);
      let root = doc.documentElement;
      const ns = /data-scrml-ns="([^"]+)"/.exec(m[2]);
      for (let i = 0; ns && i < depthOf[ns[1]]; i++) root = root.firstElementChild;
      out[m[1]] = rt.shapeHash(root);
    }
    return out;
  }, html);
  await page.close();
  return html.replace(/<template id="([^"]+)"([^>]*) data-scrml-shape="\d+"/g, (m, id, rest) => `<template id="${id}"${rest} data-scrml-shape="${shapes[id]}"`);
}

const unX = (html) => html.replace(/<(\/?)x-/g, "<$1");

suite("r1 in Chromium — the review's F3 repros: refused at compile time; printed anyway, the secret stays hidden", () => {
  const S = `show=(@pw == "secret")`;
  // [repro, its code, the clean twin, twin → repro]
  const F3 = {
    svgP: [`<svg><p>x</p></svg><div ${S}>SECRET</div>`, "E-HTML-FOREIGN-BREAKOUT", `<svg><x-p>x</x-p></svg><div ${S}>SECRET</div>`, unX],
    svgFont: [`<svg><font color="red">x</font></svg><span ${S}>SECRET</span>`, "E-HTML-FOREIGN-BREAKOUT", `<svg><x-font color="red">x</x-font></svg><span ${S}>SECRET</span>`, unX],
    divSvgP: [`<div><svg><p>x</p></svg><span ${S}>SECRET</span></div>`, "E-HTML-FOREIGN-BREAKOUT", `<div><svg><x-p>x</x-p></svg><span ${S}>SECRET</span></div>`, unX],
    svgTable: [`<svg><table><tbody><tr><td>x</td></tr></tbody></table></svg><span ${S}>SECRET</span>`, "E-HTML-FOREIGN-BREAKOUT",
      `<svg><x-table><x-tbody><x-tr><x-td>x</x-td></x-tr></x-tbody></x-table></svg><span ${S}>SECRET</span>`, unX],
    htmlArmSvgP: [`<div if=(@pw != "")><svg><p>x</p></svg><span ${S}>SECRET</span></div>`, "E-HTML-FOREIGN-BREAKOUT",
      `<div if=(@pw != "")><svg><x-p>x</x-p></svg><span ${S}>SECRET</span></div>`, unX],
    pDiv: [`<p><div>x</div></p><span ${S}>SECRET</span>`, "E-HTML-PARSER-REPAIR", `<p><x-div>x</x-div></p><span ${S}>SECRET</span>`, unX],
    tableSpan: [`<table><span>x</span><tbody><tr><td>a</td></tr></tbody></table><span ${S}>SECRET</span>`, "E-HTML-PARSER-REPAIR",
      `<table><caption>x</caption><tbody><tr><td>a</td></tr></tbody></table><span ${S}>SECRET</span>`,
      (h) => h.replace("<table><caption>x</caption>", "<table><span>x</span>")],
    aA: [`<a href="/x"><a href="/y">x</a></a><span ${S}>SECRET</span>`, "E-HTML-PARSER-REPAIR", `<a href="/x"><x-a href="/y">x</x-a></a><span ${S}>SECRET</span>`, unX],
    mathP: [`<math><p>x</p></math><span ${S}>SECRET</span>`, "E-HTML-FOREIGN-BREAKOUT", `<math><x-p>x</x-p></math><span ${S}>SECRET</span>`, unX],
  };
  for (const [name, [markup, code, twin, rename]] of Object.entries(F3)) {
    test(name, async () => {
      const r = frontEnd(mods, [{ path: "app.scrml", src: gateProgram(markup) }]);
      expect(r.diags.filter((d) => d.code.startsWith("E-")).map((d) => d.code)).toEqual([code]);
      const { page, errors } = await openPrinted(gateProgram(twin), (h) => {
        const html = rename(h);
        expect(html).not.toMatch(/<\/?x-/);          // the page holds the repro's own tags
        return html;
      }, asWrittenShapes);
      expect(await secretShown(page)).toEqual([]);                       // first paint
      await click(page, "#wrong");
      expect(await secretShown(page)).toEqual([]);                       // the wrong password
      expect(errors.some((e) => /restructured/.test(e))).toBe(true);     // the shape check refused to mount it
      await page.close();
    }, 30000);
  }
});


// s474 r2 (re-review of 4a3966ff0, review-r1.md R1): parser changes that only drop a TEXT node shifted the
// child-index hole paths while the round-1 shape (elements / comments only) still matched — `show=` styled
// the wrong element and SECRET showed at first paint (Chromium, `x_listingNl`, `x_nul`). Text-node presence
// is now part of the shape. s474 r3 (review-r2.md S1 / S2; PA: match HTML and base): the printer STRIPS
// the one line ending (LF, CRLF, lone CR) the parser drops after `<pre>` / `<listing>` / `<textarea>`.
suite("r2/r3 in Chromium — a dropped text node never misaddresses a hole (R1, S1, S2)", () => {
  const S = `show=(@pw == "secret")`;
  const steps = async (page) => {
    expect(await secretShown(page)).toEqual([]);                         // first paint
    await click(page, "#wrong");
    expect(await secretShown(page)).toEqual([]);                         // the wrong password
  };
  for (const [name, nl] of [["x_listingNl (LF)", "\n"], ["w_crlfListing (CRLF)", "\r\n"], ["w_crListing (lone CR)", "\r"]]) {
    test(`${name}: the leading line ending is stripped as the parser would; the gate is right`, async () => {
      const { page, errors } = await openPrinted(gateProgram(`<listing>${nl}<b ${S}>SECRET</b><i>z</i></listing>`));
      await steps(page);
      await click(page, "#right");
      expect(await secretShown(page)).toEqual(["b"]);                    // the right password shows it, on <b>
      expect(errors).toEqual([]);
      await page.close();
    }, 30000);
  }
  test("backstop: a text node the parser drops is a shape mismatch — not mounted", async () => {
    // the twin's text "Q" stands for a lone line feed: the printed shape records the text, the page then
    // holds "\n" right after `<listing>`, which Chromium's parser drops
    const { page, errors } = await openPrinted(gateProgram(`<listing>Q<b ${S}>SECRET</b><i>z</i></listing>`), (h) => h.replace("<listing>Q<b>", "<listing>\n<b>"));
    await steps(page);
    expect(errors.some((e) => /restructured/.test(e))).toBe(true);
    await page.close();
  }, 30000);
  test("x_nul: a NUL-only text before an element (refused at compile time; printed anyway it is not mounted)", async () => {
    // the twin's text "Q" stands for the NUL: the shape records text presence only, so the printed shape is
    // the one the printer writes for the NUL; the page then holds the NUL, which Chromium's parser drops
    const { page, errors } = await openPrinted(gateProgram(`<div>Q<b ${S}>SECRET</b><i>z</i></div>`), (h) => h.replace("<div>Q<b>", "<div>\u0000<b>"));
    await steps(page);
    expect(errors.some((e) => /restructured/.test(e))).toBe(true);
    await page.close();
  }, 30000);
});

// s474 r3 (review-r2.md S1): what renders is what HTML (and base) renders — no blank first line in a
// `<pre>`, no "\n" in a `<textarea>`'s value, whatever the source's line endings.
suite("r3 in Chromium — the leading line ending renders as HTML renders it (S1, S2)", () => {
  const textOf = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e.localName === "textarea" ? e.value : e.textContent; }, sel);
  const CASES = [
    ["p_preLf", `<pre id="t">\nline1\nline2</pre>`, "line1\nline2"],
    ["p_preCrlf", `<pre id="t">\r\nline1\r\nline2</pre>`, "line1\nline2"],
    ["p_preCr", `<pre id="t">\rline1</pre>`, "line1"],
    ["p_preLfLf", `<pre id="t">\n\nline1</pre>`, "\nline1"],
    ["p_listingLf", `<listing id="t">\nq</listing>`, "q"],
    ["p_textareaLf", `<textarea id="t">\nq</textarea>`, "q"],
    ["p_textareaCrlf", `<textarea id="t">\r\nq</textarea>`, "q"],
    ["p_textareaCr", `<textarea id="t">\rq</textarea>`, "q"],
    // `<pre>` is raw content in scrml (§4.17): the review's hole cases are display text there
    ["p_preHole", `<pre id="t">\${@pw}\nx</pre>`, "${@pw}\nx"],
    ["p_preLfHole", `<pre id="t">\n\${@pw}x</pre>`, "${@pw}x"],
  ];
  for (const [name, markup, want] of CASES) {
    test(`${name}: ${JSON.stringify(want)}`, async () => {
      const { page, errors } = await openPrinted(gateProgram(markup));
      expect(await textOf(page, "#t")).toBe(want);
      expect(errors).toEqual([]);
      await page.close();
    }, 30000);
  }
  test("p_textareaHole: a `${}` value in a `<textarea>` still binds its value", async () => {
    const { page, errors } = await openPrinted(gateProgram(`<textarea id="t">\${@pw}</textarea>`));
    expect(await textOf(page, "#t")).toBe("");
    await click(page, "#right");
    expect(await textOf(page, "#t")).toBe("secret");
    expect(errors).toEqual([]);
    await page.close();
  }, 30000);
});
