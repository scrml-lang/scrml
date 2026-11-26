// opener-escapes-s482.test.js — lane s482-opener-escapes: gap g-boot-opener-string-escapes-s482.
//
// INTERIM (fail closed — NOT RULED). What a backslash means in a quoted attribute value (`title="…"`, SPEC §5.2)
// or a declaration's quoted own value (`let <s:string="…"/>`, §66.2.4) is not ruled. The bootstrap used to drop
// the backslash and keep the next character (`"a\nb"` → `anb`, a silent wrong value). Now `\"` and `\\` keep the
// meaning every candidate reading gives them (the §4.18.3 catalog's `"` and `\`, RULED S444 for display-text
// literals); any other `\` + character is E-PARSE-001. The Chromium pin:
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
    ["a single-quoted value, `\\'`", "<p title='it\\'s'>x</p>", "\\'"],
  ];
  for (const [name, body, esc] of refused) {
    test(name, async () => {
      const r = await result(prog(body));
      expect(r.ok).toBe(false);
      const e = errs(r);
      expect(e.map((d) => d.code)).toEqual(["E-PARSE-001"]);
      expect(e[0].message).toContain("`" + esc + "` in a quoted value");
      expect(e[0].message).toContain("not decided yet (SPEC §5.2, §66.2.4)");
      expect(e[0].message).toContain('name=("…")');
    }, 120000);
  }

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
