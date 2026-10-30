// host-allowlist-chromium-s473.test.js — s473-host-allowlist-a (lane A): the #1659 r1 review's R1
// (createElement('script') + `.src = url` + appendChild loads and runs remote JS) and its class
// (iframe.src, a.href with javascript:, form.action), REFUSED by the run-time half of the `<host>`
// allowlist (DRAFT §21.3.3 rule 8.5 guarded(inert-receiver) / guarded(url), rule 8.7 brand checks) —
// proven in a REAL browser. happy-dom loads no script and runs no `javascript:` URL, so it cannot
// show that the sink is closed; this does.
//
// Every case runs a CONTROL first: the same sink, unguarded, does execute in this browser (the probe
// is live — the reviewer's repro, ~/.cache/scrml/review/s473-1659/r1/chrome.test.js). Then the guarded
// emission shape (the receiver through rt.hostInert, the value through rt.hostUrl /
// rt.hostAttrValue) is refused, and nothing executes.
//
// OPT-IN, as slice-m4/css-chromium-s469.test.js: it needs a Chromium binary, which CI and the
// pre-commit hook do not provide, so it runs only with SCRML_BROWSER_TESTS=1 (binary:
// $SCRML_CHROMIUM, else /usr/bin/chromium). Recorded run: docs/changes/s473-host-allowlist-a/progress.md.
//
//   SCRML_BROWSER_TESTS=1 bun test slice-m4/host-allowlist-chromium-s473.test.js    (from compiler/self-host-v2)
//
// Ruling: scrml-support/user-voice-scrml.md S473 "⭐ RULED — `<host>` rule 8 moves from a sink denylist
// to an allowlist". Design: host-binding-allowlist-design-2026-10-29.md §5.5, §5.3.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ON = process.env.SCRML_BROWSER_TESTS === "1";
const BIN = process.env.SCRML_CHROMIUM || "/usr/bin/chromium";
const RUNTIME = join(import.meta.dir, "..", "slice-m1", "runtime", "runtime.js");
const suite = ON ? describe : describe.skip;

let browser, server, dir, page;
const errors = [];
beforeAll(async () => {
  if (!ON) return;
  if (!existsSync(BIN)) throw new Error(`SCRML_BROWSER_TESTS=1 but no Chromium at ${BIN} (set SCRML_CHROMIUM)`);
  dir = mkdtempSync(join(tmpdir(), "s473-host-allowlist-chromium-"));
  copyFileSync(RUNTIME, join(dir, "scrml-runtime.js"));
  writeFileSync(join(dir, "p.html"), "<!doctype html><html><head><meta charset=utf-8></head><body><p>x</p>"
    + "<iframe id=\"other\" src=\"/blank.html\"></iframe>"
    + "<script type=\"module\">import * as rt from \"/scrml-runtime.js\"; window.rt = rt;</script></body></html>");
  writeFileSync(join(dir, "blank.html"), "<!doctype html><p>other realm</p>");
  server = Bun.serve({ port: 0, fetch: async (req) => {
    const p = new URL(req.url).pathname;
    if (p === "/favicon.ico") return new Response("", { status: 204 });
    // the reviewer's remote script: it runs iff the sink loads it
    if (p.startsWith("/x") && p.endsWith(".js")) {
      const flag = p.slice(1, -3);
      return new Response(`window.__ran = (window.__ran || []).concat(["${flag}"]); if (parent !== window) parent.__ran = (parent.__ran || []).concat(["${flag}"]);`, { headers: { "content-type": "text/javascript" } });
    }
    const f = Bun.file(join(dir, p.slice(1)));
    if (!(await f.exists())) return new Response("", { status: 404 });
    return new Response(f, { headers: { "content-type": p.endsWith(".js") ? "text/javascript" : "text/html" } });
  } });
  const { default: puppeteer } = await import("puppeteer");
  browser = await puppeteer.launch({ executablePath: BIN, headless: true, args: ["--no-sandbox"] });
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${server.port}/p.html`);
  await page.waitForFunction(() => window.rt && document.getElementById("other").contentDocument
    && document.getElementById("other").contentDocument.readyState === "complete", { timeout: 10000 });
}, { timeout: 180000 });
afterAll(async () => {
  if (browser) await browser.close();
  if (server) server.stop(true);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const AT = "t() — the `<host>` binding";
/** Run `body` (a function source taking (rt, AT, origin)) in the page; returns { r, ran } after loads settle. */
async function inPage(body) {
  return page.evaluate(async (src, at) => {
    window.__ran = [];
    const trap = (f) => { try { const v = f(); return "ok " + String(v); } catch (e) { return (e && e.code) || ("raw " + String(e && e.message)); } };
    const fn = new Function("rt", "AT", "origin", "trap", "return (async () => {" + src + "})()");
    const r = await fn(window.rt, at, location.origin, trap);
    await new Promise((res) => setTimeout(res, 400));
    return { r, ran: window.__ran.slice() };
  }, body, AT);
}

suite("R1 in Chromium — a <script> receiver is never mutated (guarded(inert-receiver), E-HOST-RECEIVER-RT)", () => {
  test("CONTROL: the reviewer's repro runs remote JS (createElement('script'), .src = url, appendChild)", async () => {
    const { ran } = await inPage(`const s = document.createElement("script"); s.src = origin + "/xcontrol.js"; document.body.appendChild(s);`);
    expect(ran).toEqual(["xcontrol"]);
  });

  test("guarded: .src write through hostInert traps; nothing is loaded or run", async () => {
    const { r, ran } = await inPage(`
      const s = document.createElement("script");
      const t = trap(() => { rt.hostInert(s, AT).src = rt.hostUrl(s, "src", origin + "/xsrc.js", AT); });
      document.body.appendChild(s);
      return [t, s.getAttribute("src")];`);
    expect(r).toEqual(["E-HOST-RECEIVER-RT", null]);
    expect(ran).toEqual([]);
  });

  test("guarded: setAttribute('src', url) through hostInert traps; nothing runs", async () => {
    const { r, ran } = await inPage(`
      const s = document.createElement("script");
      const t = trap(() => rt.hostInert(s, AT).setAttribute(rt.hostSetAttrName("src", AT), rt.hostAttrValue(s, "src", origin + "/xattr.js", AT)));
      document.body.appendChild(s);
      return [t, s.getAttribute("src")];`);
    expect(r).toEqual(["E-HOST-RECEIVER-RT", null]);
    expect(ran).toEqual([]);
  });

  test("CONTROL then guarded: a connected empty <script>'s textContent write runs it — guarded, it traps", async () => {
    const c = await inPage(`const s = document.createElement("script"); document.body.appendChild(s); s.textContent = "window.__ran.push('xtext-control')";`);
    expect(c.ran).toEqual(["xtext-control"]);
    const { r, ran } = await inPage(`
      const s = document.createElement("script"); document.body.appendChild(s);
      return trap(() => { rt.hostInert(s, AT).textContent = "window.__ran.push('xtext')"; });`);
    expect(r).toBe("E-HOST-RECEIVER-RT");
    expect(ran).toEqual([]);
  });

  test("an own `localName` on the <script> does not pass the captured getter", async () => {
    const { r, ran } = await inPage(`
      const s = document.createElement("script");
      Object.defineProperty(s, "localName", { value: "div" });
      const t = trap(() => { rt.hostInert(s, AT).src = origin + "/xshadow.js"; });
      document.body.appendChild(s);
      return [s.localName, t];`);
    expect(r).toEqual(["div", "E-HOST-RECEIVER-RT"]);
    expect(ran).toEqual([]);
  });

  test("an SVG <script> (not the HTML namespace) is refused", async () => {
    const { r, ran } = await inPage(`
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); document.body.appendChild(svg);
      const s = document.createElementNS("http://www.w3.org/2000/svg", "script");
      const t = trap(() => rt.hostInert(s, AT).setAttribute("href", origin + "/xsvg.js"));
      svg.appendChild(s);
      return t;`);
    expect(r).toBe("E-HOST-RECEIVER-RT");
    expect(ran).toEqual([]);
  });
});

suite("R1 class in Chromium — iframe.src, a.href javascript:, form.action, <base href> (guarded(url) + inert-receiver)", () => {
  test("CONTROL then guarded: iframe.src = javascript: runs in the page — guarded, the <iframe> receiver traps", async () => {
    const c = await inPage(`const f = document.createElement("iframe"); document.body.appendChild(f); f.src = "javascript:parent.__ran.push('xiframe-control')";`);
    expect(c.ran).toEqual(["xiframe-control"]);
    const { r, ran } = await inPage(`
      const f = document.createElement("iframe"); document.body.appendChild(f);
      return trap(() => { rt.hostInert(f, AT).src = rt.hostUrl(f, "src", "javascript:parent.__ran.push('xiframe')", AT); });`);
    expect(r).toBe("E-HOST-RECEIVER-RT");
    expect(ran).toEqual([]);
  });

  test("CONTROL then guarded: a.href = javascript: runs on click — guarded, the href is about:blank and nothing runs", async () => {
    const c = await inPage(`const a = document.createElement("a"); a.textContent = "x"; document.body.appendChild(a); a.href = "javascript:window.__ran.push('xa-control')"; a.click();`);
    expect(c.ran).toEqual(["xa-control"]);
    const { r, ran } = await inPage(`
      const a = document.createElement("a"); a.textContent = "x"; document.body.appendChild(a);
      rt.hostInert(a, AT).href = rt.hostUrl(a, "href", "javascript:window.__ran.push('xa')", AT);
      const h = a.getAttribute("href");
      a.href = "#"; // leave the page where it is before the click is judged
      a.href = h;
      a.addEventListener("click", (e) => e.preventDefault()); // about:blank would navigate the test page away
      a.click();
      return h;`);
    expect(r).toBe("about:blank");
    expect(ran).toEqual([]);
  });

  test("CONTROL then guarded: a <form>'s action = javascript: runs on submit — guarded, the <form> receiver traps, and the value is about:blank", async () => {
    const c = await inPage(`const f = document.createElement("form"); document.body.appendChild(f); f.action = "javascript:window.__ran.push('xform-control')"; f.submit();`);
    expect(c.ran).toEqual(["xform-control"]);
    const { r, ran } = await inPage(`
      const f = document.createElement("form"); document.body.appendChild(f);
      const t = trap(() => rt.hostInert(f, AT).setAttribute("action", rt.hostAttrValue(f, "action", "javascript:window.__ran.push('xform')", AT)));
      return [t, rt.hostAttrValue(f, "action", "javascript:x", AT), f.getAttribute("action")];`);
    expect(r).toEqual(["E-HOST-RECEIVER-RT", "about:blank", null]);
    expect(ran).toEqual([]);
  });

  test("a <base>, <meta>, <link>, <style>, <object>, <embed>, custom element receiver traps", async () => {
    const { r } = await inPage(`
      customElements.define("x-probe", class extends HTMLElement { attributeChangedCallback() { window.__ran.push("xcustom"); } static get observedAttributes() { return ["title"]; } });
      return ["base", "meta", "link", "style", "object", "embed", "template", "x-probe"].map((t) => {
        const e = document.createElement(t); document.body.appendChild(e);
        return t + ":" + trap(() => rt.hostInert(e, AT).setAttribute("title", "x"));
      });`);
    expect(r).toEqual(["base", "meta", "link", "style", "object", "embed", "template", "x-probe"].map((t) => t + ":E-HOST-RECEIVER-RT"));
  });

  test("#1670 M1: CONTROL then guarded — a customized built-in `<button is=…>` (localName `button`) runs its author's attributeChangedCallback; guarded, it traps", async () => {
    const c = await inPage(`
      if (!customElements.get("x-b1")) customElements.define("x-b1", class extends HTMLButtonElement { static get observedAttributes() { return ["title"]; } attributeChangedCallback(n, o, v) { this.innerHTML = v; } }, { extends: "button" });
      const b = document.createElement("button", { is: "x-b1" }); document.body.appendChild(b);
      b.setAttribute("title", "<img src=x onerror=\\"window.__ran.push('cbuiltin-control')\\">");
      return b.localName;`);
    expect(c.r).toBe("button");
    expect(c.ran).toEqual(["cbuiltin-control"]);
    const { r, ran } = await inPage(`
      const b = document.createElement("button", { is: "x-b1" }); document.body.appendChild(b);
      return trap(() => rt.hostInert(b, AT).setAttribute(rt.hostSetAttrName("title", AT), rt.hostAttrValue(b, "title", "<img src=x onerror=\\"window.__ran.push('cbuiltin')\\">", AT)));`);
    expect(r).toBe("E-HOST-RECEIVER-RT");
    expect(ran).toEqual([]);
  });

  test("#1670 I2 / M1: another same-origin realm's inert element and a re-prototyped element are not inert receivers of this page", async () => {
    const { r } = await inPage(`
      const od = document.getElementById("other").contentDocument;
      const x = od.createElement("div");
      const s = document.createElement("span"); Object.setPrototypeOf(s, HTMLDivElement.prototype);
      return [trap(() => rt.hostInert(x, AT)), trap(() => rt.hostInert(s, AT)), trap(() => rt.hostInert(document.createElement("div"), AT)).slice(0, 2)];`);
    expect(r).toEqual(["E-HOST-RECEIVER-RT", "E-HOST-RECEIVER-RT", "ok"]);
  });

  test("#1670 L2: a non-string attribute name whose toString flips `title` → `href` is refused, never judged by one String()", async () => {
    const { r } = await inPage(`
      let k = 0; const flip = { toString: () => (k++ === 0 ? "title" : "href") };
      const a = document.createElement("a");
      const t = trap(() => a.setAttribute(flip, rt.hostAttrValue(a, flip, "javascript:1", AT)));
      return [t.startsWith("raw hostAttrValue"), a.getAttribute("href")];`);
    expect(r).toEqual([true, null]);
  });

  test("an inert receiver passes and the member runs (a real <div>, <a>, <img>)", async () => {
    const { r } = await inPage(`
      const d = document.createElement("div"); rt.hostInert(d, AT).textContent = "hi";
      const a = document.createElement("a"); rt.hostInert(a, AT).href = rt.hostUrl(a, "href", "https://example.com/", AT);
      const i = document.createElement("img"); rt.hostInert(i, AT).setAttribute("src", rt.hostAttrValue(i, "src", "/pic.png", AT));
      return [d.textContent, a.getAttribute("href"), i.getAttribute("src")];`);
    expect(r).toEqual(["hi", "https://example.com/", "/pic.png"]);
  });
});

suite("brand checks in Chromium (r8.7) — another realm's object, a prototype-borrowing fake, `window` as HTMLElement", () => {
  test("an element of another realm (an iframe's document) fails the brand check, and is not an inert receiver of this page", async () => {
    const { r } = await inPage(`
      const od = document.getElementById("other").contentDocument;
      const x = od.createElement("div");
      return [trap(() => rt.hostBrand(x, "HTMLElement", AT)), trap(() => rt.hostBrand(document.createElement("div"), "HTMLElement", AT)).slice(0, 2)];`);
    expect(r).toEqual(["E-HOST-VALUE-MISMATCH-RT", "ok"]);
  });

  test("Object.create(HTMLCanvasElement.prototype), `window` declared HTMLElement, EventTarget on a real element", async () => {
    const { r } = await inPage(`
      return [
        trap(() => rt.hostBrand(Object.create(HTMLCanvasElement.prototype), "HTMLCanvasElement", AT)),
        trap(() => rt.hostBrand(window, "HTMLElement", AT)),
        trap(() => rt.hostBrand(document.createElement("canvas"), "EventTarget", AT)).slice(0, 2),
        trap(() => rt.hostInert(Object.create(HTMLDivElement.prototype), AT)),
      ];`);
    expect(r).toEqual(["E-HOST-VALUE-MISMATCH-RT", "E-HOST-VALUE-MISMATCH-RT", "ok", "E-HOST-RECEIVER-RT"]);
  });

  test("#1670 M2: prototype-borrowing fakes and Proxies of NON-Node interfaces fail (a WebIDL brand getter), and an element's tag must match its interface", async () => {
    const { r } = await inPage(`
      const realDiv = document.createElement("div");
      const div = document.createElement("div"); Object.setPrototypeOf(div, HTMLCanvasElement.prototype);
      const sc = document.createElement("script"); Object.setPrototypeOf(sc, HTMLDivElement.prototype);
      const ctx = document.createElement("canvas").getContext("2d");
      return [
        trap(() => rt.hostBrand(Object.create(CanvasRenderingContext2D.prototype), "CanvasRenderingContext2D", AT)),
        trap(() => rt.hostBrand(Object.create(DOMRect.prototype), "DOMRect", AT)),
        trap(() => rt.hostBrand(new Proxy({}, { getPrototypeOf: () => DOMRect.prototype }), "DOMRect", AT)),
        trap(() => rt.hostBrand(new Proxy(realDiv, {}), "HTMLDivElement", AT)),
        trap(() => rt.hostBrand(div, "HTMLCanvasElement", AT)),
        trap(() => rt.hostBrand(sc, "HTMLDivElement", AT)),
        trap(() => rt.hostBrand(new DOMRectReadOnly(1, 2, 3, 4), "DOMRect", AT)),
        // the real ones pass
        trap(() => rt.hostBrand(ctx, "CanvasRenderingContext2D", AT)).slice(0, 2),
        trap(() => rt.hostBrand(new DOMRect(1, 2, 3, 4), "DOMRect", AT)).slice(0, 2),
        trap(() => rt.hostBrand(realDiv, "HTMLDivElement", AT)).slice(0, 2),
        trap(() => rt.hostBrand(document.createElement("script"), "HTMLElement", AT)).slice(0, 2),
      ];`);
    const M = "E-HOST-VALUE-MISMATCH-RT";
    expect(r).toEqual([M, M, M, M, M, M, M, "ok", "ok", "ok", "ok"]);
  });

  test("a memoized callback wrapper: addEventListener then removeEventListener with the same function removes it", async () => {
    const { r } = await inPage(`
      const b = document.createElement("button"); document.body.appendChild(b);
      let n = 0; const f = () => { n++; };
      const sig = [{ k: "iface", name: "MouseEvent" }];
      b.addEventListener("click", rt.hostCallback(f, sig, AT)); b.click();
      b.removeEventListener("click", rt.hostCallback(f, sig, AT)); b.click();
      return n;`);
    expect(r).toBe(1);
    expect(errors).toEqual([]);
  });
});
