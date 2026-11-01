// foreign-content-s474.test.js — s474 lane boot-gate-await-mathml: the bootstrap half of the S474
// backfill review's three impl#1 HIGHs (~/.cache/scrml/review/s474-backfill/security.md).
//
// H3 (a HOLE here too, of the correctness kind): a template's content is parsed where the page holds
// it — a `<template>` in the head, an HTML context. Content inserted into an `<svg>` / a `<math>` (an
// `if=` arm, an `<each>` / `${ for … lift }` row, a component's renders, slot content) was built as
// HTML (`<text>` / `<mi>` an HTMLUnknownElement) and never rendered: in Chromium a gate whose test was
// TRUE showed nothing (the gate itself held — the wrong password never showed the gated text). The
// printer now records each template's parse context and prints a foreign one inside the elements that
// make the browser's own parser build it there (print.scrml `childNs` / `wrapNs`, `data-scrml-ns`);
// the runtime's `template()` unwraps the clone. What it RENDERS is pinned in real Chromium by
// foreign-content-chromium-s474.test.js (opt-in); this file pins the printed shape, the runtime's
// fail-closed unwrap, and the H1 / H2 shapes the bootstrap already refuses (guards).
//
// H1 — `return match check?.(p) { … }` (an OPTIONAL server call as a match subject) — and H2 — a
// nested function's parameter default that is a server call — are SAFE on the bootstrap: `?.` is
// refused by name (§42.3.6, refusals.scrml), a parameter default is not in the bootstrap, and a
// nested function declaration does not parse; every shape fails the compile. The guards keep it so.

import { describe, test, expect, beforeAll } from "bun:test";
import { join } from "node:path";
import { loadM2, frontEnd } from "./harness.js";
import "../slice-m1/load-program.js";   // registers happy-dom (the runtime's `document`)
import { G, FOREIGN, COMPONENTS, gateProgram } from "./foreign-content-fixtures.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 120000 });

const rt = await import(join(import.meta.dir, "..", "slice-m1", "runtime", "runtime.js"));

const SQ = "?" + "{";
function print(src) {
  const r = frontEnd(mods, [{ path: "app.scrml", src }]);
  expect(r.diags.filter((d) => d.severity === "error" || d.code.startsWith("E-")).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  const out = mods.print.printProgram(r.core, "app.client.js", "scrml-runtime.js");
  // the shape hash (r1, defence in depth) is pinned by its own tests below; the printed-shape tests read past it
  return { ...out, html: out.html.replace(/ data-scrml-shape="\d+"/g, "") };
}

/** Every `<template …>` open tag of the page, with what directly follows it. */
function templates(html) {
  return [...html.matchAll(/<template id="([^"]*)"((?: [a-z-]+="[^"]*")*)>(<[a-zA-Z-]+|[^<]{0,1})/g)].map((m) => ({ id: m[1], attrs: m[2], first: m[3] }));
}

describe("H3 — a template inserted into foreign content is printed in its parse context", () => {
  const expectNs = {
    m_mi: ["math", "<math"], m_mrow: ["math", "<math"], m_mtext: ["math", "<math"], m_ifElse: ["math", "<math"],
    m_each: ["math", "<math"], s_text: ["svg", "<svg"], s_g: ["svg", "<svg"], s_fo: ["svg", "<svg"],
    s_ifElse: ["svg", "<svg"], s_each: ["svg", "<svg"], s_gather: ["svg", "<svg"],
  };
  for (const [name, [ns, wrap]] of Object.entries(expectNs)) {
    test(`${name}: every arm / row template is data-scrml-ns="${ns}" and opens with ${wrap}>`, () => {
      const out = print(gateProgram(FOREIGN[name]));
      const sub = templates(out.html).filter((t) => t.id !== "scrml:program");
      expect(sub.length).toBeGreaterThan(0);
      for (const t of sub) {
        expect(t.attrs).toBe(` data-scrml-ns="${ns}"`);
        expect(t.first).toBe(wrap);
      }
    });
  }
  test("an HTML integration point's children stay HTML: `<foreignObject><p if=>` prints no wrapper", () => {
    const sub = templates(print(gateProgram(FOREIGN.s_foInner)).html).filter((t) => t.id !== "scrml:program");
    expect(sub.length).toBe(1);
    expect(sub[0].attrs).toBe("");
  });
  test("a MathML text integration point (`<mi><b if=>`): math-text — `<math><mi>` builds `<b>` as HTML, as inline", () => {
    const out = print(gateProgram(FOREIGN.m_textPoint));
    expect(out.html).toContain(`data-scrml-ns="math-text"><math><mi><b>LOGGED IN</b></mi></math></template>`);
  });
  test("a MathML text integration point's mglyph child keeps MathML: `<mi>` wrapper (math-text)", () => {
    const out = print(gateProgram(`<math><mi><mglyph ${G}/></mi></math>`));
    const sub = templates(out.html).filter((t) => t.id !== "scrml:program");
    expect(sub.map((t) => t.attrs)).toEqual([` data-scrml-ns="math-text"`]);
    expect(out.html).toContain(`data-scrml-ns="math-text"><math><mi><mglyph`);
  });
  test("annotation-xml: a static HTML encoding is an HTML context, none is `annot`", () => {
    const html = print(gateProgram(`<math><annotation-xml encoding="text/html"><p ${G}>x</p></annotation-xml></math>`)).html;
    expect(templates(html).filter((t) => t.id !== "scrml:program").map((t) => t.attrs)).toEqual([""]);
    const annot = print(gateProgram(`<math><annotation-xml><mi ${G}>x</mi></annotation-xml></math>`)).html;
    expect(annot).toContain(`data-scrml-ns="annot"><math><annotation-xml><mi>x</mi></annotation-xml></math></template>`);
  });
  test("`<each if=>` (in `<svg>` or not) stays refused by name", () => {
    const r = frontEnd(mods, [{ path: "app.scrml", src: gateProgram(`<svg><each ${G} in=@ws as w><text>\${w}</text></each></svg>`) }]);
    expect(r.diags.filter((d) => d.code.startsWith("E-")).map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("`<each if=>`");
  });
  test("the gate on the foreign root itself (`<svg if=>`, `<math if=>`): an HTML-context template, as before", () => {
    for (const name of ["s_svg", "m_math"]) {
      const sub = templates(print(gateProgram(FOREIGN[name])).html).filter((t) => t.id !== "scrml:program");
      expect(sub.map((t) => t.attrs)).toEqual([""]);
    }
  });
  test("an HTML-only program prints exactly as before: no marker, no wrapper, no variant render", () => {
    const out = print(gateProgram(`<p ${G}>LOGGED IN</p>`));
    expect(out.html).not.toContain("data-scrml-ns");
    expect(out.js).not.toMatch(/render_\w+\$/);
  });
});

describe("H3 — a declaration's renders print once per context it is used in", () => {
  const comp = (name) => print(gateProgram(COMPONENTS[name][1], COMPONENTS[name][0]));
  test("a `<g>` icon used inside `<svg>`: its renders are the svg variant only", () => {
    const out = comp("c_svgUse");
    expect(out.html).toMatch(/<template id="scrml:icon~[0-9a-f]+@svg" data-scrml-ns="svg"><svg><g><text>LOGGED IN<\/text><\/g><\/svg><\/template>/);
    expect(out.html).not.toMatch(/<template id="scrml:icon~[0-9a-f]+">/);
    expect(out.js).toMatch(/render_icon_[0-9a-f]+\$svg\(/);
  });
  test("used in `<svg>` AND in `<p>`: two renders, two templates, each site calls its own", () => {
    const out = comp("c_svgUseMixed");
    expect(out.html).toMatch(/<template id="scrml:icon~[0-9a-f]+@svg" data-scrml-ns="svg"><svg><text>/);
    expect(out.html).toMatch(/<template id="scrml:icon~[0-9a-f]+"><text>/);
    expect(out.js).toMatch(/function render_icon_[0-9a-f]+\$svg\(/);
    expect(out.js).toMatch(/function render_icon_[0-9a-f]+\(/);
  });
  test("slot content takes the context of the declaration's `<slot/>` (`renders <svg><slot/></svg>`)", () => {
    const out = comp("c_slotSvg");
    const slot = templates(out.html).filter((t) => t.id.endsWith(".slot"));
    expect(slot.map((t) => t.attrs)).toEqual([` data-scrml-ns="svg"`]);
  });
  test("a `<mi>` declaration used inside `<math>`: the math variant", () => {
    expect(comp("c_mathUse").html).toMatch(/@math" data-scrml-ns="math"><math><mi>LOGGED IN<\/mi><\/math>/);
  });
});

describe("H3 — the runtime's `template()` unwraps the clone, and fails closed", () => {
  const install = (html) => {
    document.head.insertAdjacentHTML("beforeend", html);
  };
  test("an unmarked template clones as before; a marked one yields the wrapper's children, not the wrapper", () => {
    install(`<template id="t-plain"><p>a</p></template><template id="t-svg" data-scrml-ns="svg"><svg><text>a</text><text>b</text></svg></template>`);
    expect([...rt.template("t-plain").childNodes].map((n) => n.nodeName.toLowerCase())).toEqual(["p"]);
    const f = rt.template("t-svg");
    expect([...f.childNodes].map((n) => n.nodeName.toLowerCase())).toEqual(["text", "text"]);
    // a fresh clone each time — the template keeps its content
    expect(rt.template("t-svg").childNodes.length).toBe(2);
  });
  test("two wrapper levels for math-text / annot", () => {
    install(`<template id="t-mt" data-scrml-ns="math-text"><math><mi><mglyph></mglyph></mi></math></template>`);
    expect([...rt.template("t-mt").childNodes].map((n) => n.nodeName.toLowerCase())).toEqual(["mglyph"]);
  });
  test("an unknown marker, or a wrapper level holding other than exactly one node, throws", () => {
    install(`<template id="t-bad" data-scrml-ns="xml"><svg></svg></template><template id="t-two" data-scrml-ns="svg"><svg></svg><p>out</p></template><template id="t-proto" data-scrml-ns="toString"><svg></svg></template>`);
    expect(() => rt.template("t-bad")).toThrow(/unknown data-scrml-ns/);
    expect(() => rt.template("t-proto")).toThrow(/unknown data-scrml-ns/);
    expect(() => rt.template("t-two")).toThrow(/exactly one node/);
  });
});

// ---- H1 / H2 guards: SAFE on the base, kept so ----
const SERVER = `<program db="./app.db">
    type AuthErr:enum = { Denied(reason: string), Gone }
    type Ok:struct = { ok: int }
    type Who:struct = { role: string }
    let <msg:string="init"/>
    function check(p: string)! AuthErr {
        const r: Ok = ${SQ}\`SELECT 1 AS ok\`}.get() !{ _ :> { fail .Gone; } };
        if (p != "secret") fail .Denied("bad");
        return true;
    }
    function roleOf(p: string) -> Who {
        const none: Who = { role: "none" };
        const adm: Who = { role: "admin" };
        const r: Ok = ${SQ}\`SELECT 1 AS ok\`}.get() !{ _ :> { return none; } };
        if (p != "secret") return none;
        return adm;
    }
`;
const SERVER_TAIL = `    function go(p: string) { @msg = login(p); }
    <main>
        <button id="wrong" onclick={ go("wrong"); }>go</button>
        <button id="right" onclick={ go("secret"); }>go</button>
        <p id="out">\${@msg}</p>
    </main>
</program>
`;
const M = `{ .Denied(r) :> "rejected", .Gone :> "rejected", _ :> "LOGGED IN" }`;
const login = (body) => SERVER + `    function login(p: string) -> string {\n${body}\n    }\n` + SERVER_TAIL;
const errorsOf = (src) => frontEnd(mods, [{ path: "app.scrml", src }]).diags.filter((d) => d.code.startsWith("E-"));

describe("H1 guard — an optional (`?.`) server call as a match subject is refused by name, every position", () => {
  const SHAPES = {
    returnMatch: `        return match check?.(p) ${M};`,
    constMatch: `        const v: string = match check?.(p) ${M};\n        return v;`,
    constUntyped: `        const v = match check?.(p) ${M};\n        return v;`,
    parenMatch: `        return (match check?.(p) ${M});`,
    memberSubject: `        return match roleOf?.(p).role { "admin" :> "LOGGED IN", _ :> "rejected" };`,
    parenMember: `        return match (roleOf?.(p)).role { "admin" :> "LOGGED IN", _ :> "rejected" };`,
    ifTest: `        if (roleOf?.(p).role == "admin") return "LOGGED IN";\n        return "rejected";`,
    bangHandled: `        const ok: boolean = check?.(p) !{ _ :> false };\n        if (ok) return "LOGGED IN";\n        return "rejected";`,
  };
  for (const [name, body] of Object.entries(SHAPES)) {
    test(name, () => {
      const errs = errorsOf(login(body));
      expect(errs.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
      expect(errs[0].message).toContain("`?. optional chaining` (§42.3.6)");
    });
  }
  test("control: the plain (awaited) subject compiles clean", () => {
    expect(errorsOf(login(`        return match check(p) ${M};`))).toEqual([]);
  });
});

describe("H2 guard — a server call in a parameter default never compiles", () => {
  const SHAPES = {
    nestedMatchDefault: login(`        function h(v: string = match check(p) ${M}) -> string { return v; }\n        return h();`),
    nestedFnDefault: login(`        fn h(v: string = match check(p) ${M}) -> string { return v; }\n        return h();`),
    nestedPlainDefault: login(`        function h(v: Who = roleOf(p)) -> string { if (v.role == "admin") return "LOGGED IN"; return "rejected"; }\n        return h();`),
    lambdaDefault: login(`        const h = (v: string = match check(p) ${M}) => v;\n        return h();`),
    topMatchDefault: SERVER + `    function h(p: string, v: string = match check(p) ${M}) -> string { return v; }\n    function login(p: string) -> string {\n        return h(p);\n    }\n` + SERVER_TAIL,
    topPlainDefault: SERVER + `    function h(p: string, v: Who = roleOf(p)) -> string { if (v.role == "admin") return "LOGGED IN"; return "rejected"; }\n    function login(p: string) -> string {\n        return h(p);\n    }\n` + SERVER_TAIL,
  };
  for (const [name, src] of Object.entries(SHAPES)) {
    test(name, () => {
      expect(errorsOf(src).length).toBeGreaterThan(0);
    });
  }
  test("a top-level default is refused by name (`a parameter the bootstrap cannot read`)", () => {
    const errs = errorsOf(SHAPES.topPlainDefault).filter((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED");
    expect(errs.some((d) => d.message.includes("a default value"))).toBe(true);
  });
});
