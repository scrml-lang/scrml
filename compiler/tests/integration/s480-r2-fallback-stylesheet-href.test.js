/**
 * s480-impl1-css-url r2 (S239 re-review of #2015, N1) — SPEC §5.2 "Data-supplied stylesheets (S472)"
 * in impl#1 under the S479 carve-out 2 (ruling:user-voice-scrml.md-S479-3B-rest-item-21):
 *
 *   "… SHALL be a compile error (E-ATTR-STYLESHEET-HREF)." / "Every runtime path that writes a
 *   `<link>`'s `href` from data SHALL refuse the write when the element's `rel` contains `stylesheet` …"
 *
 * r1 closed the enum-variant `renders` templates; an `<errorBoundary fallback={…}>` template (the other
 * HTML string `emitBoundaryMarkupExpr` builds) still compiled `<link rel="stylesheet" href="${sheet}">`
 * clean and wrote the payload into `href` with `_scrml_error_boundary_text` (escaped, unguarded):
 *   (1) compile: VP-3 now reads the fallback template — E-ATTR-STYLESHEET-HREF at the boundary;
 *   (2) runtime, defence in depth: a payload `href` on a `<link>` in either template is built by
 *       `_scrml_link_href_html` (the string twin of `_scrml_link_href_set`) — not written, reported,
 *       when `rel` loads a stylesheet.
 */

import { describe, test, expect, afterAll } from "bun:test";
import { Window } from "happy-dom";
import { compileScrml } from "../../src/api.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { CSS_ATTR_GUARD_RUNTIME_SOURCE } from "../../src/runtime-template.js";
import { compileBoundaryMarkup, emitBoundaryMarkupExpr } from "../../src/codegen/emit-error-boundary.ts";
import { generateHtml } from "../../src/codegen/emit-html.ts";

const _dirs = [];
afterAll(() => { for (const d of _dirs) { try { rmSync(d, { recursive: true, force: true }); } catch {} } });

function compileErrors(name, src) {
  const dir = mkdtempSync(join(tmpdir(), `s480-r2-${name}-`));
  _dirs.push(dir);
  const file = join(dir, `${name}.scrml`);
  writeFileSync(file, src);
  const dist = join(dir, "dist");
  mkdirSync(dist, { recursive: true });
  const result = compileScrml({ inputFiles: [file], write: true, outputDir: dist, log: () => {} });
  return (result.errors ?? []).filter((d) => (d.severity ?? "error") === "error");
}

const BOUNDARY_FALLBACK = (fallback) => `type PaintError:enum = {
    Bad(sheet: string)
    Declined
}
function charge(amount: int)! PaintError {
    if (amount > 50) fail PaintError.Bad("https://evil.example/a.css");
    return amount;
}
<page>
    <errorBoundary fallback={${fallback}}>
        \${charge(75)}
    </>
</page>
`;

describe("N1 (1) E-ATTR-STYLESHEET-HREF in an <errorBoundary fallback=> template", () => {
  test("quoted `href=\"${field}\"` with rel=stylesheet is refused, reported once at the boundary", () => {
    const errs = compileErrors("q", BOUNDARY_FALLBACK(`<link rel="stylesheet" href="\${sheet}">`));
    expect(errs.map((e) => e.code)).toEqual(["E-ATTR-STYLESHEET-HREF"]);
    expect(errs[0].message).toContain("fallback=");
    expect(errs[0].message).not.toContain("evil.example");
  });

  test("unquoted `href=${field}` and a mixed-case REL are refused", () => {
    expect(compileErrors("u", BOUNDARY_FALLBACK(`<link rel=stylesheet href=\${sheet}>`)).map((e) => e.code))
      .toEqual(["E-ATTR-STYLESHEET-HREF"]);
    expect(compileErrors("m", BOUNDARY_FALLBACK(`<div><link REL="Alternate StyleSheet" href="/t/\${sheet}.css"></div>`)).map((e) => e.code))
      .toEqual(["E-ATTR-STYLESHEET-HREF"]);
  });

  test("a static stylesheet href, or a payload href on a non-stylesheet <link>, is not refused", () => {
    expect(compileErrors("s", BOUNDARY_FALLBACK(`<link rel="stylesheet" href="/theme.css">`))).toEqual([]);
    expect(compileErrors("i", BOUNDARY_FALLBACK(`<link rel="icon" href="\${sheet}">`))).toEqual([]);
  });
});

// The runtime guard, isolated: the cssattrguard chunk + a recording `_scrml_error_boundary_log`.
function guardRuntime() {
  const logs = [];
  const rt = new Function("_scrml_error_boundary_log",
    `${CSS_ATTR_GUARD_RUNTIME_SOURCE}\nfunction _scrml_safe_url(el, n, v) { return String(v); }\n` +
    `function _scrml_error_boundary_text(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";"); }\n` +
    `return { _scrml_link_href_html, _scrml_css_attr_html, _scrml_error_boundary_text };`,
  )((k, e) => logs.push(k + ":" + e.message));
  return { rt, logs };
}

describe("N1 (2) _scrml_link_href_html — a <link> href from data in an HTML-string template", () => {
  test("rel containing stylesheet (any case, any position): not written, reported (never the value)", () => {
    const { rt, logs } = guardRuntime();
    const evil = "https://evil.example/a.css";
    expect(rt._scrml_link_href_html("href", ["stylesheet"], [evil])).toBe("");
    expect(rt._scrml_link_href_html("href", ["alternate StyleSheet"], ["/t/", evil])).toBe("");
    expect(rt._scrml_link_href_html("xlink:href", ["", "stylesheet"], [evil])).toBe("");
    expect(logs.length).toBe(3);
    expect(logs.every((l) => l.startsWith("css-guard:") && l.includes("not written") && !l.includes("evil"))).toBe(true);
  });

  test("no rel / a non-stylesheet rel: written attribute-escaped (null parts read as \"\")", () => {
    const { rt, logs } = guardRuntime();
    expect(rt._scrml_link_href_html("href", null, ["/a", null, ".ico"])).toBe(' href="/a.ico"');
    expect(rt._scrml_link_href_html("href", ["icon"], ['x" onload="y'])).toBe(' href="x&quot; onload=&quot;y"');
    expect(logs).toEqual([]);
  });

  test("emitBoundaryMarkupExpr routes a payload <link> href through it; happy-dom: no stylesheet href in the DOM", () => {
    const run = (raw, data) => {
      const expr = emitBoundaryMarkupExpr(compileBoundaryMarkup(raw, generateHtml), "_d");
      const { rt, logs } = guardRuntime();
      const html = new Function("_d", "_scrml_link_href_html", "_scrml_css_attr_html", "_scrml_error_boundary_text",
        `return (${expr});`)(data, rt._scrml_link_href_html, rt._scrml_css_attr_html, rt._scrml_error_boundary_text);
      const win = new Window({ url: "http://localhost/" });
      win.document.body.innerHTML = html;
      return { expr, doc: win.document, logs };
    };
    const sheet = run(`<div><link id="l" rel="stylesheet" href="\${sheet}"><p>\${sheet}</p></div>`, { sheet: "https://evil.example/a.css" });
    expect(sheet.expr).toContain("_scrml_link_href_html(");
    expect(sheet.expr).not.toMatch(/href=\\"" \+ _scrml_error_boundary_text/);
    const l = sheet.doc.querySelector("#l");
    expect(l).not.toBe(null);
    expect(l.getAttribute("rel")).toBe("stylesheet");
    expect(l.getAttribute("href")).toBe(null);
    expect(sheet.logs.length).toBe(1);
    const icon = run(`<link id="l" rel="icon" href="/i/\${sheet}.ico">`, { sheet: "a" });
    expect(icon.doc.querySelector("#l").getAttribute("href")).toBe("/i/a.ico");
    expect(icon.logs).toEqual([]);
  });

  test("a template with no payload field in a <link> href is unchanged (no guard call)", () => {
    const expr = emitBoundaryMarkupExpr(compileBoundaryMarkup(`<div><link rel="stylesheet" href="/t.css"><p>\${sheet}</p></div>`, generateHtml), "_d");
    expect(expr).not.toContain("_scrml_link_href_html(");
  });
});
