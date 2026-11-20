/**
 * s480-impl1-renders-href — impl#1 carve-out 2 WIDENED (ruling:user-voice-scrml.md-S480-census-recs
 * item 5: "Widen impl#1 carve-out 2 (gap g-impl1-renders-href-unguarded-s480, HIGH). The widened
 * carve-out covers URL attributes inside `renders` and `fallback=` templates, `<set
 * attributeName="href">`, non-stylesheet `<link href>` and `<base href>`.").
 *
 * SPEC §5.2 rule 3: "Where the scheme of a URL-valued attribute comes from data, the compiler cannot
 * judge it, so the emitted program SHALL judge it on every write." · "Any other value SHALL be written
 * as `about:blank` instead, and the write SHALL report once to scrml's logging surface … The report
 * SHALL NOT contain the blocked value." · §5.2 "Data never moves the document base (S473)": "A
 * `<base>` … whose `href` (any case) is not a static string … SHALL be a compile error
 * (E-ATTR-BASE-HREF)." "Every runtime path that writes a `<base>`'s `href` from data SHALL refuse the
 * write (fail closed)."
 *
 * An enum variant's `renders` template (shown by `<render of=…/>` or an `<errorBoundary>`) and an
 * `<errorBoundary fallback={…}>` template are built as HTML strings (emit-error-boundary.ts
 * `emitBoundaryMarkupExpr`). Before: a payload field in a URL attribute was only HTML-escaped, so
 * `"javascript:alert(1)"` was written live. Now every URL attribute / SVG animation value that writes
 * one is built by `_scrml_url_attr_html` (judged by `_scrml_safe_url`, the one reader); a
 * non-stylesheet `<link href>` by `_scrml_link_href_html` (now judged the same way); a `<base href>`
 * from data is refused at compile time and never written at run time.
 */

import { describe, test, expect, afterAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { compileScrml } from "../../src/api.js";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { run } from "../../../conformance/adapters/impl1-ts.ts";
import { CSS_ATTR_GUARD_RUNTIME_SOURCE, URL_GUARD_RUNTIME_SOURCE } from "../../src/runtime-template.js";
import { compileBoundaryMarkup, emitBoundaryMarkupExpr } from "../../src/codegen/emit-error-boundary.ts";
import { generateHtml } from "../../src/codegen/emit-html.ts";

const _dirs = [];
afterAll(() => { for (const d of _dirs) { try { rmSync(d, { recursive: true, force: true }); } catch {} } });
afterAll(async () => { if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister(); });

function compile(name, src) {
  const dir = mkdtempSync(join(tmpdir(), `s480-rhref-${name}-`));
  _dirs.push(dir);
  const file = join(dir, `${name}.scrml`);
  writeFileSync(file, src);
  const dist = join(dir, "dist");
  mkdirSync(dist, { recursive: true });
  const result = compileScrml({ inputFiles: [file], write: true, outputDir: dist, log: () => {} });
  const errors = (result.errors ?? []).filter((d) => (d.severity ?? "error") === "error");
  const rd = (f) => (existsSync(join(dist, f)) ? readFileSync(join(dist, f), "utf8") : "");
  if (errors.length > 0) return { errors, client: "", runtime: "" };
  return { errors, client: rd(`${name}.client.js`), runtime: rd(result.runtimeFilename ?? "scrml-runtime.js") };
}
const codesOf = (r) => r.errors.map((e) => e.code);

async function quiet(fn) {
  const oe = console.error, ow = console.warn;
  const logs = [];
  console.error = (...a) => logs.push(a.map(String).join(" "));
  console.warn = (...a) => logs.push(a.map(String).join(" "));
  try { return { value: await fn(), logs }; } finally { console.error = oe; console.warn = ow; }
}

const EVIL = "javascript:alert(1)";

// The three HTML-string templates: a `renders` shown by `<render of>`, a `renders` shown by an
// `<errorBoundary>`, and an `<errorBoundary fallback={…}>`. `u` / `n` are the payload fields.
const SHAPES = {
  renderOf: (tpl, u) => `type Skin:enum = {
    Bad(u: string, n: string)
        renders ${tpl}
    Plain
        renders <i>p</i>
}
<program>
<s>: Skin = Skin.Bad("${u}", "href")
<div><render of=@s/></div>
</program>
`,
  boundaryRenders: (tpl, u) => `type PaintError:enum = {
    Bad(u: string, n: string)
        renders ${tpl}
    Declined
}
function charge(amount: int)! PaintError {
    if (amount > 50) fail PaintError.Bad("${u}", "href");
    return amount;
}
<page>
    <errorBoundary fallback={<div class="eb-fb">generic failure</>}>
        \${charge(75)}
    </>
</page>
`,
  fallback: (tpl, u) => `type PaintError:enum = {
    Bad(u: string, n: string)
    Declined
}
function charge(amount: int)! PaintError {
    if (amount > 50) fail PaintError.Bad("${u}", "href");
    return amount;
}
<page>
    <errorBoundary fallback={${tpl}}>
        \${charge(75)}
    </>
</page>
`,
};

async function render(shape, tpl, u) {
  const src = SHAPES[shape](tpl, u);
  const c = compile(`${shape}`.toLowerCase(), src);
  expect(codesOf(c)).toEqual([]);
  const { value: r, logs } = await quiet(() => run(src, [{ wait: "settle" }]));
  return { c, body: r.body, logs };
}

// Every URL attribute the bootstrap's rule 3 table guards, on an element that makes it a URL.
const URL_ATTRS = [
  ["a href", `<a id="t" href="\${u}">x</a>`, "href"],
  ["a HREF (any case)", `<a id="t" HREF="\${u}">x</a>`, "href"],
  ["img src", `<img id="t" src="\${u}">`, "src"],
  ["iframe src", `<iframe id="t" src="\${u}"></iframe>`, "src"],
  ["form action", `<form id="t" action="\${u}"></form>`, "action"],
  ["button formaction", `<form><button id="t" formaction="\${u}">go</button></form>`, "formaction"],
  ["svg a xlink:href", `<svg><a id="t" xlink:href="\${u}"><text>x</text></a></svg>`, "xlink:href"],
  ["video poster", `<video id="t" poster="\${u}"></video>`, "poster"],
  ["object data", `<object id="t" data="\${u}"></object>`, "data"],
  ["img srcset", `<img id="t" srcset="/a.png 1x, \${u} 2x">`, "srcset"],
  ["a ping", `<a id="t" href="/x" ping="\${u}">x</a>`, "ping"],
  ["leading space", `<a id="t" href=" \${u}">x</a>`, "href"],
];

describe("(1) URL attributes from a payload field in renders / fallback= templates (rule 3)", () => {
  for (const shape of Object.keys(SHAPES)) {
    test(`${shape}: a javascript: payload is never emitted live — about:blank, reported once, never the value`, async () => {
      for (const [label, tpl, attr] of URL_ATTRS) {
        if (shape !== "fallback" && label === "img srcset") continue; // `,` ends a variant in a renders clause
        const { c, body, logs } = await render(shape, tpl, EVIL);
        expect(c.client).toContain("_scrml_url_attr_html(");
        expect(c.runtime).toContain("function _scrml_url_attr_html(");
        const el = body.querySelector("#t");
        expect(el, label).not.toBe(null);
        expect(el.getAttribute(attr), label).toBe("about:blank");
        expect(logs.filter((l) => l.includes("url-guard")).length, label).toBe(1);
        expect(logs.some((l) => l.includes("alert(1)")), label).toBe(false);
      }
    }, 120000);
  }

  test("admitted payloads are written unchanged (https, relative, mailto, raster data:image on src)", async () => {
    for (const [tpl, u, attr] of [
      [`<a id="t" href="\${u}">x</a>`, "https://ok.example/p?a=1&b=2", "href"],
      [`<a id="t" href="\${u}">x</a>`, "/rel/path", "href"],
      [`<a id="t" href="\${u}">x</a>`, "mailto:a@b.example", "href"],
      [`<img id="t" src="\${u}">`, "data:image/png;base64,AAAA", "src"],
      [`<a id="t" href="/u/\${u}">x</a>`, "javascript:alert(1)", "href"],
    ]) {
      const { body, logs } = await render("fallback", tpl, u);
      const want = attr === "href" && tpl.includes("/u/") ? "/u/" + u : u;
      expect(body.querySelector("#t").getAttribute(attr)).toBe(want);
      expect(logs.filter((l) => l.includes("url-guard"))).toEqual([]);
    }
  }, 60000);

  test("a quote in the payload stays inside the attribute (escaped), and a sibling attribute is written", async () => {
    const { body } = await render("fallback", `<a id="t" href="\${u}" title="\${n}">x</a>`, `/x\\" onmouseover=\\"alert(1)`);
    const el = body.querySelector("#t");
    expect(el.getAttribute("onmouseover")).toBe(null);
    expect(el.getAttribute("href")).toBe('/x" onmouseover="alert(1)');
    expect(el.getAttribute("title")).toBe("href");
  }, 60000);

  test("not a URL on that element (`data` on a <div>) and templates with no URL field: no guard call", () => {
    const div = emitBoundaryMarkupExpr(compileBoundaryMarkup(`<div data="\${u}">x</div>`, generateHtml), "_d");
    expect(div).not.toContain("_scrml_url_attr_html(");
    const plain = emitBoundaryMarkupExpr(compileBoundaryMarkup(`<a href="/static"><b>\${u}</b></a>`, generateHtml), "_d");
    expect(plain).not.toContain("_scrml_url_attr_html(");
    expect(plain).toContain("_scrml_error_boundary_text(");
  });
});

describe("(2) <set attributeName=\"href\"> and SVG animation values in the templates", () => {
  const ANIM = [
    ["set to", `<svg><a id="p"><set id="t" attributeName="href" to="\${u}"/><text>x</text></a></svg>`, "to"],
    ["animate values", `<svg><a id="p"><animate id="t" attributeName="href" values="/ok;\${u}"/><text>x</text></a></svg>`, "values"],
    ["set from (xlink:href)", `<svg><a id="p"><set id="t" attributeName="xlink:href" from="\${u}" to="/ok"/><text>x</text></a></svg>`, "from"],
    ["computed attributeName", `<svg><a id="p"><set id="t" attributeName="\${n}" to="\${u}"/><text>x</text></a></svg>`, "to"],
  ];
  for (const shape of ["boundaryRenders", "fallback"]) {
    test(`${shape}: the animated URL value is about:blank`, async () => {
      for (const [label, tpl, attr] of ANIM) {
        const { body, logs } = await render(shape, tpl, EVIL);
        expect(body.querySelector("#t").getAttribute(attr), label).toBe("about:blank");
        expect(logs.some((l) => l.includes("alert(1)")), label).toBe(false);
      }
    }, 120000);
  }

  test("a STATIC value whose attributeName is a payload field is judged (the data picks the target)", async () => {
    const { c, body } = await render("boundaryRenders",
      `<svg><a id="p"><set id="t" attributeName="\${n}" to="javascript:alert(2)"/><text>x</text></a></svg>`, EVIL);
    expect(c.client).toContain("_scrml_css_attr_html(");
    expect(body.querySelector("#t").getAttribute("to")).toBe("about:blank");
  }, 60000);

  test("an animation of a non-URL attribute (title) is not a URL write", () => {
    const expr = emitBoundaryMarkupExpr(compileBoundaryMarkup(
      `<svg><a><set attributeName="title" to="\${u}"/></a></svg>`, generateHtml), "_d");
    expect(expr).not.toContain("_scrml_url_attr_html(");
  });

  test("DOM writers (regression pin, S457): <set attributeName=\"href\" to=${@u}> and a computed attributeName", async () => {
    for (const el of [
      `<svg><a id="p"><set id="t" attributeName="href" to=\${@bad} /><text>x</text></a></svg>`,
      `<svg><a id="p"><set id="t" attributeName=\${@nm} to=\${@bad} /><text>x</text></a></svg>`,
    ]) {
      const src = `<program>\n<bad> = "${EVIL}"\n<nm> = "href"\n${el}\n</program>\n`;
      expect(codesOf(compile("dom-set", src))).toEqual([]);
      const { value: r } = await quiet(() => run(src, [{ wait: "settle" }]));
      expect(r.body.querySelector("#t").getAttribute("to")).toBe("about:blank");
    }
  }, 60000);
});

describe("(3) a non-stylesheet <link href> from a payload field", () => {
  test("renders / fallback: icon and no-rel <link> hrefs are judged by rule 3", async () => {
    for (const shape of ["boundaryRenders", "fallback"]) {
      for (const tpl of [`<link id="t" rel="icon" href="\${u}">`, `<link id="t" href="\${u}">`]) {
        const { c, body } = await render(shape, tpl, EVIL);
        expect(c.client).toContain("_scrml_link_href_html(");
        expect(body.querySelector("#t").getAttribute("href")).toBe("about:blank");
      }
      const ok = await render(shape, `<link id="t" rel="icon" href="\${u}">`, "/favicon.png");
      expect(ok.body.querySelector("#t").getAttribute("href")).toBe("/favicon.png");
    }
  }, 120000);

  test("_scrml_link_href_html with the real rule 3 reader", () => {
    const logs = [];
    const rt = new Function("_scrml_error_boundary_log",
      `${URL_GUARD_RUNTIME_SOURCE.replace(/^export /gm, "")}\n${CSS_ATTR_GUARD_RUNTIME_SOURCE.replace(/^export /gm, "")}\n` +
      `return { _scrml_link_href_html, _scrml_url_attr_html };`,
    )((k, e) => logs.push(k + ":" + e.message));
    expect(rt._scrml_link_href_html("href", ["icon"], [EVIL])).toBe(' href="about:blank"');
    expect(rt._scrml_link_href_html("href", null, ["/a", null, ".ico"])).toBe(' href="/a.ico"');
    expect(rt._scrml_link_href_html("href", ["stylesheet"], ["/a.css"])).toBe("");
    expect(rt._scrml_url_attr_html("set", "to", ["java", "script:x"], "href")).toBe(' to="about:blank"');
    expect(rt._scrml_url_attr_html("img", "src", ['/x"y'])).toBe(' src="/x&quot;y"');
    expect(logs.length).toBe(3);
    expect(logs.some((l) => l.includes("javascript"))).toBe(false);
  });
});

describe("(4) <base href> from data: E-ATTR-BASE-HREF, and never written", () => {
  test("renders / boundary renders / fallback: quoted and unquoted payload href refused at compile time", () => {
    for (const shape of Object.keys(SHAPES)) {
      for (const tpl of [`<base href="\${u}">`, `<base href=\${u}>`, `<div><base HREF="/app/\${n}/"></div>`]) {
        const r = compile(`base-${shape}`.toLowerCase(), SHAPES[shape](tpl, "https://evil.example/"));
        expect(codesOf(r), `${shape} ${tpl}`).toEqual(["E-ATTR-BASE-HREF"]);
        expect(r.errors[0].message).not.toContain("evil.example");
      }
    }
  });

  test("DOM markup: a cell, a quoted interpolation, a call, an <each> row, a component prop — one report each", () => {
    const cases = {
      cell: `<base href=(@u)>`,
      quoted: `<base href="\${@u}">`,
      call: `<base href=root()>`,
      each: `<each in=@rows as r>\n  <base href=\${r.h}>\n</each>`,
      component: `const B = <base props={ h: string } href=\${h}>\n<B h=@u/>\n<B h=@u/>`,
    };
    for (const [k, el] of Object.entries(cases)) {
      const src = `<program>\n<u> = "https://evil.example/"\n<rows> = [{ h: "https://evil.example/" }]\nfunction root() { return "https://evil.example/"; }\n${el}\n</program>\n`;
      expect(codesOf(compile(`dom-base-${k}`, src)), k).toEqual(["E-ATTR-BASE-HREF"]);
    }
  });

  test("not refused: a static <base href>, and a data href on any other element", () => {
    const src = `<program>\n<u> = "/x"\n<base href="/app/">\n<a href=(@u)>a</a>\n</program>\n`;
    expect(codesOf(compile("base-static", src))).toEqual([]);
    expect(codesOf(compile("base-static-fb", SHAPES.fallback(`<base href="/app/">`, "x")))).toEqual([]);
  });

  test("runtime wall: _scrml_link_href_set removes a <base>'s href; _scrml_link_href_html(…, \"base\") writes nothing", () => {
    const logs = [];
    const rt = new Function("_scrml_error_boundary_log",
      `${CSS_ATTR_GUARD_RUNTIME_SOURCE}\nfunction _scrml_safe_url(el, n, v) { return String(v); }\n` +
      `return { _scrml_link_href_set, _scrml_link_href_html };`,
    )((k, e) => logs.push(k + ":" + e.message));
    const attrs = new Map([["href", "/old/"]]);
    const el = { tagName: "BASE", getAttribute: (n) => attrs.get(n) ?? null, setAttribute: (n, v) => attrs.set(n, String(v)), removeAttribute: (n) => attrs.delete(n) };
    rt._scrml_link_href_set(el, "href", "https://evil.example/");
    expect(attrs.has("href")).toBe(false);
    expect(rt._scrml_link_href_html("href", null, ["https://evil.example/"], "base")).toBe("");
    expect(logs.length).toBe(2);
    expect(logs.every((l) => l.includes("<base>") && !l.includes("evil.example"))).toBe(true);
  });

  test("codegen defence in depth: a <base> payload href in a template is built by _scrml_link_href_html(…, \"base\")", () => {
    const expr = emitBoundaryMarkupExpr(compileBoundaryMarkup(`<base href="\${u}">`, generateHtml), "_d");
    expect(expr).toMatch(/_scrml_link_href_html\("href", null, \[[^\]]*\], "base"\)/);
  });
});
