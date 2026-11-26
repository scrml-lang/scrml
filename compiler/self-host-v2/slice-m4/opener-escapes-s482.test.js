// opener-escapes-s482.test.js — lanes s482-opener-escapes + s482-escapes-ruled: gap
// g-boot-opener-string-escapes-s482 (resolved).
//
// RULED (user-voice-scrml.md-S482-quoted-value-escapes-catalog, "B"): a backslash in a quoted attribute value
// (`title="…"`, SPEC §5.2) or a declaration's quoted own value (`let <s:string="…"/>`, §66.2.4) follows the
// §4.18.3 escape catalog — `\"` a literal `"`, `\\` a literal `\`, `\${` a literal `${`; any other `\` + character
// is E-PARSE-001. (#2110 built it as a fail-closed INTERIM; before that the reader dropped the backslash and kept
// the next character — `"a\nb"` → `anb`, a silent wrong value.) The Chromium pin:
// compiler/tests/browser/opener-escapes-chromium-s482.browser.test.js.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../../scripts/scrml-boot.ts";

let dir;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "s482-opener-escapes-")); });
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

let k = 0;
async function result(src) {
  const d = join(dir, `p${k++}`);
  mkdirSync(d);
  const file = join(d, "main.scrml");
  writeFileSync(file, src);
  return await compileSource(file);
}
const errs = (r) => r.diagnostics.filter((d) => d.severity === "error");
const prog = (body) => `<program>\n${body}\n</program>\n`;

describe("a quoted value: `\\` + a character the catalog does not cover is E-PARSE-001 (was: the `\\` dropped)", () => {
  const refused = [
    ["a declaration's own value, `\\n`", 'let <s:string="a\\nb"/>\n<p>${@s}</p>', "\\n"],
    ["a declaration's own value, `\\t`", 'let <s:string="a\\tb"/>\n<p>${@s}</p>', "\\t"],
    ["a declaration's own value, `\\x41`", 'let <s:string="a\\x41b"/>\n<p>${@s}</p>', "\\x"],
    ["a declaration's own value, `\\u0041`", 'let <s:string="a\\u0041"/>\n<p>${@s}</p>', "\\u"],
    ["an attribute value, `\\t`", '<p title="a\\tb">x</p>', "\\t"],
    ["an attribute value, `\\d` (a regex pattern)", '<input pattern="\\d+"/>', "\\d"],
    ["an attribute value, `\\$` not before `{`", '<p title="a\\$b">x</p>', "\\$"],
  ];
  for (const [name, body, esc] of refused) {
    test(name, async () => {
      const r = await result(prog(body));
      expect(r.ok).toBe(false);
      const e = errs(r);
      expect(e.map((d) => d.code)).toEqual(["E-PARSE-001"]);
      expect(e[0].message).toContain("`" + esc + "` in a quoted value");
      expect(e[0].message).toContain("is not an escape: a quoted attribute or declaration value has only the §4.18.3 escapes");
      expect(e[0].message).toContain("(SPEC §5.2)");
      expect(e[0].message).not.toContain("not decided");
      expect(e[0].message).toContain('name=("…")');
    }, 120000);
  }

  test("`\\'` in a single-quoted value: E-PARSE-001 with the hint to write the value double-quoted", async () => {
    const r = await result(prog("<p title='it\\'s'>x</p>"));
    const e = errs(r);
    expect(e.map((d) => d.code)).toEqual(["E-PARSE-001"]);
    expect(e[0].message).toContain("`\\'` in a quoted value is not an escape");
    expect(e[0].message).toContain('write it double-quoted, `name="it\'s"`');
    expect(e[0].message).not.toContain('name=("…")');
  }, 120000);

  test("`\\'` in a double-quoted value: E-PARSE-001 with the hint that a `'` needs no escape there", async () => {
    const r = await result(prog('<p title="it\\\'s">x</p>'));
    const e = errs(r);
    expect(e.map((d) => d.code)).toEqual(["E-PARSE-001"]);
    expect(e[0].message).toContain('a `\'` needs no escape in a `"`-quoted value: write it alone, `name="it\'s"`');
  }, 120000);

  test("a malformed escape at a line end names the line end (⏎)", async () => {
    const r = await result(prog('<p title="a\\\nb">x</p>'));
    const e = errs(r);
    expect(e.map((d) => d.code)).toEqual(["E-PARSE-001"]);
    expect(e[0].message).toContain("`\\⏎` in a quoted value");
  }, 120000);

  test("each malformed escape is reported, and recovery keeps the value's extent (the `\"` after `\\q` still closes)", async () => {
    const r = await result(prog('<p title="a\\qb\\rc" class="k">x</p>'));
    expect(errs(r).map((d) => d.code)).toEqual(["E-PARSE-001", "E-PARSE-001"]);
  }, 120000);
});

describe("a quoted value: `\\\"` and `\\\\` are kept (their meaning under every candidate reading)", () => {
  test("a declaration's own value decodes `\\\"` and `\\\\`", async () => {
    const r = await result(prog('let <s:string="a\\"b\\\\c"/>\n<p>${@s}</p>'));
    expect(errs(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.client.js).toContain('"a\\"b\\\\c"');
  }, 120000);

  test("an attribute value decodes `\\\"` and `\\\\`", async () => {
    const r = await result(prog('<p title="x\\"y\\\\z">x</p>'));
    expect(errs(r)).toEqual([]);
    expect(r.ok).toBe(true);
  }, 120000);

  test("a value with no backslash is unchanged", async () => {
    const r = await result(prog('let <s:string="a b"/>\n<p title="t">${@s}</p>'));
    expect(errs(r)).toEqual([]);
  }, 120000);

  test("`\\${` is the catalog's literal `${`, which the quoted-template refusal then refuses (no E-PARSE-001)", async () => {
    const r = await result(prog('<p title="a\\${b}">x</p>'));
    expect(errs(r).map((d) => d.code)).toEqual(["E-BOOTSTRAP-UNSUPPORTED"]);
  }, 120000);

  test("a backslash inside a live `${…}` is the interpolation's own grammar: no E-PARSE-001 (the value is refused as a template)", async () => {
    const r = await result(prog("${ let n: string = \"a\"; }\n<p title=\"x${n + 'it\\'s'}y\">x</p>"));
    expect(errs(r).map((d) => d.code)).not.toContain("E-PARSE-001");
    expect(errs(r).map((d) => d.code)).toContain("E-BOOTSTRAP-UNSUPPORTED");
  }, 120000);

  test("the parenthesized form the message names keeps the ordinary string escapes", async () => {
    const r = await result(prog('let <s:string=("a\\nb")/>\n<p>${@s}</p>'));
    expect(errs(r)).toEqual([]);
    expect(r.ok).toBe(true);
  }, 120000);
});

// s482-escapes-ruled (#2110 review INFO-b): in `^{ emit }` output, emit() has already read its own escapes
// (§22.4.1) and the expression form `name=("…")` is refused (literal values only), so the source advice is wrong
// there. The sources below are String.raw: what is shown is the scrml text.
describe("in `^{ emit }` output the E-PARSE-001 advice is emit-specific", () => {
  test("a `\\\\` in the emit() string is one `\\` for the reader: E-META-EVAL-002 wrapping the emit-context E-PARSE-001", async () => {
    // the logic string's value holds `a\\b`; emit() reads `\\` as `\`, so the markup reader sees `a\b`
    const r = await result(prog(String.raw`<div>^{ emit("<p id=\"o\" title=\"a\\\\b\">x</p>"); }</div>`));
    const e = errs(r);
    expect(e.map((d) => d.code)).toEqual(["E-META-EVAL-002"]);
    expect(e[0].message).toContain("[E-PARSE-001]");
    expect(e[0].message).toContain("in a quoted value of the `^{}` block's emitted markup is not an escape");
    expect(e[0].message).toContain("four backslashes in the string handed to emit() (two with emit.raw())");
    expect(e[0].message).toContain("not available in emitted markup");
    expect(e[0].message).not.toContain("for a literal backslash, or write the value as an expression");
  }, 120000);

  test("the advice holds: four backslashes in the emit() string, two in the emit.raw() string, are one `\\` in the value", async () => {
    // emit(): the logic string's value holds four; emit.raw(): two
    for (const src of [
      String.raw`<div>^{ emit("<p id=\"o\" title=\"a\\\\\\\\b\">x</p>"); }</div>`,
      String.raw`<div>^{ emit.raw("<p id=\"o\" title=\"a\\\\b\">x</p>"); }</div>`,
    ]) {
      const r = await result(prog(src));
      expect(errs(r)).toEqual([]);
      expect(r.ok).toBe(true);
      expect(JSON.stringify([r.client.html, r.client.js])).toContain(String.raw`a\\b`);
    }
  }, 120000);

  test("source markup keeps the source advice (not the emit one)", async () => {
    const r = await result(prog(String.raw`<p title="a\qb">x</p>`));
    const e = errs(r);
    expect(e.map((d) => d.code)).toEqual(["E-PARSE-001"]);
    expect(e[0].message).not.toContain("emitted markup");
  }, 120000);
});
