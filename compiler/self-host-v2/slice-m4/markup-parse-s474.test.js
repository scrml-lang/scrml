// markup-parse-s474.test.js — s474 lane boot-gate-await-mathml, round 1 (the review of #1727,
// ~/.cache/scrml/review/s474-1727/review.md F1–F3): SPEC §24.5, markup the HTML parser RESTRUCTURES.
//
// The bootstrap addresses a template's holes (a `show=` element, an `if=` marker, a `${}` text) by
// child-index path over the tree as WRITTEN. The browser's parser does not always build that tree: it
// ejects an HTML "breakout" tag from `<svg>` / `<math>`, closes an open `<p>` at a `<div>`, fosters a
// `<span>` out of a `<table>`, closes an `<a>` at a nested `<a>`. Every path after the change then names
// the wrong node; in Chromium `show=` hid the wrong element and the secret was visible at first paint
// with the wrong password (F3), and a throw from the foreign-content wrapper starved the rest of the
// reactive flush, so a gate closing in the same write never closed (F1). This file pins:
//   - E-HTML-FOREIGN-BREAKOUT / E-HTML-PARSER-REPAIR on every reproduced shape and the rule lists,
//     and their absence on the nestings the parser keeps (guards against over-refusal);
//   - the runtime's flush: one effect's throw no longer strands the effects queued behind it;
//   - the runtime's shape check: a template the parser restructured is never mounted.
// What these do in a REAL browser is foreign-content-chromium-s474.test.js (opt-in).

import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "node:path";
import { loadM2, frontEnd } from "./harness.js";
import "../slice-m1/load-program.js";   // registers happy-dom (the runtime's `document`)
import { gateProgram } from "./foreign-content-fixtures.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const rt = await import(join(import.meta.dir, "..", "slice-m1", "runtime", "runtime.js"));

const S = `show=(@pw == "secret")`;
const G = `if=(@pw == "secret")`;
const errs = (markup, top = "") => frontEnd(mods, [{ path: "app.scrml", src: gateProgram(markup, top) }]).diags.filter((d) => d.code.startsWith("E-"));
const codes = (markup, top) => errs(markup, top).map((d) => d.code);
const BRK = "E-HTML-FOREIGN-BREAKOUT";
const REP = "E-HTML-PARSER-REPAIR";

describe("E-HTML-FOREIGN-BREAKOUT — an HTML element as a child of SVG / MathML content", () => {
  // the review's reproductions (F1 starvation, F2 mount crash, F3 misaddressed show=)
  const REPROS = {
    showAfterSvgP: `<svg><p>x</p></svg><div ${S}>SECRET</div>`,
    fontColor: `<svg><font color="red">x</font></svg><span ${S}>SECRET</span>`,
    divSvgP: `<div><svg><p>x</p></svg><span ${S}>SECRET</span></div>`,
    svgTable: `<svg><table><tbody><tr><td>x</td></tr></tbody></table></svg><span ${S}>SECRET</span>`,
    htmlArm: `<div if=(@pw != "")><svg><p>x</p></svg><span ${S}>SECRET</span></div>`,
    mathP: `<math><p>x</p></math><span ${S}>SECRET</span>`,
    starveIf: `<svg><g if=(@pw == "wrong")><p>bye</p></g></svg><p ${G}>SECRET</p>`,
    starveElse: `<svg><g if=(@pw != "wrong")><text y="20">hi</text></g><g else><p>bye</p></g></svg><p ${G}>SECRET</p>`,
    armRoot: `<svg><p ${G}>SECRET</p></svg>`,
    eachRow: `<svg><each in=@ws as w><p>\${w}</p></each></svg>`,
    gatherRow: `<svg>\${ for (w of @ws) { lift <p>\${w}</p>; } }</svg>`,
    annot: `<math><annotation-xml><p>x</p></annotation-xml></math>`,
    annotPadded: `<math><annotation-xml encoding=" text/html"><p>x</p></annotation-xml></math>`,
    voidName: `<svg><source/><text ${S} y="20">SECRET</text></svg>`,
  };
  for (const [name, markup] of Object.entries(REPROS)) {
    test(name, () => expect(codes(markup)).toEqual([BRK]));
  }
  test("every HTML §13.2.6.5 breakout tag, in `<svg>` and in `<math>`; `font` only with color / face / size", () => {
    const tags = ["b", "big", "blockquote", "br", "center", "code", "dd", "div", "dl", "dt", "em", "embed", "h1", "h6",
                  "hr", "i", "img", "li", "listing", "menu", "nobr", "ol", "p", "pre", "ruby", "s", "small", "span",
                  "strong", "strike", "sub", "sup", "table", "tt", "u", "ul", "var"];
    for (const t of tags) {
      const el = ["br", "embed", "hr", "img"].includes(t) ? `<${t}/>` : t === "table" ? `<table></table>` : `<${t}>x</${t}>`;
      for (const root of ["svg", "math"]) expect({ t, root, c: codes(`<${root}>${el}</${root}>`) }).toEqual({ t, root, c: [BRK] });
    }
    for (const a of ["color", "face", "size"]) expect(codes(`<svg><font ${a}="x">x</font></svg>`)).toEqual([BRK]);
  });
  test("a declaration used inside `<svg>` whose renders hold a breakout tag: reported AT THE USE", () => {
    const top = `    <lbl n:int/>\n    renders <span>bye</span>`;
    const e = errs(`<svg><lbl n=1 if=(@pw == "wrong")/></svg><p ${G}>SECRET</p>`, top);
    expect(e.map((d) => d.code)).toEqual([BRK]);
    expect(e[0].message).toContain("`<lbl>` is used inside SVG content");
    // the same declaration used in HTML is fine
    expect(codes(`<p><lbl n=1/></p>`, top)).toEqual([]);
  });
  test("slot content placed in a `<slot/>` that sits inside `<svg>`", () => {
    expect(codes(`<frame n=1><p>x</p></frame>`, `    <frame n:int/>\n    renders <svg><slot/></svg>`)).toEqual([BRK]);
    expect(codes(`<frame n=1><text>x</text></frame>`, `    <frame n:int/>\n    renders <svg><slot/></svg>`)).toEqual([]);
  });
  test("guards — the HTML integration points keep HTML children; plain SVG / MathML stays clean", () => {
    for (const m of [
      `<svg><foreignObject width="9" height="9"><p>x</p><div>y</div></foreignObject></svg>`,
      `<svg><desc><b>x</b></desc></svg>`,
      `<math><mi><p>x</p></mi></math>`,
      `<math><mtext><span>x</span></mtext></math>`,
      `<math><annotation-xml encoding="text/html"><p>x</p></annotation-xml></math>`,
      `<math><annotation-xml encoding="application/xhtml+xml"><div>x</div></annotation-xml></math>`,
      `<svg><font>x</font></svg>`,
      `<svg><g><text y="9">x</text><a href="/x"><text>y</text></a></g></svg>`,
      `<math><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></math>`,
      `<svg><foreignObject width="9" height="9"><svg><text>x</text></svg></foreignObject></svg>`,
    ]) expect({ m, c: codes(m) }).toEqual({ m, c: [] });
  });
});

describe("E-HTML-PARSER-REPAIR — an HTML nesting the \"in body\" / \"in table\" rules restructure", () => {
  const REPROS = {
    pDiv: `<p><div>x</div></p><span ${S}>SECRET</span>`,
    pSpanDiv: `<p><span><div>x</div></span></p>`,
    pP: `<p><p>x</p></p>`,
    pUl: `<p><ul><li>x</li></ul></p>`,
    pTable: `<p><table><tbody><tr><td>x</td></tr></tbody></table></p>`,
    tableSpan: `<table><span>x</span><tbody><tr><td>a</td></tr></tbody></table><span ${S}>SECRET</span>`,
    tableTr: `<table><tr><td>a</td></tr></table>`,
    tableTd: `<table><td>a</td></table>`,
    tableCol: `<table><col/></table>`,
    tbodyTd: `<table><tbody><td>a</td></tbody></table>`,
    trDiv: `<table><tbody><tr><div>a</div></tr></tbody></table>`,
    tableText: `<table>x<tbody><tr><td>a</td></tr></tbody></table>`,
    trText: `<table><tbody><tr>x<td>a</td></tr></tbody></table>`,
    aA: `<a href="/x"><a href="/y">x</a></a><span ${S}>SECRET</span>`,
    aSpanA: `<a href="/x"><span><a href="/y">x</a></span></a>`,
    liLi: `<ul><li>a<li>b</li></li></ul>`,
    liDivLi: `<ul><li><div><li>b</li></div></li></ul>`,
    ddDt: `<dl><dd>a<dt>b</dt></dd></dl>`,
    hH: `<h1><h2>x</h2></h1>`,
    buttonButton: `<button><button>x</button></button>`,
    optionOption: `<select><option>a<option>b</option></option></select>`,
    rtRt: `<ruby>a<rt>b<rt>c</rt></rt></ruby>`,
    bodyTag: `<body>x</body>`,
  };
  for (const [name, markup] of Object.entries(REPROS)) {
    test(name, () => expect(codes(markup)).toEqual([REP]));
  }
  test("guards — nestings the parser keeps compile clean", () => {
    for (const m of [
      `<p><span>x</span><b>y</b><a href="/x">z</a></p>`,
      `<table><caption>c</caption><colgroup><col/></colgroup><thead><tr><th>h</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table>`,
      `<table>\n  <tbody>\n    <tr>\n      <td>a</td>\n    </tr>\n  </tbody>\n</table>`,
      `<ul><li>a<ul><li>b</li></ul></li></ul>`,
      `<dl><dt>a</dt><dd>b<dl><dd>c</dd></dl></dd></dl>`,
      `<form><div><form><input/></form></div></form>`,                  // a template keeps a nested form
      `<a href="/x"><table><tbody><tr><td><a href="/y">y</a></td></tr></tbody></table></a>`,   // td is a marker
      `<p><button><div>x</div></button></p>`,                          // button bounds the <p>'s scope
      `<div><p>a</p><div>b</div></div>`,
      `<h1><span>x</span></h1><h2>y</h2>`,
      `<ruby>a<rt>b</rt><rp>(</rp></ruby>`,
      `<select><option>a</option><optgroup><option>b</option></optgroup></select>`,
    ]) expect({ m, c: codes(m) }).toEqual({ m, c: [] });
  });
  test("each template is parsed apart: an `if=` arm, an `<each>` row and a component root are not children of the written parent", () => {
    for (const m of [
      `<p><div ${G}>SECRET</div></p>`,
      `<table><tbody><each in=@ws as w><tr><td>\${w}</td></tr></each></tbody></table>`,
      `<table><tbody><tr ${G}><td>SECRET</td></tr></tbody></table>`,
    ]) expect({ m, c: codes(m) }).toEqual({ m, c: [] });
    expect(codes(`<p><card n=1/></p>`, `    <card n:int/>\n    renders <div>c</div>`)).toEqual([]);
    expect(codes(`<table><tbody><row n=1/></tbody></table>`, `    <row n:int/>\n    renders <tr><td>r</td></tr>`)).toEqual([]);
    // but a fault INSIDE the arm is still one
    expect(codes(`<div ${G}><p><div>x</div></p></div>`)).toEqual([REP]);
  });
});

describe("the runtime's flush — one effect's throw never strands the effects queued behind it (review F1)", () => {
  test("an effect that throws BEFORE a gate-closing effect in the same flush: the gate still closes; the write still fails", () => {
    const scope = new rt.Scope(null);
    const pw = rt.cell("secret");
    const seen = [];
    rt.effect(scope, () => { if (pw.get() === "wrong") throw new Error("boom (a template the parser restructured)"); });
    let gateOpen = null;
    rt.effect(scope, () => { gateOpen = pw.get() === "secret"; seen.push(pw.get()); });
    expect(gateOpen).toBe(true);
    expect(() => rt.batch(() => pw.set("wrong"))).toThrow(/boom/);
    expect(gateOpen).toBe(false);          // the gate closed in the same write
    expect(seen).toEqual(["secret", "wrong"]);
    // and the queue is not left holding stale work: the next write runs normally
    rt.batch(() => pw.set("secret"));
    expect(gateOpen).toBe(true);
  });
  test("two throws in one flush: the first is rethrown, every other effect still runs", () => {
    const scope = new rt.Scope(null);
    const c = rt.cell(0);
    let last = -1;
    rt.effect(scope, () => { if (c.get() === 1) throw new Error("first"); });
    rt.effect(scope, () => { if (c.get() === 1) throw new Error("second"); });
    rt.effect(scope, () => { last = c.get(); });
    const reported = [];
    const saved = globalThis.reportError;
    globalThis.reportError = (e) => reported.push(String(e.message));
    try {
      expect(() => rt.batch(() => c.set(1))).toThrow(/first/);
    } finally {
      globalThis.reportError = saved;
    }
    expect(last).toBe(1);
    expect(reported).toEqual(["second"]);
  });
});

describe("the runtime's shape check — a template the parser restructured is never mounted (SPEC §24.5 item 3)", () => {
  const install = (html) => document.head.insertAdjacentHTML("beforeend", html);
  test("the printer's `data-scrml-shape` matches what the runtime hashes from the parsed template", () => {
    const r = frontEnd(mods, [{ path: "app.scrml", src: gateProgram(`<svg><text ${G}>LOGGED IN</text></svg><table><tbody><tr><td>\${@pw}</td></tr></tbody></table><ul><li ${S}>x</li></ul>`) }]);
    const out = mods.print.printProgram(r.core, "app.client.js", "scrml-runtime.js");
    const tpls = [...out.html.matchAll(/<template id="([^"]+)"[^>]*data-scrml-shape="(\d+)"/g)];
    expect(tpls.length).toBeGreaterThan(1);
    // install under fresh ids, then clone each through template(): no throw
    const html = out.html.match(/<template[\s\S]*<\/template>/)[0].replaceAll('id="scrml:', 'id="t474-ok-');
    install(html);
    for (const [, id] of tpls) expect(() => rt.template(id.replace("scrml:", "t474-ok-"))).not.toThrow();
  });
  test("a restructured template throws instead of mounting; an unchanged one with the same id clones", () => {
    // `<p><div>` as WRITTEN is p>div (hash of "0:p;1:div;"); the parser builds p, div as siblings (and an empty p)
    const written = rt.shapeHash((() => { const d = document.createElement("div"); const p = document.createElement("p"); p.appendChild(document.createElement("div")); d.appendChild(p); return d; })());
    install(`<template id="t474-moved" data-scrml-shape="${written}"><p>a</p><div>b</div></template>`);
    expect(() => rt.template("t474-moved")).toThrow(/restructured/);
    install(`<template id="t474-kept" data-scrml-shape="${written}"><p><span>a</span></p></template>`);
    expect(() => rt.template("t474-kept")).toThrow(/restructured/);   // span is not div: a different shape
    const same = rt.shapeHash((() => { const d = document.createElement("div"); const p = document.createElement("p"); p.appendChild(document.createElement("span")); d.appendChild(p); return d; })());
    install(`<template id="t474-same" data-scrml-shape="${same}"><p><span>a</span>text</p></template>`);
    expect(() => rt.template("t474-same")).not.toThrow();            // text is not part of the shape
  });
  test("an RCDATA / raw-text element's children are not part of the shape (a `${}` marker in `<textarea>` is text in a browser)", () => {
    const r = frontEnd(mods, [{ path: "app.scrml", src: gateProgram(`<textarea id="ta">\${@pw}</textarea><span ${S}>SECRET</span>`) }]);
    const out = mods.print.printProgram(r.core, "app.client.js", "scrml-runtime.js");
    install(out.html.match(/<template[\s\S]*<\/template>/)[0].replaceAll('id="scrml:', 'id="t474-ta-'));
    // happy-dom builds the marker as a comment child of <textarea>; Chromium builds text — neither is walked
    expect(() => rt.template("t474-ta-program")).not.toThrow();
  });
});
