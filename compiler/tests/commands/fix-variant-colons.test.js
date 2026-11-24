/**
 * fix-variant-colons.test.js — the `scrml fix` rule `variant-colons` (§14.5 / §63, S482;
 * ruling:user-voice-scrml.md-S482-deprecate-colons — "yes, deprecate :: with warning and fix").
 * change-id: s482-colons-deprecate.
 *
 * `fixVariantColons` rewrites the deprecated `::` enum variant access to `.` at every site impl#1's
 * splitter + tokenizer locate in code (logic blocks, handlers, attribute expressions, `${}` inside a
 * template or a quoted attribute), verifies each file by an impl#1 compile before and after
 * (identical codes and artifacts), and is idempotent. A string, a comment, markup prose, CSS
 * (`::before`) and SQL (`x::int`) are never sites.
 */

import { describe, test, expect } from "bun:test";
import { fixVariantColons, planVariantColons, VARIANT_COLONS_RULE } from "../../src/commands/fix-variant-colons.js";
import { fixS66, IMPL1_SAFE_RULES, S66_RULES } from "../../src/commands/fix-s66.js";

const D = "$";
// A file mixing both spellings: `::` (qualified, shorthand, in an arm, a handler call, an attribute
// expression and a template `${}`) beside `.` — and `::` in a comment, a string and prose.
const MIXED = [
  "<program reset=\"none\">",
  "<div>",
  `    ${D}{`,
  "        type Color:enum = { Red, Green, Blue }",
  "        @c = Color::Red;",
  "        // a comment Color::Green",
  "        const s = \"Color::Blue\";",
  "        function name(x: Color) {",
  "            return match x {",
  "                ::Red :> \"r\"",
  "                .Green :> \"g\"",
  "                ::Blue :> \"b\"",
  "            }",
  "        }",
  "        function pick(k) { @c = k; }",
  `        const t = \`x ${D}{Color::Blue == @c ? "y" : "n"}\`;`,
  "    }",
  `    <p class:on=(@c == Color::Red) if=(@c != Color.Blue)>${D}{name(@c)} std::vector prose ${D}{s}${D}{t}</>`,
  "    <button onclick=pick(Color::Green)>g</>",
  "    <button onclick=pick(Color.Blue)>b</>",
  "</div>",
  "</program>",
  "",
].join("\n");

describe("variant-colons — `::` → `.`", () => {
  test("plans exactly the code sites (both spellings in one file)", () => {
    const p = planVariantColons("/tmp/fix-variant-colons-plan/a.scrml", MIXED);
    expect(p.notes).toEqual([]);
    expect(p.sites.map((s) => s.line)).toEqual([5, 10, 12, 16, 18, 19]);
  });

  test("rewrites the sites, verified by impl#1; comments / strings / prose untouched", () => {
    const r = fixVariantColons(MIXED, { filePath: "/tmp/fix-variant-colons-a/a.scrml" });
    expect(r.blockers).toEqual([]);
    expect(r.changed).toBe(true);
    expect(r.applied.length).toBe(6);
    for (const a of r.applied) expect(a.rule).toBe(VARIANT_COLONS_RULE);
    expect(r.output).toContain("@c = Color.Red;");
    expect(r.output).toContain("                .Red :> \"r\"");
    expect(r.output).toContain("                .Blue :> \"b\"");
    expect(r.output).toContain(`${D}{Color.Blue == @c ?`);
    expect(r.output).toContain("class:on=(@c == Color.Red)");
    expect(r.output).toContain("onclick=pick(Color.Green)");
    expect(r.output).toContain("// a comment Color::Green");
    expect(r.output).toContain("\"Color::Blue\"");
    expect(r.output).toContain("std::vector prose");
    expect(r.output.split("\n").length).toBe(MIXED.split("\n").length);
  });

  test("idempotent: a second run makes no edit", () => {
    const once = fixVariantColons(MIXED, { filePath: "/tmp/fix-variant-colons-b/a.scrml" }).output;
    const twice = fixVariantColons(once, { filePath: "/tmp/fix-variant-colons-b/a.scrml" });
    expect(twice.changed).toBe(false);
    expect(twice.output).toBe(once);
    expect(planVariantColons("/tmp/fix-variant-colons-b/a.scrml", once).sites).toEqual([]);
  });

  test("CSS `::before`, SQL `x::int` and a `db=` URI are never sites", () => {
    const src = [
      "<program db=\"sqlite::memory:\">",
      `${D}{`,
      "    server function n() { return ?{`SELECT count(*)::int AS n FROM t`}.get(); }",
      "}",
      "#{ p::before { content: \"x\"; } }",
      "<p>hi</p>",
      "</program>",
      "",
    ].join("\n");
    const p = planVariantColons("/tmp/fix-variant-colons-c/a.scrml", src);
    expect(p.sites).toEqual([]);
    expect(p.notes).toEqual([]);
  });

  test("a spaced `E ::V` after a value is reported, never rewritten", () => {
    const src = ["<program>", `${D}{`, "    type C:enum = { A, B }", "    const x = C ::A;", "}", "</program>", ""].join("\n");
    const r = fixVariantColons(src, { filePath: "/tmp/fix-variant-colons-d/a.scrml", verify: false });
    expect(r.changed).toBe(false);
    expect(r.blockers.some((b) => b.reason.includes("space before it"))).toBe(true);
  });

  test("a `::` inside a `~{}` test block is reported (not entered)", () => {
    const src = ["<program>", `${D}{`, "    type C:enum = { A, B }", "}", "~{ assert C::A == C.A }", "</program>", ""].join("\n");
    const p = planVariantColons("/tmp/fix-variant-colons-e/a.scrml", src);
    expect(p.sites).toEqual([]);
    expect(p.notes.some((n) => n.reason.includes("does not enter"))).toBe(true);
  });

  test("a file that does not compile is refused (§63.4)", () => {
    const src = MIXED.replace("function pick(k) { @c = k; }", "function pick(k) { @c = undeclaredThing; }");
    const r = fixVariantColons(src, { filePath: "/tmp/fix-variant-colons-f/a.scrml" });
    expect(r.changed).toBe(false);
    expect(r.blockers.some((b) => b.reason.includes("file does not compile; cannot verify"))).toBe(true);
  });

  test("a file with no `::` is untouched without a compile", () => {
    const r = fixVariantColons("<p>hi</p>\n", { filePath: "/tmp/fix-variant-colons-g/a.scrml" });
    expect(r.changed).toBe(false);
    expect(r.blockers).toEqual([]);
  });
});

describe("variant-colons — wiring", () => {
  test("a default (impl#1-safe) rule, after given-presence and before the terminators", () => {
    expect(IMPL1_SAFE_RULES).toContain(VARIANT_COLONS_RULE);
    expect(S66_RULES.indexOf(VARIANT_COLONS_RULE)).toBe(S66_RULES.indexOf("given-presence") + 1);
    expect(S66_RULES.indexOf(VARIANT_COLONS_RULE)).toBeLessThan(S66_RULES.indexOf("stmt-semi"));
  });

  test("fixS66 runs it", () => {
    const r = fixS66(MIXED, { filePath: "/tmp/fix-variant-colons-h/a.scrml", rules: [VARIANT_COLONS_RULE] });
    expect(r.output).toContain("@c = Color.Red;");
    expect(r.applied.filter((a) => a.rule === VARIANT_COLONS_RULE).length).toBe(6);
  });
});
