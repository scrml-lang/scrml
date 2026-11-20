/**
 * s480-impl1-css-url — SPEC §5.2 in impl#1 under the S479 carve-out 2
 * (ruling:user-voice-scrml.md-S479-3B-rest-item-21; gap
 * g-impl1-svg-css-url-attr-and-link-stylesheet-href-unguarded-s473):
 *
 *   "Data-supplied CSS-url attributes — runtime guard (S473)": "Every write from data of an attribute
 *   whose name, lowercased, is a CSS-url attribute, on ANY element … The attribute SHALL be removed,
 *   not written".
 *   "Data-supplied stylesheets (S472)": "… SHALL be a compile error (E-ATTR-STYLESHEET-HREF)." and
 *   "Every runtime path that writes a `<link>`'s `href` from data SHALL refuse the write when the
 *   element's `rel` contains `stylesheet` …".
 *
 *   §1 every data write of a CSS-url attribute, at every markup position and in every form, is the
 *      guarded setter `_scrml_css_attr_set` (and the 'cssattrguard' chunk ships with it);
 *   §2 EXECUTED (happy-dom, the conformance adapter): refused values are removed, admitted ones
 *      written — top level, quoted template, `<each>` rows, `<match>` arms, `if=` mounts, `lift`,
 *      SMIL animation values (static / computed `attributeName`, `values` lists);
 *   §3 the reader is the bootstrap's (`cssValueOf` + `url(#ident)`): same verdict on a battery;
 *   §4 E-ATTR-STYLESHEET-HREF — impl#1-only forms (quoted `${…}`, rows, components, lift) refused;
 *      not refused: static href, non-sheet rel;
 *   §5 the runtime `<link>` `href` wall (`_scrml_link_href_set`);
 *   §6 programs without these writes are unchanged (no setter, no chunk);
 *   §7 the server's first-paint rows never write a CSS-url attribute from data (the each falls back).
 */

import { describe, test, expect, afterAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { compileScrml } from "../../src/api.js";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { splitBlocks } from "../../src/block-splitter.js";
import { buildAST } from "../../src/ast-builder.js";
import { runCG } from "../../src/code-generator.js";
import { run } from "../../../conformance/adapters/impl1-ts.ts";
import { _scrml_css_attr_value_admitted, _SCRML_CSS_URL_ATTRS } from "../../src/runtime-css-attr-guard.js";
import { CSS_ATTR_GUARD_RUNTIME_SOURCE } from "../../src/runtime-template.js";
import { cssValueOf } from "../../self-host-v2/slice-m1/runtime/runtime.js";

const _dirs = [];
afterAll(() => { for (const d of _dirs) { try { rmSync(d, { recursive: true, force: true }); } catch {} } });
// DOM-global hygiene (as corpus-bridge.test.js): the adapter's run() registers happy-dom, which
// replaces Bun's native Response / Request / fetch / … on globalThis. Unregister at file end so every
// later file in the same `bun test` process sees Bun's natives.
afterAll(async () => {
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
});

function compile(name, src) {
  const dir = mkdtempSync(join(tmpdir(), `s480-cssurl-${name}-`));
  _dirs.push(dir);
  const file = join(dir, `${name}.scrml`);
  writeFileSync(file, src);
  const dist = join(dir, "dist");
  mkdirSync(dist, { recursive: true });
  const result = compileScrml({ inputFiles: [file], write: true, outputDir: dist, log: () => {} });
  const rd = (f) => (existsSync(join(dist, f)) ? readFileSync(join(dist, f), "utf8") : "");
  const errors = (result.errors ?? []).filter((d) => (d.severity ?? "error") === "error");
  if ((result.errors ?? []).length > 0) {
    const output = result.outputs.get(file) ?? {};
    return { result, errors, client: output.clientJs ?? "", html: output.html ?? "", runtime: "" };
  }
  return { result, errors, client: rd(`${name}.client.js`), html: rd(`${name}.html`), runtime: rd(result.runtimeFilename ?? "scrml-runtime.js") };
}

const codesOf = (r) => r.errors.map((e) => e.code);

// Every markup position that writes an attribute from data (the s457 enumeration).
const POS = {
  top: (el) => `<program>\n<u> = "red"\n${el("@u")}\n</program>\n`,
  // A component body here holds HTML elements (impl#1 does not read an SVG element in a `const`
  // component body today); the CSS-url attributes are matched by name on any element.
  componentReactive: (el) => `<program>\n<u> = "red"\nconst Box = <span>${el("@u").replace(/<(\/?)(?:rect|circle|g)\b/g, "<$1i").replace(/><\/i>/g, ">i</i>")}</span>\n<Box/>\n</program>\n`,
  slot: (el) => `<program>\n<u> = "red"\nconst Wrap = <svg class="w">\${children}</svg>\n<Wrap>${el("@u")}</Wrap>\n</program>\n`,
  each: (el) => `<program>\n<items> = [{ paint: "red" }]\n<svg>\n  <each in=@items as it>\n    ${el("it.paint")}\n  </each>\n</svg>\n</program>\n`,
  ifMount: (el) => `<program>\n<u> = "red"\n<on> = true\n<svg if=@on>${el("@u")}</svg>\n</program>\n`,
  match: (el) => `\${\n  type Phase:enum = { Idle, Ready }\n  <phase>: Phase = .Idle\n  <u> = "red"\n}\n<match for=Phase on=@phase>\n  <Idle>\n    <svg>${el("@u")}</svg>\n  </>\n  <Ready><p>r</p></>\n</match>\n`,
  forLift: (el) => `<program>\n<items> = [{ paint: "red" }]\n<svg>\n\${ for (const it of @items) { lift ${el("it.paint")} } }\n</svg>\n</program>\n`,
};

const FORMS = {
  quoted: [(x) => `<rect fill="\${${x}}"></rect>`, "fill"],
  expression: [(x) => `<rect filter=\${${x}}></rect>`, "filter"],
  htmlElement: [(x) => `<g><circle stroke=\${${x}}></circle></g>`, "stroke"],
  clipPath: [(x) => `<rect clip-path="\${${x}}"></rect>`, "clip-path"],
};

describe("§1 every data write of a CSS-url attribute is the guarded setter", () => {
  for (const [pname, mk] of Object.entries(POS)) {
    for (const [fname, [el, attr]] of Object.entries(FORMS)) {
      test(`${fname} @ ${pname}`, () => {
        const { errors, client, runtime } = compile(`${fname}-${pname}`.toLowerCase(), mk(el));
        expect(errors.map((e) => e.code)).toEqual([]);
        // no raw write of the attribute is left …
        expect(client).not.toContain(`setAttribute(${JSON.stringify(attr)},`);
        // … and the data write is the setter, with the chunk that defines it
        expect(client).toContain(`_scrml_css_attr_set(`);
        expect(client).toContain(`${JSON.stringify(attr)}`);
        expect(runtime).toContain("function _scrml_css_attr_set(");
        expect(runtime).toContain("function _scrml_safe_url("); // cssattrguard → urlguard
      });
    }
  }
});

// ---------------------------------------------------------------------------
// §2 EXECUTED
// ---------------------------------------------------------------------------

const attrOf = (body, sel, name) => {
  const el = body.querySelector(sel);
  if (!el) throw new Error("no element " + sel);
  return el.getAttribute(name);
};

async function quiet(fn) {
  const origE = console.error, origW = console.warn;
  const logs = [];
  console.error = (...a) => logs.push(a.map(String).join(" "));
  console.warn = (...a) => logs.push(a.map(String).join(" "));
  try { return { value: await fn(), logs }; } finally { console.error = origE; console.warn = origW; }
}

describe("§2 executed: refused values are removed, admitted values written", () => {
  test("top level, quoted template and expression forms, reactive re-write", async () => {
    const src = `<program>
<bad> = "url(https://evil.example/x.svg#p)"
<p> = "red"
function flip() { @p = "url(https://evil.example/y)"; }
function back() { @p = "blue"; }
<svg>
  <rect id="q" fill="\${@bad}"></rect>
  <rect id="e" filter=\${@bad}></rect>
  <rect id="ok" fill="\${@p}" filter="\${@p}"></rect>
  <rect id="paint" stroke="\${@p}"></rect>
</svg>
<button id="flip" onclick=flip()>f</button>
<button id="back" onclick=back()>b</button>
</program>`;
    const { value: r0, logs } = await quiet(() => run(src, [{ wait: "settle" }]));
    expect(attrOf(r0.body, "#q", "fill")).toBe(null);
    expect(attrOf(r0.body, "#e", "filter")).toBe(null);
    expect(attrOf(r0.body, "#ok", "fill")).toBe("red");
    // a refusal is reported, never with the value
    expect(logs.some((l) => l.includes("css-guard"))).toBe(true);
    expect(logs.some((l) => l.includes("evil.example"))).toBe(false);
    const { value: r1 } = await quiet(() => run(src, [{ click: "#flip" }, { wait: "settle" }]));
    expect(attrOf(r1.body, "#paint", "stroke")).toBe(null);
    const { value: r2 } = await quiet(() => run(src, [{ click: "#flip" }, { wait: "settle" }, { click: "#back" }, { wait: "settle" }]));
    expect(attrOf(r2.body, "#paint", "stroke")).toBe("blue");
  });

  test("admitted: colours, numbers, filter functions, basic shapes, exactly url(#ident)", async () => {
    const src = `<program>
<a> = "blur(2px) drop-shadow(1px 1px 2px red)"
<b> = "url(#grad)"
<c> = "  url(#g-1_x)  "
<d> = "rgb(1 2 3 / 50%)"
<e> = "circle(50%)"
<svg>
  <rect id="a" filter=\${@a}></rect>
  <rect id="b" fill=\${@b}></rect>
  <rect id="c" mask=\${@c}></rect>
  <rect id="d" stroke=\${@d}></rect>
  <rect id="e" clip-path=\${@e}></rect>
</svg>
</program>`;
    const { value: r } = await quiet(() => run(src, [{ wait: "settle" }]));
    expect(attrOf(r.body, "#a", "filter")).toBe("blur(2px) drop-shadow(1px 1px 2px red)");
    expect(attrOf(r.body, "#b", "fill")).toBe("url(#grad)");
    expect(attrOf(r.body, "#c", "mask")).toBe("  url(#g-1_x)  ");
    expect(attrOf(r.body, "#d", "stroke")).toBe("rgb(1 2 3 / 50%)");
    expect(attrOf(r.body, "#e", "clip-path")).toBe("circle(50%)");
  });

  test("refused on every CSS-url attribute, on SVG and HTML elements (matched by name)", async () => {
    const names = [..._SCRML_CSS_URL_ATTRS];
    const rows = names.map((n, i) => `  <rect id="s${i}" ${n}=\${@bad}></rect>`).join("\n");
    const divs = names.map((n, i) => `<div id="h${i}" ${n}=\${@bad}></div>`).join("\n");
    const src = `<program>\n<bad> = "url(https://evil.example/x)"\n<svg>\n${rows}\n</svg>\n${divs}\n</program>`;
    const { value: r } = await quiet(() => run(src, [{ wait: "settle" }]));
    names.forEach((n, i) => {
      expect(attrOf(r.body, `#s${i}`, n)).toBe(null);
      expect(attrOf(r.body, `#h${i}`, n)).toBe(null);
    });
  });

  test("refused spellings: fallback paint, quoted / upper-case / spaced fragment, var(), image-set(), ;", async () => {
    const bad = ["url(#g) red", "url('#g')", "URL(#g)", "url( #g)", "url(#1g)", "var(--x)", "image-set(\"a.png\" 1x)", "red;", "red !important", "url(x.svg#g)"];
    const cells = bad.map((v, i) => `<v${i}> = ${JSON.stringify(v)}`).join("\n");
    const rects = bad.map((_, i) => `  <rect id="r${i}" fill=\${@v${i}}></rect>`).join("\n");
    const { value: r } = await quiet(() => run(`<program>\n${cells}\n<svg>\n${rects}\n</svg>\n</program>`, [{ wait: "settle" }]));
    bad.forEach((_, i) => expect(attrOf(r.body, `#r${i}`, "fill")).toBe(null));
  });

  test("<each> rows (expression and quoted forms)", async () => {
    const src = `<program>
<items> = [{ id: 1, paint: "url(https://evil.example/r)" }, { id: 2, paint: "green" }]
<svg>
  <each in=@items as it>
    <rect class="x" data-id=\${it.id} fill=\${it.paint}></rect>
    <circle class="y" data-id=\${it.id} stroke="\${it.paint}"></circle>
  </each>
</svg>
</program>`;
    const { value: r } = await quiet(() => run(src, [{ wait: "settle" }]));
    const xs = [...r.body.querySelectorAll("rect.x")];
    const ys = [...r.body.querySelectorAll("circle.y")];
    expect(xs.length).toBe(2);
    expect(xs[0].getAttribute("fill")).toBe(null);
    expect(xs[1].getAttribute("fill")).toBe("green");
    expect(ys[0].getAttribute("stroke")).toBe(null);
    expect(ys[1].getAttribute("stroke")).toBe("green");
  });

  test("<match> arm and if= mount", async () => {
    const src = `\${
  type Phase:enum = { Idle, Ready }
  <phase>: Phase = .Idle
  <bad> = "url(https://evil.example/m)"
  <ok> = "red"
  <on> = true
}
<match for=Phase on=@phase>
  <Idle>
    <svg><rect id="m1" fill=\${@bad}></rect><rect id="m2" fill="\${@ok}"></rect><rect id="m3" fill="\${@bad}"></rect></svg>
  </>
  <Ready><p>r</p></>
</match>
<svg if=@on><rect id="i1" filter=\${@bad}></rect><rect id="i2" filter=\${@ok}></rect></svg>
`;
    const { value: r } = await quiet(() => run(src, [{ wait: "settle" }]));
    expect(attrOf(r.body, "#m1", "fill")).toBe(null);
    expect(attrOf(r.body, "#m2", "fill")).toBe("red");
    expect(attrOf(r.body, "#m3", "fill")).toBe(null);
    expect(attrOf(r.body, "#i1", "filter")).toBe(null);
    expect(attrOf(r.body, "#i2", "filter")).toBe("red");
  });

  test("lift", async () => {
    const src = `<program>
<items> = [{ paint: "url(https://evil.example/l)" }, { paint: "blue" }]
<svg id="host">
\${ for (const it of @items) { lift <rect class="l" fill=\${it.paint}></rect> } }
</svg>
</program>`;
    const { value: r } = await quiet(() => run(src, [{ wait: "settle" }]));
    const ls = [...r.body.querySelectorAll("rect.l")];
    expect(ls.length).toBe(2);
    expect(ls[0].getAttribute("fill")).toBe(null);
    expect(ls[1].getAttribute("fill")).toBe("blue");
  });

  test("SMIL: static CSS target, computed target (both guards — URL first), `values` per entry, href target untouched", async () => {
    const src = `<program>
<js> = "javascript:alert(1)"
<ext> = "url(https://evil.example/s)"
<red> = "red"
<list> = "red;url(https://evil.example/v)"
<okList> = "red;blue"
<an> = "fill"
<svg>
  <rect><set id="a" attributeName="fill" to=\${@ext}></set></rect>
  <rect><set id="b" attributeName="FILL" to=\${@red}></set></rect>
  <rect><animate id="c" attributeName="fill" values=\${@list}></animate></rect>
  <rect><animate id="d" attributeName="fill" values=\${@okList}></animate></rect>
  <rect><set id="e" attributeName=\${@an} to=\${@js}></set></rect>
  <rect><set id="f" attributeName=\${@an} to=\${@ext}></set></rect>
  <rect><set id="g" attributeName="style" to=\${@ext}></set></rect>
  <a><set id="h" attributeName="href" to=\${@red}></set></a>
</svg>
</program>`;
    const { value: r } = await quiet(() => run(src, [{ wait: "settle" }]));
    expect(attrOf(r.body, "#a", "to")).toBe(null);
    expect(attrOf(r.body, "#b", "to")).toBe("red");
    expect(attrOf(r.body, "#c", "values")).toBe(null);
    expect(attrOf(r.body, "#d", "values")).toBe("red;blue");
    expect(attrOf(r.body, "#e", "to")).toBe("about:blank"); // rule 3 first: a refused scheme
    expect(attrOf(r.body, "#f", "to")).toBe(null); // the URL guard admits https; the CSS guard removes
    expect(attrOf(r.body, "#g", "to")).toBe(null);
    expect(attrOf(r.body, "#h", "to")).toBe("red"); // animating href: rule 3 only (a relative URL)
  });
});

// ---------------------------------------------------------------------------
// §3 the reader is the bootstrap's
// ---------------------------------------------------------------------------

describe("§3 same verdict as the bootstrap's cssValueOf + url(#ident) (s473 / s479)", () => {
  // The bootstrap's CSS_ATTR_FUNCTIONS (runtime.js, not exported) — the list this lane ported.
  const BOOT_ATTR_FUNCTIONS = new Set([
    "blur", "brightness", "contrast", "drop-shadow", "grayscale", "hue-rotate",
    "invert", "opacity", "saturate", "sepia", "inset", "circle", "ellipse", "polygon",
  ]);
  const bootRuntime = readFileSync(join(import.meta.dir, "../../self-host-v2/slice-m1/runtime/runtime.js"), "utf8");
  test("the ported function list is the bootstrap's, verbatim", () => {
    const m = /const CSS_ATTR_FUNCTIONS = new Set\(\[([\s\S]*?)\]\);/.exec(bootRuntime);
    expect(m).not.toBe(null);
    const boot = new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
    expect([...boot].sort()).toEqual([...BOOT_ATTR_FUNCTIONS].sort());
    expect(CSS_ATTR_GUARD_RUNTIME_SOURCE).toContain('"blur", "brightness", "contrast", "drop-shadow", "grayscale", "hue-rotate",');
    const bootList = /const CSS_URL_ATTRS = new Set\(\[([\s\S]*?)\]\);/.exec(bootRuntime);
    expect([...bootList[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort()).toEqual([..._SCRML_CSS_URL_ATTRS].sort());
  });
  const LOCAL = /^url\(#[A-Za-z_][A-Za-z0-9_-]*\)$/;
  const boot = (v, perEntry) => {
    const entries = perEntry ? v.split(";") : [v];
    return entries.every((e) => LOCAL.test(e.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "")) || cssValueOf(e, BOOT_ATTR_FUNCTIONS) !== null);
  };
  const battery = [
    "", "red", "#fff", "none", "currentColor", "0.5", "10px", "rgb(1, 2, 3)", "hsl(1 2% 3%)", "calc(1px + 2px)",
    "calc((1px + 2px) * 2)", "(1px)", "blur(2px)", "drop-shadow(1px 1px red)", "circle(50% at 1px 2px)",
    "polygon(0 0, 1px 1px)", "url(#a)", " url(#a) ", "\turl(#a)\n", "url(#a) red", "url('#a')", "URL(#a)",
    "url( #a)", "url(#a )", "url(#1a)", "url(#)", "url(#a.b)", "url(#a\\62)", "url(x.svg#a)",
    "url(https://e/x)", "url(javascript:x)", "image-set(a 1x)", "var(--x)", "attr(x)", "expression(1)",
    "red;", "red}", "red{", "red<", "red!important", "/* c */ red", "a\\62", "'red'", "\"red\"", "x:y",
    "rgb(1,2,3", "rgb(1,2,3))", "src(x)", "path(x)", "a".repeat(256), "a".repeat(257), "red;blue",
    "url(#a);url(#b)", "red;url(https://e)",
  ];
  test("every value of the battery, as one value and as a `values` list", () => {
    for (const v of battery) {
      expect([v, _scrml_css_attr_value_admitted(v, false)]).toEqual([v, boot(v, false)]);
      expect([v, _scrml_css_attr_value_admitted(v, true)]).toEqual([v, boot(v, true)]);
    }
  });
});

// ---------------------------------------------------------------------------
// §4 E-ATTR-STYLESHEET-HREF
// ---------------------------------------------------------------------------

describe("§4 E-ATTR-STYLESHEET-HREF (impl#1 forms the shared conformance cases cannot hold)", () => {
  const refused = {
    quotedWhole: `<link rel="stylesheet" href="\${@u}">`,
    quotedPartial: `<link rel="stylesheet" href="/themes/\${@u}.css">`,
    expression: `<link rel="stylesheet" href=\${@u}>`,
    bareCell: `<link rel="stylesheet" href=@u>`,
    computedRelQuoted: `<link rel="\${@r}" href=\${@u}>`,
    alternate: `<link rel="Alternate StyleSheet" href=\${@u}>`,
    xlink: `<link rel="stylesheet" xlink:href=\${@u}>`,
    upperHref: `<link rel="stylesheet" HREF=\${@u}>`,
    entityRel: `<link rel="style&#115;heet" href=\${@u}>`,
  };
  for (const [n, el] of Object.entries(refused)) {
    test(`refused: ${n}`, () => {
      const r = compile(`sh-${n}`.toLowerCase(), `<program>\n<u> = "/a.css"\n<r> = "stylesheet"\n${el}\n</program>\n`);
      expect(codesOf(r).filter((c) => c === "E-ATTR-STYLESHEET-HREF").length).toBe(1);
    });
  }
  test("refused: an <each> row's field", () => {
    const r = compile("sh-each", `<program>\n<items> = [{ id: 1, css: "/a.css" }]\n<each in=@items as it>\n  <link rel="stylesheet" href=\${it.css}>\n</each>\n</program>\n`);
    expect(codesOf(r)).toContain("E-ATTR-STYLESHEET-HREF");
  });
  test("refused: a lift", () => {
    const r = compile("sh-lift", `<program>\n<items> = [{ css: "/a.css" }]\n<div>\n\${ for (const it of @items) { lift <link rel="stylesheet" href=\${it.css}> } }\n</div>\n</program>\n`);
    expect(codesOf(r)).toContain("E-ATTR-STYLESHEET-HREF");
  });
  test("refused: a component body reading a prop — reported once, at the definition", () => {
    const r = compile("sh-comp", `<program>\n<u> = "/a.css"\nconst Sheet = <link props={ h: string } rel="stylesheet" href=\${h}>\n<Sheet h=@u/>\n<Sheet h=@u/>\n</program>\n`);
    expect(codesOf(r).filter((c) => c === "E-ATTR-STYLESHEET-HREF").length).toBe(1);
  });
  test("refused: a match arm", () => {
    const r = compile("sh-match", `\${\n  type Phase:enum = { Idle, Ready }\n  <phase>: Phase = .Idle\n  <u> = "/a.css"\n}\n<match for=Phase on=@phase>\n  <Idle>\n    <link rel="stylesheet" href=\${@u}>\n  </>\n  <Ready><p>r</p></>\n</match>\n`);
    expect(codesOf(r)).toContain("E-ATTR-STYLESHEET-HREF");
  });
  const admitted = {
    staticHref: `<link rel="stylesheet" href="/app.css">`,
    icon: `<link rel="icon" href="\${@u}">`,
    preloadAsStyle: `<link rel="preload" as="style" href=\${@u}>`,
    noRel: `<link href=\${@u}>`,
    valuelessRel: `<link rel href=\${@u}>`,
    sheetRelStaticHref: `<link rel=\${@r} href="/app.css">`,
    notALink: `<a rel="stylesheet" href=\${@u}>a</a>`,
  };
  for (const [n, el] of Object.entries(admitted)) {
    test(`not refused: ${n}`, () => {
      const r = compile(`ok-${n}`.toLowerCase(), `<program>\n<u> = "/a.css"\n<r> = "stylesheet"\n${el}\n</program>\n`);
      expect(codesOf(r)).not.toContain("E-ATTR-STYLESHEET-HREF");
      expect(codesOf(r)).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// §5 the runtime <link> href wall
// ---------------------------------------------------------------------------

describe("§5 the runtime wall: a <link>'s data href", () => {
  test("a data href on an icon <link> is written through the setter (rule 3 still judges it)", async () => {
    const src = `<program>\n<u> = "/favicon.png"\n<bad> = "javascript:alert(1)"\n<link id="i" rel="icon" href="\${@u}">\n<link id="j" rel="icon" href="\${@bad}">\n</program>`;
    const { client } = compile("lh-icon", src);
    expect(client).toContain("_scrml_link_href_set(");
    expect(client).not.toContain('setAttribute("href",');
    const { value: r } = await quiet(() => run(src, [{ wait: "settle" }]));
    expect(attrOf(r.body, "#i", "href")).toBe("/favicon.png");
    expect(attrOf(r.body, "#j", "href")).toBe("about:blank");
  });

  test("_scrml_link_href_set removes the href when the element's rel loads a stylesheet (any case)", () => {
    const logs = [];
    const fn = new Function("_scrml_error_boundary_log", `${CSS_ATTR_GUARD_RUNTIME_SOURCE}\nfunction _scrml_safe_url(el, n, v) { return String(v); }\nreturn _scrml_link_href_set;`)((k, e) => logs.push(k + ":" + e.message));
    const mk = (rel) => {
      const attrs = new Map(rel === null ? [["href", "/old.css"]] : [["rel", rel], ["href", "/old.css"]]);
      return { tagName: "LINK", getAttribute: (n) => attrs.has(n) ? attrs.get(n) : null, setAttribute: (n, v) => attrs.set(n, String(v)), removeAttribute: (n) => attrs.delete(n), attrs };
    };
    for (const rel of ["stylesheet", "Alternate STYLESHEET", "preload stylesheet"]) {
      const el = mk(rel);
      fn(el, "href", "https://evil.example/a.css");
      expect(el.attrs.has("href")).toBe(false);
    }
    for (const rel of ["icon", null]) {
      const el = mk(rel);
      fn(el, "href", "/x.png");
      expect(el.attrs.get("href")).toBe("/x.png");
    }
    expect(logs.length).toBe(3);
    expect(logs.every((l) => l.startsWith("css-guard:") && !l.includes("evil.example"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §6 unchanged elsewhere
// ---------------------------------------------------------------------------

describe("§6 programs without these writes are unchanged", () => {
  test("static CSS-url attributes, other bound attributes, <a href>: no setter, no chunk", () => {
    const { client, runtime } = compile("none", `<program>
<u> = "/a"
<c> = "x"
<svg><rect fill="red" filter="blur(1px)" width=\${@c}></rect></svg>
<a href=\${@u} title="\${@c}">a</a>
<link rel="stylesheet" href="/app.css">
</program>
`);
    expect(client).not.toContain("_scrml_css_attr_set");
    expect(client).not.toContain("_scrml_link_href_set");
    expect(client).toContain("_scrml_safe_url(");
    expect(runtime).not.toContain("_scrml_css_attr_set");
    expect(runtime).toContain("function _scrml_safe_url(");
  });
});

// ---------------------------------------------------------------------------
// §7 server first-paint rows
// ---------------------------------------------------------------------------

function compileBundles(source, filePath = "/test/app.scrml") {
  const ast = buildAST(splitBlocks(filePath, source)).ast;
  const result = runCG({
    files: [ast],
    routeMap: { functions: new Map() },
    depGraph: { nodes: new Map(), edges: [] },
    protectAnalysis: { views: new Map() },
  });
  const out = result.outputs.get(filePath);
  return { serverJs: out?.serverJs ?? "", clientJs: out?.clientJs ?? "" };
}

const SSR_SRC = (attr) => `<program db="sqlite:./test.db">
\${
  < Shape authority="server" table="shapes">
    id: number
    paint: string
  </>
  <Shape> @shapes
}
<svg><each in=@shapes key=@.id><rect ${attr}></rect></each></svg>
</program>`;

describe("§7 the server's first-paint rows", () => {
  test('`fill="${@.paint}"` is not server-rendered (the client\'s guarded setter writes it)', () => {
    const { serverJs, clientJs } = compileBundles(SSR_SRC('fill="${@.paint}"'));
    expect(serverJs).not.toMatch(/fill=\\?"/);
    expect(clientJs).toContain("_scrml_css_attr_set(");
  });
  test("control: a non-CSS attribute row IS server-rendered", () => {
    const { serverJs } = compileBundles(SSR_SRC('data-p="${@.paint}"'));
    expect(serverJs).toContain("data-p=");
  });
});
