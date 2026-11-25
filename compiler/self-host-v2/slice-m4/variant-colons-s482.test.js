// variant-colons-s482.test.js — lane s482-colons-deprecate: the deprecated `::` enum variant access
// (SPEC §14.5, §63.1 Stage 1). Ruling: user-voice-scrml.md S482 "⭐ RULED — `::` variant access is
// deprecated (§63 window: warning + `scrml fix` to `.`)" — *"It keeps compiling with a warning
// (W-VARIANT-COLONS-LEGACY) and a `scrml fix` rewrite to `.`."* (ruling:user-voice-scrml.md-S482-deprecate-colons).
//
// Where the bootstrap builds `::` — a match / `!{}` arm pattern (`::V`, `E::V`) and a `fail` operand
// (`fail ::V`, `fail E::V`) — each site draws ONE W-VARIANT-COLONS-LEGACY (Warning), whose message
// carries the `.` spelling; the program compiles to the same artifacts as its `.` spelling. `::` in an
// expression stays the bootstrap's named refusal (E-BOOTSTRAP-UNSUPPORTED, §63.5 S473 D5), its hint
// naming the deprecation.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadM2, frontEnd } from "./harness.js";
import { compileSource } from "../../../scripts/scrml-boot.ts";

let mods;
let dir;
beforeAll(() => {
  ({ mods } = loadM2());
  dir = mkdtempSync(join(tmpdir(), "s482-variant-colons-"));
}, { timeout: 120000 });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

const LINT = "W-VARIANT-COLONS-LEGACY";
const D = "$";
const src = (sep, qual) => [
  `${D}{`,
  "    type Color:enum = { Red, Green, Blue }",
  "    type E:enum = { Bad(msg: string), Worse }",
  "    let c: Color = Color.Blue;",
  "    fn name(x: Color) -> string {",
  "        return match x {",
  `            ${sep}Red :> "r",`,
  `            ${qual}Green :> "g",`,
  "            .Blue :> \"b\"",
  "        };",
  "    }",
  "    fn f(n: int)! E {",
  `        if (n > 1) { fail ${qual.replace("Color", "E")}Worse; }`,
  `        if (n > 2) { fail ${sep}Bad("x"); }`,
  "        return n;",
  "    }",
  "    const s: string = \"a::b\";",
  "}",
  "<program>",
  `<p>${D}{name(c)}</p>`,
  "</>",
  "",
].join("\n");
const COLONS = src("::", "Color::");
const DOTS = src(".", "Color.");
const diags = (s) => frontEnd(mods, [{ path: "s.scrml", src: s }]).diags;

describe("S482 — `::` variant access is read as `.` and surfaces W-VARIANT-COLONS-LEGACY", () => {
  test("one Warning per site (two arm patterns, two `fail` operands); the `.` spelling draws none", () => {
    const ds = diags(COLONS);
    const lints = ds.filter((d) => d.code === LINT);
    expect(lints.length).toBe(4);
    for (const d of lints) expect(d.severity).toBe("Warning");
    expect(ds.filter((d) => d.code !== LINT)).toEqual([]);
    expect(diags(DOTS)).toEqual([]);
  });

  test("the message carries the `.` spelling, `scrml fix` and §14.5; the span covers the site", () => {
    const lints = diags(COLONS).filter((d) => d.code === LINT);
    const texts = lints.map((d) => COLONS.slice(d.span.start, d.span.end)).sort();
    expect(texts).toEqual(["::Bad", "::Red", "Color::Green", "E::Worse"]);
    const q = lints.find((d) => COLONS.slice(d.span.start, d.span.end) === "Color::Green");
    expect(q.message).toContain("Write `Color.Green`");
    expect(q.message).toContain("scrml fix");
    expect(q.message).toContain("§14.5");
    const b = lints.find((d) => COLONS.slice(d.span.start, d.span.end) === "::Red");
    expect(b.message).toContain("Write `.Red`");
  });

  test("the same program: identical artifacts for the `::` and `.` spellings", async () => {
    const a = join(dir, "colons.scrml");
    const b = join(dir, "dots.scrml");
    writeFileSync(a, COLONS);
    writeFileSync(b, DOTS);
    const ra = await compileSource(a);
    const rb = await compileSource(b);
    expect(ra.ok).toBe(true);
    expect(rb.ok).toBe(true);
    expect(ra.client?.js).toBe(rb.client?.js);
    expect(ra.client?.html).toBe(rb.client?.html);
  }, { timeout: 180000 });

  test("`::` in an expression stays a named refusal whose hint names the deprecation", () => {
    const s = COLONS.replace("let c: Color = Color.Blue;", "let c: Color = Color::Blue;");
    const ds = diags(s).filter((d) => d.severity === "Error");
    expect(ds.map((d) => d.code)).toContain("E-BOOTSTRAP-UNSUPPORTED");
    const r = ds.find((d) => d.code === "E-BOOTSTRAP-UNSUPPORTED");
    expect(r.message).toContain("W-VARIANT-COLONS-LEGACY");
  });
});
