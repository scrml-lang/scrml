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
      ["HTMLImageElement", "src", "write"], ["HTMLAnchorElement", "href", "write"]]) {
      expect([i, m, S.hasGuard(S.findEntry(i, m, a), "inert-receiver")]).toEqual([i, m, true]);
    }
  });
});
