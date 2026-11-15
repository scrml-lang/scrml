// markup-value-s478.test.js — s478-boot-markup-value-foreign (g-boot-markup-as-value-unbuilt-s473).
//
// Markup written as a VALUE in logic (SPEC §1.4 "markup is a first-class value"; §7.4.1) — an element
// where logic reads an operand: `return <li>…</li>`, `@f ? <b>x</b> : <i>y</i>`, `.A :> <p>a</p>`.
// The region lexer makes it ONE token (lex.scrml markupValueAhead / markupValueExtentAt); the parser
// reads the element with the markup reader (parse.scrml parseMarkupValue → parseMarkupNode), so a
// refusal is decided on the parsed element, never on text (§4.17 S462). Before this lane every such
// value was a generic E-PARSE-EXPR cascade ("expected an expression, found `<`") — and the element's
// text was lexed as code (`</script>` as a regular expression, `p { … }` as a block).
//
// Governing sentences (docs/changes/s478-boot-markup-value-foreign/progress.md):
//   §4.17 (S462): a `<script>` / `<style>` element "SHALL be rejected with the same codes … at EVERY
//     position markup is parsed or built" — E-SCRIPT-001 / E-STYLE-001.
//   §34 E-MD-IN-LOGIC-NOMINAL (§67.2): "An `<md>` inside `lift` markup or a markup value in an
//     expression (`const x = <div><md>…</md></div>`) … the element is refused by name".
//   §34 E-MATCH-ARM-MARKUP-IN-VALUE (§18.0): "A JS-style value-match arm (`match expr { .V :> ... }`)
//     has an arm body that is a MARKUP element".
// NOT BUILT (INTERIM, fail closed): the value itself. Any other markup value is E-BOOTSTRAP-UNSUPPORTED
// naming §1.4 / §7.4.1.

import { describe, test, expect, beforeAll } from "bun:test";
import { loadM2, frontEnd } from "./harness.js";

let mods;
beforeAll(() => { ({ mods } = loadM2()); }, { timeout: 300000 });

const ENTRY = "app.scrml";
const fe = (src) => frontEnd(mods, [{ path: ENTRY, src }], ENTRY);
const errs = (src) => fe(src).diags.filter((d) => d.severity === "Error");
const codes = (src) => errs(src).map((d) => d.code).sort();
const MV = "markup as a value in logic";
const prog = (body) => `<program>\n${body}\n</program>\n`;
const ENUM = "type Role:enum = { Admin, Editor, Viewer }\ntype Post:struct = { role: Role }\n";

describe("§4.17 — `<script>` / `<style>` in a markup value are refused on the element", () => {
  test("`return <script>…</script>` is E-SCRIPT-001, nothing else", () => {
    expect(codes(prog(" function mk() { return <script>a</script> }\n<div>${mk()}</div>"))).toEqual(["E-SCRIPT-001"]);
  });
  test("a `<style>` branch of a ternary in a markup `${ }` is E-STYLE-001; its `<b>` sibling adds no bootstrap refusal", () => {
    expect(codes(prog("let <f=true/>\n<div>${ @f ? <style>p { color: red }</style> : <b>b</b> }</div>"))).toEqual(["E-STYLE-001"]);
  });
  test("a `<script>` nested in a markup value is found on the parsed element", () => {
    expect(codes(prog(" function mk() { return <div><span><script>x</script></span></div>; }\n<p>${mk()}</p>"))).toEqual(["E-SCRIPT-001"]);
  });
  test("a script body is not markup: `a<b` inside it does not open an element (the extent ends at `</script>`)", () => {
    expect(codes(prog(" function mk() { return <script>if (a<b) go()</script>; }\n<p>${mk()}</p>"))).toEqual(["E-SCRIPT-001"]);
  });
  test("`<script>` in a STRING in logic is not an element", () => {
    expect(codes(prog(' function mk() -> string { return "<script>x</script>"; }\n<p>${mk()}</p>'))).not.toContain("E-SCRIPT-001");
  });
});

describe("§67.2 — an `<md>` in a markup value is E-MD-IN-LOGIC-NOMINAL", () => {
  test("`@on ? <div><md>…</md></div> : <p>no</p>` — once, and no bootstrap refusal for the `<p>`", () => {
    const src = prog("let <shown=true/>\n<div id=\"w\">\n${ @shown ? <div><md>\n    **yes**\n</md></div> : <p>no</p> }\n</div>");
    expect(codes(src)).toEqual(["E-MD-IN-LOGIC-NOMINAL"]);
  });
});

describe("§18.0 — a value `match` arm whose body is a markup element is E-MATCH-ARM-MARKUP-IN-VALUE", () => {
  test("the arm `.Admin :> <p>admin</p>,` — the steer is the only diagnostic", () => {
    const src = prog(ENUM + "fn label(p: Post) -> string {\n    match p.role {\n      .Admin  :> <p>admin</p>,\n      .Editor :> \"editor\",\n      .Viewer :> \"viewer\"\n    }\n}\n<p>hi</p>");
    expect(codes(src)).toEqual(["E-MATCH-ARM-MARKUP-IN-VALUE"]);
  });
  test("a markup OPERAND inside an arm (not the whole body) is the bootstrap refusal, not the steer", () => {
    const src = prog(ENUM + "function label(p: Post, f: boolean) {\n    return match p.role {\n      .Admin  :> f ? <p>a</p> : <p>b</p>,\n      .Editor :> 1,\n      .Viewer :> 2\n    };\n}\n<p>hi</p>");
    const es = errs(src);
    expect(es.map((d) => d.code)).not.toContain("E-MATCH-ARM-MARKUP-IN-VALUE");
    expect(es.some((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED" && d.message.startsWith(MV))).toBe(true);
  });
});

describe("INTERIM — any other markup value is refused by name (fail closed), with no parse cascade", () => {
  test("`return <li>x</li>;` is ONE E-BOOTSTRAP-UNSUPPORTED naming §1.4 / §7.4.1", () => {
    const es = errs(prog(" function item() { return <li>x</li>; }\n<ul>${item()}</ul>"));
    expect(es.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(es[0].message.startsWith(MV)).toBe(true);
    expect(es[0].message).toContain("§1.4");
  });
  test("a markup value whose body holds `${ }` with a `</b>` string is read to its own closer", () => {
    const es = errs(prog("let <f=true/>\n<div>${ @f ? <b>${ \"</b>\" }</b> : <i>i</i> }</div>"));
    expect(es.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("markup as a call argument and in a tape literal", () => {
    expect(codes(prog(" function f(x: string) -> string { return x; }\n function g() { return f(<b>x</b>); }\n<p>${g()}</p>"))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(prog(" function g() { return [<li>a</li>, <li>b</li>]; }\n<p>${g()}</p>"))).toEqual(["E-BOOTSTRAP-UNSUPPORTED", "E-BOOTSTRAP-UNSUPPORTED"]);
  });
  test("an unclosed markup value reports at the element, without swallowing the logic around it", () => {
    const es = errs(prog(" function item() { return <li>x; }\n<ul>${item()}</ul>"));
    expect(es.length).toBeGreaterThan(0);
  });
  test("a component written as a constant keeps its own refusal (§21.2 Form 2)", () => {
    const es = errs(prog("${\n    const Card = <div class=\"c\">\n      <span>x</span>\n    </div>\n}\n<div>hi</div>"));
    expect(es.map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(es[0].message).toContain("a component written as a constant");
  });
});

describe("a `<` with a left operand is still less-than", () => {
  test("comparisons compile clean: `n < m`, `n <m`, `(a) < b`", () => {
    expect(codes(prog(" fn lt(n: int, m: int) -> boolean { return n <m; }\n fn lt2(n: int, m: int) -> boolean { return (n) < m && n < m; }\n<p>${lt(1, 2)}${lt2(1, 2)}</p>"))).toEqual([]);
  });
});
