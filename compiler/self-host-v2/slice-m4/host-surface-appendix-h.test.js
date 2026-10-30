// host-surface-appendix-h.test.js — s473-host-allowlist-b: compiler/self-host-v2/host-surface.scrml
// MIRRORS SPEC Appendix H one-to-one (DRAFT §21.3.3 rule 8; ruling S473 Q1 "a curated surface typed by
// interface (SPEC Appendix H: interface · member · access · signature · safety class)", Q3 "There is no
// project-local surface"). A row in one and not the other, or any field that differs, fails here — the
// bootstrap's surface is never a second list. Also: every entry agrees with url.scrml's executable-sink
// table (the ONE sink source), every interface an entry names exists, and the inert list holds no
// script-running tag.

import { describe, test, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mods } from "./server-artifact-harness.js";
import { frontEnd } from "./harness.js";
import { HOST_INERT_ELEMENTS } from "../slice-m1/runtime/runtime.js";

let S;
beforeAll(() => { S = mods()["host-surface"]; }, { timeout: 120000 });

const SPEC = readFileSync(join(import.meta.dir, "..", "..", "SPEC.md"), "utf8");
const start = SPEC.indexOf("\n## Appendix H:");
const end = SPEC.indexOf("\n## ", start + 5);
const APPX = SPEC.slice(start, end);
const section = (h) => {
  const a = APPX.indexOf("\n#### " + h);
  const b = APPX.indexOf("\n#### ", a + 5);
  return APPX.slice(a, b < 0 ? APPX.length : b);
};
// table rows of a section (after the header + separator), cells trimmed, code ticks and \| unescaped
const rows = (sec) => sec.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("|---"))
  .slice(1).map((l) => l.slice(2, -2).split(/ (?<!\\)\| /).map((c) => c.trim().replace(/\\\|/g, "|").replace(/^`(.*)`$/, "$1")));

describe("Appendix H ⇄ host-surface.scrml (one-to-one)", () => {
  test("Appendix H exists and is DRAFT", () => {
    expect(start).toBeGreaterThan(0);
    expect(APPX).toContain("**Status: DRAFT (S473).**");
  });

  test("H.2 interfaces and inheritance", () => {
    const spec = rows(section("H.2")).map(([n, p, dom]) => [n, p === "—" ? "" : p, dom]);
    const mine = S.surfaceInterfaces().map((f) => [f.name, f.parent, S.isDomElementIface(f.name) ? "yes" : "no"]);
    expect(mine).toEqual(spec);
    expect(spec.length).toBeGreaterThan(30);
  });

  test("H.3 entries: id, interface, member, access, signature, class, WebIDL source", () => {
    const spec = rows(section("H.3"));
    const mine = S.surfaceEntries().map((e) => [e.id, e.iface, e.member, e.access, e.sig, e.cls, e.idl]);
    expect(mine).toEqual(spec);
    expect(new Set(mine.map((r) => r[0])).size).toBe(mine.length);                        // ids unique
    expect(new Set(mine.map((r) => r[1] + "." + r[2] + ":" + r[3])).size).toBe(mine.length); // one entry per (I, m, access)
  });

  test("H.4 the inert element list — Appendix H ⇄ host-surface.scrml ⇄ runtime.js HOST_INERT_ELEMENTS (ONE list)", () => {
    expect(S.inertElements().map((t) => [t.tag, t.iface])).toEqual(rows(section("H.4")));
    // the run-time guard (lane A, guarded(inert-receiver)) checks exactly these tags
    expect([...HOST_INERT_ELEMENTS]).toEqual(S.inertElements().map((t) => t.tag));
  });

  test("H.5 the dictionaries", () => {
    expect(S.surfaceDicts().map((d) => [d.name, d.keys.map((k) => "`" + k + "`").join(", ")]))
      .toEqual(rows(section("H.5")).map(([n, ks]) => [n, ks.startsWith("`") ? ks : "`" + ks + "`"]));
  });
});

describe("the surface is well-formed and agrees with the one sink table", () => {
  test("every entry agrees with url.scrml's executable-sink table (entryConflict)", () => {
    expect(S.surfaceEntries().map((e) => [e.id, S.entryConflict(e)]).filter((x) => x[1] !== "")).toEqual([]);
  });

  test("every interface an entry is on, or names in its signature, is an H.2 interface", () => {
    const names = new Set(S.surfaceInterfaces().map((f) => f.name));
    const dicts = new Set(S.surfaceDicts().map((d) => d.name));
    const bad = [];
    for (const e of S.surfaceEntries()) {
      if (!names.has(e.iface)) bad.push(e.id + " " + e.iface);
      for (const w of e.sig.match(/\b[A-Z][A-Za-z0-9]*\b/g) ?? []) if (!names.has(w) && !dicts.has(w)) bad.push(e.id + " " + w);
    }
    for (const t of S.inertElements()) if (!names.has(t.iface) || !S.ifaceInherits(t.iface, "HTMLElement")) bad.push("H.4 " + t.tag);
    expect(bad).toEqual([]);
  });

  test("the inert list holds no tag that runs, loads or re-targets anything, and no custom element", () => {
    const tags = S.inertElements().map((t) => t.tag);
    for (const t of ["script", "style", "base", "meta", "link", "iframe", "frame", "frameset", "object", "embed", "template", "slot", "svg", "math", "form", "noscript", "portal", "applet"]) expect([t, tags.includes(t)]).toEqual([t, false]);
    expect(tags.filter((t) => t.includes("-"))).toEqual([]);
  });

  test("every class is `open` or guarded by the closed set of three (rule 8.5)", () => {
    for (const e of S.surfaceEntries()) {
      for (const g of S.entryGuards(e)) expect([e.id, ["url", "attr-name", "inert-receiver"].includes(g)]).toEqual([e.id, true]);
      if (!e.cls.startsWith("guarded(")) expect([e.id, e.cls]).toEqual([e.id, "open"]);
    }
  });

  test("every mutation of an element's children or attributes is guarded(inert-receiver)", () => {
    for (const [i, m, a] of [["Node", "textContent", "write"], ["Element", "setAttribute", "call"], ["Element", "removeAttribute", "call"],
      ["Element", "append", "call"], ["Element", "prepend", "call"], ["Element", "replaceChildren", "call"],
      ["HTMLImageElement", "src", "write"], ["HTMLAnchorElement", "href", "write"], ["Element", "id", "write"], ["HTMLElement", "hidden", "write"],
      ["HTMLElement", "title", "write"], ["HTMLCanvasElement", "width", "write"], ["HTMLCanvasElement", "height", "write"], ["HTMLInputElement", "value", "write"],
      ["Element", "remove", "call"], ["Element", "classList", "read"], ["HTMLElement", "style", "read"]]) {
      expect([i, m, S.hasGuard(S.findEntry(i, m, a), "inert-receiver")]).toEqual([i, m, true]);
    }
  });
});

// =============================================================================
// S473 PA ruling on the lane B report: "no admitted entry anywhere treats a static element TYPE as
// proof of inertness. Every child- or attribute-mutating entry must go through rt.hostInert."
// =============================================================================
const run = (src) => frontEnd(mods(), [{ path: "app.scrml", src }], "app.scrml");
const errsOf = (r) => r.diags.filter((d) => d.severity !== "Warning" && d.severity !== "Info").map((d) => d.code + ": " + d.message);
const P = (host) => `<host>\n${host}\n</host>\n<program>\n<p>x</p>\n</program>\n`;
const jsOf = (r) => mods().print.printProgram(r.core, "t.client.js", "scrml-runtime.js").js;
// a parameter or literal filling one slot of an entry (the walk's own notation, Appendix H.1)
const fill = (slot, k) => {
  if (slot === "attr-name") return { lit: "\"title\"" };
  if (slot === "inert-tag") return { lit: "\"div\"" };
  if (slot.startsWith("\"")) return { lit: slot };
  const alt = S.slotAlternatives(slot)[0];
  return { param: "v" + k + ": " + (S.slotAdmitsNot(slot) ? alt + " | not" : alt), name: "v" + k };
};
// a binding that reaches entry `e` with its receiver a parameter typed by e's interface
const bindingFor = (e) => {
  const ps = ["r: " + e.iface];
  let tgt;
  if (e.access === "read") tgt = "r." + e.member;
  else if (e.access === "write") { const f = fill(S.writeSlot(e), 0); ps.push(f.param); tgt = "r." + e.member + " = " + f.name; }
  else {
    const as = S.sigParams(e).filter((p) => !S.slotOptional(p)).map((p, k) => fill(S.slotType(p), k));
    for (const a of as) if (a.param) ps.push(a.param);
    tgt = (e.access === "construct" ? "new " : "") + "r." + e.member + "(" + as.map((a) => a.lit ?? a.name).join(", ") + ")";
  }
  return "f(" + ps.join(", ") + ") = " + tgt;
};

describe("inertness is never read off a static type (rule 8.5)", () => {
  test("EVERY guarded(inert-receiver) entry of host-surface.scrml compiles only with its receiver routed through rt.hostInert", () => {
    const guarded = S.surfaceEntries().filter((e) => S.hasGuard(e, "inert-receiver"));
    expect(guarded.length).toBeGreaterThan(15);
    for (const e of guarded) {
      const line = bindingFor(e);
      const r = run(P("  " + line));
      expect([e.id, line, errsOf(r)]).toEqual([e.id, line, []]);
      // the member is applied to hostInert's result: `rt.hostInert(r…, "f() — the `<host>` binding").member`
      expect([e.id, jsOf(r).includes("binding\")." + e.member)]).toEqual([e.id, true]);
    }
  });

  test("a mid-chain guarded read is checked at ITS step: `e.classList.add(t)` / `e.style.setProperty(…)` route `e` through hostInert", () => {
    for (const line of ["f(e: Element, t: string) = e.classList.add(t)", "f(e: HTMLElement, a: string, b: string) = e.style.setProperty(a, b)"]) {
      const r = run(P("  " + line));
      expect(errsOf(r)).toEqual([]);
      expect([line, /hostInert\(e[^,]*, "f\(\) — the `<host>` binding"\)\.(classList|style)\./.test(jsOf(r))]).toEqual([line, true]);
    }
  });

  test("no OPEN entry on a DOM element type (or Node) writes, or changes children / attributes; the only child-changing open entry is Document.title (RCDATA <title>)", () => {
    const MUTATORS = new Set(["append", "prepend", "replaceChildren", "remove", "setAttribute", "removeAttribute", "toggleAttribute",
      "appendChild", "insertBefore", "replaceChild", "removeChild", "before", "after", "replaceWith", "insertAdjacentElement", "insertAdjacentText", "normalize"]);
    const bad = [];
    for (const e of S.surfaceEntries()) {
      const onNode = S.ifaceInherits(e.iface, "Node");
      if (!onNode || S.hasGuard(e, "inert-receiver")) continue;
      if (e.access === "write" && !(e.iface === "Document" && e.member === "title") && !["checked", "currentTime", "volume", "muted"].includes(e.member)) bad.push(e.id + " write " + e.member);
      if (e.access === "call" && MUTATORS.has(e.member)) bad.push(e.id + " " + e.member);
      // a read handing out an attribute-backed sub-object (DOMTokenList, CSSStyleDeclaration)
      if (e.access === "read" && ["DOMTokenList", "CSSStyleDeclaration"].includes(S.sigResult(e))) bad.push(e.id + " read " + e.member);
    }
    expect(bad).toEqual([]);
  });

  test("the only producers of DOMTokenList / CSSStyleDeclaration (whose mutators change the class / style attribute) are guarded reads", () => {
    const producers = S.surfaceEntries().filter((e) => ["DOMTokenList", "CSSStyleDeclaration"].includes(S.unWaiting(S.sigResult(e)).replace(" | not", "")));
    expect(producers.map((e) => [e.iface + "." + e.member, S.hasGuard(e, "inert-receiver")])).toEqual([["Element.classList", true], ["HTMLElement.style", true]]);
  });
});
