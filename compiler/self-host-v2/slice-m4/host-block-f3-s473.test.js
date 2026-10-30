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

  test("L1 — a binding line with U+2028 / U+2029 / a lone CR is E-HOST-BINDING-MALFORMED, never a silently cut line", () => {
    expect(codes("<host>\n  t() -> string = document.title  u() -> string = document.title\n</host>\n<program>\n<p>x</p>\n</program>\n")).toContain("E-HOST-BINDING-MALFORMED");
    expect(codes("<host>\n  t() -> string = document.title\r  u() -> string = document.title\n</host>\n<program>\n<p>x</p>\n</program>\n")).toContain("E-HOST-BINDING-MALFORMED");
    // a normal CRLF line is fine
    clean("<host>\r\n  t() -> string = document.title\r\n</host>\r\n<program>\r\n<p>${t()}</p>\r\n</program>\r\n");
  });

  test("L2 — `type Name:host` naming a built-in type (string, int, Object) is refused (E-SCOPE-010)", () => {
    for (const n of ["string", "int", "number", "bool", "Object", "Array", "Function", "void"]) {
      expect([n, codes(P("  type " + n + ":host\n  f() -> string = document.title", "<p>${f()}</p>"))]).toEqual([n, ["E-SCOPE-010"]]);
    }
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

  test("a valid relative .js path: the front end is clean and carries the export root into Core — the driver reads the exports statically (s473 allowlist lane A; host-src-s473.test.js), no host JS is loaded", () => {
    const src = `<host src="./glue.js">\n  f() -> int\n</host>\n<program>\n<p>x</p>\n</program>\n`;
    const r = clean(src);
    const b = r.core.fns.find((f) => f.host && f.host.bind).host.bind;
    expect([b.root, b.rootParam, b.chain, b.src.path, b.src.targetless]).toEqual(["f", -1, [], "glue.js", true]);
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

  // ===========================================================================
  // Rule 8 — THE ALLOWLIST (s473-host-allowlist-b; DRAFT §21.3.3 rule 8, Appendix H). Each
  // case below was clean, or refused only by #1659's INTERIM name tables, before; now the typed
  // chain walk refuses it with the code rule 8 names. `hostWalk` (analyze.scrml).
  // ===========================================================================
  const walk = (line) => codes(P("  " + line));
  const NA = "E-HOST-TARGET-NOT-ALLOWED", OPQ = "E-HOST-ROOT-OPAQUE", ARG = "E-HOST-ARG-TYPE", RES = "E-HOST-RESULT-TYPE";

  test("8.3 — source-text, HTML-string, navigation and window sinks are not on the surface: E-HOST-TARGET-NOT-ALLOWED", () => {
    for (const line of [
      "f(s: string) -> int = window.eval(s)",
      "f(s: string) = window.eval.call(s)",
      "f(s: string) -> int = new window.Function(s)",
      "f(s: string) = document.write(s)",
      "f(s: string) = document.writeln(s)",
      "f(h: Element, s: string) = h.insertAdjacentHTML(\"beforeend\", s)",
      "f(h: HTMLElement, s: string) = h.innerHTML = s",
      "f(h: HTMLElement, s: string) = h.outerHTML = s",
      "f(h: HTMLElement, s: string) = h.srcdoc = s",
      "f(h: HTMLElement, s: string) = h.setAttributeNS(\"x\", \"onclick\", s)",
      "f(h: Element, s: string) = h.setAttribute.call(\"onclick\", s)",
      "f(u: string) = window.location.href = u",
      "f(u: string) = document.location = u",
      "f(u: string) = window.location.assign(u)",
      "f(u: string) = window.location.replace(u)",
      "f(u: string) = window.open(u)",
      "f(h: Element, s: string) = h.ownerDocument.write(s)",
      "f(u: string) = window.self.open(u)",
      "f(h: Element, u: string) = h.ownerDocument.defaultView.open(u)",
      "f(h: HTMLElement, u: string) = h.contentWindow.location.href = u",
      "x(s: string) = document.execCommand(\"insertHTML\", false, s)",
      "f(h: Element, s: string) -> bool = window.Reflect.set(h, \"innerHTML\", s)",
      "f(h: Element, s: string) = window.Object.assign(h, { innerHTML: s })",
      "f(h: Element, s: string) = window.Object.defineProperty(h, \"srcdoc\", { value: s })",
      "q(e: Element, s: string) = e.__defineSetter__(s)",
    ]) {
      expect([line, walk(line)]).toEqual([line, [NA]]);
    }
  });

  test("8.5 guarded(attr-name) — an event-handler or `srcdoc` attribute name is E-HOST-TARGET-NOT-ALLOWED (§5.2's test, url.scrml executableAttrName); a non-literal name is E-HOST-ARG-TYPE", () => {
    expect(walk("f(h: Element, s: string) = h.setAttribute(\"onclick\", s)")).toEqual([NA]);
    expect(walk("f(h: Element, s: string) = h.setAttribute(\"ONload\", s)")).toEqual([NA]);
    expect(walk("f(h: Element, s: string) = h.setAttribute(\"srcdoc\", s)")).toEqual([NA]);
    expect(walk("f(h: Element, s: string) = h.setAttribute(\"SRCDOC\", s)")).toEqual([NA]);
    expect(walk("f(h: Element, n: string, s: string) = h.setAttribute(n, s)")).toEqual([ARG]);
  });

  test("8.4 — a string where the slot takes a callback (a string timer) is E-HOST-ARG-TYPE", () => {
    expect(walk("f(s: string) = window.setTimeout(s, 0)")).toEqual([ARG]);
    expect(walk("st(s: string) = window.setTimeout(s)")).toEqual([ARG]);
  });

  test("8.2 — a root typed by data (`number`, `string`) or by a non-interface is E-HOST-ROOT-OPAQUE (a data value is not a host receiver)", () => {
    expect(walk("fn fix(x: number, d: int) -> string = x.toFixed(d)")).toEqual([OPQ]);
    expect(walk("f(s: string) -> int = s.length")).toEqual([OPQ]);
    // `Reflect` is no interface: the parameter's type is unknown, and it is no root
    expect(walk("r(o: Reflect, e: Element, s: string) = o.set(e, \"innerHTML\", s)")).toEqual(expect.arrayContaining([OPQ, "E-TYPE-UNKNOWN"]));
  });

  test("8.6 — `type Name:host` in a `<host>` without `src=` is E-HOST-TYPE-NO-SRC, and a parameter of it is no root (E-HOST-ROOT-OPAQUE)", () => {
    expect(codes(P("  type H:host\n  t() -> string = document.title"))).toEqual(["E-HOST-TYPE-NO-SRC"]);
    expect(codes(P("  type H:host\n  f(h: H) -> string = h.title"))).toEqual(["E-HOST-ROOT-OPAQUE", "E-HOST-TYPE-NO-SRC"]);
  });

  test("8.1 — `type I:host` reusing an Appendix H name is E-SCOPE-010; a user struct of such a name SHADOWS the built-in in its scope, and is then no host root (fail closed)", () => {
    expect(codes(P("  type HTMLElement:host\n  t() -> string = document.title"))).toEqual(["E-SCOPE-010"]);
    clean(P("  t() -> string = document.title", "<p>x</p>", "    type Node:struct = { a: int }"));
    expect(codes(P("  f(n: Node) -> string = n.textContent", "<p>x</p>", "    type Node:struct = { a: int }"))).toEqual(["E-HOST-ROOT-OPAQUE"]);
  });

  test("8.3 — the chain continues only through a read whose result is an interface (not an optional one)", () => {
    expect(walk("f() -> string = document.title.length")).toEqual([NA]);
    expect(walk("f(s: string) = document.body.append(s)")).toEqual([NA]);
  });

  test("8.4 — results: a supertype widens; `T | not` declared without `not` is E-HOST-RESULT-TYPE; a data mismatch is E-HOST-RESULT-TYPE; a downcast is admitted, brand-checked at run time (8.7)", () => {
    clean(P("  el(id: string) -> Element | not = document.getElementById(id)\n  n(id: string) -> Node | not = document.getElementById(id)"));
    expect(walk("el(id: string) -> Element = document.getElementById(id)")).toEqual([RES]);
    expect(walk("t() -> int = document.title")).toEqual([RES]);
    expect(walk("t() -> Element = document.title")).toEqual([RES]);
    expect(walk("t(s: string) -> string = document.title = s")).toEqual([RES]);
    clean(P("  el(id: string) -> HTMLElement | not = document.getElementById(id)"));
  });

  test("8.4 — a struct result of an interface-valued entry declares only `read` entries of that interface", () => {
    clean(P("  measure(c: CanvasRenderingContext2D, s: string) -> M = c.measureText(s)", "<p>x</p>", "    type M:struct = { width: number }"));
    expect(codes(P("  measure(c: CanvasRenderingContext2D, s: string) -> M = c.measureText(s)", "<p>x</p>", "    type M:struct = { width: number, actualBoundingBoxLeft: number }"))).toEqual([RES]);
  });

  test("8.4 — arguments: arity, a data type into an interface slot, a literal into the wrong slot", () => {
    expect(walk("v(ms: int, x: int) -> bool = navigator.vibrate(ms, x)")).toEqual([ARG]);
    expect(walk("v(ms: string) -> bool = navigator.vibrate(ms)")).toEqual([ARG]);
    expect(walk("v() -> bool = navigator.vibrate(\"10\")")).toEqual([ARG]);
    expect(walk("c(n: Node, s: string) -> bool = n.contains(s)")).toEqual([ARG]);
    expect(walk("g(c: HTMLCanvasElement) -> CanvasRenderingContext2D | not = c.getContext(\"webgl\")")).toEqual([ARG]);
    clean(P("  g(c: HTMLCanvasElement) -> CanvasRenderingContext2D | not = c.getContext(\"2d\")\n  v() -> bool = navigator.vibrate(10)"));
  });

  test("on the surface, clean: document.title read / write, a URL READ through location, navigator reads, matchMedia, a DOM element read", () => {
    clean(P([
      "  t() -> string = document.title",
      "  setT(s: string) = document.title = s",
      "  href() -> string = window.location.href",
      "  lang() -> string = navigator.language",
      "  langs() -> string[] = navigator.languages",
      "  vibrate(ms: int) -> bool = navigator.vibrate(ms)",
      "  mq(q: string) -> MediaQueryList = window.matchMedia(q)",
      "  matches(m: MediaQueryList) -> bool = m.matches",
      "  paused(v: HTMLVideoElement) -> bool = v.paused",
      "  w(r: DOMRect) -> number = r.width",
      "  fn fw(r: DOMRect) -> number = r.width",
      "  id(e: Element) -> string = e.id",
    ].join("\n")));
  });

  test("a guarded entry compiles, and is EMITTED through its run-time check (rule 8.5; runtime.js, lane A)", () => {
    for (const [line, guard] of [
      ["setTitle(h: Element, s: string) = h.setAttribute(\"title\", s)", "hostSetAttrName("],
      ["setHref(h: Element, s: string) = h.setAttribute(\"href\", s)", "hostAttrValue("],
      ["rmAttr(h: Element) = h.removeAttribute(\"title\")", "hostSetAttrName("],
      ["setText(e: HTMLElement, s: string) = e.textContent = s", "hostInert("],
      ["add(e: Element, s: string) = e.append(s)", "hostInert("],
      ["src(i: HTMLImageElement, u: string) = i.src = u", "hostUrl("],
      ["go(a: HTMLAnchorElement, u: string) = a.href = u", "hostUrl("],
    ]) {
      const r = clean(P("  " + line));
      const js = mods().print.printProgram(r.core, "t.client.js", "scrml-runtime.js").js;
      expect([line, js.includes(guard), js.includes("hostInert(")]).toEqual([line, true, true]);
    }
  });


  test("8.5 guarded(url) — a literal URL is judged at compile time by §5.2 rule 2's test (E-ATTR-STATIC-EXECUTABLE)", () => {
    expect(walk("go(a: HTMLAnchorElement) = a.href = \"javascript:alert(1)\"")).toEqual(["E-ATTR-STATIC-EXECUTABLE"]);
    expect(walk("go(a: Element) = a.setAttribute(\"href\", \"javascript:alert(1)\")")).toEqual(["E-ATTR-STATIC-EXECUTABLE"]);
  });

  // #1659 review H1 — the two-binding fail-open. Every source binding of the Chromium probes,
  // typed as strongly as Appendix H allows: the walk refuses the source or the second hop.
  test("H1 — every row of the #1659 review's H1 table is refused under the allowlist", () => {
    const H1 = [
      ["getF() = window.Function", NA],                       // Function read as a handle
      ["getE() = window.eval", NA],
      ["getT() = window.setTimeout", NA],                     // a read: setTimeout has a call entry only
      ["getR() = window.Reflect", NA],
      ["w(d: Document, s: string) = d.write(s)", NA],         // window.document is on the surface; write is not
      ["l(o: Location, u: string) = o.href = u", NA],         // Location is read-only on the surface
      ["l(o: Location, u: string) = o.assign(u)", NA],
      ["win() = document.defaultView", NA],
      ["op(w: Window, u: string) = w.open(u)", NA],
      ["mkAttr(n: string) = document.createAttribute(n)", NA],
      ["setNode(e: Element, a: Node) = e.setAttributeNode(a)", NA],
      ["attrs(e: Element) = e.attributes", NA],
      ["getAttr(e: Element, n: string) = e.getAttributeNode(n)", NA],
      ["frameWin(e: HTMLElement) = e.contentWindow", NA],
      ["frameDoc(e: HTMLElement) = e.contentDocument", NA],
      ["mkWorker(u: string) = new window.Worker(u)", NA],
      ["reg(u: string) = navigator.serviceWorker.register(u)", NA],
      ["docOpen(u: string, n: string, f: string) = document.open(u, n, f)", NA],
      ["navTo(u: string) = window.navigation.navigate(u)", NA],
      ["me() = window.self", NA],
      ["t() = window.top", NA],
      ["o() = window.opener", NA],
      ["fr() = window.frames", NA],
      ["g() = window.globalThis", NA],
      ["od(e: Element) = e.ownerDocument", NA],
      ["setNodeVal(a: Node, s: string) = a.nodeValue = s", NA],
      ["setText(e: HTMLElement, s: string) = e.text = s", NA],
      ["setNamed(e: Element, a: Node) = e.attributes.setNamedItem(a)", NA],
      ["refl(r: Reflect, o: Element, s: string) -> bool = r.set(o, \"innerHTML\", s)", OPQ],
    ];
    for (const [line, code] of H1) {
      expect([line, walk(line)]).toEqual([line, expect.arrayContaining([code])]);
    }
  });

  test("H1(b) — a call / new whose callee is a bare parameter or bare global (no member) is E-HOST-TARGET-SHAPE", () => {
    expect(codes(P("  call0(f: Element) = f()"))).toEqual(["E-HOST-TARGET-SHAPE"]);
    expect(codes(P("  mk(f: Element, s: string) = new f(s)"))).toEqual(["E-HOST-TARGET-SHAPE"]);
    expect(codes(P("  callw() = window()"))).toEqual(["E-HOST-TARGET-SHAPE"]);
  });

  // #1659 r1 re-review R1 (HIGH, code execution): createElement('script') + `.src = url` +
  // appendChild loaded and ran remote JS, clean. Each step is refused now.
  test("R1 — script / iframe / anchor / form URL loads are refused at every step", () => {
    expect(walk("mk(n: string) -> HTMLElement = document.createElement(n)")).toEqual([ARG]);           // a non-literal tag
    for (const tag of ["script", "iframe", "frame", "object", "embed", "base", "meta", "link", "style", "template", "slot", "my-widget", "svg"]) {
      expect([tag, walk("mk() -> HTMLElement = document.createElement(\"" + tag + "\")")]).toEqual([tag, [ARG]]);  // not on the inert list (H.4)
    }
    expect(walk("setSrc(e: HTMLElement, u: string) = e.src = u")).toEqual([NA]);                      // no (HTMLElement, src, write)
    expect(walk("setSrc(e: Element, u: string) = e.src = u")).toEqual([NA]);
    expect(walk("append(b: HTMLElement, e: HTMLElement) = b.appendChild(e)")).toEqual([NA]);          // appendChild is not on the surface
    expect(walk("append(e: HTMLElement) = document.body.appendChild(e)")).toEqual([NA]);
    expect(walk("txt(e: HTMLElement, s: string) = e.text = s")).toEqual([NA]);                        // script text
    expect(walk("go(f: HTMLElement, u: string) = f.action = u")).toEqual([NA]);                       // form.action
    expect(walk("go(f: HTMLFormElement, u: string) = f.action = u")).toEqual(expect.arrayContaining([OPQ]));  // not an Appendix H interface
    expect(walk("go(f: HTMLIFrameElement, u: string) = f.src = u")).toEqual(expect.arrayContaining([OPQ]));
    expect(walk("go(a: HTMLAnchorElement) = a.href = \"javascript:alert(1)\"")).toEqual(["E-ATTR-STATIC-EXECUTABLE"]);
    // the reviewer's three bindings, as written then and as typed now
    expect(codes(P("  type E:host\n  mk(n: string) -> E = document.createElement(n)\n  setSrc(e: E, u: string) = e.src = u\n  append(e: E) = document.body.appendChild(e)"))).toEqual(expect.arrayContaining(["E-HOST-TYPE-NO-SRC"]));
    expect(codes(P("  mk(n: string) -> HTMLElement = document.createElement(n)\n  setSrc(e: HTMLElement, u: string) = e.src = u\n  append(e: HTMLElement) = document.body.appendChild(e)"))).toEqual([ARG, NA, NA]);
  });

  // #1659 r1 re-review R2 (LOW): each stays off the surface (refused); none is admitted with a P argument.
  test("R2 — insertRule, DOMParser.parseFromString, history.pushState, URL.createObjectURL are refused", () => {
    expect(walk("ins(s: CSSStyleSheet, r: string) -> int = s.insertRule(r)")).toEqual(expect.arrayContaining([OPQ]));
    expect(walk("p(s: string) = new window.DOMParser(s)")).toEqual([NA]);
    expect(walk("p(d: DOMParser, s: string) = d.parseFromString(s, \"text/html\")")).toEqual(expect.arrayContaining([OPQ]));
    expect(walk("push(s: string, u: string) = window.history.pushState(s, \"\", u)")).toEqual([NA]);
    expect(walk("ou(b: string) -> string = window.URL.createObjectURL(b)")).toEqual([NA]);
  });

  // #1674 review F1 — guarded(attr-name) refuses every name the MARKUP walk refuses from data (its own
  // predicate, analyze.scrml dataAttrRefusal), whatever the value: E20 / E7 / E21 / E8 are must-refuse.
  test("F1 — E20 / E7 / E21: `form`, `formaction`, `style` (any case) through setAttribute are E-HOST-TARGET-NOT-ALLOWED, a literal value included", () => {
    for (const line of [
      "owner(e: Element, f: string) = e.setAttribute(\"form\", f)",                   // E20: a password into an off-origin form
      "fa(e: HTMLElement, v: string) = e.setAttribute(\"formaction\", v)",           // E7: a CSRF token to /exfil-form
      "fo(e: HTMLElement, v: string) = e.setAttribute(\"FORM\", v)",
      "st(e: Element, v: string) = e.setAttribute(\"style\", v)",                    // E21: CSS url() fetch
      "st2(e: Element) = e.setAttribute(\"Style\", \"background:url(/x)\")",
      "fa2(e: Element) = e.setAttribute(\"formaction\", \"/exfil-form\")",
      "rs(e: Element) = e.removeAttribute(\"style\")",
    ]) {
      expect([line, walk(line)]).toEqual([line, [NA]]);
    }
    // the reviewer's E20 / E7 programs, as written
    expect(codes(P("  byId(id: string) -> Element | not = document.getElementById(id)\n  owner(e: Element, f: string) = e.setAttribute(\"form\", f)"))).toEqual([NA]);
    expect(codes(P("  mkB() -> HTMLElement = document.createElement(\"button\")\n  sa1(e: HTMLElement, v: string) = e.setAttribute(\"form\", v)\n  sa2(e: HTMLElement, v: string) = e.setAttribute(\"formaction\", v)"))).toEqual([NA, NA]);
    // an ordinary attribute still compiles
    clean(P("  t(e: Element, v: string) = e.setAttribute(\"title\", v)\n  n(e: Element, v: string) = e.setAttribute(\"name\", v)"));
  });

  test("F1 — E8: CSSStyleDeclaration.setProperty is off the surface (H-094 removed); a CSS value from data has one door, the §25.7 bridge", () => {
    expect(walk("sp(e: HTMLElement, p: string, v: string) = e.style.setProperty(p, v)")).toEqual([NA]);
    clean(P("  rp(e: HTMLElement, p: string) -> string = e.style.removeProperty(p)"));
  });

  test("I1 — createElement's result is exactly its tag's interface: a declared subinterface is E-HOST-RESULT-TYPE", () => {
    expect(walk("mk() -> HTMLAnchorElement = document.createElement(\"div\")")).toEqual([RES]);
    clean(P("  mk() -> HTMLAnchorElement = document.createElement(\"a\")\n  mk2() -> HTMLElement = document.createElement(\"div\")"));
  });

  test("one sink source: every Appendix H entry agrees with url.scrml's executable-sink table (no second list)", () => {
    const S = mods()["host-surface"];
    expect(S.surfaceEntries().map((e) => [e.id, S.entryConflict(e)]).filter((x) => x[1] !== "")).toEqual([]);
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

  test("a tape ARGUMENT fits no v1 slot (E-HOST-ARG-TYPE); an enum RESULT is not an entry's result (E-HOST-RESULT-TYPE)", () => {
    expect(codes(P("  f(xs: int[]) -> bool = navigator.vibrate(xs)"))).toEqual(["E-HOST-ARG-TYPE"]);
    expect(codes(P("  f() -> Mode = document.title", "<p>x</p>", "    type Mode:enum = { A, B }"))).toEqual(["E-HOST-RESULT-TYPE"]);
  });

  test("a DOM element type is a built-in host type (Appendix H, ruling Q2): accepted as a parameter, its read entries walked", () => {
    clean(P("  paused(v: HTMLVideoElement) -> bool = v.paused"));
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
// Rule 15 — closed handles. Since the allowlist (ruling Q2) a no-src `<host>` has no user-named
// handle (E-HOST-TYPE-NO-SRC): a non-DOM Appendix H interface (here `MediaQueryList`) is the
// closed handle (rule 15 as amended).
// =============================================================================
describe("rule 15 — handles are closed (a non-DOM Appendix H interface; `type Name:host` outside a `<host>`)", () => {
  const H = "  mq(q: string) -> MediaQueryList = window.matchMedia(q)\n  matches(m: MediaQueryList) -> bool = m.matches\n  rect(e: Element) -> DOMRect = e.getBoundingClientRect()";
  test("`type X:host` outside a `<host>`: E-HOST-TYPE-OUTSIDE", () => {
    expect(codes("<program>\n${\n    type X:host\n}\n<p>x</p>\n</program>\n")).toContain("E-HOST-TYPE-OUTSIDE");
  });

  test("a member read / method call on a non-DOM interface value: E-HOST-HANDLE-MEMBER (naming the binding to declare)", () => {
    const src = P(H, "<p>${f()}</p>", "    function f() -> bool {\n        const m: MediaQueryList = mq(\"(min-width: 1px)\");\n        return m.matches;\n    }");
    expect(codes(src)).toEqual(["E-HOST-HANDLE-MEMBER"]);
    expect(errs(run(src))[0].message).toContain("<host>");
    const src2 = P(H, "<p>${f()}</p>", "    function f() -> bool {\n        const m: MediaQueryList = mq(\"x\");\n        return m.addListener();\n    }");
    expect(codes(src2)).toEqual(["E-HOST-HANDLE-MEMBER"]);
  });

  test("a member access on a DOM element type is NOT E-HOST-HANDLE-MEMBER (rule 16: DOM members stay open) — open access is refused by name in the bootstrap", () => {
    const src = P("  body() -> HTMLElement | not = document.body", "<p>${f()}</p>", "    function f() -> string {\n        const b: HTMLElement | not = body();\n        return b.title;\n    }");
    const r = run(src);
    expect(errs(r).map((d) => d.code)).not.toContain("E-HOST-HANDLE-MEMBER");
    expect(errs(r).map((d) => d.code)).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });

  test("`==` on handles: E-EQ-003", () => {
    expect(codes(P(H, "<p>${f()}</p>", "    function f() -> bool {\n        return mq(\"a\") == mq(\"b\");\n    }"))).toContain("E-EQ-003");
  });

  test("a struct field holding a handle: E-HOST-HANDLE-NOT-DATA", () => {
    expect(codes(P(H, "<p>x</p>", "    type Pair:struct = { m: MediaQueryList, n: int }"))).toContain("E-HOST-HANDLE-NOT-DATA");
  });

  test("a server function taking a handle: E-HOST-HANDLE-NOT-DATA", () => {
    expect(codes(P(H, "<p>x</p>", "    server function s(m: MediaQueryList) -> int {\n        return 1;\n    }"))).toContain("E-HOST-HANDLE-NOT-DATA");
  });

  test("a handle is nominal and cannot be forged: `{}` is not a `MediaQueryList`, a `DOMRect` is not one, a string is not one", () => {
    expect(codes(P(H, "<p>${f()}</p>", "    function f() -> bool {\n        const m: MediaQueryList = {};\n        return matches(m);\n    }"))).toEqual(["E-TYPE-STRUCT-CONTEXT"]);
    expect(codes(P(H, "<p>x</p>", "    function f(e: Element) -> bool {\n        const r: DOMRect = rect(e);\n        return matches(r);\n    }"))).toEqual(["E-TYPE-031"]);
    expect(codes(P(H, "<p>${matches(\"x\")}</p>"))).toEqual(["E-TYPE-031"]);
  });

  test("a handle has no text: displayed, templated or joined, it is refused (no host toString runs)", () => {
    expect(codes(P(H, "<p>${mq(\"x\")}</p>"))).toEqual(["E-TEXT-NON-PRIMITIVE"]);
    expect(codes(P(H, "<p>${f()}</p>", "    function f() -> string {\n        const m: MediaQueryList = mq(\"x\");\n        return `v=${m}`;\n    }"))).toEqual(["E-TEXT-NON-PRIMITIVE"]);
    expect(codes(P(H, "<p>${f()}</p>", "    function f() -> string {\n        const xs: MediaQueryList[] = [mq(\"x\")];\n        return xs.join(\",\");\n    }"))).toEqual(["E-TYPE-031"]);
    expect(codes(P(H, "<p>${f()}</p>", "    function f() -> bool {\n        const m: MediaQueryList = mq(\"x\");\n        if (m) {\n            return true;\n        }\n        return false;\n    }"))).toEqual(["E-COND-NOT-BOOLEAN"]);
  });

  test("a cell holding a handle: refused by name (E-BOOTSTRAP-UNSUPPORTED)", () => {
    const src = `<host>\n${H}\n</host>\n<program>\nlet <m:MediaQueryList | not = not/>\n<p>x</p>\n</program>\n`;
    expect(codes(src)).toContain("E-BOOTSTRAP-UNSUPPORTED");
  });
});

// =============================================================================
// Emission (rules 7, 12, 13, 18) — in happy-dom, through surface bindings only. The decode of
// ARBITRARY host values (the probe values #1659 injected as `window.probe.*`, which is off the
// surface now) is exercised directly on runtime.js's hostCall below; end to end it returns with
// `src=` fixtures when lane A's static export read lands (design §10 step 6).
// =============================================================================
const HOSTS = [
  "  title() -> string = document.title",
  "  setTitle(t: string) = document.title = t",
  "  lang() -> string = navigator.language",
  "  langs() -> string[] = navigator.languages",
  "  mq(q: string) -> MediaQueryList = window.matchMedia(q)",
  "  matches(m: MediaQueryList) -> bool = m.matches",
  "  byId(id: string) -> Element | not = document.getElementById(id)",
  "  idOf(e: Element) -> string = e.id",
  "  byIdH(id: string) -> HTMLElement | not = document.getElementById(id)",
  "  anchor(id: string) -> HTMLAnchorElement | not = document.getElementById(id)",
  "  setText(e: HTMLElement, s: string) = e.textContent = s",
  "  go(a: HTMLAnchorElement, u: string) = a.href = u",
  "  setAttr(e: Element, s: string) = e.setAttribute(\"title\", s)",
].join("\n");
const EXPOSE = ["title", "setTitle", "lang", "langs", "mq", "matches", "byId", "idOf", "byIdH", "anchor", "setText", "go", "setAttr"];
const PROG = P(HOSTS, "<p id=\"t\">${title()}</p>");

describe("emission — the target as literal JavaScript, the result checked (rules 7, 13, 18)", () => {
  let program;
  let out;
  beforeAll(async () => {
    const r = clean(PROG);
    ({ program, out } = await loadProgram(r.core, "s473-hb-" + k++, EXPOSE));
    document.title = "hello";
  }, 120000);

  test("the target is printed in place — no Function constructor, no eval, roots read through the runtime", () => {
    expect(out.js).toContain("hostCall(");
    expect(out.js).toContain("hostRoot(\"document\").title");
    expect(out.js).not.toMatch(/new Function|\beval\(/);
  });

  test("a read, a write, a tape decode, an interface handle passed from one binding to the next", () => {
    expect(document.querySelector("#t").textContent).toBe("program");
    expect(program.title()).toBe("hello");
    program.setTitle("bye");
    expect(document.title).toBe("bye");
    expect(typeof program.lang()).toBe("string");
    expect(Array.isArray(program.langs())).toBe(true);
    // (matchMedia is not run: happy-dom's result is not a platform MediaQueryList, so the r8.7 brand check refuses it)
    expect(program.byId("t")).not.toBe(null);
    expect(program.idOf(program.byId("t"))).toBe("t");
    expect(program.byId("nope")).toBe(null);
  });

  // s473-host-allowlist-b, the lane merge: a COMPILED guarded binding runs through runtime.js's guards
  test("rule 8.5 / 8.7 end to end: a downcast is brand-checked; textContent on a <script> traps E-HOST-RECEIVER-RT; a javascript: href is written as about:blank", () => {
    const sx = document.createElement("script"); sx.id = "sx"; document.body.appendChild(sx);
    const px = document.createElement("p"); px.id = "px"; document.body.appendChild(px);
    const ax = document.createElement("a"); ax.id = "ax"; document.body.appendChild(ax);
    try {
      expect(trapOf(() => program.setText(program.byIdH("sx"), "window.__pwn = 1"))).toBe("E-HOST-RECEIVER-RT");
      expect(sx.textContent).toBe("");
      program.setText(program.byIdH("px"), "ok");
      expect(px.textContent).toBe("ok");
      expect(trapOf(() => program.anchor("px"))).toBe("E-HOST-VALUE-MISMATCH-RT");   // a <p> is not an HTMLAnchorElement
      program.go(program.anchor("ax"), "javascript:alert(1)");
      expect(ax.getAttribute("href")).toBe("about:blank");
      program.go(program.anchor("ax"), "https://example.com/");
      expect(ax.getAttribute("href")).toBe("https://example.com/");
      program.setAttr(program.byIdH("px"), "hi");
      expect(px.getAttribute("title")).toBe("hi");
    } finally { sx.remove(); px.remove(); ax.remove(); }
  });
});

// The rule 13 / 18 decode on hostCall (runtime.js) — the values #1659's probe bindings returned.
describe("runtime.js — the rule 13 decode and rule 18 throw on hostCall (the #1659 probe values, ported)", () => {
  const M = "E-HOST-VALUE-MISMATCH-RT";
  const S = { k: "string" }, I = { k: "int" }, N = { k: "number" };
  const call = (v, ty) => hostCall(() => v, ty, "t()");
  const callF = (f, ty) => hostCall(f, ty, "t()");
  const RECT = { k: "struct", name: "Rect", fields: [{ name: "w", ty: N }, { name: "h", ty: N }] };
  const OPT = { k: "struct", name: "Opt", fields: [{ name: "name", ty: S }, { name: "admin", ty: { k: "maybe", inner: { k: "bool" } } }] };
  const TAPE = { k: "tape", elem: S };

  test("scalars by typeof: a boxed string, a fractional int, an out-of-range int, null for non-optional are mismatches; `T | not` admits null", () => {
    expect(trapOf(() => call(new String("x"), S))).toBe(M);
    expect(trapOf(() => call(1.5, I))).toBe(M);
    expect(trapOf(() => call(2 ** 53, I))).toBe(M);
    expect(trapOf(() => call(null, S))).toBe(M);
    expect(call(null, { k: "maybe", inner: S })).toBe(null);
    expect(call(undefined, { k: "maybe", inner: S })).toBe(null);
    expect(call(NaN, N)).toBeNaN();
  });

  test("N1 — a WebIDL-style accessor on the prototype is READ (once per field); extra members dropped", () => {
    let reads = 0;
    class RectLike { get w() { reads++; return 3; } get h() { reads++; return 4; } }
    expect(call(new RectLike(), RECT)).toEqual({ w: 3, h: 4 });
    expect(reads).toBe(2);
    expect(Object.keys(call({ w: 1, h: 2, extra: "dropped" }, RECT))).toEqual(["w", "h"]);
  });

  test("N1 — a polluted Object.prototype cannot supply a field", () => {
    Object.prototype.admin = true;
    Object.prototype.name = "polluted";
    try {
      expect(call({ name: "real" }, OPT)).toEqual({ name: "real", admin: null });
      expect(trapOf(() => call({}, OPT))).toBe(M);
    } finally {
      delete Object.prototype.admin;
      delete Object.prototype.name;
    }
  });

  test("a field named `__proto__` cannot reshape the decoded value", () => {
    const v = call(JSON.parse('{"name":"n","admin":false,"__proto__":{"polluted":1}}'), OPT);
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
    expect(v.polluted).toBe(undefined);
  });

  test("a getter that throws during the decode: E-HOST-THROW-RT", () => {
    expect(trapOf(() => call({ get w() { throw new Error("boom"); }, h: 1 }, RECT))).toBe("E-HOST-THROW-RT");
  });

  test("a tape is an Array.isArray value: a NodeList and an array-like are mismatches", () => {
    expect(call(["en", "fr"], TAPE)).toEqual(["en", "fr"]);
    expect(trapOf(() => call(["en", 1], TAPE))).toBe(M);
    expect(trapOf(() => call({ length: 1, 0: "en" }, TAPE))).toBe(M);
    expect(trapOf(() => call(document.querySelectorAll("p"), TAPE))).toBe(M);
  });

  test("a thenable result of a non-waiting binding: a mismatch naming `-> waiting void`, its rejection handled; `then` read once", async () => {
    let e;
    try { callF(() => Promise.reject(new Error("late")), { k: "void" }); } catch (x) { e = x; }
    expect(e.code).toBe(M);
    expect(e.message).toContain("-> waiting void");
    await settle();
    expect(takePageErrors()).toEqual([]);
    let thenReads = 0;
    expect(trapOf(() => call({ get then() { thenReads++; return (a, b) => {}; } }, S))).toBe(M);
    expect(thenReads).toBe(1);
  });

  test("rule 18 — a throw is E-HOST-THROW-RT; a thrown object's toString / valueOf / Symbol.toPrimitive never run", () => {
    let converted = false;
    const evil = { get message() { return 5; }, toString() { converted = true; return "x"; }, valueOf() { converted = true; return 1; }, [Symbol.toPrimitive]() { converted = true; return "p"; } };
    let e;
    try { callF(() => { throw evil; }, { k: "void" }); } catch (x) { e = x; }
    expect(e.code).toBe("E-HOST-THROW-RT");
    expect(e.message).toContain("a non-Error value was thrown");
    expect(converted).toBe(false);
    try { callF(() => { throw new TypeError("nope"); }, { k: "void" }); } catch (x) { e = x; }
    expect([e.code, e.detail.name, e.detail.message]).toEqual(["E-HOST-THROW-RT", "TypeError", "nope"]);
  });

  test("handles: an object crosses as itself; a null handle is a mismatch", () => {
    const obj = { v: 41 };
    const H = { k: "handle", name: "MediaQueryList" };
    expect(call(obj, H)).toBe(obj);
    expect(trapOf(() => call(null, H))).toBe(M);
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

  test("M2 — a struct field named `then` reads the `then` getter exactly ONCE (reused from the thenable check)", () => {
    let reads = 0;
    const seq = ["first", "second", "third"];
    const v = { get then() { return seq[reads++]; }, name: "n" };
    const ty = { k: "struct", name: "S", fields: [{ name: "then", ty: { k: "string" } }, { name: "name", ty: { k: "string" } }] };
    const out = hostCall(() => v, ty, "t()");
    // one read total — the thenable check — reused for the field; value is that one read ("first")
    expect([reads, out.then, out.name]).toEqual([1, "first", "n"]);
  });

  test("M1 (direct) — Array.prototype / Function.prototype pollution cannot supply a struct field; a tape hole is own-only", () => {
    const structTy = { k: "struct", name: "Opt", fields: [{ name: "name", ty: { k: "string" } }, { name: "admin", ty: { k: "maybe", inner: { k: "bool" } } }] };
    const tapeTy = { k: "tape", elem: { k: "string" } };
    Array.prototype.admin = true;
    Array.prototype[1] = "proto-polluted";
    try {
      // an array for a struct type is a mismatch regardless of Array.prototype.admin
      expect(trapOf(() => hostCall(() => Object.assign([], { name: "n" }), structTy, "t()"))).toBe("E-HOST-VALUE-MISMATCH-RT");
      // a sparse tape: index 1 is a hole → absent (own-only), never the polluted value → a required string element is a mismatch
      const sparse = ["a"]; sparse[2] = "c";
      expect(trapOf(() => hostCall(() => sparse, tapeTy, "t()"))).toBe("E-HOST-VALUE-MISMATCH-RT");
      // an optional element tape keeps the hole as `not`, never the polluted value
      const optTape = { k: "tape", elem: { k: "maybe", inner: { k: "string" } } };
      expect(hostCall(() => sparse, optTape, "t()")).toEqual(["a", null, "c"]);
    } finally {
      delete Array.prototype.admin;
      delete Array.prototype[1];
    }
  });

  test("M1 (direct) — a cross-realm-style terminal (null-prototype object) is the Object.prototype boundary: pollution on it is absent", () => {
    // a null-prototype object standing in for another realm's Object.prototype, with a field on it
    const foreignProto = Object.create(null);
    foreignProto.isAdmin = true;
    const v = Object.create(foreignProto); // v -> foreignProto(terminal) -> null
    v.name = "n";
    const ty = { k: "struct", name: "S", fields: [{ name: "name", ty: { k: "string" } }, { name: "isAdmin", ty: { k: "maybe", inner: { k: "bool" } } }] };
    // isAdmin sits only on the terminal → absent → `not`, never the polluted `true`
    expect(hostCall(() => v, ty, "t()")).toEqual({ name: "n", isAdmin: null });
  });
});
