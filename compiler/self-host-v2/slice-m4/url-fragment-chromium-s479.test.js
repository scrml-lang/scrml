// url-fragment-chromium-s479.test.js — s479-records, RULED S479 §3.B item 22
// (scrml-support/user-voice-scrml.md "⭐ RULED — the rest of S478 hand-off §3.B, PA recs adopted
// (S479, 2026-11-18)": *"`url(#ident)` (g-boot-css-url-attr-local-fragment-refused-s473) — Rec
// (INTERIM): admit exactly `url(#ident)`, after a browser check that it does not fetch under a
// static `<base>`."*).
//
// THE BROWSER CHECK the ruling requires, kept as a test. A real browser (Chromium, via puppeteer)
// — happy-dom has no fetch model for CSS references. A page served from origin A carries a static
// `<base href>` on origin B; script writes every CSS-url attribute (the runtime's CSS_URL_ATTRS)
// on SVG and HTML elements, and a SMIL `<set to=>` of each. With `url(#ident)` values origin B
// sees NO request (and the page makes none beyond itself); the CONTROL, `url(x.svg#g)`, is fetched
// from origin B — so the probe can see a fetch when there is one.
//
// It then loads the bootstrap runtime and checks the guard admits `url(#ident)` there and still
// removes `url(x.svg#g)` (the runtime half; the full matrix is css-url-guard-s473.test.js).
//
// OPT-IN. It needs a Chromium binary, which CI and the pre-commit hook do not provide, so it runs
// only with SCRML_BROWSER_TESTS=1 (binary: $SCRML_CHROMIUM, else /usr/bin/chromium):
//
//   SCRML_BROWSER_TESTS=1 bun test slice-m4/url-fragment-chromium-s479.test.js   (from compiler/self-host-v2)

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ON = process.env.SCRML_BROWSER_TESTS === "1";
const BIN = process.env.SCRML_CHROMIUM || "/usr/bin/chromium";
const RUNTIME = join(import.meta.dir, "..", "slice-m1", "runtime", "runtime.js");
const suite = ON ? describe : describe.skip;

const ATTRS = ["fill", "stroke", "filter", "mask", "clip-path", "marker", "marker-start", "marker-mid", "marker-end", "cursor", "color-profile"];
const FRAG = { fill: "#g", stroke: "#g", filter: "#f", mask: "#m", "clip-path": "#c", cursor: "#g", "color-profile": "#g" };
const fragOf = (a) => FRAG[a] ?? "#k"; // the marker* attributes reference the <marker>

let browser, A, B;
const hitsB = [];

function page(mode, base) {
  const value = (a) => (mode === "control" ? `url(x.svg${fragOf(a)})` : `url(${fragOf(a)})`);
  const writes = ATTRS.map((a) => {
    const v = JSON.stringify(value(a));
    const n = JSON.stringify(a);
    if (mode === "smil") return `{ const r = document.createElementNS(NS, "rect"); r.setAttribute("width", "40"); r.setAttribute("height", "40"); const s = document.createElementNS(NS, "set"); s.setAttribute("attributeName", ${n}); s.setAttribute("to", ${v}); s.setAttribute("begin", "0s"); r.appendChild(s); svg.appendChild(r); }`;
    return `{ const p = document.createElementNS(NS, "path"); p.setAttribute("d", "M10 10 L90 90 L10 90"); p.setAttribute(${n}, ${v}); svg.appendChild(p); const h = document.createElement("span"); h.textContent = "h"; h.setAttribute(${n}, ${v}); document.body.appendChild(h); }`;
  }).join("\n");
  return `<!doctype html><html><head><base href="${base}"></head><body>
<svg id="s" width="200" height="200" xmlns="http://www.w3.org/2000/svg"><defs>
 <linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>
 <filter id="f"><feGaussianBlur stdDeviation="2"/></filter>
 <mask id="m"><rect width="100" height="100" fill="white"/></mask>
 <clipPath id="c"><rect width="50" height="50"/></clipPath>
 <marker id="k" markerWidth="4" markerHeight="4"><circle r="2"/></marker>
</defs></svg>
<script>const NS = "http://www.w3.org/2000/svg"; const svg = document.getElementById("s");
${writes}
</script></body></html>`;
}

beforeAll(async () => {
  if (!ON) return;
  if (!existsSync(BIN)) throw new Error(`SCRML_BROWSER_TESTS=1 but no Chromium at ${BIN} (set SCRML_CHROMIUM)`);
  B = Bun.serve({ port: 0, fetch(req) { hitsB.push(new URL(req.url).pathname); return new Response("x", { headers: { "content-type": "image/svg+xml" } }); } });
  const base = `http://127.0.0.1:${B.port}/sub/page.html`;
  const runtimeText = readFileSync(RUNTIME, "utf8");
  A = Bun.serve({ port: 0, fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/favicon.ico") return new Response("", { status: 204 });
    if (u.pathname === "/runtime.js") return new Response(runtimeText, { headers: { "content-type": "text/javascript" } });
    if (u.pathname === "/rt.html") return new Response(`<!doctype html><html><head><base href="${base}"></head><body><svg><rect id="r1" width="9" height="9"></rect><rect id="r2" width="9" height="9"></rect></svg></body></html>`, { headers: { "content-type": "text/html" } });
    return new Response(page(u.searchParams.get("mode") || "set", base), { headers: { "content-type": "text/html" } });
  } });
  const { default: puppeteer } = await import("puppeteer");
  browser = await puppeteer.launch({ executablePath: BIN, headless: true, args: ["--no-sandbox"] });
}, { timeout: 180000 });
afterAll(async () => {
  if (browser) await browser.close();
  if (A) A.stop(true);
  if (B) B.stop(true);
});

async function visit(mode) {
  hitsB.length = 0;
  const p = await browser.newPage();
  const reqs = [];
  p.on("request", (r) => reqs.push(r.url()));
  await p.goto(`http://127.0.0.1:${A.port}/index.html?mode=${mode}`, { waitUntil: "networkidle0" });
  await p.mouse.move(20, 20);
  await p.mouse.move(30, 300);
  await new Promise((r) => setTimeout(r, 1500));
  await p.close();
  return { reqs: reqs.filter((u) => !u.includes("/index.html") && !u.endsWith("/favicon.ico")), hits: [...hitsB] };
}

suite("Chromium — a data-written url(#ident) fetches nothing under a static <base href> (S479 item 22)", () => {
  test("CONTROL: url(x.svg#g) is fetched from the <base> origin (the probe can see a fetch)", async () => {
    const { reqs, hits } = await visit("control");
    expect(hits.length).toBeGreaterThan(0);
    expect(reqs.some((u) => u.includes(`:${B.port}/sub/x.svg`))).toBe(true);
  }, 60000);

  test("url(#ident) written by script on every CSS-url attribute (SVG and HTML elements): no request", async () => {
    const { reqs, hits } = await visit("set");
    expect(hits).toEqual([]);
    expect(reqs).toEqual([]);
  }, 60000);

  test("url(#ident) as a SMIL <set to=> of every CSS-url attribute: no request", async () => {
    const { reqs, hits } = await visit("smil");
    expect(hits).toEqual([]);
    expect(reqs).toEqual([]);
  }, 60000);

  test("the bootstrap runtime admits url(#g) and still removes url(x.svg#g), under the same <base>", async () => {
    hitsB.length = 0;
    const p = await browser.newPage();
    await p.goto(`http://127.0.0.1:${A.port}/rt.html`, { waitUntil: "networkidle0" });
    const out = await p.evaluate(async (src) => {
      const rt = await import(src);
      const scope = new rt.Scope(rt.root);
      const r1 = document.getElementById("r1"), r2 = document.getElementById("r2");
      const warn = console.warn; console.warn = () => {};
      try {
        rt.attr(scope, r1, "fill", () => "url(#g)");
        rt.attr(scope, r2, "fill", () => "url(x.svg#g)");
      } finally { console.warn = warn; }
      return { r1: r1.getAttribute("fill"), r2: r2.hasAttribute("fill") };
    }, `http://127.0.0.1:${A.port}/runtime.js`);
    await new Promise((r) => setTimeout(r, 1000));
    await p.close();
    expect(out).toEqual({ r1: "url(#g)", r2: false });
    expect(hitsB).toEqual([]);
  }, 60000);
});
