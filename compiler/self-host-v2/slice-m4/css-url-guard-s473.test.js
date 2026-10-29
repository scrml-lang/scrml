// css-url-guard-s473.test.js — s473-boot-svg-css-url-guard: the CSS-injection follow-ups to #1615.
//
// Three gaps, each pinned here with its bypass attempts:
//
// 1. g-boot-svg-presentation-attr-css-url-unguarded-s472 (MED, Chromium-verified). A bound SVG
//    presentation attribute whose CSS value grammar takes a `<url>` / `<image>` (`fill` `stroke`
//    `filter` `mask` `clip-path` `marker` `marker-start` `marker-mid` `marker-end` `cursor`
//    `color-profile`) was written raw by `rt.attr`, and `fill=(@c)` with `@c = "url(https://…)"`
//    fetched on first paint. It is now written only if `cssValueOf` (the §25.7 bridge's guard, the
//    one CSS-value reader) admits it — refused: the attribute is REMOVED and the refusal reported,
//    never the value. The same holds for a SMIL `to` / `from` / `by` / `values` write whose
//    `attributeName` names one of them (or `style`) or is computed (`values` judged per `;` entry).
//    The SPEC names no presentation-attribute rule, so there is no compile refusal: this is a
//    runtime guard (as §5.2 rule 3 is for URLs).
//
// 2. g-boot-link-stylesheet-href-from-data-s472 (RULED S472). user-voice-scrml.md S472 "five PA
//    recs" item 3: "A data-bound `href` on a `<link>` whose `rel` contains `stylesheet` (or is
//    computed) is REFUSED." — E-ATTR-STYLESHEET-HREF at compile time, and `rt.attr` never writes such
//    an `href` (fail closed).
//
// 3. g-spec-65-4-2-quoted-style-template-contradiction-s472 (RULED S472, item 4): "Quoted
//    `style="…${x}…"` (§65.4.2 table): each `${}` is guarded by `cssValueOf`". The bootstrap does not
//    lower a quoted template (§5.5.3), so it keeps refusing `style="…${}…"`; this pins the refusal.

import { describe, test, expect, beforeAll, afterEach, spyOn } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, warmLoadProgram } from "../slice-m1/load-program.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => expectNoPageErrors());

const run = (src) => frontEnd(mods, [{ path: "s.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const rt = await import("../slice-m1/runtime/runtime.js");

const SVG_NS = "http://www.w3.org/2000/svg";

// Run `body` with console.warn / console.error captured; returns the lines.
function captured(body) {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    body();
    return { warns: warn.mock.calls.map((c) => c.map(String).join(" ")), errors: error.mock.calls.map((c) => c.map(String).join(" ")) };
  } finally {
    warn.mockRestore();
    error.mockRestore();
  }
}

// An element under a fresh host (`markup` is parsed as HTML, so `<svg>` content is in the SVG namespace).
function elementOf(markup, sel) {
  document.body.innerHTML = markup;
  return document.querySelector(sel);
}

// ---------------------------------------------------------------------------
// 1. SVG presentation attributes that take a CSS <url> / <image>.
// ---------------------------------------------------------------------------
const CSS_URL_ATTRS = [
  "fill", "stroke", "filter", "mask", "clip-path",
  "marker", "marker-start", "marker-mid", "marker-end", "cursor", "color-profile",
];

const HOSTILE_CSS = [
  ["url() exfiltration", "url(https://evil.example/leak.svg#p)"],
  ["URL() — any case", "URL(https://evil.example/leak.svg#p)"],
  ["a relative url()", "url(/leak.svg#p)"],
  ["a local-fragment url() (no url() is admitted from data)", "url(#grad)"],
  ["url() with a fallback colour", "url(https://evil.example/x.svg#p) red"],
  ["a cursor url list", "url(https://evil.example/c.png), auto"],
  ["whitespace before the paren (`url (`)", "url (https://evil.example/x)"],
  ["a quoted url", "url(\"https://evil.example/x\")"],
  ["an escape spelling url (`u\\72l(`)", "u\\72l(https://evil.example/x)"],
  ["an entity spelling url (`&#117;rl(`)", "&#117;rl(https://evil.example/x)"],
  ["image-set()", "image-set(https://evil.example/a 1x)"],
  ["src()", "src(https://evil.example/a)"],
  ["var() (reads a property the page controls)", "var(--x)"],
  ["a gradient (an <image> — not on the admitted list)", "linear-gradient(red, blue)"],
  ["a declaration breakout", "red; background: url(https://evil.example/x)"],
  ["!important", "red !important"],
  ["a comment", "red /* x */"],
  ["javascript:", "javascript:alert(1)"],
];

const BENIGN_CSS = [
  ["fill", "red"], ["fill", "#ff0000"], ["fill", "rgb(1, 2, 3)"], ["fill", "none"],
  ["fill", "currentColor"], ["stroke", "context-stroke"], ["stroke", "hsl(120 50% 50%)"],
  ["filter", "blur(2px)"], ["filter", "drop-shadow(1px 1px 2px rgb(0, 0, 0))"],
  ["filter", "grayscale(50%) contrast(1.2) hue-rotate(90deg)"],
  ["clip-path", "circle(50%)"], ["clip-path", "inset(10px)"],
  ["clip-path", "polygon(0 0, 100% 0, 50% 100%)"], ["clip-path", "ellipse(10px 20px at 50% 50%)"],
  ["mask", "none"], ["marker-start", "none"], ["cursor", "pointer"],
];

describe("runtime — a bound CSS-url presentation attribute is judged by cssValueOf (refused → removed, reported without the value)", () => {
  for (const attrName of CSS_URL_ATTRS) {
    for (const [what, v] of HOSTILE_CSS) {
      test(`${attrName}= ${what}`, () => {
        const el = elementOf(`<svg><rect id="r" width="1" height="1"></rect></svg>`, "#r");
        expect(el.namespaceURI).toBe(SVG_NS);
        const scope = new rt.Scope(rt.root);
        const { warns } = captured(() => rt.attr(scope, el, attrName, () => v));
        expect(el.hasAttribute(attrName)).toBe(false);
        expect(warns.length).toBe(1);
        expect(warns[0]).toContain("[scrml css-guard]");
        expect(warns[0]).toContain(attrName + "=");
        expect(warns[0]).not.toContain("evil.example");
        expect(warns[0]).not.toContain(v);
        scope.dispose?.();
      });
    }
  }
  test("the attribute name is matched case-insensitively (`FILL=`, `Clip-Path=`)", () => {
    for (const n of ["FILL", "Clip-Path", "Marker-End", "CURSOR"]) {
      const el = elementOf(`<svg><rect id="r"></rect></svg>`, "#r");
      const scope = new rt.Scope(rt.root);
      const { warns } = captured(() => rt.attr(scope, el, n, () => "url(https://evil.example/x)"));
      expect(el.getAttributeNames()).toEqual(["id"]);
      expect(warns.length).toBe(1);
      scope.dispose?.();
    }
  });
  test("an HTML element is judged too (the guard is by name, in every namespace — fail closed)", () => {
    const el = elementOf(`<div id="d"></div>`, "#d");
    const scope = new rt.Scope(rt.root);
    captured(() => rt.attr(scope, el, "filter", () => "url(https://evil.example/x)"));
    expect(el.hasAttribute("filter")).toBe(false);
    scope.dispose?.();
  });
  test("a reactive re-write is judged on every write (benign → hostile → benign)", () => {
    const el = elementOf(`<svg><rect id="r"></rect></svg>`, "#r");
    const scope = new rt.Scope(rt.root);
    const c = rt.cell("red");
    const { warns } = captured(() => {
      rt.attr(scope, el, "fill", () => c.get());
      expect(el.getAttribute("fill")).toBe("red");
      c.set("url(https://evil.example/x)");
      expect(el.hasAttribute("fill")).toBe(false);
      c.set("blue");
      expect(el.getAttribute("fill")).toBe("blue");
    });
    expect(warns.length).toBe(1);
    scope.dispose?.();
  });
  for (const [attrName, v] of BENIGN_CSS) {
    test(`benign: ${attrName}="${v}" is written unchanged`, () => {
      const el = elementOf(`<svg><rect id="r"></rect></svg>`, "#r");
      const scope = new rt.Scope(rt.root);
      const { warns } = captured(() => rt.attr(scope, el, attrName, () => v));
      expect(el.getAttribute(attrName)).toBe(v);
      expect(warns).toEqual([]);
      scope.dispose?.();
    });
  }
  test("benign: a number is written (`stroke=(@n)`), and other presentation attributes are not judged", () => {
    const el = elementOf(`<svg><rect id="r"></rect></svg>`, "#r");
    const scope = new rt.Scope(rt.root);
    const { warns } = captured(() => {
      rt.attr(scope, el, "fill", () => 3);
      rt.attr(scope, el, "stroke-width", () => "a;b url(x)");
      rt.attr(scope, el, "opacity", () => "0.5");
    });
    expect(el.getAttribute("fill")).toBe("3");
    expect(el.getAttribute("stroke-width")).toBe("a;b url(x)");
    expect(warns).toEqual([]);
    scope.dispose?.();
  });
  test("the §25.7 bridge is unchanged: a filter function is still not admitted for a `#{}` cell value", () => {
    expect(rt.cssValueOf("blur(2px)")).toBe(null);
    expect(rt.cssValueOf("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
  });
});

describe("runtime — SMIL values animating a CSS-url attribute (`to` / `from` / `by` / `values`)", () => {
  const anim = (inner) => elementOf(`<svg><rect width="1" height="1">${inner}</rect></svg>`, "#a");
  for (const target of ["fill", "FILTER", "clip-path", "marker-end", "style"]) {
    for (const valueAttr of ["to", "from", "by", "values"]) {
      test(`<set attributeName="${target}"> ${valueAttr}= url() is removed`, () => {
        const el = anim(`<set id="a" attributeName="${target}"></set>`);
        const scope = new rt.Scope(rt.root);
        const { warns } = captured(() => rt.attr(scope, el, valueAttr, () => "url(https://evil.example/x.svg#f)"));
        expect(el.hasAttribute(valueAttr)).toBe(false);
        expect(warns.length).toBe(1);
        expect(warns[0]).toContain("[scrml css-guard]");
        expect(warns[0]).not.toContain("evil.example");
        scope.dispose?.();
      });
    }
  }
  test("`values` is judged per `;` entry: a benign list is written, one url() entry refuses the whole list", () => {
    const el = anim(`<animate id="a" attributeName="fill" dur="1s"></animate>`);
    const scope = new rt.Scope(rt.root);
    const c = rt.cell("red;blue; rgb(1, 2, 3)");
    const { warns } = captured(() => {
      rt.attr(scope, el, "values", () => c.get());
      expect(el.getAttribute("values")).toBe("red;blue; rgb(1, 2, 3)");
      c.set("red;url(https://evil.example/x.svg#p)");
      expect(el.hasAttribute("values")).toBe(false);
    });
    expect(warns.length).toBe(1);
    scope.dispose?.();
  });
  test("`attributeType=\"CSS\"` and an upper-case element tag change nothing", () => {
    const el = anim(`<SET id="a" attributeName="filter" attributeType="CSS"></SET>`);
    const scope = new rt.Scope(rt.root);
    captured(() => rt.attr(scope, el, "TO", () => "url(https://evil.example/x.svg#f)"));
    expect(el.getAttributeNames().map((n) => n.toLowerCase()).sort()).toEqual(["attributename", "attributetype", "id"]);
    scope.dispose?.();
  });
  test("a computed `attributeName` is judged by BOTH guards: a url() that the URL guard admits is still refused", () => {
    const el = anim(`<set id="a"></set>`);
    const scope = new rt.Scope(rt.root);
    const { warns, errors } = captured(() => {
      rt.attr(scope, el, "attributeName", () => "fill");
      rt.attr(scope, el, "to", () => "url(https://evil.example/x.svg#p)");
    });
    expect(el.getAttribute("attributeName")).toBe("fill");
    expect(el.hasAttribute("to")).toBe(false);
    expect(warns.length).toBe(1);
    expect(errors).toEqual([]);
    scope.dispose?.();
  });
  test("a computed `attributeName`: a refused URL scheme stays about:blank (the §5.2 rule 3 guard runs first)", () => {
    const el = anim(`<set id="a"></set>`);
    const scope = new rt.Scope(rt.root);
    const { errors } = captured(() => {
      rt.attr(scope, el, "attributeName", () => "href");
      rt.attr(scope, el, "to", () => "javascript:alert(1)");
    });
    expect(el.getAttribute("to")).toBe("about:blank");
    expect(errors.length).toBe(1);
    scope.dispose?.();
  });
  test("a prefixed or padded target is judged by its local part (`attributeName=\" svg:Fill \"`)", () => {
    const el = anim(`<set id="a" attributeName=" svg:Fill "></set>`);
    const scope = new rt.Scope(rt.root);
    captured(() => rt.attr(scope, el, "to", () => "url(https://evil.example/x.svg#p)"));
    expect(el.hasAttribute("to")).toBe(false);
    scope.dispose?.();
  });
  test("a static non-CSS target is not judged (`attributeName=\"width\"`)", () => {
    const el = anim(`<set id="a" attributeName="width"></set>`);
    const scope = new rt.Scope(rt.root);
    const { warns } = captured(() => rt.attr(scope, el, "to", () => "10;url(x)"));
    expect(el.getAttribute("to")).toBe("10;url(x)");
    expect(warns).toEqual([]);
    scope.dispose?.();
  });
  test("benign: `<set attributeName=\"fill\" to=\"red\">` is written", () => {
    const el = anim(`<set id="a" attributeName="fill"></set>`);
    const scope = new rt.Scope(rt.root);
    captured(() => rt.attr(scope, el, "to", () => "red"));
    expect(el.getAttribute("to")).toBe("red");
    scope.dispose?.();
  });
});

describe("end to end — a compiled program's bound `fill=` / `filter=` / `<set to=>`", () => {
  test("hostile values never reach the DOM; benign ones do", async () => {
    const r = run(`<program>
    let <bad:string="url(https://evil.example/leak.svg#p)"/>
    let <ok:string="red"/>
    let <blur:string="blur(2px)"/>
    <main>
        <svg>
            <rect id="f1" width="1" height="1" fill=@bad/>
            <rect id="f2" width="1" height="1" FILL=(@bad)/>
            <rect id="f3" width="1" height="1" fill=@ok filter=@blur/>
            <rect id="f4" width="1" height="1"><set id="s1" attributeName="filter" attributeType="CSS" to=@bad/></rect>
        </svg>
    </main>
</program>
`);
    expect(r.diags).toEqual([]);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      await loadProgram(r.core, "css-url-e2e", []);
    } finally {
      warn.mockRestore();
    }
    expect(document.querySelector("#f1").hasAttribute("fill")).toBe(false);
    expect(document.querySelector("#f2").getAttributeNames().map((n) => n.toLowerCase())).toEqual(["id", "width", "height"]);
    expect(document.querySelector("#f3").getAttribute("fill")).toBe("red");
    expect(document.querySelector("#f3").getAttribute("filter")).toBe("blur(2px)");
    expect(document.querySelector("#s1").hasAttribute("to")).toBe(false);
    expect(document.body.innerHTML).not.toContain("evil.example");
  });
});

// ---------------------------------------------------------------------------
// 2. `<link rel="stylesheet" href=(data)>` — RULED S472: REFUSED.
// ---------------------------------------------------------------------------
const LINK = (tag, extra = "") => `<program>
    let <u:string="https://evil.example/x.css"/>
    let <r:string="stylesheet"/>
${extra}    <main>
        ${tag}
    </main>
</program>
`;

describe("compile — a data-bound `href` on a stylesheet `<link>` is E-ATTR-STYLESHEET-HREF", () => {
  const refused = (tag, extra) => expect(codes(LINK(tag, extra))).toEqual(["E-ATTR-STYLESHEET-HREF"]);
  test("`rel=\"stylesheet\" href=(@u)` (the S472 reproduction)", () => refused(`<link rel="stylesheet" href=(@u)/>`));
  test("`href=@u` (bare reactive)", () => refused(`<link rel="stylesheet" href=@u/>`));
  test("`href` before `rel`", () => refused(`<link href=@u rel="stylesheet"/>`));
  test("case variants: `Rel=\"StyleSheet\" HREF=`", () => refused(`<link Rel="StyleSheet" HREF=@u/>`));
  test("case variants: `<LINK>`", () => refused(`<LINK rel="STYLESHEET" href=@u/>`));
  test("a rel token list: `\"alternate stylesheet\"`", () => refused(`<link rel="alternate stylesheet" title="t" href=@u/>`));
  test("a rel token list with other whitespace and a second token", () => refused(`<link rel="  preload\tstylesheet  " href=@u/>`));
  test("`rel=\"stylesheet icon\"` (an image token beside it does not make it an icon)", () => refused(`<link rel="stylesheet icon" href=@u/>`));
  test("a computed rel (`rel=@r`)", () => refused(`<link rel=@r href=@u/>`));
  test("a computed rel (`rel=(@r)`) even with a harmless value", () => refused(`<link rel=("icon") href=@u/>`));
  test("an entity in a static rel (`style&#115;heet`) is unprovable — refused", () => refused(`<link rel="style&#115;heet" href=@u/>`));
  test("a call", () => refused(`<link rel="stylesheet" href=sheet(@u)/>`, `    function sheet(v: string) -> string { return v; }\n`));
  test("an expression", () => refused(`<link rel="stylesheet" href=("https://x/" + @u)/>`));
  test("an <each> row's field", () => {
    expect(codes(`type Row:struct = { id: int, css: string }
<program>
    <rows:Row[]=([{ id: 1, css: "https://evil.example/x.css" }])/>
    <main><each in=@rows key=@.id as row><link rel="stylesheet" href=row.css/></each></main>
</program>
`)).toEqual(["E-ATTR-STYLESHEET-HREF"]);
  });
  test("a declaration's field (reported once, at the definition)", () => {
    expect(codes(`<skin sheet:string>
</>
renders <span class="skin"><link rel="stylesheet" href=sheet/></span>

<program>
    <main>
        <skin sheet="https://evil.example/a.css"/>
        <skin sheet="/b.css"/>
    </main>
</program>
`)).toEqual(["E-ATTR-STYLESHEET-HREF"]);
  });
  test("the diagnostic names the safe forms", () => {
    const d = run(LINK(`<link rel="stylesheet" href=@u/>`)).diags[0];
    expect(d.message).toContain("§5.2");
    expect(d.message).toContain("static");
  });
});

describe("compile — the other spellings do not compile either (never written from data)", () => {
  test("`xlink:href=` on a <link>", () => expect(codes(LINK(`<link rel="stylesheet" xlink:href=@u/>`)).length).toBeGreaterThan(0));
  test("a spread `{...@x}`", () => expect(codes(LINK(`<link rel="stylesheet" {...@u}/>`)).length).toBeGreaterThan(0));
  test("a braced `href={@u}`", () => expect(codes(LINK(`<link rel="stylesheet" href={@u}/>`)).length).toBeGreaterThan(0));
  test("a quoted template `href=\"${@u}\"`", () => expect(codes(LINK(`<link rel="stylesheet" href="\${@u}"/>`)).length).toBeGreaterThan(0));
});

describe("compile — benign <link> forms still build", () => {
  const clean = (tag) => expect(codes(LINK(tag))).toEqual([]);
  test("a static stylesheet href", () => clean(`<link rel="stylesheet" href="/app.css"/>`));
  test("a data-bound href on an icon link (§5.2 rule 3 still judges its scheme)", () => clean(`<link rel="icon" href=@u/>`));
  test("a data-bound href on a link with no rel", () => clean(`<link href=@u/>`));
  test("`rel=\"preload\" as=\"style\"` does not apply a sheet", () => clean(`<link rel="preload" as="style" href=@u/>`));
  test("a computed rel with a STATIC href (the ruling refuses a data-bound href)", () => clean(`<link rel=@r href="/app.css"/>`));
  test("a data href on a non-link element whose rel says stylesheet (`<a rel=\"stylesheet\">`)", () => clean(`<a rel="stylesheet" href=@u>a</a>`));
});

const LINK_REPORT = "[scrml css-guard] refused a data-supplied `href` on a <link> whose `rel` loads a stylesheet or is computed: a stylesheet is never chosen by data (SPEC §5.2). The attribute was removed.";

describe("runtime — `rt.attr` never writes a stylesheet <link>'s href from data (fail closed)", () => {
  for (const [rel, name] of [
    ["stylesheet", "href"], ["StyleSheet", "HREF"], ["alternate stylesheet", "href"],
    ["stylesheet", "xlink:href"], [" icon\tSTYLESHEET ", "Href"],
  ]) {
    test(`rel="${rel}" ${name}=`, () => {
      const el = elementOf(`<link id="l" rel="${rel}">`, "#l");
      const scope = new rt.Scope(rt.root);
      let ran = 0;
      const { warns } = captured(() => rt.attr(scope, el, name, () => { ran++; return "https://evil.example/x.css"; }));
      expect(el.getAttributeNames()).toEqual(["id", "rel"]);
      expect(ran).toBe(0);
      expect(warns).toEqual([LINK_REPORT]);
      scope.dispose?.();
    });
  }
  test("a computed rel written first refuses the href", () => {
    const el = elementOf(`<link id="l">`, "#l");
    const scope = new rt.Scope(rt.root);
    const { warns } = captured(() => {
      rt.attr(scope, el, "rel", () => "icon");
      rt.attr(scope, el, "href", () => "https://evil.example/x.css");
    });
    expect(el.hasAttribute("href")).toBe(false);
    expect(warns).toEqual([LINK_REPORT]);
    scope.dispose?.();
  });
  test("a computed rel written AFTER a data href removes it, and the href's later re-writes stay refused", () => {
    const el = elementOf(`<link id="l">`, "#l");
    const scope = new rt.Scope(rt.root);
    const u = rt.cell("/a.png");
    const { warns } = captured(() => {
      rt.attr(scope, el, "href", () => u.get());
      expect(el.getAttribute("href")).toBe("/a.png");
      rt.attr(scope, el, "rel", () => "stylesheet");
      expect(el.hasAttribute("href")).toBe(false);
      u.set("https://evil.example/x.css");
      expect(el.hasAttribute("href")).toBe(false);
    });
    expect(warns.length).toBeGreaterThanOrEqual(1);
    for (const w of warns) expect(w).toBe(LINK_REPORT);
    scope.dispose?.();
  });
  test("an icon link's data href is still written (through the §5.2 rule 3 guard)", () => {
    const el = elementOf(`<link id="l" rel="icon">`, "#l");
    const scope = new rt.Scope(rt.root);
    const { warns } = captured(() => rt.attr(scope, el, "href", () => "/favicon.png"));
    expect(el.getAttribute("href")).toBe("/favicon.png");
    expect(warns).toEqual([]);
    scope.dispose?.();
  });
});

// ---------------------------------------------------------------------------
// 3. §65.4.2 quoted `style="…${x}…"` — RULED S472: each `${}` guarded by cssValueOf. The bootstrap
//    does not lower a quoted template; it keeps refusing the form (never emitted as literal text,
//    never unguarded).
// ---------------------------------------------------------------------------
describe("§65.4.2 — the bootstrap keeps refusing a quoted `style=\"…${…}…\"`", () => {
  const P = (attr) => `<program>
    let <c:string="url(https://evil.example/x)"/>
    <main><p ${attr}>x</p></main>
</program>
`;
  for (const attr of [
    `style="background: \${@c}"`,
    `STYLE="color: \${@c}"`,
    `Style="\${@c}"`,
  ]) {
    test(attr, () => expect(codes(P(attr))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]));
  }
  test("on an SVG element", () => expect(codes(`<program>
    let <c:string="red"/>
    <main><svg><rect style="fill: \${@c}"/></svg></main>
</program>
`)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]));
});
