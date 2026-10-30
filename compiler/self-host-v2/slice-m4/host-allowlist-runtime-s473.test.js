// host-allowlist-runtime-s473.test.js — s473-host-allowlist-a (lane A, design §10 step 4): the
// RUN-TIME half of the `<host>` allowlist (DRAFT §21.3.3 rule 8.5 / 8.7), in happy-dom. The same
// must-refuse cases run in a real Chromium in host-allowlist-chromium-s473.test.js (opt-in).
//
// Ruling (scrml-support/user-voice-scrml.md S473, "⭐ RULED — `<host>` rule 8 moves from a sink
// denylist to an allowlist"): "A binding may call or read only what the allowlist admits; everything
// else is refused at compile time." Design: scrml-support/docs/deep-dives/
// host-binding-allowlist-design-2026-10-29.md §5.3 (brand checks), §5.5 (the three guards), §9
// (E-HOST-RECEIVER-RT).
//
// Must-refuse (#1659 r1 review R1, ~/.cache/scrml/review/s473-1659/r1/REVIEW.md): createElement
// ('script') + `.src = url` + appendChild loads and runs remote JS. The run-time half refuses every
// mutation of a `<script>` (and `<iframe>`, `<base>`, `<meta>`, `<link>`, `<style>`, `<object>`,
// `<embed>`, `<form>`, a custom element, an SVG element) with E-HOST-RECEIVER-RT, and judges every
// URL write by the §5.2 rule 3 guard (`javascript:` → `about:blank`).
//
// Red on base: every test — base's runtime has none of hostInert / hostUrl / hostAttrValue /
// hostSetAttrName / hostBrand / hostCallback / HOST_INERT_ELEMENTS, and no `iface` descriptor.

import { describe, test, expect, beforeAll } from "bun:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../slice-m1/load-program.js"; // registers happy-dom BEFORE the runtime captures its getters

// A FRESH runtime instance, evaluated against the CURRENT window (as slice-m1/load-program.js loads
// one per program): the guards capture the platform's getters and interface objects when the module
// is evaluated, and a combined run may have evaluated the shared module before happy-dom was
// registered, or swapped the window since (conformance adapters do).
let rt;
beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "s473-host-allowlist-rt-"));
  copyFileSync(join(import.meta.dir, "..", "slice-m1", "runtime", "runtime.js"), join(dir, "runtime.js"));
  rt = await import(join(dir, "runtime.js"));
  rmSync(dir, { recursive: true, force: true });
});

const AT = "t() — the `<host>` binding";
const trapOf = (f) => {
  try { f(); return "no trap"; } catch (e) { return e instanceof rt.ScrmlTrap ? e.code : "raw " + String(e && e.message); }
};
const el = (tag, ns) => (ns ? document.createElementNS(ns, tag) : document.createElement(tag));
const quiet = (f) => {
  const ce = console.error;
  const seen = [];
  console.error = (...a) => seen.push(a.join(" "));
  try { return { v: f(), seen }; } finally { console.error = ce; }
};

describe("guarded(inert-receiver) — hostInert, E-HOST-RECEIVER-RT", () => {
  test("R1: a <script> receiver is refused — its src, its text and its attributes are never written", () => {
    const s = el("script");
    expect(trapOf(() => rt.hostInert(s, AT))).toBe("E-HOST-RECEIVER-RT");
    // the guarded emission shape: the receiver is judged BEFORE the member runs
    expect(trapOf(() => { rt.hostInert(s, AT).src = "http://evil.example/x.js"; })).toBe("E-HOST-RECEIVER-RT");
    expect(trapOf(() => { rt.hostInert(s, AT).textContent = "window.__x = 1"; })).toBe("E-HOST-RECEIVER-RT");
    expect(trapOf(() => rt.hostInert(s, AT).setAttribute("src", "http://evil.example/x.js"))).toBe("E-HOST-RECEIVER-RT");
    expect(s.getAttribute("src")).toBe(null);
    expect(s.textContent).toBe("");
  });

  test("R1 class: iframe, frame, base, meta, link, style, object, embed, template, slot, form, noscript, title are refused", () => {
    for (const t of ["iframe", "frame", "frameset", "base", "meta", "link", "style", "object", "embed", "template", "slot", "form", "noscript", "title", "head", "body", "html"]) {
      expect([t, trapOf(() => rt.hostInert(el(t), AT))]).toEqual([t, "E-HOST-RECEIVER-RT"]);
    }
  });

  test("a custom element (a hyphenated name) is refused", () => {
    expect(trapOf(() => rt.hostInert(el("x-widget"), AT))).toBe("E-HOST-RECEIVER-RT");
  });

  test("a non-HTML element is refused — an SVG <script>, an SVG <a>, a MathML element (the namespace test)", () => {
    const SVG = "http://www.w3.org/2000/svg";
    expect(trapOf(() => rt.hostInert(el("script", SVG), AT))).toBe("E-HOST-RECEIVER-RT");
    expect(trapOf(() => rt.hostInert(el("a", SVG), AT))).toBe("E-HOST-RECEIVER-RT");
    expect(trapOf(() => rt.hostInert(el("div", SVG), AT))).toBe("E-HOST-RECEIVER-RT");
    expect(trapOf(() => rt.hostInert(el("mi", "http://www.w3.org/1998/Math/MathML"), AT))).toBe("E-HOST-RECEIVER-RT");
  });

  test("not an element at all — a plain object posing as one, a text node, null — is refused", () => {
    expect(trapOf(() => rt.hostInert({ localName: "div", namespaceURI: "http://www.w3.org/1999/xhtml" }, AT))).toBe("E-HOST-RECEIVER-RT");
    expect(trapOf(() => rt.hostInert(Object.create(HTMLDivElement.prototype), AT))).toBe("E-HOST-RECEIVER-RT");
    expect(trapOf(() => rt.hostInert(document.createTextNode("x"), AT))).toBe("E-HOST-RECEIVER-RT");
    expect(trapOf(() => rt.hostInert(null, AT))).toBe("E-HOST-RECEIVER-RT");
    expect(trapOf(() => rt.hostInert(undefined, AT))).toBe("E-HOST-RECEIVER-RT");
  });

  test("the local name is read through the CAPTURED Element.prototype getter — an own `localName` on a <script> does not pass it", () => {
    const s = el("script");
    Object.defineProperty(s, "localName", { value: "div" });
    Object.defineProperty(s, "namespaceURI", { value: "http://www.w3.org/1999/xhtml" });
    expect(s.localName).toBe("div");
    expect(trapOf(() => rt.hostInert(s, AT))).toBe("E-HOST-RECEIVER-RT");
  });

  test("an inert element passes, and the member runs", () => {
    for (const t of ["div", "span", "p", "button", "canvas", "img", "a", "input", "td", "video"]) {
      const e = el(t);
      expect(rt.hostInert(e, AT)).toBe(e);
    }
    const d = el("div");
    rt.hostInert(d, AT).textContent = "hi";
    expect(d.textContent).toBe("hi");
  });

  test("the trap names the element and the rule; the list is an allowlist with no hyphenated or dangerous tag", () => {
    let msg = "";
    try { rt.hostInert(el("script"), AT); } catch (e) { msg = e.message; }
    expect(msg).toContain("<script>");
    expect(msg).toContain("§21.3.3 rule 8.5");
    for (const t of rt.HOST_INERT_ELEMENTS) expect(t.includes("-")).toBe(false);
    for (const bad of ["script", "style", "base", "meta", "link", "iframe", "frame", "object", "embed", "template", "slot", "form"]) {
      expect(rt.HOST_INERT_ELEMENTS.includes(bad)).toBe(false);
    }
    expect(Object.isFrozen(rt.HOST_INERT_ELEMENTS)).toBe(true);
  });
});

describe("guarded(url) — the §5.2 rule 3 guard, reused (hostUrl / hostAttrValue)", () => {
  test("R1 class: a.href = javascript: is written as about:blank, reported once without the value", () => {
    const a = el("a");
    const { v, seen } = quiet(() => rt.hostUrl(rt.hostInert(a, AT), "href", "javascript:alert(document.cookie)", AT));
    expect(v).toBe("about:blank");
    expect(seen.length).toBe(1);
    expect(seen[0]).not.toContain("cookie");
  });

  test("an admitted URL is the value as the write converts it; a relative URL passes", () => {
    expect(rt.hostUrl(el("a"), "href", "https://example.com/x", AT)).toBe("https://example.com/x");
    expect(rt.hostUrl(el("a"), "href", "/users/1", AT)).toBe("/users/1");
    expect(rt.hostUrl(el("img"), "src", "data:image/png;base64,AAAA", AT)).toBe("data:image/png;base64,AAAA");
  });

  test("the same reader as markup: java<TAB>script:, leading spaces, data:text/html, vbscript:, blob: are refused", () => {
    for (const u of ["java\tscript:alert(1)", "  javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x", "blob:https://x/y"]) {
      expect([u, quiet(() => rt.hostUrl(el("img"), "src", u, AT)).v]).toEqual([u, "about:blank"]);
    }
  });

  test("setAttribute's value: the URL guard iff the name is URL-valued on the receiver's element", () => {
    expect(quiet(() => rt.hostAttrValue(el("a"), "href", "javascript:x", AT)).v).toBe("about:blank");
    expect(quiet(() => rt.hostAttrValue(el("a"), "HREF", "javascript:x", AT)).v).toBe("about:blank");
    expect(quiet(() => rt.hostAttrValue(el("button"), "formaction", "javascript:x", AT)).v).toBe("about:blank");
    expect(quiet(() => rt.hostAttrValue(el("video"), "poster", "javascript:x", AT)).v).toBe("about:blank");
    // a non-URL attribute keeps the data's value
    expect(rt.hostAttrValue(el("div"), "title", "javascript:x", AT)).toBe("javascript:x");
    // `action` is a URL on <form> only (element-scoped, as §5.2 scopes it)
    expect(rt.hostAttrValue(el("div"), "action", "javascript:x", AT)).toBe("javascript:x");
    expect(quiet(() => rt.hostAttrValue(el("form"), "action", "javascript:x", AT)).v).toBe("about:blank");
  });
});

describe("guarded(attr-name) — the run-time wall (hostSetAttrName)", () => {
  test("an event-handler name, `srcdoc` or a non-string is refused; `one` / `online` / `onboarding` and ordinary names pass", () => {
    for (const n of ["onclick", "OnLoad", "onerror", "srcdoc", "SRCDOC", "", 7, null]) {
      expect(() => rt.hostSetAttrName(n, AT)).toThrow(/a compiler defect/);
    }
    for (const n of ["title", "one", "online", "onboarding", "data-x", "aria-label"]) expect(rt.hostSetAttrName(n, AT)).toBe(n);
  });
});

describe("brand checks (r8.7) — hostBrand and the `iface` result descriptor", () => {
  test("a platform object of the interface passes; a subinterface passes its superinterface", () => {
    const c = el("canvas");
    expect(rt.hostBrand(c, "HTMLCanvasElement", AT)).toBe(c);
    expect(rt.hostBrand(c, "HTMLElement", AT)).toBe(c);
    expect(rt.hostBrand(c, "Element", AT)).toBe(c);
    expect(rt.hostBrand(c, "Node", AT)).toBe(c);
    // (`EventTarget` is judged in Chromium only: under happy-dom's registrator the global
    // `EventTarget` is bun's, not the one happy-dom's nodes inherit from)
  });

  test("the wrong interface, `window` declared HTMLElement, a fake that borrows the prototype, a plain object: E-HOST-VALUE-MISMATCH-RT", () => {
    expect(trapOf(() => rt.hostBrand(el("div"), "HTMLCanvasElement", AT))).toBe("E-HOST-VALUE-MISMATCH-RT");
    expect(trapOf(() => rt.hostBrand(window, "HTMLElement", AT))).toBe("E-HOST-VALUE-MISMATCH-RT");
    expect(trapOf(() => rt.hostBrand(Object.create(HTMLCanvasElement.prototype), "HTMLCanvasElement", AT))).toBe("E-HOST-VALUE-MISMATCH-RT");
    expect(trapOf(() => rt.hostBrand({ getContext() {} }, "HTMLCanvasElement", AT))).toBe("E-HOST-VALUE-MISMATCH-RT");
    expect(trapOf(() => rt.hostBrand(null, "HTMLElement", AT))).toBe("E-HOST-VALUE-MISMATCH-RT");
  });

  test("an interface the realm did not have at start fails closed; `optional` admits null / undefined as `not`", () => {
    expect(trapOf(() => rt.hostBrand(el("div"), "NoSuchInterface", AT))).toBe("E-HOST-VALUE-MISMATCH-RT");
    expect(rt.hostBrand(null, "HTMLElement", AT, true)).toBe(null);
    expect(rt.hostBrand(undefined, "HTMLElement", AT, true)).toBe(null);
  });

  test("hostCall decodes a `{ k: \"iface\" }` result by the brand check (a downcast getElementById -> HTMLCanvasElement | not)", () => {
    const c = el("canvas");
    expect(rt.hostCall(() => c, { k: "iface", name: "HTMLCanvasElement" }, AT)).toBe(c);
    expect(rt.hostCall(() => null, { k: "maybe", inner: { k: "iface", name: "HTMLCanvasElement" } }, AT)).toBe(null);
    expect(trapOf(() => rt.hostCall(() => el("div"), { k: "iface", name: "HTMLCanvasElement" }, AT))).toBe("E-HOST-VALUE-MISMATCH-RT");
    expect(trapOf(() => rt.hostCall(() => window, { k: "iface", name: "HTMLElement" }, AT))).toBe("E-HOST-VALUE-MISMATCH-RT");
  });
});

describe("callback wrappers — hostCallback (memoized; arguments decoded)", () => {
  test("the same function and signature is the same wrapper, so removeEventListener removes the listener", () => {
    const b = el("button");
    let n = 0;
    const f = () => { n++; };
    const sig = [{ k: "iface", name: "Event" }];
    const w1 = rt.hostCallback(f, sig, AT);
    expect(rt.hostCallback(f, sig, AT)).toBe(w1);
    b.addEventListener("click", rt.hostCallback(f, sig, AT));
    b.dispatchEvent(new window.MouseEvent("click"));
    b.removeEventListener("click", rt.hostCallback(f, sig, AT));
    b.dispatchEvent(new window.MouseEvent("click"));
    expect(n).toBe(1);
  });

  test("a different signature is a different wrapper; the wrapper is never the function itself", () => {
    const f = () => {};
    expect(rt.hostCallback(f, [{ k: "number" }], AT)).not.toBe(rt.hostCallback(f, [{ k: "int" }], AT));
    expect(rt.hostCallback(f, [], AT)).not.toBe(f);
  });

  test("each argument is decoded against its declared type; extra arguments and `this` are dropped; nothing returns to the host", () => {
    let got = null;
    let self = "unset";
    const f = function (...xs) { got = xs; self = this; return "leak"; };
    const w = rt.hostCallback(f, [{ k: "number" }], AT);
    expect(w.call({ evil: 1 }, 16.5, "extra")).toBe(undefined);
    expect(got).toEqual([16.5]);
    expect(self).toBe(undefined);
    expect(trapOf(() => rt.hostCallback(() => {}, [{ k: "number" }], AT)("16"))).toBe("E-HOST-VALUE-MISMATCH-RT");
    expect(trapOf(() => rt.hostCallback(() => {}, [{ k: "iface", name: "MouseEvent" }], AT)({ clientX: 1 }))).toBe("E-HOST-VALUE-MISMATCH-RT");
  });

  test("a non-function in a callback slot is refused (a compiler defect, fail closed)", () => {
    expect(() => rt.hostCallback("alert(1)", [], AT)).toThrow(/a compiler defect/);
  });
});
