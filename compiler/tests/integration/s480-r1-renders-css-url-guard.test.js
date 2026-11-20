/**
 * s480-impl1-css-url r1 (S239 review of #2015) — SPEC §5.2 in impl#1 under the S479 carve-out 2
 * (ruling:user-voice-scrml.md-S479-3B-rest-item-21), the writers the first round missed:
 *
 *   F1 "Data-supplied stylesheets (S472)": "… SHALL be a compile error (E-ATTR-STYLESHEET-HREF)." — a
 *      `<link rel="stylesheet" href="${field}">` (or `href=${field}`) in an enum variant's `renders`
 *      clause, shown by `<render of=…/>` or an `<errorBoundary>`, compiled clean: the template's
 *      `${field}` is captured as a sentinel before it is parsed, which read as a static value.
 *      Reported once, at the enum declaration.
 *   F2 "Data-supplied CSS-url attributes — runtime guard (S473)": the same templates are built as an
 *      HTML string (emit-error-boundary.ts `emitBoundaryMarkupExpr`, written with innerHTML) and wrote
 *      a payload `fill=` / `filter=` raw. Now `_scrml_css_attr_html` builds the attribute: refused →
 *      not written (reported, never the value) — the bootstrap's runtime guard, not a compile refusal.
 *   F3 the runtime `meta.emit(html)` gate judged only `id` / `name` values: a CSS-url attribute is now
 *      judged by the same reader (refused → nothing written).
 */

import { describe, test, expect, afterAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { Window } from "happy-dom";
import { compileScrml } from "../../src/api.js";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { run } from "../../../conformance/adapters/impl1-ts.ts";
import { CSS_ATTR_GUARD_RUNTIME_SOURCE, SCRML_RUNTIME } from "../../src/runtime-template.js";

const _dirs = [];
afterAll(() => { for (const d of _dirs) { try { rmSync(d, { recursive: true, force: true }); } catch {} } });
afterAll(async () => {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
});

function compile(name, src) {
  const dir = mkdtempSync(join(tmpdir(), `s480-r1-${name}-`));
  _dirs.push(dir);
  const file = join(dir, `${name}.scrml`);
  writeFileSync(file, src);
  const dist = join(dir, "dist");
  mkdirSync(dist, { recursive: true });
  const result = compileScrml({ inputFiles: [file], write: true, outputDir: dist, log: () => {} });
  const rd = (f) => (existsSync(join(dist, f)) ? readFileSync(join(dist, f), "utf8") : "");
  const errors = (result.errors ?? []).filter((d) => (d.severity ?? "error") === "error");
  return { errors, client: rd(`${name}.client.js`), runtime: rd(result.runtimeFilename ?? "scrml-runtime.js") };
}
const codesOf = (r) => r.errors.map((e) => e.code);

async function quiet(fn) {
  const origE = console.error, origW = console.warn;
  const logs = [];
  console.error = (...a) => logs.push(a.map(String).join(" "));
  console.warn = (...a) => logs.push(a.map(String).join(" "));
  try { return { value: await fn(), logs }; } finally { console.error = origE; console.warn = origW; }
}

// ---------------------------------------------------------------------------
// F1 — E-ATTR-STYLESHEET-HREF in a `renders` clause
// ---------------------------------------------------------------------------

const RENDER_OF = (variants, init) => `type Skin:enum = {
${variants}
}
<program>
<s>: Skin = ${init}
<div><render of=@s/></div>
<p><render of=@s/></p>
</program>
`;

const BOUNDARY = (renders, failArgs) => `type PaintError:enum = {
    Bad(sheet: string)
        renders ${renders}
    Declined
}
function charge(amount: int)! PaintError {
    if (amount > 50) fail PaintError.Bad(${failArgs});
    return amount;
}
<page>
    <errorBoundary fallback={<div class="eb-fb">generic failure</>}>
        \${charge(75)}
    </>
</page>
`;

describe("F1 a renders-clause stylesheet <link> href from a payload field is E-ATTR-STYLESHEET-HREF", () => {
  test("quoted `href=\"${f}\"` and unquoted `href=${f}`, shown twice — one report per attribute, at the declaration", () => {
    const r = compile("f1-render", RENDER_OF(`    Custom(css: string)
        renders <link rel="stylesheet" href="\${css}">
    Plain(css: string)
        renders <link rel="stylesheet" href=\${css}>`, `Skin.Custom("https://evil.example/a.css")`));
    expect(codesOf(r)).toEqual(["E-ATTR-STYLESHEET-HREF", "E-ATTR-STYLESHEET-HREF"]);
    expect(r.errors.every((e) => e.span && e.span.line === 1)).toBe(true);
    expect(r.errors.map((e) => e.message.includes("`Skin.Custom`") || e.message.includes("`Skin.Plain`"))).toEqual([true, true]);
  });

  test("inside an <errorBoundary> variant's renders", () => {
    const r = compile("f1-eb", BOUNDARY(`<div><link rel="stylesheet" href="\${sheet}"></div>`, `"https://evil.example/a.css"`));
    expect(codesOf(r)).toEqual(["E-ATTR-STYLESHEET-HREF"]);
  });

  test("a computed rel (`rel=\"${f}\"`) beside a field href is refused (fail closed)", () => {
    const r = compile("f1-rel", RENDER_OF(`    Custom(css: string, r: string)
        renders <link rel="\${r}" href="\${css}">`, `Skin.Custom("/a.css", "icon")`));
    expect(codesOf(r)).toEqual(["E-ATTR-STYLESHEET-HREF"]);
  });

  test("not refused: a static stylesheet href, a non-sheet rel with a field href", () => {
    const a = compile("f1-static", RENDER_OF(`    Custom(css: string)
        renders <link rel="stylesheet" href="/theme.css">`, `Skin.Custom("x")`));
    expect(codesOf(a)).toEqual([]);
    const b = compile("f1-icon", RENDER_OF(`    Custom(css: string)
        renders <link rel="icon" href="\${css}">`, `Skin.Custom("/a.png")`));
    expect(codesOf(b)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// F2 — CSS-url attributes in a renders / boundary HTML-string template
// ---------------------------------------------------------------------------

describe("F2 a renders-template CSS-url attribute from a payload field is judged at run time", () => {
  test("<render of>: refused `fill` is not written (reported, never the value); admitted ones are", async () => {
    const src = RENDER_OF(`    Circle(paint: string, n: string)
        renders <svg><circle id="cc" fill="\${paint}" stroke="#\${n}" r="5"></circle></svg>`,
    `Skin.Circle("url(https://evil.example/e)", "f00")`);
    const c = compile("f2-render", src);
    expect(codesOf(c)).toEqual([]);
    expect(c.client).toContain("_scrml_css_attr_html(");
    expect(c.client).not.toMatch(/fill=\\"" \+ _scrml_error_boundary_text/);
    expect(c.runtime).toContain("function _scrml_css_attr_html(");
    const { value: r, logs } = await quiet(() => run(src, [{ wait: "settle" }]));
    const el = r.body.querySelector("#cc");
    expect(el).not.toBe(null);
    expect(el.getAttribute("fill")).toBe(null);
    expect(el.getAttribute("stroke")).toBe("#f00");
    expect(el.getAttribute("r")).toBe("5");
    expect(logs.some((l) => l.includes("css-guard") && l.includes("fill="))).toBe(true);
    expect(logs.some((l) => l.includes("evil.example"))).toBe(false);
  });

  test("<errorBoundary> variant renders: refused `fill` / `filter` not written; the rest of the markup is", async () => {
    const src = BOUNDARY(`<div class="eb"><svg><rect id="rr" fill="\${sheet}" filter="\${sheet}" stroke="red"></rect></svg></div>`,
      `"url(https://evil.example/p)"`);
    const c = compile("f2-eb", src);
    expect(codesOf(c)).toEqual([]);
    const { value: r, logs } = await quiet(() => run(src, [{ wait: "settle" }]));
    const el = r.body.querySelector("#rr");
    expect(el).not.toBe(null);
    expect(el.getAttribute("fill")).toBe(null);
    expect(el.getAttribute("filter")).toBe(null);
    expect(el.getAttribute("stroke")).toBe("red");
    expect(logs.some((l) => l.includes("css-guard"))).toBe(true);
    expect(logs.some((l) => l.includes("evil.example"))).toBe(false);
  });

  test("_scrml_css_attr_html: admitted values are attribute-escaped; null parts read as \"\"", () => {
    const logs = [];
    const fn = new Function("_scrml_error_boundary_log", `${CSS_ATTR_GUARD_RUNTIME_SOURCE}\nfunction _scrml_safe_url(el, n, v) { return String(v); }\nreturn _scrml_css_attr_html;`)((k, e) => logs.push(k + ":" + e.message));
    expect(fn("rect", "fill", ["red"])).toBe(' fill="red"');
    expect(fn("rect", "fill", ["#", "f00", null])).toBe(' fill="#f00"');
    expect(fn("rect", "fill", ["url(#g)"])).toBe(' fill="url(#g)"');
    expect(fn("rect", "fill", ['red" onload="x'])).toBe("");
    expect(fn("rect", "filter", ["url(https://evil.example/x)"])).toBe("");
    expect(logs.length).toBe(2);
    expect(logs.every((l) => l.startsWith("css-guard:") && l.includes("not written") && !l.includes("evil"))).toBe(true);
  });

  test("a renders template with no field in a CSS-url attribute is unchanged (no guard call)", () => {
    const c = compile("f2-none", RENDER_OF(`    Circle(n: string)
        renders <svg><circle fill="red" r="5"><title>\${n}</title></circle></svg>`, `Skin.Circle("x")`));
    expect(codesOf(c)).toEqual([]);
    expect(c.client).not.toContain("_scrml_css_attr_html(");
  });
});

// ---------------------------------------------------------------------------
// F3 — the runtime meta.emit(html) gate
// ---------------------------------------------------------------------------

describe("F3 runtime meta.emit() judges CSS-url attribute values", () => {
  test("a url() fill / filter / cursor is refused (nothing written); a plain value and url(#id) are admitted", () => {
    const win = new Window({ url: "http://localhost/" });
    const document = win.document;
    document.body.innerHTML = '<span data-scrml-meta="m1">old</span>';
    const logs = [];
    const cons = { error: (...a) => logs.push(a.join(" ")), log() {}, warn() {}, info() {} };
    const rt = new Function("document", "window", "console", SCRML_RUNTIME + "\nreturn { _scrml_meta_emit };")(document, win, cons);
    const slot = () => document.querySelector('[data-scrml-meta="m1"]').innerHTML;
    const evil = "url(https://evil.example/x)";
    for (const html of [`<svg><rect fill="${evil}"></rect></svg>`, `<svg><rect filter="${evil}"></rect></svg>`, `<svg><rect CURSOR="${evil}"></rect></svg>`]) {
      rt._scrml_meta_emit("m1", html);
      expect(slot()).toBe("old");
    }
    expect(logs.length).toBe(3);
    expect(logs.every((l) => l.includes("not a plain CSS value") && !l.includes("evil.example"))).toBe(true);
    rt._scrml_meta_emit("m1", `<svg><rect fill="red" filter="url(#f)"></rect></svg>`);
    expect(slot()).toContain('fill="red"');
    expect(slot()).toContain('filter="url(#f)"');
  });
});
