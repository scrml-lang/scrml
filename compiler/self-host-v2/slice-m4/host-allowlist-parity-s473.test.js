// host-allowlist-parity-s473.test.js — s473-host-allowlist-b: the proof that the TYPED CHAIN WALK
// (DRAFT SPEC §21.3.3 rule 8, Appendix H; analyze.scrml hostWalk) refuses everything #1659's
// INTERIM fail-closed denylist refused, before that denylist (parse.scrml hostSinkWhy,
// hostExecSink, hostRealmResultWord, hostWriteSinkWord) was deleted.
//
// Ruling (scrml-support/user-voice-scrml.md, S473 "⭐ RULED — `<host>` rule 8 moves from a sink
// denylist to an allowlist"): "The S473 fail-closed denylist … is the INTERIM and stays until the
// allowlist lands." The brief: delete the denylist "only once the walk refuses everything they did".
//
// DENYLIST_REFUSED is generated, not hand-picked: every binding line of the #1659 review corpora
// (~/.cache/scrml/review/s473-1659/{cases1,cases2}.json, r1/{cases_attack,cases_srv,cases_srv2}.json)
// and of the #1659 test file, compiled by the #1659 head (92b1c1b80's tree), kept when it drew
// E-HOST-TARGET-SINK. 220 lines read, 87 refused.

import { describe, test, expect, beforeAll } from "bun:test";
import { mods } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";

beforeAll(() => { mods(); }, { timeout: 120000 });

const run = (src) => frontEnd(mods(), [{ path: "app.scrml", src }], "app.scrml");
const codes = (src) => run(src).diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info").map((d) => d.code);
const P = (host) => `<host>\n${host}\n</host>\n<program>\n<p>x</p>\n</program>\n`;

export const DENYLIST_REFUSED = [
  "attrs(e: Fn) -> Fn = e.attributes",
  "doc() -> D = window.document",
  "doc() -> Fn = window.document",
  "docOpen(u: string, n: string, f: string) = document.open(u, n, f)",
  "f(h: H, n: string, s: string) = h.setAttribute(n, s)",
  "f(h: H, s: string) = h.innerHTML = s",
  "f(h: H, s: string) = h.outerHTML = s",
  "f(h: H, s: string) = h.ownerDocument.write(s)",
  "f(h: H, s: string) = h.srcdoc = s",
  "f(h: H, s: string) = window.Object.assign(h, { innerHTML: s })",
  "f(h: H, u: string) = h.contentWindow.location.href = u",
  "f(h: H, u: string) = h.ownerDocument.defaultView.open(u)",
  "f(s: string) -> int = new window.Function(s)",
  "f(s: string) -> int = window.eval(s)",
  "f(s: string) = document.write(s)",
  "f(s: string) = document.writeln(s)",
  "f(s: string) = window.eval.call(s)",
  "f(s: string) = window.setTimeout(s, 0)",
  "f(u: string) = document.location = u",
  "f(u: string) = window.location.assign(u)",
  "f(u: string) = window.location.href = u",
  "f(u: string) = window.location.replace(u)",
  "f(u: string) = window.open(u)",
  "f(u: string) = window.self.open(u)",
  "frameDoc(e: Fn) -> Fn = e.contentDocument",
  "frameWin(e: Fn) -> Fn = e.contentWindow",
  "getAttr(e: Fn, n: string) -> Fn = e.getAttributeNode(n)",
  "getE() -> Fn = window.eval",
  "getEval() -> Fn = window.eval",
  "getF() -> Fn = window.Function",
  "getR() -> Fn = window.Reflect",
  "getT() -> Fn = window.setTimeout",
  "go(l: L, u: string) = l.assign(u)",
  "go(s: string) -> H = new window.Function(s)",
  "go(u: string) = document.defaultView.open(u)",
  "go(u: string) = document.location = u",
  "go(u: string) = window.frames.open(u)",
  "go(u: string) = window.location.href = u",
  "go(u: string) = window.top.location.href = u",
  "go(u: string) = window.window.open(u)",
  "go(w: W, u: string) = w.open(u)",
  "h(e: E, a: E) = e.attributes.setNamedItem(a)",
  "h(e: E, a: E) = e.setAttributeNode(a)",
  "h(e: E, s: string) = e.outerHTML = s",
  "h(e: E, s: string) = e.setAttribute(\"SRCDOC\", s)",
  "h(e: E, s: string) = e.srcdoc = s",
  "loc() -> Fn = document.location",
  "loc() -> L = document.location",
  "loc() -> L = window.location",
  "me() -> W = window.self",
  "mk(n: string) -> E = document.createAttribute(n)",
  "mkAttr(n: string) -> Fn = document.createAttribute(n)",
  "mkWorker(u: string) -> Fn = new window.Worker(u)",
  "nav(u: string) = window.navigation.navigate(u)",
  "navTo(u: string) = window.navigation.navigate(u)",
  "op(u: string) = document.open(u, \"x\", \"\")",
  "op(w: W, u: string) = w.open(u)",
  "q(e: E, s: string) = e.__defineSetter__(s)",
  "q(o: E, s: string) = o.insertAdjacentHTML.call(o, \"beforeend\", s)",
  "q(o: E, s: string) = window.Object.assign(o, {innerHTML: s})",
  "q(o: E, s: string) = window.Object.defineProperty(o, \"innerHTML\", s)",
  "refl() -> R = window.Reflect",
  "reg(u: string) = navigator.serviceWorker.register(u)",
  "setNamed(m: H, a: H) = m.setNamedItem(a)",
  "setNode(e: Fn, a: Fn) = e.setAttributeNode(a)",
  "setNodeVal(a: H, s: string) = a.nodeValue = s",
  "setTC(e: H, s: string) = e.textContent = s",
  "setText(e: H, s: string) = e.text = s",
  "setVal(a: H, s: string) = a.value = s",
  "st() -> Fn = window.setTimeout",
  "st(s: string) = window.setTimeout(s)",
  "sw(u: string) = navigator.serviceWorker.register(u)",
  "t(e: E, s: string) = e.text = s",
  "t(e: E, s: string) = e.textContent = s",
  "t(location: W, u: string) = location.assign(u)",
  "t(self: W, u: string) = self.open(u)",
  "t(top: W, u: string) = top.open(u)",
  "v(a: E, s: string) = a.value = s",
  "w() -> W = window.frames",
  "w() -> W = window.globalThis",
  "w() -> W = window.opener",
  "w() -> W = window.self",
  "w(d: D, s: string) = d.write(s)",
  "win() -> Fn = document.defaultView",
  "win() -> W = document.defaultView",
  "wk(u: string) -> H = new window.Worker(u)",
  "x(s: string) = document.execCommand(\"insertHTML\", false, s)",
];

// =============================================================================
// THE PARITY PROOF. Each line above is substituted with EVERY Appendix H interface for its
// user-named handle type(s) (the most capable typing a program could give it — the type lines
// themselves are E-HOST-TYPE-NO-SRC now, so they are dropped), then compiled. The walk SHALL
// refuse it, unless the line at that typing is an Appendix H entry whose admission criterion P
// holds (listed below, each with why — these are the INTERIM's fail-closed OVER-refusals that
// the bootstrap made only because it had no interface types: an `HTMLInputElement.value` write
// is not an `Attr` value, a closed `Document` / `Location` handle exposes no sink).
// =============================================================================
const INTERFACES = mods()["host-surface"].surfaceInterfaces().map((f) => f.name);
const ADMITTED_BY_DESIGN = new Map([
  // a read of a closed interface value: the handle has only surface members (rule 8.3), none a sink
  ["doc() -> D = window.document|D=Document", "Window.document (H-001) — a Document handle reaches only Document entries"],
  ["doc() -> D = window.document|D=Node", "a widening of H-001's Document result (rule 8.4)"],
  ["doc() -> D = window.document|D=EventTarget", "a widening of H-001's Document result (rule 8.4)"],
  ["doc() -> Fn = window.document|Fn=Document", "Window.document (H-001)"],
  ["doc() -> Fn = window.document|Fn=Node", "a widening of H-001"],
  ["doc() -> Fn = window.document|Fn=EventTarget", "a widening of H-001"],
  ["loc() -> L = window.location|L=Location", "Window.location (H-005) — Location is read-only on the surface"],
  // HTMLInputElement.value write (H-104): an input's value is form data, never script text or an Attr
  ["setVal(a: H, s: string) = a.value = s|H=HTMLInputElement", "HTMLInputElement.value write (H-104)"],
  ["v(a: E, s: string) = a.value = s|E=HTMLInputElement", "HTMLInputElement.value write (H-104)"],
]);

const subst = (line, map) => line.replace(/\b([A-Z]\w*)\b/g, (m) => (m in map ? map[m] : m));
const userTypes = (line) => [...new Set([...line.matchAll(/(?::|->)\s*([A-Z]\w*)/g)].map((x) => x[1]))].filter((n) => !INTERFACES.includes(n));

describe("parity — every line the #1659 INTERIM denylist refused is refused by the typed walk, at every typing", () => {
  test("the fixture is the denylist's own output (87 lines) and every line names something", () => {
    expect(DENYLIST_REFUSED.length).toBe(87);
  });

  test("refused under every Appendix H typing (or listed above with its P argument)", () => {
    const admitted = [];
    for (const line of DENYLIST_REFUSED) {
      const names = userTypes(line);
      const typings = names.length === 0 ? [{}] : INTERFACES.flatMap((a) => (names.length === 1 ? [{ [names[0]]: a }] : INTERFACES.map((b) => ({ [names[0]]: a, [names[1]]: b }))));
      for (const map of typings) {
        const l = subst(line, map);
        const key = line + "|" + Object.entries(map).map(([k, v]) => k + "=" + v).join(",");
        const cs = codes(P("  " + l));
        if (cs.length === 0 && !ADMITTED_BY_DESIGN.has(key)) admitted.push(key);
        if (cs.length > 0 && ADMITTED_BY_DESIGN.has(key)) admitted.push("LISTED BUT REFUSED: " + key + " " + cs);
      }
    }
    expect(admitted).toEqual([]);
  }, 600000);
});
