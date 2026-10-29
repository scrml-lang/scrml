// host-block-f3-s473.test.js — s473-boot-host-block-f3: the bootstrap builds the
// DRAFT SPEC §21.3.3 `<host>` block (typed host bindings) on the proven path, and
// refuses BY NAME every rule it does not build.
//
// Ruling (scrml-support/user-voice-scrml.md, "⭐ RULED — S473 PA recs, all" item 4):
//   "F3 typed host binding Q1–Q5: a `<host>` block; `-> waiting T`; `! HostError`;
//   closed `:host` handles; checked results."
// Round 2 ("⭐ RULED — S473 owner questions round 2, PA recs"): item 3 "Server-side
//   `<host>` bindings: allowed only in compiler-bundled stdlib modules"; item 7 "DOM
//   members stay open"; item 8 "E-HOST-DUPLICATE folded into E-SCOPE-010".
//
// Built: rules 1, 2, 3 (syntax; the static export read refused by name), 4, 5, 6,
// 7, 8, 9, 10 (adopter: client-only), 11, 12 (scalars / handles), 13 (scalars,
// `T | not`, structs (N1), tapes (Array.isArray), handles, thenables), 15 (closed
// handles: E-HOST-HANDLE-MEMBER, E-EQ-003, E-HOST-HANDLE-NOT-DATA at struct fields
// and server functions), 18 (E-HOST-THROW-RT; `! HostError` refused by name).
// Refused by name (E-BOOTSTRAP-UNSUPPORTED): `src=` (rule 3's static export read),
// `-> waiting T` (rule 17), `! HostError` (rule 18), stdlib `<host>` (rule 10's
// server side), struct / tape ARGUMENTS (rule 12's deep copy), enum results (rule
// 13's parseVariant decode), cells / enum payloads holding a handle (rule 15).

import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { mods, check } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { loadProgram, expectNoPageErrors, takePageErrors, warmLoadProgram } from "../slice-m1/load-program.js";
import { hostCall, hostThrownParts, ScrmlTrap } from "../slice-m1/runtime/runtime.js";

beforeAll(() => { mods(); warmLoadProgram(); }, { timeout: 120000 });
afterEach(() => { expectNoPageErrors(); });

const ENTRY = "app.scrml";
const run = (src) => frontEnd(mods(), [{ path: ENTRY, src }], ENTRY);
const errs = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info");
const codes = (src) => errs(run(src)).map((d) => d.code).sort();
const at = (src, d) => src.slice(d.span.start, d.span.end);
const diagsOf = (src) => errs(run(src)).map((d) => [d.code, at(src, d)]);
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
let k = 0;

// a file-top `<host>` and a `<program>` that uses it
const P = (host, body = "<p>x</p>", logic = "") => `<host>\n${host}\n</host>\n<program>\n${logic ? "${\n" + logic + "\n}\n" : ""}${body}\n</program>\n`;
const clean = (src) => {
  const r = run(src);
  expect(errs(r).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(check(r.core)).toEqual([]);
  return r;
};
// a trap from the LOADED program's runtime copy is a ScrmlTrap of that module (another class object): judged by name
const trapOf = (f) => { try { f(); return "no trap"; } catch (e) { return e && e.name === "ScrmlTrap" && typeof e.code === "string" ? e.code : "raw " + String(e && e.message); } };

// =============================================================================
// Rule 1 — placement
// =============================================================================
describe("rule 1 — `<host>` at file top level or as a direct child of `<program>`", () => {
  test("at file top: clean, and it emits no HTML", () => {
    const r = clean(P("title() -> string = document.title", "<p id=\"t\">${title()}</p>"));
    expect(r.core).not.toBe(null);
  });

  test("as a direct child of `<program>`: clean", () => {
    clean("<program>\n<host>\n  title() -> string = document.title\n</host>\n<p>${title()}</p>\n</program>\n");
  });

  test("nested inside an element: E-HOST-BINDING-PLACEMENT, the body never read as markup (before s473: it compiled as an HTML element with page text)", () => {
    const src = "<program>\n<div>\n<host>\n  title() -> string = document.title\n</host>\n</div>\n</program>\n";
    expect(codes(src)).toEqual(["E-HOST-BINDING-PLACEMENT"]);
  });

  test("inside a `<db>` body: E-HOST-BINDING-PLACEMENT", () => {
    const src = "<program>\n<db src=\"./a.db\">\n<host>\n  t() -> string = document.title\n</host>\n</db>\n<p>x</p>\n</program>\n";
    expect(codes(src)).toContain("E-HOST-BINDING-PLACEMENT");
  });
});

// =============================================================================
// Rule 2 — the body lines
// =============================================================================
describe("rule 2 — each body line is blank, a `//` comment, `type Name:host`, a binding, or an `=` continuation", () => {
  test("blank lines, comments and a continuation line: clean", () => {
    clean(P("\n  // the clipboard\n\n  lang() -> string\n      = navigator.language\n", "<p>${lang()}</p>"));
  });

  test("prose: E-HOST-BINDING-MALFORMED", () => {
    expect(codes(P("  this is not a binding", "<p>x</p>"))).toEqual(["E-HOST-BINDING-MALFORMED"]);
  });

  test("markup in the body: E-HOST-BINDING-MALFORMED", () => {
    expect(codes(P("  <p>hi</p>"))).toEqual(["E-HOST-BINDING-MALFORMED"]);
  });

  test("the deprecated `pure` spelling: E-HOST-BINDING-MALFORMED (a pure binding is spelled `fn`)", () => {
    const src = P("  pure f(x: int) -> int = x.valueOf()");
    expect(codes(src)).toEqual(["E-HOST-BINDING-MALFORMED"]);
    expect(errs(run(src))[0].message).toContain("`pure`");
  });

  test("a parameter list left open does not run into the next line or past `</host>`", () => {
    const src = "<host>\n  f(x: int\n  g() -> string = document.title\n</host>\n<program>\n<p>${g()}</p>\n</program>\n";
    expect(codes(src)).toEqual(["E-HOST-BINDING-MALFORMED"]);
  });
});

// =============================================================================
// Rule 3 — src=
// =============================================================================
describe("rule 3 — `src=`", () => {
  test("a .ts path, an absolute path, a scheme, a query: E-HOST-SRC-INVALID", () => {
    for (const s of ["./x.ts", "/abs/x.js", "https://e.x/x.js", "data:text/javascript,1", "./x.js?v=1", "./x.JS", "./x.mts"]) {
      expect([s, codes(`<host src="${s}">\n  f() -> int\n</host>\n<program>\n<p>x</p>\n</program>\n`)]).toEqual([s, ["E-HOST-SRC-INVALID"]]);
    }
  });

  test("a bare specifier: E-IMPORT-005", () => {
    expect(codes(`<host src="x.js">\n  f() -> int\n</host>\n<program>\n<p>x</p>\n</program>\n`)).toEqual(["E-IMPORT-005"]);
  });

  test("a valid relative .js path: refused BY NAME — the static export read (H2) is not built, and no host JS is loaded", () => {
    const src = `<host src="./glue.js">\n  f() -> int\n</host>\n<program>\n<p>x</p>\n</program>\n`;
    const r = run(src);
    expect(errs(r).map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errs(r)[0].message).toContain("read statically");
  });
});

// =============================================================================
// Rules 4, 5, 6, 8, 11 — the target
// =============================================================================
describe("rules 4 / 5 / 6 / 8 / 11 — the target's shape, roots, parameters and sinks", () => {
  const one = (line) => codes(P("  " + line));
  test("an operator, a computed member, a nested call, a lambda, a template, a negative literal: E-HOST-TARGET-SHAPE", () => {
    expect(one("f(a: int, b: int) -> int = a + b")).toEqual(["E-HOST-TARGET-SHAPE"]);
    expect(one("f(k: string) -> int = window[k]")).toEqual(["E-HOST-TARGET-SHAPE"]);
    expect(one("f(s: string) -> int = window.g(window.h(s))")).toEqual(["E-HOST-TARGET-SHAPE"]);
    expect(one("f() -> int = window.g(x => x)")).toEqual(["E-HOST-TARGET-SHAPE"]);
    expect(one("f() -> int = window.g(-1)")).toEqual(["E-HOST-TARGET-SHAPE"]);
    expect(one("f() = window")).toEqual(["E-HOST-TARGET-SHAPE"]);
    expect(one("f() -> int = new window.X")).toEqual(["E-HOST-TARGET-SHAPE"]);
  });

  test("`constructor` / `prototype` / `__proto__` in the chain, an object key `__proto__`, a spread: E-HOST-TARGET-SHAPE", () => {
    expect(one("f(s: string) -> int = window.constructor.constructor(s)")).toEqual(["E-HOST-TARGET-SHAPE"]);
    expect(one("f() -> int = window.Object.prototype.x")).toEqual(["E-HOST-TARGET-SHAPE"]);
    expect(one("f() -> int = window.__proto__.x")).toEqual(["E-HOST-TARGET-SHAPE"]);
    expect(one("f(m: string) -> int = window.g({ __proto__: m })")).toEqual(["E-HOST-TARGET-SHAPE"]);
  });

  test("a root that is not a parameter / `window` / `document` / `navigator`: E-HOST-TARGET-UNBOUND (`globalThis` included)", () => {
    expect(one("f() -> int = globalThis.x")).toEqual(["E-HOST-TARGET-UNBOUND"]);
    expect(one("f() -> int = localStorage.length")).toEqual(["E-HOST-TARGET-UNBOUND"]);
    expect(one("f() -> int = location.x")).toEqual(["E-HOST-TARGET-UNBOUND"]);
  });

  test("a parameter unused, or used twice: E-HOST-PARAM-USE", () => {
    expect(one("f(a: int) -> int = window.g()")).toEqual(["E-HOST-PARAM-USE"]);
    expect(one("f(a: int) -> int = window.g(a, a)")).toEqual(["E-HOST-PARAM-USE"]);
  });

  test("no target in a `<host>` without `src=`: E-HOST-NO-TARGET", () => {
    expect(one("f() -> int")).toEqual(["E-HOST-NO-TARGET"]);
  });

  test("a `fn` binding rooted at a browser root: E-HOST-TARGET-SHAPE (rule 11)", () => {
    expect(one("fn f() -> string = navigator.language")).toEqual(["E-HOST-TARGET-SHAPE"]);
  });

  test("rule 8 sinks: eval, Function, a timer, document.write, HTML-string APIs, innerHTML / outerHTML / srcdoc writes, setAttribute on…/srcdoc/non-literal, location, window.open", () => {
    const S = ["E-HOST-TARGET-SINK"];
    for (const line of [
      "f(s: string) -> int = window.eval(s)",
      "f(s: string) = window.eval.call(s)",
      "f(s: string) -> int = new window.Function(s)",
      "f(s: string) = window.setTimeout(s, 0)",
      "f(s: string) = document.write(s)",
      "f(s: string) = document.writeln(s)",
      "f(h: H, s: string) = h.insertAdjacentHTML(\"beforeend\", s)",
      "f(h: H, s: string) = h.innerHTML = s",
      "f(h: H, s: string) = h.outerHTML = s",
      "f(h: H, s: string) = h.srcdoc = s",
      "f(h: H, s: string) = h.setAttribute(\"onclick\", s)",
      "f(h: H, s: string) = h.setAttribute(\"ONload\", s)",
      "f(h: H, s: string) = h.setAttribute(\"srcdoc\", s)",
      "f(h: H, n: string, s: string) = h.setAttribute(n, s)",
      "f(h: H, s: string) = h.setAttributeNS(\"x\", \"onclick\", s)",
      "f(h: H, s: string) = h.setAttribute.call(\"onclick\", s)",
      "f(u: string) = window.location.href = u",
      "f(u: string) = document.location = u",
      "f(u: string) = window.location.assign(u)",
      "f(u: string) = window.location.replace(u)",
      "f(u: string) = window.open(u)",
      // the same calls through their aliases along a chain
      "f(h: H, s: string) = h.ownerDocument.write(s)",
      "f(u: string) = window.self.open(u)",
      "f(h: H, u: string) = h.ownerDocument.defaultView.open(u)",
      "f(h: H, u: string) = h.contentWindow.location.href = u",
    ]) {
      expect([line, codes(P("  type H:host\n  " + line))]).toEqual([line, S]);
    }
  });

  test("a write of a property NAMED BY DATA (Reflect, Object.assign, defineProperty) reaches a sink unnamed: refused by name", () => {
    for (const line of [
      "f(h: H, s: string) -> bool = window.Reflect.set(h, \"innerHTML\", s)",
      "f(h: H, s: string) = window.Object.assign(h, { innerHTML: s })",
      "f(h: H, s: string) = window.Object.defineProperty(h, \"srcdoc\", { value: s })",
    ]) {
      expect([line, codes(P("  type H:host\n  " + line))]).toEqual([line, ["E-BOOTSTRAP-UNSUPPORTED"]]);
    }
  });

  test("not sinks: a literal non-event attribute, a URL READ, a plain call", () => {
    clean(P("  type H:host\n  setTitle(h: H, s: string) = h.setAttribute(\"title\", s)\n  href() -> string = window.location.href\n  vibrate(ms: int) -> bool = navigator.vibrate(ms)"));
  });
});

// =============================================================================
// Rule 9 — a binding is a function in file scope
// =============================================================================
describe("rule 9 — a binding is a file-scope function", () => {
  test("wrong arity: E-CALL-ARITY; a wrong argument type: E-TYPE-031", () => {
    expect(codes(P("  vibrate(ms: int) -> bool = navigator.vibrate(ms)", "<p>${vibrate(1, 2)}</p>"))).toEqual(["E-CALL-ARITY"]);
    expect(codes(P("  vibrate(ms: int) -> bool = navigator.vibrate(ms)", "<p>${vibrate(\"x\")}</p>"))).toEqual(["E-TYPE-031"]);
  });

  test("a binding name bound twice, or also a function: E-SCOPE-010 (E-HOST-DUPLICATE folded in, round 2 item 8)", () => {
    expect(codes(P("  t() -> string = document.title\n  t() -> string = document.title", "<p>${t()}</p>"))).toContain("E-SCOPE-010");
    expect(codes(P("  t() -> string = document.title", "<p>${t()}</p>", "    function t() -> string {\n        return \"x\";\n    }"))).toContain("E-SCOPE-010");
  });

  test("rule 11: a `fn` calling a binding not declared `fn` is E-FN-003", () => {
    expect(codes(P("  t() -> string = document.title", "<p>${g()}</p>", "    fn g() -> string {\n        return t();\n    }"))).toContain("E-FN-003");
  });
});

// =============================================================================
// Rules 17 / 18 and the type surface — refused BY NAME where not built
// =============================================================================
describe("refused by name: `-> waiting`, `! HostError`; E-HOST-ERROR-TYPE", () => {
  test("`-> waiting T`: E-BOOTSTRAP-UNSUPPORTED naming rule 17", () => {
    const r = run(P("  w(t: string) -> waiting void = navigator.clipboard.writeText(t)"));
    expect(errs(r).map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errs(r)[0].message).toContain("rule 17");
  });

  test("`! HostError`: E-BOOTSTRAP-UNSUPPORTED naming rule 18; `! Other`: E-HOST-ERROR-TYPE", () => {
    const r = run(P("  t() -> string ! HostError = document.title"));
    expect(errs(r).map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(errs(r)[0].message).toContain("rule 18");
    expect(codes(P("  t() -> string ! Oops = document.title"))).toEqual(["E-HOST-ERROR-TYPE"]);
  });

  test("a struct / tape ARGUMENT and an enum RESULT: E-BOOTSTRAP-UNSUPPORTED (rule 12 deep copy / rule 13 enum decode not built)", () => {
    expect(codes(P("  f(xs: int[]) = window.g(xs)"))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
    expect(codes(P("  f() -> Mode = window.g()", "<p>x</p>", "    type Mode:enum = { A, B }"))).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  });

  test("a DOM element type is not in the bootstrap (rule 16): an unknown type, never accepted", () => {
    expect(codes(P("  paused(v: HTMLVideoElement) -> bool = v.paused"))).toEqual(["E-TYPE-UNKNOWN"]);
  });

  test("a `<host>` in a stdlib module file: E-BOOTSTRAP-UNSUPPORTED (rule 10's server-side bindings)", () => {
    const STD = "scrml:hb/index.scrml";
    const r = frontEnd(mods(), [
      { path: STD, src: "<host>\n  t() -> string = document.title\n</host>\n${\n    export fn one() -> int {\n        return 1;\n    }\n}\n" },
      { path: ENTRY, src: "<program>\n${ import { one } from \"scrml:hb\"; }\n<p>${one()}</p>\n</program>\n" },
    ], ENTRY, { stdlibPaths: [STD] });
    expect(errs(r).map((d) => [d.code, d.file])).toEqual([["E-BOOTSTRAP-UNSUPPORTED", STD]]);
    expect(errs(r)[0].message).toContain("rule 10");
  });
});

// =============================================================================
// Rule 10 — client-only (adopter file)
// =============================================================================
describe("rule 10 — an adopter binding is client-only for route analysis", () => {
  test("a server function calling a binding: refused (E-ROUTE-005 — its body needs both sides)", () => {
    const src = P("  t() -> string = document.title", "<p>x</p>", "    server function s() -> string {\n        return t();\n    }");
    expect(codes(src).some((c) => c === "E-ROUTE-005" || c === "E-ROUTE-002")).toBe(true);
  });
});

// =============================================================================
// Rule 15 — closed handles
// =============================================================================
describe("rule 15 — `type Name:host` handles are closed", () => {
  const H = "  type Box:host\n  mk() -> Box = window.probe.mk()\n  val(b: Box) -> int = b.v";
  test("`type X:host` outside a `<host>`: E-HOST-TYPE-OUTSIDE", () => {
    expect(codes("<program>\n${\n    type X:host\n}\n<p>x</p>\n</program>\n")).toContain("E-HOST-TYPE-OUTSIDE");
  });

  test("a member read / method call on a handle: E-HOST-HANDLE-MEMBER (naming the binding to declare)", () => {
    const src = P(H, "<p>${f()}</p>", "    function f() -> int {\n        const b: Box = mk();\n        return b.v;\n    }");
    expect(codes(src)).toEqual(["E-HOST-HANDLE-MEMBER"]);
    // an INFERRED local's member: the binder does not know the type yet — refused all the same, never accepted
    expect(codes(P(H, "<p>${f()}</p>", "    function f() -> int {\n        const b = mk();\n        return b.v;\n    }")).length).toBeGreaterThan(0);
    expect(errs(run(src))[0].message).toContain("<host>");
    const src2 = P(H, "<p>${f()}</p>", "    function f() -> int {\n        const b: Box = mk();\n        return b.size();\n    }");
    expect(codes(src2)).toEqual(["E-HOST-HANDLE-MEMBER"]);
  });

  test("`==` on handles: E-EQ-003", () => {
    const src = P(H, "<p>${f()}</p>", "    function f() -> bool {\n        return mk() == mk();\n    }");
    expect(codes(src)).toContain("E-EQ-003");
  });

  test("a struct field holding a handle: E-HOST-HANDLE-NOT-DATA", () => {
    const src = P(H, "<p>x</p>", "    type Pair:struct = { b: Box, n: int }");
    expect(codes(src)).toContain("E-HOST-HANDLE-NOT-DATA");
  });

  test("a server function taking a handle: E-HOST-HANDLE-NOT-DATA", () => {
    const src = P(H, "<p>x</p>", "    server function s(b: Box) -> int {\n        return 1;\n    }");
    expect(codes(src)).toContain("E-HOST-HANDLE-NOT-DATA");
  });

  test("a handle is nominal and cannot be forged: `{}` is not a `Box`, an `Other` is not a `Box`, a string is not a `Box`", () => {
    const H2 = H + "\n  type Other:host\n  mkO() -> Other = window.probe.mk()";
    expect(codes(P(H2, "<p>${f()}</p>", "    function f() -> int {\n        const b: Box = {};\n        return val(b);\n    }"))).toEqual(["E-TYPE-STRUCT-CONTEXT"]);
    expect(codes(P(H2, "<p>${f()}</p>", "    function f() -> int {\n        const o: Other = mkO();\n        return val(o);\n    }"))).toEqual(["E-TYPE-031"]);
    expect(codes(P(H2, "<p>${val(\"x\")}</p>"))).toEqual(["E-TYPE-031"]);
  });

  test("a handle has no text: displayed, templated or joined, it is refused (no host toString runs)", () => {
    expect(codes(P(H, "<p>${mk()}</p>"))).toEqual(["E-TEXT-NON-PRIMITIVE"]);
    expect(codes(P(H, "<p>${f()}</p>", "    function f() -> string {\n        const b: Box = mk();\n        return `v=${b}`;\n    }"))).toEqual(["E-TEXT-NON-PRIMITIVE"]);
    expect(codes(P(H, "<p>${f()}</p>", "    function f() -> string {\n        const xs: Box[] = [mk()];\n        return xs.join(\",\");\n    }"))).toEqual(["E-TYPE-031"]);
    expect(codes(P(H, "<p>${f()}</p>", "    function f() -> bool {\n        const b: Box = mk();\n        if (b) {\n            return true;\n        }\n        return false;\n    }"))).toEqual(["E-COND-NOT-BOOLEAN"]);
  });

  test("a cell holding a handle: refused by name (E-BOOTSTRAP-UNSUPPORTED)", () => {
    const src = `<host>\n${H}\n</host>\n<program>\nlet <b:Box | not = not/>\n<p>x</p>\n</program>\n`;
    expect(codes(src)).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
});

// =============================================================================
// Emission and the run-time decode (rules 7, 12, 13, 18) — in happy-dom
// =============================================================================
const STRUCTS = "    type Rect:struct = { w: number, h: number }\n    type Opt:struct = { name: string, admin: bool | not }";
const HOSTS = [
  "  type Box:host",
  "  title() -> string = document.title",
  "  setTitle(t: string) = document.title = t",
  "  num() -> number = window.probe.num()",
  "  anInt() -> int = window.probe.anInt()",
  "  str() -> string = window.probe.str()",
  "  maybeStr() -> string | not = window.probe.str()",
  "  rect() -> Rect = window.probe.rect()",
  "  opt() -> Opt = window.probe.opt()",
  "  langs() -> string[] = window.probe.langs()",
  "  nodes() -> int[] = document.querySelectorAll(\"p\")",
  "  mk() -> Box = window.probe.mk()",
  "  val(b: Box) -> int = b.v",
  "  fire() = window.probe.fire()",
  "  echo(s: string, n: int, f: bool, o: string) -> string = window.probe.echo(s, n, f, \"lit\", { k: o, n: 2 })",
  "  made(s: string) -> Box = new window.probe.Made(s)",
  "  label(b: Box) -> string = b.label",
  "  fn fix(x: number, d: int) -> string = x.toFixed(d)",
].join("\n");
const EXPOSE = ["title", "setTitle", "num", "anInt", "str", "maybeStr", "rect", "opt", "langs", "nodes", "mk", "val", "fire", "echo", "made", "label", "fix", "fixed"];
// rule 11: a `fn` may call a binding declared `fn`
const PROG = P(HOSTS, "<p id=\"t\">${title()}</p><p id=\"f\">${fixed()}</p>", STRUCTS + "\n    fn fixed() -> string {\n        return fix(3.14159, 2);\n    }");

describe("emission — the target as literal JavaScript, the result checked (rules 7, 13, 18)", () => {
  let program;
  let out;
  beforeAll(async () => {
    window.probe = {};
    const r = clean(PROG);
    ({ program, out } = await loadProgram(r.core, "s473-hb-" + k++, EXPOSE));
    document.title = "hello";
  }, 120000);

  test("the target is printed in place — no Function constructor, no eval, roots read through the runtime", () => {
    expect(out.js).toContain("hostCall(");
    expect(out.js).toContain("hostRoot(\"document\").title");
    expect(out.js).not.toMatch(/new Function|\beval\(/);
    expect(out.js).toContain("new (");
  });

  test("rule 11: a `fn` binding rooted at a parameter runs, from a `fn` too", () => {
    expect(document.querySelector("#f").textContent).toBe("3.14");
    expect(program.fix(2.5, 0)).toBe("3");
  });

  test("a read, a write, scalars, literal arguments and a one-level object literal cross", () => {
    expect(document.querySelector("#t").textContent).toBe("program"); // rendered at load, from the page's own <title>
    expect(program.title()).toBe("hello");
    program.setTitle("bye");
    expect(document.title).toBe("bye");
    let got;
    window.probe.echo = (...a) => { got = a; return "ok"; };
    expect(program.echo("s", 3, true, "o")).toBe("ok");
    expect(got).toEqual(["s", 3, true, "lit", { k: "o", n: 2 }]);
  });

  test("scalars by typeof: a boxed string, a fractional int, NaN for int, null for non-optional are E-HOST-VALUE-MISMATCH-RT; `T | not` admits null", () => {
    const M = "E-HOST-VALUE-MISMATCH-RT";
    window.probe.str = () => new String("x");
    expect(trapOf(() => program.str())).toBe(M);
    window.probe.anInt = () => 1.5;
    expect(trapOf(() => program.anInt())).toBe(M);
    window.probe.anInt = () => 2 ** 53;
    expect(trapOf(() => program.anInt())).toBe(M);
    window.probe.str = () => null;
    expect(trapOf(() => program.str())).toBe(M);
    expect(program.maybeStr()).toBe(null);
    window.probe.str = () => undefined;
    expect(program.maybeStr()).toBe(null);
    window.probe.num = () => NaN;
    expect(program.num()).toBeNaN();
  });

  test("N1 — a WebIDL-style accessor on the prototype is READ (once per field); an own data field too; extra members dropped", () => {
    let reads = 0;
    class RectLike { get w() { reads++; return 3; } get h() { reads++; return 4; } }
    window.probe.rect = () => new RectLike();
    const r = program.rect();
    expect(r).toEqual({ w: 3, h: 4 });
    expect(reads).toBe(2);
    window.probe.rect = () => ({ w: 1, h: 2, extra: "dropped" });
    expect(Object.keys(program.rect())).toEqual(["w", "h"]);
  });

  test("N1 — a polluted Object.prototype cannot supply a field: absent is `not` for an optional field, a mismatch for a required one", () => {
    Object.prototype.admin = true;
    Object.prototype.name = "polluted";
    try {
      window.probe.opt = () => ({ name: "real" });
      expect(program.opt()).toEqual({ name: "real", admin: null });
      window.probe.opt = () => ({});
      expect(trapOf(() => program.opt())).toBe("E-HOST-VALUE-MISMATCH-RT");
    } finally {
      delete Object.prototype.admin;
      delete Object.prototype.name;
    }
  });

  test("a field named `__proto__` / a `constructor` field cannot reshape the decoded value", () => {
    window.probe.opt = () => JSON.parse('{"name":"n","admin":false,"__proto__":{"polluted":1}}');
    const v = program.opt();
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
    expect(v.polluted).toBe(undefined);
  });

  test("a getter that throws while the result is decoded: E-HOST-THROW-RT (never a raw host error)", () => {
    window.probe.rect = () => ({ get w() { throw new Error("boom"); }, h: 1 });
    expect(trapOf(() => program.rect())).toBe("E-HOST-THROW-RT");
  });

  test("a tape is an Array.isArray value: a real array decodes element by element; a NodeList and an array-like are mismatches", () => {
    window.probe.langs = () => ["en", "fr"];
    expect(program.langs()).toEqual(["en", "fr"]);
    window.probe.langs = () => ["en", 1];
    expect(trapOf(() => program.langs())).toBe("E-HOST-VALUE-MISMATCH-RT");
    window.probe.langs = () => ({ length: 1, 0: "en" });
    expect(trapOf(() => program.langs())).toBe("E-HOST-VALUE-MISMATCH-RT");
    expect(trapOf(() => program.nodes())).toBe("E-HOST-VALUE-MISMATCH-RT");
  });

  test("a thenable result of a non-waiting binding: a mismatch naming `-> waiting void`, with a rejection handler attached (no unhandled rejection)", async () => {
    window.probe.fire = () => Promise.reject(new Error("late"));
    let e;
    try { program.fire(); } catch (x) { e = x; }
    expect(e.code).toBe("E-HOST-VALUE-MISMATCH-RT");
    expect(e.message).toContain("-> waiting void");
    await settle();
    expect(takePageErrors()).toEqual([]);
    let thenReads = 0;
    window.probe.str = () => ({ get then() { thenReads++; return (a, b) => {}; } });
    expect(trapOf(() => program.str())).toBe("E-HOST-VALUE-MISMATCH-RT");
    expect(thenReads).toBe(1);
  });

  test("rule 18 — a throw is E-HOST-THROW-RT; the thrown object's toString / valueOf / Symbol.toPrimitive are never called", () => {
    let converted = false;
    const evil = { get message() { return 5; }, toString() { converted = true; return "x"; }, valueOf() { converted = true; return 1; }, [Symbol.toPrimitive]() { converted = true; return "p"; } };
    window.probe.fire = () => { throw evil; };
    let e;
    try { program.fire(); } catch (x) { e = x; }
    expect(e.code).toBe("E-HOST-THROW-RT");
    expect(e.message).toContain("a non-Error value was thrown");
    expect(converted).toBe(false);
    window.probe.fire = () => { throw new TypeError("nope"); };
    try { program.fire(); } catch (x) { e = x; }
    expect([e.code, e.detail.name, e.detail.message]).toEqual(["E-HOST-THROW-RT", "TypeError", "nope"]);
    // a missing intermediate member throws inside the target: E-HOST-THROW-RT, not a raw TypeError
    window.probe = undefined;
    try {
      expect(trapOf(() => program.num())).toBe("E-HOST-THROW-RT");
    } finally {
      window.probe = {};
    }
  });

  test("handles: a binding's handle result passes to another binding as itself; a null handle is a mismatch; `new` constructs", () => {
    const obj = { v: 41 };
    window.probe.mk = () => obj;
    expect(program.val(program.mk())).toBe(41);
    window.probe.mk = () => null;
    expect(trapOf(() => program.mk())).toBe("E-HOST-VALUE-MISMATCH-RT");
    window.probe.Made = class { constructor(s) { this.label = "made " + s; } };
    expect(program.label(program.made("x"))).toBe("made x");
  });
});

describe("runtime.js — hostThrownParts (rule 18's payload rules) and hostCall directly", () => {
  test("primitives are String-ed; an object without a string message gives the fixed text; a throwing getter is survived", () => {
    expect(hostThrownParts("s")).toEqual({ message: "s", name: "UnknownThrow" });
    expect(hostThrownParts(null)).toEqual({ message: "null", name: "UnknownThrow" });
    expect(hostThrownParts({ message: 5 })).toEqual({ message: "a non-Error value was thrown", name: "UnknownThrow" });
    expect(hostThrownParts({ get message() { throw 1; }, name: "N" })).toEqual({ message: "a non-Error value was thrown", name: "N" });
    expect(hostThrownParts(new RangeError("r"))).toEqual({ message: "r", name: "RangeError" });
  });

  test("a Proxy whose traps throw during the decode: E-HOST-THROW-RT", () => {
    const p = new Proxy({}, { getPrototypeOf() { throw new Error("trap"); }, getOwnPropertyDescriptor() { throw new Error("trap"); } });
    const ty = { k: "struct", name: "S", fields: [{ name: "a", ty: { k: "int" } }] };
    expect(trapOf(() => hostCall(() => p, ty, "t()"))).toBe("E-HOST-THROW-RT");
  });
});
