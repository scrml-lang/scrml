// meta-s481.test.js — s481 (s481-boot-meta): `^{}` meta blocks in the bootstrap, phases 0 + 1
// (compiler/self-host-v2/meta.scrml, emit-gate.scrml; parse.scrml parseMetaExpr / parseMetaNode /
// parseFragment).
//
// Rulings: ruling:user-voice-scrml.md S480 "⭐ RULED — bootstrap census build order" item 2 (build
// `^{}` after Track M) and ruling:user-voice-scrml.md-S481-meta-four (all four items).
//
// Pinned here:
//   1. every static code fires on its own fault, and only its own (§22.11): E-META-001 (§22.12
//      allow-list), -002, -003, -005, -006, -007, -009, -010; a block that fails is never ALSO refused
//      as unsupported;
//   2. compile-time evaluation (the interpreter): emit / emit.raw / reflect, the method surface,
//      E-META-EVAL-001 (an unevaluable form, a host failure, the step and depth bounds — deterministic);
//   3. the splice: E-META-EVAL-002 (re-parse, the gate, a logic position), E-SCRIPT-001 from emitted
//      output, spans rewritten to the block;
//   4. a runtime block is refused by name (phase 2 is not built);
//   5. DRIFT: emit-gate.scrml is impl#1's markup-attr-allow-list.js + the document member table, on
//      a grid of inputs;
//   6. DIFFERENTIAL: compile-time bodies over the corpus method surface render the same markup under
//      impl#1 (its JS realm) and the bootstrap (its interpreter).

import { describe, test, expect, beforeAll } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Window } from "happy-dom";
import { loadM2 } from "./harness.js";
import { frontEndStdlib } from "./lowered.js";
import { compileScrml } from "../../src/api.js";
import * as A from "../../src/markup-attr-allow-list.js";
import { _SCRML_EMIT_DOCUMENT_MEMBERS } from "../../src/dom-named-property-members.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 180000 });

const run = (src) => frontEndStdlib(mods, [{ path: "m.scrml", src }], "m.scrml");
const P = (body) => `<program>\n${body}\n</program>\n`;
const errs = (r) => r.diags.filter((d) => d.severity === "Error").map((d) => d.code);

// ---------------------------------------------------------------------------
// 1. static codes — each on its own fault, alone
// ---------------------------------------------------------------------------
const STATIC = [
  ["E-META-001 free host name", P(`^{ console.log("hi"); meta.emit("<p>x</p>"); }`), ["E-META-001"]],
  ["E-META-001 refused member", P(`^{ const F = emit.constructor; emit("<p>x</p>"); }`), ["E-META-001"]],
  ["E-META-001 computed key", P(`^{ const k = "constr" + "uctor"; const F = emit[k]; emit("<p>x</p>"); }`), ["E-META-001"]],
  ["E-META-001 bare cell name", P(`    let <count:int=0/>\n<div>^{ emit("<p>" + count + "</p>"); }</div>`), ["E-META-001"]],
  // the source const is ALSO refused by the analysis (`globalThis` is no scrml name); the block's own fault is E-META-001
  ["E-META-001 captured const holds a host name", P(`    const k = globalThis;\n<div>^{ emit("<p>" + k + "</p>"); }</div>`), ["E-META-001", "E-SCOPE-001"]],
  ["E-META-002 invalid token", P(`^{\n  meta.emit("start");\n  )\n}`), ["E-META-002"]],
  ["E-META-003 reflect(Unknown)", P(`^{ const x = reflect(NoSuchType); emit("<p>x</p>"); }`), ["E-META-003"]],
  ["E-META-005 emit + a runtime value", P(`^{ emit.raw("<p>hi</p>"); meta.set("x", 1); }`), ["E-META-005"]],
  ["E-META-005 emit + a cell", P(`    let <n:int=0/>\n<div>^{ emit("<p>" + @n + "</p>"); }</div>`), ["E-META-005"]],
  ["E-META-006 lift", P(`^{ lift(1); emit("<p>x</p>"); }`), ["E-META-006"]],
  ["E-META-007 ?{} in a runtime block", P(`^{ let r = ?{ \`SELECT 1\` }; meta.emit("" + r); }`), ["E-META-007"]],
  ["E-META-009 nested in compile-time", P(`    type Color:enum = { Red, Green }\n^{ reflect(Color); ^{ emit("<span>inner</span>"); } }`), ["E-META-009"]],
  ["E-META-010 compiler.*", P(`^{ emit("<p>" + compiler.version + "</p>"); }`), ["E-META-010"]],
];

describe("s481 — the static checks (§22.11, §22.12)", () => {
  for (const [name, src, codes] of STATIC) {
    test(name, () => {
      const r = run(src);
      expect([...new Set(errs(r))].sort()).toEqual(codes);
    });
  }
  test("a block that fails a static check is not also refused as unsupported", () => {
    for (const [, src] of STATIC) expect(errs(run(src))).not.toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
  test("ruling S481-meta-four item 1: a literal reflect(T) beside a runtime value is a RUNTIME block, not E-META-005", () => {
    const r = run(P(`    type User:struct = { name: string }\n^{ const i = reflect(User); meta.emit("<p>" + i.name + "</p>"); }`));
    expect(errs(r)).not.toContain("E-META-005");
    // phase 2 is not built: the runtime block is refused by name
    expect(errs(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(r.diags[0].message).toContain("runtime `^{}`");
  });
});

// ---------------------------------------------------------------------------
// 2. evaluation and the splice
// ---------------------------------------------------------------------------
function html(src) {
  const r = run(src);
  expect(errs(r)).toEqual([]);
  const out = mods.print.printProgram(r.core, "program.client.js", "scrml-runtime.js");
  expect(out.refused ?? []).toEqual([]);
  const m = /<template id="scrml:program"[^>]*>([\s\S]*?)<\/template>/.exec(out.html);
  return m ? m[1] : "";
}

describe("s481 — compile-time emit / emit.raw / reflect (§22.4)", () => {
  test("emit() output is spliced where the block stands", () => {
    expect(html(P(`<div id="m">^{ emit("<p id=\\"x\\">hi</p>"); }</div>`))).toContain(`<div id="m"><p id="x">hi</p></div>`);
  });
  test("a top-level block (a program body) splices too; whitespace between emitted nodes there is dropped", () => {
    expect(html(P(`^{ emit("<p>a</p>\\n  <p>b</p>"); }`))).toBe(`<p>a</p><p>b</p>`);
  });
  test("emit() normalizes \\\\n \\\\\" \\\\t \\\\\\\\; emit.raw() does not (§22.4.1)", () => {
    expect(html(P(`^{ emit("<pre>x\\\\ny</pre>"); }`))).toContain("x\ny");
    expect(html(P(`^{ emit.raw("<pre>x\\\\ny</pre>"); }`))).toContain("x\\ny");
  });
  test("reflect: impl#1's shape (ruling S481-meta-four item 3) — variants are names, fields {name, type}", () => {
    const h = html(P(`    type Color:enum = { Red, Green }\n    type User:struct = { name: string, age: number }\n<ul>^{ const c = reflect(Color); emit("<li>" + c.kind + ":" + c.name + ":" + c.variants.join("|") + "</li>"); const u = reflect(User); for (const f of u.fields) { emit("<li>" + f.name + "=" + f.type + "</li>"); } }</ul>`));
    expect(h).toContain("<li>enum:Color:Red|Green</li><li>name=string</li><li>age=number</li>");
  });
  test("a captured const and a captured function (§22.3)", () => {
    const h = html(P(`    type Sw:struct = { name: string, hex: string }\n    const palette: Sw[] = [{ name: "a", hex: "#1" }, { name: "b", hex: "#2" }];\n    function label(s: Sw) -> string { return s.name.toUpperCase(); }\n<div>^{ for (const c of palette) { emit(\`<b>\${label(c)}\${c.hex}</b>\`); } }</div>`));
    expect(h).toContain("<b>A#1</b><b>B#2</b>");
  });
  test("E-META-EVAL-001: a host failure the language defines (toFixed's RangeError)", () => {
    expect(errs(run(P(`^{ const n = 1; emit(n.toFixed(-1)); }`)))).toEqual(["E-META-EVAL-001"]);
  });
  test("E-META-EVAL-001: the step bound — a loop that never ends is refused, deterministically", () => {
    const r = run(P(`^{ let i = 0; for (;;) { i = i + 1; } emit("<p>x</p>"); }`));
    expect(errs(r)).toEqual(["E-META-EVAL-001"]);
    expect(r.diags[0].message).toContain("step bound");
  });
  test("E-META-EVAL-001: the depth bound — unbounded recursion is refused, not a crash", () => {
    const r = run(P(`^{ function f(n) { return f(n + 1); } emit("<p>" + f(0) + "</p>"); }`));
    expect(errs(r)).toEqual(["E-META-EVAL-001"]);
    expect(r.diags[0].message).toContain("depth bound");
  });
  test("E-META-EVAL-001: an unknown method is refused by name, never evaluated without it", () => {
    const r = run(P(`^{ emit("<p>" + "a".localeCompare("b") + "</p>"); }`));
    expect(errs(r)).toEqual(["E-META-EVAL-001"]);
    expect(r.diags[0].message).toContain("localeCompare");
  });
  test("E-META-EVAL-002: emitted output that does not parse", () => {
    expect(errs(run(P(`^{ emit("<div"); }`)))).toEqual(["E-META-EVAL-002"]);
  });
  test("E-META-EVAL-002: an attribute off the closed list; a single-quoted value (§5)", () => {
    expect(errs(run(P(`^{ emit("<p onclick=\\"x\\">hi</p>"); }`)))).toEqual(["E-META-EVAL-002"]);
    expect(errs(run(P(`^{ emit("<p class='x'>hi</p>"); }`)))).toEqual(["E-META-EVAL-002"]);
  });
  test("E-META-EVAL-002: emitting from a logic position (§22.4.1 \"Where emitted output lands\")", () => {
    expect(errs(run(P(`    let <n:int=0/>\n    function bump() { ^{ emit("x"); } @n = @n + 1; }\n<p>x</p>`)))).toEqual(["E-META-EVAL-002"]);
  });
  test("E-SCRIPT-001 on emitted output (held to every rule source is, §22.4.1)", () => {
    expect(errs(run(P(`^{ emit("<div><script>alert(1)</script><p>hi</p></div>"); }`)))).toEqual(["E-SCRIPT-001"]);
  });
  test("spliced nodes carry the block's span", () => {
    const src = P(`<div>\n  ^{ emit("<p>a</p>"); }\n</div>`);
    const r = run(src);
    const at = src.indexOf("^{");
    const end = src.indexOf("}", src.indexOf("emit(")) + 1;
    const prog = r.asts[0].items.find((it) => it.k.variant === "ProgramItem").k.data.p;
    const div = prog.items.map((it) => it.k).find((k) => k.variant === "MarkupItem" && k.data.n.k.variant === "Elem").data.n.k.data.e;
    const p = div.kids.find((n) => n.k.variant === "Elem");
    expect(p.span).toEqual({ start: at, end });
  });
  test("a block that emits nothing leaves nothing; no reserved `^` call survives the pass", () => {
    const r = run(P(`<div>^{ const x = 1; }</div>`));
    // no emit and no reflect: a runtime block (§22.5) — refused by name
    expect(errs(r)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    const r2 = run(P(`    type C:enum = { A }\n<div>^{ const c = reflect(C); }</div>`));
    expect(errs(r2)).toEqual([]);
    expect(JSON.stringify(r2.asts)).not.toContain('"name":"^"');
  });
});

// ---------------------------------------------------------------------------
// 5. drift — emit-gate.scrml is impl#1's judge
// ---------------------------------------------------------------------------
describe("s481 — emit-gate.scrml is markup-attr-allow-list.js (drift)", () => {
  const g = () => mods["emit-gate"];
  test("the lists are impl#1's", () => {
    expect(g().emitGlobalAttrs()).toEqual([...A._SCRML_EMIT_GLOBAL_ATTRS]);
    expect(g().emitSvgAttrs()).toEqual([...A._SCRML_EMIT_SVG_ATTRS]);
    expect(g().emitMathmlAttrs()).toEqual([...A._SCRML_EMIT_MATHML_ATTRS]);
    expect(g().emitDocumentMembers()).toEqual([..._SCRML_EMIT_DOCUMENT_MEMBERS]);
    const h = A._SCRML_EMIT_HTML_ELEMENT_ATTRS;
    expect(g().emitHtmlAttrNames()).toEqual(Object.keys(h));
    for (const k of Object.keys(h)) expect(g().emitHtmlAttrElements(k)).toEqual(h[k]);
    expect(g().emitHtmlAttrElements("onclick")).toEqual([]);
  });
  const NS = [A._SCRML_EMIT_NS_HTML, A._SCRML_EMIT_NS_SVG, A._SCRML_EMIT_NS_MATHML, ""];
  const TAGS = ["p", "a", "img", "map", "form", "input", "meta", "label", "output", "object", "svg", "circle", "math", "mi", "x-y", "foreignobject", "annotation-xml"];
  const NAMES = ["id", "ID", "class", "onclick", "OnClick", "href", "xlink:href", "srcset", "for", "usemap", "name", "data-x", "data-", "data-scrml", "DATA-SCRML-X", "data-scrmlx", "aria-label", "aria-", "content", "http-equiv", "fill", "viewbox", "mathcolor", "style", "srcdoc", "is"];
  test("the name judge answers as impl#1's on every (ns, tag, name)", () => {
    for (const ns of NS) for (const tag of TAGS) for (const name of NAMES) {
      expect([ns, tag, name, g().emitAttrNameVerdict(ns, tag, name)]).toEqual([ns, tag, name, A._scrml_emit_attr_name_verdict(ns, tag, name)]);
    }
  });
  const VALUES = ["", "x", "_scrml_x", " __SCRML", "_scrmlx", "body", "querySelector", "cookie", "constructor", "ok"];
  test("the value and named-property judges answer as impl#1's (document half, compile time)", () => {
    const members = { document: _SCRML_EMIT_DOCUMENT_MEMBERS, form: null };
    for (const tag of TAGS) for (const name of ["id", "name", "class"]) for (const v of VALUES) {
      expect(g().emitAttrValueVerdict(name, v, tag)).toBe(A._scrml_emit_attr_value_verdict(name, v, tag));
      for (const hasName of [false, true]) for (const ns of NS) {
        expect(g().emitNamedValueVerdict(ns, tag, name, v, hasName)).toBe(A._scrml_emit_named_value_verdict(ns, tag, name, v, hasName, false, false, members));
      }
    }
  });
  test("the child-namespace rule is impl#1's", () => {
    for (const ns of NS.slice(0, 3)) for (const p of TAGS) for (const c of ["svg", "math", "p", "circle"]) {
      expect(g().emitChildNs(ns, p, c)).toBe(A._scrml_emit_child_ns(ns, p, c));
    }
  });
  test("the fold is ASCII-only", () => {
    for (const s of ["AbC", "İx", "DATA-SCRML", "ß"]) expect(g().emitFoldName(s)).toBe(A._scrml_emit_fold_name(s));
  });
});

// ---------------------------------------------------------------------------
// 6. differential — the interpreter and impl#1's realm render the same markup
// ---------------------------------------------------------------------------
// Each body runs inside `<div id="m">…</div>` under both compilers; the div's children are compared
// after a DOM parse + serialize (attribute spelling is the printers', not the evaluators').
const DECLS = `    type Color:enum = { Red, Green, Blue }\n    type Tok:struct = { id: number, value: string, expiry: number }\n    type Sw:struct = { name: string, hex: string }\n    const palette: Sw[] = [{ name: "slate", hex: "#64748b" }, { name: "rose", hex: "#f43f5e" }];\n    const sizes: number[] = [3, 1, 2];`;
const BODIES = [
  `for (const c of palette) { emit(\`<div class="swatch"><span>\${c.name}</span><code>\${c.hex}</code></div>\`); }`,
  `const info = reflect(Tok); const rows = info.fields.map(f => \`<tr><td>\${f.name}</td><td>\${f.type}</td></tr>\`).join(""); emit(\`<table><tbody>\${rows}</tbody></table>\`);`,
  `const info = reflect(Color); const names = info.variants.map(v => v.toLowerCase()); for (const name of names) { emit("<p>" + name + " of " + names.length + "</p>"); } emit.raw("<pre>" + names.join(", ") + "</pre>");`,
  `reflect(Color).variants.forEach((v, i) => { emit("<li data-i=\\"" + i + "\\">" + v.toUpperCase() + "</li>"); });`,
  `const xs = sizes.slice(); xs.sort(); emit("<p>" + xs.join("-") + "</p>"); emit("<p>" + sizes.filter(n => n > 1).length + "</p>");`,
  `const n = 2.5; emit("<p>" + n.toFixed(2) + " " + (n * 3) + " " + (10 / 4) + " " + (7 % 3) + "</p>");`,
  `function cell(s) { return "<td>" + s + "</td>"; } const row = [0, 1, 2].map(i => cell(i)).join(""); emit("<table><tbody><tr>" + row + "</tr></tbody></table>");`,
  `const c = reflect(Color); for (const v of c.variants) { if (v == "Green") { emit("<b>" + v + "</b>"); } else { emit("<i>" + v + "</i>"); } }`,
  `const label = "  Hello World  ".trim(); emit(\`<h1 title="\${label.toLowerCase()}">\${label.split(" ").join("_")}</h1>\`);`,
  `const m = { a: 1, b: "two" }; const m2 = { ...m, c: true }; emit("<p>" + m2.a + m2.b + m2.c + "</p>");`,
  `const total = sizes.reduce((a, s) => a + s, 0); emit("<p>" + total + " " + sizes.includes(2) + " " + sizes.indexOf(9) + "</p>");`,
  `const w = "abc"; emit("<p>" + w.padStart(5, "*") + w.at(-1) + w.slice(1) + w.repeat(2) + w.replace("b", "B") + "</p>");`,
];

function impl1Html(body) {
  const dir = mkdtempSync(join(tmpdir(), "s481-meta-diff-"));
  try {
    const src = `<program>\n${DECLS}\n<div id="m">^{ ${body} }</div>\n</program>\n`;
    writeFileSync(join(dir, "d.scrml"), src);
    const res = compileScrml({ inputFiles: [join(dir, "d.scrml")], outputDir: join(dir, "out"), write: true, log: () => {} });
    const errors = (res.errors ?? []).filter((e) => e && e.code !== undefined && !String(e.code).startsWith("W-") && !String(e.code).startsWith("I-"));
    if (errors.length > 0) return "ERR " + errors.map((e) => e.code).join(",");
    const f = readdirSync(join(dir, "out")).find((x) => x.endsWith(".html"));
    return readFileSync(join(dir, "out", f), "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function inner(htmlText, viaTemplate) {
  const w = new Window();
  w.document.write(htmlText);
  let root = w.document;
  if (viaTemplate) {
    const t = w.document.querySelector('template[id="scrml:program"]');
    root = t ? t.content : null;
  }
  const el = root?.querySelector("#m");
  const out = el ? el.innerHTML.replace(/>\s+</g, "><").trim() : "NO #m";
  w.happyDOM.close();
  return out;
}

describe("s481 — differential: the interpreter renders what impl#1's realm renders", () => {
  for (const body of BODIES) {
    test(body.slice(0, 70), () => {
      const a = impl1Html(body);
      expect(a.startsWith("ERR")).toBe(false);
      const src = `<program>\n${DECLS}\n<div id="m">^{ ${body} }</div>\n</program>\n`;
      const r = run(src);
      expect(errs(r)).toEqual([]);
      const out = mods.print.printProgram(r.core, "program.client.js", "scrml-runtime.js");
      expect(inner(out.html, true)).toBe(inner(a, false));
    }, 60000);
  }
});
