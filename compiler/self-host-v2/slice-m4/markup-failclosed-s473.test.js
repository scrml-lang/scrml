// markup-failclosed-s473.test.js — s473-boot-failclosed-markup: the bootstrap
// fails closed on markup it does not understand.
//
// Root cause (S473 SPEC-coverage audit, parts 1/2/3/6, found independently by
// three parts): a tag the bootstrap did not recognise was emitted as a plain
// HTML element with no diagnostic (gap g-bootstrap-unknown-tags-resolved-as-html).
//
// Governing text:
//  - §4.1: "The compiler SHALL validate the element name against the built-in
//    HTML element registry … A name that is not a known HTML element and not a
//    defined component SHALL be a compile error (E-MARKUP-001)." §34's retired
//    E-STATE-001 row: "a PascalCase name surfaces as E-COMPONENT-035, a
//    lowercase-HTML name as E-MARKUP-001".
//  - §4.15 / §24.4: the structural elements "SHALL NOT be treated as HTML
//    elements"; a user declaration named after one is E-NAME-COLLIDES-RESERVED.
//  - §66.6.6: a bare own-field tag is E-DECL-FIELD-TAG-NEEDS-STAR; "there is NO
//    deprecation window in which `<x/>` silently changes meaning".
//  - §66.8.2: a named shared instance (refused by the bootstrap at file scope).
//  - §17.4 / §34: E-CONTROL-FLOW-IN-MARKUP for a bare braced `for`/`if`/`while`.
//  - §17.7.2: E-EACH-ITER-SHAPE, E-EACH-EMPTY-BODY.
//  - §5.2: E-ATTR-UNQUOTED-OPERATOR.
//  - S473 D26: `fixed` is retired — refused by name. S473 D2: an unknown name is emitted only
//    when hyphenated (a custom element); `protect=` / `authority=` the bootstrap does not
//    enforce are refused (S473 D1: refuse rather than drop a guarantee).
//
// "One list": elements.scrml is impl#1's html-elements.js `isKnownElementName`
// list ported as data. The first block runs both over every name impl#1 knows
// (and a grid of near-misses) and requires the same answer.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";
import { isKnownElementName, standardMarkupElementNamesLowercase, isCustomElementName, getAllElementNames } from "../../src/html-elements.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const run = (src) => frontEnd(mods, [{ path: "s.scrml", src }]);
const codes = (src) => run(src).diags.map((d) => d.code);
const clean = (src) => {
  const r = run(src);
  expect(r.diags.map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(mods.check.checkCore(r.core)).toEqual([]);
  return r.core;
};
const P = (main, decls = "") => `<program>
${decls}
    <main>
${main}
    </main>
</program>
`;

// impl#1's isKnownElementName also accepts its curated REGISTRY's keys, which add exactly the
// scrml structural forms (`program`, `each`, `errors`, `render`, … — getAllElementNames minus the
// standard lists). Those are not markup elements (§24.4: "The HTML element registry (§24.1) SHALL
// NOT include these names"); analyze reads each before it asks the registry. So the bootstrap's
// answer is impl#1's minus those forms — asserted below, and the forms are pinned.
const STD = new Set(standardMarkupElementNamesLowercase());
const IMPL1_SCRML_FORMS = getAllElementNames().filter((k) => !STD.has(k.toLowerCase())).sort();
// The one deliberate addition over impl#1's list (review F8): WHATWG's `selectedcontent`.
const BOOT_ONLY = ["selectedcontent"];
const impl1Markup = (n) => BOOT_ONLY.includes(n.toLowerCase()) || (isKnownElementName(n) && !IMPL1_SCRML_FORMS.includes(n.toLowerCase()));

describe("elements.scrml is impl#1's element list (one definition)", () => {
  test("impl#1's registry adds only scrml structural forms to the standard lists", () => {
    expect(IMPL1_SCRML_FORMS).toEqual(["auth", "column", "each", "empty", "errorboundary", "errors", "formfor", "onchange", "program", "render", "tablefor"]);
  });
  test("every standard markup name impl#1 knows, in canonical and other cases", () => {
    const el = mods.elements;
    const svgCanon = el.svgElementNames();
    const names = [...STD, ...svgCanon, ...svgCanon.map((n) => n.toUpperCase())];
    for (const n of names) expect([n, el.isKnownElementName(n)]).toEqual([n, impl1Markup(n)]);
  });
  test("near-misses, custom elements and non-names agree", () => {
    const el = mods.elements;
    const grid = ["frobnicate", "Widget", "widget", "my-widget", "x-foo", "ui-date.picker", "My-Widget", "-x", "a-",
      "count", "onMount", "onmount", "md", "each", "match", "scripts", "style-x", "Div", "DIV", "feGaussianBlur",
      "fegaussianblur", "annotation-xml", "x_y", "x-Y", "1x", "", "a", "b", "abbr2", "h7", "svg", "MATH", ...IMPL1_SCRML_FORMS];
    for (const n of grid) {
      expect([n, el.isKnownElementName(n)]).toEqual([n, impl1Markup(n)]);
      expect([n, el.isCustomElementName(n)]).toEqual([n, isCustomElementName(n)]);
    }
  });
});

describe("§4.1 — an unknown element is a compile error, never an inert element", () => {
  test("lowercase unknown → E-MARKUP-001", () => {
    expect(codes(P(`        <frobnicate>hi</frobnicate>`))).toEqual(["E-MARKUP-001"]);
    expect(codes(P(`        <p><x/></p>`))).toEqual(["E-MARKUP-001"]);
  });
  test("capitalised unknown → E-COMPONENT-035", () => {
    expect(codes(P(`        <Widget/>`))).toEqual(["E-COMPONENT-035"]);
  });
  test("review F1 — a capitalised tag never folds onto an SVG / MathML name (`<Unknown/>` is SVG legacy `unknown`)", () => {
    for (const t of ["Unknown", "Set", "View", "Filter", "Symbol", "Mask", "Marker", "Mrow", "Semantics"]) {
      expect([t, codes(P(`        <${t}/>`))]).toEqual([t, ["E-COMPONENT-035"]]);
    }
    // at the <program> body-top too (review probe c05)
    expect(codes(`<program>\n<Unknown/>\n</program>\n`)).toEqual(["E-COMPONENT-035"]);
  });
  test("review F1 — a capitalised HTML name is that element (§4.3: casing is irrelevant)", () => {
    clean(P(`        <Div>x</Div><SECTION>y</SECTION><Svg><g/></Svg>`));
  });
  test("review F8 — `<selectedcontent>` (WHATWG) is an element", () => {
    clean(P(`        <select><button><selectedcontent></selectedcontent></button><option>a</option></select>`));
  });
  test("§52 type-level `<User protect=…>` is refused, not emitted with protect= dropped (§14.8.9)", () => {
    const src = `<program>
    <User authority="server" table="users" protect="passwordHash">
        id: number
    </>
    <main><p>x</p></main>
</program>
`;
    // S473 D2: the unknown name AND each unenforced control on it are refused
    expect(codes(src)).toEqual(["E-COMPONENT-035", "E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("S473 D2 — `protect=` / `authority=` on an HTML or custom element is refused, never written out", () => {
    expect(codes(P(`        <div protect="secret">x</div>`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(P(`        <my-card authority="server">x</my-card>`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("S473 D2 — an unknown hyphenated name is a custom element and is emitted", () => {
    clean(P(`        <x-unknown-thing>x</x-unknown-thing>`));
  });
  test("its attributes and children are still judged", () => {
    expect(codes(P(`        <frobnicate title=@nope><blorp/></frobnicate>`))).toEqual(["E-MARKUP-001", "E-SCOPE-001", "E-MARKUP-001"]);
  });
  test("HTML (any case), SVG, MathML and custom elements compile", () => {
    clean(P(`        <section><my-widget>a</my-widget><svg><g><feGaussianBlur/><clipPath/></g></svg><math><mrow/></math><DIV>x</DIV></section>`));
  });
  test("a declaration in scope is not an unknown element", () => {
    clean(P(`        <card/>`, `    <card title:string="t"/>\n    renders <p>\${title}</p>`));
  });
});

describe("§4.15 / §24.4 — structural elements the bootstrap has not built are refused", () => {
  test("<onMount> (§6.7.1a) and <md> (§67) → E-BOOTSTRAP-UNSUPPORTED naming the §", () => {
    const r = run(P(`        <onMount>\${ hello() }</onMount>\n        <md>## hi</md>`));
    expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("§6.7.1a");
    expect(r.diags[1].message).toContain("§67");
  });
});

describe("§66.6.6 — a bare tag naming a program cell", () => {
  test("`<count/>` → E-DECL-FIELD-TAG-NEEDS-STAR (no longer an inert `<count>`)", () => {
    const r = run(P(`        <count/>`, `    let <count:int=0/>`));
    expect(r.diags.map((d) => d.code)).toEqual(["E-DECL-FIELD-TAG-NEEDS-STAR"]);
    expect(r.diags[0].message).toContain("<*count/>");
  });
  test("`let <email:string=\"\"/>` then `<email/>` → E-DECL-FIELD-TAG-NEEDS-STAR", () => {
    expect(codes(P(`        <email/>`, `    let <email:string=""/>`))).toEqual(["E-DECL-FIELD-TAG-NEEDS-STAR"]);
  });
  test("RULED S473 (review-surfaced decisions item 3) — a cell named like an element, beside that tag: refused AT THE CELL", () => {
    for (const n of ["filter", "data", "time", "title", "label", "progress", "output", "text", "view", "search", "summary", "p"]) {
      const r = run(P(`        <${n}/>`, `    let <${n}:string=""/>`));
      expect([n, r.diags.map((d) => d.code)]).toEqual([n, ["E-DECL-ELEMENT-NAME-COLLIDES"]]);
      expect(r.diags[0].message).toContain(`\`${n}\``);
    }
  });
  test("…and a cell named like an element with no colliding tag still compiles", () => {
    clean(P(`        <p>\${@filter}</p>`, `    let <filter:string="x"/>`));
  });
  test("a non-element cell name used as a tag stays E-DECL-FIELD-TAG-NEEDS-STAR (`<status/>`)", () => {
    expect(codes(P(`        <status/>`, `    let <status:string=""/>`))).toEqual(["E-DECL-FIELD-TAG-NEEDS-STAR"]);
  });
  test("`\${@count}` is the value form and compiles", () => {
    clean(P(`        <p>\${@count}</p>`, `    let <count:int=0/>`));
  });
});

describe("§66.8.2 — a named shared instance in a <program> body is refused as at file scope", () => {
  test("`<accent:swatch label=…/>` → E-BOOTSTRAP-UNSUPPORTED", () => {
    const src = P(`        <p>x</p>`, `    <swatch label:string="Brand"/>\n    renders <span>\${label}</span>\n    <accent:swatch label="Accent"/>`);
    const r = run(src);
    expect(r.diags.map((d) => d.code)).toContain("E-BOOTSTRAP-UNSUPPORTED");
    expect(r.diags.find((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED").message).toContain("§66.8.2");
  });
});

describe("§4.15 — E-NAME-COLLIDES-RESERVED", () => {
  // (`theme` is reserved too, but the parser refuses a `<theme>` opener whole first, §66.17)
  for (const n of ["each", "match", "errors", "render", "page", "md", "onMount", "Page", "Engine", "defaults"]) {
    test(`a user declaration named \`${n}\``, () => {
      const src = P(`        <p>x</p>`, `    <${n} label:string="a"/>\n    renders <p>\${label}</p>`);
      expect(codes(src)).toContain("E-NAME-COLLIDES-RESERVED");
    });
  }
  test("a non-reserved name is fine", () => {
    clean(P(`        <badge/>`, `    <badge label:string="a"/>\n    renders <p>\${label}</p>`));
  });
});

describe("§17.4 — E-CONTROL-FLOW-IN-MARKUP", () => {
  test("probe p17-cfmarkup2: `<div> if (@flag) { <p>secret</p> } </div>` is refused", () => {
    const src = P(`        <div>\n            if (@flag) {\n                <p>secret</p>\n            }\n        </div>`, `    let <flag:bool=false/>`);
    expect(codes(src)).toEqual(["E-CONTROL-FLOW-IN-MARKUP"]);
  });
  test("for / while, braced, at a run start after an element", () => {
    expect(codes(P(`        <ul><b>x</b> for (m of @ms) { <li>a</li> }</ul>`))).toEqual(["E-CONTROL-FLOW-IN-MARKUP"]);
    expect(codes(P(`        <p>while (true) { x }</p>`))).toEqual(["E-CONTROL-FLOW-IN-MARKUP"]);
  });
  test("review F4 — mid-run, after an interpolation, else / else if / switch / match / do", () => {
    const L = `    let <flag:bool=false/>\n    let <n:int=0/>`;
    for (const m of [
      `<div>Hello. if (@flag) { <p>secret</p> }</div>`,
      `<div>if (@flag) \${"x"} { <p>secret</p> }</div>`,
      `<div><b>a</b> else { <p>b</p> }</div>`,
      `<div><b>a</b> } else if (@flag) { <p>b</p> }</div>`,
      `<div>switch (@n) { <p>a</p> }</div>`,
      `<div>match @n { <p>a</p> }</div>`,
      `<div>do { <p>a</p> } while (@flag)</div>`,
    ]) expect([m, codes(P(`        ${m}`, L))]).toEqual([m, ["E-CONTROL-FLOW-IN-MARKUP"]]);
  });
  test("prose and braceless forms are not refused (the `{` is the discriminator, S383)", () => {
    clean(P(`        <p>Tap if (and only if) ready</p>`));
    clean(P(`        <p>for (more) see the docs, or else ask. I do. A match is lit.</p>`));
    clean(P(`        <p>if (you ask) we deliver. for (all) of us.</p>`));
    clean(P(`        <p>Notify if (and only if) asked.</p>`));
    clean(P(`        <p>iffy (x) { y }</p>`));
  });
  test("`<pre>` / `<code>` are display text (§4.17)", () => {
    clean(P(`        <pre>if (x) { y }</pre>`));
  });
});

describe("review F6 — S473 D1 / D2 on `<slot>`", () => {
  test("`protect=` on a `<slot>` is refused, not dropped", () => {
    const src = P(`        <card/>`, `    <card title:string="t"/>\n    renders <div><slot protect="x"/></div>`);
    expect(codes(src)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});

describe("review F9 — a hyphenated word value", () => {
  test("`class=foo-bar` with undeclared names: E-SCOPE-001 only, not also E-ATTR-UNQUOTED-OPERATOR", () => {
    expect(codes(P(`        <p class=foo-bar>x</p>`))).toEqual(["E-SCOPE-001", "E-SCOPE-001"]);
  });
});

describe("§17.7.2 — <each> shape", () => {
  test("no in= / of= → E-EACH-ITER-SHAPE", () => {
    expect(codes(P(`        <ul><each><li>a</li></each></ul>`))).toEqual(["E-EACH-ITER-SHAPE"]);
  });
  test("an empty body → E-EACH-EMPTY-BODY", () => {
    expect(codes(P(`        <ul><each in=@xs></each></ul>`, `    let <xs:int[]=([1])/>`))).toContain("E-EACH-EMPTY-BODY");
  });
});

describe("§5.2 — E-ATTR-UNQUOTED-OPERATOR", () => {
  test("probe p17-bareop2: `if=@a&&@b`, `show=@n==3`", () => {
    const src = P(`        <p if=@a&&@b>both</p>\n        <p show=@n==3>eq</p>`, `    let <a:bool=false/>\n    let <b:bool=false/>\n    let <n:int=0/>`);
    expect(codes(src)).toEqual(["E-ATTR-UNQUOTED-OPERATOR", "E-ATTR-UNQUOTED-OPERATOR"]);
  });
  test("a non-condition attribute too; the parenthesized form compiles", () => {
    expect(codes(P(`        <p title=@s+@s>x</p>`, `    let <s:string="a"/>`))).toEqual(["E-ATTR-UNQUOTED-OPERATOR"]);
    clean(P(`        <p if=(@a && @b)>both</p>`, `    let <a:bool=false/>\n    let <b:bool=false/>`));
  });
});

describe("S473 D26 — `fixed` is retired: refused by name, never written to the DOM", () => {
  test("probe p15-fixed: `fixed` in a renders template → E-BOOTSTRAP-UNSUPPORTED naming D26", () => {
    const r = run(P(`        <card title="x"/>`, `    <card title:string/>\n    renders <div class="card"><div class="foot" fixed><p>f</p></div></div>`));
    expect(r.diags.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("S473 D26");
  });
  test("and outside a declaration too", () => {
    expect(codes(P(`        <div fixed>x</div>`))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });
});
